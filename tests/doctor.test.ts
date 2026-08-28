import { describe, expect, it } from 'vitest';
import { doctor } from '../src/commands/doctor.js';

describe('runtime doctor', () => {
  it('verifies every required native dependency on the supported test host', async () => {
    const checks = await doctor();
    expect(checks.map((check) => check.name)).toEqual(['Node.js', 'FFmpeg', 'FFprobe', 'Skia renderer']);
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(checks.every((check) => check.detail.length > 0)).toBe(true);
  });
});
