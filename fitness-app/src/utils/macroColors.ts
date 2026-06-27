// Returns a color on a spectrum from green (on target) → red (far off target).
// Applies symmetrically: 10% under = 10% over in terms of color.
export function macroStatusColor(current: number, target: number): string {
  if (target <= 0) return '#2e9e6b';
  const deviation = Math.abs(current - target) / target * 100;
  if (deviation <= 5)  return '#2e9e6b'; // green
  if (deviation <= 15) return '#8eb844'; // yellow-green
  if (deviation <= 30) return '#c9a820'; // yellow
  if (deviation <= 50) return '#e07230'; // orange
  return '#e85757';                      // red
}

export function macroStatusBg(current: number, target: number): string {
  const hex = macroStatusColor(current, target);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}
