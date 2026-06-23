import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ArrowLeft, Send, Dumbbell, Utensils, TrendingUp, Target,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, Plus, X, Heart, RefreshCw, ClipboardCheck, History, Edit3, Upload,
} from 'lucide-react';
import type { PendingCoachChanges, CoachChangeItem, PendingClientResponse, CoachPhotoMeta, CoachLogEntry, Program, MacroTargets, CheckInEntry, CheckInQuestion } from '../../types';
import { DEFAULT_CHECKIN_QUESTIONS } from '../../types';
import { ProgramEditor } from '../workout/ProgramEditor';
import { CoachHistory } from './CoachHistory';
import { fetchDriveImage } from '../../utils/googleDrive';
import { getAllPrograms, initializePrograms } from '../../db/programs';
import { getAccessToken, requireAccessToken } from '../../utils/googleAuth';
import { toast } from '../shared/Toast';
import MacroSummary from '../dashboard/MacroSummary';
import { getFoodEmoji } from '../../utils/foodEmoji';

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
  foodEntries: { id: string; date: string; name: string; brand?: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number; servingSize?: number; servingUnit?: string; servingsConsumed: number; mealType: string; loggedAt: string }[];
  measurements: { id: string; date: string; weight?: number; weightUnit: string; measurements?: Record<string, number> }[];
  progressPhotos: { id: string; date: string; pose: string; imageData: string; weight?: number }[];
  photoMeta?: CoachPhotoMeta[];
  photoFolderId?: string;
  checkIns?: CheckInEntry[];
  programs: Program[];
  pendingChanges?: PendingCoachChanges | null;
  clientResponse?: PendingClientResponse | null;
  coachPermission?: 'full' | 'readonly';
}

interface Props {
  data: ClientData;
  fileId: string;
  onPushChanges: (fileId: string, changes: PendingCoachChanges) => Promise<{ ok: boolean; error?: string }>;
  onCheckClientResponse: (fileId: string) => Promise<PendingClientResponse | null>;
  onAcknowledgeResponse: (fileId: string) => Promise<void>;
  onRefresh: (fileId: string) => Promise<ClientData | null>;
  onClose: () => void;
  coachEmail?: string;
  coachPicture?: string;
  coachName?: string;
  log: CoachLogEntry[];
}

export function ClientView({ data: initialData, fileId, onPushChanges, onCheckClientResponse, onAcknowledgeResponse, onRefresh, onClose, coachEmail, coachPicture, coachName, log }: Props) {
  const [data, setData] = useState<ClientData>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const readonly = data.coachPermission === 'readonly';
  const [tab, setTab] = useState<'overview' | 'workouts' | 'nutrition' | 'progress' | 'programs' | 'checkins' | 'changes' | 'history'>('overview');
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; date: string; pose: string; weight?: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photosLoading, setPhotosLoading] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [responses, setResponses] = useState<PendingClientResponse | null>(data.clientResponse || null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [showNewProgramMenu, setShowNewProgramMenu] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [myPrograms, setMyPrograms] = useState<Program[]>([]);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh on mount, then poll every 90 seconds and on tab focus
  useEffect(() => {
    const doRefresh = () =>
      onRefresh(fileId).then((fresh) => {
        if (fresh && !(fresh as any).error) { setData(fresh); setResponses(fresh.clientResponse || null); setLastRefreshed(new Date()); }
      });

    doRefresh();
    initializePrograms().then(() => getAllPrograms()).then((progs) => setMyPrograms(progs));

    pollRef.current = setInterval(doRefresh, 90 * 1000);

    const handleVisibility = () => { if (document.visibilityState === 'visible') doRefresh(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fileId]);

  // Changes tab state — all edits happen here, pushed as one batch
  const [changeMacros, setChangeMacros] = useState(false);
  const [editProtein, setEditProtein] = useState(String(data.profile.macroTargets?.protein || ''));
  const [editCarbs, setEditCarbs] = useState(String(data.profile.macroTargets?.carbs || ''));
  const [editFat, setEditFat] = useState(String(data.profile.macroTargets?.fat || ''));
  const [macroNote, setMacroNote] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [changeQuestions, setChangeQuestions] = useState(false);
  const [coachQuestions, setCoachQuestions] = useState<CheckInQuestion[]>([...DEFAULT_CHECKIN_QUESTIONS]);
  const [coachNewQuestion, setCoachNewQuestion] = useState('');
  const [pendingProgram, setPendingProgram] = useState<Program | null>(null);
  const [programNote, setProgramNote] = useState('');

  useEffect(() => {
    setEditProtein(String(data.profile.macroTargets?.protein || ''));
    setEditCarbs(String(data.profile.macroTargets?.carbs || ''));
    setEditFat(String(data.profile.macroTargets?.fat || ''));
  }, [data.profile.macroTargets?.protein, data.profile.macroTargets?.carbs, data.profile.macroTargets?.fat]);

  useEffect(() => {
    const photos = data.photoMeta;
    if (!photos || photos.length === 0) return;
    let cancelled = false;
    setPhotosLoading(true);
    (async () => {
      const token = getAccessToken() || await requireAccessToken();
      const urls: Record<string, string> = {};
      for (const p of photos) {
        if (cancelled) break;
        try { urls[p.photoId] = await fetchDriveImage(token, p.driveFileId); } catch { /* skip */ }
      }
      if (!cancelled) { setPhotoUrls(urls); setPhotosLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [data.photoMeta]);

  const editCalories = (parseInt(editProtein) || 0) * 4 + (parseInt(editCarbs) || 0) * 4 + (parseInt(editFat) || 0) * 9;
  const CHART_COLORS = ['#e8572a', '#5b6ef5', '#2e9e6b', '#f5a623', '#c44fc4', '#e85757', '#4ecdc4', '#ff6b6b'];

  const recentWorkouts = useMemo(() => [...data.workoutSessions].sort((a, b) => b.startTime - a.startTime).slice(0, 20), [data.workoutSessions]);

  // Build fast lookup: exerciseId → name, and dayId → title, from client's programs
  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const prog of data.programs) {
      for (const day of prog.days) {
        for (const ex of day.exercises) map[ex.id] = ex.name;
      }
    }
    return map;
  }, [data.programs]);

  const dayLabelMap = useMemo(() => {
    const map: Record<string, { programName: string; dayTitle: string; dayLabel: string; accent: string }> = {};
    for (const prog of data.programs) {
      for (const day of prog.days) {
        map[day.id] = { programName: prog.name, dayTitle: day.title || day.label || '', dayLabel: day.label || '', accent: day.accent || '#e8572a' };
      }
    }
    return map;
  }, [data.programs]);
  const today = new Date().toISOString().split('T')[0];
  // All unique dates that have food logged, sorted newest first
  const foodDates = useMemo(() => {
    const dates = [...new Set(data.foodEntries.map((f) => f.date))].sort((a, b) => b.localeCompare(a));
    return dates;
  }, [data.foodEntries]);
  // Default to most recent date with entries, falling back to today
  const [nutritionDate, setNutritionDate] = useState<string>(() => foodDates[0] || today);
  const dateIdx = foodDates.indexOf(nutritionDate);
  const todayFood = useMemo(() => data.foodEntries.filter((f) => f.date === nutritionDate).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)), [data.foodEntries, nutritionDate]);
  const todayTotals = useMemo(() => todayFood.reduce((acc, f) => ({ calories: acc.calories + f.calories * f.servingsConsumed, protein: acc.protein + f.protein * f.servingsConsumed, carbs: acc.carbs + f.carbs * f.servingsConsumed, fat: acc.fat + f.fat * f.servingsConsumed }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [todayFood]);
  const recentMeasurements = useMemo(() => [...data.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10), [data.measurements]);
  const checkInTrend = useMemo(() => {
    if (!data.checkIns || data.checkIns.length < 2) return [];
    return [...data.checkIns].sort((a, b) => a.date.localeCompare(b.date)).slice(-30).map((ci) => {
      const row: Record<string, string | number> = { date: ci.date.slice(5) };
      for (const r of ci.responses) { if (typeof r.value === 'number') row[r.questionId] = r.value; }
      return row;
    });
  }, [data.checkIns]);

  // Build and push all changes at once
  async function handlePushChanges() {
    const items: CoachChangeItem[] = [];

    if (changeMacros) {
      const protein = parseInt(editProtein) || 0;
      const carbs = parseInt(editCarbs) || 0;
      const fat = parseInt(editFat) || 0;
      if (protein || carbs || fat) {
        items.push({ id: crypto.randomUUID(), type: 'macros', label: `Macros: ${protein}p / ${carbs}c / ${fat}f (${protein * 4 + carbs * 4 + fat * 9} cal)`, data: { calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat }, coachNote: macroNote.trim() || undefined });
      }
    }

    if (changeNote.trim()) {
      items.push({ id: crypto.randomUUID(), type: 'note', label: 'Coach Note', data: changeNote.trim() });
    }

    if (changeQuestions) {
      const defaultIds = new Set(DEFAULT_CHECKIN_QUESTIONS.map((q) => q.id));
      const added = coachQuestions.filter((q) => !defaultIds.has(q.id));
      const removed = DEFAULT_CHECKIN_QUESTIONS.filter((q) => !coachQuestions.some((cq) => cq.id === q.id));
      const parts: string[] = [];
      for (const q of added) parts.push(`Added: ${q.label}`);
      for (const q of removed) parts.push(`Removed: ${q.label}`);
      items.push({ id: crypto.randomUUID(), type: 'note', label: parts.length > 0 ? parts.join(', ') : `${coachQuestions.length} check-in questions`, data: JSON.stringify({ action: 'set_questions', questions: coachQuestions }) });
    }

    if (pendingProgram) {
      items.push({ id: crypto.randomUUID(), type: 'program', label: `Program: ${pendingProgram.name}`, data: pendingProgram, coachNote: programNote.trim() || undefined });
    }

    if (items.length === 0) { toast('No changes to push', 'error'); return; }

    setPushing(true);
    const result = await onPushChanges(fileId, { items, pushedAt: new Date().toISOString(), coachEmail, coachPicture, coachName });
    setPushing(false);
    if (result.ok) {
      toast(`${items.length} change${items.length > 1 ? 's' : ''} pushed successfully`, 'success');
      setChangeMacros(false); setMacroNote(''); setChangeNote(''); setChangeQuestions(false); setPendingProgram(null); setProgramNote('');
      setTab('overview');
    } else {
      toast(result.error || 'Failed to push changes', 'error');
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    const fresh = await onRefresh(fileId);
    if (fresh && !(fresh as any).error) { setData(fresh); setResponses(fresh.clientResponse || null); setLastRefreshed(new Date()); toast('Refreshed', 'success'); }
    else toast((fresh as any)?.error || 'Failed to refresh', 'error');
    setRefreshing(false);
  }

  const handleSaveProgram = useCallback((prog: Program) => {
    setPendingProgram(prog);
    setEditingProgram(null);
    toast('Program ready to push', 'success');
  }, []);

  const handleImportProgram = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const prog = json.program || json;
        if (prog.name && prog.days) {
          setPendingProgram({ ...prog, id: crypto.randomUUID(), isBuiltIn: false });
          toast(`Imported: ${prog.name}`, 'success');
        } else {
          toast('Invalid program file', 'error');
        }
      } catch { toast('Invalid JSON', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Target },
    { key: 'workouts' as const, label: 'Workouts', icon: Dumbbell },
    { key: 'nutrition' as const, label: 'Nutrition', icon: Utensils },
    { key: 'progress' as const, label: 'Progress', icon: TrendingUp },
    { key: 'programs' as const, label: 'Programs', icon: Calendar },
    { key: 'checkins' as const, label: 'Check-Ins', icon: ClipboardCheck },
    ...(!readonly ? [{ key: 'changes' as const, label: 'Changes', icon: Edit3 }] : []),
    { key: 'history' as const, label: 'History', icon: History },
  ];

  // New program menu — pick blank or copy from template
  if (showNewProgramMenu) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
          <button onClick={() => setShowNewProgramMenu(false)} className="p-1 -ml-1"><ArrowLeft size={18} /></button>
          <div className="flex-1"><div className="text-sm font-semibold">New Program for Client</div></div>
        </div>
        <div className="p-4 space-y-3">
          <button onClick={() => { setShowNewProgramMenu(false); setEditingProgram({ id: crypto.randomUUID(), name: '', description: '', isBuiltIn: false, days: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }} className="w-full btn-primary text-sm py-3">
            Start from Scratch
          </button>

          {myPrograms.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Copy from your programs</div>
              {myPrograms.map((prog) => (
                <button key={prog.id} onClick={() => { setShowNewProgramMenu(false); setEditingProgram({ ...prog, id: crypto.randomUUID(), isBuiltIn: false, name: `${prog.name} (for ${data.profile.name || 'client'})` }); }} className="w-full text-left p-3 rounded-xl bg-surface-raised hover:bg-surface transition-colors">
                  <div className="text-sm font-medium">{prog.name}</div>
                  <div className="text-[10px] text-text-muted">{prog.days.length} days · {prog.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                </button>
              ))}
            </div>
          )}

          {data.programs.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Copy from client's programs</div>
              {data.programs.map((prog) => (
                <button key={prog.id} onClick={() => { setShowNewProgramMenu(false); setEditingProgram({ ...prog, id: crypto.randomUUID(), isBuiltIn: false }); }} className="w-full text-left p-3 rounded-xl bg-surface-raised hover:bg-surface transition-colors">
                  <div className="text-sm font-medium">{prog.name}</div>
                  <div className="text-[10px] text-text-muted">{prog.days.length} days · {prog.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (editingProgram) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
          <button onClick={() => setEditingProgram(null)} className="p-1 -ml-1"><ArrowLeft size={18} /></button>
          <div className="flex-1"><div className="text-sm font-semibold">{editingProgram.name || 'New Program'}</div></div>
        </div>
        <ProgramEditor program={editingProgram} fitnessGoal={(data.profile.bodyStats?.fitnessGoal as 'lose' | 'maintain' | 'build') || 'maintain'} onSave={handleSaveProgram} onClose={() => setEditingProgram(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-30 bg-accent-blue text-white px-4 py-2 flex items-center gap-3">
        <button onClick={onClose} className="p-1 -ml-1"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Coach Mode — {data.profile.name || 'Client'}</div>
          <div className="text-[10px] opacity-70">
            {lastRefreshed
              ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : readonly ? 'Read-only view' : 'Use Changes tab to push updates'}
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 rounded-lg bg-white/20" title="Refresh client data">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex border-b border-border bg-surface sticky top-[52px] z-20 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[10px] font-medium flex flex-col items-center gap-0.5 transition-colors min-w-[55px] ${tab === t.key ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted'}`}
          >
            <t.icon size={14} />{t.label}
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
              {data.profile.goal && <div className="text-xs text-text-muted">Goal: {data.profile.goal}</div>}
              {data.profile.bodyStats && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Age', value: data.profile.bodyStats.age ?? '-' },
                    { label: 'Height', value: data.profile.bodyStats.heightCm ? `${Math.round(data.profile.bodyStats.heightCm)} cm` : '-' },
                    { label: 'Weight', value: data.profile.bodyStats.weightKg ? `${Math.round(data.profile.bodyStats.weightKg * 2.205)} lbs` : '-' },
                    { label: 'TDEE', value: data.profile.tdee ?? '-' },
                  ].map((s) => (
                    <div key={s.label} className="bg-surface-raised rounded-lg p-2">
                      <div className="text-[9px] text-text-muted uppercase">{s.label}</div>
                      <div className="text-sm font-semibold">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's nutrition vs targets */}
            {data.profile.macroTargets && (
              <div className="card p-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Today's Nutrition</div>
                <MacroSummary
                  totals={{ ...todayTotals, fiber: 0 }}
                  targets={data.profile.macroTargets}
                />
              </div>
            )}

            {/* Activity stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: data.workoutSessions.length, l: 'Workouts', color: '#e8572a' },
                { v: data.foodEntries.length, l: 'Food Logs', color: '#f5a623' },
                { v: data.measurements.length, l: 'Weigh-ins', color: '#5b6ef5' },
              ].map((s) => (
                <div key={s.l} className="card p-3 text-center">
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.v}</div>
                  <div className="text-[9px] text-text-muted uppercase">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Macro targets reference */}
            {data.profile.macroTargets && (
              <div className="card p-3">
                <div className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Daily Targets</div>
                <div className="flex gap-3">
                  {[
                    { label: 'Calories', value: data.profile.macroTargets.calories, unit: '', color: '#e8572a' },
                    { label: 'Protein', value: data.profile.macroTargets.protein, unit: 'g', color: '#5b6ef5' },
                    { label: 'Carbs', value: data.profile.macroTargets.carbs, unit: 'g', color: '#2e9e6b' },
                    { label: 'Fat', value: data.profile.macroTargets.fat, unit: 'g', color: '#f5a623' },
                  ].map((m) => (
                    <div key={m.label} className="flex-1 text-center">
                      <div className="text-sm font-bold" style={{ color: m.color }}>{m.value}{m.unit}</div>
                      <div className="text-[9px] text-text-muted">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Denied changes notification */}
            {responses && responses.responses.some((r) => r.action === 'denied') && (
              <div className="card p-4 space-y-2 border-l-4 border-l-danger">
                <div className="text-sm font-semibold text-danger">Client denied changes</div>
                <div className="text-[10px] text-text-muted">{new Date(responses.respondedAt).toLocaleString()}</div>
                {responses.responses.filter((r) => r.action === 'denied').map((resp) => (
                  <div key={resp.itemId} className="p-2 rounded-lg bg-danger/5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs"><X size={12} className="text-danger" /><span className="font-medium">Denied</span></div>
                    {resp.clientNote && <p className="text-xs text-text-secondary italic pl-5">"{resp.clientNote}"</p>}
                  </div>
                ))}
                <button onClick={async () => { await onAcknowledgeResponse(fileId); setResponses(null); toast('Dismissed', 'success'); }} className="text-[10px] text-text-muted underline">Dismiss</button>
              </div>
            )}
          </>
        )}

        {/* WORKOUTS */}
        {tab === 'workouts' && (
          <>
            {recentWorkouts.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No workouts</p>
            ) : recentWorkouts.map((w) => {
              const setCount = Object.values(w.sets).reduce((a, s) => a + s.filter((x) => x.completed).length, 0);
              const dur = w.endTime ? Math.round((w.endTime - w.startTime) / 60000) : null;
              const isExp = expandedWorkout === w.id;
              const dayInfo = dayLabelMap[w.dayId];
              return (
                <div key={w.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedWorkout(isExp ? null : w.id)}
                    className="w-full p-3 flex items-center gap-3 text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                      style={{ backgroundColor: dayInfo?.accent || '#e8572a' }}
                    >
                      {dayInfo?.dayLabel?.slice(0, 2) || 'W'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{dayInfo ? (dayInfo.dayTitle || dayInfo.programName) : 'Workout'}</div>
                      <div className="text-xs text-text-muted">
                        {new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {dur ? ` · ${dur} min` : ''}{w.bodyweight ? ` · ${w.bodyweight} lbs` : ''}
                      </div>
                      {w.cardio && w.cardio.length > 0 && (
                        <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                          <Heart size={10} />
                          {w.cardio.map((c) => `${c.type} ${c.durationMin}min`).join(', ')}
                        </div>
                      )}
                    </div>
                    {isExp ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                  </button>
                  {isExp && (
                    <div className="px-3 pb-3 space-y-1.5 border-t border-border pt-2">
                      {Object.entries(w.sets).map(([exId, sets]) => {
                        const completed = sets.filter((s) => s.completed);
                        if (completed.length === 0) return null;
                        const name = exerciseNameMap[exId] || exId;
                        return (
                          <div key={exId} className="text-xs">
                            <span className="font-medium text-text-primary">{name}</span>
                            <span className="text-text-muted ml-1.5">{completed.map((s) => `${s.weight}×${s.reps}`).join(', ')}</span>
                          </div>
                        );
                      })}
                      {w.notes && <div className="text-[10px] text-text-muted italic mt-1">{w.notes}</div>}
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
            {/* Date navigator */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => { const next = foodDates[dateIdx + 1]; if (next) setNutritionDate(next); }}
                disabled={dateIdx >= foodDates.length - 1}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-surface-raised transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold">
                  {nutritionDate === today ? 'Today' : nutritionDate === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? 'Yesterday' : new Date(nutritionDate + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                {foodDates.length > 0 && (
                  <div className="text-[10px] text-text-muted">{dateIdx + 1} of {foodDates.length} logged days</div>
                )}
              </div>
              <button
                onClick={() => { const prev = foodDates[dateIdx - 1]; if (prev) setNutritionDate(prev); }}
                disabled={dateIdx <= 0}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-surface-raised transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Macro summary */}
            {data.profile.macroTargets ? (
              <div className="card p-4">
                <MacroSummary
                  totals={{ ...todayTotals, fiber: 0 }}
                  targets={data.profile.macroTargets}
                />
              </div>
            ) : (
              <div className="card p-4 space-y-1">
                <div className="text-2xl font-bold" style={{ color: '#e8572a' }}>{Math.round(todayTotals.calories)} <span className="text-sm font-normal text-text-muted">cal</span></div>
                <div className="flex gap-4 text-xs">
                  <span style={{ color: '#5b6ef5' }}>P {Math.round(todayTotals.protein)}g</span>
                  <span style={{ color: '#2e9e6b' }}>C {Math.round(todayTotals.carbs)}g</span>
                  <span style={{ color: '#f5a623' }}>F {Math.round(todayTotals.fat)}g</span>
                </div>
              </div>
            )}

            {todayFood.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">{foodDates.length === 0 ? 'No food logged yet' : 'No food logged this day'}</p>
            ) : (
              (() => {
                const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
                const grouped: Record<string, typeof todayFood> = {};
                for (const f of todayFood) {
                  const key = f.mealType || 'snack';
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(f);
                }
                return (
                  <div className="space-y-3">
                    {mealOrder.filter((m) => grouped[m]?.length > 0).map((mealType) => {
                      const entries = grouped[mealType];
                      const mealCal = Math.round(entries.reduce((s, f) => s + f.calories * f.servingsConsumed, 0));
                      return (
                        <div key={mealType}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary capitalize">{mealType}</span>
                            <span className="text-[11px] text-text-muted">{mealCal} cal</span>
                          </div>
                          <div className="space-y-1.5">
                            {entries.map((f) => {
                              const cal = Math.round(f.calories * f.servingsConsumed);
                              const pro = Math.round(f.protein * f.servingsConsumed);
                              const carb = Math.round(f.carbs * f.servingsConsumed);
                              const fat = Math.round(f.fat * f.servingsConsumed);
                              return (
                                <div key={f.id} className="card p-3 flex items-center gap-3">
                                  <div className="text-xl flex-shrink-0">{getFoodEmoji(f.name)}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{f.name}</div>
                                    <div className="flex gap-3 text-[10px] mt-0.5 flex-wrap">
                                      <span style={{ color: '#5b6ef5' }}>P {pro}g</span>
                                      <span style={{ color: '#2e9e6b' }}>C {carb}g</span>
                                      <span style={{ color: '#f5a623' }}>F {fat}g</span>
                                      {f.loggedAt && <span className="text-text-muted">{new Date(f.loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-sm font-semibold" style={{ color: '#e8572a' }}>{cal}</div>
                                    <div className="text-[9px] text-text-muted">cal</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </>
        )}

        {/* PROGRESS */}
        {tab === 'progress' && (
          <>
            {recentMeasurements.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No measurements</p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Weight History</div>
                {recentMeasurements.filter((m) => m.weight).map((m, i, arr) => {
                  const prev = arr[i + 1];
                  const delta = prev?.weight != null && m.weight != null ? m.weight - prev.weight : null;
                  return (
                    <div key={m.id} className="card p-3 flex items-center justify-between">
                      <span className="text-sm text-text-muted">
                        {new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex items-center gap-2">
                        {delta !== null && (
                          <span className={`text-[10px] font-medium ${delta < 0 ? 'text-success' : delta > 0 ? 'text-danger' : 'text-text-muted'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                          </span>
                        )}
                        <span className="text-sm font-semibold" style={{ color: '#5b6ef5' }}>{m.weight} {m.weightUnit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {data.photoMeta && data.photoMeta.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Progress Photos {photosLoading && <span className="text-text-muted">(loading…)</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {data.photoMeta.map((p) => (
                    <button
                      key={p.photoId}
                      onClick={() => photoUrls[p.photoId] && setViewingPhoto({ url: photoUrls[p.photoId], date: p.date, pose: p.pose, weight: p.weight })}
                      className="relative rounded-xl overflow-hidden aspect-square bg-surface-raised active:scale-95 transition-transform"
                    >
                      {photoUrls[p.photoId]
                        ? <img src={photoUrls[p.photoId]} alt={p.pose} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-text-muted"><RefreshCw size={14} className={photosLoading ? 'animate-spin' : ''} /></div>
                      }
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[8px] text-white">{p.date} · {p.pose}{p.weight ? ` · ${p.weight}` : ''}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* PROGRAMS */}
        {tab === 'programs' && (() => {
          const enrolledId = data.profile.activeProgram?.programId;
          const enrolled = enrolledId ? data.programs.find((p) => p.id === enrolledId) : null;
          return (
            <div className="space-y-4">
              {enrolled ? (
                <div className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{enrolled.name}</div>
                      <div className="text-xs text-text-muted">{enrolled.days.length} days · {enrolled.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                      <div className="text-[10px] text-success font-medium mt-0.5">Currently enrolled</div>
                    </div>
                  </div>
                  {enrolled.days.map((day) => (
                    <div key={day.id} className="pl-3 border-l-2 border-border space-y-0.5">
                      <div className="text-xs font-medium">{day.title}</div>
                      {day.exercises.map((ex, i) => <div key={i} className="text-[10px] text-text-muted">{ex.name} — {ex.sets}×{ex.reps}</div>)}
                    </div>
                  ))}
                  {!readonly && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditingProgram(enrolled)} className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"><Edit3 size={14} /> Edit Program</button>
                      <button onClick={() => setShowProgramPicker(true)} className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1 text-danger"><X size={14} /> Replace</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card p-4 text-center space-y-3">
                  <p className="text-sm text-text-muted">Client is not enrolled in a program</p>
                  {!readonly && <button onClick={() => setShowProgramPicker(true)} className="btn-primary text-sm"><Plus size={14} className="inline mr-1" />Assign Program</button>}
                </div>
              )}

              {/* Pending program change */}
              {pendingProgram && (
                <div className="card p-3 border-2 border-accent-blue/30 space-y-1">
                  <div className="text-[9px] text-accent-blue uppercase font-semibold tracking-wider">Staged for push</div>
                  <div className="text-sm font-medium">{pendingProgram.name}</div>
                  <div className="text-xs text-text-muted">{pendingProgram.days.length} days · {pendingProgram.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditingProgram(pendingProgram)} className="text-[10px] text-accent-blue font-medium">Edit before pushing</button>
                    <button onClick={() => setPendingProgram(null)} className="text-[10px] text-danger font-medium">Remove</button>
                  </div>
                </div>
              )}

              {/* Program picker */}
              {showProgramPicker && (
                <div className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider">New Program</div>
                    <button onClick={() => setShowProgramPicker(false)} className="text-text-muted"><X size={14} /></button>
                  </div>

                  <button onClick={() => { setShowProgramPicker(false); setShowNewProgramMenu(true); }} className="w-full btn-primary text-sm flex items-center justify-center gap-1">
                    <Plus size={14} /> Create New
                  </button>

                  <label className="w-full btn-secondary text-sm flex items-center justify-center gap-1 cursor-pointer">
                    <Upload size={14} /> Import from JSON
                    <input ref={importRef} type="file" accept=".json" onChange={(e) => { handleImportProgram(e); setShowProgramPicker(false); }} className="hidden" />
                  </label>
                </div>
              )}
            </div>
          );
        })()}

        {/* CHECK-INS */}
        {tab === 'checkins' && (<>{checkInTrend.length >= 2 && <div className="card p-4 space-y-3"><div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Trends (last 30 days)</div><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={checkInTrend}><XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" /><YAxis domain={[1, 10]} tick={{ fontSize: 9 }} width={20} /><Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />{DEFAULT_CHECKIN_QUESTIONS.map((q, i) => <Line key={q.id} type="monotone" dataKey={q.id} name={q.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div><div className="flex flex-wrap gap-x-3 gap-y-1">{DEFAULT_CHECKIN_QUESTIONS.map((q, i) => <span key={q.id} className="text-[9px] flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />{q.label}</span>)}</div></div>}{(!data.checkIns || data.checkIns.length === 0) ? <p className="text-sm text-text-muted text-center py-8">No check-ins</p> : <div className="space-y-2"><div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">History</div>{[...data.checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 21).map((ci) => <div key={ci.id} className="card p-3 space-y-2"><div className="text-xs font-semibold">{ci.date}</div><div className="space-y-1.5">{ci.responses.map((r) => { const q = DEFAULT_CHECKIN_QUESTIONS.find((qq) => qq.id === r.questionId); return <div key={r.questionId} className="flex items-center justify-between"><span className="text-xs text-text-secondary">{q?.label || r.questionId}</span>{typeof r.value === 'number' ? <div className="flex items-center gap-1"><div className="w-16 h-1.5 rounded-full bg-surface-raised overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / 10) * 100}%`, backgroundColor: r.value >= 7 ? '#2e9e6b' : r.value >= 4 ? '#f5a623' : '#e85757' }} /></div><span className="text-xs font-medium w-5 text-right">{r.value}</span></div> : <span className="text-xs text-text-muted">{r.value}</span>}</div>; })}</div>{ci.notes && <p className="text-[10px] text-text-muted italic">{ci.notes}</p>}</div>)}</div>}</>)}

        {/* CHANGES — unified push tab */}
        {tab === 'changes' && !readonly && (
          <div className="space-y-4">
            <p className="text-[11px] text-text-muted">Make all your changes here, then push everything to the client at once.</p>

            {/* Macros */}
            <div className="card p-4 space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={changeMacros} onChange={(e) => setChangeMacros(e.target.checked)} className="accent-accent-blue" />
                <span className="text-xs font-semibold uppercase tracking-wider">Update Macros</span>
              </label>
              {changeMacros && <>
                <div className="bg-surface-raised rounded-xl p-3 text-center"><div className="text-xl font-semibold">{editCalories}</div><div className="text-[9px] text-text-muted">calories</div></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-[9px] text-text-muted block mb-0.5">Protein</label><input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editProtein} onChange={(e) => setEditProtein(e.target.value)} /></div>
                  <div><label className="text-[9px] text-text-muted block mb-0.5">Carbs</label><input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editCarbs} onChange={(e) => setEditCarbs(e.target.value)} /></div>
                  <div><label className="text-[9px] text-text-muted block mb-0.5">Fat</label><input type="number" inputMode="numeric" className="input-field text-sm text-center" value={editFat} onChange={(e) => setEditFat(e.target.value)} /></div>
                </div>
                <input className="input-field text-sm" placeholder="Note about macro change (optional)" value={macroNote} onChange={(e) => setMacroNote(e.target.value)} />
              </>}
            </div>

            {/* Note */}
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider">Note to Client</div>
              <textarea className="input-field text-sm w-full resize-none" rows={2} placeholder="Feedback, instructions, encouragement..." value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
            </div>

            {/* Check-in questions */}
            <div className="card p-4 space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={changeQuestions} onChange={(e) => setChangeQuestions(e.target.checked)} className="accent-accent-blue" />
                <span className="text-xs font-semibold uppercase tracking-wider">Update Check-In Questions</span>
              </label>
              {changeQuestions && <>
                <div className="space-y-1.5">
                  {coachQuestions.map((q) => <div key={q.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface-raised"><span className="text-xs flex-1">{q.label}</span><span className="text-[9px] text-text-muted">1-10</span><button onClick={() => setCoachQuestions((prev) => prev.filter((x) => x.id !== q.id))} className="p-0.5 text-text-muted hover:text-danger"><X size={12} /></button></div>)}
                </div>
                <div className="flex gap-2">
                  <input className="input-field text-sm flex-1" placeholder="New question" value={coachNewQuestion} onChange={(e) => setCoachNewQuestion(e.target.value)} />
                  <button onClick={() => { if (!coachNewQuestion.trim()) return; setCoachQuestions((prev) => [...prev, { id: crypto.randomUUID(), label: coachNewQuestion.trim(), type: 'scale', min: 1, max: 10 }]); setCoachNewQuestion(''); }} disabled={!coachNewQuestion.trim()} className="btn-primary px-3 text-sm disabled:opacity-30"><Plus size={14} /></button>
                </div>
              </>}
            </div>

            {/* Program */}
            <div className="card p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider">Program</div>
              {pendingProgram ? (
                <div className="p-3 rounded-xl bg-success/10 border border-success/30 space-y-1">
                  <div className="text-sm font-medium text-success">{pendingProgram.name}</div>
                  <div className="text-xs text-text-muted">{pendingProgram.days.length} days · {pendingProgram.days.reduce((a, d) => a + d.exercises.length, 0)} exercises</div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditingProgram(pendingProgram)} className="text-[10px] text-accent-blue font-medium">Edit</button>
                    <button onClick={() => setPendingProgram(null)} className="text-[10px] text-danger font-medium">Remove</button>
                  </div>
                  <input className="input-field text-sm mt-2" placeholder="Note about program (optional)" value={programNote} onChange={(e) => setProgramNote(e.target.value)} />
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setShowNewProgramMenu(true)} className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"><Plus size={14} /> Create New</button>
                  <label className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1 cursor-pointer"><Upload size={14} /> Import JSON<input ref={importRef} type="file" accept=".json" onChange={handleImportProgram} className="hidden" /></label>
                </div>
              )}
            </div>

            {/* Push button */}
            <button onClick={handlePushChanges} disabled={pushing || (!changeMacros && !changeNote.trim() && !changeQuestions && !pendingProgram)} className="btn-primary w-full flex items-center justify-center gap-1.5 text-sm disabled:opacity-30">
              <Send size={14} /> {pushing ? 'Pushing...' : 'Push All Changes to Client'}
            </button>
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && <CoachHistory log={log.filter((e) => !e.fileId || e.fileId === fileId)} perspective="coach" />}

      </div>

      {/* Fullscreen photo viewer */}
      {viewingPhoto && <div className="fixed inset-0 z-[300] bg-black flex flex-col" onClick={() => setViewingPhoto(null)}><div className="flex items-center justify-between p-4 text-white"><div><div className="text-sm font-medium">{viewingPhoto.date} · {viewingPhoto.pose}</div>{viewingPhoto.weight && <div className="text-xs opacity-70">{viewingPhoto.weight} lbs</div>}</div><button onClick={() => setViewingPhoto(null)} className="p-2"><X size={20} /></button></div><div className="flex-1 flex items-center justify-center overflow-auto p-4"><img src={viewingPhoto.url} alt={viewingPhoto.pose} className="max-w-full max-h-full object-contain" style={{ touchAction: 'pinch-zoom' }} onClick={(e) => e.stopPropagation()} /></div></div>}
    </div>
  );
}
