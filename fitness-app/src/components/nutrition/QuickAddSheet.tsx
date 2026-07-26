import { useState, useEffect, useCallback } from 'react';
import { Search, UtensilsCrossed, Camera, ChevronDown, ChevronUp, PenLine, BookmarkPlus } from 'lucide-react';
import { FoodSearch } from './FoodSearch';
import { AIFoodScanner } from './AIFoodScanner';
import { ManualEntry } from './ManualEntry';
import { getApiKey } from '../../utils/apiKeyManager';
import { getFoodEntriesByDate } from '../../db/nutrition';
import { getFoodEmoji } from '../../utils/foodEmoji';
import type { FoodEntry } from '../../types';
import { addSavedMeal, type SavedMeal, type MealIngredient } from '../../db/savedMeals';
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
  onSaveToLibrary?: () => void;
  onMealSaved?: () => void;
}

function groupTotals(group: PrevMealGroup) {
  return group.items.reduce((acc, e) => ({
    cal: acc.cal + e.calories * e.servingsConsumed,
    protein: acc.protein + e.protein * e.servingsConsumed,
    carbs: acc.carbs + e.carbs * e.servingsConsumed,
    fat: acc.fat + e.fat * e.servingsConsumed,
    fiber: acc.fiber + (e.fiber || 0) * e.servingsConsumed,
  }), { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

function buildLoggedAt(timeHHMM: string, date: string): string {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function QuickAddSheet({ profileId, initialTime, selectedDate, addEntry, onClose, savedMeals, dailyTotals, macroTargets, onSaveToLibrary, onMealSaved }: Props) {
  const [time, setTime] = useState(initialTime);
  const [activeTab, setActiveTab] = useState<AddTab>('search');
  const [prevMealGroups, setPrevMealGroups] = useState<PrevMealGroup[]>([]);
  const [showPrevMeals, setShowPrevMeals] = useState(false);
  const [copyingMeal, setCopyingMeal] = useState(false);
  const [savingGroupIndex, setSavingGroupIndex] = useState<number | null>(null);
  const [saveMealName, setSaveMealName] = useState('');
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
        ingredients: item.ingredients?.map((i) => ({ ...i })),
      });
    }
    setCopyingMeal(false);
    onClose();
    toast(`Added ${group.items.length} items from ${group.label}`, 'success');
  };

  const saveGroupAsMeal = (group: PrevMealGroup) => {
    const name = saveMealName.trim();
    if (!name) return;
    const ingredients: MealIngredient[] = group.items.map((item) => ({
      name: item.name,
      brand: item.brand,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      amount: item.servingSize * item.servingsConsumed,
    }));
    const totals = groupTotals(group);
    const totalGrams = ingredients.filter((ing) => ing.servingUnit === 'g').reduce((s, ing) => s + ing.amount, 0);
    addSavedMeal(profileId, {
      name,
      emoji: getFoodEmoji(name),
      calories: Math.round(totals.cal),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      fiber: totals.fiber ? Math.round(totals.fiber * 10) / 10 : undefined,
      servingSize: totalGrams || ingredients.reduce((s, ing) => s + ing.amount, 0),
      servingUnit: totalGrams ? 'g' : (ingredients[0]?.servingUnit || 'serving'),
      ingredients,
    });
    onMealSaved?.();
    setSavingGroupIndex(null);
    setSaveMealName('');
    toast(`Saved "${name}" to your meal list`, 'success');
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
          onSaveToLibrary={onSaveToLibrary}
          dailyTotals={dailyTotals}
          macroTargets={macroTargets}
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
                      ingredients: meal.ingredients?.map((i) => ({ ...i })),
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
                    <div className="text-[0.625rem] text-text-muted">P{meal.protein}·C{meal.carbs}·F{meal.fat}</div>
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
                <span className="text-[0.625rem] text-text-muted flex items-center gap-1">
                  {showPrevMeals ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {prevMealGroups.length} recent
                </span>
              </button>
              {showPrevMeals && (
                <div className="space-y-1.5 mt-1.5">
                  {prevMealGroups.map((group, i) => {
                    const totals = groupTotals(group);
                    const isSaving = savingGroupIndex === i;
                    return (
                      <div key={i} className="bg-surface rounded-xl overflow-hidden">
                        <div className="flex items-center">
                          <button
                            type="button"
                            disabled={copyingMeal}
                            onClick={() => copyMeal(group)}
                            className="flex-1 min-w-0 px-3 py-2.5 flex items-center justify-between text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium">{group.label}</div>
                              <div className="text-[0.625rem] text-text-muted mt-0.5">
                                {group.items.length} item{group.items.length > 1 ? 's' : ''} ·{' '}
                                {group.items.map((e) => e.name).join(', ').slice(0, 50)}
                                {group.items.map((e) => e.name).join(', ').length > 50 ? '…' : ''}
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <div className="text-xs font-semibold text-accent-orange">{Math.round(totals.cal)} cal</div>
                              <div className="text-[0.625rem] text-accent-blue">P{Math.round(totals.protein)}g</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            title="Save as meal"
                            onClick={() => {
                              if (savingGroupIndex === i) {
                                setSavingGroupIndex(null);
                              } else {
                                setSavingGroupIndex(i);
                                setSaveMealName(group.items.map((e) => e.name).join(', '));
                              }
                            }}
                            className="px-2.5 self-stretch text-text-muted hover:text-accent-blue shrink-0"
                          >
                            <BookmarkPlus size={15} />
                          </button>
                        </div>
                        {isSaving && (
                          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5 border-t border-border/50">
                            <input
                              autoFocus
                              type="text"
                              value={saveMealName}
                              onChange={(e) => setSaveMealName(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              placeholder="Nickname this meal"
                              className="input-field text-xs flex-1 py-1.5"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); saveGroupAsMeal(group); }
                                if (e.key === 'Escape') setSavingGroupIndex(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => saveGroupAsMeal(group)}
                              disabled={!saveMealName.trim()}
                              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-30 shrink-0"
                            >
                              Save
                            </button>
                            <button type="button" onClick={() => setSavingGroupIndex(null)} className="btn-secondary text-xs px-3 py-1.5 shrink-0">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
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
