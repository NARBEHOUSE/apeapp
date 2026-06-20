import { useState } from 'react';
import { Check, X, Send, MessageSquare, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { CoachLogEntry } from '../../types';
import { toast } from '../shared/Toast';

interface Props {
  log: CoachLogEntry[];
  perspective: 'client' | 'coach';
}

function generateHistoryPDF(log: CoachLogEntry[], perspective: string) {
  const lines: string[] = [];
  lines.push('COACH/CLIENT HISTORY REPORT');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Perspective: ${perspective}`);
  lines.push(`Total entries: ${log.length}`);
  lines.push('');

  // Summary stats
  const pushed = log.filter((e) => e.direction === 'pushed').length;
  const responded = log.filter((e) => e.direction === 'responded').length;
  let totalAccepted = 0;
  let totalDenied = 0;
  for (const entry of log) {
    for (const item of entry.items) {
      if (item.action === 'accepted') totalAccepted++;
      if (item.action === 'denied') totalDenied++;
    }
  }
  lines.push(`SUMMARY: ${pushed} pushes, ${responded} responses, ${totalAccepted} accepted, ${totalDenied} denied`);
  lines.push('═'.repeat(60));
  lines.push('');

  for (const entry of log) {
    const date = new Date(entry.timestamp);
    const dir = entry.direction === 'pushed'
      ? perspective === 'coach' ? 'Coach pushed changes' : 'Coach pushed changes'
      : perspective === 'client' ? 'Client responded' : 'Client responded';
    lines.push(`[${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${dir}`);
    if (entry.coachEmail) lines.push(`  Coach: ${entry.coachEmail}`);

    for (const item of entry.items) {
      const status = item.action ? ` [${item.action.toUpperCase()}]` : '';
      lines.push(`  • ${item.label}${status}`);
      if (item.coachNote) lines.push(`    Coach note: "${item.coachNote}"`);
      if (item.clientNote) lines.push(`    Client note: "${item.clientNote}"`);
    }
    lines.push('─'.repeat(40));
  }

  return lines.join('\n');
}

export function CoachHistory({ log, perspective }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (log.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No history yet</p>;
  }

  const handleExport = () => {
    const text = generateHistoryPDF(log, perspective);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coach-history-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('History exported', 'success');
  };

  const pushed = log.filter((e) => e.direction === 'pushed').length;
  const responded = log.filter((e) => e.direction === 'responded').length;

  return (
    <div className="space-y-3">
      {/* Summary + export */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-text-muted">
          {log.length} entries · {pushed} pushed · {responded} responded
        </div>
        <button onClick={handleExport} className="flex items-center gap-1 text-[10px] text-accent-blue font-medium">
          <Download size={12} /> Export
        </button>
      </div>

      {log.map((entry) => {
        const isExpanded = expandedId === entry.id;
        const acceptCount = entry.items.filter((i) => i.action === 'accepted').length;
        const denyCount = entry.items.filter((i) => i.action === 'denied').length;

        return (
          <div key={entry.id} className="card overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              className="w-full p-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {entry.direction === 'pushed' ? (
                  <Send size={12} className="text-accent-blue shrink-0" />
                ) : (
                  <MessageSquare size={12} className="text-accent-orange shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-xs font-semibold block truncate">
                    {entry.direction === 'pushed'
                      ? perspective === 'coach' ? 'You pushed changes' : 'Coach pushed changes'
                      : perspective === 'client' ? 'You responded' : 'Client responded'}
                  </span>
                  <span className="text-[9px] text-text-muted">
                    {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{entry.items.length} item{entry.items.length > 1 ? 's' : ''}
                    {acceptCount > 0 && <span className="text-success"> · {acceptCount} accepted</span>}
                    {denyCount > 0 && <span className="text-danger"> · {denyCount} denied</span>}
                  </span>
                </div>
              </div>
              {isExpanded ? <ChevronUp size={14} className="text-text-muted shrink-0" /> : <ChevronDown size={14} className="text-text-muted shrink-0" />}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-1 border-t border-border pt-2">
                {entry.coachEmail && (
                  <div className="text-[10px] text-text-muted mb-1">{entry.coachEmail}</div>
                )}
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
                        <div className="text-[10px] text-text-muted mt-0.5">Coach: &ldquo;{item.coachNote}&rdquo;</div>
                      )}
                      {item.clientNote && (
                        <div className="text-[10px] text-text-muted mt-0.5">Client: &ldquo;{item.clientNote}&rdquo;</div>
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
            )}
          </div>
        );
      })}
    </div>
  );
}
