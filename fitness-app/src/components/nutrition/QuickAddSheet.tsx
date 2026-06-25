import { useState, useEffect, useCallback } from 'react';
import { Search, UtensilsCrossed, Camera, ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { FoodSearch } from './FoodSearch';
import { AIFoodScanner } from './AIFoodScanner';
import { ManualEntry } from './ManualEntry';
import { getApiKey } from '../../utils/apiKeyManager';
import { getFoodEntriesByDate } from '../../db/nutrition';
import { getFoodEmoji } from '../../utils/foodEmoji';
import type { FoodEntry } from '../../types';
import type { SavedMeal } from '../../db/savedMeals';
import { toast } from '../shared/Toast';

type AddTab = 'search' | 'meals' | 'manual' | 'ai';

interface PrevMealGroup {
  label: string;
  date: string;
  time: string;
  items: FoodEntry[];
}

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  profileId: string;
  initialTime: string;
  selectedDate: string;
  addEntry: (entry: Omit<FoodEntry, 'id' | 'profileId'>) => void;
  onClose: () => void;
  savedMeals: SavedMeal[];
  dailyTotals?: DailyTotals;
  macroTargets?: DailyTotals;
}

function buildLoggedAt(timeHHMM: string, date: string): string {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function QuickAddSheet({ profileId, initialTime, selectedDate, addEntry, onClose, savedMeals, dailyTotals, macroTargets }: Props) {
  const [time, setTime] = useState(initialTime);
  const [activeTab, setActiveTab] = useState<AddTab>('search');
  const [prevMealGroups, setPrevMealGroups] = useState<PrevMealGroup[]>([]);
  const [showPrevMeals, setShowPrevMeals] = useState(false);
  const [copyingMeal, setCopyingMeal] = useState(false);
  const hasAI = !!getApiKey();

  useEffect(() => {
    setTime(initialTime);
  }, [initialTime]);

  useEffect(() => {
    if (activeTab !== 'meals' || prevMealGroups.length > 0) return;
    (async () => {
      const groups: PrevMealGroup[] = [];
      const dayLabels = ['Yesterday', '2 days ago', '3 days ago'];
      for (let dOffset = 1; dOffset <= 3; dOffset++) {
        const date = new Date();
        date.setDate(date.getDate() - dOffset);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayEntries = await getFoodEntriesByDate(profileId, dateStr);
        const byHour: Record<string, FoodEntry[]> = {};
        for (const e of dayEntries) {
          const hour = e.loggedAt ? new Date(e.loggedAt).getHours() : 8;
          const slot = `${String(hour).padStart(2, '0')}:00`;
          (byHour[slot] = byHour[slot] || []).push(e);
        }
        for (const [slot, items] of Object.entries(byHour).sort()) {
          if (items.length === 0) continue;
          const h = parseInt(slot);
          const label = `${dayLabels[dOffset - 1]} ${h < 12 ? 'AM' : 'PM'} (${h === 0 ? '12' : h > 12 ? h - 12 : h}:00${h < 12 ? 'am' : 'pm'})`;
          groups.push({ label, date: dateStr, time: slot, items });
        }
      }
      setPrevMealGroups(groups);
    })();
  }, [activeTab, profileId, prevMealGroups.length]);

  const addWithTime = useCallback((entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => {
    addEntry({ ...entry, date: selectedDate, loggedAt: buildLoggedAt(time, selectedDate) });
  }, [time, selectedDate, addEntry]);

  const copyMeal = async (group: PrevMealGroup) => {
    setCopyingMeal(true);
    for (const item of group.items) {
      addEntry({
        date: selectedDate,
        loggedAt: buildLoggedAt(time, selectedDate),
        name: item.name, brand: item.brand,
        servingSize: item.servingSize, servingUnit: item.servingUnit,
        servingsConsumed: item.servingsConsumed,
        calories: item.calories, protein: item.protein,
        carbs: item.carbs, fat: item.fat, fiber: item.fiber,
        source: item.source, fdcId: item.fdcId, mealType: item.mealType,
      });
    }
    setCopyingMeal(false);
    onClose();
    toast(`Added ${group.items.length} items from ${group.label}`, 'success');
  };

  const tabs: { key: AddTab; label: string; icon: typeof Search }[] = [
    { key: 'search', label: 'Search', icon: Search },
    { key: 'meals', label: 'Meals', icon: UtensilsCrossed },
    { key: 'manual', label: 'Manual', icon: PenLine },
    ...(hasAI ? [{ key: 'ai' as AddTab, label: 'AI Scan', icon: Camera }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* Time picker */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-text-muted shrink-0 font-medium">Time</label>
        <input
          type="time"
          className="input-field text-sm flex-1"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === t.key ? 'bg-surface-raised text-text-primary' : 'text-text-muted'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search tab */}
      {activeTab === 'search' && (
        <FoodSearch
          onAdd={addWithTime}
          onClose={onClose}
          profileId={profileId}
          multiMode={true}
        />
      )}

      {/* Meals tab */}
      {activeTab === 'meals' && (
        <div className="space-y-4">
          {savedMeals.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-1">Saved Meals</div>
              {savedMeals.map((meal) => (
                <button
                  key={meal.id}
                  onClick={() => {
                    addWithTime({
                      date: selectedDate,
                      name: meal.name,
                      servingSize: meal.servingSize,
                      servingUnit: meal.servingUnit,
                      servingsConsumed: 1,
                      calories: meal.calories,
                      protein: meal.protein,
                      carbs: meal.carbs,
                      fat: meal.fat,
                      fiber: meal.fiber,
                      source: 'manual',
                      mealType: 'snack',
                    });
                    toast(`Added ${meal.name}`, 'success');
                  }}
                  className="w-full bg-surface rounded-xl px-3 py-2.5 flex items-center justify-between text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getFoodEmoji(meal.name)}</span>
                    <span className="text-sm font-medium">{meal.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-accent-orange">{meal.calories} cal</div>
                    <div className="text-[10px] text-text-muted">P{meal.protein}·C{meal.carbs}·F{meal.fat}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {prevMealGroups.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowPrevMeals((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface text-left"
              >
                <span className="text-xs font-medium text-text-secondary">Copy a previous meal</span>
                <span className="text-[10px] text-text-muted flex items-center gap-1">
                  {showPrevMeals ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {prevMealGroups.length} recent
                </span>
              </button>
              {showPrevMeals && (
                <div className="space-y-1.5 mt-1.5">
                  {prevMealGroups.map((group, i) => {
                    const groupCal = group.items.reduce((s, e) => s + e.calories, 0);
                    const groupP = group.items.reduce((s, e) => s + e.protein, 0);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={copyingMeal}
                        onClick={() => copyMeal(group)}
                        className="w-full bg-surface rounded-xl px-3 py-2.5 flex items-center justify-between text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        <div>
                          <div className="text-xs font-medium">{group.label}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            {group.items.length} item{group.items.length > 1 ? 's' : ''} ·{' '}
                            {group.items.map((e) => e.name).join(', ').slice(0, 50)}
                            {group.items.map((e) => e.name).join(', ').length > 50 ? '…' : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className="text-xs font-semibold text-accent-orange">{Math.round(groupCal)} cal</div>
                          <div className="text-[10px] text-accent-blue">P{Math.round(groupP)}g</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {savedMeals.length === 0 && prevMealGroups.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">
              No saved meals yet. Foods you save to My Foods will appear here.
            </p>
          )}
        </div>
      )}

      {/* Manual tab */}
      {activeTab === 'manual' && (
        <ManualEntry
          onAdd={addWithTime}
          onClose={onClose}
          profileId={profileId}
          dailyTotals={dailyTotals}
          macroTargets={macroTargets}
        />
      )}

      {/* AI tab */}
      {activeTab === 'ai' && hasAI && (
        <AIFoodScanner onAdd={addWithTime} onClose={onClose} />
      )}
    </div>
  );
}
