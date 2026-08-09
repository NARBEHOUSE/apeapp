import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Barcode } from 'lucide-react';
import type { FoodEntry } from '../../types';
import { FoodAutocomplete, type SelectedFood } from './FoodAutocomplete';
import { saveFoodToHistory } from '../../db/foodHistory';
import { macroStatusColor } from '../../utils/macroColors';
import { type ServingUnit, SERVING_UNITS, servingToGrams, convertServingUnit, normaliseServingUnit } from '../../utils/units';

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface ManualEntryProps {
  onAdd: (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => void;
  onClose: () => void;
  profileId: string;
  dailyTotals?: DailyTotals;
  macroTargets?: DailyTotals;
  saveOnly?: boolean;
  initialBarcode?: string;
  onSaved?: () => void;
}

function calcCalories(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

interface BasePer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function ManualEntry({ onAdd, onClose, profileId, dailyTotals, macroTargets, saveOnly = false, initialBarcode, onSaved }: ManualEntryProps) {
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [calorieOverride, setCalorieOverride] = useState('');
  const [useManualCal, setUseManualCal] = useState(false);
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('g');
  const [servingsConsumed, setServingsConsumed] = useState('1');
  const [mealType, setMealType] = useState<FoodEntry['mealType']>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
  });
  const [selectedSource, setSelectedSource] = useState<FoodEntry['source']>('manual');
  const [selectedBrand, setSelectedBrand] = useState<string | undefined>();
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const barcodeScannerRef = useRef<HTMLDivElement>(null);
  const barcodeScannerInstanceRef = useRef<unknown>(null);

  const stopBarcodeScanner = useCallback(() => {
    const s = barcodeScannerInstanceRef.current as { stop: () => Promise<void> } | null;
    if (s) s.stop().catch(() => {});
    barcodeScannerInstanceRef.current = null;
    setShowBarcodeScanner(false);
  }, []);

  const startBarcodeScanner = async () => {
    setShowBarcodeScanner(true);
    await new Promise((r) => setTimeout(r, 200));
    if (!barcodeScannerRef.current) return;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const id = 'manual-barcode-scanner';
      barcodeScannerRef.current.id = id;
      barcodeScannerRef.current.innerHTML = '';
      const scanner = new Html5Qrcode(id);
      barcodeScannerInstanceRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 1.0 },
        (code: string) => {
          scanner.stop().catch(() => {});
          barcodeScannerInstanceRef.current = null;
          setShowBarcodeScanner(false);
          setBarcode(code);
        },
        () => {},
      );
    } catch {
      setShowBarcodeScanner(false);
    }
  };

  useEffect(() => { return () => { stopBarcodeScanner(); }; }, [stopBarcodeScanner]);

  // Base rates from selected food (per gram) — used to recalculate when serving size changes
  const [basePer100g, setBasePer100g] = useState<BasePer100g | null>(null);
  const [, setBaseServingGrams] = useState<number>(0);

  const [databaseCalories, setDatabaseCalories] = useState<number | null>(null);

  const p = parseFloat(protein) || 0;
  const c = parseFloat(carbs) || 0;
  const f = parseFloat(fat) || 0;

  const calculatedCal = useMemo(() => calcCalories(p, c, f), [p, c, f]);
  const displayCal = useManualCal
    ? (parseFloat(calorieOverride) || 0)
    : (databaseCalories != null ? databaseCalories : calculatedCal);
  const canSubmit = name.trim() && (p > 0 || c > 0 || f > 0 || displayCal > 0);

  function handleFoodSelect(food: SelectedFood) {
    setName(food.name);
    setSelectedSource(food.source);
    setSelectedBrand(food.brand);
    setUseManualCal(false);
    setCalorieOverride('');

    const unit = normaliseServingUnit(food.servingUnit);
    setServingUnit(unit);

    const servingRaw = food.servingSize;
    setServingSize(String(servingRaw));
    setBaseServingGrams(servingRaw);

    // Normalize to per-100g so recalculation works correctly regardless of unit
    const servingInGrams = servingToGrams(servingRaw, unit === 'oz' ? 'oz' : 'g');
    if (servingInGrams > 0) {
      setBasePer100g({
        calories: (food.calories / servingInGrams) * 100,
        protein: (food.protein / servingInGrams) * 100,
        carbs: (food.carbs / servingInGrams) * 100,
        fat: (food.fat / servingInGrams) * 100,
        fiber: ((food.fiber || 0) / servingInGrams) * 100,
      });
    }

    setDatabaseCalories(Math.round(food.calories));
    setProtein(String(Math.round(food.protein * 10) / 10));
    setCarbs(String(Math.round(food.carbs * 10) / 10));
    setFat(String(Math.round(food.fat * 10) / 10));
    setFiber(food.fiber != null ? String(Math.round(food.fiber * 10) / 10) : '');
  }

  // When serving size changes and we have base rates, recalculate macros + calories
  const handleServingSizeChange = useCallback((value: string) => {
    setServingSize(value);
    if (!basePer100g) return;

    const rawAmount = parseFloat(value) || 0;
    if (rawAmount <= 0) return;

    // Convert to grams so basePer100g (always per 100g) gives correct macros
    const grams = servingToGrams(rawAmount, servingUnit);
    const factor = grams / 100;
    setProtein(String(Math.round(basePer100g.protein * factor * 10) / 10));
    setCarbs(String(Math.round(basePer100g.carbs * factor * 10) / 10));
    setFat(String(Math.round(basePer100g.fat * factor * 10) / 10));
    setDatabaseCalories(Math.round(basePer100g.calories * factor));
    if (basePer100g.fiber > 0) {
      setFiber(String(Math.round(basePer100g.fiber * factor * 10) / 10));
    }
  }, [basePer100g, servingUnit]);

  // When unit changes, convert the serving size number (g↔oz only; cup/serving have no reliable factor)
  const handleServingUnitChange = useCallback((newUnit: ServingUnit) => {
    const converted = convertServingUnit(parseFloat(servingSize) || 0, servingUnit, newUnit);
    setServingUnit(newUnit);
    if (converted !== (parseFloat(servingSize) || 0)) setServingSize(String(converted));
    // Macros remain unchanged — same food amount, different unit label
  }, [servingUnit, servingSize]);

  function buildFoodData() {
    const parsedProtein = parseFloat(protein) || 0;
    const parsedCarbs = parseFloat(carbs) || 0;
    const parsedFat = parseFloat(fat) || 0;
    const parsedFiber = fiber ? parseFloat(fiber) : undefined;
    const parsedServingSize = parseFloat(servingSize) || 1;
    return { parsedProtein, parsedCarbs, parsedFat, parsedFiber, parsedServingSize };
  }

  function handleSaveToLibrary() {
    if (!canSubmit) return;
    const { parsedProtein, parsedCarbs, parsedFat, parsedFiber, parsedServingSize } = buildFoodData();
    saveFoodToHistory(profileId, {
      name: name.trim(), brand: selectedBrand, calories: displayCal,
      protein: parsedProtein, carbs: parsedCarbs, fat: parsedFat, fiber: parsedFiber,
      servingSize: parsedServingSize, servingUnit, source: selectedSource,
      barcode: barcode.trim() || undefined,
    });
    onSaved?.();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const { parsedProtein, parsedCarbs, parsedFat, parsedFiber, parsedServingSize } = buildFoodData();
    saveFoodToHistory(profileId, {
      name: name.trim(), brand: selectedBrand, calories: displayCal,
      protein: parsedProtein, carbs: parsedCarbs, fat: parsedFat, fiber: parsedFiber,
      servingSize: parsedServingSize, servingUnit, source: selectedSource,
      barcode: barcode.trim() || undefined,
    });
    onAdd({
      date: new Date().toISOString().split('T')[0],
      name: name.trim(), brand: selectedBrand, servingSize: parsedServingSize, servingUnit,
      servingsConsumed: parseFloat(servingsConsumed) || 1, calories: displayCal,
      protein: parsedProtein, carbs: parsedCarbs, fat: parsedFat, fiber: parsedFiber,
      source: selectedSource, mealType,
    });
    onClose();
  }

  const numServings = parseFloat(servingsConsumed) || 1;

  return (
    <div className="space-y-4">
      {/* Food search */}
      <div>
        <label className="label mb-1 block">Food</label>
        <FoodAutocomplete
          profileId={profileId}
          onSelect={handleFoodSelect}
          onQueryChange={(q) => setName(q)}
          onAddNew={(q) => setName(q)}
          placeholder="Search or type food name"
        />
      </div>

      {/* Serving size — this drives macro recalculation */}
      <div>
        <label className="label mb-1.5 block">Amount</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            className="input-field text-sm py-2.5 flex-1"
            placeholder="100"
            value={servingSize}
            onChange={(e) => handleServingSizeChange(e.target.value)}
          />
          <select
            className="input-field text-sm py-2.5 w-16"
            value={servingUnit}
            onChange={(e) => handleServingUnitChange(e.target.value as ServingUnit)}
          >
            {SERVING_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          <span className="text-text-muted text-sm px-1">×</span>
          <input
            type="number"
            inputMode="decimal"
            className="input-field text-sm py-2.5 w-14 text-center"
            placeholder="1"
            value={servingsConsumed}
            onChange={(e) => setServingsConsumed(e.target.value)}
          />
        </div>
        {basePer100g && (
          <div className="text-[0.625rem] text-text-muted mt-1">
            Macros scale with amount · {basePer100g.protein.toFixed(1)}p / {basePer100g.carbs.toFixed(1)}c / {basePer100g.fat.toFixed(1)}f per 100g · unit converts automatically
          </div>
        )}
      </div>

      {/* Calories */}
      <div className="bg-surface rounded-xl p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold">{Math.round(displayCal * numServings)}</span>
          <span className="text-[0.625rem] text-text-muted uppercase tracking-wider">
            {numServings > 1 ? `${displayCal} × ${numServings}` : 'calories'}
          </span>
        </div>
        {!useManualCal ? (
          <button
            onClick={() => { setUseManualCal(true); setCalorieOverride(String(calculatedCal || '')); }}
            className="text-[0.625rem] text-text-muted mt-1 underline"
          >
            Enter calories manually
          </button>
        ) : (
          <div className="mt-2 space-y-1.5">
            <input
              type="number"
              inputMode="decimal"
              className="input-field text-sm"
              placeholder="Calories"
              value={calorieOverride}
              onChange={(e) => setCalorieOverride(e.target.value)}
            />
            <button onClick={() => setUseManualCal(false)} className="text-[0.625rem] text-text-muted underline">
              Auto-calculate from macros
            </button>
          </div>
        )}
      </div>

      {/* Macros */}
      {basePer100g && (
        <div className="text-[0.5625rem] text-accent-blue text-center">Macros auto-scale with serving size · <button type="button" onClick={() => setBasePer100g(null)} className="underline">Unlock to edit</button></div>
      )}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <div className="text-[0.5625rem] text-text-muted text-center mb-1">Protein</div>
          <input
            type="text"
            inputMode="decimal"
            className={`input-field text-center text-sm py-2 ${basePer100g ? 'text-text-muted' : ''}`}
            placeholder="0"
            value={protein}
            readOnly={!!basePer100g}
            onChange={(e) => { setProtein(e.target.value); setDatabaseCalories(null); }}
          />
        </div>
        <div>
          <div className="text-[0.5625rem] text-text-muted text-center mb-1">Carbs</div>
          <input
            type="text"
            inputMode="decimal"
            className={`input-field text-center text-sm py-2 ${basePer100g ? 'text-text-muted' : ''}`}
            placeholder="0"
            value={carbs}
            readOnly={!!basePer100g}
            onChange={(e) => { setCarbs(e.target.value); setDatabaseCalories(null); }}
          />
        </div>
        <div>
          <div className="text-[0.5625rem] text-text-muted text-center mb-1">Fat</div>
          <input
            type="text"
            inputMode="decimal"
            className={`input-field text-center text-sm py-2 ${basePer100g ? 'text-text-muted' : ''}`}
            placeholder="0"
            value={fat}
            readOnly={!!basePer100g}
            onChange={(e) => { setFat(e.target.value); setDatabaseCalories(null); }}
          />
        </div>
        <div>
          <div className="text-[0.5625rem] text-text-muted text-center mb-1">Fiber</div>
          <input
            type="text"
            inputMode="decimal"
            className={`input-field text-center text-sm py-2 ${basePer100g ? 'text-text-muted' : ''}`}
            placeholder="0"
            value={fiber}
            readOnly={!!basePer100g}
            onChange={(e) => setFiber(e.target.value)}
          />
          <div className="text-[0.5rem] text-text-muted text-center mt-0.5">g</div>
        </div>
      </div>

      {/* Live remaining macros */}
      {dailyTotals && macroTargets && (
        <div className="bg-surface rounded-xl p-3 space-y-2">
          <div className="text-[0.625rem] text-text-muted uppercase tracking-wider font-medium">After adding this</div>
          {([
            { key: 'calories' as const, label: 'Cal', color: '#f5a623', value: Math.round(displayCal * numServings) },
            { key: 'protein' as const, label: 'Protein', color: '#2e9e6b', value: Math.round(p * numServings) },
            { key: 'carbs' as const, label: 'Carbs', color: '#5b6ef5', value: Math.round(c * numServings) },
            { key: 'fat' as const, label: 'Fat', color: '#e8572a', value: Math.round(f * numServings) },
          ]).map((m) => {
            const current = dailyTotals[m.key] + m.value;
            const target = macroTargets[m.key];
            const remaining = target - current;
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const over = current > target;
            const statusColor = macroStatusColor(current, target);
            return (
              <div key={m.key} className="space-y-0.5">
                <div className="flex justify-between text-[0.6875rem]">
                  <span className="text-text-secondary">{m.label}</span>
                  <span className="font-medium" style={{ color: statusColor }}>
                    {over ? `+${Math.abs(Math.round(remaining))} over` : `${Math.round(remaining)} left`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: statusColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Meal type — hidden in save-only mode */}
      {!saveOnly && (
        <div>
          <label className="label mb-1.5 block">Meal</label>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { value: 'breakfast' as const, label: '🌅 Breakfast' },
              { value: 'lunch' as const, label: '☀️ Lunch' },
              { value: 'dinner' as const, label: '🌙 Dinner' },
              { value: 'snack' as const, label: '🍿 Snack' },
            ]).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMealType(m.value)}
                className={`py-2 rounded-lg text-[0.6875rem] font-medium transition-colors ${
                  mealType === m.value ? 'bg-surface-raised text-text-primary' : 'text-text-muted'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Optional barcode */}
      <div>
        <label className="label mb-1 block">Barcode (optional)</label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            className="input-field text-sm flex-1"
            placeholder="UPC barcode for future scanning"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <button
            type="button"
            onClick={showBarcodeScanner ? stopBarcodeScanner : startBarcodeScanner}
            className={`px-3 rounded-xl flex items-center justify-center transition-colors shrink-0 ${showBarcodeScanner ? 'bg-accent text-white' : 'bg-surface'}`}
          >
            <Barcode size={18} />
          </button>
        </div>
        {showBarcodeScanner && (
          <div className="mt-2 space-y-1">
            <div ref={barcodeScannerRef} className="rounded-xl overflow-hidden bg-black" style={{ minHeight: 160 }} />
            <p className="text-[0.625rem] text-text-muted text-center">Point camera at barcode — fills the field automatically</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm">
          Cancel
        </button>
        {saveOnly ? (
          <button type="button" onClick={handleSaveToLibrary} disabled={!canSubmit} className="btn-primary flex-1 text-sm disabled:opacity-30">
            Save to Library
          </button>
        ) : (
          <>
            <button type="button" onClick={handleSaveToLibrary} disabled={!canSubmit} className="btn-secondary flex-1 text-sm disabled:opacity-30">
              Save to Library
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="btn-primary flex-1 text-sm disabled:opacity-30">
              Add to Log
            </button>
          </>
        )}
      </div>
      {!saveOnly && (
        <p className="text-[0.5rem] text-text-muted text-center -mt-1">Adding to log also saves to your library</p>
      )}
    </div>
  );
}
