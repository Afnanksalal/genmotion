export type FrameRounding = 'none' | 'floor' | 'ceil' | 'nearest';

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}
function frameRate(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('FPS must be finite and positive');
  return fps;
}
export function framesToSeconds(frame: number, fps: number): number {
  return finite(finite(frame, 'Frame') / frameRate(fps), 'Time');
}
export function secondsToFrames(seconds: number, fps: number, rounding: FrameRounding = 'none'): number {
  const frame = finite(finite(seconds, 'Time') * frameRate(fps), 'Frame');
  if (rounding === 'floor') return Math.floor(frame);
  if (rounding === 'ceil') return Math.ceil(frame);
  if (rounding === 'nearest') return Math.round(frame);
  if (rounding !== 'none') throw new Error('Unknown frame rounding mode');
  return frame;
}
export function quantizeTime(seconds: number, fps: number, rounding: Exclude<FrameRounding, 'none'> = 'nearest'): number {
  return framesToSeconds(secondsToFrames(seconds, fps, rounding), fps);
}
export function progressAt(seconds: number, start: number, duration: number, clamp = true): number {
  if (finite(duration, 'Duration') <= 0) throw new Error('Duration must be positive');
  const progress = finite((finite(seconds, 'Time') - finite(start, 'Start')) / duration, 'Progress');
  return clamp ? Math.max(0, Math.min(1, progress)) : progress;
}

/** Seconds, frame literals, MM:SS, HH:MM:SS, or non-drop HH:MM:SS:FF. */
export function parseTimelineTime(input: string, fps: number): number {
  frameRate(fps); const value = input.trim();
  const literal = /^(\d+(?:\.\d+)?)([sf]?)$/.exec(value);
  if (literal) return finite(literal[2] === 'f' ? Number(literal[1]) / fps : Number(literal[1]), 'Time');
  if (value.includes(';')) throw new Error('Drop-frame timecode is not supported by this integer-FPS timeline');
  const parts = value.split(':');
  if (parts.length === 4) {
    if (!Number.isInteger(fps) || !parts.every((part) => /^\d+$/.test(part))) throw new Error('Frame timecode requires integer FPS and integer fields');
    const [hours, minutes, seconds, frames] = parts.map(Number);
    if (minutes! >= 60 || seconds! >= 60 || frames! >= fps) throw new Error('Timecode fields are outside their ranges');
    return finite(hours! * 3600 + minutes! * 60 + seconds! + frames! / fps, 'Time');
  }
  if ((parts.length === 2 || parts.length === 3) && parts.every((part, index) => (index === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) {
    const values = parts.map(Number), seconds = values.at(-1)!;
    if (seconds >= 60 || parts.length === 3 && values[1]! >= 60) throw new Error('Time fields are outside their ranges');
    return finite(parts.length === 2 ? values[0]! * 60 + seconds : values[0]! * 3600 + values[1]! * 60 + seconds, 'Time');
  }
  throw new Error('Use seconds, a frame literal such as 30f, or HH:MM:SS:FF timecode');
}
export function formatTimecode(frame: number, fps: number): string {
  frameRate(fps);
  if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(fps)) throw new Error('Non-drop timecode requires a nonnegative integer frame and integer FPS');
  const seconds = Math.floor(frame / fps), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return [String(hours).padStart(2, '0'), String(minutes).padStart(2, '0'), String(seconds % 60).padStart(2, '0'), String(frame % fps).padStart(Math.max(2, Math.ceil(Math.log10(fps))), '0')].join(':');
}
