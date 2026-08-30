import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkoutSession, SetLog, Exercise, ExerciseLastPerformance, CardioEntry } from '../types';
import { toSessionExercises } from '../utils/workoutLibrary';
import { saveWorkoutSession, getSessionsByProfile, deleteWorkoutSession, freezeSessionExercises } from '../db/workouts';
import { getAllPrograms, initializePrograms } from '../db/programs';
import { today } from '../utils/dateHelpers';
import type { Program } from '../types';

const ACTIVE_SESSION_KEY = 'fitos-active-workout';
const ACTIVE_INPUTS_KEY = 'fitos-active-workout-inputs';

// In-progress set entries parked in localStorage so a reload mid-workout doesn't lose them.
// Everything past weight/reps/effort is optional because older saved sessions predate it.
export interface PersistedSetInput {
  weight: string;
  reps: string;
  effort: string;
  duration?: string;
  setType?: string;
  isWarmup?: boolean;
}

export function saveWorkoutInputs(inputs: Record<string, PersistedSetInput[]>) {
  localStorage.setItem(ACTIVE_INPUTS_KEY, JSON.stringify(inputs));
}

export function loadWorkoutInputs(): Record<string, PersistedSetInput[]> | null {
  try {
    const raw = localStorage.getItem(ACTIVE_INPUTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearWorkoutInputs() {
  localStorage.removeItem(ACTIVE_INPUTS_KEY);
}

// The backfill scans every session, so it runs once per app load rather than on every
// library refresh. It is idempotent, so a repeat would be harmless — just wasteful.
let backfillDone = false;

function loadPersistedSession(): WorkoutSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistSession(session: WorkoutSession | null) {
  if (session) localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function useWorkout(profileId: string | null) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(() => loadPersistedSession());
  const [loading, setLoading] = useState(true);

  // Only the first load for a given profile is allowed to raise `loading`. Callers reload
  // this data mid-workout — saving a session to the library, a permanent exercise swap,
  // applying a progression — and flipping the page into its loading state would unmount
  // the active workout, taking its unsaved local state (added exercises, skips, cardio
  // entries) with it.
  const loadedProfileRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profileId) return;
    if (loadedProfileRef.current !== profileId) setLoading(true);
    await initializePrograms();
    const progs = await getAllPrograms();

    // One-time repair for sessions logged before they carried their own exercise list.
    // Running it here means the names are frozen into history before the user can reach
    // the editor and change the library out from under them.
    if (!backfillDone) {
      backfillDone = true;
      try {
        await freezeSessionExercises(progs);
      } catch (err) {
        // History still renders from the library if this fails; don't block the app.
        console.error('Could not backfill session exercise names:', err);
      }
    }

    const sess = await getSessionsByProfile(profileId);
    setPrograms(progs);
    setSessions(sess.sort((a, b) => b.startTime - a.startTime));
    loadedProfileRef.current = profileId;
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Persist active session to survive tab switches and refreshes
  useEffect(() => {
    persistSession(activeSession);
  }, [activeSession]);

  const startWorkout = useCallback(
    (programId: string, dayId: string): WorkoutSession => {
      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        profileId: profileId!,
        programId,
        dayId,
        date: today(),
        startTime: Date.now(),
        sets: {},
      };
      setActiveSession(session);
      return session;
    },
    [profileId]
  );

  const logSet = useCallback(
    (exerciseId: string, set: SetLog) => {
      if (!activeSession) return;
      setActiveSession((prev) => {
        if (!prev) return prev;
        const existing = prev.sets[exerciseId] || [];
        return {
          ...prev,
          sets: { ...prev.sets, [exerciseId]: [...existing, set] },
        };
      });
    },
    [activeSession]
  );

  const updateSet = useCallback(
    (exerciseId: string, setIndex: number, updates: Partial<SetLog>) => {
      if (!activeSession) return;
      setActiveSession((prev) => {
        if (!prev) return prev;
        const existing = [...(prev.sets[exerciseId] || [])];
        existing[setIndex] = { ...existing[setIndex], ...updates };
        return { ...prev, sets: { ...prev.sets, [exerciseId]: existing } };
      });
    },
    [activeSession]
  );

  const removeExerciseFromSession = useCallback((exerciseId: string) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const { [exerciseId]: _removed, ...rest } = prev.sets;
      return { ...prev, sets: rest };
    });
  }, []);

  const updateCardio = useCallback(
    (cardio: CardioEntry[]) => {
      if (!activeSession) return;
      setActiveSession((prev) => prev ? { ...prev, cardio } : prev);
    },
    [activeSession]
  );

  const updateActiveSessionName = useCallback((name: string) => {
    setActiveSession((prev) => prev ? { ...prev, name: name.trim() || undefined } : prev);
  }, []);

  /**
   * `exercises` is what the session actually contained, mid-session additions and swaps
   * included. It is stored on the session so the lifts stay attributable even when they
   * belong to no library entry, or the entry is edited or deleted later.
   */
  const finishWorkout = useCallback(async (exercises: Exercise[] = []): Promise<WorkoutSession | null> => {
    if (!activeSession) return null;
    const manifest = toSessionExercises(exercises);
    const finished: WorkoutSession = {
      ...activeSession,
      endTime: Date.now(),
      ...(manifest.length > 0 ? { exercises: manifest } : {}),
    };
    await saveWorkoutSession(finished);
    setSessions((prev) => [finished, ...prev]);
    setActiveSession(null);
    clearWorkoutInputs();
    return finished;
  }, [activeSession]);

  const cancelWorkout = useCallback(() => {
    setActiveSession(null);
    clearWorkoutInputs();
  }, []);

  const skipWorkout = useCallback(
    async (programId: string, dayId: string): Promise<WorkoutSession> => {
      const now = Date.now();
      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        profileId: profileId!,
        programId,
        dayId,
        date: today(),
        startTime: now,
        endTime: now,
        sets: {},
        status: 'skipped',
      };
      await saveWorkoutSession(session);
      setSessions((prev) => [session, ...prev]);
      return session;
    },
    [profileId]
  );

  const removeSession = useCallback(async (sessionId: string) => {
    await deleteWorkoutSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const updateSession = useCallback(async (session: WorkoutSession) => {
    await saveWorkoutSession(session);
    setSessions((prev) => prev.map((s) => s.id === session.id ? session : s));
  }, []);

  const getPreviousSession = useCallback(
    (programId: string, dayId: string): WorkoutSession | undefined => {
      return sessions.find((s) => s.programId === programId && s.dayId === dayId && s.status !== 'skipped');
    },
    [sessions]
  );

  const getLastPerformanceMap = useCallback(
    (dayExercises: Exercise[]): Record<string, ExerciseLastPerformance> => {
      // Names come from the library and from each session's own manifest, so a lift done
      // freestyle still shows its last numbers the next time it comes up.
      const idToName: Record<string, string> = {};
      for (const session of sessions) {
        for (const ex of session.exercises || []) {
          if (ex.name.trim()) idToName[ex.id] = ex.name.toLowerCase().trim();
        }
      }
      for (const program of programs) {
        for (const day of program.days) {
          for (const ex of day.exercises) {
            if (ex.name.trim()) idToName[ex.id] = ex.name.toLowerCase().trim();
          }
        }
      }

      const targetNames = new Set(
        dayExercises.map((e) => e.name.toLowerCase().trim()).filter((n) => n.length > 0)
      );
      const result: Record<string, ExerciseLastPerformance> = {};
      const found = new Set<string>();

      for (const session of sessions) {
        if (found.size === targetNames.size) break;
        if (session.status === 'skipped') continue;
        for (const [exId, setLogs] of Object.entries(session.sets)) {
          const name = idToName[exId];
          if (name && targetNames.has(name) && !found.has(name)) {
            const completed = setLogs.filter((s) => s.completed);
            if (completed.length > 0) {
              result[name] = { sets: completed, date: session.date };
              found.add(name);
            }
          }
        }
      }

      return result;
    },
    [programs, sessions]
  );

  return {
    programs,
    sessions,
    activeSession,
    loading,
    startWorkout,
    logSet,
    updateSet,
    removeExerciseFromSession,
    updateCardio,
    updateActiveSessionName,
    finishWorkout,
    cancelWorkout,
    skipWorkout,
    removeSession,
    updateSession,
    getPreviousSession,
    getLastPerformanceMap,
    refreshPrograms: loadData,
  };
}
