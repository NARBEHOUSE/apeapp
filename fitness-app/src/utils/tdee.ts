import type { BodyStats, FitnessGoal, MacroTargets, ActivityLevel } from '../types';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Mifflin-St Jeor — most validated equation for general population
function calculateBMR(gender: 'male' | 'female', weightKg: number, heightCm: number, age: number): number {
  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export function calculateTDEE(stats: BodyStats): number {
  const bmr = calculateBMR(stats.gender, stats.weightKg, stats.heightCm, stats.age);
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[stats.activityLevel]);
}

// Goal-based calorie offset
// Lose: -500 (targets ~1 lb/week loss)
// Maintain: 0
// Build: +300 (lean bulk, minimize fat gain)
function getGoalOffset(goal: FitnessGoal): number {
  switch (goal) {
    case 'lose': return -500;
    case 'maintain': return 0;
    case 'build': return 300;
  }
}

export function calculateMacros(stats: BodyStats): MacroTargets {
  const tdee = calculateTDEE(stats);
  const targetCalories = Math.max(1200, tdee + getGoalOffset(stats.fitnessGoal));

  // Cutting requires more protein to preserve muscle in a deficit
  const protein = Math.round(
    stats.fitnessGoal === 'lose' ? stats.heightCm * 1.1 : stats.heightCm
  );

  // Fat: 30% of total calories
  const fatPct = 0.30;
  const fat = Math.round((targetCalories * fatPct) / 9);

  // Carbs: fill remaining calories
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(50, Math.round((targetCalories - proteinCals - fatCals) / 4));

  return { calories: targetCalories, protein, carbs, fat };
}

// Rescale carbs/fat to hit a new calorie total while holding protein (grams) fixed and
// preserving the existing carb:fat calorie split. Used any time a calorie goal changes
// (auto-adjustment, AI coach suggestion, etc.) so the macro targets stay internally
// consistent with the calorie target instead of going stale — e.g. dropping calories
// from 2800 to 1900 without touching carbs/fat used to leave macro targets that still
// summed to ~2800, so the day could show "calories hit" while macros still showed room.
export function rescaleMacrosToCalories(macros: MacroTargets, newCalories: number): MacroTargets {
  const proteinCals = macros.protein * 4;
  const remainingOld = macros.calories - proteinCals;
  const remainingNew = Math.max(0, newCalories - proteinCals);

  // No old carb/fat headroom to derive a split from (e.g. protein alone met/exceeded the
  // old calorie total) — just fill whatever's left with carbs rather than divide by ~0.
  if (remainingOld <= 0) {
    return {
      calories: newCalories,
      protein: macros.protein,
      carbs: Math.round(remainingNew / 4),
      fat: 0,
    };
  }

  const carbShare = (macros.carbs * 4) / remainingOld;
  const fatShare = (macros.fat * 9) / remainingOld;

  return {
    calories: newCalories,
    protein: macros.protein,
    carbs: Math.max(0, Math.round((remainingNew * carbShare) / 4)),
    fat: Math.max(0, Math.round((remainingNew * fatShare) / 9)),
  };
}

// Convert height input to cm
export function heightToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

// Convert weight
export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

// Target weight change rates (lbs per week)
const TARGET_RATES: Record<FitnessGoal, number> = {
  lose: -1.0,
  maintain: 0,
  build: 0.5,
};

// How the user's actual logged intake compared to the goal calories that were prescribed
// over the same window the weight trend was analyzed. Lets the adjustment logic tell "the
// goal is wrong" apart from "the goal wasn't followed".
export interface CalorieAdherence {
  avgTrackedCalories: number;
  prescribedCalories: number;
  deltaPerDay: number; // avgTrackedCalories - prescribedCalories; positive = eating over goal
  daysLogged: number;
  coverage: number; // daysLogged / days in the analysis window
}

export interface CorrectionSuggestion {
  calories: number;
  days: number;
  reason: string;
}

export interface AutoAdjustResult {
  shouldAdjust: boolean;
  newCalories: number;
  reason: string;
  avgWeeklyChange: number;
  targetWeeklyChange: number;
  daysSinceStart: number;
  // True when the weight trend is better explained by not eating at the prescribed
  // calorie goal than by the goal itself being wrong. When true, `shouldAdjust` is false —
  // the fix is to follow the existing plan, not to move it — and `correctionSuggestion`
  // offers a short-term nudge back toward the average instead.
  adherenceIssue?: boolean;
  adherence?: CalorieAdherence;
  correctionSuggestion?: CorrectionSuggestion;
}

// Minimum average daily gap between tracked and prescribed calories (over the analysis
// window) before we treat it as a real adherence problem rather than noise.
const ADHERENCE_THRESHOLD = 150;
// Need logged food on at least this fraction of days in the window to trust the average —
// otherwise we can't tell adherence from a mostly-untracked stretch.
const MIN_TRACKING_COVERAGE = 0.4;
// How far back "the current trend" looks, anchored on the latest weigh-in — not the whole
// lifetime of weigh-ins on file. Without a cap, a long-time user's entire history feeds the
// regression and the adherence coverage check, so a short, already-resolved deviation (e.g. a
// few days of over-eating that's since corrected) gets diluted into noise by months of
// unrelated, already-settled data instead of being read for what it is.
const TREND_WINDOW_DAYS = 30;
// How far back the *adherence* comparison looks — deliberately shorter than the trend window
// above. A multi-day binge that's already fully explained by a handful of over-goal days
// still gets averaged away by ADHERENCE_THRESHOLD if it's spread across the full 21-30 day
// trend window (e.g. 3 days at +1500 cal/day over a 30-day window averages to ~150 cal/day —
// right at the noise floor — even with perfect logging coverage). Comparing against the
// recent stretch where the deviation actually happened keeps a real, short-lived over/under-
// eating episode from reading as "no adherence issue" just because it didn't last long.
const ADHERENCE_LOOKBACK_DAYS = 10;

// Replace each reading with the median of itself and its nearest neighbors before trending.
// A single-day water-retention/scale-error spike gets outvoted by the flat readings around
// it; a change that actually persists across multiple entries passes the median through
// unchanged. Applied before the regression so one anomalous weigh-in can't flip the sign of
// an otherwise-clear trend.
function medianSmooth(weights: number[], radius = 2): number[] {
  return weights.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(weights.length, i + radius + 1);
    const window = [...weights.slice(lo, hi)].sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    return window.length % 2 === 1 ? window[mid] : (window[mid - 1] + window[mid]) / 2;
  });
}

// Analyze weight trend and recommend calorie adjustment after 21+ days of data
// Uses linear regression on weight entries to find actual rate of change,
// then compares to goal rate and adjusts calories proportionally.
// 1 lb of bodyweight ~= 3500 calories, so a 1 lb/week discrepancy = 500 cal/day adjustment.
//
// `trackedCalories` (optional) is the user's logged food intake — one entry per log, not
// pre-aggregated by day — covering (at least) the same span as `weightEntries`. When
// provided, it's used to check whether an off-track weight trend is actually explained by
// not eating at the prescribed goal, rather than the goal being miscalibrated.
export function calculateAutoAdjustment(
  weightEntries: { date: string; weight: number; unit: 'lbs' | 'kg' }[],
  currentCalories: number,
  goal: FitnessGoal,
  trackedCalories: { date: string; calories: number }[] = []
): AutoAdjustResult {
  const noAdjust: AutoAdjustResult = {
    shouldAdjust: false,
    newCalories: currentCalories,
    reason: '',
    avgWeeklyChange: 0,
    targetWeeklyChange: TARGET_RATES[goal],
    daysSinceStart: 0,
  };

  // Need at least 21 days of data
  if (weightEntries.length < 3) {
    return { ...noAdjust, reason: 'Need at least 3 weigh-ins over 21+ days' };
  }

  // Normalize to lbs
  const allEntries = weightEntries
    .map((e) => ({
      date: new Date(e.date + 'T00:00:00').getTime(),
      weight: e.unit === 'kg' ? kgToLbs(e.weight) : e.weight,
    }))
    .sort((a, b) => a.date - b.date);

  // Anchor the analysis window on the latest weigh-in, not "now" — a stale-but-recent last
  // entry shouldn't shrink the window, and this keeps it consistent with how `lastDate` below
  // is used to scope the tracked-calories comparison.
  const windowStart = allEntries[allEntries.length - 1].date - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const entries = allEntries.filter((e) => e.date >= windowStart);

  if (entries.length < 3) {
    return { ...noAdjust, reason: 'Need at least 3 weigh-ins over 21+ days' };
  }

  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const daySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

  if (daySpan < 21) {
    return { ...noAdjust, reason: `Only ${Math.round(daySpan)} days of data — need 21+`, daysSinceStart: Math.round(daySpan) };
  }

  // Linear regression to find weekly rate of change
  const n = entries.length;
  const days = entries.map((e) => (e.date - firstDate) / (1000 * 60 * 60 * 24));
  const weights = medianSmooth(entries.map((e) => e.weight));

  const sumX = days.reduce((a, b) => a + b, 0);
  const sumY = weights.reduce((a, b) => a + b, 0);
  const sumXY = days.reduce((acc, d, i) => acc + d * weights[i], 0);
  const sumXX = days.reduce((acc, d) => acc + d * d, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX); // lbs per day
  const avgWeeklyChange = slope * 7; // lbs per week

  const targetWeekly = TARGET_RATES[goal];
  const diff = avgWeeklyChange - targetWeekly; // positive = gaining too fast or losing too slow

  // Only adjust if off by more than 0.3 lbs/week from target
  if (Math.abs(diff) < 0.3) {
    return {
      shouldAdjust: false,
      newCalories: currentCalories,
      reason: `On track: ${avgWeeklyChange >= 0 ? '+' : ''}${avgWeeklyChange.toFixed(1)} lbs/week (target: ${targetWeekly >= 0 ? '+' : ''}${targetWeekly.toFixed(1)})`,
      avgWeeklyChange,
      targetWeeklyChange: targetWeekly,
      daysSinceStart: Math.round(daySpan),
    };
  }

  // Off track. Before concluding the *prescribed* goal is wrong, check whether the user
  // actually ate at that goal recently — if they've been consistently over or under it, the
  // weight trend is explained by not following the plan, not by a bad prescription, and the
  // fix is adherence, not moving the goalposts. Compared against a recent lookback window
  // rather than the full trend window so a short-lived deviation isn't averaged into noise.
  const adherenceWindowStart = Math.max(firstDate, lastDate - ADHERENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const adherenceWindowDays = Math.max(1, Math.round((lastDate - adherenceWindowStart) / (1000 * 60 * 60 * 24)));
  const windowEntries = trackedCalories.filter((e) => {
    const t = new Date(e.date + 'T00:00:00').getTime();
    return t >= adherenceWindowStart && t <= lastDate;
  });
  const daysLogged = new Set(windowEntries.map((e) => e.date)).size;
  const coverage = daysLogged / adherenceWindowDays;

  let adherence: CalorieAdherence | undefined;
  if (coverage >= MIN_TRACKING_COVERAGE) {
    const totalTracked = windowEntries.reduce((sum, e) => sum + e.calories, 0);
    const avgTrackedCalories = Math.round(totalTracked / daysLogged);
    adherence = {
      avgTrackedCalories,
      prescribedCalories: currentCalories,
      deltaPerDay: avgTrackedCalories - currentCalories,
      daysLogged,
      coverage,
    };
  }

  if (adherence) {
    const { deltaPerDay } = adherence;
    // Does the eating gap point the same direction as the weight-trend gap? (over-eating
    // correlates with gaining too fast/losing too slow; under-eating with the reverse.)
    const sameDirection = (deltaPerDay > 0 && diff > 0) || (deltaPerDay < 0 && diff < 0);

    if (sameDirection && Math.abs(deltaPerDay) >= ADHERENCE_THRESHOLD) {
      const overUnder = deltaPerDay > 0 ? 'over' : 'under';
      const trendWord = avgWeeklyChange >= 0 ? 'gaining' : 'losing';
      const reason =
        `You're averaging ${adherence.avgTrackedCalories} cal/day tracked — ${Math.abs(deltaPerDay)} cal ${overUnder} your ` +
        `${currentCalories} cal goal. That's why you're ${trendWord} ${Math.abs(avgWeeklyChange).toFixed(1)} lbs/week faster ` +
        `than planned, not because the goal itself is off. Follow your current ${currentCalories} cal/day plan.`;

      // Suggest a short correction to bring the recent average back toward goal, then
      // resume the normal target — rather than permanently moving the goal.
      const correctionDays = 7;
      const totalExcess = deltaPerDay * adherence.daysLogged;
      const rawCorrection = Math.round(currentCalories - totalExcess / correctionDays);
      const cappedCorrection = Math.max(currentCalories - 500, Math.min(currentCalories + 500, rawCorrection));
      const correctionCalories = Math.max(1200, cappedCorrection);

      return {
        shouldAdjust: false,
        newCalories: currentCalories,
        reason,
        avgWeeklyChange,
        targetWeeklyChange: targetWeekly,
        daysSinceStart: Math.round(daySpan),
        adherenceIssue: true,
        adherence,
        correctionSuggestion: {
          calories: correctionCalories,
          days: correctionDays,
          reason: `Eat ~${correctionCalories} cal/day for ${correctionDays} days to offset the recent ${overUnder}-eating, then resume your normal ${currentCalories} cal/day goal.`,
        },
      };
    }
  }

  // Adjust: 500 cal per 1 lb/week discrepancy, capped at ±300 per adjustment
  const rawAdjustment = Math.round(-(diff / 1.0) * 500);
  const cappedAdjustment = Math.max(-300, Math.min(300, rawAdjustment));
  const newCalories = Math.max(1200, currentCalories + cappedAdjustment);

  let reason: string;
  if (goal === 'lose') {
    if (diff > 0) {
      reason = `Losing too slowly (${avgWeeklyChange.toFixed(1)} lbs/week vs target ${targetWeekly.toFixed(1)}). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Losing too fast (${avgWeeklyChange.toFixed(1)} lbs/week vs target ${targetWeekly.toFixed(1)}). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  } else if (goal === 'build') {
    if (diff > 0) {
      reason = `Gaining too fast (${avgWeeklyChange.toFixed(1)} lbs/week vs target +${targetWeekly.toFixed(1)}). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Not gaining enough (+${avgWeeklyChange.toFixed(1)} lbs/week vs target +${targetWeekly.toFixed(1)}). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  } else {
    if (avgWeeklyChange > 0) {
      reason = `Gaining weight (+${avgWeeklyChange.toFixed(1)} lbs/week). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Losing weight (${avgWeeklyChange.toFixed(1)} lbs/week). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  }

  return {
    shouldAdjust: true,
    newCalories,
    reason,
    avgWeeklyChange,
    targetWeeklyChange: targetWeekly,
    daysSinceStart: Math.round(daySpan),
    adherence,
  };
}

// The weight (lbs) the plan's target trajectory implies "right now" — i.e. current weight
// with the accumulated drift from an adherence issue backed out. A temporary correction is
// really an attempt to walk that drift back to ~0, not to hit some arbitrary fixed number,
// so this is the number a correction should be checked against to see if it's done its job.
export function computeBaselineWeightLbs(latestWeightLbs: number, result: AutoAdjustResult): number {
  const excessLbs = (result.avgWeeklyChange - result.targetWeeklyChange) * (result.daysSinceStart / 7);
  return latestWeightLbs - excessLbs;
}

// How close weight needs to get back to the baseline before a correction is considered done.
export const BASELINE_RECOVERY_TOLERANCE_LBS = 1;

export interface BaselineRecoveryCheck {
  reached: boolean;
  deltaLbs: number; // currentWeightLbs - baselineWeightLbs; 0 = exactly back on the plan's trajectory
}

// Has weight come back within tolerance of the plan's trajectory while a temporary
// correction is active? If so, the correction has done its job — it shouldn't need to run
// out its fixed day count before the user's offered a way back to their normal goal.
export function checkBaselineRecovery(currentWeightLbs: number, baselineWeightLbs: number): BaselineRecoveryCheck {
  const deltaLbs = currentWeightLbs - baselineWeightLbs;
  return { reached: Math.abs(deltaLbs) <= BASELINE_RECOVERY_TOLERANCE_LBS, deltaLbs };
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (desk job, little exercise)',
  light: 'Lightly Active (1-3 days/week)',
  moderate: 'Moderately Active (3-5 days/week)',
  active: 'Very Active (6-7 days/week)',
  very_active: 'Athlete (2x/day or physical job)',
};

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose: 'Lose Fat',
  maintain: 'Maintain Weight',
  build: 'Build Muscle',
};

export const GOAL_DESCRIPTIONS: Record<FitnessGoal, string> = {
  lose: '~1 lb/week loss (-500 cal deficit)',
  maintain: 'Stay at current weight',
  build: 'Lean bulk (~0.5 lb/week gain)',
};
