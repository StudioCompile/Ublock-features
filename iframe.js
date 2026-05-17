(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  function escHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ════════════════════════════════════════════════════════
     HOST PAGE — error detection & blocked page injection
     The bar/UI lives inside the iframe, not here.
  ════════════════════════════════════════════════════════ */
  if (!IS_IFRAME) {

    function findFrameByWindow(win) {
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentWindow === win) return f; } catch {}
      }
      return null;
    }

    // Called after an iframe loads — checks if Chrome navigated
    // to a blocked/error chrome:// URL we can't inject into
    function checkFrameAfterLoad(frame) {
      let href = '';
      try {
        href = frame.contentWindow.location.href;
      } catch {
        // Cross-origin but loaded fine — do nothing
        return;
      }

      // Chrome error pages land on chrome-error:// or about:blank after a block
      // We also check for the #main-frame-error element on same-origin error pages
      let isBlocked = false;
      let doc = null;
      try { doc = frame.contentDocument; } catch {}

      if (href.startsWith('chrome-error://') || href.startsWith('chrome://')) {
        isBlocked = true;
      } else if (doc && doc.getElementById('main-frame-error')) {
        isBlocked = true;
      }

      if (isBlocked) {
        const attempted = frame.__ifmPendingUrl || frame.getAttribute('src') || href;
        injectBlockedPage(frame, attempted);
      }
    }

    function watchFrame(frame) {
      if (frame.__ifmHostWatched) return;
      frame.__ifmHostWatched = true;
      frame.addEventListener('load', () => {
        setTimeout(() => checkFrameAfterLoad(frame), 60);
      });
    }

    // Watch src attribute changes to track pending URL
    // __ifmSuppressObs is set to true when WE set the src to avoid re-triggering
    const srcObs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type !== 'attributes' || m.target.tagName !== 'IFRAME') continue;
        if (m.target.__ifmSuppressObs) continue;
        const src = m.target.getAttribute('src');
        if (src && src !== 'about:blank') {
          m.target.__ifmPendingUrl = src;
        }
      }
    });
    srcObs.observe(document.documentElement, {
      attributes: true, attributeFilter: ['src'], subtree: true
    });

    function setSrc(frame, url) {
      frame.__ifmSuppressObs = true;
      frame.__ifmPendingUrl = url;
      frame.removeAttribute('srcdoc');
      frame.src = url;
      // Allow one tick for the mutation to fire then re-enable
      setTimeout(() => { frame.__ifmSuppressObs = false; }, 0);
    }

    // Watch for new iframes
    const domObs = new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'IFRAME') watchFrame(n);
        n.querySelectorAll && n.querySelectorAll('iframe').forEach(watchFrame);
      });
    });
    domObs.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('iframe').forEach(watchFrame);

    // Messages from inside the iframe
    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;

      // iframe requests navigation (link click intercepted inside)
      if (e.data.type === '__ifm_navigate') {
        const frame = findFrameByWindow(e.source);
        if (!frame) return;
        setSrc(frame, e.data.url);
      }

      // Go back from blocked page
      if (e.data.type === '__ifm_goback') {
        const frame = findFrameByWindow(e.source);
        if (!frame) return;
        const hist = frame.__ifmBackStack || [];
        const prev = hist.pop();
        frame.__ifmBackStack = hist;
        if (prev && !prev.startsWith('data:')) {
          setSrc(frame, prev);
        }
      }

      // iframe telling us its current real URL (for src tracking on SPA navigations)
      if (e.data.type === '__ifm_seturl') {
        const frame = findFrameByWindow(e.source);
        if (!frame) return;
        const old = frame.__ifmPendingUrl;
        const newUrl = e.data.url;
        if (old && old !== 'about:blank' && old !== newUrl) {
          if (!frame.__ifmBackStack) frame.__ifmBackStack = [];
          frame.__ifmBackStack.push(old);
        }
        // Update src attr visibly for host page observers without re-triggering srcObs
        frame.__ifmSuppressObs = true;
        frame.setAttribute('src', newUrl);
        setTimeout(() => { frame.__ifmSuppressObs = false; }, 0);
        frame.__ifmPendingUrl = newUrl;
      }
    });

    function injectBlockedPage(frame, blockedUrl) {
      const safeUrl = escHtml(blockedUrl || '');
      // Push previous real URL to back stack
      if (!frame.__ifmBackStack) frame.__ifmBackStack = [];
      const prev = frame.__ifmPendingUrl || '';
      if (prev && prev !== blockedUrl && !prev.startsWith('data:') && prev !== 'about:blank') {
        frame.__ifmBackStack.push(prev);
      }
      frame.__ifmSuppressObs = true;
      frame.removeAttribute('src');
      frame.srcdoc = buildBlockedPage(safeUrl);
      setTimeout(() => { frame.__ifmSuppressObs = false; }, 0);
    }

    function buildBlockedPage(safeUrl) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>This site can't be reached</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: #fff;
    color: #202124;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 40px 20px;
    gap: 0;
  }
  .branding {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.45;
  }
  .branding img { width: 18px; height: 18px; border-radius: 4px; }
  .branding span { font-size: 11px; color: #777; font-weight: 500; letter-spacing: .02em; }
  .icon-wrap {
    width: 72px; height: 72px;
    background: #f1f3f4;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px;
  }
  .icon-wrap svg { width: 36px; height: 36px; color: #80868b; }
  h1 {
    font-size: 22px;
    font-weight: 400;
    color: #202124;
    margin-bottom: 8px;
    text-align: center;
  }
  .url-line {
    font-size: 12px;
    color: #5f6368;
    margin-bottom: 28px;
    text-align: center;
    max-width: 420px;
    word-break: break-all;
  }
  .msg {
    font-size: 13px;
    color: #5f6368;
    max-width: 420px;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 32px;
  }
  .btn-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .btn {
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 4px;
    padding: 9px 20px;
    cursor: pointer;
    transition: box-shadow .15s, background .15s;
  }
  .btn-primary {
    background: #1a73e8;
    color: #fff;
  }
  .btn-primary:hover { background: #1765cc; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  .btn-secondary {
    background: #f1f3f4;
    color: #202124;
  }
  .btn-secondary:hover { background: #e8eaed; }
  .error-code {
    margin-top: 40px;
    font-size: 11px;
    color: #bdc1c6;
    letter-spacing: .03em;
  }
</style>
</head>
<body>
  <div class="icon-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5"/>
    </svg>
  </div>
  <h1>This site can't be reached</h1>
  <div class="url-line">${safeUrl}</div>
  <div class="msg">
    This site refused to connect or has blocked embedding in frames.<br>
    ERR_BLOCKED_BY_RESPONSE
  </div>
  <div class="btn-row">
    <button class="btn btn-secondary" onclick="window.parent.postMessage({type:'__ifm_goback'},'*')">Back</button>
    <button class="btn btn-primary" onclick="window.parent.postMessage({type:'__ifm_navigate',url:'${safeUrl}'},'*')">Try again</button>
  </div>
  <div class="error-code">uFeatures Embedded Browser</div>
  <div class="branding">
    <img src="https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png" alt="">
    <span>uFeatures</span>
  </div>
</body>
</html>`;
    }

    return; // host page done
  }

  /* ════════════════════════════════════════════════════════
     IFRAME SIDE
     - Bottom-right corner bar (thin, chrome-style)
     - Intercepts all link clicks → same iframe or new tab (Ctrl)
     - Back / Forward stacks
     - URL input: navigate on Enter, supports bookmarklets
     - Google button
     - Broadcasts URL changes to host
  ════════════════════════════════════════════════════════ */

  /* ── History state (per iframe instance) ── */
  const _hist = [];   // back stack  (URLs already visited)
  const _fwd  = [];   // forward stack
  let   _cur  = location.href;

  function pushHistory(url) {
    if (!url || url === _cur) return;
    // Don't push srcdoc/blob/data URLs
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return;
    _hist.push(_cur);
    _fwd.length = 0;
    _cur = url;
    tellHost(_cur);
    updateBar();
  }

  function tellHost(url) {
    try { window.top.postMessage({ type: '__ifm_seturl', url }, '*'); } catch {}
  }

  function requestNav(url) {
    try { window.top.postMessage({ type: '__ifm_navigate', url }, '*'); } catch {}
  }

  /* ── Intercept link clicks ── */
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    // Ctrl/Meta = open in new tab (normal behaviour)
    if (e.ctrlKey || e.metaKey) return;

    // Otherwise intercept and navigate in same iframe
    e.preventDefault();
    e.stopPropagation();
    let resolved;
    try { resolved = new URL(href, location.href).href; } catch { return; }
    requestNav(resolved);
  }, true);

  // Force all target=_blank to open in same iframe unless Ctrl held
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (!a || !a.target || a.target === '_self') return;
    if (!e.ctrlKey && !e.metaKey) {
      a.target = '_self';
    }
  }, true);

  /* ── SPA navigation ── */
  const _wrapHistory = orig => function (...args) {
    const r = orig.apply(this, args);
    setTimeout(() => {
      if (location.href !== _cur) pushHistory(location.href);
    }, 0);
    return r;
  };
  history.pushState    = _wrapHistory(history.pushState);
  history.replaceState = _wrapHistory(history.replaceState);
  window.addEventListener('popstate', () => {
    if (location.href !== _cur) pushHistory(location.href);
  });

  /* ── Tell host our initial URL ── */
  tellHost(location.href);

  /* ════════════════════════════
     BAR UI
  ════════════════════════════ */
  const BAR_Z  = 2147483647;
  const COR_W  = 72;   // px from right to trigger
  const COR_H  = 50;   // px from bottom to trigger

  const style = document.createElement('style');
  style.textContent = `
    #__ufb {
      all: initial;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: ${BAR_Z};
      display: flex;
      align-items: stretch;
      background: #fff;
      border-top: 1px solid #dadce0;
      border-left: 1px solid #dadce0;
      border-top-left-radius: 6px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity .13s ease, transform .13s ease;
      font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      height: 30px;
      overflow: hidden;
      white-space: nowrap;
      box-shadow: -1px -1px 6px rgba(0,0,0,0.07);
    }
    #__ufb.show { opacity: 1; transform: translateY(0); pointer-events: all; }

    #__ufb .__ub {
      all: unset;
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px;
      cursor: pointer;
      color: #5f6368;
      flex-shrink: 0;
      transition: background .1s, color .1s;
      border-right: 1px solid #f1f3f4;
    }
    #__ufb .__ub:hover { background: #f1f3f4; color: #202124; }
    #__ufb .__ub[disabled] { color: #ccc; cursor: default; pointer-events: none; }
    #__ufb .__ub svg { width: 13px; height: 13px; display: block; }

    #__ufb .__ui {
      all: unset;
      height: 30px;
      padding: 0 8px;
      font-size: 11.5px;
      color: #202124;
      width: 210px;
      border-right: 1px solid #f1f3f4;
      cursor: text;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0;
    }
    #__ufb .__ui:focus { outline: none; background: #f8f9fa; }
    #__ufb .__ui::placeholder { color: #9aa0a6; }

    #__ufb .__ug {
      all: unset;
      display: flex; align-items: center;
      padding: 0 11px;
      height: 30px;
      font-size: 11.5px;
      font-weight: 500;
      color: #1a73e8;
      cursor: pointer;
      transition: background .1s;
      border-right: 1px solid #f1f3f4;
      letter-spacing: .01em;
    }
    #__ufb .__ug:hover { background: #f1f3f4; }

    #__ufb .__ugo {
      all: unset;
      display: flex; align-items: center;
      padding: 0 9px;
      height: 30px;
      font-size: 11px;
      color: #5f6368;
      cursor: pointer;
      transition: background .1s;
      gap: 4px;
    }
    #__ufb .__ugo:hover { background: #f1f3f4; color: #202124; }
    #__ufb .__ugo svg { width: 13px; height: 13px; display: block; }
  `;
  (document.head || document.documentElement).appendChild(style);

  const bar = document.createElement('div');
  bar.id = '__ufb';

  // Back button
  const btnBack = document.createElement('button');
  btnBack.className = '__ub';
  btnBack.title = 'Back';
  btnBack.setAttribute('disabled', '');
  btnBack.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  btnBack.addEventListener('click', doBack);

  // Forward button
  const btnFwd = document.createElement('button');
  btnFwd.className = '__ub';
  btnFwd.title = 'Forward';
  btnFwd.setAttribute('disabled', '');
  btnFwd.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  btnFwd.addEventListener('click', doForward);

  // URL input
  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'Enter address or javascript:…';
  urlInput.value = location.href;
  urlInput.addEventListener('focus', () => urlInput.select());
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doGo(); }
    if (e.key === 'Escape') { urlInput.value = _cur; urlInput.blur(); }
  });

  // Google button
  const btnGoogle = document.createElement('button');
  btnGoogle.className = '__ugo';
  btnGoogle.title = 'Go to Google';
  btnGoogle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
  btnGoogle.addEventListener('click', () => {
    requestNav('https://www.google.com/?igu=1');
  });

  bar.appendChild(btnBack);
  bar.appendChild(btnFwd);
  bar.appendChild(urlInput);
  bar.appendChild(btnGoogle);

  document.body.appendChild(bar);

  /* ── Corner hover trigger ── */
  let _hideTimer = null;
  const showBar = () => {
    clearTimeout(_hideTimer);
    bar.classList.add('show');
  };
  const hideBar = () => {
    _hideTimer = setTimeout(() => bar.classList.remove('show'), 320);
  };

  document.addEventListener('mousemove', e => {
    const fromR = window.innerWidth  - e.clientX;
    const fromB = window.innerHeight - e.clientY;
    if (fromR <= COR_W && fromB <= COR_H) showBar();
  }, { passive: true });
  bar.addEventListener('mouseenter', showBar);
  bar.addEventListener('mouseleave', hideBar);
  document.addEventListener('mouseleave', hideBar);

  /* ── Navigation logic ── */
  function doGo() {
    let val = urlInput.value.trim();
    if (!val) return;

    // Bookmarklet
    if (val.startsWith('javascript:')) {
      try { eval(decodeURIComponent(val.slice('javascript:'.length))); } catch(e) { console.warn('Bookmarklet error', e); }
      urlInput.blur();
      return;
    }

    // Auto-protocol
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;

    requestNav(val);
    urlInput.blur();
  }

  function doBack() {
    if (!_hist.length) return;
    const prev = _hist.pop();
    _fwd.unshift(_cur);
    _cur = prev;
    urlInput.value = _cur;
    updateBar();
    requestNav(_cur);
  }

  function doForward() {
    if (!_fwd.length) return;
    const next = _fwd.shift();
    _hist.push(_cur);
    _cur = next;
    urlInput.value = _cur;
    updateBar();
    requestNav(_cur);
  }

  function updateBar() {
    if (_hist.length > 0) {
      btnBack.removeAttribute('disabled');
    } else {
      btnBack.setAttribute('disabled', '');
    }
    if (_fwd.length > 0) {
      btnFwd.removeAttribute('disabled');
    } else {
      btnFwd.setAttribute('disabled', '');
    }
    if (document.activeElement !== urlInput) {
      urlInput.value = _cur;
    }
  }

})();
