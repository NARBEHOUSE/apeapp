import { AlertTriangle, X } from 'lucide-react';

interface Props {
  foodName: string;
  affectedCount: number;
  onUpdateAll: () => void;
  onLibraryOnly: () => void;
  onSaveAsCopy: () => void;
  onCancel: () => void;
}

export function FoodEditWarningModal({ foodName, affectedCount, onUpdateAll, onLibraryOnly, onSaveAsCopy, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-sm bg-surface rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Editing affects your history</div>
            <div className="text-[12px] text-text-secondary mt-1">
              <span className="font-semibold text-text-primary">"{foodName}"</span> appears in{' '}
              <span className="font-semibold text-text-primary">
                {affectedCount} past log {affectedCount === 1 ? 'entry' : 'entries'}
              </span>. Changing macros or serving size will recalculate those entries.
            </div>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1">
            <X size={14} className="text-text-muted" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={onUpdateAll}
            className="w-full text-left bg-warning/10 border border-warning/25 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <div className="text-[12px] font-semibold text-warning">
              Update all {affectedCount} past {affectedCount === 1 ? 'entry' : 'entries'}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">Recalculates history based on new values</div>
          </button>

          <button
            onClick={onLibraryOnly}
            className="w-full text-left bg-surface-raised border border-border rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <div className="text-[12px] font-semibold">Library only</div>
            <div className="text-[11px] text-text-muted mt-0.5">Updates food definition, keeps past entries unchanged</div>
          </button>

          <button
            onClick={onSaveAsCopy}
            className="w-full text-left bg-surface-raised border border-border rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <div className="text-[12px] font-semibold">Save as new food</div>
            <div className="text-[11px] text-text-muted mt-0.5">Creates a copy in your library, history stays intact</div>
          </button>
        </div>

        <button onClick={onCancel} className="w-full text-center text-[12px] text-text-muted py-3 mt-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
