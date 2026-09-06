/** Browser-only presentation of native-rendered frames. No project code executes here. */
export interface PlayerMetadata { title: string; width: number; height: number; fps: number; duration: number; frames: number; hasAudio?: boolean }
export type PlayerParameters = Record<string, unknown>;
export interface PlayerSource {
  metadata(parameters: PlayerParameters, signal: AbortSignal): Promise<PlayerMetadata>;
  frame(frame: number, parameters: PlayerParameters, signal: AbortSignal): Promise<Blob>;
  audioUrl?: (parameters: PlayerParameters) => string;
  withVariant?: (variant: string | undefined) => PlayerSource;
}
export interface PlayerOptions {
  controls?: boolean; loop?: boolean; autoplay?: boolean; muted?: boolean; volume?: number; playbackRate?: number;
  fit?: 'contain' | 'cover' | 'fill'; poster?: string; reducedMotion?: boolean;
  parameters?: PlayerParameters; variant?: string;
  telemetry?: (event: string, detail: unknown) => void;
}

export function httpPlayerSource(base: string, variant?: string): PlayerSource {
  const root = new URL(base, location.href);
  const url = (pathname: string, parameters: PlayerParameters): string => {
    const result = new URL(pathname.replace(/^\//, ''), root.href.endsWith('/') ? root : new URL(root.href + '/'));
    if (Object.keys(parameters).length) result.searchParams.set('parameters', JSON.stringify(parameters));
    if (variant !== undefined) result.searchParams.set('variant', variant);
    return result.href;
  };
  const source: PlayerSource = {
    withVariant: (value) => httpPlayerSource(base, value),
    metadata: async (parameters, signal) => { const response = await fetch(url('api/project', parameters), { signal }); if (!response.ok) throw new Error(`Player metadata failed (${response.status})`); const metadata = await response.json() as PlayerMetadata; if (!signal.aborted) { if (metadata.hasAudio) source.audioUrl = (values) => url('api/audio.m4a', values); else delete source.audioUrl; } return metadata; },
    frame: async (frame, parameters, signal) => { const response = await fetch(url(`frame/${frame}.png`, parameters), { signal }); if (!response.ok) throw new Error(`Native frame failed (${response.status})`); return await response.blob(); },
  };
  return source;
}

export interface ThumbnailOptions { frame?: number; parameters?: PlayerParameters; fit?: 'contain' | 'cover' | 'fill'; alt?: string }

/** A cancellable native-frame thumbnail. The browser only decodes the returned image. */
export class GenmotionThumbnail {
  readonly element: HTMLImageElement;
  readonly ready: Promise<void>;
  private request: AbortController | undefined;
  private url: string | undefined;
  private disposed = false;
  constructor(container: HTMLElement, private readonly source: PlayerSource, options: ThumbnailOptions = {}) {
    this.element = document.createElement('img'); this.element.alt = options.alt ?? 'Composition thumbnail';
    this.element.style.cssText = `display:block;width:100%;height:auto;object-fit:${options.fit ?? 'contain'}`;
    container.append(this.element); this.ready = this.update(options.frame ?? 0, options.parameters ?? {});
    void this.ready.catch(() => undefined);
  }
  async update(frame: number, parameters: PlayerParameters = {}): Promise<void> {
    if (this.disposed) throw new Error('Thumbnail has been disposed');
    if (!Number.isFinite(frame) || frame < 0) throw new Error('Thumbnail frame must be finite and nonnegative');
    this.request?.abort(); const controller = new AbortController(); this.request = controller;
    let url: string | undefined;
    try {
      const values = structuredClone(parameters), metadata = await this.source.metadata(values, controller.signal);
      if (controller.signal.aborted) return;
      if (!Number.isInteger(metadata.frames) || frame >= metadata.frames) throw new Error('Thumbnail frame is outside the composition');
      const blob = await this.source.frame(frame, values, controller.signal);
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); const image = new Image(); image.src = url; await image.decode();
      if (controller.signal.aborted) return;
      const previous = this.url; this.url = url; this.element.src = url; url = undefined;
      if (previous) URL.revokeObjectURL(previous);
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { if (url) URL.revokeObjectURL(url); }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.request?.abort(); if (this.url) URL.revokeObjectURL(this.url); this.element.remove(); }
}

export class GenmotionPlayer extends EventTarget {
  readonly element: HTMLDivElement;
  readonly image: HTMLImageElement;
  readonly audio: HTMLAudioElement;
  readonly ready: Promise<void>;
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((error: unknown) => void) | undefined;
  private metadataValue: PlayerMetadata | undefined;
  private parameters: PlayerParameters;
  private frameValue = 0;
  private playingValue = false;
  private playAttempt = 0;
  private playPending = false;
  private rateValue = 1;
  private loopValue = false;
  private disposed = false;
  private generation = 0;
  private request: AbortController | undefined;
  private metadataRequest: AbortController | undefined;
  private frameUrl: string | undefined;
  private animation = 0;
  private lastClock = 0;
  private waiting = false;
  private readonly listeners = new AbortController();
  private readonly playButton: HTMLButtonElement;
  private readonly scrub: HTMLInputElement;
  private readonly status: HTMLOutputElement;
  private readonly reducedMotion: boolean;

  constructor(container: HTMLElement, private source: PlayerSource, private readonly options: PlayerOptions = {}) {
    super();
    if (options.variant !== undefined) { if (!source.withVariant) throw new Error('This source does not support named variants'); this.source = source.withVariant(options.variant); }
    this.parameters = structuredClone(options.parameters ?? {});
    this.element = document.createElement('div'); this.element.className = 'genmotion-player'; this.element.tabIndex = 0;
    this.element.setAttribute('role', 'region'); this.element.setAttribute('aria-label', 'Genmotion player');
    this.element.style.cssText = 'position:relative;width:100%;display:grid;gap:8px;background:transparent;color:inherit';
    this.image = document.createElement('img'); this.image.alt = 'Composition preview'; this.image.draggable = false;
    this.image.style.cssText = 'display:block;width:100%;height:100%;min-height:0;object-fit:' + (options.fit ?? 'contain');
    if (options.poster) this.image.src = options.poster;
    this.audio = document.createElement('audio'); this.audio.preload = 'auto'; this.audio.hidden = true;
    const toolbar = document.createElement('div'); toolbar.style.cssText = `display:${options.controls === false ? 'none' : 'flex'};align-items:center;gap:8px`; toolbar.hidden = options.controls === false;
    this.playButton = document.createElement('button'); this.playButton.type = 'button'; this.playButton.textContent = 'Play';
    this.scrub = document.createElement('input'); this.scrub.type = 'range'; this.scrub.min = '0'; this.scrub.step = '1'; this.scrub.value = '0'; this.scrub.style.flex = '1'; this.scrub.setAttribute('aria-label', 'Current frame');
    this.status = document.createElement('output'); this.status.textContent = 'Loading';
    const fullscreen = document.createElement('button'); fullscreen.type = 'button'; fullscreen.textContent = 'Fullscreen';
    const mute = document.createElement('button'); mute.type = 'button'; mute.textContent = 'Mute';
    const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.01'; volume.value = String(options.volume ?? 1); volume.style.width = '70px'; volume.setAttribute('aria-label', 'Volume');
    const rate = document.createElement('select'); rate.setAttribute('aria-label', 'Playback speed');
    for (const value of [.25, .5, 1, 1.5, 2, 4]) { const option = document.createElement('option'); option.value = String(value); option.textContent = `${value}×`; option.selected = value === (options.playbackRate ?? 1); rate.append(option); }
    toolbar.append(this.playButton, this.scrub, this.status, mute, volume, rate, fullscreen); this.element.append(this.image, toolbar, this.audio); container.append(this.element);
    const signal = this.listeners.signal;
    this.playButton.addEventListener('click', () => { if (this.playing) this.pause(); else void this.play().catch(() => undefined); }, { signal });
    this.scrub.addEventListener('input', () => { this.pause(); void this.seekFrame(Number(this.scrub.value)).catch(() => undefined); }, { signal });
    fullscreen.addEventListener('click', () => { void this.requestFullscreen().catch((error: unknown) => this.emit('error', error)); }, { signal });
    mute.addEventListener('click', () => { this.muted = !this.muted; mute.textContent = this.muted ? 'Unmute' : 'Mute'; }, { signal });
    volume.addEventListener('input', () => { this.volume = Number(volume.value); }, { signal });
    rate.addEventListener('change', () => { this.playbackRate = Number(rate.value); }, { signal });
    this.audio.addEventListener('volumechange', () => { mute.textContent = this.muted ? 'Unmute' : 'Mute'; mute.setAttribute('aria-pressed', String(this.muted)); volume.value = String(this.volume); }, { signal });
    this.element.addEventListener('keydown', (event) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button,a,[contenteditable]')) return;
      if (event.code === 'Space' || event.code === 'KeyK') { event.preventDefault(); if (this.playing) this.pause(); else void this.play().catch(() => undefined); }
      else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); this.pause(); void this.seekFrame(this.frame + (event.code === 'ArrowRight' ? 1 : -1)).catch(() => undefined); }
      else if (event.code === 'KeyM') this.muted = !this.muted;
    }, { signal });
    this.audio.addEventListener('waiting', () => { this.lastClock = 0; this.emit('waiting', { reason: 'audio' }); }, { signal });
    this.audio.addEventListener('error', () => this.emit('error', new Error('Player audio failed to load')), { signal });
    this.reducedMotion = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playbackRate = options.playbackRate ?? 1; this.volume = options.volume ?? 1; this.muted = options.muted ?? false; this.loop = options.loop ?? false;
    this.ready = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    void this.setParameters(this.parameters).catch((error: unknown) => this.rejectReady?.(error));
    void this.ready.then(async () => { if (options.autoplay && !this.reducedMotion) await this.play(); }).catch(() => undefined);
    // The ready promise remains observable, without an unhandled rejection when used as a component.
    void this.ready.catch(() => undefined);
  }

  get metadata(): PlayerMetadata | undefined { return this.metadataValue ? { ...this.metadataValue } : undefined; }
  get frame(): number { return this.frameValue; }
  get currentTime(): number { return this.metadataValue ? this.frameValue / this.metadataValue.fps : 0; }
  get playing(): boolean { return this.playingValue; }
  get playbackRate(): number { return this.rateValue; }
  set playbackRate(value: number) { if (!Number.isFinite(value) || value < .0625 || value > 16) throw new Error('Playback rate must be between 0.0625 and 16'); this.rateValue = value; this.audio.playbackRate = value; const select = this.element.querySelector<HTMLSelectElement>('select[aria-label="Playback speed"]'); if (select) { if (!Array.from(select.options).some(option => Number(option.value) === value)) { const option = document.createElement('option'); option.value = String(value); option.textContent = value + '×'; select.append(option); } select.value = String(value); } this.lastClock = 0; this.emit('ratechange', value); }
  get volume(): number { return this.audio.volume; }
  set volume(value: number) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Volume must be between zero and one'); this.audio.volume = value; this.emit('volumechange', value); }
  get muted(): boolean { return this.audio.muted; }
  set muted(value: boolean) { this.audio.muted = value; this.emit('volumechange', { volume: this.volume, muted: value }); }
  get loop(): boolean { return this.loopValue; }
  set loop(value: boolean) { this.loopValue = value; }

  private emit(name: string, detail: unknown): void {
    if (this.disposed) return;
    this.dispatchEvent(new CustomEvent(name, { detail })); this.element.dispatchEvent(new CustomEvent(`genmotion:${name}`, { detail, bubbles: true }));
    try { this.options.telemetry?.(name, detail); } catch { /* Telemetry cannot interrupt playback. */ }
  }
  private assertAlive(): void { if (this.disposed) throw new Error('Player has been disposed'); }
  async setParameters(parameters: PlayerParameters): Promise<void> {
    this.assertAlive(); this.pause(); this.request?.abort(); this.metadataRequest?.abort();
    const generation = ++this.generation, controller = new AbortController(); this.metadataRequest = controller;
    const nextParameters = structuredClone(parameters); this.emit('buffering', { reason: 'metadata' });
    try {
      const metadata = await this.source.metadata(nextParameters, controller.signal);
      if (generation !== this.generation || this.disposed) return;
      if (![metadata.width, metadata.height, metadata.fps, metadata.duration, metadata.frames].every((value) => Number.isFinite(value) && value > 0) || !Number.isInteger(metadata.frames)) throw new Error('Invalid player metadata');
      this.metadataValue = metadata; this.parameters = nextParameters; this.scrub.max = String(metadata.frames - 1); this.image.style.aspectRatio = `${metadata.width}/${metadata.height}`;
      this.image.alt = metadata.title || 'Composition preview';
      if (this.source.audioUrl) this.audio.src = this.source.audioUrl(nextParameters); else this.audio.removeAttribute('src');
      this.audio.load();
      await this.seekFrame(Math.min(this.frameValue, metadata.frames - 1)); if (generation !== this.generation || this.disposed) return; this.emit('parameterschange', structuredClone(this.parameters));
    } catch (error) { if (!controller.signal.aborted && generation === this.generation) { this.emit('error', error); throw error; } }
  }
  async setVariant(variant: string | undefined): Promise<void> { this.assertAlive(); if (!this.source.withVariant) throw new Error('This source does not support named variants'); this.source = this.source.withVariant(variant); await this.setParameters(this.parameters); }
  async seek(time: number): Promise<void> { if (!this.metadataValue) throw new Error('Player metadata is not ready'); if (!Number.isFinite(time)) throw new Error('Seek time must be finite'); await this.seekFrame(time * this.metadataValue.fps); }
  async seekFrame(frame: number): Promise<void> { this.lastClock = 0; await this.drawFrame(frame); }
  private async drawFrame(frame: number, playback = false): Promise<void> {
    this.assertAlive(); if (!this.metadataValue) throw new Error('Player metadata is not ready'); if (!Number.isFinite(frame)) throw new Error('Frame must be finite');
    const target = Math.max(0, Math.min(this.metadataValue.frames - 1, frame)), generation = this.generation;
    if (!playback && this.source.audioUrl) this.audio.currentTime = target / this.metadataValue.fps;
    this.request?.abort(); const controller = new AbortController(); this.request = controller; this.waiting = true; this.emit('buffering', { frame: target });
    let url: string | undefined;
    try {
      const blob = await this.source.frame(target, this.parameters, controller.signal);
      if (controller.signal.aborted || this.disposed || generation !== this.generation) return;
      url = URL.createObjectURL(blob); const pending = new Image(); pending.src = url; await pending.decode();
      if (controller.signal.aborted || this.disposed || generation !== this.generation) return;
      const previous = this.frameUrl; this.frameUrl = url; this.image.src = url; url = undefined; if (previous) URL.revokeObjectURL(previous);
      this.frameValue = target; this.scrub.value = String(target); this.status.textContent = `${this.currentTime.toFixed(2)} / ${this.metadataValue.duration.toFixed(2)} s`;
      this.emit('frame', { frame: target, time: this.currentTime }); this.emit('timeupdate', this.currentTime); this.emit('resume', { frame: target });
      if (this.resolveReady) { this.resolveReady(); this.resolveReady = undefined; this.rejectReady = undefined; this.emit('ready', this.metadataValue); }
    } catch (error) { if (!controller.signal.aborted && generation === this.generation) { this.pause(); this.emit('error', error); throw error; } }
    finally { if (url) URL.revokeObjectURL(url); if (this.request === controller) this.waiting = false; }
  }
  async play(): Promise<void> {
    this.assertAlive(); if (!this.metadataValue) throw new Error('Player metadata is not ready'); if (this.playing || this.playPending) return;
    const attempt = ++this.playAttempt; this.playPending = true;
    try {
    if (this.frameValue >= this.metadataValue.frames - 1) await this.seekFrame(0);
    if (this.source.audioUrl) { try { await this.audio.play(); } catch (error) { this.emit('autoplayblocked', error); throw error; } }
    if (this.disposed || attempt !== this.playAttempt) return;
    this.playingValue = true; this.playButton.textContent = 'Pause'; this.lastClock = 0; this.emit('play', { time: this.currentTime });
    this.animation = requestAnimationFrame(this.tick);
    } finally { if (attempt === this.playAttempt) this.playPending = false; }
  }
  pause(): void { this.playAttempt += 1; this.playPending = false; const wasPlaying = this.playingValue; this.playingValue = false; cancelAnimationFrame(this.animation); this.audio.pause(); this.lastClock = 0; this.playButton.textContent = 'Play'; if (wasPlaying) this.emit('pause', { time: this.currentTime }); }
  private readonly tick = (now: number): void => {
    if (!this.playing || this.disposed || !this.metadataValue) return;
    if (!this.lastClock) this.lastClock = now;
    if (!this.waiting) {
      const elapsed = (now - this.lastClock) / 1000, advance = Math.floor(elapsed * this.metadataValue.fps * this.rateValue);
      if (advance > 0) {
        let target = this.frameValue + advance;
        if (this.source.audioUrl && this.audio.readyState >= 2 && !this.audio.paused) target = Math.floor(this.audio.currentTime * this.metadataValue.fps);
        this.lastClock += advance / (this.metadataValue.fps * this.rateValue) * 1000;
        if (target >= this.metadataValue.frames) {
          if (this.loop) { target %= this.metadataValue.frames; this.audio.currentTime = target / this.metadataValue.fps; if (this.source.audioUrl) void this.audio.play().catch((error: unknown) => this.emit('error', error)); this.emit('loop', {}); }
          else { this.pause(); void this.seekFrame(this.metadataValue.frames - 1).then(() => this.emit('ended', {})).catch(() => undefined); return; }
        }
        void this.drawFrame(target, true).catch(() => undefined);
      }
    }
    this.animation = requestAnimationFrame(this.tick);
  };
  async requestFullscreen(): Promise<void> { this.assertAlive(); await this.element.requestFullscreen(); }
  dispose(): void { if (this.disposed) return; this.pause(); this.request?.abort(); this.metadataRequest?.abort(); this.listeners.abort(); this.rejectReady?.(new DOMException('Player disposed', 'AbortError')); this.resolveReady = undefined; this.rejectReady = undefined; if (this.frameUrl) URL.revokeObjectURL(this.frameUrl); this.audio.removeAttribute('src'); this.audio.load(); this.element.remove(); this.disposed = true; }
}

export function registerGenmotionPlayer(tagName = 'genmotion-player'): void {
  if (customElements.get(tagName)) return;
  customElements.define(tagName, class extends HTMLElement {
    static observedAttributes = ['src', 'parameters', 'variant', 'loop', 'muted'];
    player: GenmotionPlayer | undefined;
    connectedCallback(): void { this.mount(); }
    disconnectedCallback(): void { this.player?.dispose(); this.player = undefined; }
    attributeChangedCallback(name: string): void {
      if (!this.isConnected) return;
      if (name === 'src') this.mount();
      else if (name === 'variant' && this.player) void this.player.setVariant(this.getAttribute('variant') ?? undefined).catch(() => undefined);
      else if (name === 'loop' && this.player) this.player.loop = this.hasAttribute('loop');
      else if (name === 'muted' && this.player) this.player.muted = this.hasAttribute('muted');
      else if (name === 'parameters' && this.player) { try { void this.player.setParameters(JSON.parse(this.getAttribute('parameters') ?? '{}') as PlayerParameters).catch(() => undefined); } catch (error) { this.dispatchEvent(new CustomEvent('genmotion:error', { detail: error, bubbles: true })); } }
    }
    private mount(): void {
      this.player?.dispose(); this.player = undefined;
      const source = this.getAttribute('src'); if (!source) return;
      try { this.player = new GenmotionPlayer(this, httpPlayerSource(source, this.getAttribute('variant') ?? undefined), { controls: !this.hasAttribute('no-controls'), autoplay: this.hasAttribute('autoplay'), loop: this.hasAttribute('loop'), muted: this.hasAttribute('muted'), parameters: JSON.parse(this.getAttribute('parameters') ?? '{}') as PlayerParameters }); }
      catch (error) { this.dispatchEvent(new CustomEvent('genmotion:error', { detail: error, bubbles: true })); }
    }
  });
}
