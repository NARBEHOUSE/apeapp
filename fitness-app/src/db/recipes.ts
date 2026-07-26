export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  id: string;
  profileId: string;
  name: string;
  emoji: string;
  description: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  createdAt: string;
  updatedAt: string;
}

function getStorageKey(profileId: string): string {
  return `fitos-recipes-${profileId}`;
}

function loadRecipes(profileId: string): Recipe[] {
  try {
    const raw = localStorage.getItem(getStorageKey(profileId));
    if (!raw) return [];
    return JSON.parse(raw) as Recipe[];
  } catch {
    return [];
  }
}

function persistRecipes(profileId: string, recipes: Recipe[]): void {
  localStorage.setItem(getStorageKey(profileId), JSON.stringify(recipes));
}

export function getRecipes(profileId: string): Recipe[] {
  return loadRecipes(profileId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getRecipe(profileId: string, recipeId: string): Recipe | undefined {
  return loadRecipes(profileId).find((r) => r.id === recipeId);
}

export function saveRecipe(profileId: string, recipe: Omit<Recipe, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>): Recipe {
  const recipes = loadRecipes(profileId);
  const now = new Date().toISOString();
  const newRecipe: Recipe = { ...recipe, id: crypto.randomUUID(), profileId, createdAt: now, updatedAt: now };
  recipes.push(newRecipe);
  persistRecipes(profileId, recipes);
  return newRecipe;
}

export function updateRecipe(profileId: string, recipe: Recipe): void {
  const recipes = loadRecipes(profileId);
  const idx = recipes.findIndex((r) => r.id === recipe.id);
  if (idx >= 0) {
    recipes[idx] = { ...recipe, updatedAt: new Date().toISOString() };
    persistRecipes(profileId, recipes);
  }
}

export function deleteRecipe(profileId: string, recipeId: string): void {
  const recipes = loadRecipes(profileId).filter((r) => r.id !== recipeId);
  persistRecipes(profileId, recipes);
}

export function recipePerServing(recipe: Recipe) {
  const s = recipe.servings || 1;
  return {
    calories: Math.round(recipe.totalCalories / s),
    protein: Math.round((recipe.totalProtein / s) * 10) / 10,
    carbs: Math.round((recipe.totalCarbs / s) * 10) / 10,
    fat: Math.round((recipe.totalFat / s) * 10) / 10,
    fiber: Math.round((recipe.totalFiber / s) * 10) / 10,
  };
}
