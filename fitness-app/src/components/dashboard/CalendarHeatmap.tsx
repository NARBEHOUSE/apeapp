import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorkoutSession, FoodEntry, CheckInEntry } from '../../types';

interface Props {
  sessions: WorkoutSession[];
  foodEntries: FoodEntry[];
  checkIns: CheckInEntry[];
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarHeatmap({ sessions, foodEntries, checkIns }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const workoutDates = useMemo(() => new Set(sessions.map((s) => s.date)), [sessions]);
  const nutritionDates = useMemo(() => new Set(foodEntries.map((f) => f.date)), [foodEntries]);
  const checkInDates = useMemo(() => new Set(checkIns.map((c) => c.date)), [checkIns]);

  const days = useMemo(() => {
    const firstDay = new Date(month.year, month.month, 1);
    const startPad = firstDay.getDay();
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

    const cells: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: '', day: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d, inMonth: true });
    }
    return cells;
  }, [month]);

  const prevMonth = () => setMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  const nextMonth = () => setMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

  const monthLabel = new Date(month.year, month.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="card">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1"><ChevronLeft size={16} className="text-text-muted" /></button>
        <h2 className="text-sm font-semibold">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-1"><ChevronRight size={16} className="text-text-muted" /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-[9px] text-text-muted text-center font-semibold">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((cell, i) => {
          if (!cell.inMonth) return <div key={i} />;
          const hasWorkout = workoutDates.has(cell.date);
          const hasNutrition = nutritionDates.has(cell.date);
          const hasCheckIn = checkInDates.has(cell.date);
          const isToday = cell.date === todayStr;
          const hasAny = hasWorkout || hasNutrition || hasCheckIn;

          return (
            <div
              key={i}
              className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                isToday ? 'ring-1 ring-accent' : ''
              } ${hasAny ? 'bg-surface-raised' : ''}`}
            >
              <span className={`font-medium ${isToday ? 'text-accent' : hasAny ? 'text-text-primary' : 'text-text-muted'}`}>
                {cell.day}
              </span>
              {hasAny && (
                <div className="flex gap-0.5">
                  {hasWorkout && <div className="w-1 h-1 rounded-full bg-accent" />}
                  {hasNutrition && <div className="w-1 h-1 rounded-full bg-[#f5a623]" />}
                  {hasCheckIn && <div className="w-1 h-1 rounded-full bg-green-500" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[9px] text-text-muted">
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-accent" /> Workout</div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" /> Nutrition</div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Check-in</div>
      </div>
    </div>
  );
}
