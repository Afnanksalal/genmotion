import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSchema } from '../dist/ir/schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedFont = join(root, 'examples', '_shared', 'fonts', 'Inter.ttf');
const sharedLicense = join(root, 'examples', '_shared', 'fonts', 'OFL.txt');
const ease = { type: 'cubic-bezier', x1: 0.22, y1: 1, x2: 0.36, y2: 1 };
const spring = { type: 'spring', mass: 1, stiffness: 150, damping: 22, velocity: 0 };
const cut = { type: 'cut', duration: 0, ease: 'linear' };
const dissolve = { type: 'crossfade', duration: 0.35, ease: 'sine-in-out' };

function track(id, target, points, operation = 'replace', extrapolate = 'clamp') {
  return { id, target, keyframes: points.map(([at, value, pointEase = ease]) => ({ at, value, ease: pointEase })), operation, extrapolate, enabled: true };
}

function base(id, duration, z = 0, options = {}) {
  return {
    id, start: options.start ?? 0, duration, z, visible: true,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, anchorX: 0.5, anchorY: 0.5, ...(options.transform ?? {}) },
    blendMode: options.blendMode ?? 'source-over', tags: options.tags ?? [], motion: options.motion ?? [], tracks: options.tracks ?? [],
    ...(options.clip ? { clip: options.clip } : {}),
  };
}

function shape(id, duration, z, geometry, options = {}) {
  return { ...base(id, duration, z, options), type: 'shape', strokeWidth: 0, radius: 0, progress: 1, ...geometry, ...(options.shadow ? { shadow: options.shadow } : {}) };
}

function text(id, duration, z, copy, box, options = {}) {
  return {
    ...base(id, duration, z, options), type: 'text', text: copy, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf',
    fontSize: options.fontSize ?? 96, fontWeight: options.fontWeight ?? 700, fontStyle: 'normal', color: options.color ?? '#f7f5ef',
    align: options.align ?? 'left', verticalAlign: options.verticalAlign ?? 'middle', lineHeight: options.lineHeight ?? 1,
    letterSpacing: options.letterSpacing ?? -2, fit: 'shrink', reveal: options.reveal ?? 'none', revealProgress: 1, countProgress: 1,
    ...(options.countFrom !== undefined ? { countFrom: options.countFrom } : {}),
    ...(options.numberFormat ? { numberFormat: options.numberFormat } : {}),
    ...box,
  };
}

function scene(id, purpose, duration, background, layers, transitionIn = cut, transitionOut = cut, notes = []) {
  return {
    id, purpose, duration, background, layers, transitionIn, transitionOut,
    referenceDecisions: [
      { referenceId: 'editorial-monument', borrow: ['decisive typographic hierarchy', 'one dominant move per beat'], avoid: ['serif imitation', 'constant ornamental motion'], transform: ['use sparse geometry and generous holds'] },
      { referenceId: 'product-theater', borrow: ['controlled detail-led pacing', 'focused camera hierarchy'], avoid: ['interface reconstruction', 'brand imitation'], transform: ['express material and depth with native vector geometry'] },
    ],
    notes,
  };
}

function project(id, title, background, foreground, accent, scenes, metadata = {}, audio = []) {
  return projectSchema.parse({
    schemaVersion: 1, id, title, width: 1920, height: 1080, fps: 30, seed: 17,
    brand: { background, foreground, accent, muted: '#8f93a2', fonts: [{ family: 'Inter', file: 'assets/Inter.ttf' }], radius: 28, tone: ['precise', 'editorial', 'controlled'] },
    scenes, audio,
    metadata: { publicExample: 'true', selectedConcept: `${id}-direction-a`, ...metadata },
  });
}

const kinetic = project('kinetic-type', 'Kinetic Type', '#09090b', '#f5f3ea', '#ff5c35', [
  scene('make-space', 'Establish typography as the primary physical object.', 4, '#09090b', [
    shape('orange-rail', 4, 0, { shape: 'round-rect', x: 122, y: 154, width: 18, height: 772, fill: '#ff5c35', radius: 9 }, { tracks: [track('rail-draw', 'height', [[0, 1], [0.8, 772], [4, 772]])] }),
    text('move', 4, 2, 'MOVE', { x: 190, y: 190, width: 1530, height: 480 }, { fontSize: 330, fontWeight: 850, letterSpacing: -16, clip: { x: 170, y: 190, width: 1580, height: 490, radius: 0 }, tracks: [track('move-rise', 'transform.y', [[0, 350], [1.05, 0, spring], [4, 0]]), track('move-open', 'letterSpacing', [[0, -48], [1.3, -16], [4, -16]])] }),
    text('sub', 3.2, 3, 'Motion starts with hierarchy.', { x: 205, y: 730, width: 1120, height: 120 }, { start: 0.8, fontSize: 54, fontWeight: 450, letterSpacing: 0, color: '#b3b1aa', tracks: [track('sub-in', 'transform.opacity', [[0, 0], [0.5, 1], [3.2, 1]])] }),
  ], cut, dissolve, ['The headline settles by 1.3 seconds and holds for comprehension.']),
  scene('build-rhythm', 'Turn type into a paced sequence rather than a static title.', 4, '#ff5c35', [
    shape('black-band', 4, 0, { shape: 'rect', x: 0, y: 760, width: 1920, height: 320, fill: '#f5f3ea' }),
    text('type', 4, 2, 'TYPE', { x: 130, y: 100, width: 1600, height: 250 }, { fontSize: 190, color: '#09090b', letterSpacing: -8, tracks: [track('type-slide', 'transform.x', [[0, -260], [0.75, 0], [4, 0]])] }),
    text('becomes', 3.35, 2, 'BECOMES', { x: 130, y: 365, width: 1600, height: 250 }, { start: 0.65, fontSize: 190, color: '#09090b', letterSpacing: -8, tracks: [track('becomes-slide', 'transform.x', [[0, 280], [0.75, 0], [3.35, 0]])] }),
    text('rhythm', 2.65, 2, 'RHYTHM', { x: 130, y: 770, width: 1600, height: 220 }, { start: 1.35, fontSize: 190, color: '#09090b', letterSpacing: -8, tracks: [track('rhythm-rise', 'transform.y', [[0, 190], [0.7, 0], [2.65, 0]])] }),
  ], dissolve, dissolve),
  scene('resolve', 'Resolve on a concise statement with a stable final hold.', 4, '#f5f3ea', [
    shape('period', 4, 0, { shape: 'ellipse', x: 1545, y: 682, width: 118, height: 118, fill: '#ff5c35' }, { tracks: [track('period-scale', 'transform.scaleX', [[0, 0.01], [0.65, 1, spring], [4, 1]]), track('period-scale-y', 'transform.scaleY', [[0, 0.01], [0.65, 1, spring], [4, 1]])] }),
    text('make-time', 4, 2, 'MAKE TIME\nVISIBLE', { x: 210, y: 235, width: 1420, height: 590 }, { fontSize: 230, color: '#09090b', lineHeight: 0.88, letterSpacing: -11, tracks: [track('resolve-in', 'transform.opacity', [[0, 0], [0.65, 1], [4, 1]]), track('resolve-track', 'letterSpacing', [[0, -30], [0.9, -11], [4, -11]])] }),
    text('signature', 3.1, 3, 'GENMOTION / PUBLIC EXAMPLE 01', { x: 220, y: 900, width: 1000, height: 55 }, { start: 0.9, fontSize: 28, fontWeight: 550, color: '#4b4b4f', letterSpacing: 3, tracks: [track('signature-in', 'transform.opacity', [[0, 0], [0.4, 1], [3.1, 1]])] }),
  ], dissolve, cut, ['The final layout is fully settled for more than two seconds.']),
], { family: 'kinetic-typography', duration: '12' });

const dataPulse = project('data-pulse', 'Data Pulse', '#0c1020', '#f6f7fb', '#72f1b8', [
  scene('signal', 'Introduce one measurable signal with no dashboard clutter.', 4.5, '#0c1020', [
    shape('grid-a', 4.5, 0, { shape: 'line', x: 126, y: 768, width: 1668, height: 0, stroke: '#27304c', strokeWidth: 2 }, { tracks: [track('grid-a-draw', 'progress', [[0, 0], [0.8, 1], [4.5, 1]])] }),
    text('eyebrow', 4.5, 2, 'LIVE THROUGHPUT', { x: 132, y: 145, width: 900, height: 76 }, { fontSize: 34, fontWeight: 600, color: '#72f1b8', letterSpacing: 5 }),
    text('metric', 4.5, 3, '2.4', { x: 120, y: 240, width: 1120, height: 480 }, { fontSize: 360, letterSpacing: -18, tracks: [track('metric-count', 'countProgress', [[0, 0], [1.45, 1], [4.5, 1]]), track('metric-rise', 'transform.y', [[0, 90], [0.9, 0], [4.5, 0]])], countFrom: 0, numberFormat: { decimals: 1, prefix: '', suffix: 'M', grouping: true } }),
    text('per-minute', 3.4, 3, 'events / minute', { x: 1240, y: 500, width: 500, height: 110 }, { start: 1.1, fontSize: 48, fontWeight: 450, color: '#a9b0c4', letterSpacing: 0, tracks: [track('unit-in', 'transform.opacity', [[0, 0], [0.45, 1], [3.4, 1]])] }),
  ], cut, dissolve),
  scene('shape', 'Build a traceable chart from the signal.', 5, '#10162a', [
    ...Array.from({ length: 9 }, (_, index) => shape(`bar-${index + 1}`, 5 - index * 0.08, 1 + index, { shape: 'round-rect', x: 170 + index * 174, y: 850 - [170, 260, 220, 390, 470, 430, 620, 700, 760][index], width: 86, height: [170, 260, 220, 390, 470, 430, 620, 700, 760][index], fill: index > 6 ? '#72f1b8' : '#425071', radius: 43 }, { start: index * 0.08, tracks: [track(`bar-${index + 1}-grow`, 'transform.scaleY', [[0, 0.01], [0.65, 1], [5 - index * 0.08, 1]])], transform: { anchorY: 1 } })),
    shape('trend-line', 5, 3, { shape: 'path', path: 'M 0 92 C 120 82 180 75 260 70 S 420 44 520 62 S 700 22 860 30 S 1040 8 1200 0', x: 210, y: 170, width: 1460, height: 560, stroke: '#f6f7fb', strokeWidth: 8 }, { tracks: [track('trend-draw', 'progress', [[0.6, 0], [2.2, 1], [5, 1]])], shadow: { color: '#72f1b855', blur: 20, offsetX: 0, offsetY: 0 } }),
    text('chart-title', 5, 4, 'Momentum, not noise.', { x: 130, y: 70, width: 1100, height: 110 }, { fontSize: 66, letterSpacing: -2 }),
  ], dissolve, dissolve),
  scene('decision', 'Convert the visualized trend into one decision.', 4.5, '#72f1b8', [
    text('decision-copy', 4.5, 2, 'THE SIGNAL\nIS COMPOUNDING.', { x: 150, y: 170, width: 1600, height: 590 }, { fontSize: 220, color: '#0c1020', lineHeight: 0.9, letterSpacing: -10, tracks: [track('decision-open', 'letterSpacing', [[0, -32], [0.9, -10], [4.5, -10]]), track('decision-in', 'transform.opacity', [[0, 0], [0.55, 1], [4.5, 1]])] }),
    shape('decision-rule', 4.5, 1, { shape: 'line', x: 155, y: 835, width: 1480, height: 0, stroke: '#0c1020', strokeWidth: 5 }, { tracks: [track('decision-rule-draw', 'progress', [[0.5, 0], [1.35, 1], [4.5, 1]])] }),
    text('decision-foot', 3.2, 3, 'ONE METRIC. ONE STORY. ONE DECISION.', { x: 160, y: 890, width: 1400, height: 60 }, { start: 1.3, fontSize: 30, fontWeight: 650, color: '#0c1020', letterSpacing: 4 }),
  ], dissolve, cut),
], { family: 'data-story', duration: '14' });

const arcOne = project('arc-one', 'Arc One', '#07090d', '#f4f6f8', '#5fa8ff', [
  scene('promise', 'Open with a restrained product promise.', 3.5, '#07090d', [
    shape('halo', 3.5, 0, { shape: 'ellipse', x: 620, y: 230, width: 680, height: 680, fill: '#102746', stroke: '#5fa8ff55', strokeWidth: 3 }, { blendMode: 'screen', tracks: [track('halo-breathe', 'transform.scaleX', [[0, 0.72], [1.5, 1], [3.5, 1]]), track('halo-breathe-y', 'transform.scaleY', [[0, 0.72], [1.5, 1], [3.5, 1]])] }),
    text('promise-copy', 3.5, 2, 'Sound, shaped.', { x: 300, y: 430, width: 1320, height: 220 }, { fontSize: 142, align: 'center', letterSpacing: -6, clip: { x: 280, y: 430, width: 1360, height: 230, radius: 0 }, tracks: [track('promise-rise', 'transform.y', [[0, 160], [0.95, 0], [3.5, 0]])] }),
  ], cut, dissolve),
  scene('object', 'Reveal an original vector speaker silhouette and material system.', 4.2, '#090c12', [
    shape('speaker-shadow', 4.2, 0, { shape: 'ellipse', x: 560, y: 842, width: 800, height: 90, fill: '#00000099' }, { tracks: [track('shadow-in', 'transform.opacity', [[0, 0], [0.9, 1], [4.2, 1]])] }),
    shape('speaker-body', 4.2, 2, { shape: 'round-rect', x: 670, y: 140, width: 580, height: 720, fill: '#b7bcc5', stroke: '#f8fafc', strokeWidth: 3, radius: 86, shadow: { color: '#000000aa', blur: 70, offsetX: 0, offsetY: 30 } }, { tracks: [track('body-scale', 'transform.scaleX', [[0, 0.78], [1.1, 1, spring], [4.2, 1]]), track('body-scale-y', 'transform.scaleY', [[0, 0.78], [1.1, 1, spring], [4.2, 1]]), track('body-tilt', 'transform.rotation', [[0, -8], [1.2, 0], [4.2, 0]])] }),
    shape('speaker-grille', 4.2, 3, { shape: 'path', path: 'M 30 0 L 550 0 Q 580 0 580 30 L 580 520 Q 580 550 550 550 L 30 550 Q 0 550 0 520 L 0 30 Q 0 0 30 0 M 84 88 L 496 88 M 84 156 L 496 156 M 84 224 L 496 224 M 84 292 L 496 292 M 84 360 L 496 360 M 84 428 L 496 428', x: 670, y: 190, width: 580, height: 550, fill: '#151a23', stroke: '#697385', strokeWidth: 4 }, { tracks: [track('grille-draw', 'progress', [[0.45, 0], [1.65, 1], [4.2, 1]])] }),
    text('product-name', 3.1, 4, 'ARC ONE', { x: 120, y: 830, width: 450, height: 70 }, { start: 1.1, fontSize: 40, fontWeight: 650, letterSpacing: 6, color: '#5fa8ff', tracks: [track('name-in', 'transform.opacity', [[0, 0], [0.5, 1], [3.1, 1]])] }),
  ], dissolve, dissolve),
  scene('details', 'Show three product attributes with a controlled macro push.', 4.3, '#dfe3e8', [
    shape('detail-body', 4.3, 0, { shape: 'round-rect', x: 930, y: -180, width: 950, height: 1320, fill: '#9ea6b2', stroke: '#ffffff', strokeWidth: 4, radius: 130, shadow: { color: '#52607066', blur: 80, offsetX: -20, offsetY: 30 } }, { tracks: [track('macro-push', 'transform.scaleX', [[0, 0.94], [1.25, 1.08], [4.3, 1.08]]), track('macro-push-y', 'transform.scaleY', [[0, 0.94], [1.25, 1.08], [4.3, 1.08]])] }),
    text('detail-one', 4.3, 2, 'SEAMLESS\nALUMINUM', { x: 120, y: 145, width: 750, height: 250 }, { fontSize: 92, color: '#111720', lineHeight: 0.92, letterSpacing: -3, tracks: [track('detail-one-in', 'transform.opacity', [[0, 0], [0.5, 1], [4.3, 1]])] }),
    text('detail-two', 3.55, 2, 'SPATIAL AUDIO', { x: 120, y: 500, width: 760, height: 95 }, { start: 0.75, fontSize: 54, color: '#35506f', letterSpacing: 2, tracks: [track('detail-two-in', 'transform.x', [[0, -80], [0.55, 0], [3.55, 0]])] }),
    text('detail-three', 2.75, 2, '30-HOUR BATTERY', { x: 120, y: 630, width: 760, height: 95 }, { start: 1.55, fontSize: 54, color: '#35506f', letterSpacing: 2, tracks: [track('detail-three-in', 'transform.x', [[0, -80], [0.55, 0], [2.75, 0]])] }),
  ], dissolve, dissolve),
  scene('lockup', 'End with a completely stable product lockup.', 3, '#07090d', [
    shape('lockup-mark', 3, 0, { shape: 'path', path: 'M 50 0 L 100 86 L 50 172 L 0 86 Z', x: 885, y: 230, width: 150, height: 172, fill: '#5fa8ff' }, { tracks: [track('mark-in', 'transform.scaleX', [[0, 0.01], [0.55, 1, spring], [3, 1]]), track('mark-in-y', 'transform.scaleY', [[0, 0.01], [0.55, 1, spring], [3, 1]])] }),
    text('arc-lockup', 3, 2, 'Arc One', { x: 360, y: 450, width: 1200, height: 220 }, { fontSize: 160, align: 'center', letterSpacing: -6, tracks: [track('lockup-in', 'transform.opacity', [[0, 0], [0.45, 1], [3, 1]])] }),
    text('arc-tagline', 2.45, 2, 'Hear the space between.', { x: 520, y: 680, width: 880, height: 80 }, { start: 0.55, fontSize: 44, fontWeight: 450, align: 'center', letterSpacing: 0, color: '#9ea9b9', tracks: [track('tagline-in', 'transform.opacity', [[0, 0], [0.35, 1], [2.45, 1]])] }),
  ], dissolve, cut, ['All animation finishes by 0.9 seconds, leaving a stable 2.1-second hold.']),
], { family: 'product-launch', duration: '15', soundtrack: 'deterministic-original' }, [
  { id: 'original-bed', src: 'assets/original-bed.wav', start: 0, trimStart: 0, duration: 15, volume: 0.42, pan: 0, fadeIn: 0.35, fadeOut: 0.8, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'music' },
]);

function writeWav(path, seconds = 15, sampleRate = 48_000) {
  const frames = seconds * sampleRate;
  const data = Buffer.alloc(frames * 4);
  const chord = [110, 138.59, 164.81, 220];
  for (let index = 0; index < frames; index += 1) {
    const t = index / sampleRate;
    const beat = t * 2;
    const step = Math.floor(beat) % 8;
    const bass = Math.sin(2 * Math.PI * chord[Math.floor(t / 3.75) % chord.length] * t) * 0.12;
    const pulsePhase = beat - Math.floor(beat);
    const kick = Math.sin(2 * Math.PI * (62 - pulsePhase * 24) * t) * Math.exp(-pulsePhase * 16) * (step % 2 === 0 ? 0.42 : 0);
    const hatPhase = (t * 8) % 1;
    const noise = (((index * 16807) % 2147483647) / 1073741823.5 - 1) * Math.exp(-hatPhase * 30) * 0.045;
    const envelope = Math.min(1, t / 0.35, (seconds - t) / 0.8);
    const sample = Math.max(-1, Math.min(1, (bass + kick + noise) * envelope));
    const left = Math.round(sample * 32767);
    const right = Math.round((sample * 0.92 + Math.sin(2 * Math.PI * 277.18 * t) * 0.025) * envelope * 32767);
    data.writeInt16LE(left, index * 4);
    data.writeInt16LE(right, index * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

const projects = [
  ['kinetic-type', kinetic],
  ['data-pulse', dataPulse],
  ['arc-one', arcOne],
];

for (const [directory, value] of projects) {
  const target = join(root, 'examples', directory);
  mkdirSync(join(target, 'assets'), { recursive: true });
  mkdirSync(join(target, '.genmotion'), { recursive: true });
  copyFileSync(sharedFont, join(target, 'assets', 'Inter.ttf'));
  copyFileSync(sharedLicense, join(target, 'assets', 'OFL.txt'));
  writeFileSync(join(target, 'genmotion.json'), `${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(join(target, 'brief.json'), `${JSON.stringify({ title: value.title, audience: 'Motion designers evaluating Genmotion', promise: value.scenes[0].purpose, proof: 'The checked-in Creative IR renders with the native Genmotion pipeline.', desiredAction: 'Inspect, remix, and render the source project.', mode: value.metadata.family, duration: Number(value.metadata.duration), sources: ['Creative IR and renderer output in this directory'] }, null, 2)}\n`);
  writeFileSync(join(target, '.genmotion', 'concepts.json'), `${JSON.stringify({ selected: value.metadata.selectedConcept, concepts: [{ id: value.metadata.selectedConcept, hierarchy: 'One dominant statement per scene', clarity: 'Every scene has one readable proof', originality: 'Native vectors and direct tracks, no borrowed template', brandFit: value.brand.tone, rhythm: 'Establish, travel, settle, hold', feasibility: 'Runs without remote assets' }] }, null, 2)}\n`);
}

writeWav(join(root, 'examples', 'arc-one', 'assets', 'original-bed.wav'));
console.log(`Built ${projects.length} reproducible public example projects.`);
