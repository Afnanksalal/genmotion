import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectSchema } from '../dist/ir/schema.js';

const root = resolve(import.meta.dirname, '..');
const fontSource = join(root, 'examples', '_shared', 'fonts');
const ease = { type: 'cubic-bezier', x1: .22, y1: 1, x2: .36, y2: 1 };
const animated = points => ({ keyframes: points.map(([at, value]) => ({ at, value, ease })) });
const track = (id, target, points) => ({ id, target, ...animated(points) });
const enter = (id, at = .1, distance = 48) => [track(`${id}-opacity`, 'transform.opacity', [[0, 0], [at, 0], [at + .5, 1]]), track(`${id}-y`, 'transform.y', [[0, distance], [at, distance], [at + .72, 0]])];
const text = (id, value, x, y, width, height, fontSize, color, extra = {}) => ({ id, type: 'text', text: value, x, y, width, height, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize, fontWeight: 700, color, fit: 'shrink', verticalAlign: 'middle', lineHeight: 1.02, ...(fontSize > 84 ? { horizontalMetrics: 'ink', verticalMetrics: 'cap-height', letterSpacing: -2 } : {}), ...extra });
const shape = (id, kind, x, y, width, height, fill, extra = {}) => ({ id, type: 'shape', shape: kind, x, y, width, height, fill, ...extra });
const scene = (id, purpose, duration, background, layers, extra = {}) => ({ id, purpose, duration, background, layers: layers.map((layer, z) => ({ ...layer, z })), ...extra });
const footer = (label, color) => text(`footer-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `GENMOTION  /  ${label}`, 96, 984, 1728, 34, 20, color, { letterSpacing: 3 });
const base = (id, title, duration, background, foreground, accent, scenes, extra = {}) => projectSchema.parse({ schemaVersion: 1, id, title, width: 1920, height: 1080, fps: 30, seed: 47, brand: { background, foreground, accent, muted: '#8a8a92', fonts: [{ family: 'Inter', file: 'assets/Inter.ttf' }], radius: 24, tone: ['editorial', 'precise', 'cinematic'] }, scenes, metadata: { publicExample: 'true', duration: String(duration), provenance: 'Original native vector artwork generated locally from this repository.' }, ...extra });

function kineticType() {
  const bg = '#f2ede3', ink = '#141312', red = '#e94032';
  return base('kinetic-type', 'Kinetic Type', 8, bg, ink, red, [scene('statement', 'Show typography behaving as composition and rhythm', 8, bg, [
    shape('rule', 'rect', 96, 90, 1728, 8, red, { tracks: [track('rule-width', 'transform.scaleX', [[0, .02], [.55, 1], [8, 1]])], transform: { anchorX: 0, anchorY: .5 } }),
    text('small', 'WORDS ARE PHYSICAL', 100, 120, 900, 60, 28, red, { letterSpacing: 5, tracks: enter('small', .25, 20) }),
    text('kinetic', 'KINETIC', 88, 230, 1600, 240, 222, ink, { tracks: [...enter('kinetic', .25, 90), track('kinetic-x', 'transform.x', [[0, -70], [1.05, 0], [2.5, 0], [3.15, 100], [4.45, 100], [5.15, 0], [8, 0]])] }),
    text('type', 'TYPE', 90, 455, 1080, 260, 250, red, { tracks: [...enter('type', .45, 120), track('type-scale', 'transform.scaleX', [[0, .4], [1.25, 1], [2.5, 1], [3.15, 1.1], [4.45, 1.1], [5.15, 1], [8, 1]])] }),
    text('phrase', 'Scale changes meaning.\nTiming changes the sentence.', 106, 785, 1060, 115, 38, ink, { fontWeight: 500, lineHeight: 1.25, tracks: enter('phrase', 1.05, 28) }), footer('KINETIC TYPE / 01', ink),
  ])], { audio: [{ id: 'kinetic-bed', src: 'assets/kinetic-bed.wav', kind: 'music', volume: .68, fadeIn: .1, fadeOut: .9 }] });
}

function dataPulse() {
  const bg = '#071923', cyan = '#6df7df', lime = '#d9ff58', white = '#f2fbfa';
  return base('data-pulse', 'Data Pulse', 8, bg, white, lime, [scene('analysis', 'Transform raw signal into a legible conclusion', 8, bg, [
    text('eyebrow', 'SIGNAL STUDY  /  LIVE FIELD', 100, 90, 1200, 48, 25, cyan, { letterSpacing: 4, tracks: enter('eyebrow', .1, 18) }),
    text('count', '98.7', 92, 175, 1060, 260, 238, white, { countFrom: 0, countProgress: animated([[0, 0], [2.4, 1], [8, 1]]), numberFormat: { decimals: 1, suffix: '%', grouping: true }, tracks: enter('count', .2, 80) }),
    text('label', 'SIGNAL COHERENCE', 110, 430, 760, 55, 29, cyan, { letterSpacing: 5 }),
    shape('field', 'area-chart', 100, 590, 1720, 300, '#153e46', { samples: [.18,.24,.2,.34,.3,.48,.42,.65,.6,.78,.7,.9,.84,.96,.92,1], stroke: cyan, strokeWidth: 8, progress: animated([[0, 0], [.55, 0], [2.8, 1], [8, 1]]), gradientFill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#4fffe355' }, { offset: 1, color: '#07192300' }] } }),
    shape('pulse', 'line', 1010, 540, 0, 390, undefined, { stroke: lime, strokeWidth: 5, tracks: [track('pulse-x', 'transform.x', [[0, -900], [2.85, -900], [4.65, 760], [8, 760]])], motionBlur: { shutterAngle: 180, samples: 4 }, shadow: { color: '#d9ff58aa', blur: 22, offsetX: 0, offsetY: 0 } }),
    text('resolve', 'NOISE → PATTERN → DECISION', 104, 900, 1500, 54, 30, lime, { letterSpacing: 3, tracks: enter('resolve', 4.5, 30) }), footer('DATA PULSE / 02', cyan),
  ])]);
}

function arcOne() {
  const bg = '#111113', ivory = '#f4efe5', orange = '#ff6846', violet = '#806dff';
  return base('arc-one', 'Arc One', 9, bg, ivory, orange, [scene('identity', 'Resolve an original product mark through one continuous arc', 9, bg, [
    text('kicker', 'ONE GESTURE. ONE SYSTEM.', 100, 90, 1300, 60, 28, '#aaa4b7', { letterSpacing: 4, tracks: enter('kicker', .1, 20) }),
    shape('halo', 'ring', 1040, 90, 690, 690, orange, { innerRadius: .91, gradientFill: { type: 'linear', angle: 32, stops: [{ offset: 0, color: orange }, { offset: .5, color: violet }, { offset: 1, color: '#56ddd3' }] }, tracks: [track('halo-rotation', 'transform.rotation', [[0, -130], [2.8, 0], [5.7, 24], [9, 24]]), track('halo-scale', 'transform.scaleX', [[0, .15], [1.55, 1], [9, 1]])], motionBlur: { shutterAngle: 180, samples: 5 }, shadow: { color: '#806dff88', blur: 60, offsetX: 0, offsetY: 20 } }),
    shape('core', 'ellipse', 1250, 300, 270, 270, '#17171b', { stroke: ivory, strokeWidth: 3, tracks: enter('core', 1.2, 60) }),
    text('title', 'ARC\nONE', 90, 250, 860, 420, 210, ivory, { lineHeight: .78, tracks: [...enter('title', .25, 90), track('title-x', 'transform.x', [[0, -90], [1.1, 0], [5.2, 0], [6, 60], [9, 60]])] }),
    text('copy', 'A native product identity built from geometry,\nlight, timing, and a clean final hold.', 104, 760, 920, 110, 35, '#aaa4b7', { fontWeight: 500, lineHeight: 1.3, tracks: enter('copy', 1.5, 28) }), footer('ARC ONE / 03', '#aaa4b7'),
  ])], { audio: [{ id: 'arc-bed', src: 'assets/original-bed.wav', kind: 'music', volume: .72, fadeIn: .35, fadeOut: 1.2 }] });
}

function nativeMilestones() {
  const bg = '#102938', cream = '#f7f0df', gold = '#ffc857';
  const a = [text('chapter', '01 / FRAME', 100, 90, 800, 55, 28, gold, { letterSpacing: 5 }), text('title', 'A frame is\na decision.', 96, 250, 1500, 300, 145, cream, { tracks: enter('title', .2, 80) }), shape('window', 'round-rect', 1120, 180, 600, 650, '#173c50', { radius: 42, stroke: '#4f8196', strokeWidth: 3, tracks: [track('window-scale', 'transform.scaleX', [[0, .2], [1.2, 1], [3, 1]])] }), footer('NATIVE MILESTONES', cream)];
  const b = [text('chapter-b', '02 / TIMELINE', 100, 90, 900, 55, 28, gold, { letterSpacing: 5 }), text('title-b', 'Every second\nstays editable.', 96, 250, 1580, 300, 145, cream, { tracks: enter('title-b', .25, 80) }), ...[0,1,2,3,4].map(i => shape(`beat-${i}`, 'round-rect', 105 + i * 330, 690, 270, 82, i === 4 ? gold : '#285066', { radius: 20, tracks: [track(`beat-${i}-scale`, 'transform.scaleY', [[0, .1], [.25 + i * .12, 1], [3, 1]])] })), { ...footer('NATIVE MILESTONES', cream), id: 'footer-b' }];
  return base('native-milestones', 'Native Milestones', 6, bg, cream, gold, [scene('frame', 'Establish native frames as authored decisions', 3, bg, a), scene('typed-output', 'Reveal an editable native timeline', 3, bg, b)], { parameters: [{ id: 'accent', label: 'Accent', type: 'color', default: gold }], variants: [{ id: 'gold', label: 'Gold', values: { accent: gold } }] });
}

function animationKernel() {
  const bg = '#f5f5f2', ink = '#121c22', blue = '#276ef1', pink = '#ff4e88';
  const nodes = Array.from({ length: 9 }, (_, i) => shape(`node-${i}`, 'ellipse', 1120 + (i % 3) * 190, 210 + Math.floor(i / 3) * 190, 100, 100, i % 2 ? pink : blue, { stagger: { index: i, count: 9, each: .07, from: 'center', trail: .24 }, tracks: [track(`node-${i}-scale`, 'transform.scaleX', [[0, .05], [.35 + i * .055, 1], [2.6, 1], [3.55, .72 + (i % 3) * .14], [6, .72 + (i % 3) * .14]]), track(`node-${i}-rotation`, 'transform.rotation', [[0, -80], [.8 + i * .04, 0], [3.55, 180], [6, 180]])], motionTrail: { duration: .16, samples: 4, opacity: .18 } }));
  return base('animation-kernel', 'Animation Kernel', 6, bg, ink, blue, [scene('kernel', 'Expose the structure behind authored motion', 6, bg, [text('label', 'ANIMATION KERNEL', 96, 82, 1000, 50, 25, blue, { letterSpacing: 5 }), text('title', 'Motion has\nstructure.', 90, 190, 980, 300, 150, ink, { tracks: enter('title', .2, 70) }), ...nodes, text('copy', 'Keyframes  /  easing  /  stagger  /  trails', 100, 790, 1100, 70, 33, ink, { letterSpacing: 2, tracks: enter('copy', 1.6, 20) }), footer('ANIMATION KERNEL / 05', ink)])]);
}

function chromaticOrbit() {
  const bg = '#171024', ivory = '#f7f1ff', acid = '#dfff64';
  const rings = Array.from({ length: 12 }, (_, i) => { const d = 700 - i * 42; return shape(`orbit-${i}`, 'ring', 1180 - d / 2, 500 - d / 2, d, d, acid, { innerRadius: .91, gradientFill: { type: 'linear', angle: i * 31, stops: [{ offset: 0, color: acid }, { offset: .5, color: '#ff5cab' }, { offset: 1, color: '#736bff' }] }, transform: { scaleY: .64, rotation: -35 }, tracks: [track(`orbit-${i}-rotation`, 'transform.rotation', [[0, -125 - i * 7], [1.35 + i * .055, -35 + i * 4], [3.8, -12 + i * 4], [7, -12 + i * 4]]), track(`orbit-${i}-scale`, 'transform.scaleX', [[0, .08], [.65 + i * .055, 1], [7, 1]])], ...(i < 2 ? { motionBlur: { shutterAngle: 120, samples: 3 } } : {}) }); });
  return base('chromatic-orbit', 'Chromatic Orbit', 7, bg, ivory, acid, [scene('orbit', 'Build one luminous body from independent trajectories', 7, bg, [text('label', 'FORM / LIGHT / COLOR', 96, 88, 900, 50, 27, '#bbb1d4', { letterSpacing: 5 }), text('title', 'CHROMATIC\nORBIT', 90, 250, 900, 330, 140, ivory, { lineHeight: .9, tracks: enter('title', .15, 80) }), text('copy', 'Twelve paths resolve\ninto one luminous body.', 102, 680, 720, 120, 36, '#bbb1d4', { fontWeight: 500, lineHeight: 1.25, tracks: enter('copy', .85, 30) }), ...rings, footer('CHROMATIC ORBIT / 06', '#bbb1d4')])], { audio: [{ id: 'orbit-bed', src: 'assets/orbit-bed.wav', kind: 'music', volume: .64, fadeIn: .15, fadeOut: .9 }] });
}

function routeStudy() {
  const paper = '#f1ecdf', ink = '#17312c', green = '#16826a', orange = '#ef6844';
  const anchors = [{ id: 'west', x: 180, y: 700 }, { id: 'central', x: 960, y: 530 }, { id: 'east', x: 1710, y: 410 }, { id: 'south', x: 1370, y: 820 }];
  const layers = [text('label', 'AN IMAGINARY CITY, CONNECTED.', 98, 82, 1500, 52, 27, green, { letterSpacing: 4 }), text('title', 'Every route\nfinds a rhythm.', 92, 170, 1080, 250, 110, ink, { lineHeight: .95, tracks: enter('title', .15, 70) }), shape('west-line', 'bezier', 180, 700, 780, 170, undefined, { startAnchor: 'west', endAnchor: 'central', control1: [520,700], control2: [620,530], stroke: green, strokeWidth: 18, progress: animated([[0,0],[.55,0],[1.8,1],[7,1]]) }), shape('east-line', 'bezier', 960, 530, 750, 120, undefined, { startAnchor: 'central', endAnchor: 'east', control1: [1300,530], control2: [1380,410], stroke: green, strokeWidth: 18, progress: animated([[0,0],[1.85,0],[3.1,1],[7,1]]) }), shape('south-line', 'bezier', 960, 530, 410, 290, undefined, { startAnchor: 'central', endAnchor: 'south', control1: [1220,530], control2: [1100,820], stroke: orange, strokeWidth: 18, progress: animated([[0,0],[3.15,0],[4.4,1],[7,1]]) })];
  for (const [i, anchor] of anchors.entries()) { const arrival = [.55, 1.8, 3.1, 4.4][i]; layers.push(shape(`station-${i}`, 'ellipse', anchor.x - 18, anchor.y - 18, 36, 36, paper, { centerAnchor: anchor.id, stroke: ink, strokeWidth: 7, tracks: enter(`station-${i}`, arrival, 20) }), text(`station-label-${i}`, ['WEST BANK','CENTRAL','EAST GARDEN','SOUTH PIER'][i], anchor.x - 100, anchor.y + (i === 1 ? -90 : 40), 200, 42, 22, ink, { align: 'center', letterSpacing: 1, tracks: enter(`station-label-${i}`, arrival + .18, 16) })); }
  layers.push(footer('ROUTE STUDY / 07', ink));
  return base('route-study', 'Route Study', 7, paper, ink, green, [scene('network', 'Draw a semantic network through shared geometry anchors', 7, paper, layers)], { anchors });
}

function typeBeat() {
  const bg = '#ed623e', ink = '#171716', cream = '#fff5df';
  const beats = Array.from({ length: 13 }, (_, index) => .25 + index * .5);
  const layers = [text('label', 'A SMALL STUDY IN TIMING', 96, 85, 1200, 48, 27, ink, { letterSpacing: 5 }), text('make', 'MAKE', 82, 220, 1060, 200, 205, ink, { tracks: enter('make', .25, 80) }), text('it', 'IT', 84, 405, 520, 200, 205, cream, { tracks: enter('it', .75, 100) }), text('move', 'MOVE.', 82, 590, 1100, 210, 205, ink, { tracks: enter('move', 1.25, 120) })];
  for (let i = 0; i < 5; i++) { const points = [[0,.18]]; for (let b = 0; b < beats.length; b++) { const at = beats[b]; points.push([at-.055,.18],[at,.45+((b+i)%4)*.18],[at+.17,.18]); } points.push([7,.18]); layers.push(shape(`meter-${i}`, 'round-rect', 1270 + i * 96, 280, 58, 500, cream, { radius: 30, tracks: [track(`meter-${i}-pulse`, 'transform.scaleY', points)], motionBlur: { shutterAngle: 140, samples: 4 } })); }
  layers.push({ id: 'caption', type: 'caption', x: 1030, y: 805, width: 790, height: 125, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: 68, fontWeight: 800, color: cream, highlightColor: cream, highlightBackground: ink, highlightPadding: 10, highlightRadius: 12, identity: 'kinetic', highlightMode: 'current-word', showSpeaker: false, padding: 10, radius: 12, cues: [{ id: 'build', start: 1.25, end: 2.25, text: 'BUILD.', words: [{ text: 'BUILD.', start: 1.25, end: 2.25 }] }, { id: 'breathe', start: 2.25, end: 3.75, text: 'BREATHE.', words: [{ text: 'BREATHE.', start: 2.25, end: 3.75 }] }, { id: 'resolve', start: 3.75, end: 5.75, text: 'RESOLVE.', words: [{ text: 'RESOLVE.', start: 3.75, end: 5.75 }] }] }, footer('TYPE / BEAT / 08', ink));
  return base('type-beat', 'Type / Beat', 7, bg, ink, cream, [scene('beat', 'Synchronize type, geometry, captions and original sound', 7, bg, layers)], { audio: [{ id: 'pulse', src: 'assets/original-pulse.wav', kind: 'music', volume: .75, fadeIn: .08, fadeOut: .8 }] });
}

function captionCinema() {
  const bg = '#090b10', white = '#f7f4ed', blue = '#79a7ff', amber = '#ffc45b';
  const cues = [
    { id: 'c1', start: .35, end: 2.05, text: 'Typography can carry the cut.', words: [{ text: 'Typography', start: .35, end: .8 }, { text: 'can', start: .8, end: 1.02 }, { text: 'carry', start: 1.02, end: 1.38 }, { text: 'the', start: 1.38, end: 1.55 }, { text: 'cut.', start: 1.55, end: 2.05 }] },
    { id: 'c2', start: 2.35, end: 4.35, text: 'Emphasis becomes choreography.', words: [{ text: 'Emphasis', start: 2.35, end: 2.9 }, { text: 'becomes', start: 2.9, end: 3.4 }, { text: 'choreography.', start: 3.4, end: 4.35 }] },
    { id: 'c3', start: 4.7, end: 7.45, text: 'Captions belong inside the composition.', words: [{ text: 'Captions', start: 4.7, end: 5.25 }, { text: 'belong', start: 5.25, end: 5.7 }, { text: 'inside', start: 5.7, end: 6.12 }, { text: 'the', start: 6.12, end: 6.3 }, { text: 'composition.', start: 6.3, end: 7.45 }] },
  ];
  const layers = [shape('beam-a', 'rect', -200, 160, 2320, 140, blue, { transform: { rotation: -8, opacity: .12 }, tracks: [track('beam-a-x', 'transform.x', [[0,-500],[3.3,0],[8,260]])], motionBlur: { shutterAngle: 150, samples: 4 } }), shape('beam-b', 'rect', -200, 720, 2320, 120, amber, { transform: { rotation: 7, opacity: .1 }, tracks: [track('beam-b-x', 'transform.x', [[0,400],[4,0],[8,-300]])], motionBlur: { shutterAngle: 150, samples: 4 } }), text('label', 'CAPTION CINEMA', 95, 85, 900, 54, 26, blue, { letterSpacing: 6 }), text('ghost', 'VOICE\nBECOMES\nFORM', 90, 205, 1640, 540, 170, '#63739c', { lineHeight: .82, tracks: [track('ghost-scale', 'transform.scaleX', [[0,.84],[2.35,1],[4.7,1.06],[8,1.06]])] }), { id: 'captions', type: 'caption', language: 'en', trackName: 'English editorial', stylePresetId: 'cinema', x: 150, y: 660, width: 1620, height: 250, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: 72, fontWeight: 800, color: white, highlightColor: bg, highlightBackground: amber, highlightPadding: 12, highlightRadius: 14, identity: 'editorial', highlightMode: 'current-word', enter: { type: 'slide-up', duration: .22, distance: 28, ease }, exit: { type: 'fade', duration: .16, distance: 0, ease: 'cubic-out' }, showSpeaker: false, padding: 22, radius: 18, maxLines: 2, safeArea: true, cues }, footer('CAPTION CINEMA / 09', '#79859a')];
  return base('caption-cinema', 'Caption Cinema', 8, bg, white, amber, [scene('caption-stage', 'Treat captions as immersive editorial motion', 8, bg, layers)], { captionStylePresets: [{ id: 'cinema', name: 'Cinema', style: { color: white, highlightColor: bg, highlightBackground: amber, fontSize: 72, fontWeight: 800, padding: 22, radius: 18 } }], captionPreviewLanguages: ['en'] });
}

function cameraFlight() {
  const bg = '#dbe7e2', ink = '#102522', green = '#3bb78f', orange = '#ff6b45';
  const world = shape('world', 'round-rect', 240, 150, 1440, 760, '#edf3ef', { radius: 54, stroke: '#abc7bc', strokeWidth: 3, tracks: [track('world-x', 'transform.x', [[0,0],[.8,0],[2.4,-220],[3,-220],[4.55,180],[5.2,180],[7,180]]), track('world-y', 'transform.y', [[0,0],[.8,0],[2.4,100],[3,100],[4.55,-70],[5.2,-70],[7,-70]]), track('world-scale-x', 'transform.scaleX', [[0,.86],[.8,1],[2.4,1.38],[3,1.38],[4.55,1.12],[5.2,1.12],[7,1.12]]), track('world-scale-y', 'transform.scaleY', [[0,.86],[.8,1],[2.4,1.38],[3,1.38],[4.55,1.12],[5.2,1.12],[7,1.12]])], motionBlur: { shutterAngle: 140, samples: 4 }, shadow: { color: '#10252233', blur: 45, offsetX: 0, offsetY: 20 } });
  const tiles = Array.from({ length: 18 }, (_, i) => shape(`tile-${i}`, 'round-rect', 330 + (i % 6) * 210, 250 + Math.floor(i / 6) * 190, 150, 120, i === 8 ? orange : i === 15 ? green : '#c8dbd3', { radius: 24, parentId: 'world', tracks: [track(`tile-${i}-opacity`, 'transform.opacity', [[0,.15],[.3+i*.03,1],[7,1]])] }));
  return base('camera-flight', 'Camera Flight', 7, bg, ink, green, [scene('flight', 'Demonstrate a continuous establish, travel, settle and hold camera move', 7, bg, [world, ...tiles, text('label', 'ESTABLISH  →  TRAVEL  →  SETTLE  →  HOLD', 95, 72, 1450, 48, 24, ink, { letterSpacing: 4 }), text('focus', 'CAMERA\nWITH INTENT', 104, 690, 900, 190, 78, ink, { lineHeight: .9, tracks: enter('focus', 3.9, 28) }), footer('CAMERA FLIGHT / 10', ink)])], { audio: [{ id: 'camera-bed', src: 'assets/camera-bed.wav', kind: 'music', volume: .62, fadeIn: .12, fadeOut: .85 }] });
}

function motionLab() {
  const bg = '#07070a', white = '#f4f2eb', neon = '#caff4a', magenta = '#ff4e9e';
  const layers = [text('label', 'TEMPORAL STUDY', 96, 82, 900, 52, 26, neon, { letterSpacing: 6 }), text('title', 'SPEED\nLEAVES\nA TRACE.', 92, 180, 980, 510, 145, white, { lineHeight: .83, tracks: enter('title', .2, 80) }), shape('runner', 'spark', 1120, 410, 180, 180, neon, { tracks: [track('runner-x', 'transform.x', [[0,-500],[.65,-500],[1.65,450],[2.35,220],[3.1,500],[4.05,-280],[5.15,360],[7,360]]), track('runner-rotation', 'transform.rotation', [[0,0],[1.65,260],[3.1,520],[5.15,900],[7,900]])], motionBlur: { shutterAngle: 160, samples: 4 }, effects: [{ id: 'glow', type: 'glow', amount: .85, radius: 24 }, { id: 'aberration', type: 'chromatic-aberration', amount: .18 }] }), shape('trail-dot', 'ellipse', 1170, 650, 72, 72, magenta, { tracks: [track('trail-x', 'transform.x', [[0,-420],[.8,-420],[2.5,420],[3.5,420],[4.8,-180],[7,-180]])], motionTrail: { duration: .16, samples: 4, opacity: .3 } }), shape('gate-a', 'rect', 1080, 210, 10, 620, magenta, { transform: { opacity: .5 } }), shape('gate-b', 'rect', 1570, 210, 10, 620, neon, { transform: { opacity: .5 } }), text('copy', 'Temporal samples. Directional trails.\nOne deterministic frame.', 1090, 790, 670, 100, 34, '#9e9dad', { fontWeight: 500, lineHeight: 1.25, tracks: enter('copy', 4.55, 25) }), footer('MOTION LAB / 11', '#777783')];
  return base('motion-lab', 'Motion Lab', 7, bg, white, neon, [scene('trace', 'Make temporal sampling, blur and trails visually legible', 7, bg, layers)], { audio: [{ id: 'motion-bed', src: 'assets/motion-bed.wav', kind: 'music', volume: .66, fadeIn: .08, fadeOut: .8 }] });
}

const uiCard = (id, x, y, width, height, fill = '#ffffff', extra = {}) => shape(id, 'round-rect', x, y, width, height, fill, { radius: 24, ...extra });
const pill = (id, value, x, y, width, fill, color) => ({
  ...uiCard(`${id}-bg`, x, y, width, 54, fill, { radius: 27 }),
  children: undefined,
  companion: text(id, value, x + 22, y + 7, width - 44, 40, 20, color, { letterSpacing: 1.2, align: 'center' }),
});

function launchStarter() {
  const bg = '#070a12', white = '#f7f8fb', blue = '#6f7cff', cyan = '#5eead4', muted = '#9aa3b7';
  const p = pill('status', 'LIVE WORKSPACE', 1305, 118, 330, '#192137', cyan);
  return base('product-launch-starter', 'Product Launch Starter', 14, bg, white, blue, [
    scene('hook', 'Open on a sharp customer problem and name the product in the first three seconds', 3, bg, [
      text('eyebrow', 'INTRODUCING NORTHSTAR', 105, 90, 1100, 48, 25, cyan, { letterSpacing: 5, tracks: enter('eyebrow', .08, 16) }),
      text('headline', 'Launch work.\nLose the chaos.', 96, 225, 1500, 390, 174, white, { lineHeight: .86, tracks: enter('headline', .2, 100) }),
      text('sub', 'One command center for every release.', 110, 720, 1160, 64, 38, muted, { fontWeight: 500, tracks: enter('sub', .8, 24) }),
      shape('beam', 'rect', 1460, -180, 230, 1440, blue, { transform: { rotation: 18, opacity: .65 }, tracks: [track('beam-x', 'transform.x', [[0, 380], [.2, 380], [1.2, 0], [3, -80]])], motionBlur: { shutterAngle: 150, samples: 4 } }),
      footer('PRODUCT LAUNCH / HOOK', muted),
    ]),
    scene('product', 'Reveal the product surface and orient the viewer before feature motion begins', 4, '#0d1220', [
      text('label', 'EVERY RELEASE. ONE VIEW.', 98, 72, 1050, 46, 24, cyan, { letterSpacing: 4 }),
      uiCard('app', 170, 150, 1580, 760, '#f6f7fb', { shadow: { color: '#00000088', blur: 55, offsetX: 0, offsetY: 25 }, tracks: [track('app-scale', 'transform.scaleX', [[0,.82],[.75,1],[4,1]]), track('app-scale-y', 'transform.scaleY', [[0,.82],[.75,1],[4,1]])], motionBlur: { shutterAngle: 120, samples: 3 } }),
      uiCard('sidebar', 198, 180, 310, 700, '#141a29', { radius: 18 }),
      text('logo', 'NORTHSTAR', 235, 220, 230, 40, 24, white, { letterSpacing: 3 }),
      ...['Overview','Releases','Environments','Approvals'].map((value, i) => text(`nav-${i}`, value, 240, 340 + i * 74, 220, 38, 21, i === 1 ? cyan : muted, { fontWeight: i === 1 ? 700 : 500 })),
      text('app-title', 'September release', 560, 225, 620, 70, 48, '#111827'),
      uiCard('metric-a', 560, 340, 330, 170, '#e8ebff', { tracks: enter('metric-a', .8, 28) }),
      text('metric-a-label', 'READY', 590, 365, 260, 35, 19, '#5963dc', { letterSpacing: 3 }),
      text('metric-a-value', '18', 585, 400, 250, 85, 66, '#111827'),
      uiCard('metric-b', 925, 340, 330, 170, '#defaf4', { tracks: enter('metric-b', 1.05, 28) }),
      text('metric-b-label', 'APPROVED', 955, 365, 260, 35, 19, '#16836f', { letterSpacing: 3 }),
      text('metric-b-value', '12', 950, 400, 250, 85, 66, '#111827'),
      uiCard('activity', 560, 550, 1030, 250, '#ffffff', { stroke: '#e3e6ee', strokeWidth: 2 }),
      ...[0,1,2].map(i => shape(`activity-${i}`, 'round-rect', 600, 585 + i * 61, 780 - i * 70, 20, i === 0 ? blue : '#d9deeb', { radius: 10, tracks: [track(`activity-${i}-width`, 'transform.scaleX', [[0,.05],[1.2+i*.22,1],[4,1]])], transform: { anchorX: 0, anchorY: .5 } })),
      p, { ...p.companion, id: 'status-label' }, footer('PRODUCT LAUNCH / PRODUCT', muted),
    ]),
    scene('proof', 'Connect three feature claims to visible product evidence', 4, bg, [
      text('proof-title', 'From plan to shipped.', 96, 100, 1500, 110, 82, white, { tracks: enter('proof-title', .1, 35) }),
      ...[
        ['01','PLAN','Map owners, risk, and timing.'],
        ['02','APPROVE','Move decisions into one queue.'],
        ['03','SHIP','Publish with a verified record.'],
      ].flatMap(([num, title, copy], i) => [
        uiCard(`proof-card-${i}`, 96 + i * 584, 300, 535, 470, i === 1 ? '#171d31' : '#101624', { stroke: i === 1 ? blue : '#252d42', strokeWidth: 2, tracks: enter(`proof-card-${i}`, .25 + i * .18, 55) }),
        text(`proof-num-${i}`, num, 135 + i * 584, 340, 160, 60, 26, i === 2 ? cyan : blue, { letterSpacing: 4 }),
        text(`proof-name-${i}`, title, 135 + i * 584, 450, 450, 80, 54, white),
        text(`proof-copy-${i}`, copy, 135 + i * 584, 580, 420, 100, 29, muted, { fontWeight: 500, lineHeight: 1.3 }),
      ]), footer('PRODUCT LAUNCH / PROOF', muted),
    ]),
    scene('cta', 'Hold a clean product lockup and one action long enough to read', 3, blue, [
      text('cta-mark', 'N', 865, 160, 190, 190, 150, white, { align: 'center', tracks: [track('cta-mark-scale', 'transform.scaleX', [[0,.15],[.65,1],[3,1]]), track('cta-mark-scale-y', 'transform.scaleY', [[0,.15],[.65,1],[3,1]])] }),
      text('cta-title', 'NORTHSTAR', 410, 410, 1100, 130, 108, white, { align: 'center', letterSpacing: 6, tracks: enter('cta-title', .3, 36) }),
      text('cta-copy', 'Make the next release your calmest.', 410, 570, 1100, 60, 37, white, { align: 'center', fontWeight: 500 }),
      uiCard('cta-button', 710, 700, 500, 92, white, { radius: 46, tracks: enter('cta-button', .8, 24) }),
      text('cta-button-label', 'START A RELEASE', 760, 721, 400, 50, 24, blue, { align: 'center', letterSpacing: 3 }),
    ]),
  ], { parameters: [{ id: 'productName', label: 'Product name', type: 'string', default: 'NORTHSTAR' }, { id: 'accent', label: 'Accent', type: 'color', default: blue }, { id: 'cta', label: 'Call to action', type: 'string', default: 'START A RELEASE' }], variants: [{ id: 'default', label: 'Launch', values: { productName: 'NORTHSTAR', accent: blue, cta: 'START A RELEASE' } }], audio: [{ id: 'launch-bed', src: 'assets/launch-bed.wav', kind: 'music', volume: .72, fadeIn: .08, fadeOut: .9 }] });
}

function walkthroughStarter() {
  const bg = '#f3f0e9', ink = '#17181a', purple = '#7656ff', pale = '#e6defd', green = '#24a780';
  let chromeIndex = 0;
  const chrome = () => { const prefix = `chrome-${chromeIndex++}`; return [uiCard(`${prefix}-browser`, 180, 145, 1560, 780, '#ffffff', { shadow: { color: '#17181a33', blur: 45, offsetX: 0, offsetY: 20 } }), shape(`${prefix}-bar`, 'rect', 180, 145, 1560, 72, '#ece9f2'), ...[0,1,2].map(i => shape(`${prefix}-dot-${i}`, 'ellipse', 220 + i * 34, 171, 18, 18, ['#ff675f','#ffc34d','#36c861'][i])), uiCard(`${prefix}-address`, 470, 163, 780, 38, '#ffffff', { radius: 19 }), text(`${prefix}-url`, 'app.relay.test / automations', 500, 167, 720, 28, 18, '#77727e', { fontWeight: 500 })]; };
  return base('feature-walkthrough-starter', 'Feature Walkthrough Starter', 15, bg, ink, purple, [
    scene('setup', 'Introduce the workflow and show the real interface context', 3, bg, [text('label', 'FEATURE WALKTHROUGH', 98, 72, 900, 46, 23, purple, { letterSpacing: 5 }), text('headline', 'Build an automation\nin under a minute.', 92, 230, 1200, 270, 128, ink, { lineHeight: .92, tracks: enter('headline', .15, 70) }), text('step', 'Three steps. No setup maze.', 100, 610, 900, 60, 36, '#68626e', { fontWeight: 500, tracks: enter('step', .75, 24) }), shape('cursor', 'spark', 1470, 420, 100, 100, purple, { tracks: [track('cursor-x', 'transform.x', [[0,260],[.5,260],[1.45,0],[3,-80]]), track('cursor-y', 'transform.y', [[0,180],[.5,180],[1.45,0],[3,-80]])], motionBlur: { shutterAngle: 150, samples: 4 } }), footer('RELAY / WALKTHROUGH', ink)]),
    scene('choose-trigger', 'Step one: demonstrate a concrete user action with a focused camera crop', 4, '#ddd7ef', [...chrome(), uiCard('sidebar', 220, 250, 300, 620, '#f6f4f9'), text('nav', 'AUTOMATIONS\n\nRUNS\n\nCONNECTIONS', 260, 290, 230, 300, 21, '#706b78', { lineHeight: 2.2 }), text('step-one', '1  Choose a trigger', 590, 285, 730, 68, 46, ink), uiCard('trigger-card', 590, 400, 940, 220, '#f1edff', { stroke: purple, strokeWidth: 3, tracks: enter('trigger-card', .3, 35) }), text('trigger-icon', '↗', 635, 445, 100, 100, 72, purple, { align: 'center' }), text('trigger-name', 'New customer signed up', 780, 440, 650, 60, 35, ink), text('trigger-copy', 'Starts instantly from your product event.', 780, 510, 650, 45, 24, '#726d78', { fontWeight: 500 }), uiCard('continue', 1240, 710, 290, 72, purple, { radius: 36 }), text('continue-label', 'CONTINUE', 1280, 726, 210, 40, 21, '#ffffff', { align: 'center', letterSpacing: 2 }), shape('cursor-action', 'spark', 1360, 720, 72, 72, ink, { tracks: [track('cursor-action-x', 'transform.x', [[0,-420],[1.2,-420],[2.1,0],[4,0]]), track('cursor-action-y', 'transform.y', [[0,-180],[1.2,-180],[2.1,0],[4,0]])], motionBlur: { shutterAngle: 120, samples: 3 } }), footer('STEP 01 / TRIGGER', ink)]),
    scene('configure', 'Step two: explain the meaningful setting while the value visibly changes', 4, '#e5f2ed', [...chrome(), text('step-two', '2  Set the action', 280, 285, 720, 68, 46, ink), uiCard('action-panel', 280, 390, 1360, 330, '#ffffff', { stroke: '#c7ddd5', strokeWidth: 2 }), text('action-label', 'SEND TO', 330, 435, 280, 35, 19, green, { letterSpacing: 3 }), text('action-value', 'Customer success', 330, 490, 700, 65, 42, ink), shape('divider', 'rect', 330, 585, 1260, 2, '#dbe7e2'), text('delay-label', 'WAIT BEFORE SENDING', 330, 625, 420, 35, 19, '#777d7a', { letterSpacing: 2 }), text('delay-value', '5 minutes', 1160, 615, 390, 55, 34, ink, { align: 'right', tracks: [track('delay-scale', 'transform.scaleX', [[0,.8],[.5,1],[4,1]])] }), shape('progress', 'round-rect', 330, 745, 0, 18, green, { radius: 9, tracks: [track('progress-width', 'width', [[0,1],[2.4,1260],[4,1260]])] }), footer('STEP 02 / ACTION', ink)]),
    scene('result', 'Close on the completed outcome and a reusable next action', 4, '#11131a', [text('done-label', 'AUTOMATION LIVE', 100, 100, 900, 48, 24, '#72e6bb', { letterSpacing: 5, tracks: enter('done-label', .1, 20) }), text('done-title', 'Every signup gets\nthe right follow-up.', 92, 250, 1420, 280, 130, '#ffffff', { lineHeight: .9, tracks: enter('done-title', .2, 70) }), uiCard('done-stat', 1280, 235, 470, 470, '#202530', { stroke: '#343b4c', strokeWidth: 2 }), text('done-stat-value', '100%', 1340, 330, 350, 120, 100, '#72e6bb', { align: 'center' }), text('done-stat-label', 'ON-TIME RUNS', 1340, 475, 350, 45, 22, '#aeb6c8', { align: 'center', letterSpacing: 3 }), text('done-copy', 'Duplicate this flow, replace the trigger,\nand make it yours.', 110, 700, 1050, 110, 34, '#aeb6c8', { fontWeight: 500, lineHeight: 1.3 }), footer('RELAY / READY TO REMIX', '#aeb6c8')]),
  ], { parameters: [{ id: 'featureName', label: 'Feature name', type: 'string', default: 'AUTOMATIONS' }, { id: 'accent', label: 'Accent', type: 'color', default: purple }], variants: [{ id: 'purple', label: 'Purple', values: { accent: purple } }, { id: 'green', label: 'Green', values: { accent: green } }], audio: [{ id: 'walkthrough-bed', src: 'assets/walkthrough-bed.wav', kind: 'music', volume: .58, fadeIn: .15, fadeOut: .9 }] });
}

function demoStarter() {
  const bg = '#0b1020', white = '#f7f7fb', aqua = '#63f2d0', amber = '#ffca68', muted = '#a8b0c3';
  return base('product-demo-starter', 'Product Demo Starter', 15, bg, white, aqua, [
    scene('problem', 'Start with the painful before-state in one concrete sentence', 3, bg, [text('pre', 'BEFORE PULSE', 100, 85, 800, 48, 23, amber, { letterSpacing: 5 }), text('problem-title', 'Three dashboards.\nZero shared context.', 92, 245, 1030, 280, 122, white, { lineHeight: .9, tracks: enter('problem-title', .15, 70) }), ...[0,1,2].map(i => uiCard(`old-${i}`, 1180 + i * 120, 360 + i * 95, 470, 300, ['#252c42','#1c2538','#141c2d'][i], { stroke: '#39435f', strokeWidth: 2, transform: { rotation: -10 + i * 7 }, tracks: enter(`old-${i}`, .35 + i * .14, 80) })), footer('PRODUCT DEMO / PROBLEM', muted)]),
    scene('input', 'Show the exact input instead of describing an abstract capability', 4, '#10182b', [text('input-step', 'ASK ONE QUESTION', 98, 78, 900, 44, 23, aqua, { letterSpacing: 5 }), uiCard('command', 180, 260, 1560, 260, '#ffffff', { shadow: { color: '#00000088', blur: 50, offsetX: 0, offsetY: 25 }, tracks: enter('command', .15, 45) }), text('prompt', 'Which accounts need attention today?', 255, 325, 1300, 90, 52, '#111827'), shape('send', 'ellipse', 1585, 325, 92, 92, aqua), text('send-arrow', '→', 1600, 335, 62, 62, 45, '#0b1020', { align: 'center' }), text('input-copy', 'Pulse joins product usage, tickets, and revenue\ninto one answer with evidence.', 190, 660, 1280, 120, 37, muted, { fontWeight: 500, lineHeight: 1.3, tracks: enter('input-copy', 1.25, 28) }), footer('PRODUCT DEMO / INPUT', muted)]),
    scene('answer', 'Reveal the answer in ranked, actionable form with visible proof', 5, '#eef3f2', [text('answer-label', 'TODAY / 09:42', 100, 70, 800, 44, 22, '#257967', { letterSpacing: 4 }), text('answer-title', '3 accounts need attention', 98, 140, 1280, 85, 65, '#111827'), ...[['Atlas','Usage down 28%','HIGH'],['Clover','Two open blockers','HIGH'],['Mori','Renewal in 9 days','WATCH']].flatMap(([name, reason, risk], i) => [uiCard(`account-${i}`, 100, 290 + i * 190, 1720, 150, '#ffffff', { stroke: '#d8e3df', strokeWidth: 2, tracks: enter(`account-${i}`, .25 + i * .22, 34) }), text(`account-name-${i}`, name, 155, 325 + i * 190, 340, 55, 36, '#111827'), text(`account-reason-${i}`, reason, 540, 330 + i * 190, 620, 45, 28, '#5e6667', { fontWeight: 500 }), uiCard(`risk-${i}`, 1430, 332 + i * 190, 260, 52, i < 2 ? '#ffe3cf' : '#e6e2ff', { radius: 26 }), text(`risk-label-${i}`, risk, 1470, 338 + i * 190, 180, 40, 20, i < 2 ? '#b54b20' : '#614ac7', { align: 'center', letterSpacing: 2 })]), footer('PRODUCT DEMO / ANSWER', '#697372')]),
    scene('payoff', 'State the business result and give one next step', 3, aqua, [text('payoff-small', 'FROM SIGNAL TO ACTION', 100, 100, 1000, 48, 24, '#17352f', { letterSpacing: 5 }), text('payoff-title', 'Know where to act.\nBefore customers ask.', 94, 260, 1600, 300, 132, '#0b1020', { lineHeight: .9, tracks: enter('payoff-title', .15, 80) }), text('payoff-cta', 'TRY PULSE WITH YOUR DATA  →', 105, 755, 1100, 60, 28, '#17352f', { letterSpacing: 3, tracks: enter('payoff-cta', .9, 24) })]),
  ], { parameters: [{ id: 'productName', label: 'Product name', type: 'string', default: 'PULSE' }, { id: 'question', label: 'Demo question', type: 'string', default: 'Which accounts need attention today?' }], variants: [{ id: 'default', label: 'Customer health', values: { productName: 'PULSE', question: 'Which accounts need attention today?' } }], audio: [{ id: 'demo-bed', src: 'assets/demo-bed.wav', kind: 'music', volume: .63, fadeIn: .12, fadeOut: .8 }] });
}

function trailerStarter() {
  const black = '#050607', white = '#f6f4ed', red = '#ff4d3d', steel = '#8490a5';
  return base('cinematic-trailer-starter', 'Cinematic Trailer Starter', 12, black, white, red, [
    scene('cold-open', 'Create intrigue with a spare cold open and controlled silence', 2.5, black, [text('date', 'THIS FALL', 560, 430, 800, 90, 68, steel, { align: 'center', letterSpacing: 14, tracks: enter('date', .25, 20) }), shape('hairline', 'rect', 760, 560, 400, 3, red, { tracks: [track('hairline-grow', 'transform.scaleX', [[0,.2],[1.4,1],[2.5,1]])] })]),
    scene('world', 'Establish the world with a cinematic camera move and one visual motif', 3.5, '#090d14', [shape('sun', 'ellipse', 1260, 230, 420, 420, red, { shadow: { color: '#ff4d3daa', blur: 80, offsetX: 0, offsetY: 0 }, tracks: [track('sun-scale', 'transform.scaleX', [[0,.65],[3.5,1.1]]), track('sun-scale-y', 'transform.scaleY', [[0,.65],[3.5,1.1]])] }), ...Array.from({ length: 10 }, (_, i) => shape(`horizon-${i}`, 'rect', -200, 550 + i * 58, 2400, 2, '#39445a', { transform: { rotation: i % 2 ? -4 : 4, opacity: .6 }, tracks: [track(`horizon-${i}-y`, 'transform.y', [[0,220-i*18],[3.5,-80-i*5]])], motionBlur: { shutterAngle: 130, samples: 3 } })), text('world-copy', 'THE SIGNAL WAS ALWAYS THERE', 105, 160, 1050, 60, 30, white, { letterSpacing: 6, tracks: enter('world-copy', .45, 30) }), footer('TRAILER / WORLD', steel)]),
    scene('escalation', 'Escalate with three beat-driven title cards and accelerating motion', 3.5, red, [text('word-a', 'FIND', 90, 110, 1500, 220, 210, black, { tracks: [track('word-a-x', 'transform.x', [[0,-80],[.55,0],[1.1,0],[1.35,300],[3.5,300]])], motionBlur: { shutterAngle: 160, samples: 4 } }), text('word-b', 'THE', 90, 370, 1050, 190, 170, black, { tracks: [track('word-b-x', 'transform.x', [[0,400],[1.05,400],[1.55,0],[2.05,0],[2.35,-80],[3.5,-80]])], motionBlur: { shutterAngle: 160, samples: 4 } }), text('word-c', 'SOURCE', 90, 610, 1650, 240, 220, black, { tracks: [track('word-c-scale', 'transform.scaleX', [[0,.5],[2.05,.5],[2.7,1],[3.5,1]])], motionBlur: { shutterAngle: 160, samples: 4 } })]),
    scene('title', 'Resolve on a memorable title, release line, and long final hold', 2.5, black, [text('title-small', 'A GENMOTION TRAILER TEMPLATE', 500, 220, 920, 45, 21, steel, { align: 'center', letterSpacing: 5, tracks: enter('title-small', .1, 16) }), text('trailer-title', 'DEEP SIGNAL', 250, 370, 1420, 160, 126, white, { align: 'center', letterSpacing: 7, tracks: enter('trailer-title', .25, 35) }), shape('title-rule', 'rect', 710, 570, 500, 5, red), text('release', 'TRAILER OUT NOW', 560, 650, 800, 60, 29, red, { align: 'center', letterSpacing: 6 }), text('url-final', 'YOURPRODUCT.COM', 610, 840, 700, 42, 22, steel, { align: 'center', letterSpacing: 4 })]),
  ], { parameters: [{ id: 'title', label: 'Trailer title', type: 'string', default: 'DEEP SIGNAL' }, { id: 'release', label: 'Release line', type: 'string', default: 'TRAILER OUT NOW' }, { id: 'accent', label: 'Accent', type: 'color', default: red }], variants: [{ id: 'red', label: 'Signal red', values: { title: 'DEEP SIGNAL', release: 'TRAILER OUT NOW', accent: red } }], audio: [{ id: 'trailer-bed', src: 'assets/trailer-bed.wav', kind: 'music', volume: .76, fadeIn: .1, fadeOut: 1 }] });
}

function writeAudio(file, seconds, profile = 'ambient') {
  const rate = 48000, frames = rate * seconds, wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  const settings = { ambient: [104, .35, 0], arc: [108, .32, 1], orbit: [112, .3, 2], camera: [104, .34, 3], motion: [124, .28, 4], beat: [120, .25, 5] }[profile];
  const [bpm, offset, color] = settings, step = 60 / bpm, note = [55, 65.41, 73.42, 82.41][color % 4];
  const noise = sample => { const x = Math.sin((sample + 1) * (12.9898 + color * 4.17)) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const hit = (d, length, decay) => d >= 0 && d < length ? Math.exp(-d * decay) : 0;
  for (let n = 0; n < frames; n++) {
    const t = n / rate, section = Math.min(3, Math.floor(Math.max(0, t - offset) / (step * 4))), root = note * [1, 1.1892, 1.3348, 1.1225][section];
    let left = .018 * Math.sin(2 * Math.PI * root * t) + .012 * Math.sin(2 * Math.PI * root * 1.5 * t + .4);
    let right = .018 * Math.sin(2 * Math.PI * root * t + .08) + .012 * Math.sin(2 * Math.PI * root * 1.5 * t + .7);
    const beatIndex = Math.floor((t - offset) / step);
    for (let b = Math.max(0, beatIndex - 1); b <= beatIndex + 1; b++) {
      const at = offset + b * step, d = t - at, kickEnv = hit(d, .34, 15), phase = 2 * Math.PI * (48 * d + 36 * (1 - Math.exp(-d * 22)) / 22);
      const kick = kickEnv * Math.sin(phase) * (b % 4 === 0 ? .42 : .27);
      const click = hit(d, .035, 70) * noise(n) * .075;
      const clapD = t - (at + step), clap = b % 4 === 0 ? hit(clapD, .13, 24) * (noise(n) - noise(n - 1)) * .08 : 0;
      const pluck = hit(d, .22, 12) * Math.sin(2 * Math.PI * root * [2, 2.3784, 2.6696, 3][b % 4] * d) * (profile === 'beat' || profile === 'orbit' ? .13 : .075);
      left += kick + click + clap + pluck * .82; right += kick + click - clap * .65 + pluck;
    }
    const eighth = step / 2, hatIndex = Math.floor((t - offset) / eighth), hatD = t - (offset + hatIndex * eighth), hat = hit(hatD, .045, 65) * (noise(n) - noise(n - 1)) * (hatIndex % 2 ? .042 : .026);
    const progress = Math.max(0, Math.min(1, (t - (seconds - 1.55)) / 1.25)), riser = progress * progress * (noise(n) - noise(n - 1)) * .028;
    left += hat + riser; right -= hat * .8 + riser;
    const envelope = Math.min(1, t * 10, Math.max(0, (seconds - t) * 3.5)), drive = value => Math.tanh(value * 1.7) * .62 * envelope;
    wav.writeInt16LE(Math.round(drive(left) * 32767), 44 + n * 4); wav.writeInt16LE(Math.round(drive(right) * 32767), 46 + n * 4);
  }
  writeFileSync(file, wav);
}

const projects = [launchStarter(), walkthroughStarter(), demoStarter(), trailerStarter(), kineticType(), dataPulse(), arcOne(), nativeMilestones(), animationKernel(), chromaticOrbit(), routeStudy(), typeBeat(), captionCinema(), cameraFlight(), motionLab()];
for (const project of projects) {
  const dir = join(root, 'examples', project.id);
  mkdirSync(join(dir, 'assets'), { recursive: true }); mkdirSync(join(dir, '.genmotion'), { recursive: true });
  if (!existsSync(join(dir, 'assets', 'Inter.ttf'))) copyFileSync(join(fontSource, 'Inter.ttf'), join(dir, 'assets', 'Inter.ttf'));
  if (!existsSync(join(dir, 'assets', 'OFL.txt'))) copyFileSync(join(fontSource, 'OFL.txt'), join(dir, 'assets', 'OFL.txt'));
  if (project.id === 'arc-one') writeAudio(join(dir, 'assets', 'original-bed.wav'), 9, 'arc');
  if (project.id === 'type-beat') writeAudio(join(dir, 'assets', 'original-pulse.wav'), 7, 'beat');
  if (project.id === 'kinetic-type') writeAudio(join(dir, 'assets', 'kinetic-bed.wav'), 8, 'ambient');
  if (project.id === 'chromatic-orbit') writeAudio(join(dir, 'assets', 'orbit-bed.wav'), 7, 'orbit');
  if (project.id === 'camera-flight') writeAudio(join(dir, 'assets', 'camera-bed.wav'), 7, 'camera');
  if (project.id === 'motion-lab') writeAudio(join(dir, 'assets', 'motion-bed.wav'), 7, 'motion');
  if (project.id === 'product-launch-starter') writeAudio(join(dir, 'assets', 'launch-bed.wav'), 14, 'motion');
  if (project.id === 'feature-walkthrough-starter') writeAudio(join(dir, 'assets', 'walkthrough-bed.wav'), 15, 'ambient');
  if (project.id === 'product-demo-starter') writeAudio(join(dir, 'assets', 'demo-bed.wav'), 15, 'orbit');
  if (project.id === 'cinematic-trailer-starter') writeAudio(join(dir, 'assets', 'trailer-bed.wav'), 12, 'beat');
  writeFileSync(join(dir, 'genmotion.json'), `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(join(dir, 'brief.json'), `${JSON.stringify({ title: project.title, audience: project.id.endsWith('-starter') ? 'Teams creating product marketing, launches, demos, walkthroughs, and trailers' : 'Motion designers and creative technologists', promise: project.scenes[0].purpose, proof: 'The editable Creative IR, native master, inspected frames, and reproducible build script.', desiredAction: 'Open the project in Studio, replace the fictional product copy, tune the exposed parameters, and render.', duration: Number(project.metadata.duration), templateRole: project.id.endsWith('-starter') ? project.id.replace('-starter', '') : 'technical-study', replacementGuide: project.id.endsWith('-starter') ? ['Replace fictional product and claims.', 'Replace interface text and metrics with truthful product evidence.', 'Tune brand colors through exposed parameters and variants.', 'Retiming scene durations keeps every layer editable.'] : [], sources: ['Original local vector artwork and authored motion.', 'Bundled Inter font under the SIL Open Font License.'], audio: project.audio.length ? 'Original synthesized audio generated locally by the suite builder.' : 'Intentionally silent.' }, null, 2)}\n`);
  writeFileSync(join(dir, '.genmotion', 'concepts.json'), `${JSON.stringify({ selected: `${project.id}-direction`, concepts: [{ id: `${project.id}-direction`, referenceFamily: 'Editorial graphic systems', borrow: ['clear hierarchy', 'decisive pacing'], avoid: ['generic cards', 'decorative noise', 'interface imitation'], transform: ['native geometry', 'one dominant move', 'readable final hold'], hierarchy: project.scenes[0].purpose, rhythm: 'Build, breathe, resolve, hold', feasibility: 'Local native vectors, type and deterministic tracks only' }, { id: `${project.id}-alternate`, referenceFamily: 'Physical signage and wayfinding', borrow: ['spatial clarity', 'material restraint'], avoid: ['literal signage recreation', 'brand imitation'], transform: ['motion establishes reading order'], hierarchy: 'One focal message supported by geometry', rhythm: 'Establish, travel, settle', feasibility: 'No remote assets or browser rendering' }] }, null, 2)}\n`);
}
writeFileSync(join(root, 'examples', 'manifest.json'), `${JSON.stringify(projects.map(project => ({ id: project.id, title: project.title, duration: Number(project.metadata.duration), audio: project.audio.length > 0, kind: project.id.endsWith('-starter') ? 'starter' : 'study' })), null, 2)}\n`);
console.log(`Built ${projects.length} fresh public example projects.`);
