import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Calendar, TrendingUp, BarChart3, Share2, Trash2, Pencil, Check } from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { SVGBarChart } from '../shared/SVGBarChart';
import type { WorkoutSession, Program } from '../../types';
import { buildWorkoutCardData, renderWorkoutCard, shareOrDownload } from '../../utils/shareCards';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { getWeightUnit, toDisplayWeight, fromDisplayWeight, type WeightUnit } from '../../utils/units';

interface Props {
  sessions: WorkoutSession[];
  programs: Program[];
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSession?: (session: WorkoutSession) => void;
}

function SessionCard({
  session,
  program,
  onDelete,
  onUpdate,
  weightUnit,
}: {
  session: WorkoutSession;
  program: Program | undefined;
  onDelete?: (sessionId: string) => void;
  onUpdate?: (session: WorkoutSession) => void;
  weightUnit: WeightUnit;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSets, setEditSets] = useState<Record<string, { weight: string; reps: string }[]>>({});
  const [deleteSets, setDeleteSets] = useState<Record<string, number[]>>({});
  const [deleteExercises, setDeleteExercises] = useState<string[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  const day = program?.days.find((d) => d.id === session.dayId);
  const totalSets = Object.values(session.sets).reduce(
    (sum, sets) => sum + sets.filter((s) => s.completed && !s.isWarmup).length,
    0
  );
  const totalVolume = Object.values(session.sets).reduce(
    (sum, sets) =>
      sum +
      sets
        .filter((s) => s.completed && !s.isWarmup)
        .reduce((acc, s) => acc + s.weight * s.reps, 0),
    0
  );
  const durationMs = (session.endTime || Date.now()) - session.startTime;
  const durationMin = Math.round(durationMs / 60000);
  const hasCardio = (session.cardio?.length ?? 0) > 0;
  const isCardioOnly = totalSets === 0 && hasCardio;
  const cardioTotalMin = session.cardio?.reduce((s, c) => s + c.durationMin, 0) ?? 0;

  const displayTitle = session.name || day?.title || program?.name || 'Workout';

  const dateStr = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
          style={{ backgroundColor: day?.accent || '#e8572a' }}
        >
          {day?.label?.slice(0, 2) || 'W'}
        </div>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              className="font-semibold text-sm bg-transparent border-b border-accent-orange focus:outline-none text-text-primary w-full"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                setEditingTitle(false);
                const newName = titleValue.trim();
                if (onUpdate && newName !== displayTitle) {
                  onUpdate({ ...session, name: newName || undefined });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingTitle(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onUpdate) { setTitleValue(displayTitle); setEditingTitle(true); }
              }}
              className="font-semibold text-sm truncate flex items-center gap-1 text-left w-full"
            >
              <span className="truncate">{displayTitle}</span>
              {onUpdate && <Pencil size={10} className="flex-shrink-0 opacity-30" />}
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>{dateStr}</span>
            <span className="text-text-muted">|</span>
            <span>{durationMin} min</span>
            <span className="text-text-muted">|</span>
            {isCardioOnly ? (
              <span>{session.cardio!.map((c) => c.type).join(', ')}</span>
            ) : (
              <span>{totalSets} sets</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-accent-orange">
            {isCardioOnly
              ? `${cardioTotalMin} min`
              : totalVolume > 0
                ? `${toDisplayWeight(totalVolume, weightUnit).toLocaleString()} ${weightUnit}`
                : `${totalSets} sets`}
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-text-muted ml-auto mt-0.5" />
          ) : (
            <ChevronDown size={16} className="text-text-muted ml-auto mt-0.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {Object.entries(session.sets).map(([exerciseId, sets]) => {
            if (deleteExercises.includes(exerciseId)) return null;
            const exercise = day?.exercises.find((e) => e.id === exerciseId);
            const completedSets = sets.filter((s) => s.completed);
            if (completedSets.length === 0) return null;

            return (
              <div key={exerciseId}>
                <p className="text-xs font-semibold text-text-secondary mb-1">
                  {exercise?.name || exerciseId}
                </p>
                {editing ? (
                  <div className="space-y-1">
                    {completedSets.map((set, i) => {
                      const edits = editSets[exerciseId]?.[i];
                      return (
                        <div key={i} className="flex gap-1 items-center">
                          <input type="text" inputMode="decimal" className="w-14 text-xs text-center bg-surface-raised border border-accent-blue/30 rounded-md px-1 py-1" value={edits?.weight ?? String(toDisplayWeight(set.weight, weightUnit))} onChange={(e) => {
                            const updated = { ...editSets };
                            if (!updated[exerciseId]) updated[exerciseId] = completedSets.map((s) => ({ weight: String(toDisplayWeight(s.weight, weightUnit)), reps: String(s.reps) }));
                            updated[exerciseId][i] = { ...updated[exerciseId][i], weight: e.target.value };
                            setEditSets(updated);
                          }} />
                          <span className="text-[10px] text-text-muted">×</span>
                          <input type="text" inputMode="numeric" className="w-10 text-xs text-center bg-surface-raised border border-accent-blue/30 rounded-md px-1 py-1" value={edits?.reps ?? String(set.reps)} onChange={(e) => {
                            const updated = { ...editSets };
                            if (!updated[exerciseId]) updated[exerciseId] = completedSets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) }));
                            updated[exerciseId][i] = { ...updated[exerciseId][i], reps: e.target.value };
                            setEditSets(updated);
                          }} />
                          <button onClick={() => {
                            setDeleteSets((prev) => ({ ...prev, [exerciseId]: [...(prev[exerciseId] || []), i] }));
                          }} className="p-0.5 text-text-muted hover:text-danger"><Trash2 size={10} /></button>
                        </div>
                      );
                    }).filter((_, i) => !(deleteSets[exerciseId] || []).includes(i))}
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => {
                        const updated = { ...editSets };
                        if (!updated[exerciseId]) updated[exerciseId] = completedSets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) }));
                        const last = updated[exerciseId][updated[exerciseId].length - 1];
                        updated[exerciseId] = [...updated[exerciseId], { weight: last?.weight || '0', reps: last?.reps || '0' }];
                        setEditSets(updated);
                      }} className="text-[9px] text-accent-blue font-semibold">+ Add Set</button>
                      <button onClick={() => {
                        setDeleteExercises((prev) => [...prev, exerciseId]);
                      }} className="text-[9px] text-danger font-semibold">Remove Exercise</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {completedSets.map((set, i) => (
                      <span key={i} className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1 tabular-nums">
                        {set.weight > 0 ? `${toDisplayWeight(set.weight, weightUnit)}x${set.reps}` : `${set.reps} reps`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {hasCardio && (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1">Cardio</p>
              <div className="space-y-1">
                {session.cardio!.map((c, i) => (
                  <div key={i} className="flex flex-wrap gap-1.5">
                    <span className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1">
                      {c.type} · {c.durationMin} min
                    </span>
                    {c.intensity && (
                      <span className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1 capitalize">
                        {c.intensity}
                      </span>
                    )}
                    {c.distanceKm != null && (
                      <span className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1">
                        {c.distanceKm} {c.distanceUnit ?? 'km'}
                      </span>
                    )}
                    {c.heartRateAvg != null && (
                      <span className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1">
                        {c.heartRateAvg} bpm
                      </span>
                    )}
                    {c.caloriesBurned != null && (
                      <span className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1">
                        {c.caloriesBurned} kcal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.notes && (
            <p className="text-xs text-text-secondary italic">{session.notes}</p>
          )}

          <div className="flex gap-2 mt-2">
            {onUpdate && (
              editing ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    let updatedSets = { ...session.sets };

                    // Remove deleted exercises
                    for (const exId of deleteExercises) {
                      delete updatedSets[exId];
                    }

                    // Apply edits and deletions per exercise
                    for (const [exId, edits] of Object.entries(editSets)) {
                      if (deleteExercises.includes(exId)) continue;
                      const original = updatedSets[exId] || [];
                      const delIndices = new Set(deleteSets[exId] || []);
                      const completedOnly = original.filter((s) => s.completed);
                      const result: typeof original = [];

                      // Map edits onto completed sets, skip deleted indices
                      let editIdx = 0;
                      for (let i = 0; i < completedOnly.length; i++) {
                        if (delIndices.has(i)) continue;
                        const edit = edits[editIdx++];
                        if (edit) {
                          result.push({ ...completedOnly[i], weight: fromDisplayWeight(parseFloat(edit.weight) || toDisplayWeight(completedOnly[i].weight, weightUnit), weightUnit), reps: parseInt(edit.reps) || completedOnly[i].reps });
                        } else {
                          result.push(completedOnly[i]);
                        }
                      }

                      // Add new sets (edits beyond original length)
                      while (editIdx < edits.length) {
                        const edit = edits[editIdx++];
                        result.push({ weight: fromDisplayWeight(parseFloat(edit.weight) || 0, weightUnit), reps: parseInt(edit.reps) || 0, completed: true, timestamp: Date.now() });
                      }

                      updatedSets[exId] = result;
                    }

                    // Handle deletions for exercises with no edits
                    for (const [exId, delIndices] of Object.entries(deleteSets)) {
                      if (editSets[exId] || deleteExercises.includes(exId)) continue;
                      const original = updatedSets[exId] || [];
                      const delSet = new Set(delIndices);
                      let completedIdx = 0;
                      updatedSets[exId] = original.filter((s) => {
                        if (!s.completed) return true;
                        return !delSet.has(completedIdx++);
                      });
                    }

                    onUpdate({ ...session, sets: updatedSets });
                    setEditing(false);
                    setEditSets({});
                    setDeleteSets({});
                    setDeleteExercises([]);
                  }}
                  className="flex-1 py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Check size={12} /> Save Changes
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(true); setEditSets({}); setDeleteSets({}); setDeleteExercises([]); }}
                  className="py-2 px-3 rounded-lg bg-surface-raised border border-border-light text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Pencil size={12} /> Edit
                </button>
              )
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const exercises = day?.exercises || [];
                const cardData = buildWorkoutCardData(session, exercises, {}, {});
                const canvas = renderWorkoutCard(cardData);
                shareOrDownload(canvas, `workout-${session.date}.png`);
              }}
              className="flex-1 py-2 rounded-lg bg-surface-raised border border-border-light text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <Share2 size={12} />
              Share
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="py-2 px-4 rounded-lg bg-surface-raised border border-border-light text-xs font-medium text-danger flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>

          <ConfirmDialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              onDelete?.(session.id);
              setShowDeleteConfirm(false);
            }}
            title="Delete Workout"
            message={`Delete this ${day?.tag || 'workout'} session from ${dateStr}? This cannot be undone.`}
            confirmText="Delete"
            danger
          />
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-bold text-accent-orange">{payload[0].value} sets</p>
    </div>
  );
};

const StrengthTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const wu = getWeightUnit();
  return (
    <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-bold text-accent-blue">{Number(payload[0].value).toLocaleString()} {wu}</p>
    </div>
  );
};

type VolumeMetric = 'volume' | 'sets' | 'duration' | 'intensity';

const VOLUME_METRIC_META: Record<VolumeMetric, { label: string; unit: string; color: string }> = {
  volume:    { label: 'Volume',    unit: 'lbs',     color: '#e8572a' },
  sets:      { label: 'Sets',      unit: 'sets',    color: '#e8572a' },
  duration:  { label: 'Duration',  unit: 'min',     color: '#22c55e' },
  intensity: { label: 'Intensity', unit: 'lbs/min', color: '#5b6ef5' },
};


export function WorkoutHistory({ sessions, programs, onDeleteSession, onUpdateSession }: Props) {
  const weightUnit = getWeightUnit();
  const [activeTab, setActiveTab] = useState<'history' | 'volume' | 'strength'>('history');
  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>('volume');
  const [volumeGranularity, setVolumeGranularity] = useState<'session' | 'weekly'>('session');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  // Per-session metrics (last 30, chronological)
  const sessionMetrics = useMemo(() => {
    return sessions
      .slice()
      .reverse()
      .slice(-30)
      .map((s) => {
        const workSets = Object.values(s.sets).flat().filter((st) => st.completed && !st.isWarmup);
        const volume = Math.round(workSets.reduce((sum, st) => sum + st.weight * st.reps, 0));
        const sets = workSets.length;
        const durationMin = s.endTime ? Math.round((s.endTime - s.startTime) / 60000) : null;
        const intensity = (durationMin && durationMin > 0) ? Math.round(volume / durationMin) : null;
        return {
          label: new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          volume,
          sets,
          duration: durationMin,
          intensity,
        };
      });
  }, [sessions]);

  // Weekly aggregated metrics (last 12 weeks, chronological)
  const weeklyMetrics = useMemo(() => {
    const weeks: Record<string, { volume: number; sets: number; totalDur: number; durCount: number }> = {};
    for (const s of sessions) {
      const date = new Date(s.date + 'T00:00:00');
      const ws = new Date(date);
      ws.setDate(date.getDate() - date.getDay());
      const key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
      const workSets = Object.values(s.sets).flat().filter((st) => st.completed && !st.isWarmup);
      const vol = workSets.reduce((sum, st) => sum + st.weight * st.reps, 0);
      const dur = s.endTime ? (s.endTime - s.startTime) / 60000 : null;
      if (!weeks[key]) weeks[key] = { volume: 0, sets: 0, totalDur: 0, durCount: 0 };
      weeks[key].volume += vol;
      weeks[key].sets += workSets.length;
      if (dur != null) { weeks[key].totalDur += dur; weeks[key].durCount++; }
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, d]) => ({
        label: new Date(week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        volume: Math.round(d.volume),
        sets: d.sets,
        duration: d.durCount > 0 ? Math.round(d.totalDur) : null,
        intensity: (d.durCount > 0 && d.totalDur > 0) ? Math.round(d.volume / d.totalDur) : null,
      }));
  }, [sessions]);

  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [strengthMode, setStrengthMode] = useState<'weight' | '1rm'>('weight');

  // Exercise → muscle group map (reused from programs)
  const exerciseMuscleMap = useMemo(() => {
    const map: Record<string, { primaries: string[]; secondary: string[] }> = {};
    for (const prog of programs) {
      for (const day of prog.days) {
        for (const ex of day.exercises) {
          if (ex.muscle) {
            const primaries = ex.muscle.split(',').map((m) => m.trim()).filter(Boolean);
            const sec = ex.secondaryMuscles;
            const secondary = Array.isArray(sec) ? sec : (sec || '').split(',').map((m) => m.trim()).filter(Boolean);
            map[ex.id] = { primaries, secondary };
          }
        }
      }
    }
    return map;
  }, [programs]);

  // Per-session muscle volume breakdown (last 30 sessions)
  const sessionMuscleMetrics = useMemo(() => {
    return sessions
      .slice()
      .reverse()
      .slice(-30)
      .map((s) => {
        const label = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const muscleVolumes: Record<string, number> = {};
        for (const [exId, sets] of Object.entries(s.sets)) {
          const workingSets = sets.filter((st) => st.completed && !st.isWarmup);
          if (workingSets.length === 0) continue;
          const info = exerciseMuscleMap[exId];
          if (!info?.primaries?.length) continue;
          const vol = workingSets.reduce((a, st) => a + st.weight * st.reps, 0);
          for (const p of info.primaries) {
            if (p) muscleVolumes[p] = (muscleVolumes[p] || 0) + vol;
          }
          for (const sec of info.secondary) {
            if (sec) muscleVolumes[sec] = (muscleVolumes[sec] || 0) + Math.round(vol * 0.5);
          }
        }
        return { label, muscleVolumes };
      });
  }, [sessions, exerciseMuscleMap]);

  // Per-week muscle volume breakdown (last 12 weeks)
  const weeklyMuscleMetrics = useMemo(() => {
    const weeks: Record<string, { label: string; muscleVolumes: Record<string, number> }> = {};
    for (const s of sessions) {
      const date = new Date(s.date + 'T00:00:00');
      const ws = new Date(date);
      ws.setDate(date.getDate() - date.getDay());
      const key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
      if (!weeks[key]) weeks[key] = { label: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), muscleVolumes: {} };
      for (const [exId, sets] of Object.entries(s.sets)) {
        const workingSets = sets.filter((st) => st.completed && !st.isWarmup);
        if (workingSets.length === 0) continue;
        const info = exerciseMuscleMap[exId];
        if (!info?.primaries?.length) continue;
        const vol = workingSets.reduce((a, st) => a + st.weight * st.reps, 0);
        for (const p of info.primaries) {
          if (p) weeks[key].muscleVolumes[p] = (weeks[key].muscleVolumes[p] || 0) + vol;
        }
        for (const sec of info.secondary) {
          if (sec) weeks[key].muscleVolumes[sec] = (weeks[key].muscleVolumes[sec] || 0) + Math.round(vol * 0.5);
        }
      }
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, d]) => d);
  }, [sessions, exerciseMuscleMap]);

  // Muscles with data for the current granularity
  const availableMuscles = useMemo(() => {
    const data = volumeGranularity === 'session' ? sessionMuscleMetrics : weeklyMuscleMetrics;
    const muscles = new Set<string>();
    for (const d of data) {
      for (const [m, v] of Object.entries(d.muscleVolumes)) {
        if (v > 0) muscles.add(m);
      }
    }
    return [...muscles].sort();
  }, [sessionMuscleMetrics, weeklyMuscleMetrics, volumeGranularity]);

  const effectiveMuscle = (selectedMuscle && availableMuscles.includes(selectedMuscle))
    ? selectedMuscle
    : availableMuscles[0] ?? null;

  // Chart data for selected muscle
  const muscleChartData = useMemo(() => {
    const data = volumeGranularity === 'session' ? sessionMuscleMetrics : weeklyMuscleMetrics;
    return data.map((d) => ({
      label: d.label,
      volume: Math.round(effectiveMuscle ? (d.muscleVolumes[effectiveMuscle] || 0) : 0),
    }));
  }, [volumeGranularity, sessionMuscleMetrics, weeklyMuscleMetrics, effectiveMuscle]);

  // Muscle summary for current/previous period (for the breakdown list)
  const muscleSummary = useMemo(() => {
    const data = volumeGranularity === 'session' ? sessionMuscleMetrics : weeklyMuscleMetrics;
    const recent = data.slice(-1)[0]?.muscleVolumes || {};
    const prev = data.slice(-2, -1)[0]?.muscleVolumes || {};
    return availableMuscles.map((m) => ({
      muscle: m,
      volume: Math.round(recent[m] || 0),
      prevVolume: Math.round(prev[m] || 0),
    })).sort((a, b) => b.volume - a.volume);
  }, [availableMuscles, sessionMuscleMetrics, weeklyMuscleMetrics, volumeGranularity]);

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const prog of programs) {
      for (const day of prog.days) {
        for (const ex of day.exercises) {
          map[ex.id] = ex.name;
        }
      }
    }
    return map;
  }, [programs]);

  const exerciseList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of sessions) {
      for (const [exId, sets] of Object.entries(session.sets)) {
        if (!sets.some((s) => s.completed && !s.isWarmup && s.weight > 0 && s.reps > 0)) continue;
        counts[exId] = (counts[exId] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([id, count]) => ({ id, name: exerciseNameMap[id], count }))
      .filter((e) => !!e.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [sessions, exerciseNameMap]);

  const effectiveExId = useMemo(() => {
    if (selectedExId && exerciseList.some((e) => e.id === selectedExId)) return selectedExId;
    return exerciseList[0]?.id ?? null;
  }, [selectedExId, exerciseList]);

  const strengthData = useMemo(() => {
    if (!effectiveExId) return [];
    return sessions
      .slice()
      .reverse()
      .filter((s) => s.sets[effectiveExId]?.some((st) => st.completed && !st.isWarmup && st.weight > 0 && st.reps > 0))
      .slice(-30)
      .map((s) => {
        const sets = s.sets[effectiveExId].filter((st) => st.completed && !st.isWarmup && st.weight > 0 && st.reps > 0);
        const maxWeight = Math.max(...sets.map((st) => st.weight));
        const max1RM = Math.max(...sets.map((st) => {
          if (st.reps <= 1) return st.weight;
          const r = Math.min(st.reps, 30);
          return Math.round(st.weight * (36 / (37 - r)));
        }));
        return {
          date: new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          maxWeight,
          est1RM: max1RM,
        };
      });
  }, [sessions, effectiveExId]);

  const displayKey = strengthMode === 'weight' ? 'maxWeight' : 'est1RM';
  const pr = strengthData.length > 0 ? Math.max(...strengthData.map((d) => d[displayKey])) : null;
  const lastChange = strengthData.length >= 2
    ? strengthData[strengthData.length - 1][displayKey] - strengthData[strengthData.length - 2][displayKey]
    : null;
  // Convert strength data from stored lbs to display unit for correct chart scaling
  const displayStrengthData = strengthData.map((d) => ({
    date: d.date,
    maxWeight: toDisplayWeight(d.maxWeight, weightUnit),
    est1RM: toDisplayWeight(d.est1RM, weightUnit),
  }));

  const programMap = useMemo(() => {
    const map: Record<string, Program> = {};
    for (const p of programs) map[p.id] = p;
    return map;
  }, [programs]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-10">
        <Calendar size={36} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm">
          No workout history yet. Start your first workout!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 border border-border">
        {([
          { key: 'history', label: 'History', icon: Calendar },
          { key: 'volume', label: 'Volume', icon: BarChart3 },
          { key: 'strength', label: 'Strength', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* History list */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              program={programMap[session.programId]}
              onDelete={onDeleteSession}
              onUpdate={onUpdateSession}
              weightUnit={weightUnit}
            />
          ))}
        </div>
      )}

      {/* Volume tab — per-muscle breakdown */}
      {activeTab === 'volume' && (
        <div className="space-y-3">
          {availableMuscles.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">Complete more workouts to see muscle volume trends</p>
          ) : (
            <>
              {/* Muscle group chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {availableMuscles.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMuscle(m)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      effectiveMuscle === m
                        ? 'bg-accent-orange text-white'
                        : 'bg-surface-raised text-text-secondary border border-border'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Chart card */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="label leading-none">
                      {effectiveMuscle} Volume
                      <span className="text-[10px] font-normal text-text-muted ml-1.5">({weightUnit})</span>
                    </h4>
                    <p className="text-[10px] text-text-muted mt-0.5">Weight × reps per {volumeGranularity === 'session' ? 'session' : 'week'}</p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <button
                      onClick={() => setVolumeGranularity('session')}
                      className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${volumeGranularity === 'session' ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Session
                    </button>
                    <button
                      onClick={() => setVolumeGranularity('weekly')}
                      className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${volumeGranularity === 'weekly' ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>

                {muscleChartData.filter((d) => d.volume > 0).length > 1 ? (
                  volumeGranularity === 'weekly' ? (
                    <SVGBarChart
                      key={`${effectiveMuscle}-weekly`}
                      data={muscleChartData.map((d) => ({ label: d.label, value: toDisplayWeight(d.volume, weightUnit) }))}
                      color="#e8572a"
                      height={208}
                      yAxisWidth={50}
                      formatY={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                      formatValue={(v) => `${v.toLocaleString()} ${weightUnit}`}
                    />
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={muscleChartData}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} domain={['auto', 'auto']} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg"><p className="text-text-secondary mb-0.5">{label as string}</p><p className="font-bold text-accent-orange">{toDisplayWeight(Number(payload[0].value), weightUnit).toLocaleString()} {weightUnit}</p></div>;
                          }} />
                          <Line type="monotone" dataKey="volume" stroke="#e8572a" strokeWidth={2} dot={{ fill: '#e8572a', r: 3 }} activeDot={{ fill: '#e8572a', r: 5 }} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )
                ) : (
                  <p className="text-text-secondary text-sm text-center py-8">Not enough {effectiveMuscle} sessions to show a trend yet</p>
                )}
              </div>

              {/* All muscle breakdown */}
              {muscleSummary.length > 0 && (
                <div className="card space-y-2">
                  <h4 className="label">All Muscle Groups</h4>
                  <p className="text-[10px] text-text-muted -mt-1">vs. previous {volumeGranularity === 'session' ? 'session' : 'week'}</p>
                  {muscleSummary.map((m) => {
                    const maxVol = Math.max(...muscleSummary.map((d) => d.volume), 1);
                    const pct = (m.volume / maxVol) * 100;
                    const trend = m.prevVolume > 0 ? Math.round(((m.volume - m.prevVolume) / m.prevVolume) * 100) : null;
                    return (
                      <div key={m.muscle}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <button
                            onClick={() => setSelectedMuscle(m.muscle)}
                            className={`font-medium capitalize hover:text-accent-orange transition-colors ${effectiveMuscle === m.muscle ? 'text-accent-orange' : ''}`}
                          >
                            {m.muscle}
                          </button>
                          <span className="text-text-muted tabular-nums">
                            {toDisplayWeight(m.volume, weightUnit).toLocaleString()} {weightUnit}
                            {trend != null && (
                              <span className={`ml-1.5 ${trend > 0 ? 'text-green-500' : trend < 0 ? 'text-danger' : 'text-text-muted'}`}>
                                {trend > 0 ? '+' : ''}{trend}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: effectiveMuscle === m.muscle ? '#e8572a' : 'var(--color-border)' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Strength tab */}
      {activeTab === 'strength' && (
        <div className="space-y-3">
          {exerciseList.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">
              Complete more workouts to see strength trends
            </p>
          ) : (
            <>
              {/* Exercise picker */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {exerciseList.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExId(ex.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      ex.id === effectiveExId
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-raised text-text-secondary border border-border'
                    }`}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>

              {/* PR + last session change */}
              {pr != null && (
                <div className="card flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">All-Time PR</p>
                    <p className="text-2xl font-bold text-accent-blue">
                      {toDisplayWeight(pr!, weightUnit)} <span className="text-sm font-normal text-text-muted">{weightUnit}</span>
                    </p>
                  </div>
                  {lastChange != null && lastChange !== 0 && (
                    <div className={`text-right text-sm font-semibold ${lastChange > 0 ? 'text-success' : 'text-danger'}`}>
                      {lastChange > 0 ? '+' : ''}{toDisplayWeight(lastChange, weightUnit)} {weightUnit}
                      <p className="text-[10px] font-normal text-text-muted">vs last session</p>
                    </div>
                  )}
                </div>
              )}

              {/* Chart */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="label">{strengthMode === 'weight' ? 'Max Weight' : 'Est. 1RM'} per Session</h4>
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <button
                      onClick={() => setStrengthMode('weight')}
                      className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${strengthMode === 'weight' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Max
                    </button>
                    <button
                      onClick={() => setStrengthMode('1rm')}
                      className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${strengthMode === '1rm' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      1RM
                    </button>
                  </div>
                </div>
                {strengthData.length > 1 ? (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displayStrengthData}>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                          axisLine={{ stroke: 'var(--color-border)' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={45}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip content={<StrengthTooltip />} />
                        <Line
                          type="monotone"
                          dataKey={displayKey}
                          stroke="#5b6ef5"
                          strokeWidth={2}
                          dot={{ fill: '#5b6ef5', r: 3 }}
                          activeDot={{ fill: '#5b6ef5', r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-text-secondary text-sm text-center py-8">
                    Log this exercise at least twice to see a trend
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
