import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Measurement } from '../../types';
import { formatShortDate, daysAgo } from '../../utils/dateHelpers';

interface Props {
  measurements: Measurement[];
  weightUnit: 'lbs' | 'kg';
}

type Range = '30d' | '90d' | 'all';

const BODY_MEASUREMENT_COLORS: Record<string, string> = {
  chest: '#e8572a',
  waist: '#5b6ef5',
  hips: '#2e9e6b',
  leftArm: '#f5a623',
  rightArm: '#e8a020',
  leftThigh: '#c44fc4',
  rightThigh: '#e85757',
  neck: '#888888',
  shoulders: '#42d4f4',
};

const BODY_MEASUREMENT_LABELS: Record<string, string> = {
  chest: 'Chest', waist: 'Waist', hips: 'Hips',
  leftArm: 'L Arm', rightArm: 'R Arm',
  leftThigh: 'L Thigh', rightThigh: 'R Thigh',
  neck: 'Neck', shoulders: 'Shoulders',
  bust: 'Bust', leftBicep: 'L Bicep', rightBicep: 'R Bicep',
  leftCalf: 'L Calf', rightCalf: 'R Calf',
  leftForearm: 'L Forearm', rightForearm: 'R Forearm',
  leftAnkle: 'L Ankle', rightAnkle: 'R Ankle',
  leftWrist: 'L Wrist', rightWrist: 'R Wrist',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-raised border border-border-light rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function toDisplayW(weight: number, storedUnit: string | undefined, displayUnit: 'lbs' | 'kg'): number {
  const from = storedUnit ?? 'lbs';
  if (from === displayUnit) return weight;
  if (from === 'kg' && displayUnit === 'lbs') return Math.round(weight * 2.20462 * 10) / 10;
  return Math.round(weight * 0.453592 * 100) / 100;
}

export function ProgressCharts({ measurements, weightUnit }: Props) {
  const [range, setRange] = useState<Range>('30d');

  const sorted = useMemo(
    () => [...measurements].sort((a, b) => a.date.localeCompare(b.date)),
    [measurements]
  );

  const cutoff = range === '30d' ? daysAgo(30) : range === '90d' ? daysAgo(90) : '';

  const weightData = useMemo(() => {
    return sorted
      .filter((m) => m.weight != null && (cutoff === '' || m.date >= cutoff))
      .map((m) => ({
        date: formatShortDate(m.date),
        weight: toDisplayW(m.weight!, m.weightUnit, weightUnit),
      }));
  }, [sorted, cutoff, weightUnit]);

  const bodyKeys = useMemo(() => {
    const keys = new Set<string>();
    sorted.forEach((m) => {
      if (m.measurements) {
        Object.entries(m.measurements).forEach(([k, v]) => {
          if (v != null && v > 0) keys.add(k);
        });
      }
    });
    return Array.from(keys);
  }, [sorted]);

  const bodyData = useMemo(() => {
    return sorted
      .filter(
        (m) => m.measurements && (cutoff === '' || m.date >= cutoff)
      )
      .map((m) => {
        const row: Record<string, string | number | undefined> = { date: formatShortDate(m.date) };
        if (m.measurements) {
          for (const key of bodyKeys) {
            const val = m.measurements[key as keyof typeof m.measurements];
            if (val != null && val > 0) row[key] = val;
          }
        }
        return row;
      });
  }, [sorted, cutoff, bodyKeys]);

  const rangeButtons: { label: string; value: Range }[] = [
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'All', value: 'all' },
  ];

  if (measurements.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {rangeButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setRange(btn.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              range === btn.value
                ? 'bg-accent-blue text-white'
                : 'bg-surface-raised text-text-secondary border border-border-light'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {weightData.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">
            Weight Over Time ({weightUnit})
          </h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight"
                  stroke="#e8572a"
                  strokeWidth={2}
                  dot={{ fill: '#e8572a', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {bodyData.length > 0 && bodyKeys.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">
            Body Measurements
          </h4>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
                />
                {bodyKeys.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={BODY_MEASUREMENT_LABELS[key] || key}
                    stroke={BODY_MEASUREMENT_COLORS[key] || '#888888'}
                    strokeWidth={2}
                    dot={{ fill: BODY_MEASUREMENT_COLORS[key] || '#888888', r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
