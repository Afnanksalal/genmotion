/** Browser playback scheduler: bounded decoded cache, two requests, revision/seek epochs. */
export const studioPlaybackScript = String.raw`
const studioPlayback = (() => {
    const surface = document.createElement('canvas');
    surface.id = 'previewCanvas';
    surface.setAttribute('aria-label', 'Native composition playback');
    surface.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none';
    document.querySelector('#previewImage')?.after(surface);
    const context = surface.getContext('2d');
    const release = item => { if (item.bitmap)
        item.bitmap.close(); if (item.url)
        URL.revokeObjectURL(item.url); };
    const cache = new Map(), pending = new Map();
    let epoch = 0, revision = '', staleRevision = '', wanted = 0, last = -1, playing = false, edge = 0, bytes = 0, displayUrl = null, disposed = false, quality = 1, retryTimer = 0;
    let presented = 0, windowStart = performance.now(), lastQualityChange = 0, latency = 0, errors = 0;
    const budget = 64 * 1024 * 1024, limit = 48, parallel = 2;
    const stats = { presented: 0, requests: 0, discarded: 0, errors: 0, cacheBytes: 0, inflight: 0, displayedFrame: null, previewFps: 0, width: 0, height: 0 };
    function dimensions() { const image = document.querySelector('#previewImage'), box = image?.getBoundingClientRect(); const desired = Math.max(box?.width || 0, box?.height || 0) * Math.min(devicePixelRatio || 1, 2); return Math.max(128, Math.min(2048, Math.ceil(Math.max(128, desired) * quality / 128) * 128)); }
    function clear() { epoch++; staleRevision = ''; for (const task of pending.values())
        task.abort(); pending.clear(); for (const item of cache.values())
        if (!item.url || item.url !== displayUrl)
            release(item); cache.clear(); bytes = 0; last = -1; clearTimeout(retryTimer); stats.inflight = 0; stats.cacheBytes = 0; }
    function trim() { for (const [frame, item] of cache) {
        if (bytes <= budget && cache.size <= limit)
            break;
        if (item.url && item.url === displayUrl)
            continue;
        cache.delete(frame);
        bytes -= item.bytes;
        release(item);
    } stats.cacheBytes = bytes; }
    function present() { const entry = cache.get(wanted) || [...cache.entries()].filter(([frame]) => playing && frame <= wanted && frame > last).sort((a, b) => b[0] - a[0])[0]?.[1]; if (!entry || entry.frame === last)
        return; const image = document.querySelector('#previewImage'); if (!image)
        return; const previous = displayUrl; if (entry.bitmap) {
        displayUrl = null;
        if (surface.width !== entry.width || surface.height !== entry.height) {
            surface.width = entry.width;
            surface.height = entry.height;
        }
        context.clearRect(0, 0, surface.width, surface.height);
        context.drawImage(entry.bitmap, 0, 0);
        surface.style.display = 'block';
        image.style.visibility = 'hidden';
    }
    else {
        displayUrl = entry.url;
        image.src = entry.url;
        surface.style.display = 'none';
        image.style.visibility = 'visible';
    } image.dataset.presentedFrame = String(entry.frame); image.dataset.previewRevision = revision; last = entry.frame; stats.displayedFrame = last; stats.presented++; presented++; stats.width = entry.width; stats.height = entry.height; if (!playing || stats.presented === 1) {
        const badge = document.querySelector('#previewPerformance');
        if (badge)
            badge.textContent = stats.width + '×' + stats.height;
    } if (previous && ![...cache.values()].some(item => item.url === previous))
        URL.revokeObjectURL(previous); trim(); const now = performance.now(); if (now - windowStart >= 1000) {
        stats.previewFps = +(presented * 1000 / (now - windowStart)).toFixed(1);
        presented = 0;
        windowStart = now;
        const badge = document.querySelector('#previewPerformance');
        if (badge)
            badge.textContent = (playing ? stats.previewFps + ' fps · ' : '') + stats.width + '×' + stats.height;
    } }
    function bounds() { const range = (S.project.ranges || []).find(range => range.id === S.loopRangeId && range.end <= duration()); return range ? { start: Math.ceil(range.start * projectMetric('fps')), end: Math.ceil(range.end * projectMetric('fps')) } : S.liveRange ? { start: S.liveRange.start, end: S.liveRange.end + 1 } : { start: 0, end: frames() }; }
    function pump() { if (disposed || !revision || staleRevision === revision)
        return; present(); const range = bounds(), ahead = playing ? Math.min(24, Math.ceil(projectMetric('fps') / 2), Math.max(2, Math.floor(budget / Math.max(1, edge * edge * 4.5)) - 1)) : 1; for (let offset = 0; offset < ahead && pending.size < parallel; offset++) {
        const frame = playing ? range.start + ((Math.max(range.start, wanted) - range.start + offset) % Math.max(1, range.end - range.start)) : wanted;
        if (pending.has(frame))
            continue;
        if (cache.has(frame) || pending.has(frame))
            continue;
        load(frame);
    } }
    async function load(frame) { const token = epoch, controller = new AbortController(); pending.set(frame, controller); stats.requests++; stats.inflight = pending.size; const start = performance.now(); let url; try {
        const suffix = playing ? '&preview=1&maxEdge=' + edge : '';
        const response = await fetch('/frame/' + frame + (playing ? '.rgba' : '.png') + '?r=' + encodeURIComponent(revision) + suffix, { signal: controller.signal, headers: { 'x-genmotion-preview': '1' } });
        if (token !== epoch) return;
            if (response.status === 204) { staleRevision = revision; return; }
            if (!response.ok)
            throw new Error('Preview frame failed (' + response.status + ')');
        if (token !== epoch)
            return;
        let item;
        if (playing) {
            const width = Number(response.headers.get('x-preview-width')), height = Number(response.headers.get('x-preview-height'));
            const buffer = await response.arrayBuffer();
            if (token !== epoch)
                return;
            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 || width > 2048 || height > 2048 || buffer.byteLength !== width * height * 4)
                throw new Error('Invalid native preview frame');
            const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(buffer), width, height));
            if (token !== epoch) {
                bitmap.close();
                stats.discarded++;
                return;
            }
            item = { frame, bitmap, width, height, bytes: width * height * 4 };
        }
        else {
            const blob = await response.blob();
            if (token !== epoch)
                return;
            url = URL.createObjectURL(blob);
            const image = new Image();
            image.src = url;
            await image.decode();
            if (token !== epoch) {
                stats.discarded++;
                return;
            }
            item = { frame, url, image, width: image.naturalWidth, height: image.naturalHeight, bytes: image.naturalWidth * image.naturalHeight * 4 + blob.size };
            url = null;
        }
        cache.set(frame, item);
        bytes += item.bytes;
        errors = 0;
        latency = latency ? latency * .85 + (performance.now() - start) * .15 : performance.now() - start;
        present();
        trim();
    }
    catch (error) {
        if (!controller.signal.aborted) {
            stats.errors++;
            errors++;
            const badge = document.querySelector('#previewPerformance');
            if (badge && errors >= 2)
                badge.textContent = 'Preview unavailable — retrying';
        }
    }
    finally {
        if (url)
            URL.revokeObjectURL(url);
        if (pending.get(frame) === controller)
            pending.delete(frame);
        stats.inflight = pending.size;
        if (token === epoch && !disposed) {
            if (errors) {
                clearTimeout(retryTimer);
                retryTimer = setTimeout(pump, Math.min(2000, 100 * 2 ** Math.min(errors, 4)));
            }
            else
                queueMicrotask(pump);
        }
    } }
    function request(frame, nextRevision, isPlayback) { if (disposed)
        return; const nextPlaying = Boolean(isPlayback), now = performance.now(); let nextEdge = edge; if (nextPlaying && (!playing || revision !== nextRevision)) {
        quality = 1;
        nextEdge = dimensions();
        latency = 0;
        windowStart = now;
        presented = 0;
        lastQualityChange = now;
    } if (nextPlaying && playing && latency > 0 && now - lastQualityChange > 1000) {
        const target = 1000 / projectMetric('fps') * parallel;
        const behind = last >= 0 && frame >= last && frame - last > 2;
        if ((latency > target * 1.05 || behind) && quality > .35) {
            quality = Math.max(.35, quality * Math.min(.75, Math.sqrt(target / latency) * .9));
            nextEdge = dimensions();
            lastQualityChange = now;
        }
        else if (latency < target * .5 && quality < 1 && now - lastQualityChange > 5000) {
            quality = Math.min(1, quality * 1.1);
            nextEdge = dimensions();
            lastQualityChange = now;
        }
    } if (nextRevision !== revision || nextPlaying !== playing || nextEdge !== edge || (!nextPlaying && frame !== wanted))
        clear(); if (nextPlaying && frame < wanted)
        last = -1; revision = nextRevision; playing = nextPlaying; edge = nextEdge; wanted = frame; pump(); }
    function setPlaying(value) { if (!value && playing)
        request(S.frame, S.revision, false); }
    function dispose() { disposed = true; clear(); if (displayUrl)
        URL.revokeObjectURL(displayUrl); displayUrl = null; }
    window.addEventListener('pagehide', dispose, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) {
        S.playing = false;
        S.lastTick = 0;
        updatePlayButton();
    } });
    const badge = document.createElement('span');
    badge.id = 'previewPerformance';
    badge.className = 'monitor-badge';
    badge.style.cssText = 'top:auto;bottom:12px;pointer-events:none';
    badge.textContent = 'Preparing preview';
    badge.setAttribute('aria-label', 'Preview performance');
    document.querySelector('#frameBadge')?.after(badge);
    return { request, setPlaying, dispose, stats };
})();
`;
