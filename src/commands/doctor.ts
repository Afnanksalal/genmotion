import { createCanvas } from '@napi-rs/canvas';
import { runProcess } from '../engine/process.js';

export interface DoctorCheck { name: string; ok: boolean; detail: string }

export async function doctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({ name: 'Node.js', ok: major >= 22, detail: process.version });
  try {
    const result = await runProcess('ffmpeg', ['-version']);
    checks.push({ name: 'FFmpeg', ok: true, detail: result.stdout.split('\n')[0] ?? 'available' });
  } catch (error) { checks.push({ name: 'FFmpeg', ok: false, detail: error instanceof Error ? error.message : String(error) }); }
  try {
    const result = await runProcess('ffprobe', ['-version']);
    checks.push({ name: 'FFprobe', ok: true, detail: result.stdout.split('\n')[0] ?? 'available' });
  } catch (error) { checks.push({ name: 'FFprobe', ok: false, detail: error instanceof Error ? error.message : String(error) }); }
  try {
    const canvas = createCanvas(16, 16);
    canvas.getContext('2d').fillRect(0, 0, 16, 16);
    checks.push({ name: 'Skia renderer', ok: canvas.width === 16, detail: 'Native canvas initialized' });
  } catch (error) { checks.push({ name: 'Skia renderer', ok: false, detail: error instanceof Error ? error.message : String(error) }); }
  return checks;
}
