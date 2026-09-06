import { createHash } from 'node:crypto';
import { Path2D } from '@napi-rs/canvas';
import { pathEditStateSchema, pathNodeEditSchema, type PathEditState, type PathNodeEdit } from '../ir/path-nodes.js';
import { absoluteSvgPath, serializeSvgPath, type SvgPathCommand } from './svg-path.js';
import { GenmotionError } from '../errors.js';

type Point = [number, number];
export type PathNodeMode = 'corner' | 'smooth' | 'symmetric';
export interface EditablePathNode { point: Point; incoming: Point | null; outgoing: Point | null; mode: PathNodeMode }
export interface EditablePathContour { closed: boolean; nodes: EditablePathNode[] }
export const pathRevision = (data: string): string => createHash('sha256').update(data).digest('hex');
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const length = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function inspectPathNodes(data: string, state?: PathEditState): { revision: string; contours: EditablePathContour[] } {
  const revision = pathRevision(data);
  if (state && state.revision !== revision) throw new GenmotionError('PATH_NODE_STATE_STALE', 'Path geometry changed outside the node editor. Reset node modes before editing the new path.');
  let commands = absoluteSvgPath(data);
  if (commands.some(command => command.command === 'A')) commands = absoluteSvgPath(new Path2D(serializeSvgPath(commands)).toSVGString());
  const contours: EditablePathContour[] = []; let current: EditablePathContour | undefined;
  for (const command of commands) {
    const v = command.values;
    if (command.command === 'M') { current = { closed: false, nodes: [{ point: [v[0]!, v[1]!], incoming: null, outgoing: null, mode: 'corner' }] }; contours.push(current); continue; }
    if (!current) throw new GenmotionError('PATH_NODE_INVALID', 'Path must begin with a move command.');
    if (current.closed && command.command !== 'Z') throw new GenmotionError('PATH_NODE_UNSUPPORTED', 'Node editing requires a move command after a closed contour.');
    if (command.command === 'Z') {
      current.closed = true;
      const first = current.nodes[0]!, last = current.nodes.at(-1)!;
      if (current.nodes.length > 1 && length(first.point, last.point) < 1e-12) { first.incoming = last.incoming; current.nodes.pop(); }
      else if (current.nodes.length > 1) { last.outgoing = mix(last.point, first.point, 1 / 3); first.incoming = mix(last.point, first.point, 2 / 3); }
      continue;
    }
    const previous = current.nodes.at(-1)!, end: Point = [v.at(-2)!, v.at(-1)!];
    let outgoing: Point, incoming: Point;
    if (command.command === 'L') { outgoing = mix(previous.point, end, 1 / 3); incoming = mix(previous.point, end, 2 / 3); }
    else if (command.command === 'Q') { const control: Point = [v[0]!, v[1]!]; outgoing = mix(previous.point, control, 2 / 3); incoming = mix(end, control, 2 / 3); }
    else if (command.command === 'C') { outgoing = [v[0]!, v[1]!]; incoming = [v[2]!, v[3]!]; }
    else throw new GenmotionError('PATH_NODE_UNSUPPORTED', `Cannot expose ${command.command} as editable nodes.`);
    previous.outgoing = outgoing; current.nodes.push({ point: end, incoming, outgoing: null, mode: 'corner' });
  }
  const nodes = contours.flatMap(contour => contour.nodes);
  if (nodes.length > 4096) throw new GenmotionError('PATH_NODE_LIMIT', 'Interactive path editing supports at most 4096 nodes.');
  if (state && state.modes.length !== nodes.length) throw new GenmotionError('PATH_NODE_STATE_STALE', 'Stored node modes do not match the path topology.');
  if (state) nodes.forEach((node, index) => { node.mode = state.modes[index]!; });
  return { revision, contours };
}
export function serializePathNodes(contours: EditablePathContour[]): string {
  const commands: SvgPathCommand[] = [];
  for (const contour of contours) {
    const first = contour.nodes[0]; if (!first) throw new GenmotionError('PATH_NODE_EMPTY', 'A contour cannot be empty.');
    commands.push({ command: 'M', values: first.point });
    const segments = contour.closed ? contour.nodes.length : contour.nodes.length - 1;
    for (let index = 0; index < segments; index++) {
      const from = contour.nodes[index]!, to = contour.nodes[(index + 1) % contour.nodes.length]!;
      commands.push({ command: 'C', values: [...(from.outgoing ?? from.point), ...(to.incoming ?? to.point), ...to.point] });
    }
    if (contour.closed) commands.push({ command: 'Z', values: [] });
  }
  return serializeSvgPath(commands);
}
function alignHandle(node: EditablePathNode, side: 'incoming' | 'outgoing'): void {
  if (node.mode === 'corner') return;
  const other = side === 'incoming' ? 'outgoing' : 'incoming', active = node[side];
  if (!active || !node[other]) return;
  const distance = length(node.point, active);
  if (!distance) { if (node.mode === 'symmetric') node[other] = [...node.point]; return; }
  const opposite = node.mode === 'symmetric' ? distance : length(node.point, node[other]);
  node[other] = [node.point[0] - (active[0] - node.point[0]) * opposite / distance, node.point[1] - (active[1] - node.point[1]) * opposite / distance];
}
export function editPathNodes(data: string, expectedRevision: string, input: PathNodeEdit[], state?: PathEditState): { path: string; state: PathEditState; contours: EditablePathContour[] } {
  const inspected = inspectPathNodes(data, state);
  if (inspected.revision !== expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'The path changed after its nodes were inspected.');
  const contours = structuredClone(inspected.contours);
  for (const edit of pathNodeEditSchema.array().min(1).max(500).parse(input)) {
    const contour = contours[edit.contour], node = contour?.nodes[edit.node];
    if (!contour || !node) throw new GenmotionError('PATH_NODE_MISSING', 'Node address is outside this path revision.');
    if (edit.op === 'move-node') {
      const dx = edit.point[0] - node.point[0], dy = edit.point[1] - node.point[1];
      for (const side of ['incoming', 'outgoing'] as const) if (node[side]) node[side] = [node[side][0] + dx, node[side][1] + dy];
      node.point = edit.point;
    } else if (edit.op === 'move-handle') { if (!node[edit.side]) throw new GenmotionError('PATH_HANDLE_MISSING', 'An open endpoint has no handle on this side.'); node[edit.side] = edit.point; alignHandle(node, edit.side); }
    else if (edit.op === 'set-mode') { node.mode = edit.mode; alignHandle(node, node.outgoing ? 'outgoing' : 'incoming'); }
    else if (edit.op === 'remove-node') {
      if (contour.nodes.length <= 1) throw new GenmotionError('PATH_NODE_MINIMUM', 'A contour must retain a move point. Remove the layer to remove the entire path.');
      contour.nodes.splice(edit.node, 1);
      if (!contour.closed) { contour.nodes[0]!.incoming = null; contour.nodes.at(-1)!.outgoing = null; }
    } else {
      const next = contour.nodes[edit.node + 1] ?? (contour.closed ? contour.nodes[0] : undefined);
      if (!next) throw new GenmotionError('PATH_SEGMENT_MISSING', 'The last open node has no following segment.');
      const a = node.point, b = node.outgoing ?? a, d = next.point, c = next.incoming ?? d;
      const ab = mix(a, b, edit.at), bc = mix(b, c, edit.at), cd = mix(c, d, edit.at), abc = mix(ab, bc, edit.at), bcd = mix(bc, cd, edit.at);
      node.outgoing = ab; next.incoming = cd;
      if (node.mode === 'symmetric') node.mode = 'smooth';
      if (next.mode === 'symmetric') next.mode = 'smooth';
      contour.nodes.splice(edit.node + 1, 0, { point: mix(abc, bcd, edit.at), incoming: abc, outgoing: bcd, mode: 'smooth' });
    }
  }
  const path = serializePathNodes(contours), modes = contours.flatMap(contour => contour.nodes.map(node => node.mode));
  return { path, state: pathEditStateSchema.parse({ revision: pathRevision(path), modes }), contours };
}
