import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, ChevronRight, Barcode, Globe, Database, Clock, Camera, ArrowLeft } from 'lucide-react';
import { ManualEntry } from './ManualEntry';
import { searchFoodsWithFallback, lookupBarcodeWithFallback } from '../../utils/usda';
import { FOOD_DATABASE, type BuiltInFood } from '../../data/foods';
import { searchSavedFoods, saveFoodToHistory, lookupByBarcode as lookupLocalBarcode } from '../../db/foodHistory';
import { getFoodEmoji } from '../../utils/foodEmoji';
import type { FoodEntry } from '../../types';

// Session-level USDA result cache — cleared on page reload, persists across modal opens
const usdaCache = new Map<string, Awaited<ReturnType<typeof searchFoodsWithFallback>>>();

type MealType = FoodEntry['mealType'];
type SearchTab = 'search' | 'barcode';

interface ParsedFood {
  fdcId: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  source?: 'usda' | 'off';
}

interface LocalResult {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  source: 'builtin' | 'manual' | 'usda' | 'ai_vision';
  category?: string;
  isHistory: boolean;
}

interface PlateItem {
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  servingsConsumed: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  source?: 'manual' | 'usda' | 'ai_vision' | 'builtin';
  fdcId?: string;
  mealType: MealType;
}

interface FoodSearchProps {
  onAdd: (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => void;
  onClose: () => void;
  profileId?: string;
  defaultTab?: SearchTab;
  saveOnly?: boolean;
  multiMode?: boolean;
  startWithScan?: boolean;
}

function convertBuiltIn(food: BuiltInFood): LocalResult {
  const factor = food.commonServing.grams / 100;
  return {
    name: food.name,
    calories: Math.round(food.per100g.calories * factor),
    protein: Math.round(food.per100g.protein * factor * 10) / 10,
    carbs: Math.round(food.per100g.carbs * factor * 10) / 10,
    fat: Math.round(food.per100g.fat * factor * 10) / 10,
    fiber: food.per100g.fiber != null ? Math.round(food.per100g.fiber * factor * 10) / 10 : undefined,
    servingSize: food.commonServing.grams,
    servingUnit: 'g',
    source: 'builtin',
    category: food.category,
    isHistory: false,
  };
}

export function FoodSearch({ onAdd, onClose, profileId, defaultTab, saveOnly = false, multiMode = false, startWithScan = false }: FoodSearchProps) {

  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [tab, setTab] = useState<SearchTab>(defaultTab || 'search');
  const [query, setQuery] = useState('');
  const [barcodeQuery, setBarcodeQuery] = useState('');

  // USDA state
  const [usdaResults, setUsdaResults] = useState<ParsedFood[]>([]);
  const [usdaSearching, setUsdaSearching] = useState(false);
  const [usdaError, setUsdaError] = useState('');

  // Barcode state
  const [barcodeResult, setBarcodeResult] = useState<ParsedFood | null>(null);
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  // Selected food for adding
  const [selected, setSelected] = useState<{
    name: string; brand?: string; calories: number; protein: number;
    carbs: number; fat: number; fiber?: number;
    servingSize: number; servingUnit: string; source: FoodEntry['source']; fdcId?: string;
  } | null>(null);
  const [servingSize, setServingSize] = useState('');
  const [servingsConsumed, setServingsConsumed] = useState('1');
  const [editingBase, setEditingBase] = useState(false);
  const [editBaseCal, setEditBaseCal] = useState('');
  const [editBaseP, setEditBaseP] = useState('');
  const [editBaseC, setEditBaseC] = useState('');
  const [editBaseF, setEditBaseF] = useState('');
  const [editBaseServing, setEditBaseServing] = useState('');
  const [mealType, setMealType] = useState<MealType>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
  });

  // Local search (built-in + history)
  const localResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);

    const historyResults: LocalResult[] = profileId
      ? searchSavedFoods(profileId, q).slice(0, 10).map((f) => ({
          name: f.name, brand: f.brand, calories: f.calories, protein: f.protein,
          carbs: f.carbs, fat: f.fat, fiber: f.fiber,
          servingSize: f.servingSize, servingUnit: f.servingUnit,
          source: f.source, isHistory: true,
        }))
      : [];

    const historyNames = new Set(historyResults.map((r) => r.name.toLowerCase()));
    const builtinResults: LocalResult[] = FOOD_DATABASE
      .filter((food) => {
        if (historyNames.has(food.name.toLowerCase())) return false;
        const name = food.name.toLowerCase();
        return words.every((w) => name.includes(w));
      })
      .slice(0, 20)
      .map(convertBuiltIn);

    return [...historyResults, ...builtinResults];
  }, [query, profileId]);

  // Debounced USDA search
  const usdaTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (query.trim().length < 2) { setUsdaResults([]); setUsdaError(''); return; }
    if (usdaTimerRef.current) clearTimeout(usdaTimerRef.current);
    usdaTimerRef.current = setTimeout(async () => {
      const key = query.trim().toLowerCase();
      if (usdaCache.has(key)) {
        setUsdaResults(usdaCache.get(key)!);
        return;
      }
      setUsdaSearching(true);
      setUsdaError('');
      try {
        const foods = await searchFoodsWithFallback(query.trim());
        usdaCache.set(key, foods);
        setUsdaResults(foods);
      } catch (err) {
        setUsdaError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setUsdaSearching(false);
      }
    }, 400);
    return () => { if (usdaTimerRef.current) clearTimeout(usdaTimerRef.current); };
  }, [query]);

  // Barcode lookup — checks local library first, then USDA
  async function handleBarcodeLookup(directCode?: string) {
    const code = directCode || barcodeQuery.trim();
    if (!code) return;
    if (directCode) setBarcodeQuery(directCode);

    // Check local food library first
    if (profileId) {
      const local = lookupLocalBarcode(profileId, code);
      if (local) {
        setSelected({
          name: local.name, brand: local.brand, calories: local.calories,
          protein: local.protein, carbs: local.carbs, fat: local.fat, fiber: local.fiber,
          servingSize: local.servingSize, servingUnit: local.servingUnit, source: local.source,
        });
        setServingSize(String(local.servingSize));
        setServingsConsumed('1');
        return;
      }
    }

    setBarcodeSearching(true);
    setBarcodeError('');
    setBarcodeResult(null);
    try {
      const result = await lookupBarcodeWithFallback(code);
      if (result) {
        // Auto-select so the detail view shows immediately
        setSelected({
          name: result.name, brand: result.brand,
          calories: result.caloriesPer100g, protein: result.proteinPer100g,
          carbs: result.carbsPer100g, fat: result.fatPer100g, fiber: result.fiberPer100g,
          servingSize: 100, servingUnit: 'g', source: 'usda', fdcId: result.fdcId,
        });
        setServingSize('100');
        setServingsConsumed('1');
        // Save to food history with barcode
        if (profileId) {
          saveFoodToHistory(profileId, {
            name: result.name, brand: result.brand, calories: result.caloriesPer100g,
            protein: result.proteinPer100g, carbs: result.carbsPer100g, fat: result.fatPer100g,
            fiber: result.fiberPer100g, servingSize: 100, servingUnit: 'g', source: 'usda',
            fdcId: result.fdcId, barcode: code,
          });
        }
      } else {
        setBarcodeError('No product found for this barcode.');
      }
    } catch {
      setBarcodeError('Lookup failed.');
    } finally {
      setBarcodeSearching(false);
    }
  }

  function selectLocal(item: LocalResult) {
    setSelected({
      name: item.name, brand: item.brand, calories: item.calories,
      protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber,
      servingSize: item.servingSize, servingUnit: item.servingUnit, source: item.source,
    });
    setServingSize(String(item.servingSize));
    setServingsConsumed('1');
    setMealType('snack');
  }

  function selectUsda(food: ParsedFood) {
    setSelected({
      name: food.name, brand: food.brand,
      calories: food.caloriesPer100g, protein: food.proteinPer100g,
      carbs: food.carbsPer100g, fat: food.fatPer100g, fiber: food.fiberPer100g,
      servingSize: 100, servingUnit: 'g', source: 'usda', fdcId: food.fdcId,
    });
    setServingSize('100');
    setServingsConsumed('1');
    setMealType('snack');
    // Save to food history for future use
    if (profileId) {
      saveFoodToHistory(profileId, {
        name: food.name, brand: food.brand, calories: food.caloriesPer100g,
        protein: food.proteinPer100g, carbs: food.carbsPer100g, fat: food.fatPer100g,
        fiber: food.fiberPer100g, servingSize: 100, servingUnit: 'g', source: 'usda', fdcId: food.fdcId,
      });
    }
  }

  // Manual entry fallback for unknown barcodes
  const [showManualForBarcode, setShowManualForBarcode] = useState(false);

  // Scanner state — must be before any early returns to satisfy rules of hooks
  const [showScanner, setShowScanner] = useState(defaultTab === 'barcode' || startWithScan);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  const startScanner = async () => {
    setShowScanner(true);
    await new Promise((r) => setTimeout(r, 200));
    if (!scannerRef.current) return;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scannerId = 'barcode-scanner-region';
      scannerRef.current.id = scannerId;
      scannerRef.current.innerHTML = '';
      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 1.0 },
        (decodedText) => {
          html5QrRef.current = null; // clear ref so stopScanner doesn't double-stop
          scanner.stop().catch(() => {});
          setShowScanner(false);
          handleBarcodeLookup(decodedText);
        },
        () => {},
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setShowScanner(false);
    }
  };

  const stopScanner = useCallback(() => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      html5QrRef.current = null; // clear ref first so cleanup doesn't double-stop
      try {
        scanner.stop().catch(() => {});
      } catch {
        // ignore — DOM may already be gone
      }
    }
    setShowScanner(false);
  }, []);

  // Safe close: always stop the scanner before letting the parent unmount us
  const handleClose = useCallback(() => {
    stopScanner();
    // Yield one tick so scanner.stop() starts before the component unmounts
    setTimeout(() => onClose(), 0);
  }, [stopScanner, onClose]);

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

  // Auto-start scanner when opened via scan shortcut — delay lets modal animation finish
  useEffect(() => {
    if (!startWithScan) return;
    const t = setTimeout(() => startScanner(), 400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSaveToLibrary() {
    if (!selected || !profileId) return;
    const sz = parseFloat(servingSize) || selected.servingSize;
    const scaleFactor = sz / (selected.servingSize || 1);
    saveFoodToHistory(profileId, {
      name: selected.name,
      brand: selected.brand,
      servingSize: sz,
      servingUnit: selected.servingUnit,
      calories: Math.round(selected.calories * scaleFactor),
      protein: Math.round(selected.protein * scaleFactor * 10) / 10,
      carbs: Math.round(selected.carbs * scaleFactor * 10) / 10,
      fat: Math.round(selected.fat * scaleFactor * 10) / 10,
      fiber: selected.fiber ? Math.round(selected.fiber * scaleFactor * 10) / 10 : undefined,
      source: selected.source,
      fdcId: selected.fdcId,
    });
  }

  function handleAdd() {
    if (!selected) return;
    const sz = parseFloat(servingSize) || selected.servingSize;
    const qty = parseFloat(servingsConsumed) || 1;

    // Scale macros proportionally from base serving size
    const scaleFactor = sz / (selected.servingSize || 1);
    const finalCal = Math.round(selected.calories * scaleFactor);
    const finalP = Math.round(selected.protein * scaleFactor * 10) / 10;
    const finalC = Math.round(selected.carbs * scaleFactor * 10) / 10;
    const finalF = Math.round(selected.fat * scaleFactor * 10) / 10;
    const finalFb = selected.fiber ? Math.round(selected.fiber * scaleFactor * 10) / 10 : undefined;

    if (multiMode) {
      setPlate((prev) => [...prev, {
        name: selected.name,
        brand: selected.brand,
        servingSize: sz,
        servingUnit: selected.servingUnit,
        servingsConsumed: qty,
        calories: finalCal,
        protein: finalP,
        carbs: finalC,
        fat: finalF,
        fiber: finalFb,
        source: selected.source,
        fdcId: selected.fdcId,
        mealType,
      }]);
      setSelected(null);
      setServingSize('');
      setServingsConsumed('1');
      setQuery('');
      setUsdaResults([]);
    } else {
      onAdd({
        date: new Date().toISOString().split('T')[0],
        name: selected.name,
        brand: selected.brand,
        servingSize: sz,
        servingUnit: selected.servingUnit,
        servingsConsumed: qty,
        calories: finalCal,
        protein: finalP,
        carbs: finalC,
        fat: finalF,
        fiber: finalFb,
        source: selected.source,
        fdcId: selected.fdcId,
        mealType,
      });
      handleClose();
    }
  }

  // Selected food detail view
  if (selected) {
    const baseServing = selected.servingSize;
    const baseCal = selected.calories;
    const baseP = selected.protein;
    const baseC = selected.carbs;
    const baseF = selected.fat;

    const myGrams = parseFloat(servingSize) || baseServing;
    const qty = parseFloat(servingsConsumed) || 1;

    // All foods: scale macros proportionally from base serving size
    const factor = (myGrams / (baseServing || 1)) * qty;
    const dispCal = Math.round(baseCal * factor);
    const dispP = Math.round(baseP * factor * 10) / 10;
    const dispC = Math.round(baseC * factor * 10) / 10;
    const dispF = Math.round(baseF * factor * 10) / 10;

    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelected(null)} className="text-sm text-accent-blue">&larr; Back</button>

        <div className="flex items-center gap-3">
          <span className="text-2xl">{getFoodEmoji(selected.name)}</span>
          <div>
            <h4 className="font-bold">{selected.name}</h4>
            {selected.brand && <p className="text-xs text-text-muted">{selected.brand}</p>}
          </div>
        </div>

        {/* Base info — locked with edit option */}
        {!editingBase ? (
          <div className="bg-surface-raised rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] text-text-muted">
              Base: {baseServing}{selected.servingUnit} = {baseCal} cal · P{baseP}g · C{baseC}g · F{baseF}g
            </span>
            <button type="button" onClick={() => {
              setEditingBase(true);
              setEditBaseCal(String(baseCal)); setEditBaseP(String(baseP));
              setEditBaseC(String(baseC)); setEditBaseF(String(baseF));
              setEditBaseServing(String(baseServing));
            }} className="text-[9px] text-text-muted hover:text-accent-blue ml-2">Edit</button>
          </div>
        ) : (
          <div className="bg-surface-raised rounded-lg p-3 space-y-2 border border-warning/30">
            <div className="text-[9px] text-warning font-semibold">Editing base food — this saves as a custom copy</div>
            <div className="grid grid-cols-5 gap-1">
              <div><label className="text-[8px] text-text-muted">Serving</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editBaseServing} onChange={(e) => setEditBaseServing(e.target.value)} /></div>
              <div><label className="text-[8px] text-text-muted">Cal</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editBaseCal} onChange={(e) => setEditBaseCal(e.target.value)} /></div>
              <div><label className="text-[8px] text-text-muted">Prot</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editBaseP} onChange={(e) => setEditBaseP(e.target.value)} /></div>
              <div><label className="text-[8px] text-text-muted">Carbs</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editBaseC} onChange={(e) => setEditBaseC(e.target.value)} /></div>
              <div><label className="text-[8px] text-text-muted">Fat</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editBaseF} onChange={(e) => setEditBaseF(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingBase(false)} className="flex-1 py-1 rounded-md bg-surface text-[10px] text-text-muted font-medium">Cancel</button>
              <button type="button" onClick={() => {
                const newCal = parseFloat(editBaseCal) || 0;
                const newP = parseFloat(editBaseP) || 0;
                const newC = parseFloat(editBaseC) || 0;
                const newF = parseFloat(editBaseF) || 0;
                const newServing = parseFloat(editBaseServing) || baseServing;
                setSelected({ ...selected, calories: newCal, protein: newP, carbs: newC, fat: newF, servingSize: newServing, source: 'manual' });
                setServingSize(String(newServing));
                if (profileId) {
                  saveFoodToHistory(profileId, {
                    name: selected.name, brand: selected.brand, calories: newCal, protein: newP,
                    carbs: newC, fat: newF, servingSize: newServing, servingUnit: selected.servingUnit, source: 'manual',
                  });
                }
                setEditingBase(false);
              }} className="flex-1 py-1 rounded-md bg-accent-blue text-white text-[10px] font-semibold">Save as Custom</button>
            </div>
          </div>
        )}

        {/* Your serving — editable */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Your serving ({selected.servingUnit})</label>
            <input type="text" inputMode="decimal" className="input-field text-sm" value={servingSize} onChange={(e) => setServingSize(e.target.value)} placeholder={String(baseServing)} />
          </div>
          <div>
            <label className="label mb-1 block">Quantity</label>
            <input type="text" inputMode="decimal" className="input-field text-sm" value={servingsConsumed} onChange={(e) => setServingsConsumed(e.target.value)} />
          </div>
        </div>

        {/* Meal type — hidden in save-only mode */}
        {!saveOnly && (
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { value: 'breakfast' as MealType, label: '🌅' },
              { value: 'lunch' as MealType, label: '☀️' },
              { value: 'dinner' as MealType, label: '🌙' },
              { value: 'snack' as MealType, label: '🍿' },
            ]).map((m) => (
              <button key={m.value} type="button" onClick={() => setMealType(m.value)}
                className={`py-2 rounded-lg text-sm transition-colors ${mealType === m.value ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
          <div><div className="text-lg font-bold text-accent-orange">{dispCal}</div><div className="text-[9px] text-text-muted">kcal</div></div>
          <div><div className="text-lg font-bold text-accent-blue">{dispP}g</div><div className="text-[9px] text-text-muted">protein</div></div>
          <div><div className="text-lg font-bold text-success">{dispC}g</div><div className="text-[9px] text-text-muted">carbs</div></div>
          <div><div className="text-lg font-bold text-nutrition">{dispF}g</div><div className="text-[9px] text-text-muted">fat</div></div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={handleClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          {saveOnly ? (
            <button type="button" onClick={() => { handleSaveToLibrary(); handleClose(); }} className="btn-primary flex-1 text-sm">Save to Library</button>
          ) : (
            <>
              <button type="button" onClick={() => { handleSaveToLibrary(); handleClose(); }} className="btn-secondary flex-1 text-sm">Save to Library</button>
              <button type="button" onClick={handleAdd} className="btn-primary flex-1 text-sm">{multiMode ? 'Add to Plate' : 'Add to Log'}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Plate totals
  const plateTotals = plate.reduce(
    (acc, item) => ({ cal: acc.cal + item.calories, p: acc.p + item.protein, c: acc.c + item.carbs, f: acc.f + item.fat }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );

  return (
    <div className="space-y-3">
      {/* Plate summary (multi-mode) */}
      {multiMode && plate.length > 0 && (
        <div className="bg-surface rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Plate ({plate.length} item{plate.length > 1 ? 's' : ''})</span>
            <div className="flex gap-3 text-[10px] text-text-muted">
              <span className="text-accent-orange font-medium">{plateTotals.cal} cal</span>
              <span className="text-accent-blue">P{Math.round(plateTotals.p)}g</span>
              <span className="text-success">C{Math.round(plateTotals.c)}g</span>
              <span className="text-nutrition">F{Math.round(plateTotals.f)}g</span>
            </div>
          </div>
          <div className="space-y-0.5">
            {plate.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="truncate flex-1 text-text-secondary">{item.name}</span>
                <span className="text-text-muted ml-2 shrink-0">{item.calories} cal</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => {
            plate.forEach((item) => onAdd({
              date: new Date().toISOString().split('T')[0],
              name: item.name,
              brand: item.brand,
              servingSize: item.servingSize,
              servingUnit: item.servingUnit,
              servingsConsumed: item.servingsConsumed,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              fiber: item.fiber,
              source: item.source ?? 'manual',
              fdcId: item.fdcId,
              mealType: item.mealType,
            }));
            handleClose();
          }} className="btn-primary w-full text-sm">
            Done — add {plate.length} item{plate.length > 1 ? 's' : ''} to log
          </button>
        </div>
      )}

      {/* Search box with barcode button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text" className="input-field pl-9 pr-9 text-sm" placeholder="Search or enter barcode..."
            value={query} onChange={(e) => { setQuery(e.target.value); setBarcodeQuery(e.target.value); }} autoFocus
          />
          {usdaSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />}
        </div>
        <button type="button" onClick={showScanner ? stopScanner : startScanner}
          className={`px-3 rounded-xl flex items-center justify-center transition-colors ${showScanner ? 'bg-accent text-white' : 'bg-surface'}`}>
          <Barcode size={18} />
        </button>
      </div>

      {/* Inline barcode scanner */}
      {showScanner && (
        <div className="space-y-2">
          <div ref={scannerRef} className="rounded-xl overflow-hidden bg-black" style={{ minHeight: 200 }} />
          <p className="text-[10px] text-text-muted text-center">Point camera at barcode</p>
        </div>
      )}

      {/* Barcode lookup result */}
      {barcodeResult && (
        <button type="button" onClick={() => selectUsda(barcodeResult)}
          className="w-full text-left bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform">
          <span className="text-xl shrink-0">{getFoodEmoji(barcodeResult.name)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{barcodeResult.name}</span>
              <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/15 text-green-500 shrink-0">Barcode</span>
            </div>
            {barcodeResult.brand && <div className="text-[10px] text-text-muted truncate">{barcodeResult.brand}</div>}
            <div className="text-[10px] text-text-muted">
              Per 100g: {barcodeResult.caloriesPer100g} cal · P{barcodeResult.proteinPer100g}g · C{barcodeResult.carbsPer100g}g · F{barcodeResult.fatPer100g}g
            </div>
          </div>
          <ChevronRight size={14} className="text-green-500 shrink-0" />
        </button>
      )}

      {barcodeSearching && <div className="flex items-center justify-center py-3"><Loader2 size={16} className="animate-spin text-text-muted" /> <span className="text-xs text-text-muted ml-2">Looking up barcode...</span></div>}

      {barcodeError && !showManualForBarcode && (
        <div className="space-y-2">
          <p className="text-[10px] text-danger text-center">{barcodeError}</p>
          {profileId && (
            <button
              type="button"
              onClick={() => setShowManualForBarcode(true)}
              className="w-full bg-surface rounded-xl py-2.5 text-sm font-medium text-text-secondary flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Add product manually →
            </button>
          )}
        </div>
      )}

      {showManualForBarcode && profileId && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowManualForBarcode(false)}
            className="flex items-center gap-1.5 text-xs text-text-muted"
          >
            <ArrowLeft size={12} /> Back to scan
          </button>
          <ManualEntry
            onAdd={(entry) => { onAdd(entry); setShowManualForBarcode(false); }}
            onClose={() => setShowManualForBarcode(false)}
            onSaved={() => {
              setShowManualForBarcode(false);
              setBarcodeError('');
              handleBarcodeLookup(barcodeQuery);
            }}
            profileId={profileId}
            initialBarcode={barcodeQuery}
          />
        </div>
      )}

      {/* Search results */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {localResults.map((item, i) => (
          <button key={`local-${item.name}-${i}`} type="button" onClick={() => selectLocal(item)}
            className="w-full text-left p-2.5 rounded-xl hover:bg-surface-raised transition-colors flex items-center gap-3">
            <span className="text-base shrink-0">{getFoodEmoji(item.name)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{item.name}</span>
                {item.isHistory && <span className="text-[9px] px-1 py-0.5 rounded bg-surface text-text-muted shrink-0 flex items-center gap-0.5"><Clock size={8} /> Recent</span>}
                {item.category && !item.isHistory && <span className="text-[9px] px-1 py-0.5 rounded bg-surface text-text-muted shrink-0">{item.category}</span>}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">
                {Math.round(item.calories)} cal · P{Math.round(item.protein)}g · C{Math.round(item.carbs)}g · F{Math.round(item.fat)}g · {item.servingSize}{item.servingUnit}
              </div>
            </div>
            <ChevronRight size={14} className="text-text-muted/30 shrink-0" />
          </button>
        ))}

        {usdaResults.length > 0 && (
          <>
            {localResults.length > 0 && <div className="text-[9px] text-text-muted font-semibold uppercase tracking-wider px-2 pt-2">USDA Database</div>}
            {usdaResults.map((food) => (
              <button key={food.fdcId} type="button" onClick={() => selectUsda(food)}
                className="w-full text-left p-2.5 rounded-xl hover:bg-surface-raised transition-colors flex items-center gap-3">
                <span className="text-base shrink-0">{getFoodEmoji(food.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{food.name}</span>
                    <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/15 text-green-500 shrink-0">{food.source === 'off' ? 'OFF' : 'USDA'}</span>
                  </div>
                  {food.brand && <div className="text-[10px] text-text-muted truncate">{food.brand}</div>}
                  <div className="text-[10px] text-text-muted mt-0.5">
                    Per 100g: {food.caloriesPer100g} cal · P{food.proteinPer100g}g · C{food.carbsPer100g}g · F{food.fatPer100g}g
                  </div>
                </div>
                <ChevronRight size={14} className="text-text-muted/30 shrink-0" />
              </button>
            ))}
          </>
        )}

        {localResults.length === 0 && usdaResults.length === 0 && query.trim() && !usdaSearching && !barcodeSearching && (
          <p className="text-sm text-text-muted text-center py-4">No results found</p>
        )}
      </div>

      {usdaError && <p className="text-[10px] text-danger text-center">{usdaError}</p>}

      {!query.trim() && !showScanner && !barcodeResult && (
        <p className="text-[11px] text-text-muted text-center">Search {FOOD_DATABASE.length}+ foods, USDA database, or scan a barcode</p>
      )}
    </div>
  );
}
