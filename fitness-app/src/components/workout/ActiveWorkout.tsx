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
  Heart,
  Trash2,
} from 'lucide-react';
import type { WorkoutSession, WorkoutDay, SetLog, Exercise, ExerciseLastPerformance, CardioEntry, Program } from '../../types';
import { searchExerciseLibrary, getSimilarExercises, type LibraryExercise } from '../../data/exerciseLibrary';
import { saveCustomExercise, searchCustomExercises, getExerciseVideo, updateExerciseVideo } from '../../db/customExercises';
import { RestTimer } from './RestTimer';
import { VoiceMicButton } from '../shared/VoiceMicButton';
import { VoiceConfirmationCard } from '../shared/VoiceConfirmationCard';
import { toast } from '../shared/Toast';
import { getAllPRs } from '../../db/workouts';
import { saveWorkoutInputs, loadWorkoutInputs } from '../../hooks/useWorkout';
import { useVoiceMode } from '../../hooks/useVoiceMode';
import { getDashboardConfig } from '../../utils/dashboardConfig';
import { getApiKey } from '../../utils/apiKeyManager';
import { toDisplayWeight, fromDisplayWeight, type WeightUnit } from '../../utils/units';
import {
  calculateWeeklyTargets,
  getAdaptiveTarget,
  analyzeExerciseProgression,
  buildExerciseMap,
  estimate1RM,
  type ExerciseProgression,
  type WeeklyTarget,
  type ProgressionSuggestion,
} from '../../utils/progression';

interface Props {
  session: WorkoutSession;
  day: WorkoutDay;
  previousSession: WorkoutSession | undefined;
  lastPerformance: Record<string, ExerciseLastPerformance>;
  currentWeek: number;
  onLogSet: (exerciseId: string, set: SetLog) => void;
  onUpdateSet: (exerciseId: string, setIndex: number, updates: Partial<SetLog>) => void;
  onFinish: (exercises: Exercise[]) => void;
  onCancel: () => void;
  restTimerDuration?: number;
  profileId: string;
  durationWeeks: number;
  programDefaultRestTimer?: number;
  onUpdateCardio?: (cardio: CardioEntry[]) => void;
  allSessions?: WorkoutSession[];
  programs?: Program[];
  effortMetric?: 'none' | 'rir' | 'rpe';
  onSwapExercise?: (exerciseId: string, swap: LibraryExercise, permanent: boolean) => void;
}

interface SetInput {
  weight: string;
  reps: string;
  effort: string;
  isWarmup: boolean;
}

function SetRestTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - since) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <div className="text-[8px] text-text-muted tabular-nums">{m}:{s.toString().padStart(2, '0')}</div>;
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
  onSwap,
  progression,
  effortMetric,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  sessionSets: SetLog[];
  previousSets: SetLog[] | undefined;
  lastPerformance: ExerciseLastPerformance | undefined;
  weeklyTarget: WeeklyTarget | null;
  prs: Record<string, { weight: number; reps: number; date: string }>;
  onComplete: (exerciseId: string, weight: number, reps: number, rir?: number, rpe?: number, isWarmup?: boolean) => void;
  onUpdate: (exerciseId: string, setIndex: number, updates: Partial<SetLog>) => void;
  onSwap?: (swap: LibraryExercise) => void;
  progression: ProgressionSuggestion | null;
  effortMetric: 'none' | 'rir' | 'rpe';
}) {
  const [setCount, setSetCount] = useState(() => {
    const s = exercise.setScheme;
    if (s?.type === 'top_set_backoff') return 1 + (s.backoffSets || 2);
    if ((s?.type === 'pyramid' || s?.type === 'reverse_pyramid') && s.pyramidReps) return s.pyramidReps.length;
    if (s?.type === 'to_failure') return s.failureSets || exercise.sets;
    return exercise.sets;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [deviationNote, setDeviationNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [showSwaps, setShowSwaps] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoUrl, setVideoUrl] = useState(() => getExerciseVideo(exercise.name) || '');
  const swapSuggestions = exercise.alternatives || [];
  const weightUnit: WeightUnit = getDashboardConfig().weightUnit ?? 'lbs';
  const lastSets = lastPerformance?.sets.filter((s) => s.completed);
  const scheme = exercise.setScheme;

  const [inputs, setInputs] = useState<SetInput[]>(() => {
    // Try to restore persisted inputs first
    const persisted = loadWorkoutInputs();
    if (persisted?.[exercise.id]) return persisted[exercise.id].map((p: any) => ({ weight: p.weight || '', reps: p.reps || '', effort: p.effort || '', isWarmup: !!p.isWarmup }));
    const totalSets = scheme?.type === 'top_set_backoff' ? 1 + (scheme.backoffSets || 2)
      : scheme?.type === 'pyramid' || scheme?.type === 'reverse_pyramid' ? scheme.pyramidReps?.length || exercise.sets
      : scheme?.type === 'to_failure' ? scheme.failureSets || exercise.sets
      : exercise.sets;

    return Array.from({ length: totalSets }, (_, i) => {
      const targetWeight = weeklyTarget?.weight;
      const targetReps = weeklyTarget?.reps;
      const last = lastSets?.[i];
      const prev = previousSets?.[i];
      const baseWeight = targetWeight ?? last?.weight ?? prev?.weight ?? exercise.startingWeight;

      let weight = baseWeight;
      let repStr: string;

      if (scheme?.type === 'top_set_backoff') {
        if (i === 0) {
          repStr = scheme.topSetReps || exercise.reps;
        } else {
          weight = baseWeight != null ? Math.round(baseWeight * (1 - (scheme.backoffPercent || 20) / 100)) : undefined;
          repStr = scheme.backoffReps || exercise.reps;
        }
      } else if ((scheme?.type === 'pyramid' || scheme?.type === 'reverse_pyramid') && scheme.pyramidReps?.[i] != null) {
        repStr = String(scheme.pyramidReps[i]);
      } else if (scheme?.type === 'to_failure') {
        repStr = '';
      } else {
        repStr = targetReps != null ? String(targetReps) : (last?.reps != null ? String(last.reps) : (prev?.reps != null ? String(prev.reps) : ''));
      }

      if (!repStr && exercise.reps) {
        repStr = exercise.reps.split('-')[0]?.replace(/[^0-9]/g, '') || '';
      }

      const displayWeight = weight != null ? toDisplayWeight(weight, getDashboardConfig().weightUnit ?? 'lbs') : null;
      return {
        weight: displayWeight != null ? String(displayWeight) : '',
        reps: repStr,
        effort: '',
        isWarmup: false,
      };
    });
  });

  const allDone =
    sessionSets.length >= setCount &&
    sessionSets.slice(0, setCount).every((s) => s.completed);

  useEffect(() => {
    if (allDone) setCollapsed(true);
  }, [allDone]);

  // Persist inputs on change
  useEffect(() => {
    const current = loadWorkoutInputs() || {};
    current[exercise.id] = inputs;
    saveWorkoutInputs(current);
  }, [inputs, exercise.id]);

  const handleInputChange = (
    setIndex: number,
    field: 'weight' | 'reps' | 'effort',
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
    const displayWeight = parseFloat(input.weight) || 0;
    const weightInLbs = fromDisplayWeight(displayWeight, weightUnit);
    const reps = parseInt(input.reps, 10) || 0;

    if (sessionSets[setIndex]?.completed) {
      onUpdate(exercise.id, setIndex, { completed: false });
      return;
    }

    const effortVal = parseFloat(input.effort) || undefined;
    const rir = effortMetric === 'rir' ? effortVal : undefined;
    const rpe = effortMetric === 'rpe' ? effortVal : undefined;
    onComplete(exercise.id, weightInLbs, reps, rir, rpe, input.isWarmup);
    navigator.vibrate?.([50]);
  };

  const addSet = () => {
    setSetCount((c) => c + 1);
    const lastInput = inputs[inputs.length - 1];
    setInputs((prev) => [...prev, { weight: lastInput?.weight || '', reps: lastInput?.reps || '', effort: '', isWarmup: false }]);
  };

  const removeSet = () => {
    if (setCount <= 1) return;
    const lastCompleted = sessionSets[setCount - 1]?.completed;
    if (lastCompleted) return;
    setSetCount((c) => c - 1);
    setInputs((prev) => prev.slice(0, -1));
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
          <div className={`grid ${effortMetric !== 'none' ? 'grid-cols-[1.5rem_1fr_1fr_2.5rem_2.25rem]' : 'grid-cols-[1.5rem_1fr_1fr_2.25rem]'} gap-1.5 px-0.5`}>
            <span className="text-[9px] text-warning text-center" title="Tap to toggle warmup">W</span>
            <span className="text-[9px] text-text-muted">Weight ({weightUnit})</span>
            <span className="text-[9px] text-text-muted">Reps</span>
            {effortMetric !== 'none' && <span className="text-[9px] text-accent-blue text-center">{effortMetric === 'rir' ? 'RIR' : 'RPE'}</span>}
            <span />
          </div>

          {Array.from({ length: setCount }, (_, setIndex) => {
            const isComplete = sessionSets[setIndex]?.completed === true;
            const prev = previousSets?.[setIndex];
            const setTimestamp = sessionSets[setIndex]?.timestamp;
            const nextIncomplete = !sessionSets[setIndex + 1]?.completed;
            const showRestElapsed = isComplete && nextIncomplete && setTimestamp && setIndex < setCount - 1;

            return (
              <div
                key={setIndex}
                className={`grid ${effortMetric !== 'none' ? 'grid-cols-[1.5rem_1fr_1fr_2.5rem_2.25rem]' : 'grid-cols-[1.5rem_1fr_1fr_2.25rem]'} gap-1.5 items-center px-0.5 py-0.5 rounded-lg transition-colors ${
                  isComplete ? 'bg-success/5' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...inputs];
                    updated[setIndex] = { ...updated[setIndex], isWarmup: !updated[setIndex].isWarmup };
                    setInputs(updated);
                  }}
                  className={`text-[11px] text-center w-6 h-6 rounded flex items-center justify-center transition-colors ${
                    inputs[setIndex]?.isWarmup ? 'bg-warning/20 text-warning' : 'bg-surface-raised text-text-muted'
                  }`}
                  title={inputs[setIndex]?.isWarmup ? 'Warmup set (tap to make working)' : 'Working set (tap to make warmup)'}
                >
                  {inputs[setIndex]?.isWarmup ? (
                    <span className="text-[9px] font-bold">W</span>
                  ) : scheme?.type === 'top_set_backoff' && setIndex === 0 ? (
                    <span className="text-[8px] text-accent font-bold">TOP</span>
                  ) : scheme?.type === 'to_failure' ? (
                    <span className="text-[8px] text-danger font-bold">F{setIndex + 1}</span>
                  ) : (
                    <span className="text-[9px]">{setIndex + 1}</span>
                  )}
                  {showRestElapsed && <SetRestTimer since={setTimestamp} />}
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={inputs[setIndex]?.weight ?? ''}
                  onChange={(e) => handleInputChange(setIndex, 'weight', e.target.value)}
                  placeholder={prev?.weight != null ? String(toDisplayWeight(prev.weight, weightUnit)) : '0'}
                  disabled={isComplete}
                  className={`w-full bg-surface-raised rounded-lg px-2 py-2 text-sm text-center outline-none ${
                    isComplete ? 'text-success' : 'text-text-primary'
                  }`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={inputs[setIndex]?.reps ?? ''}
                  onChange={(e) => handleInputChange(setIndex, 'reps', e.target.value)}
                  placeholder={scheme?.type === 'to_failure' ? 'AMRAP' : (prev ? String(prev.reps) : '0')}
                  disabled={isComplete}
                  className={`w-full bg-surface-raised rounded-lg px-2 py-2 text-sm text-center outline-none ${
                    isComplete ? 'text-success' : 'text-text-primary'
                  }`}
                />
                {effortMetric !== 'none' && (
                  <input
                    type="number"
                    inputMode="numeric"
                    value={inputs[setIndex]?.effort ?? ''}
                    onChange={(e) => handleInputChange(setIndex, 'effort', e.target.value)}
                    placeholder={effortMetric === 'rir' ? 'RIR' : 'RPE'}
                    disabled={isComplete}
                    className={`w-full bg-surface-raised rounded-lg px-1 py-2 text-[10px] text-center outline-none ${
                      isComplete ? 'text-success' : 'text-accent-blue'
                    }`}
                  />
                )}
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
            <button
              onClick={() => setShowNote(!showNote)}
              className="text-[11px] text-text-muted hover:text-text-secondary ml-auto"
            >
              {showNote ? '− Note' : '+ Note'}
            </button>
          </div>

          {/* Note */}
          {showNote && (
            <input
              type="text"
              className="w-full bg-surface-raised rounded-lg px-3 py-2 text-[11px] text-text-secondary outline-none placeholder-text-muted"
              placeholder="Add a note for this exercise..."
              value={deviationNote}
              onChange={(e) => setDeviationNote(e.target.value)}
            />
          )}

          {/* Last performance hint + estimated 1RM */}
          {lastPerformance && lastPerformance.sets.filter((s) => s.completed).length > 0 && (
            <p className="text-[10px] text-text-muted px-0.5">
              Last: {formatLastPerformance(lastPerformance.sets, lastPerformance.date)}
              {(() => {
                const best = lastPerformance.sets.filter((s) => s.completed).reduce<{ weight: number; reps: number } | null>((top, s) => (!top || s.weight > top.weight) ? s : top, null);
                if (best && best.weight > 0 && best.reps > 1) {
                  return ` · Est. 1RM: ${estimate1RM(best.weight, best.reps)}`;
                }
                return null;
              })()}
            </p>
          )}

          {/* Smart progression suggestion */}
          {progression && (
            <div className={`flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-[10px] leading-tight ${
              progression.type === 'increase' ? 'bg-green-500/10 text-green-500' :
              progression.type === 'deload' ? 'bg-warning/10 text-warning' :
              progression.type === 'stall' ? 'bg-accent-blue/10 text-accent-blue' :
              'bg-surface-raised text-text-muted'
            }`}>
              <span className="shrink-0 mt-px">{
                progression.type === 'increase' ? '↑' :
                progression.type === 'deload' ? '↓' :
                progression.type === 'stall' ? '→' : '·'
              }</span>
              <span>{progression.message}</span>
            </div>
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

          {/* Swap + Video links */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setShowSwaps(!showSwaps)} className="text-[10px] text-accent-blue font-medium">
              {showSwaps ? 'Hide alternatives' : 'Alternatives'}
            </button>
            {videoUrl ? (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent font-medium">
                Watch demo
              </a>
            ) : (
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name + ' exercise form')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-text-muted font-medium">
                Search YouTube
              </a>
            )}
            <button onClick={() => setShowVideoInput(!showVideoInput)} className="text-[10px] text-text-muted font-medium">
              {videoUrl ? 'Edit video' : 'Add video'}
            </button>
          </div>
          {showVideoInput && (
            <div className="flex gap-1">
              <input type="url" className="input-field text-xs flex-1 py-1" placeholder="Paste YouTube URL..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
              <button onClick={() => { updateExerciseVideo(exercise.name, videoUrl); setShowVideoInput(false); toast('Video saved', 'success'); }} className="bg-accent-blue text-white px-2 rounded-lg text-[10px] font-semibold">Save</button>
            </div>
          )}
          {showSwaps && swapSuggestions.length === 0 && (
            <p className="text-[10px] text-text-muted mt-1">No alternatives set. Add them in the program editor.</p>
          )}
          {showSwaps && swapSuggestions.length > 0 && (
            <div className="space-y-1 mt-1">
              {swapSuggestions.map((altName) => (
                <div key={altName} className="flex items-center justify-between bg-surface-raised rounded-md px-2 py-1.5 gap-2">
                  <span className="text-[10px] font-medium text-text-secondary">{altName}</span>
                  {onSwap && (
                    <button
                      onClick={() => { onSwap({ name: altName, muscles: [], equipment: '', type: 'compound' }); setShowSwaps(false); }}
                      className="shrink-0 text-[10px] font-semibold text-accent-blue bg-accent-blue/10 hover:bg-accent-blue/20 px-2 py-0.5 rounded-md transition-colors"
                    >
                      Swap
                    </button>
                  )}
                </div>
              ))}
            </div>
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
  programDefaultRestTimer,
  onUpdateCardio,
  allSessions,
  programs,
  effortMetric = 'none',
  onSwapExercise,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [activeRestDuration, setActiveRestDuration] = useState(restTimerDuration);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [prs, setPrs] = useState<
    Record<string, { weight: number; reps: number; date: string }>
  >({});

  // Cardio tracking
  const [cardioEntries, setCardioEntries] = useState<CardioEntry[]>(session.cardio || []);
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [cardioType, setCardioType] = useState('');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioIntensity, setCardioIntensity] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [cardioHeartRate, setCardioHeartRate] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioDistanceUnit, setCardioDistanceUnit] = useState<'mi' | 'km'>('mi');
  const [cardioCalories, setCardioCalories] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');

  const CARDIO_TYPES = ['Running', 'Walking', 'Cycling', 'Rowing', 'Stairmaster', 'Elliptical', 'Swimming', 'Jump Rope', 'HIIT'];

  function addCardioEntry() {
    if (!cardioType.trim() || !cardioDuration) return;
    const entry: CardioEntry = {
      type: cardioType.trim(),
      durationMin: parseFloat(cardioDuration) || 0,
      intensity: cardioIntensity,
      heartRateAvg: cardioHeartRate ? parseInt(cardioHeartRate) : undefined,
      distanceKm: cardioDistance ? (cardioDistanceUnit === 'mi' ? parseFloat(cardioDistance) * 1.60934 : parseFloat(cardioDistance)) : undefined,
      distanceUnit: cardioDistance ? cardioDistanceUnit : undefined,
      caloriesBurned: cardioCalories ? parseInt(cardioCalories) : undefined,
      notes: cardioNotes.trim() || undefined,
    };
    const updated = [...cardioEntries, entry];
    setCardioEntries(updated);
    onUpdateCardio?.(updated);
    setShowAddCardio(false);
    setCardioType('');
    setCardioDuration('');
    setCardioIntensity('moderate');
    setCardioHeartRate('');
    setCardioDistance('');
    setCardioCalories('');
    setCardioNotes('');
    toast(`Added ${entry.type} — ${entry.durationMin} min`, 'success');
  }

  function removeCardioEntry(idx: number) {
    const updated = cardioEntries.filter((_, i) => i !== idx);
    setCardioEntries(updated);
    onUpdateCardio?.(updated);
  }

  // Exercise swap state
  const [sessionSwaps, setSessionSwaps] = useState<Record<string, string>>({});
  const [pendingSwap, setPendingSwap] = useState<{ exerciseId: string; oldName: string; newName: string } | null>(null);

  function handleSwapRequest(exerciseId: string, oldName: string, newName: string) {
    setPendingSwap({ exerciseId, oldName, newName });
  }

  function confirmSwap(permanent: boolean) {
    if (!pendingSwap) return;
    setSessionSwaps((prev) => ({ ...prev, [pendingSwap.exerciseId]: pendingSwap.newName }));
    onSwapExercise?.(pendingSwap.exerciseId, { name: pendingSwap.newName, muscles: [], equipment: '', type: 'compound' }, permanent);
    toast(`Swapped to ${pendingSwap.newName}${permanent ? ' — program updated' : ' (this session)'}`, 'success');
    setPendingSwap(null);
  }

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

  // Voice mode
  const voiceEnabled = getDashboardConfig().aiVoice && !!getApiKey();
  const currentExercise = useMemo(() => {
    return activeExercises.find((ex) => {
      const completed = (session.sets[ex.id] || []).filter((s) => s.completed).length;
      const total = ex.setScheme?.type === 'top_set_backoff' ? 1 + (ex.setScheme.backoffSets || 2)
        : ex.setScheme?.pyramidReps ? ex.setScheme.pyramidReps.length
        : ex.sets;
      return completed < total;
    }) || activeExercises[activeExercises.length - 1];
  }, [activeExercises, session.sets]);

  const voiceMode = useVoiceMode({
    mode: 'workout',
    enabled: voiceEnabled,
    workoutContext: currentExercise ? {
      currentExercise: { id: currentExercise.id, name: currentExercise.name, sets: currentExercise.sets, reps: currentExercise.reps },
      currentSetNumber: (session.sets[currentExercise.id] || []).filter((s) => s.completed).length + 1,
      preFilledWeight: lastPerformance[currentExercise.name.toLowerCase().trim()]?.sets[0]?.weight || 0,
      completedSets: (session.sets[currentExercise.id] || []).filter((s) => s.completed).map((s) => ({ weight: s.weight, reps: s.reps })),
      exerciseList: activeExercises.map((e) => ({ id: e.id, name: e.name })),
    } : undefined,
    onLogSet: (exId, weight, reps, rir, rpe, isWarmup) => handleComplete(exId, weight, reps, rir, rpe, isWarmup),
    onSkipExercise: (exId, reason) => {
      setSkippedExercises((prev) => [...prev, { exerciseId: exId, reason: reason || '' }]);
      toast(`Skipped ${activeExercises.find((e) => e.id === exId)?.name || 'exercise'}`, 'success');
    },
    onFinishWorkout: () => {
      onFinish(activeExercises);
    },
  });

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
    saveCustomExercise(newEx.name, newExMuscle);
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

  // Smart progression suggestions
  const progressionSuggestions = useMemo(() => {
    if (!allSessions || !programs || allSessions.length < 2) return {};
    const exMap = buildExerciseMap(programs);
    const suggestions: Record<string, ProgressionSuggestion | null> = {};
    for (const ex of activeExercises) {
      if (ex.exerciseType === 'cardio') continue;
      suggestions[ex.id] = analyzeExerciseProgression(ex, allSessions, exMap);
    }
    return suggestions;
  }, [allSessions, programs, activeExercises]);

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
    (exerciseId: string, weight: number, reps: number, rir?: number, rpe?: number, isWarmup?: boolean) => {
      // Check if this set already exists (was unchecked then re-checked)
      const existingSets = session.sets[exerciseId] || [];
      const uncheckedIdx = existingSets.findIndex((s, i) => !s.completed && i < (existingSets.length));
      if (uncheckedIdx >= 0) {
        onUpdateSet(exerciseId, uncheckedIdx, { weight, reps, completed: true, timestamp: Date.now(), rir, rpe, isWarmup });
        return;
      }

      const setLog: SetLog = {
        weight,
        reps,
        completed: true,
        timestamp: Date.now(),
        rir,
        isWarmup,
        rpe,
      };
      onLogSet(exerciseId, setLog);

      // PR detection
      const currentPR = prs[exerciseId];
      if (weight > 0 && (!currentPR || weight > currentPR.weight)) {
        const exercise = day.exercises.find((e) => e.id === exerciseId);
        const displayUnit = getDashboardConfig().weightUnit ?? 'lbs';
        toast(
          `New PR! ${exercise?.name || 'Exercise'}: ${toDisplayWeight(weight, displayUnit)} ${displayUnit}`,
          'success'
        );
        setPrs((prev) => ({
          ...prev,
          [exerciseId]: { weight, reps, date: session.date },
        }));
      }

      // Hierarchical rest timer: exercise override → program default → profile default
      const exercise = [...day.exercises, ...addedExercises].find((e) => e.id === exerciseId);
      const duration = exercise?.restTimerOverride || programDefaultRestTimer || restTimerDuration;
      setActiveRestDuration(duration);
      setShowRestTimer(true);
    },
    [onLogSet, prs, day.exercises, session.date, addedExercises, programDefaultRestTimer, restTimerDuration]
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
    <div className="pb-36">
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
          if (currentWeek > 0) {
            const storedTargets = exercise.weeklyTargets;
            if (storedTargets && storedTargets.length > 0) {
              weeklyTarget = storedTargets[currentWeek - 1] || null;
            } else if (exercise.progression && exercise.startingWeight != null && durationWeeks > 0) {
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
          }
          if (exercise.exerciseType === 'cardio') {
            const existing = cardioEntries.find((c) => c.type === exercise.name);
            return (
              <div key={exercise.id} className="bg-surface rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      <Heart size={14} className="text-danger" />
                      {exercise.name || 'Cardio'}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {exercise.targetDuration && `${exercise.targetDuration} min target`}
                      {exercise.targetIntensity && ` · ${exercise.targetIntensity} intensity`}
                    </div>
                    {exercise.note && <div className="text-[10px] text-text-muted italic mt-0.5">{exercise.note}</div>}
                  </div>
                  {existing && <Check size={16} className="text-success" />}
                </div>
                {existing ? (
                  <div className="flex gap-2 text-[11px] text-text-muted flex-wrap">
                    <span>{existing.durationMin} min</span>
                    {existing.intensity && <span className="capitalize">{existing.intensity}</span>}
                    {existing.heartRateAvg && <span>{existing.heartRateAvg} bpm</span>}
                    {existing.distanceKm != null && (
                      <span>{existing.distanceUnit === 'mi' ? (existing.distanceKm / 1.60934).toFixed(1) + ' mi' : existing.distanceKm.toFixed(1) + ' km'}</span>
                    )}
                    {existing.caloriesBurned && <span>{existing.caloriesBurned} cal</span>}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setCardioType(exercise.name || '');
                      setCardioDuration(exercise.targetDuration ? String(exercise.targetDuration) : '');
                      setCardioIntensity(exercise.targetIntensity || 'moderate');
                      setShowAddCardio(true);
                    }}
                    className="btn-primary w-full text-sm py-2"
                  >
                    Log Cardio
                  </button>
                )}
              </div>
            );
          }
          const swapOverride = sessionSwaps[exercise.id];
          const effectiveExercise = swapOverride ? { ...exercise, name: swapOverride } : exercise;
          return (
          <div key={exercise.id} className="relative">
            <ExerciseCard
              exercise={effectiveExercise}
              exerciseIndex={index}
              sessionSets={session.sets[exercise.id] || []}
              previousSets={previousSession?.sets[exercise.id]}
              lastPerformance={lastPerformance[effectiveExercise.name.toLowerCase().trim()]}
              weeklyTarget={weeklyTarget}
              prs={prs}
              onComplete={handleComplete}
              onUpdate={onUpdateSet}
              onSwap={(swap) => handleSwapRequest(exercise.id, exercise.name, swap.name)}
              progression={progressionSuggestions[exercise.id] || null}
              effortMetric={effortMetric}
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
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-3xl w-full max-w-lg p-5 pb-20 space-y-3 animate-in slide-in-from-bottom">
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
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-3xl w-full max-w-lg p-5 pb-20 space-y-3 animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-base">Add Exercise</h3>
            <p className="text-xs text-text-muted">Search the library or type a custom exercise name.</p>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Search exercises..."
              value={newExName}
              onChange={(e) => setNewExName(e.target.value)}
              autoFocus
            />
            {/* Library suggestions */}
            {newExName.trim().length >= 2 && (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {/* Custom exercises first, then library */}
                {searchCustomExercises(newExName).slice(0, 3).map((ex) => (
                  <button
                    key={`custom-${ex.name}`}
                    onClick={() => {
                      setNewExName(ex.name);
                      setNewExMuscle(ex.muscle || '');
                    }}
                    className="w-full text-left bg-surface-raised rounded-lg px-3 py-2 hover:bg-border transition-colors"
                  >
                    <div className="text-xs font-medium flex items-center gap-1">
                      {ex.name}
                      <span className="text-[8px] px-1 rounded bg-accent/15 text-accent">My Exercise</span>
                    </div>
                    {ex.muscle && <div className="text-[10px] text-text-muted">{ex.muscle}</div>}
                  </button>
                ))}
                {searchExerciseLibrary(newExName).slice(0, 6).map((ex) => (
                  <button
                    key={ex.name}
                    onClick={() => {
                      setNewExName(ex.name);
                      setNewExMuscle(ex.muscles[0] || '');
                    }}
                    className="w-full text-left bg-surface-raised rounded-lg px-3 py-2 hover:bg-border transition-colors"
                  >
                    <div className="text-xs font-medium">{ex.name}</div>
                    <div className="text-[10px] text-text-muted">{ex.muscles.join(', ')} · {ex.equipment} · {ex.type}</div>
                  </button>
                ))}
              </div>
            )}
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

      {/* Cardio tracking — hide if day has programmed cardio exercises */}
      {!activeExercises.some((e) => e.exerciseType === 'cardio') && (
      <div className="px-4 pt-2">
        <div className="bg-surface rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Heart size={13} /> Cardio
            </h3>
            <button
              onClick={() => setShowAddCardio(true)}
              className="text-[11px] text-accent-blue font-medium flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {cardioEntries.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-2">No cardio logged</p>
          ) : (
            <div className="space-y-2">
              {cardioEntries.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-raised">
                  <div>
                    <div className="text-sm font-medium">{entry.type}</div>
                    <div className="flex gap-2 text-[11px] text-text-muted mt-0.5 flex-wrap">
                      <span>{entry.durationMin} min</span>
                      {entry.intensity && <span className="capitalize">{entry.intensity}</span>}
                      {entry.heartRateAvg && <span>{entry.heartRateAvg} bpm</span>}
                      {entry.distanceKm != null && (
                        <span>
                          {entry.distanceUnit === 'mi'
                            ? (entry.distanceKm / 1.60934).toFixed(1) + ' mi'
                            : entry.distanceKm.toFixed(1) + ' km'}
                        </span>
                      )}
                      {entry.caloriesBurned && <span>{entry.caloriesBurned} cal</span>}
                    </div>
                    {entry.notes && <div className="text-[10px] text-text-muted italic mt-0.5">{entry.notes}</div>}
                  </div>
                  <button onClick={() => removeCardioEntry(idx)} className="p-1.5 text-text-muted hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Add cardio modal */}
      {showAddCardio && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-3xl w-full max-w-lg p-5 pb-20 space-y-3 animate-in slide-in-from-bottom">
            <h3 className="font-bold text-base">Add Cardio</h3>

            <div>
              <label className="text-[9px] text-text-muted mb-1 block">Type</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {CARDIO_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setCardioType(t)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      cardioType === t ? 'bg-accent-orange/20 text-accent-orange' : 'bg-surface-raised text-text-muted'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="Or type custom..."
                value={cardioType}
                onChange={(e) => setCardioType(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Duration (min) *</label>
                <input type="number" inputMode="numeric" className="input-field text-sm" placeholder="30" value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Intensity</label>
                <div className="flex gap-1">
                  {(['low', 'moderate', 'high'] as const).map((i) => (
                    <button
                      key={i}
                      onClick={() => setCardioIntensity(i)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-medium capitalize transition-colors ${
                        cardioIntensity === i
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

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Avg HR (bpm)</label>
                <input type="number" inputMode="numeric" className="input-field text-sm" placeholder="145" value={cardioHeartRate} onChange={(e) => setCardioHeartRate(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Distance</label>
                <div className="flex gap-1">
                  <input type="number" inputMode="decimal" className="input-field text-sm flex-1" placeholder="3.0" value={cardioDistance} onChange={(e) => setCardioDistance(e.target.value)} />
                  <select className="input-field text-[10px] py-0 w-12" value={cardioDistanceUnit} onChange={(e) => setCardioDistanceUnit(e.target.value as 'mi' | 'km')}>
                    <option value="mi">mi</option>
                    <option value="km">km</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Cal Burned</label>
                <input type="number" inputMode="numeric" className="input-field text-sm" placeholder="300" value={cardioCalories} onChange={(e) => setCardioCalories(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-[9px] text-text-muted mb-0.5 block">Notes</label>
              <input type="text" className="input-field text-sm" placeholder="e.g. incline 5%, intervals..." value={cardioNotes} onChange={(e) => setCardioNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddCardio(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={addCardioEntry} disabled={!cardioType.trim() || !cardioDuration} className="btn-primary flex-1 text-sm disabled:opacity-30">Add Cardio</button>
            </div>
          </div>
        </div>
      )}

      {/* Voice mode */}
      {voiceEnabled && (
        <>
          <VoiceMicButton
            onTranscript={voiceMode.handleTranscript}
            position="workout"
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

      {/* Sticky finish button */}
      <div className="fixed bottom-14 left-0 right-0 p-4 bg-bg/95 backdrop-blur-sm border-t border-border z-20 safe-bottom">
        <button
          onClick={() => {
            onFinish(activeExercises);
          }}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Trophy size={18} />
          Finish Workout
        </button>
      </div>

      {/* Rest timer overlay */}
      {showRestTimer && (
        <RestTimer
          duration={activeRestDuration}
          onComplete={() => setShowRestTimer(false)}
          onDismiss={() => setShowRestTimer(false)}
        />
      )}

      {/* Swap exercise confirm */}
      {pendingSwap && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card mx-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-base">Swap Exercise?</h3>
            <div className="bg-surface-raised rounded-xl p-3 space-y-1">
              <div className="text-sm text-text-muted line-through">{pendingSwap.oldName}</div>
              <div className="text-sm font-medium text-accent-blue">→ {pendingSwap.newName}</div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => confirmSwap(false)}
                className="btn-secondary w-full text-sm"
              >
                This session only
              </button>
              {onSwapExercise && (
                <button
                  onClick={() => confirmSwap(true)}
                  className="w-full font-semibold rounded-xl px-4 py-2.5 text-sm bg-accent-blue text-white active:scale-95 transition-transform"
                >
                  Update program
                </button>
              )}
              <button
                onClick={() => setPendingSwap(null)}
                className="w-full text-sm text-text-muted py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
