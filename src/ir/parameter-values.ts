import { parse as parseColor } from 'culori';
import { parameterValueSchema, type Parameter, type ParameterValue } from './schema.js';
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Validate recursively without executing project expressions or coercing supplied types. */
export function validateParameterValue(parameter: Parameter, input: ParameterValue): ParameterValue {
  const value = parameterValueSchema.parse(input);
  const fail = (message: string): never => { throw new Error(`Parameter ${parameter.id} ${message}.`); };
  if (value === null) return parameter.optional ? null : fail('is required');
  if (['number', 'dimension', 'duration'].includes(parameter.type)) {
    if (typeof value !== 'number') return fail('requires a finite number');
    if (parameter.type === 'dimension' && (!Number.isInteger(value) || value <= 0)) return fail('requires positive integer pixels');
    if (parameter.type === 'duration' && value < 0) return fail('requires nonnegative seconds');
    if (parameter.min !== undefined && value < parameter.min) return fail(`is below ${String(parameter.min)}`);
    if (parameter.max !== undefined && value > parameter.max) return fail(`is above ${String(parameter.max)}`);
    return value;
  }
  if (parameter.type === 'boolean') return typeof value === 'boolean' ? value : fail('requires a boolean');
  if (parameter.type === 'array') {
    if (!Array.isArray(value)) return fail('requires an array');
    if (!parameter.items) return fail('requires an item definition');
    if (parameter.minLength !== undefined && value.length < parameter.minLength) return fail('has too few items');
    if (parameter.maxLength !== undefined && value.length > parameter.maxLength) return fail('has too many items');
    return value.map((item, index) => validateParameterValue({ ...parameter.items!, id: `${parameter.id}[${String(index)}]` }, item));
  }
  if (parameter.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return fail('requires an object');
    const properties = parameter.properties;
    if (!properties) return fail('requires property definitions');
    for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) return fail(`has unknown property ${key}`);
    return Object.fromEntries(Object.entries(properties).map(([key, definition]) => {
      if (unsafeKeys.has(key)) return fail(`has unsafe property ${key}`);
      return [key, validateParameterValue({ ...definition, id: `${parameter.id}.${key}` }, Object.hasOwn(value, key) ? value[key]! : definition.default)];
    }));
  }
  if (typeof value !== 'string') return fail('requires a string');
  if (parameter.minLength !== undefined && value.length < parameter.minLength) return fail(`requires at least ${String(parameter.minLength)} characters`);
  if (parameter.maxLength !== undefined && value.length > parameter.maxLength) return fail(`exceeds ${String(parameter.maxLength)} characters`);
  if (parameter.type === 'color' && !parseColor(value)) return fail('requires a CSS color');
  if (parameter.type === 'enum' && !parameter.options?.includes(value)) return fail(`must be one of: ${parameter.options?.join(', ') ?? ''}`);
  if (['file', 'asset', 'font'].includes(parameter.type) && (!value || /(^[/\\]|^[a-z][a-z\d+.-]*:|(^|[/\\])\.\.([/\\]|$)|\0)/i.test(value))) return fail('requires a project-local relative file path');
  return value;
}
