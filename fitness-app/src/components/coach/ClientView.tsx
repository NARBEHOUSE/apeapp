import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
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
  steps?: { id: string; date: string; count: number; profileId: string }[];
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
  const [viewingPhotoList, setViewingPhotoList] = useState<{ url: string; date: string; pose: string; weight?: number }[]>([]);
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
  const [chartRange, setChartRange] = useState<7 | 30 | 60 | 90>(30);
  const [weighInsOpen, setWeighInsOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

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
  const rangeStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - chartRange);
    return d.toISOString().split('T')[0];
  }, [chartRange]);

  const recentMeasurements = useMemo(() => [...data.measurements].filter((m) => m.date >= rangeStart).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [data.measurements, rangeStart]);

  const weightChartData = useMemo(() => {
    const sorted = [...data.measurements].filter((m) => m.weight && m.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date));
    const max = 120;
    const step = sorted.length > max ? Math.ceil(sorted.length / max) : 1;
    return sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1).map((m) => ({ date: m.date.slice(5), w: m.weight }));
  }, [data.measurements, rangeStart]);

  const nutritionTrendData = useMemo(() => {
    const byDate: Record<string, { cal: number; protein: number; carbs: number; fat: number }> = {};
    for (const f of data.foodEntries) {
      if (f.date < rangeStart) continue;
      if (!byDate[f.date]) byDate[f.date] = { cal: 0, protein: 0, carbs: 0, fat: 0 };
      byDate[f.date].cal += f.calories * f.servingsConsumed;
      byDate[f.date].protein += f.protein * f.servingsConsumed;
      byDate[f.date].carbs += f.carbs * f.servingsConsumed;
      byDate[f.date].fat += f.fat * f.servingsConsumed;
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
      date: date.slice(5), cal: Math.round(v.cal), protein: Math.round(v.protein), carbs: Math.round(v.carbs), fat: Math.round(v.fat),
    }));
  }, [data.foodEntries, rangeStart]);

  const workoutFrequencyData = useMemo(() => {
    const weeks: Record<string, number> = {};
    for (const w of data.workoutSessions) {
      if (w.date < rangeStart) continue;
      const d = new Date(w.date + 'T12:00:00');
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().split('T')[0].slice(5);
      weeks[key] = (weeks[key] || 0) + 1;
    }
    const weekCount = Math.max(1, Math.ceil(chartRange / 7));
    const result = [];
    const now = new Date();
    for (let i = weekCount - 1; i >= 0; i--) {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - i * 7);
      const key = monday.toISOString().split('T')[0].slice(5);
      result.push({ week: key, workouts: weeks[key] || 0 });
    }
    return result;
  }, [data.workoutSessions, rangeStart, chartRange]);

  const stepsTrendData = useMemo(() => {
    if (!data.steps || data.steps.length === 0) return [];
    return [...data.steps].filter((s) => s.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date.slice(5), steps: s.count }));
  }, [data.steps, rangeStart]);

  const bodyMeasurementsData = useMemo(() => {
    const withM = [...data.measurements].filter((m) => m.measurements && Object.keys(m.measurements).length > 0 && m.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date));
    if (withM.length < 2) return [];
    const step = withM.length > 60 ? Math.ceil(withM.length / 60) : 1;
    return withM.filter((_, i) => i % step === 0 || i === withM.length - 1).map((m) => ({
      date: m.date.slice(5), waist: m.measurements?.waist, chest: m.measurements?.chest, hips: m.measurements?.hips, arms: m.measurements?.arms,
    }));
  }, [data.measurements, rangeStart]);

  const checkInTrend = useMemo(() => {
    if (!data.checkIns || data.checkIns.length < 2) return [];
    return [...data.checkIns].filter((ci) => ci.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date)).map((ci) => {
      const row: Record<string, string | number> = { date: ci.date.slice(5) };
      for (const r of ci.responses) { if (typeof r.value === 'number') row[r.questionId] = r.value; }
      return row;
    });
  }, [data.checkIns, rangeStart]);

  const rangeStats = useMemo(() => {
    const workoutsInRange = data.workoutSessions.filter((w) => w.date >= rangeStart).length;
    const weightInRange = data.measurements.filter((m) => m.weight && m.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date));
    const avgWeight = weightInRange.length > 0 ? weightInRange.reduce((s, m) => s + (m.weight || 0), 0) / weightInRange.length : null;
    const firstWeight = weightInRange[0]?.weight;
    const lastWeight = weightInRange[weightInRange.length - 1]?.weight;
    const weightDelta = firstWeight != null && lastWeight != null && weightInRange.length > 1 ? lastWeight - firstWeight : null;
    const byDate: Record<string, { cal: number; protein: number }> = {};
    for (const f of data.foodEntries) {
      if (f.date < rangeStart) continue;
      if (!byDate[f.date]) byDate[f.date] = { cal: 0, protein: 0 };
      byDate[f.date].cal += f.calories * f.servingsConsumed;
      byDate[f.date].protein += f.protein * f.servingsConsumed;
    }
    const loggedDays = Object.keys(byDate).length;
    const avgCal = loggedDays > 0 ? Math.round(Object.values(byDate).reduce((s, d) => s + d.cal, 0) / loggedDays) : null;
    const avgProtein = loggedDays > 0 ? Math.round(Object.values(byDate).reduce((s, d) => s + d.protein, 0) / loggedDays) : null;
    const stepsInRange = (data.steps || []).filter((s) => s.date >= rangeStart);
    const avgSteps = stepsInRange.length > 0 ? Math.round(stepsInRange.reduce((s, x) => s + x.count, 0) / stepsInRange.length) : null;
    const calTarget = data.profile.macroTargets?.calories;
    const proteinTarget = data.profile.macroTargets?.protein;
    const calHit = calTarget && loggedDays > 0 ? Object.values(byDate).filter((d) => d.cal >= calTarget * 0.85 && d.cal <= calTarget * 1.15).length : null;
    const proteinHit = proteinTarget && loggedDays > 0 ? Object.values(byDate).filter((d) => d.protein >= proteinTarget * 0.9).length : null;
    return { workoutsInRange, avgWeight, weightDelta, loggedDays, avgCal, avgProtein, avgSteps, calHit, proteinHit, calTarget, proteinTarget, weightCount: weightInRange.length };
  }, [data, rangeStart]);

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

      {/* Range picker — shown above content on chart tabs */}
      {['overview','workouts','nutrition','progress','checkins'].includes(tab) && (
        <div className="sticky top-[94px] z-10 bg-bg px-4 pt-2 pb-1 flex items-center justify-between">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Range</span>
          <div className="flex gap-1.5">
            {([7, 30, 60, 90] as const).map((r) => (
              <button key={r} onClick={() => setChartRange(r)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${chartRange === r ? 'bg-text-primary text-bg' : 'bg-surface text-text-muted'}`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 pb-24">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <>
            {/* Profile header */}
            <div className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{data.profile.name}</h3>
                  {data.profile.goal && <div className="text-xs text-text-muted">{data.profile.goal}</div>}
                </div>
                {data.profile.bodyStats && (
                  <div className="text-right text-[10px] text-text-muted">
                    {data.profile.bodyStats.age && <div>{data.profile.bodyStats.age} yrs</div>}
                    {data.profile.tdee && <div>TDEE {data.profile.tdee} cal</div>}
                  </div>
                )}
              </div>
              {data.profile.macroTargets && (
                <div className="flex gap-2 pt-1 border-t border-border">
                  {[
                    { label: 'Cal', value: data.profile.macroTargets.calories, unit: '', color: '#e8572a' },
                    { label: 'P', value: data.profile.macroTargets.protein, unit: 'g', color: '#5b6ef5' },
                    { label: 'C', value: data.profile.macroTargets.carbs, unit: 'g', color: '#2e9e6b' },
                    { label: 'F', value: data.profile.macroTargets.fat, unit: 'g', color: '#f5a623' },
                  ].map((m) => (
                    <div key={m.label} className="flex-1 text-center bg-surface-raised rounded-lg py-1.5">
                      <div className="text-sm font-bold" style={{ color: m.color }}>{m.value}{m.unit}</div>
                      <div className="text-[9px] text-text-muted">{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Range stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Workouts */}
              <div className="card p-3 space-y-0.5">
                <div className="text-[9px] text-text-muted uppercase tracking-wider">Workouts</div>
                <div className="text-2xl font-bold" style={{ color: '#e8572a' }}>{rangeStats.workoutsInRange}</div>
                <div className="text-[10px] text-text-muted">in {chartRange} days</div>
              </div>
              {/* Weight change */}
              <div className="card p-3 space-y-0.5">
                <div className="text-[9px] text-text-muted uppercase tracking-wider">Weight</div>
                {rangeStats.avgWeight != null ? (
                  <>
                    <div className="text-2xl font-bold" style={{ color: '#5b6ef5' }}>{rangeStats.avgWeight.toFixed(1)}<span className="text-xs font-normal text-text-muted ml-0.5">lbs avg</span></div>
                    {rangeStats.weightDelta != null && (
                      <div className={`text-[11px] font-medium ${rangeStats.weightDelta < 0 ? 'text-success' : rangeStats.weightDelta > 0 ? 'text-danger' : 'text-text-muted'}`}>
                        {rangeStats.weightDelta > 0 ? '+' : ''}{rangeStats.weightDelta.toFixed(1)} lbs change
                      </div>
                    )}
                  </>
                ) : <div className="text-sm text-text-muted">No data</div>}
              </div>
              {/* Avg calories */}
              <div className="card p-3 space-y-0.5">
                <div className="text-[9px] text-text-muted uppercase tracking-wider">Avg Calories</div>
                {rangeStats.avgCal != null ? (
                  <>
                    <div className="text-2xl font-bold" style={{ color: '#f5a623' }}>{rangeStats.avgCal.toLocaleString()}</div>
                    {rangeStats.calTarget && rangeStats.calHit != null && (
                      <div className="text-[10px] text-text-muted">On target {rangeStats.calHit}/{rangeStats.loggedDays} days</div>
                    )}
                  </>
                ) : <div className="text-sm text-text-muted">No data</div>}
              </div>
              {/* Avg protein */}
              <div className="card p-3 space-y-0.5">
                <div className="text-[9px] text-text-muted uppercase tracking-wider">Avg Protein</div>
                {rangeStats.avgProtein != null ? (
                  <>
                    <div className="text-2xl font-bold" style={{ color: '#5b6ef5' }}>{rangeStats.avgProtein}<span className="text-xs font-normal text-text-muted ml-0.5">g</span></div>
                    {rangeStats.proteinTarget && rangeStats.proteinHit != null && (
                      <div className="text-[10px] text-text-muted">Hit target {rangeStats.proteinHit}/{rangeStats.loggedDays} days</div>
                    )}
                  </>
                ) : <div className="text-sm text-text-muted">No data</div>}
              </div>
              {/* Nutrition logged */}
              <div className="card p-3 space-y-0.5">
                <div className="text-[9px] text-text-muted uppercase tracking-wider">Nutrition Logged</div>
                <div className="text-2xl font-bold" style={{ color: '#f5a623' }}>{rangeStats.loggedDays}</div>
                <div className="text-[10px] text-text-muted">of {chartRange} days</div>
              </div>
              {/* Steps */}
              {rangeStats.avgSteps != null ? (
                <div className="card p-3 space-y-0.5">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Avg Steps</div>
                  <div className="text-2xl font-bold" style={{ color: '#2e9e6b' }}>{rangeStats.avgSteps.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">per day</div>
                </div>
              ) : (
                <div className="card p-3 space-y-0.5">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Weigh-ins</div>
                  <div className="text-2xl font-bold" style={{ color: '#5b6ef5' }}>{rangeStats.weightCount}</div>
                  <div className="text-[10px] text-text-muted">in {chartRange} days</div>
                </div>
              )}
            </div>

            {/* Weight sparkline */}
            {weightChartData.length >= 2 && (
              <div className="card p-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Weight Trend</div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightChartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} width={32} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} formatter={(v) => [`${v} lbs`, 'Weight']} />
                      <Line type="monotone" dataKey="w" stroke="#5b6ef5" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Calorie bar chart */}
            {nutritionTrendData.length >= 3 && (
              <div className="card p-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Calories</div>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nutritionTrendData} barSize={chartRange <= 7 ? 20 : chartRange <= 30 ? 10 : 5}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} width={32} domain={[0, 'auto']} />
                      <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                      {data.profile.macroTargets && <ReferenceLine y={data.profile.macroTargets.calories} stroke="#e8572a" strokeDasharray="4 2" strokeWidth={1} />}
                      <Bar dataKey="cal" fill="#e8572a" radius={[2, 2, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Today's nutrition vs targets */}
            {data.profile.macroTargets && todayTotals.calories > 0 && (
              <div className="card p-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Today's Nutrition</div>
                <MacroSummary totals={{ ...todayTotals, fiber: 0 }} targets={data.profile.macroTargets} />
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
            {workoutFrequencyData.some((w) => w.workouts > 0) && (
              <div className="card p-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Workouts per Week</div>
                <div className="text-[10px] text-text-muted mb-3">{rangeStats.workoutsInRange} workouts in {chartRange} days</div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workoutFrequencyData} barSize={chartRange <= 7 ? 28 : chartRange <= 30 ? 18 : 12}>
                      <XAxis dataKey="week" tick={{ fontSize: 9 }} interval={chartRange <= 30 ? 0 : 'preserveStartEnd'} />
                      <YAxis tick={{ fontSize: 9 }} width={20} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                      <Bar dataKey="workouts" fill="#e8572a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
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
            {nutritionTrendData.length >= 3 && (
              <div className="card p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Nutrition Trends</div>
                  {rangeStats.avgCal != null && (
                    <div className="text-[10px] text-text-muted">avg {rangeStats.avgCal.toLocaleString()} cal · {rangeStats.avgProtein}g protein</div>
                  )}
                </div>
                {/* Calorie trend */}
                <div>
                  <div className="text-[10px] text-text-muted mb-1">Calories vs Target</div>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={nutritionTrendData} barSize={chartRange <= 7 ? 20 : chartRange <= 30 ? 10 : 5}>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} width={32} domain={[0, 'auto']} />
                        <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                        {data.profile.macroTargets && <ReferenceLine y={data.profile.macroTargets.calories} stroke="#e8572a" strokeDasharray="4 2" strokeWidth={1} />}
                        <Bar dataKey="cal" fill="#e8572a" radius={[2, 2, 0, 0]} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Protein trend */}
                <div>
                  <div className="text-[10px] text-text-muted mb-1">Daily Protein (g)</div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={nutritionTrendData}>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} width={28} />
                        <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                        {data.profile.macroTargets && <ReferenceLine y={data.profile.macroTargets.protein} stroke="#5b6ef5" strokeDasharray="4 2" strokeWidth={1} />}
                        <Line type="monotone" dataKey="protein" stroke="#5b6ef5" strokeWidth={1.5} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Carbs + fat */}
                <div>
                  <div className="text-[10px] text-text-muted mb-1">Carbs &amp; Fat (g)</div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={nutritionTrendData}>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} width={28} />
                        <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                        <Line type="monotone" dataKey="carbs" stroke="#2e9e6b" strokeWidth={1.5} dot={false} connectNulls name="Carbs" />
                        <Line type="monotone" dataKey="fat" stroke="#f5a623" strokeWidth={1.5} dot={false} connectNulls name="Fat" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[9px] flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#2e9e6b' }} />Carbs</span>
                    <span className="text-[9px] flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#f5a623' }} />Fat</span>
                  </div>
                </div>
              </div>
            )}
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
              <>
                {weightChartData.length >= 2 && (
                  <div className="card p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Weight Trend</div>
                      <div className="text-[10px] text-text-muted">
                        {weightChartData.length} entries · {rangeStats.weightDelta != null ? (
                          <span className={rangeStats.weightDelta < 0 ? 'text-success' : rangeStats.weightDelta > 0 ? 'text-danger' : ''}>
                            {rangeStats.weightDelta > 0 ? '+' : ''}{rangeStats.weightDelta.toFixed(1)} lbs
                          </span>
                        ) : 'no change'}
                      </div>
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weightChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9 }} width={32} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} formatter={(v) => [`${v} lbs`, 'Weight']} />
                          <Line type="monotone" dataKey="w" stroke="#5b6ef5" strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              <div className="space-y-2">
                <button
                  onClick={() => setWeighInsOpen((o) => !o)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary uppercase tracking-wider py-1"
                >
                  <span>Recent Weigh-ins ({recentMeasurements.filter((m) => m.weight).length})</span>
                  <span className="text-text-muted">{weighInsOpen ? '▴' : '▾'}</span>
                </button>
                {weighInsOpen && recentMeasurements.filter((m) => m.weight).map((m, i, arr) => {
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
              {stepsTrendData.length >= 7 && (
                <div className="card p-4 mt-3">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Steps (last 60 days)</div>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stepsTrendData} barSize={8}>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} width={36} />
                        <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} formatter={(v) => [`${Number(v).toLocaleString()} steps`, 'Steps']} />
                        <Bar dataKey="steps" fill="#2e9e6b" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {bodyMeasurementsData.length >= 2 && (
                <div className="card p-4 mt-3">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Body Measurements</div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bodyMeasurementsData}>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} width={28} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />
                        {['waist', 'chest', 'hips', 'arms'].some((k) => bodyMeasurementsData.some((d) => d[k as keyof typeof d] != null)) && (
                          <>
                            <Line type="monotone" dataKey="waist" stroke="#e8572a" strokeWidth={1.5} dot={false} connectNulls name="Waist" />
                            <Line type="monotone" dataKey="chest" stroke="#5b6ef5" strokeWidth={1.5} dot={false} connectNulls name="Chest" />
                            <Line type="monotone" dataKey="hips" stroke="#2e9e6b" strokeWidth={1.5} dot={false} connectNulls name="Hips" />
                            <Line type="monotone" dataKey="arms" stroke="#f5a623" strokeWidth={1.5} dot={false} connectNulls name="Arms" />
                          </>
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {[['waist','#e8572a'],['chest','#5b6ef5'],['hips','#2e9e6b'],['arms','#f5a623']].map(([k,c]) =>
                      bodyMeasurementsData.some((d) => d[k as keyof typeof d] != null) ? (
                        <span key={k} className="text-[9px] flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c }} />{k}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              )}
              </>
            )}

            {data.photoMeta && data.photoMeta.length > 0 && (
              <div className="card p-3">
                <button
                  onClick={() => setPhotosOpen((o) => !o)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary uppercase tracking-wider py-1"
                >
                  <span>Progress Photos ({data.photoMeta.length})</span>
                  <span className="text-text-muted">{photosOpen ? '▴' : '▾'}</span>
                </button>
                {photosOpen && (
                  <div className="mt-3">
                    <CoachPhotoSection
                      photoMeta={data.photoMeta}
                      photoUrls={photoUrls}
                      photosLoading={photosLoading}
                      onView={(url, date, pose, weight, list) => { setViewingPhoto({ url, date, pose, weight }); setViewingPhotoList(list || []); }}
                    />
                  </div>
                )}
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
        {tab === 'checkins' && (<>{checkInTrend.length >= 2 && <div className="card p-4 space-y-3"><div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Check-In Trends</div><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={checkInTrend}><XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" /><YAxis domain={[1, 10]} tick={{ fontSize: 9 }} width={20} /><Tooltip contentStyle={{ fontSize: 11, background: '#1a1a1f', border: '1px solid #333', borderRadius: 8 }} />{DEFAULT_CHECKIN_QUESTIONS.map((q, i) => <Line key={q.id} type="monotone" dataKey={q.id} name={q.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div><div className="flex flex-wrap gap-x-3 gap-y-1">{DEFAULT_CHECKIN_QUESTIONS.map((q, i) => <span key={q.id} className="text-[9px] flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />{q.label}</span>)}</div></div>}{(!data.checkIns || data.checkIns.length === 0) ? <p className="text-sm text-text-muted text-center py-8">No check-ins</p> : <div className="space-y-2"><div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">History</div>{[...data.checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 21).map((ci) => <div key={ci.id} className="card p-3 space-y-2"><div className="text-xs font-semibold">{ci.date}</div><div className="space-y-1.5">{ci.responses.map((r) => { const q = DEFAULT_CHECKIN_QUESTIONS.find((qq) => qq.id === r.questionId); return <div key={r.questionId} className="flex items-center justify-between"><span className="text-xs text-text-secondary">{q?.label || r.questionId}</span>{typeof r.value === 'number' ? <div className="flex items-center gap-1"><div className="w-16 h-1.5 rounded-full bg-surface-raised overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / 10) * 100}%`, backgroundColor: r.value >= 7 ? '#2e9e6b' : r.value >= 4 ? '#f5a623' : '#e85757' }} /></div><span className="text-xs font-medium w-5 text-right">{r.value}</span></div> : <span className="text-xs text-text-muted">{r.value}</span>}</div>; })}</div>{ci.notes && <p className="text-[10px] text-text-muted italic">{ci.notes}</p>}</div>)}</div>}</>)}

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
      {viewingPhoto && (
        <CoachPhotoViewer
          photo={viewingPhoto}
          photos={viewingPhotoList}
          onNavigate={setViewingPhoto}
          onClose={() => setViewingPhoto(null)}
        />
      )}
    </div>
  );
}

const COACH_POSES = [
  { value: 'front',      label: 'Front'  },
  { value: 'back',       label: 'Back'   },
  { value: 'side_left',  label: 'Side L' },
  { value: 'side_right', label: 'Side R' },
] as const;

function CoachPhotoSection({ photoMeta, photoUrls, photosLoading, onView }: {
  photoMeta: CoachPhotoMeta[];
  photoUrls: Record<string, string>;
  photosLoading: boolean;
  onView: (url: string, date: string, pose: string, weight?: number, list?: { url: string; date: string; pose: string; weight?: number }[]) => void;
}) {
  const [poseFilter, setPoseFilter] = useState<string>('all');

  const sorted = [...photoMeta].sort((a, b) => b.date.localeCompare(a.date));

  const poseGroups = COACH_POSES.map((p) => ({
    ...p,
    photos: sorted.filter((m) => m.pose === p.value),
    latest: sorted.find((m) => m.pose === p.value) || null,
  })).filter((g) => g.photos.length > 0);

  const displayed = poseFilter === 'all' ? sorted : sorted.filter((m) => m.pose === poseFilter);

  const toViewerItem = (m: CoachPhotoMeta) => ({ url: photoUrls[m.photoId] || '', date: m.date, pose: m.pose, weight: m.weight });

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex-1">
          Progress Photos {photosLoading && <span className="text-text-muted text-[10px] font-normal">(loading…)</span>}
        </div>
      </div>

      {/* Category tiles */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        <button
          onClick={() => setPoseFilter('all')}
          className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 transition-colors ${poseFilter === 'all' ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-surface'}`}
        >
          <span className={`text-[10px] font-semibold ${poseFilter === 'all' ? 'text-accent-blue' : 'text-text-muted'}`}>All</span>
          <span className={`text-[9px] ${poseFilter === 'all' ? 'text-accent-blue/70' : 'text-text-muted'}`}>{photoMeta.length}</span>
        </button>
        {poseGroups.map((g) => (
          <button
            key={g.value}
            onClick={() => setPoseFilter(g.value)}
            className={`flex-shrink-0 relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors ${poseFilter === g.value ? 'border-accent-blue' : 'border-border'}`}
          >
            {g.latest && photoUrls[g.latest.photoId] ? (
              <img src={photoUrls[g.latest.photoId]} alt={g.label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-surface-raised" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 px-1 pb-0.5 text-center">
              <div className="text-[9px] font-bold text-white">{g.label}</div>
              <div className="text-[8px] text-white/60">{g.photos.length}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Grid — grouped by pose when "all", flat when filtered */}
      {poseFilter === 'all' ? (
        <div className="space-y-4">
          {poseGroups.map((g) => {
            const list = g.photos.map(toViewerItem).filter((x) => x.url);
            return (
              <div key={g.value}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">{g.label}</span>
                  {g.photos.length > 3 && (
                    <button onClick={() => setPoseFilter(g.value)} className="text-[10px] text-accent-blue">
                      See all {g.photos.length} →
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {g.photos.slice(0, 6).map((p) => (
                    <div key={p.photoId} className="flex flex-col gap-0.5">
                      <button
                        onClick={() => { if (photoUrls[p.photoId]) onView(photoUrls[p.photoId], p.date, p.pose, p.weight, list); }}
                        className="relative rounded-xl overflow-hidden aspect-[3/4] bg-surface-raised active:scale-95 transition-transform"
                      >
                        {photoUrls[p.photoId]
                          ? <img src={photoUrls[p.photoId]} alt={p.pose} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-text-muted"><RefreshCw size={12} className={photosLoading ? 'animate-spin' : ''} /></div>}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1">
                          <div className="text-[8px] text-white/90 font-medium">{p.date}</div>
                        </div>
                      </button>
                      {p.weight != null && <div className="text-[9px] text-text-muted text-center">{p.weight} lbs</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(() => {
            const list = displayed.map(toViewerItem).filter((x) => x.url);
            return displayed.map((p) => (
              <div key={p.photoId} className="flex flex-col gap-0.5">
                <button
                  onClick={() => { if (photoUrls[p.photoId]) onView(photoUrls[p.photoId], p.date, p.pose, p.weight, list); }}
                  className="relative rounded-xl overflow-hidden aspect-[3/4] bg-surface-raised active:scale-95 transition-transform"
                >
                  {photoUrls[p.photoId]
                    ? <img src={photoUrls[p.photoId]} alt={p.pose} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-text-muted"><RefreshCw size={12} className={photosLoading ? 'animate-spin' : ''} /></div>}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1">
                    <div className="text-[8px] text-white/90 font-medium">{p.date}</div>
                  </div>
                </button>
                {p.weight != null && <div className="text-[9px] text-text-muted text-center">{p.weight} lbs</div>}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function CoachPhotoViewer({ photo, photos, onNavigate, onClose }: {
  photo: { url: string; date: string; pose: string; weight?: number };
  photos: { url: string; date: string; pose: string; weight?: number }[];
  onNavigate: (p: { url: string; date: string; pose: string; weight?: number }) => void;
  onClose: () => void;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const currentIdx = photos.findIndex((p) => p.url === photo.url && p.date === photo.date);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < photos.length - 1;

  const goNext = () => { if (hasNext) onNavigate(photos[currentIdx + 1]); };
  const goPrev = () => { if (hasPrev) onNavigate(photos[currentIdx - 1]); };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); else goPrev();
    }
  };

  const showDots = photos.length > 0 && photos.length <= 9;
  const poseName: Record<string, string> = { front: 'Front', back: 'Back', side_left: 'Side L', side_right: 'Side R' };

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <div>
          <div className="text-sm font-medium text-white">{photo.date} · {poseName[photo.pose] || photo.pose}</div>
          {photo.weight && <div className="text-xs text-white/60">{photo.weight} lbs</div>}
        </div>
        <button onClick={onClose} className="p-2 text-white/70 hover:text-white"><X size={20} /></button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
      >
        {hasPrev && (
          <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white/80">
            <ChevronLeft size={22} />
          </button>
        )}
        {hasNext && (
          <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white/80">
            <ChevronRight size={22} />
          </button>
        )}
        <img src={photo.url} alt={photo.pose} className="max-w-full max-h-full object-contain p-4" style={{ touchAction: 'pinch-zoom' }} onClick={(e) => e.stopPropagation()} />
        {photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 rounded-full px-3 py-1.5">
            <ChevronLeft size={11} className="text-white/50" />
            <span className="text-[10px] text-white/50">swipe</span>
            <ChevronRight size={11} className="text-white/50" />
          </div>
        )}
      </div>

      {/* Position indicator */}
      {photos.length > 1 && (
        <div className="flex items-center justify-center pb-4 gap-1.5">
          {showDots ? (
            photos.map((_, i) => (
              <button key={i} onClick={() => onNavigate(photos[i])}
                className={`rounded-full transition-all ${i === currentIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30'}`}
              />
            ))
          ) : (
            <span className="text-[11px] text-white/50">{currentIdx + 1} / {photos.length}</span>
          )}
        </div>
      )}
    </div>
  );
}
