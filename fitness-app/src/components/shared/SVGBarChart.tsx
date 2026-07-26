import { useState } from 'react';

export function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  if (n < 1.5) return mag;
  if (n < 3.5) return 2 * mag;
  if (n < 7.5) return 5 * mag;
  return 10 * mag;
}

const GRID = 'var(--color-border)';
const MUTED = 'var(--color-text-muted)';

interface SVGBarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  targetValue?: number;
  targetLabel?: string;
  height?: number;
  yAxisWidth?: number;
  formatY?: (v: number) => string;
  formatValue?: (v: number) => string;
  onBarClick?: (index: number) => void;
}

export function SVGBarChart({
  data,
  color = '#5b6ef5',
  targetValue,
  targetLabel = 'Goal',
  height = 160,
  yAxisWidth = 36,
  formatY,
  formatValue,
  onBarClick,
}: SVGBarChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const W = 320;
  const ml = yAxisWidth, mr = 8, mt = 8, mb = 20;
  const cw = W - ml - mr;
  const ch = height - mt - mb;

  const dataMax = Math.max(...data.map((d) => d.value), 1);
  const rawMax = targetValue != null ? Math.max(dataMax, targetValue) : dataMax;
  const step = niceStep(rawMax / 4);
  const maxVal = Math.ceil(rawMax / step + 1) * step;

  const yPos = (v: number) => mt + ch - (v / maxVal) * ch;
  const ticks = Array.from({ length: Math.floor(maxVal / step) + 1 }, (_, i) => i * step);

  const slotW = cw / Math.max(data.length, 1);
  const barW = Math.max(4, Math.min(22, slotW * 0.65));
  const labelEvery = Math.max(1, Math.round(data.length / 6));

  const selected = activeIdx !== null ? data[activeIdx] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height}>
        {/* Grid + Y labels */}
        {ticks.map((v, ti) => {
          const y = yPos(v);
          return (
            <g key={ti}>
              <line x1={ml} y1={y} x2={ml + cw} y2={y}
                stroke={GRID} strokeWidth={0.5} strokeDasharray={v === 0 ? undefined : '3 3'} />
              <text x={ml - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill={MUTED}>
                {formatY ? formatY(v) : v}
              </text>
            </g>
          );
        })}

        {/* Target reference line */}
        {targetValue != null && targetValue > 0 && (() => {
          const ty = yPos(targetValue);
          if (ty < mt - 4 || ty > mt + ch + 4) return null;
          return (
            <g>
              <line x1={ml} y1={ty} x2={ml + cw} y2={ty}
                stroke={MUTED} strokeWidth={1} strokeDasharray="5 5" />
              <text x={ml + cw - 2} y={ty - 3} textAnchor="end" fontSize={9} fill={MUTED}>
                {targetLabel}
              </text>
            </g>
          );
        })()}

        {/* Bars */}
        {data.map((d, i) => {
          const x = ml + i * slotW + (slotW - barW) / 2;
          const h = Math.max(0, (d.value / maxVal) * ch);
          const dim = activeIdx !== null && activeIdx !== i;
          return (
            <g key={i} onClick={() => { setActiveIdx((prev) => prev === i ? null : i); onBarClick?.(i); }}
              style={{ cursor: 'pointer' }} opacity={dim ? 0.25 : 1}>
              {/* wider invisible hit area */}
              <rect x={x - 3} y={mt} width={barW + 6} height={ch} fill="transparent" />
              {h > 0.5 && (
                <rect x={x} y={mt + ch - h} width={barW} height={h} fill={color} rx={2} />
              )}
            </g>
          );
        })}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0) return null;
          const x = ml + i * slotW + slotW / 2;
          return (
            <text key={i} x={x} y={mt + ch + 14} textAnchor="middle" fontSize={9} fill={MUTED}>
              {d.label}
            </text>
          );
        })}
      </svg>

      {selected && (
        <div className="mt-1 px-3 py-1.5 rounded-lg text-xs text-center"
          style={{ backgroundColor: 'var(--color-surface-raised)' }}>
          <span className="mr-2" style={{ color: MUTED }}>{selected.label}</span>
          <span style={{ color }}>
            {formatValue ? formatValue(selected.value) : String(selected.value)}
          </span>
        </div>
      )}
    </div>
  );
}
