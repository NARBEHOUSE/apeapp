import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, ChevronRight, Barcode, Globe, Database, Clock, Camera } from 'lucide-react';
import { searchFoods, lookupBarcode } from '../../utils/usda';
import { FOOD_DATABASE, type BuiltInFood } from '../../data/foods';
import { searchSavedFoods, saveFoodToHistory } from '../../db/foodHistory';
import { getFoodEmoji } from '../../utils/foodEmoji';
import type { FoodEntry } from '../../types';

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

interface FoodSearchProps {
  onAdd: (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => void;
  onClose: () => void;
  profileId?: string;
  defaultTab?: SearchTab;
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

export function FoodSearch({ onAdd, onClose, profileId, defaultTab }: FoodSearchProps) {

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
      setUsdaSearching(true);
      setUsdaError('');
      try {
        const foods = await searchFoods(query.trim());
        setUsdaResults(foods);
      } catch (err) {
        setUsdaError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setUsdaSearching(false);
      }
    }, 400);
    return () => { if (usdaTimerRef.current) clearTimeout(usdaTimerRef.current); };
  }, [query]);

  // Barcode lookup
  async function handleBarcodeLookup(directCode?: string) {
    const code = directCode || barcodeQuery.trim();
    if (!code) return;
    if (directCode) setBarcodeQuery(directCode);
    setBarcodeSearching(true);
    setBarcodeError('');
    setBarcodeResult(null);
    try {
      const result = await lookupBarcode(code);
      if (result) {
        setBarcodeResult(result);
      } else {
        setBarcodeError('No product found for this barcode.');
      }
    } catch {
      setBarcodeError('Lookup failed. Check your API key.');
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

  function handleAdd() {
    if (!selected) return;
    const sz = parseFloat(servingSize) || selected.servingSize;
    const qty = parseFloat(servingsConsumed) || 1;

    // For USDA foods, macros are per 100g and need scaling
    let finalCal = selected.calories;
    let finalP = selected.protein;
    let finalC = selected.carbs;
    let finalF = selected.fat;
    let finalFb = selected.fiber;

    if (selected.source === 'usda') {
      const factor = sz / 100;
      finalCal = Math.round(selected.calories * factor);
      finalP = Math.round(selected.protein * factor * 10) / 10;
      finalC = Math.round(selected.carbs * factor * 10) / 10;
      finalF = Math.round(selected.fat * factor * 10) / 10;
    }

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
    onClose();
  }

  // Selected food detail view
  if (selected) {
    const sz = parseFloat(servingSize) || selected.servingSize;
    const qty = parseFloat(servingsConsumed) || 1;
    let dispCal = selected.calories;
    let dispP = selected.protein;
    let dispC = selected.carbs;
    let dispF = selected.fat;

    if (selected.source === 'usda') {
      const factor = (sz / 100) * qty;
      dispCal = Math.round(selected.calories * factor);
      dispP = Math.round(selected.protein * factor * 10) / 10;
      dispC = Math.round(selected.carbs * factor * 10) / 10;
      dispF = Math.round(selected.fat * factor * 10) / 10;
    } else {
      dispCal = Math.round(selected.calories * qty);
      dispP = Math.round(selected.protein * qty * 10) / 10;
      dispC = Math.round(selected.carbs * qty * 10) / 10;
      dispF = Math.round(selected.fat * qty * 10) / 10;
    }

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Serving ({selected.servingUnit})</label>
            <input type="number" inputMode="decimal" className="input-field text-sm" value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
          </div>
          <div>
            <label className="label mb-1 block">Quantity</label>
            <input type="number" inputMode="decimal" className="input-field text-sm" value={servingsConsumed} onChange={(e) => setServingsConsumed(e.target.value)} />
          </div>
        </div>

        {/* Meal type */}
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

        <div className="bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
          <div><div className="text-lg font-bold text-accent-orange">{dispCal}</div><div className="text-[9px] text-text-muted">kcal</div></div>
          <div><div className="text-lg font-bold text-accent-blue">{dispP}g</div><div className="text-[9px] text-text-muted">protein</div></div>
          <div><div className="text-lg font-bold text-success">{dispC}g</div><div className="text-[9px] text-text-muted">carbs</div></div>
          <div><div className="text-lg font-bold text-nutrition">{dispF}g</div><div className="text-[9px] text-text-muted">fat</div></div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button type="button" onClick={handleAdd} className="btn-primary flex-1 text-sm">Add</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        <button onClick={() => setTab('search')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 ${tab === 'search' ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>
          <Search size={11} /> Search Foods
        </button>
        <button onClick={() => setTab('barcode')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 ${tab === 'barcode' ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>
          <Barcode size={11} /> Barcode
        </button>
      </div>

      {/* ========== UNIFIED SEARCH TAB ========== */}
      {tab === 'search' && (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text" className="input-field pl-9 text-sm" placeholder="Search foods..."
              value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
            />
            {usdaSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />}
          </div>

          <div className="space-y-1 max-h-72 overflow-y-auto">
            {/* Local results */}
            {localResults.map((item, i) => (
              <button key={`local-${item.name}-${i}`} type="button" onClick={() => selectLocal(item)}
                className="w-full text-left p-2.5 rounded-xl hover:bg-surface-raised transition-colors flex items-center gap-3">
                <span className="text-base shrink-0">{getFoodEmoji(item.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{item.name}</span>
                    {item.isHistory && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-surface text-text-muted shrink-0 flex items-center gap-0.5"><Clock size={8} /> Recent</span>
                    )}
                    {item.category && !item.isHistory && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-surface text-text-muted shrink-0">{item.category}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {Math.round(item.calories)} cal · P{Math.round(item.protein)}g · C{Math.round(item.carbs)}g · F{Math.round(item.fat)}g · {item.servingSize}{item.servingUnit}
                  </div>
                </div>
                <ChevronRight size={14} className="text-text-muted/30 shrink-0" />
              </button>
            ))}

            {/* USDA results */}
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
                        <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/15 text-green-500 shrink-0">USDA</span>
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

            {localResults.length === 0 && usdaResults.length === 0 && query.trim() && !usdaSearching && (
              <p className="text-sm text-text-muted text-center py-6">No results found</p>
            )}
          </div>

          {usdaError && <p className="text-[10px] text-danger text-center">{usdaError}</p>}

          {!query.trim() && (
            <p className="text-[11px] text-text-muted text-center">Search {FOOD_DATABASE.length}+ built-in foods, your history, and USDA database</p>
          )}
        </>
      )}

      {/* ========== BARCODE TAB ========== */}
      {tab === 'barcode' && (
        <BarcodeTab
          barcodeQuery={barcodeQuery}
          setBarcodeQuery={setBarcodeQuery}
          barcodeResult={barcodeResult}
          barcodeSearching={barcodeSearching}
          barcodeError={barcodeError}
          handleBarcodeLookup={handleBarcodeLookup}
          selectUsda={selectUsda}
        />
      )}
    </div>
  );
}

function BarcodeTab({ barcodeQuery, setBarcodeQuery, barcodeResult, barcodeSearching, barcodeError, handleBarcodeLookup, selectUsda }: {
  barcodeQuery: string;
  setBarcodeQuery: (v: string) => void;
  barcodeResult: ParsedFood | null;
  barcodeSearching: boolean;
  barcodeError: string;
  handleBarcodeLookup: (directCode?: string) => void;
  selectUsda: (food: ParsedFood) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  const startScanner = async () => {
    setScanning(true);
    // Wait for DOM to render the scanner container
    await new Promise((r) => setTimeout(r, 100));
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scannerId = 'barcode-scanner-region';
      if (scannerRef.current) {
        scannerRef.current.id = scannerId;
        scannerRef.current.innerHTML = '';
      }
      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 1.0 },
        (decodedText) => {
          scanner.stop().catch(() => {});
          setScanning(false);
          handleBarcodeLookup(decodedText);
        },
        () => {},
      );
    } catch (err) {
      console.error('Barcode scanner error:', err);
      setScanning(false);
    }
  };

  const stopScanner = () => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) scanner.stop().catch(() => {});
    setScanning(false);
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="space-y-3">
      {/* Camera scanner */}
      {scanning ? (
        <div className="space-y-2">
          <div ref={scannerRef} className="rounded-xl overflow-hidden bg-black" style={{ minHeight: 200 }} />
          <button onClick={stopScanner} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
            Stop Scanner
          </button>
        </div>
      ) : (
        <button onClick={startScanner} className="w-full bg-surface rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          <Camera size={16} className="text-accent-blue" />
          <span className="text-sm font-medium">Scan Barcode with Camera</span>
        </button>
      )}

      {/* Manual entry */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Barcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            inputMode="numeric"
            className="input-field pl-9 text-sm"
            placeholder="Or type UPC number..."
            value={barcodeQuery}
            onChange={(e) => setBarcodeQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup()}
          />
        </div>
        <button
          type="button"
          onClick={() => handleBarcodeLookup()}
          disabled={barcodeSearching || !barcodeQuery.trim()}
          className="btn-primary px-4 text-sm disabled:opacity-40"
        >
          {barcodeSearching ? <Loader2 size={14} className="animate-spin" /> : 'Lookup'}
        </button>
      </div>

      {barcodeError && <p className="text-sm text-danger text-center">{barcodeError}</p>}

      {barcodeResult && (
        <button
          type="button"
          onClick={() => selectUsda(barcodeResult)}
          className="w-full text-left bg-surface rounded-xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <span className="text-2xl">{getFoodEmoji(barcodeResult.name)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{barcodeResult.name}</div>
            {barcodeResult.brand && <div className="text-[10px] text-text-muted">{barcodeResult.brand}</div>}
            <div className="text-[10px] text-text-muted mt-0.5">
              Per 100g: {barcodeResult.caloriesPer100g} cal · P{barcodeResult.proteinPer100g}g · C{barcodeResult.carbsPer100g}g · F{barcodeResult.fatPer100g}g
            </div>
          </div>
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      )}

      {!barcodeSearching && !barcodeResult && !barcodeError && !scanning && (
        <div className="text-center py-4">
          <p className="text-[11px] text-text-muted">Point camera at a barcode or type the UPC number manually</p>
        </div>
      )}
    </div>
  );
}
