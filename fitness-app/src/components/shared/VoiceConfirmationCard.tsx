import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  message: string;
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
  autoDismissSeconds?: number;
}

export function VoiceConfirmationCard({ message, detail, onConfirm, onCancel, autoDismissSeconds = 8 }: Props) {
  const [remaining, setRemaining] = useState(autoDismissSeconds);

  useEffect(() => {
    if (remaining <= 0) { onCancel(); return; }
    const timer = setTimeout(() => setRemaining((r) => r - 0.1), 100);
    return () => clearTimeout(timer);
  }, [remaining, onCancel]);

  const pct = (remaining / autoDismissSeconds) * 100;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 max-w-lg mx-auto animate-in slide-in-from-bottom">
      <div className="bg-surface rounded-2xl shadow-lg border border-border p-4 space-y-3">
        {/* Countdown bar */}
        <div className="h-1 rounded-full bg-surface-raised overflow-hidden">
          <div className="h-full rounded-full bg-accent-blue transition-all duration-100" style={{ width: `${pct}%` }} />
        </div>

        <div>
          <div className="text-sm font-semibold">{message}</div>
          {detail && <div className="text-[11px] text-text-muted mt-0.5">{detail}</div>}
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-surface-raised text-text-muted text-xs font-medium flex items-center justify-center gap-1 active:scale-[0.98] transition-transform">
            <X size={14} /> Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-[0.98] transition-transform">
            <Check size={14} /> Confirm
          </button>
        </div>

        <div className="text-[9px] text-text-muted text-center">Say "yes" to confirm · Voice mode is in beta</div>
      </div>
    </div>
  );
}
