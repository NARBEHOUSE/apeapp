import type {
  EffortMetric,
  Exercise,
  LibraryEntryKind,
  Program,
  SessionExercise,
  WorkoutDay,
  WorkoutSession,
} from '../types';
import { today } from './dateHelpers';

/**
 * The library holds two kinds of thing in one store: strict multi-day programs you
 * enroll in, and standalone workouts you do whenever you feel like it. They share the
 * `Program` shape so that exercise identity — and therefore last-performance, PRs,
 * per-muscle volume and progression suggestions — resolves identically for both.
 */

export function entryKind(entry: Program): LibraryEntryKind {
  return entry.kind === 'workout' ? 'workout' : 'program';
}

export function isSavedWorkout(entry: Program): boolean {
  return entry.kind === 'workout';
}

export function isStrictProgram(entry: Program): boolean {
  return entry.kind !== 'workout';
}

/** The single day a standalone workout is made of. */
export function workoutDayOf(entry: Program): WorkoutDay | undefined {
  return entry.days[0];
}

export function splitLibrary(entries: Program[]): { workouts: Program[]; programs: Program[] } {
  return {
    workouts: entries.filter(isSavedWorkout),
    programs: entries.filter(isStrictProgram),
  };
}

/** Strip a prescription down to the identity fields worth storing on every session. */
export function toSessionExercises(exercises: Exercise[]): SessionExercise[] {
  return exercises
    .filter((e) => e.name.trim().length > 0)
    .map((e) => ({
      id: e.id,
      name: e.name.trim(),
      muscle: e.muscle || '',
      ...(e.secondaryMuscles ? { secondaryMuscles: e.secondaryMuscles } : {}),
      sets: e.sets,
      reps: e.reps,
      ...(e.inputType ? { inputType: e.inputType } : {}),
      ...(e.exerciseType ? { exerciseType: e.exerciseType } : {}),
    }));
}

function newEntryTimestamps() {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now };
}

/**
 * Pin a program day into the library as a standalone workout.
 *
 * Exercise ids are carried over from the source day rather than regenerated. That is the
 * opposite of `duplicateProgram`, and deliberately so: duplicating a program forks it
 * into something you edit independently, whereas pinning a day means "I want to keep
 * doing exactly this lift, just without the schedule". Reusing the ids keeps PRs and
 * last-performance continuous across the enrolled and the loose version of the same day.
 */
export function buildWorkoutFromDay(day: WorkoutDay, source?: Program): Program {
  const title = day.title?.trim() || day.tag?.trim() || 'Workout';
  return {
    id: crypto.randomUUID(),
    kind: 'workout',
    name: title,
    description: source ? `${day.tag || title} from ${source.name}` : day.subtitle || '',
    isBuiltIn: false,
    ...newEntryTimestamps(),
    ...(source ? { sourceProgramId: source.id, sourceProgramName: source.name } : {}),
    // Settings that shape how the session is logged travel with the day, so running it
    // loosely feels identical to running it inside the program.
    ...(source?.effortMetric ? { effortMetric: source.effortMetric } : {}),
    ...(source?.defaultRestTimer ? { defaultRestTimer: source.defaultRestTimer } : {}),
    ...(source?.goal ? { goal: source.goal } : {}),
    days: [{ ...day, id: crypto.randomUUID(), exercises: day.exercises.map((e) => ({ ...e })) }],
  };
}

/**
 * The inverse of `buildWorkoutFromDay`: drop a saved workout into a program as its next
 * day, so a rotation can be assembled from workouts the user already has instead of
 * being retyped by hand.
 *
 * Exercise ids carry over for the same reason they do in the other direction — a lift
 * they've been doing loosely keeps its PRs and strength history once it becomes part of
 * a program. The exercise objects themselves are copies, so editing the program day never
 * touches the saved workout.
 */
export function buildDayFromWorkout(workout: Program, dayIndex: number): WorkoutDay | null {
  const source = workoutDayOf(workout);
  if (!source) return null;
  return {
    ...source,
    id: crypto.randomUUID(),
    label: `D${dayIndex + 1}`,
    title: source.title || workout.name,
    exercises: source.exercises.map((e) => ({ ...e })),
  };
}

/**
 * Save the exercises of a freestyle session as a reusable workout. Exercise ids are kept
 * as-is for the same reason as above — the sets already logged against them should chain
 * up with the next time this workout is run.
 */
export function buildWorkoutFromExercises(
  name: string,
  exercises: Exercise[],
  opts: { effortMetric?: EffortMetric; accent?: string } = {},
): Program {
  const accent = opts.accent || '#e8572a';
  return {
    id: crypto.randomUUID(),
    kind: 'workout',
    name: name.trim() || 'Workout',
    description: '',
    isBuiltIn: false,
    ...newEntryTimestamps(),
    // Whatever effort metric the session was logged with carries over, so repeating the
    // workout doesn't silently drop the RIR/RPE column.
    ...(opts.effortMetric && opts.effortMetric !== 'none' ? { effortMetric: opts.effortMetric } : {}),
    days: [{
      id: crypto.randomUUID(),
      label: '',
      tag: 'WORKOUT',
      title: name.trim() || 'Workout',
      subtitle: '',
      accent,
      note: '',
      exercises: exercises.map((e) => ({ ...e })),
    }],
  };
}

/** An empty standalone workout, ready for the editor. */
export function blankWorkout(): Program {
  return buildWorkoutFromExercises('New Workout', []);
}

/** Most recent date this library entry was actually trained, ignoring skipped sessions. */
export function lastPerformedDate(entryId: string, sessions: WorkoutSession[]): string | null {
  let latest: string | null = null;
  for (const s of sessions) {
    if (s.programId !== entryId || s.status === 'skipped') continue;
    if (!latest || s.date > latest) latest = s.date;
  }
  return latest;
}

export function daysSince(date: string | null): number | null {
  if (!date) return null;
  // Session dates are local date strings, so "today" has to be local too — deriving it
  // from toISOString() reads a workout logged this evening as yesterday's east of UTC.
  const then = new Date(date + 'T00:00:00').getTime();
  const now = new Date(today() + 'T00:00:00').getTime();
  return Math.max(0, Math.round((now - then) / 86400000));
}

export function formatDaysAgo(date: string | null): string {
  const d = daysSince(date);
  if (d == null) return 'Never done';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'Last week';
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

/** Primary muscles a workout hits, ordered by how many sets go to each. */
export function muscleFocus(entry: Program, limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const day of entry.days) {
    for (const ex of day.exercises) {
      for (const m of (ex.muscle || '').split(',').map((x) => x.trim()).filter(Boolean)) {
        counts.set(m, (counts.get(m) || 0) + (ex.sets || 1));
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([m]) => m);
}

export function exerciseCount(entry: Program): number {
  return entry.days.reduce((n, d) => n + d.exercises.length, 0);
}
