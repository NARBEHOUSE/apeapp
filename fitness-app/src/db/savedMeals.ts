export interface MealIngredient {
  name: string;
  brand?: string;
  servingSize: number;   // base serving size (e.g. 100)
  servingUnit: string;   // base unit (e.g. 'g')
  calories: number;      // macros per base serving
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  amount: number;        // how much used (in servingUnit)
}

export interface SavedMeal {
  id: string;
  profileId: string;
  name: string;
  emoji: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  ingredients?: MealIngredient[];
  createdAt: string;
}

function getStorageKey(profileId: string): string {
  return `fitos-saved-meals-${profileId}`;
}

function loadMeals(profileId: string): SavedMeal[] {
  try {
    const raw = localStorage.getItem(getStorageKey(profileId));
    if (!raw) return [];
    return JSON.parse(raw) as SavedMeal[];
  } catch {
    return [];
  }
}

function persistMeals(profileId: string, meals: SavedMeal[]): void {
  localStorage.setItem(getStorageKey(profileId), JSON.stringify(meals));
}

export function getSavedMeals(profileId: string): SavedMeal[] {
  return loadMeals(profileId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addSavedMeal(profileId: string, meal: Omit<SavedMeal, 'id' | 'profileId' | 'createdAt'>): SavedMeal {
  const meals = loadMeals(profileId);
  const newMeal: SavedMeal = {
    ...meal,
    id: crypto.randomUUID(),
    profileId,
    createdAt: new Date().toISOString(),
  };
  meals.push(newMeal);
  persistMeals(profileId, meals);
  return newMeal;
}

export function deleteSavedMeal(profileId: string, mealId: string): void {
  const meals = loadMeals(profileId).filter((m) => m.id !== mealId);
  persistMeals(profileId, meals);
}

export function updateSavedMeal(profileId: string, meal: SavedMeal): void {
  const meals = loadMeals(profileId);
  const idx = meals.findIndex((m) => m.id === meal.id);
  if (idx >= 0) meals[idx] = meal;
  persistMeals(profileId, meals);
}
