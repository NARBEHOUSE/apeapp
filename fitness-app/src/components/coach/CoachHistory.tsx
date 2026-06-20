import { useState } from 'react';
import { Check, X, Send, MessageSquare, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { CoachLogEntry } from '../../types';
import { toast } from '../shared/Toast';

interface Props {
  log: CoachLogEntry[];
  perspective: 'client' | 'coach';
}

async function exportHistoryPDF(log: CoachLogEntry[], perspective: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Coach / Client History', 14, y);
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleDateString()} · ${perspective} view · ${log.length} entries`, 14, y);
  y += 4;

  // Summary stats
  const pushed = log.filter((e) => e.direction === 'pushed').length;
  const responded = log.filter((e) => e.direction === 'responded').length;
  let totalAccepted = 0, totalDenied = 0;
  for (const entry of log) for (const item of entry.items) { if (item.action === 'accepted') totalAccepted++; if (item.action === 'denied') totalDenied++; }

  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'F');
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.setFont('helvetica', 'bold');
  const stats = [
    { label: 'Pushes', value: pushed, color: [91, 110, 245] },
    { label: 'Responses', value: responded, color: [245, 166, 35] },
    { label: 'Accepted', value: totalAccepted, color: [46, 158, 107] },
    { label: 'Denied', value: totalDenied, color: [232, 87, 87] },
  ];
  const statWidth = (pageWidth - 28) / 4;
  stats.forEach((s, i) => {
    const x = 14 + i * statWidth + statWidth / 2;
    doc.setTextColor(s.color[0], s.color[1], s.color[2]);
    doc.text(String(s.value), x, y, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140);
    doc.text(s.label, x, y + 5, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
  });
  y += 16;

  // Table of entries
  const tableData: string[][] = [];
  for (const entry of log) {
    const date = new Date(entry.timestamp);
    const dateStr = `${date.toLocaleDateString()}\n${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dir = entry.direction === 'pushed' ? 'Pushed' : 'Responded';

    for (const item of entry.items) {
      const status = item.action ? item.action.charAt(0).toUpperCase() + item.action.slice(1) : '—';
      const notes: string[] = [];
      if (item.coachNote) notes.push(`Coach: "${item.coachNote}"`);
      if (item.clientNote) notes.push(`Client: "${item.clientNote}"`);
      tableData.push([dateStr, dir, item.label, status, notes.join('\n') || '—']);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Action', 'Change', 'Status', 'Notes']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.2 },
    headStyles: { fillColor: [40, 40, 50], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 55 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 'auto', fontStyle: 'italic', textColor: [100, 100, 100] },
    },
    didParseCell: (data: unknown) => {
      const d = data as { section: string; column: { index: number }; cell: { styles: { textColor: unknown }; text: string[] } };
      if (d.section === 'body' && d.column.index === 3) {
        const val = d.cell.text[0];
        if (val === 'Accepted') d.cell.styles.textColor = [46, 158, 107];
        else if (val === 'Denied') d.cell.styles.textColor = [232, 87, 87];
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180);
    doc.text(`APE — Coach History Report · Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  doc.save(`coach-history-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function CoachHistory({ log, perspective }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (log.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No history yet</p>;
  }

  const handleExport = async () => {
    try {
      await exportHistoryPDF(log, perspective);
      toast('PDF exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      toast('Export failed', 'error');
    }
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
          <Download size={12} /> Export PDF
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
