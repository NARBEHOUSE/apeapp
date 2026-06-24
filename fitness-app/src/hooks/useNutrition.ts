import { useState, useEffect, useCallback } from 'react';
import type { FoodEntry } from '../types';
import { saveFoodEntry, getFoodEntriesByDate, getFoodEntriesByProfile, deleteFoodEntry as dbDelete } from '../db/nutrition';
import { saveFoodToHistory } from '../db/foodHistory';
import { today } from '../utils/dateHelpers';

export function useNutrition(profileId: string | null) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [allFavorites, setAllFavorites] = useState<FoodEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const data = await getFoodEntriesByDate(profileId, selectedDate);
    setEntries(data.sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()));
    setLoading(false);
  }, [profileId, selectedDate]);

  const loadFavorites = useCallback(async () => {
    if (!profileId) return;
    const all = await getFoodEntriesByProfile(profileId);
    const favs = all.filter((e) => e.isFavorite).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    // Deduplicate: one entry per unique food (fdcId wins, then name+brand)
    const seen = new Map<string, FoodEntry>();
    for (const f of favs) {
      const key = f.fdcId ? `fdc:${f.fdcId}` : `${f.name}|${f.brand || ''}`;
      if (!seen.has(key)) seen.set(key, f);
    }
    setAllFavorites([...seen.values()]);
  }, [profileId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const addEntry = useCallback(
    async (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'> & { loggedAt?: string }) => {
      if (!profileId) return;
      const entryKey = entry.fdcId ? `fdc:${entry.fdcId}` : `${entry.name}|${entry.brand || ''}`;
      const isFavoritedElsewhere = allFavorites.some((f) => {
        const fKey = f.fdcId ? `fdc:${f.fdcId}` : `${f.name}|${f.brand || ''}`;
        return fKey === entryKey;
      });
      const full: FoodEntry = {
        ...entry,
        id: crypto.randomUUID(),
        profileId,
        loggedAt: entry.loggedAt || new Date().toISOString(),
        isFavorite: entry.isFavorite ?? isFavoritedElsewhere,
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
    [profileId, selectedDate, loadEntries, allFavorites]
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
      if (!entry || !profileId) return;
      const newValue = !entry.isFavorite;
      const entryKey = entry.fdcId ? `fdc:${entry.fdcId}` : `${entry.name}|${entry.brand || ''}`;
      const all = await getFoodEntriesByProfile(profileId);
      for (const e of all) {
        const eKey = e.fdcId ? `fdc:${e.fdcId}` : `${e.name}|${e.brand || ''}`;
        if (eKey === entryKey) {
          await saveFoodEntry({ ...e, isFavorite: newValue });
        }
      }
      await loadEntries();
      await loadFavorites();
    },
    [entries, loadEntries, loadFavorites, profileId]
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
    allFavorites,
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
