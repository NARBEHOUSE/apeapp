import type { MealIngredient } from '../types';

export function scaledIngredient(ing: MealIngredient) {
  const factor = ing.amount / (ing.servingSize || 1);
  return {
    cal: Math.round(ing.calories * factor),
    p: Math.round(ing.protein * factor * 10) / 10,
    c: Math.round(ing.carbs * factor * 10) / 10,
    f: Math.round(ing.fat * factor * 10) / 10,
    fiber: ing.fiber ? Math.round(ing.fiber * factor * 10) / 10 : 0,
  };
}

export function sumIngredients(ingredients: MealIngredient[]) {
  return ingredients.reduce((acc, ing) => {
    const e = scaledIngredient(ing);
    return { cal: acc.cal + e.cal, p: acc.p + e.p, c: acc.c + e.c, f: acc.f + e.f, fiber: acc.fiber + e.fiber };
  }, { cal: 0, p: 0, c: 0, f: 0, fiber: 0 });
}
