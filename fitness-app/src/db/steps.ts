import { getDB } from './index';
import type { StepEntry } from '../types';

export async function saveStepEntry(entry: StepEntry): Promise<void> {
  const db = await getDB();
  await db.put('steps', entry);
}

export async function getStepsByProfile(profileId: string): Promise<StepEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('steps', 'by-profile', profileId);
}

export async function getStepsByDate(profileId: string, date: string): Promise<StepEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('steps', 'by-profile-date', [profileId, date]);
}

export async function deleteStepEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('steps', id);
}
