import type { ImageAnimation } from '../ir/image-animation.js';

export function imageSourceFrame(animation: ImageAnimation, time: number, override?: number): number {
  if (!Number.isFinite(time) || (override !== undefined && !Number.isFinite(override))) throw new Error('Image source time/frame must be finite');
  const count = animation.type === 'sequence' ? animation.frames.length : animation.count;
  if (override !== undefined) return Math.max(0, Math.min(count - 1, Math.floor(override)));
  const position = animation.startFrame + Math.max(0, time) * animation.fps * animation.rate;
  let frame = Math.floor(position);
  if (animation.loop === 'repeat') frame %= count;
  else if (animation.loop === 'ping-pong' && count > 1) { const cycle = (count - 1) * 2; frame %= cycle; if (frame >= count) frame = cycle - frame; }
  else frame = Math.min(count - 1, frame);
  return animation.reverse ? count - 1 - frame : frame;
}

export function spriteFrameRect(animation: Extract<ImageAnimation, { type: 'sprite' }>, frame: number, width: number, height: number) {
  const cellWidth = (width - animation.margin * 2 - (animation.columns - 1) * animation.gap) / animation.columns;
  const cellHeight = (height - animation.margin * 2 - (animation.rows - 1) * animation.gap) / animation.rows;
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight) || cellWidth <= 0 || cellHeight <= 0) throw new Error('Sprite grid must divide the source into positive integer pixel cells');
  if (!Number.isInteger(frame) || frame < 0 || frame >= animation.count) throw new Error('Sprite frame is outside the source grid');
  return { x: animation.margin + frame % animation.columns * (cellWidth + animation.gap), y: animation.margin + Math.floor(frame / animation.columns) * (cellHeight + animation.gap), width: cellWidth, height: cellHeight };
}
