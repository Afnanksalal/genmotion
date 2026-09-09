import { z } from 'zod';

export const operationOutcomeSchema = z.enum(['process-succeeded', 'project-validated', 'edit-saved', 'output-verified', 'failed']);
export const operationDiagnosticSchema = z.object({
  version: z.literal(1), stage: z.string().min(1).max(100), target: z.string().min(1).max(1024),
  time: z.string().datetime(), outcome: operationOutcomeSchema, errorCode: z.string().min(1).max(100).optional(),
  nextAction: z.string().min(1).max(1024), details: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((value, context) => { if (value.outcome === 'failed' && !value.errorCode) context.addIssue({ code: 'custom', message: 'Failed diagnostics require an error code', path: ['errorCode'] }); });
export type OperationDiagnostic = z.infer<typeof operationDiagnosticSchema>;

export function operationDiagnostic(input: Omit<OperationDiagnostic, 'version' | 'time'> & { time?: string }): OperationDiagnostic {
  const details = input.details && Object.fromEntries(Object.entries(input.details).slice(0, 64).map(([key, value]) => [key.slice(0, 100), typeof value === 'string' ? value.slice(0, 4096) : value]));
  return operationDiagnosticSchema.parse({ version: 1, ...input, ...(details ? { details } : {}), time: input.time ?? new Date().toISOString() });
}
