import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Database, Search, X } from 'lucide-react';
import { searchSavedFoods, getFrequentFoods } from '../../db/foodHistory';
import { FOOD_DATABASE, type BuiltInFood } from '../../data/foods';

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
  source: 'manual' | 'usda' | 'ai_vision' | 'builtin';
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

export function FoodAutocomplete({ profileId, onSelect, onQueryChange, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showFrequent, setShowFrequent] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

      // Merge: history first, then built-in
      const merged = [...historyResults, ...builtinResults].slice(
        0,
        MAX_RESULTS
      );
      setResults(merged);
      setIsOpen(true);
      setShowFrequent(false);
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
      source: item.source,
      isFromHistory: item.isFromHistory,
    };
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

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-surface-raised rounded-xl shadow-lg max-h-64 overflow-y-auto border border-border">
          {showFrequent && results.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5">
              <span className="label">Frequent Foods</span>
            </div>
          )}

          {results.length === 0 && query.trim() && (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-text-secondary">
                No matches — add as new food
              </p>
            </div>
          )}

          {results.map((item, i) => (
            <button
              key={`${item.name}-${item.source}-${i}`}
              type="button"
              onClick={() => handleSelect(item)}
              className={`w-full text-left px-3 py-2.5 hover:bg-surface cursor-pointer transition-colors ${
                i < results.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
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
                    {Math.round(item.calories)} cal {'·'}{' '}
                    {Math.round(item.protein)}p {'·'}{' '}
                    {Math.round(item.carbs)}c {'·'}{' '}
                    {Math.round(item.fat)}f
                    <span className="ml-1.5 text-text-secondary">
                      {'·'} {item.servingSize}
                      {item.servingUnit}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
