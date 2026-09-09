import { describe, expect, it } from 'vitest';
import { operationDiagnostic, operationDiagnosticSchema } from '../src/ir/operation-diagnostic.js';

describe('bounded operation diagnostics', () => {
  it('distinguishes process, validation, persistence and output outcomes', () => {
    const outcomes = ['process-succeeded', 'project-validated', 'edit-saved', 'output-verified'] as const;
    for (const outcome of outcomes) expect(operationDiagnostic({ stage: 'verify', target: 'renders/master.mp4', outcome, nextAction: 'Continue to the declared next stage.' })).toMatchObject({ version: 1, outcome });
    const failed = operationDiagnostic({ stage: 'encode', target: 'master', outcome: 'failed', errorCode: 'ENCODER_EXIT', nextAction: 'Inspect the bounded encoder log.', details: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`key-${index}`, 'x'.repeat(5000)])) });
    expect(Object.keys(failed.details!)).toHaveLength(64); expect(failed.details!['key-0']).toHaveLength(4096);
    expect(() => operationDiagnosticSchema.parse({ version: 1, stage: 'x', target: 'x', time: new Date().toISOString(), outcome: 'failed', nextAction: 'retry' })).toThrow('error code');
  });
});
