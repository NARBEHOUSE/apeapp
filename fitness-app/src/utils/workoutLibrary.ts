import type {
  EffortMetric,
  Exercise,
  LibraryEntryKind,
  PerformedWorkoutIdentity,
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

/** How a day of a library entry should be remembered once it has been trained. */
export function dayIdentityOf(entry: Program, day: WorkoutDay): PerformedWorkoutIdentity {
  return {
    title: day.title || day.tag || entry.name,
    tag: day.tag || '',
    label: day.label || '',
    accent: day.accent || '',
    programName: entry.name,
  };
}

/** Day id -> how that day should be remembered, across the whole library. */
export function buildDayIdentityCatalog(entries: Program[]): Map<string, PerformedWorkoutIdentity> {
  const catalog = new Map<string, PerformedWorkoutIdentity>();
  for (const entry of entries) {
    for (const day of entry.days) catalog.set(day.id, dayIdentityOf(entry, day));
  }
  return catalog;
}

/**
 * The title to show for a logged session.
 *
 * A name the user typed wins, then what the workout was called when they did it, and only
 * then the library. Falling through to the program's name is a last resort — it is what
 * produced "every session is now just called 'My Program'" when a day was swapped out.
 */
export function sessionTitle(
  session: WorkoutSession,
  day?: { title?: string; tag?: string },
  entry?: { name?: string },
): string {
  return session.name
    || session.performedAs?.title
    || day?.title
    || day?.tag
    || session.performedAs?.programName
    || entry?.name
    || 'Workout';
}

/** The tag a logged session was filed under, as it was at the time. */
export function sessionTag(session: WorkoutSession, day?: { tag?: string }): string {
  return session.performedAs?.tag || day?.tag || '';
}

/** Badge text and colour: an explicit badge the user set wins over the historical one. */
export function sessionBadge(
  session: WorkoutSession,
  day?: { label?: string; accent?: string },
): { label: string; accent: string } {
  return {
    label: (session.label || session.performedAs?.label || day?.label || 'W').slice(0, 2),
    accent: session.accent || session.performedAs?.accent || day?.accent || '#e8572a',
  };
}

/** Every exercise the library knows about, keyed by id. */
export function buildExerciseCatalog(entries: Program[]): Map<string, SessionExercise> {
  const catalog = new Map<string, SessionExercise>();
  for (const entry of entries) {
    for (const day of entry.days) {
      for (const ex of toSessionExercises(day.exercises)) catalog.set(ex.id, ex);
    }
  }
  return catalog;
}

/**
 * The exercise list a session should be stored with, or null when it already describes
 * everything it logged. Used to backfill sessions saved before they carried their own
 * list, so that editing or deleting a library entry can never strip the names off a
 * workout that is already in the books.
 *
 * Anything already on the session is left exactly as it was — the record of what was
 * done that day outranks whatever the library says today.
 */
export function sessionExercisesAfterFreeze(
  session: WorkoutSession,
  catalog: Map<string, SessionExercise>,
): SessionExercise[] | null {
  const described = new Set((session.exercises || []).map((e) => e.id));
  const recovered = Object.keys(session.sets)
    .filter((id) => !described.has(id))
    .map((id) => catalog.get(id))
    .filter((e): e is SessionExercise => !!e);
  if (recovered.length === 0) return null;
  return [...(session.exercises || []), ...recovered];
}

/**
 * Exercise id -> display name, for turning logged sets back into a readable workout.
 *
 * Sessions are read FIRST and library entries only fill gaps. A logged session is a
 * historical record: what it says you did must not change because you renamed an
 * exercise, and must not vanish because you edited or deleted the program it came from.
 * The library is only a fallback for old sessions that predate per-session manifests.
 */
export function buildExerciseNameMap(
  entries: Program[],
  sessions: WorkoutSession[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    for (const day of entry.days) {
      for (const e of day.exercises) {
        if (e.name?.trim()) map[e.id] = e.name;
      }
    }
  }
  for (const session of sessions) {
    for (const e of session.exercises || []) {
      if (e.name?.trim()) map[e.id] = e.name;
    }
  }
  return map;
}

/**
 * A name to show for a logged exercise. Never returns a raw id — a user staring at
 * "a3f2c1d4-…" where their bench press used to be has, as far as they can tell, lost
 * the workout.
 */
export function displayExerciseName(
  exerciseId: string,
  nameMap: Record<string, string>,
): string {
  const known = nameMap[exerciseId];
  if (known) return known;
  // CSV imports encode the name in the id, e.g. "import-bench-press".
  if (exerciseId.startsWith('import-')) {
    return exerciseId
      .slice('import-'.length)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Unknown exercise';
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
