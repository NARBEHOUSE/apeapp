import { useState, useMemo } from 'react';
import { useFontScale } from '../../utils/fontSize';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { SVGBarChart } from '../shared/SVGBarChart';
import { X } from 'lucide-react';
import type { Measurement, WorkoutSession, FitnessGoal } from '../../types';
import { daysAgo, formatShortDate, today } from '../../utils/dateHelpers';
import { averageDailyCalories, averageDays, rollingWindow } from '../../utils/calorieAverage';
import { macroStatusColor } from '../../utils/macroColors';
import { GOAL_LABELS } from '../../utils/tdee';

type TrendRange = '7d' | '30d' | '60d' | '90d' | '1y' | 'all';

interface TrendSnapshotCardProps {
  title: string;
  metric: 'weight' | 'measurement' | 'lift' | 'calories';
  measurements: Measurement[];
  sessions: WorkoutSession[];
  units: 'imperial' | 'metric';
  measurementUnit: 'in' | 'cm';
  measurementKey?: string;
  liftExerciseIds?: string[];
  calorieData?: { date: string; total: number }[];
  calorieTarget?: number;
  // Looks up the calorie target that was actually in effect on a given date, so past
  // days are judged against the goal active then rather than today's goal. Falls back
  // to `calorieTarget` when omitted.
  getTargetForDate?: (date: string) => number;
  // Looks up the fitness goal (cut/maintain/build) in effect on a given date, purely
  // to label the displayed range with what phase it was.
  getGoalForDate?: (date: string) => FitnessGoal | undefined;
  onDayClick?: (date: string) => void;
}

// Labels a date range with the phase active at start/end — e.g. "Cutting" if it held
// steady, or "Cutting → Maintaining" if the goal changed within the range.
function phaseLabel(getGoalForDate: ((date: string) => FitnessGoal | undefined) | undefined, startDate: string, endDate: string): string | null {
  if (!getGoalForDate) return null;
  const goalStart = getGoalForDate(startDate);
  const goalEnd = getGoalForDate(endDate);
  if (!goalStart && !goalEnd) return null;
  if (goalStart && goalEnd && goalStart !== goalEnd) return `${GOAL_LABELS[goalStart]} → ${GOAL_LABELS[goalEnd]}`;
  const goal = goalEnd || goalStart;
  return goal ? GOAL_LABELS[goal] : null;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The same rolling window the Last 7 Days panel uses: seven complete days, today
// excluded. Drawing today here would put a bar on screen that the average ignores,
// which is the kind of gap that made these two numbers look unrelated. Today's own
// intake has its own card.
const MINI_DAYS = 7;

export default function TrendSnapshotCard({
  title,
  metric,
  measurements,
  sessions,
  units,
  measurementUnit,
  measurementKey,
  liftExerciseIds,
  calorieData,
  calorieTarget,
  getTargetForDate,
  getGoalForDate,
}: TrendSnapshotCardProps) {
  const fontScale = useFontScale();
  const targetForDate = (date: string) => getTargetForDate ? getTargetForDate(date) : (calorieTarget ?? 0);
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<TrendRange>('30d');
  const [calViewMode, setCalViewMode] = useState<'bar' | 'line'>('bar');

  const [selectedBars, setSelectedBars] = useState<Set<number>>(new Set());
  // Expanded chart has its own selection — its indices are into a different, longer series.
  const [selectedDetailBars, setSelectedDetailBars] = useState<Set<number>>(new Set());

  // Reset selection when view config changes
  const resetSelection = () => setSelectedBars(new Set());
  const resetDetailSelection = () => setSelectedDetailBars(new Set());

  const cutoffDate = useMemo(() => {
    if (range === '7d') return daysAgo(7);
    if (range === '30d') return daysAgo(30);
    if (range === '60d') return daysAgo(60);
    if (range === '90d') return daysAgo(90);
    if (range === '1y') return daysAgo(365);
    return daysAgo(3650);
  }, [range]);

  const chartData = useMemo(() => {
    if (metric === 'calories' && calorieData) {
      if (!expanded) {
        // Mini card data is computed separately via getMiniDays
        return [];
      }
      // Expanded: include today
      const todayStr = today();
      return calorieData
        .filter((d) => d.date >= cutoffDate && d.date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ date: d.date, value: d.total }));
    }

    if (metric === 'weight') {
      return measurements
        .filter((m) => m.weight != null && m.date >= cutoffDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({ date: m.date, value: m.weight! }));
    }

    if (metric === 'measurement' && measurementKey) {
      return measurements
        .filter((m) => {
          const val = m.measurements?.[measurementKey as keyof NonNullable<Measurement['measurements']>];
          return val != null && m.date >= cutoffDate;
        })
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({
          date: m.date,
          value: m.measurements![measurementKey as keyof NonNullable<Measurement['measurements']>]!,
        }));
    }

    if (metric === 'lift' && liftExerciseIds && liftExerciseIds.length > 0) {
      const idSet = new Set(liftExerciseIds);
      const liftSessions: Record<string, number> = {};
      for (const session of sessions) {
        if (session.date < cutoffDate) continue;
        for (const [exerciseId, sets] of Object.entries(session.sets)) {
          if (idSet.has(exerciseId)) {
            let maxW = 0;
            for (const set of sets) {
              if (set.completed && set.weight > maxW) maxW = set.weight;
            }
            if (maxW > 0) {
              liftSessions[session.date] = Math.max(liftSessions[session.date] || 0, maxW);
            }
          }
        }
      }
      return Object.entries(liftSessions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value }));
    }

    return [];
  }, [metric, measurements, sessions, cutoffDate, measurementKey, liftExerciseIds, calorieData, expanded]);

  const trendDelta = useMemo(() => {
    if (metric === 'calories') {
      const nonZero = chartData.filter((d) => d.value > 0);
      if (nonZero.length === 0) return null;
      const avgActual = nonZero.reduce((s, d) => s + d.value, 0) / nonZero.length;
      const avgTarget = nonZero.reduce((s, d) => s + targetForDate(d.date), 0) / nonZero.length;
      if (!avgTarget) return null;
      return avgActual - avgTarget;
    }
    if (chartData.length < 2) return null;
    return chartData[chartData.length - 1].value - chartData[0].value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, metric, calorieTarget, getTargetForDate]);

  const currentValue = chartData.length > 0 ? chartData[chartData.length - 1].value : null;

  const displayUnit = metric === 'weight'
    ? (units === 'metric' ? 'kg' : 'lbs')
    : metric === 'measurement'
      ? measurementUnit
      : metric === 'lift'
        ? (units === 'metric' ? 'kg' : 'lbs')
        : 'kcal';

  const isPositiveGood = metric === 'lift';
  const isNegativeGood = metric === 'weight' || (metric === 'measurement' && (measurementKey === 'waist' || measurementKey === 'hips'));

  const getDeltaColor = (delta: number) => {
    if (delta === 0) return 'var(--color-text-muted)';
    if (isPositiveGood) return delta > 0 ? '#2e9e6b' : '#e85757';
    if (isNegativeGood) return delta < 0 ? '#2e9e6b' : '#e85757';
    return delta > 0 ? '#2e9e6b' : '#e85757';
  };

  // ── Mini calorie card ─────────────────────────────────────────────────────
  if (!expanded && metric === 'calories' && calorieData) {
    const todayStr = today();
    const miniDays = rollingWindow(MINI_DAYS);
    const miniBarData = miniDays.map((date) => {
      const entry = calorieData.find((e) => e.date === date);
      // `logged` distinguishes a day with no entries at all from one that was tracked
      // and totalled 0 — only the latter belongs in the average's denominator.
      return { date, value: entry?.total || 0, target: targetForDate(date), logged: entry != null };
    });
    const maxCal = Math.max(...miniBarData.map((d) => d.target), ...miniBarData.map((d) => d.value), 1);

    // Average over the logged days in the window. It holds no partial day, so the
    // number matches the Last 7 Days panel exactly.
    const loggedMini = miniBarData.filter((d) => d.logged);
    const loggedTotals = loggedMini.map((d) => ({ date: d.date, total: d.value }));
    const rollingAvg = averageDailyCalories(loggedTotals, todayStr);
    // The days that average actually covers — never the full window, since today is
    // still being logged. Labelling the wider window here would overstate the number.
    const avgDays = averageDays(loggedTotals, todayStr).days;

    // Selection stats. Unlogged days can't be selected, so the highlighted bars and
    // the averaged days are always the same set. Round once, at the end — rounding the
    // total first would drift the average a kcal off the panel's.
    const selData = miniBarData.filter((d, i) => d.logged && selectedBars.has(i));
    const selSum = selData.reduce((s, d) => s + d.value, 0);
    const selTotal = Math.round(selSum);
    const selAvg = selData.length > 0 ? Math.round(selSum / selData.length) : 0;
    const isAnySelected = selectedBars.size > 0;

    const avgLabel = avgDays.length === 0
      ? `Last ${MINI_DAYS} days`
      : avgDays.length === 1
        ? formatShortDate(avgDays[0].date)
        : `${formatShortDate(avgDays[0].date)} – ${formatShortDate(avgDays[avgDays.length - 1].date)}`;
    const miniPhaseLabel = phaseLabel(getGoalForDate, miniDays[0], miniDays[miniDays.length - 1]);

    return (
      <div className="bg-surface rounded-2xl p-4 w-full text-left">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="label shrink-0">{title}</h2>
          <span className="text-[0.5625rem] text-text-muted ml-auto">
            {formatShortDate(miniDays[0])} – {formatShortDate(miniDays[miniDays.length - 1])}
          </span>
        </div>

        {/* Bars */}
        <div className="flex items-end justify-between gap-1" style={{ height: 64 }}>
          {miniBarData.map((day, i) => {
            const fillPercent = maxCal > 0 ? Math.min((day.value / maxCal) * 100, 100) : 0;
            const isToday = day.date === todayStr;
            const hasData = day.value > 0;
            const isSelected = selectedBars.has(i);
            const dim = isAnySelected && !isSelected;
            const dow = new Date(day.date + 'T00:00:00').getDay();

            return (
              <button
                key={day.date}
                className="flex flex-col items-center flex-1 h-full"
                disabled={!day.logged}
                style={{ opacity: dim ? 0.25 : 1, cursor: day.logged ? 'pointer' : 'default' }}
                onClick={() => setSelectedBars((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })}
              >
                <div className="flex-1 w-full flex items-end justify-center">
                  <div
                    className="w-full max-w-[20px] rounded-t-md transition-all duration-500"
                    style={{
                      height: hasData ? `${Math.max(fillPercent, 6)}%` : '4px',
                      backgroundColor: hasData
                        ? macroStatusColor(day.value, day.target)
                        : 'var(--color-border)',
                      outline: isSelected ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                </div>
                <span className={`text-[0.5625rem] mt-1.5 font-medium ${isToday ? 'text-text-primary' : 'text-text-muted'}`}>
                  {DAY_LABELS[dow]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stat row */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[0.625rem]">
            {isAnySelected ? (
              <span className="text-text-muted">
                <span className="font-semibold text-text-primary">{selTotal.toLocaleString()} kcal</span>
                {' · '}
                <span className="font-medium" style={{ color: '#e8572a' }}>{selAvg.toLocaleString()} avg</span>
                <span className="text-text-muted"> ({selData.length}d)</span>
                <button onClick={resetSelection} className="ml-1.5 text-accent-blue font-medium">Clear</button>
              </span>
            ) : (
              <span className="text-text-muted">
                {avgLabel}:{' '}
                <span className="font-semibold text-text-primary">
                  {rollingAvg > 0 ? `${rollingAvg.toLocaleString()} kcal` : '—'}
                </span>
              </span>
            )}
            {miniPhaseLabel && (
              <span className="block text-[0.5625rem] text-text-muted mt-0.5">Goal: {miniPhaseLabel}</span>
            )}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-[0.5625rem] text-accent-blue font-medium"
          >
            View more
          </button>
        </div>
      </div>
    );
  }

  // ── Non-calorie mini preview ──────────────────────────────────────────────
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="bg-surface rounded-2xl p-4 w-full text-left active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="label">{title}</h2>
          {currentValue != null && trendDelta != null && trendDelta !== 0 && (
            <span className="text-[0.625rem] font-medium" style={{ color: getDeltaColor(trendDelta) }}>
              {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)} {displayUnit}
            </span>
          )}
        </div>
        {currentValue != null && (
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-lg font-bold text-text-primary">{currentValue.toFixed(1)}</span>
            <span className="text-[0.625rem] text-text-muted">{displayUnit}</span>
          </div>
        )}
        {chartData.length >= 2 ? (
          <div style={{ width: '100%', height: 48 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#5b6ef5"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-12 text-[0.625rem] text-text-muted">
            Not enough data yet
          </div>
        )}
        <div className="text-[0.5625rem] text-text-muted mt-1 text-center">Tap to expand</div>
      </button>
    );
  }

  // ── Expanded detail view ──────────────────────────────────────────────────
  // chartData only contains dates that were actually logged, so every row counts.
  const expandedRollingAvg = averageDailyCalories(
    chartData.map((d) => ({ date: d.date, total: d.value }))
  );
  const detailSel = chartData.filter((_, i) => selectedDetailBars.has(i));
  const detailSelSum = detailSel.reduce((sum, d) => sum + d.value, 0);
  const detailSelTotal = Math.round(detailSelSum);
  const detailSelAvg = detailSel.length > 0 ? Math.round(detailSelSum / detailSel.length) : 0;
  const expandedPhaseLabel = metric === 'calories' ? phaseLabel(getGoalForDate, cutoffDate, today()) : null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col">
      <div className="flex-1 bg-black/60" onClick={() => setExpanded(false)} />
      <div className="bg-bg rounded-t-3xl max-h-[85vh] flex flex-col safe-bottom animate-in slide-in-from-bottom">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-raised" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={() => setExpanded(false)} className="p-2 rounded-xl hover:bg-surface">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 pb-6 space-y-4">
          {/* Range + chart type */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              {(['7d', '30d', '60d', '90d', '1y', 'all'] as TrendRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); resetDetailSelection(); }}
                  className={`px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-medium transition-colors ${
                    range === r ? 'bg-surface-raised text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {r === '1y' ? '1yr' : r === 'all' ? 'All' : r}
                </button>
              ))}
            </div>
            {metric === 'calories' && (
              <div className="flex gap-1">
                {(['bar', 'line'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCalViewMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      calViewMode === mode ? 'bg-surface-raised text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    {mode === 'bar' ? 'Bar' : 'Line'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current value + rolling avg */}
          {metric === 'calories' ? (
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-[0.625rem] text-text-muted mb-0.5">
                  {detailSel.length > 0
                    ? `${detailSel.length} day${detailSel.length === 1 ? '' : 's'} selected · ${detailSelTotal.toLocaleString()} kcal total`
                    : `${range} rolling avg`}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-text-primary">
                    {detailSel.length > 0
                      ? detailSelAvg.toLocaleString()
                      : expandedRollingAvg > 0 ? expandedRollingAvg.toLocaleString() : '—'}
                  </span>
                  <span className="text-sm text-text-muted">kcal/day</span>
                </div>
                {detailSel.length > 0 ? (
                  <button onClick={resetDetailSelection} className="text-[0.625rem] text-accent-blue font-medium mt-0.5">
                    Clear selection
                  </button>
                ) : expandedPhaseLabel && (
                  <p className="text-[0.625rem] text-text-muted mt-0.5">Goal: {expandedPhaseLabel}</p>
                )}
              </div>
              {trendDelta != null && trendDelta !== 0 && calorieTarget && (
                <span className="text-sm font-medium ml-auto" style={{ color: getDeltaColor(trendDelta) }}>
                  {trendDelta > 0 ? '+' : ''}{Math.round(trendDelta)} kcal
                  <span className="text-xs font-normal opacity-70"> vs target</span>
                </span>
              )}
            </div>
          ) : (
            currentValue != null && (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-text-primary">{currentValue.toFixed(1)}</span>
                <span className="text-sm text-text-muted">{displayUnit}</span>
                {trendDelta != null && trendDelta !== 0 && (
                  <span className="text-sm font-medium ml-auto" style={{ color: getDeltaColor(trendDelta) }}>
                    {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)} {displayUnit}
                  </span>
                )}
              </div>
            )
          )}

          {/* Chart */}
          {chartData.length >= 2 ? (
            <div className="bg-surface rounded-2xl p-3">
              {metric === 'calories' && calViewMode === 'bar' ? (
                <SVGBarChart
                  key={range}
                  data={chartData.map((d) => ({ label: formatShortDate(d.date), value: d.value }))}
                  color="#e8572a"
                  targetValue={calorieTarget}
                  targetLabel="Target"
                  height={260}
                  formatValue={(v) => `${Math.round(v)} kcal`}
                  selectedIndices={selectedDetailBars}
                  onToggleBar={(i) => setSelectedDetailBars((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })}
                />
              ) : (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: Math.round(9 * fontScale), fill: 'var(--color-text-muted)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(d) => formatShortDate(d)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: Math.round(9 * fontScale), fill: 'var(--color-text-muted)' }}
                        axisLine={false}
                        tickLine={false}
                        domain={metric === 'calories' ? [0, 'auto'] : ['dataMin - 2', 'dataMax + 2']}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: `${Math.round(11 * fontScale)}px`, color: 'var(--color-text-primary)' }}
                        formatter={(value: unknown) => [
                          metric === 'calories' ? `${Math.round(Number(value))} kcal` : `${Number(value).toFixed(1)} ${displayUnit}`,
                          metric === 'calories' ? 'Daily Calories' : title,
                        ]}
                        labelFormatter={(l) => formatShortDate(l as string)}
                      />
                      {metric === 'calories' && calorieTarget && (
                        <ReferenceLine y={calorieTarget} stroke="#2e9e6b" strokeDasharray="4 4" strokeOpacity={0.5} />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#5b6ef5"
                        strokeWidth={2}
                        dot={chartData.length < 30}
                        activeDot={{ r: 4, fill: '#5b6ef5', strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl p-8 flex items-center justify-center">
              <span className="text-sm text-text-muted">Not enough data for this range</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
