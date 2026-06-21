import { useState, useMemo } from 'react';
import { AlertTriangle, ChevronRight, Check, X, Search, Loader2, Trash2 } from 'lucide-react';
import { getSavedFoods, updateSavedFood, deleteSavedFood, type SavedFood } from '../../db/foodHistory';
import { FOOD_DATABASE } from '../../data/foods';
import { searchFoods as searchUSDA } from '../../utils/usda';
import { getDB } from '../../db';
import type { FoodEntry } from '../../types';
import { toast } from '../shared/Toast';

interface Props {
  profileId: string;
}

export function ZeroMacroWarning({ profileId }: Props) {
  const [foods, setFoods] = useState(() => getSavedFoods(profileId));
  const [fixing, setFixing] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [editCal, setEditCal] = useState('');
  const [editP, setEditP] = useState('');
  const [editC, setEditC] = useState('');
  const [editF, setEditF] = useState('');
  const [editServing, setEditServing] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [usdaResults, setUsdaResults] = useState<{ name: string; brand?: string; cal: number; p: number; c: number; f: number }[]>([]);
  const [usdaSearching, setUsdaSearching] = useState(false);
  const [builtinMatches, setBuiltinMatches] = useState<{ name: string; cal: number; p: number; c: number; f: number; serving: number }[]>([]);

  const zeroFoods = useMemo(() => foods.filter((f) => f.calories === 0 && f.protein === 0 && f.carbs === 0 && f.fat === 0), [foods]);

  if (zeroFoods.length === 0) return null;

  const currentFood = fixing ? zeroFoods[currentIdx] : null;

  const startFixing = () => {
    setFixing(true);
    setCurrentIdx(0);
    loadFood(zeroFoods[0]);
  };

  const loadFood = (food: SavedFood) => {
    setEditCal(''); setEditP(''); setEditC(''); setEditF('');
    setEditServing(String(food.servingSize || 1)); setEditUnit(food.servingUnit || 'g');
    setUsdaResults([]);

    // Auto-search built-in DB
    const q = food.name.toLowerCase();
    const matches = FOOD_DATABASE
      .filter((f) => {
        const words = q.split(/\s+/).filter((w) => w.length > 2);
        const name = f.name.toLowerCase();
        return words.some((w) => name.includes(w));
      })
      .slice(0, 5)
      .map((f) => ({
        name: f.name,
        cal: Math.round(f.per100g.calories * f.commonServing.grams / 100),
        p: Math.round(f.per100g.protein * f.commonServing.grams / 100 * 10) / 10,
        c: Math.round(f.per100g.carbs * f.commonServing.grams / 100 * 10) / 10,
        f: Math.round(f.per100g.fat * f.commonServing.grams / 100 * 10) / 10,
        serving: f.commonServing.grams,
      }));
    setBuiltinMatches(matches);
  };

  const handleSearchUSDA = async () => {
    if (!currentFood) return;
    const apiKey = localStorage.getItem('fitos-usda-key');
    if (!apiKey) { toast('Add USDA API key in Settings', 'error'); return; }
    setUsdaSearching(true);
    try {
      const results = await searchUSDA(currentFood.name, apiKey);
      setUsdaResults(results.slice(0, 5).map((r) => ({
        name: r.name, brand: r.brand, cal: r.caloriesPer100g, p: r.proteinPer100g, c: r.carbsPer100g, f: r.fatPer100g,
      })));
    } catch { toast('USDA search failed', 'error'); }
    setUsdaSearching(false);
  };

  const applyAndNext = async () => {
    if (!currentFood) return;
    const cal = parseFloat(editCal) || 0;
    const p = parseFloat(editP) || 0;
    const c = parseFloat(editC) || 0;
    const f = parseFloat(editF) || 0;

    if (cal > 0 || p > 0) {
      updateSavedFood(profileId, currentFood.name, {
        calories: cal, protein: p, carbs: c, fat: f,
        servingSize: parseFloat(editServing) || 1, servingUnit: editUnit,
      });

      // Retroactive update of past food entries
      const db = await getDB();
      const allEntries: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
      const nameLower = currentFood.name.toLowerCase();
      for (const entry of allEntries) {
        if (entry.name.toLowerCase() === nameLower && entry.calories === 0 && entry.protein === 0) {
          await db.put('foodEntries', { ...entry, calories: cal, protein: p, carbs: c, fat: f });
        }
      }
    }

    setFoods(getSavedFoods(profileId));
    if (currentIdx < zeroFoods.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      loadFood(zeroFoods[nextIdx]);
    } else {
      setFixing(false);
      toast('All foods updated!', 'success');
    }
  };

  const skipFood = () => {
    if (currentIdx < zeroFoods.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      loadFood(zeroFoods[nextIdx]);
    } else {
      setFixing(false);
    }
  };

  const removeAndNext = () => {
    if (currentFood) {
      deleteSavedFood(profileId, currentFood.name);
      setFoods(getSavedFoods(profileId));
    }
    skipFood();
  };

  if (!fixing) {
    return (
      <button onClick={startFixing} className="w-full bg-warning/10 border border-warning/20 rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
        <AlertTriangle size={18} className="text-warning shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{zeroFoods.length} food{zeroFoods.length !== 1 ? 's' : ''} missing macros</div>
          <div className="text-[11px] text-text-muted">Tap to review and update them one by one</div>
        </div>
        <ChevronRight size={14} className="text-text-muted" />
      </button>
    );
  }

  return (
    <div className="card border border-warning/20">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-text-muted">{currentIdx + 1} of {zeroFoods.length}</div>
        <button onClick={() => setFixing(false)} className="p-1"><X size={14} className="text-text-muted" /></button>
      </div>

      <div className="text-sm font-bold mb-3">{currentFood?.name}</div>

      {/* Built-in DB matches */}
      {builtinMatches.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-text-muted font-semibold uppercase mb-1">Matches in database</div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {builtinMatches.map((m, i) => (
              <button key={i} onClick={() => {
                setEditCal(String(m.cal)); setEditP(String(m.p)); setEditC(String(m.c)); setEditF(String(m.f));
                setEditServing(String(m.serving)); setEditUnit('g');
              }} className="w-full text-left bg-surface-raised rounded-md px-2.5 py-1.5 text-[10px] hover:bg-border transition-colors">
                <div className="font-medium">{m.name}</div>
                <div className="text-text-muted">{m.cal}cal · P{m.p}g · C{m.c}g · F{m.f}g · {m.serving}g</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* USDA search */}
      <button onClick={handleSearchUSDA} disabled={usdaSearching} className="text-[10px] text-accent-blue font-semibold mb-2 flex items-center gap-1 disabled:opacity-50">
        {usdaSearching ? <><Loader2 size={10} className="animate-spin" /> Searching...</> : <><Search size={10} /> Search USDA</>}
      </button>

      {usdaResults.length > 0 && (
        <div className="space-y-1 mb-3 max-h-28 overflow-y-auto">
          {usdaResults.map((r, i) => (
            <button key={i} onClick={() => {
              setEditCal(String(r.cal)); setEditP(String(r.p)); setEditC(String(r.c)); setEditF(String(r.f));
              setEditServing('100'); setEditUnit('g');
              setUsdaResults([]);
            }} className="w-full text-left bg-surface-raised rounded-md px-2.5 py-1.5 text-[10px] hover:bg-border">
              <span className="font-medium">{r.name}</span>
              {r.brand && <span className="text-text-muted ml-1">({r.brand})</span>}
              <div className="text-text-muted">{r.cal}cal · P{r.p}g · C{r.c}g · F{r.f}g per 100g</div>
            </button>
          ))}
        </div>
      )}

      {/* Manual entry */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <div><label className="text-[9px] text-text-muted">Cal</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editCal} onChange={(e) => setEditCal(e.target.value)} /></div>
        <div><label className="text-[9px] text-text-muted">Prot</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editP} onChange={(e) => setEditP(e.target.value)} /></div>
        <div><label className="text-[9px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editC} onChange={(e) => setEditC(e.target.value)} /></div>
        <div><label className="text-[9px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full" value={editF} onChange={(e) => setEditF(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mb-3">
        <input type="number" inputMode="decimal" className="input-field text-xs flex-1" placeholder="Serving" value={editServing} onChange={(e) => setEditServing(e.target.value)} />
        <select className="input-field text-xs w-14" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
          {['g','oz','cup','tbsp','tsp','ml','piece','serving'].map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={removeAndNext} className="py-2 px-3 rounded-lg bg-surface-raised text-[10px] text-danger font-medium"><Trash2 size={10} className="inline mr-1" />Remove</button>
        <button onClick={skipFood} className="py-2 px-3 rounded-lg bg-surface-raised text-[10px] text-text-muted font-medium flex-1">Skip</button>
        <button onClick={applyAndNext} disabled={!editCal && !editP} className="py-2 px-3 rounded-lg bg-accent-blue text-white text-[10px] font-semibold flex-1 disabled:opacity-30 flex items-center justify-center gap-1">
          <Check size={10} /> Save & Next
        </button>
      </div>
    </div>
  );
}
