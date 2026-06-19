import { useState, useEffect, useCallback } from 'react';
import type { WorkoutSession, SetLog, Exercise, ExerciseLastPerformance } from '../types';
import { saveWorkoutSession, getSessionsByProfile } from '../db/workouts';
import { getAllPrograms, initializePrograms } from '../db/programs';
import type { Program } from '../types';

export function useWorkout(profileId: string | null) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    await initializePrograms();
    const [progs, sess] = await Promise.all([
      getAllPrograms(),
      getSessionsByProfile(profileId),
    ]);
    setPrograms(progs);
    setSessions(sess.sort((a, b) => b.startTime - a.startTime));
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startWorkout = useCallback(
    (programId: string, dayId: string): WorkoutSession => {
      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        profileId: profileId!,
        programId,
        dayId,
        date: new Date().toISOString().split('T')[0],
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

  const finishWorkout = useCallback(async (): Promise<WorkoutSession | null> => {
    if (!activeSession) return null;
    const finished = { ...activeSession, endTime: Date.now() };
    await saveWorkoutSession(finished);
    setSessions((prev) => [finished, ...prev]);
    setActiveSession(null);
    return finished;
  }, [activeSession]);

  const cancelWorkout = useCallback(() => {
    setActiveSession(null);
  }, []);

  const getPreviousSession = useCallback(
    (programId: string, dayId: string): WorkoutSession | undefined => {
      return sessions.find((s) => s.programId === programId && s.dayId === dayId);
    },
    [sessions]
  );

  const getLastPerformanceMap = useCallback(
    (dayExercises: Exercise[]): Record<string, ExerciseLastPerformance> => {
      const idToName: Record<string, string> = {};
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
    finishWorkout,
    cancelWorkout,
    getPreviousSession,
    getLastPerformanceMap,
    refreshPrograms: loadData,
  };
}
