interface MacroSummaryProps {
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  targets: { calories: number; protein: number; carbs: number; fat: number };
}

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit: string;
}

function MacroBar({ label, current, target, color, unit }: MacroBarProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs text-text-secondary">
          <span className="text-text-primary font-medium">
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
            width: `${percentage}%`,
            backgroundColor: color,
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
            backgroundColor: calPercentage > 100 ? 'rgba(232, 87, 87, 0.15)' : 'rgba(232, 87, 42, 0.15)',
            color: calPercentage > 100 ? '#e85757' : '#e8572a',
          }}
        >
          {calPercentage}%
        </span>
      </div>

      {/* Macro bars */}
      <div className="space-y-3">
        <MacroBar
          label="Calories"
          current={totals.calories}
          target={targets.calories}
          color="#e8572a"
          unit=""
        />
        <MacroBar
          label="Protein"
          current={totals.protein}
          target={targets.protein}
          color="#5b6ef5"
          unit="g"
        />
        <MacroBar
          label="Carbs"
          current={totals.carbs}
          target={targets.carbs}
          color="#2e9e6b"
          unit="g"
        />
        <MacroBar
          label="Fat"
          current={totals.fat}
          target={targets.fat}
          color="#f5a623"
          unit="g"
        />
        <MacroBar
          label="Fiber"
          current={totals.fiber}
          target={30}
          color="var(--color-text-muted)"
          unit="g"
        />
      </div>
    </div>
  );
}
