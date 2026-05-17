(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  /* ═══════════════════════════════════════════════════════════════
     SHARED HELPERS
  ═══════════════════════════════════════════════════════════════ */
  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ═══════════════════════════════════════════════════════════════
     IFRAME SIDE
     - Intercepts all link clicks & form submits → postMessage to host
     - Intercepts SPA pushState/replaceState → postMessage to host
     No UI rendered here at all.
  ═══════════════════════════════════════════════════════════════ */
  if (IS_IFRAME) {
    function sendNav(url) {
      try {
        let resolved = new URL(url, location.href).href;
        window.top.postMessage({ type: '__ifm_navigate', url: resolved }, '*');
      } catch {}
    }

    function sendUrlChange(url) {
      try { window.top.postMessage({ type: '__ifm_urlChange', url }, '*'); } catch {}
    }

    // Intercept link clicks
    document.addEventListener('click', (e) => {
      const a = e.composedPath().find(n => n && n.tagName === 'A');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
      // Let target=_blank open normally
      if (a.target === '_blank') return;
      e.preventDefault();
      e.stopPropagation();
      sendNav(href);
    }, true);

    // Intercept form submits
    document.addEventListener('submit', (e) => {
      const action = e.target.getAttribute('action') || location.href;
      e.preventDefault();
      sendNav(action);
    }, true);

    // SPA navigation
    const _wrap = (orig) => function (...args) {
      const r = orig.apply(this, args);
      sendUrlChange(location.href);
      return r;
    };
    history.pushState    = _wrap(history.pushState);
    history.replaceState = _wrap(history.replaceState);
    window.addEventListener('popstate', () => sendUrlChange(location.href));

    // Broadcast initial URL
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => sendUrlChange(location.href));
    } else {
      sendUrlChange(location.href);
    }

    return; // nothing else for iframe side
  }

  /* ═══════════════════════════════════════════════════════════════
     HOST PAGE SIDE
     - Receives navigate / urlChange messages from iframes
     - Preflight-checks URLs before loading
     - Recreates iframe with new src (host can observe src)
     - Custom blocked page with Go back
     - Discrete bottom-right corner bar with back/fwd/url/copy/go
  ═══════════════════════════════════════════════════════════════ */

  /* ── Per-iframe state store ────────────────────────────────── */
  // Keyed by a generated ID stamped on each iframe element
  const iframeState = new Map();
  let _ifmIdCounter = 0;

  function getState(frame) {
    if (!frame.__ifmId) {
      frame.__ifmId = ++_ifmIdCounter;
      iframeState.set(frame.__ifmId, {
        history: [],   // past URLs
        future:  [],   // forward URLs
        current: frame.getAttribute('src') || null,
      });
    }
    return iframeState.get(frame.__ifmId);
  }

  function findFrameByWindow(win) {
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentWindow === win) return f; } catch {}
    }
    return null;
  }

  /* ── Preflight ─────────────────────────────────────────────── */
  async function preflightCheck(url) {
    // Step 1: no-cors ping — if network error → unreachable
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(6000) });
    } catch (e) {
      return 'error';
    }

    // Step 2: cors fetch to read X-Frame-Options / CSP headers
    try {
      const res = await fetch(url, { method: 'HEAD', mode: 'cors', signal: AbortSignal.timeout(6000) });
      const xfo = res.headers.get('x-frame-options');
      const csp = res.headers.get('content-security-policy');
      if (xfo) {
        const v = xfo.trim().toUpperCase();
        if (v === 'DENY' || v === 'SAMEORIGIN') return 'blocked';
      }
      if (csp) {
        const m = csp.match(/frame-ancestors\s+([^;]+)/i);
        if (m) {
          const val = m[1].trim();
          if (val === "'none'" || val === "'self'") return 'blocked';
        }
      }
      return 'ok';
    } catch {
      // CORS rejected — can't read headers, but no-cors succeeded so site is up.
      // Fall back to letting it load and checking post-load.
      return 'unknown';
    }
  }

  /* ── Navigate an iframe ────────────────────────────────────── */
  async function navigateIframe(frame, newUrl, pushHistory = true) {
    const state = getState(frame);
    const prev = state.current;

    if (pushHistory && prev && prev !== newUrl) {
      state.history.push(prev);
      state.future = []; // clear forward stack
    }
    state.current = newUrl;
    updateBar();

    showLoading(frame, newUrl);
    const status = await preflightCheck(newUrl);

    if (status === 'blocked' || status === 'error') {
      injectBlockedPage(frame, newUrl, status);
      return;
    }

    // Set src — stamp __ifmLastSrc so our own srcObserver skips it
    frame.__ifmLastSrc = newUrl;
    frame.removeAttribute('srcdoc');
    frame.src = newUrl;
  }

  function goBack(frame) {
    const state = getState(frame);
    if (!state.history.length) return;
    const prev = state.history.pop();
    if (state.current) state.future.unshift(state.current);
    state.current = prev;
    updateBar();
    showLoading(frame, prev);
    preflightCheck(prev).then(status => {
      if (status === 'blocked' || status === 'error') {
        injectBlockedPage(frame, prev, status);
      } else {
        frame.__ifmLastSrc = prev;
        frame.removeAttribute('srcdoc');
        frame.src = prev;
      }
    });
  }

  function goForward(frame) {
    const state = getState(frame);
    if (!state.future.length) return;
    const next = state.future.shift();
    if (state.current) state.history.push(state.current);
    state.current = next;
    updateBar();
    showLoading(frame, next);
    preflightCheck(next).then(status => {
      if (status === 'blocked' || status === 'error') {
        injectBlockedPage(frame, next, status);
      } else {
        frame.__ifmLastSrc = next;
        frame.removeAttribute('srcdoc');
        frame.src = next;
      }
    });
  }

  /* ── Loading page ──────────────────────────────────────────── */
  function showLoading(frame, url) {
    frame.removeAttribute('src');
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{height:100vh;display:flex;align-items:center;justify-content:center;
background:#f5f5f7;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
.w{text-align:center;color:#aaa}
.sp{width:28px;height:28px;border:2.5px solid #e0e0e0;border-top-color:#bbb;
border-radius:50%;animation:sp .7s linear infinite;margin:0 auto 12px}
@keyframes sp{to{transform:rotate(360deg)}}
.u{font-size:10.5px;margin-top:6px;word-break:break-all;max-width:300px;color:#ccc}
</style></head><body>
<div class="w"><div class="sp"></div><div style="font-size:13px">Loading</div>
<div class="u">${escHtml(url)}</div></div></body></html>`;
  }

  /* ── Blocked page ──────────────────────────────────────────── */
  function injectBlockedPage(frame, blockedUrl, reason) {
    const msg = reason === 'error'
      ? "This site couldn't be reached. It may be down or the address is wrong."
      : "This site has blocked iframe embedding or refused the connection.";
    frame.removeAttribute('src');
    frame.__ifmLastSrc = null;
    frame.srcdoc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#f5f5f7;display:flex;align-items:center;
  justify-content:center;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
.card{background:#fff;border:1px solid #e0e0e3;border-radius:18px;
  box-shadow:0 2px 24px rgba(0,0,0,0.08);padding:44px 40px 36px;
  max-width:400px;width:92%;text-align:center}
.badge{width:56px;height:56px;background:#fff2f2;border-radius:50%;
  display:flex;align-items:center;justify-content:center;margin:0 auto 22px;
  border:1.5px solid #ffd0d0}
.badge svg{width:26px;height:26px;stroke:#d94f4f;fill:none;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}
h1{font-size:18px;font-weight:700;color:#111;margin-bottom:6px;letter-spacing:-.02em}
.up{font-size:11px;color:#888;background:#f2f2f4;border-radius:20px;
  padding:4px 12px;margin:10px 0 18px;display:inline-block;
  max-width:100%;word-break:break-all;line-height:1.5}
p{font-size:13px;color:#555;line-height:1.65;margin-bottom:28px}
.btn{display:inline-flex;align-items:center;gap:7px;background:#111;color:#fff;
  border:none;border-radius:10px;padding:11px 24px;font-size:13px;font-weight:500;
  cursor:pointer;transition:opacity .15s,transform .1s}
.btn:hover{opacity:.82;transform:translateY(-1px)}
.btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.3;
  stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<div class="card">
  <div class="badge">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <circle cx="12" cy="16" r=".6" fill="#d94f4f" stroke="none"/></svg>
  </div>
  <h1>Can't open this page</h1>
  <div class="up">${escHtml(blockedUrl)}</div>
  <p>${msg}</p>
  <button class="btn" onclick="window.parent.postMessage({type:'__ifm_back'},'*')">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    Go back
  </button>
</div></body></html>`;
  }

  /* ── Post-load check (fallback for 'unknown' preflight) ────── */
  function checkPostLoad(frame) {
    const pending = frame.__ifmPendingUrl;
    frame.__ifmPendingUrl = null;
    let doc, href;
    try { doc = frame.contentDocument; href = frame.contentWindow.location.href; } catch { return; }
    if (!doc) return;
    if ((href && href.startsWith('chrome-error://')) || doc.getElementById('main-frame-error')) {
      injectBlockedPage(frame, pending || frame.__ifmLastSrc || '', 'blocked');
    }
  }

  /* ── Watch iframes ─────────────────────────────────────────── */
  function watchIframe(frame) {
    if (frame.__ifmWatched) return;
    frame.__ifmWatched = true;
    getState(frame); // init state, capture initial src
    frame.addEventListener('load', () => setTimeout(() => checkPostLoad(frame), 80));
  }

  // Intercept src attribute changes set by host page code
  const srcObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'attributes' || m.target.tagName !== 'IFRAME') continue;
      const el = m.target;
      const newSrc = el.getAttribute('src');
      if (!newSrc || newSrc === 'about:blank') continue;
      if (newSrc === el.__ifmLastSrc) continue; // we just set this
      // Intercept: remove src, run through our pipeline
      el.removeAttribute('src');
      navigateIframe(el, newSrc);
    }
  });
  srcObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true });

  const domObserver = new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.tagName === 'IFRAME') watchIframe(n);
      n.querySelectorAll && n.querySelectorAll('iframe').forEach(watchIframe);
    });
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  document.querySelectorAll('iframe').forEach(f => {
    watchIframe(f);
    const src = f.getAttribute('src');
    if (src && src !== 'about:blank') {
      f.__ifmLastSrc = src;
      f.__ifmPendingUrl = src;
    }
  });

  /* ── Message handler ───────────────────────────────────────── */
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const frame = findFrameByWindow(e.source);

    if (e.data.type === '__ifm_navigate') {
      if (!frame) return;
      navigateIframe(frame, e.data.url);
    }

    if (e.data.type === '__ifm_urlChange') {
      // SPA navigation inside iframe — update our state without recreating
      if (!frame) return;
      const state = getState(frame);
      if (state.current && state.current !== e.data.url) {
        state.history.push(state.current);
        state.future = [];
      }
      state.current = e.data.url;
      // Also update the src attribute so external code can read it
      frame.__ifmLastSrc = e.data.url;
      updateBar();
    }

    if (e.data.type === '__ifm_back') {
      // Back button from blocked page
      if (!frame) return;
      goBack(frame);
    }
  });

  /* ══════════════════════════════════════════════════════════════
     BOTTOM-RIGHT CORNER BAR
     - Only shows when mouse is in the bottom-right corner
       (within CORNER_W px from right AND CORNER_H px from bottom)
     - Flat white pill bar: ← → [url input / copy] [Go]
  ══════════════════════════════════════════════════════════════ */

  const CORNER_W = 80;  // px from right edge
  const CORNER_H = 60;  // px from bottom edge

  const BAR_ID    = '__ifm-bar';
  const BAR_STY   = '__ifm-bar-style';

  const barCss = `
    #${BAR_ID} {
      all: initial;
      position: fixed;
      bottom: 12px;
      right: 12px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 0;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
      padding: 0;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
      height: 34px;
      white-space: nowrap;
    }
    #${BAR_ID}.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }
    #${BAR_ID} .ib-btn {
      all: unset;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 34px;
      cursor: pointer;
      color: #555;
      flex-shrink: 0;
      transition: background .1s, color .1s;
      border-right: 1px solid #f0f0f0;
    }
    #${BAR_ID} .ib-btn:last-child { border-right: none; }
    #${BAR_ID} .ib-btn:hover { background: #f5f5f5; color: #111; }
    #${BAR_ID} .ib-btn:disabled { color: #ccc; cursor: default; }
    #${BAR_ID} .ib-btn:disabled:hover { background: transparent; }
    #${BAR_ID} .ib-btn svg { width: 13px; height: 13px; display: block; }

    #${BAR_ID} .ib-sep {
      width: 1px;
      height: 20px;
      background: #ebebeb;
      flex-shrink: 0;
    }

    #${BAR_ID} .ib-url-wrap {
      display: flex;
      align-items: center;
      position: relative;
      border-right: 1px solid #f0f0f0;
    }
    #${BAR_ID} .ib-url-input {
      all: unset;
      font-size: 11.5px;
      color: #222;
      width: 220px;
      height: 34px;
      padding: 0 8px 0 10px;
      cursor: text;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${BAR_ID} .ib-url-input::placeholder { color: #bbb; }
    #${BAR_ID} .ib-url-input:focus { color: #111; }

    #${BAR_ID} .ib-copy-btn {
      all: unset;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 34px;
      cursor: pointer;
      color: #999;
      flex-shrink: 0;
      transition: color .1s;
      border-right: 1px solid #f0f0f0;
    }
    #${BAR_ID} .ib-copy-btn:hover { color: #333; }
    #${BAR_ID} .ib-copy-btn svg { width: 12px; height: 12px; }

    #${BAR_ID} .ib-go-btn {
      all: unset;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      height: 34px;
      font-size: 11.5px;
      font-weight: 600;
      color: #333;
      cursor: pointer;
      transition: background .1s, color .1s;
      letter-spacing: .01em;
    }
    #${BAR_ID} .ib-go-btn:hover { background: #f5f5f5; color: #111; }
    #${BAR_ID} .ib-go-btn.copied { color: #1a9e50; }
  `;

  const SVG_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const SVG_FWD  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  const SVG_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  let bar, backBtn, fwdBtn, urlInput, copyBtn, goBtn;

  function getPrimaryFrame() {
    const frames = [...document.querySelectorAll('iframe')];
    // Prefer visible frames with a known src
    for (const f of frames) {
      if (f.__ifmLastSrc || getState(f).current) return f;
    }
    return frames[0] || null;
  }

  function updateBar() {
    if (!bar) return;
    const frame = getPrimaryFrame();
    if (!frame) return;
    const state = getState(frame);
    const url = state.current || '';

    // Update input only if not focused
    if (document.activeElement !== urlInput) {
      urlInput.value = url;
    }

    backBtn.disabled = state.history.length === 0;
    fwdBtn.disabled  = state.future.length === 0;
  }

  function buildBar() {
    if (document.getElementById(BAR_ID)) return;

    const sty = document.createElement('style');
    sty.id = BAR_STY;
    sty.textContent = barCss;
    (document.head || document.documentElement).appendChild(sty);

    bar = document.createElement('div');
    bar.id = BAR_ID;

    // Back button
    backBtn = document.createElement('button');
    backBtn.className = 'ib-btn';
    backBtn.title = 'Back';
    backBtn.innerHTML = SVG_BACK;
    backBtn.addEventListener('click', () => {
      const f = getPrimaryFrame();
      if (f) goBack(f);
    });

    // Forward button
    fwdBtn = document.createElement('button');
    fwdBtn.className = 'ib-btn';
    fwdBtn.title = 'Forward';
    fwdBtn.innerHTML = SVG_FWD;
    fwdBtn.addEventListener('click', () => {
      const f = getPrimaryFrame();
      if (f) goForward(f);
    });

    // URL input + copy wrapper
    const urlWrap = document.createElement('div');
    urlWrap.className = 'ib-url-wrap';

    urlInput = document.createElement('input');
    urlInput.className = 'ib-url-input';
    urlInput.type = 'text';
    urlInput.placeholder = 'Enter URL…';
    urlInput.spellcheck = false;
    urlInput.autocomplete = 'off';

    // Select all on focus for easy replacement
    urlInput.addEventListener('focus', () => urlInput.select());

    // Pressing Enter navigates
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doNavigate();
      }
      if (e.key === 'Escape') urlInput.blur();
    });

    copyBtn = document.createElement('button');
    copyBtn.className = 'ib-copy-btn';
    copyBtn.title = 'Copy URL';
    copyBtn.innerHTML = SVG_COPY;
    copyBtn.addEventListener('click', () => {
      const url = urlInput.value || (getPrimaryFrame() && getState(getPrimaryFrame()).current) || '';
      const doCopy = () => {
        goBtn.textContent = 'Copied!';
        goBtn.classList.add('copied');
        setTimeout(() => {
          goBtn.textContent = 'Go';
          goBtn.classList.remove('copied');
        }, 1200);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(doCopy).catch(() => fallbackCopy(url, doCopy));
      } else {
        fallbackCopy(url, doCopy);
      }
    });

    urlWrap.appendChild(urlInput);
    urlWrap.appendChild(copyBtn);

    // Go button
    goBtn = document.createElement('button');
    goBtn.className = 'ib-go-btn';
    goBtn.textContent = 'Go';
    goBtn.addEventListener('click', doNavigate);

    bar.appendChild(backBtn);
    bar.appendChild(fwdBtn);
    bar.appendChild(urlWrap);
    bar.appendChild(goBtn);

    document.body.appendChild(bar);
    updateBar();

    // Hover trigger: bottom-right CORNER only
    let hideTimer = null;
    const show = () => { clearTimeout(hideTimer); bar.classList.add('visible'); };
    const hide = () => {
      hideTimer = setTimeout(() => bar.classList.remove('visible'), 300);
    };

    document.addEventListener('mousemove', (e) => {
      const fromRight  = window.innerWidth  - e.clientX;
      const fromBottom = window.innerHeight - e.clientY;
      if (fromRight <= CORNER_W && fromBottom <= CORNER_H) {
        show();
      }
    }, { passive: true });

    bar.addEventListener('mouseenter', show);
    bar.addEventListener('mouseleave', hide);
    document.addEventListener('mouseleave', hide);
  }

  function doNavigate() {
    let url = urlInput.value.trim();
    if (!url) return;
    // Auto-prepend https:// if no protocol
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const frame = getPrimaryFrame();
    if (frame) navigateIframe(frame, url);
    urlInput.blur();
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position:'fixed', opacity:'0', top:'0', left:'0' });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch {}
    ta.remove();
  }

  if (document.body) buildBar();
  else document.addEventListener('DOMContentLoaded', buildBar);

})();
