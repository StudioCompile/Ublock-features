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
      // Skip frames we just set to srcdoc (blocked page) — they fire load too
      if (frame.__ifmIsBlockedPage) return;

      let href = '';
      try {
        href = frame.contentWindow.location.href;
      } catch {
        // SecurityError = cross-origin page loaded successfully. Do nothing.
        return;
      }

      let blocked = false;
      if (href.startsWith('chrome-error://') || href.startsWith('chrome://')) {
        blocked = true;
      } else {
        // Same-origin error page (e.g. about:blank after ERR_)
        try {
          const doc = frame.contentDocument;
          if (doc && doc.getElementById('main-frame-error')) blocked = true;
        } catch {}
      }

      if (blocked) {
        // The URL we tried to load is stored in __ifmPendingUrl
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

    // Handle messages from iframe side
    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;
      const frame = findFrameByWindow(e.source);

      // Iframe intercepted a link click — navigate the frame
      if (e.data.type === '__ifm_navigate') {
        if (!frame) return;
        const url = e.data.url;
        frame.__ifmPendingUrl = url;
        frame.__ifmIsBlockedPage = false;
        frame.removeAttribute('srcdoc');
        frame.src = url;
      }

      // Blocked page "Back" button
      if (e.data.type === '__ifm_goback') {
        if (!frame) return;
        const prev = frame.__ifmPrevUrl;
        if (prev) {
          frame.__ifmPendingUrl = prev;
          frame.__ifmIsBlockedPage = false;
          frame.removeAttribute('srcdoc');
          frame.src = prev;
        }
      }

      // Blocked page "Try again"
      if (e.data.type === '__ifm_retry') {
        if (!frame) return;
        const url = frame.__ifmBlockedUrl || e.data.url;
        if (url) {
          frame.__ifmPendingUrl = url;
          frame.__ifmIsBlockedPage = false;
          frame.removeAttribute('srcdoc');
          frame.src = url;
        }
      }

      // Iframe reports its current URL (for src attribute tracking only — no navigation)
      if (e.data.type === '__ifm_currenturl') {
        if (!frame) return;
        // Store as a data property — do NOT setAttribute (that would navigate)
        frame.__ifmCurrentUrl = e.data.url;
        frame.__ifmPrevUrl = frame.__ifmPendingUrl || frame.__ifmCurrentUrl;
        frame.__ifmPendingUrl = e.data.url;
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
     - Tracks history internally
     - Bottom-right corner bar: back, fwd, url input, google
     - Reports current URL to host (metadata only)
  ════════════════════════════════════════════════════════ */

  const _hist = [];
  const _fwd  = [];
  let   _cur  = location.href;

  function sendToHost(msg) {
    try { window.top.postMessage(msg, '*'); } catch {}
  }

  function requestNav(url) {
    sendToHost({ type: '__ifm_navigate', url });
  }

  function reportUrl(url) {
    sendToHost({ type: '__ifm_currenturl', url });
  }

  // Called whenever we successfully land on a new URL inside this iframe
  function onNavigated(url) {
    if (!url || url === _cur) return;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return;
    _hist.push(_cur);
    _fwd.length = 0;
    _cur = url;
    reportUrl(_cur);
    renderBar();
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
  width:200px;border-right:1px solid #f1f3f4;cursor:text;
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

  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'Enter URL or javascript:…';
  urlInput.value = _cur;

  const btnGoogle = document.createElement('button');
  btnGoogle.className = '__ugl';
  btnGoogle.title = 'Google';
  btnGoogle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-3.5-3.5"/></svg>`;

  bar.appendChild(btnBack);
  bar.appendChild(btnFwd);
  bar.appendChild(urlInput);
  bar.appendChild(btnGoogle);
  document.body.appendChild(bar);

  function renderBar() {
    btnBack.disabled = _hist.length === 0;
    btnFwd.disabled  = _fwd.length  === 0;
    if (document.activeElement !== urlInput) urlInput.value = _cur;
  }

  // Events
  btnBack.addEventListener('click', () => {
    if (!_hist.length) return;
    const prev = _hist.pop();
    _fwd.unshift(_cur);
    _cur = prev;
    renderBar();
    requestNav(_cur);
  });

  btnFwd.addEventListener('click', () => {
    if (!_fwd.length) return;
    const next = _fwd.shift();
    _hist.push(_cur);
    _cur = next;
    renderBar();
    requestNav(_cur);
  });

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
  document.addEventListener('mousemove', e => {
    if (window.innerWidth - e.clientX <= COR_W && window.innerHeight - e.clientY <= COR_H) {
      clearTimeout(_ht);
      bar.classList.add('show');
    }
  }, { passive: true });
  bar.addEventListener('mouseenter', () => { clearTimeout(_ht); bar.classList.add('show'); });
  bar.addEventListener('mouseleave', () => { _ht = setTimeout(() => bar.classList.remove('show'), 300); });
  document.addEventListener('mouseleave', () => { _ht = setTimeout(() => bar.classList.remove('show'), 300); });

})();
