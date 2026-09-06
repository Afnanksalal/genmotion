import { describe, expect, it } from 'vitest';
import { globalMarkerTime, timelineMarkerSchema, timelineRangesSchema } from '../src/ir/markers.js';
import { formatTimecode, parseTimelineTime } from '../src/engine/time.js';

describe('editorial time and markers', () => {
  it('preserves local marker positions across scene reordering and refuses missing scenes', () => {
    const marker = timelineMarkerSchema.parse({ id: 'beat', label: 'Beat', time: .75, sceneId: 'b', kind: 'beat' });
    const scenes = [{ id: 'a', duration: 2 }, { id: 'b', duration: 3 }];
    expect(globalMarkerTime(marker, scenes)).toBe(2.75); expect(globalMarkerTime(marker, [...scenes].reverse())).toBe(.75);
    expect(() => globalMarkerTime(marker, [])).toThrow('missing scene');
    expect(() => timelineRangesSchema.parse([{ id: 'range', label: 'Empty', start: 1, end: 1 }])).toThrow('exceed');
  });
  it('round-trips non-drop frame timecodes and supports explicit fractional frame entry', () => {
    for (const fps of [1, 24, 30, 60, 120]) for (const frame of [0, 1, fps - 1, fps * 3600 + fps * 61 + 1]) expect(parseTimelineTime(formatTimecode(frame, fps), fps) * fps).toBeCloseTo(frame, 7);
    expect(parseTimelineTime('37.5f', 30)).toBe(1.25); expect(parseTimelineTime('01:02.5', 30)).toBe(62.5); expect(parseTimelineTime('01:02:03.5', 30)).toBe(3723.5);
    for (const value of ['00:00:00:30', '00:61:00:00', '00:00:00;01', '-1', 'Infinity', 'bad']) expect(() => parseTimelineTime(value, 30)).toThrow();
  });
});
