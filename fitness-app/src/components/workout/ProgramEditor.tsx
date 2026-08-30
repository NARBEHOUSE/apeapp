import { useState, useCallback, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Save,
  BookmarkPlus,
  Dumbbell,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Program, WorkoutDay, Exercise, ExerciseProgressionConfig, ProgramGoal } from '../../types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { ColorPicker, getRandomColor } from '../shared/ColorPicker';
import { buildDayFromWorkout, workoutDayOf, muscleFocus, exerciseCount } from '../../utils/workoutLibrary';
import { ProgressionEditor } from './ProgressionEditor';
import { SetSchemeEditor } from './SetSchemeEditor';
import {
  getGoalDefaults,
} from '../../utils/progression';
import { EXERCISE_LIBRARY } from '../../data/exerciseLibrary';

const COMMON_MUSCLES = ['Abs', 'Back', 'Biceps', 'Calves', 'Cardio', 'Chest', 'Core', 'Forearms', 'Glutes', 'Hamstrings', 'Hip Flexors', 'Lats', 'Lower Back', 'Quadriceps', 'Shoulders', 'Traps', 'Triceps'];
const CUSTOM_MUSCLES_KEY = 'fitos-custom-muscles';
function getCustomMuscles(): string[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_MUSCLES_KEY) || '[]'); } catch { return []; }
}
function persistCustomMuscles(found: string[]) {
  const commonLower = new Set(COMMON_MUSCLES.map((m) => m.toLowerCase()));
  const existing = getCustomMuscles();
  const existingLower = new Set(existing.map((m) => m.toLowerCase()));
  const toAdd = found.filter((m) => !commonLower.has(m.toLowerCase()) && !existingLower.has(m.toLowerCase()));
  if (toAdd.length > 0) localStorage.setItem(CUSTOM_MUSCLES_KEY, JSON.stringify([...existing, ...toAdd]));
}

function MuscleAutocomplete({ label, value, onChange, suggestions, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Support comma-separated: filter on the last segment being typed
  const parts = value.split(',').map((p) => p.trim());
  const lastSegment = parts[parts.length - 1] ?? '';
  const alreadySelected = parts.slice(0, -1).map((p) => p.toLowerCase());
  const filtered = suggestions.filter((s) => {
    const sl = s.toLowerCase();
    if (alreadySelected.includes(sl)) return false;
    if (!lastSegment) return true;
    return sl.includes(lastSegment.toLowerCase()) && sl !== lastSegment.toLowerCase();
  });

  const handleSelect = (m: string) => {
    const before = parts.slice(0, -1).filter(Boolean);
    onChange([...before, m].join(', '));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="label mb-1 block">{label}</label>
      <input
        className="input-field text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-surface border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtered.slice(0, 10).map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(m)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-raised transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const COMMON_FLAGS = ['Lengthened Partials', 'Superset', 'AMRAP', 'Drop Set', 'Myo-Reps', 'Rest-Pause', 'Paused Reps', 'Tempo', 'Giant Set', 'Pre-Exhaust', 'EMOM', 'Cluster Set'];
const CUSTOM_FLAGS_KEY = 'fitos-custom-flags';
function getCustomFlags(): string[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FLAGS_KEY) || '[]'); } catch { return []; }
}
function persistCustomFlag(flag: string) {
  const common = new Set(COMMON_FLAGS.map((f) => f.toLowerCase()));
  if (common.has(flag.toLowerCase())) return;
  const existing = getCustomFlags();
  if (!existing.map((f) => f.toLowerCase()).includes(flag.toLowerCase())) {
    localStorage.setItem(CUSTOM_FLAGS_KEY, JSON.stringify([...existing, flag]));
  }
}

function ExerciseNameAutocomplete({ value, onChange, onSelectLibrary }: {
  value: string;
  onChange: (v: string) => void;
  onSelectLibrary: (name: string, muscles: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = value.trim().toLowerCase();
  const filtered = query.length >= 1
    ? EXERCISE_LIBRARY.filter((ex) => ex.name.toLowerCase().includes(query)).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <label className="label mb-1 block">Name</label>
      <input
        className="input-field text-sm"
        value={value}
        placeholder="Exercise name"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-surface border border-border rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filtered.map((ex) => (
            <button
              key={ex.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelectLibrary(ex.name, ex.muscles); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="text-sm font-medium">{ex.name}</div>
              <div className="text-[0.625rem] text-text-muted">{ex.muscles.join(', ')} · {ex.equipment}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FlagAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allFlags = [...COMMON_FLAGS, ...getCustomFlags().filter((f) => !COMMON_FLAGS.map((c) => c.toLowerCase()).includes(f.toLowerCase()))];
  const query = value.trim().toLowerCase();
  const filtered = allFlags.filter((f) => {
    if (!query) return true;
    return f.toLowerCase().includes(query) && f.toLowerCase() !== query;
  });

  return (
    <div ref={ref} className="relative">
      <label className="label mb-1 block">Flag (optional)</label>
      <input
        className="input-field text-sm"
        value={value}
        placeholder="e.g. Lengthened Partials, Superset"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
          if (value.trim()) persistCustomFlag(value.trim());
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-surface border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtered.slice(0, 10).map((f) => (
            <button
              key={f}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(f); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-raised transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlternativesInput({ value, onChange }: { value: string[]; onChange: (alts: string[]) => void }) {
  const [newAlt, setNewAlt] = useState('');
  return (
    <div>
      <label className="label mb-1 block">Alternatives (optional)</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {value.map((alt) => (
            <span key={alt} className="flex items-center gap-1 text-[0.6875rem] bg-surface-raised rounded-lg px-2 py-0.5">
              {alt}
              <button
                type="button"
                onClick={() => onChange(value.filter((a) => a !== alt))}
                className="text-text-muted hover:text-danger transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          className="input-field text-sm flex-1"
          value={newAlt}
          onChange={(e) => setNewAlt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newAlt.trim()) {
              e.preventDefault();
              if (!value.includes(newAlt.trim())) onChange([...value, newAlt.trim()]);
              setNewAlt('');
            }
          }}
          placeholder="Type name, press Enter to add"
        />
        <button
          type="button"
          onClick={() => {
            if (newAlt.trim() && !value.includes(newAlt.trim())) onChange([...value, newAlt.trim()]);
            setNewAlt('');
          }}
          className="px-3 py-2 rounded-xl bg-surface-raised text-text-secondary text-xs font-medium hover:bg-surface active:scale-95 transition-all"
        >
          Add
        </button>
      </div>
      <p className="text-[0.625rem] text-text-muted mt-1">These will appear as swap options during a workout.</p>
    </div>
  );
}


function SortableDayWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-start gap-1">
        <button {...attributes} {...listeners} className="mt-3 p-1 cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted touch-none">
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

interface Props {
  program: Program;
  fitnessGoal?: 'lose' | 'maintain' | 'build';
  /**
   * 'workout' edits a single standalone session: one day, no rotation, no duration.
   * Everything below the day header is the same editor either way.
   */
  mode?: 'program' | 'workout';
  /** The user's standalone workouts, so a program can be built out of ones they already have. */
  savedWorkouts?: Program[];
  onSave: (program: Program) => void;
  onClose: () => void;
}



function SortableExercise({
  exercise,
  goalType,
  durationWeeks,
  allMuscles,
  onUpdate,
  onRemove,
}: {
  exercise: Exercise;
  goalType: string;
  durationWeeks: number;
  allMuscles: string[];
  onUpdate: (id: string, updates: Partial<Exercise>) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-surface rounded-xl border border-border-light"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          className="touch-none p-1 text-text-muted hover:text-text-secondary cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left min-w-0"
        >
          <span className="text-sm font-medium truncate block">
            {exercise.name || (exercise.exerciseType === 'cardio' ? 'Untitled Cardio' : 'Untitled Exercise')}
          </span>
          <span className="text-xs text-text-secondary">
            {exercise.exerciseType === 'cardio' ? (
              <>
                {exercise.targetDuration ? `${exercise.targetDuration} min` : 'Cardio'}
                {exercise.targetIntensity && ` · ${exercise.targetIntensity}`}
              </>
            ) : (
              <>
                {exercise.sets}x{exercise.reps}
                {exercise.startingWeight != null && ` @ ${exercise.startingWeight}`}
                {exercise.muscle && ` - ${exercise.muscle}`}
              </>
            )}
          </span>
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-text-muted"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          onClick={() => onRemove(exercise.id)}
          className="p-1 text-text-muted hover:text-danger transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && exercise.exerciseType === 'cardio' ? (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <div>
            <label className="label mb-1 block">Cardio Name</label>
            <input
              className="input-field text-sm"
              value={exercise.name}
              onChange={(e) => onUpdate(exercise.id, { name: e.target.value })}
              placeholder="e.g. Treadmill Run, Cycling"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 block">Target Duration (min)</label>
              <input
                type="text"
                inputMode="numeric"
                className="input-field text-sm"
                value={exercise.targetDuration ?? ''}
                onChange={(e) => onUpdate(exercise.id, { targetDuration: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="e.g. 30"
              />
            </div>
            <div>
              <label className="label mb-1 block">Target Intensity</label>
              <div className="flex gap-1">
                {(['low', 'moderate', 'high'] as const).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onUpdate(exercise.id, { targetIntensity: i })}
                    className={`flex-1 py-2 rounded-lg text-[0.625rem] font-medium capitalize transition-colors ${
                      exercise.targetIntensity === i
                        ? i === 'low' ? 'bg-success/20 text-success' : i === 'moderate' ? 'bg-accent-orange/20 text-accent-orange' : 'bg-danger/20 text-danger'
                        : 'bg-surface-raised text-text-muted'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Notes (optional)</label>
            <input
              className="input-field text-sm"
              value={exercise.note}
              onChange={(e) => onUpdate(exercise.id, { note: e.target.value })}
              placeholder="e.g. incline 5%, Zone 2 HR"
            />
          </div>
        </div>
      ) : expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <ExerciseNameAutocomplete
            value={exercise.name}
            onChange={(v) => onUpdate(exercise.id, { name: v })}
            onSelectLibrary={(name, muscles) => onUpdate(exercise.id, {
              name,
              muscle: muscles[0] || exercise.muscle,
              secondaryMuscles: muscles.slice(1).join(', ') || exercise.secondaryMuscles,
            })}
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label mb-1 block">Sets</label>
              <input
                type="text"
                inputMode="numeric"
                className="input-field text-sm"
                value={exercise.sets || ''}
                onChange={(e) =>
                  onUpdate(exercise.id, {
                    sets: parseInt(e.target.value, 10) || 0,
                  })
                }
                placeholder="3"
              />
            </div>
            <div>
              <label className="label mb-1 block">Reps</label>
              <input
                className="input-field text-sm"
                value={exercise.reps}
                onChange={(e) => onUpdate(exercise.id, { reps: e.target.value })}
                placeholder="e.g. 8-12"
              />
            </div>
            <div>
              <label className="label mb-1 block">Weight</label>
              <input
                type="text"
                inputMode="decimal"
                className="input-field text-sm"
                value={exercise.startingWeight ?? ''}
                onChange={(e) =>
                  onUpdate(exercise.id, {
                    startingWeight: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <MuscleAutocomplete
            label="Primary Muscles"
            value={exercise.muscle}
            onChange={(v) => onUpdate(exercise.id, { muscle: v })}
            suggestions={allMuscles}
            placeholder="e.g. Quads, Hamstrings, Glutes"
          />
          <MuscleAutocomplete
            label="Secondary Muscles"
            value={Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles.join(', ') : (exercise.secondaryMuscles || '')}
            onChange={(v) => onUpdate(exercise.id, { secondaryMuscles: v })}
            suggestions={allMuscles.filter((m) => !exercise.muscle.split(',').map((x) => x.trim()).includes(m))}
            placeholder="e.g. Triceps, Shoulders"
          />
          <AlternativesInput
            value={exercise.alternatives || []}
            onChange={(alts) => onUpdate(exercise.id, { alternatives: alts.length > 0 ? alts : undefined })}
          />
          <div>
            <label className="label mb-1 block">Note (optional)</label>
            <input
              className="input-field text-sm"
              value={exercise.note}
              onChange={(e) => onUpdate(exercise.id, { note: e.target.value })}
              placeholder="e.g. Pause at bottom"
            />
          </div>
          <FlagAutocomplete
            value={exercise.flag || ''}
            onChange={(v) => onUpdate(exercise.id, { flag: v || undefined })}
          />
          <div>
            <label className="label mb-1 block">Rest Timer Override (seconds)</label>
            <input
              type="text"
              inputMode="numeric"
              className="input-field text-sm"
              value={exercise.restTimerOverride ?? ''}
              onChange={(e) =>
                onUpdate(exercise.id, {
                  restTimerOverride: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="Use program default"
            />
          </div>
          <div>
            <label className="label mb-1 block">Input Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onUpdate(exercise.id, { inputType: undefined })}
                className={`flex-1 py-2 text-xs rounded-lg font-medium transition-colors ${!exercise.inputType || exercise.inputType === 'reps' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
              >
                Reps
              </button>
              <button
                type="button"
                onClick={() => onUpdate(exercise.id, { inputType: 'time' })}
                className={`flex-1 py-2 text-xs rounded-lg font-medium transition-colors ${exercise.inputType === 'time' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
              >
                Timed
              </button>
            </div>
          </div>
          <SetSchemeEditor
            scheme={exercise.setScheme}
            sets={exercise.sets}
            reps={exercise.reps}
            onChange={(scheme) => onUpdate(exercise.id, { setScheme: scheme })}
          />
          <ProgressionEditor
            exercise={exercise}
            goalType={goalType}
            durationWeeks={durationWeeks}
            onUpdate={(updates) => onUpdate(exercise.id, updates)}
          />
        </div>
      )}
    </div>
  );
}

function DayEditor({
  day,
  dayIndex,
  goalType,
  durationWeeks,
  allMuscles,
  onUpdateDay,
  onRemoveDay,
  onDuplicateDay,
  onUpdateExercise,
  onRemoveExercise,
  onAddExercise,
  onAddCardio,
  onReorderExercises,
  singleDay = false,
}: {
  day: WorkoutDay;
  dayIndex: number;
  goalType: string;
  durationWeeks: number;
  allMuscles: string[];
  /** The workout IS this day, so it opens expanded and can't be collapsed or removed. */
  singleDay?: boolean;
  onUpdateDay: (dayId: string, updates: Partial<WorkoutDay>) => void;
  onRemoveDay: (dayId: string) => void;
  onDuplicateDay: (dayId: string) => void;
  onUpdateExercise: (
    dayId: string,
    exerciseId: string,
    updates: Partial<Exercise>
  ) => void;
  onRemoveExercise: (dayId: string, exerciseId: string) => void;
  onAddExercise: (dayId: string) => void;
  onAddCardio: (dayId: string) => void;
  onReorderExercises: (dayId: string, oldIndex: number, newIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(singleDay);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = day.exercises.findIndex((e) => e.id === active.id);
    const newIndex = day.exercises.findIndex((e) => e.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderExercises(day.id, oldIndex, newIndex);
    }
  };

  return (
    <div className="card">
      <button
        onClick={() => { if (!singleDay) setExpanded(!expanded); }}
        className="w-full flex items-center gap-3 text-left"
        disabled={singleDay}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: day.accent || '#e8572a' }}
        >
          {singleDay ? (day.tag?.slice(0, 2) || 'W') : (day.label?.slice(0, 2) || `D${dayIndex + 1}`)}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm truncate block">
            {day.title || (singleDay ? 'Workout' : `Day ${dayIndex + 1}`)}
          </span>
          <span className="text-xs text-text-secondary">
            {day.tag} - {day.exercises.length} exercises
          </span>
        </div>
        {!singleDay && (expanded ? (
          <ChevronUp size={18} className="text-text-muted" />
        ) : (
          <ChevronDown size={18} className="text-text-muted" />
        ))}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {/* Day settings */}
          <div className={singleDay ? '' : 'grid grid-cols-2 gap-3'}>
            {/* Label positions a day in the rotation, which a standalone workout has no place in. */}
            {!singleDay && (
              <div>
                <label className="label mb-1 block">Label</label>
                <input
                  className="input-field text-sm"
                  value={day.label}
                  onChange={(e) => onUpdateDay(day.id, { label: e.target.value })}
                  placeholder="e.g. D1"
                />
              </div>
            )}
            <div>
              <label className="label mb-1 block">Tag</label>
              <input
                className="input-field text-sm"
                value={day.tag}
                onChange={(e) => onUpdateDay(day.id, { tag: e.target.value })}
                placeholder={singleDay ? 'e.g. UPPER, PUSH' : 'e.g. PUSH, PULL, REST'}
              />
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Title</label>
            <input
              className="input-field text-sm"
              value={day.title}
              onChange={(e) => onUpdateDay(day.id, { title: e.target.value })}
              placeholder="Day title"
            />
          </div>
          <div>
            <label className="label mb-1 block">Subtitle (optional)</label>
            <input
              className="input-field text-sm"
              value={day.subtitle}
              onChange={(e) => onUpdateDay(day.id, { subtitle: e.target.value })}
              placeholder="e.g. Chest, Shoulders, Triceps"
            />
          </div>

          {/* Accent color picker */}
          <ColorPicker
            value={day.accent}
            onChange={(color) => onUpdateDay(day.id, { accent: color })}
          />

          {/* Note */}
          <div>
            <label className="label mb-1 block">Note (optional)</label>
            <input
              className="input-field text-sm"
              value={day.note}
              onChange={(e) => onUpdateDay(day.id, { note: e.target.value })}
              placeholder="Day note"
            />
          </div>

          {/* Exercises with drag-and-drop */}
          <div>
            <label className="label mb-2 block">
              Exercises ({day.exercises.length})
            </label>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={day.exercises.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {day.exercises.map((exercise) => (
                    <SortableExercise
                      key={exercise.id}
                      exercise={exercise}
                      goalType={goalType}
                      durationWeeks={durationWeeks}
                      allMuscles={allMuscles}
                      onUpdate={(exId, updates) =>
                        onUpdateExercise(day.id, exId, updates)
                      }
                      onRemove={(exId) => onRemoveExercise(day.id, exId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onAddExercise(day.id)}
                className="flex-1 py-2.5 rounded-xl border border-dashed border-border-light text-text-secondary text-sm font-medium hover:border-accent-orange/50 hover:text-accent-orange transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                Add Exercise
              </button>
              <button
                onClick={() => onAddCardio(day.id)}
                className="flex-1 py-2.5 rounded-xl border border-dashed border-border-light text-text-secondary text-sm font-medium hover:border-accent-blue/50 hover:text-accent-blue transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                Add Cardio
              </button>
            </div>
          </div>

          {/* Collapse from bottom */}
          {!singleDay && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full py-2 flex items-center justify-center gap-1 text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              <ChevronUp size={13} />
              Collapse
            </button>
          )}

          {/* Duplicate + Remove day */}
          <div className={`flex gap-2 ${singleDay ? 'hidden' : ''}`}>
            <button
              type="button"
              onClick={() => onDuplicateDay(day.id)}
              className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1.5"
            >
              <Plus size={14} />
              Duplicate Day
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-danger text-sm px-4"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <ConfirmDialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => onRemoveDay(day.id)}
            title="Remove Day"
            message={`Remove "${day.title || `Day ${dayIndex + 1}`}" and all its exercises?`}
            confirmText="Remove"
            danger
          />
        </div>
      )}
    </div>
  );
}

export function ProgramEditor({ program, mode = 'program', savedWorkouts = [], onSave, onClose }: Props) {
  const isWorkout = mode === 'workout';
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [editedProgram, setEditedProgram] = useState<Program>(() => {
    const days = program.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e })),
    }));
    // A standalone workout is always exactly one day, even if it arrived empty.
    if (isWorkout && days.length === 0) {
      days.push({
        id: crypto.randomUUID(),
        label: '',
        tag: 'WORKOUT',
        title: program.name || 'Workout',
        subtitle: '',
        accent: getRandomColor(),
        note: '',
        exercises: [],
      });
    }
    return { ...program, kind: isWorkout ? 'workout' as const : program.kind, days };
  });

  const updateProgramField = useCallback(
    (updates: Partial<Program>) => {
      setEditedProgram((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const updateDay = useCallback(
    (dayId: string, updates: Partial<WorkoutDay>) => {
      setEditedProgram((prev) => ({
        ...prev,
        days: prev.days.map((d) => (d.id === dayId ? { ...d, ...updates } : d)),
      }));
    },
    []
  );

  const removeDay = useCallback((dayId: string) => {
    setEditedProgram((prev) => ({
      ...prev,
      days: prev.days.filter((d) => d.id !== dayId),
    }));
  }, []);

  const addDay = useCallback((isRest = false) => {
    const dayNum = editedProgram.days.length + 1;
    const newDay: WorkoutDay = {
      id: crypto.randomUUID(),
      label: isRest ? `R` : `D${dayNum}`,
      tag: isRest ? 'Rest' : 'CUSTOM',
      title: isRest ? 'Rest Day' : `Day ${dayNum}`,
      subtitle: isRest ? 'Recovery' : '',
      accent: isRest ? '#555555' : getRandomColor(editedProgram.days[editedProgram.days.length - 1]?.accent),
      note: '',
      exercises: [],
    };
    setEditedProgram((prev) => ({ ...prev, days: [...prev.days, newDay] }));
  }, [editedProgram.days.length]);

  const addDayFromWorkout = useCallback((workout: Program) => {
    setEditedProgram((prev) => {
      const day = buildDayFromWorkout(workout, prev.days.length);
      return day ? { ...prev, days: [...prev.days, day] } : prev;
    });
    setShowWorkoutPicker(false);
  }, []);

  const duplicateDay = useCallback((dayId: string) => {
    const source = editedProgram.days.find((d) => d.id === dayId);
    if (!source) return;
    const newDay: WorkoutDay = {
      ...source,
      id: crypto.randomUUID(),
      label: `D${editedProgram.days.length + 1}`,
      title: `${source.title} (Copy)`,
      accent: getRandomColor(source.accent),
      exercises: source.exercises.map((ex) => ({ ...ex, id: crypto.randomUUID() })),
    };
    setEditedProgram((prev) => ({ ...prev, days: [...prev.days, newDay] }));
  }, [editedProgram.days]);

  const updateExercise = useCallback(
    (dayId: string, exerciseId: string, updates: Partial<Exercise>) => {
      setEditedProgram((prev) => ({
        ...prev,
        days: prev.days.map((d) =>
          d.id === dayId
            ? {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.id === exerciseId ? { ...e, ...updates } : e
                ),
              }
            : d
        ),
      }));
    },
    []
  );

  const removeExercise = useCallback(
    (dayId: string, exerciseId: string) => {
      setEditedProgram((prev) => ({
        ...prev,
        days: prev.days.map((d) =>
          d.id === dayId
            ? { ...d, exercises: d.exercises.filter((e) => e.id !== exerciseId) }
            : d
        ),
      }));
    },
    []
  );

  const addExercise = useCallback((dayId: string) => {
    const goalType = editedProgram.goal?.type || 'custom';
    const defaults = goalType !== 'custom' ? getGoalDefaults(goalType, true) : null;
    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: '',
      sets: defaults?.sets ?? 3,
      reps: defaults?.reps ?? '8-12',
      muscle: '',
      note: '',
      progression: defaults?.progression as ExerciseProgressionConfig | undefined,
    };
    setEditedProgram((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.id === dayId
          ? { ...d, exercises: [...d.exercises, newExercise] }
          : d
      ),
    }));
  }, [editedProgram.goal]);

  const addCardio = useCallback((dayId: string) => {
    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: '',
      sets: 1,
      reps: '1',
      muscle: 'Cardio',
      note: '',
      exerciseType: 'cardio',
      targetIntensity: 'moderate',
    };
    setEditedProgram((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.id === dayId
          ? { ...d, exercises: [...d.exercises, newExercise] }
          : d
      ),
    }));
  }, []);

  const reorderDays = useCallback((oldIndex: number, newIndex: number) => {
    setEditedProgram((prev) => ({ ...prev, days: arrayMove(prev.days, oldIndex, newIndex) }));
  }, []);

  const reorderExercises = useCallback(
    (dayId: string, oldIndex: number, newIndex: number) => {
      setEditedProgram((prev) => ({
        ...prev,
        days: prev.days.map((d) =>
          d.id === dayId
            ? { ...d, exercises: arrayMove(d.exercises, oldIndex, newIndex) }
            : d
        ),
      }));
    },
    []
  );

  const allMuscles = useMemo(() => {
    const set = new Set<string>([...COMMON_MUSCLES, ...getCustomMuscles()]);
    for (const day of editedProgram.days) {
      for (const ex of day.exercises) {
        if (ex.muscle) ex.muscle.split(',').map((m) => m.trim()).filter(Boolean).forEach((m) => set.add(m));
        const sec = ex.secondaryMuscles;
        const secArr = Array.isArray(sec) ? sec : (sec || '').split(',').map((m) => m.trim()).filter(Boolean);
        for (const m of secArr) if (m) set.add(m);
      }
    }
    return Array.from(set).sort();
  }, [editedProgram.days]);

  const handleSave = () => {
    const allFound: string[] = [];
    for (const day of editedProgram.days) {
      for (const ex of day.exercises) {
        if (ex.muscle) ex.muscle.split(',').map((m) => m.trim()).filter(Boolean).forEach((m) => allFound.push(m));
        const sec = ex.secondaryMuscles;
        const secArr = Array.isArray(sec) ? sec : (sec || '').split(',').map((m) => m.trim()).filter(Boolean);
        secArr.forEach((m) => allFound.push(m));
      }
    }
    persistCustomMuscles(allFound);
    const now = new Date().toISOString();
    onSave({ ...editedProgram, updatedAt: now });
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg hover:bg-surface-raised text-text-secondary"
          >
            <X size={20} />
          </button>
          <h2 className="font-bold">{isWorkout ? 'Edit Workout' : 'Edit Program'}</h2>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-orange text-white font-semibold text-sm active:scale-95 transition-transform"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-8">
        {/* Name */}
        <div>
          <label className="label mb-1.5 block">{isWorkout ? 'Workout Name' : 'Program Name'}</label>
          <input
            className="input-field"
            value={editedProgram.name}
            onChange={(e) => updateProgramField({ name: e.target.value })}
            placeholder={isWorkout ? 'e.g. Upper Day' : 'Program name'}
          />
        </div>

        {/* Description */}
        <div>
          <label className="label mb-1.5 block">Description</label>
          <input
            className="input-field"
            value={editedProgram.description}
            onChange={(e) => updateProgramField({ description: e.target.value })}
            placeholder="Brief description"
          />
        </div>

        {/* Goal (& duration, which only means anything on a rotation) */}
        <div className={isWorkout ? '' : 'grid grid-cols-2 gap-3'}>
          <div>
            <label className="label mb-1.5 block">Goal</label>
            <select
              className="input-field text-sm"
              value={editedProgram.goal?.type || 'custom'}
              onChange={(e) => {
                const type = e.target.value as ProgramGoal['type'];
                updateProgramField({
                  goal: { type, description: editedProgram.goal?.description || type },
                });
              }}
            >
              <option value="strength">Strength</option>
              <option value="hypertrophy">Hypertrophy</option>
              <option value="endurance">Endurance</option>
              <option value="recomp">Recomp</option>
              <option value="powerbuilding">Powerbuilding</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {!isWorkout && (
            <div>
              <label className="label mb-1.5 block">Duration (weeks)</label>
              <input
                type="text"
                inputMode="numeric"
                className="input-field text-sm"
                value={editedProgram.suggestedDurationWeeks || ''}
                onChange={(e) =>
                  updateProgramField({
                    suggestedDurationWeeks: parseInt(e.target.value) || undefined,
                  })
                }
                placeholder="e.g. 8"
                min={1}
                max={52}
              />
            </div>
          )}
        </div>

        {/* Default Rest Timer */}
        <div>
          <label className="label mb-1.5 block">Default Rest Timer (seconds)</label>
          <input
            type="text"
            inputMode="numeric"
            className="input-field text-sm"
            value={editedProgram.defaultRestTimer || ''}
            onChange={(e) =>
              updateProgramField({
                defaultRestTimer: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="Use profile default"
          />
          <p className="text-[0.625rem] text-text-muted mt-1">
            Overrides profile setting. Each exercise can also override this.
          </p>
        </div>

        {/* Effort Tracking */}
        <div>
          <label className="label mb-1.5 block">Effort Tracking</label>
          <div className="flex gap-2">
            {([
              { value: 'none', label: 'Off' },
              { value: 'rir', label: 'RIR (Reps in Reserve)' },
              { value: 'rpe', label: 'RPE (Rate of Perceived Exertion)' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateProgramField({ effortMetric: opt.value })}
                className={`flex-1 py-2 rounded-lg text-[0.625rem] font-semibold transition-colors ${
                  (editedProgram.effortMetric || 'none') === opt.value ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[0.625rem] text-text-muted mt-1">
            {editedProgram.effortMetric === 'rir' ? 'RIR: 0 = failure, 3 = could do 3 more reps' :
             editedProgram.effortMetric === 'rpe' ? 'RPE: 10 = max effort, 7 = moderate' :
             'Add a per-set effort column to your workout log'}
          </p>
        </div>

        {/* Days — a standalone workout is a single day, so the rotation chrome comes off */}
        <div>
          <h3 className="label mb-3">
            {isWorkout ? 'Exercises' : `Days (${editedProgram.days.length})`}
          </h3>
          <DndContext
            sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (over && active.id !== over.id) {
                const oldIdx = editedProgram.days.findIndex((d) => d.id === active.id);
                const newIdx = editedProgram.days.findIndex((d) => d.id === over.id);
                if (oldIdx >= 0 && newIdx >= 0) reorderDays(oldIdx, newIdx);
              }
            }}
          >
            <SortableContext items={editedProgram.days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {editedProgram.days.map((day, index) => {
                  const editor = (
                    <DayEditor
                      day={day}
                      dayIndex={index}
                      goalType={editedProgram.goal?.type || 'custom'}
                      durationWeeks={editedProgram.suggestedDurationWeeks || 8}
                      allMuscles={allMuscles}
                      singleDay={isWorkout}
                      onUpdateDay={updateDay}
                      onRemoveDay={removeDay}
                      onDuplicateDay={duplicateDay}
                      onUpdateExercise={updateExercise}
                      onRemoveExercise={removeExercise}
                      onAddExercise={addExercise}
                      onAddCardio={addCardio}
                      onReorderExercises={reorderExercises}
                    />
                  );
                  return isWorkout
                    ? <div key={day.id}>{editor}</div>
                    : <SortableDayWrapper key={day.id} id={day.id}>{editor}</SortableDayWrapper>;
                })}
              </div>
            </SortableContext>
          </DndContext>

          {!isWorkout && (
            <>
              <button
                onClick={() => addDay(false)}
                className="w-full mt-3 py-3 rounded-xl border border-dashed border-border-light text-text-secondary font-medium hover:border-accent-orange/50 hover:text-accent-orange transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                Add Training Day
              </button>
              {savedWorkouts.length > 0 && (
                <button
                  onClick={() => setShowWorkoutPicker(true)}
                  className="w-full mt-2 py-3 rounded-xl border border-dashed border-border-light text-text-secondary font-medium hover:border-accent-blue/50 hover:text-accent-blue transition-colors flex items-center justify-center gap-2"
                >
                  <BookmarkPlus size={18} />
                  Add a Saved Workout
                </button>
              )}
              <button
                onClick={() => addDay(true)}
                className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-border-light text-text-muted font-medium hover:border-text-muted/50 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                Add Rest Day
              </button>
            </>
          )}
        </div>
      </div>

      {/* Build the rotation out of workouts the user already has */}
      <Modal open={showWorkoutPicker} onClose={() => setShowWorkoutPicker(false)} title="Add a Saved Workout">
        <p className="text-xs text-text-muted mb-3">
          Adds it as the next day in this program. Your logged history for these lifts
          carries over, and editing it here won&apos;t change the saved workout.
        </p>
        <div className="space-y-2">
          {savedWorkouts.map((w) => {
            const focus = muscleFocus(w, 3);
            const count = exerciseCount(w);
            return (
              <button
                key={w.id}
                onClick={() => addDayFromWorkout(w)}
                className="w-full bg-surface-raised rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${workoutDayOf(w)?.accent || 'var(--color-surface)'}20` }}
                >
                  <Dumbbell size={15} style={{ color: workoutDayOf(w)?.accent || 'var(--color-text-secondary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.name}</div>
                  <div className="text-[0.625rem] text-text-muted truncate">
                    {count} exercise{count === 1 ? '' : 's'}
                    {focus.length > 0 && ` · ${focus.join(', ')}`}
                  </div>
                </div>
                <Plus size={15} className="text-text-muted shrink-0" />
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
