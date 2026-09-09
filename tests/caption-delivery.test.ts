import { describe, expect, it } from 'vitest';
import { createCaptionDeliveryPlan, captionLayerEnabled, captionLayerStyle, projectSchema, renderFramePng } from '../src/index.js';

const project = () => projectSchema.parse({
  schemaVersion: 1, id: 'caption-delivery', title: 'Caption delivery', outputName: 'launch', width: 320, height: 180, fps: 30,
  brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
  captionStylePresets: [{ id: 'immersive', name: 'Immersive', style: { color: '#ffeeaa', outlineWidth: 2, padding: 12 } }], captionPreviewLanguages: ['fr'],
  scenes: [{ id: 'main', purpose: 'Captions', duration: 2, background: '#000', layers: [
    { id: 'en', type: 'caption', language: 'en-US', trackName: 'English', defaultTrack: true, x: 20, y: 110, width: 280, height: 50, fontFamily: 'Arial', fontSize: 24, color: '#fff', stylePresetId: 'immersive', enter: { type: 'slide-up', duration: .25, distance: 20, ease: 'cubic-out' }, exit: { type: 'fade', duration: .2, distance: 0, ease: 'linear' }, cues: [{ id: 'en-1', start: .1, end: 1.8, text: 'Make motion feel alive' }] },
    { id: 'fr', type: 'caption', language: 'fr', trackName: 'Français', defaultTrack: true, x: 20, y: 110, width: 280, height: 50, fontFamily: 'Arial', fontSize: 24, color: '#fff', cues: [{ id: 'fr-1', start: .1, end: 1.8, text: 'Donnez vie au mouvement' }] },
  ] }],
});

describe('caption delivery', () => {
  it('resolves named presets and routes preview languages', () => {
    const value = project(), english = value.scenes[0]!.layers[0]!, french = value.scenes[0]!.layers[1]!;
    if (english.type !== 'caption' || french.type !== 'caption') throw new Error('fixture');
    expect(captionLayerStyle(value, english)).toMatchObject({ color: '#ffeeaa', outlineWidth: 2, padding: 12 });
    expect(captionLayerEnabled(value, english)).toBe(false); expect(captionLayerEnabled(value, french)).toBe(true);
  });
  it('creates sidecar and embedded plans with absolute timing and stream metadata', () => {
    const value = project(), sidecar = createCaptionDeliveryPlan(value, { mode: 'sidecar', languages: ['en-US'], format: 'vtt' });
    expect(sidecar.artifacts[0]).toMatchObject({ filename: 'launch.en-US.vtt', mediaType: 'text/vtt' });
    expect(sidecar.artifacts[0]!.content).toContain('00:00:00.100 --> 00:00:01.800');
    const embedded = createCaptionDeliveryPlan(value, { mode: 'embedded', languages: ['fr'], format: 'srt', container: 'mp4' });
    expect(embedded.mux).toMatchObject({ container: 'mp4', codec: 'mov_text', streams: [{ language: 'fr', title: 'Français', default: true }] });
  });
  it('renders deterministic caption entry, hold, and exit frames', async () => {
    const value = project(); value.captionPreviewLanguages = ['en-US'];
    const frames = await Promise.all([4, 15, 50, 53].map((frame) => renderFramePng(value, process.cwd(), frame)));
    expect(frames.every((frame) => frame.length > 500)).toBe(true); expect(frames[0]!.equals(frames[1]!)).toBe(false); expect(frames[2]!.equals(frames[3]!)).toBe(false);
    expect((await renderFramePng(value, process.cwd(), 15)).equals(frames[1]!)).toBe(true);
  });
  it('rejects ambiguous defaults and incompatible requests', () => {
    const value = project(), clone = structuredClone(value), layer = clone.scenes[0]!.layers[1]!; if (layer.type === 'caption') layer.language = 'en-US';
    expect(() => createCaptionDeliveryPlan(clone, { mode: 'embedded', container: 'mp4', languages: ['en-US'] })).toThrow(/more than one default/);
    expect(() => createCaptionDeliveryPlan(value, { mode: 'embedded', languages: ['en-US'] })).toThrow(/container/);
    expect(() => createCaptionDeliveryPlan(value, { mode: 'sidecar', languages: ['de'] })).toThrow(/No caption tracks/);
  });
});
