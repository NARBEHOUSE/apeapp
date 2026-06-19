import { getDB } from './index';
import type { Measurement, ProgressPhoto } from '../types';

export async function saveMeasurement(m: Measurement): Promise<void> {
  const db = await getDB();
  await db.put('measurements', m);
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
}

export async function getPhotosByProfile(profileId: string): Promise<ProgressPhoto[]> {
  const db = await getDB();
  return db.getAllFromIndex('progressPhotos', 'by-profile', profileId);
}

export async function getPhotosByPose(profileId: string, pose: string): Promise<ProgressPhoto[]> {
  const db = await getDB();
  return db.getAllFromIndex('progressPhotos', 'by-profile-pose', [profileId, pose]);
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('progressPhotos', id);
}
