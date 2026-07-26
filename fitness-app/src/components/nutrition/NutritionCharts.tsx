import { useState, useEffect } from 'react';
import { useFontScale } from '../../utils/fontSize';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
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
type ViewMode = 'continuous' | 'weekly';

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: 'calories', label: 'Calories', color: COLORS.calories },
  { id: 'protein',  label: 'Protein',  color: COLORS.protein  },
  { id: 'carbs',    label: 'Carbs',    color: COLORS.carbs    },
  { id: 'fat',      label: 'Fat',      color: COLORS.fat      },
  { id: 'fiber',    label: 'Fiber',    color: COLORS.fiber    },
];

// Pure SVG donut helpers — no recharts, no activeShape conflicts
function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function donutArcPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const s  = polarXY(cx, cy, r2, a1);
  const e  = polarXY(cx, cy, r2, a2);
  const s2 = polarXY(cx, cy, r1, a2);
  const e2 = polarXY(cx, cy, r1, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r2} ${r2} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} A ${r1} ${r1} 0 ${large} 0 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)} Z`;
}

// Rolling N days ending today (today always rightmost)
function getContinuousDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
}

// Calendar-aligned days from current Monday (or further back), through today — no blank future days
function getWeeklyDays(range: Range, todayStr: string): string[] {
  const todayDate = new Date(todayStr + 'T00:00:00');
  const dayOfWeek = todayDate.getDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // How many full weeks back to start
  const weeksBack = range === 7 ? 0 : range === 14 ? 1 : 3;
  const startDate = new Date(todayDate);
  startDate.setDate(todayDate.getDate() - daysFromMonday - weeksBack * 7);

  const result: string[] = [];
  const d = new Date(startDate);
  while (d <= todayDate) {
    result.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return result;
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
          {p.name}: {Math.round(p.value)}{isCalories ? ' cal' : 'g'}
        </p>
      ))}
    </div>
  );
}

// Pure SVG bar chart — multi-select with dim-others behavior
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  if (n < 1.5) return mag;
  if (n < 3.5) return 2 * mag;
  if (n < 7.5) return 5 * mag;
  return 10 * mag;
}

type BarData = {
  label: string; calories: number; protein: number; carbs: number; fat: number; fiber: number;
  proteinCal: number; carbsCal: number; fatCal: number;
};

function getMetricValue(d: BarData, m: Metric): number {
  switch (m) {
    case 'calories': return d.calories;
    case 'protein':  return d.protein;
    case 'carbs':    return d.carbs;
    case 'fat':      return d.fat;
    case 'fiber':    return d.fiber;
  }
}

function SVGBarChart({
  data, isCalories, metric, activeColor, targets, fiberTarget,
  selectedBars, onBarClick,
}: {
  data: BarData[];
  isCalories: boolean;
  metric: Metric;
  activeColor: string;
  targets: MacroTargets;
  fiberTarget: number;
  selectedBars: Set<number>;
  onBarClick: (i: number) => void;
}) {
  const W = 320, H = 150;
  const ml = isCalories ? 40 : 34, mr = 8, mt = 8, mb = 20;
  const cw = W - ml - mr, ch = H - mt - mb;

  const targetVal = isCalories ? targets.calories
    : metric === 'protein' ? targets.protein
    : metric === 'carbs' ? targets.carbs
    : metric === 'fat' ? targets.fat
    : fiberTarget;

  const dataMax = isCalories
    ? Math.max(...data.map(d => d.proteinCal + d.carbsCal + d.fatCal), 1)
    : Math.max(...data.map(d => getMetricValue(d, metric)), 1);

  const rawMax = Math.max(dataMax, targetVal);
  const step = niceStep(rawMax / 4);
  const maxVal = Math.ceil(rawMax / step + 1) * step;

  const yPos = (v: number) => mt + ch - (v / maxVal) * ch;
  const ticks = Array.from({ length: Math.floor(maxVal / step) + 1 }, (_, i) => i * step);

  const slotW = cw / Math.max(data.length, 1);
  const barW = Math.max(4, Math.min(22, slotW * 0.65));
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : 5;
  const isAnySelected = selectedBars.size > 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={200}>
      {/* Grid lines + Y labels */}
      {ticks.map((v, ti) => {
        const y = yPos(v);
        return (
          <g key={ti}>
            <line x1={ml} y1={y} x2={ml + cw} y2={y}
              stroke={COLORS.grid} strokeWidth={0.5} strokeDasharray={v === 0 ? undefined : '3 3'} />
            <text x={ml - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill={COLORS.text}>
              {isCalories ? v : `${v}g`}
            </text>
          </g>
        );
      })}

      {/* Target reference line */}
      {targetVal > 0 && (() => {
        const ty = yPos(targetVal);
        if (ty < mt - 4 || ty > mt + ch + 4) return null;
        return (
          <g>
            <line x1={ml} y1={ty} x2={ml + cw} y2={ty}
              stroke={COLORS.target} strokeWidth={1} strokeDasharray="5 5" />
            <text x={ml + cw - 2} y={ty - 3} textAnchor="end" fontSize={9} fill={COLORS.text}>Target</text>
          </g>
        );
      })()}

      {/* Bars */}
      {data.map((d, i) => {
        const x = ml + i * slotW + (slotW - barW) / 2;
        const isSelected = selectedBars.has(i);
        const dim = isAnySelected && !isSelected;

        if (isCalories) {
          const h1 = (d.proteinCal / maxVal) * ch;
          const h2 = (d.carbsCal / maxVal) * ch;
          const h3 = (d.fatCal / maxVal) * ch;
          const totalH = h1 + h2 + h3;
          const base = mt + ch;
          return (
            <g key={i} onClick={() => onBarClick(i)} style={{ cursor: 'pointer' }}
              opacity={dim ? 0.2 : 1}>
              <rect x={x - 3} y={mt} width={barW + 6} height={ch} fill="transparent" />
              {h3 > 0.5 && <rect x={x} y={base - h3} width={barW} height={h3} fill={COLORS.fat} />}
              {h2 > 0.5 && <rect x={x} y={base - h3 - h2} width={barW} height={h2} fill={COLORS.carbs} />}
              {h1 > 0.5 && <rect x={x} y={base - totalH} width={barW} height={h1} fill={COLORS.protein} rx={2} />}
              {isSelected && (
                <rect x={x - 1} y={mt} width={barW + 2} height={ch} fill="none"
                  stroke="white" strokeWidth={1} strokeOpacity={0.4} rx={2} />
              )}
            </g>
          );
        }

        const val = getMetricValue(d, metric);
        const h = Math.max(0, (val / maxVal) * ch);
        return (
          <g key={i} onClick={() => onBarClick(i)} style={{ cursor: 'pointer' }}
            opacity={dim ? 0.2 : 1}>
            <rect x={x - 3} y={mt} width={barW + 6} height={ch} fill="transparent" />
            {h > 0.5 && <rect x={x} y={mt + ch - h} width={barW} height={h} fill={activeColor} rx={2} />}
            {isSelected && h > 0.5 && (
              <rect x={x - 1} y={mt + ch - h - 1} width={barW + 2} height={h + 2} fill="none"
                stroke="white" strokeWidth={1} strokeOpacity={0.4} rx={2} />
            )}
          </g>
        );
      })}

      {/* X axis labels */}
      {data.map((d, i) => {
        if (i % labelEvery !== 0) return null;
        const x = ml + i * slotW + slotW / 2;
        return (
          <text key={i} x={x} y={mt + ch + 14} textAnchor="middle" fontSize={9} fill={COLORS.text}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export function NutritionCharts({ profileId, targets, fiberTarget = 30 }: NutritionChartsProps) {
  const fontScale = useFontScale();
  const [allEntries, setAllEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(14);
  const [metric, setMetric] = useState<Metric>('calories');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [activeDonutIndex, setActiveDonutIndex] = useState<number | null>(null);
  const [selectedBars, setSelectedBars] = useState<Set<number>>(new Set());

  useEffect(() => {
    getFoodEntriesByProfile(profileId).then((entries) => {
      setAllEntries(entries);
      setLoading(false);
    });
  }, [profileId]);

  // Reset selection whenever the view changes
  useEffect(() => { setSelectedBars(new Set()); }, [range, metric, chartType, viewMode]);

  if (loading) return <div className="text-center py-8 text-text-muted text-sm">Loading charts…</div>;
  if (allEntries.length === 0) return <div className="text-center py-8 text-text-muted text-sm">Start logging food to see nutrition charts</div>;

  const todayStr = today();

  const todayTotals = allEntries
    .filter((e) => e.date === todayStr)
    .reduce((acc, e) => ({
      protein:  acc.protein  + e.protein  * e.servingsConsumed,
      carbs:    acc.carbs    + e.carbs    * e.servingsConsumed,
      fat:      acc.fat      + e.fat      * e.servingsConsumed,
      calories: acc.calories + e.calories * e.servingsConsumed,
    }), { protein: 0, carbs: 0, fat: 0, calories: 0 });

  const donutData = [
    { name: 'Protein', value: Math.round(todayTotals.protein), color: COLORS.protein, target: targets.protein },
    { name: 'Carbs',   value: Math.round(todayTotals.carbs),   color: COLORS.carbs,   target: targets.carbs   },
    { name: 'Fat',     value: Math.round(todayTotals.fat),     color: COLORS.fat,     target: targets.fat     },
  ];
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);
  const activeSlice = activeDonutIndex !== null ? donutData[activeDonutIndex] : null;

  // Include all entries (today + historical) for the trend chart
  const dataMap = aggregateByDate(allEntries);
  const rangedDays = viewMode === 'weekly'
    ? getWeeklyDays(range, todayStr)
    : getContinuousDays(range);

  const rangeData: BarData[] = rangedDays.map((date) => {
    const day = dataMap.get(date);
    return {
      label:      formatShortDate(date),
      calories:   Math.round(day?.calories ?? 0),
      protein:    Math.round(day?.protein  ?? 0),
      carbs:      Math.round(day?.carbs    ?? 0),
      fat:        Math.round(day?.fat      ?? 0),
      fiber:      Math.round(day?.fiber    ?? 0),
      proteinCal: Math.round((day?.protein ?? 0) * 4),
      carbsCal:   Math.round((day?.carbs   ?? 0) * 4),
      fatCal:     Math.round((day?.fat     ?? 0) * 9),
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
  const isCaloriesView = metric === 'calories';

  // Rolling average — only logged days (non-zero)
  const metricVal = (d: BarData) => isCaloriesView ? d.calories : getMetricValue(d, metric);
  const loggedDays = rangeData.filter(d => metricVal(d) > 0);
  const rollingAvg = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + metricVal(d), 0) / loggedDays.length)
    : 0;

  // Selected bar stats
  const selectedData = rangeData.filter((_, i) => selectedBars.has(i));
  const selectedTotal = Math.round(selectedData.reduce((s, d) => s + metricVal(d), 0));
  const selectedAvg = selectedData.length > 0 ? Math.round(selectedTotal / selectedData.length) : 0;

  const avgLabel = viewMode === 'weekly'
    ? (range === 7 ? 'Wk avg' : range === 14 ? '2wk avg' : 'Mo avg')
    : `${range}d avg`;

  const unit = isCaloriesView ? ' cal' : 'g';

  const xInterval = rangeData.length <= 7 ? 0 : rangeData.length <= 14 ? 1 : 4;

  function renderLineChart() {
    if (isCaloriesView) {
      return (
        <LineChart data={rangeData}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: Math.round(10 * fontScale) }} axisLine={false} tickLine={false} interval={xInterval} />
          <YAxis tick={{ fill: COLORS.text, fontSize: Math.round(10 * fontScale) }} axisLine={false} tickLine={false} width={38} />
          <Tooltip content={(p: any) => <CustomTooltip {...p} isCalories />} cursor={{ fill: 'transparent' }} />
          <ReferenceLine y={targets.calories} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: Math.round(9 * fontScale), position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="calories" name="Calories" stroke={COLORS.calories} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      );
    }
    return (
      <LineChart data={rangeData}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: Math.round(10 * fontScale) }} axisLine={false} tickLine={false} interval={xInterval} />
        <YAxis tick={{ fill: COLORS.text, fontSize: Math.round(10 * fontScale) }} axisLine={false} tickLine={false} width={30} unit="g" />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
        <ReferenceLine y={getTarget(metric)} stroke={COLORS.target} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.text, fontSize: Math.round(9 * fontScale), position: 'insideTopRight' }} />
        <Line type="monotone" dataKey={metric} name={METRICS.find(m => m.id === metric)!.label} stroke={activeColor} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    );
  }

  const CX = 100, CY = 100, INNER_R = 55, OUTER_R = 85;
  const SVG_H = 190;

  return (
    <div className="space-y-3">
      {/* Today's Macro Split */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Today's Macro Split</h4>
        {donutTotal > 0 ? (
          <>
            <div className="relative" style={{ height: SVG_H }}>
              <svg viewBox="-10 -10 220 220" width="100%" height={SVG_H} style={{ display: 'block' }}>
                {(() => {
                  let cum = 0;
                  return donutData.map((d, i) => {
                    const a1 = cum;
                    const span = (d.value / donutTotal) * 360;
                    const a2 = a1 + (span < 0.1 ? 0 : span);
                    cum = a2;
                    if (a2 - a1 < 0.1) return null;
                    return (
                      <path
                        key={i}
                        d={donutArcPath(CX, CY, INNER_R, OUTER_R, a1, a2)}
                        fill={d.color}
                        style={{ cursor: 'pointer', opacity: activeDonutIndex === null || activeDonutIndex === i ? 1 : 0.6 }}
                        onClick={() => setActiveDonutIndex(prev => prev === i ? null : i)}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {activeSlice ? (
                  <div className="text-center">
                    <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: activeSlice.color }}>
                      {activeSlice.name}
                    </p>
                    <p className="text-base font-bold text-text-primary leading-tight">
                      {activeSlice.value}g
                    </p>
                    <p className="text-[0.625rem] text-text-muted leading-none mt-0.5">
                      / {activeSlice.target}g target
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-base font-bold text-text-primary leading-tight">
                      {Math.round(todayTotals.calories).toLocaleString()}
                    </p>
                    <p className="text-[0.625rem] text-text-muted leading-none mt-0.5">
                      / {targets.calories.toLocaleString()} cal
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-center gap-5 mt-1">
              {donutData.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setActiveDonutIndex(prev => prev === i ? null : i)}
                  className="flex items-center gap-1.5 text-xs text-text-secondary active:opacity-70"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  {d.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-text-muted text-xs text-center py-8">No food logged today yet</p>
        )}
      </div>

      {/* Trend chart */}
      <div className="card p-4">
        {/* Controls row */}
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          {/* Range + view mode */}
          <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-1">
            {/* Continuous / Weekly toggle */}
            <div className="flex gap-0.5 bg-surface-raised rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('continuous')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'continuous' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted'}`}
              >
                Roll
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'weekly' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted'}`}
              >
                Week
              </button>
            </div>
            {/* Bar / Line toggle */}
            <div className="flex gap-0.5 bg-surface-raised rounded-lg p-0.5">
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
        </div>

        {chartType === 'bar' ? (
          <SVGBarChart
            data={rangeData}
            isCalories={isCaloriesView}
            metric={metric}
            activeColor={activeColor}
            targets={targets}
            fiberTarget={fiberTarget}
            selectedBars={selectedBars}
            onBarClick={(i) => setSelectedBars(prev => {
              const next = new Set(prev);
              if (next.has(i)) next.delete(i);
              else next.add(i);
              return next;
            })}
          />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            {renderLineChart()}
          </ResponsiveContainer>
        )}

        {/* Rolling average / selection stat */}
        {chartType === 'bar' && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-surface-raised)' }}>
            {selectedBars.size > 0 ? (
              <div className="flex items-center justify-center gap-5">
                <div className="text-center">
                  <p className="text-[0.625rem] text-text-muted mb-0.5">{selectedBars.size}d total</p>
                  <p className="font-semibold text-text-primary">{selectedTotal.toLocaleString()}{unit}</p>
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="text-center">
                  <p className="text-[0.625rem] text-text-muted mb-0.5">avg / day</p>
                  <p className="font-semibold" style={{ color: activeColor }}>{selectedAvg.toLocaleString()}{unit}</p>
                </div>
                {isCaloriesView && selectedBars.size === 1 && (
                  <>
                    <div className="w-px h-6 bg-border" />
                    <div className="flex gap-3 text-[0.6875rem]">
                      <span style={{ color: COLORS.protein }}>P {selectedData[0].protein}g</span>
                      <span style={{ color: COLORS.carbs }}>C {selectedData[0].carbs}g</span>
                      <span style={{ color: COLORS.fat }}>F {selectedData[0].fat}g</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span className="text-[0.625rem] text-text-muted">{avgLabel}:</span>
                <span className="font-semibold text-text-primary">
                  {rollingAvg > 0 ? `${rollingAvg.toLocaleString()}${unit}` : '—'}
                </span>
                {rollingAvg > 0 && loggedDays.length < rangeData.length && (
                  <span className="text-[0.625rem] text-text-muted">({loggedDays.length}/{rangeData.length} days logged)</span>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-[0.625rem] text-text-muted mt-1.5 mb-3">
          {selectedBars.size > 0
            ? 'Tap a bar to add/remove from selection'
            : 'Bars = actual eaten · Dashed = target · Tap to select'}
        </p>

        <div className="flex gap-2 flex-wrap">
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
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
