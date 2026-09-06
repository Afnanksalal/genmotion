export type SvgPathLetter = 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z';
export interface SvgPathCommand { command: SvgPathLetter | Lowercase<SvgPathLetter>; values: number[] }
const arity: Record<SvgPathLetter, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** SVG 2 path-data grammar, including compact arc flags and implicit commands. */
export function parseSvgPath(data: string): SvgPathCommand[] {
  if (data.length > 10_000_000) throw new Error('SVG path exceeds the 10 MB parsing limit.');
  let position = 0, previous = '';
  const result: SvgPathCommand[] = [];
  const whitespace = (): void => { while (/[\t\n\r ]/.test(data[position] ?? '\0')) position += 1; };
  const failure = (message: string): never => { throw new Error(`SVG path at character ${String(position)}: ${message}`); };
  const number = (comma: boolean, flag: boolean): number => {
    whitespace();
    if (data[position] === ',') { if (!comma) failure('unexpected comma'); position += 1; whitespace(); }
    if (flag) {
      const value = data[position];
      if (value !== '0' && value !== '1') return failure('arc flags must be 0 or 1');
      position += 1; return Number(value);
    }
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(data.slice(position));
    if (!match) return failure('expected a number');
    const value = Number(match[0]);
    if (!Number.isFinite(value)) return failure('coordinates must be finite');
    position += match[0].length; return value;
  };
  whitespace();
  while (position < data.length) {
    if (result.length >= 100_000) failure('too many commands');
    let command: string;
    const explicit = /[a-zA-Z]/.test(data[position]!);
    if (explicit) { command = data[position++]!; if (!Object.hasOwn(arity, command.toUpperCase())) failure(`unknown command ${command}`); }
    else { command = previous; if (!command || command.toUpperCase() === 'Z') failure('expected a command'); }
    const upper = command.toUpperCase() as SvgPathLetter;
    if (!result.length && upper !== 'M') failure('path must begin with moveto');
    const values: number[] = [];
    for (let index = 0; index < arity[upper]; index += 1) values.push(number(!explicit || index > 0, upper === 'A' && (index === 3 || index === 4)));
    result.push({ command: command as SvgPathCommand['command'], values });
    previous = upper === 'M' ? command === 'm' ? 'l' : 'L' : command;
    whitespace();
  }
  return result;
}

/** Absolute M/L/C/Q/A/Z commands, preserving curves, closure and disjoint subpaths. */
export function absoluteSvgPath(data: string | SvgPathCommand[]): SvgPathCommand[] {
  const commands = typeof data === 'string' ? parseSvgPath(data) : parseSvgPath(serializeSvgPath(data));
  const result: SvgPathCommand[] = [];
  let x = 0, y = 0, startX = 0, startY = 0;
  let cubic: [number, number] | undefined, quadratic: [number, number] | undefined;
  for (const { command, values } of commands) {
    const upper = command.toUpperCase() as SvgPathLetter;
    const relative = command !== upper;
    const px = (index: number): number => values[index]! + (relative ? x : 0);
    const py = (index: number): number => values[index]! + (relative ? y : 0);
    let next: SvgPathCommand;
    let nextCubic: [number, number] | undefined, nextQuadratic: [number, number] | undefined;
    if (upper === 'Z') { next = { command: 'Z', values: [] }; x = startX; y = startY; }
    else if (upper === 'H') { x = px(0); next = { command: 'L', values: [x, y] }; }
    else if (upper === 'V') { y = py(0); next = { command: 'L', values: [x, y] }; }
    else if (upper === 'M' || upper === 'L' || upper === 'T') {
      const endX = px(0), endY = py(1);
      if (upper === 'T') {
        nextQuadratic = quadratic ? [2 * x - quadratic[0], 2 * y - quadratic[1]] : [x, y];
        next = { command: 'Q', values: [...nextQuadratic, endX, endY] };
      } else next = { command: upper, values: [endX, endY] };
      x = endX; y = endY;
      if (upper === 'M') { startX = x; startY = y; }
    } else if (upper === 'C') {
      next = { command: 'C', values: [px(0), py(1), px(2), py(3), px(4), py(5)] };
      nextCubic = [next.values[2]!, next.values[3]!]; x = next.values[4]!; y = next.values[5]!;
    } else if (upper === 'S') {
      const reflected = cubic ? [2 * x - cubic[0], 2 * y - cubic[1]] : [x, y];
      next = { command: 'C', values: [...reflected, px(0), py(1), px(2), py(3)] };
      nextCubic = [next.values[2]!, next.values[3]!]; x = next.values[4]!; y = next.values[5]!;
    } else if (upper === 'Q') {
      next = { command: 'Q', values: [px(0), py(1), px(2), py(3)] };
      nextQuadratic = [next.values[0]!, next.values[1]!]; x = next.values[2]!; y = next.values[3]!;
    } else {
      next = { command: 'A', values: [Math.abs(values[0]!), Math.abs(values[1]!), values[2]!, values[3]!, values[4]!, px(5), py(6)] };
      x = next.values[5]!; y = next.values[6]!;
    }
    if (next.values.some((value) => !Number.isFinite(value))) throw new Error('SVG absolute coordinate overflow.');
    result.push(next); cubic = nextCubic; quadratic = nextQuadratic;
  }
  return result;
}

export function serializeSvgPath(commands: SvgPathCommand[]): string {
  return commands.map(({ command, values }) => {
    const upper = command.toUpperCase() as SvgPathLetter;
    if (command.length !== 1 || !Object.hasOwn(arity, upper) || values.length !== arity[upper] || values.some((value) => !Number.isFinite(value))) throw new Error('Invalid SVG path command.');
    if (upper === 'A' && ![values[3], values[4]].every((flag) => flag === 0 || flag === 1)) throw new Error('SVG arc flags must be 0 or 1.');
    return `${command}${values.map((value) => String(Object.is(value, -0) ? 0 : value)).join(' ')}`;
  }).join(' ');
}
