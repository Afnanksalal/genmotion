import type { EasingName } from '../ir/schema.js';

export const easingPresets = {
  'gentle': { type: 'spring', mass: 1, stiffness: 120, damping: 22, velocity: 0, clamp: false },
  'snappy': { type: 'spring', mass: 0.8, stiffness: 260, damping: 24, velocity: 0, clamp: false },
  'settled': { type: 'spring', mass: 1, stiffness: 180, damping: 30, velocity: 0, clamp: true },
  'expressive': { type: 'spring', mass: 1, stiffness: 150, damping: 14, velocity: 0, clamp: false },
} as const satisfies Record<string, Extract<EasingName, { type: 'spring' }>>;

function backIn(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

type Spring = Extract<EasingName, { type: 'spring' }>;

function springState(spring: Spring, seconds: number): { value: number; velocity: number } {
  const omega0 = Math.sqrt(spring.stiffness / spring.mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  const time = Math.max(0, seconds);
  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const coefficient = (zeta * omega0 - spring.velocity) / omegaD;
    const envelope = Math.exp(-zeta * omega0 * time);
    const cosine = Math.cos(omegaD * time);
    const sine = Math.sin(omegaD * time);
    const residual = envelope * (cosine + coefficient * sine);
    const derivative = envelope * ((-zeta * omega0) * (cosine + coefficient * sine) + (-omegaD * sine + coefficient * omegaD * cosine));
    return { value: 1 - residual, velocity: -derivative };
  }
  if (Math.abs(zeta - 1) < 1e-4) {
    const coefficient = omega0 - spring.velocity;
    const envelope = Math.exp(-omega0 * time);
    return { value: 1 - envelope * (1 + coefficient * time), velocity: envelope * (omega0 * (1 + coefficient * time) - coefficient) };
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega0 * (zeta - root);
  const r2 = -omega0 * (zeta + root);
  const a = (spring.velocity + r2) / (r1 - r2);
  const b = -1 - a;
  return { value: 1 + a * Math.exp(r1 * time) + b * Math.exp(r2 * time), velocity: a * r1 * Math.exp(r1 * time) + b * r2 * Math.exp(r2 * time) };
}

export function measureSpringDuration(spring: Spring, precision = 0.001): number {
  const step = 1 / 240;
  const stableSamples = 24;
  let stable = 0;
  for (let index = 1; index <= 20 / step; index += 1) {
    const state = springState(spring, index * step);
    if (Math.abs(1 - state.value) <= precision && Math.abs(state.velocity) <= precision * 10) stable += 1;
    else stable = 0;
    if (stable >= stableSamples) return Math.max(step, (index - stableSamples + 1) * step);
  }
  return 20;
}

export function analyzeSpring(spring: Spring, samples = 120): { duration: number; overshoot: number; settlingValue: number; samples: Array<{ time: number; value: number; velocity: number }> } {
  const duration = spring.duration ?? measureSpringDuration(spring);
  const points = Array.from({ length: Math.max(2, samples) }, (_, index) => {
    const time = duration * index / (Math.max(2, samples) - 1);
    return { time, ...springState(spring, time) };
  });
  return { duration, overshoot: Math.max(0, ...points.map((point) => point.value - 1)), settlingValue: points.at(-1)?.value ?? 1, samples: points };
}

export function reverseEasingSample(name: EasingName, value: number): number { return 1 - ease(name, 1 - value); }
export function mirrorEasingSample(name: EasingName, value: number): number { return value < 0.5 ? ease(name, value * 2) / 2 : 0.5 + reverseEasingSample(name, value * 2 - 1) / 2; }

export function ease(name: EasingName, value: number): number {
  const t = Math.max(0, Math.min(1, value));
  if (typeof name !== 'string') {
    if (name.type === 'spring') {
      if (t === 0 || t === 1) return t;
      const duration = name.duration ?? measureSpringDuration(name);
      const final = springState(name, duration).value;
      const response = springState(name, t * duration).value / (Math.abs(final) > 1e-9 ? final : 1);
      return name.clamp ? Math.max(0, Math.min(1, response)) : response;
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
