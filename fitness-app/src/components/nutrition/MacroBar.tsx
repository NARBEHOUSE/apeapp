interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, current, target, color, unit = 'g' }: MacroBarProps) {
  const isOver = current > target && target > 0;
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const displayCurrent = Math.round(current);
  const displayTarget = Math.round(target);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs text-text-secondary">
          <span
            className="font-medium"
            style={{ color: isOver ? '#e85757' : 'var(--color-text-primary)' }}
          >
            {displayCurrent}{unit}
          </span>
          {' / '}
          {displayTarget}{unit}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${isOver ? 100 : percentage}%`,
            backgroundColor: isOver ? '#e85757' : color,
          }}
        />
      </div>
    </div>
  );
}
