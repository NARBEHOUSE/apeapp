export interface SavedFood {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  source: 'manual' | 'usda' | 'ai_vision' | 'builtin';
  fdcId?: string;
  barcode?: string;
  emoji?: string;
  frequency: number;
  lastUsed: string;
}

export function getCustomEmoji(profileId: string, foodName: string): string | undefined {
  return loadFoods(profileId).find((f) => f.name.toLowerCase() === foodName.toLowerCase())?.emoji;
}

export function lookupByBarcode(profileId: string, barcode: string): SavedFood | undefined {
  return loadFoods(profileId).find((f) => f.barcode === barcode);
}

function getStorageKey(profileId: string): string {
  return `fitos-food-history-${profileId}`;
}

function loadFoods(profileId: string): SavedFood[] {
  try {
    const raw = localStorage.getItem(getStorageKey(profileId));
    if (!raw) return [];
    return JSON.parse(raw) as SavedFood[];
  } catch {
    return [];
  }
}

function persistFoods(profileId: string, foods: SavedFood[]): void {
  localStorage.setItem(getStorageKey(profileId), JSON.stringify(foods));
}

export function getSavedFoods(profileId: string): SavedFood[] {
  return loadFoods(profileId).sort((a, b) => b.frequency - a.frequency);
}

export function saveFoodToHistory(
  profileId: string,
  food: Omit<SavedFood, 'frequency' | 'lastUsed'>
): void {
  const foods = loadFoods(profileId);
  const normalizedName = food.name.trim().toLowerCase();
  const existingIndex = foods.findIndex(
    (f) => f.name.trim().toLowerCase() === normalizedName
  );

  if (existingIndex >= 0) {
    foods[existingIndex].frequency += 1;
    foods[existingIndex].lastUsed = new Date().toISOString();
    // Only update macros if new data has non-zero values (don't overwrite real data with zeros)
    const hasNewMacros = food.calories > 0 || food.protein > 0 || food.carbs > 0 || food.fat > 0;
    if (hasNewMacros) {
      foods[existingIndex].calories = food.calories;
      foods[existingIndex].protein = food.protein;
      foods[existingIndex].carbs = food.carbs;
      foods[existingIndex].fat = food.fat;
      foods[existingIndex].fiber = food.fiber;
      foods[existingIndex].servingSize = food.servingSize;
      foods[existingIndex].servingUnit = food.servingUnit;
    }
    foods[existingIndex].source = food.source;
    if (food.brand !== undefined) foods[existingIndex].brand = food.brand;
    if (food.fdcId !== undefined) foods[existingIndex].fdcId = food.fdcId;
    if (food.barcode) foods[existingIndex].barcode = food.barcode;
    if (food.emoji) foods[existingIndex].emoji = food.emoji;
  } else {
    foods.push({
      ...food,
      frequency: 1,
      lastUsed: new Date().toISOString(),
    });
  }

  persistFoods(profileId, foods);
}

export function getFrequentFoods(
  profileId: string,
  limit: number = 20
): SavedFood[] {
  return getSavedFoods(profileId).slice(0, limit);
}

export async function updateSavedFood(profileId: string, name: string, updates: Partial<Omit<SavedFood, 'frequency' | 'lastUsed'>>): Promise<void> {
  const foods = loadFoods(profileId);
  const idx = foods.findIndex((f) => f.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    foods[idx] = { ...foods[idx], ...updates };
    persistFoods(profileId, foods);

    // Retroactive update: sync all tracked food entries with updated macros
    const updatedFood = foods[idx];
    const hasMacroChange = updates.calories != null || updates.protein != null || updates.carbs != null || updates.fat != null || updates.fiber !== undefined || updates.servingSize != null;
    if (hasMacroChange) {
      const { getDB } = await import('./index');
      const db = await getDB();
      const allEntries = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
      const nameLower = name.toLowerCase();
      for (const entry of allEntries) {
        if (entry.name.toLowerCase() !== nameLower) continue;
        const baseServing = updatedFood.servingSize || 1;
        const entryServing = entry.servingSize || baseServing;
        const factor = entryServing / baseServing;
        await db.put('foodEntries', {
          ...entry,
          calories: Math.round(updatedFood.calories * factor),
          protein: Math.round(updatedFood.protein * factor * 10) / 10,
          carbs: Math.round(updatedFood.carbs * factor * 10) / 10,
          fat: Math.round(updatedFood.fat * factor * 10) / 10,
          fiber: updatedFood.fiber ? Math.round(updatedFood.fiber * factor * 10) / 10 : entry.fiber,
        });
      }
    }
  }
}

export function deleteSavedFood(profileId: string, name: string): void {
  const foods = loadFoods(profileId).filter((f) => f.name.toLowerCase() !== name.toLowerCase());
  persistFoods(profileId, foods);
}

export function searchSavedFoods(
  profileId: string,
  query: string
): SavedFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return getSavedFoods(profileId);

  const words = q.split(/\s+/);

  return getSavedFoods(profileId).filter((food) => {
    const name = food.name.toLowerCase();
    const brand = (food.brand || '').toLowerCase();
    const target = `${name} ${brand}`;
    return words.every((word) => target.includes(word));
  });
}
