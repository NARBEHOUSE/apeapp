import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { WorkoutSession, FoodEntry, Measurement, ProgressPhoto, Program } from '../types';

interface FitOSDB extends DBSchema {
  workoutSessions: {
    key: string;
    value: WorkoutSession;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-date': [string, string];
    };
  };
  foodEntries: {
    key: string;
    value: FoodEntry;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-date': [string, string];
    };
  };
  measurements: {
    key: string;
    value: Measurement;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-date': [string, string];
    };
  };
  progressPhotos: {
    key: string;
    value: ProgressPhoto;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-pose': [string, string];
    };
  };
  programs: {
    key: string;
    value: Program;
  };
}

let dbInstance: IDBPDatabase<FitOSDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<FitOSDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<FitOSDB>('fitos-db', 1, {
    upgrade(db) {
      const workoutStore = db.createObjectStore('workoutSessions', { keyPath: 'id' });
      workoutStore.createIndex('by-profile', 'profileId');
      workoutStore.createIndex('by-date', 'date');
      workoutStore.createIndex('by-profile-date', ['profileId', 'date']);

      const foodStore = db.createObjectStore('foodEntries', { keyPath: 'id' });
      foodStore.createIndex('by-profile', 'profileId');
      foodStore.createIndex('by-date', 'date');
      foodStore.createIndex('by-profile-date', ['profileId', 'date']);

      const measurementStore = db.createObjectStore('measurements', { keyPath: 'id' });
      measurementStore.createIndex('by-profile', 'profileId');
      measurementStore.createIndex('by-date', 'date');
      measurementStore.createIndex('by-profile-date', ['profileId', 'date']);

      const photoStore = db.createObjectStore('progressPhotos', { keyPath: 'id' });
      photoStore.createIndex('by-profile', 'profileId');
      photoStore.createIndex('by-date', 'date');
      photoStore.createIndex('by-profile-pose', ['profileId', 'pose']);

      db.createObjectStore('programs', { keyPath: 'id' });
    },
  });

  return dbInstance;
}
