import { useState, useEffect, useCallback } from 'react';
import type { FoodEntry } from '../types';
import { saveFoodEntry, getFoodEntriesByDate, getFoodEntriesByProfile, deleteFoodEntry as dbDelete } from '../db/nutrition';
import { saveFoodToHistory } from '../db/foodHistory';
import { today } from '../utils/dateHelpers';

export function useNutrition(profileId: string | null) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const data = await getFoodEntriesByDate(profileId, selectedDate);
    setEntries(data.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)));
    setLoading(false);
  }, [profileId, selectedDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const addEntry = useCallback(
    async (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'> & { loggedAt?: string }) => {
      if (!profileId) return;
      const full: FoodEntry = {
        ...entry,
        id: crypto.randomUUID(),
        profileId,
        date: selectedDate,
        loggedAt: entry.loggedAt || new Date().toISOString(),
      };
      await saveFoodEntry(full);
      saveFoodToHistory(profileId, {
        name: entry.name,
        brand: entry.brand,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        fiber: entry.fiber,
        servingSize: entry.servingSize,
        servingUnit: entry.servingUnit,
        source: entry.source,
        fdcId: entry.fdcId,
      });
      await loadEntries();
    },
    [profileId, selectedDate, loadEntries]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await dbDelete(id);
      await loadEntries();
    },
    [loadEntries]
  );

  const updateEntryTime = useCallback(
    async (id: string, newLoggedAt: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await saveFoodEntry({ ...entry, loggedAt: newLoggedAt });
      await loadEntries();
    },
    [entries, loadEntries]
  );

  const updateEntry = useCallback(
    async (id: string, updates: Partial<FoodEntry>) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await saveFoodEntry({ ...entry, ...updates });
      await loadEntries();
    },
    [entries, loadEntries]
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await saveFoodEntry({ ...entry, isFavorite: !entry.isFavorite });
      await loadEntries();
    },
    [entries, loadEntries]
  );

  const copyYesterday = useCallback(async () => {
    if (!profileId) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayEntries = await getFoodEntriesByDate(profileId, yesterdayStr);
    for (const entry of yesterdayEntries) {
      const copy: FoodEntry = {
        ...entry,
        id: crypto.randomUUID(),
        date: selectedDate,
        loggedAt: new Date().toISOString(),
      };
      await saveFoodEntry(copy);
    }
    await loadEntries();
  }, [profileId, selectedDate, loadEntries]);

  const getTodayTotals = useCallback(() => {
    return entries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories * e.servingsConsumed,
        protein: acc.protein + e.protein * e.servingsConsumed,
        carbs: acc.carbs + e.carbs * e.servingsConsumed,
        fat: acc.fat + e.fat * e.servingsConsumed,
        fiber: acc.fiber + (e.fiber || 0) * e.servingsConsumed,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [entries]);

  const getAllEntries = useCallback(async (): Promise<FoodEntry[]> => {
    if (!profileId) return [];
    return getFoodEntriesByProfile(profileId);
  }, [profileId]);

  return {
    entries,
    selectedDate,
    setSelectedDate,
    loading,
    addEntry,
    deleteEntry,
    updateEntry,
    updateEntryTime,
    toggleFavorite,
    copyYesterday,
    getTodayTotals,
    getAllEntries,
    refreshEntries: loadEntries,
  };
}
