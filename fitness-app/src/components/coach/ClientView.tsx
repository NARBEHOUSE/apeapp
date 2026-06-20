import { useState, useMemo } from 'react';
import {
  ArrowLeft, Send, Dumbbell, Utensils, TrendingUp, Target,
  ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import type { PendingCoachChanges } from '../../types';
import { toast } from '../shared/Toast';

interface ClientData {
  profile: {
    name?: string;
    goal?: string;
    macroTargets?: { calories: number; protein: number; carbs: number; fat: number };
    bodyStats?: { gender?: string; age?: number; heightCm?: number; weightKg?: number; activityLevel?: string; fitnessGoal?: string };
    tdee?: number;
    activeProgram?: { programId: string; startDate: string };
  };
  workoutSessions: { id: string; date: string; dayId: string; programId: string; startTime: number; endTime?: number; sets: Record<string, { weight: number; reps: number; completed: boolean }[]>; notes?: string; bodyweight?: number; cardio?: { type: string; durationMin: number; intensity?: string }[] }[];
  foodEntries: { id: string; date: string; name: string; calories: number; protein: number; carbs: number; fat: number; servingsConsumed: number; mealType: string; loggedAt: string }[];
  measurements: { id: string; date: string; weight?: number; weightUnit: string; measurements?: Record<string, number> }[];
  progressPhotos: { id: string; date: string; pose: string; imageData: string; weight?: number }[];
  programs: { id: string; name: string; days: { id: string; title: string; exercises: { name: string; sets: number; reps: string }[] }[] }[];
  pendingChanges?: PendingCoachChanges | null;
}

interface Props {
  data: ClientData;
  fileId: string;
  onPushChanges: (fileId: string, changes: PendingCoachChanges) => Promise<boolean>;
  onClose: () => void;
}

export function ClientView({ data, fileId, onPushChanges, onClose }: Props) {
  const [tab, setTab] = useState<'overview' | 'workouts' | 'nutrition' | 'progress' | 'programs'>('overview');
  const [editProtein, setEditProtein] = useState(String(data.profile.macroTargets?.protein || ''));
  const [editCarbs, setEditCarbs] = useState(String(data.profile.macroTargets?.carbs || ''));
  const [editFat, setEditFat] = useState(String(data.profile.macroTargets?.fat || ''));
  const [coachNote, setCoachNote] = useState('');
  const [pushing, setPushing] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);

  const editCalories = (parseInt(editProtein) || 0) * 4 + (parseInt(editCarbs) || 0) * 4 + (parseInt(editFat) || 0) * 9;

  const recentWorkouts = useMemo(() =>
    [...data.workoutSessions].sort((a, b) => b.startTime - a.startTime).slice(0, 20),
  [data.workoutSessions]);

  const today = new Date().toISOString().split('T')[0];
  const todayFood = useMemo(() =>
    data.foodEntries.filter((f) => f.date === today),
  [data.foodEntries, today]);

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

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Target },
    { key: 'workouts' as const, label: 'Workouts', icon: Dumbbell },
    { key: 'nutrition' as const, label: 'Nutrition', icon: Utensils },
    { key: 'progress' as const, label: 'Progress', icon: TrendingUp },
    { key: 'programs' as const, label: 'Programs', icon: Calendar },
  ];

  async function handlePush() {
    const protein = parseInt(editProtein) || 0;
    const carbs = parseInt(editCarbs) || 0;
    const fat = parseInt(editFat) || 0;
    if (!protein && !carbs && !fat) { toast('Enter macros to push', 'error'); return; }
    setPushing(true);
    const ok = await onPushChanges(fileId, {
      macroTargets: { calories: editCalories, protein, carbs, fat },
      note: coachNote.trim() || undefined,
      pushedAt: new Date().toISOString(),
    });
    setPushing(false);
    if (ok) { toast('Changes pushed to client', 'success'); setCoachNote(''); }
    else toast('Failed to push changes', 'error');
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Coach mode banner */}
      <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
        <button onClick={onClose} className="p-1 -ml-1">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Coach Mode — {data.profile.name || 'Client'}</div>
          <div className="text-[10px] opacity-80">Viewing as coach · changes will be sent for approval</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface sticky top-[52px] z-20">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[10px] font-medium flex flex-col items-center gap-0.5 transition-colors ${
              tab === t.key ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <>
            {/* Profile card */}
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
              <div className="text-[10px] text-text-muted">{todayFood.length} entries today</div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center">
                <div className="text-lg font-bold">{data.workoutSessions.length}</div>
                <div className="text-[9px] text-text-muted uppercase">Workouts</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-lg font-bold">{data.foodEntries.length}</div>
                <div className="text-[9px] text-text-muted uppercase">Food Logs</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-lg font-bold">{data.measurements.length}</div>
                <div className="text-[9px] text-text-muted uppercase">Weigh-ins</div>
              </div>
            </div>

            {/* Push macro changes */}
            <div className="card p-4 space-y-3 border-2 border-accent-blue/20">
              <div className="text-xs font-semibold text-accent-blue uppercase tracking-wider">Push Changes</div>
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
              <input className="input-field text-sm" placeholder="Note to client (optional)" value={coachNote} onChange={(e) => setCoachNote(e.target.value)} />
              <button onClick={handlePush} disabled={pushing} className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Send size={14} /> Push Macro Changes
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
                        <div className="text-xs text-text-muted mt-0.5">
                          Cardio: {w.cardio.map((c) => `${c.type} ${c.durationMin}min`).join(', ')}
                        </div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                      {Object.entries(w.sets).map(([exId, sets]) => {
                        const completed = sets.filter((s) => s.completed);
                        if (completed.length === 0) return null;
                        const prog = data.programs.flatMap((p) => p.days.flatMap((d) => d.exercises)).find((e) => e.name && exId);
                        return (
                          <div key={exId} className="text-xs">
                            <span className="font-medium">{prog?.name || exId.slice(0, 8)}</span>
                            <span className="text-text-muted ml-2">
                              {completed.map((s) => `${s.weight}×${s.reps}`).join(', ')}
                            </span>
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
            {/* Recent days summary */}
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Last 7 Days Avg</div>
              {(() => {
                const last7 = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - i);
                  return d.toISOString().split('T')[0];
                });
                const dayData = last7.map((date) => {
                  const entries = data.foodEntries.filter((f) => f.date === date);
                  return entries.reduce((a, f) => ({
                    cal: a.cal + f.calories * f.servingsConsumed,
                    p: a.p + f.protein * f.servingsConsumed,
                    c: a.c + f.carbs * f.servingsConsumed,
                    f: a.f + f.fat * f.servingsConsumed,
                  }), { cal: 0, p: 0, c: 0, f: 0 });
                });
                const daysWithData = dayData.filter((d) => d.cal > 0);
                if (daysWithData.length === 0) return <p className="text-xs text-text-muted">No data</p>;
                const avg = {
                  cal: Math.round(daysWithData.reduce((a, d) => a + d.cal, 0) / daysWithData.length),
                  p: Math.round(daysWithData.reduce((a, d) => a + d.p, 0) / daysWithData.length),
                  c: Math.round(daysWithData.reduce((a, d) => a + d.c, 0) / daysWithData.length),
                  f: Math.round(daysWithData.reduce((a, d) => a + d.f, 0) / daysWithData.length),
                };
                return (
                  <>
                    <div className="text-xl font-bold">{avg.cal} cal/day</div>
                    <div className="flex gap-3 text-xs text-text-secondary">
                      <span>P {avg.p}g</span><span>C {avg.c}g</span><span>F {avg.f}g</span>
                    </div>
                    <div className="text-[10px] text-text-muted">{daysWithData.length} days tracked</div>
                  </>
                );
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
            {data.progressPhotos.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mt-4">Progress Photos</div>
                <div className="grid grid-cols-3 gap-2">
                  {data.progressPhotos.slice(0, 12).map((p) => (
                    <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square">
                      <img src={p.imageData} alt={p.pose} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[8px] text-white">
                        {p.date} · {p.pose}
                      </div>
                    </div>
                  ))}
                </div>
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
                <div className="text-sm font-semibold">{prog.name}</div>
                <div className="text-xs text-text-muted">{prog.days.length} days</div>
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
      </div>
    </div>
  );
}
