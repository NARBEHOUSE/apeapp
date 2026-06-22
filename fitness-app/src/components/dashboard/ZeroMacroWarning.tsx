import { useState, useMemo } from 'react';
import { AlertTriangle, ChevronRight, Check, X, Search, Loader2, Trash2 } from 'lucide-react';
import { getSavedFoods, updateSavedFood, deleteSavedFood, type SavedFood } from '../../db/foodHistory';
import { FOOD_DATABASE } from '../../data/foods';
import { searchFoods } from '../../utils/usda';
import { getDB } from '../../db';
import type { FoodEntry } from '../../types';
import { toast } from '../shared/Toast';

interface Props {
  profileId: string;
}

interface MatchResult {
  name: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  serving: number;
  unit: string;
  source: 'builtin' | 'usda';
  brand?: string;
}

export function ZeroMacroWarning({ profileId }: Props) {
  const [foods, setFoods] = useState(() => getSavedFoods(profileId));
  const [fixing, setFixing] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [editCal, setEditCal] = useState('');
  const [editP, setEditP] = useState('');
  const [editC, setEditC] = useState('');
  const [editF, setEditF] = useState('');
  const [editFiber, setEditFiber] = useState('');
  const [editServing, setEditServing] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [usdaSearching, setUsdaSearching] = useState(false);
  const [autoMatched, setAutoMatched] = useState(false);
  const [customSearch, setCustomSearch] = useState('');

  const zeroFoods = useMemo(() => foods.filter((f) => f.calories === 0 && f.protein === 0 && f.carbs === 0 && f.fat === 0), [foods]);

  if (zeroFoods.length === 0) return null;

  const currentFood = fixing ? zeroFoods[currentIdx] : null;

  const searchBuiltIn = (query: string): MatchResult[] => {
    const q = query.toLowerCase();
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);
    if (qWords.length === 0) return [];

    return FOOD_DATABASE
      .map((f) => {
        const name = f.name.toLowerCase();
        const matchCount = qWords.filter((w) => name.includes(w)).length;
        return { food: f, matchCount, ratio: matchCount / qWords.length };
      })
      .filter((s) => s.matchCount >= Math.max(1, Math.ceil(qWords.length * 0.5)))
      .sort((a, b) => b.ratio - a.ratio || b.matchCount - a.matchCount)
      .slice(0, 5)
      .map((s) => ({
        name: s.food.name,
        cal: Math.round(s.food.per100g.calories * s.food.commonServing.grams / 100),
        p: Math.round(s.food.per100g.protein * s.food.commonServing.grams / 100 * 10) / 10,
        c: Math.round(s.food.per100g.carbs * s.food.commonServing.grams / 100 * 10) / 10,
        f: Math.round(s.food.per100g.fat * s.food.commonServing.grams / 100 * 10) / 10,
        fiber: s.food.per100g.fiber ? Math.round(s.food.per100g.fiber * s.food.commonServing.grams / 100 * 10) / 10 : 0,
        serving: s.food.commonServing.grams,
        unit: 'g',
        source: 'builtin' as const,
      }));
  };

  const startFixing = () => {
    setFixing(true);
    setCurrentIdx(0);
    loadFood(zeroFoods[0]);
  };

  const searchUSDAForFood = async (query: string): Promise<MatchResult[]> => {
    try {
      const results = await searchFoods(query);
      return results.map((r) => ({
        name: r.name, brand: r.brand, cal: r.caloriesPer100g, p: r.proteinPer100g,
        c: r.carbsPer100g, f: r.fatPer100g, fiber: r.fiberPer100g,
        serving: 100, unit: 'g', source: 'usda' as const,
      }));
    } catch { return []; }
  };

  const loadFood = async (food: SavedFood) => {
    setEditCal(''); setEditP(''); setEditC(''); setEditF(''); setEditFiber('');
    setEditServing(String(food.servingSize || 1)); setEditUnit('g');
    setAutoMatched(false);
    setCustomSearch('');

    const builtinMatches = searchBuiltIn(food.name);

    // USDA first — prioritize for wider coverage
    setUsdaSearching(true);
    const usdaMatches = await searchUSDAForFood(food.name);
    setUsdaSearching(false);

    if (usdaMatches.length > 0) {
        const top = usdaMatches[0];
        setEditCal(String(top.cal)); setEditP(String(top.p)); setEditC(String(top.c)); setEditF(String(top.f));
        setEditFiber(String(top.fiber)); setEditServing('100'); setEditUnit('g');
        setAutoMatched(true);
        setMatches([...usdaMatches, ...builtinMatches]);
        return;
      }

    // Fall back to built-in DB
    const q = food.name.toLowerCase();
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);
    const strongMatch = builtinMatches.length > 0 && qWords.length > 0 &&
      qWords.every((w) => builtinMatches[0].name.toLowerCase().includes(w));

    if (strongMatch) {
      const m = builtinMatches[0];
      setEditCal(String(m.cal)); setEditP(String(m.p)); setEditC(String(m.c)); setEditF(String(m.f));
      setEditFiber(String(m.fiber)); setEditServing(String(m.serving)); setEditUnit('g');
      setAutoMatched(true);
    }
    setMatches([...builtinMatches]);
  };

  const handleCustomSearch = async () => {
    if (!customSearch.trim()) return;
    const builtinResults = searchBuiltIn(customSearch);
    setUsdaSearching(true);
    let usdaMatches: MatchResult[] = [];
    try {
      const results = await searchFoods(customSearch);
      usdaMatches = results.slice(0, 5).map((r) => ({
        name: r.name, brand: r.brand, cal: r.caloriesPer100g, p: r.proteinPer100g,
        c: r.carbsPer100g, f: r.fatPer100g, fiber: r.fiberPer100g,
        serving: 100, unit: 'g', source: 'usda' as const,
      }));
    } catch { /* ignore */ }
    setUsdaSearching(false);
    setMatches([...usdaMatches, ...builtinResults]);
  };

  const selectMatch = (m: MatchResult) => {
    setEditCal(String(m.cal)); setEditP(String(m.p)); setEditC(String(m.c)); setEditF(String(m.f));
    setEditFiber(String(m.fiber)); setEditServing(String(m.serving)); setEditUnit(m.unit);
  };

  const applyAndNext = async () => {
    if (!currentFood) return;
    const cal = parseFloat(editCal) || 0;
    const p = parseFloat(editP) || 0;
    const c = parseFloat(editC) || 0;
    const f = parseFloat(editF) || 0;
    const fiber = parseFloat(editFiber) || undefined;

    if (cal > 0 || p > 0) {
      updateSavedFood(profileId, currentFood.name, {
        calories: cal, protein: p, carbs: c, fat: f, fiber,
        servingSize: parseFloat(editServing) || 1, servingUnit: editUnit || 'g',
      });
      const db = await getDB();
      const allEntries: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
      const nameLower = currentFood.name.toLowerCase();
      for (const entry of allEntries) {
        if (entry.name.toLowerCase() === nameLower && entry.calories === 0 && entry.protein === 0) {
          await db.put('foodEntries', { ...entry, calories: cal, protein: p, carbs: c, fat: f, fiber });
        }
      }
    }
    advance();
  };

  const advance = () => {
    setFoods(getSavedFoods(profileId));
    const remaining = getSavedFoods(profileId).filter((f) => f.calories === 0 && f.protein === 0 && f.carbs === 0 && f.fat === 0);
    if (remaining.length > 0 && currentIdx < remaining.length) {
      loadFood(remaining[Math.min(currentIdx, remaining.length - 1)]);
    } else if (remaining.length > 0) {
      setCurrentIdx(0);
      loadFood(remaining[0]);
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
    const remaining = getSavedFoods(profileId).filter((f) => f.calories === 0 && f.protein === 0 && f.carbs === 0 && f.fat === 0);
    if (remaining.length > 0) {
      setCurrentIdx(Math.min(currentIdx, remaining.length - 1));
      loadFood(remaining[Math.min(currentIdx, remaining.length - 1)]);
    } else {
      setFixing(false);
      toast('All done!', 'success');
    }
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
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-text-muted font-semibold">{currentIdx + 1} of {zeroFoods.length}</div>
        <button onClick={() => setFixing(false)} className="p-1"><X size={14} className="text-text-muted" /></button>
      </div>

      <div className="text-sm font-bold mb-1">{currentFood?.name}</div>
      {autoMatched && (
        <div className="text-[10px] text-green-500 font-medium mb-2 flex items-center gap-1">
          <Check size={10} /> Auto-matched — review and hit Save
        </div>
      )}

      {/* Custom search + re-search USDA */}
      <div className="flex gap-1 mb-2">
        <input
          type="text" className="input-field text-xs flex-1 py-1.5" placeholder="Search foods & USDA..."
          value={customSearch} onChange={(e) => setCustomSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSearch(); }}
        />
        <button onClick={handleCustomSearch} disabled={usdaSearching} className="bg-accent-blue text-white px-2 rounded-lg">
          {usdaSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>
      {!autoMatched && currentFood && (
        <button
          onClick={async () => {
            setUsdaSearching(true);
            const results = await searchUSDAForFood(currentFood.name);
            setUsdaSearching(false);
            if (results.length > 0) {
              const top = results[0];
              setEditCal(String(top.cal)); setEditP(String(top.p)); setEditC(String(top.c)); setEditF(String(top.f));
              setEditFiber(String(top.fiber)); setEditServing('100'); setEditUnit('g');
              setAutoMatched(true);
              setMatches((prev) => [...results, ...prev.filter((m) => m.source !== 'usda')]);
            }
          }}
          disabled={usdaSearching}
          className="text-[10px] text-accent-blue font-semibold mb-2 flex items-center gap-1 disabled:opacity-50"
        >
          {usdaSearching ? <><Loader2 size={10} className="animate-spin" /> Searching...</> : <><Search size={10} /> Re-search USDA for this food</>}
        </button>
      )}

      {/* Matches */}
      {matches.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
          {matches.map((m, i) => (
            <button key={i} onClick={() => selectMatch(m)} className="w-full text-left bg-surface-raised rounded-md px-2.5 py-1.5 text-[10px] hover:bg-border transition-colors">
              <div className="flex items-center gap-1">
                <span className="font-medium truncate flex-1">{m.name}</span>
                <span className={`text-[8px] px-1 rounded ${m.source === 'builtin' ? 'bg-accent-blue/15 text-accent-blue' : 'bg-green-500/15 text-green-500'}`}>
                  {m.source === 'builtin' ? 'DB' : 'USDA'}
                </span>
              </div>
              {m.brand && <div className="text-text-muted">{m.brand}</div>}
              <div className="text-text-muted">{m.cal}cal · P{m.p}g · C{m.c}g · F{m.f}g · {m.serving}{m.unit}</div>
            </button>
          ))}
        </div>
      )}

      {/* Macro entry */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        <div><label className="text-[8px] text-text-muted">Cal</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editCal} onChange={(e) => setEditCal(e.target.value)} /></div>
        <div><label className="text-[8px] text-text-muted">Prot</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editP} onChange={(e) => setEditP(e.target.value)} /></div>
        <div><label className="text-[8px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editC} onChange={(e) => setEditC(e.target.value)} /></div>
        <div><label className="text-[8px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editF} onChange={(e) => setEditF(e.target.value)} /></div>
        <div><label className="text-[8px] text-text-muted">Fiber</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFiber} onChange={(e) => setEditFiber(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-[8px] text-text-muted">Serving (g)</label>
          <input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editServing} onChange={(e) => setEditServing(e.target.value)} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={removeAndNext} className="py-2 px-3 rounded-lg bg-surface-raised text-[10px] text-danger font-medium"><Trash2 size={10} className="inline mr-0.5" />Remove</button>
        <button onClick={skipFood} className="py-2 px-3 rounded-lg bg-surface-raised text-[10px] text-text-muted font-medium flex-1">Skip</button>
        <button onClick={applyAndNext} disabled={!editCal && !editP} className="py-2 px-3 rounded-lg bg-accent-blue text-white text-[10px] font-semibold flex-1 disabled:opacity-30 flex items-center justify-center gap-1">
          <Check size={10} /> Save & Next
        </button>
      </div>
    </div>
  );
}
