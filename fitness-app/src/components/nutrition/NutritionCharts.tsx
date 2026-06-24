import { useState, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { FoodEntry, MacroTargets } from '../../types';
import { getFoodEntriesByProfile } from '../../db/nutrition';
import { today, daysAgo, formatShortDate } from '../../utils/dateHelpers';

interface NutritionChartsProps {
  profileId: string;
  targets: MacroTargets;
}

interface DayData {
  date: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const COLORS = {
  protein: '#5b6ef5',
  carbs: '#2e9e6b',
  fat: '#f5a623',
  calories: '#e8572a',
  target: 'var(--color-text-muted)',
  grid: 'var(--color-border)',
  text: 'var(--color-text-muted)',
  tooltipBg: 'var(--color-surface)',
  tooltipBorder: 'var(--color-border-light)',
};

function aggregateByDate(entries: FoodEntry[]): Map<string, DayData> {
  const map = new Map<string, DayData>();
  for (const e of entries) {
    const existing = map.get(e.date) || {
      date: e.date,
      label: formatShortDate(e.date),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    existing.calories += Math.round(e.calories * e.servingsConsumed);
    existing.protein += Math.round(e.protein * e.servingsConsumed);
    existing.carbs += Math.round(e.carbs * e.servingsConsumed);
    existing.fat += Math.round(e.fat * e.servingsConsumed);
    map.set(e.date, existing);
  }
  return map;
}

function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs border shadow-lg"
      style={{ backgroundColor: COLORS.tooltipBg, borderColor: COLORS.tooltipBorder }}
    >
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value)}{p.name === 'Calories' ? ' cal' : 'g'}
        </p>
      ))}
    </div>
  );
}

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-text-secondary">{title}</span>
        {open ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

type Range = 7 | 14 | 30;

export function NutritionCharts({ profileId, targets }: NutritionChartsProps) {
  const [allEntries, setAllEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(14);

  useEffect(() => {
    async function load() {
      const entries = await getFoodEntriesByProfile(profileId);
      setAllEntries(entries);
      setLoading(false);
    }
    load();
  }, [profileId]);

  if (loading) {
    return <div className="text-center py-8 text-text-muted text-sm">Loading charts...</div>;
  }

  if (allEntries.length === 0) {
    return <div className="text-center py-8 text-text-muted text-sm">Start logging food to see nutrition charts</div>;
  }

  const todayStr = today();
  // Trend charts only use completed past days (exclude today so partial data doesn't skew charts)
  const dataMap = aggregateByDate(allEntries.filter((e) => e.date < todayStr));

  // range days = last N completed days, today excluded
  const rangedDays = getLastNDays(range + 1).filter((d) => d < todayStr).slice(-range);
  const barSize = range <= 7 ? 22 : range <= 14 ? 14 : 8;
  const xInterval = range <= 7 ? 0 : range <= 14 ? 1 : 4;

  const rangeData = rangedDays.map((date) => {
    const day = dataMap.get(date);
    return {
      label: formatShortDate(date),
      calories: day?.calories ?? 0,
      protein: day?.protein ?? 0,
      carbs: day?.carbs ?? 0,
      fat: day?.fat ?? 0,
    };
  });

  // Today's macro split — uses all entries including today (not the trend dataMap)
  const todayEntries = allEntries.filter((e) => e.date === todayStr);
  const todayTotals = todayEntries.reduce(
    (acc, e) => ({
      protein: acc.protein + e.protein * e.servingsConsumed,
      carbs: acc.carbs + e.carbs * e.servingsConsumed,
      fat: acc.fat + e.fat * e.servingsConsumed,
      calories: acc.calories + e.calories * e.servingsConsumed,
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  );
  const donutData = [
    { name: 'Protein', value: Math.round(todayTotals.protein), color: COLORS.protein },
    { name: 'Carbs', value: Math.round(todayTotals.carbs), color: COLORS.carbs },
    { name: 'Fat', value: Math.round(todayTotals.fat), color: COLORS.fat },
  ];
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-3">
      {/* Today's Macro Split */}
      <Section title="Today's Macro Split">
        {donutTotal > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" stroke="none">
                {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0];
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs border shadow-lg" style={{ backgroundColor: COLORS.tooltipBg, borderColor: COLORS.tooltipBorder }}>
                      <p style={{ color: d.payload.color }}>{d.name}: {Math.round(d.value as number)}g</p>
                    </div>
                  );
                }}
              />
              <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-text-muted text-xs text-center py-6">No food logged today yet</p>
        )}
      </Section>

      {/* Time range picker — applies to all trend charts below */}
      <div className="flex items-center gap-1 px-1">
        <span className="text-xs text-text-muted mr-1">Range:</span>
        {([7, 14, 30] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${range === r ? 'bg-accent-orange text-white' : 'bg-surface-raised text-text-muted'}`}
          >
            {r}d
          </button>
        ))}
      </div>

      {/* Calories vs Target */}
      <Section title="Calories vs Target">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rangeData} barSize={barSize}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <ReferenceLine y={targets.calories} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'insideTopRight' }} />
            <Bar dataKey="calories" name="Calories" fill={COLORS.calories} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Daily Protein */}
      <Section title="Protein vs Target">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={rangeData} barSize={barSize}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={30} unit="g" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <ReferenceLine y={targets.protein} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'insideTopRight' }} />
            <Bar dataKey="protein" name="Protein" fill={COLORS.protein} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Daily Carbs */}
      <Section title="Carbs vs Target" defaultOpen={false}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={rangeData} barSize={barSize}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={30} unit="g" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <ReferenceLine y={targets.carbs} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'insideTopRight' }} />
            <Bar dataKey="carbs" name="Carbs" fill={COLORS.carbs} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Daily Fat */}
      <Section title="Fat vs Target" defaultOpen={false}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={rangeData} barSize={barSize}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={30} unit="g" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <ReferenceLine y={targets.fat} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'insideTopRight' }} />
            <Bar dataKey="fat" name="Fat" fill={COLORS.fat} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Stacked Macro Breakdown */}
      <Section title="Macro Breakdown" defaultOpen={false}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rangeData} barSize={barSize}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={30} unit="g" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
            <Bar dataKey="protein" name="Protein" stackId="m" fill={COLORS.protein} radius={[0, 0, 0, 0]} />
            <Bar dataKey="carbs" name="Carbs" stackId="m" fill={COLORS.carbs} radius={[0, 0, 0, 0]} />
            <Bar dataKey="fat" name="Fat" stackId="m" fill={COLORS.fat} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Line chart: all macros trend */}
      <Section title="Macro Trends (Line)" defaultOpen={false}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rangeData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={30} unit="g" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
            <Line type="monotone" dataKey="protein" name="Protein" stroke={COLORS.protein} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="carbs" name="Carbs" stroke={COLORS.carbs} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="fat" name="Fat" stroke={COLORS.fat} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}
