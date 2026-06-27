import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { SVGBarChart } from '../shared/SVGBarChart';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Measurement, WorkoutSession } from '../../types';
import { daysAgo, formatShortDate, getWeekDates, today } from '../../utils/dateHelpers';
import { macroStatusColor } from '../../utils/macroColors';

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
  onDayClick?: (date: string) => void;
}

export default function TrendSnapshotCard({
  title,
  metric,
  measurements,
  sessions,
  units,
  onDayClick,
  measurementUnit,
  measurementKey,
  liftExerciseIds,
  calorieData,
  calorieTarget,
}: TrendSnapshotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<TrendRange>('30d');
  const [calViewMode, setCalViewMode] = useState<'bar' | 'line'>('bar');
  const [weekOffset, setWeekOffset] = useState(0);

  const cutoffDate = useMemo(() => {
    if (range === '7d') return daysAgo(7);
    if (range === '30d') return daysAgo(30);
    if (range === '60d') return daysAgo(60);
    if (range === '90d') return daysAgo(90);
    if (range === '1y') return daysAgo(365);
    return daysAgo(3650); // 'all' — 10 years back
  }, [range]);

  const chartData = useMemo(() => {
    if (metric === 'calories' && calorieData) {
      if (!expanded) {
        const offsetDate = new Date();
        offsetDate.setDate(offsetDate.getDate() - weekOffset * 7);
        const weekDates = getWeekDates(offsetDate.toISOString().split('T')[0]);
        return weekDates.map((d) => {
          const entry = calorieData.find((e) => e.date === d);
          return { date: d, value: entry?.total || 0 };
        });
      }
      const todayStr = today();
      return calorieData
        .filter((d) => d.date >= cutoffDate && d.date < todayStr)
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
  }, [metric, measurements, sessions, cutoffDate, measurementKey, liftExerciseIds, calorieData, expanded, weekOffset]);

  const trendDelta = useMemo(() => {
    if (chartData.length < 2) return null;
    return chartData[chartData.length - 1].value - chartData[0].value;
  }, [chartData]);

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

  // Mini preview (non-expanded)
  if (!expanded) {
    if (metric === 'calories' && calorieData) {
      const todayStr = today();
      const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const offsetDate = new Date();
      offsetDate.setDate(offsetDate.getDate() - weekOffset * 7);
      const weekDates = getWeekDates(offsetDate.toISOString().split('T')[0]);
      const maxCal = Math.max(calorieTarget || 0, ...chartData.map((d) => d.value));

      return (
        <div className="bg-surface rounded-2xl p-4 w-full text-left">
          <div className="flex items-center justify-between mb-3">
            <h2 className="label">{title}</h2>
            <div className="flex items-center gap-1">
              <span
                className="p-0.5 rounded"
                onClick={() => setWeekOffset((o) => o + 1)}
              >
                <ChevronLeft size={12} className="text-text-muted" />
              </span>
              {weekOffset === 0 ? (
                <span className="text-[9px] text-text-muted">This week</span>
              ) : (
                <span className="text-[9px] text-text-muted">{weekOffset}w ago</span>
              )}
              <span
                className={`p-0.5 rounded ${weekOffset === 0 ? 'opacity-30' : ''}`}
                onClick={() => { if (weekOffset > 0) setWeekOffset((o) => o - 1); }}
              >
                <ChevronRight size={12} className="text-text-muted" />
              </span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-1.5" style={{ height: 64 }}>
            {chartData.map((day, i) => {
              const fillPercent = maxCal > 0 ? Math.min((day.value / maxCal) * 100, 100) : 0;
              const hitGoal = calorieTarget ? day.value >= calorieTarget && day.value > 0 : false;
              const isToday = weekDates[i] === todayStr;
              const isFuture = weekDates[i] > todayStr;
              const hasData = day.value > 0;

              return (
                <button
                  key={weekDates[i]}
                  className="flex flex-col items-center flex-1 h-full"
                  onClick={() => {
                    if (!isFuture && onDayClick) onDayClick(weekDates[i]);
                  }}
                >
                  <div className="flex-1 w-full flex items-end justify-center">
                    <div
                      className="w-full max-w-[20px] rounded-t-md transition-all duration-500"
                      style={{
                        height: isFuture ? '4px' : hasData ? `${Math.max(fillPercent, 6)}%` : '4px',
                        backgroundColor: isFuture
                          ? 'var(--color-border)'
                          : hasData
                            ? macroStatusColor(day.value, calorieTarget ?? 0)
                            : 'var(--color-border)',
                        opacity: isFuture ? 0.4 : isToday ? 1 : 0.75,
                      }}
                    />
                  </div>
                  <span className={`text-[9px] mt-1.5 font-medium ${isToday ? 'text-text-primary' : 'text-text-muted'}`}>
                    {DAY_LABELS[i]}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-[9px] text-accent-blue font-medium mt-2 text-center w-full"
          >
            View more
          </button>
        </div>
      );
    }

    // Line chart preview for weight/measurement/lift
    return (
      <button
        onClick={() => setExpanded(true)}
        className="bg-surface rounded-2xl p-4 w-full text-left active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="label">{title}</h2>
          {currentValue != null && trendDelta != null && trendDelta !== 0 && (
            <span className="text-[10px] font-medium" style={{ color: getDeltaColor(trendDelta) }}>
              {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)} {displayUnit}
            </span>
          )}
        </div>
        {currentValue != null && (
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-lg font-bold text-text-primary">{currentValue.toFixed(1)}</span>
            <span className="text-[10px] text-text-muted">{displayUnit}</span>
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
          <div className="flex items-center justify-center h-12 text-[10px] text-text-muted">
            Not enough data yet
          </div>
        )}
        <div className="text-[9px] text-text-muted mt-1 text-center">Tap to expand</div>
      </button>
    );
  }

  // Expanded detail view — mobile-friendly bottom sheet style
  return (
    <div className="fixed inset-0 z-[150] flex flex-col">
      <div className="flex-1 bg-black/60" onClick={() => setExpanded(false)} />
      <div className="bg-bg rounded-t-3xl max-h-[85vh] flex flex-col safe-bottom animate-in slide-in-from-bottom">
        {/* Handle bar */}
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
        {/* Range selector */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {(['7d', '30d', '60d', '90d', '1y', 'all'] as TrendRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
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

        {/* Current value + trend */}
        {currentValue != null && (
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-text-primary">
              {metric === 'calories' ? Math.round(currentValue) : currentValue.toFixed(1)}
            </span>
            <span className="text-sm text-text-muted">{displayUnit}</span>
            {trendDelta != null && trendDelta !== 0 && (
              <span className="text-sm font-medium ml-auto" style={{ color: getDeltaColor(trendDelta) }}>
                {trendDelta > 0 ? '+' : ''}
                {metric === 'calories' ? Math.round(trendDelta) : trendDelta.toFixed(1)} {displayUnit}
              </span>
            )}
          </div>
        )}

        {/* Full chart */}
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
              />
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(d) => formatShortDate(d)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      domain={metric === 'calories' ? [0, 'auto'] : ['dataMin - 2', 'dataMax + 2']}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '11px', color: 'var(--color-text-primary)' }}
                      formatter={(value: unknown) => [
                        metric === 'calories' ? `${Math.round(Number(value))} kcal` : `${Number(value).toFixed(1)} ${displayUnit}`,
                        title,
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
