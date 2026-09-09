import { describe, expect, it } from 'vitest';
import { projectSchema } from '../src/ir/schema.js';
import { classifyReviewObservation, reviewSamplePlan } from '../src/ir/review-sampling.js';

const project = projectSchema.parse({ schemaVersion: 1, id: 'review', title: 'Review', width: 100, height: 100, fps: 10, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'one', purpose: 'Review', duration: 2, background: '#000', layers: [{ id: 'shape', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', tracks: [{ id: 'move', target: 'transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }, { at: 2, value: 20 }] }] }] }] });

describe('review sampling', () => {
  it('includes boundaries, keyframes and interior samples deterministically', () => {
    expect(reviewSamplePlan(project, 20)).toMatchObject({ coverage: 'complete', times: [0, .5, 1, 1.5, 2] });
  });
  it('reports explicitly when a bounded review omits candidates', () => {
    expect(reviewSamplePlan(project, 2)).toMatchObject({ coverage: 'truncated', times: [0, 2], omittedTimes: 3, totalCandidates: 5 });
  });
  it('labels transition and entrance samples separately from interior holds', () => {
    const withTransition = projectSchema.parse({ ...project, scenes: [{ ...project.scenes[0]!, transitionIn: { type: 'crossfade', duration: .4 }, transitionOut: { type: 'blur', duration: .3 } }] });
    const plan = reviewSamplePlan(withTransition, 30);
    expect(plan.points).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 0, phase: 'transient', reasons: expect.arrayContaining(['transition:one:in:start']) }),
      expect.objectContaining({ time: .4, reasons: expect.arrayContaining(['transition:one:in:end']) }),
      expect.objectContaining({ phase: 'interior', reasons: ['interior'] }),
      expect.objectContaining({ time: 2, phase: 'transient', reasons: expect.arrayContaining(['transition:one:out:end']) }),
    ]));
    expect(plan.transientWindows).toEqual([{ start: 0, end: .4, kind: 'transition-in', sceneId: 'one' }, { start: 1.7, end: 2, kind: 'transition-out', sceneId: 'one' }]);
    expect(classifyReviewObservation(plan, [0, .2, .4]).classification).toBe('intentional-transient');
    const stable = plan.points.filter(point => point.phase === 'interior' && !plan.transientWindows.some(window => point.time >= window.start && point.time <= window.end)).slice(0, 2).map(point => point.time);
    expect(classifyReviewObservation(plan, stable)).toMatchObject({ classification: 'persistent-defect', transientWindows: [] });
    expect(classifyReviewObservation(plan, [1])).toMatchObject({ classification: 'isolated-observation' });
    expect(() => classifyReviewObservation(plan, [])).toThrow('one or more');
  });
});
 
