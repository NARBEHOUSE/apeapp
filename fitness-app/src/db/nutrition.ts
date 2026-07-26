import { getDB } from './index';
import type { FoodEntry } from '../types';

export async function saveFoodEntry(entry: FoodEntry): Promise<void> {
  const db = await getDB();
  await db.put('foodEntries', entry);
  window.dispatchEvent(new Event('ape-data-saved'));
}

export async function getFoodEntriesByDate(profileId: string, date: string): Promise<FoodEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('foodEntries', 'by-profile-date', [profileId, date]);
}

export async function getFoodEntriesByProfile(profileId: string): Promise<FoodEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('foodEntries', 'by-profile', profileId);
}

export async function deleteFoodEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('foodEntries', id);
}

export async function getFavoriteFoods(profileId: string): Promise<FoodEntry[]> {
  const entries = await getFoodEntriesByProfile(profileId);
  return entries.filter((e) => e.isFavorite);
}
