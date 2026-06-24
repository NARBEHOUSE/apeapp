import { useState, useRef } from 'react';
import { Star, Trash2, Coffee, Sun, Moon, Cookie } from 'lucide-react';
import type { FoodEntry } from '../../types';

interface FoodLogProps {
  entries: FoodEntry[];
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const mealConfig: { type: FoodEntry['mealType']; label: string; icon: typeof Coffee }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: Coffee },
  { type: 'lunch', label: 'Lunch', icon: Sun },
  { type: 'dinner', label: 'Dinner', icon: Moon },
  { type: 'snack', label: 'Snacks', icon: Cookie },
];

interface SwipeableEntryProps {
  entry: FoodEntry;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

function SwipeableEntry({ entry, onDelete, onToggleFavorite }: SwipeableEntryProps) {
  const [swiped, setSwiped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchStartX.current - touchCurrentX.current;
    if (diff > 10 && containerRef.current) {
      const offset = Math.min(diff, 80);
      containerRef.current.style.transform = `translateX(-${offset}px)`;
    }
  }

  function handleTouchEnd() {
    const diff = touchStartX.current - touchCurrentX.current;
    if (diff > 60) {
      setSwiped(true);
      if (containerRef.current) {
        containerRef.current.style.transform = 'translateX(-80px)';
      }
    } else {
      setSwiped(false);
      if (containerRef.current) {
        containerRef.current.style.transform = 'translateX(0)';
      }
    }
  }

  function handleClickOutside() {
    if (swiped) {
      setSwiped(false);
      if (containerRef.current) {
        containerRef.current.style.transform = 'translateX(0)';
      }
    }
  }

  const macros = {
    calories: Math.round(entry.calories * entry.servingsConsumed),
    protein: Math.round(entry.protein * entry.servingsConsumed * 10) / 10,
    carbs: Math.round(entry.carbs * entry.servingsConsumed * 10) / 10,
    fat: Math.round(entry.fat * entry.servingsConsumed * 10) / 10,
    fiber: entry.fiber ? Math.round((entry.fiber) * entry.servingsConsumed * 10) / 10 : 0,
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete button behind */}
      <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-danger">
        <button
          type="button"
          onClick={() => { setConfirming(true); setSwiped(false); if (containerRef.current) containerRef.current.style.transform = 'translateX(0)'; }}
          className="p-2"
        >
          <Trash2 size={18} className="text-white" />
        </button>
      </div>

      {/* Entry content */}
      <div
        ref={containerRef}
        className="relative bg-surface-raised p-3 transition-transform duration-200 ease-out z-10"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClickOutside}
      >
        <div className="flex items-center gap-3">
          {/* Star */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(entry.id);
            }}
            className="flex-shrink-0"
          >
            <Star
              size={16}
              className={entry.isFavorite ? 'text-nutrition fill-nutrition' : 'text-text-muted'}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">
                {entry.name}
              </span>
              {entry.brand && (
                <span className="text-xs text-text-muted truncate">{entry.brand}</span>
              )}
            </div>
            <div className="flex gap-2.5 text-xs text-text-secondary mt-0.5">
              <span className="text-accent-orange font-medium">{macros.calories} cal</span>
              <span>P {macros.protein}g</span>
              <span>C {macros.carbs}g</span>
              <span>F {macros.fat}g</span>
              {macros.fiber > 0 && <span>Fb {macros.fiber}g</span>}
            </div>
          </div>

          {/* Desktop delete */}
          {confirming ? (
            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
                className="text-[11px] px-2 py-0.5 rounded bg-surface text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                className="text-[11px] px-2 py-0.5 rounded bg-danger text-white hover:bg-danger/80 transition-colors"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-danger transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FoodLog({ entries, onDelete, onToggleFavorite }: FoodLogProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-text-muted text-sm">No food logged yet today</p>
      </div>
    );
  }

  const totalCalories = entries.reduce(
    (sum, e) => sum + Math.round(e.calories * e.servingsConsumed),
    0
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[11px] text-text-muted">{entries.length} entries</span>
        <span className="text-[11px] text-text-muted">{totalCalories} cal total</span>
      </div>
      {entries.map((entry) => (
        <SwipeableEntry
          key={entry.id}
          entry={entry}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
