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
  frequency: number;
  lastUsed: string;
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
    // Update macros in case they changed
    foods[existingIndex].calories = food.calories;
    foods[existingIndex].protein = food.protein;
    foods[existingIndex].carbs = food.carbs;
    foods[existingIndex].fat = food.fat;
    foods[existingIndex].fiber = food.fiber;
    foods[existingIndex].servingSize = food.servingSize;
    foods[existingIndex].servingUnit = food.servingUnit;
    foods[existingIndex].source = food.source;
    if (food.brand !== undefined) foods[existingIndex].brand = food.brand;
    if (food.fdcId !== undefined) foods[existingIndex].fdcId = food.fdcId;
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
