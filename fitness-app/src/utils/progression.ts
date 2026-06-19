import type { SetLog, WeeklyTarget } from '../types';

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
