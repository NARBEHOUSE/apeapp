interface USDAFood {
  fdcId: number;
  description: string;
  brandName?: string;
  foodNutrients: { nutrientId: number; value: number }[];
}

interface ParsedFood {
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

export async function searchFoods(query: string, apiKey: string): Promise<ParsedFood[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=10&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA API error: ${res.status}`);
  const data = await res.json();

  return (data.foods as USDAFood[]).map((food) => ({
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

export async function lookupBarcode(upc: string, apiKey: string): Promise<ParsedFood | null> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(upc)}&dataType=Branded&pageSize=3&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const foods = data.foods as USDAFood[] | undefined;
  if (!foods || foods.length === 0) return null;

  const food = foods[0];
  return {
    fdcId: String(food.fdcId),
    name: food.description,
    brand: food.brandName,
    caloriesPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.calories)),
    proteinPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.protein) * 10) / 10,
    carbsPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.carbs) * 10) / 10,
    fatPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.fat) * 10) / 10,
    fiberPer100g: Math.round(getNutrientValue(food.foodNutrients, NUTRIENT_IDS.fiber) * 10) / 10,
  };
}

export async function testUSDAKey(apiKey: string): Promise<boolean> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=chicken&pageSize=1&api_key=${apiKey}`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}
