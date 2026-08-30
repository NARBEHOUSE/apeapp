import { getDB } from './index';
import type { Program, WorkoutSession } from '../types';
import { buildExerciseCatalog, sessionExercisesAfterFreeze } from '../utils/workoutLibrary';

/**
 * Stamp the exercises a session was logged with onto the session itself.
 *
 * A logged workout is a historical record. It must stay readable no matter what happens
 * to the library afterwards — renaming an exercise, dropping one from a workout, or
 * deleting the whole program should never turn months of logged sets into a list of raw
 * ids. Sessions saved before this existed have no manifest, so they still resolve through
 * the library; this backfills them from whatever entries are present so they stop
 * depending on it.
 *
 * Idempotent: only sessions with logged sets that aren't already described get rewritten.
 * Ids that resolve to nothing are left alone, so re-importing a deleted program later
 * lets a subsequent pass recover those names.
 */
export async function freezeSessionExercises(entries: Program[]): Promise<number> {
  const catalog = buildExerciseCatalog(entries);
  if (catalog.size === 0) return 0;

  const db = await getDB();
  const sessions = await db.getAll('workoutSessions');
  let updated = 0;

  for (const session of sessions) {
    const exercises = sessionExercisesAfterFreeze(session, catalog);
    if (!exercises) continue;
    await db.put('workoutSessions', { ...session, exercises });
    updated++;
  }

  return updated;
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  const db = await getDB();
  await db.put('workoutSessions', session);
  window.dispatchEvent(new Event('ape-data-saved'));
}

export async function getWorkoutSession(id: string): Promise<WorkoutSession | undefined> {
  const db = await getDB();
  return db.get('workoutSessions', id);
}

export async function getSessionsByProfile(profileId: string): Promise<WorkoutSession[]> {
  const db = await getDB();
  return db.getAllFromIndex('workoutSessions', 'by-profile', profileId);
}

export async function getSessionsByProfileAndDate(
  profileId: string,
  date: string
): Promise<WorkoutSession[]> {
  const db = await getDB();
  return db.getAllFromIndex('workoutSessions', 'by-profile-date', [profileId, date]);
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('workoutSessions', id);
}

export async function getAllPRs(
  profileId: string
): Promise<Record<string, { weight: number; reps: number; date: string }>> {
  const sessions = await getSessionsByProfile(profileId);
  const prs: Record<string, { weight: number; reps: number; date: string }> = {};

  for (const session of sessions) {
    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      for (const set of sets) {
        if (!set.completed) continue;
        const current = prs[exerciseId];
        if (!current || set.weight > current.weight) {
          prs[exerciseId] = { weight: set.weight, reps: set.reps, date: session.date };
        }
      }
    }
  }

  return prs;
}
