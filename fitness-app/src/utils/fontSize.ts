import { useState, useEffect } from 'react';

export type FontSize = 'normal' | 'large' | 'xl';

const STORAGE_KEY = 'fitos-fontsize';
const EVENT = 'fitos-fontsize';
export const SCALES: Record<FontSize, number> = { normal: 1, large: 1.125, xl: 1.25 };

export function getActiveFontSize(): FontSize {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'large' || saved === 'xl') return saved;
  return 'normal';
}

export function applyFontSize(size?: FontSize): void {
  const id = size || getActiveFontSize();
  const px = { normal: '16px', large: '18px', xl: '20px' };
  document.documentElement.style.fontSize = px[id];
}

export function setActiveFontSize(size: FontSize): void {
  localStorage.setItem(STORAGE_KEY, size);
  applyFontSize(size);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: size }));
}

export function useFontScale(): number {
  const [scale, setScale] = useState(() => SCALES[getActiveFontSize()]);
  useEffect(() => {
    const handler = (e: Event) => setScale(SCALES[(e as CustomEvent<FontSize>).detail]);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return scale;
}

export function getChartFontSize(base: number): number {
  return Math.round(base * SCALES[getActiveFontSize()]);
}
