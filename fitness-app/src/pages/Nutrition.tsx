import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Search, Camera,
  Loader2, Star, Trash2, BookmarkPlus, Bookmark, GripVertical, Clock, Pencil, AlertCircle, AlignLeft, AlignRight, Copy,
} from 'lucide-react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Profile, FoodEntry } from '../types';
import { useNutrition } from '../hooks/useNutrition';
import { getFoodEntriesByDate } from '../db/nutrition';
import { formatDate, today } from '../utils/dateHelpers';
import { getFoodEmoji } from '../utils/foodEmoji';
import { getSavedMeals, addSavedMeal, deleteSavedMeal, updateSavedMeal, type SavedMeal, type MealIngredient } from '../db/savedMeals';
import { getSavedFoods, updateSavedFood, updateSavedFoodLibraryOnly, saveAsNewFood, countFoodLogEntries, deleteSavedFood, type SavedFood } from '../db/foodHistory';
import { FoodEditWarningModal } from '../components/shared/FoodEditWarningModal';
import { FOOD_DATABASE } from '../data/foods';
import { searchFoods as searchUSDA } from '../utils/usda';
// USDA proxy — no API key needed
import { getRecipes, saveRecipe, updateRecipe, deleteRecipe, recipePerServing, type Recipe } from '../db/recipes';
import { getMealPlans, saveMealPlan, deleteMealPlan, type MealPlan } from '../db/mealPlans';
import { Modal } from '../components/shared/Modal';
import { ManualEntry } from '../components/nutrition/ManualEntry';
import { FoodSearch } from '../components/nutrition/FoodSearch';
import { MealBuilder } from '../components/nutrition/MealBuilder';
import { AIFoodScanner } from '../components/nutrition/AIFoodScanner';
import { QuickAddSheet } from '../components/nutrition/QuickAddSheet';
import { RecipeEditor } from '../components/nutrition/RecipeEditor';
import { NutritionCharts } from '../components/nutrition/NutritionCharts';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { toast } from '../components/shared/Toast';
import { VoiceMicButton } from '../components/shared/VoiceMicButton';
import { VoiceConfirmationCard } from '../components/shared/VoiceConfirmationCard';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { getDashboardConfig as getVoiceConfig } from '../utils/dashboardConfig';
import { getApiKey } from '../utils/apiKeyManager';
import { calculateMacros } from '../utils/tdee';

interface NutritionPageProps {
  profile: Profile;
  onUpdateProfile?: (id: string, updates: Partial<Profile>) => void;
}

type ModalType = 'add' | 'copy-entry' | 'save-meal' | 'save-meal-manual' | 'meal-builder' | 'edit-time' | 'edit-macros' | 'edit-entry' | 'recipe-editor' | null;
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

function currentTimeExact(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Draggable entry
function DraggableEntry({ entry, onDelete, onToggleFavorite, onEditTime, onEdit, onCopy }: {
  entry: FoodEntry;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEditTime: (entry: FoodEntry) => void;
  onEdit: (entry: FoodEntry) => void;
  onCopy: (entry: FoodEntry) => void;
}) {
  const [confirming, setConfirming] = useState(false);
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
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5">
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
        <button onClick={() => onCopy(entry)} className="p-0.5" title="Copy to another time">
          <Copy size={10} className="text-text-muted/20 hover:text-accent-blue" />
        </button>
        <button onClick={() => onEditTime(entry)} className="text-[10px] text-text-muted bg-surface rounded px-1 py-0.5 flex items-center gap-0.5">
          <Clock size={9} />{formatTime12(entry.loggedAt)}
        </button>
        <button onClick={() => onToggleFavorite(entry.id)} className="p-0.5">
          <Star size={10} className={entry.isFavorite ? 'text-nutrition fill-nutrition' : 'text-text-muted/20'} />
        </button>
        {confirming ? (
          <>
            <button onClick={() => setConfirming(false)} className="text-[9px] px-1 py-0.5 rounded bg-surface text-text-muted hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button onClick={() => onDelete(entry.id)} className="text-[9px] px-1 py-0.5 rounded bg-danger text-white transition-colors">
              Delete
            </button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="p-0.5">
            <Trash2 size={10} className="text-text-muted/20 hover:text-danger" />
          </button>
        )}
      </div>
    </div>
  );
}

// Droppable hour slot
function HourSlot({ hour, children, onAddAtHour, isOver, summary, labelsRight }: {
  hour: number; children: React.ReactNode; onAddAtHour: (hour: number) => void; isOver: boolean;
  summary?: { cals: number; protein: number; carbs: number; fat: number; count: number };
  labelsRight?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `hour-${hour}` });
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

  const label = (
    <div className={`w-[38px] pt-1.5 shrink-0 ${labelsRight ? 'text-left' : 'text-right'}`}>
      <span className={`text-xs font-medium ${hasChildren ? 'text-text-secondary' : 'text-text-muted/40'}`}>
        {formatHourLabel(hour)}
      </span>
    </div>
  );

  const dot = (
    <div className="flex flex-col items-center shrink-0 pt-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${hasChildren ? 'bg-accent-orange' : isOver ? 'bg-accent-blue' : 'bg-border/40'}`} />
      <div className="w-px flex-1 bg-border/20 mt-1" />
    </div>
  );

  const content = (
    <div className="flex-1 min-w-0 pb-1">
      {hasChildren ? (
        <div className="space-y-1 pt-0.5">
          {summary && (
            <div className="flex items-center gap-2.5 px-1 pb-1 border-b border-border/30">
              <span className="text-[10px] font-semibold text-accent-orange">{summary.cals} cal</span>
              <span className="text-[10px] text-text-muted">P{summary.protein}</span>
              <span className="text-[10px] text-text-muted">C{summary.carbs}</span>
              <span className="text-[10px] text-text-muted">F{summary.fat}</span>
              {summary.count > 1 && (
                <span className="text-[9px] text-text-muted/50">{summary.count} items</span>
              )}
              <button
                onClick={() => onAddAtHour(hour)}
                className="ml-auto p-0.5 rounded hover:bg-surface-raised transition-colors"
                title="Add to this time"
              >
                <Plus size={12} className="text-text-muted/40 hover:text-accent-orange" />
              </button>
            </div>
          )}
          {children}
        </div>
      ) : (
        <button
          onClick={() => onAddAtHour(hour)}
          className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-text-muted/40 hover:text-text-muted hover:bg-surface-raised/50 transition-colors ${isOver ? 'text-accent-blue bg-accent-blue/10' : ''}`}
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={`relative flex gap-2 min-h-[36px] transition-colors rounded-lg ${isOver ? 'bg-accent-blue/5' : ''}`}
    >
      {labelsRight ? (
        <>{content}{dot}{label}</>
      ) : (
        <>{label}{dot}{content}</>
      )}
    </div>
  );
}

export default function Nutrition({ profile, onUpdateProfile }: NutritionPageProps) {
  const location = useLocation();
  const {
    entries, allFavorites, selectedDate, setSelectedDate, loading,
    addEntry, deleteEntry, updateEntry, updateEntryTime, toggleFavorite, getTodayTotals, refreshEntries,
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
  const [foodLibrary, setFoodLibrary] = useState<SavedFood[]>(() => getSavedFoods(profile.id));
  const [foodLibSearch, setFoodLibSearch] = useState('');
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [favSearch, setFavSearch] = useState('');
  const [myFoodsOpen, setMyFoodsOpen] = useState(true);
  const [savedMealsOpen, setSavedMealsOpen] = useState(true);
  const [savedMealsSearch, setSavedMealsSearch] = useState('');
  const [mealPlansOpen, setMealPlansOpen] = useState(true);
  const [editingFood, setEditingFood] = useState<SavedFood | null>(null);
  const [editFoodCal, setEditFoodCal] = useState('');
  const [editFoodP, setEditFoodP] = useState('');
  const [editFoodC, setEditFoodC] = useState('');
  const [editFoodF, setEditFoodF] = useState('');
  const [editFoodServing, setEditFoodServing] = useState('');
  const [editFoodUnit, setEditFoodUnit] = useState('g');
  const [editFoodFiber, setEditFoodFiber] = useState('');
  const [editFoodQuery, setEditFoodQuery] = useState('');
  const [editFoodBarcode, setEditFoodBarcode] = useState('');
  const [editFoodBrand, setEditFoodBrand] = useState('');
  const [editFoodEmoji, setEditFoodEmoji] = useState('');
  const [usdaFoodResults, setUsdaFoodResults] = useState<{ name: string; brand?: string; cal: number; p: number; c: number; f: number; fiber: number; source: string }[]>([]);
  const [usdaFoodSearching, setUsdaFoodSearching] = useState(false);
  const [pendingFoodEdit, setPendingFoodEdit] = useState<{
    foodName: string;
    updates: Partial<Omit<SavedFood, 'frequency' | 'lastUsed'>>;
  } | null>(null);
  const [foodEditAffectedCount, setFoodEditAffectedCount] = useState(0);
  const [showFoodEditWarning, setShowFoodEditWarning] = useState(false);

  // Voice mode
  const voiceEnabled = getVoiceConfig().aiVoice && !!getApiKey();
  const voiceMode = useVoiceMode({
    mode: 'food',
    enabled: voiceEnabled,
    onAddFoodEntry: addEntry,
    selectedDate,
  });
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
  const [copyingEntry, setCopyingEntry] = useState<FoodEntry | null>(null);
  const [copyTimeValue, setCopyTimeValue] = useState('12:00');
  const [mealBuilderAddToToday, setMealBuilderAddToToday] = useState(false);
  const [overHour, setOverHour] = useState<string | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);
  const [labelsRight, setLabelsRight] = useState(() => localStorage.getItem('fitos-timeline-labels-right') === 'true');

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

  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);

  const totals = getTodayTotals();
  const targets = profile.macroTargets;
  const isToday = selectedDate === today();
  const favorites = allFavorites;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const favoriteKeys = new Set(
    allFavorites.map((f) => f.fdcId ? `fdc:${f.fdcId}` : `${f.name}|${f.brand || ''}`)
  );
  const sortedEntries = [...entries]
    .map((e) => ({
      ...e,
      isFavorite: e.isFavorite || favoriteKeys.has(e.fdcId ? `fdc:${e.fdcId}` : `${e.name}|${e.brand || ''}`),
    }))
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());

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

  function handleCopyEntry(entry: FoodEntry) {
    setCopyingEntry(entry);
    const d = new Date(entry.loggedAt);
    setCopyTimeValue(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setModal('copy-entry');
  }

  function handleConfirmCopyEntry() {
    if (!copyingEntry) return;
    const { id: _id, profileId: _pid, loggedAt: _la, ...rest } = copyingEntry;
    addEntry({ ...rest, date: selectedDate, loggedAt: buildLoggedAt(copyTimeValue) });
    toast(`Copied ${copyingEntry.name}`, 'success');
    setModal(null);
    setCopyingEntry(null);
  }

  async function handleFoodEditChoice(choice: 'all' | 'library' | 'copy') {
    if (!pendingFoodEdit) return;
    const { foodName, updates } = pendingFoodEdit;
    if (choice === 'all') {
      await updateSavedFood(profile.id, foodName, updates);
      toast('Food updated! All tracked entries synced.', 'success');
    } else if (choice === 'library') {
      updateSavedFoodLibraryOnly(profile.id, foodName, updates);
      toast('Library updated. Past entries unchanged.', 'success');
    } else {
      const newName = saveAsNewFood(profile.id, foodName, updates);
      toast(`Saved as "${newName}". History unchanged.`, 'success');
    }
    setFoodLibrary(getSavedFoods(profile.id));
    setEditingFood(null);
    setUsdaFoodResults([]);
    setEditFoodQuery('');
    await refreshEntries();
    setShowFoodEditWarning(false);
    setPendingFoodEdit(null);
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
    setModal('add');
  }

  function buildLoggedAt(time: string): string {
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  }

  function addEntryWithTime(entry: Parameters<typeof addEntry>[0]) {
    const time = addAtTime || currentTimeRounded();
    addEntry({ ...entry, date: selectedDate, loggedAt: buildLoggedAt(time) });
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

  function handleAddFromLibrary(food: SavedFood) {
    addEntry({ date: selectedDate, name: food.name, brand: food.brand, servingSize: food.servingSize || 1, servingUnit: food.servingUnit || 'g', servingsConsumed: 1, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber, source: food.source || 'manual', mealType: 'snack' });
    toast(`Added ${food.name}`, 'success');
  }

  function openMealBuilder() {
    setAddAtTime(null);
    setModal('add');
  }

  function handleSaveMeal() {
    if (!saveMealName.trim()) return;
    addSavedMeal(profile.id, { name: saveMealName.trim(), emoji: getFoodEmoji(saveMealName), calories: parseFloat(saveMealCal) || 0, protein: parseFloat(saveMealProtein) || 0, carbs: parseFloat(saveMealCarbs) || 0, fat: parseFloat(saveMealFat) || 0, fiber: parseFloat(saveMealFiber) || undefined, servingSize: parseFloat(saveMealServing) || 1, servingUnit: saveMealUnit });
    setSavedMeals(getSavedMeals(profile.id));
    setSaveMealName(''); setSaveMealCal(''); setSaveMealProtein(''); setSaveMealCarbs(''); setSaveMealFat(''); setSaveMealFiber(''); setSaveMealServing('1'); setSaveMealUnit('serving');
    setModal(null);
    toast('Saved to My Foods', 'success');
  }

  function handleMealBuilderSave(meal: Omit<SavedMeal, 'id' | 'profileId' | 'createdAt'>, ingredients?: MealIngredient[]) {
    if (editingMeal) {
      updateSavedMeal(profile.id, { ...editingMeal, ...meal });
      toast(`${meal.name} updated`, 'success');
    } else {
      addSavedMeal(profile.id, meal);
      toast(`${meal.name} saved to My Foods`, 'success');
    }
    setSavedMeals(getSavedMeals(profile.id));
    if (mealBuilderAddToToday && ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        const factor = ing.amount / (ing.servingSize || 1);
        addEntryWithTime({
          date: selectedDate,
          name: ing.name, brand: ing.brand,
          servingSize: ing.amount, servingUnit: ing.servingUnit,
          servingsConsumed: 1,
          calories: Math.round(ing.calories * factor),
          protein: Math.round(ing.protein * factor * 10) / 10,
          carbs: Math.round(ing.carbs * factor * 10) / 10,
          fat: Math.round(ing.fat * factor * 10) / 10,
          fiber: ing.fiber ? Math.round(ing.fiber * factor * 10) / 10 : undefined,
          source: 'manual', mealType: 'snack',
        });
      }
      toast(`Also added to today's log`, 'success');
    }
    setEditingMeal(null);
    setModal(null);
    setMealBuilderAddToToday(false);
    setAddAtTime(null);
  }

  function handleMealBuilderAddToLog(ingredients: MealIngredient[]) {
    for (const ing of ingredients) {
      const factor = ing.amount / (ing.servingSize || 1);
      addEntryWithTime({
        date: selectedDate,
        name: ing.name, brand: ing.brand,
        servingSize: ing.amount, servingUnit: ing.servingUnit,
        servingsConsumed: 1,
        calories: Math.round(ing.calories * factor),
        protein: Math.round(ing.protein * factor * 10) / 10,
        carbs: Math.round(ing.carbs * factor * 10) / 10,
        fat: Math.round(ing.fat * factor * 10) / 10,
        fiber: ing.fiber ? Math.round(ing.fiber * factor * 10) / 10 : undefined,
        source: 'manual', mealType: 'snack',
      });
    }
    toast(`${ingredients.length} item${ingredients.length > 1 ? 's' : ''} added to log`, 'success');
    setEditingMeal(null);
    setModal(null);
    setAddAtTime(null);
  }

  function handleDeleteSavedMeal(id: string) {
    deleteSavedMeal(profile.id, id);
    setSavedMeals(getSavedMeals(profile.id));
  }

  return (
    <div className="space-y-4 pb-24">
      {showFoodEditWarning && pendingFoodEdit && (
        <FoodEditWarningModal
          foodName={pendingFoodEdit.foodName}
          affectedCount={foodEditAffectedCount}
          onUpdateAll={() => handleFoodEditChoice('all')}
          onLibraryOnly={() => handleFoodEditChoice('library')}
          onSaveAsCopy={() => handleFoodEditChoice('copy')}
          onCancel={() => { setShowFoodEditWarning(false); setPendingFoodEdit(null); }}
        />
      )}
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
            <button
              type="button"
              onClick={() => { setAddAtTime(null); setModal('add'); }}
              className="flex-1 bg-surface rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <Plus size={14} className="text-accent-orange" />
              <span className="text-xs font-medium">Add</span>
            </button>
            <button
              type="button"
              title={labelsRight ? 'Move times to left' : 'Move times to right'}
              onClick={() => {
                const next = !labelsRight;
                setLabelsRight(next);
                localStorage.setItem('fitos-timeline-labels-right', String(next));
              }}
              className="bg-surface rounded-xl px-3 flex items-center justify-center active:scale-[0.98] transition-transform"
            >
              {labelsRight ? <AlignLeft size={14} className="text-text-muted" /> : <AlignRight size={14} className="text-text-muted" />}
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
                    const slotSummary = hourEntries.length > 0 ? {
                      cals: hourEntries.reduce((s, e) => s + Math.round(e.calories * e.servingsConsumed), 0),
                      protein: Math.round(hourEntries.reduce((s, e) => s + e.protein * e.servingsConsumed, 0)),
                      carbs: Math.round(hourEntries.reduce((s, e) => s + e.carbs * e.servingsConsumed, 0)),
                      fat: Math.round(hourEntries.reduce((s, e) => s + e.fat * e.servingsConsumed, 0)),
                      count: hourEntries.length,
                    } : undefined;
                    return (
                      <HourSlot key={hour} hour={hour} onAddAtHour={handleAddAtHour} isOver={overHour === `hour-${hour}`} summary={slotSummary} labelsRight={labelsRight}>
                        {hourEntries.map((entry) => (
                          <DraggableEntry
                            key={entry.id}
                            entry={entry}
                            onDelete={deleteEntry}
                            onToggleFavorite={toggleFavorite}
                            onEditTime={handleEditTime}
                            onEdit={handleEditEntry}
                            onCopy={handleCopyEntry}
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

          {/* Voice mode */}
          {voiceEnabled && (
            <>
              <VoiceMicButton
                onTranscript={voiceMode.handleTranscript}
                position="nutrition"
                isProcessing={voiceMode.isProcessing}
              />
              {voiceMode.pendingAction && (
                <VoiceConfirmationCard
                  message={voiceMode.pendingAction.message}
                  detail={voiceMode.pendingAction.detail}
                  onConfirm={voiceMode.confirmAction}
                  onCancel={voiceMode.cancelAction}
                />
              )}
            </>
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
          {/* Build a Meal — primary CTA */}
          <button onClick={() => { setEditingMeal(null); setAddAtTime(null); setModal('meal-builder'); }} className="w-full bg-accent-blue/10 border border-accent-blue/20 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center"><Plus size={20} className="text-accent-blue" /></div>
            <div>
              <div className="text-sm font-semibold text-accent-blue">Build a Meal</div>
              <div className="text-[11px] text-text-muted">Multi-ingredient meal with full macros</div>
            </div>
          </button>

          {/* Save single food */}
          <div className="flex gap-2">
            <button onClick={() => setModal('save-meal')} className="flex-1 bg-surface rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <Search size={14} className="text-text-muted" /><span className="text-xs text-text-secondary">Search & Save Food</span>
            </button>
            <button onClick={() => setModal('save-meal-manual')} className="flex-1 bg-surface rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <BookmarkPlus size={14} className="text-text-muted" /><span className="text-xs text-text-secondary">Enter Manually</span>
            </button>
          </div>

          {favorites.length > 0 && (
            <div>
              <button onClick={() => setFavoritesOpen((o) => !o)} className="w-full flex items-center justify-between mb-2">
                <h3 className="label flex items-center gap-1.5"><Star size={11} className="text-nutrition" /> Favorites <span className="text-text-muted font-normal">({favorites.length})</span></h3>
                {favoritesOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </button>
              {favoritesOpen && (
                <>
                  {favorites.length > 10 && (
                    <input type="text" className="input-field text-xs mb-2 w-full" placeholder="Search favorites..."
                      value={favSearch} onChange={(e) => setFavSearch(e.target.value)} />
                  )}
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
                    {favorites.filter((e) => !favSearch || e.name.toLowerCase().includes(favSearch.toLowerCase())).map((entry) => (
                      <div key={entry.id} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                        <span className="text-lg">{getFoodEmoji(entry.name)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{entry.name}</div>
                          <div className="text-[10px] text-text-muted">{Math.round(entry.calories)} cal · P{Math.round(entry.protein)}g · C{Math.round(entry.carbs)}g · F{Math.round(entry.fat)}g</div>
                        </div>
                        <button onClick={() => toggleFavorite(entry.id)} className="p-1.5 text-nutrition" title="Remove from favorites">
                          <Star size={14} className="fill-nutrition" />
                        </button>
                        <button onClick={() => handleQuickAddFavorite(entry)} className="bg-surface-raised px-3 py-1.5 rounded-lg text-[10px] font-medium text-accent-blue">+ Add</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* My Foods — individual foods saved from search or manual entry */}
          <div>
            <button onClick={() => setMyFoodsOpen((o) => !o)} className="w-full flex items-center justify-between mb-2">
              <h3 className="label">My Foods {foodLibrary.length > 0 && <span className="text-text-muted font-normal">({foodLibrary.length})</span>}</h3>
              {myFoodsOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
            </button>
            {myFoodsOpen && (foodLibrary.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">🥗</div>
                <p className="text-sm text-text-muted">No saved foods yet</p>
                <p className="text-[10px] text-text-muted/70 mt-1">Use "Search & Save Food" or "Enter Manually" above to build your library</p>
              </div>
            ) : (
              <>
                <input
                  type="text" className="input-field text-xs mb-2 w-full" placeholder="Search your food library..."
                  value={foodLibSearch} onChange={(e) => setFoodLibSearch(e.target.value)}
                />
                {(() => {
                  const q = foodLibSearch.toLowerCase();
                  const filtered = q ? foodLibrary.filter((f) => f.name.toLowerCase().includes(q)) : foodLibrary;
                  const zeroCount = foodLibrary.filter((f) => f.calories === 0 && f.protein === 0).length;
                  return (
                    <>
                      {!q && zeroCount > 0 && (
                        <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-[10px] text-warning mb-2">
                          {zeroCount} food{zeroCount !== 1 ? 's' : ''} missing macro data — tap to update
                        </div>
                      )}
                      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-0.5">
                        {filtered.slice(0, 100).map((food) => {
                          const hasMacros = food.calories > 0 || food.protein > 0;
                          const isEditing = editingFood?.name === food.name;

                          if (isEditing) {
                            return (
                              <div key={food.name} className="bg-surface rounded-xl p-3 space-y-2 border border-accent-blue/30">
                                <div className="flex items-center gap-2">
                                  <input type="text" className="w-8 text-center text-lg bg-transparent outline-none" value={editFoodEmoji} onChange={(e) => setEditFoodEmoji(e.target.value)} />
                                  <div className="text-xs font-semibold flex-1">{food.name}</div>
                                </div>

                                {/* Search built-in + USDA */}
                                <div className="flex gap-1">
                                  <input type="text" className="input-field text-xs flex-1 py-1.5" placeholder="Search foods & USDA..."
                                    value={editFoodQuery} onChange={(e) => setEditFoodQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') {
                                      const q = (editFoodQuery || food.name).toLowerCase();
                                      const qw = q.split(/\s+/).filter((w: string) => w.length > 2);
                                      const builtinR = FOOD_DATABASE.filter((bf) => { const n = bf.name.toLowerCase(); return qw.some((w: string) => n.includes(w)); }).slice(0, 5).map((bf) => ({
                                        name: bf.name, brand: undefined, cal: Math.round(bf.per100g.calories * bf.commonServing.grams / 100),
                                        p: Math.round(bf.per100g.protein * bf.commonServing.grams / 100 * 10) / 10,
                                        c: Math.round(bf.per100g.carbs * bf.commonServing.grams / 100 * 10) / 10,
                                        f: Math.round(bf.per100g.fat * bf.commonServing.grams / 100 * 10) / 10,
                                        fiber: bf.per100g.fiber ? Math.round(bf.per100g.fiber * bf.commonServing.grams / 100 * 10) / 10 : 0,
                                        source: 'DB',
                                      }));
                                      setUsdaFoodResults(builtinR);
                                      setUsdaFoodSearching(true);
                                      searchUSDA(editFoodQuery || food.name).then((results) => {
                                        setUsdaFoodResults([...builtinR, ...results.slice(0, 5).map((r) => ({
                                          name: r.name, brand: r.brand, cal: r.caloriesPer100g, p: r.proteinPer100g,
                                          c: r.carbsPer100g, f: r.fatPer100g, fiber: r.fiberPer100g, source: 'USDA',
                                        }))]);
                                        setUsdaFoodSearching(false);
                                      }).catch(() => setUsdaFoodSearching(false));
                                    }}}
                                  />
                                  <button onClick={() => {
                                    const q = (editFoodQuery || food.name).toLowerCase();
                                    const qw = q.split(/\s+/).filter((w: string) => w.length > 2);
                                    const builtinR = FOOD_DATABASE.filter((bf) => { const n = bf.name.toLowerCase(); return qw.some((w: string) => n.includes(w)); }).slice(0, 5).map((bf) => ({
                                      name: bf.name, brand: undefined, cal: Math.round(bf.per100g.calories * bf.commonServing.grams / 100),
                                      p: Math.round(bf.per100g.protein * bf.commonServing.grams / 100 * 10) / 10,
                                      c: Math.round(bf.per100g.carbs * bf.commonServing.grams / 100 * 10) / 10,
                                      f: Math.round(bf.per100g.fat * bf.commonServing.grams / 100 * 10) / 10,
                                      fiber: bf.per100g.fiber ? Math.round(bf.per100g.fiber * bf.commonServing.grams / 100 * 10) / 10 : 0,
                                      source: 'DB',
                                    }));
                                    setUsdaFoodResults(builtinR);
                                    setUsdaFoodSearching(true);
                                    searchUSDA(editFoodQuery || food.name).then((results) => {
                                      setUsdaFoodResults([...builtinR, ...results.slice(0, 5).map((r) => ({
                                        name: r.name, brand: r.brand, cal: r.caloriesPer100g, p: r.proteinPer100g,
                                        c: r.carbsPer100g, f: r.fatPer100g, fiber: r.fiberPer100g, source: 'USDA',
                                      }))]);
                                      setUsdaFoodSearching(false);
                                    }).catch(() => setUsdaFoodSearching(false));
                                  }} disabled={usdaFoodSearching} className="bg-accent-blue text-white px-2 rounded-lg">
                                    {usdaFoodSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                                  </button>
                                </div>

                                {usdaFoodResults.length > 0 && (
                                  <div className="space-y-1 max-h-28 overflow-y-auto">
                                    {usdaFoodResults.map((r, ri) => (
                                      <button key={ri} onClick={() => {
                                        setEditFoodCal(String(r.cal)); setEditFoodP(String(r.p));
                                        setEditFoodC(String(r.c)); setEditFoodF(String(r.f));
                                        setEditFoodFiber(String(r.fiber || 0));
                                        setEditFoodServing(r.source === 'USDA' ? '100' : String(r.cal > 0 ? Math.round(r.cal / (r.cal / 100)) : 100));
                                        setEditFoodUnit('g');
                                        setUsdaFoodResults([]);
                                      }} className="w-full text-left bg-surface-raised rounded-md px-2 py-1 text-[10px] hover:bg-border">
                                        <div className="flex items-center gap-1">
                                          <span className="font-medium truncate flex-1">{r.name}</span>
                                          <span className={`text-[8px] px-1 rounded ${r.source === 'DB' ? 'bg-accent-blue/15 text-accent-blue' : 'bg-green-500/15 text-green-500'}`}>{r.source}</span>
                                        </div>
                                        {r.brand && <div className="text-text-muted">{r.brand}</div>}
                                        <div className="text-text-muted">{r.cal}cal · P{r.p}g · C{r.c}g · F{r.f}g</div>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Macros */}
                                <div className="grid grid-cols-5 gap-1">
                                  <div><label className="text-[8px] text-text-muted">Cal</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodCal} onChange={(e) => setEditFoodCal(e.target.value)} /></div>
                                  <div><label className="text-[8px] text-text-muted">Prot</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodP} onChange={(e) => setEditFoodP(e.target.value)} /></div>
                                  <div><label className="text-[8px] text-text-muted">Carbs</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodC} onChange={(e) => setEditFoodC(e.target.value)} /></div>
                                  <div><label className="text-[8px] text-text-muted">Fat</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodF} onChange={(e) => setEditFoodF(e.target.value)} /></div>
                                  <div><label className="text-[8px] text-text-muted">Fiber</label><input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodFiber} onChange={(e) => setEditFoodFiber(e.target.value)} /></div>
                                </div>
                                {/* Serving + Brand */}
                                <div className="grid grid-cols-2 gap-1">
                                  <div>
                                    <label className="text-[8px] text-text-muted">Serving (g)</label>
                                    <input type="text" inputMode="decimal" className="input-field text-xs w-full py-1" value={editFoodServing} onChange={(e) => setEditFoodServing(e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-text-muted">Brand</label>
                                    <input type="text" className="input-field text-xs w-full py-1" placeholder="Optional" value={editFoodBrand} onChange={(e) => setEditFoodBrand(e.target.value)} />
                                  </div>
                                </div>
                                {/* Barcode */}
                                <div>
                                  <label className="text-[8px] text-text-muted">Barcode (optional)</label>
                                  <input type="text" inputMode="numeric" className="input-field text-xs w-full py-1" placeholder="UPC barcode" value={editFoodBarcode} onChange={(e) => setEditFoodBarcode(e.target.value)} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => { setEditingFood(null); setUsdaFoodResults([]); setEditFoodQuery(''); }} className="btn-secondary flex-1 text-xs">Cancel</button>
                                  <button onClick={async () => {
                                    const updates: Partial<Omit<SavedFood, 'frequency' | 'lastUsed'>> = {
                                      calories: parseFloat(editFoodCal) || 0, protein: parseFloat(editFoodP) || 0,
                                      carbs: parseFloat(editFoodC) || 0, fat: parseFloat(editFoodF) || 0,
                                      fiber: parseFloat(editFoodFiber) || undefined,
                                      servingSize: parseFloat(editFoodServing) || 1,
                                      servingUnit: 'g',
                                      brand: editFoodBrand.trim() || undefined,
                                      barcode: editFoodBarcode.trim() || undefined,
                                      emoji: editFoodEmoji.trim() || undefined,
                                    };
                                    const count = await countFoodLogEntries(profile.id, food.name);
                                    if (count > 0) {
                                      setPendingFoodEdit({ foodName: food.name, updates });
                                      setFoodEditAffectedCount(count);
                                      setShowFoodEditWarning(true);
                                    } else {
                                      await updateSavedFood(profile.id, food.name, updates);
                                      setFoodLibrary(getSavedFoods(profile.id));
                                      setEditingFood(null);
                                      setUsdaFoodResults([]);
                                      setEditFoodQuery('');
                                      await refreshEntries();
                                      toast('Food updated!', 'success');
                                    }
                                  }} className="btn-primary flex-1 text-xs">Save</button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={food.name} className="bg-surface-raised rounded-lg px-3 py-2 flex items-center gap-2">
                              {!hasMacros && <AlertCircle size={12} className="text-warning shrink-0" />}
                              <button onClick={() => {
                                setEditingFood(food);
                                setEditFoodCal(String(food.calories)); setEditFoodP(String(food.protein));
                                setEditFoodC(String(food.carbs)); setEditFoodF(String(food.fat));
                                setEditFoodFiber(String(food.fiber || '')); setEditFoodQuery('');
                                setEditFoodServing(String(food.servingSize || 1)); setEditFoodUnit('g');
                                setEditFoodBarcode(food.barcode || ''); setEditFoodBrand(food.brand || '');
                                setEditFoodEmoji(food.emoji || getFoodEmoji(food.name));
                                setUsdaFoodResults([]);
                              }} className="flex-1 min-w-0 text-left">
                                <div className="text-xs font-medium truncate">{food.name}</div>
                                {food.brand && <div className="text-[9px] text-text-muted truncate">{food.brand}</div>}
                                {hasMacros ? (
                                  <div className="text-[10px] text-text-muted">
                                    {food.calories}cal · P{food.protein}g · C{food.carbs}g · F{food.fat}g · {food.servingSize || 1}g
                                    {food.barcode && <span className="ml-1 text-[8px] text-green-500">UPC</span>}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-warning">Tap to add macros</div>
                                )}
                              </button>
                              {hasMacros && (
                                <button onClick={() => handleAddFromLibrary(food)} className="bg-surface rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-accent-blue shrink-0">+ Add</button>
                              )}
                              <button onClick={() => {
                                deleteSavedFood(profile.id, food.name);
                                setFoodLibrary(getSavedFoods(profile.id));
                              }} className="p-1.5 shrink-0"><Trash2 size={12} className="text-text-muted/40 hover:text-danger" /></button>
                            </div>
                          );
                        })}
                        {filtered.length > 100 && <p className="text-[10px] text-text-muted text-center py-1">Showing 100 of {filtered.length} — search to narrow down</p>}
                      </div>
                    </>
                  );
                })()}
              </>
            ))}
          </div>

          {/* Saved Meals — multi-ingredient meals built with "Build a Meal" */}
          {savedMeals.length > 0 && (
            <div>
              <button onClick={() => setSavedMealsOpen((o) => !o)} className="w-full flex items-center justify-between mb-2">
                <h3 className="label flex items-center gap-1.5"><Bookmark size={11} /> Saved Meals <span className="text-text-muted font-normal">({savedMeals.length})</span></h3>
                {savedMealsOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </button>
              {savedMealsOpen && (
                <>
                  {savedMeals.length > 10 && (
                    <input type="text" className="input-field text-xs mb-2 w-full" placeholder="Search saved meals..."
                      value={savedMealsSearch} onChange={(e) => setSavedMealsSearch(e.target.value)} />
                  )}
                  <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5">
                    {savedMeals.filter((m) => !savedMealsSearch || m.name.toLowerCase().includes(savedMealsSearch.toLowerCase())).map((meal) => (
                      <div key={meal.id} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                        <span className="text-lg">{meal.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{meal.name}</div>
                          <div className="text-[10px] text-text-muted">
                            {Math.round(meal.calories)} cal · P{Math.round(meal.protein)}g · C{Math.round(meal.carbs)}g · F{Math.round(meal.fat)}g
                            {meal.servingSize > 0 && <span className="text-text-muted/60"> · {meal.servingSize}{meal.servingUnit}</span>}
                          </div>
                          {meal.ingredients && meal.ingredients.length > 0 && (
                            <div className="text-[9px] text-text-muted/50 mt-0.5 truncate">{meal.ingredients.map((i) => i.name).join(', ')}</div>
                          )}
                        </div>
                        <button onClick={() => { setEditingMeal(meal); setAddAtTime(null); setModal('meal-builder'); }} className="px-2 py-1.5 rounded-lg text-[10px] text-text-muted hover:text-accent-blue">Edit</button>
                        <button onClick={() => handleQuickAdd(meal)} className="bg-surface-raised px-3 py-1.5 rounded-lg text-[10px] font-medium text-accent-blue">+ Add</button>
                        <button onClick={() => handleDeleteSavedMeal(meal.id)} className="p-1.5"><Trash2 size={12} className="text-text-muted/40 hover:text-danger" /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Meal Plans */}
          <div>
            <button onClick={() => setMealPlansOpen((o) => !o)} className="w-full flex items-center justify-between mb-2">
              <h3 className="label flex items-center gap-1.5"><Clock size={11} /> Meal Plans {mealPlans.length > 0 && <span className="text-text-muted font-normal">({mealPlans.length})</span>}</h3>
              {mealPlansOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
            </button>

            {mealPlansOpen && entries.length > 0 && (
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

            {mealPlansOpen && (mealPlans.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No meal plans saved yet. Log a day of food, then save it here.</p>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
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
            ))}
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
      {tab === 'charts' && <NutritionCharts profileId={profile.id} targets={targets} fiberTarget={profile.fiberTarget ?? 30} />}

      {/* Modals */}
      <Modal open={modal === 'add'} onClose={() => { setModal(null); setAddAtTime(null); }} title="Add">
        <QuickAddSheet
          profileId={profile.id}
          initialTime={addAtTime ?? currentTimeExact()}
          selectedDate={selectedDate}
          addEntry={addEntry}
          onClose={() => { setModal(null); setAddAtTime(null); }}
          savedMeals={savedMeals}
          dailyTotals={totals}
          macroTargets={targets}
          onSaveToLibrary={() => setFoodLibrary(getSavedFoods(profile.id))}
        />
      </Modal>


      <Modal open={modal === 'copy-entry'} onClose={() => { setModal(null); setCopyingEntry(null); }} title="Copy to Time">
        <div className="space-y-4">
          {copyingEntry && (
            <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
              <span className="text-lg">{getFoodEmoji(copyingEntry.name)}</span>
              <span className="text-sm font-medium">{copyingEntry.name}</span>
            </div>
          )}
          <div>
            <label className="label mb-1.5 block">Copy to time</label>
            <input type="time" className="input-field text-lg py-3 text-center" value={copyTimeValue} onChange={(e) => setCopyTimeValue(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setModal(null); setCopyingEntry(null); }} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={handleConfirmCopyEntry} className="btn-primary flex-1 text-sm">Copy</button>
          </div>
        </div>
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
        {editEntryData && (() => {
          const origServing = editEntryData.servingSize || 1;
          const origCal = editEntryData.calories;
          const origP = editEntryData.protein;
          const origC = editEntryData.carbs;
          const origF = editEntryData.fat;
          const origFiber = editEntryData.fiber || 0;

          const newServing = parseFloat(editEntryServing) || origServing;
          const newQty = parseFloat(editEntryServings) || 1;
          const scaleFactor = (newServing / origServing) * newQty;

          const scaledCal = Math.round(origCal * scaleFactor);
          const scaledP = Math.round(origP * scaleFactor * 10) / 10;
          const scaledC = Math.round(origC * scaleFactor * 10) / 10;
          const scaledF = Math.round(origF * scaleFactor * 10) / 10;
          const scaledFiber = Math.round(origFiber * scaleFactor * 10) / 10;

          return (
          <div className="space-y-3">
            {/* Food name — locked */}
            <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
              <span className="text-lg">{getFoodEmoji(editEntryData.name)}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{editEntryData.name}</div>
                {editEntryData.brand && <div className="text-[10px] text-text-muted">{editEntryData.brand}</div>}
              </div>
            </div>

            {/* Base macros — locked, read-only */}
            <div className="bg-surface-raised rounded-lg px-3 py-2 text-[10px] text-text-muted">
              Base: {origServing}g = {origCal} cal · P{origP}g · C{origC}g · F{origF}g
            </div>

            {/* Editable: serving size + quantity */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label mb-1 block">Your serving (g)</label>
                <input type="text" inputMode="decimal" className="input-field text-sm" value={editEntryServing} onChange={(e) => setEditEntryServing(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1 block">Quantity</label>
                <input type="text" inputMode="decimal" className="input-field text-sm" value={editEntryServings} onChange={(e) => setEditEntryServings(e.target.value)} />
              </div>
            </div>

            {/* Scaled macros — auto-calculated */}
            <div className="bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
              <div><div className="text-lg font-bold text-accent-orange">{scaledCal}</div><div className="text-[9px] text-text-muted">kcal</div></div>
              <div><div className="text-lg font-bold text-accent-blue">{scaledP}g</div><div className="text-[9px] text-text-muted">protein</div></div>
              <div><div className="text-lg font-bold text-success">{scaledC}g</div><div className="text-[9px] text-text-muted">carbs</div></div>
              <div><div className="text-lg font-bold text-nutrition">{scaledF}g</div><div className="text-[9px] text-text-muted">fat</div></div>
            </div>

            <div className="text-[9px] text-accent-blue text-center">
              Macros scale with serving size · Edit base food in My Foods library
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModal(null); setEditEntryData(null); }} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={() => {
                const factor = newServing / origServing;
                updateEntry(editEntryData.id, {
                  servingSize: newServing,
                  servingsConsumed: newQty,
                  calories: Math.round(origCal * factor),
                  protein: Math.round(origP * factor * 10) / 10,
                  carbs: Math.round(origC * factor * 10) / 10,
                  fat: Math.round(origF * factor * 10) / 10,
                  fiber: origFiber > 0 ? Math.round(origFiber * factor * 10) / 10 : undefined,
                });
                setModal(null);
                setEditEntryData(null);
              }} className="btn-primary flex-1 text-sm">Save</button>
            </div>
          </div>
          );
        })()}
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

      <Modal open={modal === 'save-meal'} onClose={() => setModal(null)} title="Save to Library">
        <FoodSearch onAdd={() => {}} onClose={() => setModal(null)} profileId={profile.id} saveOnly={true} />
      </Modal>

      <Modal open={modal === 'save-meal-manual'} onClose={() => setModal(null)} title="Save to Library">
        <ManualEntry onAdd={() => {}} onClose={() => setModal(null)} profileId={profile.id} dailyTotals={totals} macroTargets={targets} saveOnly={true} />
      </Modal>

      <Modal open={modal === 'meal-builder'} onClose={() => { setModal(null); setEditingMeal(null); setAddAtTime(null); setMealBuilderAddToToday(false); }} title={editingMeal ? `Edit — ${editingMeal.name}` : 'Build a Meal'}>
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Also add to today's log</span>
            <button
              type="button"
              onClick={() => setMealBuilderAddToToday((v) => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${mealBuilderAddToToday ? 'bg-accent-blue' : 'bg-surface-raised'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${mealBuilderAddToToday ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {mealBuilderAddToToday && (
            <input
              type="time"
              className="input-field text-sm"
              value={addAtTime || currentTimeExact()}
              onChange={(e) => setAddAtTime(e.target.value)}
            />
          )}
        </div>
        <MealBuilder
          profileId={profile.id}
          onSave={handleMealBuilderSave}
          onAddToLog={handleMealBuilderAddToLog}
          onClose={() => { setModal(null); setEditingMeal(null); setAddAtTime(null); setMealBuilderAddToToday(false); }}
          existingMeal={editingMeal ?? undefined}
        />
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
        <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center">
          <div className="bg-bg w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl pb-20 sm:pb-5">
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
