export interface MealPlanEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  servingsConsumed: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface MealPlan {
  id: string;
  profileId: string;
  name: string;
  entries: MealPlanEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  createdAt: string;
}

function getStorageKey(profileId: string): string {
  return `fitos-meal-plans-${profileId}`;
}

function loadPlans(profileId: string): MealPlan[] {
  try {
    const raw = localStorage.getItem(getStorageKey(profileId));
    if (!raw) return [];
    return JSON.parse(raw) as MealPlan[];
  } catch { return []; }
}

function persistPlans(profileId: string, plans: MealPlan[]): void {
  localStorage.setItem(getStorageKey(profileId), JSON.stringify(plans));
}

export function getMealPlans(profileId: string): MealPlan[] {
  return loadPlans(profileId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveMealPlan(profileId: string, plan: Omit<MealPlan, 'id' | 'profileId' | 'createdAt'>): MealPlan {
  const plans = loadPlans(profileId);
  const newPlan: MealPlan = { ...plan, id: crypto.randomUUID(), profileId, createdAt: new Date().toISOString() };
  plans.push(newPlan);
  persistPlans(profileId, plans);
  return newPlan;
}

export function deleteMealPlan(profileId: string, planId: string): void {
  const plans = loadPlans(profileId).filter((p) => p.id !== planId);
  persistPlans(profileId, plans);
}
