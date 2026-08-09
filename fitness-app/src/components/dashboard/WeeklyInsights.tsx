import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Dumbbell, Utensils, Scale, Brain, Target } from 'lucide-react';
import type { WorkoutSession, FoodEntry, Measurement, CheckInEntry, MacroTargets, FitnessGoal } from '../../types';
import { getWeekDates, today, localDateStr, formatShortDate } from '../../utils/dateHelpers';
import { macroStatusColor } from '../../utils/macroColors';
import { GOAL_LABELS } from '../../utils/tdee';
import { totalSetCounts, hasRatedSets, formatSets } from '../../utils/muscleVolume';
import { toDisplayWeight, type WeightUnit } from '../../utils/units';

interface Props {
  sessions: WorkoutSession[];
  allFoodEntries: FoodEntry[];
  measurements: Measurement[];
  checkIns: CheckInEntry[];
  macroTargets: MacroTargets;
  // Looks up the targets/goal that were actually in effect on a given date, so a past
  // week is judged against the goal active then rather than today's goal.
  getTargetsForDate?: (date: string) => MacroTargets;
  getGoalForDate?: (date: string) => FitnessGoal | undefined;
  units: 'imperial' | 'metric';
}

interface InsightMetric {
  label: string;
  value: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'flat';
  trendGood?: boolean;
  icon: typeof Dumbbell;
  color: string;
}

export function WeeklyInsights({ sessions, allFoodEntries, measurements, checkIns, macroTargets, getTargetsForDate, getGoalForDate, units }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const anchorDate = useMemo(() => {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() + weekOffset * 7);
    return localDateStr(d);
  }, [weekOffset]);

  // Targets as they stood during the displayed week, not necessarily today's targets
  const weekTargets = useMemo(
    () => getTargetsForDate ? getTargetsForDate(anchorDate) : macroTargets,
    [getTargetsForDate, anchorDate, macroTargets]
  );

  const weekDates = useMemo(() => new Set(getWeekDates(anchorDate)), [anchorDate]);

  const prevWeekAnchor = useMemo(() => {
    const d = new Date(anchorDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return localDateStr(d);
  }, [anchorDate]);

  const prevWeekDates = useMemo(() => new Set(getWeekDates(prevWeekAnchor)), [prevWeekAnchor]);

  const weekLabel = useMemo(() => {
    const dates = getWeekDates(anchorDate);
    return `${formatShortDate(dates[0])} – ${formatShortDate(dates[6])}`;
  }, [anchorDate]);

  // Which phase (cut/maintain/build) was active during the displayed week — and
  // whether it changed partway through, so a switched week isn't mislabeled.
  const weekGoalLabel = useMemo(() => {
    if (!getGoalForDate) return null;
    const dates = getWeekDates(anchorDate);
    const goalStart = getGoalForDate(dates[0]);
    const goalEnd = getGoalForDate(dates[6]);
    if (!goalStart && !goalEnd) return null;
    if (goalStart && goalEnd && goalStart !== goalEnd) {
      return `${GOAL_LABELS[goalStart]} → ${GOAL_LABELS[goalEnd]}`;
    }
    const goal = goalEnd || goalStart;
    return goal ? GOAL_LABELS[goal] : null;
  }, [getGoalForDate, anchorDate]);

  const insights = useMemo(() => {
    // --- Training ---
    const weekSessions = sessions.filter((s) => weekDates.has(s.date));
    const prevWeekSessions = sessions.filter((s) => prevWeekDates.has(s.date));

    // Hard sets — sets taken close to failure — drive hypertrophy far better than
    // tonnage does, so they are the headline training number.
    const weekCounts = totalSetCounts(weekSessions);
    const prevCounts = totalSetCounts(prevWeekSessions);
    const hasEffortData = hasRatedSets([weekCounts, prevCounts]);
    const weekVolume = hasEffortData ? weekCounts.hard : weekCounts.sets;
    const prevVolume = hasEffortData ? prevCounts.hard : prevCounts.sets;
    const weekSets = weekCounts.sets;

    // --- Nutrition ---
    const weekFood = allFoodEntries.filter((f) => weekDates.has(f.date));
    const prevFood = allFoodEntries.filter((f) => prevWeekDates.has(f.date));

    const caloriesByDay = new Map<string, number>();
    const proteinByDay = new Map<string, number>();
    const carbsByDay = new Map<string, number>();
    const fatByDay = new Map<string, number>();
    const todayStr = today();
    for (const f of weekFood) {
      if (weekOffset === 0 && f.date === todayStr) continue; // exclude today for current week — day isn't complete yet
      const cals = f.calories * f.servingsConsumed;
      const prot = f.protein * f.servingsConsumed;
      const carbs = f.carbs * f.servingsConsumed;
      const fat = f.fat * f.servingsConsumed;
      caloriesByDay.set(f.date, (caloriesByDay.get(f.date) || 0) + cals);
      proteinByDay.set(f.date, (proteinByDay.get(f.date) || 0) + prot);
      carbsByDay.set(f.date, (carbsByDay.get(f.date) || 0) + carbs);
      fatByDay.set(f.date, (fatByDay.get(f.date) || 0) + fat);
    }

    const daysLogged = caloriesByDay.size;
    const avgCalories = daysLogged > 0
      ? Math.round([...caloriesByDay.values()].reduce((a, b) => a + b, 0) / daysLogged)
      : 0;
    const avgProtein = daysLogged > 0
      ? Math.round([...proteinByDay.values()].reduce((a, b) => a + b, 0) / daysLogged)
      : 0;
    const avgCarbs = daysLogged > 0
      ? Math.round([...carbsByDay.values()].reduce((a, b) => a + b, 0) / daysLogged)
      : 0;
    const avgFat = daysLogged > 0
      ? Math.round([...fatByDay.values()].reduce((a, b) => a + b, 0) / daysLogged)
      : 0;

    const prevCalsByDay = new Map<string, number>();
    for (const f of prevFood) {
      prevCalsByDay.set(f.date, (prevCalsByDay.get(f.date) || 0) + f.calories * f.servingsConsumed);
    }
    const prevDaysLogged = prevCalsByDay.size;
    const prevAvgCalories = prevDaysLogged > 0
      ? Math.round([...prevCalsByDay.values()].reduce((a, b) => a + b, 0) / prevDaysLogged)
      : 0;

    const proteinDaysHit = [...proteinByDay.values()].filter((p) => p >= weekTargets.protein).length;

    // --- Weight ---
    const weekWeights = measurements
      .filter((m) => m.weight != null && weekDates.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const prevWeights = measurements
      .filter((m) => m.weight != null && prevWeekDates.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgWeight = weekWeights.length > 0
      ? weekWeights.reduce((sum, m) => sum + m.weight!, 0) / weekWeights.length
      : null;
    const prevAvgWeight = prevWeights.length > 0
      ? prevWeights.reduce((sum, m) => sum + m.weight!, 0) / prevWeights.length
      : null;
    const weightChange = avgWeight != null && prevAvgWeight != null ? avgWeight - prevAvgWeight : null;
    const weightUnit: WeightUnit = units === 'metric' ? 'kg' : 'lbs';
    const weighInsThisWeek = weekWeights.length;

    // --- Check-ins ---
    const weekCheckIns = checkIns.filter((c) => weekDates.has(c.date));
    const prevCheckIns = checkIns.filter((c) => prevWeekDates.has(c.date));

    const avgCheckInScore = weekCheckIns.length > 0
      ? weekCheckIns.reduce((sum, ci) => {
          const numericResponses = ci.responses.filter((r) => typeof r.value === 'number');
          if (numericResponses.length === 0) return sum;
          const avg = numericResponses.reduce((a, r) => a + (r.value as number), 0) / numericResponses.length;
          return sum + avg;
        }, 0) / weekCheckIns.length
      : null;

    const prevAvgCheckIn = prevCheckIns.length > 0
      ? prevCheckIns.reduce((sum, ci) => {
          const numericResponses = ci.responses.filter((r) => typeof r.value === 'number');
          if (numericResponses.length === 0) return sum;
          const avg = numericResponses.reduce((a, r) => a + (r.value as number), 0) / numericResponses.length;
          return sum + avg;
        }, 0) / prevCheckIns.length
      : null;

    return {
      workouts: weekSessions.length,
      prevWorkouts: prevWeekSessions.length,
      totalSets: weekSets,
      volume: weekVolume,
      prevVolume,
      hasEffortData,
      tonnage: weekCounts.volume,
      prevTonnage: prevCounts.volume,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      prevAvgCalories,
      calorieTarget: weekTargets.calories,
      daysLogged,
      proteinDaysHit,
      avgWeight,
      weighInsThisWeek,
      weightChange,
      weightUnit,
      avgCheckInScore,
      prevAvgCheckIn,
      weekCheckIns: weekCheckIns.length,
    };
  }, [sessions, allFoodEntries, measurements, checkIns, weekTargets, weekDates, prevWeekDates, weekOffset, units]);

  const metrics: InsightMetric[] = useMemo(() => {
    const m: InsightMetric[] = [];

    function compareTrend(current: number, previous: number, threshold = 0): 'up' | 'down' | 'flat' | undefined {
      if (previous <= 0) return undefined;
      if (current > previous + threshold) return 'up';
      if (current < previous - threshold) return 'down';
      return 'flat';
    }

    // Training
    const volTrend = compareTrend(insights.volume, insights.prevVolume);
    m.push({
      label: 'Training',
      value: `${insights.workouts} workouts`,
      subtext: insights.hasEffortData
        ? `${formatSets(insights.volume)} hard of ${insights.totalSets} sets`
        : `${insights.totalSets} working sets`,
      trend: volTrend,
      trendGood: volTrend === 'up',
      icon: Dumbbell,
      color: '#e8572a',
    });

    // Nutrition
    if (insights.daysLogged > 0) {
      const calDiff = insights.avgCalories - insights.calorieTarget;
      const calTrend = compareTrend(insights.avgCalories, insights.prevAvgCalories);
      m.push({
        label: 'Nutrition',
        value: `${insights.avgCalories.toLocaleString()} cal avg`,
        subtext: `${calDiff >= 0 ? '+' : ''}${calDiff} from target · Protein ${insights.proteinDaysHit}/${insights.daysLogged} days`,
        trend: calTrend,
        icon: Utensils,
        color: '#f5a623',
      });
    }

    // Weight (7-day rolling average vs. previous 7-day average, to avoid single-day noise)
    if (insights.avgWeight != null) {
      const wTrend = insights.weightChange != null
        ? compareTrend(insights.weightChange, 0, 0.1)
        : undefined;
      m.push({
        label: 'Weight',
        value: `${insights.avgWeight.toFixed(1)} ${insights.weightUnit}`,
        subtext: insights.weightChange != null
          ? `${insights.weightChange > 0 ? '+' : ''}${insights.weightChange.toFixed(1)} ${insights.weightUnit} vs last week's avg`
          : `7-day avg · ${insights.weighInsThisWeek} weigh-in${insights.weighInsThisWeek !== 1 ? 's' : ''}`,
        trend: wTrend,
        icon: Scale,
        color: '#5b6ef5',
      });
    }

    // Check-ins
    if (insights.weekCheckIns > 0 && insights.avgCheckInScore != null) {
      const ciTrend = insights.prevAvgCheckIn != null
        ? compareTrend(insights.avgCheckInScore, insights.prevAvgCheckIn, 0.3)
        : undefined;
      m.push({
        label: 'Wellbeing',
        value: `${insights.avgCheckInScore.toFixed(1)} / 10`,
        subtext: `${insights.weekCheckIns} check-in${insights.weekCheckIns !== 1 ? 's' : ''} this week`,
        trend: ciTrend,
        trendGood: ciTrend === 'up',
        icon: Brain,
        color: '#2e9e6b',
      });
    }

    return m;
  }, [insights]);

  if (metrics.length === 0) return null;

  const TrendIcon = ({ trend, good }: { trend?: 'up' | 'down' | 'flat'; good?: boolean }) => {
    if (!trend) return null;
    if (trend === 'flat') return <Minus size={12} className="text-text-muted" />;
    if (trend === 'up') return <TrendingUp size={12} className={good === false ? 'text-danger' : 'text-green-500'} />;
    return <TrendingDown size={12} className={good === false ? 'text-green-500' : 'text-danger'} />;
  };

  const topMetrics = metrics.slice(0, 2);
  const restMetrics = metrics.slice(2);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent" />
          <h2 className="label">Week in Review</h2>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 -mr-1"
        >
          {expanded
            ? <ChevronUp size={16} className="text-text-muted" />
            : <ChevronDown size={16} className="text-text-muted" />
          }
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1 rounded-lg hover:bg-surface-raised"
        >
          <ChevronLeft size={14} className="text-text-muted" />
        </button>
        <span className="text-[0.625rem] text-text-muted tabular-nums">
          {weekOffset === 0 ? 'This week' : weekLabel}
        </span>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
          disabled={weekOffset >= 0}
          className="p-1 rounded-lg hover:bg-surface-raised disabled:opacity-30"
        >
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      </div>
      {weekGoalLabel && (
        <div className="flex justify-center mt-1">
          <span className="text-[0.5625rem] px-2 py-0.5 rounded-full bg-surface-raised text-text-muted">
            Goal: {weekGoalLabel}
          </span>
        </div>
      )}

      {/* Always visible: top 2 metrics as compact row */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        {topMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-surface-raised rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} style={{ color: m.color }} />
                <span className="text-[0.625rem] text-text-muted font-semibold uppercase">{m.label}</span>
                <TrendIcon trend={m.trend} good={m.trendGood} />
              </div>
              <div className="text-sm font-bold">{m.value}</div>
              {m.subtext && (
                <div className="text-[0.625rem] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded: rest of the metrics */}
      {expanded && restMetrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {restMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-surface-raised rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} style={{ color: m.color }} />
                  <span className="text-[0.625rem] text-text-muted font-semibold uppercase">{m.label}</span>
                  <TrendIcon trend={m.trend} good={m.trendGood} />
                </div>
                <div className="text-sm font-bold">{m.value}</div>
                {m.subtext && (
                  <div className="text-[0.625rem] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded: week-over-week comparison */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[0.625rem] text-text-muted font-semibold uppercase mb-2">vs. Previous Week</div>
          <div className="space-y-1.5">
            {insights.prevWorkouts > 0 || insights.workouts > 0 ? (
              <ComparisonRow
                label="Workouts"
                current={insights.workouts}
                previous={insights.prevWorkouts}
              />
            ) : null}
            {insights.volume > 0 || insights.prevVolume > 0 ? (
              <ComparisonRow
                label={insights.hasEffortData ? 'Hard sets' : 'Working sets'}
                current={Math.round(insights.volume)}
                previous={Math.round(insights.prevVolume)}
              />
            ) : null}
            {insights.tonnage > 0 || insights.prevTonnage > 0 ? (
              <ComparisonRow
                label="Tonnage"
                current={Math.round(toDisplayWeight(insights.tonnage, insights.weightUnit))}
                previous={Math.round(toDisplayWeight(insights.prevTonnage, insights.weightUnit))}
                suffix={insights.weightUnit}
              />
            ) : null}
            {insights.avgCalories > 0 || insights.prevAvgCalories > 0 ? (
              <ComparisonRow
                label="Avg Calories"
                current={insights.avgCalories}
                previous={insights.prevAvgCalories}
                suffix="cal"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Expanded: avg macro breakdown */}
      {expanded && insights.daysLogged > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[0.625rem] text-text-muted font-semibold uppercase mb-2">
            Avg Daily Intake <span className="font-normal normal-case">({insights.daysLogged}d logged{weekOffset === 0 ? ', today excluded' : ''})</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Calories', value: insights.avgCalories, target: weekTargets.calories, unit: 'cal', color: '#e8572a' },
              { label: 'Protein',  value: insights.avgProtein,  target: weekTargets.protein,  unit: 'g',   color: '#5b6ef5' },
              { label: 'Carbs',    value: insights.avgCarbs,    target: weekTargets.carbs,    unit: 'g',   color: '#2e9e6b' },
              { label: 'Fat',      value: insights.avgFat,      target: weekTargets.fat,      unit: 'g',   color: '#f5a623' },
            ].map(({ label, value, target, unit }) => {
              const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
              const isOver = target > 0 && value > target;
              const statusColor = macroStatusColor(value, target);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[0.625rem] text-text-muted">{label}</span>
                    <span className="text-[0.625rem] tabular-nums">
                      <span className="font-medium" style={{ color: statusColor }}>
                        {value.toLocaleString()}
                      </span>
                      <span className="text-text-muted"> / {target.toLocaleString()} {unit}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${isOver ? 100 : pct}%`, backgroundColor: statusColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonRow({ label, current, previous, suffix }: {
  label: string;
  current: number;
  previous: number;
  suffix?: string;
}) {
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : 0;
  const isUp = diff > 0;
  const isFlat = diff === 0;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-text-muted">
          {previous.toLocaleString()}{suffix ? ` ${suffix}` : ''}
        </span>
        <span className="text-text-muted">→</span>
        <span className="font-semibold">
          {current.toLocaleString()}{suffix ? ` ${suffix}` : ''}
        </span>
        {!isFlat && previous > 0 && (
          <span className={`text-[0.625rem] font-medium ${isUp ? 'text-green-500' : 'text-danger'}`}>
            {isUp ? '+' : ''}{pct}%
          </span>
        )}
      </div>
    </div>
  );
}
