import { useState, useRef } from 'react';

const PRESET_COLORS = [
  '#e8572a', '#f5a623', '#f5d623', '#2e9e6b',
  '#1a7a52', '#23b5d3', '#5b6ef5', '#3b44c4',
  '#c44fc4', '#e84393', '#ff6b6b', '#a855f7',
  '#6366f1', '#0ea5e9', '#10b981', '#84cc16',
];

export function getRandomColor(exclude?: string): string {
  const available = exclude
    ? PRESET_COLORS.filter((c) => c !== exclude)
    : PRESET_COLORS;
  return available[Math.floor(Math.random() * available.length)];
}

export function getNextColor(index: number): string {
  return PRESET_COLORS[index % PRESET_COLORS.length];
}

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPreset = PRESET_COLORS.includes(value);

  return (
    <div>
      <label className="label mb-2 block">Accent Color</label>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => { onChange(color); setShowCustom(false); }}
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              value === color
                ? 'border-white scale-110'
                : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        {/* Custom color button */}
        <button
          onClick={() => {
            setShowCustom(true);
            setTimeout(() => inputRef.current?.click(), 50);
          }}
          className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-bold ${
            !isPreset && value
              ? 'border-white scale-110'
              : 'border-text-muted/30 hover:scale-105 text-text-muted'
          }`}
          style={!isPreset && value ? { backgroundColor: value } : {
            background: 'conic-gradient(#e8572a, #f5a623, #2e9e6b, #5b6ef5, #c44fc4, #e8572a)',
          }}
          title="Pick custom color"
        />
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mt-2">
          <input
            ref={inputRef}
            type="color"
            value={value || '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent p-0"
          />
          <input
            type="text"
            value={value || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === '') onChange(v);
            }}
            placeholder="#hex"
            className="input-field text-xs py-1.5 w-24 font-mono"
          />
        </div>
      )}
    </div>
  );
}
