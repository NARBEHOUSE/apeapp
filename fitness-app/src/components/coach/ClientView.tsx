import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ArrowLeft, Send, Dumbbell, Utensils, TrendingUp, Target,
  ChevronDown, ChevronUp, Calendar, Plus, Trash2, Check, X, MessageSquare, Heart, RefreshCw,
} from 'lucide-react';
import type { PendingCoachChanges, CoachChangeItem, PendingClientResponse, CoachPhotoMeta, Program, MacroTargets } from '../../types';
import { ProgramEditor } from '../workout/ProgramEditor';
import { drivePhotoUrl } from '../../utils/googleDrive';
import { toast } from '../shared/Toast';

interface ClientData {
  profile: {
    name?: string;
    goal?: string;
    macroTargets?: MacroTargets;
    bodyStats?: { gender?: string; age?: number; heightCm?: number; weightKg?: number; activityLevel?: string; fitnessGoal?: string };
    tdee?: number;
    activeProgram?: { programId: string; startDate: string };
  };
  workoutSessions: { id: string; date: string; dayId: string; programId: string; startTime: number; endTime?: number; sets: Record<string, { weight: number; reps: number; completed: boolean }[]>; notes?: string; bodyweight?: number; cardio?: { type: string; durationMin: number; intensity?: string }[] }[];
  foodEntries: { id: string; date: string; name: string; calories: number; protein: number; carbs: number; fat: number; servingsConsumed: number; mealType: string; loggedAt: string }[];
  measurements: { id: string; date: string; weight?: number; weightUnit: string; measurements?: Record<string, number> }[];
  progressPhotos: { id: string; date: string; pose: string; imageData: string; weight?: number }[];
  photoMeta?: CoachPhotoMeta[];
  photoFolderId?: string;
  programs: Program[];
  pendingChanges?: PendingCoachChanges | null;
  clientResponse?: PendingClientResponse | null;
}

interface Props {
  data: ClientData;
  fileId: string;
  onPushChanges: (fileId: string, changes: PendingCoachChanges) => Promise<boolean>;
  onCheckClientResponse: (fileId: string) => Promise<PendingClientResponse | null>;
  onAcknowledgeResponse: (fileId: string) => Promise<void>;
  onRefresh: (fileId: string) => Promise<ClientData | null>;
  onClose: () => void;
  coachEmail?: string;
}

export function ClientView({ data: initialData, fileId, onPushChanges, onCheckClientResponse, onAcknowledgeResponse, onRefresh, onClose, coachEmail }: Props) {
  const [data, setData] = useState<ClientData>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'workouts' | 'nutrition' | 'progress' | 'programs' | 'responses'>('overview');
  const [editProtein, setEditProtein] = useState(String(data.profile.macroTargets?.protein || ''));
  const [editCarbs, setEditCarbs] = useState(String(data.profile.macroTargets?.carbs || ''));
  const [editFat, setEditFat] = useState(String(data.profile.macroTargets?.fat || ''));

  useEffect(() => {
    setEditProtein(String(data.profile.macroTargets?.protein || ''));
    setEditCarbs(String(data.profile.macroTargets?.carbs || ''));
    setEditFat(String(data.profile.macroTargets?.fat || ''));
  }, [data.profile.macroTargets?.protein, data.profile.macroTargets?.carbs, data.profile.macroTargets?.fat]);

  const [macroNote, setMacroNote] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [pushing, setPushing] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);

  // Staging system
  const [stagedChanges, setStagedChanges] = useState<CoachChangeItem[]>([]);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [programNote, setProgramNote] = useState('');

  // Client responses
  const [responses, setResponses] = useState<PendingClientResponse | null>(data.clientResponse || null);

  const editCalories = (parseInt(editProtein) || 0) * 4 + (parseInt(editCarbs) || 0) * 4 + (parseInt(editFat) || 0) * 9;

  const recentWorkouts = useMemo(() =>
    [...data.workoutSessions].sort((a, b) => b.startTime - a.startTime).slice(0, 20),
  [data.workoutSessions]);

  const today = new Date().toISOString().split('T')[0];
  const todayFood = useMemo(() => data.foodEntries.filter((f) => f.date === today), [data.foodEntries, today]);
  const todayTotals = useMemo(() =>
    todayFood.reduce((acc, f) => ({
      calories: acc.calories + f.calories * f.servingsConsumed,
      protein: acc.protein + f.protein * f.servingsConsumed,
      carbs: acc.carbs + f.carbs * f.servingsConsumed,
      fat: acc.fat + f.fat * f.servingsConsumed,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 }),
  [todayFood]);

  const recentMeasurements = useMemo(() =>
    [...data.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
  [data.measurements]);

  // Stage macro changes
  function handleStageMacros() {
    const protein = parseInt(editProtein) || 0;
    const carbs = parseInt(editCarbs) || 0;
    const fat = parseInt(editFat) || 0;
    if (!protein && !carbs && !fat) { toast('Enter macros', 'error'); return; }
    setStagedChanges((prev) => [
      ...prev.filter((c) => c.type !== 'macros'),
      {
        id: crypto.randomUUID(),
        type: 'macros',
        label: `Macros: ${protein}p / ${carbs}c / ${fat}f (${protein * 4 + carbs * 4 + fat * 9} cal)`,
        data: { calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat },
        coachNote: macroNote.trim() || undefined,
      },
    ]);
    setMacroNote('');
    toast('Macro changes staged', 'success');
  }

  // Stage a general note
  function handleStageNote() {
    if (!generalNote.trim()) return;
    setStagedChanges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: 'note', label: 'Coach Note', data: generalNote.trim() },
    ]);
    setGeneralNote('');
    toast('Note staged', 'success');
  }

  // Stage a program edit (called from ProgramEditor onSave)
  const handleSaveProgram = useCallback((modifiedProgram: Program) => {
    setStagedChanges((prev) => [
      ...prev.filter((c) => !(c.type === 'program' && (c.data as Program).id === modifiedProgram.id)),
      {
        id: crypto.randomUUID(),
        type: 'program',
        label: `Program: ${modifiedProgram.name}`,
        data: modifiedProgram,
        coachNote: programNote.trim() || undefined,
      },
    ]);
    setEditingProgram(null);
    setProgramNote('');
    toast('Program changes staged', 'success');
  }, [programNote]);

  // Push all staged changes
  async function handlePushAll() {
    if (stagedChanges.length === 0) return;
    setPushing(true);
    const changes: PendingCoachChanges = {
      items: stagedChanges,
      pushedAt: new Date().toISOString(),
      coachEmail,
    };
    const ok = await onPushChanges(fileId, changes);
    setPushing(false);
    if (ok) {
      setStagedChanges([]);
      toast('All changes pushed to client', 'success');
    } else {
      toast('Failed to push changes', 'error');
    }
  }

  // Check for client responses
  async function handleCheckResponses() {
    const resp = await onCheckClientResponse(fileId);
    setResponses(resp);
    if (resp) setTab('responses');
    else toast('No new responses', 'success');
  }

  async function handleRefresh() {
    setRefreshing(true);
    const fresh = await onRefresh(fileId);
    if (fresh) {
      setData(fresh);
      setResponses(fresh.clientResponse || null);
      toast('Client data refreshed', 'success');
    } else {
      toast('Failed to refresh', 'error');
    }
    setRefreshing(false);
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Target },
    { key: 'workouts' as const, label: 'Workouts', icon: Dumbbell },
    { key: 'nutrition' as const, label: 'Nutrition', icon: Utensils },
    { key: 'progress' as const, label: 'Progress', icon: TrendingUp },
    { key: 'programs' as const, label: 'Programs', icon: Calendar },
    ...(responses ? [{ key: 'responses' as const, label: 'Responses', icon: MessageSquare }] : []),
  ];

  // If editing a program, show the ProgramEditor full-screen
  if (editingProgram) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
          <button onClick={() => setEditingProgram(null)} className="p-1 -ml-1"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Editing: {editingProgram.name}</div>
            <div className="text-[10px] opacity-80">Changes will be staged, not applied directly</div>
          </div>
        </div>
        <div className="p-4">
          <input className="input-field text-sm mb-3" placeholder="Note about program changes (optional)" value={programNote} onChange={(e) => setProgramNote(e.target.value)} />
        </div>
        <ProgramEditor
          program={editingProgram}
          fitnessGoal={(data.profile.bodyStats?.fitnessGoal as 'lose' | 'maintain' | 'build') || 'maintain'}
          onSave={handleSaveProgram}
          onClose={() => setEditingProgram(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Coach mode banner */}
      <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
        <button onClick={onClose} className="p-1 -ml-1"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Coach Mode — {data.profile.name || 'Client'}</div>
          <div className="text-[10px] opacity-80">Stage changes, then push all at once</div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 rounded-lg bg-white/20">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button onClick={handleCheckResponses} className="px-2 py-1 rounded-lg bg-white/20 text-[10px] font-medium">
          Responses
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface sticky top-[52px] z-20 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[10px] font-medium flex flex-col items-center gap-0.5 transition-colors min-w-[60px] ${
              tab === t.key ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-32">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <>
            <div className="card p-4 space-y-3">
              <h3 className="text-lg font-bold">{data.profile.name}</h3>
              <div className="text-xs text-text-muted">Goal: {data.profile.goal || '-'}</div>
              {data.profile.bodyStats && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Age', value: data.profile.bodyStats.age },
                    { label: 'Height', value: data.profile.bodyStats.heightCm ? `${Math.round(data.profile.bodyStats.heightCm)} cm` : '-' },
                    { label: 'Weight', value: data.profile.bodyStats.weightKg ? `${Math.round(data.profile.bodyStats.weightKg * 2.205)} lbs` : '-' },
                    { label: 'TDEE', value: data.profile.tdee || '-' },
                  ].map((s) => (
                    <div key={s.label} className="bg-surface-raised rounded-lg p-2">
                      <div className="text-[9px] text-text-muted uppercase">{s.label}</div>
                      <div className="text-sm font-semibold">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {data.profile.macroTargets && (
                <div className="bg-surface-raised rounded-xl p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Current Targets</div>
                  <div className="text-xl font-bold">{data.profile.macroTargets.calories} cal</div>
                  <div className="flex gap-3 text-xs text-text-secondary mt-1">
                    <span>P {data.profile.macroTargets.protein}g</span>
                    <span>C {data.profile.macroTargets.carbs}g</span>
                    <span>F {data.profile.macroTargets.fat}g</span>
                  </div>
                </div>
              )}
            </div>

            {/* Today's intake */}
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Today's Intake</div>
              <div className="text-xl font-bold">{Math.round(todayTotals.calories)} cal</div>
              <div className="flex gap-3 text-xs text-text-secondary">
                <span>P {Math.round(todayTotals.protein)}g</span>
                <span>C {Math.round(todayTotals.carbs)}g</span>
                <span>F {Math.round(todayTotals.fat)}g</span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: data.workoutSessions.length, l: 'Workouts' },
                { v: data.foodEntries.length, l: 'Food Logs' },
                { v: data.measurements.length, l: 'Weigh-ins' },
              ].map((s) => (
                <div key={s.l} className="card p-3 text-center">
                  <div className="text-lg font-bold">{s.v}</div>
                  <div className="text-[9px] text-text-muted uppercase">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Stage macro changes */}
            <div className="card p-4 space-y-3 border-2 border-accent-blue/20">
              <div className="text-xs font-semibold text-accent-blue uppercase tracking-wider">Macro Changes</div>
              <div className="bg-surface-raised rounded-xl p-3 text-center">
                <div className="text-xl font-semibold">{editCalories}</div>
                <div className="text-[9px] text-text-muted">calories (auto-calculated)</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-text-muted block mb-0.5">Protein</label>
                  <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editProtein} onChange={(e) => setEditProtein(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-text-muted block mb-0.5">Carbs</label>
                  <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editCarbs} onChange={(e) => setEditCarbs(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-text-muted block mb-0.5">Fat</label>
                  <input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editFat} onChange={(e) => setEditFat(e.target.value)} />
                </div>
              </div>
              <input className="input-field text-sm" placeholder="Note about macro change (optional)" value={macroNote} onChange={(e) => setMacroNote(e.target.value)} />
              <button onClick={handleStageMacros} className="btn-secondary w-full text-sm flex items-center justify-center gap-1.5">
                <Plus size={14} /> Stage Macro Changes
              </button>
            </div>

            {/* General note */}
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Leave a Note</div>
              <textarea className="input-field text-sm w-full resize-none" rows={2} placeholder="Feedback, instructions, encouragement..." value={generalNote} onChange={(e) => setGeneralNote(e.target.value)} />
              <button onClick={handleStageNote} disabled={!generalNote.trim()} className="btn-secondary w-full text-sm disabled:opacity-30 flex items-center justify-center gap-1.5">
                <MessageSquare size={14} /> Stage Note
              </button>
            </div>
          </>
        )}

        {/* WORKOUTS */}
        {tab === 'workouts' && (
          <>
            {recentWorkouts.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No workouts recorded</p>
            ) : recentWorkouts.map((w) => {
              const setCount = Object.values(w.sets).reduce((a, s) => a + s.filter((x) => x.completed).length, 0);
              const dur = w.endTime ? Math.round((w.endTime - w.startTime) / 60000) : null;
              const isExpanded = expandedWorkout === w.id;
              return (
                <div key={w.id} className="card overflow-hidden">
                  <button onClick={() => setExpandedWorkout(isExpanded ? null : w.id)} className="w-full p-3 flex items-center justify-between text-left">
                    <div>
                      <div className="text-sm font-medium">{w.date}</div>
                      <div className="text-xs text-text-muted">
                        {setCount} sets{dur ? ` · ${dur} min` : ''}{w.bodyweight ? ` · ${w.bodyweight} lbs` : ''}
                      </div>
                      {w.cardio && w.cardio.length > 0 && (
                        <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                          <Heart size={10} /> {w.cardio.map((c) => `${c.type} ${c.durationMin}min`).join(', ')}
                        </div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-1 border-t border-border pt-2">
                      {Object.entries(w.sets).map(([exId, sets]) => {
                        const completed = sets.filter((s) => s.completed);
                        if (completed.length === 0) return null;
                        return (
                          <div key={exId} className="text-xs">
                            <span className="text-text-muted">{completed.map((s) => `${s.weight}×${s.reps}`).join(', ')}</span>
                          </div>
                        );
                      })}
                      {w.notes && <div className="text-[10px] text-text-muted italic">{w.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* NUTRITION */}
        {tab === 'nutrition' && (
          <>
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Today</div>
              <div className="text-xl font-bold">{Math.round(todayTotals.calories)} cal</div>
              <div className="flex gap-3 text-xs text-text-secondary">
                <span>P {Math.round(todayTotals.protein)}g</span>
                <span>C {Math.round(todayTotals.carbs)}g</span>
                <span>F {Math.round(todayTotals.fat)}g</span>
              </div>
            </div>
            {todayFood.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No food logged today</p>
            ) : todayFood.map((f) => (
              <div key={f.id} className="card p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-xs text-text-muted capitalize">{f.mealType}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{Math.round(f.calories * f.servingsConsumed)} cal</div>
                  <div className="text-[10px] text-text-muted">
                    {Math.round(f.protein * f.servingsConsumed)}p · {Math.round(f.carbs * f.servingsConsumed)}c · {Math.round(f.fat * f.servingsConsumed)}f
                  </div>
                </div>
              </div>
            ))}
            {/* 7-day avg */}
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Last 7 Days Avg</div>
              {(() => {
                const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; });
                const dayData = last7.map((date) => data.foodEntries.filter((f) => f.date === date).reduce((a, f) => ({ cal: a.cal + f.calories * f.servingsConsumed, p: a.p + f.protein * f.servingsConsumed, c: a.c + f.carbs * f.servingsConsumed, f: a.f + f.fat * f.servingsConsumed }), { cal: 0, p: 0, c: 0, f: 0 }));
                const tracked = dayData.filter((d) => d.cal > 0);
                if (tracked.length === 0) return <p className="text-xs text-text-muted">No data</p>;
                const avg = { cal: Math.round(tracked.reduce((a, d) => a + d.cal, 0) / tracked.length), p: Math.round(tracked.reduce((a, d) => a + d.p, 0) / tracked.length), c: Math.round(tracked.reduce((a, d) => a + d.c, 0) / tracked.length), f: Math.round(tracked.reduce((a, d) => a + d.f, 0) / tracked.length) };
                return (<><div className="text-xl font-bold">{avg.cal} cal/day</div><div className="flex gap-3 text-xs text-text-secondary"><span>P {avg.p}g</span><span>C {avg.c}g</span><span>F {avg.f}g</span></div><div className="text-[10px] text-text-muted">{tracked.length} days tracked</div></>);
              })()}
            </div>
          </>
        )}

        {/* PROGRESS */}
        {tab === 'progress' && (
          <>
            {recentMeasurements.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No measurements recorded</p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Weight History</div>
                {recentMeasurements.filter((m) => m.weight).map((m) => (
                  <div key={m.id} className="card p-3 flex items-center justify-between">
                    <span className="text-sm text-text-muted">{m.date}</span>
                    <span className="text-sm font-semibold">{m.weight} {m.weightUnit}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Drive-hosted photos */}
            {data.photoMeta && data.photoMeta.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Progress Photos</div>
                <div className="grid grid-cols-3 gap-2">
                  {data.photoMeta.map((p) => (
                    <div key={p.photoId} className="relative rounded-xl overflow-hidden aspect-square bg-surface-raised">
                      <img src={drivePhotoUrl(p.driveFileId)} alt={p.pose} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[8px] text-white">
                        {p.date} · {p.pose}{p.weight ? ` · ${p.weight}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(!data.photoMeta || data.photoMeta.length === 0) && data.progressPhotos.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Progress Photos</div>
                <p className="text-xs text-text-muted">Photos will appear after client syncs from their Dashboard.</p>
              </div>
            )}
          </>
        )}

        {/* PROGRAMS */}
        {tab === 'programs' && (
          <>
            {data.programs.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No custom programs</p>
            ) : data.programs.map((prog) => (
              <div key={prog.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{prog.name}</div>
                    <div className="text-xs text-text-muted">{prog.days.length} days · {prog.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                  </div>
                  <button
                    onClick={() => setEditingProgram(prog)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-accent-blue/10 text-accent-blue"
                  >
                    Edit
                  </button>
                </div>
                {prog.days.map((day) => (
                  <div key={day.id} className="pl-3 border-l-2 border-border space-y-0.5">
                    <div className="text-xs font-medium">{day.title}</div>
                    {day.exercises.map((ex, i) => (
                      <div key={i} className="text-[10px] text-text-muted">
                        {ex.name} — {ex.sets}×{ex.reps}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* RESPONSES */}
        {tab === 'responses' && responses && (
          <>
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Client Responses</div>
            <div className="text-[10px] text-text-muted mb-2">
              Responded: {new Date(responses.respondedAt).toLocaleString()}
            </div>
            {responses.responses.map((resp) => (
              <div key={resp.itemId} className={`card p-3 space-y-1 border-l-4 ${resp.action === 'accepted' ? 'border-l-success' : 'border-l-danger'}`}>
                <div className="flex items-center gap-2">
                  {resp.action === 'accepted' ? <Check size={14} className="text-success" /> : <X size={14} className="text-danger" />}
                  <span className="text-sm font-medium capitalize">{resp.action}</span>
                </div>
                {resp.clientNote && (
                  <div className="text-xs text-text-secondary bg-surface-raised rounded-lg p-2 italic">
                    "{resp.clientNote}"
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={async () => { await onAcknowledgeResponse(fileId); setResponses(null); setTab('overview'); toast('Responses acknowledged', 'success'); }}
              className="btn-primary w-full text-sm mt-2"
            >
              Acknowledge
            </button>
          </>
        )}
      </div>

      {/* Staged changes floating bar */}
      {stagedChanges.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{stagedChanges.length} change{stagedChanges.length > 1 ? 's' : ''} staged</div>
              <div className="text-[10px] text-text-muted">
                {stagedChanges.map((c) => c.type).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
              </div>
            </div>
            <button onClick={() => setStagedChanges([])} className="text-[10px] text-text-muted">Clear</button>
          </div>
          {/* Preview staged items */}
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {stagedChanges.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs bg-surface-raised rounded-lg px-2 py-1">
                <span className="truncate">{c.label}</span>
                <button onClick={() => setStagedChanges((prev) => prev.filter((x) => x.id !== c.id))} className="text-text-muted hover:text-danger ml-2"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
          <button onClick={handlePushAll} disabled={pushing} className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Send size={14} /> {pushing ? 'Pushing...' : 'Push All to Client'}
          </button>
        </div>
      )}
    </div>
  );
}
