import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Dumbbell,
  History,
  Pencil,
  Loader2,
  Calendar,
  Target,
  ChevronRight,
  X,
  Library,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { Profile, Program, WorkoutSession, WorkoutDay as WorkoutDayType, ActiveProgramEnrollment, ProgramCompletion, ExerciseFeedback, Exercise } from '../types';
import { useWorkout } from '../hooks/useWorkout';
import { duplicateProgram, deleteProgram, saveProgram } from '../db/programs';
import { getAllPRs } from '../db/workouts';
import { ProgramList } from '../components/workout/ProgramList';
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
  const navigate = useNavigate();
  const {
    programs,
    sessions,
    activeSession,
    loading,
    startWorkout,
    logSet,
    updateSet,
    updateCardio,
    finishWorkout,
    cancelWorkout,
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
  const [enrollProgramId, setEnrollProgramId] = useState<string | null>(null);
  const [enrollWeeks, setEnrollWeeks] = useState('8');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [summarySession, setSummarySession] = useState<WorkoutSession | null>(null);
  const [summaryPrs, setSummaryPrs] = useState<Record<string, { weight: number; reps: number; date: string }>>({});
  const [summaryPreviousPrs, setSummaryPreviousPrs] = useState<Record<string, { weight: number }>>({});

  const enrollment = profile.activeProgram;
  const activeProgram = enrollment ? programs.find((p) => p.id === enrollment.programId) : null;

  // Next workout day calculation
  const nextDayIndex = enrollment ? ((enrollment.lastCompletedDayIndex + 1) % (activeProgram?.days.length || 1)) : 0;
  const nextDay = activeProgram?.days[nextDayIndex];
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
    const start = new Date().toISOString().split('T')[0];
    const end = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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
      endDate: new Date().toISOString().split('T')[0],
      durationWeeks: weeksElapsed,
      totalSessions: sessionsInProgram,
      reason,
    };
    const history = [...(profile.programHistory || []), completion];
    onUpdateProfile(profile.id, { activeProgram: undefined, programHistory: history });
    toast('Program ended', 'info');
  }, [enrollment, activeProgram, weeksElapsed, sessionsInProgram, profile, onUpdateProfile]);

  // Start a workout for a day
  const handleStartDay = useCallback((day: WorkoutDayType, dayIndex: number) => {
    if (!enrollment) return;
    const programId = enrollment.programId;
    setSelectedProgramId(programId);
    setSelectedDayId(day.id);
    startWorkout(programId, day.id);
    setView('active');
  }, [enrollment, startWorkout]);

  // Finish workout — show summary, then advance day index
  const handleFinish = useCallback(async () => {
    // Capture PRs before saving so we can compare
    const prsBefore = await getAllPRs(profile.id);
    const session = await finishWorkout();
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
    navigator.vibrate?.([50, 50, 50]);
  }, [finishWorkout, enrollment, activeProgram, onUpdateProfile, profile.id]);

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
  const handleDuplicate = useCallback(async (programId: string) => {
    const original = programs.find((p) => p.id === programId);
    if (!original) return;
    await duplicateProgram(programId, `${original.name} (Copy)`);
    await refreshPrograms();
    toast('Program duplicated', 'success');
  }, [programs, refreshPrograms]);

  const handleDelete = useCallback(async (programId: string) => {
    await deleteProgram(programId);
    await refreshPrograms();
    toast('Program deleted', 'info');
  }, [refreshPrograms]);

  const handleEditProgram = useCallback((programId: string) => {
    const program = programs.find((p) => p.id === programId);
    if (!program || program.isBuiltIn) return;
    setEditingProgram(program);
    setView('editor');
  }, [programs]);

  const handleSaveProgram = useCallback(async (program: Program) => {
    await saveProgram(program);
    await refreshPrograms();
    setEditingProgram(null);
    setView('home');
    toast('Program saved', 'success');
  }, [refreshPrograms]);

  const handleCreateProgram = useCallback(() => {
    const newProgram: Program = {
      id: crypto.randomUUID(),
      name: 'New Program',
      description: '',
      isBuiltIn: false,
      days: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingProgram(newProgram);
    setView('editor');
  }, []);

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
    const day = isQuick
      ? { id: 'quick', label: '', tag: 'Quick Workout', title: 'Freestyle', subtitle: '', accent: '#e8572a', note: '', exercises: [] as Exercise[] }
      : program?.days.find((d) => d.id === selectedDayId);
    if (!day) return null;
    const previousSession = program ? getPreviousSession(program.id, day.id) : undefined;
    const lastPerformance = getLastPerformanceMap(day.exercises);
    const programDuration = program?.suggestedDurationWeeks || 0;
    const programCurrentWeek = enrollment && !isQuick
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
        onFinish={handleFinish}
        onCancel={handleCancel}
        restTimerDuration={profile.restTimerDuration || 90}
        programDefaultRestTimer={program?.defaultRestTimer}
        profileId={profile.id}
        onSaveFeedback={(feedback) => {
          if (activeSession) {
            const updated = { ...activeSession, exerciseFeedback: feedback };
            import('../db/workouts').then(({ saveWorkoutSession }) => saveWorkoutSession(updated));
          }
        }}
        onUpdateCardio={updateCardio}
        allSessions={sessions}
        effortMetric={program?.effortMetric || 'none'}
        programs={programs}
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
                        ? { ...e, name: swap.name, muscles: swap.muscles, equipment: swap.equipment }
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

  // Program editor
  if (view === 'editor' && editingProgram) {
    return (
      <ProgramEditor
        program={editingProgram}
        fitnessGoal={profile.bodyStats?.fitnessGoal === 'lose' ? 'lose' : profile.bodyStats?.fitnessGoal === 'build' ? 'build' : 'maintain'}
        onSave={handleSaveProgram}
        onClose={() => { setEditingProgram(null); setView('home'); }}
      />
    );
  }

  // Enroll modal
  const enrollProgram = enrollProgramId ? programs.find((p) => p.id === enrollProgramId) : null;

  // Program library view
  if (view === 'library') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-xl">
            <ArrowLeft size={18} className="text-text-muted" />
          </button>
          <h2 className="text-lg font-semibold">Program Library</h2>
        </div>

        <ProgramList
          programs={programs}
          onSelect={(id) => {
            setSelectedProgramId(id);
            setView('days');
          }}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onEdit={handleEditProgram}
          onReload={refreshPrograms}
        />

        <button
          onClick={handleCreateProgram}
          className="w-full py-3 rounded-xl text-text-muted text-sm font-medium flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Create Program
        </button>

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
          <button onClick={() => { setView(enrollment ? 'home' : 'library'); setSelectedProgramId(null); }} className="p-2 -ml-2 rounded-xl">
            <ArrowLeft size={18} className="text-text-muted" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold truncate">{program.name}</h2>
            <p className="text-xs text-text-muted truncate">{program.description}</p>
          </div>
        </div>

        {/* Program info */}
        {(program.goal || program.daysPerWeek || program.suggestedDurationWeeks || program.days.length > 0) && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.days.length}-day cycle</span>
            {program.goal && (
              <span className="text-[10px] bg-surface rounded-lg px-2 py-1 text-text-muted capitalize">{program.goal.type}</span>
            )}
            {program.daysPerWeek && (
              <span className="text-[10px] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.daysPerWeek}x/week</span>
            )}
            {program.suggestedDurationWeeks && (
              <span className="text-[10px] bg-surface rounded-lg px-2 py-1 text-text-muted">{program.suggestedDurationWeeks} weeks</span>
            )}
          </div>
        )}

        {/* Enroll button if not active */}
        {!isActive && (
          <button
            onClick={() => setEnrollProgramId(program.id)}
            className="btn-primary w-full"
          >
            {enrollment ? 'Switch to This Program' : 'Start This Program'}
          </button>
        )}

        {/* Days */}
        <div className="space-y-3">
          {program.days.map((day, index) => (
            <div key={day.id} className="bg-surface rounded-2xl p-4">
              <div className="text-[10px] text-text-muted font-medium mb-2">{day.label || `Day ${index + 1}`}</div>
              <WorkoutDay day={day} />
            </div>
          ))}
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
      {/* No active program — prompt to pick one */}
      {!enrollment && (
        <div className="text-center py-8">
          <Dumbbell size={32} className="mx-auto mb-4 text-text-muted" />
          <h2 className="text-lg font-semibold mb-1">No active program</h2>
          <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">
            Pick a program to follow, or start a quick workout.
          </p>
          <div className="space-y-2 max-w-xs mx-auto">
            <button
              onClick={() => {
                setSelectedProgramId('quick');
                setSelectedDayId('quick');
                startWorkout('quick', 'quick');
                setView('active');
              }}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Dumbbell size={16} />
              Quick Workout
            </button>
            <button onClick={() => setView('library')} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Library size={16} />
              Browse Programs
            </button>
            <button onClick={handleCreateProgram} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Plus size={16} />
              Create Your Own
            </button>
          </div>
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
              <button
                onClick={() => {
                  setSelectedProgramId(enrollment.programId);
                  setView('days');
                }}
                className="text-xs text-text-muted flex items-center gap-1"
              >
                View <ChevronRight size={12} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-text-muted mb-1">
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
              className="mt-3 text-[11px] text-text-muted hover:text-danger transition-colors"
            >
              End program early
            </button>
          </div>

          {/* Next Workout */}
          {nextTraining && (
            <div>
              <h3 className="label mb-3">Next Workout</h3>
              <button
                onClick={() => handleStartDay(nextTraining.day, nextTraining.index)}
                className="w-full bg-surface rounded-2xl p-5 text-left active:scale-[0.98] transition-transform"
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
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {nextTraining.day.exercises.length} exercises
                    </div>
                  </div>
                  <div className="text-text-primary font-medium text-sm">Start</div>
                </div>
                {nextTraining.day.note && (
                  <p className="text-[11px] text-text-muted mt-3 leading-relaxed">{nextTraining.day.note}</p>
                )}
              </button>
            </div>
          )}

          {/* Current cycle — adapts to any number of days */}
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <h3 className="label">Current Cycle</h3>
              <span className="text-[9px] text-text-muted">
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
                    <span className="text-[9px] font-medium">{day.label?.replace('Day ', 'D') || `D${i + 1}`}</span>
                    <span className="text-[8px] mt-0.5 truncate w-full px-0.5">
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

      {/* Quick workout (even with enrolled program) */}
      {enrollment && (
        <button
          onClick={() => {
            setSelectedProgramId('quick');
            setSelectedDayId('quick');
            startWorkout('quick', 'quick');
            setView('active');
          }}
          className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        >
          <Plus size={16} className="text-accent" />
          <div className="flex-1">
            <div className="text-sm font-medium">Quick Workout</div>
            <div className="text-[11px] text-text-muted">Freestyle session — add exercises as you go</div>
          </div>
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      )}

      {/* History + Library links */}
      <div className="space-y-2">
        {enrollment && (
          <button
            onClick={() => setView('library')}
            className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
          >
            <Library size={16} className="text-text-muted" />
            <span className="text-sm font-medium flex-1">Program Library</span>
            <ChevronRight size={14} className="text-text-muted" />
          </button>
        )}

        <button
          onClick={() => setView('library')}
          className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
          style={{ display: enrollment ? 'none' : undefined }}
        >
          <Library size={16} className="text-text-muted" />
          <span className="text-sm font-medium flex-1">Program Library</span>
          <ChevronRight size={14} className="text-text-muted" />
        </button>

        {sessions.length > 0 && (
          <button
            onClick={() => setView('days')}
            className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
            // Repurpose days view for history
            style={{ display: 'none' }}
          >
            <History size={16} className="text-text-muted" />
            <span className="text-sm font-medium flex-1">Workout History</span>
            <ChevronRight size={14} className="text-text-muted" />
          </button>
        )}
      </div>

      {/* Program history */}
      {profile.programHistory && profile.programHistory.length > 0 && (
        <div>
          <h3 className="label mb-3">Past Programs</h3>
          <div className="space-y-2">
            {[...profile.programHistory].reverse().map((pc, i) => (
              <div key={i} className="bg-surface rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{pc.programName}</div>
                    <div className="text-[11px] text-text-muted">
                      {pc.durationWeeks}w · {pc.totalSessions} sessions · {pc.reason === 'completed' ? 'Completed' : pc.reason === 'ended_early' ? 'Ended early' : 'Switched'}
                    </div>
                  </div>
                  <div className="text-[10px] text-text-muted">{pc.startDate} → {pc.endDate}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div>
          <h3 className="label mb-3">Recent Workouts</h3>
          <WorkoutHistory sessions={sessions.slice(0, 10)} programs={programs} onDeleteSession={removeSession} onUpdateSession={updateSession} />
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

      {/* Workout Summary */}
      {summarySession && (() => {
        const summaryProgram = programs.find((p) => p.id === summarySession.programId);
        if (!summaryProgram) return null;
        return (
          <WorkoutSummary
            session={summarySession}
            program={summaryProgram}
            prs={summaryPrs}
            previousPrs={summaryPreviousPrs}
            units={profile.units}
            onClose={handleCloseSummary}
          />
        );
      })()}
    </div>
  );
}
