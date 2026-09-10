import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const ease = { type: 'cubic-bezier', x1: 0.22, y1: 1, x2: 0.36, y2: 1 };
const transform = (overrides = {}) => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, anchorX: 0.5, anchorY: 0.5, ...overrides });
const k = (at, value) => ({ at, value, ease });
const track = (id, target, keyframes) => ({ id, target, keyframes, operation: 'replace', extrapolate: 'clamp', enabled: true });
const common = (id, z, duration, extra = {}) => ({ id, start: 0, duration, z, visible: true, transform: transform(), blendMode: 'source-over', tags: [], motion: [], tracks: [], constraints: [], bindings: {}, ...extra });
const rect = (id, z, duration, x, y, width, height, fill, extra = {}) => ({ ...common(id, z, duration, extra), type: 'shape', shape: 'rect', x, y, width, height, fill, strokeWidth: 0, radius: 0, progress: 1 });
const line = (id, z, duration, x, y, width, height, stroke, strokeWidth, extra = {}) => ({ ...common(id, z, duration, extra), type: 'shape', shape: 'line', x, y, width, height, stroke, strokeWidth, radius: 0, progress: 1 });
const text = (id, z, duration, value, x, y, width, height, size, color, extra = {}) => ({ ...common(id, z, duration, extra), type: 'text', text: value, x, y, width, height, fontFamily: 'Inter', fontFile: 'assets/Inter.ttf', fontSize: size, fontWeight: 700, fontStyle: 'normal', color, outlineWidth: 0, align: 'left', verticalAlign: 'middle', lineHeight: .92, letterSpacing: 0, fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1, blockPadding: 0, blockRadius: 0, linePadding: 0, lineRadius: 0, runs: [], timedWords: [], notations: [] });
const image = (id, z, duration, src, x, y, width, height, extra = {}) => ({ ...common(id, z, duration, extra), type: 'image', src, x, y, width, height, fit: 'fill', radius: 22 });

const workflow = image('workflow-product', 20, 8.4, 'assets/studio-workflow.png', 285, 90, 1350, 760, {
  transform: transform({ opacity: 1 }),
  tracks: [
    track('workflow-opacity', 'transform.opacity', [k(0, 1), k(5.55, 1), k(6.15, .42), k(8.4, .42)]),
    track('workflow-x', 'transform.x', [k(0, 120), k(1.25, 0), k(3.8, 0), k(7.1, 92), k(8.4, 92)]),
    track('workflow-y', 'transform.y', [k(0, 32), k(1.25, 0), k(3.8, 0), k(7.1, 96), k(8.4, 96)]),
    track('workflow-scale-x', 'transform.scaleX', [k(0, .82), k(1.25, 1), k(3.8, 1), k(7.1, 1.52), k(8.4, 1.52)]),
    track('workflow-scale-y', 'transform.scaleY', [k(0, .82), k(1.25, 1), k(3.8, 1), k(7.1, 1.52), k(8.4, 1.52)]),
  ],
  effects: [
    { id: 'workflow-perspective', type: 'perspective', enabled: true, amount: { keyframes: [k(0, -18), k(1.25, 0), k(8.4, 0)] }, angle: { keyframes: [k(0, -5), k(1.25, 0), k(8.4, 0)] }, center: [.5, .5] },
    { id: 'workflow-shadow', type: 'drop-shadow', enabled: true, amount: .62, radius: 34, angle: 2.1, color: '#000000' },
  ],
});

const editor = image('editor-product', 20, 5.6, 'assets/studio-editor.png', 285, 90, 1350, 760, {
  transform: transform({ opacity: 1 }),
  tracks: [
    track('editor-opacity', 'transform.opacity', [k(0, 1), k(5.6, 1)]),
    track('editor-x', 'transform.x', [k(0, -180), k(1.25, 0), k(2.2, 0), k(4.15, -125), k(5.6, -125)]),
    track('editor-y', 'transform.y', [k(0, 18), k(1.25, 0), k(2.2, 0), k(4.15, 80), k(5.6, 80)]),
    track('editor-scale-x', 'transform.scaleX', [k(0, .86), k(1.25, 1), k(2.2, 1), k(4.15, 1.34), k(5.6, 1.34)]),
    track('editor-scale-y', 'transform.scaleY', [k(0, .86), k(1.25, 1), k(2.2, 1), k(4.15, 1.34), k(5.6, 1.34)]),
  ],
  effects: [
    { id: 'editor-perspective', type: 'perspective', enabled: true, amount: { keyframes: [k(0, 16), k(1.25, 0), k(5.6, 0)] }, angle: { keyframes: [k(0, 4), k(1.25, 0), k(5.6, 0)] }, center: [.5, .5] },
    { id: 'editor-shadow', type: 'drop-shadow', enabled: true, amount: .7, radius: 38, angle: 2.2, color: '#000000' },
  ],
  motionBlur: { shutterAngle: 144, samples: 5 },
});

const baseAtmosphere = (prefix, duration) => [
  rect(`${prefix}-background`, 0, duration, 0, 0, 1920, 1080, '#07090d'),
  rect(`${prefix}-violet-depth`, 1, duration, -360, 760, 2500, 220, '#7258ff', { transform: transform({ rotation: -9, opacity: .11, blur: 28 }), tracks: [track(`${prefix}-violet-drift`, 'transform.x', [k(0, -220), k(duration, 180)])] }),
  rect(`${prefix}-mint-depth`, 2, duration, -240, 145, 2350, 8, '#6effc2', { transform: transform({ rotation: -6, opacity: .72 }), tracks: [track(`${prefix}-mint-drift`, 'transform.x', [k(0, -240), k(duration, 260)])], motionBlur: { shutterAngle: 160, samples: 4 } }),
  rect(`${prefix}-frame-glass`, 8, duration, 155, 76, 1610, 928, '#10141ccc', { effects: [{ id: `${prefix}-glass-bloom`, type: 'bloom', enabled: true, amount: .16, radius: 18 }] }),
];

const workflowLayers = [
  ...baseAtmosphere('workflow', 8.4),
  line('route-line', 12, 8.4, 95, 168, 1725, 0, '#6effc2', 3, { transform: transform({ opacity: .8 }), tracks: [track('route-draw', 'progress', [k(0, 0), k(1.05, 1), k(8.4, 1)])] }),
  workflow,
  text('mechanism-copy', 31, 8.4, 'BRIEF  →  SCENE GRAPH  →  MASTER', 260, 895, 1400, 82, 37, '#eef4f8', { transform: transform({ opacity: 0 }), tracks: [track('copy-in', 'transform.opacity', [k(1.3, 0), k(1.75, 1), k(3.8, 1), k(4.2, 0)])] }),
  text('proof-copy', 31, 8.4, 'ONE EDITABLE SOURCE OF TRUTH.', 260, 895, 1400, 82, 44, '#f4f7f8', { transform: transform({ opacity: 0, x: -35 }), tracks: [track('proof-opacity', 'transform.opacity', [k(5.65, 0), k(6.25, 1), k(8.4, 1)]), track('proof-x', 'transform.x', [k(5.65, -35), k(6.25, 0), k(8.4, 0)])] }),
  rect('near-plane-left', 40, 8.4, -120, 210, 170, 650, '#6effc2', { transform: transform({ opacity: .08, rotation: -7 }), tracks: [track('near-left', 'transform.y', [k(0, -280), k(8.4, 260)])], motionBlur: { shutterAngle: 170, samples: 4 } }),
  rect('near-plane-right', 41, 8.4, 1800, 80, 220, 820, '#866dff', { transform: transform({ opacity: .12, rotation: 6 }), tracks: [track('near-right', 'transform.y', [k(0, 260), k(8.4, -330)])], motionBlur: { shutterAngle: 170, samples: 4 } }),
];

const editorLayers = [
  ...baseAtmosphere('editor', 5.6),
  line('editor-route', 12, 5.6, 96, 905, 1728, 0, '#6effc2', 3, { tracks: [track('editor-route-draw', 'progress', [k(0, 0), k(.8, 1), k(5.6, 1)])] }),
  text('editor-copy', 31, 5.6, 'DIRECT.  INSPECT.  REVISE.', 260, 895, 1400, 82, 40, '#eef4f8', { transform: transform({ opacity: 0 }), tracks: [track('editor-copy-in', 'transform.opacity', [k(1.35, 0), k(1.75, 1), k(2.2, 1), k(2.55, 0), k(5.6, 0)])] }),
  editor,
  rect('editor-near-left', 40, 5.6, -80, 140, 130, 770, '#6effc2', { transform: transform({ opacity: .09, rotation: -5 }), tracks: [track('editor-near-left-y', 'transform.y', [k(0, -210), k(5.6, 170)])], motionBlur: { shutterAngle: 165, samples: 4 } }),
  rect('editor-near-right', 41, 5.6, 1808, 210, 160, 670, '#866dff', { transform: transform({ opacity: .14, rotation: 7 }), tracks: [track('editor-near-right-y', 'transform.y', [k(0, 180), k(5.6, -240)])], motionBlur: { shutterAngle: 165, samples: 4 } }),
];

const hookLayers = [
  rect('hook-background', 0, 3.2, 0, 0, 1920, 1080, '#05070a'),
  rect('hook-violet-field', 1, 3.2, 1080, -220, 620, 1500, '#745cff', { transform: transform({ opacity: .1, rotation: 31, blur: 42 }), tracks: [track('hook-violet-x', 'transform.x', [k(0, 420), k(3.2, -80)])], motionBlur: { shutterAngle: 170, samples: 4 } }),
  ...[-1, 0, 1, 2].map((index) => rect(`hook-rail-${index}`, 5 + index, 3.2, -420, 180 + index * 168, 2480, index === 1 ? 7 : 3, index === 1 ? '#6effc2' : '#52606f', { transform: transform({ opacity: index === 1 ? .92 : .38, rotation: -7 + index * 1.2, x: index % 2 ? 0 : 260 }), tracks: [track(`hook-rail-${index}-x`, 'transform.x', [k(0, index % 2 ? -680 : 720), k(1.45 + index * .08, 0), k(3.2, index * 22)])], motionBlur: { shutterAngle: 180, samples: 5 } })),
  image('hook-symbol', 24, 3.2, 'assets/genmotion-symbol-2048.png', 1206, 260, 420, 420, { transform: transform({ opacity: 0, scaleX: .28, scaleY: .28, rotation: -38 }), tracks: [track('hook-symbol-opacity', 'transform.opacity', [k(.3, 0), k(.85, 1), k(3.2, 1)]), track('hook-symbol-scale-x', 'transform.scaleX', [k(.3, .28), k(1.3, 1.08), k(1.65, 1), k(3.2, 1)]), track('hook-symbol-scale-y', 'transform.scaleY', [k(.3, .28), k(1.3, 1.08), k(1.65, 1), k(3.2, 1)]), track('hook-symbol-rotation', 'transform.rotation', [k(.3, -38), k(1.45, 0), k(3.2, 0)])] }),
  text('hook-meta', 30, 3.2, 'GENMOTION / MOTION SYSTEM', 102, 66, 720, 38, 21, '#8290a3', { transform: transform({ opacity: 0 }), tracks: [track('hook-meta-opacity', 'transform.opacity', [k(.6, 0), k(1.1, 1), k(3.2, 1)])] }),
  text('hook-title', 31, 3.2, 'MOTION /\nUNDER DIRECTION', 102, 330, 1040, 310, 126, '#f4f7f8', { transform: transform({ opacity: 0, x: -80 }), tracks: [track('hook-title-opacity', 'transform.opacity', [k(.7, 0), k(1.25, 1), k(3.2, 1)]), track('hook-title-x', 'transform.x', [k(.7, -80), k(1.25, 0), k(3.2, 0)])], motionBlur: { shutterAngle: 150, samples: 4 } }),
  text('hook-sub', 31, 3.2, 'Direct the scene.', 106, 768, 760, 76, 43, '#6effc2', { transform: transform({ opacity: 0 }), tracks: [track('hook-sub-opacity', 'transform.opacity', [k(1.75, 0), k(2.2, 1), k(3.2, 1)])] }),
];

const revealLayers = [
  rect('reveal-background', 0, 3.6, 0, 0, 1920, 1080, '#07090d'),
  rect('reveal-light-sheet', 2, 3.6, 1170, -360, 420, 1800, '#6effc2', { transform: transform({ opacity: .12, rotation: 32, blur: 18 }), tracks: [track('reveal-sheet-x', 'transform.x', [k(0, 300), k(2.1, 0), k(3.6, -120)])], motionBlur: { shutterAngle: 170, samples: 4 } }),
  ...[0,1,2,3,4].map(index => rect(`reveal-plane-${index}`, 7 + index, 3.6, 1000 + index * 105, 205 + index * 74, 270, 190, index === 2 ? '#6effc2' : '#151b25', { transform: transform({ opacity: index === 2 ? .7 : .82, rotation: -9 + index * 3, x: 650 - index * 130, y: index * 36 }), tracks: [track(`reveal-plane-${index}-x`, 'transform.x', [k(0, 650 - index * 130), k(1.65 + index * .06, 0), k(3.6, -60 + index * 18)]), track(`reveal-plane-${index}-y`, 'transform.y', [k(0, index * 36), k(1.65 + index * .06, 0), k(3.6, -20 + index * 10)])], effects: [{ id: `reveal-plane-${index}-perspective`, type: 'perspective', enabled: true, amount: -18 + index * 7, angle: 5 - index, center: [.5,.5] }, { id: `reveal-plane-${index}-shadow`, type: 'drop-shadow', enabled: true, amount: .55, radius: 22, angle: 2.2, color: '#000000' }], motionBlur: { shutterAngle: 170, samples: 4 } })),
  line('reveal-route', 18, 3.6, 865, 332, 910, 362, '#6effc2', 4, { tracks: [track('reveal-route-progress', 'progress', [k(.45, 0), k(2.15, 1), k(3.6, 1)])], effects: [{ id: 'reveal-route-glow', type: 'glow', enabled: true, amount: .7, radius: 18 }] }),
  text('reveal-meta', 30, 3.6, 'GENMOTION / CREATIVE IR', 102, 66, 720, 38, 21, '#8290a3'),
  text('reveal-title', 31, 3.6, 'KEEP EVERY\nDECISION.', 102, 300, 930, 305, 136, '#f4f7f8', { transform: transform({ opacity: 0, scaleX: .92, scaleY: .92 }), tracks: [track('reveal-title-opacity', 'transform.opacity', [k(.3, 0), k(.9, 1), k(3.6, 1)]), track('reveal-title-scale-x', 'transform.scaleX', [k(.3, .92), k(.9, 1), k(3.6, 1)]), track('reveal-title-scale-y', 'transform.scaleY', [k(.3, .92), k(.9, 1), k(3.6, 1)])] }),
  text('reveal-sub', 31, 3.6, 'One scene graph. Fully inspectable.', 106, 760, 950, 64, 36, '#6effc2', { transform: transform({ opacity: 0 }), tracks: [track('reveal-sub-opacity', 'transform.opacity', [k(1.55, 0), k(2.05, 1), k(3.6, 1)])] }),
];

const capabilitySpecs = [
  { label: 'TYPE', x: 440, y: 235, perspective: -8, rotation: -2 },
  { label: 'PATHS', x: 590, y: 345, perspective: -4, rotation: -1 },
  { label: 'CAMERA', x: 740, y: 455, perspective: 0, rotation: 0 },
  { label: 'BLUR', x: 890, y: 565, perspective: 4, rotation: 1 },
  { label: 'AUDIO', x: 1040, y: 675, perspective: 8, rotation: 2 },
];

const capabilityLayers = [
  rect('cap-background', 0, 4.6, 0, 0, 1920, 1080, '#05070a'),
  rect('cap-far-field', 1, 4.6, 180, 150, 1560, 780, '#0f1420', { transform: transform({ opacity: .8 }) }),
  ...capabilitySpecs.map((spec,index) => text(`cap-label-${index}`, 10 + index, 4.6, spec.label, spec.x, spec.y, 440, 112, 70, index === 2 ? '#6effc2' : '#edf3f7', {
    transform: transform({ opacity: 0, x: 180, y: 24, rotation: spec.rotation, blur: index === 2 ? 0 : 1 + Math.abs(index - 2) }),
    tracks: [
      track(`cap-label-${index}-opacity`, 'transform.opacity', [k(.25 + index * .34, 0), k(.72 + index * .34, index === 2 ? 1 : .68), k(4.6, index === 2 ? 1 : .68)]),
      track(`cap-label-${index}-x`, 'transform.x', [k(.25 + index * .34, 180), k(1.2 + index * .28, 0), k(4.6, 0)]),
      track(`cap-label-${index}-y`, 'transform.y', [k(.25 + index * .34, 24), k(1.2 + index * .28, 0), k(4.6, 0)]),
    ],
    effects: index === 2 ? [{ id: 'cap-camera-glow', type: 'glow', enabled: true, amount: .55, radius: 20 }] : [],
    motionBlur: { shutterAngle: 150, samples: 4 },
  })),
  line('cap-route-a', 26, 4.6, 100, 225, 1650, 610, '#6effc2', 4, { tracks: [track('cap-route-a-progress', 'progress', [k(.4, 0), k(3.2, 1), k(4.6, 1)])], effects: [{ id: 'cap-route-a-glow', type: 'glow', enabled: true, amount: .65, radius: 16 }] }),
  text('cap-meta', 30, 4.6, 'GENMOTION / AUTHORED DIMENSIONS', 102, 66, 820, 38, 21, '#8290a3'),
  text('cap-copy', 31, 4.6, 'EVERY LAYER MOVES THE STORY', 104, 925, 1300, 70, 42, '#f4f7f8', { transform: transform({ opacity: 0 }), tracks: [track('cap-copy-opacity', 'transform.opacity', [k(3.05, 0), k(3.55, 1), k(4.6, 1)])] }),
];

const roleSceneDuration = 3.692;
const layerRoleLayers = [
  rect('roles-background', 0, roleSceneDuration, 0, 0, 1920, 1080, '#07090d'),
  text('roles-title', 40, roleSceneDuration, 'EVERY LAYER MOVES THE STORY', 190, 420, 1540, 190, 82, '#f4f7f8', {
    transform: transform({ opacity: 0, y: 28, scaleX: .96, scaleY: .96 }),
    tracks: [
      track('roles-title-opacity', 'transform.opacity', [k(0, 0), k(.55, 1), k(roleSceneDuration, 1)]),
      track('roles-title-y', 'transform.y', [k(0, 28), k(.55, 0), k(roleSceneDuration, 0)]),
      track('roles-title-scale-x', 'transform.scaleX', [k(0, .96), k(.55, 1), k(roleSceneDuration, 1)]),
      track('roles-title-scale-y', 'transform.scaleY', [k(0, .96), k(.55, 1), k(roleSceneDuration, 1)]),
    ],
  }),
];

const payoffLayers = [
  rect('payoff-background', 0, 3.6, 0, 0, 1920, 1080, '#07090d'),
  rect('payoff-master-shadow', 5, 3.6, 485, 180, 950, 610, '#000000', { transform: transform({ opacity: .65, blur: 36, y: 38 }) }),
  rect('payoff-master', 8, 3.6, 485, 180, 950, 610, '#111722', { transform: transform({ opacity: 0, scaleX: 1.35, scaleY: 1.35, rotation: -8 }), tracks: [track('payoff-master-opacity', 'transform.opacity', [k(0, 0), k(.46, 1), k(3.6, 1)]), track('payoff-master-scale-x', 'transform.scaleX', [k(0, 1.35), k(.95, 1), k(3.6, 1)]), track('payoff-master-scale-y', 'transform.scaleY', [k(0, 1.35), k(.95, 1), k(3.6, 1)]), track('payoff-master-rotation', 'transform.rotation', [k(0, -8), k(.95, 0), k(3.6, 0)])], effects: [{ id: 'payoff-master-bloom', type: 'bloom', enabled: true, amount: .22, radius: 24 }], motionBlur: { shutterAngle: 170, samples: 5 } }),
  image('payoff-symbol', 12, 3.6, 'assets/genmotion-symbol-2048.png', 785, 282, 350, 350, { transform: transform({ opacity: 0, scaleX: .72, scaleY: .72 }), tracks: [track('payoff-symbol-opacity', 'transform.opacity', [k(0, 0), k(.46, 1), k(3.6, 1)]), track('payoff-symbol-scale-x', 'transform.scaleX', [k(0, .72), k(1.05, 1), k(3.6, 1)]), track('payoff-symbol-scale-y', 'transform.scaleY', [k(0, .72), k(1.05, 1), k(3.6, 1)])] }),
  line('payoff-line-left', 20, 3.6, 140, 365, 340, 0, '#6effc2', 3, { tracks: [track('payoff-line-left-progress', 'progress', [k(.7, 0), k(1.35, 1), k(3.6, 1)])] }),
  line('payoff-line-right', 20, 3.6, 1440, 610, 340, 0, '#6effc2', 3, { tracks: [track('payoff-line-right-progress', 'progress', [k(.9, 0), k(1.55, 1), k(3.6, 1)])] }),
  text('payoff-one-ir', 30, 3.6, 'ONE IR', 104, 330, 320, 70, 38, '#f4f7f8', { transform: transform({ opacity: 0 }), tracks: [track('payoff-one-ir-opacity', 'transform.opacity', [k(1.15, 0), k(1.5, 1), k(3.6, 1)])] }),
  text('payoff-native', 30, 3.6, 'NATIVE PIXELS', 1496, 330, 320, 70, 38, '#f4f7f8', { transform: transform({ opacity: 0 }), tracks: [track('payoff-native-opacity', 'transform.opacity', [k(1.45, 0), k(1.8, 1), k(3.6, 1)])] }),
  text('payoff-verified', 30, 3.6, 'VERIFIED OUTPUT', 600, 884, 720, 70, 39, '#6effc2', { transform: transform({ opacity: 0 }), tracks: [track('payoff-verified-opacity', 'transform.opacity', [k(2, 0), k(2.45, 1), k(3.6, 1)])] }),
];

const ctaLayers = [
  rect('cta-background', 0, 3, 0, 0, 1920, 1080, '#05070a'),
  image('cta-symbol', 10, 3, 'assets/genmotion-symbol-2048.png', 785, 165, 350, 350, { transform: transform({ opacity: 1, scaleX: .8, scaleY: .8 }), tracks: [track('cta-symbol-opacity', 'transform.opacity', [k(0, 1), k(3, 1)]), track('cta-symbol-scale-x', 'transform.scaleX', [k(0, .8), k(1.3, 1), k(3, 1.035)]), track('cta-symbol-scale-y', 'transform.scaleY', [k(0, .8), k(1.3, 1), k(3, 1.035)])] }),
  text('cta-title', 20, 3, 'MAKE MOTION AN AGENT CAN DIRECT.', 320, 596, 1280, 100, 64, '#f4f7f8', { transform: transform({ opacity: 0 }), tracks: [track('cta-title-opacity', 'transform.opacity', [k(.55, 0), k(1.05, 1), k(3, 1)])] }),
  text('cta-url', 20, 3, 'github.com/Afnanksalal/genmotion', 520, 752, 880, 62, 29, '#6effc2', { transform: transform({ opacity: 0 }), tracks: [track('cta-url-opacity', 'transform.opacity', [k(1.1, 0), k(1.55, 1), k(3, 1)])] }),
  line('cta-rule', 18, 3, 520, 838, 880, 0, '#374151', 2, { tracks: [track('cta-rule-progress', 'progress', [k(1.15, 0), k(2, 1), k(3, 1)])] }),
];

const storyboardWorkflowLayers = [
  ...workflowLayers.filter(layer => !['workflow-violet-depth', 'workflow-mint-depth', 'route-line', 'near-plane-left', 'near-plane-right'].includes(layer.id)),
  line('workflow-active-connector', 24, 8.4, 572, 512, 775, 0, '#60a5fa', 4, { tracks: [track('workflow-active-connector-progress', 'progress', [k(1.1, 0), k(2.25, 1), k(8.4, 1)])], effects: [{ id: 'workflow-active-connector-glow', type: 'glow', enabled: true, amount: .42, radius: 12 }] }),
];
const storyboardEditorLayers = [
  ...editorLayers.filter(layer => !['editor-violet-depth', 'editor-mint-depth', 'editor-route', 'editor-near-left', 'editor-near-right'].includes(layer.id)),
  ...[0,1,2].map(index => rect(`editor-marker-${index}`, 24, 5.6, 690 + index * 165, 806, 8, 34, '#60a5fa', { transform: transform({ opacity: 0, y: 22 }), tracks: [track(`editor-marker-${index}-opacity`, 'transform.opacity', [k(1.55 + index * .428571, 0), k(1.7 + index * .428571, 1), k(5.6, 1)]), track(`editor-marker-${index}-y`, 'transform.y', [k(1.55 + index * .428571, 22), k(1.85 + index * .428571, 0), k(5.6, 0)])] })),
];

const project = {
  schemaVersion: 1,
  id: 'genmotion-launch-film',
  title: 'Genmotion — Native Motion for Agents',
  outputName: 'Genmotion-Launch-Story',
  width: 1920,
  height: 1080,
  fps: 30,
  seed: 604,
  anchors: [], parameters: [], parameterValues: {}, variants: [], motionLibraryPins: {}, compositions: [], captionStylePresets: [], captionPreviewLanguages: [], creativePreferences: [],
  mediaLedger: { version: 1, records: [] }, restrictedAssetAcceptances: [], referenceSources: [], referenceAdaptationMap: { version: 1, entries: [] }, referenceObservations: [], referencePreparations: [],
  brand: { background: '#07090d', foreground: '#f4f7f8', accent: '#60a5fa', muted: '#92a0b4', fonts: [{ family: 'Inter', file: 'assets/Inter.ttf' }], radius: 22, tone: ['spatial', 'precise', 'assured'] },
  scenes: [
    { id: 'outcome-hook', purpose: 'Frame motion as a directed system and build the Genmotion symbol in depth.', duration: 3.2, background: '#05070a', layers: hookLayers.filter(layer => layer.id !== 'hook-violet-field' && !layer.id.startsWith('hook-rail-')), transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: ['Empty stage; only the mark and promise move.'] },
    { id: 'product-reveal', purpose: 'Reveal the Creative IR promise as connected spatial planes.', duration: 3.6, background: '#07090d', layers: revealLayers.filter(layer => layer.id !== 'reveal-light-sheet'), transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: ['The only line is the active scene-graph connector.'] },
    { id: 'workflow-proof', purpose: 'Establish the real Studio workflow, then travel to its authored mechanism.', duration: 8.4, background: '#07090d', layers: storyboardWorkflowLayers, transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: ['Product surface is opaque and establishes before the macro push.'] },
    { id: 'editor-proof', purpose: 'Reveal the real Studio editor and land on preview and timeline.', duration: 5.6, background: '#07090d', layers: storyboardEditorLayers, transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, referenceDecisions: [], notes: ['The editorial message holds before the close-up begins.'] },
    { id: 'layer-roles', purpose: 'Explain how each authored dimension contributes before showing their spatial relationship.', duration: roleSceneDuration, background: '#07090d', layers: layerRoleLayers, transitionIn: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, transitionOut: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, referenceDecisions: [], notes: ['This pre-slide establishes the roles before the diagonal capability flight.'] },
    { id: 'capability-flight', purpose: 'Travel diagonally through the five authored dimensions and show their relationship.', duration: 4.6, background: '#05070a', layers: capabilityLayers.filter(layer => layer.id !== 'cap-route-a' && layer.id !== 'cap-copy'), transitionIn: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: ['The five authored layers retain the centered diagonal composition.'] },
    { id: 'native-payoff', purpose: 'Collapse the authored dimensions into one verified native master.', duration: 3.6, background: '#07090d', layers: payoffLayers, transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, referenceDecisions: [], notes: [] },
    { id: 'final-action', purpose: 'Resolve on the transparent Genmotion mark and repository action.', duration: 3, background: '#05070a', layers: ctaLayers, transitionIn: { type: 'crossfade', duration: .46, ease: 'cubic-in-out' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: ['Final action holds for at least 1.2 seconds.'] },
  ],
  audio: [{ id: 'launch-bed', src: 'assets/product-launch-commercial-306038.mp3', start: 0, trimStart: 0, duration: 45.453, volume: .72, gainDb: -2.5, fadeIn: .08, fadeOut: .55, loop: false, duckUnderVoice: false, muted: false, solo: false, pan: 0, balance: 0, locked: true, kind: 'music' }],
  metadata: { mode: 'launch-film', audience: 'motion designers, creative developers, and product teams', desiredAction: 'Create a first Genmotion project', storyboard: 'STORYBOARD.md', musicSource: 'user-supplied product-launch-advertising-commercial-music-306038.mp3', bpm: '130', authoringState: 'beat-synced-full-film-review' },
};

// The supplied track's opening phrase has major hits at these boundaries. Scene
// changes land exactly on those hits, while internal keys snap to the 130 BPM grid.
const beatBoundaries = [0, 4.598, 8.301, 15.685, 23.069, 26.761, 32.299, 39.544, 45.453];
const beatPeriod = 60 / 130;
const beatPhase = 0.444;
let sceneStart = 0;
for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex += 1) {
  const scene = project.scenes[sceneIndex];
  const oldDuration = scene.duration;
  const newDuration = beatBoundaries[sceneIndex + 1] - beatBoundaries[sceneIndex];
  const scale = newDuration / oldDuration;
  const snapLocalTime = (at) => {
    if (at <= 0) return 0;
    if (at >= oldDuration) return newDuration;
    const scaledGlobal = sceneStart + at * scale;
    const snappedGlobal = beatPhase + Math.round((scaledGlobal - beatPhase) / beatPeriod) * beatPeriod;
    return Math.max(0, Math.min(newDuration, snappedGlobal - sceneStart));
  };
  for (const layer of scene.layers) {
    layer.start *= scale;
    layer.duration = newDuration;
    for (const motionTrack of layer.tracks ?? []) {
      for (const keyframe of motionTrack.keyframes ?? []) keyframe.at = snapLocalTime(keyframe.at);
      const uniqueKeys = new Map();
      for (const keyframe of motionTrack.keyframes ?? []) uniqueKeys.set(keyframe.at.toFixed(6), keyframe);
      motionTrack.keyframes = [...uniqueKeys.values()].sort((a, b) => a.at - b.at);
    }
    for (const effect of layer.effects ?? []) {
      for (const property of ['amount', 'angle']) {
        const animated = effect[property];
        if (animated?.keyframes) {
          for (const keyframe of animated.keyframes) keyframe.at = snapLocalTime(keyframe.at);
          const uniqueKeys = new Map();
          for (const keyframe of animated.keyframes) uniqueKeys.set(keyframe.at.toFixed(6), keyframe);
          animated.keyframes = [...uniqueKeys.values()].sort((a, b) => a.at - b.at);
        }
      }
    }
  }
  scene.duration = newDuration;
  sceneStart += newDuration;
}

const editorScene = project.scenes.find(scene => scene.id === 'editor-proof');
const editorCopy = editorScene?.layers.find(layer => layer.id === 'editor-copy');
if (editorCopy) {
  editorCopy.tracks = [track('editor-copy-in', 'transform.opacity', [
    k(.923, 0),
    k(1.385, 1),
    k(4.615, 1),
    k(5.077, 0),
    k(editorScene.duration, 0),
  ])];
}

for (const scene of project.scenes) {
  scene.layers = scene.layers.filter(layer => !(layer.type === 'shape' && layer.shape === 'line') && !layer.id.startsWith('editor-marker-'));
  for (const layer of scene.layers) {
    if (layer.id === 'payoff-one-ir') layer.align = 'right';
    if (layer.id === 'payoff-native') layer.align = 'left';
    if (layer.id === 'payoff-verified') layer.align = 'center';
    if (layer.id === 'cta-url') layer.align = 'center';
    if (layer.id === 'mechanism-copy' || layer.id === 'proof-copy' || layer.id === 'editor-copy') layer.align = 'center';
    if (layer.id === 'roles-title') layer.align = 'center';
    if (layer.id.startsWith('cap-label-')) layer.align = 'center';
  }
}

const brandedJson = JSON.stringify(project, null, 2)
  .replaceAll('#6effc2', '#60a5fa')
  .replaceAll('#7258ff', '#2563eb')
  .replaceAll('#745cff', '#2563eb')
  .replaceAll('#866dff', '#2563eb');
fs.writeFileSync(path.join(root, 'genmotion.json'), `${brandedJson}\n`);
