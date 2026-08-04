import type { SetLog, WeeklyTarget, WorkoutSession, Exercise } from '../types';

export type ProgressionType = 'linear' | 'double_progression' | 'custom';

export interface ExerciseProgression {
  type: ProgressionType;
  weeklyWeightIncrement: number;
  repRangeMin: number;
  repRangeMax: number;
  deloadFrequency: number;
  deloadPercent: number;
}

export type { WeeklyTarget };

const COMPOUND_KEYWORDS = [
  'bench press', 'squat', 'deadlift', 'overhead press', 'barbell row',
  'pull up', 'pullup', 'chin up', 'chinup', 'dip', 'hip thrust',
  'romanian deadlift', 'rdl', 'front squat', 'incline bench', 'incline press',
  'military press', 'bent over row', 'pendlay row',
  'push press', 'leg press', 'hack squat', 't-bar row', 't bar row',
  'sumo deadlift', 'close grip bench', 'floor press',
  'cable row', 'lat pulldown', 'seated row', 'barbell curl',
  'skull crusher', 'rack pull', 'good morning', 'lunge',
  'bulgarian split squat', 'step up',
];

export function isCompoundExercise(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw));
}

export function getGoalDefaults(
  goalType: string,
  isCompound: boolean,
  fitnessGoal?: 'lose' | 'maintain' | 'build',
): { sets: number; reps: string; progression: ExerciseProgression } {
  const incrementMultiplier =
    fitnessGoal === 'build' ? 1.0 : fitnessGoal === 'lose' ? 0.5 : 0.8;

  const scale = (base: number) =>
    Math.round(base * incrementMultiplier * 2) / 2 || 2.5;

  switch (goalType) {
    case 'strength':
      return {
        sets: isCompound ? 5 : 3,
        reps: isCompound ? '3-5' : '6-8',
        progression: {
          type: 'linear',
          weeklyWeightIncrement: scale(isCompound ? 5 : 2.5),
          repRangeMin: isCompound ? 5 : 8,
          repRangeMax: isCompound ? 5 : 8,
          deloadFrequency: 4,
          deloadPercent: 20,
        },
      };
    case 'hypertrophy':
      return {
        sets: isCompound ? 4 : 3,
        reps: '8-12',
        progression: {
          type: 'double_progression',
          weeklyWeightIncrement: scale(isCompound ? 5 : 2.5),
          repRangeMin: 8,
          repRangeMax: 12,
          deloadFrequency: 5,
          deloadPercent: 15,
        },
      };
    case 'endurance':
      return {
        sets: 3,
        reps: '15-20',
        progression: {
          type: 'double_progression',
          weeklyWeightIncrement: scale(2.5),
          repRangeMin: 15,
          repRangeMax: 20,
          deloadFrequency: 6,
          deloadPercent: 15,
        },
      };
    case 'powerbuilding':
      return {
        sets: isCompound ? 5 : 3,
        reps: isCompound ? '3-5' : '8-12',
        progression: {
          type: isCompound ? 'linear' : 'double_progression',
          weeklyWeightIncrement: scale(isCompound ? 5 : 2.5),
          repRangeMin: isCompound ? 5 : 8,
          repRangeMax: isCompound ? 5 : 12,
          deloadFrequency: 4,
          deloadPercent: 20,
        },
      };
    case 'recomp':
      return {
        sets: isCompound ? 4 : 3,
        reps: '6-10',
        progression: {
          type: 'double_progression',
          weeklyWeightIncrement: scale(2.5),
          repRangeMin: 6,
          repRangeMax: 10,
          deloadFrequency: 5,
          deloadPercent: 15,
        },
      };
    default:
      return {
        sets: 3,
        reps: '8-12',
        progression: {
          type: 'linear',
          weeklyWeightIncrement: 5,
          repRangeMin: 10,
          repRangeMax: 10,
          deloadFrequency: 0,
          deloadPercent: 0,
        },
      };
  }
}

export function calculateWeeklyTargets(
  progression: ExerciseProgression,
  startingWeight: number,
  startingSets: number,
  durationWeeks: number,
): WeeklyTarget[] {
  if (progression.type === 'double_progression') {
    return calcDoubleProgression(
      progression, startingWeight, startingSets, durationWeeks,
    );
  }
  return calcLinear(progression, startingWeight, startingSets, durationWeeks);
}

export function generateBlankTargets(
  durationWeeks: number,
  startingSets: number,
  startingReps: number,
  startingWeight: number,
): WeeklyTarget[] {
  return Array.from({ length: durationWeeks }, (_, i) => ({
    week: i + 1,
    sets: startingSets,
    reps: startingReps,
    weight: startingWeight,
    isDeload: false,
  }));
}

function calcLinear(
  p: ExerciseProgression,
  startWeight: number,
  sets: number,
  weeks: number,
): WeeklyTarget[] {
  const targets: WeeklyTarget[] = [];
  let weight = startWeight;
  let lastWorkingWeight = startWeight;

  for (let w = 1; w <= weeks; w++) {
    const isDeload = p.deloadFrequency > 0 && w % p.deloadFrequency === 0;

    if (isDeload) {
      targets.push({
        week: w,
        sets: Math.max(sets - 1, 2),
        reps: p.repRangeMin,
        weight: round(lastWorkingWeight * (1 - p.deloadPercent / 100)),
        isDeload: true,
      });
    } else {
      targets.push({
        week: w,
        sets,
        reps: p.repRangeMin,
        weight: round(weight),
        isDeload: false,
      });
      lastWorkingWeight = weight;
      weight += p.weeklyWeightIncrement;
    }
  }

  return targets;
}

function calcDoubleProgression(
  p: ExerciseProgression,
  startWeight: number,
  sets: number,
  weeks: number,
): WeeklyTarget[] {
  const targets: WeeklyTarget[] = [];
  let weight = startWeight;
  let reps = p.repRangeMin;
  let lastWorkingWeight = startWeight;
  const repRange = p.repRangeMax - p.repRangeMin;
  const workingWeeks = p.deloadFrequency > 0 ? p.deloadFrequency - 1 : weeks;
  const repsPerWeek = repRange > 0 ? Math.max(1, Math.ceil(repRange / workingWeeks)) : 0;

  for (let w = 1; w <= weeks; w++) {
    const isDeload = p.deloadFrequency > 0 && w % p.deloadFrequency === 0;

    if (isDeload) {
      targets.push({
        week: w,
        sets: Math.max(sets - 1, 2),
        reps: p.repRangeMin,
        weight: round(lastWorkingWeight * (1 - p.deloadPercent / 100)),
        isDeload: true,
      });
      weight += p.weeklyWeightIncrement;
      reps = p.repRangeMin;
    } else {
      targets.push({
        week: w,
        sets,
        reps,
        weight: round(weight),
        isDeload: false,
      });
      lastWorkingWeight = weight;

      if (reps >= p.repRangeMax) {
        weight += p.weeklyWeightIncrement;
        reps = p.repRangeMin;
      } else {
        reps = Math.min(reps + repsPerWeek, p.repRangeMax);
      }
    }
  }

  return targets;
}

function round(n: number): number {
  return Math.round(n * 2) / 2;
}

export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  // Brzycki formula
  return round(weight * (36 / (37 - reps)));
}

// A set stopped short of failure understates true strength if scored on reps alone —
// 8 reps with 3 left in the tank is closer to an 11-rep effort than a straight 8.
// Folding reps-in-reserve (explicit RIR, or RPE converted via RIR ≈ 10 - RPE) into the
// rep count before estimating 1RM makes the estimate reflect effort, not just output.
export function estimateAdjustedOneRM(weight: number, reps: number, rir?: number, rpe?: number): number {
  const reserve = rir != null ? Math.max(0, rir) : rpe != null ? Math.max(0, 10 - rpe) : 0;
  return estimate1RM(weight, Math.min(reps + reserve, 30));
}

export function getPercentages1RM(oneRM: number): { pct: number; weight: number }[] {
  return [100, 95, 90, 85, 80, 75, 70, 65, 60].map((pct) => ({
    pct,
    weight: round(oneRM * pct / 100),
  }));
}

export function getAdaptiveTarget(
  planned: WeeklyTarget,
  previousTarget: WeeklyTarget | null,
  lastPerformance?: { sets: SetLog[]; date: string },
): WeeklyTarget {
  if (!lastPerformance || !previousTarget) return planned;

  const completed = lastPerformance.sets.filter((s) => s.completed);
  if (completed.length === 0) return planned;

  const avgReps =
    completed.reduce((sum, s) => sum + s.reps, 0) / completed.length;
  const avgWeight =
    completed.reduce((sum, s) => sum + s.weight, 0) / completed.length;

  const hitReps = avgReps >= previousTarget.reps * 0.9;
  const hitWeight = avgWeight >= previousTarget.weight * 0.95;

  if (hitReps && hitWeight) return planned;

  return {
    ...planned,
    weight: round(previousTarget.weight),
  };
}

export function formatProgressionLabel(p: ExerciseProgression): string {
  if (p.type === 'custom') return 'Custom (manual)';
  const type = p.type === 'linear' ? 'Linear' : 'Double Prog';
  const deload =
    p.deloadFrequency > 0 ? `, deload every ${p.deloadFrequency}w` : '';
  return `${type} +${p.weeklyWeightIncrement}/wk${deload}`;
}

// ── Smart Progression Analysis ──

export interface ProgressionSuggestion {
  type: 'increase' | 'deload';
  message: string;
  suggestedWeight: number;
  confidence: 'high' | 'medium';
}

interface SessionPerformance {
  date: string;
  maxWeight: number;
  avgWeight: number;
  avgReps: number;
  totalSets: number;
  allRepsHit: boolean;
  allRepsHitFloor: boolean;
  targetReps: number;
  avgRir?: number;
  avgRpe?: number;
}

function getExerciseHistory(
  exerciseName: string,
  sessions: WorkoutSession[],
  allExercises: Map<string, Exercise>,
): SessionPerformance[] {
  const nameLower = exerciseName.toLowerCase().trim();
  const matchingIds: string[] = [];
  for (const [id, ex] of allExercises) {
    if (ex.name.toLowerCase().trim() === nameLower) matchingIds.push(id);
  }
  if (matchingIds.length === 0) return [];

  const history: SessionPerformance[] = [];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  for (const session of sorted) {
    for (const exId of matchingIds) {
      const sets = session.sets[exId]?.filter((s) => s.completed && s.weight > 0);
      if (!sets || sets.length === 0) continue;

      const ex = allExercises.get(exId);
      const repTarget = ex ? parseInt(ex.reps.split('-').pop()?.replace(/[^0-9]/g, '') || '0') || 0 : 0;
      const repFloor = ex
        ? (ex.progression?.repRangeMin || parseInt(ex.reps.split('-')[0]?.replace(/[^0-9]/g, '') || '0') || 0)
        : 0;
      const rirValues = sets.filter((s) => s.rir != null).map((s) => s.rir as number);
      const rpeValues = sets.filter((s) => s.rpe != null).map((s) => s.rpe as number);

      history.push({
        date: session.date,
        maxWeight: Math.max(...sets.map((s) => s.weight)),
        avgWeight: sets.reduce((a, s) => a + s.weight, 0) / sets.length,
        avgReps: sets.reduce((a, s) => a + s.reps, 0) / sets.length,
        totalSets: sets.length,
        allRepsHit: repTarget > 0 ? sets.every((s) => s.reps >= repTarget) : true,
        allRepsHitFloor: repFloor > 0 ? sets.every((s) => s.reps >= repFloor) : true,
        targetReps: repTarget,
        avgRir: rirValues.length > 0 ? rirValues.reduce((a, v) => a + v, 0) / rirValues.length : undefined,
        avgRpe: rpeValues.length > 0 ? rpeValues.reduce((a, v) => a + v, 0) / rpeValues.length : undefined,
      });
      break;
    }
  }

  return history;
}

// undefined = no RIR/RPE logged for this session — caller must treat effort as unknown, not "not hard"/"not easy"
function wasHardEffort(s: SessionPerformance): boolean | undefined {
  if (s.avgRir == null && s.avgRpe == null) return undefined;
  return (s.avgRir != null && s.avgRir <= 1) || (s.avgRpe != null && s.avgRpe >= 9);
}

function wasEasyEffort(s: SessionPerformance): boolean | undefined {
  if (s.avgRir == null && s.avgRpe == null) return undefined;
  return (s.avgRir != null && s.avgRir >= 3) || (s.avgRpe != null && s.avgRpe <= 6);
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Groups an exercise's full history into calendar-week buckets (relative to the most
// recent session), not raw log-entry counts — so "3 sessions in the same week" can't
// masquerade as "3 weeks of stagnation". Each bucket keeps its most representative
// session (most completed sets, i.e. a normal working day rather than a one-off single).
interface WeekBucket {
  weeksAgo: number;
  session: SessionPerformance;
}

function buildWeekBuckets(history: SessionPerformance[]): WeekBucket[] {
  if (history.length === 0) return [];
  const latest = new Date(`${history[history.length - 1].date}T00:00:00`).getTime();
  const byWeek = new Map<number, SessionPerformance>();

  for (const s of history) {
    const weeksAgo = Math.floor((latest - new Date(`${s.date}T00:00:00`).getTime()) / MS_PER_WEEK);
    const existing = byWeek.get(weeksAgo);
    if (!existing || s.totalSets > existing.totalSets ||
        (s.totalSets === existing.totalSets && s.maxWeight > existing.maxWeight)) {
      byWeek.set(weeksAgo, s);
    }
  }

  // oldest first
  return Array.from(byWeek.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([weeksAgo, session]) => ({ weeksAgo, session }));
}

export function analyzeExerciseProgression(
  exercise: Exercise,
  sessions: WorkoutSession[],
  allExercises: Map<string, Exercise>,
): ProgressionSuggestion | null {
  const history = getExerciseHistory(exercise.name, sessions, allExercises);
  if (history.length < 2) return null;

  const recent = history.slice(-5);
  const last = recent[recent.length - 1];
  const compound = isCompoundExercise(exercise.name);
  const increment = compound ? 5 : 2.5;

  // ── Deload: only after genuine multi-week stagnation or a real decline. ──
  // Silence ("maintaining") is the default outcome everywhere else.
  const weekBuckets = buildWeekBuckets(history);
  if (weekBuckets.length >= 3) {
    const last3 = weekBuckets.slice(-3);
    const oldest = last3[0].session;
    const newest = last3[2].session;
    // Sparse logging (e.g. once a month) shouldn't read as a tight 3-week trend.
    const sparse = last3[0].weeksAgo - last3[2].weeksAgo > 8;

    // Same weight & reps, but it's gotten noticeably harder to produce the same
    // numbers — a real early regression signal (fatigue/under-recovery) even when
    // they're still technically hitting the prescribed reps, so this is checked
    // independently of the "hit full target" bail below.
    const quietRegression =
      newest.maxWeight === oldest.maxWeight &&
      Math.abs(newest.avgReps - oldest.avgReps) < 0.5 &&
      wasEasyEffort(oldest) === true &&
      wasHardEffort(newest) === true;

    // Hit the full target most recently and effort isn't quietly climbing → doing
    // fine (or ready to increase below); never deload.
    const stuck =
      !newest.allRepsHit &&
      newest.maxWeight === oldest.maxWeight &&
      !newest.allRepsHitFloor &&
      newest.avgReps <= oldest.avgReps &&
      wasEasyEffort(newest) !== true; // a miss on a deliberately easy day isn't a real stall signal

    const regressing = !newest.allRepsHit && newest.maxWeight < oldest.maxWeight;

    if (!sparse && (stuck || regressing || quietRegression)) {
      const deloadWeight = round(newest.maxWeight * 0.85);
      const message = quietRegression
        ? `Same weight and reps for 3 weeks, but it's taking a lot more out of you. Consider a deload to ${deloadWeight}.`
        : regressing
          ? `Weight has trended down over the last 3 weeks. Consider deloading to ${deloadWeight}.`
          : `Stuck at ${newest.maxWeight} for 3 weeks with reps not improving. Consider deloading to ${deloadWeight}.`;
      return { type: 'deload', message, suggestedWeight: deloadWeight, confidence: 'high' };
    }
  }

  // ── Increase: same weight, hitting all reps ──
  if (recent.length >= 3) {
    const lastThree = recent.slice(-3);
    const allSameWeight = lastThree.every((s) => s.maxWeight === lastThree[0].maxWeight);
    const allHitReps = lastThree.every((s) => s.allRepsHit);

    if (allSameWeight && allHitReps) {
      const nextWeight = round(last.maxWeight + increment);
      return {
        type: 'increase',
        message: `Hit all reps at ${last.maxWeight} for 3 sessions. Try ${nextWeight} next.`,
        suggestedWeight: nextWeight,
        confidence: 'high',
      };
    }
  }

  if (last.allRepsHit && recent.length >= 2) {
    const prevSession = recent[recent.length - 2];
    if (last.maxWeight === prevSession.maxWeight && prevSession.allRepsHit) {
      const nextWeight = round(last.maxWeight + increment);
      const clearlySubmaximal = wasEasyEffort(last) === true && wasEasyEffort(prevSession) === true;
      return {
        type: 'increase',
        message: `Ready to move up to ${nextWeight}`,
        suggestedWeight: nextWeight,
        confidence: clearlySubmaximal ? 'high' : 'medium',
      };
    }
  }

  return null;
}

export function buildExerciseMap(
  programs: { days: { exercises: Exercise[] }[] }[],
): Map<string, Exercise> {
  const map = new Map<string, Exercise>();
  for (const prog of programs) {
    for (const day of prog.days) {
      for (const ex of day.exercises) {
        map.set(ex.id, ex);
      }
    }
  }
  return map;
}
