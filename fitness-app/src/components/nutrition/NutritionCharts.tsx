import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { FoodEntry, MacroTargets } from '../../types';
import { getFoodEntriesByProfile } from '../../db/nutrition';
import { today, daysAgo, formatShortDate } from '../../utils/dateHelpers';

interface NutritionChartsProps {
  profileId: string;
  targets: MacroTargets;
  fiberTarget?: number;
}

interface DayData {
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const COLORS = {
  protein: '#5b6ef5',
  carbs: '#2e9e6b',
  fat: '#f5a623',
  calories: '#e8572a',
  fiber: '#888888',
  target: 'var(--color-text-muted)',
  grid: 'var(--color-border)',
  text: 'var(--color-text-muted)',
  tooltipBg: 'var(--color-surface)',
  tooltipBorder: 'var(--color-border-light)',
};

type Metric = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
type ChartType = 'bar' | 'line';
type Range = 7 | 14 | 30;

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: 'calories', label: 'Calories', color: COLORS.calories },
  { id: 'protein',  label: 'Protein',  color: COLORS.protein  },
  { id: 'carbs',    label: 'Carbs',    color: COLORS.carbs    },
  { id: 'fat',      label: 'Fat',      color: COLORS.fat      },
  { id: 'fiber',    label: 'Fiber',    color: COLORS.fiber    },
];

function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
}

function aggregateByDate(entries: FoodEntry[]): Map<string, DayData> {
  const map = new Map<string, DayData>();
  for (const e of entries) {
    const existing = map.get(e.date) || { label: formatShortDate(e.date), calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    existing.calories += e.calories * e.servingsConsumed;
    existing.protein  += e.protein  * e.servingsConsumed;
    existing.carbs    += e.carbs    * e.servingsConsumed;
    existing.fat      += e.fat      * e.servingsConsumed;
    existing.fiber    += (e.fiber || 0) * e.servingsConsumed;
    map.set(e.date, existing);
  }
  return map;
}

function CustomTooltip({ active, payload, label, isCalories }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  isCalories?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs border shadow-lg" style={{ backgroundColor: COLORS.tooltipBg, borderColor: COLORS.tooltipBorder }}>
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value)}{p.name === 'Calories' && isCalories ? ' cal' : 'g'}
        </p>
      ))}
    </div>
  );
}

export function NutritionCharts({ profileId, targets, fiberTarget = 30 }: NutritionChartsProps) {
  const [allEntries, setAllEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(14);
  const [metric, setMetric] = useState<Metric>('calories');
  const [chartType, setChartType] = useState<ChartType>('bar');

  useEffect(() => {
    getFoodEntriesByProfile(profileId).then((entries) => {
      setAllEntries(entries);
      setLoading(false);
    });
  }, [profileId]);

  if (loading) return <div className="text-center py-8 text-text-muted text-sm">Loading charts…</div>;
  if (allEntries.length === 0) return <div className="text-center py-8 text-text-muted text-sm">Start logging food to see nutrition charts</div>;

  const todayStr = today();

  // Today's donut — includes today's entries
  const todayTotals = allEntries
    .filter((e) => e.date === todayStr)
    .reduce((acc, e) => ({
      protein:  acc.protein  + e.protein  * e.servingsConsumed,
      carbs:    acc.carbs    + e.carbs    * e.servingsConsumed,
      fat:      acc.fat      + e.fat      * e.servingsConsumed,
      calories: acc.calories + e.calories * e.servingsConsumed,
    }), { protein: 0, carbs: 0, fat: 0, calories: 0 });

  const donutData = [
    { name: 'Protein', value: Math.round(todayTotals.protein), color: COLORS.protein },
    { name: 'Carbs',   value: Math.round(todayTotals.carbs),   color: COLORS.carbs   },
    { name: 'Fat',     value: Math.round(todayTotals.fat),     color: COLORS.fat     },
  ];
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  // Trend chart — completed days only (exclude today)
  const dataMap = aggregateByDate(allEntries.filter((e) => e.date < todayStr));
  const rangedDays = getLastNDays(range + 1).filter((d) => d < todayStr).slice(-range);
  const barSize = range <= 7 ? 22 : range <= 14 ? 14 : 8;
  const xInterval = range <= 7 ? 0 : range <= 14 ? 1 : 4;

  const rangeData = rangedDays.map((date) => {
    const day = dataMap.get(date);
    return {
      label:    formatShortDate(date),
      calories: Math.round(day?.calories ?? 0),
      protein:  Math.round(day?.protein  ?? 0),
      carbs:    Math.round(day?.carbs    ?? 0),
      fat:      Math.round(day?.fat      ?? 0),
      fiber:    Math.round(day?.fiber    ?? 0),
    };
  });

  const getTarget = (m: Metric) => {
    if (m === 'protein')  return targets.protein;
    if (m === 'carbs')    return targets.carbs;
    if (m === 'fat')      return targets.fat;
    if (m === 'fiber')    return fiberTarget;
    return targets.calories;
  };

  const activeColor = METRICS.find((m) => m.id === metric)!.color;
  const unit = metric === 'calories' ? ' cal' : 'g';
  const isCaloriesView = metric === 'calories';

  const commonAxis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
      <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} interval={xInterval} />
      <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} width={isCaloriesView ? 38 : 30} unit={isCaloriesView ? '' : 'g'} />
    </>
  );

  const targetLine = (
    <ReferenceLine
      y={getTarget(metric)}
      stroke={COLORS.target}
      strokeDasharray="5 5"
      label={{ value: 'Target', fill: COLORS.text, fontSize: 9, position: 'insideTopRight' }}
    />
  );

  function renderTrendChart() {
    if (chartType === 'bar') {
      if (isCaloriesView) {
        // Stacked macro breakdown
        return (
          <BarChart data={rangeData} barSize={barSize}>
            {commonAxis}
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend formatter={(v) => <span className="text-xs text-text-secondary">{v}</span>} />
            <Bar dataKey="protein" name="Protein" stackId="m" fill={COLORS.protein} radius={[0,0,0,0]} />
            <Bar dataKey="carbs"   name="Carbs"   stackId="m" fill={COLORS.carbs}   radius={[0,0,0,0]} />
            <Bar dataKey="fat"     name="Fat"     stackId="m" fill={COLORS.fat}     radius={[3,3,0,0]} />
          </BarChart>
        );
      }
      return (
        <BarChart data={rangeData} barSize={barSize}>
          {commonAxis}
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
          {targetLine}
          <Bar dataKey={metric} name={METRICS.find(m => m.id === metric)!.label} fill={activeColor} radius={[3,3,0,0]} />
        </BarChart>
      );
    }

    // Line mode
    if (isCaloriesView) {
      return (
        <LineChart data={rangeData}>
          {commonAxis}
          <Tooltip content={(p: any) => <CustomTooltip {...p} isCalories />} cursor={{ fill: 'transparent' }} />
          <ReferenceLine y={targets.calories} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: 9, position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="calories" name="Calories" stroke={COLORS.calories} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      );
    }
    return (
      <LineChart data={rangeData}>
        {commonAxis}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
        {targetLine}
        <Line type="monotone" dataKey={metric} name={METRICS.find(m => m.id === metric)!.label} stroke={activeColor} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    );
  }

  return (
    <div className="space-y-3">
      {/* Today's Macro Split */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Today's Macro Split</h4>
        {donutTotal > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                stroke="none"
                activeShape={(props: any) => <Sector {...props} outerRadius={props.outerRadius + 5} />}
              >
                {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                cursor={false}
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
          <p className="text-text-muted text-xs text-center py-8">No food logged today yet</p>
        )}
      </div>

      {/* Unified trend chart */}
      <div className="card p-4">
        {/* Controls row */}
        <div className="flex items-center justify-between mb-4">
          {/* Range picker */}
          <div className="flex gap-1">
            {([7, 14, 30] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${range === r ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}
              >
                {r}d
              </button>
            ))}
          </div>
          {/* Bar / Line toggle */}
          <div className="flex gap-1 bg-surface-raised rounded-lg p-0.5">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'bar' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'line' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted'}`}
            >
              Line
            </button>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200}>
          {renderTrendChart()}
        </ResponsiveContainer>

        {/* Metric chips */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95"
              style={{
                backgroundColor: metric === m.id ? m.color + '22' : 'var(--color-surface-raised)',
                color: metric === m.id ? m.color : 'var(--color-text-muted)',
                outline: metric === m.id ? `1.5px solid ${m.color}55` : 'none',
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: m.color, opacity: metric === m.id ? 1 : 0.4 }}
              />
              {m.label}
              {metric !== m.id && (m.id as string) !== 'calories' && (
                <span className="opacity-50 text-[10px]">{Math.round(getTarget(m.id))}g</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
