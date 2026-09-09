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
const footer = (label, color) => text('footer', `GENMOTION  /  ${label}`, 96, 984, 1728, 34, 20, color, { letterSpacing: 3 });
const base = (id, title, duration, background, foreground, accent, scenes, extra = {}) => projectSchema.parse({ schemaVersion: 1, id, title, width: 1920, height: 1080, fps: 30, seed: 47, brand: { background, foreground, accent, muted: '#8a8a92', fonts: [{ family: 'Inter', file: 'assets/Inter.ttf' }], radius: 24, tone: ['editorial', 'precise', 'cinematic'] }, scenes, metadata: { publicExample: 'true', duration: String(duration), provenance: 'Original native vector artwork generated locally from this repository.' }, ...extra });

function kineticType() {
  const bg = '#f2ede3', ink = '#141312', red = '#e94032';
  return base('kinetic-type', 'Kinetic Type', 8, bg, ink, red, [scene('statement', 'Show typography behaving as composition and rhythm', 8, bg, [
    shape('rule', 'rect', 96, 90, 1728, 8, red, { tracks: [track('rule-width', 'transform.scaleX', [[0, .02], [.55, 1], [8, 1]])], transform: { anchorX: 0, anchorY: .5 } }),
    text('small', 'WORDS ARE PHYSICAL', 100, 120, 900, 60, 28, red, { letterSpacing: 5, tracks: enter('small', .25, 20) }),
    text('kinetic', 'KINETIC', 88, 230, 1600, 240, 222, ink, { tracks: [...enter('kinetic', .25, 90), track('kinetic-x', 'transform.x', [[0, -70], [1.05, 0], [2.5, 0], [3.15, 210], [4.45, 210], [5.15, 0], [8, 0]])] }),
    text('type', 'TYPE', 90, 455, 1080, 260, 250, red, { tracks: [...enter('type', .45, 120), track('type-scale', 'transform.scaleX', [[0, .4], [1.25, 1], [2.5, 1], [3.15, 1.45], [4.45, 1.45], [5.15, 1], [8, 1]])] }),
    text('phrase', 'Scale changes meaning.\nTiming changes the sentence.', 106, 785, 1060, 115, 38, ink, { fontWeight: 500, lineHeight: 1.25, tracks: enter('phrase', 1.05, 28) }), footer('KINETIC TYPE / 01', ink),
  ])]);
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
  return base('chromatic-orbit', 'Chromatic Orbit', 7, bg, ivory, acid, [scene('orbit', 'Build one luminous body from independent trajectories', 7, bg, [text('label', 'FORM / LIGHT / COLOR', 96, 88, 900, 50, 27, '#bbb1d4', { letterSpacing: 5 }), text('title', 'CHROMATIC\nORBIT', 90, 250, 900, 330, 140, ivory, { lineHeight: .9, tracks: enter('title', .15, 80) }), text('copy', 'Twelve paths resolve\ninto one luminous body.', 102, 680, 720, 120, 36, '#bbb1d4', { fontWeight: 500, lineHeight: 1.25, tracks: enter('copy', .85, 30) }), ...rings, footer('CHROMATIC ORBIT / 06', '#bbb1d4')])]);
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
  const layers = [text('label', 'A SMALL STUDY IN TIMING', 96, 85, 1200, 48, 27, ink, { letterSpacing: 5 }), text('make', 'MAKE', 82, 220, 1060, 200, 205, ink, { tracks: enter('make', .1, 80) }), text('it', 'IT', 84, 405, 520, 200, 205, cream, { tracks: enter('it', .55, 100) }), text('move', 'MOVE.', 82, 590, 1100, 210, 205, ink, { tracks: enter('move', 1, 120) })];
  for (let i = 0; i < 5; i++) { const points = [[0,.18]]; for (let b = 0; b < 10; b++) { const at = .2 + b * .5; points.push([at,.18],[at+.07,.45+((b+i)%4)*.18],[at+.24,.18]); } points.push([7,.18]); layers.push(shape(`meter-${i}`, 'round-rect', 1270 + i * 96, 280, 58, 500, cream, { radius: 30, tracks: [track(`meter-${i}-pulse`, 'transform.scaleY', points)], motionBlur: { shutterAngle: 140, samples: 4 } })); }
  layers.push({ id: 'caption', type: 'caption', x: 1030, y: 805, width: 790, height: 125, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: 68, fontWeight: 800, color: cream, highlightColor: cream, highlightBackground: ink, highlightPadding: 10, highlightRadius: 12, identity: 'kinetic', highlightMode: 'current-word', showSpeaker: false, padding: 10, radius: 12, cues: [{ id: 'build', start: 1, end: 2, text: 'BUILD.', words: [{ text: 'BUILD.', start: 1, end: 2 }] }, { id: 'breathe', start: 2, end: 3.5, text: 'BREATHE.', words: [{ text: 'BREATHE.', start: 2, end: 3.5 }] }, { id: 'resolve', start: 3.5, end: 5.15, text: 'RESOLVE.', words: [{ text: 'RESOLVE.', start: 3.5, end: 5.15 }] }] }, footer('TYPE / BEAT / 08', ink));
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
  return base('camera-flight', 'Camera Flight', 7, bg, ink, green, [scene('flight', 'Demonstrate a continuous establish, travel, settle and hold camera move', 7, bg, [world, ...tiles, text('label', 'ESTABLISH  →  TRAVEL  →  SETTLE  →  HOLD', 95, 72, 1450, 48, 24, ink, { letterSpacing: 4 }), text('focus', 'CAMERA\nWITH INTENT', 104, 690, 900, 190, 78, ink, { lineHeight: .9, tracks: enter('focus', 3.9, 28) }), footer('CAMERA FLIGHT / 10', ink)])]);
}

function motionLab() {
  const bg = '#07070a', white = '#f4f2eb', neon = '#caff4a', magenta = '#ff4e9e';
  const layers = [text('label', 'TEMPORAL STUDY', 96, 82, 900, 52, 26, neon, { letterSpacing: 6 }), text('title', 'SPEED\nLEAVES\nA TRACE.', 92, 180, 980, 510, 145, white, { lineHeight: .83, tracks: enter('title', .2, 80) }), shape('runner', 'spark', 1120, 410, 180, 180, neon, { tracks: [track('runner-x', 'transform.x', [[0,-500],[.65,-500],[1.65,450],[2.35,220],[3.1,500],[4.05,-280],[5.15,360],[7,360]]), track('runner-rotation', 'transform.rotation', [[0,0],[1.65,260],[3.1,520],[5.15,900],[7,900]])], motionBlur: { shutterAngle: 160, samples: 4 }, effects: [{ id: 'glow', type: 'glow', amount: .85, radius: 24 }, { id: 'aberration', type: 'chromatic-aberration', amount: .18 }] }), shape('trail-dot', 'ellipse', 1170, 650, 72, 72, magenta, { tracks: [track('trail-x', 'transform.x', [[0,-420],[.8,-420],[2.5,420],[3.5,420],[4.8,-180],[7,-180]])], motionTrail: { duration: .16, samples: 4, opacity: .3 } }), shape('gate-a', 'rect', 1080, 210, 10, 620, magenta, { transform: { opacity: .5 } }), shape('gate-b', 'rect', 1570, 210, 10, 620, neon, { transform: { opacity: .5 } }), text('copy', 'Temporal samples. Directional trails.\nOne deterministic frame.', 1090, 790, 670, 100, 34, '#9e9dad', { fontWeight: 500, lineHeight: 1.25, tracks: enter('copy', 4.55, 25) }), footer('MOTION LAB / 11', '#777783')];
  return base('motion-lab', 'Motion Lab', 7, bg, white, neon, [scene('trace', 'Make temporal sampling, blur and trails visually legible', 7, bg, layers)]);
}

function writeAudio(file, seconds, pulse = false) {
  const rate = 48000, frames = rate * seconds, wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  for (let n = 0; n < frames; n++) { const t = n / rate; let v = .025 * Math.sin(2 * Math.PI * 55 * t) + .018 * Math.sin(2 * Math.PI * 82.41 * t); if (pulse) for (let b = 0; b < seconds * 2; b++) { const d = t - (.2 + b * .5); if (d >= 0 && d < .32) v += .32 * Math.sin(2 * Math.PI * (62 + b % 3 * 18) * d) * Math.exp(-d * 18); } v *= Math.min(1, t * 8, (seconds - t) * 5); const sample = Math.round(Math.max(-.85, Math.min(.85, v)) * 32767); wav.writeInt16LE(sample, 44 + n * 4); wav.writeInt16LE(sample, 46 + n * 4); }
  writeFileSync(file, wav);
}

const projects = [kineticType(), dataPulse(), arcOne(), nativeMilestones(), animationKernel(), chromaticOrbit(), routeStudy(), typeBeat(), captionCinema(), cameraFlight(), motionLab()];
for (const project of projects) {
  const dir = join(root, 'examples', project.id);
  mkdirSync(join(dir, 'assets'), { recursive: true }); mkdirSync(join(dir, '.genmotion'), { recursive: true });
  if (!existsSync(join(dir, 'assets', 'Inter.ttf'))) copyFileSync(join(fontSource, 'Inter.ttf'), join(dir, 'assets', 'Inter.ttf'));
  if (!existsSync(join(dir, 'assets', 'OFL.txt'))) copyFileSync(join(fontSource, 'OFL.txt'), join(dir, 'assets', 'OFL.txt'));
  if (project.id === 'arc-one') writeAudio(join(dir, 'assets', 'original-bed.wav'), 9);
  if (project.id === 'type-beat') writeAudio(join(dir, 'assets', 'original-pulse.wav'), 7, true);
  writeFileSync(join(dir, 'genmotion.json'), `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(join(dir, 'brief.json'), `${JSON.stringify({ title: project.title, audience: 'Motion designers and creative technologists', promise: project.scenes[0].purpose, proof: 'The editable Creative IR, native master, inspected frames, and reproducible build script.', desiredAction: 'Open the project in Studio and remix it.', duration: Number(project.metadata.duration), sources: ['Original local vector artwork and authored motion.', 'Bundled Inter font under the SIL Open Font License.'], audio: project.audio.length ? 'Original synthesized audio generated locally by the suite builder.' : 'Intentionally silent.' }, null, 2)}\n`);
  writeFileSync(join(dir, '.genmotion', 'concepts.json'), `${JSON.stringify({ selected: `${project.id}-direction`, concepts: [{ id: `${project.id}-direction`, referenceFamily: 'Editorial graphic systems', borrow: ['clear hierarchy', 'decisive pacing'], avoid: ['generic cards', 'decorative noise', 'interface imitation'], transform: ['native geometry', 'one dominant move', 'readable final hold'], hierarchy: project.scenes[0].purpose, rhythm: 'Build, breathe, resolve, hold', feasibility: 'Local native vectors, type and deterministic tracks only' }, { id: `${project.id}-alternate`, referenceFamily: 'Physical signage and wayfinding', borrow: ['spatial clarity', 'material restraint'], avoid: ['literal signage recreation', 'brand imitation'], transform: ['motion establishes reading order'], hierarchy: 'One focal message supported by geometry', rhythm: 'Establish, travel, settle', feasibility: 'No remote assets or browser rendering' }] }, null, 2)}\n`);
}
writeFileSync(join(root, 'examples', 'manifest.json'), `${JSON.stringify(projects.map(project => ({ id: project.id, title: project.title, duration: Number(project.metadata.duration), audio: project.audio.length > 0 })), null, 2)}\n`);
console.log(`Built ${projects.length} fresh public example projects.`);
