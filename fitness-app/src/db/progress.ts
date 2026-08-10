import { getDB } from './index';
import type { Measurement, ProgressPhoto } from '../types';

export async function saveMeasurement(m: Measurement): Promise<void> {
  const db = await getDB();
  await db.put('measurements', m);
  window.dispatchEvent(new Event('ape-data-saved'));
}

export async function getMeasurementsByProfile(profileId: string): Promise<Measurement[]> {
  const db = await getDB();
  return db.getAllFromIndex('measurements', 'by-profile', profileId);
}

export async function deleteMeasurement(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('measurements', id);
}

export async function saveProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const db = await getDB();
  await db.put('progressPhotos', photo);
  window.dispatchEvent(new Event('ape-data-saved'));
}

export async function getPhotosByProfile(profileId: string): Promise<ProgressPhoto[]> {
  const db = await getDB();
  return db.getAllFromIndex('progressPhotos', 'by-profile', profileId);
}

/**
 * Latest photo date for a profile, without materialising every photo. The reminder check
 * runs on a timer, and progress photos carry full base64 image data, so it walks a cursor
 * instead of pulling the whole set into memory just to read dates.
 */
export async function getLatestPhotoDate(profileId: string): Promise<string | null> {
  const db = await getDB();
  let latest: string | null = null;
  let cursor = await db.transaction('progressPhotos').store.index('by-profile').openCursor(profileId);
  while (cursor) {
    if (latest == null || cursor.value.date > latest) latest = cursor.value.date;
    cursor = await cursor.continue();
  }
  return latest;
}

export async function getPhotosByPose(profileId: string, pose: string): Promise<ProgressPhoto[]> {
  const db = await getDB();
  return db.getAllFromIndex('progressPhotos', 'by-profile-pose', [profileId, pose]);
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('progressPhotos', id);
}
