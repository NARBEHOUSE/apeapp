import { useState, useEffect, useCallback } from 'react';
import type { Profile, BodyStats } from '../types';
import { calculateMacros, calculateTDEE } from '../utils/tdee';

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

      const profile: Profile = {
        id: crypto.randomUUID(),
        name,
        goal,
        startDate: new Date().toISOString().split('T')[0],
        avatarColor: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
        units: 'imperial',
        macroTargets,
        restTimerDuration: 90,
        measurementUnit: 'in',
        bodyStats,
        tdee,
        calorieAdjustments: [],
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
    (id: string, updates: Partial<Profile>) => {
      const updated = profiles.map((p) => (p.id === id ? { ...p, ...updates } : p));
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
    deleteProfile,
    logout,
    refreshProfiles,
  };
}
