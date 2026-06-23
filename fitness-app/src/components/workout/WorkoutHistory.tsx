import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Calendar, TrendingUp, BarChart3, Share2, Trash2, Pencil, Check } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import type { WorkoutSession, Program } from '../../types';
import { buildWorkoutCardData, renderWorkoutCard, shareOrDownload } from '../../utils/shareCards';
import { ConfirmDialog } from '../shared/ConfirmDialog';

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
}: {
  session: WorkoutSession;
  program: Program | undefined;
  onDelete?: (sessionId: string) => void;
  onUpdate?: (session: WorkoutSession) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSets, setEditSets] = useState<Record<string, { weight: string; reps: string }[]>>({});
  const [deleteSets, setDeleteSets] = useState<Record<string, number[]>>({});
  const [deleteExercises, setDeleteExercises] = useState<string[]>([]);

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
          <div className="font-semibold text-sm truncate">
            {day?.title || program?.name || 'Workout'}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>{dateStr}</span>
            <span className="text-text-muted">|</span>
            <span>{durationMin} min</span>
            <span className="text-text-muted">|</span>
            <span>{totalSets} sets</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-accent-orange">
            {totalVolume > 0
              ? `${totalVolume.toLocaleString()} lbs`
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
                          <input type="text" inputMode="decimal" className="w-14 text-xs text-center bg-surface-raised border border-accent-blue/30 rounded-md px-1 py-1" value={edits?.weight ?? String(set.weight)} onChange={(e) => {
                            const updated = { ...editSets };
                            if (!updated[exerciseId]) updated[exerciseId] = completedSets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) }));
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
                        {set.weight > 0 ? `${set.weight}x${set.reps}` : `${set.reps} reps`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
                          result.push({ ...completedOnly[i], weight: parseFloat(edit.weight) || completedOnly[i].weight, reps: parseInt(edit.reps) || completedOnly[i].reps });
                        } else {
                          result.push(completedOnly[i]);
                        }
                      }

                      // Add new sets (edits beyond original length)
                      while (editIdx < edits.length) {
                        const edit = edits[editIdx++];
                        result.push({ weight: parseFloat(edit.weight) || 0, reps: parseInt(edit.reps) || 0, completed: true, timestamp: Date.now() });
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
  return (
    <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-bold text-accent-blue">{payload[0].value.toLocaleString()} lbs</p>
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
  const [activeTab, setActiveTab] = useState<'history' | 'volume' | 'strength'>('history');
  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>('volume');
  const [volumeGranularity, setVolumeGranularity] = useState<'session' | 'weekly'>('session');

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
            />
          ))}
        </div>
      )}

      {/* Volume tab */}
      {activeTab === 'volume' && (() => {
        const chartData = volumeGranularity === 'session' ? sessionMetrics : weeklyMetrics;
        const xKey = 'label';
        const { color } = VOLUME_METRIC_META[volumeMetric];
        const validData = chartData.filter((d) => d[volumeMetric] != null);
        return (
          <div className="space-y-3">
            {/* Metric chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {(Object.entries(VOLUME_METRIC_META) as [VolumeMetric, typeof VOLUME_METRIC_META[VolumeMetric]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setVolumeMetric(key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    volumeMetric === key
                      ? 'bg-accent-orange text-white'
                      : 'bg-surface-raised text-text-secondary border border-border'
                  }`}
                >
                  {meta.label}
                </button>
              ))}
            </div>

            {/* Chart card */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="label leading-none">
                    {VOLUME_METRIC_META[volumeMetric].label}
                    <span className="text-[10px] font-normal text-text-muted ml-1.5">({VOLUME_METRIC_META[volumeMetric].unit})</span>
                  </h4>
                  {volumeMetric === 'intensity' && (
                    <p className="text-[10px] text-text-muted mt-0.5">Volume ÷ workout time</p>
                  )}
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

              {validData.length > 1 ? (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    {volumeGranularity === 'weekly' ? (
                      <BarChart data={chartData}>
                        <XAxis dataKey={xKey} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={volumeMetric === 'volume' ? 50 : 30} domain={['auto', 'auto']} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length || payload[0].value == null) return null;
                          const { unit, color } = VOLUME_METRIC_META[volumeMetric];
                          const v = Number(payload[0].value);
                          const fmt = volumeMetric === 'volume' ? `${v.toLocaleString()} ${unit}` : `${v} ${unit}`;
                          return <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg"><p className="text-text-secondary mb-0.5">{label as string}</p><p className="font-bold" style={{ color }}>{fmt}</p></div>;
                        }} cursor={{ fill: 'rgba(232,87,42,0.08)' }} />
                        <Bar dataKey={volumeMetric} fill={color} radius={[4, 4, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    ) : (
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                        <XAxis dataKey={xKey} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={volumeMetric === 'volume' ? 50 : 30} domain={['auto', 'auto']} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length || payload[0].value == null) return null;
                          const { unit, color } = VOLUME_METRIC_META[volumeMetric];
                          const v = Number(payload[0].value);
                          const fmt = volumeMetric === 'volume' ? `${v.toLocaleString()} ${unit}` : `${v} ${unit}`;
                          return <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg"><p className="text-text-secondary mb-0.5">{label as string}</p><p className="font-bold" style={{ color }}>{fmt}</p></div>;
                        }} />
                        <Line type="monotone" dataKey={volumeMetric} stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} activeDot={{ fill: color, r: 5 }} connectNulls={false} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-text-secondary text-sm text-center py-8">
                  {volumeMetric === 'duration' || volumeMetric === 'intensity'
                    ? 'No duration data — workouts must be started and finished in the app'
                    : 'Complete more workouts to see trends'}
                </p>
              )}
            </div>
          </div>
        );
      })()}

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
                      {pr} <span className="text-sm font-normal text-text-muted">lbs</span>
                    </p>
                  </div>
                  {lastChange != null && lastChange !== 0 && (
                    <div className={`text-right text-sm font-semibold ${lastChange > 0 ? 'text-success' : 'text-danger'}`}>
                      {lastChange > 0 ? '+' : ''}{lastChange} lbs
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
                      <LineChart data={strengthData}>
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
