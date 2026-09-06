# Embeddable native Player

The browser Player displays frames produced by the native renderer. It never evaluates composition JavaScript or recreates the composition with DOM elements. Run `genmotion preview PROJECT` and open `/embed` for the Web Component host; `/player.js` serves the browser module from the built package.

```html
<genmotion-player src="http://127.0.0.1:4178/" loop></genmotion-player>
<script type="module">
  import { registerGenmotionPlayer } from './player.js';
  registerGenmotionPlayer();
</script>
```

The default server accepts same-origin browser requests. Programmatic `startPreview` accepts an explicit `allowedOrigins` list for embedding from another origin. Frame responses are not stored in the browser cache; the server bounds its shared PNG cache to 90 frames and 64 MiB, with at most four in-flight frames. Parameter configurations have an eight-entry cache and four concurrent preparation slots.

```js
import { GenmotionPlayer, httpPlayerSource } from './player.js';
const player = new GenmotionPlayer(container, httpPlayerSource('/'), {
  loop: false, controls: true, fit: 'contain', muted: false,
  parameters: { headline: 'Hello' },
  telemetry: (event, detail) => console.log(event, detail)
});
await player.ready;
await player.seek(1.25);
await player.seekFrame(37.5);
await player.setParameters({ headline: 'Updated' });
await player.play();
player.pause();
player.playbackRate = 1.5;
player.volume = 0.8;
player.muted = true;
player.dispose();
```

Use the constructor in a framework's mounted lifecycle and `dispose` in its cleanup lifecycle, or use the Web Component directly. The `player` property on the mounted component exposes the same controller. Updating its JSON `parameters` attribute refreshes the native composition; changing `src` replaces and disposes the previous controller. Removing the component cancels requests, playback and event listeners and revokes image URLs.

Events on the controller are `ready`, `play`, `pause`, `frame`, `timeupdate`, `ended`, `loop`, `error`, `buffering`, `waiting`, `resume`, `parameterschange`, `ratechange`, `volumechange` and `autoplayblocked`. DOM events use the `genmotion:` prefix and bubble. The optional telemetry callback is local; no analytics endpoint is configured.

Space/K toggles playback, arrows step frames, and M toggles mute when the player has focus. Input controls retain their native keyboard behavior. Controls include seek, playback rate, volume, mute and fullscreen. Autoplay respects reduced-motion preferences and reports browser audio policy failures. `poster` and `fit` support responsive contain/cover/fill presentation and transparent frames. A custom `PlayerSource` can connect another native frame service and optional audio URL.

Audio uses the processed native mix and the audio clock during playback. The preview server lazily prepares AAC, supports HTTP range requests, caps each cached mix at 64 MiB, retains at most eight mixes and allows two concurrent audio preparations. Closing the preview server cancels audio work and removes its temporary files.

Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md). Framework-specific packages, media-session integration, review links and annotation tools remain separate checklist work.

Named configurations are selected with `await player.setVariant('blue')`; pass `undefined` to return to the project's active values. Explicit player parameters take precedence over the selected variant. HTTP metadata, frames and audio share the same validated `variant` query. The Web Component accepts a `variant` attribute. Custom transports opt in with `PlayerSource.withVariant`; unsupported transports refuse variant selection.

`GenmotionThumbnail` displays one native frame without starting playback:

```js
const thumbnail = new GenmotionThumbnail(container, httpPlayerSource('/', 'blue'), {
  frame: 15, parameters: { headline: 'Review' }, fit: 'contain'
});
await thumbnail.ready;
await thumbnail.update(30, { headline: 'Revised' });
thumbnail.dispose();
```

Updates cancel superseded requests and retain the last accepted image until its replacement decodes. Disposal cancels pending work and revokes object URLs. Both Player and thumbnail are public SDK exports; browser clients load the standalone player module to avoid importing Node renderer dependencies.
