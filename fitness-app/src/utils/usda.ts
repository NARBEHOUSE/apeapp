const PROXY_URL = 'https://falling-cloud-a632.narbehousellc.workers.dev';

interface USDAFood {
  fdcId: number;
  description: string;
  brandName?: string;
  foodNutrients: { nutrientId: number; value: number }[];
}

export interface ParsedFood {
  fdcId: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}

const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
};

function getNutrientValue(nutrients: { nutrientId: number; value: number }[], id: number): number {
  return nutrients.find((n) => n.nutrientId === id)?.value ?? 0;
}

function parseFoods(foods: USDAFood[]): ParsedFood[] {
  return foods.map((food) => ({
    fdcId: String(food.fdcId),
    name: food.description,
    brand: food.brandName,
    caloriesPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.calories)),
    proteinPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.protein) * 10) / 10,
    carbsPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.carbs) * 10) / 10,
    fatPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.fat) * 10) / 10,
    fiberPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.fiber) * 10) / 10,
  }));
}

export async function searchFoods(query: string): Promise<ParsedFood[]> {
  const res = await fetch(`${PROXY_URL}/search?query=${encodeURIComponent(query)}&pageSize=10`);
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const data = await res.json();
  return parseFoods(data.foods || []);
}

export async function lookupBarcode(upc: string): Promise<ParsedFood | null> {
  const res = await fetch(`${PROXY_URL}/barcode?upc=${encodeURIComponent(upc)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const foods = data.foods as USDAFood[] | undefined;
  if (!foods || foods.length === 0) return null;
  return parseFoods([foods[0]])[0];
}
