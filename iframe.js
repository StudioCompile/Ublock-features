(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  function escHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ════════════════════════════════════════════════════════
     HOST PAGE
     Only job: watch iframes for Chrome error pages after load
     and replace with custom blocked page via srcdoc.
     Does NOT intercept src changes (that caused the reload loop).
     Navigation is driven entirely by postMessage from iframe side.
  ════════════════════════════════════════════════════════ */
  if (!IS_IFRAME) {

    function findFrameByWindow(win) {
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentWindow === win) return f; } catch {}
      }
      return null;
    }

    // After a frame loads, check if Chrome landed on an error page.
    // Chrome error pages are at chrome-error:// — readable from host.
    // Cross-origin successful loads throw SecurityError — we ignore those (they're fine).
    function checkAfterLoad(frame) {
      if (frame.__ifmIsBlockedPage) return;

      let href = '';
      try {
        href = frame.contentWindow.location.href;
      } catch {
        // SecurityError = real cross-origin page loaded fine. Do nothing.
        return;
      }

      let blocked = false;
      // Chrome puts X-Frame-Options blocked pages at chrome-error://
      if (href.startsWith('chrome-error://') || href.startsWith('chrome://')) {
        blocked = true;
      }
      // about:blank can appear after ERR_ network errors
      if (!blocked && (href === 'about:blank' || href === '') && frame.__ifmPendingUrl) {
        blocked = true;
      }
      // Same-origin Chrome error page DOM marker
      if (!blocked) {
        try {
          const doc = frame.contentDocument;
          if (doc && doc.getElementById('main-frame-error')) blocked = true;
        } catch {}
      }

      if (blocked) {
        const attempted = frame.__ifmPendingUrl || href;
        showBlockedPage(frame, attempted);
      }
    }

    function showBlockedPage(frame, url) {
      const safe = escHtml(url);
      // Save url so back button can use it to retry
      frame.__ifmBlockedUrl = url;
      frame.__ifmIsBlockedPage = true;
      frame.srcdoc = buildBlockedPage(safe);
      // srcdoc fires a load event — after that clear the flag so future real loads check normally
      frame.addEventListener('load', () => {
        // keep __ifmIsBlockedPage true while the blocked page is showing
        // it gets cleared when we navigate away
      }, { once: true });
    }

    function watchFrame(frame) {
      if (frame.__ifmWatched) return;
      frame.__ifmWatched = true;
      // Track src so we know what was attempted
      const initialSrc = frame.getAttribute('src');
      if (initialSrc) frame.__ifmPendingUrl = initialSrc;

      frame.addEventListener('load', () => setTimeout(() => checkAfterLoad(frame), 50));
    }

    // Watch for iframes added to DOM
    new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'IFRAME') watchFrame(n);
        if (n.querySelectorAll) n.querySelectorAll('iframe').forEach(watchFrame);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.querySelectorAll('iframe').forEach(watchFrame);

    function sendNavState(frame) {
      try {
        frame.contentWindow.postMessage({
          type: '__ifm_navstate',
          canBack: (frame.__ifmHist || []).length > 0,
          canFwd:  (frame.__ifmFwd  || []).length > 0,
          url:     frame.__ifmPendingUrl || '',
        }, '*');
      } catch {}
    }

    function doFrameNav(frame, url) {
      frame.__ifmPendingUrl = url;
      frame.__ifmIsBlockedPage = false;
      frame.removeAttribute('srcdoc');
      frame.src = url;
      // Send nav state once the new page has loaded and its script has run
      frame.addEventListener('load', () => {
        setTimeout(() => sendNavState(frame), 100);
      }, { once: true });
    }

    // Handle messages from iframe side
    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;
      const frame = findFrameByWindow(e.source);

      if (e.data.type === '__ifm_navigate') {
        if (!frame) return;
        const url = e.data.url;
        const old = frame.__ifmPendingUrl;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        if (old && !old.startsWith('data:') && old !== 'about:blank') frame.__ifmHist.push(old);
        frame.__ifmFwd = [];
        doFrameNav(frame, url);
      }

      if (e.data.type === '__ifm_goback') {
        if (!frame) return;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const prev = frame.__ifmHist.pop();
        if (!prev) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmFwd.unshift(cur);
        doFrameNav(frame, prev);
        sendNavState(frame);
      }

      if (e.data.type === '__ifm_goforward') {
        if (!frame) return;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const next = frame.__ifmFwd.shift();
        if (!next) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmHist.push(cur);
        doFrameNav(frame, next);
        sendNavState(frame);
      }

      if (e.data.type === '__ifm_retry') {
        if (!frame) return;
        const url = frame.__ifmBlockedUrl || e.data.url;
        if (url) doFrameNav(frame, url);
      }

      if (e.data.type === '__ifm_currenturl') {
        if (!frame) return;
        const newUrl = e.data.url;
        const old = frame.__ifmPendingUrl;
        // Track same-domain directory changes in history
        if (old && old !== newUrl && !old.startsWith('data:') && old !== 'about:blank') {
          if (!frame.__ifmHist) frame.__ifmHist = [];
          if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
          frame.__ifmHist.push(old);
          frame.__ifmFwd = [];
        }
        frame.__ifmPendingUrl = newUrl;
        sendNavState(frame);
      }
    });

    function buildBlockedPage(safeUrl) {
      return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>This site can\u2019t be reached</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#fff;
  color:#202124;display:flex;flex-direction:column;align-items:center;
  justify-content:center;min-height:100vh;padding:40px 20px}
.icon{width:72px;height:72px;background:#f1f3f4;border-radius:50%;
  display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.icon svg{width:36px;height:36px;stroke:#80868b;fill:none;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round}
h1{font-size:22px;font-weight:400;margin-bottom:8px;text-align:center}
.url{font-size:12px;color:#5f6368;margin-bottom:24px;text-align:center;
  max-width:420px;word-break:break-all}
.msg{font-size:13px;color:#5f6368;max-width:420px;text-align:center;
  line-height:1.6;margin-bottom:32px}
.btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.btn{font-size:13px;font-weight:500;border:none;border-radius:4px;
  padding:9px 20px;cursor:pointer;transition:box-shadow .15s,background .15s}
.back{background:#f1f3f4;color:#202124}
.back:hover{background:#e8eaed}
.retry{background:#1a73e8;color:#fff}
.retry:hover{background:#1765cc;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.brand{position:fixed;bottom:14px;right:14px;display:flex;align-items:center;
  gap:5px;opacity:.4}
.brand img{width:16px;height:16px;border-radius:3px}
.brand span{font-size:11px;color:#777;font-weight:500}
</style></head><body>
<div class="icon"><svg viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10"/>
  <line x1="12" y1="8" x2="12" y2="12"/>
  <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5"/>
</svg></div>
<h1>This site can\u2019t be reached</h1>
<div class="url">${safeUrl}</div>
<div class="msg">This site refused to connect or has blocked embedding.<br>
<span style="font-size:11px;font-family:monospace;color:#bbb">ERR_BLOCKED_BY_RESPONSE</span></div>
<div class="btns">
  <button class="btn back" onclick="window.parent.postMessage({type:'__ifm_goback'},'*')">Back</button>
  <button class="btn retry" onclick="window.parent.postMessage({type:'__ifm_retry',url:'${safeUrl}'},'*')">Try again</button>
</div>
<div class="brand">
  <img src="https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png" alt="">
  <span>uFeatures</span>
</div>
</body></html>`;
    }

    return; // host page done — no UI here
  }

  /* ════════════════════════════════════════════════════════
     IFRAME SIDE
     - Intercepts link clicks (same frame unless Ctrl)
     - History lives on HOST (survives page reloads)
     - Bottom-right corner bar: back, fwd, url input, google
     - Reports current URL to host (metadata only)
  ════════════════════════════════════════════════════════ */

  let _cur = location.href;

  function sendToHost(msg) {
    try { window.top.postMessage(msg, '*'); } catch {}
  }

  function requestNav(url) {
    sendToHost({ type: '__ifm_navigate', url });
  }

  function reportUrl(url) {
    sendToHost({ type: '__ifm_currenturl', url });
  }

  // SPA navigations — just report, history managed by host
  function onNavigated(url) {
    if (!url || url === _cur) return;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return;
    _cur = url;
    reportUrl(_cur);
  }

  /* ── Intercept link clicks ── */
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    // Bookmarklets: let doGo handle them, not link clicks
    if (href.startsWith('javascript:')) return;
    // Ctrl/Meta = new tab
    if (e.ctrlKey || e.metaKey) return;
    // Force same-frame
    e.preventDefault();
    e.stopPropagation();
    let resolved;
    try { resolved = new URL(href, location.href).href; } catch { return; }
    requestNav(resolved);
  }, true);

  // Neutralise target=_blank unless Ctrl held
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (a && a.target === '_blank' && !e.ctrlKey && !e.metaKey) a.target = '_self';
  }, true);

  /* ── SPA navigation hooks ── */
  ['pushState','replaceState'].forEach(name => {
    const orig = history[name];
    history[name] = function(...args) {
      const r = orig.apply(this, args);
      setTimeout(() => { if (location.href !== _cur) onNavigated(location.href); }, 0);
      return r;
    };
  });
  window.addEventListener('popstate', () => {
    if (location.href !== _cur) onNavigated(location.href);
  });

  // Report initial URL
  reportUrl(location.href);

  /* ════════════════════════════
     BAR UI
  ════════════════════════════ */
  const COR_W = 80;
  const COR_H = 52;

  // Inject styles
  const sty = document.createElement('style');
  sty.textContent = `
#__ufb{all:initial;position:fixed;bottom:0;right:0;z-index:2147483647;
  display:flex;align-items:stretch;background:#fff;
  border-top:1px solid #dadce0;border-left:1px solid #dadce0;
  border-top-left-radius:5px;pointer-events:none;opacity:0;
  transition:opacity .12s ease;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  height:28px;overflow:hidden;white-space:nowrap;
  box-shadow:-1px -1px 5px rgba(0,0,0,.08)}
#__ufb.show{opacity:1;pointer-events:all}
#__ufb .__ub{all:unset;display:flex;align-items:center;justify-content:center;
  width:28px;height:28px;cursor:pointer;color:#5f6368;flex-shrink:0;
  transition:background .1s,color .1s;border-right:1px solid #f1f3f4}
#__ufb .__ub:hover{background:#f1f3f4;color:#202124}
#__ufb .__ub[disabled]{color:#d0d0d0;cursor:default;pointer-events:none}
#__ufb .__ub svg{width:12px;height:12px;display:block}
#__ufb .__ui{all:unset;height:28px;padding:0 7px;font-size:11px;color:#202124;
  width:200px;border-left:1px solid #dadce0;border-right:1px solid #f1f3f4;cursor:text;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__ufb .__ui:focus{background:#f8f9fa}
#__ufb .__ui::placeholder{color:#9aa0a6}
#__ufb .__ugl{all:unset;display:flex;align-items:center;justify-content:center;
  width:28px;height:28px;cursor:pointer;color:#5f6368;flex-shrink:0;
  transition:background .1s,color .1s}
#__ufb .__ugl:hover{background:#f1f3f4;color:#202124}
#__ufb .__ugl svg{width:12px;height:12px;display:block}
`;
  (document.head || document.documentElement).appendChild(sty);

  const bar = document.createElement('div');
  bar.id = '__ufb';

  const btnBack = document.createElement('button');
  btnBack.className = '__ub';
  btnBack.title = 'Back';
  btnBack.disabled = true;
  btnBack.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

  const btnFwd = document.createElement('button');
  btnFwd.className = '__ub';
  btnFwd.title = 'Forward';
  btnFwd.disabled = true;
  btnFwd.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  // Google button — before URL input so it's clear it navigates to Google, not searches input
  const btnGoogle = document.createElement('button');
  btnGoogle.className = '__ugl';
  btnGoogle.title = 'Go to Google';
  // Coloured G logo
  btnGoogle.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'Enter URL or javascript:…';
  urlInput.value = _cur;

  // Order: back, fwd, google, url
  bar.appendChild(btnBack);
  bar.appendChild(btnFwd);
  bar.appendChild(btnGoogle);
  bar.appendChild(urlInput);
  document.body.appendChild(bar);

  function renderBar(canBack, canFwd) {
    btnBack.disabled = !canBack;
    btnFwd.disabled  = !canFwd;
  }

  // Listen for nav state updates from host
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__ifm_navstate') return;
    renderBar(e.data.canBack, e.data.canFwd);
    _cur = e.data.url || _cur;
    if (document.activeElement !== urlInput) urlInput.value = _cur;
  });

  // Events
  btnBack.addEventListener('click', () => sendToHost({ type: '__ifm_goback' }));
  btnFwd.addEventListener('click',  () => sendToHost({ type: '__ifm_goforward' }));
  btnGoogle.addEventListener('click', () => requestNav('https://www.google.com/?igu=1'));

  urlInput.addEventListener('focus', () => urlInput.select());
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doGo(); }
    if (e.key === 'Escape') { urlInput.value = _cur; urlInput.blur(); }
  });

  function doGo() {
    let val = urlInput.value.trim();
    if (!val) return;
    if (val.startsWith('javascript:')) {
      try { (0, eval)(val); } catch(err) { console.warn('Bookmarklet:', err); }
      urlInput.blur();
      return;
    }
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    requestNav(val);
    urlInput.blur();
  }

  // Corner trigger
  let _ht = null;
  let _barHovered = false;
  const _hide = () => { _ht = setTimeout(() => bar.classList.remove('show'), 220); };
  const _show = () => { clearTimeout(_ht); bar.classList.add('show'); };

  document.addEventListener('mousemove', e => {
    const inCorner = window.innerWidth - e.clientX <= COR_W && window.innerHeight - e.clientY <= COR_H;
    if (inCorner || _barHovered) {
      _show();
    }
    // Don't reset the hide timer here — let mouseleave handle hiding
  }, { passive: true });
  bar.addEventListener('mouseenter', () => { _barHovered = true;  _show(); });
  bar.addEventListener('mouseleave', () => { _barHovered = false; _hide(); });
  document.addEventListener('mouseleave', () => { _barHovered = false; _hide(); });

})();
