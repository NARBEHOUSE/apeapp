import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { WorkoutSession, FoodEntry, Measurement, ProgressPhoto, Program, CheckInEntry, StepEntry } from '../types';

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
  checkIns: {
    key: string;
    value: CheckInEntry;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-date': [string, string];
    };
  };
  steps: {
    key: string;
    value: StepEntry;
    indexes: {
      'by-profile': string;
      'by-date': string;
      'by-profile-date': [string, string];
    };
  };
}

let dbInstance: IDBPDatabase<FitOSDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<FitOSDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<FitOSDB>('fitos-db', 3, {
    upgrade(db) {
      if (db.objectStoreNames.contains('workoutSessions')) {
        // v1 stores already exist, just add new ones below
      } else {
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
      }

      if (!db.objectStoreNames.contains('checkIns')) {
        const checkInStore = db.createObjectStore('checkIns', { keyPath: 'id' });
        checkInStore.createIndex('by-profile', 'profileId');
        checkInStore.createIndex('by-date', 'date');
        checkInStore.createIndex('by-profile-date', ['profileId', 'date']);
      }

      if (!db.objectStoreNames.contains('steps')) {
        const stepStore = db.createObjectStore('steps', { keyPath: 'id' });
        stepStore.createIndex('by-profile', 'profileId');
        stepStore.createIndex('by-date', 'date');
        stepStore.createIndex('by-profile-date', ['profileId', 'date']);
      }
    },
  });

  return dbInstance;
}
