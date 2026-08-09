import type { Program, WorkoutSession } from '../types';

/**
 * Proximity-to-failure threshold for a "hard set" — a set taken within 3 reps of
 * failure. That is the stimulus floor the hypertrophy literature works from: sets
 * left further from failure still cost fatigue but drive very little growth, so
 * they are counted as working sets without being credited as hard ones.
 * RIR 0-3 is the same range as RPE 7-10.
 */
export const HARD_SET_MAX_RIR = 3;
export const HARD_SET_MIN_RPE = 7;

/** Generic weekly hard-set landmarks per muscle (minimum effective / maximum adaptive). */
export const WEEKLY_HARD_SETS_MEV = 10;
export const WEEKLY_HARD_SETS_MAV = 20;

/**
 * A muscle worked indirectly gets half a set of credit, matching the half-volume
 * split already used for secondary muscles elsewhere in the app.
 */
const SECONDARY_CREDIT = 0.5;

export type SetEffort = 'hard' | 'submaximal' | 'unrated';

export function classifySetEffort(set: { rir?: number; rpe?: number }): SetEffort {
  if (typeof set.rir === 'number') return set.rir <= HARD_SET_MAX_RIR ? 'hard' : 'submaximal';
  if (typeof set.rpe === 'number') return set.rpe >= HARD_SET_MIN_RPE ? 'hard' : 'submaximal';
  return 'unrated';
}

export interface MuscleSetCounts {
  /** Completed working sets credited to the muscle, halved when worked indirectly. */
  sets: number;
  /** Working sets logged within HARD_SET_MAX_RIR of failure. */
  hard: number;
  /** Working sets that carried an RIR/RPE value at all — effort logging is opt-in. */
  rated: number;
  /**
   * Tonnage (weight × reps, in lbs). Kept as a secondary "nice to see" figure only —
   * it rewards heavy low-rep work and ignores proximity to failure, so it should never
   * be the headline volume number.
   */
  volume: number;
}

export type ExerciseMuscleMap = Record<string, { primaries: string[]; secondary: string[] }>;

export function buildExerciseMuscleMap(programs: Program[]): ExerciseMuscleMap {
  const map: ExerciseMuscleMap = {};
  for (const prog of programs) {
    for (const day of prog.days) {
      for (const ex of day.exercises) {
        if (!ex.muscle) continue;
        const primaries = ex.muscle.split(',').map((m) => m.trim()).filter(Boolean);
        const sec = ex.secondaryMuscles;
        const secondary = Array.isArray(sec) ? sec : (sec || '').split(',').map((m) => m.trim()).filter(Boolean);
        map[ex.id] = { primaries, secondary };
      }
    }
  }
  return map;
}

const emptyCounts = (): MuscleSetCounts => ({ sets: 0, hard: 0, rated: 0, volume: 0 });

/** Fold one session's completed working sets into a muscle → set-count tally. */
export function accumulateMuscleSets(
  session: WorkoutSession,
  muscleMap: ExerciseMuscleMap,
  into: Record<string, MuscleSetCounts>,
): Record<string, MuscleSetCounts> {
  for (const [exId, sets] of Object.entries(session.sets)) {
    const working = sets.filter((st) => st.completed && !st.isWarmup);
    if (working.length === 0) continue;
    const info = muscleMap[exId];
    if (!info?.primaries?.length) continue;

    let hard = 0;
    let rated = 0;
    let volume = 0;
    for (const st of working) {
      const effort = classifySetEffort(st);
      if (effort !== 'unrated') rated++;
      if (effort === 'hard') hard++;
      volume += st.weight * st.reps;
    }

    const credit = (muscle: string, share: number) => {
      if (!muscle) return;
      const tally = into[muscle] || (into[muscle] = emptyCounts());
      tally.sets += working.length * share;
      tally.hard += hard * share;
      tally.rated += rated * share;
      tally.volume += volume * share;
    };

    for (const p of info.primaries) credit(p, 1);
    for (const s of info.secondary) credit(s, SECONDARY_CREDIT);
  }
  return into;
}

/** Roll a set of sessions into one muscle → set-count tally. */
export function muscleSetsForSessions(
  sessions: WorkoutSession[],
  muscleMap: ExerciseMuscleMap,
): Record<string, MuscleSetCounts> {
  const into: Record<string, MuscleSetCounts> = {};
  for (const s of sessions) accumulateMuscleSets(s, muscleMap, into);
  return into;
}

/**
 * Whole-body set totals. No muscle attribution, so each set is counted exactly once
 * and the numbers stay whole — unlike the per-muscle tallies, which double-count by
 * design so every muscle sees its own credit.
 */
export function totalSetCounts(sessions: WorkoutSession[]): MuscleSetCounts {
  const total = emptyCounts();
  for (const s of sessions) {
    for (const sets of Object.values(s.sets)) {
      for (const st of sets) {
        if (!st.completed || st.isWarmup) continue;
        total.sets++;
        total.volume += st.weight * st.reps;
        const effort = classifySetEffort(st);
        if (effort !== 'unrated') total.rated++;
        if (effort === 'hard') total.hard++;
      }
    }
  }
  return total;
}

/** True when at least one set carries an RIR/RPE value, i.e. hard sets are meaningful. */
export function hasRatedSets(counts: Iterable<MuscleSetCounts>): boolean {
  for (const c of counts) if (c.rated > 0) return true;
  return false;
}

export type VolumeStatus = 'below' | 'productive' | 'high';

export function weeklyVolumeStatus(hardSets: number): VolumeStatus {
  if (hardSets < WEEKLY_HARD_SETS_MEV) return 'below';
  if (hardSets <= WEEKLY_HARD_SETS_MAV) return 'productive';
  return 'high';
}

/** Set counts are fractional when a muscle is only worked indirectly. */
export function formatSets(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
