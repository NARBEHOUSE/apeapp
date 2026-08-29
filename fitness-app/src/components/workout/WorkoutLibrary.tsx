import { useMemo, useState } from 'react';
import {
  Copy,
  Trash2,
  Dumbbell,
  ChevronRight,
  Share2,
  Upload,
  Pencil,
  Plus,
  Play,
  CalendarRange,
  Layers,
  X,
  BookmarkPlus,
} from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import type { Program, WorkoutSession } from '../../types';
import { exportProgram, downloadJSON, importProgramsBundle } from '../../utils/exportImport';
import {
  splitLibrary,
  muscleFocus,
  exerciseCount,
  lastPerformedDate,
  formatDaysAgo,
  workoutDayOf,
} from '../../utils/workoutLibrary';
import { toast } from '../shared/Toast';

interface Props {
  /** Every library entry — programs and standalone workouts share one store. */
  entries: Program[];
  sessions: WorkoutSession[];
  /** Start a standalone workout right now. */
  onStartWorkout: (entryId: string) => void;
  /** Start one day of a program without enrolling in it. */
  onStartProgramDay: (programId: string, dayId: string) => void;
  /** Pin one day of a program into the library as a standalone workout. */
  onSaveProgramDay: (programId: string, dayId: string) => void;
  onOpenProgram: (programId: string) => void;
  onDuplicate: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onEdit: (entryId: string) => void;
  onCreateWorkout: () => void;
  onCreateProgram: () => void;
  onReload: () => void;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.625rem] bg-surface-raised rounded-lg px-2 py-0.5 text-text-muted">
      {children}
    </span>
  );
}

function WorkoutCard({ workout, lastDone, onStart, onEdit, onDuplicate, onDelete, onExport }: {
  workout: Program;
  lastDone: string | null;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const day = workoutDayOf(workout);
  const focus = muscleFocus(workout);
  const count = exerciseCount(workout);

  return (
    <div className="w-full bg-surface rounded-2xl p-4">
      <button onClick={onStart} className="w-full text-left active:scale-[0.98] transition-transform">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${day?.accent || 'var(--color-surface-raised)'}20` }}
          >
            <Play size={16} style={{ color: day?.accent || 'var(--color-text-secondary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{workout.name}</div>
            <div className="text-[0.6875rem] text-text-muted truncate">
              {count} exercise{count === 1 ? '' : 's'}
              {focus.length > 0 && ` · ${focus.join(', ')}`}
            </div>
            <div className="text-[0.625rem] text-text-muted mt-0.5">{formatDaysAgo(lastDone)}</div>
          </div>
          <span className="text-sm font-medium shrink-0">Start</span>
        </div>
      </button>

      {workout.sourceProgramName && (
        <div className="mt-2.5">
          <Chip>from {workout.sourceProgramName}</Chip>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-accent-blue"
        >
          <Pencil size={10} /> Edit
        </button>
        <button
          onClick={onDuplicate}
          className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-text-secondary"
        >
          <Copy size={10} /> Duplicate
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-accent-blue"
        >
          <Share2 size={10} /> Share
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-danger ml-auto"
        >
          <Trash2 size={10} /> Delete
        </button>
      </div>
    </div>
  );
}

function ProgramCard({ program, onSelect, onDuplicate, onDelete, onExport, onEdit }: {
  program: Program;
  onSelect: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onEdit?: () => void;
}) {
  const trainingDays = program.days.filter((d) => d.exercises.length > 0).length;

  return (
    <div className="w-full bg-surface rounded-2xl p-4 active:scale-[0.98] transition-transform">
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium mb-1">{program.name}</div>
            <p className="text-xs text-text-muted line-clamp-1 mb-2">{program.description}</p>

            <div className="flex items-center gap-3 text-[0.6875rem] text-text-muted">
              {program.daysPerWeek && (
                <span>{program.daysPerWeek}x/week</span>
              )}
              {!program.daysPerWeek && (
                <span>{trainingDays} training days</span>
              )}
              {program.suggestedDurationWeeks && (
                <span>{program.suggestedDurationWeeks}w</span>
              )}
              {program.goal && (
                <span className="capitalize">{program.goal.type}</span>
              )}
            </div>
          </div>
          <ChevronRight size={16} className="text-text-muted mt-1 shrink-0" />
        </div>
      </button>

      {/* Actions row */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border">
        {!program.isBuiltIn && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-accent-blue"
          >
            <Pencil size={10} /> Edit
          </button>
        )}
        {onDuplicate && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-text-secondary"
          >
            <Copy size={10} /> {program.isBuiltIn ? 'Copy & Edit' : 'Duplicate'}
          </button>
        )}
        {onExport && (
          <button
            onClick={(e) => { e.stopPropagation(); onExport(); }}
            className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-accent-blue"
          >
            <Share2 size={10} /> Share
          </button>
        )}
        {!program.isBuiltIn && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex items-center gap-1 text-[0.6875rem] text-text-muted hover:text-danger ml-auto"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Pick one day out of any program to run — or keep — on its own. This is what makes a
 * strict program usable casually: the prescribed sessions stay available without the
 * schedule that comes with enrolling.
 */
function ProgramDayPicker({ programs, onStart, onSave, onClose }: {
  programs: Program[];
  onStart: (programId: string, dayId: string) => void;
  onSave: (programId: string, dayId: string) => void;
  onClose: () => void;
}) {
  const [openProgramId, setOpenProgramId] = useState<string | null>(
    programs.length === 1 ? programs[0].id : null,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Run a prescribed day whenever you want, or keep it in your workouts to do again.
        You stay off the program&apos;s schedule either way.
      </p>
      {programs.map((program) => {
        const trainingDays = program.days.filter((d) => d.exercises.length > 0);
        if (trainingDays.length === 0) return null;
        const open = openProgramId === program.id;
        return (
          <div key={program.id} className="bg-surface rounded-2xl overflow-hidden">
            <button
              onClick={() => setOpenProgramId(open ? null : program.id)}
              className="w-full flex items-center gap-3 p-3.5 text-left"
            >
              <Layers size={15} className="text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{program.name}</div>
                <div className="text-[0.625rem] text-text-muted">{trainingDays.length} training days</div>
              </div>
              <ChevronRight
                size={14}
                className={`text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
              />
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                {trainingDays.map((day) => (
                  <div key={day.id} className="bg-surface-raised rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-1.5 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: day.accent || 'var(--color-text-muted)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{day.tag || day.title}</div>
                        <div className="text-[0.625rem] text-text-muted truncate">
                          {day.title} · {day.exercises.length} exercises
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { onStart(program.id, day.id); onClose(); }}
                        className="flex-1 py-2 rounded-lg bg-text-primary text-bg text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Play size={11} /> Do it now
                      </button>
                      <button
                        onClick={() => onSave(program.id, day.id)}
                        className="flex-1 py-2 rounded-lg bg-surface text-text-secondary text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <BookmarkPlus size={11} /> Save for later
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WorkoutLibrary({
  entries,
  sessions,
  onStartWorkout,
  onStartProgramDay,
  onSaveProgramDay,
  onOpenProgram,
  onDuplicate,
  onDelete,
  onEdit,
  onCreateWorkout,
  onCreateProgram,
  onReload,
}: Props) {
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);

  const { workouts, programs } = useMemo(() => splitLibrary(entries), [entries]);
  const lastDoneById = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const w of workouts) map[w.id] = lastPerformedDate(w.id, sessions);
    return map;
  }, [workouts, sessions]);

  // Most recently trained first, never-done entries last — a casual library is browsed
  // by "what have I not done in a while", not alphabetically.
  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => (lastDoneById[b.id] || '').localeCompare(lastDoneById[a.id] || '')),
    [workouts, lastDoneById],
  );

  const builtIn = programs.filter((p) => p.isBuiltIn);
  const custom = programs.filter((p) => !p.isBuiltIn);
  const hasProgramDays = programs.some((p) => p.days.some((d) => d.exercises.length > 0));

  const handleExport = async (entry: Program) => {
    try {
      const data = await exportProgram(entry.id);
      const slug = (entry.name || 'workout').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const kind = entry.kind === 'workout' ? 'workout' : 'program';
      await downloadJSON(data, `ape-${kind}-${slug}.json`);
      toast(`${entry.kind === 'workout' ? 'Workout' : 'Program'} exported! Share the file with anyone.`, 'success');
    } catch {
      toast('Export failed', 'error');
    }
  };

  const handleImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const count = await importProgramsBundle(reader.result as string);
        toast(`Imported ${count} item${count > 1 ? 's' : ''}!`, 'success');
        onReload();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* ── Workouts: single sessions, no schedule ── */}
      <div>
        <div className="mb-2">
          <h3 className="label">Workouts</h3>
          <p className="text-[0.625rem] text-text-muted mt-0.5">
            Single sessions you can do any day. No schedule, no falling behind.
          </p>
        </div>

        <div className="space-y-2">
          {sortedWorkouts.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={w}
              lastDone={lastDoneById[w.id]}
              onStart={() => onStartWorkout(w.id)}
              onEdit={() => onEdit(w.id)}
              onDuplicate={() => onDuplicate(w.id)}
              onDelete={() => setDeleteTarget(w)}
              onExport={() => handleExport(w)}
            />
          ))}

          {sortedWorkouts.length === 0 && (
            <div className="bg-surface rounded-2xl p-5 text-center">
              <Dumbbell size={22} className="mx-auto mb-2 text-text-muted" />
              <p className="text-xs text-text-muted">
                No saved workouts yet. Build one, or pull a day out of a program below.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <button
            onClick={onCreateWorkout}
            className="flex-1 py-2.5 rounded-xl border border-dashed border-border-light text-text-secondary text-xs font-medium flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Create Workout
          </button>
          {hasProgramDays && (
            <button
              onClick={() => setShowDayPicker(true)}
              className="flex-1 py-2.5 rounded-xl border border-dashed border-border-light text-text-secondary text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <CalendarRange size={14} /> Use a Program Day
            </button>
          )}
        </div>
      </div>

      {/* ── Programs: multi-day schedules you enroll in ── */}
      <div>
        <div className="mb-2">
          <h3 className="label">Programs</h3>
          <p className="text-[0.625rem] text-text-muted mt-0.5">
            Multi-week schedules with a set rotation. Start one to follow it day by day.
          </p>
        </div>

        <div className="space-y-4">
          {builtIn.length > 0 && (
            <div>
              <div className="text-[0.625rem] text-text-muted uppercase tracking-wide mb-2">Templates</div>
              <div className="space-y-2">
                {builtIn.map((p) => (
                  <ProgramCard
                    key={p.id}
                    program={p}
                    onSelect={() => onOpenProgram(p.id)}
                    onDuplicate={() => onDuplicate(p.id)}
                    onExport={() => handleExport(p)}
                  />
                ))}
              </div>
            </div>
          )}

          {custom.length > 0 && (
            <div>
              <div className="text-[0.625rem] text-text-muted uppercase tracking-wide mb-2">My Programs</div>
              <div className="space-y-2">
                {custom.map((p) => (
                  <ProgramCard
                    key={p.id}
                    program={p}
                    onSelect={() => onOpenProgram(p.id)}
                    onDuplicate={() => onDuplicate(p.id)}
                    onDelete={() => setDeleteTarget(p)}
                    onExport={() => handleExport(p)}
                    onEdit={() => onEdit(p.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onCreateProgram}
          className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-border-light text-text-secondary text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Create Program
        </button>
      </div>

      {/* Import */}
      <label className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform cursor-pointer">
        <div className="w-11 h-11 rounded-xl bg-accent-blue/15 flex items-center justify-center shrink-0">
          <Upload size={18} className="text-accent-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Import</div>
          <div className="text-[0.6875rem] text-text-muted">Load a shared .json workout or program</div>
        </div>
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = '';
          }}
        />
      </label>

      <Modal open={showDayPicker} onClose={() => setShowDayPicker(false)} title="Use a Program Day">
        <ProgramDayPicker
          programs={programs}
          onStart={onStartProgramDay}
          onSave={onSaveProgramDay}
          onClose={() => setShowDayPicker(false)}
        />
        <button
          onClick={() => setShowDayPicker(false)}
          className="w-full mt-4 py-2.5 rounded-xl bg-surface text-text-secondary text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <X size={14} /> Done
        </button>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null); }}
        title={deleteTarget?.kind === 'workout' ? 'Delete Workout' : 'Delete Program'}
        message={`This permanently deletes "${deleteTarget?.name}". Your logged sessions and lift history are preserved.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
