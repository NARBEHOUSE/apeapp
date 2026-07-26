import { useState, useEffect, useCallback } from 'react';
import type { Profile, BodyStats, MacroTargetHistoryEntry } from '../types';
import { calculateMacros, calculateTDEE } from '../utils/tdee';
import { getMacroTargetsForDate } from '../utils/macroTargetHistory';

const PROFILES_KEY = 'fitos-profiles';
const ACTIVE_KEY = 'fitos-active-profile';

const AVATAR_COLORS = ['#e8572a', '#5b6ef5', '#2e9e6b', '#c44fc4', '#f5a623'];

export function useProfile() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) setProfiles(JSON.parse(stored));
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active) setActiveProfileId(active);
  }, []);

  const persist = useCallback((updated: Profile[]) => {
    setProfiles(updated);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  const createProfile = useCallback(
    (name: string, goal: string, bodyStats?: BodyStats, customMacros?: { calories: number; protein: number; carbs: number; fat: number }, googleEmail?: string, birthday?: string) => {
      if (profiles.length >= 5) return null;

      let macroTargets = customMacros || { calories: 2500, protein: 180, carbs: 250, fat: 80 };
      let tdee: number | undefined;

      if (!customMacros && bodyStats && bodyStats.weightKg > 0 && bodyStats.heightCm > 0 && bodyStats.age > 0) {
        try {
          macroTargets = calculateMacros(bodyStats);
          tdee = calculateTDEE(bodyStats);
        } catch {
          // Fall back to defaults
        }
      }

      const startDate = new Date().toISOString().split('T')[0];
      const profile: Profile = {
        id: crypto.randomUUID(),
        name,
        goal,
        startDate,
        avatarColor: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
        units: 'imperial',
        macroTargets,
        restTimerDuration: 90,
        measurementUnit: 'in',
        bodyStats,
        tdee,
        calorieAdjustments: [],
        macroTargetHistory: [{ date: startDate, macroTargets, fitnessGoal: bodyStats?.fitnessGoal }],
        googleEmail,
        birthday,
      };
      const updated = [...profiles, profile];
      persist(updated);
      setActiveProfileId(profile.id);
      localStorage.setItem(ACTIVE_KEY, profile.id);
      return profile;
    },
    [profiles, persist]
  );

  const selectProfile = useCallback((id: string) => {
    setActiveProfileId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const updateProfile = useCallback(
    (id: string, updates: Partial<Profile>, options?: { macroTargetEffectiveDate?: string }) => {
      const updated = profiles.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...updates };

        // Track macro target changes over time so history views can show a day
        // against the target that was actually active then, not today's target.
        if (updates.macroTargets) {
          const prev = p.macroTargets;
          const changed = !prev
            || prev.calories !== updates.macroTargets.calories
            || prev.protein !== updates.macroTargets.protein
            || prev.carbs !== updates.macroTargets.carbs
            || prev.fat !== updates.macroTargets.fat;
          if (changed) {
            // Defaults to today, but callers can backdate exactly when a change
            // actually took effect (e.g. "I actually switched 3 weeks ago").
            const effectiveDate = options?.macroTargetEffectiveDate || new Date().toISOString().split('T')[0];
            const existingHistory = p.macroTargetHistory || [];
            const history = existingHistory.filter((h) => h.date !== effectiveDate);
            // Backfill one entry for whatever was in effect before, dated at profile
            // creation, only the very first time this profile ever gets any tracked
            // history — checked against the array as it was before removing this
            // date's entry, so a same-day re-edit doesn't re-trigger this and
            // misattribute the outgoing value to the whole time since creation.
            if (existingHistory.length === 0 && prev) {
              history.push({ date: p.startDate, macroTargets: prev, fitnessGoal: p.bodyStats?.fitnessGoal });
            }
            history.push({
              date: effectiveDate,
              macroTargets: updates.macroTargets,
              fitnessGoal: (updates.bodyStats ?? p.bodyStats)?.fitnessGoal,
            });
            next.macroTargetHistory = history;
          }
        }

        return next;
      });
      persist(updated);
    },
    [profiles, persist]
  );

  // Directly replace a profile's whole macro-target history (add/edit/delete a
  // dated phase from a history-management UI) rather than appending a new "as of
  // today" change. Keeps `macroTargets` (the current-value cache lots of views
  // read directly) in sync with whatever the history says applies as of today.
  const setMacroTargetHistory = useCallback(
    (id: string, history: MacroTargetHistoryEntry[]) => {
      const updated = profiles.map((p) => {
        if (p.id !== id) return p;
        const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
        const todayStr = new Date().toISOString().split('T')[0];
        const next: Profile = { ...p, macroTargetHistory: sorted };
        const currentEntry = getMacroTargetsForDate(next, todayStr);
        next.macroTargets = currentEntry;
        return next;
      });
      persist(updated);
    },
    [profiles, persist]
  );

  const deleteProfile = useCallback(
    (id: string) => {
      const updated = profiles.filter((p) => p.id !== id);
      persist(updated);
      if (activeProfileId === id) {
        const next = updated[0]?.id || null;
        setActiveProfileId(next);
        if (next) localStorage.setItem(ACTIVE_KEY, next);
        else localStorage.removeItem(ACTIVE_KEY);
      }
    },
    [profiles, activeProfileId, persist]
  );

  const logout = useCallback(() => {
    setActiveProfileId(null);
    localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const refreshProfiles = useCallback(() => {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) setProfiles(JSON.parse(stored));
  }, []);

  return {
    profiles,
    activeProfile,
    activeProfileId,
    createProfile,
    selectProfile,
    updateProfile,
    setMacroTargetHistory,
    deleteProfile,
    logout,
    refreshProfiles,
  };
}
