import { useState, useMemo } from 'react';
import { Footprints, Check } from 'lucide-react';
import type { StepEntry } from '../../types';
import { today } from '../../utils/dateHelpers';
import { saveStepEntry } from '../../db/steps';

interface Props {
  steps: StepEntry[];
  profileId: string;
  onStepSaved?: () => void;
}

function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function StepsCard({ steps, profileId, onStepSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const todayEntry = steps.find((s) => s.date === today());
  const last7Days = useMemo(() => getLastNDays(7), []);

  const stepsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of steps) map.set(s.date, (map.get(s.date) || 0) + s.steps);
    return map;
  }, [steps]);

  const weekData = last7Days.map((d) => stepsByDate.get(d) || 0);
  const maxSteps = Math.max(...weekData, 1);
  const weekAvg = weekData.filter((s) => s > 0).length > 0
    ? Math.round(weekData.reduce((a, b) => a + b, 0) / weekData.filter((s) => s > 0).length)
    : 0;

  const handleSave = async () => {
    const val = parseInt(inputVal);
    if (isNaN(val) || val <= 0) return;
    await saveStepEntry({
      id: todayEntry?.id || crypto.randomUUID(),
      profileId,
      date: today(),
      steps: val,
      source: 'manual',
    });
    setEditing(false);
    setInputVal('');
    onStepSaved?.();
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Footprints size={14} className="text-accent-blue" />
          <h2 className="label">Steps</h2>
        </div>
        {weekAvg > 0 && (
          <span className="text-[10px] text-text-muted">{weekAvg.toLocaleString()} avg/day</span>
        )}
      </div>

      {/* Sparkline */}
      <div className="flex items-end gap-1 h-10 mb-3">
        {weekData.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max((s / maxSteps) * 32, 2)}px`,
                backgroundColor: last7Days[i] === today() ? '#5b6ef5' : s > 0 ? '#5b6ef5' : 'var(--color-border)',
                opacity: last7Days[i] === today() ? 1 : 0.5,
              }}
            />
            <span className="text-[8px] text-text-muted">
              {new Date(last7Days[i] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
            </span>
          </div>
        ))}
      </div>

      {/* Today's steps */}
      {editing ? (
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            className="input-field text-sm flex-1"
            placeholder="Steps today"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button onClick={handleSave} className="bg-accent-blue text-white px-3 rounded-lg">
            <Check size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setEditing(true); setInputVal(todayEntry ? String(todayEntry.steps) : ''); }}
          className="w-full bg-surface-raised rounded-xl py-2.5 text-center active:scale-[0.98] transition-transform"
        >
          {todayEntry ? (
            <div>
              <span className="text-lg font-bold">{todayEntry.steps.toLocaleString()}</span>
              <span className="text-[10px] text-text-muted ml-1">steps today</span>
            </div>
          ) : (
            <span className="text-sm text-text-muted">Tap to log steps</span>
          )}
        </button>
      )}
    </div>
  );
}
