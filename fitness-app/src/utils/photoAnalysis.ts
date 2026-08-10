import { callAI } from './aiAdapter';
import type { Measurement, Profile, ProgressPhoto } from '../types';
import { daysBetween } from './dateHelpers';
import { describePhotoReminder, getPhotoReminderSchedule } from './photoReminder';

/** Feedback the model returns for a pair of progress photos. */
export interface PhotoProgressFeedback {
  headline: string;
  visualChanges: string[];
  goalAlignment: string;
  photoHabit: string;
  suggestions: string[];
  caveats: string;
}

export interface PhotoAnalysisResult extends PhotoProgressFeedback {
  generatedAt: string;
  pose: string;
  baselinePhotoId: string;
  baselineDate: string;
  latestPhotoId: string;
  latestDate: string;
}

/**
 * Everything the model is told about the user besides the two images. Assembled locally so
 * the request carries only these derived numbers — no logs, no notes, no other photos.
 */
export interface PhotoProgressSnapshot {
  goal: {
    goal: string;
    fitnessGoal?: string;
    calorieTarget: number;
    proteinTarget: number;
  };
  comparison: {
    pose: string;
    baselineDate: string;
    latestDate: string;
    daysApart: number;
    weeksApart: number;
  };
  weight: {
    unit: 'lbs' | 'kg';
    baseline: number | null;
    latest: number | null;
    change: number | null;
    changePerWeek: number | null;
  };
  bodyMeasurements: {
    unit: 'in' | 'cm';
    /** Latest minus baseline, per site. Only sites recorded at both ends appear. */
    changes: Record<string, number>;
    baselineDate: string;
    latestDate: string;
  } | null;
  /**
   * Cadence context drawn from the user's other photos — dates only, never their images.
   * Null unless the user opts in, so by default nothing but the selected pair is described.
   */
  photoHabit: {
    totalPhotos: number;
    photosOfThisPose: number;
    photosInWindow: number;
    avgDaysBetweenPhotos: number | null;
    longestGapDays: number | null;
    reminderSetting: string;
  } | null;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  chest: 'chest',
  waist: 'waist',
  hips: 'hips',
  leftArm: 'left arm',
  rightArm: 'right arm',
  leftThigh: 'left thigh',
  rightThigh: 'right thigh',
  neck: 'neck',
  shoulders: 'shoulders',
  bust: 'bust',
  leftBicep: 'left bicep',
  rightBicep: 'right bicep',
  leftCalf: 'left calf',
  rightCalf: 'right calf',
  leftAnkle: 'left ankle',
  rightAnkle: 'right ankle',
};

/** How far from a photo's date a measurement can be and still describe that photo. */
const MEASUREMENT_WINDOW_DAYS = 10;

export const POSE_LABELS: Record<string, string> = {
  front: 'Front',
  side_left: 'Side (L)',
  side_right: 'Side (R)',
  back: 'Back',
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toDisplayUnit(weight: number, from: 'lbs' | 'kg', to: 'lbs' | 'kg'): number {
  if (from === to) return weight;
  return to === 'kg' ? weight * 0.453592 : weight * 2.20462;
}

/** Measurement closest to `date`, within MEASUREMENT_WINDOW_DAYS, that satisfies `has`. */
function nearestMeasurement(
  measurements: Measurement[],
  date: string,
  has: (m: Measurement) => boolean,
): Measurement | null {
  let best: Measurement | null = null;
  let bestGap = Infinity;
  for (const m of measurements) {
    if (!has(m)) continue;
    const gap = Math.abs(daysBetween(m.date, date));
    if (gap <= MEASUREMENT_WINDOW_DAYS && gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best;
}

function weightForPhoto(
  photo: ProgressPhoto,
  measurements: Measurement[],
  displayUnit: 'lbs' | 'kg',
): number | null {
  // A weight typed on the photo itself is already in the profile's display unit.
  if (photo.weight != null) return round1(photo.weight);
  const m = nearestMeasurement(measurements, photo.date, (x) => x.weight != null);
  if (!m || m.weight == null) return null;
  return round1(toDisplayUnit(m.weight, m.weightUnit, displayUnit));
}

export function buildPhotoProgressSnapshot(
  profile: Profile,
  baseline: ProgressPhoto,
  latest: ProgressPhoto,
  allPhotos: ProgressPhoto[],
  measurements: Measurement[],
  /** Opt in to cadence context from the user's other photos (their dates, never their images). */
  includePhotoHistory = false,
): PhotoProgressSnapshot {
  const displayUnit: 'lbs' | 'kg' = profile.units === 'metric' ? 'kg' : 'lbs';
  const daysApart = Math.max(0, daysBetween(baseline.date, latest.date));

  const baselineWeight = weightForPhoto(baseline, measurements, displayUnit);
  const latestWeight = weightForPhoto(latest, measurements, displayUnit);
  const change = baselineWeight != null && latestWeight != null ? round1(latestWeight - baselineWeight) : null;

  // Body measurements: compare the entries nearest each photo, keeping only sites present at
  // both ends so a newly-tracked site doesn't read as a huge change.
  const baselineEntry = nearestMeasurement(measurements, baseline.date, (m) => m.measurements != null);
  const latestEntry = nearestMeasurement(measurements, latest.date, (m) => m.measurements != null);
  let bodyMeasurements: PhotoProgressSnapshot['bodyMeasurements'] = null;
  if (baselineEntry && latestEntry && baselineEntry.id !== latestEntry.id) {
    const changes: Record<string, number> = {};
    const latestSites: Record<string, number | undefined> = latestEntry.measurements ?? {};
    for (const [site, from] of Object.entries(baselineEntry.measurements ?? {})) {
      const to = latestSites[site];
      if (from == null || to == null || from <= 0 || to <= 0) continue;
      changes[MEASUREMENT_LABELS[site] ?? site] = round1(to - from);
    }
    if (Object.keys(changes).length > 0) {
      bodyMeasurements = {
        unit: profile.measurementUnit,
        changes,
        baselineDate: baselineEntry.date,
        latestDate: latestEntry.date,
      };
    }
  }

  // Photo cadence, opt-in only: dates of the user's other photos, so the review can speak to
  // consistency. Skipped entirely by default, leaving the selected pair as the only subject.
  const posePhotos = includePhotoHistory
    ? allPhotos
        .filter((p) => p.pose === baseline.pose)
        .map((p) => p.date)
        .sort()
    : [];
  const gaps: number[] = [];
  for (let i = 1; i < posePhotos.length; i++) {
    gaps.push(daysBetween(posePhotos[i - 1], posePhotos[i]));
  }

  return {
    goal: {
      goal: profile.goal,
      fitnessGoal: profile.bodyStats?.fitnessGoal,
      calorieTarget: profile.macroTargets.calories,
      proteinTarget: profile.macroTargets.protein,
    },
    comparison: {
      pose: POSE_LABELS[baseline.pose] ?? baseline.pose,
      baselineDate: baseline.date,
      latestDate: latest.date,
      daysApart,
      weeksApart: round1(daysApart / 7),
    },
    weight: {
      unit: displayUnit,
      baseline: baselineWeight,
      latest: latestWeight,
      change,
      changePerWeek: change != null && daysApart >= 7 ? round1(change / (daysApart / 7)) : null,
    },
    bodyMeasurements,
    photoHabit: includePhotoHistory
      ? {
          totalPhotos: allPhotos.length,
          photosOfThisPose: posePhotos.length,
          photosInWindow: posePhotos.filter((d) => d >= baseline.date && d <= latest.date).length,
          avgDaysBetweenPhotos: gaps.length > 0 ? round1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
          longestGapDays: gaps.length > 0 ? Math.max(...gaps) : null,
          reminderSetting: describePhotoReminder(getPhotoReminderSchedule(profile.id)),
        }
      : null,
  };
}

const SYSTEM_PROMPT = `You are a progress-photo review assistant inside a fitness tracking app. The user has given you two of their own progress photos — the same pose at two different dates — plus the numbers the app tracked over that period. Give them a grounded read on how their physique change is tracking against their stated goal.

Rules:
- Comment only on training-relevant, physique-related observations: apparent muscle size and definition, posture, waist and midsection, overall leanness, symmetry between sides.
- Describe changes qualitatively and comparatively ("waist looks slightly tighter", "shoulders look fuller"). Do NOT estimate body fat percentage, weight, or measurements from the images — the app already has real numbers for those, and image-based estimates are guesses.
- Never comment on the person's face, attractiveness, age, gender, race, or anything unrelated to training. Never speculate about their identity.
- Never give medical advice, diagnose anything, comment on symptoms or injuries, or recommend supplements. If something looks health-related, say only that a qualified professional is the right person to ask.
- Be honest and neutral. No hype, no flattery, no shaming. If the two photos look essentially the same, say so plainly and use the tracked numbers to explain why that may be.
- Weigh the tracked data at least as heavily as the images. Photos vary with lighting, camera angle, distance, time of day, pump, and hydration — say when a difference could be explained by those rather than by real change.
- If the two photos are fewer than about 21 days apart, state up front that this is a short window for visible change.
- Judge progress against the stated goal: fat loss should show weight trending down with the midsection tightening; muscle gain should show weight trending up with fuller muscles; recomp may show flat weight with visible change. Say explicitly whether what you see lines up with their goal.
- photoHabit in the data is the user's wider photo cadence, and it is null when they have chosen not to share it. When it is present, comment on whether they photograph often and regularly enough to see a trend. When it is null, you know nothing about their other photos — speak only to the gap between these two, and never guess at how many photos they have or how consistent they are.
- If the data is too thin to say much, say that instead of inventing a read.
- Keep every field short. Plain language, no jargon the app doesn't already use.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "headline": "One sentence overall read on the change between the two photos",
  "visualChanges": ["Specific visual observation", "Another observation"],
  "goalAlignment": "2-3 sentences on whether the visible change and the tracked numbers line up with their goal",
  "photoHabit": "1-2 sentences on their photo timing — consistency only if photoHabit data was provided, otherwise just the gap between these two",
  "suggestions": ["Specific general suggestion", "Another suggestion"],
  "caveats": "One sentence on what these two photos can't tell you"
}

Use 2-4 items in visualChanges and 2-3 in suggestions.`;

/** Photos are stored as raw base64, but tolerate a data: URL in case one was stored that way. */
function stripDataUrl(imageData: string): string {
  const comma = imageData.indexOf(',');
  return imageData.startsWith('data:') && comma !== -1 ? imageData.slice(comma + 1) : imageData;
}

export async function analyzePhotoProgress(
  baseline: ProgressPhoto,
  latest: ProgressPhoto,
  snapshot: PhotoProgressSnapshot,
): Promise<PhotoAnalysisResult> {
  const historyNote = snapshot.photoHabit
    ? ''
    : '\n\nI have chosen not to share my wider photo history, so these two photos are all you know about — do not comment on how many photos I take or how consistent I am.';

  const userPrompt = `The first image is my baseline progress photo, taken ${snapshot.comparison.baselineDate}. The second image is my latest one, taken ${snapshot.comparison.latestDate}. Both are the same pose (${snapshot.comparison.pose}).

Here is what the app tracked over that period:

${JSON.stringify(snapshot, null, 2)}

Analyze the change between these two photos and tell me how I'm tracking against my goal.${historyNote}`;

  const { text: rawText } = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    imagesBase64: [stripDataUrl(baseline.imageData), stripDataUrl(latest.imageData)],
    maxTokens: 1500,
  });

  const text = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const parsed = JSON.parse(text) as Partial<PhotoProgressFeedback>;

  return {
    headline: parsed.headline || '',
    visualChanges: Array.isArray(parsed.visualChanges) ? parsed.visualChanges : [],
    goalAlignment: parsed.goalAlignment || '',
    photoHabit: parsed.photoHabit || '',
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    caveats: parsed.caveats || '',
    generatedAt: new Date().toISOString(),
    pose: baseline.pose,
    baselinePhotoId: baseline.id,
    baselineDate: baseline.date,
    latestPhotoId: latest.id,
    latestDate: latest.date,
  };
}

// --- Cache -------------------------------------------------------------------
// Keyed per profile so one profile's analysis never surfaces under another.

function cacheKey(profileId: string): string {
  return `fitos-photo-analysis-${profileId}`;
}

export function getCachedPhotoAnalysis(profileId: string): PhotoAnalysisResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(profileId));
    return raw ? (JSON.parse(raw) as PhotoAnalysisResult) : null;
  } catch {
    return null;
  }
}

export function cachePhotoAnalysis(profileId: string, result: PhotoAnalysisResult): void {
  try {
    localStorage.setItem(cacheKey(profileId), JSON.stringify(result));
  } catch {
    // Storage full or blocked — the result is still shown for this session.
  }
}

export function clearCachedPhotoAnalysis(profileId: string): void {
  localStorage.removeItem(cacheKey(profileId));
}
