import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
>;

interface BaseProps extends NativeProps {
  value: number | undefined | null;
  /** Allow a decimal point. Integers only when false. */
  decimal?: boolean;
  /** Clamped on blur, so partial numbers can still be typed. */
  min?: number;
  max?: number;
}

type RequiredProps = BaseProps & {
  /** Empty box reports `undefined` instead of 0. */
  optional?: false;
  onChange: (value: number) => void;
};

type OptionalProps = BaseProps & {
  optional: true;
  onChange: (value: number | undefined) => void;
};

function format(value: number | undefined | null): string {
  return value == null || Number.isNaN(value) ? '' : String(value);
}

function clean(raw: string, decimal: boolean): string {
  const stripped = raw.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (!decimal) return stripped;
  const dot = stripped.indexOf('.');
  if (dot === -1) return stripped;
  // Keep only the first decimal point
  return stripped.slice(0, dot + 1) + stripped.slice(dot + 1).replace(/\./g, '');
}

/**
 * Number box that can be emptied. It shows the raw text you typed, so
 * backspacing the last digit leaves a blank field instead of snapping back to
 * a number, and half-typed values like "2." survive until you finish. An empty
 * box reports 0 — or `undefined` when `optional`.
 */
export function NumberField(props: RequiredProps | OptionalProps) {
  const {
    value,
    onChange,
    decimal = false,
    optional,
    min,
    max,
    onBlur,
    inputMode,
    ...rest
  } = props;

  const [draft, setDraft] = useState(() => format(value));

  const parse = (text: string): number | undefined => {
    if (text.trim() === '') return optional ? undefined : 0;
    const n = decimal ? parseFloat(text) : parseInt(text, 10);
    if (Number.isNaN(n)) return optional ? undefined : 0;
    return n;
  };

  const emit = onChange as (v: number | undefined) => void;

  // The draft wins while it still means the value we last reported; anything
  // else (a preset, an autofill, a recalc) came from outside and takes over.
  const mine = parse(draft);
  const agrees = mine == null ? value == null : mine === value;
  const shown = agrees ? draft : format(value);

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode ?? (decimal ? 'decimal' : 'numeric')}
      value={shown}
      onChange={(e) => {
        const next = clean(e.target.value, decimal);
        setDraft(next);
        emit(parse(next));
      }}
      onBlur={(e) => {
        // An empty box stays empty — only a typed number gets clamped.
        if (shown.trim() !== '') {
          let settled = parse(shown) as number;
          if (min != null) settled = Math.max(min, settled);
          if (max != null) settled = Math.min(max, settled);
          setDraft(format(settled));
          if (settled !== value) emit(settled);
        }
        onBlur?.(e);
      }}
    />
  );
}
