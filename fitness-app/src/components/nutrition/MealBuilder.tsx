import { useState, useMemo, useRef } from 'react';
import { Search, X, Plus, Trash2 } from 'lucide-react';
import type { SavedMeal, MealIngredient } from '../../db/savedMeals';
import { searchSavedFoods } from '../../db/foodHistory';
import { FOOD_DATABASE } from '../../data/foods';
import { getFoodEmoji } from '../../utils/foodEmoji';

interface QuickFood {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
}

interface Props {
  profileId: string;
  onSave: (meal: Omit<SavedMeal, 'id' | 'profileId' | 'createdAt'>) => void;
  onAddToLog: (ingredients: MealIngredient[]) => void;
  onClose: () => void;
  existingMeal?: SavedMeal;
}

function ingEffective(ing: MealIngredient) {
  const factor = ing.amount / (ing.servingSize || 1);
  return {
    cal: Math.round(ing.calories * factor),
    p: Math.round(ing.protein * factor * 10) / 10,
    c: Math.round(ing.carbs * factor * 10) / 10,
    f: Math.round(ing.fat * factor * 10) / 10,
  };
}

export function MealBuilder({ profileId, onSave, onAddToLog, onClose, existingMeal }: Props) {
  const [name, setName] = useState(existingMeal?.name || '');
  const [ingredients, setIngredients] = useState<MealIngredient[]>(existingMeal?.ingredients || []);
  const [ingSearch, setIngSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingFood, setPendingFood] = useState<QuickFood | null>(null);
  const [pendingAmount, setPendingAmount] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo<QuickFood[]>(() => {
    const q = ingSearch.trim().toLowerCase();
    if (!q || pendingFood) return [];

    const histResults = searchSavedFoods(profileId, q).slice(0, 6).map((f) => ({
      name: f.name, brand: f.brand, calories: f.calories, protein: f.protein,
      carbs: f.carbs, fat: f.fat, fiber: f.fiber,
      servingSize: f.servingSize, servingUnit: f.servingUnit,
    }));

    const words = q.split(/\s+/);
    const builtinResults = FOOD_DATABASE
      .filter((f) => words.every((w) => f.name.toLowerCase().includes(w)))
      .slice(0, 6)
      .map((f) => {
        const factor = f.commonServing.grams / 100;
        return {
          name: f.name,
          calories: Math.round(f.per100g.calories * factor),
          protein: Math.round(f.per100g.protein * factor * 10) / 10,
          carbs: Math.round(f.per100g.carbs * factor * 10) / 10,
          fat: Math.round(f.per100g.fat * factor * 10) / 10,
          fiber: f.per100g.fiber != null ? Math.round(f.per100g.fiber * factor * 10) / 10 : undefined,
          servingSize: f.commonServing.grams, servingUnit: 'g',
        };
      });

    const seen = new Set<string>();
    return [...histResults, ...builtinResults].filter((f) => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [ingSearch, profileId, pendingFood]);

  const totals = useMemo(() =>
    ingredients.reduce((acc, ing) => {
      const e = ingEffective(ing);
      return { cal: acc.cal + e.cal, p: acc.p + e.p, c: acc.c + e.c, f: acc.f + e.f };
    }, { cal: 0, p: 0, c: 0, f: 0 }),
    [ingredients],
  );

  function selectFood(food: QuickFood) {
    setPendingFood(food);
    setPendingAmount(String(food.servingSize));
    setIngSearch(food.name);
    setShowDropdown(false);
  }

  function addIngredient() {
    if (!pendingFood) return;
    const amount = parseFloat(pendingAmount) || pendingFood.servingSize;
    setIngredients((prev) => [...prev, {
      name: pendingFood.name, brand: pendingFood.brand,
      servingSize: pendingFood.servingSize, servingUnit: pendingFood.servingUnit,
      calories: pendingFood.calories, protein: pendingFood.protein,
      carbs: pendingFood.carbs, fat: pendingFood.fat, fiber: pendingFood.fiber,
      amount,
    }]);
    setPendingFood(null);
    setPendingAmount('');
    setIngSearch('');
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function updateAmount(index: number, val: string) {
    const amount = parseFloat(val);
    if (isNaN(amount) || amount <= 0) return;
    setIngredients((prev) => prev.map((ing, i) => i === index ? { ...ing, amount } : ing));
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

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
    });
  }

  const canSave = name.trim().length > 0 && ingredients.length > 0;

  const livePreview = pendingFood && (() => {
    const amount = parseFloat(pendingAmount) || pendingFood.servingSize;
    const factor = amount / (pendingFood.servingSize || 1);
    return Math.round(pendingFood.calories * factor);
  })();

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

      {/* Ingredient search */}
      <div>
        <label className="label mb-1.5 block">Ingredients</label>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                className="input-field pl-8 text-sm"
                placeholder={pendingFood ? `Amount (${pendingFood.servingUnit})` : 'Search foods…'}
                value={pendingFood ? pendingAmount : ingSearch}
                onChange={(e) => {
                  if (pendingFood) {
                    setPendingAmount(e.target.value);
                  } else {
                    setIngSearch(e.target.value);
                    setShowDropdown(true);
                  }
                }}
                onFocus={() => !pendingFood && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); pendingFood ? addIngredient() : undefined; }
                  if (e.key === 'Escape') { setPendingFood(null); setPendingAmount(''); setIngSearch(''); }
                }}
                inputMode={pendingFood ? 'decimal' : 'text'}
              />
            </div>
            {pendingFood && (
              <button type="button" onClick={() => { setPendingFood(null); setPendingAmount(''); setIngSearch(''); }} className="px-2 text-text-muted">
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={addIngredient}
              disabled={!pendingFood}
              className="bg-accent-blue text-white px-3 rounded-xl disabled:opacity-30 shrink-0"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Selected food preview */}
          {pendingFood && (
            <div className="mt-1.5 px-3 py-2 bg-surface-raised rounded-lg flex items-center justify-between">
              <div className="text-[11px] text-text-secondary">
                <span className="font-medium">{pendingFood.name}</span>
                <span className="text-text-muted"> — base {pendingFood.servingSize}{pendingFood.servingUnit} = {pendingFood.calories} cal</span>
              </div>
              <span className="text-[11px] font-semibold text-accent-orange ml-2">{livePreview} cal</span>
            </div>
          )}

          {/* Search dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface rounded-xl shadow-lg overflow-hidden border border-border max-h-64 overflow-y-auto">
              {searchResults.map((food, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectFood(food)}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-surface-raised transition-colors border-b border-border/50 last:border-0"
                >
                  <span className="text-lg leading-none">{getFoodEmoji(food.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{food.name}</div>
                    {food.brand && <div className="text-[9px] text-text-muted">{food.brand}</div>}
                  </div>
                  <div className="text-[9px] text-text-muted text-right shrink-0">
                    <div className="font-medium text-text-primary">{food.calories} cal</div>
                    <div>per {food.servingSize}{food.servingUnit}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showDropdown && ingSearch.trim() && searchResults.length === 0 && !pendingFood && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface rounded-xl border border-border px-3 py-2.5 text-[11px] text-text-muted">
              No matches — search USDA or add manually first, then it'll appear here.
            </div>
          )}
        </div>
      </div>

      {/* Ingredient list */}
      {ingredients.length > 0 ? (
        <div className="space-y-1">
          {ingredients.map((ing, i) => {
            const e = ingEffective(ing);
            return (
              <div key={i} className="bg-surface rounded-xl px-3 py-2 flex items-center gap-2">
                <span className="text-base leading-none shrink-0">{getFoodEmoji(ing.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{ing.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ing.amount}
                      onChange={(e) => updateAmount(i, e.target.value)}
                      className="w-14 bg-surface-raised rounded px-1.5 py-0.5 text-[10px] text-center font-medium border-0"
                    />
                    <span className="text-[9px] text-text-muted">{ing.servingUnit}</span>
                    <span className="text-[9px] text-text-muted">·</span>
                    <span className="text-[9px] text-accent-orange">{e.cal} cal</span>
                    <span className="text-[9px] text-accent-blue">P{e.p}g</span>
                    <span className="text-[9px] text-success">C{e.c}g</span>
                    <span className="text-[9px] text-nutrition">F{e.f}g</span>
                  </div>
                </div>
                <button type="button" onClick={() => removeIngredient(i)} className="p-1 shrink-0">
                  <Trash2 size={12} className="text-text-muted/40 hover:text-danger" />
                </button>
              </div>
            );
          })}

          {/* Totals */}
          <div className="bg-surface-raised rounded-xl p-3 grid grid-cols-4 gap-2 text-center mt-2">
            <div><div className="text-base font-bold text-accent-orange">{totals.cal}</div><div className="text-[9px] text-text-muted">kcal</div></div>
            <div><div className="text-base font-bold text-accent-blue">{Math.round(totals.p)}g</div><div className="text-[9px] text-text-muted">protein</div></div>
            <div><div className="text-base font-bold text-success">{Math.round(totals.c)}g</div><div className="text-[9px] text-text-muted">carbs</div></div>
            <div><div className="text-base font-bold text-nutrition">{Math.round(totals.f)}g</div><div className="text-[9px] text-text-muted">fat</div></div>
          </div>
        </div>
      ) : (
        <div className="text-center py-5 text-text-muted text-xs border border-dashed border-border rounded-xl">
          Search above to add ingredients
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
