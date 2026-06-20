import { useState, useEffect, useCallback } from 'react';
import type { Measurement, ProgressPhoto } from '../types';
import {
  saveMeasurement,
  getMeasurementsByProfile,
  deleteMeasurement as dbDeleteMeasurement,
  saveProgressPhoto,
  getPhotosByProfile,
  getPhotosByPose,
  deleteProgressPhoto as dbDeletePhoto,
} from '../db/progress';
import { getAccessToken, requireAccessToken, getStoredUser } from '../utils/googleAuth';
import { createPhotoFolder, uploadPhotoToFolder, deleteFile } from '../utils/googleDrive';

const UPLOADED_PHOTOS_KEY = 'fitos-coach-uploaded-photos';
const PHOTO_FOLDER_KEY = 'fitos-photo-folder-id';

export function useProgress(profileId: string | null) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const [m, p] = await Promise.all([
      getMeasurementsByProfile(profileId),
      getPhotosByProfile(profileId),
    ]);
    setMeasurements(m.sort((a, b) => b.date.localeCompare(a.date)));
    setPhotos(p.sort((a, b) => b.date.localeCompare(a.date)));
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addMeasurement = useCallback(
    async (m: Omit<Measurement, 'id' | 'profileId'>) => {
      if (!profileId) return;
      const full: Measurement = { ...m, id: crypto.randomUUID(), profileId };
      await saveMeasurement(full);
      await loadData();
    },
    [profileId, loadData]
  );

  const deleteMeasurement = useCallback(
    async (id: string) => {
      await dbDeleteMeasurement(id);
      await loadData();
    },
    [loadData]
  );

  const addPhoto = useCallback(
    async (photo: Omit<ProgressPhoto, 'id' | 'profileId'>) => {
      if (!profileId) return;
      const full: ProgressPhoto = { ...photo, id: crypto.randomUUID(), profileId };
      await saveProgressPhoto(full);
      await loadData();

      // Upload to Google Drive if signed in
      if (getStoredUser()) {
        try {
          const token = getAccessToken() || await requireAccessToken();
          let folderId = localStorage.getItem(PHOTO_FOLDER_KEY);
          if (!folderId) {
            folderId = await createPhotoFolder(token);
            localStorage.setItem(PHOTO_FOLDER_KEY, folderId);
          }
          const driveFileId = await uploadPhotoToFolder(token, folderId, full.id, full.imageData, `${full.date}_${full.pose}.jpg`);
          const map = JSON.parse(localStorage.getItem(UPLOADED_PHOTOS_KEY) || '{}');
          map[full.id] = driveFileId;
          localStorage.setItem(UPLOADED_PHOTOS_KEY, JSON.stringify(map));
        } catch (err) {
          console.error('Drive photo upload failed:', err);
        }
      }
    },
    [profileId, loadData]
  );

  const deletePhoto = useCallback(
    async (id: string) => {
      await dbDeletePhoto(id);
      await loadData();

      // Delete from Google Drive if signed in
      if (getStoredUser()) {
        try {
          const token = getAccessToken() || await requireAccessToken();
          const map = JSON.parse(localStorage.getItem(UPLOADED_PHOTOS_KEY) || '{}');
          if (map[id]) {
            await deleteFile(token, map[id]);
            delete map[id];
            localStorage.setItem(UPLOADED_PHOTOS_KEY, JSON.stringify(map));
          }
        } catch (err) {
          console.error('Drive photo delete failed:', err);
        }
      }
    },
    [loadData]
  );

  const getPhotosByPoseType = useCallback(
    async (pose: string): Promise<ProgressPhoto[]> => {
      if (!profileId) return [];
      return getPhotosByPose(profileId, pose);
    },
    [profileId]
  );

  return {
    measurements,
    photos,
    loading,
    addMeasurement,
    deleteMeasurement,
    addPhoto,
    deletePhoto,
    getPhotosByPoseType,
    refreshData: loadData,
  };
}
