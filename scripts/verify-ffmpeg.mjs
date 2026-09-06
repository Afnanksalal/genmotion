import { execFileSync } from 'node:child_process';

function inspect(args) {
  return execFileSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
}
const filters = inspect(['-filters']);
if (!/^\s*\S+\s+zscale\s/m.test(filters)) throw new Error('FFmpeg lacks zscale. Install a build with libzimg; on macOS use ffmpeg-full and put its bin directory first on PATH.');
if (!/^\s+latency\s/m.test(inspect(['-h', 'filter=alimiter']))) throw new Error('FFmpeg lacks alimiter latency compensation. Upgrade to a full FFmpeg 6.1+ build; FFmpeg 4.4 is unsupported.');
console.log(inspect(['-version']).split('\n')[0]);
console.log('Required zscale and limiter latency capabilities are available.');
