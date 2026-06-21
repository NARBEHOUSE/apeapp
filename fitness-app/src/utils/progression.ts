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
  type: 'increase' | 'stall' | 'deload' | 'maintain';
  message: string;
  suggestedWeight?: number;
  confidence: 'high' | 'medium';
}

interface SessionPerformance {
  date: string;
  maxWeight: number;
  avgWeight: number;
  avgReps: number;
  totalSets: number;
  allRepsHit: boolean;
  targetReps: number;
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

      history.push({
        date: session.date,
        maxWeight: Math.max(...sets.map((s) => s.weight)),
        avgWeight: sets.reduce((a, s) => a + s.weight, 0) / sets.length,
        avgReps: sets.reduce((a, s) => a + s.reps, 0) / sets.length,
        totalSets: sets.length,
        allRepsHit: repTarget > 0 ? sets.every((s) => s.reps >= repTarget) : true,
        targetReps: repTarget,
      });
      break;
    }
  }

  return history;
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

  // Detect stall: same max weight for 3+ sessions
  if (recent.length >= 3) {
    const lastThree = recent.slice(-3);
    const allSameWeight = lastThree.every((s) => s.maxWeight === lastThree[0].maxWeight);
    const anyMissedReps = lastThree.some((s) => !s.allRepsHit);

    if (allSameWeight && anyMissedReps) {
      // Stalled AND missing reps — suggest deload
      const deloadWeight = round(last.maxWeight * 0.85);
      return {
        type: 'deload',
        message: `Stalled at ${last.maxWeight} for 3 sessions with missed reps. Consider deloading to ${deloadWeight}.`,
        suggestedWeight: deloadWeight,
        confidence: 'high',
      };
    }

    if (allSameWeight && !anyMissedReps) {
      // Same weight but hitting all reps — ready to increase
      const nextWeight = round(last.maxWeight + increment);
      return {
        type: 'increase',
        message: `Hit all reps at ${last.maxWeight} for 3 sessions. Try ${nextWeight} next.`,
        suggestedWeight: nextWeight,
        confidence: 'high',
      };
    }
  }

  // Check if last session hit all reps — suggest increase
  if (last.allRepsHit && recent.length >= 2) {
    const prevSession = recent[recent.length - 2];
    if (last.maxWeight === prevSession.maxWeight && prevSession.allRepsHit) {
      const nextWeight = round(last.maxWeight + increment);
      return {
        type: 'increase',
        message: `Ready to move up to ${nextWeight}`,
        suggestedWeight: nextWeight,
        confidence: 'medium',
      };
    }
  }

  // Weight went down from previous session
  if (recent.length >= 2) {
    const prev = recent[recent.length - 2];
    if (last.maxWeight < prev.maxWeight && !last.allRepsHit) {
      return {
        type: 'stall',
        message: `Weight dropped from ${prev.maxWeight} to ${last.maxWeight}. Stay at ${last.maxWeight} until reps are solid.`,
        suggestedWeight: last.maxWeight,
        confidence: 'medium',
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
