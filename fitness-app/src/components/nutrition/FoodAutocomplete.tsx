import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Database, Search, X, Pencil, Check, AlertCircle } from 'lucide-react';
import { searchSavedFoods, getFrequentFoods, updateSavedFood, updateSavedFoodLibraryOnly, saveAsNewFood, countFoodLogEntries } from '../../db/foodHistory';
import { FoodEditWarningModal } from '../shared/FoodEditWarningModal';
import { FOOD_DATABASE, type BuiltInFood } from '../../data/foods';
import { searchFoodsWithFallback as searchUSDA } from '../../utils/usda';

export interface SelectedFood {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  source: 'manual' | 'usda' | 'ai_vision' | 'builtin';
  isFromHistory: boolean;
}

interface Props {
  profileId: string;
  onSelect: (food: SelectedFood) => void;
  onQueryChange?: (query: string) => void;
  onAddNew?: (query: string) => void;
  placeholder?: string;
}

interface ResultItem {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: number;
  servingUnit: string;
  source: 'manual' | 'usda' | 'ai_vision' | 'builtin' | 'off';
  isFromHistory: boolean;
  frequency?: number;
  category?: string;
}

function convertBuiltIn(food: BuiltInFood): ResultItem {
  const factor = food.commonServing.grams / 100;
  return {
    name: food.name,
    calories: Math.round(food.per100g.calories * factor),
    protein: Math.round(food.per100g.protein * factor * 10) / 10,
    carbs: Math.round(food.per100g.carbs * factor * 10) / 10,
    fat: Math.round(food.per100g.fat * factor * 10) / 10,
    fiber: food.per100g.fiber != null
      ? Math.round(food.per100g.fiber * factor * 10) / 10
      : undefined,
    servingSize: food.commonServing.grams,
    servingUnit: 'g',
    source: 'builtin',
    isFromHistory: false,
    category: food.category,
  };
}

const MAX_RESULTS = 15;

export function FoodAutocomplete({ profileId, onSelect, onQueryChange, onAddNew, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showFrequent, setShowFrequent] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editCal, setEditCal] = useState('');
  const [editP, setEditP] = useState('');
  const [editC, setEditC] = useState('');
  const [editF, setEditF] = useState('');

  const [pendingEdit, setPendingEdit] = useState<{
    cal: number; p: number; c: number; f: number; idx: number; item: ResultItem;
  } | null>(null);
  const [affectedCount, setAffectedCount] = useState(0);
  const [showEditWarning, setShowEditWarning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const justSelectedRef = useRef(false);

  const usdaAbortRef = useRef<AbortController | null>(null);

  const computeResults = useCallback(
    (q: string) => {
      const trimmed = q.trim().toLowerCase();

      // Personal history results
      const historyFoods = searchSavedFoods(profileId, trimmed);
      const historyResults: ResultItem[] = historyFoods.map((f) => ({
        name: f.name,
        brand: f.brand,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        fiber: f.fiber,
        servingSize: f.servingSize,
        servingUnit: f.servingUnit,
        source: f.source,
        isFromHistory: true,
        frequency: f.frequency,
      }));

      // Built-in database results, deduplicated
      const historyNames = new Set(
        historyResults.map((r) => r.name.toLowerCase())
      );
      const words = trimmed.split(/\s+/);
      const builtinResults: ResultItem[] = FOOD_DATABASE.filter((food) => {
        if (historyNames.has(food.name.toLowerCase())) return false;
        const name = food.name.toLowerCase();
        return words.every((word) => name.includes(word));
      }).map(convertBuiltIn);

      // Show local results immediately
      const localMerged = [...historyResults, ...builtinResults].slice(0, MAX_RESULTS);
      setResults(localMerged);
      setIsOpen(true);
      setShowFrequent(false);

      // Fire async USDA search and merge when results arrive
      if (trimmed.length >= 2) {
        if (usdaAbortRef.current) usdaAbortRef.current.abort();
        const controller = new AbortController();
        usdaAbortRef.current = controller;

        searchUSDA(q.trim()).then((usdaFoods) => {
          if (controller.signal.aborted) return;
          const allLocalNames = new Set([
            ...historyResults.map((r) => r.name.toLowerCase()),
            ...builtinResults.map((r) => r.name.toLowerCase()),
          ]);
          const usdaResults: ResultItem[] = usdaFoods
            .filter((f) => !allLocalNames.has(f.name.toLowerCase()))
            .slice(0, 8)
            .map((f) => ({
              name: f.name,
              brand: f.brand,
              calories: f.caloriesPer100g,
              protein: f.proteinPer100g,
              carbs: f.carbsPer100g,
              fat: f.fatPer100g,
              fiber: f.fiberPer100g,
              servingSize: 100,
              servingUnit: 'g',
              source: (f.source ?? 'usda') as ResultItem['source'],
              isFromHistory: false,
              category: 'USDA',
            }));
          if (usdaResults.length > 0) {
            setResults((prev) => {
              const combined = [...prev, ...usdaResults];
              return combined.slice(0, MAX_RESULTS + 5);
            });
          }
        }).catch(() => {});
      }
    },
    [profileId]
  );

  const showFrequentFoods = useCallback(() => {
    const frequent = getFrequentFoods(profileId, 10);
    if (frequent.length > 0) {
      const items: ResultItem[] = frequent.map((f) => ({
        name: f.name,
        brand: f.brand,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        fiber: f.fiber,
        servingSize: f.servingSize,
        servingUnit: f.servingUnit,
        source: f.source,
        isFromHistory: true,
        frequency: f.frequency,
      }));
      setResults(items);
      setIsOpen(true);
      setShowFrequent(true);
    }
  }, [profileId]);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      if (document.activeElement === inputRef.current) {
        showFrequentFoods();
      } else {
        setResults([]);
        setIsOpen(false);
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      computeResults(query);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, computeResults, showFrequentFoods]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleSelect(item: ResultItem) {
    const food: SelectedFood = {
      name: item.name,
      brand: item.brand,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      source: item.source === 'off' ? 'usda' : item.source,
      isFromHistory: item.isFromHistory,
    };
    justSelectedRef.current = true;
    setQuery(item.name);
    setIsOpen(false);
    onSelect(food);
  }

  function handleFocus() {
    if (!query.trim()) {
      showFrequentFoods();
    } else if (results.length > 0) {
      setIsOpen(true);
    }
  }

  function handleClear() {
    setQuery('');
    onQueryChange?.('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function applyEdit(mode: 'all' | 'library' | 'copy') {
    if (!pendingEdit) return;
    const { cal, p, c, f, idx, item } = pendingEdit;
    const updates = { calories: cal, protein: p, carbs: c, fat: f };
    if (mode === 'all') {
      updateSavedFood(profileId, item.name, updates);
    } else if (mode === 'library') {
      updateSavedFoodLibraryOnly(profileId, item.name, updates);
    } else {
      saveAsNewFood(profileId, item.name, updates);
    }
    const updated = [...results];
    updated[idx] = { ...item, ...updates };
    setResults(updated);
    setEditingIdx(null);
    setShowEditWarning(false);
    setPendingEdit(null);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          className="input-field pl-9 pr-8"
          placeholder={placeholder || 'Search foods...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showEditWarning && pendingEdit && (
        <FoodEditWarningModal
          foodName={pendingEdit.item.name}
          affectedCount={affectedCount}
          onUpdateAll={() => applyEdit('all')}
          onLibraryOnly={() => applyEdit('library')}
          onSaveAsCopy={() => applyEdit('copy')}
          onCancel={() => { setShowEditWarning(false); setPendingEdit(null); }}
        />
      )}

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-surface-raised rounded-xl shadow-lg max-h-64 overflow-y-auto border border-border">
          {showFrequent && results.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5">
              <span className="label">Frequent Foods</span>
            </div>
          )}

          {results.length === 0 && query.trim() && (
            <div className="px-3 py-4 text-center">
              {onAddNew ? (
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); onAddNew(query.trim()); }}
                  className="text-sm text-accent-blue font-medium"
                >
                  No matches — add "{query.trim()}" manually
                </button>
              ) : (
                <p className="text-sm text-text-secondary">No matches found</p>
              )}
            </div>
          )}

          {results.map((item, i) => {
            const hasMacros = item.calories > 0 || item.protein > 0;
            const isEditing = editingIdx === i;

            if (isEditing) {
              return (
                <div key={`${item.name}-${item.source}-${i}`} className="px-3 py-2.5 border-b border-border space-y-2">
                  <div className="text-xs font-semibold">{item.name}</div>
                  <div className="grid grid-cols-4 gap-1">
                    <div><label className="text-[8px] text-text-muted">Cal</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editCal} onChange={(e) => setEditCal(e.target.value)} /></div>
                    <div><label className="text-[8px] text-text-muted">Prot</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editP} onChange={(e) => setEditP(e.target.value)} /></div>
                    <div><label className="text-[8px] text-text-muted">Carbs</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editC} onChange={(e) => setEditC(e.target.value)} /></div>
                    <div><label className="text-[8px] text-text-muted">Fat</label><input type="number" inputMode="decimal" className="input-field text-xs w-full py-1" value={editF} onChange={(e) => setEditF(e.target.value)} /></div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingIdx(null)} className="flex-1 py-1 rounded-md bg-surface-raised text-[10px] text-text-muted font-medium">Cancel</button>
                    <button type="button" onClick={async () => {
                      const cal = parseFloat(editCal) || 0;
                      const p = parseFloat(editP) || 0;
                      const c = parseFloat(editC) || 0;
                      const f = parseFloat(editF) || 0;
                      const count = await countFoodLogEntries(profileId, item.name);
                      if (count > 0) {
                        setPendingEdit({ cal, p, c, f, idx: i, item });
                        setAffectedCount(count);
                        setShowEditWarning(true);
                      } else {
                        updateSavedFood(profileId, item.name, { calories: cal, protein: p, carbs: c, fat: f });
                        const updated = [...results];
                        updated[i] = { ...item, calories: cal, protein: p, carbs: c, fat: f };
                        setResults(updated);
                        setEditingIdx(null);
                      }
                    }} className="flex-1 py-1 rounded-md bg-accent-blue text-white text-[10px] font-semibold flex items-center justify-center gap-1">
                      <Check size={10} /> Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
            <div
              key={`${item.name}-${item.source}-${i}`}
              className={`flex items-center px-3 py-2.5 hover:bg-surface transition-colors ${
                i < results.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              {!hasMacros && item.isFromHistory && <AlertCircle size={12} className="text-warning shrink-0 mr-1.5" />}
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="flex-1 min-w-0 text-left cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {item.name}
                  </span>
                  {item.isFromHistory ? (
                    <span className="flex items-center gap-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-text-secondary border border-border">
                      <Clock size={9} />
                      Recent
                      {item.frequency && item.frequency > 1 && (
                        <span className="ml-0.5">
                          {'·'} {item.frequency}x
                        </span>
                      )}
                    </span>
                  ) : item.category ? (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-text-secondary border border-border">
                      <Database size={9} />
                      {item.category}
                    </span>
                  ) : null}
                </div>
                {item.brand && (
                  <div className="text-[11px] text-text-secondary truncate">
                    {item.brand}
                  </div>
                )}
                <div className="text-[11px] text-text-muted mt-0.5">
                  {!hasMacros && item.isFromHistory ? (
                    <span className="text-warning">Missing macros</span>
                  ) : (
                    <>
                      {Math.round(item.calories)} cal {'·'}{' '}
                      {Math.round(item.protein)}p {'·'}{' '}
                      {Math.round(item.carbs)}c {'·'}{' '}
                      {Math.round(item.fat)}f
                      <span className="ml-1.5 text-text-secondary">
                        {'·'} {item.servingSize}
                        {item.servingUnit}
                      </span>
                    </>
                  )}
                </div>
              </button>
              {item.isFromHistory && (
                <button type="button" onClick={(e) => {
                  e.stopPropagation();
                  setEditingIdx(i);
                  setEditCal(String(item.calories)); setEditP(String(item.protein));
                  setEditC(String(item.carbs)); setEditF(String(item.fat));
                }} className="p-1.5 rounded-lg hover:bg-surface-raised shrink-0 ml-1">
                  <Pencil size={12} className="text-text-muted" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
