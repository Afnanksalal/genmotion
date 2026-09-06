import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { projectSchema } from '../dist/ir/schema.js';

const root = resolve(import.meta.dirname, '..');
const ease = { type: 'cubic-bezier', x1: .22, y1: 1, x2: .36, y2: 1 };
const keys = points => ({ keyframes: points.map(([at, value]) => ({ at, value, ease })) });
const track = (id, target, points) => ({ id, target, ...keys(points) });
const text = (id, copy, x, y, width, height, size, color, extra = {}) => ({ id, type: 'text', text: copy, x, y, width, height, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: size, fontWeight: 700, color, fit: 'shrink', verticalAlign: 'middle', ...(size >= 100 ? { horizontalMetrics: 'ink', verticalMetrics: 'cap-height', letterSpacing: -2 } : {}), ...extra });
const shape = (id, kind, x, y, width, height, fill, extra = {}) => ({ id, type: 'shape', shape: kind, x, y, width, height, fill, ...extra });
// Explicit, increasing timestamps keep every entrance seek-safe.
const entrance = (id, at) => [track(id + '-opacity', 'transform.opacity', [[0, 0], [at, 0], [at + .65, 1]]), track(id + '-y', 'transform.y', [[0, 35], [at, 35], [at + .8, 0]])];
const footer = (color, number, title) => [text('edition', 'GENMOTION  /  MOTION STUDIES', 100, 950, 900, 48, 22, color, { letterSpacing: 3 }), text('folio', `${number}   /   ${title}`, 1170, 950, 650, 48, 22, color, { align: 'right', letterSpacing: 2 })];
function project(id, title, duration, background, accent, layers, extra = {}) {
  return projectSchema.parse({ schemaVersion: 1, id, title, width: 1920, height: 1080, fps: 30, seed: 31,
    brand: { background, foreground: '#f5f0e8', accent, muted: '#999999', fonts: [{ family: 'Inter', file: 'assets/Inter.ttf' }] },
    scenes: [{ id: 'study', purpose: title, duration, background, layers: layers.map((layer, z) => ({ ...layer, z })) }],
    metadata: { publicExample: 'true', duration: String(duration), provenance: 'Original native vector artwork and authored motion. No external media.' }, ...extra });
}

const orbitLayers = [
  text('eyebrow', 'FORM / LIGHT / COLOR', 100, 100, 850, 55, 28, '#b9b1d4', { letterSpacing: 5 }),
  text('title-a', 'CHROMATIC', 95, 285, 970, 150, 130, '#f6f1ff', { tracks: entrance('title-a', .15) }),
  text('title-b', 'ORBIT', 90, 420, 840, 190, 190, '#d9f867', { tracks: entrance('title-b', .35) }),
  text('description', 'A study in layered light.\nOne form. Twelve trajectories.', 100, 670, 660, 115, 36, '#b9b1d4', { tracks: entrance('description', 1.1), lineHeight: 1.3 }),
];
for (let i = 0; i < 12; i++) {
  const diameter = 710 - i * 43, x = 1125 - diameter / 2, y = 520 - diameter / 2;
  orbitLayers.push(shape(`orbit-${i}`, 'ring', x + 250, y, diameter, diameter, '#f584bc', {
    innerRadius: .88,
    gradientFill: { type: 'linear', angle: i * 27, stops: [{ offset: 0, color: '#e9fb84' }, { offset: .46, color: '#fd74ac' }, { offset: 1, color: '#7975ed' }] },
    transform: { scaleY: .66, rotation: -32 },
    tracks: [track(`orbit-${i}-rotation`, 'transform.rotation', [[0, -90 - i * 9], [2.8 + i * .1, -32 + i * 5], [6, -15 + i * 5], [8, -15 + i * 5]]), track(`orbit-${i}-scale`, 'transform.scaleX', [[0, .15], [1.8 + i * .09, 1], [8, 1]])],
  }));
}
orbitLayers.push(...footer('#b9b1d4', '01', 'CHROMATIC ORBIT'));
const orbit = project('chromatic-orbit', 'Chromatic Orbit', 8, '#141020', '#d9f867', orbitLayers);

const paper = '#f3efe3', ink = '#202c2b', green = '#157e69', orange = '#ed653b';
const routeLayers = [text('eyebrow', 'AN IMAGINARY CITY, CONNECTED.', 100, 80, 1500, 58, 27, green, { letterSpacing: 3 }),
  text('headline', 'Every route finds a rhythm.', 95, 155, 1750, 150, 104, ink, { tracks: entrance('headline', .15) }),
  shape('river-key', 'ellipse', 105, 358, 18, 18, green), text('river-legend', 'RIVER LINE', 142, 340, 260, 58, 26, ink), shape('pier-key', 'ellipse', 445, 358, 18, 18, orange), text('pier-legend', 'PIER LINE', 482, 340, 300, 58, 26, ink),
];
const anchors = [{ id: 'west', x: 180, y: 690 }, { id: 'junction', x: 980, y: 550 }, { id: 'east', x: 1720, y: 450 }, { id: 'south', x: 1360, y: 800 }];
routeLayers.push(shape('river', 'bezier', 180, 690, 800, 140, undefined, { startAnchor: 'west', endAnchor: 'junction', control1: [630, 690], control2: [540, 550], stroke: green, strokeWidth: 20, tracks: [track('river-visible', 'transform.opacity', [[0, 0], [.65, 0], [.75, 1]])], progress: keys([[0, 0], [.65, 0], [2.7, 1]]) }),
  shape('east-line', 'bezier', 980, 550, 740, 100, undefined, { startAnchor: 'junction', endAnchor: 'east', control1: [1400, 550], control2: [1340, 450], stroke: green, strokeWidth: 20, tracks: [track('east-visible', 'transform.opacity', [[0, 0], [2.6, 0], [2.7, 1]])], progress: keys([[0, 0], [2.6, 0], [4.3, 1]]) }),
  shape('south-line', 'bezier', 980, 550, 380, 250, undefined, { startAnchor: 'junction', endAnchor: 'south', control1: [1220, 550], control2: [1100, 800], stroke: orange, strokeWidth: 20, tracks: [track('south-visible', 'transform.opacity', [[0, 0], [2.8, 0], [2.9, 1]])], progress: keys([[0, 0], [2.8, 0], [4.8, 1]]) }));
for (const [i, [name, anchor, at, labelY]] of [['WEST BANK', anchors[0], .65, 752], ['CENTRAL', anchors[1], 2.65, 430], ['EAST GARDEN', anchors[2], 4.1, 510], ['SOUTH PIER', anchors[3], 4.6, 840]].entries()) {
  routeLayers.push(shape(`station-${i}`, 'ellipse', anchor.x - 19, anchor.y - 19, 38, 38, paper, { centerAnchor: anchor.id, stroke: ink, strokeWidth: 8, tracks: entrance(`station-${i}`, at) }),
    text(`station-label-${i}`, name, anchor.x - (i === 0 ? 80 : i === 2 ? 100 : 160), labelY, i === 0 ? 160 : i === 2 ? 200 : 320, 50, 25, ink, { align: 'center', letterSpacing: 1, tracks: entrance(`station-label-${i}`, at + .1) }));
}
routeLayers.push(...footer(ink, '02', 'ROUTE STUDY'));
const route = project('route-study', 'Route Study', 8, paper, green, routeLayers, { anchors });

const beats = [
  text('eyebrow', 'A SMALL STUDY IN TIMING', 100, 95, 1550, 60, 28, '#171818', { letterSpacing: 4 }),
  text('word-one', 'MAKE', 88, 250, 1000, 190, 205, '#171818', { tracks: entrance('word-one', .1) }),
  text('word-two', 'IT', 88, 435, 520, 190, 205, '#171818', { tracks: entrance('word-two', .6) }),
  text('word-three', 'MOVE.', 88, 620, 1100, 190, 205, '#171818', { tracks: entrance('word-three', 1.1) }),
];
for (let i = 0; i < 5; i++) {
  const points = [[0, .2]];
  for (let beat = 0; beat < 12; beat++) { const at = .18 + beat * .5; points.push([at, .2], [at + .08, .35 + ((beat + i * 3) % 5) * .16], [at + .3, .2]); }
  beats.push(shape(`meter-${i}`, 'round-rect', 1280 + i * 92, 305, 58, 475, '#f9f0dc', { radius: 29, tracks: [track(`meter-${i}-pulse`, 'transform.scaleY', points)] }));
}
const cueText = 'Build. Breathe. Resolve.';
beats.push({ id: 'caption', type: 'caption', x: 1070, y: 800, width: 750, height: 92, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: 38, color: '#592c21', highlightColor: '#fff8e8', highlightMode: 'karaoke', showSpeaker: false, padding: 10,
  cues: [{ id: 'mantra', start: 1.65, end: 8, text: cueText, words: [{ text: 'Build.', start: 1.65, end: 2.5 }, { text: 'Breathe.', start: 2.5, end: 4 }, { text: 'Resolve.', start: 4, end: 5.5 }] }] });
beats.push(...footer('#171818', '03', 'TYPE / BEAT'));
const typeBeat = project('type-beat', 'Type / Beat', 8, '#ef653d', '#fff8e8', beats, { audio: [{ id: 'original-pulse', src: 'assets/original-pulse.wav', kind: 'music', volume: .8, fadeIn: .06, fadeOut: .8 }] });

function writePulse(file) {
  const rate = 48000, seconds = 8, frames = rate * seconds, wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  for (let n = 0; n < frames; n++) {
    const t = n / rate; let v = 0;
    for (let b = 0; b < 12; b++) { const d = t - (.18 + b * .5); if (d >= 0 && d < .4) v += .36 * Math.sin(2 * Math.PI * (58 * d + 2.8 * (1 - Math.exp(-d * 30)))) * Math.exp(-d * 17) + .1 * Math.sin(2 * Math.PI * [220, 277.18, 329.63, 440][b % 4] * d) * Math.exp(-d * 13) * Math.min(1, d * 500); }
    const sample = Math.round(Math.max(-.9, Math.min(.9, v)) * 32767); wav.writeInt16LE(sample, 44 + n * 4); wav.writeInt16LE(sample, 46 + n * 4);
  }
  writeFileSync(file, wav);
}
for (const p of [orbit, route, typeBeat]) {
  const dir = join(root, 'examples', p.id); mkdirSync(join(dir, 'assets'), { recursive: true }); mkdirSync(join(dir, '.genmotion'), { recursive: true });
  for (const name of ['Inter.ttf', 'OFL.txt']) copyFileSync(join(root, 'examples/_shared/fonts', name), join(dir, 'assets', name));
  writeFileSync(join(dir, 'genmotion.json'), JSON.stringify(p, null, 2) + '\n');
  writeFileSync(join(dir, 'brief.json'), JSON.stringify({ title: p.title, audience: 'Motion designers exploring native authoring', promise: 'Editable geometry, deliberate timing and inspectable native output.', proof: 'This local Creative IR and its rendered master.', desiredAction: 'Open, inspect and remix the project.', duration: 8, sources: ['Original authored vector artwork; bundled Inter font under OFL.'], audio: p.id === 'type-beat' ? 'Original synthesized percussion and tones; no narration. Visual bars use the same authored beat schedule, not live audio analysis.' : 'Intentionally silent.' }, null, 2) + '\n');
  writeFileSync(join(dir, '.genmotion/concepts.json'), JSON.stringify({ selected: p.id, borrow: p.id === 'route-study' ? ['transit-map clarity', 'editorial whitespace'] : ['large editorial type', 'controlled geometric repetition'], avoid: ['interface imitation', 'template card grids', 'unmotivated particles'], transform: ['original geometry', 'one dominant motion followed by a readable hold'] }, null, 2) + '\n');
  if (p.id === 'type-beat') writePulse(join(dir, 'assets/original-pulse.wav'));
}
console.log('Built Chromatic Orbit, Route Study and Type / Beat.');
