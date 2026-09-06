import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProjectDocument } from '../src/ir/loader.js';
import { parseParameterAssignments, resolveParameters, validateParameterValue } from '../src/ir/parameters.js';
import { parameterSchema, projectSchema, type Parameter } from '../src/ir/schema.js';

function definition(type: Parameter['type'], value: Parameter['default'], extra: Partial<Parameter> = {}): Parameter {
  return parameterSchema.parse({ id: 'value', label: 'Value', type, default: value, ...extra });
}
async function source() { return projectSchema.parse(JSON.parse(await readFile('tests/fixtures/basic/genmotion.json', 'utf8'))); }

describe('structured native parameters', () => {
  it('validates every parameter kind without coercion', () => {
    const cases: Array<[Parameter['type'], Parameter['default']]> = [['string', 'Hello'], ['number', 3], ['boolean', false], ['color', '#ffaa00'], ['file', 'data/table.csv'], ['asset', 'assets/image.png'], ['font', 'fonts/local.ttf'], ['dimension', 1920], ['duration', 0]];
    for (const [type, value] of cases) expect(validateParameterValue(definition(type, value), value)).toEqual(value);
    expect(validateParameterValue(definition('enum', 'a', { options: ['a', 'b'] }), 'b')).toBe('b');
    expect(validateParameterValue(definition('string', null, { optional: true }), null)).toBeNull();
    expect(() => validateParameterValue(definition('number', 1), '1')).toThrow('finite number');
    expect(() => validateParameterValue(definition('dimension', 1), 1.5)).toThrow('integer');
    expect(() => validateParameterValue(definition('duration', 1), -1)).toThrow('nonnegative');
    expect(() => validateParameterValue(definition('color', '#fff'), '#fff trailing')).toThrow('CSS color');
    for (const value of ['../escape.png', 'https://host/file', 'C:\\outside', '/absolute', 'folder/../../escape']) expect(() => validateParameterValue(definition('asset', 'local.png'), value)).toThrow('project-local');
    expect(() => validateParameterValue(definition('number', 1, { min: 0, max: 2 }), 3)).toThrow('above');
    expect(() => validateParameterValue(definition('string', ''), null)).toThrow('required');
  });

  it('resolves nested defaults and enforces structure and constraints', () => {
    const row = definition('object', {}, { properties: { title: definition('string', 'Untitled', { maxLength: 12 }), count: definition('number', 1, { min: 0 }) } });
    const rows = definition('array', [], { items: row, maxLength: 2 });
    expect(validateParameterValue(rows, [{ title: 'First' }, {}])).toEqual([{ title: 'First', count: 1 }, { title: 'Untitled', count: 1 }]);
    expect(() => validateParameterValue(rows, [{ other: 1 }])).toThrow('unknown property');
    expect(() => validateParameterValue(rows, [{ count: -1 }])).toThrow('below');
    expect(() => validateParameterValue(rows, [{}, {}, {}])).toThrow('too many');
    expect(() => definition('array', [])).toThrow('items');
    expect(() => definition('number', 0, { min: 2, max: 1 })).toThrow('Minimum');
  });

  it('binds array properties and revalidates the destination without mutating source', async () => {
    const project = await source();
    const layer = project.scenes[0]!.layers[0]!;
    project.parameters = [definition('number', 25)];
    layer.bindings = { 'transform.rotation': 'value' };
    const resolved = resolveParameters(project, { value: 50 });
    expect(resolved.scenes[0]!.layers[0]!.transform.rotation).toBe(50);
    expect(layer.transform.rotation).toBe(0);
    layer.bindings = { width: 'value' };
    expect(() => resolveParameters(project, { value: -10 })).toThrow();
    for (const target of ['__proto__.polluted', 'constructor.prototype.polluted', 'id', 'bindings.value']) {
      layer.bindings = { [target]: 'value' };
      expect(() => resolveParameters(project)).toThrow(/Unsafe|identity/);
    }
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    project.parameters.push(project.parameters[0]!);
    expect(() => resolveParameters(project)).toThrow('Duplicate');
  });

  it('parses structured CLI assignments and preserves quoted numeric strings', () => {
    expect(parseParameterAssignments(['count=3', 'enabled=false', 'title="007"', 'rows=[{"x":1}]', 'optional=null', 'text=hello=world'])).toEqual({ count: 3, enabled: false, title: '007', rows: [{ x: 1 }], optional: null, text: 'hello=world' });
    for (const values of [['x=[broken'], ['x=1', 'x=2'], ['__proto__=true'], ['x={"__proto__":{}}']]) expect(() => parseParameterAssignments(values)).toThrow();
  });

  it('hashes local parameter dependencies and refuses missing sources', async () => {
    const project = await source();
    project.parameters = [definition('file', 'genmotion.json')];
    const loaded = await loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'));
    expect(loaded.parameterDependencies).toHaveLength(1);
    expect(loaded.parameterDependencies?.[0]?.path).toBe('genmotion.json');
    expect(loaded.parameterDependencies?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.parameterDependencies?.[0]?.bytes).toBeGreaterThan(0);
    await expect(loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'), { value: 'missing.csv' })).rejects.toThrow();
  });
});
