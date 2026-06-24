import { useState, useMemo } from 'react';
import { Droplets, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { WaterEntry } from '../../types';
import { today, formatShortDate } from '../../utils/dateHelpers';
import { saveWaterEntry, deleteWaterEntry } from '../../db/water';

interface Props {
  water: WaterEntry[];
  profileId: string;
  units: 'imperial' | 'metric';
  onUpdate?: () => void;
}

const QUICK_ADD_OZ = [8, 16, 24];
const QUICK_ADD_ML = [250, 500, 750];
const GOAL_OZ = 128;
const GOAL_ML = 3785;

const RANGES = [7, 30, 60, 90] as const;

function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function WaterCard({ water, profileId, units, onUpdate }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<number>(30);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const isMetric = units === 'metric';
  const unitLabel = isMetric ? 'ml' : 'oz';
  const goal = isMetric ? GOAL_ML : GOAL_OZ;
  const quickAdds = isMetric ? QUICK_ADD_ML : QUICK_ADD_OZ;

  const todayEntries = useMemo(() => water.filter((w) => w.date === today()), [water]);
  const todayTotal = todayEntries.reduce((s, w) => {
    if (w.unit === unitLabel) return s + w.amount;
    if (w.unit === 'oz' && isMetric) return s + w.amount * 29.5735;
    if (w.unit === 'ml' && !isMetric) return s + w.amount / 29.5735;
    return s + w.amount;
  }, 0);

  const pct = Math.min((todayTotal / goal) * 100, 100);

  // Build daily totals for all water entries (normalized to user's unit)
  const waterByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of water) {
      let amount = w.amount;
      if (w.unit === 'oz' && isMetric) amount = w.amount * 29.5735;
      else if (w.unit === 'ml' && !isMetric) amount = w.amount / 29.5735;
      map.set(w.date, (map.get(w.date) || 0) + amount);
    }
    return map;
  }, [water, isMetric]);

  // Chart data for expanded view
  const chartData = useMemo(() => {
    const days = getLastNDays(range);
    const xInterval = range <= 7 ? 0 : range <= 30 ? 4 : range <= 60 ? 6 : 9;
    return {
      data: days.map((date) => ({
        label: formatShortDate(date),
        amount: Math.round(waterByDate.get(date) || 0),
      })),
      xInterval,
      barSize: range <= 7 ? 22 : range <= 30 ? 10 : range <= 60 ? 6 : 4,
    };
  }, [range, waterByDate]);

  const daysLogged = chartData.data.filter((d) => d.amount > 0).length;
  const totalInRange = chartData.data.reduce((s, d) => s + d.amount, 0);
  const avgInRange = daysLogged > 0 ? Math.round(totalInRange / daysLogged) : 0;
  const goalHitDays = chartData.data.filter((d) => d.amount >= goal).length;

  const addWater = async (amount: number) => {
    await saveWaterEntry({
      id: crypto.randomUUID(),
      profileId,
      date: today(),
      amount,
      unit: unitLabel as 'oz' | 'ml',
    });
    onUpdate?.();
  };

  const removeLast = async () => {
    const last = todayEntries[todayEntries.length - 1];
    if (last) {
      await deleteWaterEntry(last.id);
      onUpdate?.();
    }
  };

  const handleCustomAdd = () => {
    const val = parseFloat(customAmount);
    if (val > 0) {
      addWater(val);
      setCustomAmount('');
      setShowCustom(false);
    }
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
          <Droplets size={14} className="text-accent-blue" />
          <h2 className="label">Water</h2>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && <span className="text-[10px] text-text-muted">Goal: {goal} {unitLabel}</span>}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded-lg text-text-muted active:scale-95 transition-transform"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-3 rounded-full bg-surface-raised overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#2e9e6b' : '#5b6ef5' }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums w-20 text-right">
          {Math.round(todayTotal)} <span className="text-text-muted text-xs font-normal">{unitLabel}</span>
        </span>
      </div>

      {/* Expanded trend view */}
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
              <p className="text-sm font-bold">{avgInRange > 0 ? `${avgInRange} ${unitLabel}` : '—'}</p>
            </div>
            <div className="flex-1 bg-surface-raised rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">Goal hit</p>
              <p className="text-sm font-bold">{goalHitDays}/{daysLogged}d</p>
            </div>
            <div className="flex-1 bg-surface-raised rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">Days logged</p>
              <p className="text-sm font-bold">{daysLogged}/{range}</p>
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
                tickFormatter={(v) => isMetric ? (v >= 1000 ? `${(v / 1000).toFixed(1)}L` : String(v)) : `${v}`}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs border shadow-lg bg-surface border-border-light">
                      <p className="text-text-secondary mb-0.5">{label}</p>
                      <p className="text-accent-blue font-semibold">{payload[0].value} {unitLabel}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={goal}
                stroke="var(--color-text-muted)"
                strokeDasharray="5 5"
                label={{ value: 'Goal', fill: 'var(--color-text-muted)', fontSize: 9, position: 'insideTopRight' }}
              />
              <Bar
                dataKey="amount"
                radius={[3, 3, 0, 0]}
                fill="#5b6ef5"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quick add buttons */}
      <div className="flex gap-2">
        {quickAdds.map((amount) => (
          <button
            key={amount}
            onClick={() => addWater(amount)}
            className="flex-1 bg-surface-raised rounded-lg py-2 text-xs font-semibold text-accent-blue flex items-center justify-center gap-1 active:scale-[0.95] transition-transform"
          >
            <Plus size={10} />{amount}{unitLabel}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="bg-surface-raised rounded-lg py-2 px-3 text-xs font-semibold text-text-muted active:scale-[0.95] transition-transform"
        >
          ...
        </button>
        {todayEntries.length > 0 && (
          <button
            onClick={removeLast}
            className="bg-surface-raised rounded-lg py-2 px-2 text-xs text-text-muted active:scale-[0.95] transition-transform"
          >
            <Minus size={12} />
          </button>
        )}
      </div>

      {/* Custom amount */}
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="number"
            inputMode="numeric"
            className="input-field text-sm flex-1"
            placeholder={`Custom ${unitLabel}`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomAdd(); }}
          />
          <button onClick={handleCustomAdd} className="bg-accent-blue text-white px-4 rounded-lg text-xs font-semibold">Add</button>
        </div>
      )}
    </div>
  );
}
