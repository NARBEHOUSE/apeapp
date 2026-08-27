import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Trophy, Loader2, Zap, ChevronRight, Dumbbell, HardDrive, ClipboardCheck, Check, GripVertical, Pencil } from 'lucide-react';

import type { Profile, WorkoutSession, FoodEntry, Measurement, Program, CheckInEntry, StepEntry, WaterEntry } from '../types';
import { getGreeting, today, getWeekDates, daysAgo, formatShortDate } from '../utils/dateHelpers';
import { getSessionsByProfile } from '../db/workouts';
import { getFoodEntriesByDate, getFoodEntriesByProfile } from '../db/nutrition';
import { getMeasurementsByProfile } from '../db/progress';
import { getAllPrograms, initializePrograms } from '../db/programs';
import { getDB } from '../db';
import {
  calculateAutoAdjustment,
  rescaleMacrosToCalories,
  computeBaselineWeightLbs,
  checkBaselineRecovery,
  BASELINE_RECOVERY_TOLERANCE_LBS,
  kgToLbs,
  type AutoAdjustResult,
} from '../utils/tdee';
import { getDashboardConfig, saveDashboardConfig } from '../utils/dashboardConfig';
import { getApiKey } from '../utils/apiKeyManager';
import { daysSinceBackup } from '../utils/backupReminder';
import { getMacroTargetsForDate, getFitnessGoalForDate, getTargetEffectiveDate } from '../utils/macroTargetHistory';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useCoach } from '../hooks/useCoach';
import { CoachReviewCard } from '../components/dashboard/CoachReviewCard';

import WeeklyRing from '../components/dashboard/WeeklyRing';
import MacroSummary from '../components/dashboard/MacroSummary';
import TrendSnapshotCard from '../components/dashboard/TrendSnapshotCard';
import { WeeklyInsights } from '../components/dashboard/WeeklyInsights';
import { AICoachCard } from '../components/dashboard/AICoachCard';
import { StepsCard } from '../components/dashboard/StepsCard';
import { WaterCard } from '../components/dashboard/WaterCard';
import { CalendarHeatmap } from '../components/dashboard/CalendarHeatmap';
import { ZeroMacroWarning } from '../components/dashboard/ZeroMacroWarning';
import { toast } from '../components/shared/Toast';

type CardId =
  | 'nutrition' | 'aiCoach' | 'water' | 'weeklyInsights'
  | 'steps' | 'calendar' | 'calories' | 'weight' | 'measurements' | 'lifts';

const DEFAULT_CARD_ORDER: CardId[] = [
  'nutrition', 'aiCoach', 'water', 'weeklyInsights',
  'steps', 'calendar', 'calories', 'weight', 'measurements', 'lifts',
];

function mergeCardOrder(saved: string[] | undefined): CardId[] {
  if (!saved) return DEFAULT_CARD_ORDER;
  const valid = saved.filter((id): id is CardId => DEFAULT_CARD_ORDER.includes(id as CardId));
  const merged = [...valid];
  for (const id of DEFAULT_CARD_ORDER) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

interface DashboardProps {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  waist: 'Waist', chest: 'Chest', shoulders: 'Shoulders',
  leftArm: 'Left Arm', rightArm: 'Right Arm',
  leftThigh: 'Left Thigh', rightThigh: 'Right Thigh',
  hips: 'Hips', neck: 'Neck',
};

export default function Dashboard({ profile, onUpdateProfile }: DashboardProps) {
  const navigate = useNavigate();
  const { isSignedIn: googleSignedIn } = useGoogleAuth();
  const { pendingChanges, checkForCoachChanges, finalizeResponses, syncCoachFiles, myCoachRels } = useCoach();

  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [allFoodEntries, setAllFoodEntries] = useState<FoodEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInEntry[]>([]);
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoAdjustDismissed, setAutoAdjustDismissed] = useState(() => localStorage.getItem('fitos-dismiss-auto-adjust') === today());

  const dashConfig = getDashboardConfig();

  const [editingLayout, setEditingLayout] = useState(false);
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => mergeCardOrder(getDashboardConfig().cardOrder));
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  const dragIdRef = useRef<CardId | null>(null);
  const cardRefMap = useRef(new Map<CardId, HTMLElement>());
  // Snapshot of card midpoints taken at drag-start; used throughout the drag so stale DOM doesn't affect results
  const dragSnapshotRef = useRef<{ id: CardId; midY: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        await initializePrograms();

        const db = await getDB();
        const [sessionsData, foodData, measurementsData, programsData, allFoodData, checkInsData, stepsData, waterData] = await Promise.all([
          getSessionsByProfile(profile.id),
          getFoodEntriesByDate(profile.id, today()),
          getMeasurementsByProfile(profile.id),
          getAllPrograms(),
          getFoodEntriesByProfile(profile.id),
          db.getAllFromIndex('checkIns', 'by-profile', profile.id),
          db.getAllFromIndex('steps', 'by-profile', profile.id),
          db.getAllFromIndex('water', 'by-profile', profile.id),
        ]);

        if (cancelled) return;

        setSessions(sessionsData);
        setFoodEntries(foodData);
        setAllFoodEntries(allFoodData);
        setMeasurements(measurementsData);
        setPrograms(programsData);
        setCheckIns(checkInsData);
        setSteps(stepsData);
        setWater(waterData);

      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [profile.id]);

  useEffect(() => {
    if (googleSignedIn && myCoachRels.length > 0) {
      syncCoachFiles().then(() => checkForCoachChanges());
    }
  }, [googleSignedIn, myCoachRels.length, syncCoachFiles, checkForCoachChanges]);

  // Periodic coach sync every 5 minutes + re-sync when tab regains focus or is hidden
  const coachSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataSavedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!googleSignedIn || myCoachRels.length === 0) return;
    const doSync = () => syncCoachFiles().then(() => checkForCoachChanges());
    coachSyncIntervalRef.current = setInterval(doSync, 5 * 60 * 1000);
    const handleVisibility = () => {
      // Sync both when regaining focus AND when losing it (tab close/switch away)
      doSync();
    };
    // Sync within 10s of any data save, debounced so rapid logging fires once
    const handleDataSaved = () => {
      if (dataSavedDebounceRef.current) clearTimeout(dataSavedDebounceRef.current);
      dataSavedDebounceRef.current = setTimeout(doSync, 10_000);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('ape-data-saved', handleDataSaved);
    return () => {
      if (coachSyncIntervalRef.current) clearInterval(coachSyncIntervalRef.current);
      if (dataSavedDebounceRef.current) clearTimeout(dataSavedDebounceRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('ape-data-saved', handleDataSaved);
    };
  }, [googleSignedIn, myCoachRels.length, syncCoachFiles, checkForCoachChanges]);

  // Ticks forward on an interval and on tab refocus so date-derived values (weekly
  // workout count, streak, etc.) don't stay stuck on a stale day if the app is left
  // open across a day/week boundary without any data changing.
  const [dateTick, setDateTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setDateTick((t) => t + 1), 60_000);
    const handleVisibility = () => {
      if (!document.hidden) setDateTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const activeProgram = profile.activeProgram
    ? programs.find((p) => p.id === profile.activeProgram!.programId)
    : null;

  const nextTrainingDay = useMemo(() => {
    if (!profile.activeProgram || !activeProgram) return null;
    const days = activeProgram.days;
    let idx = (profile.activeProgram.lastCompletedDayIndex + 1) % days.length;
    for (let i = 0; i < days.length; i++) {
      const day = days[idx];
      if (day.exercises.length > 0) return day;
      idx = (idx + 1) % days.length;
    }
    return null;
  }, [profile.activeProgram, activeProgram]);

  const weeklyWorkoutCount = useMemo(() => {
    const weekDates = new Set(getWeekDates(today()));
    return sessions.filter((s) => weekDates.has(s.date) && s.status !== 'skipped').length;
  }, [sessions, dateTick]);

  const weeklyWorkoutSkipped = useMemo(() => {
    const weekDates = new Set(getWeekDates(today()));
    return sessions.filter((s) => weekDates.has(s.date) && s.status === 'skipped').length;
  }, [sessions, dateTick]);

  const weeklyWorkoutTarget = useMemo(() => {
    if (!activeProgram) return 0;
    if (activeProgram.daysPerWeek) return activeProgram.daysPerWeek;
    return activeProgram.days.filter((d) => d.exercises.length > 0).length;
  }, [activeProgram]);

  const checkInDue = useMemo(() => {
    if (!dashConfig.checkInReminder) return false;
    const freq = dashConfig.checkInFrequency;
    const sorted = [...checkIns].sort((a, b) => b.date.localeCompare(a.date));
    const lastCheckIn = sorted[0];
    if (!lastCheckIn) return true;
    const lastDate = new Date(lastCheckIn.date + 'T00:00:00');
    const now = new Date(today() + 'T00:00:00');
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
    if (freq === 'daily') return daysSince >= 1;
    if (freq === 'weekly') return daysSince >= 7;
    return daysSince >= 14;
  }, [checkIns, dashConfig.checkInReminder, dashConfig.checkInFrequency, dateTick]);

  const checkInCompletedToday = useMemo(() => {
    return checkIns.some((c) => c.date === today());
  }, [checkIns, dateTick]);

  const macroTotals = useMemo(() => {
    return foodEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories * entry.servingsConsumed,
        protein: acc.protein + entry.protein * entry.servingsConsumed,
        carbs: acc.carbs + entry.carbs * entry.servingsConsumed,
        fat: acc.fat + entry.fat * entry.servingsConsumed,
        fiber: acc.fiber + (entry.fiber || 0) * entry.servingsConsumed,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [foodEntries]);

  const streak = useMemo(() => {
    const activityDates = new Set<string>();
    sessions.forEach((s) => activityDates.add(s.date));
    allFoodEntries.forEach((e) => activityDates.add(e.date));
    water.forEach((w) => activityDates.add(w.date));
    steps.forEach((s) => activityDates.add(s.date));
    measurements.forEach((m) => activityDates.add(m.date));
    checkIns.forEach((c) => activityDates.add(c.date));

    // Start from today if anything was logged today, otherwise from yesterday
    // (so a rest day doesn't break the streak until the day after)
    const todayStr = today();
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split('T')[0];
    let checkDate = activityDates.has(todayStr) ? todayStr : yesterdayStr;

    let count = 0;
    while (activityDates.has(checkDate)) {
      count++;
      const cur = new Date(checkDate + 'T00:00:00');
      cur.setDate(cur.getDate() - 1);
      checkDate = cur.toISOString().split('T')[0];
    }
    return count;
  }, [sessions, allFoodEntries, water, steps, measurements, checkIns, dateTick]);

  const prsThisWeek = useMemo(() => {
    const weekDates = new Set(getWeekDates(today()));
    const weekSessions = sessions.filter((s) => weekDates.has(s.date));
    const olderSessions = sessions.filter((s) => !weekDates.has(s.date));

    const historicalMax: Record<string, number> = {};
    for (const session of olderSessions) {
      for (const [exerciseId, sets] of Object.entries(session.sets)) {
        for (const set of sets) {
          if (set.completed && set.weight > (historicalMax[exerciseId] || 0)) {
            historicalMax[exerciseId] = set.weight;
          }
        }
      }
    }

    let prCount = 0;
    const prExercises = new Set<string>();
    for (const session of weekSessions) {
      for (const [exerciseId, sets] of Object.entries(session.sets)) {
        for (const set of sets) {
          if (set.completed && set.weight > (historicalMax[exerciseId] || 0) && !prExercises.has(exerciseId)) {
            prCount++;
            prExercises.add(exerciseId);
          }
        }
      }
    }
    return prCount;
  }, [sessions, dateTick]);

  // Resolve lift exercise name to IDs from programs
  const liftExerciseIds = useMemo(() => {
    if (!dashConfig.lifts || !dashConfig.selectedLift) return [];
    const ids: string[] = [];
    for (const prog of programs) {
      for (const day of prog.days) {
        for (const ex of day.exercises) {
          if (ex.name === dashConfig.selectedLift) {
            ids.push(ex.id);
          }
        }
      }
    }
    return ids;
  }, [dashConfig.lifts, dashConfig.selectedLift, programs]);

  // Most recent logged weigh-in, normalized to lbs — used to tell whether an active
  // temporary correction has walked weight back to the plan's trajectory yet.
  const latestWeightLbs = useMemo(() => {
    const withWeight = measurements.filter((m) => m.weight != null);
    if (withWeight.length === 0) return null;
    const latest = [...withWeight].sort((a, b) => b.date.localeCompare(a.date))[0];
    return latest.weightUnit === 'kg' ? kgToLbs(latest.weight!) : latest.weight!;
  }, [measurements]);

  // Derived, not stored — so applying an adjustment, starting a correction, or resuming a
  // normal goal re-evaluates immediately. Held in state and computed once at load, this went
  // stale the moment the goal changed: resuming from a correction unhid a verdict still
  // measured against the correction's lower target, which read as "you're over your goal —
  // cut again" in the same breath as "you're back on track".
  const autoAdjust = useMemo<AutoAdjustResult | null>(() => {
    if (!profile.bodyStats) return null;
    const weightEntries = measurements
      .filter((m) => m.weight != null)
      .map((m) => ({ date: m.date, weight: m.weight!, unit: m.weightUnit }));
    if (weightEntries.length === 0) return null;
    const trackedCalories = allFoodEntries.map((e) => ({
      date: e.date,
      calories: e.calories * e.servingsConsumed,
    }));
    return calculateAutoAdjustment(
      weightEntries,
      profile.macroTargets.calories,
      profile.bodyStats.fitnessGoal,
      trackedCalories,
      {
        prescribedFor: (date) => getMacroTargetsForDate(profile, date).calories,
        targetChangedOn: getTargetEffectiveDate(profile, today()),
      }
    );
  }, [measurements, allFoodEntries, profile]);

  // Backfill a baseline weight for a correction that was already active before baseline-recovery
  // tracking existed, so it starts picking up "back on track" the same way a newly-started
  // correction does, instead of never checking. Self-limiting: once written, the guard below
  // stops matching.
  useEffect(() => {
    const activeOverride = profile.temporaryCalorieOverride;
    if (!activeOverride || activeOverride.baselineWeightLbs != null) return;
    if (!autoAdjust || latestWeightLbs == null) return;
    onUpdateProfile(profile.id, {
      temporaryCalorieOverride: {
        ...activeOverride,
        baselineWeightLbs: computeBaselineWeightLbs(latestWeightLbs, autoAdjust),
      },
    });
  }, [profile.temporaryCalorieOverride, profile.id, autoAdjust, latestWeightLbs, onUpdateProfile]);

  // Calorie data aggregated by date for the trend card
  const caloriesByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of allFoodEntries) {
      map[entry.date] = (map[entry.date] || 0) + entry.calories * entry.servingsConsumed;
    }
    return Object.entries(map)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allFoodEntries]);

  const handleQuickStart = (programId: string, dayId: string) => {
    navigate('/workout', { state: { programId, dayId } });
  };

  const handleDragStart = (e: React.PointerEvent, id: CardId) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIdRef.current = id;
    setDraggingId(id);
    // Snapshot midpoints of all OTHER visible cards at drag start.
    // We use these static positions throughout the drag so re-renders don't cause stale positions.
    const snapshot: { id: CardId; midY: number }[] = [];
    for (const cid of cardOrder) {
      if (cid === id) continue;
      const el = cardRefMap.current.get(cid);
      if (el) {
        const r = el.getBoundingClientRect();
        snapshot.push({ id: cid, midY: r.top + r.height / 2 });
      }
    }
    dragSnapshotRef.current = snapshot;
  };

  const handleDragMove = (e: React.PointerEvent) => {
    const id = dragIdRef.current;
    if (!id) return;
    const y = e.clientY;
    const others = dragSnapshotRef.current;

    // Find insertion index in the list of other cards using snapshot positions
    let insertIdx = others.findIndex((c) => y < c.midY);
    if (insertIdx === -1) insertIdx = others.length;

    // Build new order: insert dragged card at insertIdx within the others list
    const newOrder = others.map((c) => c.id);
    newOrder.splice(insertIdx, 0, id);

    setCardOrder((prev) => {
      if (newOrder.length === prev.length && newOrder.every((cid, i) => cid === prev[i])) return prev;
      return newOrder;
    });
  };

  const handleDragEnd = () => {
    dragIdRef.current = null;
    dragSnapshotRef.current = [];
    setDraggingId(null);
  };

  const exitEditMode = () => {
    setEditingLayout(false);
    setDraggingId(null);
    dragIdRef.current = null;
    const cfg = getDashboardConfig();
    saveDashboardConfig({ ...cfg, cardOrder });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        {profile.profilePhoto ? (
          <img src={profile.profilePhoto} alt={profile.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0"
            style={{ backgroundColor: profile.avatarColor }}
          >
            {profile.name[0]?.toUpperCase()}
          </div>
        )}
        <h1 className="text-lg font-semibold">
          {getGreeting()}, {profile.name}
        </h1>
      </div>

      {/* Birthday banner */}
      {profile.birthday && (() => {
        const bd = new Date(profile.birthday + 'T00:00:00');
        const now = new Date();
        const isBirthday = bd.getMonth() === now.getMonth() && bd.getDate() === now.getDate();
        const age = Math.floor((now.getTime() - bd.getTime()) / (365.25 * 86400000));
        if (!isBirthday) return null;
        return (
          <div className="bg-gradient-to-r from-accent/20 to-accent-blue/20 rounded-2xl p-4 text-center">
            <div className="text-2xl mb-1">🎂</div>
            <div className="text-sm font-bold">Happy Birthday, {profile.name}!</div>
            <div className="text-[0.6875rem] text-text-muted">{age} years strong</div>
          </div>
        );
      })()}

      {/* Auto-adjust banner: the prescribed goal itself looks off, suggest changing it */}
      {autoAdjust?.shouldAdjust && !autoAdjustDismissed && (
        <div className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Zap size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Calorie adjustment suggestion</div>
              <div className="text-[0.6875rem] text-text-muted mt-0.5">
                {autoAdjust.reason}
              </div>
              <div className="text-xs font-semibold mt-1">
                {profile.macroTargets.calories} → {autoAdjust.newCalories} cal/day
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const adjustedMacros = rescaleMacrosToCalories(profile.macroTargets, autoAdjust.newCalories);
                onUpdateProfile(profile.id, {
                  macroTargets: adjustedMacros,
                  lastAutoAdjustDate: new Date().toISOString().split('T')[0],
                  calorieAdjustments: [
                    ...(profile.calorieAdjustments || []),
                    { date: today(), previousCalories: profile.macroTargets.calories, newCalories: autoAdjust.newCalories, reason: autoAdjust.reason, avgWeeklyChange: autoAdjust.avgWeeklyChange, kind: 'goal-change' },
                  ],
                });
                localStorage.setItem('fitos-dismiss-auto-adjust', today());
                setAutoAdjustDismissed(true);
              }}
              className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-semibold active:scale-[0.98] transition-transform"
            >
              Apply ({autoAdjust.newCalories} cal)
            </button>
            <button
              onClick={() => { localStorage.setItem('fitos-dismiss-auto-adjust', today()); setAutoAdjustDismissed(true); }}
              className="py-2 px-4 rounded-xl bg-surface-raised text-xs text-text-muted font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Calibration banner: the plan is working, but the prescribed number is out of step with
          what's actually being eaten to make it work. Not a correction — the goal moves onto
          reality, nothing about the eating needs to change. */}
      {autoAdjust?.calibrationSuggestion && !autoAdjust.shouldAdjust && !autoAdjustDismissed && !profile.temporaryCalorieOverride && (
        <div className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Zap size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Your goal looks out of date</div>
              <div className="text-[0.6875rem] text-text-muted mt-0.5">
                {autoAdjust.calibrationSuggestion.reason}
              </div>
              <div className="text-xs font-semibold mt-1">
                {profile.macroTargets.calories} → {autoAdjust.calibrationSuggestion.calories} cal/day
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const cal = autoAdjust.calibrationSuggestion!;
                onUpdateProfile(profile.id, {
                  macroTargets: rescaleMacrosToCalories(profile.macroTargets, cal.calories),
                  lastAutoAdjustDate: today(),
                  calorieAdjustments: [
                    ...(profile.calorieAdjustments || []),
                    { date: today(), previousCalories: profile.macroTargets.calories, newCalories: cal.calories, reason: cal.reason, avgWeeklyChange: autoAdjust.avgWeeklyChange, kind: 'calibration' },
                  ],
                });
                localStorage.setItem('fitos-dismiss-auto-adjust', today());
                setAutoAdjustDismissed(true);
                toast(`Goal updated to ${cal.calories} cal/day`, 'success');
              }}
              className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-semibold active:scale-[0.98] transition-transform"
            >
              Update goal ({autoAdjust.calibrationSuggestion.calories} cal)
            </button>
            <button
              onClick={() => { localStorage.setItem('fitos-dismiss-auto-adjust', today()); setAutoAdjustDismissed(true); }}
              className="py-2 px-4 rounded-xl bg-surface-raised text-xs text-text-muted font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Adherence banner: the weight trend is explained by not eating at the goal, not by
          a bad goal — so the fix is following the plan, with an optional short correction. */}
      {autoAdjust?.adherenceIssue && !autoAdjustDismissed && !profile.temporaryCalorieOverride && (
        <div className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Zap size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Follow your current plan</div>
              <div className="text-[0.6875rem] text-text-muted mt-0.5">
                {autoAdjust.reason}
              </div>
            </div>
          </div>
          {autoAdjust.correctionSuggestion && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const cs = autoAdjust.correctionSuggestion!;
                  const correctedMacros = rescaleMacrosToCalories(profile.macroTargets, cs.calories);
                  const startDate = today();
                  onUpdateProfile(profile.id, {
                    macroTargets: correctedMacros,
                    temporaryCalorieOverride: {
                      days: cs.days,
                      startDate,
                      untilDate: daysAgo(-(cs.days - 1)),
                      reason: cs.reason,
                      resumeMacroTargets: profile.macroTargets,
                      baselineWeightLbs: latestWeightLbs != null ? computeBaselineWeightLbs(latestWeightLbs, autoAdjust) : undefined,
                    },
                    calorieAdjustments: [
                      ...(profile.calorieAdjustments || []),
                      { date: startDate, previousCalories: profile.macroTargets.calories, newCalories: cs.calories, reason: cs.reason, avgWeeklyChange: autoAdjust.avgWeeklyChange, kind: 'temporary-correction' },
                    ],
                  });
                  localStorage.setItem('fitos-dismiss-auto-adjust', today());
                  setAutoAdjustDismissed(true);
                  toast(`${cs.days}-day correction started: ${cs.calories} cal/day`, 'success');
                }}
                className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-semibold active:scale-[0.98] transition-transform"
              >
                Start {autoAdjust.correctionSuggestion.days}-day correction ({autoAdjust.correctionSuggestion.calories} cal)
              </button>
              <button
                onClick={() => { localStorage.setItem('fitos-dismiss-auto-adjust', today()); setAutoAdjustDismissed(true); }}
                className="py-2 px-4 rounded-xl bg-surface-raised text-xs text-text-muted font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active/expired temporary correction status */}
      {profile.temporaryCalorieOverride && (() => {
        const ov = profile.temporaryCalorieOverride;
        const expired = today() > ov.untilDate;
        const recovery = !expired && ov.baselineWeightLbs != null && latestWeightLbs != null
          ? checkBaselineRecovery(latestWeightLbs, ov.baselineWeightLbs)
          : null;
        const readyToResume = expired || !!recovery?.reached;
        return (
          <div className="bg-surface rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Zap size={16} className="text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {recovery?.reached ? 'Back near baseline' : expired ? 'Correction period ended' : 'Temporary correction active'}
                </div>
                <div className="text-[0.6875rem] text-text-muted mt-0.5">
                  {recovery?.reached
                    ? `You're back within ${BASELINE_RECOVERY_TOLERANCE_LBS} lb of where you were trending before — no need to finish out the full ${ov.days} days. Resume your normal ${ov.resumeMacroTargets.calories} cal/day goal?`
                    : expired
                    ? `Your ${ov.days}-day correction ended. Resume your normal ${ov.resumeMacroTargets.calories} cal/day goal?`
                    : recovery
                    ? `Eating ${profile.macroTargets.calories} cal/day through ${formatShortDate(ov.untilDate)} — ${Math.abs(recovery.deltaLbs).toFixed(1)} lb${Math.abs(recovery.deltaLbs) === 1 ? '' : 's'} from your pre-correction baseline.`
                    : `Eating ${profile.macroTargets.calories} cal/day through ${formatShortDate(ov.untilDate)}, then back to ${ov.resumeMacroTargets.calories} cal/day.`}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                onUpdateProfile(profile.id, {
                  macroTargets: ov.resumeMacroTargets,
                  temporaryCalorieOverride: undefined,
                  calorieAdjustments: [
                    ...(profile.calorieAdjustments || []),
                    { date: today(), previousCalories: profile.macroTargets.calories, newCalories: ov.resumeMacroTargets.calories, reason: recovery?.reached ? 'Resumed normal goal — weight back near baseline' : 'Resumed normal goal after temporary correction', avgWeeklyChange: 0, kind: 'resume' },
                  ],
                });
                toast(`Resumed ${ov.resumeMacroTargets.calories} cal/day`, 'success');
              }}
              className={
                readyToResume
                  ? 'w-full py-2 rounded-xl bg-accent text-white text-xs font-semibold active:scale-[0.98] transition-transform'
                  : 'w-full py-2 rounded-xl bg-surface-raised text-xs text-text-muted font-medium'
              }
            >
              Resume {ov.resumeMacroTargets.calories} cal/day now
            </button>
          </div>
        );
      })()}

      {/* Coach changes review */}
      {pendingChanges && pendingChanges.items.length > 0 && (
        <CoachReviewCard
          pendingChanges={pendingChanges}
          profile={profile}
          onUpdateProfile={onUpdateProfile}
          onFinalize={finalizeResponses}
        />
      )}

      {/* Zero-macro food warning */}
      <ZeroMacroWarning profileId={profile.id} />

      {/* Backup reminder — only for local-only profiles */}
      {!googleSignedIn && (
        <button
          onClick={() => navigate('/settings', { state: { section: 'data' } })}
          className="bg-surface rounded-2xl p-4 flex items-center gap-3 w-full text-left active:scale-[0.98] transition-transform"
        >
          <HardDrive size={16} className="text-accent-blue" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Back up your data</div>
            <div className="text-[0.6875rem] text-text-muted">
              {daysSinceBackup() === null
                ? "You haven't backed up yet — your data lives only on this device"
                : `Last backup was ${daysSinceBackup()} days ago`}
            </div>
          </div>
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4">
        {dashConfig.workoutCounter && activeProgram && (
          <WeeklyRing completed={weeklyWorkoutCount} skipped={weeklyWorkoutSkipped} target={weeklyWorkoutTarget} />
        )}
        {(dashConfig.streak || dashConfig.prs) && (
          <div className="flex-1 space-y-3">
            {dashConfig.streak && (
              <div className="flex items-center gap-3">
                <Flame size={14} className="text-text-muted" />
                <span className="text-sm"><span className="font-semibold">{streak}</span> <span className="text-text-muted">day streak</span></span>
              </div>
            )}
            {dashConfig.prs && (
              <div className="flex items-center gap-3">
                <Trophy size={14} className="text-text-muted" />
                <span className="text-sm"><span className="font-semibold">{prsThisWeek}</span> <span className="text-text-muted">PRs this week</span></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Check-in Reminder */}
      {dashConfig.checkInReminder && (checkInDue || checkInCompletedToday) && (
        <button
          onClick={() => navigate('/progress', { state: { tab: 'checkin' } })}
          className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        >
          {checkInCompletedToday ? (
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <Check size={18} className="text-green-500" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-accent-blue/15 flex items-center justify-center shrink-0">
              <ClipboardCheck size={18} className="text-accent-blue" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {checkInCompletedToday ? 'Check-in complete' : 'Time for your check-in'}
            </div>
            <div className="text-[0.6875rem] text-text-muted">
              {checkInCompletedToday
                ? `Done for today${dashConfig.checkInFrequency !== 'daily' ? ` • ${dashConfig.checkInFrequency === 'weekly' ? 'Weekly' : 'Bi-weekly'}` : ''}`
                : `${dashConfig.checkInFrequency === 'daily' ? 'Daily' : dashConfig.checkInFrequency === 'weekly' ? 'Weekly' : 'Bi-weekly'} check-in`}
            </div>
          </div>
          {!checkInCompletedToday && <ChevronRight size={14} className="text-text-muted" />}
        </button>
      )}

      {/* Next Workout */}
      {profile.activeProgram && activeProgram && nextTrainingDay && (
        <div>
          <h2 className="label mb-3">Next Workout</h2>
          <button
            onClick={() => handleQuickStart(profile.activeProgram!.programId, nextTrainingDay.id)}
            className="w-full bg-surface rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${nextTrainingDay.accent || 'var(--color-surface-raised)'}15` }}
            >
              <Dumbbell size={18} style={{ color: nextTrainingDay.accent || '#888' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{nextTrainingDay.tag}</div>
              <div className="text-[0.6875rem] text-text-muted">{nextTrainingDay.title} · {nextTrainingDay.exercises.length} exercises</div>
            </div>
            <span className="text-sm font-medium">Go</span>
          </button>
        </div>
      )}

      {/* No program nudge */}
      {!profile.activeProgram && (
        <button
          onClick={() => navigate('/workout')}
          className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        >
          <Dumbbell size={16} className="text-text-muted" />
          <span className="text-sm text-text-muted flex-1">Pick a training program to get started</span>
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      )}

      {/* Draggable card section */}
      <div className="flex items-center justify-between -mb-2">
        <span className="text-[0.625rem] text-text-muted/50 uppercase tracking-widest font-semibold select-none">Dashboard</span>
        {editingLayout ? (
          <button
            onClick={exitEditMode}
            className="text-xs font-semibold text-white bg-accent-blue px-3 py-1 rounded-lg active:scale-95 transition-transform"
          >
            Done
          </button>
        ) : (
          <button
            onClick={() => setEditingLayout(true)}
            className="flex items-center gap-1 text-[0.6875rem] text-text-muted active:scale-95 transition-transform"
          >
            <Pencil size={11} />
            Edit Layout
          </button>
        )}
      </div>

      {cardOrder.map((id) => {
        let content: React.ReactNode = null;

        if (id === 'nutrition') {
          content = (
            <div className="card">
              <h2 className="label mb-3">Today's Nutrition</h2>
              <MacroSummary totals={macroTotals} targets={profile.macroTargets} fiberTarget={profile.fiberTarget ?? 30} />
            </div>
          );
        } else if (id === 'aiCoach' && dashConfig.aiCoach && getApiKey()) {
          content = (
            <AICoachCard
              profile={profile}
              sessions={sessions}
              allFoodEntries={allFoodEntries}
              measurements={measurements}
              checkIns={checkIns}
              steps={steps}
              programs={programs}
              onUpdateProfile={onUpdateProfile}
            />
          );
        } else if (id === 'water' && dashConfig.water) {
          content = (
            <WaterCard water={water} profileId={profile.id} units={profile.units} onUpdate={async () => {
              const db = await getDB();
              setWater(await db.getAllFromIndex('water', 'by-profile', profile.id));
            }} />
          );
        } else if (id === 'weeklyInsights' && dashConfig.weeklyInsights) {
          content = (
            <WeeklyInsights
              sessions={sessions}
              allFoodEntries={allFoodEntries}
              measurements={measurements}
              checkIns={checkIns}
              macroTargets={profile.macroTargets}
              getTargetsForDate={(date) => getMacroTargetsForDate(profile, date)}
              getGoalForDate={(date) => getFitnessGoalForDate(profile, date)}
              units={profile.units}
            />
          );
        } else if (id === 'steps' && dashConfig.steps) {
          content = (
            <StepsCard steps={steps} profileId={profile.id} stepGoal={profile.stepGoal} onStepSaved={async () => {
              const db = await getDB();
              setSteps(await db.getAllFromIndex('steps', 'by-profile', profile.id));
            }} />
          );
        } else if (id === 'calendar' && dashConfig.calendar) {
          content = <CalendarHeatmap sessions={sessions} foodEntries={allFoodEntries} checkIns={checkIns} />;
        } else if (id === 'calories' && dashConfig.calories) {
          content = (
            <TrendSnapshotCard
              title="Weekly Intake"
              metric="calories"
              measurements={measurements}
              sessions={sessions}
              units={profile.units}
              measurementUnit={profile.measurementUnit}
              calorieData={caloriesByDate}
              calorieTarget={profile.macroTargets.calories}
              getTargetForDate={(date) => getMacroTargetsForDate(profile, date).calories}
              getGoalForDate={(date) => getFitnessGoalForDate(profile, date)}
              onDayClick={(date) => navigate('/nutrition', { state: { date } })}
            />
          );
        } else if (id === 'weight' && dashConfig.weight) {
          content = (
            <TrendSnapshotCard
              title="Body Weight"
              metric="weight"
              measurements={measurements}
              sessions={sessions}
              units={profile.units}
              measurementUnit={profile.measurementUnit}
            />
          );
        } else if (id === 'measurements' && dashConfig.measurements && dashConfig.selectedMeasurement) {
          content = (
            <TrendSnapshotCard
              title={MEASUREMENT_LABELS[dashConfig.selectedMeasurement] || dashConfig.selectedMeasurement}
              metric="measurement"
              measurements={measurements}
              sessions={sessions}
              units={profile.units}
              measurementUnit={profile.measurementUnit}
              measurementKey={dashConfig.selectedMeasurement}
            />
          );
        } else if (id === 'lifts' && dashConfig.lifts && dashConfig.selectedLift && liftExerciseIds.length > 0) {
          content = (
            <TrendSnapshotCard
              title={dashConfig.selectedLift}
              metric="lift"
              measurements={measurements}
              sessions={sessions}
              units={profile.units}
              measurementUnit={profile.measurementUnit}
              liftExerciseIds={liftExerciseIds}
            />
          );
        }

        if (!content) return null;

        return (
          <div
            key={id}
            ref={(el) => { if (el) cardRefMap.current.set(id, el); else cardRefMap.current.delete(id); }}
            className={`relative transition-all duration-150 ${editingLayout ? 'pl-8' : ''}`}
          >
            {editingLayout && (
              <div
                className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing z-10"
                onPointerDown={(e) => handleDragStart(e, id)}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
                <GripVertical size={15} className={draggingId === id ? 'text-accent-blue' : 'text-text-muted/40'} />
              </div>
            )}
            <div className={`transition-all duration-150 ${draggingId === id ? 'opacity-80 scale-[0.99] shadow-xl ring-2 ring-accent-blue/25 rounded-2xl' : ''}`}>
              {content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
