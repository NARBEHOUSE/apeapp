import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Search, AlertCircle, Pencil } from 'lucide-react';
import type { Recipe, RecipeIngredient } from '../../db/recipes';
import { searchSavedFoods, saveFoodToHistory, type SavedFood } from '../../db/foodHistory';
import { searchFoods } from '../../utils/usda';
import { getFoodEmoji } from '../../utils/foodEmoji';

interface Props {
  initial?: Recipe;
  profileId: string;
  onSave: (data: Omit<Recipe, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const UNIT_OPTIONS = ['g', 'oz', 'cup', 'tbsp', 'tsp', 'ml', 'piece', 'slice', 'whole', 'scoop', 'serving', 'lb'];

export function RecipeEditor({ initial, profileId, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [servings, setServings] = useState(String(initial?.servings || 1));
  const [prepTime, setPrepTime] = useState(initial?.prepTime ? String(initial.prepTime) : '');
  const [cookTime, setCookTime] = useState(initial?.cookTime ? String(initial.cookTime) : '');
  const [tags, setTags] = useState(initial?.tags.join(', ') || '');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(initial?.ingredients || []);
  const [steps, setSteps] = useState<string[]>(initial?.steps.length ? initial.steps : ['']);

  // Manual total macros (used when no ingredients or as override)
  const [manualCal, setManualCal] = useState(initial?.totalCalories ? String(initial.totalCalories) : '');
  const [manualP, setManualP] = useState(initial?.totalProtein ? String(initial.totalProtein) : '');
  const [manualC, setManualC] = useState(initial?.totalCarbs ? String(initial.totalCarbs) : '');
  const [manualF, setManualF] = useState(initial?.totalFat ? String(initial.totalFat) : '');

  // Ingredient add mode
  const [showIngForm, setShowIngForm] = useState(false);
  const [ingMode, setIngMode] = useState<'search' | 'manual'>('search');
  const [ingQuery, setIngQuery] = useState('');
  const [ingName, setIngName] = useState('');
  const [ingAmount, setIngAmount] = useState('');
  const [ingUnit, setIngUnit] = useState('g');
  const [ingCal, setIngCal] = useState('');
  const [ingP, setIngP] = useState('');
  const [ingC, setIngC] = useState('');
  const [ingF, setIngF] = useState('');

  // Editing existing ingredient
  const [editingIngIdx, setEditingIngIdx] = useState<number | null>(null);
  const [editIngQuery, setEditIngQuery] = useState('');
  const [editIngCal, setEditIngCal] = useState('');
  const [editIngP, setEditIngP] = useState('');
  const [editIngC, setEditIngC] = useState('');
  const [editIngF, setEditIngF] = useState('');
  const [editIngAmount, setEditIngAmount] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('');
  const [usdaResults, setUsdaResults] = useState<{ name: string; brand?: string; cal: number; p: number; c: number; f: number; fiber: number; per100g: boolean }[]>([]);
  const [usdaSearching, setUsdaSearching] = useState(false);

  const editIngSearchResults = useMemo(() => {
    if (!editIngQuery.trim() || editingIngIdx === null) return [];
    return searchSavedFoods(profileId, editIngQuery).slice(0, 5);
  }, [editIngQuery, editingIngIdx, profileId]);

  const startEditIngredient = (idx: number) => {
    const ing = ingredients[idx];
    setEditingIngIdx(idx);
    setEditIngQuery(ing.name);
    setEditIngCal(String(ing.calories));
    setEditIngP(String(ing.protein));
    setEditIngC(String(ing.carbs));
    setEditIngF(String(ing.fat));
    setEditIngAmount(String(ing.amount));
    setEditIngUnit(ing.unit);
    setUsdaResults([]);
  };

  const applyEditIngredient = () => {
    if (editingIngIdx === null) return;
    const updated = [...ingredients];
    updated[editingIngIdx] = {
      ...updated[editingIngIdx],
      amount: parseFloat(editIngAmount) || updated[editingIngIdx].amount,
      unit: editIngUnit || updated[editingIngIdx].unit,
      calories: parseFloat(editIngCal) || 0,
      protein: parseFloat(editIngP) || 0,
      carbs: parseFloat(editIngC) || 0,
      fat: parseFloat(editIngF) || 0,
    };
    setIngredients(updated);
    // Save to food library for future use
    const ing = updated[editingIngIdx];
    if (ing.calories > 0) {
      saveFoodToHistory(profileId, {
        name: ing.name, calories: ing.calories, protein: ing.protein,
        carbs: ing.carbs, fat: ing.fat, servingSize: ing.amount,
        servingUnit: ing.unit, source: 'manual',
      });
    }
    setEditingIngIdx(null);
    setUsdaResults([]);
  };

  const handleUsdaSearch = async () => {
    const apiKey = localStorage.getItem('fitos-usda-key');
    if (!apiKey || !editIngQuery.trim()) return;
    setUsdaSearching(true);
    try {
      const results = await searchFoods(editIngQuery, apiKey);
      setUsdaResults(results.map((r) => ({
        name: r.name, brand: r.brand,
        cal: r.caloriesPer100g, p: r.proteinPer100g, c: r.carbsPer100g,
        f: r.fatPer100g, fiber: r.fiberPer100g, per100g: true,
      })));
    } catch { /* ignore */ }
    setUsdaSearching(false);
  };

  const searchResults = useMemo(() => {
    if (!ingQuery.trim() || ingMode !== 'search') return [];
    return searchSavedFoods(profileId, ingQuery).slice(0, 8);
  }, [ingQuery, ingMode, profileId]);

  const ingredientCal = ingredients.reduce((s, i) => s + i.calories, 0);
  const ingredientP = ingredients.reduce((s, i) => s + i.protein, 0);
  const ingredientC = ingredients.reduce((s, i) => s + i.carbs, 0);
  const ingredientF = ingredients.reduce((s, i) => s + i.fat, 0);
  const hasIngredientMacros = ingredientCal > 0 || ingredientP > 0;

  const totalCal = hasIngredientMacros ? ingredientCal : (parseFloat(manualCal) || 0);
  const totalP = hasIngredientMacros ? ingredientP : (parseFloat(manualP) || 0);
  const totalC = hasIngredientMacros ? ingredientC : (parseFloat(manualC) || 0);
  const totalF = hasIngredientMacros ? ingredientF : (parseFloat(manualF) || 0);
  const servingCount = parseInt(servings) || 1;

  const selectSearchResult = (food: SavedFood) => {
    setIngName(food.name);
    setIngCal(String(food.calories));
    setIngP(String(food.protein));
    setIngC(String(food.carbs));
    setIngF(String(food.fat));
    setIngAmount(String(food.servingSize));
    setIngUnit(food.servingUnit);
    setIngQuery('');
    setIngMode('manual');
  };

  const addIngredient = () => {
    if (!ingName.trim()) return;
    setIngredients([...ingredients, {
      name: ingName.trim(),
      amount: parseFloat(ingAmount) || 0,
      unit: ingUnit,
      calories: parseFloat(ingCal) || 0,
      protein: parseFloat(ingP) || 0,
      carbs: parseFloat(ingC) || 0,
      fat: parseFloat(ingF) || 0,
    }]);
    setIngName(''); setIngAmount(''); setIngCal(''); setIngP(''); setIngC(''); setIngF('');
    setIngQuery('');
    setIngMode('search');
    setShowIngForm(false);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, val: string) => {
    const updated = [...steps];
    updated[idx] = val;
    setSteps(updated);
  };

  const addStep = () => setSteps([...steps, '']);
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const updated = [...steps];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setSteps(updated);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      emoji: getFoodEmoji(name),
      description: description.trim(),
      servings: servingCount,
      prepTime: prepTime ? parseInt(prepTime) : undefined,
      cookTime: cookTime ? parseInt(cookTime) : undefined,
      ingredients,
      steps: steps.filter((s) => s.trim()),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      totalCalories: totalCal,
      totalProtein: totalP,
      totalCarbs: totalC,
      totalFat: totalF,
      totalFiber: 0,
    });
  };

  const canSave = name.trim() && (totalCal > 0 || ingredients.length > 0 || steps.some((s) => s.trim()));

  return (
    <div className="space-y-5">
      {/* Name & Description */}
      <div className="space-y-3">
        <input
          type="text"
          className="input-field text-sm w-full"
          placeholder="Recipe name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="input-field text-sm w-full resize-none"
          placeholder="Brief description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Servings & Time */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-text-muted font-semibold uppercase">Servings</label>
          <input type="number" className="input-field text-sm w-full mt-1" value={servings} onChange={(e) => setServings(e.target.value)} min="1" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted font-semibold uppercase">Prep (min)</label>
          <input type="number" className="input-field text-sm w-full mt-1" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="—" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted font-semibold uppercase">Cook (min)</label>
          <input type="number" className="input-field text-sm w-full mt-1" value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="—" />
        </div>
      </div>

      {/* Total Macros (manual entry or auto-calculated from ingredients) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-text-secondary">
            {hasIngredientMacros ? 'Total Macros (from ingredients)' : 'Total Macros'}
          </h3>
        </div>
        {hasIngredientMacros ? (
          <div className="bg-surface rounded-xl p-3">
            <div className="flex justify-between text-[10px] text-text-muted mb-1">
              <span>Total Recipe</span>
              <span>Per Serving ({servingCount})</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span>{Math.round(totalCal)} cal · P{Math.round(totalP)}g · C{Math.round(totalC)}g · F{Math.round(totalF)}g</span>
              <span>{Math.round(totalCal / servingCount)} cal</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            <div><label className="text-[9px] text-text-muted">Calories</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" placeholder="0" value={manualCal} onChange={(e) => setManualCal(e.target.value)} /></div>
            <div><label className="text-[9px] text-text-muted">Protein</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" placeholder="0" value={manualP} onChange={(e) => setManualP(e.target.value)} /></div>
            <div><label className="text-[9px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" placeholder="0" value={manualC} onChange={(e) => setManualC(e.target.value)} /></div>
            <div><label className="text-[9px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" placeholder="0" value={manualF} onChange={(e) => setManualF(e.target.value)} /></div>
          </div>
        )}
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-text-secondary">Ingredients</h3>
          <button onClick={() => { setShowIngForm(true); setIngMode('search'); }} className="text-[10px] text-accent-blue font-semibold flex items-center gap-0.5">
            <Plus size={10} /> Add
          </button>
        </div>

        {ingredients.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {ingredients.map((ing, i) => {
              const hasMacros = ing.calories > 0 || ing.protein > 0;
              const isEditing = editingIngIdx === i;

              if (isEditing) {
                return (
                  <div key={i} className="bg-surface rounded-xl p-3 space-y-2 border border-accent-blue/30">
                    <div className="text-xs font-semibold">{ing.name}</div>

                    {/* Search food library */}
                    <input
                      type="text" className="input-field text-xs w-full" placeholder="Search food library or USDA..."
                      value={editIngQuery} onChange={(e) => setEditIngQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUsdaSearch(); }}
                    />

                    {/* Food library results */}
                    {editIngSearchResults.length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {editIngSearchResults.map((food, fi) => (
                          <button key={fi} onClick={() => {
                            setEditIngCal(String(food.calories)); setEditIngP(String(food.protein));
                            setEditIngC(String(food.carbs)); setEditIngF(String(food.fat));
                            if (food.servingSize > 0) { setEditIngAmount(String(food.servingSize)); setEditIngUnit(food.servingUnit); }
                          }} className="w-full text-left bg-surface-raised rounded-md px-2 py-1 text-[10px] hover:bg-border">
                            <span className="font-medium">{food.name}</span>
                            <span className="text-text-muted ml-1">{food.calories}cal · P{food.protein}g</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* USDA search button */}
                    {localStorage.getItem('fitos-usda-key') && (
                      <button onClick={handleUsdaSearch} disabled={usdaSearching} className="text-[10px] text-accent-blue font-semibold disabled:opacity-50">
                        {usdaSearching ? 'Searching USDA...' : 'Search USDA Database'}
                      </button>
                    )}

                    {/* USDA results */}
                    {usdaResults.length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {usdaResults.map((r, ri) => (
                          <button key={ri} onClick={() => {
                            setEditIngCal(String(r.cal)); setEditIngP(String(r.p));
                            setEditIngC(String(r.c)); setEditIngF(String(r.f));
                            if (r.per100g) { setEditIngAmount('100'); setEditIngUnit('g'); }
                          }} className="w-full text-left bg-surface-raised rounded-md px-2 py-1 text-[10px] hover:bg-border">
                            <span className="font-medium">{r.name}</span>
                            {r.brand && <span className="text-text-muted ml-1">({r.brand})</span>}
                            <div className="text-text-muted">{r.cal}cal · P{r.p}g · C{r.c}g · F{r.f}g per 100g</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Manual macro entry */}
                    <div className="flex gap-2">
                      <div className="flex-1"><label className="text-[9px] text-text-muted">Amount</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editIngAmount} onChange={(e) => setEditIngAmount(e.target.value)} /></div>
                      <div className="w-16"><label className="text-[9px] text-text-muted">Unit</label><select className="input-field text-xs w-full" value={editIngUnit} onChange={(e) => setEditIngUnit(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <div><label className="text-[9px] text-text-muted">Cal</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editIngCal} onChange={(e) => setEditIngCal(e.target.value)} /></div>
                      <div><label className="text-[9px] text-text-muted">Prot</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editIngP} onChange={(e) => setEditIngP(e.target.value)} /></div>
                      <div><label className="text-[9px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editIngC} onChange={(e) => setEditIngC(e.target.value)} /></div>
                      <div><label className="text-[9px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editIngF} onChange={(e) => setEditIngF(e.target.value)} /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingIngIdx(null); setUsdaResults([]); }} className="btn-secondary flex-1 text-xs">Cancel</button>
                      <button onClick={applyEditIngredient} className="btn-primary flex-1 text-xs">Save</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className="bg-surface-raised rounded-lg px-3 py-2 flex items-center gap-2">
                  {!hasMacros && <AlertCircle size={12} className="text-warning shrink-0" />}
                  <button onClick={() => startEditIngredient(i)} className="flex-1 min-w-0 text-left">
                    <div className="text-xs font-medium">{ing.amount > 0 ? `${ing.amount} ${ing.unit}` : ''} {ing.name}</div>
                    {hasMacros ? (
                      <div className="text-[10px] text-text-muted">
                        {ing.calories}cal · P{ing.protein}g · C{ing.carbs}g · F{ing.fat}g
                      </div>
                    ) : (
                      <div className="text-[10px] text-warning">Tap to add macros</div>
                    )}
                  </button>
                  <button onClick={() => startEditIngredient(i)} className="p-1"><Pencil size={10} className="text-text-muted" /></button>
                  <button onClick={() => removeIngredient(i)} className="p-1"><Trash2 size={12} className="text-text-muted hover:text-danger" /></button>
                </div>
              );
            })}
          </div>
        )}

        {ingredients.length === 0 && !showIngForm && (
          <p className="text-[11px] text-text-muted mb-3">No ingredients yet. Add them to auto-calculate macros, or enter total macros above.</p>
        )}

        {showIngForm && (
          <div className="bg-surface rounded-xl p-3 space-y-2 border border-border-light">
            {/* Search / Manual toggle */}
            <div className="flex gap-1 mb-1">
              <button
                onClick={() => setIngMode('search')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${ingMode === 'search' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
              >
                <Search size={10} className="inline mr-1" />Search Foods
              </button>
              <button
                onClick={() => setIngMode('manual')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${ingMode === 'manual' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
              >
                Manual Entry
              </button>
            </div>

            {ingMode === 'search' && (
              <div>
                <input
                  type="text"
                  className="input-field text-sm w-full"
                  placeholder="Search your food library..."
                  value={ingQuery}
                  onChange={(e) => setIngQuery(e.target.value)}
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                    {searchResults.map((food, i) => (
                      <button
                        key={i}
                        onClick={() => selectSearchResult(food)}
                        className="w-full text-left bg-surface-raised rounded-lg px-2.5 py-1.5 hover:bg-border transition-colors"
                      >
                        <div className="text-xs font-medium truncate">{food.name}</div>
                        <div className="text-[10px] text-text-muted">
                          {food.calories}cal · P{food.protein}g · C{food.carbs}g · F{food.fat}g
                          {food.servingSize > 0 ? ` · ${food.servingSize} ${food.servingUnit}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {ingQuery.trim() && searchResults.length === 0 && (
                  <p className="text-[10px] text-text-muted mt-1">No results. <button onClick={() => { setIngName(ingQuery); setIngMode('manual'); }} className="text-accent-blue font-semibold">Enter manually</button></p>
                )}
              </div>
            )}

            {ingMode === 'manual' && (
              <>
                <input type="text" className="input-field text-sm w-full" placeholder="Ingredient name" value={ingName} onChange={(e) => setIngName(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" className="input-field text-sm flex-1" placeholder="Amount" value={ingAmount} onChange={(e) => setIngAmount(e.target.value)} />
                  <select className="input-field text-sm w-20" value={ingUnit} onChange={(e) => setIngUnit(e.target.value)}>
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div><label className="text-[9px] text-text-muted">Cal</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={ingCal} onChange={(e) => setIngCal(e.target.value)} /></div>
                  <div><label className="text-[9px] text-text-muted">Protein</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={ingP} onChange={(e) => setIngP(e.target.value)} /></div>
                  <div><label className="text-[9px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={ingC} onChange={(e) => setIngC(e.target.value)} /></div>
                  <div><label className="text-[9px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={ingF} onChange={(e) => setIngF(e.target.value)} /></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowIngForm(false); setIngQuery(''); }} className="btn-secondary flex-1 text-xs">Cancel</button>
                  <button onClick={addIngredient} disabled={!ingName.trim()} className="btn-primary flex-1 text-xs disabled:opacity-30">Add</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-text-secondary">Instructions</h3>
          <button onClick={addStep} className="text-[10px] text-accent-blue font-semibold flex items-center gap-0.5">
            <Plus size={10} /> Add Step
          </button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-[10px] text-text-muted font-bold mt-2.5 w-4 text-right">{i + 1}</span>
              <textarea
                className="input-field text-sm flex-1 resize-none"
                rows={2}
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
              />
              <div className="flex flex-col gap-0.5 mt-1">
                <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20"><ChevronUp size={12} className="text-text-muted" /></button>
                <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-0.5 disabled:opacity-20"><ChevronDown size={12} className="text-text-muted" /></button>
                <button onClick={() => removeStep(i)} className="p-0.5"><Trash2 size={10} className="text-text-muted hover:text-danger" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="text-[10px] text-text-muted font-semibold uppercase">Tags (comma-separated)</label>
        <input type="text" className="input-field text-sm w-full mt-1" placeholder="high protein, meal prep, quick" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSave} disabled={!canSave} className="btn-primary flex-1 disabled:opacity-30">
          {initial ? 'Update Recipe' : 'Save Recipe'}
        </button>
      </div>
    </div>
  );
}
