import { getDB } from './index';
import type { WaterEntry } from '../types';

export async function saveWaterEntry(entry: WaterEntry): Promise<void> {
  const db = await getDB();
  await db.put('water', entry);
  window.dispatchEvent(new Event('ape-data-saved'));
}

export async function getWaterByProfile(profileId: string): Promise<WaterEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('water', 'by-profile', profileId);
}

export async function getWaterByDate(profileId: string, date: string): Promise<WaterEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('water', 'by-profile-date', [profileId, date]);
}

export async function deleteWaterEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('water', id);
}
