import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { FoodEntry, MacroTargets } from '../../types';
import { getFoodEntriesByProfile } from '../../db/nutrition';
import { formatShortDate } from '../../utils/dateHelpers';

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
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
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
          {p.name}: {Math.round(p.value)}{p.name === 'Calories' ? '' : 'g'}
        </p>
      ))}
    </div>
  );
}

export function NutritionCharts({ profileId, targets }: NutritionChartsProps) {
  const [allEntries, setAllEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const entries = await getFoodEntriesByProfile(profileId);
      setAllEntries(entries);
      setLoading(false);
    }
    load();
  }, [profileId]);

  if (loading) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">Loading charts...</div>
    );
  }

  if (allEntries.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        Start logging food to see nutrition charts
      </div>
    );
  }

  const dataMap = aggregateByDate(allEntries);

  // --- Stacked Bar: Last 7 days macro breakdown ---
  const last7 = getLastNDays(7).map((date) => ({
    label: formatShortDate(date),
    ...(dataMap.get(date) || { protein: 0, carbs: 0, fat: 0, calories: 0 }),
  }));

  // --- Line: Calorie trend last 30 days ---
  const last30 = getLastNDays(30).map((date) => {
    const day = dataMap.get(date);
    return {
      label: formatShortDate(date),
      calories: day?.calories || 0,
    };
  });

  // --- Bar: Protein vs target last 14 days ---
  const last14 = getLastNDays(14).map((date) => ({
    label: formatShortDate(date),
    protein: dataMap.get(date)?.protein || 0,
    target: targets.protein,
  }));

  // --- Donut: Today's macro split ---
  const todayStr = new Date().toISOString().split('T')[0];
  const todayData = dataMap.get(todayStr);
  const donutData = todayData
    ? [
        { name: 'Protein', value: todayData.protein, color: COLORS.protein },
        { name: 'Carbs', value: todayData.carbs, color: COLORS.carbs },
        { name: 'Fat', value: todayData.fat, color: COLORS.fat },
      ]
    : [
        { name: 'Protein', value: 0, color: COLORS.protein },
        { name: 'Carbs', value: 0, color: COLORS.carbs },
        { name: 'Fat', value: 0, color: COLORS.fat },
      ];
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      {/* Today's Macro Split (Donut) */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Today's Macro Split</h4>
        {donutTotal > 0 ? (
          <div className="flex items-center justify-center">
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
                >
                  {donutData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0];
                    return (
                      <div
                        className="rounded-lg px-3 py-2 text-xs border shadow-lg"
                        style={{ backgroundColor: COLORS.tooltipBg, borderColor: COLORS.tooltipBorder }}
                      >
                        <p style={{ color: d.payload.color }}>
                          {d.name}: {Math.round(d.value as number)}g
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-text-secondary">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-text-muted text-xs text-center py-8">No data for today</p>
        )}
      </div>

      {/* Weekly Macro Breakdown (Stacked Bar) */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Weekly Macro Breakdown</h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={last7} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={35}
              unit="g"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-text-secondary">{value}</span>
              )}
            />
            <Bar dataKey="protein" name="Protein" stackId="macros" fill={COLORS.protein} radius={[0, 0, 0, 0]} />
            <Bar dataKey="carbs" name="Carbs" stackId="macros" fill={COLORS.carbs} radius={[0, 0, 0, 0]} />
            <Bar dataKey="fat" name="Fat" stackId="macros" fill={COLORS.fat} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Calorie Trend (Line Chart - 30 days) */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Calorie Trend (30 Days)</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={last30}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={targets.calories}
              stroke={COLORS.target}
              strokeDasharray="5 5"
              label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'right' }}
            />
            <Line
              type="monotone"
              dataKey="calories"
              name="Calories"
              stroke={COLORS.calories}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS.calories }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Protein vs Target (Bar - 14 days) */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-text-secondary mb-3">Protein vs Target (14 Days)</h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={last14} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fill: COLORS.text, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={35}
              unit="g"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={targets.protein}
              stroke={COLORS.target}
              strokeDasharray="5 5"
              label={{ value: 'Target', fill: COLORS.text, fontSize: 10, position: 'right' }}
            />
            <Bar dataKey="protein" name="Protein" fill={COLORS.protein} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
