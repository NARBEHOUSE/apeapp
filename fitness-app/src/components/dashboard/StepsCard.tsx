import { useState, useMemo } from 'react';
import { Footprints, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { StepEntry } from '../../types';
import { today, formatShortDate } from '../../utils/dateHelpers';
import { saveStepEntry } from '../../db/steps';

interface Props {
  steps: StepEntry[];
  profileId: string;
  stepGoal?: number;
  onStepSaved?: () => void;
}

const DEFAULT_GOAL = 10000;

function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

const RANGES = [7, 30, 60, 90] as const;

export function StepsCard({ steps, profileId, stepGoal = DEFAULT_GOAL, onStepSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<number>(30);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const todayEntry = steps.find((s) => s.date === today());

  const stepsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of steps) map.set(s.date, (map.get(s.date) || 0) + s.steps);
    return map;
  }, [steps]);

  // 7-day sparkline data (compact view)
  const last7Days = useMemo(() => getLastNDays(7), []);
  const weekData = last7Days.map((d) => stepsByDate.get(d) || 0);
  const maxSteps = Math.max(...weekData, 1);
  const weekAvg = weekData.filter((s) => s > 0).length > 0
    ? Math.round(weekData.reduce((a, b) => a + b, 0) / weekData.filter((s) => s > 0).length)
    : 0;

  // Expanded chart data
  const chartData = useMemo(() => {
    const days = getLastNDays(range);
    const xInterval = range <= 7 ? 0 : range <= 30 ? 4 : range <= 60 ? 6 : 9;
    return {
      data: days.map((date) => ({
        label: formatShortDate(date),
        steps: stepsByDate.get(date) || 0,
        isToday: date === today(),
      })),
      xInterval,
      barSize: range <= 7 ? 22 : range <= 30 ? 10 : range <= 60 ? 6 : 4,
    };
  }, [range, stepsByDate]);

  const totalInRange = chartData.data.reduce((s, d) => s + d.steps, 0);
  const daysLogged = chartData.data.filter((d) => d.steps > 0).length;
  const avgInRange = daysLogged > 0 ? Math.round(totalInRange / daysLogged) : 0;

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

  const applyCustomRange = () => {
    const val = parseInt(customInput);
    if (val > 0 && val <= 365) {
      setRange(val);
      setShowCustomInput(false);
      setCustomInput('');
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Footprints size={14} className="text-accent-blue" />
          <h2 className="label">Steps</h2>
        </div>
        <div className="flex items-center gap-2">
          {weekAvg > 0 && !expanded && (
            <span className="text-[10px] text-text-muted">{weekAvg.toLocaleString()} avg/day</span>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded-lg text-text-muted active:scale-95 transition-transform"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Compact sparkline (hidden when expanded) */}
      {!expanded && (
        <div className="flex items-end gap-1 h-10 mb-3">
          {weekData.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${Math.max((s / maxSteps) * 32, 2)}px`,
                  backgroundColor: '#5b6ef5',
                  opacity: last7Days[i] === today() ? 1 : s > 0 ? 0.6 : 0.15,
                }}
              />
              <span className="text-[8px] text-text-muted">
                {new Date(last7Days[i] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded chart view */}
      {expanded && (
        <div className="mb-3">
          {/* Range picker */}
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => { setRange(r); setShowCustomInput(false); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${range === r && !showCustomInput ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
              >
                {r}d
              </button>
            ))}
            <button
              onClick={() => setShowCustomInput((s) => !s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showCustomInput ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
            >
              Custom
            </button>
          </div>

          {showCustomInput && (
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                inputMode="numeric"
                className="input-field text-sm flex-1"
                placeholder="Days (max 365)"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') applyCustomRange(); }}
              />
              <button onClick={applyCustomRange} className="bg-accent-blue text-white px-3 rounded-lg text-xs font-semibold">Go</button>
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 bg-surface-raised rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">{range}d avg</p>
              <p className="text-sm font-bold">{avgInRange > 0 ? avgInRange.toLocaleString() : '—'}</p>
            </div>
            <div className="flex-1 bg-surface-raised rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">Days logged</p>
              <p className="text-sm font-bold">{daysLogged}/{range}</p>
            </div>
            <div className="flex-1 bg-surface-raised rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">Goal</p>
              <p className="text-sm font-bold">{stepGoal.toLocaleString()}</p>
            </div>
          </div>

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData.data} barSize={chartData.barSize} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={chartData.xInterval}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={28}
              />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs border shadow-lg bg-surface border-border-light">
                      <p className="text-text-secondary mb-0.5">{label}</p>
                      <p className="text-accent-blue font-semibold">{(payload[0].value as number).toLocaleString()} steps</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={stepGoal}
                stroke="var(--color-text-muted)"
                strokeDasharray="5 5"
                label={{ value: 'Goal', fill: 'var(--color-text-muted)', fontSize: 9, position: 'insideTopRight' }}
              />
              <Bar
                dataKey="steps"
                radius={[3, 3, 0, 0]}
                fill="#5b6ef5"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Today's steps log */}
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
