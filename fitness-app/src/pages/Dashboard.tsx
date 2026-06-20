import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Trophy, Loader2, Zap, ChevronRight, Dumbbell, HardDrive } from 'lucide-react';

import type { Profile, WorkoutSession, FoodEntry, Measurement, Program } from '../types';
import { getGreeting, today, getWeekDates } from '../utils/dateHelpers';
import { getSessionsByProfile } from '../db/workouts';
import { getFoodEntriesByDate, getFoodEntriesByProfile } from '../db/nutrition';
import { getMeasurementsByProfile } from '../db/progress';
import { getAllPrograms, initializePrograms } from '../db/programs';
import { calculateAutoAdjustment, type AutoAdjustResult } from '../utils/tdee';
import { getDashboardConfig } from '../utils/dashboardConfig';
import { daysSinceBackup } from '../utils/backupReminder';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useCoach } from '../hooks/useCoach';
import { CoachReviewCard } from '../components/dashboard/CoachReviewCard';

import WeeklyRing from '../components/dashboard/WeeklyRing';
import MacroSummary from '../components/dashboard/MacroSummary';
import TrendSnapshotCard from '../components/dashboard/TrendSnapshotCard';

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
  const [loading, setLoading] = useState(true);
  const [autoAdjust, setAutoAdjust] = useState<AutoAdjustResult | null>(null);

  const dashConfig = getDashboardConfig();

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        await initializePrograms();

        const [sessionsData, foodData, measurementsData, programsData, allFoodData] = await Promise.all([
          getSessionsByProfile(profile.id),
          getFoodEntriesByDate(profile.id, today()),
          getMeasurementsByProfile(profile.id),
          getAllPrograms(),
          getFoodEntriesByProfile(profile.id),
        ]);

        if (cancelled) return;

        setSessions(sessionsData);
        setFoodEntries(foodData);
        setAllFoodEntries(allFoodData);
        setMeasurements(measurementsData);
        setPrograms(programsData);

        if (profile.bodyStats) {
          const weightEntries = measurementsData
            .filter((m) => m.weight != null)
            .map((m) => ({ date: m.date, weight: m.weight!, unit: m.weightUnit }));
          const result = calculateAutoAdjustment(
            weightEntries,
            profile.macroTargets.calories,
            profile.bodyStats.fitnessGoal
          );
          setAutoAdjust(result);
        }
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
    return sessions.filter((s) => weekDates.has(s.date)).length;
  }, [sessions]);

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
    if (foodEntries.length > 0) activityDates.add(today());

    let count = 0;
    let checkDate = today();
    while (activityDates.has(checkDate)) {
      count++;
      const d = new Date(checkDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split('T')[0];
    }
    return count;
  }, [sessions, foodEntries]);

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
  }, [sessions]);

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

      {/* Auto-adjust banner */}
      {autoAdjust?.shouldAdjust && (
        <button
          onClick={() => navigate('/settings')}
          className="bg-surface rounded-2xl p-4 flex items-center gap-3 w-full text-left active:scale-[0.98] transition-transform"
        >
          <Zap size={16} className="text-text-primary" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Calorie adjustment ready</div>
            <div className="text-[11px] text-text-muted truncate">
              {autoAdjust.reason.split('.')[0]}
            </div>
          </div>
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      )}

      {/* Coach changes review */}
      {pendingChanges && pendingChanges.items.length > 0 && (
        <CoachReviewCard
          pendingChanges={pendingChanges}
          profile={profile}
          onUpdateProfile={onUpdateProfile}
          onFinalize={finalizeResponses}
        />
      )}

      {/* Backup reminder — only for local-only profiles */}
      {!googleSignedIn && (
        <button
          onClick={() => navigate('/settings')}
          className="bg-surface rounded-2xl p-4 flex items-center gap-3 w-full text-left active:scale-[0.98] transition-transform"
        >
          <HardDrive size={16} className="text-accent-blue" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Back up your data</div>
            <div className="text-[11px] text-text-muted">
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
        <WeeklyRing completed={weeklyWorkoutCount} target={5} />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Flame size={14} className="text-text-muted" />
            <span className="text-sm"><span className="font-semibold">{streak}</span> <span className="text-text-muted">day streak</span></span>
          </div>
          <div className="flex items-center gap-3">
            <Trophy size={14} className="text-text-muted" />
            <span className="text-sm"><span className="font-semibold">{prsThisWeek}</span> <span className="text-text-muted">PRs this week</span></span>
          </div>
        </div>
      </div>

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
              <div className="text-[11px] text-text-muted">{nextTrainingDay.title} · {nextTrainingDay.exercises.length} exercises</div>
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

      {/* Today's Nutrition */}
      <div className="card">
        <h2 className="label mb-3">Today's Nutrition</h2>
        <MacroSummary totals={macroTotals} targets={profile.macroTargets} />
      </div>

      {/* Snapshot Cards — driven by dashboard config */}

      {dashConfig.calories && (
        <TrendSnapshotCard
          title="Weekly Intake"
          metric="calories"
          measurements={measurements}
          sessions={sessions}
          units={profile.units}
          measurementUnit={profile.measurementUnit}
          calorieData={caloriesByDate}
          calorieTarget={profile.macroTargets.calories}
          onDayClick={(date) => navigate('/nutrition', { state: { date } })}
        />
      )}

      {dashConfig.weight && (
        <TrendSnapshotCard
          title="Body Weight"
          metric="weight"
          measurements={measurements}
          sessions={sessions}
          units={profile.units}
          measurementUnit={profile.measurementUnit}
        />
      )}

      {dashConfig.measurements && dashConfig.selectedMeasurement && (
        <TrendSnapshotCard
          title={MEASUREMENT_LABELS[dashConfig.selectedMeasurement] || dashConfig.selectedMeasurement}
          metric="measurement"
          measurements={measurements}
          sessions={sessions}
          units={profile.units}
          measurementUnit={profile.measurementUnit}
          measurementKey={dashConfig.selectedMeasurement}
        />
      )}

      {dashConfig.lifts && dashConfig.selectedLift && liftExerciseIds.length > 0 && (
        <TrendSnapshotCard
          title={dashConfig.selectedLift}
          metric="lift"
          measurements={measurements}
          sessions={sessions}
          units={profile.units}
          measurementUnit={profile.measurementUnit}
          liftExerciseIds={liftExerciseIds}
        />
      )}
    </div>
  );
}
