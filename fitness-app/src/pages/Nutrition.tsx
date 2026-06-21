import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Search, Camera,
  Loader2, Star, Trash2, BookmarkPlus, Bookmark, GripVertical, Clock, Pencil,
} from 'lucide-react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Profile, FoodEntry } from '../types';
import { useNutrition } from '../hooks/useNutrition';
import { formatDate, today } from '../utils/dateHelpers';
import { getFoodEmoji } from '../utils/foodEmoji';
import { getSavedMeals, addSavedMeal, deleteSavedMeal, type SavedMeal } from '../db/savedMeals';
import { getRecipes, saveRecipe, updateRecipe, deleteRecipe, recipePerServing, type Recipe } from '../db/recipes';
import { getMealPlans, saveMealPlan, deleteMealPlan, type MealPlan } from '../db/mealPlans';
import { Modal } from '../components/shared/Modal';
import { ManualEntry } from '../components/nutrition/ManualEntry';
import { FoodSearch } from '../components/nutrition/FoodSearch';
import { AIFoodScanner } from '../components/nutrition/AIFoodScanner';
import { RecipeEditor } from '../components/nutrition/RecipeEditor';
import { NutritionCharts } from '../components/nutrition/NutritionCharts';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { toast } from '../components/shared/Toast';
import { calculateMacros } from '../utils/tdee';

interface NutritionPageProps {
  profile: Profile;
  onUpdateProfile?: (id: string, updates: Partial<Profile>) => void;
}

type ModalType = 'manual' | 'search' | 'ai' | 'save-meal' | 'edit-time' | 'edit-macros' | 'edit-entry' | 'recipe-editor' | null;
type Tab = 'planner' | 'my-foods' | 'recipes' | 'charts';

function MiniMacroBar({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isOver = current > target && target > 0;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-medium text-text-muted">{label}</span>
        <span className="text-[9px] text-text-muted">
          <span className="font-medium" style={{ color: isOver ? '#e85757' : 'var(--color-text-primary)' }}>{Math.round(current)}</span>/{Math.round(target)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${isOver ? 100 : pct}%`, backgroundColor: isOver ? '#e85757' : color }} />
      </div>
    </div>
  );
}

function getHourFromLoggedAt(loggedAt: string): number {
  return new Date(loggedAt).getHours();
}

function formatTime12(loggedAt: string): string {
  return new Date(loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatHourLabel(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12am' : '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'am' : 'pm';
      const label = m === 0 ? `${hour12}${ampm}` : `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

// Draggable entry
function DraggableEntry({ entry, onDelete, onToggleFavorite, onEditTime, onEdit }: {
  entry: FoodEntry;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEditTime: (entry: FoodEntry) => void;
  onEdit: (entry: FoodEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const cals = Math.round(entry.calories * entry.servingsConsumed);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-surface-raised rounded-xl p-2 group">
      <button {...attributes} {...listeners} className="touch-none p-1 cursor-grab active:cursor-grabbing shrink-0">
        <GripVertical size={13} className="text-text-muted/30 group-hover:text-text-muted/60" />
      </button>
      <span className="text-base shrink-0">{getFoodEmoji(entry.name)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate">{entry.name}</div>
        <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5">
          <span className="text-accent-orange font-medium">{cals} cal</span>
          <span>P{Math.round(entry.protein * entry.servingsConsumed)}</span>
          <span>C{Math.round(entry.carbs * entry.servingsConsumed)}</span>
          <span>F{Math.round(entry.fat * entry.servingsConsumed)}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => onEdit(entry)} className="p-0.5">
          <Pencil size={10} className="text-text-muted/30 hover:text-accent-blue" />
        </button>
        <button onClick={() => onEditTime(entry)} className="text-[8px] text-text-muted bg-surface rounded px-1 py-0.5 flex items-center gap-0.5">
          <Clock size={7} />{formatTime12(entry.loggedAt)}
        </button>
        <button onClick={() => onToggleFavorite(entry.id)} className="p-0.5">
          <Star size={10} className={entry.isFavorite ? 'text-nutrition fill-nutrition' : 'text-text-muted/20'} />
        </button>
        <button onClick={() => onDelete(entry.id)} className="p-0.5">
          <Trash2 size={10} className="text-text-muted/20 hover:text-danger" />
        </button>
      </div>
    </div>
  );
}

// Droppable hour slot
function HourSlot({ hour, children, onAddAtHour, isOver }: {
  hour: number; children: React.ReactNode; onAddAtHour: (hour: number) => void; isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `hour-${hour}` });
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div
      ref={setNodeRef}
      className={`relative flex gap-2 min-h-[36px] transition-colors rounded-lg ${isOver ? 'bg-accent-blue/5' : ''}`}
    >
      {/* Hour label */}
      <div className="w-[38px] pt-1.5 text-right shrink-0">
        <span className={`text-[10px] font-medium ${hasChildren ? 'text-text-secondary' : 'text-text-muted/40'}`}>
          {formatHourLabel(hour)}
        </span>
      </div>

      {/* Timeline dot + line */}
      <div className="flex flex-col items-center shrink-0 pt-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${hasChildren ? 'bg-accent-orange' : isOver ? 'bg-accent-blue' : 'bg-border/40'}`} />
        <div className="w-px flex-1 bg-border/20 mt-1" />
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 pb-1">
        {hasChildren ? (
          <div className="space-y-1 pt-0.5">
            {children}
          </div>
        ) : (
          <button
            onClick={() => onAddAtHour(hour)}
            className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] text-text-muted/40 hover:text-text-muted hover:bg-surface-raised/50 transition-colors ${isOver ? 'text-accent-blue bg-accent-blue/10' : ''}`}
          >
            <Plus size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Nutrition({ profile, onUpdateProfile }: NutritionPageProps) {
  const location = useLocation();
  const {
    entries, selectedDate, setSelectedDate, loading,
    addEntry, deleteEntry, updateEntry, updateEntryTime, toggleFavorite, getTodayTotals,
  } = useNutrition(profile.id);

  useEffect(() => {
    const state = location.state as { date?: string } | null;
    if (state?.date) setSelectedDate(state.date);
  }, [location.state]);

  const [modal, setModal] = useState<ModalType>(null);
  const [tab, setTab] = useState<Tab>('planner');
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>(() => getSavedMeals(profile.id));
  const [recipes, setRecipes] = useState<Recipe[]>(() => getRecipes(profile.id));
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(() => getMealPlans(profile.id));
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [logServingCount, setLogServingCount] = useState('1');
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [dailyNote, setDailyNote] = useState(() => {
    const notes = JSON.parse(localStorage.getItem(`fitos-food-notes-${profile.id}`) || '{}');
    return notes[selectedDate] || '';
  });

  useEffect(() => {
    const notes = JSON.parse(localStorage.getItem(`fitos-food-notes-${profile.id}`) || '{}');
    setDailyNote(notes[selectedDate] || '');
  }, [selectedDate, profile.id]);

  const saveDailyNote = (note: string) => {
    setDailyNote(note);
    const notes = JSON.parse(localStorage.getItem(`fitos-food-notes-${profile.id}`) || '{}');
    if (note.trim()) notes[selectedDate] = note.trim();
    else delete notes[selectedDate];
    localStorage.setItem(`fitos-food-notes-${profile.id}`, JSON.stringify(notes));
  };
  const [editTimeValue, setEditTimeValue] = useState('12:00');
  const [addAtTime, setAddAtTime] = useState<string | null>(null);
  const [overHour, setOverHour] = useState<string | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);

  const [editMacroProtein, setEditMacroProtein] = useState(String(profile.macroTargets.protein));
  const [editMacroCarbs, setEditMacroCarbs] = useState(String(profile.macroTargets.carbs));
  const [editMacroFat, setEditMacroFat] = useState(String(profile.macroTargets.fat));
  const [editMacroFiber, setEditMacroFiber] = useState(String(profile.fiberTarget ?? 30));

  useEffect(() => {
    setEditMacroProtein(String(profile.macroTargets.protein));
    setEditMacroCarbs(String(profile.macroTargets.carbs));
    setEditMacroFat(String(profile.macroTargets.fat));
    setEditMacroFiber(String(profile.fiberTarget ?? 30));
  }, [profile.macroTargets.protein, profile.macroTargets.carbs, profile.macroTargets.fat, profile.fiberTarget]);

  const editCalcCalories = Math.round(
    (parseInt(editMacroProtein) || 0) * 4 +
    (parseInt(editMacroCarbs) || 0) * 4 +
    (parseInt(editMacroFat) || 0) * 9
  );

  const [editEntryData, setEditEntryData] = useState<FoodEntry | null>(null);
  const [editEntryCal, setEditEntryCal] = useState('');
  const [editEntryProtein, setEditEntryProtein] = useState('');
  const [editEntryCarbs, setEditEntryCarbs] = useState('');
  const [editEntryFat, setEditEntryFat] = useState('');
  const [editEntryFiber, setEditEntryFiber] = useState('');
  const [editEntryServing, setEditEntryServing] = useState('');
  const [editEntryServings, setEditEntryServings] = useState('');
  const [editEntryName, setEditEntryName] = useState('');

  const [saveMealName, setSaveMealName] = useState('');
  const [saveMealCal, setSaveMealCal] = useState('');
  const [saveMealProtein, setSaveMealProtein] = useState('');
  const [saveMealCarbs, setSaveMealCarbs] = useState('');
  const [saveMealFat, setSaveMealFat] = useState('');
  const [saveMealFiber, setSaveMealFiber] = useState('');
  const [saveMealServing, setSaveMealServing] = useState('1');
  const [saveMealUnit, setSaveMealUnit] = useState('serving');

  const totals = getTodayTotals();
  const targets = profile.macroTargets;
  const isToday = selectedDate === today();
  const favorites = entries.filter((e) => e.isFavorite);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const sortedEntries = [...entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  const TIMELINE_START = 0;
  const TIMELINE_END = 23;

  const entriesByHour: Record<number, FoodEntry[]> = {};
  for (let h = TIMELINE_START; h <= TIMELINE_END; h++) entriesByHour[h] = [];
  for (const entry of sortedEntries) {
    const hour = getHourFromLoggedAt(entry.loggedAt);
    entriesByHour[hour].push(entry);
  }

  // Collapse empty hours outside the active range for a cleaner view
  const hoursWithEntries = new Set(
    sortedEntries.map((e) => getHourFromLoggedAt(e.loggedAt))
  );
  const visibleStart = Math.min(6, ...(hoursWithEntries.size > 0 ? hoursWithEntries : [6]));
  const visibleEnd = Math.max(22, ...(hoursWithEntries.size > 0 ? hoursWithEntries : [22]));

  function changeDate(offset: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  }


  function handleEditTime(entry: FoodEntry) {
    setEditingEntry(entry);
    const d = new Date(entry.loggedAt);
    setEditTimeValue(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setModal('edit-time');
  }

  function handleSaveTime() {
    if (!editingEntry) return;
    const [hh, mm] = editTimeValue.split(':').map(Number);
    const d = new Date(editingEntry.loggedAt);
    d.setHours(hh, mm);
    updateEntryTime(editingEntry.id, d.toISOString());
    setModal(null);
    setEditingEntry(null);
  }

  function handleEditEntry(entry: FoodEntry) {
    setEditEntryData(entry);
    setEditEntryName(entry.name);
    setEditEntryCal(String(Math.round(entry.calories)));
    setEditEntryProtein(String(Math.round(entry.protein * 10) / 10));
    setEditEntryCarbs(String(Math.round(entry.carbs * 10) / 10));
    setEditEntryFat(String(Math.round(entry.fat * 10) / 10));
    setEditEntryFiber(entry.fiber != null ? String(Math.round(entry.fiber * 10) / 10) : '');
    setEditEntryServing(String(entry.servingSize));
    setEditEntryServings(String(entry.servingsConsumed));
    setModal('edit-entry');
  }

  function handleSaveEntry() {
    if (!editEntryData) return;
    updateEntry(editEntryData.id, {
      name: editEntryName.trim() || editEntryData.name,
      calories: parseFloat(editEntryCal) || editEntryData.calories,
      protein: parseFloat(editEntryProtein) || 0,
      carbs: parseFloat(editEntryCarbs) || 0,
      fat: parseFloat(editEntryFat) || 0,
      fiber: editEntryFiber ? parseFloat(editEntryFiber) : undefined,
      servingSize: parseFloat(editEntryServing) || editEntryData.servingSize,
      servingsConsumed: parseFloat(editEntryServings) || 1,
    });
    toast('Entry updated', 'success');
    setModal(null);
    setEditEntryData(null);
  }

  function currentTimeRounded(): string {
    const now = new Date();
    const m = Math.round(now.getMinutes() / 15) * 15;
    const h = m === 60 ? now.getHours() + 1 : now.getHours();
    return `${String(h % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  function handleAddAtHour(hour: number) {
    setAddAtTime(`${String(hour).padStart(2, '0')}:00`);
    setModal('manual');
  }

  function buildLoggedAt(time: string): string {
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  }

  function addEntryWithTime(entry: Parameters<typeof addEntry>[0]) {
    const time = addAtTime || currentTimeRounded();
    addEntry({ ...entry, loggedAt: buildLoggedAt(time) });
    setAddAtTime(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setOverHour(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    if (overId.startsWith('hour-')) {
      const targetHour = parseInt(overId.replace('hour-', ''));
      const draggedEntry = entries.find((e) => e.id === active.id);
      if (!draggedEntry) return;

      const d = new Date(draggedEntry.loggedAt);
      d.setHours(targetHour, 0);
      updateEntryTime(draggedEntry.id, d.toISOString());
    }
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    if (event.over) {
      setOverHour(String(event.over.id));
    } else {
      setOverHour(null);
    }
  }


  function handleQuickAdd(meal: SavedMeal) {
    addEntry({ date: selectedDate, name: meal.name, servingSize: meal.servingSize, servingUnit: meal.servingUnit, servingsConsumed: 1, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, fiber: meal.fiber, source: 'manual', mealType: 'snack' });
    toast(`Added ${meal.name}`, 'success');
  }

  function handleQuickAddFavorite(entry: FoodEntry) {
    addEntry({ date: selectedDate, name: entry.name, brand: entry.brand, servingSize: entry.servingSize, servingUnit: entry.servingUnit, servingsConsumed: entry.servingsConsumed, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber, source: entry.source, fdcId: entry.fdcId, mealType: entry.mealType });
    toast(`Added ${entry.name}`, 'success');
  }

  function handleSaveMeal() {
    if (!saveMealName.trim()) return;
    addSavedMeal(profile.id, { name: saveMealName.trim(), emoji: getFoodEmoji(saveMealName), calories: parseFloat(saveMealCal) || 0, protein: parseFloat(saveMealProtein) || 0, carbs: parseFloat(saveMealCarbs) || 0, fat: parseFloat(saveMealFat) || 0, fiber: parseFloat(saveMealFiber) || undefined, servingSize: parseFloat(saveMealServing) || 1, servingUnit: saveMealUnit });
    setSavedMeals(getSavedMeals(profile.id));
    setSaveMealName(''); setSaveMealCal(''); setSaveMealProtein(''); setSaveMealCarbs(''); setSaveMealFat(''); setSaveMealFiber(''); setSaveMealServing('1'); setSaveMealUnit('serving');
    setModal(null);
    toast('Saved to My Foods', 'success');
  }

  function handleDeleteSavedMeal(id: string) {
    deleteSavedMeal(profile.id, id);
    setSavedMeals(getSavedMeals(profile.id));
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Date Picker */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-surface-raised">
          <ChevronLeft size={20} className="text-text-secondary" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-text-primary">{formatDate(selectedDate)}</h2>
          {isToday && <span className="text-[10px] text-accent-orange">Today</span>}
        </div>
        <button type="button" onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-surface-raised">
          <ChevronRight size={20} className="text-text-secondary" />
        </button>
      </div>

      {/* Macro Bars — tap to edit */}
      <button
        onClick={() => {
          setEditMacroProtein(String(targets.protein));
          setEditMacroCarbs(String(targets.carbs));
          setEditMacroFat(String(targets.fat));
          setEditMacroFiber(String(profile.fiberTarget ?? 30));
          setModal('edit-macros');
        }}
        className="w-full bg-surface rounded-2xl p-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-2xl font-bold">{Math.round(totals.calories)}</span>
          <span className="text-xs text-text-muted">/ {Math.round(targets.calories)} kcal</span>
          <span className="text-[10px] font-medium ml-auto px-1.5 py-0.5 rounded-full" style={{ backgroundColor: totals.calories > targets.calories ? 'rgba(232,87,87,0.15)' : 'rgba(232,87,42,0.15)', color: totals.calories > targets.calories ? '#e85757' : '#e8572a' }}>
            {targets.calories > 0 ? Math.round((totals.calories / targets.calories) * 100) : 0}%
          </span>
        </div>
        <div className="flex gap-2">
          <MiniMacroBar label="Protein" current={totals.protein} target={targets.protein} color="#5b6ef5" />
          <MiniMacroBar label="Carbs" current={totals.carbs} target={targets.carbs} color="#2e9e6b" />
          <MiniMacroBar label="Fat" current={totals.fat} target={targets.fat} color="#f5a623" />
          <MiniMacroBar label="Fiber" current={totals.fiber} target={profile.fiberTarget ?? 30} color="#666" />
        </div>
        <div className="text-[9px] text-text-muted text-center mt-1.5">Tap to edit targets</div>
      </button>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {([{ key: 'planner' as Tab, label: 'Timeline' }, { key: 'my-foods' as Tab, label: 'My Foods' }, { key: 'recipes' as Tab, label: 'Recipes' }, { key: 'charts' as Tab, label: 'Charts' }]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>{t.label}</button>
        ))}
      </div>

      {/* ===== TIMELINE ===== */}
      {tab === 'planner' && (
        <>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddAtTime(null); setModal('manual'); }} className="flex-1 bg-surface rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
              <Plus size={14} className="text-accent-orange" /><span className="text-xs font-medium">Add</span>
            </button>
            <button type="button" onClick={() => setModal('search')} className="flex-1 bg-surface rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
              <Search size={14} className="text-accent-blue" /><span className="text-xs font-medium">Search</span>
            </button>
            <button type="button" onClick={() => setModal('ai')} className="flex-1 bg-surface rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
              <Camera size={14} className="text-nutrition" /><span className="text-xs font-medium">Scan</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-text-muted" /></div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
              <div className="space-y-0">
                {/* Show early hours toggle */}
                {!showAllHours && visibleStart > 0 && (
                  <button
                    onClick={() => setShowAllHours(true)}
                    className="w-full text-[10px] text-text-muted/50 hover:text-text-muted py-1 text-center"
                  >
                    Show 12am - {formatHourLabel(visibleStart - 1)}
                  </button>
                )}

                {Array.from({ length: TIMELINE_END - TIMELINE_START + 1 }, (_, i) => i + TIMELINE_START)
                  .filter((hour) => showAllHours || (hour >= visibleStart && hour <= visibleEnd))
                  .map((hour) => {
                    const hourEntries = entriesByHour[hour];
                    return (
                      <HourSlot key={hour} hour={hour} onAddAtHour={handleAddAtHour} isOver={overHour === `hour-${hour}`}>
                        {hourEntries.map((entry) => (
                          <DraggableEntry
                            key={entry.id}
                            entry={entry}
                            onDelete={deleteEntry}
                            onToggleFavorite={toggleFavorite}
                            onEditTime={handleEditTime}
                            onEdit={handleEditEntry}
                          />
                        ))}
                      </HourSlot>
                    );
                  })}

                {/* Show late hours toggle */}
                {!showAllHours && visibleEnd < 23 && (
                  <button
                    onClick={() => setShowAllHours(true)}
                    className="w-full text-[10px] text-text-muted/50 hover:text-text-muted py-1 text-center"
                  >
                    Show {formatHourLabel(visibleEnd + 1)} - 11pm
                  </button>
                )}

                {showAllHours && (
                  <button
                    onClick={() => setShowAllHours(false)}
                    className="w-full text-[10px] text-text-muted/50 hover:text-text-muted py-1 text-center"
                  >
                    Collapse empty hours
                  </button>
                )}
              </div>
            </DndContext>
          )}

          {/* Daily note */}
          <div className="bg-surface rounded-xl p-3">
            <textarea
              className="w-full bg-transparent text-xs text-text-secondary resize-none outline-none placeholder-text-muted"
              rows={2}
              placeholder="Add a note for today..."
              value={dailyNote}
              onChange={(e) => saveDailyNote(e.target.value)}
            />
          </div>

          {entries.length > 0 && (
            <div className="text-center text-[10px] text-text-muted">{entries.length} entries · {Math.round(totals.calories)} cal</div>
          )}
        </>
      )}

      {/* ===== MY FOODS ===== */}
      {tab === 'my-foods' && (
        <div className="space-y-4">
          <button onClick={() => setModal('save-meal')} className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/15 flex items-center justify-center"><BookmarkPlus size={18} className="text-accent-blue" /></div>
            <div><div className="text-sm font-medium">Save a New Food / Meal</div><div className="text-[11px] text-text-muted">Pre-add for quick logging later</div></div>
          </button>

          {favorites.length > 0 && (
            <div>
              <h3 className="label mb-2 flex items-center gap-1.5"><Star size={11} className="text-nutrition" /> Favorites</h3>
              <div className="space-y-1.5">
                {favorites.map((entry) => (
                  <div key={entry.id} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                    <span className="text-lg">{getFoodEmoji(entry.name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{entry.name}</div>
                      <div className="text-[10px] text-text-muted">{Math.round(entry.calories)} cal · P{Math.round(entry.protein)}g · C{Math.round(entry.carbs)}g · F{Math.round(entry.fat)}g</div>
                    </div>
                    <button onClick={() => handleQuickAddFavorite(entry)} className="bg-surface-raised px-3 py-1.5 rounded-lg text-[10px] font-medium text-accent-blue">+ Add</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="label mb-2 flex items-center gap-1.5"><Bookmark size={11} /> My Foods</h3>
            {savedMeals.length === 0 ? (
              <div className="text-center py-8"><div className="text-2xl mb-2">📋</div><p className="text-sm text-text-muted">No saved foods yet</p></div>
            ) : (
              <div className="space-y-1.5">
                {savedMeals.map((meal) => (
                  <div key={meal.id} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                    <span className="text-lg">{meal.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{meal.name}</div>
                      <div className="text-[10px] text-text-muted">{Math.round(meal.calories)} cal · P{Math.round(meal.protein)}g · C{Math.round(meal.carbs)}g · F{Math.round(meal.fat)}g</div>
                    </div>
                    <button onClick={() => handleQuickAdd(meal)} className="bg-surface-raised px-3 py-1.5 rounded-lg text-[10px] font-medium text-accent-blue">+ Add</button>
                    <button onClick={() => handleDeleteSavedMeal(meal.id)} className="p-1.5"><Trash2 size={12} className="text-text-muted/40 hover:text-danger" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meal Plans */}
          <div>
            <h3 className="label mb-2 flex items-center gap-1.5"><Clock size={11} /> Meal Plans</h3>

            {entries.length > 0 && (
              <button
                onClick={() => {
                  const planEntries = entries.map((e) => ({
                    name: e.name, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat,
                    fiber: e.fiber, servingSize: e.servingSize, servingUnit: e.servingUnit,
                    servingsConsumed: e.servingsConsumed, mealType: e.mealType,
                  }));
                  const total = planEntries.reduce((a, e) => ({
                    cal: a.cal + e.calories * e.servingsConsumed, p: a.p + e.protein * e.servingsConsumed,
                    c: a.c + e.carbs * e.servingsConsumed, f: a.f + e.fat * e.servingsConsumed,
                  }), { cal: 0, p: 0, c: 0, f: 0 });
                  const dayName = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                  saveMealPlan(profile.id, {
                    name: `${dayName} Plan`, entries: planEntries,
                    totalCalories: Math.round(total.cal), totalProtein: Math.round(total.p),
                    totalCarbs: Math.round(total.c), totalFat: Math.round(total.f),
                  });
                  setMealPlans(getMealPlans(profile.id));
                  toast('Meal plan saved!', 'success');
                }}
                className="w-full bg-surface rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform mb-2"
              >
                <BookmarkPlus size={16} className="text-accent" />
                <div className="flex-1 text-left">
                  <div className="text-xs font-medium">Save Today as Meal Plan</div>
                  <div className="text-[10px] text-text-muted">{entries.length} items · {Math.round(totals.calories)} cal</div>
                </div>
              </button>
            )}

            {mealPlans.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No meal plans saved yet. Log a day of food, then save it here.</p>
            ) : (
              <div className="space-y-1.5">
                {mealPlans.map((plan) => (
                  <div key={plan.id} className="bg-surface rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{plan.name}</div>
                        <div className="text-[10px] text-text-muted">
                          {plan.entries.length} items · {plan.totalCalories} cal · P{plan.totalProtein}g
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          for (const item of plan.entries) {
                            addEntry({
                              date: selectedDate, name: item.name, calories: item.calories,
                              protein: item.protein, carbs: item.carbs, fat: item.fat,
                              fiber: item.fiber, servingSize: item.servingSize,
                              servingUnit: item.servingUnit, servingsConsumed: item.servingsConsumed,
                              source: 'manual', mealType: item.mealType,
                            });
                          }
                          toast(`Applied ${plan.name} (${plan.entries.length} items)`, 'success');
                        }}
                        className="bg-accent-blue/10 text-accent-blue px-3 py-1.5 rounded-lg text-[10px] font-semibold"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => {
                          deleteMealPlan(profile.id, plan.id);
                          setMealPlans(getMealPlans(profile.id));
                          toast('Meal plan deleted', 'success');
                        }}
                        className="p-1.5"
                      >
                        <Trash2 size={12} className="text-text-muted/40 hover:text-danger" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== RECIPES ===== */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <button
            onClick={() => { setEditingRecipe(null); setModal('recipe-editor'); }}
            className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Plus size={18} className="text-accent" />
            </div>
            <div>
              <div className="text-sm font-medium">Create Recipe</div>
              <div className="text-[11px] text-text-muted">Add ingredients, steps, and macros</div>
            </div>
          </button>

          {recipes.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-2xl mb-2">🍳</div>
              <p className="text-sm text-text-muted">No recipes yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recipes.map((recipe) => {
                const per = recipePerServing(recipe);
                return (
                  <div key={recipe.id} className="bg-surface rounded-xl p-3">
                    <button
                      onClick={() => setViewingRecipe(recipe)}
                      className="w-full text-left flex items-center gap-3"
                    >
                      <span className="text-xl">{recipe.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{recipe.name}</div>
                        <div className="text-[10px] text-text-muted">
                          {per.calories} cal/serving · P{per.protein}g · C{per.carbs}g · F{per.fat}g
                          {recipe.prepTime || recipe.cookTime ? ` · ${(recipe.prepTime || 0) + (recipe.cookTime || 0)} min` : ''}
                        </div>
                        {recipe.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {recipe.tags.map((t) => (
                              <span key={t} className="text-[9px] bg-surface-raised px-1.5 py-0.5 rounded text-text-muted">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                      <button
                        onClick={() => {
                          addEntry({
                            date: selectedDate,
                            name: recipe.name,
                            calories: per.calories,
                            protein: per.protein,
                            carbs: per.carbs,
                            fat: per.fat,
                            fiber: per.fiber,
                            servingSize: 1,
                            servingUnit: `serving (of ${recipe.servings})`,
                            servingsConsumed: 1,
                            source: 'manual',
                            mealType: 'snack',
                          });
                          toast(`Logged 1 serving of ${recipe.name}`, 'success');
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue text-[10px] font-semibold"
                      >
                        + Log 1 Serving
                      </button>
                      <button
                        onClick={() => { setEditingRecipe(recipe); setModal('recipe-editor'); }}
                        className="py-1.5 px-3 rounded-lg bg-surface-raised text-[10px] text-text-muted font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteRecipeId(recipe.id)}
                        className="py-1.5 px-3 rounded-lg bg-surface-raised text-[10px] text-danger font-medium"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== CHARTS ===== */}
      {tab === 'charts' && <NutritionCharts profileId={profile.id} targets={targets} />}

      {/* Modals */}
      <Modal open={modal === 'manual'} onClose={() => { setModal(null); setAddAtTime(null); }} title="Add Food">
        <div className="mb-3">
          <label className="label mb-1 block">Time</label>
          <select
            className="input-field text-sm"
            value={addAtTime || currentTimeRounded()}
            onChange={(e) => setAddAtTime(e.target.value)}
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <ManualEntry onAdd={addEntryWithTime} onClose={() => { setModal(null); setAddAtTime(null); }} profileId={profile.id} dailyTotals={totals} macroTargets={targets} />
      </Modal>

      <Modal open={modal === 'search'} onClose={() => setModal(null)} title="Search Foods">
        <FoodSearch onAdd={addEntry} onClose={() => setModal(null)} profileId={profile.id} />
      </Modal>

      <Modal open={modal === 'ai'} onClose={() => setModal(null)} title="AI Food Scanner">
        <AIFoodScanner onAdd={addEntry} onClose={() => setModal(null)} />
      </Modal>

      <Modal open={modal === 'edit-time'} onClose={() => { setModal(null); setEditingEntry(null); }} title="Change Time">
        <div className="space-y-4">
          {editingEntry && (
            <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
              <span className="text-lg">{getFoodEmoji(editingEntry.name)}</span>
              <span className="text-sm font-medium">{editingEntry.name}</span>
            </div>
          )}
          <div>
            <label className="label mb-1.5 block">Time</label>
            <input type="time" className="input-field text-lg py-3 text-center" value={editTimeValue} onChange={(e) => setEditTimeValue(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setModal(null); setEditingEntry(null); }} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={handleSaveTime} className="btn-primary flex-1 text-sm">Save</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'edit-entry'} onClose={() => { setModal(null); setEditEntryData(null); }} title="Edit Food Entry">
        {editEntryData && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
              <span className="text-lg">{getFoodEmoji(editEntryData.name)}</span>
              <input
                className="input-field text-sm flex-1"
                value={editEntryName}
                onChange={(e) => setEditEntryName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label mb-1 block">Amount ({editEntryData.servingUnit})</label>
                <input type="number" inputMode="decimal" className="input-field text-sm" value={editEntryServing} onChange={(e) => setEditEntryServing(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1 block">Servings</label>
                <input type="number" inputMode="decimal" className="input-field text-sm" value={editEntryServings} onChange={(e) => setEditEntryServings(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label mb-1 block">Calories</label>
              <input type="number" inputMode="decimal" className="input-field text-sm" value={editEntryCal} onChange={(e) => setEditEntryCal(e.target.value)} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] text-text-muted text-center block mb-0.5">Protein</label>
                <input type="number" inputMode="decimal" className="input-field text-sm text-center" value={editEntryProtein} onChange={(e) => setEditEntryProtein(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted text-center block mb-0.5">Carbs</label>
                <input type="number" inputMode="decimal" className="input-field text-sm text-center" value={editEntryCarbs} onChange={(e) => setEditEntryCarbs(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted text-center block mb-0.5">Fat</label>
                <input type="number" inputMode="decimal" className="input-field text-sm text-center" value={editEntryFat} onChange={(e) => setEditEntryFat(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted text-center block mb-0.5">Fiber</label>
                <input type="number" inputMode="decimal" className="input-field text-sm text-center" value={editEntryFiber} onChange={(e) => setEditEntryFiber(e.target.value)} />
              </div>
            </div>
            <div className="bg-surface-raised rounded-lg p-2 text-center text-xs text-text-muted">
              Total: {Math.round((parseFloat(editEntryCal) || 0) * (parseFloat(editEntryServings) || 1))} cal ·
              P{Math.round((parseFloat(editEntryProtein) || 0) * (parseFloat(editEntryServings) || 1))}g ·
              C{Math.round((parseFloat(editEntryCarbs) || 0) * (parseFloat(editEntryServings) || 1))}g ·
              F{Math.round((parseFloat(editEntryFat) || 0) * (parseFloat(editEntryServings) || 1))}g
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModal(null); setEditEntryData(null); }} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={handleSaveEntry} className="btn-primary flex-1 text-sm">Save</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal === 'edit-macros'} onClose={() => setModal(null)} title="Edit Macro Targets">
        <div className="space-y-3">
          <div className="bg-surface rounded-xl p-3 text-center">
            <div className="text-2xl font-semibold">{editCalcCalories}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">calories (auto-calculated)</div>
            <div className="text-[9px] text-text-muted mt-1">
              P({parseInt(editMacroProtein) || 0})×4 + C({parseInt(editMacroCarbs) || 0})×4 + F({parseInt(editMacroFat) || 0})×9
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label mb-1 block">Protein (g)</label>
              <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editMacroProtein} onChange={(e) => setEditMacroProtein(e.target.value)} />
              <div className="text-[8px] text-text-muted text-center mt-0.5">4 cal/g</div>
            </div>
            <div>
              <label className="label mb-1 block">Carbs (g)</label>
              <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editMacroCarbs} onChange={(e) => setEditMacroCarbs(e.target.value)} />
              <div className="text-[8px] text-text-muted text-center mt-0.5">4 cal/g</div>
            </div>
            <div>
              <label className="label mb-1 block">Fat (g)</label>
              <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editMacroFat} onChange={(e) => setEditMacroFat(e.target.value)} />
              <div className="text-[8px] text-text-muted text-center mt-0.5">9 cal/g</div>
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Fiber (g)</label>
            <input type="number" inputMode="numeric" className="input-field text-sm w-24" value={editMacroFiber} onChange={(e) => setEditMacroFiber(e.target.value)} />
          </div>
          {profile.bodyStats && (
            <button
              onClick={() => {
                const macros = calculateMacros(profile.bodyStats!);
                setEditMacroProtein(String(macros.protein));
                setEditMacroCarbs(String(macros.carbs));
                setEditMacroFat(String(macros.fat));
              }}
              className="w-full text-xs text-accent-blue font-medium py-2"
            >
              Recalculate from body stats
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button
              onClick={() => {
                if (onUpdateProfile) {
                  onUpdateProfile(profile.id, {
                    macroTargets: {
                      calories: editCalcCalories,
                      protein: parseInt(editMacroProtein) || targets.protein,
                      carbs: parseInt(editMacroCarbs) || targets.carbs,
                      fat: parseInt(editMacroFat) || targets.fat,
                    },
                    fiberTarget: parseInt(editMacroFiber) || 30,
                  });
                  toast('Macro targets updated', 'success');
                }
                setModal(null);
              }}
              className="btn-primary flex-1 text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'save-meal'} onClose={() => setModal(null)} title="Save Food / Meal">
        <div className="space-y-3">
          <div><label className="label mb-1 block">Name</label><input className="input-field text-sm" placeholder="e.g. Grilled Chicken & Rice" value={saveMealName} onChange={(e) => setSaveMealName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label mb-1 block">Calories</label><input type="number" inputMode="decimal" className="input-field text-sm" placeholder="0" value={saveMealCal} onChange={(e) => setSaveMealCal(e.target.value)} /></div>
            <div><label className="label mb-1 block">Protein (g)</label><input type="number" inputMode="decimal" className="input-field text-sm" placeholder="0" value={saveMealProtein} onChange={(e) => setSaveMealProtein(e.target.value)} /></div>
            <div><label className="label mb-1 block">Carbs (g)</label><input type="number" inputMode="decimal" className="input-field text-sm" placeholder="0" value={saveMealCarbs} onChange={(e) => setSaveMealCarbs(e.target.value)} /></div>
            <div><label className="label mb-1 block">Fat (g)</label><input type="number" inputMode="decimal" className="input-field text-sm" placeholder="0" value={saveMealFat} onChange={(e) => setSaveMealFat(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label mb-1 block">Fiber (g)</label><input type="number" inputMode="decimal" className="input-field text-sm" placeholder="0" value={saveMealFiber} onChange={(e) => setSaveMealFiber(e.target.value)} /></div>
            <div><label className="label mb-1 block">Serving</label><div className="flex gap-1"><input type="number" inputMode="decimal" className="input-field text-sm flex-1" placeholder="1" value={saveMealServing} onChange={(e) => setSaveMealServing(e.target.value)} /><select className="input-field text-sm w-16" value={saveMealUnit} onChange={(e) => setSaveMealUnit(e.target.value)}><option value="serving">srv</option><option value="g">g</option><option value="oz">oz</option><option value="cup">cup</option></select></div></div>
          </div>
          {saveMealName.trim() && (
            <div className="bg-surface rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">{getFoodEmoji(saveMealName)}</span>
              <div><div className="text-sm font-medium">{saveMealName}</div><div className="text-[10px] text-text-muted">{saveMealCal || 0} cal · P{saveMealProtein || 0}g · C{saveMealCarbs || 0}g · F{saveMealFat || 0}g</div></div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button type="button" onClick={handleSaveMeal} disabled={!saveMealName.trim()} className="btn-primary flex-1 text-sm disabled:opacity-30">Save</button>
          </div>
        </div>
      </Modal>

      {/* Recipe Editor Modal */}
      <Modal open={modal === 'recipe-editor'} onClose={() => { setModal(null); setEditingRecipe(null); }} title={editingRecipe ? 'Edit Recipe' : 'New Recipe'}>
        <RecipeEditor
          initial={editingRecipe || undefined}
          profileId={profile.id}
          onSave={(data) => {
            if (editingRecipe) {
              const updated = { ...editingRecipe, ...data, updatedAt: new Date().toISOString() };
              updateRecipe(profile.id, updated);
              toast('Recipe updated!', 'success');
            } else {
              saveRecipe(profile.id, data);
              toast('Recipe saved!', 'success');
            }
            setRecipes(getRecipes(profile.id));
            setModal(null);
            setEditingRecipe(null);
          }}
          onCancel={() => { setModal(null); setEditingRecipe(null); }}
        />
      </Modal>

      {/* Recipe Detail View */}
      {viewingRecipe && (() => {
        const per = recipePerServing(viewingRecipe);
        const logCount = parseFloat(logServingCount) || 1;
        const logCal = Math.round(per.calories * logCount);
        const logP = Math.round(per.protein * logCount * 10) / 10;
        const logC = Math.round(per.carbs * logCount * 10) / 10;
        const logF = Math.round(per.fat * logCount * 10) / 10;

        return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="bg-bg w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
            <div className="sticky top-0 bg-bg border-b border-border px-4 py-3 flex items-center justify-between z-10">
              <h2 className="font-semibold text-base">{viewingRecipe.emoji} {viewingRecipe.name}</h2>
              <button onClick={() => { setViewingRecipe(null); setLogServingCount('1'); }} className="p-1.5 rounded-lg hover:bg-surface">
                <span className="text-text-muted text-sm">✕</span>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {viewingRecipe.description && (
                <p className="text-sm text-text-secondary">{viewingRecipe.description}</p>
              )}

              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Servings', value: viewingRecipe.servings },
                  { label: 'Prep', value: viewingRecipe.prepTime ? `${viewingRecipe.prepTime}m` : '—' },
                  { label: 'Cook', value: viewingRecipe.cookTime ? `${viewingRecipe.cookTime}m` : '—' },
                  { label: 'Cal/srv', value: per.calories },
                ].map((s) => (
                  <div key={s.label} className="bg-surface rounded-xl p-2 text-center">
                    <div className="text-sm font-bold">{s.value}</div>
                    <div className="text-[9px] text-text-muted uppercase">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Macros per serving */}
              <div className="bg-surface rounded-xl p-3 text-xs">
                <div className="text-[10px] text-text-muted font-semibold uppercase mb-1">Per Serving</div>
                <div className="font-semibold">{per.calories} cal · P{per.protein}g · C{per.carbs}g · F{per.fat}g</div>
                {viewingRecipe.totalCalories > 0 && viewingRecipe.servings > 1 && (
                  <div className="text-[10px] text-text-muted mt-1">
                    Total recipe: {viewingRecipe.totalCalories} cal · P{Math.round(viewingRecipe.totalProtein)}g · C{Math.round(viewingRecipe.totalCarbs)}g · F{Math.round(viewingRecipe.totalFat)}g
                  </div>
                )}
              </div>

              {/* Ingredients */}
              {viewingRecipe.ingredients.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-text-secondary mb-2">Ingredients</h3>
                  <div className="space-y-1">
                    {viewingRecipe.ingredients.map((ing, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <span>{ing.amount > 0 ? `${ing.amount} ${ing.unit}` : ''} {ing.name}</span>
                        {ing.calories > 0 && <span className="text-text-muted text-xs">{ing.calories} cal</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps */}
              {viewingRecipe.steps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-text-secondary mb-2">Instructions</h3>
                  <div className="space-y-2">
                    {viewingRecipe.steps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-accent font-bold mt-0.5 w-5 text-right">{i + 1}</span>
                        <p className="text-sm text-text-secondary flex-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log with adjustable servings */}
              <div className="bg-surface rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-text-secondary">Servings to log:</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLogServingCount(String(Math.max(0.5, logCount - 0.5)))} className="w-7 h-7 rounded-lg bg-surface-raised text-text-muted text-sm font-bold">−</button>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="w-14 text-center input-field text-sm py-1"
                      value={logServingCount}
                      onChange={(e) => setLogServingCount(e.target.value)}
                      step="0.5"
                      min="0.25"
                    />
                    <button onClick={() => setLogServingCount(String(logCount + 0.5))} className="w-7 h-7 rounded-lg bg-surface-raised text-text-muted text-sm font-bold">+</button>
                  </div>
                </div>
                <div className="text-xs text-text-muted">
                  {logCal} cal · P{logP}g · C{logC}g · F{logF}g
                </div>
              </div>

              <button
                onClick={() => {
                  addEntry({
                    date: selectedDate,
                    name: viewingRecipe.name,
                    calories: per.calories,
                    protein: per.protein,
                    carbs: per.carbs,
                    fat: per.fat,
                    fiber: per.fiber,
                    servingSize: 1,
                    servingUnit: `serving (of ${viewingRecipe.servings})`,
                    servingsConsumed: logCount,
                    source: 'manual',
                    mealType: 'snack',
                  });
                  toast(`Logged ${logCount} serving${logCount !== 1 ? 's' : ''} of ${viewingRecipe.name}`, 'success');
                  setViewingRecipe(null);
                  setLogServingCount('1');
                }}
                className="w-full bg-accent-blue text-white font-semibold rounded-xl py-3 active:scale-[0.98] transition-transform"
              >
                + Log {logCount !== 1 ? `${logCount} Servings` : '1 Serving'} ({logCal} cal)
              </button>

              <button onClick={() => { setViewingRecipe(null); setLogServingCount('1'); }} className="w-full bg-surface text-text-primary font-medium rounded-xl py-3">
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      )}

      {/* Delete recipe confirm */}
      <ConfirmDialog
        open={!!deleteRecipeId}
        onClose={() => setDeleteRecipeId(null)}
        onConfirm={() => {
          if (deleteRecipeId) {
            deleteRecipe(profile.id, deleteRecipeId);
            setRecipes(getRecipes(profile.id));
            toast('Recipe deleted', 'success');
          }
          setDeleteRecipeId(null);
        }}
        title="Delete Recipe"
        message="This will permanently delete this recipe. This cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}
