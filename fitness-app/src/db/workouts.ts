import { getDB } from './index';
import type { WorkoutSession } from '../types';

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  const db = await getDB();
  await db.put('workoutSessions', session);
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
