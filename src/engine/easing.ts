import type { EasingName } from '../ir/schema.js';

function backIn(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

export function ease(name: EasingName, value: number): number {
  const t = Math.max(0, Math.min(1, value));
  switch (name) {
    case 'linear': return t;
    case 'sine-in': return 1 - Math.cos((t * Math.PI) / 2);
    case 'sine-out': return Math.sin((t * Math.PI) / 2);
    case 'sine-in-out': return -(Math.cos(Math.PI * t) - 1) / 2;
    case 'quad-in': return t * t;
    case 'quad-out': return 1 - (1 - t) * (1 - t);
    case 'quad-in-out': return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    case 'cubic-in': return t ** 3;
    case 'cubic-out': return 1 - (1 - t) ** 3;
    case 'cubic-in-out': return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
    case 'quart-in': return t ** 4;
    case 'quart-out': return 1 - (1 - t) ** 4;
    case 'quart-in-out': return t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2;
    case 'expo-in': return t === 0 ? 0 : 2 ** (10 * t - 10);
    case 'expo-out': return t === 1 ? 1 : 1 - 2 ** (-10 * t);
    case 'expo-in-out':
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
    case 'back-in': return backIn(t);
    case 'back-out': return 1 - backIn(1 - t);
    case 'back-in-out': return t < 0.5 ? backIn(t * 2) / 2 : 0.5 + (1 - backIn(2 - t * 2)) / 2;
  }
}
