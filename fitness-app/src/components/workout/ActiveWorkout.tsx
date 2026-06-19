import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Trophy,
  X,
  Plus,
  SkipForward,
  MessageSquare,
} from 'lucide-react';
import type { WorkoutSession, WorkoutDay, SetLog, Exercise, ExerciseLastPerformance } from '../../types';
import { RestTimer } from './RestTimer';
import { toast } from '../shared/Toast';
import { getAllPRs } from '../../db/workouts';
import {
  calculateWeeklyTargets,
  getAdaptiveTarget,
  type ExerciseProgression,
  type WeeklyTarget,
} from '../../utils/progression';

interface Props {
  session: WorkoutSession;
  day: WorkoutDay;
  previousSession: WorkoutSession | undefined;
  lastPerformance: Record<string, ExerciseLastPerformance>;
  currentWeek: number;
  onLogSet: (exerciseId: string, set: SetLog) => void;
  onUpdateSet: (exerciseId: string, setIndex: number, updates: Partial<SetLog>) => void;
  onFinish: () => void;
  onCancel: () => void;
  restTimerDuration?: number;
  profileId: string;
  durationWeeks: number;
}

interface SetInput {
  weight: string;
  reps: string;
}

function formatLastPerformance(sets: SetLog[], date: string): string {
  const completed = sets.filter((s) => s.completed);
  if (completed.length === 0) return '';
  const allSameWeight = completed.every((s) => s.weight === completed[0].weight);
  const d = new Date(date + 'T00:00:00');
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (allSameWeight) {
    return `${completed[0].weight} × ${completed.map((s) => s.reps).join(', ')} · ${dateStr}`;
  }
  return `${completed.map((s) => `${s.weight}×${s.reps}`).join(', ')} · ${dateStr}`;
}

function ExerciseCard({
  exercise,
  exerciseIndex,
  sessionSets,
  previousSets,
  lastPerformance,
  weeklyTarget,
  prs,
  onComplete,
  onUpdate,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  sessionSets: SetLog[];
  previousSets: SetLog[] | undefined;
  lastPerformance: ExerciseLastPerformance | undefined;
  weeklyTarget: WeeklyTarget | null;
  prs: Record<string, { weight: number; reps: number; date: string }>;
  onComplete: (exerciseId: string, weight: number, reps: number) => void;
  onUpdate: (exerciseId: string, setIndex: number, updates: Partial<SetLog>) => void;
}) {
  const [setCount, setSetCount] = useState(exercise.sets);
  const [collapsed, setCollapsed] = useState(false);
  const [deviationNote, setDeviationNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const lastSets = lastPerformance?.sets.filter((s) => s.completed);
  const [inputs, setInputs] = useState<SetInput[]>(() =>
    Array.from({ length: exercise.sets }, (_, i) => {
      const targetWeight = weeklyTarget?.weight;
      const targetReps = weeklyTarget?.reps;
      const last = lastSets?.[i];
      const prev = previousSets?.[i];
      const weight = targetWeight ?? last?.weight ?? prev?.weight ?? exercise.startingWeight;
      const reps = targetReps ?? last?.reps ?? prev?.reps;
      return {
        weight: weight != null ? String(weight) : '',
        reps: reps != null ? String(reps) : String(exercise.reps.split('-')[0]?.replace(/[^0-9]/g, '') || ''),
      };
    })
  );

  const allDone =
    sessionSets.length >= setCount &&
    sessionSets.slice(0, setCount).every((s) => s.completed);

  useEffect(() => {
    if (allDone) setCollapsed(true);
  }, [allDone]);

  const handleInputChange = (
    setIndex: number,
    field: 'weight' | 'reps',
    value: string
  ) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setInputs((prev) => {
      const next = [...prev];
      next[setIndex] = { ...next[setIndex], [field]: cleaned };
      return next;
    });
  };

  const handleComplete = (setIndex: number) => {
    const input = inputs[setIndex];
    const weight = parseFloat(input.weight) || 0;
    const reps = parseInt(input.reps, 10) || 0;

    if (sessionSets[setIndex]?.completed) {
      onUpdate(exercise.id, setIndex, { completed: false });
      return;
    }

    onComplete(exercise.id, weight, reps);
    navigator.vibrate?.([50]);
  };

  const addSet = () => {
    setSetCount((c) => c + 1);
    const lastInput = inputs[inputs.length - 1];
    setInputs((prev) => [...prev, { weight: lastInput?.weight || '', reps: lastInput?.reps || '' }]);
    if (!showNote) setShowNote(true);
  };

  const removeSet = () => {
    if (setCount <= 1) return;
    const lastCompleted = sessionSets[setCount - 1]?.completed;
    if (lastCompleted) return;
    setSetCount((c) => c - 1);
    setInputs((prev) => prev.slice(0, -1));
    if (!showNote) setShowNote(true);
  };

  const completedCount = sessionSets.filter((s) => s.completed).length;
  const setsChanged = setCount !== exercise.sets;

  return (
    <div className="bg-surface rounded-2xl p-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center text-xs font-medium text-text-muted shrink-0">
          {exerciseIndex + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{exercise.name}</span>
            {exercise.muscle && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-raised text-text-muted shrink-0">
                {exercise.muscle}
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted">
            {completedCount}/{setCount} sets{setsChanged ? ` (plan: ${exercise.sets})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allDone && (
            <span className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
              <Check size={12} className="text-success" />
            </span>
          )}
          {collapsed ? (
            <ChevronDown size={16} className="text-text-muted" />
          ) : (
            <ChevronUp size={16} className="text-text-muted" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-1.5">
          {/* Weekly target */}
          {weeklyTarget && (
            <div className={`flex items-center gap-2 px-1.5 py-1 rounded-lg text-[10px] ${
              weeklyTarget.isDeload ? 'bg-[#f5a623]/10 text-[#f5a623]' : 'bg-accent-blue/10 text-accent-blue'
            }`}>
              <span className="font-medium">
                W{weeklyTarget.week} target:
              </span>
              <span>
                {weeklyTarget.weight} × {weeklyTarget.reps}
                {weeklyTarget.isDeload && ' (deload)'}
              </span>
            </div>
          )}

          {/* Header */}
          <div className="grid grid-cols-[1.5rem_1fr_1fr_2.25rem] gap-2 px-0.5">
            <span className="text-[9px] text-text-muted text-center">#</span>
            <span className="text-[9px] text-text-muted">Weight</span>
            <span className="text-[9px] text-text-muted">Reps</span>
            <span />
          </div>

          {Array.from({ length: setCount }, (_, setIndex) => {
            const isComplete = sessionSets[setIndex]?.completed === true;
            const prev = previousSets?.[setIndex];

            return (
              <div
                key={setIndex}
                className={`grid grid-cols-[1.5rem_1fr_1fr_2.25rem] gap-2 items-center px-0.5 py-0.5 rounded-lg transition-colors ${
                  isComplete ? 'bg-success/5' : ''
                }`}
              >
                <span className="text-[11px] text-text-muted text-center">{setIndex + 1}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={inputs[setIndex]?.weight ?? ''}
                  onChange={(e) => handleInputChange(setIndex, 'weight', e.target.value)}
                  placeholder={prev ? String(prev.weight) : '0'}
                  disabled={isComplete}
                  className={`w-full bg-surface-raised rounded-lg px-2.5 py-2 text-sm text-center outline-none ${
                    isComplete ? 'text-success' : 'text-text-primary'
                  }`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={inputs[setIndex]?.reps ?? ''}
                  onChange={(e) => handleInputChange(setIndex, 'reps', e.target.value)}
                  placeholder={prev ? String(prev.reps) : '0'}
                  disabled={isComplete}
                  className={`w-full bg-surface-raised rounded-lg px-2.5 py-2 text-sm text-center outline-none ${
                    isComplete ? 'text-success' : 'text-text-primary'
                  }`}
                />
                <button
                  onClick={() => handleComplete(setIndex)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                    isComplete ? 'bg-success text-white' : 'bg-surface-raised text-text-muted'
                  }`}
                >
                  <Check size={14} />
                </button>
              </div>
            );
          })}

          {/* Add/Remove set buttons */}
          <div className="flex items-center gap-2 pt-1 px-0.5">
            <button
              onClick={addSet}
              className="text-[11px] text-text-muted hover:text-text-secondary px-2 py-1 rounded-lg bg-surface-raised"
            >
              + Set
            </button>
            {setCount > 1 && (
              <button
                onClick={removeSet}
                className="text-[11px] text-text-muted hover:text-danger px-2 py-1 rounded-lg bg-surface-raised"
              >
                - Set
              </button>
            )}
            {!showNote && (
              <button
                onClick={() => setShowNote(true)}
                className="text-[11px] text-text-muted hover:text-text-secondary ml-auto"
              >
                + Note
              </button>
            )}
          </div>

          {/* Deviation note */}
          {showNote && (
            <input
              type="text"
              className="w-full bg-surface-raised rounded-lg px-3 py-2 text-[11px] text-text-secondary outline-none placeholder-text-muted"
              placeholder={setsChanged ? `Why ${setCount > exercise.sets ? 'added' : 'removed'} sets?` : 'Add a note for this exercise...'}
              value={deviationNote}
              onChange={(e) => setDeviationNote(e.target.value)}
            />
          )}

          {/* Last performance hint */}
          {lastPerformance && lastPerformance.sets.filter((s) => s.completed).length > 0 && (
            <p className="text-[10px] text-text-muted px-0.5">
              Last: {formatLastPerformance(lastPerformance.sets, lastPerformance.date)}
            </p>
          )}

          {exercise.note && (
            <p className="text-[10px] text-text-muted italic px-0.5">
              {exercise.note}
            </p>
          )}

          {exercise.flag && (
            <p className="text-[10px] text-warning px-0.5">
              {exercise.flag}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface SkippedExercise {
  exerciseId: string;
  reason: string;
}

export function ActiveWorkout({
  session,
  day,
  previousSession,
  lastPerformance,
  currentWeek,
  onLogSet,
  onUpdateSet,
  onFinish,
  onCancel,
  restTimerDuration = 90,
  profileId,
  durationWeeks,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [prs, setPrs] = useState<
    Record<string, { weight: number; reps: number; date: string }>
  >({});

  // Session-level modifications (don't touch the program)
  const [skippedExercises, setSkippedExercises] = useState<SkippedExercise[]>([]);
  const [addedExercises, setAddedExercises] = useState<Exercise[]>([]);
  const [skipTarget, setSkipTarget] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExSets, setNewExSets] = useState('3');
  const [newExReps, setNewExReps] = useState('10');
  const [newExMuscle, setNewExMuscle] = useState('');

  const skippedIds = new Set(skippedExercises.map((s) => s.exerciseId));
  const activeExercises = [
    ...day.exercises.filter((e) => !skippedIds.has(e.id)),
    ...addedExercises,
  ];

  function handleSkipExercise(exerciseId: string) {
    setSkipTarget(exerciseId);
    setSkipReason('');
  }

  function confirmSkip() {
    if (!skipTarget) return;
    const ex = day.exercises.find((e) => e.id === skipTarget);
    setSkippedExercises((prev) => [...prev, { exerciseId: skipTarget, reason: skipReason }]);
    toast(`Skipped ${ex?.name || 'exercise'}${skipReason ? `: ${skipReason}` : ''}`, 'success');
    setSkipTarget(null);
    setSkipReason('');
  }

  function handleAddExercise() {
    if (!newExName.trim()) return;
    const newEx: Exercise = {
      id: `session-${crypto.randomUUID()}`,
      name: newExName.trim(),
      sets: parseInt(newExSets) || 3,
      reps: newExReps || '10',
      muscle: newExMuscle,
      note: 'Added during session',
      flag: undefined,
    };
    setAddedExercises((prev) => [...prev, newEx]);
    toast(`Added ${newEx.name}`, 'success');
    setNewExName(''); setNewExSets('3'); setNewExReps('10'); setNewExMuscle('');
    setShowAddExercise(false);
  }

  function undoSkip(exerciseId: string) {
    setSkippedExercises((prev) => prev.filter((s) => s.exerciseId !== exerciseId));
  }
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing PRs
  useEffect(() => {
    getAllPRs(profileId).then(setPrs);
  }, [profileId]);

  // Elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - session.startTime) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session.startTime]);

  const formatElapsed = useCallback((secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const handleComplete = useCallback(
    (exerciseId: string, weight: number, reps: number) => {
      const setLog: SetLog = {
        weight,
        reps,
        completed: true,
        timestamp: Date.now(),
      };
      onLogSet(exerciseId, setLog);

      // PR detection
      const currentPR = prs[exerciseId];
      if (weight > 0 && (!currentPR || weight > currentPR.weight)) {
        const exercise = day.exercises.find((e) => e.id === exerciseId);
        toast(
          `New PR! ${exercise?.name || 'Exercise'}: ${weight} lbs`,
          'success'
        );
        setPrs((prev) => ({
          ...prev,
          [exerciseId]: { weight, reps, date: session.date },
        }));
      }

      // Show rest timer
      setShowRestTimer(true);
    },
    [onLogSet, prs, day.exercises, session.date]
  );

  const totalSets = activeExercises.reduce((sum, ex) => sum + ex.sets, 0);
  const completedSets = useMemo(
    () =>
      Object.values(session.sets).reduce(
        (sum, sets) => sum + sets.filter((s) => s.completed).length,
        0
      ),
    [session.sets]
  );

  return (
    <div className="pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-surface-raised text-text-secondary"
          >
            <X size={20} />
          </button>
          <div className="text-center">
            <p className="text-xs text-text-secondary font-medium">{day.title}</p>
            <div className="flex items-center gap-1.5 justify-center">
              <Clock size={13} className="text-accent-orange" />
              <span className="text-sm font-bold tabular-nums text-accent-orange">
                {formatElapsed(elapsed)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-secondary">
              {completedSets}/{totalSets} sets
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-orange rounded-full transition-all duration-300"
            style={{
              width: `${totalSets > 0 ? (completedSets / totalSets) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Exercises */}
      <div className="px-4 pt-4 space-y-3">
        {activeExercises.map((exercise, index) => {
          let weeklyTarget: WeeklyTarget | null = null;
          if (exercise.progression && exercise.startingWeight != null && currentWeek > 0 && durationWeeks > 0) {
            const targets = calculateWeeklyTargets(
              exercise.progression as ExerciseProgression,
              exercise.startingWeight,
              exercise.sets,
              durationWeeks,
            );
            const planned = targets[currentWeek - 1] || null;
            const prevPlanned = currentWeek >= 2 ? targets[currentWeek - 2] : null;
            const lastPerf = lastPerformance[exercise.name.toLowerCase().trim()];
            weeklyTarget = planned
              ? getAdaptiveTarget(planned, prevPlanned, lastPerf)
              : null;
          }
          return (
          <div key={exercise.id} className="relative">
            <ExerciseCard
              exercise={exercise}
              exerciseIndex={index}
              sessionSets={session.sets[exercise.id] || []}
              previousSets={previousSession?.sets[exercise.id]}
              lastPerformance={lastPerformance[exercise.name.toLowerCase().trim()]}
              weeklyTarget={weeklyTarget}
              prs={prs}
              onComplete={handleComplete}
              onUpdate={onUpdateSet}
            />
            {/* Skip button */}
            <button
              onClick={() => handleSkipExercise(exercise.id)}
              className="absolute top-3 right-12 p-1.5 rounded-lg hover:bg-surface-raised text-text-muted/50 hover:text-text-muted"
              title="Skip exercise"
            >
              <SkipForward size={13} />
            </button>
          </div>
          );
        })}

        {/* Skipped exercises summary */}
        {skippedExercises.length > 0 && (
          <div className="bg-surface-raised/50 rounded-xl p-3 space-y-1.5">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Skipped</span>
            {skippedExercises.map((s) => {
              const ex = day.exercises.find((e) => e.id === s.exerciseId);
              return (
                <div key={s.exerciseId} className="flex items-center justify-between text-xs">
                  <span className="text-text-muted line-through">{ex?.name || 'Unknown'}</span>
                  <div className="flex items-center gap-2">
                    {s.reason && <span className="text-[10px] text-text-muted italic">{s.reason}</span>}
                    <button onClick={() => undoSkip(s.exerciseId)} className="text-[10px] text-accent-blue">Undo</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add exercise button */}
        <button
          onClick={() => setShowAddExercise(true)}
          className="w-full py-3 rounded-xl border border-dashed border-border text-text-muted text-xs font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <Plus size={14} /> Add Exercise to Session
        </button>
      </div>

      {/* Skip exercise modal */}
      {skipTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-3xl w-full max-w-lg p-5 space-y-3 safe-bottom animate-in slide-in-from-bottom">
            <h3 className="font-bold text-base">Skip Exercise</h3>
            <p className="text-sm text-text-secondary">
              Skip "{day.exercises.find((e) => e.id === skipTarget)?.name}" for today only. The program stays unchanged.
            </p>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Reason (optional, e.g. shoulder pain)"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSkipTarget(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={confirmSkip} className="btn-primary flex-1 text-sm">Skip</button>
            </div>
          </div>
        </div>
      )}

      {/* Add exercise modal */}
      {showAddExercise && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-3xl w-full max-w-lg p-5 space-y-3 safe-bottom animate-in slide-in-from-bottom">
            <h3 className="font-bold text-base">Add Exercise</h3>
            <p className="text-xs text-text-muted">This only applies to today's session — your program stays the same.</p>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Exercise name"
              value={newExName}
              onChange={(e) => setNewExName(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Sets</label>
                <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={newExSets} onChange={(e) => setNewExSets(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Reps</label>
                <input type="text" className="input-field text-sm text-center" value={newExReps} onChange={(e) => setNewExReps(e.target.value)} placeholder="8-12" />
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Muscle</label>
                <input type="text" className="input-field text-sm text-center" value={newExMuscle} onChange={(e) => setNewExMuscle(e.target.value)} placeholder="e.g. Chest" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddExercise(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={handleAddExercise} disabled={!newExName.trim()} className="btn-primary flex-1 text-sm disabled:opacity-30">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky finish button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-bg/95 backdrop-blur-sm border-t border-border z-20">
        <button
          onClick={onFinish}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Trophy size={18} />
          Finish Workout
        </button>
      </div>

      {/* Rest timer overlay */}
      {showRestTimer && (
        <RestTimer
          duration={restTimerDuration}
          onComplete={() => setShowRestTimer(false)}
          onDismiss={() => setShowRestTimer(false)}
        />
      )}

      {/* Cancel confirm */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card mx-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2">Cancel Workout?</h3>
            <p className="text-text-secondary text-sm mb-6">
              Your progress for this session will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="btn-secondary flex-1"
              >
                Continue
              </button>
              <button
                onClick={onCancel}
                className="flex-1 font-semibold rounded-xl px-6 py-3 active:scale-95 transition-transform bg-danger text-white"
              >
                Cancel Workout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
