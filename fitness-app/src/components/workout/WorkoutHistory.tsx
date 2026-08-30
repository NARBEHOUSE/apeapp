import { useState, useMemo } from 'react';
import { useFontScale } from '../../utils/fontSize';
import { ChevronDown, ChevronUp, Calendar, TrendingUp, BarChart3, Share2, Trash2, Pencil, Check, SkipForward } from 'lucide-react';
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
import { estimateAdjustedOneRM } from '../../utils/progression';
import {
  buildExerciseNameMap,
  displayExerciseName,
  sessionTitle,
  sessionTag,
  sessionBadge,
} from '../../utils/workoutLibrary';
import {
  accumulateMuscleSets,
  buildExerciseMuscleMap,
  formatSets,
  avgRir,
  effortBand,
  HARD_SET_MAX_RIR,
  type MuscleSetCounts,
} from '../../utils/muscleVolume';

const BADGE_COLORS = [
  '#e8572a', '#f5a623', '#f5d623', '#2e9e6b',
  '#1a7a52', '#23b5d3', '#5b6ef5', '#3b44c4',
  '#c44fc4', '#e84393', '#ff6b6b', '#a855f7',
];

interface Props {
  sessions: WorkoutSession[];
  programs: Program[];
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSession?: (session: WorkoutSession) => void;
}

function SessionCard({
  session,
  program,
  exerciseNames,
  onDelete,
  onUpdate,
  weightUnit,
}: {
  session: WorkoutSession;
  program: Program | undefined;
  /** Exercise id → name, resolved from the session's own record first. */
  exerciseNames: Record<string, string>;
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
  const [editingBadge, setEditingBadge] = useState(false);
  const [badgeLabelValue, setBadgeLabelValue] = useState('');
  const [badgeColor, setBadgeColor] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');

  const day = program?.days.find((d) => d.id === session.dayId);
  const isSkipped = session.status === 'skipped';
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
  // A session with no endTime was never finished, so its duration is unknown. Measuring
  // against the current time instead would report the time elapsed since it started,
  // which keeps growing for abandoned sessions and changes on every re-render.
  const durationMin = session.endTime ? Math.round((session.endTime - session.startTime) / 60000) : null;
  const hasCardio = (session.cardio?.length ?? 0) > 0;
  const isCardioOnly = totalSets === 0 && hasCardio;
  const cardioTotalMin = session.cardio?.reduce((s, c) => s + c.durationMin, 0) ?? 0;

  // What the workout was called when it was done — not what the library calls it today.
  const displayTitle = sessionTitle(session, day, program);
  const badge = sessionBadge(session, day);

  const dateStr = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="card">
      <div className="w-full flex items-center gap-3 text-left">
        {isSkipped ? (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-dashed border-border-light text-text-muted">
            <SkipForward size={14} />
          </div>
        ) : (
          <button
            onClick={(e) => {
              if (!onUpdate) return;
              e.stopPropagation();
              setExpanded(true);
              setBadgeLabelValue(badge.label);
              setBadgeColor(badge.accent);
              setEditingBadge(true);
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold active:scale-95 transition-transform"
            style={{ backgroundColor: badge.accent }}
          >
            {badge.label}
          </button>
        )}
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
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 text-xs text-text-secondary text-left"
          >
            <span>{dateStr}</span>
            {isSkipped ? (
              <span className="text-text-muted">Skipped</span>
            ) : (
              <>
                {durationMin != null && (
                  <>
                    <span className="text-text-muted">|</span>
                    <span>{durationMin} min</span>
                  </>
                )}
                <span className="text-text-muted">|</span>
                {isCardioOnly ? (
                  <span>{session.cardio!.map((c) => c.type).join(', ')}</span>
                ) : (
                  <span>{totalSets} sets</span>
                )}
              </>
            )}
          </button>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-right flex-shrink-0"
        >
          <div className={`text-sm font-bold ${isSkipped ? 'text-text-muted' : 'text-accent-orange'}`}>
            {isSkipped
              ? 'Skipped'
              : isCardioOnly
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
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {editingBadge && (
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: badgeColor }}
                >
                  {badgeLabelValue || 'W'}
                </div>
                <input
                  autoFocus
                  className="input-field text-sm font-bold uppercase text-center flex-1"
                  maxLength={2}
                  value={badgeLabelValue}
                  onChange={(e) => setBadgeLabelValue(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="AB"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {BADGE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setBadgeColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${badgeColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBadge(false)}
                  className="flex-1 py-2 rounded-lg bg-surface border border-border text-xs font-medium text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onUpdate?.({ ...session, label: badgeLabelValue || undefined, accent: badgeColor || undefined });
                    setEditingBadge(false);
                  }}
                  className="flex-1 py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {Object.entries(session.sets).map(([exerciseId, sets]) => {
            if (deleteExercises.includes(exerciseId)) return null;
            const completedSets = sets.filter((s) => s.completed);
            if (completedSets.length === 0) return null;

            return (
              <div key={exerciseId}>
                <p className="text-xs font-semibold text-text-secondary mb-1">
                  {displayExerciseName(exerciseId, exerciseNames)}
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
                          <span className="text-[0.625rem] text-text-muted">×</span>
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
                      }} className="text-[0.5625rem] text-accent-blue font-semibold">+ Add Set</button>
                      <button onClick={() => {
                        setDeleteExercises((prev) => [...prev, exerciseId]);
                      }} className="text-[0.5625rem] text-danger font-semibold">Remove Exercise</button>
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

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-1.5">Notes</p>
            {editingNotes ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  className="w-full bg-surface-raised rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent-blue/40 border border-accent-blue/30"
                  rows={3}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Notes about this session…"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingNotes(false);
                    e.stopPropagation();
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex-1 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const trimmed = notesValue.trim();
                      onUpdate?.({ ...session, notes: trimmed || undefined });
                      setEditingNotes(false);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!onUpdate) return;
                  setNotesValue(session.notes || '');
                  setEditingNotes(true);
                }}
                className="w-full text-left bg-surface-raised rounded-lg px-3 py-2.5 border border-border-light flex items-start gap-2 active:scale-[0.99] transition-transform"
              >
                <span className={`text-xs flex-1 ${session.notes ? 'text-text-secondary italic' : 'text-text-muted'}`}>
                  {session.notes || 'Add notes about this session…'}
                </span>
                {onUpdate && <Pencil size={11} className="text-text-muted flex-shrink-0 mt-0.5" />}
              </button>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            {onUpdate && !isSkipped && (
              editing ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const updatedSets = { ...session.sets };

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
            {!isSkipped && (
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
            )}
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

interface HistorySearchable {
  /** The tag as the session recorded it, so filtering matches what is on screen. */
  tag: string;
  haystack: string;
}

function matchesHistoryFilters(e: HistorySearchable, term: string, tag: string): boolean {
  if (tag !== 'all' && e.tag !== tag) return false;
  const t = term.trim().toLowerCase();
  if (t && !e.haystack.includes(t)) return false;
  return true;
}

export function WorkoutHistory({ sessions, programs, onDeleteSession, onUpdateSession }: Props) {
  const fontScale = useFontScale();
  const weightUnit = getWeightUnit();
  const [activeTab, setActiveTab] = useState<'history' | 'volume' | 'strength'>('history');
  const [volumeGranularity, setVolumeGranularity] = useState<'session' | 'weekly'>('session');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => {
    const now = new Date();
    return new Set([`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`]);
  });

  // Skipped sessions carry no sets/volume — exclude them from analytics so they don't
  // show up as hollow zero-value data points; the raw `sessions` list (incl. skips) still
  // feeds the History tab feed below.
  const trainingSessions = useMemo(() => sessions.filter((s) => s.status !== 'skipped'), [sessions]);

  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [strengthMode, setStrengthMode] = useState<'weight' | 'index'>('weight');

  // Exercise → muscle group, from library entries plus each session's own manifest.
  const exerciseMuscleMap = useMemo(() => buildExerciseMuscleMap(programs, sessions), [programs, sessions]);

  // Per-session hard-set breakdown (last 30 sessions)
  const sessionMuscleMetrics = useMemo(() => {
    return trainingSessions
      .slice()
      .reverse()
      .slice(-30)
      .map((s) => ({
        label: new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        muscles: accumulateMuscleSets(s, exerciseMuscleMap, {}),
      }));
  }, [trainingSessions, exerciseMuscleMap]);

  // Per-week hard-set breakdown (last 12 weeks)
  const weeklyMuscleMetrics = useMemo(() => {
    const weeks: Record<string, { label: string; muscles: Record<string, MuscleSetCounts> }> = {};
    for (const s of trainingSessions) {
      const date = new Date(s.date + 'T00:00:00');
      const ws = new Date(date);
      ws.setDate(date.getDate() - date.getDay());
      const key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
      if (!weeks[key]) weeks[key] = { label: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), muscles: {} };
      accumulateMuscleSets(s, exerciseMuscleMap, weeks[key].muscles);
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, d]) => d);
  }, [trainingSessions, exerciseMuscleMap]);

  const volumeData = volumeGranularity === 'session' ? sessionMuscleMetrics : weeklyMuscleMetrics;

  // Muscles with data for the current granularity
  const availableMuscles = useMemo(() => {
    const muscles = new Set<string>();
    for (const d of volumeData) {
      for (const [m, c] of Object.entries(d.muscles)) {
        if (c.sets > 0) muscles.add(m);
      }
    }
    return [...muscles].sort();
  }, [volumeData]);

  // Effort logging is opt-in per program, so without a single RIR/RPE value there is
  // no way to tell a hard set from an easy one. Fall back to plain working-set counts
  // rather than showing a chart of zeroes.
  const hasEffortData = useMemo(
    () => volumeData.some((d) => Object.values(d.muscles).some((c) => c.rated > 0)),
    [volumeData],
  );
  const setMetric: keyof MuscleSetCounts = hasEffortData ? 'hard' : 'sets';
  const setLabel = hasEffortData ? 'hard sets' : 'working sets';

  const effectiveMuscle = (selectedMuscle && availableMuscles.includes(selectedMuscle))
    ? selectedMuscle
    : availableMuscles[0] ?? null;

  // Chart data for selected muscle
  const muscleChartData = useMemo(() => {
    return volumeData.map((d) => {
      const counts = effectiveMuscle ? d.muscles[effectiveMuscle] : undefined;
      return { label: d.label, value: Math.round((counts?.[setMetric] ?? 0) * 10) / 10 };
    });
  }, [volumeData, effectiveMuscle, setMetric]);

  // Muscle summary for the current period (for the breakdown list). Deliberately not
  // compared against the previous period: on a split, consecutive sessions train
  // different muscles, so a session-over-session delta mostly reports which day of the
  // rotation it was rather than any real change.
  const muscleSummary = useMemo(() => {
    const recent = volumeData.slice(-1)[0]?.muscles || {};
    return availableMuscles.map((m) => {
      const counts = recent[m];
      return {
        muscle: m,
        value: counts?.[setMetric] ?? 0,
        sets: counts?.sets ?? 0,
        volume: counts?.volume ?? 0,
        rir: counts ? avgRir(counts) : null,
      };
    }).sort((a, b) => b.value - a.value || b.sets - a.sets);
  }, [availableMuscles, volumeData, setMetric]);

  // Tonnage is kept purely as a "nice to see" figure alongside the set counts.
  const selectedTonnage = muscleSummary.find((m) => m.muscle === effectiveMuscle)?.volume ?? 0;

  // Bars are scaled relative to the biggest mover, so they compare muscles against each
  // other rather than against a target the app has no basis to set.
  const summaryScaleMax = useMemo(
    () => Math.max(...muscleSummary.map((d) => (hasEffortData ? d.sets : d.value)), 1),
    [muscleSummary, hasEffortData],
  );

  const exerciseNameMap = useMemo(
    () => buildExerciseNameMap(programs, sessions),
    [programs, sessions],
  );

  const exerciseList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of trainingSessions) {
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
  }, [trainingSessions, exerciseNameMap]);

  const effectiveExId = useMemo(() => {
    if (selectedExId && exerciseList.some((e) => e.id === selectedExId)) return selectedExId;
    return exerciseList[0]?.id ?? null;
  }, [selectedExId, exerciseList]);

  const strengthData = useMemo(() => {
    if (!effectiveExId) return [];
    return trainingSessions
      .slice()
      .reverse()
      .filter((s) => s.sets[effectiveExId]?.some((st) => st.completed && !st.isWarmup && st.weight > 0 && st.reps > 0))
      .slice(-30)
      .map((s) => {
        const sets = s.sets[effectiveExId].filter((st) => st.completed && !st.isWarmup && st.weight > 0 && st.reps > 0);
        const maxWeight = Math.max(...sets.map((st) => st.weight));
        // Best effort-adjusted 1RM across all working sets, not just the heaviest-weight
        // one — a lighter set taken closer to failure can reflect more true strength
        // than a heavier set with reps left in the tank.
        const strengthIndex = Math.max(...sets.map((st) => estimateAdjustedOneRM(st.weight, st.reps, st.rir, st.rpe)));
        return {
          date: new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          maxWeight,
          strengthIndex,
        };
      });
  }, [trainingSessions, effectiveExId]);

  const displayKey = strengthMode === 'weight' ? 'maxWeight' : 'strengthIndex';
  const pr = strengthData.length > 0 ? Math.max(...strengthData.map((d) => d[displayKey])) : null;
  const lastChange = strengthData.length >= 2
    ? strengthData[strengthData.length - 1][displayKey] - strengthData[strengthData.length - 2][displayKey]
    : null;
  // Convert strength data from stored lbs to display unit for correct chart scaling
  const displayStrengthData = strengthData.map((d) => ({
    date: d.date,
    maxWeight: toDisplayWeight(d.maxWeight, weightUnit),
    strengthIndex: toDisplayWeight(d.strengthIndex, weightUnit),
  }));

  const programMap = useMemo(() => {
    const map: Record<string, Program> = {};
    for (const p of programs) map[p.id] = p;
    return map;
  }, [programs]);

  // History tab: per-session metadata for search/filter/month-grouping
  const enrichedSessions = useMemo(() => sessions.map((s) => {
    const program = programMap[s.programId];
    const day = program?.days.find((d) => d.id === s.dayId);
    const date = new Date(s.date + 'T00:00:00');
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const displayTitle = sessionTitle(s, day, program);
    const haystack = [displayTitle, sessionTag(s, day), monthLabel,
      date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })]
      .filter(Boolean).join(' ').toLowerCase();
    return { session: s, program, day, tag: sessionTag(s, day), monthKey, monthLabel, haystack };
  }), [sessions, programMap]);

  const availableHistoryTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of enrichedSessions) if (e.tag) set.add(e.tag);
    return Array.from(set);
  }, [enrichedSessions]);

  const filteredHistory = useMemo(
    () => enrichedSessions.filter((e) => matchesHistoryFilters(e, historySearch, historyTypeFilter)),
    [enrichedSessions, historySearch, historyTypeFilter],
  );

  const historyMonthGroups = useMemo(() => {
    const groups: { key: string; label: string; items: typeof enrichedSessions }[] = [];
    const indexByKey: Record<string, number> = {};
    for (const item of filteredHistory) {
      if (!(item.monthKey in indexByKey)) {
        indexByKey[item.monthKey] = groups.length;
        groups.push({ key: item.monthKey, label: item.monthLabel, items: [] });
      }
      groups[indexByKey[item.monthKey]].items.push(item);
    }
    return groups;
  }, [filteredHistory]);

  // Auto-expand (one-way ratchet) any month containing a match when a search/filter is active,
  // so an active filter never hides a result behind a still-collapsed month.
  function handleHistorySearchChange(value: string) {
    setHistorySearch(value);
    if (value.trim() || historyTypeFilter !== 'all') {
      const matches = enrichedSessions.filter((e) => matchesHistoryFilters(e, value, historyTypeFilter));
      setOpenMonths((prev) => new Set([...prev, ...matches.map((m) => m.monthKey)]));
    }
  }

  function handleHistoryTypeFilterChange(tag: string) {
    setHistoryTypeFilter(tag);
    if (historySearch.trim() || tag !== 'all') {
      const matches = enrichedSessions.filter((e) => matchesHistoryFilters(e, historySearch, tag));
      setOpenMonths((prev) => new Set([...prev, ...matches.map((m) => m.monthKey)]));
    }
  }

  function toggleHistoryMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
        <div className="space-y-3">
          {sessions.length > 10 && (
            <input
              type="text"
              className="input-field text-xs"
              placeholder="Search workouts…"
              value={historySearch}
              onChange={(e) => handleHistorySearchChange(e.target.value)}
            />
          )}

          {availableHistoryTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                onClick={() => handleHistoryTypeFilterChange('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  historyTypeFilter === 'all' ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-secondary border border-border'
                }`}
              >
                All
              </button>
              {availableHistoryTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleHistoryTypeFilterChange(tag)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    historyTypeFilter === tag ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-secondary border border-border'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {historyMonthGroups.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">No workouts match your search.</p>
          ) : (
            <div className="space-y-3">
              {historyMonthGroups.map((group) => {
                const isOpen = openMonths.has(group.key);
                return (
                  <div key={group.key}>
                    <button onClick={() => toggleHistoryMonth(group.key)} className="w-full flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-secondary">
                        {group.label} <span className="text-text-muted font-normal">({group.items.length})</span>
                      </span>
                      {isOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                    </button>
                    {isOpen && (
                      <div className="space-y-2">
                        {group.items.map(({ session, program }) => (
                          <SessionCard
                            exerciseNames={exerciseNameMap}
                            key={session.id}
                            session={session}
                            program={program}
                            onDelete={onDeleteSession}
                            onUpdate={onUpdateSession}
                            weightUnit={weightUnit}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                      {effectiveMuscle} {hasEffortData ? 'Hard Sets' : 'Working Sets'}
                    </h4>
                    <p className="text-[0.625rem] text-text-muted mt-0.5">
                      {hasEffortData
                        ? `Sets within ${HARD_SET_MAX_RIR} reps of failure per ${volumeGranularity === 'session' ? 'session' : 'week'}`
                        : `Completed working sets per ${volumeGranularity === 'session' ? 'session' : 'week'}`}
                      {selectedTonnage > 0 && ` · ${toDisplayWeight(selectedTonnage, weightUnit).toLocaleString()} ${weightUnit} moved`}
                    </p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <button
                      onClick={() => setVolumeGranularity('session')}
                      className={`px-2.5 py-1 text-[0.625rem] font-semibold transition-colors ${volumeGranularity === 'session' ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Session
                    </button>
                    <button
                      onClick={() => setVolumeGranularity('weekly')}
                      className={`px-2.5 py-1 text-[0.625rem] font-semibold transition-colors ${volumeGranularity === 'weekly' ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>

                {muscleChartData.filter((d) => d.value > 0).length > 1 ? (
                  volumeGranularity === 'weekly' ? (
                    <SVGBarChart
                      key={`${effectiveMuscle}-weekly`}
                      data={muscleChartData}
                      color="#e8572a"
                      height={208}
                      yAxisWidth={28}
                      formatY={(v) => String(Math.round(v))}
                      formatValue={(v) => `${formatSets(v)} ${setLabel}`}
                    />
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={muscleChartData}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: Math.round(10 * fontScale) }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: Math.round(10 * fontScale) }} axisLine={false} tickLine={false} width={28} domain={[0, 'auto']} allowDecimals={false} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg"><p className="text-text-secondary mb-0.5">{label as string}</p><p className="font-bold text-accent-orange">{formatSets(Number(payload[0].value))} {setLabel}</p></div>;
                          }} />
                          <Line type="monotone" dataKey="value" stroke="#e8572a" strokeWidth={2} dot={{ fill: '#e8572a', r: 3 }} activeDot={{ fill: '#e8572a', r: 5 }} connectNulls={false} />
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
                  <p className="text-[0.625rem] text-text-muted -mt-1">
                    {hasEffortData ? 'Hard sets and average reps in reserve' : 'Working sets'} this {volumeGranularity === 'session' ? 'session' : 'week'}
                  </p>
                  {muscleSummary.map((m) => {
                    const pct = Math.min(100, (m.value / summaryScaleMax) * 100);
                    // Faded tail = sets that were logged but left too far from failure to count.
                    const tailPct = hasEffortData ? Math.min(100, (m.sets / summaryScaleMax) * 100) - pct : 0;
                    const band = m.rir != null ? effortBand(m.rir) : null;
                    const barColor = effectiveMuscle === m.muscle ? '#e8572a' : 'var(--color-border-light)';
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
                            {formatSets(m.value)}
                            {hasEffortData && m.sets > m.value ? `/${formatSets(m.sets)}` : ''} sets
                            {m.rir != null && (
                              <span className={`ml-1.5 ${band === 'productive' ? 'text-green-500' : band === 'failure' ? 'text-[#f5a623]' : 'text-text-muted'}`}>
                                {m.rir.toFixed(1)} RIR
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex h-1.5 rounded-full bg-surface-raised overflow-hidden">
                          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                          {tailPct > 0 && (
                            <div className="h-full transition-all opacity-40" style={{ width: `${tailPct}%`, backgroundColor: barColor }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!hasEffortData && (
                    <p className="text-[0.625rem] text-text-muted pt-1.5 mt-1 border-t border-border">
                      Turn on RIR or RPE tracking in your program to separate hard sets from easy ones.
                    </p>
                  )}
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
                    <p className="text-[0.625rem] text-text-muted uppercase tracking-wide">All-Time PR</p>
                    <p className="text-2xl font-bold text-accent-blue">
                      {toDisplayWeight(pr!, weightUnit)} <span className="text-sm font-normal text-text-muted">{weightUnit}</span>
                    </p>
                  </div>
                  {lastChange != null && lastChange !== 0 && (
                    <div className={`text-right text-sm font-semibold ${lastChange > 0 ? 'text-success' : 'text-danger'}`}>
                      {lastChange > 0 ? '+' : ''}{toDisplayWeight(lastChange, weightUnit)} {weightUnit}
                      <p className="text-[0.625rem] font-normal text-text-muted">vs last session</p>
                    </div>
                  )}
                </div>
              )}

              {/* Chart */}
              <div className="card">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="label">{strengthMode === 'weight' ? 'Max Weight' : 'Strength Index'} per Session</h4>
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <button
                      onClick={() => setStrengthMode('weight')}
                      className={`px-2.5 py-1 text-[0.625rem] font-semibold transition-colors ${strengthMode === 'weight' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Max
                    </button>
                    <button
                      onClick={() => setStrengthMode('index')}
                      className={`px-2.5 py-1 text-[0.625rem] font-semibold transition-colors ${strengthMode === 'index' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                    >
                      Index
                    </button>
                  </div>
                </div>
                <p className="text-[0.625rem] text-text-muted mb-3">
                  {strengthMode === 'index'
                    ? 'Estimated 1RM, adjusted for reps and how hard each set was (RIR/RPE, when logged)'
                    : 'Heaviest working set logged each session'}
                </p>
                {strengthData.length > 1 ? (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displayStrengthData}>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'var(--color-text-muted)', fontSize: Math.round(10 * fontScale) }}
                          axisLine={{ stroke: 'var(--color-border)' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: 'var(--color-text-muted)', fontSize: Math.round(10 * fontScale) }}
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
