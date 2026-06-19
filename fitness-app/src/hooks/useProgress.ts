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
    },
    [profileId, loadData]
  );

  const deletePhoto = useCallback(
    async (id: string) => {
      await dbDeletePhoto(id);
      await loadData();
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
