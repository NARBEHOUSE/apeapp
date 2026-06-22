import { useState } from 'react';
import type { SetScheme, SetSchemeType } from '../../types';

interface Props {
  scheme?: SetScheme;
  sets: number;
  reps: string;
  onChange: (scheme: SetScheme | undefined) => void;
}

const SCHEME_OPTIONS: { value: SetSchemeType; label: string; desc: string }[] = [
  { value: 'standard', label: 'Standard', desc: 'All sets at same weight/reps' },
  { value: 'top_set_backoff', label: 'Top Set + Backoff', desc: 'Heavy top set, then lighter backoff sets' },
  { value: 'pyramid', label: 'Pyramid', desc: 'Increase weight, decrease reps each set' },
  { value: 'reverse_pyramid', label: 'Reverse Pyramid', desc: 'Start heavy, decrease weight each set' },
  { value: 'to_failure', label: 'To Failure', desc: 'Track reps only — no target range' },
];

export function SetSchemeEditor({ scheme, sets, reps, onChange }: Props) {
  const [expanded, setExpanded] = useState(!!scheme && scheme.type !== 'standard');
  const currentType = scheme?.type || 'standard';

  const handleTypeChange = (type: SetSchemeType) => {
    if (type === 'standard') {
      onChange(undefined);
      return;
    }

    const repParts = reps.split('-').map((r) => parseInt(r.replace(/[^0-9]/g, '')) || 0);
    const baseReps = repParts[0] || 10;

    if (type === 'top_set_backoff') {
      onChange({
        type,
        topSetReps: repParts.length > 1 ? `${repParts[0]}-${repParts[1]}` : `${baseReps - 2}-${baseReps}`,
        backoffSets: Math.max(1, sets - 1),
        backoffReps: `${baseReps + 2}-${baseReps + 5}`,
        backoffPercent: 20,
      });
    } else if (type === 'pyramid') {
      const pyramidReps = Array.from({ length: sets }, (_, i) => Math.max(4, baseReps + 4 - i * 2));
      onChange({ type, pyramidReps });
    } else if (type === 'reverse_pyramid') {
      const pyramidReps = Array.from({ length: sets }, (_, i) => baseReps + i * 2);
      onChange({ type, pyramidReps });
    } else if (type === 'to_failure') {
      onChange({ type, failureSets: sets });
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-accent-blue font-semibold"
      >
        {expanded ? '− Set scheme' : '+ Set scheme'}
      </button>

      {expanded && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {SCHEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleTypeChange(opt.value)}
                className={`px-2 py-1 rounded-lg text-[9px] font-semibold transition-colors ${
                  currentType === opt.value ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-[9px] text-text-muted">
            {SCHEME_OPTIONS.find((o) => o.value === currentType)?.desc}
          </p>

          {/* Top Set + Backoff config */}
          {scheme?.type === 'top_set_backoff' && (
            <div className="bg-surface-raised rounded-lg p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] text-text-muted uppercase font-semibold">Top Set Reps</label>
                  <input
                    type="text" inputMode="numeric" className="input-field text-xs py-1"
                    value={scheme.topSetReps || ''} placeholder="6-8"
                    onChange={(e) => onChange({ ...scheme, topSetReps: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[8px] text-text-muted uppercase font-semibold">Backoff %</label>
                  <input
                    type="text" inputMode="numeric" className="input-field text-xs py-1"
                    value={scheme.backoffPercent || ''} placeholder="20"
                    onChange={(e) => onChange({ ...scheme, backoffPercent: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] text-text-muted uppercase font-semibold">Backoff Sets</label>
                  <input
                    type="text" inputMode="numeric" className="input-field text-xs py-1"
                    value={scheme.backoffSets || ''} placeholder="2"
                    onChange={(e) => onChange({ ...scheme, backoffSets: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-[8px] text-text-muted uppercase font-semibold">Backoff Reps</label>
                  <input
                    type="text" inputMode="numeric" className="input-field text-xs py-1"
                    value={scheme.backoffReps || ''} placeholder="10-15"
                    onChange={(e) => onChange({ ...scheme, backoffReps: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[8px] text-text-muted">
                Example: Top set 100 lbs × {scheme.topSetReps || '6-8'}, then {scheme.backoffSets || 2} sets at {100 - (scheme.backoffPercent || 20)} lbs × {scheme.backoffReps || '10-15'}
              </p>
            </div>
          )}

          {/* Pyramid / Reverse Pyramid config */}
          {(scheme?.type === 'pyramid' || scheme?.type === 'reverse_pyramid') && scheme.pyramidReps && (
            <div className="bg-surface-raised rounded-lg p-2.5 space-y-2">
              <label className="text-[8px] text-text-muted uppercase font-semibold">
                Reps per set ({scheme.type === 'pyramid' ? 'high→low' : 'low→high'})
              </label>
              <div className="flex gap-1 flex-wrap">
                {scheme.pyramidReps.map((r, i) => (
                  <div key={i} className="flex items-center gap-0.5">
                    <span className="text-[8px] text-text-muted">S{i + 1}:</span>
                    <input
                      type="text" inputMode="numeric"
                      className="input-field text-xs py-1 w-10 text-center"
                      value={r || ''}
                      onChange={(e) => {
                        const updated = [...scheme.pyramidReps!];
                        updated[i] = parseInt(e.target.value) || 0;
                        onChange({ ...scheme, pyramidReps: updated });
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onChange({ ...scheme, pyramidReps: [...scheme.pyramidReps!, scheme.pyramidReps![scheme.pyramidReps!.length - 1] || 8] })}
                  className="text-[9px] text-accent-blue font-semibold px-1"
                >+</button>
                {scheme.pyramidReps.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...scheme, pyramidReps: scheme.pyramidReps!.slice(0, -1) })}
                    className="text-[9px] text-text-muted font-semibold px-1"
                  >−</button>
                )}
              </div>
              <p className="text-[8px] text-text-muted">
                {scheme.type === 'pyramid' ? 'Weight increases as reps decrease' : 'Start with heaviest set, reduce weight as reps increase'}
              </p>
            </div>
          )}

          {/* To Failure config */}
          {scheme?.type === 'to_failure' && (
            <div className="bg-surface-raised rounded-lg p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-[8px] text-text-muted uppercase font-semibold">Sets to failure</label>
                <input
                  type="text" inputMode="numeric"
                  className="input-field text-xs py-1 w-12 text-center"
                  value={scheme.failureSets || ''}
                  onChange={(e) => onChange({ ...scheme, failureSets: parseInt(e.target.value) || 0 })}
                />
              </div>
              <p className="text-[8px] text-text-muted">
                No rep target — just go until failure and log how many you got
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
