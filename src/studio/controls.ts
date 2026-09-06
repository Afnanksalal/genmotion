/** Shared Studio controls. Native inputs retain form semantics; all visible chrome is app-owned. */
export const studioControlsCss = String.raw`
:root{color-scheme:dark}.agent-bar #agentInput{flex:1 1 0;width:0;min-width:0}.agent-bar #sendRequest{flex:0 0 auto}@media(max-width:1000px){.app{grid-template-rows:96px minmax(0,1fr) 56px}.topbar{flex-wrap:wrap;gap:0 8px;align-content:center}.tabs{order:10;width:100%;height:43px;justify-content:center;margin:0;border-top:1px solid var(--line)}.top-actions{margin-left:auto}.inspector{top:96px}}button,input,textarea,select{font:inherit}button:disabled{opacity:.45;cursor:not-allowed}input:not([type=checkbox]):not([type=range]):not([type=file]),textarea{color:var(--text);background:#101014;border:1px solid var(--line);border-radius:7px;padding:8px;min-width:0}input:user-invalid,textarea:user-invalid,input[aria-invalid=true],textarea[aria-invalid=true]{border-color:#ed737b}input[type=number]{appearance:textfield;-moz-appearance:textfield}input[type=search]::-webkit-search-cancel-button{appearance:none}*{scrollbar-width:thin;scrollbar-color:#4a4257 #111114}.gm-search{display:flex;align-items:center;position:relative}.gm-search>input{width:100%;padding-right:30px!important}.gm-search>button{position:absolute;right:5px;width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--muted);cursor:pointer}.gm-search>button:hover{background:#322c3d}.gm-search>button[hidden]{display:none}input::-webkit-inner-spin-button,input::-webkit-outer-spin-button{appearance:none;margin:0}input[type=checkbox],input[type=radio]{appearance:none;display:inline-grid;place-content:center;flex-shrink:0;width:17px;height:17px;margin:0;border:1px solid #575762;border-radius:5px;background:#141418;vertical-align:middle;cursor:pointer}input[type=checkbox]:checked,input[type=radio]:checked{background:var(--accent);border-color:var(--accent)}input[type=checkbox]:checked:after{content:'';width:8px;height:4px;border-left:2px solid #141019;border-bottom:2px solid #141019;transform:translateY(-1px) rotate(-45deg)}input[type=checkbox]:indeterminate:after{content:'';width:9px;height:2px;background:var(--text)}input[type=radio]{border-radius:50%}input[type=radio]:checked:after{content:'';width:5px;height:5px;border-radius:50%;background:#141019}input:disabled{opacity:.45;cursor:not-allowed}input[type=range]{appearance:none;height:5px;border:0;border-radius:8px;background:#38333f;cursor:pointer;accent-color:var(--accent)}input[type=range]::-webkit-slider-thumb{appearance:none;width:13px;height:13px;border:2px solid #e4dcff;border-radius:50%;background:var(--accent);box-shadow:0 1px 4px #0008}input[type=range]::-moz-range-thumb{width:10px;height:10px;border:2px solid #e4dcff;border-radius:50%;background:var(--accent)}summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px}summary::-webkit-details-marker{display:none}summary:before{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .12s}details[open]>summary:before{transform:rotate(45deg)}:is(button,input,textarea,summary):focus-visible{outline:2px solid var(--accent);outline-offset:3px}.gm-select{position:relative;display:inline-flex;min-width:0;width:100%}.gm-native-select{position:absolute!important;left:0;top:0;width:1px!important;height:1px!important;opacity:0!important;padding:0!important;pointer-events:none}.gm-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:34px;padding:7px 10px;background:#18181e;color:var(--text);border:1px solid #37373f;border-radius:7px;text-align:left;cursor:pointer}.gm-trigger:hover:not(:disabled){background:#22212a;border-color:#696078}.gm-trigger[aria-expanded=true]{border-color:var(--accent);background:#24202e}.gm-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gm-trigger svg{width:14px;height:14px;flex-shrink:0}.gm-menu{position:fixed;z-index:10000;padding:5px;background:#1b1a21;border:1px solid #49434f;border-radius:10px;box-shadow:0 12px 36px #0009;overflow:auto;overscroll-behavior:contain;max-width:calc(100vw - 16px)}.gm-option{display:flex;gap:12px;align-items:center;justify-content:space-between;width:100%;border:0;border-radius:5px;padding:9px 10px;background:transparent;color:var(--text);text-align:left;cursor:pointer}.gm-option[data-active=true]{background:#393047}.gm-option[aria-selected=true]{color:#d7caff}.gm-option svg{width:14px;height:14px}.gm-number{display:flex;align-items:stretch;min-width:0;width:100%}.gm-number>input{width:100%;min-width:0;border-radius:7px 0 0 7px!important}.gm-steps{display:flex;flex-direction:column;width:23px;flex-shrink:0}.gm-step{padding:0;height:50%;min-height:15px;border:1px solid var(--line);background:#1c1b22;color:#bfb8cd;cursor:pointer}.gm-step:first-child{border-radius:0 6px 0 0}.gm-step:last-child{border-radius:0 0 6px 0}.gm-step:hover{background:#383044}.gm-file{display:flex;align-items:center;gap:10px;padding:10px;border:1px dashed #51485f;border-radius:8px;background:#141219}.gm-file span{font-size:11px;color:var(--muted);overflow-wrap:anywhere}.gm-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.gm-audio{display:flex;align-items:center;gap:9px;padding:10px;margin-top:12px;border:1px solid var(--line);border-radius:9px;background:#101014;flex-wrap:wrap}.gm-audio input{min-width:60px;flex:1}.gm-audio output{font-variant-numeric:tabular-nums;color:var(--muted);font-size:11px}.gm-color{display:flex;gap:6px}.gm-color input{width:100%}.gm-color button{width:32px;flex-shrink:0;border:2px solid #655d70;border-radius:7px;cursor:pointer}
`;

export const studioControlsScript = String.raw`
const studioControls = (() => {
    const bindings = new WeakMap(), enhanced = new WeakSet();
    let popup = null, serial = 0;
    const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>', check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    function label(el) { return el.getAttribute('aria-label') || Array.from(el.labels || []).map(l => Array.from(l.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()).filter(Boolean).join(' ') || el.closest('.field,.field-check')?.querySelector('label')?.textContent || el.id || el.name || 'Value'; }
    function emit(el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    function close(focus = false) { if (!popup)
        return; const p = popup; popup = null; p.menu.remove(); p.anchor.setAttribute('aria-expanded', 'false'); p.anchor.removeAttribute('aria-activedescendant'); if (focus && p.anchor.isConnected)
        p.anchor.focus(); }
    function position() { if (!popup)
        return; if (!popup.anchor.isConnected) {
        close();
        return;
    } const r = popup.anchor.getBoundingClientRect(), m = popup.menu; m.style.width = Math.min(Math.max(r.width, 180), innerWidth - 16) + 'px'; const below = innerHeight - r.bottom - 12, above = r.top - 12, space = Math.max(below, above); m.style.maxHeight = Math.max(60, Math.min(320, space)) + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = (below >= Math.min(320, m.scrollHeight) || below >= above ? r.bottom + 5 : Math.max(8, r.top - m.offsetHeight - 5)) + 'px'; }
    function activate(index) { if (!popup)
        return; const p = popup, enabled = p.items.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0); if (!enabled.length)
        return; p.index = enabled.includes(index) ? index : enabled[0]; p.buttons.forEach((b, i) => b.dataset.active = String(i === p.index)); p.anchor.setAttribute('aria-activedescendant', p.buttons[p.index].id); p.buttons[p.index].scrollIntoView({ block: 'nearest' }); }
    function openSelect(anchor, config) { if (anchor.disabled)
        return; if (popup?.anchor === anchor) {
        close(true);
        return;
    } close(); const items = config.options.map(o => typeof o === 'string' ? { value: o, label: o } : o), menu = document.createElement('div'); menu.className = 'gm-menu'; menu.id = 'gm-list-' + (++serial); menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', config.label || label(anchor)); if (config.multiple)
        menu.setAttribute('aria-multiselectable', 'true'); anchor.setAttribute('role', 'combobox'); anchor.setAttribute('aria-haspopup', 'listbox'); anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', menu.id); const buttons = items.map((item, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'gm-option'; b.id = menu.id + '-' + i; b.tabIndex = -1; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(config.multiple ? config.value.includes(item.value) : item.value === config.value)); b.disabled = !!item.disabled; const text = document.createElement('span'); text.textContent = item.label; b.append(text); if (b.getAttribute('aria-selected') === 'true')
        b.insertAdjacentHTML('beforeend', check); if (config.optionAttribute)
        b.setAttribute(config.optionAttribute, item.value); b.onpointermove = () => { if (!b.disabled)
        activate(i); }; b.onmousedown = e => e.preventDefault(); b.onclick = () => choose(i); menu.append(b); return b; }); (anchor.closest('.modal') || document.body).append(menu); popup = { anchor, menu, items, buttons, config, index: 0, search: '', lastKey: 0 }; position(); activate(items.findIndex(o => o.value === config.value)); anchor.focus(); }
    function choose(index) { const p = popup, item = p?.items[index]; if (!item || item.disabled)
        return; close(true); p.config.onChange(item.value); queueMicrotask(() => { if (!p.anchor.isConnected) { const attribute = p.anchor.hasAttribute('data-select-field') ? 'data-select-field' : p.anchor.hasAttribute('data-ease-kind') ? 'data-ease-kind' : null; if (attribute) Array.from(document.querySelectorAll('[' + attribute + ']')).find(button => button.getAttribute(attribute) === p.anchor.getAttribute(attribute))?.focus(); } }); }
    document.addEventListener('keydown', e => { if (!popup && e.key === 'Escape' && document.querySelector('#colorPopover.open')) { e.preventDefault(); e.stopImmediatePropagation(); closeColorPicker(); return; } if (!popup)
        return; const p = popup, enabled = p.items.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0); if (e.key === 'Tab') {
        close();
        return;
    } if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key) && !(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))
        return; e.preventDefault(); e.stopImmediatePropagation(); if (e.key === 'Escape') {
        close(true);
        return;
    } if (e.key === 'Enter' || e.key === ' ') {
        choose(p.index);
        return;
    } if (e.key === 'Home')
        activate(enabled[0]);
    else if (e.key === 'End')
        activate(enabled.at(-1));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const n = enabled.indexOf(p.index);
        activate(enabled[(n + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
    }
    else {
        p.search = Date.now() - p.lastKey > 600 ? e.key : p.search + e.key;
        p.lastKey = Date.now();
        const i = p.items.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(p.search.toLowerCase()));
        if (i >= 0)
            activate(i);
    } }, true);
    document.addEventListener('pointerdown', e => { if (popup && !popup.menu.contains(e.target) && !popup.anchor.contains(e.target))
        close(); }, true);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', e => { if (popup && !popup.menu.contains(e.target))
        position(); }, true);
    function select(el) { if (bindings.has(el)) {
        bindings.get(el)();
        return;
    } const wrap = document.createElement('span'), button = document.createElement('button'), text = document.createElement('span'); wrap.className = 'gm-select'; button.type = 'button'; button.className = 'gm-trigger'; button.append(text); button.insertAdjacentHTML('beforeend', chevron); el.before(wrap); wrap.append(el, button); el.classList.add('gm-native-select'); el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false'); const sync = () => { const value = Array.from(el.selectedOptions).map(o => o.label).join(', ') || 'Choose…'; if (text.textContent !== value)
        text.textContent = value; button.disabled = el.disabled; button.setAttribute('aria-label', label(el)); button.setAttribute('aria-required', String(el.required)); button.setAttribute('aria-invalid', el.getAttribute('aria-invalid') || 'false'); if (el.disabled && popup?.anchor === button)
        close(); }; bindings.set(el, sync); button.onclick = () => openSelect(button, { label: label(el), value: el.multiple ? Array.from(el.selectedOptions).map(o => o.value) : el.value, multiple: el.multiple, options: Array.from(el.options).map(o => ({ label: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label + ' · ' + o.label : o.label, value: o.value, disabled: o.disabled || o.parentElement.disabled })), onChange: value => { if (el.multiple) {
            const option = Array.from(el.options).find(o => o.value === value);
            option.selected = !option.selected;
        }
        else
            el.value = value; sync(); emit(el); } }); button.onkeydown = e => { if (!popup && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        button.click();
        if (e.key === 'End')
            activate(el.options.length - 1);
    } }; el.addEventListener('change', sync); el.addEventListener('focus', () => button.focus()); for (const key of ['value', 'selectedIndex']) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, key);
        Object.defineProperty(el, key, { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); sync(); } });
    } sync(); }
    function enhance(root) { const selector = 'select,input,audio,[data-select-field],[data-ease-kind]'; const nodes = [...(root.matches?.(selector) ? [root] : []), ...(root.querySelectorAll?.(selector) || [])]; for (const el of nodes) {
        if (el.tagName === 'SELECT') {
            select(el);
            continue;
        }
        if (enhanced.has(el))
            continue;
        enhanced.add(el);
        if (el.matches('[data-select-field],[data-ease-kind]')) {
            el.setAttribute('role', 'combobox');
            el.setAttribute('aria-haspopup', 'listbox');
            el.setAttribute('aria-expanded', 'false');
            el.setAttribute('aria-label', label(el));
            el.addEventListener('keydown', event => { if (!popup && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                el.click();
            } });
        }
        if (el.tagName === 'INPUT' && !el.hasAttribute('aria-label'))
            el.setAttribute('aria-label', label(el));
        if (el.type === 'search') {
            const wrap = document.createElement('span'), button = document.createElement('button');
            wrap.className = 'gm-search';
            button.type = 'button';
            button.setAttribute('aria-label', 'Clear ' + label(el));
            button.innerHTML = '<svg width=12 height=12 viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6" stroke="currentColor"/></svg>';
            button.hidden = !el.value;
            el.before(wrap);
            wrap.append(el, button);
            el.addEventListener('input', () => button.hidden = !el.value);
            button.onclick = () => { el.value = ''; button.hidden = true; emit(el); el.focus(); };
        }
        else if (el.type === 'number') {
            const wrap = document.createElement('span'), steps = document.createElement('span');
            wrap.className = 'gm-number';
            steps.className = 'gm-steps';
            el.before(wrap);
            wrap.append(el, steps);
            for (const direction of [1, -1]) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'gm-step';
                b.innerHTML = '<svg width=10 height=10 viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6' + (direction === 1 ? 'M5 2v6' : '') + '" fill="none" stroke="currentColor"/></svg>';
                b.disabled = el.disabled || el.readOnly;
                b.setAttribute('aria-label', (direction === 1 ? 'Increase ' : 'Decrease ') + label(el));
                b.onclick = () => { if (el.disabled || el.readOnly)
                    return; try {
                    if (el.step === 'any') {
                        el.value = String(Math.min(el.max === '' ? Infinity : Number(el.max), Math.max(el.min === '' ? -Infinity : Number(el.min), (Number(el.value) || 0) + direction)));
                    }
                    else
                        direction === 1 ? el.stepUp() : el.stepDown();
                    emit(el);
                }
                catch {
                    el.focus();
                } };
                steps.append(b);
            }
        }
        else if (el.type === 'file' && !el.hidden) {
            const wrap = document.createElement('span'), button = document.createElement('button'), status = document.createElement('span');
            wrap.className = 'gm-file';
            button.type = 'button';
            button.className = 'ghost';
            button.textContent = 'Choose file' + (el.multiple ? 's' : '');
            button.setAttribute('aria-label', label(el));
            button.disabled = el.disabled;
            button.onclick = () => el.click();
            status.textContent = 'No file selected';
            status.setAttribute('aria-live', 'polite');
            el.before(wrap);
            wrap.append(el, button, status);
            el.tabIndex = -1;
            el.addEventListener('change', () => status.textContent = Array.from(el.files).map(f => f.name).join(', ') || 'No file selected');
        }
        else if (el.type === 'color') {
            el.type = 'text';
            const wrap = document.createElement('span'), button = document.createElement('button');
            wrap.className = 'gm-color';
            button.type = 'button';
            button.setAttribute('aria-label', 'Choose ' + label(el));
            button.style.background = el.value;
            el.before(wrap);
            wrap.append(button, el);
            button.onclick = () => { button.dataset.colorValue = el.value; openColorPicker(button, value => { el.value = value; button.style.background = value; emit(el); }); };
            el.addEventListener('input', () => button.style.background = el.value);
        }
        else if (el.tagName === 'AUDIO' && el.controls) {
            el.controls = false;
            const wrap = document.createElement('div'), play = document.createElement('button'), seek = document.createElement('input'), volume = document.createElement('input'), time = document.createElement('output');
            wrap.className = 'gm-audio';
            play.type = 'button';
            play.className = 'ghost';
            play.textContent = 'Play';
            play.setAttribute('aria-label', 'Play audio preview');
            seek.type = 'range';
            seek.min = '0';
            seek.max = '1';
            seek.step = '0.01';
            seek.value = '0';
            seek.setAttribute('aria-label', 'Audio position');
            volume.type = 'range';
            volume.min = '0';
            volume.max = '1';
            volume.step = '0.01';
            volume.value = '1';
            volume.setAttribute('aria-label', 'Audio volume');
            time.textContent = '0:00';
            el.after(wrap);
            wrap.append(play, seek, time, volume);
            play.onclick = async () => { try {
                if (el.paused)
                    await el.play();
                else
                    el.pause();
            }
            catch {
                time.textContent = 'Audio unavailable';
            } };
            const sync = () => { play.textContent = el.paused ? 'Play' : 'Pause'; play.setAttribute('aria-label', (el.paused ? 'Play' : 'Pause') + ' audio preview'); seek.max = String(Number.isFinite(el.duration) ? el.duration : 1); seek.value = String(el.currentTime); time.textContent = Math.floor(el.currentTime / 60) + ':' + String(Math.floor(el.currentTime % 60)).padStart(2, '0'); };
            for (const event of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'])
                el.addEventListener(event, sync);
            el.addEventListener('error', () => { time.textContent = 'Audio unavailable'; play.disabled = true; });
            seek.oninput = () => { if (Number.isFinite(el.duration))
                el.currentTime = Number(seek.value); };
            volume.oninput = () => el.volume = Number(volume.value);
        }
    } }
    const observer = new MutationObserver(records => { for (const record of records) {
        if (record.type === 'attributes') {
            const sync = bindings.get(record.target);
            if (sync)
                sync();
            if (record.target.matches('input')) {
                const input = record.target;
                input.parentElement?.querySelectorAll('.gm-step,.gm-file>button,.gm-color>button').forEach(button => button.disabled = input.disabled || input.readOnly);
            }
        }
        else {
            for (const node of record.addedNodes)
                if (node.nodeType === 1)
                    enhance(node);
            const select = record.target.closest?.('select');
            if (select && bindings.has(select))
                bindings.get(select)();
        }
    } if (popup && !popup.anchor.isConnected)
        close(); });
    enhance(document.body);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-invalid', 'required', 'selected', 'readonly'] });
    return { openSelect, close, enhance };
})();
`;
