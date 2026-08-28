import type { EasingName } from '../ir/schema.js';

function backIn(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

export function ease(name: EasingName, value: number): number {
  const t = Math.max(0, Math.min(1, value));
  if (typeof name !== 'string') {
    if (name.type === 'spring') {
      const omega0 = Math.sqrt(name.stiffness / name.mass);
      const zeta = name.damping / (2 * Math.sqrt(name.stiffness * name.mass));
      if (zeta < 1) {
        const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
        const envelope = Math.exp(-zeta * omega0 * t);
        return 1 - envelope * (Math.cos(omegaD * t) + ((zeta * omega0 - name.velocity) / omegaD) * Math.sin(omegaD * t));
      }
      return 1 - Math.exp(-omega0 * t) * (1 + (omega0 - name.velocity) * t);
    }
    const sample = (a: number, b: number, c: number, x: number): number => ((a * x + b) * x + c) * x;
    const ax = 3 * name.x1 - 3 * name.x2 + 1;
    const bx = 3 * name.x2 - 6 * name.x1;
    const cx = 3 * name.x1;
    const ay = 3 * name.y1 - 3 * name.y2 + 1;
    const by = 3 * name.y2 - 6 * name.y1;
    const cy = 3 * name.y1;
    let low = 0;
    let high = 1;
    let parameter = t;
    for (let index = 0; index < 18; index += 1) {
      parameter = (low + high) / 2;
      if (sample(ax, bx, cx, parameter) < t) low = parameter;
      else high = parameter;
    }
    return sample(ay, by, cy, parameter);
  }
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
