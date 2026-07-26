import { useState, useMemo } from 'react';
import type { SavedMeal } from '../../db/savedMeals';
import type { MealIngredient } from '../../types';
import { getFoodEmoji } from '../../utils/foodEmoji';
import { sumIngredients } from '../../utils/mealIngredients';
import { IngredientEditor } from './IngredientEditor';

interface Props {
  profileId: string;
  onSave: (meal: Omit<SavedMeal, 'id' | 'profileId' | 'createdAt'>, ingredients: MealIngredient[]) => void;
  onAddToLog: (ingredients: MealIngredient[]) => void;
  onClose: () => void;
  existingMeal?: SavedMeal;
}

export function MealBuilder({ profileId, onSave, onAddToLog, onClose, existingMeal }: Props) {
  const [name, setName] = useState(existingMeal?.name || '');
  const [ingredients, setIngredients] = useState<MealIngredient[]>(existingMeal?.ingredients || []);

  const totals = useMemo(() => sumIngredients(ingredients), [ingredients]);

  function handleSave() {
    if (!name.trim() || ingredients.length === 0) return;
    const totalGrams = ingredients
      .filter((i) => i.servingUnit === 'g')
      .reduce((s, i) => s + i.amount, 0);
    onSave({
      name: name.trim(),
      emoji: getFoodEmoji(name),
      calories: totals.cal,
      protein: totals.p,
      carbs: totals.c,
      fat: totals.f,
      servingSize: totalGrams || ingredients.reduce((s, i) => s + i.amount, 0),
      servingUnit: totalGrams ? 'g' : ingredients[0]?.servingUnit || 'serving',
      ingredients,
    }, ingredients);
  }

  const canSave = name.trim().length > 0 && ingredients.length > 0;

  return (
    <div className="space-y-4">
      {/* Meal name */}
      <div>
        <label className="label mb-1 block">Meal Name</label>
        <input
          className="input-field text-sm"
          placeholder="e.g. Morning Porridge, Post-Workout…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      {/* Ingredients */}
      <div>
        <label className="label mb-1.5 block">Ingredients</label>
        <IngredientEditor profileId={profileId} ingredients={ingredients} onChange={setIngredients} />
      </div>

      {ingredients.length > 0 && (
        <div className="bg-surface-raised rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
          <div><div className="text-base font-bold text-accent-orange">{totals.cal}</div><div className="text-[0.5625rem] text-text-muted">kcal</div></div>
          <div><div className="text-base font-bold text-accent-blue">{Math.round(totals.p)}g</div><div className="text-[0.5625rem] text-text-muted">protein</div></div>
          <div><div className="text-base font-bold text-success">{Math.round(totals.c)}g</div><div className="text-[0.5625rem] text-text-muted">carbs</div></div>
          <div><div className="text-base font-bold text-nutrition">{Math.round(totals.f)}g</div><div className="text-[0.5625rem] text-text-muted">fat</div></div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
        {ingredients.length > 0 && (
          <button type="button" onClick={() => onAddToLog(ingredients)} className="btn-secondary flex-1 text-sm">
            Add to Log
          </button>
        )}
        <button type="button" onClick={handleSave} disabled={!canSave} className="btn-primary flex-1 text-sm disabled:opacity-30">
          {existingMeal ? 'Update' : 'Save Meal'}
        </button>
      </div>
    </div>
  );
}
