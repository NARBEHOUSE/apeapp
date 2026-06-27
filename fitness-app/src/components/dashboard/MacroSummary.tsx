import { macroStatusColor, macroStatusBg } from '../../utils/macroColors';

interface MacroSummaryProps {
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  targets: { calories: number; protein: number; carbs: number; fat: number };
}

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
}

function MacroBar({ label, current, target, unit }: MacroBarProps) {
  const isOver = current > target && target > 0;
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const statusColor = macroStatusColor(current, target);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs text-text-secondary">
          <span className="font-medium" style={{ color: statusColor }}>
            {Math.round(current)}{unit}
          </span>
          {' / '}
          {Math.round(target)}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${isOver ? 100 : percentage}%`,
            backgroundColor: statusColor,
          }}
        />
      </div>
    </div>
  );
}

export default function MacroSummary({ totals, targets }: MacroSummaryProps) {
  const calPercentage = targets.calories > 0
    ? Math.round((totals.calories / targets.calories) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Calories hero */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-text-primary">
          {Math.round(totals.calories)}
        </span>
        <span className="text-sm text-text-secondary">
          / {Math.round(targets.calories)} kcal
        </span>
        <span
          className="text-xs font-medium ml-auto px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: macroStatusBg(totals.calories, targets.calories),
            color: macroStatusColor(totals.calories, targets.calories),
          }}
        >
          {calPercentage}%
        </span>
      </div>

      {/* Macro bars */}
      <div className="space-y-3">
        <MacroBar label="Calories" current={totals.calories} target={targets.calories} unit="" />
        <MacroBar label="Protein"  current={totals.protein}  target={targets.protein}  unit="g" />
        <MacroBar label="Carbs"    current={totals.carbs}    target={targets.carbs}    unit="g" />
        <MacroBar label="Fat"      current={totals.fat}      target={targets.fat}      unit="g" />
        <MacroBar label="Fiber"    current={totals.fiber}    target={30}               unit="g" />
      </div>
    </div>
  );
}
