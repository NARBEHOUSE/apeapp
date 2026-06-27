// Smooth gradient: green at target, grades to red as you go further under or over.
// The gradient zone spans roughly ±40% of target; beyond that it clamps to red.

type Stop = { dev: number; r: number; g: number; b: number };

const STOPS: Stop[] = [
  { dev:  0, r: 46,  g: 158, b: 107 }, // #2e9e6b green
  { dev: 10, r: 142, g: 184, b: 68  }, // #8eb844 yellow-green
  { dev: 22, r: 201, g: 168, b: 32  }, // #c9a820 yellow
  { dev: 36, r: 224, g: 114, b: 48  }, // #e07230 orange
  { dev: 50, r: 232, g: 87,  b: 87  }, // #e85757 red
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export function macroStatusColor(current: number, target: number): string {
  if (target <= 0) return '#2e9e6b';
  const dev = Math.abs(current - target) / target * 100;

  // Clamp beyond last stop
  if (dev >= STOPS[STOPS.length - 1].dev) {
    const s = STOPS[STOPS.length - 1];
    return `rgb(${s.r},${s.g},${s.b})`;
  }

  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (dev <= b.dev) {
      const t = (dev - a.dev) / (b.dev - a.dev);
      return `rgb(${Math.round(lerp(a.r,b.r,t))},${Math.round(lerp(a.g,b.g,t))},${Math.round(lerp(a.b,b.b,t))})`;
    }
  }

  return '#e85757';
}

export function macroStatusBg(current: number, target: number): string {
  if (target <= 0) return 'rgba(46,158,107,0.15)';
  const dev = Math.abs(current - target) / target * 100;
  const clampedDev = Math.min(dev, STOPS[STOPS.length - 1].dev);
  let r = STOPS[STOPS.length - 1].r, g = STOPS[STOPS.length - 1].g, b = STOPS[STOPS.length - 1].b;

  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], next = STOPS[i + 1];
    if (clampedDev <= next.dev) {
      const t = (clampedDev - a.dev) / (next.dev - a.dev);
      r = Math.round(lerp(a.r, next.r, t));
      g = Math.round(lerp(a.g, next.g, t));
      b = Math.round(lerp(a.b, next.b, t));
      break;
    }
  }

  return `rgba(${r},${g},${b},0.15)`;
}
