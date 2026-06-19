import { Copy, Trash2, Dumbbell, Target, Calendar, ChevronRight, Share2, Upload, Pencil } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { Program } from '../../types';
import { exportProgram, downloadJSON, importProgramsBundle } from '../../utils/exportImport';
import { toast } from '../shared/Toast';

interface Props {
  programs: Program[];
  onSelect: (programId: string) => void;
  onDuplicate: (programId: string) => void;
  onDelete: (programId: string) => void;
  onEdit?: (programId: string) => void;
  onReload?: () => void;
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
    <button
      onClick={onSelect}
      className="w-full bg-surface rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium mb-1">{program.name}</div>
          <p className="text-xs text-text-muted line-clamp-1 mb-2">{program.description}</p>

          <div className="flex items-center gap-3 text-[11px] text-text-muted">
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

      {/* Actions row */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border">
        {!program.isBuiltIn && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue"
          >
            <Pencil size={10} /> Edit
          </button>
        )}
        {onDuplicate && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
          >
            <Copy size={10} /> {program.isBuiltIn ? 'Copy & Edit' : 'Duplicate'}
          </button>
        )}
        {onExport && (
          <button
            onClick={(e) => { e.stopPropagation(); onExport(); }}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue"
          >
            <Share2 size={10} /> Share
          </button>
        )}
        {!program.isBuiltIn && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-danger ml-auto"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </button>
  );
}

export function ProgramList({ programs, onSelect, onDuplicate, onDelete, onEdit, onReload }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleExport = async (programId: string) => {
    try {
      const data = await exportProgram(programId);
      const program = programs.find((p) => p.id === programId);
      const slug = (program?.name || 'program').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await downloadJSON(data, `ape-program-${slug}.json`);
      toast('Program exported! Share the file with anyone.', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  };

  const handleImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const count = await importProgramsBundle(reader.result as string);
        toast(`Imported ${count} program${count > 1 ? 's' : ''}!`, 'success');
        onReload?.();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
  };

  const builtIn = programs.filter((p) => p.isBuiltIn);
  const custom = programs.filter((p) => !p.isBuiltIn);

  return (
    <div className="space-y-5">
      {/* Import button */}
      <label className="w-full bg-surface rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform cursor-pointer">
        <div className="w-11 h-11 rounded-xl bg-accent-blue/15 flex items-center justify-center shrink-0">
          <Upload size={18} className="text-accent-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Import Program</div>
          <div className="text-[11px] text-text-muted">Load a shared .json program file</div>
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

      {builtIn.length > 0 && (
        <div>
          <h3 className="label mb-2">Templates</h3>
          <div className="space-y-2">
            {builtIn.map((p) => (
              <ProgramCard
                key={p.id}
                program={p}
                onSelect={() => onSelect(p.id)}
                onDuplicate={() => onDuplicate(p.id)}
                onExport={() => handleExport(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {custom.length > 0 && (
        <div>
          <h3 className="label mb-2">My Programs</h3>
          <div className="space-y-2">
            {custom.map((p) => (
              <ProgramCard
                key={p.id}
                program={p}
                onSelect={() => onSelect(p.id)}
                onDuplicate={() => onDuplicate(p.id)}
                onDelete={() => setDeleteTarget(p.id)}
                onExport={() => handleExport(p.id)}
                onEdit={onEdit ? () => onEdit(p.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {programs.length === 0 && (
        <div className="text-center py-10">
          <Dumbbell size={28} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-muted">No programs yet</p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget); setDeleteTarget(null); }}
        title="Delete Program"
        message="This will permanently delete this program. Your workout history will be preserved."
        confirmText="Delete"
        danger
      />
    </div>
  );
}
