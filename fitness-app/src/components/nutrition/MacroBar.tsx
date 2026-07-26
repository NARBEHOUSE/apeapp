import { macroStatusColor } from '../../utils/macroColors';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, current, target, unit = 'g' }: MacroBarProps) {
  const isOver = current > target && target > 0;
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const displayCurrent = Math.round(current);
  const displayTarget = Math.round(target);
  const statusColor = macroStatusColor(current, target);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs text-text-secondary">
          <span
            className="font-medium"
            style={{ color: statusColor }}
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
            backgroundColor: statusColor,
          }}
        />
      </div>
    </div>
  );
}
