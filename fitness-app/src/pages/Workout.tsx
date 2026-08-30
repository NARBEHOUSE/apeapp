import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Dumbbell,
  History,
  Pencil,
  Loader2,
  Target,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Library,
  CheckCircle2,
  SkipForward,
  Play,
  BookmarkPlus,
  CalendarRange,
  Trash2,
} from 'lucide-react';
import type { Profile, Program, WorkoutSession, WorkoutDay as WorkoutDayType, ActiveProgramEnrollment, ProgramCompletion, Exercise } from '../types';
import { useWorkout } from '../hooks/useWorkout';
import { duplicateProgram, deleteProgram, saveProgram } from '../db/programs';
import { getAllPRs } from '../db/workouts';
import { today, localDateStr } from '../utils/dateHelpers';
import { WorkoutLibrary } from '../components/workout/WorkoutLibrary';
import {
  splitLibrary,
  buildWorkoutFromDay,
  buildWorkoutFromExercises,
  dayIdentityOf,
  blankWorkout,
  workoutDayOf,
  isSavedWorkout,
  muscleFocus,
  lastPerformedDate,
  formatDaysAgo,
  exerciseCount,
} from '../utils/workoutLibrary';
import { WorkoutDay } from '../components/workout/WorkoutDay';
import { ActiveWorkout } from '../components/workout/ActiveWorkout';
import { WorkoutHistory } from '../components/workout/WorkoutHistory';
import { WorkoutSummary } from '../components/workout/WorkoutSummary';
import { ProgramEditor } from '../components/workout/ProgramEditor';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Modal } from '../components/shared/Modal';
import { toast } from '../components/shared/Toast';

type View = 'home' | 'library' | 'days' | 'active' | 'editor' | 'creator' | 'enroll';

interface Props {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

const DURATION_PRESETS = [4, 6, 8, 12, 16];

/** The stand-in "day" for a freestyle session, which belongs to no library entry. */
const QUICK_DAY: WorkoutDayType = {
  id: 'quick', label: '', tag: 'Quick Workout', title: 'Freestyle',
  subtitle: '', accent: '#e8572a', note: '', exercises: [],
};
const QUICK_IDENTITY = { title: 'Quick Workout', tag: 'Quick Workout', accent: QUICK_DAY.accent };

function EnrollModalContent({ program, enrollWeeks, setEnrollWeeks, enrollment, activeProgram, onEnroll }: {
  program: Program;
  enrollWeeks: string;
  setEnrollWeeks: (v: string) => void;
  enrollment: ActiveProgramEnrollment | undefined;
  activeProgram: Program | null | undefined;
  onEnroll: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base mb-1">{program.name}</h3>
        <p className="text-sm text-text-muted">{program.description}</p>
        {program.goal && (
          <div className="flex items-center gap-2 text-xs text-text-muted mt-2">
            <Target size={12} />
            {program.goal.type} — {program.goal.description}
          </div>
        )}
      </div>

      <div>
        <label className="label mb-2 block">How long do you want to run this?</label>
        <div className="flex gap-2 flex-wrap mb-3">
          {DURATION_PRESETS.map((w) => (
            <button
              key={w}
              onClick={() => setEnrollWeeks(String(w))}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                enrollWeeks === String(w) ? 'bg-text-primary text-bg' : 'bg-surface-raised text-text-muted'
              }`}
            >
              {w} weeks
            </button>
          ))}
        </div>
        <input
          type="number"
          inputMode="numeric"
          className="input-field text-sm"
          placeholder="Custom weeks"
          value={enrollWeeks}
          onChange={(e) => setEnrollWeeks(e.target.value)}
        />
      </div>

      {enrollment && (
        <p className="text-xs text-warning">
          This will end your current program ({activeProgram?.name}) and start this one.
        </p>
      )}

      <button onClick={onEnroll} className="btn-primary w-full">
        {enrollment ? 'Switch to This Program' : 'Start Program'}
      </button>
    </div>
  );
}

export function Workout({ profile, onUpdateProfile }: Props) {
  const location = useLocation();
  const {
    programs,
    sessions,
    activeSession,
    loading,
    startWorkout,
    logSet,
    updateSet,
    removeExerciseFromSession,
    updateCardio,
    updateActiveSessionName,
    finishWorkout,
    cancelWorkout,
    skipWorkout,
    removeSession,
    updateSession,
    getPreviousSession,
    getLastPerformanceMap,
    refreshPrograms,
  } = useWorkout(profile.id);

  const [view, setView] = useState<View>(() => activeSession ? 'active' : 'home');
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeSession?.programId || null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(activeSession?.dayId || null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [editorMode, setEditorMode] = useState<'program' | 'workout'>('program');
  // Where to land after saving from the editor — editing out of the library should go
  // back to the library rather than dumping the user on the workout home screen.
  const [editorReturnView, setEditorReturnView] = useState<View>('home');
  // Same idea for the program-days view, which is now reachable from both the home
  // screen and the library — back should undo the step the user actually took.
  const [daysReturnView, setDaysReturnView] = useState<View>('library');
  const [enrollProgramId, setEnrollProgramId] = useState<string | null>(null);
  const [enrollWeeks, setEnrollWeeks] = useState('8');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [skipTarget, setSkipTarget] = useState<{ day: WorkoutDayType; index: number } | null>(null);
  const [summarySession, setSummarySession] = useState<WorkoutSession | null>(null);
  const [summaryPrs, setSummaryPrs] = useState<Record<string, { weight: number; reps: number; date: string }>>({});
  const [summaryPreviousPrs, setSummaryPreviousPrs] = useState<Record<string, { weight: number }>>({});
  const [summaryExercises, setSummaryExercises] = useState<Exercise[]>([]);
  const [quickEffortMetric, setQuickEffortMetric] = useState<'none' | 'rir' | 'rpe'>('rir');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [workoutsOpen, setWorkoutsOpen] = useState(true);
  const [pastProgramsOpen, setPastProgramsOpen] = useState(true);
  const [removeCompletionIndex, setRemoveCompletionIndex] = useState<number | null>(null);

  const enrollment = profile.activeProgram;
  const activeProgram = enrollment ? programs.find((p) => p.id === enrollment.programId) : null;

  // `programs` is the whole library. Strict programs and standalone workouts live in the
  // same store so exercise identity resolves the same way for both; the UI splits them.
  const { workouts: savedWorkouts, programs: strictPrograms } = useMemo(
    () => splitLibrary(programs),
    [programs],
  );

  // Least recently trained first: what a casual lifter most likely wants next. Render
  // sites decide how many to show - the collapsible home list shows all of them.
  const suggestedWorkouts = useMemo(() => {
    return savedWorkouts
      .map((w) => ({ workout: w, lastDone: lastPerformedDate(w.id, sessions) }))
      .sort((a, b) => (a.lastDone || '').localeCompare(b.lastDone || ''));
  }, [savedWorkouts, sessions]);

  // Skip rest days
  const getNextTrainingDay = () => {
    if (!activeProgram) return null;
    const days = activeProgram.days;
    let idx = enrollment ? (enrollment.lastCompletedDayIndex + 1) % days.length : 0;
    for (let i = 0; i < days.length; i++) {
      const day = days[idx];
      if (day.exercises.length > 0) return { day, index: idx };
      idx = (idx + 1) % days.length;
    }
    return null;
  };
  const nextTraining = getNextTrainingDay();

  // Weeks progress
  const weeksElapsed = enrollment
    ? Math.max(1, Math.ceil((Date.now() - new Date(enrollment.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)))
    : 0;
  const sessionsInProgram = enrollment
    ? sessions.filter((s) => s.programId === enrollment.programId && s.date >= enrollment.startDate).length
    : 0;

  // Auto-start from Dashboard quick start
  const quickStartHandled = useRef(false);
  useEffect(() => {
    if (loading || quickStartHandled.current || !programs.length) return;
    const state = location.state as { programId?: string; dayId?: string } | null;
    if (!state?.programId || !state?.dayId) return;
    const program = programs.find((p) => p.id === state.programId);
    const day = program?.days.find((d) => d.id === state.dayId);
    if (!program || !day) return;
    quickStartHandled.current = true;
    setSelectedProgramId(program.id);
    setSelectedDayId(day.id);
    startWorkout(program.id, day.id);
    setView('active');
    window.history.replaceState({}, '');
  }, [loading, programs, location.state, startWorkout]);

  // Enroll in a program
  const handleEnroll = useCallback(() => {
    if (!enrollProgramId) return;
    const weeks = parseInt(enrollWeeks) || 8;
    // Local dates, since these are compared against locally-dated sessions.
    const start = today();
    const end = localDateStr(new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000));
    const enrollment: ActiveProgramEnrollment = {
      programId: enrollProgramId,
      startDate: start,
      durationWeeks: weeks,
      plannedEndDate: end,
      lastCompletedDayIndex: -1,
    };
    onUpdateProfile(profile.id, { activeProgram: enrollment });
    setEnrollProgramId(null);
    setView('home');
    toast('Program started', 'success');
  }, [enrollProgramId, enrollWeeks, onUpdateProfile, profile.id]);

  // End current program
  const handleEndProgram = useCallback((reason: 'completed' | 'ended_early' | 'switched') => {
    if (!enrollment || !activeProgram) return;
    const completion: ProgramCompletion = {
      programId: enrollment.programId,
      programName: activeProgram.name,
      startDate: enrollment.startDate,
      endDate: today(),
      durationWeeks: weeksElapsed,
      totalSessions: sessionsInProgram,
      reason,
    };
    const history = [...(profile.programHistory || []), completion];
    onUpdateProfile(profile.id, { activeProgram: undefined, programHistory: history });
    toast('Program ended', 'info');
  }, [enrollment, activeProgram, weeksElapsed, sessionsInProgram, profile, onUpdateProfile]);

  // Start any day of any library entry. Enrollment is not required: a prescribed day can
  // be run loosely, which is the whole point of following a program casually.
  const handleStartEntryDay = useCallback((entryId: string, dayId: string) => {
    const entry = programs.find((p) => p.id === entryId);
    const day = entry?.days.find((d) => d.id === dayId);
    setSelectedProgramId(entryId);
    setSelectedDayId(dayId);
    // Snapshot what this workout is called now, so history keeps it later.
    startWorkout(entryId, dayId, entry && day ? dayIdentityOf(entry, day) : undefined);
    setView('active');
  }, [programs, startWorkout]);

  // Start a day of the program the user is enrolled in.
  const handleStartDay = useCallback((day: WorkoutDayType, _dayIndex: number) => {
    if (!enrollment) return;
    handleStartEntryDay(enrollment.programId, day.id);
  }, [enrollment, handleStartEntryDay]);

  // Start a saved standalone workout.
  const handleStartSavedWorkout = useCallback((entryId: string) => {
    const entry = programs.find((p) => p.id === entryId);
    const day = entry && workoutDayOf(entry);
    if (!entry || !day) return;
    handleStartEntryDay(entry.id, day.id);
  }, [programs, handleStartEntryDay]);

  // Pin one day of a program into the library so it can be repeated whenever.
  const handleSaveProgramDay = useCallback(async (programId: string, dayId: string) => {
    const program = programs.find((p) => p.id === programId);
    const day = program?.days.find((d) => d.id === dayId);
    if (!program || !day) return;
    await saveProgram(buildWorkoutFromDay(day, program));
    await refreshPrograms();
    toast(`Saved "${day.title || day.tag}" to your workouts`, 'success');
  }, [programs, refreshPrograms]);

  // The effort metric the session in progress is being logged with — a freestyle session
  // uses the toggle on the home screen, anything else inherits from its library entry.
  const activeEffortMetric = selectedProgramId === 'quick'
    ? quickEffortMetric
    : programs.find((p) => p.id === selectedProgramId)?.effortMetric || 'none';

  // Keep an ad-hoc session (freestyle or modified) as a reusable workout.
  const handleSaveExercisesAsWorkout = useCallback(async (name: string, exercises: Exercise[]) => {
    if (exercises.length === 0) return;
    await saveProgram(buildWorkoutFromExercises(name, exercises, { effortMetric: activeEffortMetric }));
    await refreshPrograms();
    toast('Saved to your workouts', 'success');
  }, [refreshPrograms, activeEffortMetric]);

  // Skip a workout day — logs it as skipped and advances the cycle without recording sets
  const handleSkipDay = useCallback(async (day: WorkoutDayType, dayIndex: number) => {
    if (!enrollment) return;
    await skipWorkout(
      enrollment.programId,
      day.id,
      activeProgram ? dayIdentityOf(activeProgram, day) : undefined,
    );
    onUpdateProfile(profile.id, {
      activeProgram: { ...enrollment, lastCompletedDayIndex: dayIndex },
    });
    toast('Workout skipped', 'info');
  }, [enrollment, activeProgram, skipWorkout, onUpdateProfile, profile.id]);

  // Finish workout — show summary, then advance day index
  const handleFinish = useCallback(async (exercises: Exercise[] = []) => {
    // Capture PRs before saving so we can compare
    const prsBefore = await getAllPRs(profile.id);
    // The exercise list goes onto the session so off-program lifts stay attributable.
    const session = await finishWorkout(exercises);
    if (!session) return;

    if (enrollment && activeProgram) {
      const dayIndex = activeProgram.days.findIndex((d) => d.id === session.dayId);
      if (dayIndex >= 0) {
        onUpdateProfile(profile.id, {
          activeProgram: { ...enrollment, lastCompletedDayIndex: dayIndex },
        });
      }
    }

    // Get PRs after saving to detect new ones
    const prsAfter = await getAllPRs(profile.id);
    setSummaryPreviousPrs(
      Object.fromEntries(
        Object.entries(prsBefore).map(([id, pr]) => [id, { weight: pr.weight }])
      )
    );
    setSummaryPrs(prsAfter);
    setSummarySession(session);
    setSummaryExercises(exercises);
    navigator.vibrate?.([50, 50, 50]);
  }, [finishWorkout, enrollment, activeProgram, onUpdateProfile, profile.id]);

  // Newest first for display, but each entry keeps the index it has in the profile so a
  // removal targets the right one regardless of the order on screen.
  const pastPrograms = useMemo(
    () => (profile.programHistory || []).map((completion, index) => ({ completion, index })).reverse(),
    [profile.programHistory],
  );

  // Drop a stint from the Past Programs list. Only the summary entry goes; every workout
  // logged during it is a separate record and stays exactly where it is.
  const handleRemoveCompletion = useCallback((index: number) => {
    const history = (profile.programHistory || []).filter((_, i) => i !== index);
    onUpdateProfile(profile.id, { programHistory: history });
    toast('Removed from past programs', 'info');
  }, [profile.programHistory, profile.id, onUpdateProfile]);

  const handleCloseSummary = useCallback(() => {
    setSummarySession(null);
    setView('home');
    setSelectedProgramId(null);
    setSelectedDayId(null);
  }, []);

  const handleCancel = useCallback(() => {
    cancelWorkout();
    setView('home');
    setSelectedDayId(null);
  }, [cancelWorkout]);

  // Program CRUD
  const handleDuplicate = useCallback(async (entryId: string) => {
    const original = programs.find((p) => p.id === entryId);
    if (!original) return;
    await duplicateProgram(entryId, `${original.name} (Copy)`);
    await refreshPrograms();
    toast(isSavedWorkout(original) ? 'Workout duplicated' : 'Program duplicated', 'success');
  }, [programs, refreshPrograms]);

  const handleDelete = useCallback(async (entryId: string) => {
    const entry = programs.find((p) => p.id === entryId);
    await deleteProgram(entryId);
    await refreshPrograms();
    toast(entry && isSavedWorkout(entry) ? 'Workout deleted' : 'Program deleted', 'info');
  }, [programs, refreshPrograms]);

  const openEditor = useCallback((entry: Program, returnView: View) => {
    setEditingProgram(entry);
    setEditorMode(isSavedWorkout(entry) ? 'workout' : 'program');
    setEditorReturnView(returnView);
    setView('editor');
  }, []);

  const handleEditEntry = useCallback((entryId: string, returnView: View = 'library') => {
    const entry = programs.find((p) => p.id === entryId);
    if (!entry || entry.isBuiltIn) return;
    openEditor(entry, returnView);
  }, [programs, openEditor]);

  const handleSaveEntry = useCallback(async (entry: Program) => {
    await saveProgram(entry);
    await refreshPrograms();
    setEditingProgram(null);
    setView(editorReturnView);
    toast(isSavedWorkout(entry) ? 'Workout saved' : 'Program saved', 'success');
  }, [refreshPrograms, editorReturnView]);

  const handleCreateProgram = useCallback(() => {
    const newProgram: Program = {
      id: crypto.randomUUID(),
      kind: 'program',
      name: 'New Program',
      description: '',
      isBuiltIn: false,
      days: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    openEditor(newProgram, 'library');
  }, [openEditor]);

  const handleCreateWorkout = useCallback(() => {
    openEditor(blankWorkout(), 'library');
  }, [openEditor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  // Active workout view
  if (view === 'active' && activeSession && selectedDayId) {
    const isQuick = selectedProgramId === 'quick';
    const program = isQuick ? null : programs.find((p) => p.id === (selectedProgramId || enrollment?.programId));
    const day = isQuick ? QUICK_DAY : program?.days.find((d) => d.id === selectedDayId);
    if (!day) return null;
    const previousSession = program ? getPreviousSession(program.id, day.id) : undefined;
    const lastPerformance = getLastPerformanceMap(day.exercises);
    const programDuration = program?.suggestedDurationWeeks || 0;
    // Week-in-program only means something when this session IS the enrolled program's.
    // Running someone else's day loosely must not borrow the enrolled program's week.
    const onEnrolledProgram = !!enrollment && !isQuick && program?.id === enrollment.programId;
    const programCurrentWeek = onEnrolledProgram && enrollment
      ? Math.min(
          Math.max(1, Math.ceil((Date.now() - new Date(enrollment.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000))),
          programDuration || Infinity,
        )
      : 0;
    return (
      <ActiveWorkout
        session={activeSession}
        day={day}
        previousSession={previousSession}
        lastPerformance={lastPerformance}
        currentWeek={programCurrentWeek}
        durationWeeks={programDuration}
        onLogSet={logSet}
        onUpdateSet={updateSet}
        onRemoveExercise={removeExerciseFromSession}
        onFinish={handleFinish}
        onCancel={handleCancel}
        restTimerDuration={profile.restTimerDuration ?? 90}
        programDefaultRestTimer={program?.defaultRestTimer}
        profileId={profile.id}
        onUpdateCardio={updateCardio}
        onUpdateName={updateActiveSessionName}
        allSessions={sessions}
        effortMetric={isQuick ? quickEffortMetric : (program?.effortMetric || 'none')}
        programs={programs}
        onSaveToLibrary={handleSaveExercisesAsWorkout}
        onSwapExercise={program && !isQuick ? async (exerciseId, swap, permanent) => {
          if (!permanent) return;
          const updated = {
            ...program,
            days: program.days.map((d) =>
              d.id === selectedDayId
                ? {
                    ...d,
                    exercises: d.exercises.map((e) =>
                      e.id === exerciseId
                        ? { ...e, name: swap.name, progressionOverrideWeight: undefined, progressionOverrideReps: undefined }
                        : e
                    ),
                  }
                : d
            ),
            updatedAt: new Date().toISOString(),
          };
          await saveProgram(updated);
          await refreshPrograms();
        } : undefined}
        onAddAlternative={program && !isQuick ? async (exerciseId, altName) => {
          const updated = {
            ...program,
            days: program.days.map((d) =>
              d.id === selectedDayId
                ? {
                    ...d,
                    exercises: d.exercises.map((e) =>
                      e.id === exerciseId
                        ? { ...e, alternatives: [...(e.alternatives || []).filter((a) => a !== altName), altName] }
                        : e
                    ),
                  }
                : d
            ),
            updatedAt: new Date().toISOString(),
          };
          await saveProgram(updated);
          await refreshPrograms();
        } : undefined}
        onApplyProgression={program && !isQuick ? async (exerciseId, weight, reps) => {
          const updated = {
            ...program,
            days: program.days.map((d) =>
              d.id === selectedDayId
                ? {
                    ...d,
                    exercises: d.exercises.map((e) =>
                      e.id === exerciseId
                        ? { ...e, progressionOverrideWeight: weight, progressionOverrideReps: reps }
                        : e
                    ),
                  }
                : d
            ),
            updatedAt: new Date().toISOString(),
          };
          await saveProgram(updated);
          await refreshPrograms();
        } : undefined}
        onConsumeProgressionOverride={program && !isQuick ? async (exerciseId) => {
          const updated = {
            ...program,
            days: program.days.map((d) =>
              d.id === selectedDayId
                ? {
                    ...d,
                    exercises: d.exercises.map((e) =>
                      e.id === exerciseId
                        ? { ...e, progressionOverrideWeight: undefined, progressionOverrideReps: undefined }
                        : e
                    ),
                  }
                : d
            ),
            updatedAt: new Date().toISOString(),
          };
          await saveProgram(updated);
          await refreshPrograms();
        } : undefined}
      />
    );
  }

  // Workout / program editor
  if (view === 'editor' && editingProgram) {
    return (
      <ProgramEditor
        program={editingProgram}
        mode={editorMode}
        savedWorkouts={savedWorkouts}
        fitnessGoal={profile.bodyStats?.fitnessGoal === 'lose' ? 'lose' : profile.bodyStats?.fitnessGoal === 'build' ? 'build' : 'maintain'}
        onSave={handleSaveEntry}
        onClose={() => { setEditingProgram(null); setView(editorReturnView); }}
      />
    );
  }

  // Enroll modal
  const enrollProgram = enrollProgramId ? programs.find((p) => p.id === enrollProgramId) : null;

  // Workout & program library view
  if (view === 'library') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-xl">
            <ArrowLeft size={18} className="text-text-muted" />
          </button>
          <h2 className="text-lg font-semibold">Workout &amp; Program Library</h2>
        </div>

        <WorkoutLibrary
          entries={programs}
          sessions={sessions}
          onStartWorkout={handleStartSavedWorkout}
          onStartProgramDay={handleStartEntryDay}
          onSaveProgramDay={handleSaveProgramDay}
          onOpenProgram={(id) => {
            setSelectedProgramId(id);
            setDaysReturnView('library');
            setView('days');
          }}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onEdit={(id) => handleEditEntry(id, 'library')}
          onCreateWorkout={handleCreateWorkout}
          onCreateProgram={handleCreateProgram}
          onReload={refreshPrograms}
        />

        {/* Enroll modal — needs to render here too */}
        <Modal open={!!enrollProgram} onClose={() => setEnrollProgramId(null)} title="Start Program">
          {enrollProgram && (
            <EnrollModalContent
              program={enrollProgram}
              enrollWeeks={enrollWeeks}
              setEnrollWeeks={setEnrollWeeks}
              enrollment={enrollment}
              activeProgram={activeProgram}
              onEnroll={() => {
                if (enrollment) handleEndProgram('switched');
                handleEnroll();
              }}
            />
          )}
        </Modal>
      </div>
    );
  }

  // Days view (browsing a program's days)
  if (view === 'days' && selectedProgramId) {
    const program = programs.find((p) => p.id === selectedProgramId);
    if (!program) { setView('home'); return null; }
    const isActive = enrollment?.programId === program.id;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView(daysReturnView); setSelectedProgramId(null); }} className="p-2 -ml-2 rounded-xl">
            <ArrowLeft size={18} className="text-text-muted" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold truncate">{program.name}</h2>
            <p className="text-xs text-text-muted truncate">{program.description}</p>
          </div>
          {!program.isBuiltIn && (
            <button
              onClick={() => handleEditEntry(program.id, 'days')}
              className="p-2 rounded-xl text-text-muted hover:text-accent-orange transition-colors"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>

        {/* Program info */}
        {(program.goal || program.daysPerWeek || program.suggestedDurationWeeks || program.days.length > 0) && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[0.625rem] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.days.length}-day cycle</span>
            {program.goal && (
              <span className="text-[0.625rem] bg-surface rounded-lg px-2 py-1 text-text-muted capitalize">{program.goal.type}</span>
            )}
            {program.daysPerWeek && (
              <span className="text-[0.625rem] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.daysPerWeek}x/week</span>
            )}
            {program.suggestedDurationWeeks && (
              <span className="text-[0.625rem] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.suggestedDurationWeeks} weeks</span>
            )}
          </div>
        )}

        {/* Enroll button if not active */}
        {!isActive && (
          <div className="space-y-1.5">
            <button
              onClick={() => setEnrollProgramId(program.id)}
              className="btn-primary w-full"
            >
              {enrollment ? 'Switch to This Program' : 'Start This Program'}
            </button>
            <p className="text-[0.625rem] text-text-muted text-center">
              Or don&apos;t commit — run any day below whenever you feel like it.
            </p>
          </div>
        )}

        {/* Days. Each is runnable on its own, enrolled or not, so a strict program can be
            followed loosely with as many days off as the user wants. */}
        <div className="space-y-3">
          {program.days.map((day, index) => {
            const isRest = day.exercises.length === 0;
            return (
              <div key={day.id} className="bg-surface rounded-2xl p-4">
                <div className="text-[0.625rem] text-text-muted font-medium mb-2">{day.label || `Day ${index + 1}`}</div>
                <WorkoutDay day={day} />
                {!isRest && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <button
                      onClick={() => handleStartEntryDay(program.id, day.id)}
                      className="flex-1 py-2 rounded-lg bg-surface-raised text-text-primary text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Play size={11} /> Do this workout
                    </button>
                    <button
                      onClick={() => handleSaveProgramDay(program.id, day.id)}
                      className="flex-1 py-2 rounded-lg bg-surface-raised text-text-secondary text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <BookmarkPlus size={11} /> Save for later
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Enroll modal */}
        <Modal open={!!enrollProgram} onClose={() => setEnrollProgramId(null)} title="Start Program">
          {enrollProgram && (
            <EnrollModalContent
              program={enrollProgram}
              enrollWeeks={enrollWeeks}
              setEnrollWeeks={setEnrollWeeks}
              enrollment={enrollment}
              activeProgram={activeProgram}
              onEnroll={() => {
                if (enrollment) handleEndProgram('switched');
                handleEnroll();
              }}
            />
          )}
        </Modal>
      </div>
    );
  }

  // ── HOME VIEW ──
  return (
    <div className="space-y-6">
      {/* Not on a program. That is a valid way to train, so this reads as a menu of what
          to do today rather than a nag to enroll in something. */}
      {!enrollment && (
        <div className="py-4">
          <div className="text-center mb-6">
            <Dumbbell size={32} className="mx-auto mb-4 text-text-muted" />
            <h2 className="text-lg font-semibold mb-1">
              {savedWorkouts.length > 0 ? 'What are you training today?' : 'Not on a program'}
            </h2>
            <p className="text-sm text-text-muted max-w-xs mx-auto">
              {savedWorkouts.length > 0
                ? 'Pick a workout, freestyle it, or start a program if you want a schedule.'
                : 'Train however you like — save workouts as you go, or follow a program.'}
            </p>
          </div>

          <div className="space-y-2 max-w-xs mx-auto">
            <button
              onClick={() => {
                setSelectedProgramId('quick');
                setSelectedDayId('quick');
                startWorkout('quick', 'quick', QUICK_IDENTITY);
                setView('active');
              }}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Dumbbell size={16} />
              Freestyle Workout
            </button>
            <button onClick={() => setView('library')} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Library size={16} />
              Workouts &amp; Programs
            </button>
            <button onClick={handleCreateWorkout} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Plus size={16} />
              Build a Workout
            </button>
          </div>

          {/* Below the actions and collapsible: the full list is for browsing, not the
              first thing to scroll past when you just want to start training. */}
          {suggestedWorkouts.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setWorkoutsOpen((o) => !o)}
                className="w-full flex items-center justify-between mb-3"
              >
                <h3 className="label flex items-center gap-1.5">
                  <Dumbbell size={11} />
                  Your Workouts
                  <span className="text-text-muted font-normal">({suggestedWorkouts.length})</span>
                </h3>
                {workoutsOpen
                  ? <ChevronUp size={14} className="text-text-muted" />
                  : <ChevronDown size={14} className="text-text-muted" />}
              </button>
              {workoutsOpen && (
                <div className="space-y-2">
                  {suggestedWorkouts.map(({ workout, lastDone }) => (
                    <button
                      key={workout.id}
                      onClick={() => handleStartSavedWorkout(workout.id)}
                      className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${workoutDayOf(workout)?.accent || 'var(--color-surface-raised)'}20` }}
                      >
                        <Play size={15} style={{ color: workoutDayOf(workout)?.accent || 'var(--color-text-secondary)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{workout.name}</div>
                        <div className="text-[0.625rem] text-text-muted truncate">
                          {exerciseCount(workout)} exercises · {formatDaysAgo(lastDone)}
                          {muscleFocus(workout, 2).length > 0 && ` · ${muscleFocus(workout, 2).join(', ')}`}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-text-muted shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active program */}
      {enrollment && activeProgram && (
        <>
          {/* Program header card */}
          <div className="bg-surface rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="label mb-1">Current Program</div>
                <h2 className="text-lg font-semibold truncate">{activeProgram.name}</h2>
              </div>
              <div className="flex items-center gap-3">
                {!activeProgram.isBuiltIn && (
                  <button
                    onClick={() => handleEditEntry(enrollment.programId, 'home')}
                    className="text-xs text-text-muted flex items-center gap-1 hover:text-accent-orange transition-colors"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedProgramId(enrollment.programId);
                    setDaysReturnView('home');
                    setView('days');
                  }}
                  className="text-xs text-text-muted flex items-center gap-1"
                >
                  View <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[0.625rem] text-text-muted mb-1">
                <span>Week {Math.min(weeksElapsed, enrollment.durationWeeks)} of {enrollment.durationWeeks}</span>
                <span>
                  {sessionsInProgram} sessions
                  {activeProgram.days.length > 0 && ` · Cycle ${Math.floor(sessionsInProgram / activeProgram.days.filter(d => d.exercises.length > 0).length) + 1}`}
                </span>
              </div>
              <div className="h-1 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-text-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, (weeksElapsed / enrollment.durationWeeks) * 100)}%` }}
                />
              </div>
            </div>

            {/* Goal if set */}
            {activeProgram.goal && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Target size={12} />
                <span>{activeProgram.goal.description || activeProgram.goal.type}</span>
              </div>
            )}

            {/* End program */}
            <button
              onClick={() => setShowEndConfirm(true)}
              className="mt-3 text-[0.6875rem] text-text-muted hover:text-danger transition-colors"
            >
              End program early
            </button>
          </div>

          {/* Next Workout */}
          {nextTraining && (
            <div>
              <h3 className="label mb-3">Next Workout</h3>
              <div className="w-full bg-surface rounded-2xl p-5">
                <button
                  onClick={() => handleStartDay(nextTraining.day, nextTraining.index)}
                  className="w-full text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${nextTraining.day.accent || 'var(--color-surface-raised)'}15` }}
                    >
                      <Dumbbell size={20} style={{ color: nextTraining.day.accent || 'var(--color-text-secondary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{nextTraining.day.tag}</div>
                      <div className="text-sm text-text-muted">{nextTraining.day.title}</div>
                      <div className="text-[0.6875rem] text-text-muted mt-0.5">
                        {nextTraining.day.exercises.length} exercises
                      </div>
                    </div>
                    <div className="text-text-primary font-medium text-sm">Start</div>
                  </div>
                  {nextTraining.day.note && (
                    <p className="text-[0.6875rem] text-text-muted mt-3 leading-relaxed">{nextTraining.day.note}</p>
                  )}
                </button>
                <button
                  onClick={() => setSkipTarget({ day: nextTraining.day, index: nextTraining.index })}
                  className="w-full mt-3 pt-3 border-t border-border flex items-center justify-center gap-1.5 text-xs font-medium text-text-muted hover:text-danger transition-colors"
                >
                  <SkipForward size={12} />
                  Can't make it? Skip this workout
                </button>
              </div>
            </div>
          )}

          {/* Current cycle — adapts to any number of days */}
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <h3 className="label">Current Cycle</h3>
              <span className="text-[0.5625rem] text-text-muted">
                {activeProgram.days.length}-day {activeProgram.days.length <= 7 ? 'microcycle' : activeProgram.days.length <= 28 ? 'microcycle' : 'mesocycle'}
              </span>
            </div>
            <div className={`grid gap-1.5 ${
              activeProgram.days.length <= 5 ? 'grid-cols-5' :
              activeProgram.days.length <= 7 ? 'grid-cols-7' :
              activeProgram.days.length <= 10 ? 'grid-cols-5' :
              'grid-cols-6'
            }`}>
              {activeProgram.days.map((day, i) => {
                const isNext = nextTraining?.index === i;
                const lastIdx = enrollment.lastCompletedDayIndex;
                const cycleLen = activeProgram.days.length;
                // In the current rotation, days from 0..lastIdx are done, lastIdx+1 is next
                // After a full cycle reset (lastIdx wraps), only days up to lastIdx are done
                const isDone = lastIdx >= 0 && (
                  lastIdx < cycleLen - 1
                    ? i <= lastIdx
                    : i <= lastIdx
                ) && !isNext;
                const isRest = day.exercises.length === 0;
                return (
                  <button
                    key={day.id}
                    onClick={() => !isRest && handleStartDay(day, i)}
                    disabled={isRest}
                    className={`flex flex-col items-center py-2 rounded-xl text-center transition-colors ${
                      isNext ? 'bg-text-primary text-bg' :
                      isDone ? 'bg-surface-raised text-text-muted' :
                      isRest ? 'text-text-muted opacity-40' :
                      'bg-surface text-text-secondary'
                    }`}
                  >
                    <span className="text-[0.5625rem] font-medium">{day.label?.replace('Day ', 'D') || `D${i + 1}`}</span>
                    <span className="text-[0.5rem] mt-0.5 truncate w-full px-0.5">
                      {isRest ? 'Rest' : day.tag}
                    </span>
                    {isDone && <CheckCircle2 size={8} className="mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Anything off the prescribed rotation. Shown alongside an active program too,
          because "on a program" and "sometimes doing your own thing" aren't exclusive. */}
      {enrollment && (
        <div>
          <h3 className="label mb-3">Something Else Today</h3>
          <div className="bg-surface rounded-2xl p-4 space-y-3">
            {suggestedWorkouts.length > 0 && (
              <div className="space-y-2 pb-1">
                {suggestedWorkouts.slice(0, 3).map(({ workout, lastDone }) => (
                  <button
                    key={workout.id}
                    onClick={() => handleStartSavedWorkout(workout.id)}
                    className="w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <Play size={14} style={{ color: workoutDayOf(workout)?.accent || 'var(--color-text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{workout.name}</div>
                      <div className="text-[0.625rem] text-text-muted">
                        {exerciseCount(workout)} exercises · {formatDaysAgo(lastDone)}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setSelectedProgramId('quick');
                setSelectedDayId('quick');
                startWorkout('quick', 'quick', QUICK_IDENTITY);
                setView('active');
              }}
              className={`w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform ${suggestedWorkouts.length > 0 ? 'pt-3 border-t border-border' : ''}`}
            >
              <Plus size={16} className="text-accent" />
              <div className="flex-1">
                <div className="text-sm font-medium">Freestyle Workout</div>
                <div className="text-[0.6875rem] text-text-muted">Add exercises as you go — save it after if you like it</div>
              </div>
              <ChevronRight size={14} className="text-text-muted" />
            </button>

            {/* Effort metric toggle for freestyle sessions, which have no program to inherit from */}
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <span className="text-[0.625rem] text-text-muted">Effort tracking:</span>
              {(['none', 'rir', 'rpe'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setQuickEffortMetric(m)}
                  className={`px-2.5 py-1 rounded-lg text-[0.625rem] font-medium transition-colors ${quickEffortMetric === m ? 'bg-accent-blue/20 text-accent-blue' : 'bg-surface-raised text-text-muted'}`}
                >
                  {m === 'none' ? 'None' : m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Library link */}
      <button
        onClick={() => setView('library')}
        className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
      >
        <Library size={16} className="text-text-muted" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Workout &amp; Program Library</div>
          <div className="text-[0.625rem] text-text-muted">
            {savedWorkouts.length} workout{savedWorkouts.length === 1 ? '' : 's'} · {strictPrograms.length} program{strictPrograms.length === 1 ? '' : 's'}
          </div>
        </div>
        <ChevronRight size={14} className="text-text-muted" />
      </button>

      {/* Program history */}
      {pastPrograms.length > 0 && (
        <div>
          <button
            onClick={() => setPastProgramsOpen((o) => !o)}
            className="w-full flex items-center justify-between mb-3"
          >
            <h3 className="label flex items-center gap-1.5">
              <CalendarRange size={11} />
              Past Programs
              <span className="text-text-muted font-normal">({pastPrograms.length})</span>
            </h3>
            {pastProgramsOpen
              ? <ChevronUp size={14} className="text-text-muted" />
              : <ChevronDown size={14} className="text-text-muted" />}
          </button>
          {pastProgramsOpen && (
            <div className="space-y-2">
              {pastPrograms.map(({ completion: pc, index }) => (
                <div key={index} className="bg-surface rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{pc.programName}</div>
                      <div className="text-[0.6875rem] text-text-muted">
                        {pc.durationWeeks}w · {pc.totalSessions} sessions · {pc.reason === 'completed' ? 'Completed' : pc.reason === 'ended_early' ? 'Ended early' : 'Switched'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-[0.625rem] text-text-muted">{pc.startDate} → {pc.endDate}</div>
                      <button
                        onClick={() => setRemoveCompletionIndex(index)}
                        aria-label={`Remove ${pc.programName} from past programs`}
                        className="p-1 -mr-1 text-text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div>
          <button onClick={() => setHistoryOpen((o) => !o)} className="w-full flex items-center justify-between mb-3">
            <h3 className="label flex items-center gap-1.5">
              <History size={11} /> Recent Workouts <span className="text-text-muted font-normal">({sessions.length})</span>
            </h3>
            {historyOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
          </button>
          {historyOpen && (
            <WorkoutHistory sessions={sessions} programs={programs} onDeleteSession={removeSession} onUpdateSession={updateSession} />
          )}
        </div>
      )}

      {/* Enroll modal */}
      <Modal open={!!enrollProgram} onClose={() => setEnrollProgramId(null)} title="Start Program">
        {enrollProgram && (
          <EnrollModalContent
            program={enrollProgram}
            enrollWeeks={enrollWeeks}
            setEnrollWeeks={setEnrollWeeks}
            enrollment={enrollment}
            activeProgram={activeProgram}
            onEnroll={() => {
              if (enrollment) handleEndProgram('switched');
              handleEnroll();
            }}
          />
        )}
      </Modal>

      {/* End program confirm */}
      <ConfirmDialog
        open={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={() => handleEndProgram(
          weeksElapsed >= (enrollment?.durationWeeks || 0) ? 'completed' : 'ended_early'
        )}
        title="End Program"
        message={`End "${activeProgram?.name}"? Your ${sessionsInProgram} workout sessions are saved. You'll be able to pick a new program.`}
        confirmText="End Program"
        danger
      />

      {/* Remove a past-program entry */}
      <ConfirmDialog
        open={removeCompletionIndex !== null}
        onClose={() => setRemoveCompletionIndex(null)}
        onConfirm={() => {
          if (removeCompletionIndex !== null) handleRemoveCompletion(removeCompletionIndex);
          setRemoveCompletionIndex(null);
        }}
        title="Remove from Past Programs"
        message={`Remove "${removeCompletionIndex !== null ? profile.programHistory?.[removeCompletionIndex]?.programName ?? 'this program' : ''}" from the list? Every workout you logged during it is kept — this only clears the summary entry.`}
        confirmText="Remove"
        danger
      />

      {/* Skip workout confirm */}
      <ConfirmDialog
        open={!!skipTarget}
        onClose={() => setSkipTarget(null)}
        onConfirm={() => {
          if (skipTarget) handleSkipDay(skipTarget.day, skipTarget.index);
        }}
        title="Skip Workout"
        message={`Mark "${skipTarget?.day.tag}" as skipped? It'll show as skipped in your history and your program moves on to the next day. Next time you do this workout, you'll still see your real last-performance numbers — the skip won't affect them.`}
        confirmText="Skip Workout"
      />

      {/* Workout Summary */}
      {summarySession && (() => {
        const isQuickSummary = summarySession.programId === 'quick';
        const sourceEntry = isQuickSummary ? undefined : programs.find((p) => p.id === summarySession.programId);
        const sourceDay = sourceEntry?.days.find((d) => d.id === summarySession.dayId);

        // The summary describes the session as it was actually performed, so exercises
        // added on the fly (and their PRs) show up instead of only the prescribed list.
        // A freestyle session, or one whose library entry has since been deleted, has
        // nothing but the performed list to go on.
        const summaryDay: WorkoutDayType = {
          label: '', subtitle: '', note: '', accent: '#e8572a',
          title: isQuickSummary ? 'Freestyle' : 'Workout',
          tag: isQuickSummary ? 'Quick Workout' : 'Workout',
          ...(sourceDay || {}),
          id: summarySession.dayId,
          exercises: summaryExercises.length > 0 ? summaryExercises : (sourceDay?.exercises || []),
        };
        const summaryProgram: Program = {
          id: summarySession.programId,
          name: isQuickSummary ? 'Quick Workout' : 'Workout',
          description: '', isBuiltIn: false, createdAt: '', updatedAt: '',
          ...(sourceEntry || {}),
          days: [summaryDay],
        };

        // Offer to keep the session when it isn't just a library entry run as written:
        // freestyle, or reshaped by adding, swapping or dropping exercises.
        const sourceIds = sourceDay ? sourceDay.exercises.map((e) => e.id).join('|') : null;
        const performedIds = summaryExercises.map((e) => e.id).join('|');
        const deviatedFromSource = sourceIds !== null && sourceIds !== performedIds;
        const canSaveAsWorkout = summaryExercises.length > 0 && (isQuickSummary || !sourceEntry || deviatedFromSource);

        const defaultName = isQuickSummary || !sourceEntry
          ? `Workout ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : `${sourceDay?.title || sourceEntry.name} (my version)`;

        return (
          <WorkoutSummary
            session={summarySession}
            program={summaryProgram}
            prs={summaryPrs}
            previousPrs={summaryPreviousPrs}
            units={profile.units}
            onClose={handleCloseSummary}
            onUpdateSession={updateSession}
            defaultWorkoutName={defaultName}
            onSaveAsWorkout={canSaveAsWorkout
              ? (name) => handleSaveExercisesAsWorkout(name, summaryExercises)
              : undefined}
          />
        );
      })()}
    </div>
  );
}
