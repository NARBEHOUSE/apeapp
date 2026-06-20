import { Check, X, Send, MessageSquare } from 'lucide-react';
import type { CoachLogEntry } from '../../types';

interface Props {
  log: CoachLogEntry[];
  perspective: 'client' | 'coach';
}

export function CoachHistory({ log, perspective }: Props) {
  if (log.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No history yet</p>;
  }

  return (
    <div className="space-y-3">
      {log.map((entry) => (
        <div key={entry.id} className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {entry.direction === 'pushed' ? (
                <Send size={12} className="text-accent-blue" />
              ) : (
                <MessageSquare size={12} className="text-accent-orange" />
              )}
              <span className="text-xs font-semibold">
                {entry.direction === 'pushed'
                  ? perspective === 'coach' ? 'You pushed changes' : 'Coach pushed changes'
                  : perspective === 'client' ? 'You responded' : 'Client responded'}
              </span>
            </div>
            <span className="text-[9px] text-text-muted">
              {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {entry.coachEmail && (
            <div className="text-[10px] text-text-muted">{entry.coachEmail}</div>
          )}

          <div className="space-y-1">
            {entry.items.map((item, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                item.action === 'accepted' ? 'bg-success/5' :
                item.action === 'denied' ? 'bg-danger/5' :
                'bg-surface-raised'
              }`}>
                {item.action === 'accepted' ? (
                  <Check size={12} className="text-success mt-0.5 shrink-0" />
                ) : item.action === 'denied' ? (
                  <X size={12} className="text-danger mt-0.5 shrink-0" />
                ) : (
                  <Send size={12} className="text-accent-blue mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{item.label}</div>
                  {item.coachNote && (
                    <div className="text-[10px] text-text-muted mt-0.5">
                      Coach: &ldquo;{item.coachNote}&rdquo;
                    </div>
                  )}
                  {item.clientNote && (
                    <div className="text-[10px] text-text-muted mt-0.5">
                      Client: &ldquo;{item.clientNote}&rdquo;
                    </div>
                  )}
                  {item.action && (
                    <span className={`text-[9px] font-medium ${item.action === 'accepted' ? 'text-success' : 'text-danger'}`}>
                      {item.action === 'accepted' ? 'Accepted' : 'Denied'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
