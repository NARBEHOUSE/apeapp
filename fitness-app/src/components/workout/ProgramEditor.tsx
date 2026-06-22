import { useState, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Save,
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
import { ColorPicker, getRandomColor } from '../shared/ColorPicker';
import { ProgressionEditor } from './ProgressionEditor';
import { SetSchemeEditor } from './SetSchemeEditor';
import {
  getGoalDefaults,
  isCompoundExercise,
  formatProgressionLabel,
  type ExerciseProgression,
} from '../../utils/progression';

interface Props {
  program: Program;
  fitnessGoal?: 'lose' | 'maintain' | 'build';
  onSave: (program: Program) => void;
  onClose: () => void;
}



function SortableExercise({
  exercise,
  goalType,
  durationWeeks,
  onUpdate,
  onRemove,
}: {
  exercise: Exercise;
  goalType: string;
  durationWeeks: number;
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
                    className={`flex-1 py-2 rounded-lg text-[10px] font-medium capitalize transition-colors ${
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
          <div>
            <label className="label mb-1 block">Name</label>
            <input
              className="input-field text-sm"
              value={exercise.name}
              onChange={(e) => onUpdate(exercise.id, { name: e.target.value })}
              placeholder="Exercise name"
            />
          </div>
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
          <div>
            <label className="label mb-1 block">Muscle Group</label>
            <input
              className="input-field text-sm"
              value={exercise.muscle}
              onChange={(e) => onUpdate(exercise.id, { muscle: e.target.value })}
              placeholder="e.g. Chest, Back, Legs"
            />
          </div>
          <div>
            <label className="label mb-1 block">Note (optional)</label>
            <input
              className="input-field text-sm"
              value={exercise.note}
              onChange={(e) => onUpdate(exercise.id, { note: e.target.value })}
              placeholder="e.g. Pause at bottom"
            />
          </div>
          <div>
            <label className="label mb-1 block">Flag (optional)</label>
            <input
              className="input-field text-sm"
              value={exercise.flag || ''}
              onChange={(e) =>
                onUpdate(exercise.id, { flag: e.target.value || undefined })
              }
              placeholder="e.g. superset, dropset"
            />
          </div>
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
  onUpdateDay,
  onRemoveDay,
  onUpdateExercise,
  onRemoveExercise,
  onAddExercise,
  onAddCardio,
  onReorderExercises,
}: {
  day: WorkoutDay;
  dayIndex: number;
  goalType: string;
  durationWeeks: number;
  onUpdateDay: (dayId: string, updates: Partial<WorkoutDay>) => void;
  onRemoveDay: (dayId: string) => void;
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
  const [expanded, setExpanded] = useState(false);
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
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: day.accent || '#e8572a' }}
        >
          {day.label?.slice(0, 2) || `D${dayIndex + 1}`}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm truncate block">
            {day.title || `Day ${dayIndex + 1}`}
          </span>
          <span className="text-xs text-text-secondary">
            {day.tag} - {day.exercises.length} exercises
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-text-muted" />
        ) : (
          <ChevronDown size={18} className="text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {/* Day settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 block">Label</label>
              <input
                className="input-field text-sm"
                value={day.label}
                onChange={(e) => onUpdateDay(day.id, { label: e.target.value })}
                placeholder="e.g. D1"
              />
            </div>
            <div>
              <label className="label mb-1 block">Tag</label>
              <input
                className="input-field text-sm"
                value={day.tag}
                onChange={(e) => onUpdateDay(day.id, { tag: e.target.value })}
                placeholder="e.g. PUSH, PULL, REST"
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

          {/* Remove day */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full btn-danger text-sm"
          >
            <Trash2 size={14} className="inline mr-1.5" />
            Remove Day
          </button>

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

export function ProgramEditor({ program, fitnessGoal, onSave, onClose }: Props) {
  const [editedProgram, setEditedProgram] = useState<Program>(() => ({
    ...program,
    days: program.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e })),
    })),
  }));

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

  const addDay = useCallback(() => {
    const newDay: WorkoutDay = {
      id: crypto.randomUUID(),
      label: `D${editedProgram.days.length + 1}`,
      tag: 'CUSTOM',
      title: `Day ${editedProgram.days.length + 1}`,
      subtitle: '',
      accent: getRandomColor(editedProgram.days[editedProgram.days.length - 1]?.accent),
      note: '',
      exercises: [],
    };
    setEditedProgram((prev) => ({ ...prev, days: [...prev.days, newDay] }));
  }, [editedProgram.days.length]);

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

  const handleSave = () => {
    const now = new Date().toISOString();
    onSave({
      ...editedProgram,
      updatedAt: now,
    });
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
          <h2 className="font-bold">Edit Program</h2>
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
        {/* Program name */}
        <div>
          <label className="label mb-1.5 block">Program Name</label>
          <input
            className="input-field"
            value={editedProgram.name}
            onChange={(e) => updateProgramField({ name: e.target.value })}
            placeholder="Program name"
          />
        </div>

        {/* Program description */}
        <div>
          <label className="label mb-1.5 block">Description</label>
          <input
            className="input-field"
            value={editedProgram.description}
            onChange={(e) => updateProgramField({ description: e.target.value })}
            placeholder="Brief description"
          />
        </div>

        {/* Goal & Duration */}
        <div className="grid grid-cols-2 gap-3">
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
          <p className="text-[10px] text-text-muted mt-1">
            Overrides profile setting. Each exercise can also override this.
          </p>
        </div>

        {/* Days */}
        <div>
          <h3 className="label mb-3">
            Days ({editedProgram.days.length})
          </h3>
          <div className="space-y-3">
            {editedProgram.days.map((day, index) => (
              <DayEditor
                key={day.id}
                day={day}
                dayIndex={index}
                goalType={editedProgram.goal?.type || 'custom'}
                durationWeeks={editedProgram.suggestedDurationWeeks || 8}
                onUpdateDay={updateDay}
                onRemoveDay={removeDay}
                onUpdateExercise={updateExercise}
                onRemoveExercise={removeExercise}
                onAddExercise={addExercise}
                onAddCardio={addCardio}
                onReorderExercises={reorderExercises}
              />
            ))}
          </div>

          <button
            onClick={addDay}
            className="w-full mt-3 py-3 rounded-xl border border-dashed border-border-light text-text-secondary font-medium hover:border-accent-orange/50 hover:text-accent-orange transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Add Day
          </button>
        </div>
      </div>
    </div>
  );
}
