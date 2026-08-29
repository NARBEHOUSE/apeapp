import { useMemo, useState } from 'react';
import { Share2, X, Trophy, Clock, Dumbbell, TrendingUp, BookmarkPlus, NotebookPen } from 'lucide-react';
import type { WorkoutSession, Exercise, Program } from '../../types';
import { buildWorkoutCardData, renderWorkoutCard, renderPRCard, shareOrDownload } from '../../utils/shareCards';

interface Props {
  session: WorkoutSession;
  program: Program;
  prs: Record<string, { weight: number; reps: number; date: string }>;
  previousPrs: Record<string, { weight: number }>;
  units: 'imperial' | 'metric';
  onClose: () => void;
  /**
   * Keep what was just done as a reusable standalone workout. Offered whenever the
   * session wasn't simply a library entry run as written — a freestyle session, or one
   * where exercises were added, swapped or dropped.
   */
  onSaveAsWorkout?: (name: string) => Promise<void>;
  defaultWorkoutName?: string;
  onUpdateSession?: (session: WorkoutSession) => void;
}

export function WorkoutSummary({ session, program, prs, previousPrs, units, onClose, onSaveAsWorkout, defaultWorkoutName, onUpdateSession }: Props) {
  const [saving, setSaving] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [namingWorkout, setNamingWorkout] = useState(false);
  const [workoutName, setWorkoutName] = useState(defaultWorkoutName || '');
  const [notes, setNotes] = useState(session.notes || '');
  const day = program.days.find((d) => d.id === session.dayId);
  const dayExercises = day?.exercises || [];
  const unitLabel = units === 'metric' ? 'kg' : 'lbs';

  const cardData = useMemo(
    () => buildWorkoutCardData(session, dayExercises, prs, previousPrs, day || undefined),
    [session, dayExercises, prs, previousPrs, day],
  );

  const sessionPRs = useMemo(() => {
    return dayExercises.filter((ex) => {
      const pr = prs[ex.id];
      const prev = previousPrs[ex.id];
      return pr?.date === session.date && (!prev || pr.weight > prev.weight);
    });
  }, [dayExercises, prs, previousPrs, session.date]);

  const handleShareWorkout = () => {
    const canvas = renderWorkoutCard(cardData);
    shareOrDownload(canvas, `workout-${session.date}.png`);
  };

  const handleSharePR = (exercise: Exercise) => {
    const pr = prs[exercise.id];
    if (!pr) return;
    const canvas = renderPRCard({
      exerciseName: exercise.name,
      weight: pr.weight,
      reps: pr.reps,
      unit: unitLabel,
      date: session.date,
      previousPR: previousPrs[exercise.id]?.weight,
    });
    shareOrDownload(canvas, `pr-${exercise.name.replace(/\s+/g, '-').toLowerCase()}-${session.date}.png`);
  };

  const durationMs = (session.endTime || Date.now()) - session.startTime;
  const mins = Math.floor(durationMs / 60000);
  const durationStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-bg w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl pb-20 sm:pb-5">
        {/* Header */}
        <div className="sticky top-0 bg-bg border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-semibold text-base">Workout Complete</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Day title */}
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: day?.accent || '#e8572a' }}>
              {day?.tag || 'Workout'}
            </div>
            {day?.title && (
              <div className="text-sm text-text-muted mt-0.5">{day.title}</div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl p-3 text-center">
              <Clock size={16} className="mx-auto mb-1 text-text-muted" />
              <div className="text-lg font-bold">{durationStr}</div>
              <div className="text-[0.625rem] text-text-muted uppercase">Duration</div>
            </div>
            <div className="bg-surface rounded-xl p-3 text-center">
              <Dumbbell size={16} className="mx-auto mb-1 text-text-muted" />
              <div className="text-lg font-bold">{cardData.totalSets}</div>
              <div className="text-[0.625rem] text-text-muted uppercase">Sets</div>
            </div>
            <div className="bg-surface rounded-xl p-3 text-center">
              <TrendingUp size={16} className="mx-auto mb-1 text-text-muted" />
              <div className="text-lg font-bold">{Math.round(cardData.totalVolume).toLocaleString()}</div>
              <div className="text-[0.625rem] text-text-muted uppercase">{unitLabel}</div>
            </div>
          </div>

          {/* PRs section */}
          {sessionPRs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Trophy size={14} className="text-accent" />
                <span>Personal Records</span>
              </div>
              {sessionPRs.map((ex) => {
                const pr = prs[ex.id];
                const prev = previousPrs[ex.id];
                return (
                  <button
                    key={ex.id}
                    onClick={() => handleSharePR(ex)}
                    className="w-full bg-surface rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                      <Trophy size={14} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{ex.name}</div>
                      <div className="text-[0.6875rem] text-text-muted">
                        {pr.weight} {unitLabel} × {pr.reps}
                        {prev ? ` (+${pr.weight - prev.weight} ${unitLabel})` : ''}
                      </div>
                    </div>
                    <Share2 size={14} className="text-text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Workout notes */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <NotebookPen size={13} />
              <span>Notes</span>
            </div>
            <textarea
              className="w-full bg-surface rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 border border-transparent focus:border-accent/30"
              rows={3}
              placeholder="How did the workout feel? Any notes for next time…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Exercises list */}
          <div className="space-y-1">
            <div className="text-xs text-text-muted font-semibold uppercase mb-2">Exercises</div>
            {cardData.exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  {ex.prs && <span className="text-accent text-xs">★</span>}
                  <span className="text-sm">{ex.name}</span>
                </div>
                <span className="text-sm text-text-muted">{ex.bestSet}</span>
              </div>
            ))}
          </div>

          {/* Share workout button */}
          <button
            onClick={handleShareWorkout}
            className="w-full bg-accent text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Share2 size={16} />
            Share Workout
          </button>

          {/* Keep this session as a workout you can repeat */}
          {onSaveAsWorkout && !savedToLibrary && (
            namingWorkout ? (
              <div className="bg-surface-raised rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-text-secondary">Name this workout</div>
                <input
                  type="text"
                  autoFocus
                  className="w-full bg-surface rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                  placeholder="e.g. Upper Day"
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setNamingWorkout(false)}
                    className="flex-1 bg-surface text-text-secondary font-medium rounded-lg py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onSaveAsWorkout(workoutName.trim() || defaultWorkoutName || 'My Workout');
                        setSavedToLibrary(true);
                        setNamingWorkout(false);
                      } finally { setSaving(false); }
                    }}
                    disabled={saving}
                    className="flex-1 bg-accent text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setNamingWorkout(true)}
                className="w-full bg-surface-raised text-text-primary font-medium rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <BookmarkPlus size={16} />
                Save to My Workouts
              </button>
            )
          )}

          {savedToLibrary && (
            <div className="w-full bg-surface-raised text-text-muted text-xs rounded-xl py-3 text-center">
              Saved to your workouts — start it again any time from the library.
            </div>
          )}

          {/* Done button */}
          <button
            onClick={() => {
              const trimmed = notes.trim();
              if (onUpdateSession && trimmed !== (session.notes || '').trim()) {
                onUpdateSession({ ...session, notes: trimmed || undefined });
              }
              onClose();
            }}
            className="w-full bg-surface text-text-primary font-medium rounded-xl py-3 active:scale-[0.98] transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
