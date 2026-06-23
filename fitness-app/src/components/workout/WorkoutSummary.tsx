import { useMemo, useState } from 'react';
import { Share2, X, Trophy, Clock, Dumbbell, TrendingUp, BookmarkPlus } from 'lucide-react';
import type { WorkoutSession, Exercise, Program } from '../../types';
import { buildWorkoutCardData, renderWorkoutCard, renderPRCard, shareOrDownload } from '../../utils/shareCards';

interface Props {
  session: WorkoutSession;
  program: Program;
  prs: Record<string, { weight: number; reps: number; date: string }>;
  previousPrs: Record<string, { weight: number }>;
  units: 'imperial' | 'metric';
  onClose: () => void;
  onSaveAsProgram?: () => Promise<void>;
}

export function WorkoutSummary({ session, program, prs, previousPrs, units, onClose, onSaveAsProgram }: Props) {
  const [saving, setSaving] = useState(false);
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
              <div className="text-[10px] text-text-muted uppercase">Duration</div>
            </div>
            <div className="bg-surface rounded-xl p-3 text-center">
              <Dumbbell size={16} className="mx-auto mb-1 text-text-muted" />
              <div className="text-lg font-bold">{cardData.totalSets}</div>
              <div className="text-[10px] text-text-muted uppercase">Sets</div>
            </div>
            <div className="bg-surface rounded-xl p-3 text-center">
              <TrendingUp size={16} className="mx-auto mb-1 text-text-muted" />
              <div className="text-lg font-bold">{Math.round(cardData.totalVolume).toLocaleString()}</div>
              <div className="text-[10px] text-text-muted uppercase">{unitLabel}</div>
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
                      <div className="text-[11px] text-text-muted">
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

          {/* Save as Program (quick workouts only) */}
          {onSaveAsProgram && (
            <button
              onClick={async () => {
                setSaving(true);
                try { await onSaveAsProgram(); } finally { setSaving(false); }
              }}
              disabled={saving}
              className="w-full bg-surface-raised text-text-primary font-medium rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <BookmarkPlus size={16} />
              {saving ? 'Saving…' : 'Save as Program'}
            </button>
          )}

          {/* Done button */}
          <button
            onClick={onClose}
            className="w-full bg-surface text-text-primary font-medium rounded-xl py-3 active:scale-[0.98] transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
