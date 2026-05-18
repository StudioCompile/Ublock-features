(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  // Only the true top window (your host page) runs the host logic.
  // Every other frame (including nested iframes) runs the iframe logic.
  const IS_TOP = window === window.top;

  /* ════════════════════════════════════════════════════════
     HOST PAGE — receives messages, manages history, updates src
  ════════════════════════════════════════════════════════ */
  if (IS_TOP) {

    // Walk all nested iframes recursively to find by contentWindow
    function findFrameByWindow(win, root) {
      const frames = (root || document).querySelectorAll('iframe');
      for (const f of frames) {
        try {
          if (f.contentWindow === win) return f;
          // Recurse into same-origin nested frames
          const found = findFrameByWindow(win, f.contentDocument);
          if (found) return found;
        } catch {}
      }
      return null;
    }

    function sendNavState(frame, keepOpen) {
      try {
        frame.contentWindow.postMessage({
          type: '__ifm_navstate',
          canBack: (frame.__ifmHist || []).length > 0,
          canFwd:  (frame.__ifmFwd  || []).length > 0,
          url:     frame.__ifmPendingUrl || '',
          keepOpen: !!keepOpen,
        }, '*');
      } catch {}
    }

    function doFrameNav(frame, url, keepOpen) {
      frame.__ifmPendingUrl = url;
      frame.src = url;
      frame.addEventListener('load', () => {
        setTimeout(() => sendNavState(frame, keepOpen), 120);
      }, { once: true });
    }

    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;
      // Find the frame that sent this — could be nested
      const frame = findFrameByWindow(e.source);
      if (!frame) return;

      if (e.data.type === '__ifm_navigate') {
        const url = e.data.url;
        const old = frame.__ifmPendingUrl;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        if (old && !old.startsWith('data:') && old !== 'about:blank') frame.__ifmHist.push(old);
        frame.__ifmFwd = [];
        doFrameNav(frame, url, false);
      }

      if (e.data.type === '__ifm_goback') {
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const prev = frame.__ifmHist.pop();
        if (!prev) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmFwd.unshift(cur);
        doFrameNav(frame, prev, true); // keepOpen=true so bar stays visible
      }

      if (e.data.type === '__ifm_goforward') {
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const next = frame.__ifmFwd.shift();
        if (!next) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmHist.push(cur);
        doFrameNav(frame, next, true); // keepOpen=true
      }

      if (e.data.type === '__ifm_currenturl') {
        const newUrl = e.data.url;
        const old = frame.__ifmPendingUrl;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        if (old && old !== newUrl && !old.startsWith('data:') && old !== 'about:blank') {
          frame.__ifmHist.push(old);
          frame.__ifmFwd = [];
        }
        frame.__ifmPendingUrl = newUrl;
        // Update src attribute (no loop risk — no MutationObserver watching it)
        try { frame.setAttribute('src', newUrl); } catch {}
        sendNavState(frame, false);
      }
    });

    return;
  }

  /* ════════════════════════════════════════════════════════
     IFRAME / NESTED IFRAME SIDE
     Messages go to window.parent (one level up), not window.top.
     This way nested iframes bubble messages up correctly.
  ════════════════════════════════════════════════════════ */

  let _cur = location.href;

  // Always send to direct parent — messages bubble up level by level
  // since every frame in the chain runs this script
  function sendUp(msg) {
    try { window.parent.postMessage(msg, '*'); } catch {}
  }

  function requestNav(url) {
    sendUp({ type: '__ifm_navigate', url });
  }

  function reportUrl(url) {
    sendUp({ type: '__ifm_currenturl', url });
  }

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
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    let resolved;
    try { resolved = new URL(href, location.href).href; } catch { return; }
    requestNav(resolved);
  }, true);

  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (a && a.target === '_blank' && !e.ctrlKey && !e.metaKey) a.target = '_self';
  }, true);

  /* ── SPA hooks ── */
  ['pushState', 'replaceState'].forEach(name => {
    const orig = history[name];
    history[name] = function (...args) {
      const r = orig.apply(this, args);
      setTimeout(() => { if (location.href !== _cur) onNavigated(location.href); }, 0);
      return r;
    };
  });
  window.addEventListener('popstate', () => {
    if (location.href !== _cur) onNavigated(location.href);
  });

  reportUrl(location.href);

  /* ════════════════════════════
     BAR UI (only in direct iframe of host, not nested iframes)
     Only show bar if our direct parent is the top window.
  ════════════════════════════ */
  if (window.parent !== window.top) return; // nested iframe — no bar, just relay

  const COR_W = 50;
  const COR_H = 36;
  const H = 24; // bar height px

  const sty = document.createElement('style');
  sty.textContent = `
#__ufb{all:initial;position:fixed;bottom:0;right:0;z-index:2147483647;
  display:flex;align-items:stretch;background:#fff;
  border-top:1px solid #e0e0e0;border-left:1px solid #e0e0e0;
  border-top-left-radius:4px;pointer-events:none;opacity:0;
  transition:opacity .1s ease;
  font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  height:${H}px;overflow:hidden;white-space:nowrap;
  box-shadow:-1px -1px 4px rgba(0,0,0,.06)}
#__ufb.show{opacity:1;pointer-events:all}
#__ufb .__ub{all:unset;display:flex;align-items:center;justify-content:center;
  width:${H}px;height:${H}px;cursor:pointer;color:#80868b;flex-shrink:0;
  transition:background .1s,color .1s;border-right:1px solid #f1f3f4}
#__ufb .__ub:hover{background:#f8f8f8;color:#333}
#__ufb .__ub[disabled]{color:#d8d8d8;cursor:default;pointer-events:none}
#__ufb .__ub svg{width:11px;height:11px;display:block}
#__ufb .__ugl{all:unset;display:flex;align-items:center;justify-content:center;
  width:${H}px;height:${H}px;cursor:pointer;flex-shrink:0;
  transition:background .1s;border-right:1px solid #e8e8e8}
#__ufb .__ugl:hover{background:#f8f8f8}
#__ufb .__ugl svg,#__ufb .__ugl img{width:11px;height:11px;display:block}
#__ufb .__ui{all:unset;height:${H}px;padding:0 6px;font-size:10.5px;color:#333;
  width:190px;border-left:1px solid #e8e8e8;cursor:text;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:0}
#__ufb .__ui:focus{background:#fafafa;outline:none}
#__ufb .__ui::placeholder{color:#bbb}
`;
  (document.head || document.documentElement).appendChild(sty);

  const bar = document.createElement('div');
  bar.id = '__ufb';

  const btnBack = document.createElement('button');
  btnBack.className = '__ub';
  btnBack.title = 'Back';
  btnBack.disabled = true;
  btnBack.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

  const btnFwd = document.createElement('button');
  btnFwd.className = '__ub';
  btnFwd.title = 'Forward';
  btnFwd.disabled = true;
  btnFwd.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  const btnGoogle = document.createElement('button');
  btnGoogle.className = '__ugl';
  btnGoogle.title = 'Go to Google';
  btnGoogle.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'URL or javascript:…';
  urlInput.value = _cur;

  bar.appendChild(btnBack);
  bar.appendChild(btnFwd);
  bar.appendChild(btnGoogle);
  bar.appendChild(urlInput);
  document.body.appendChild(bar);

  // Prevent back/fwd clicks from causing mouseleave on the bar
  btnBack.addEventListener('mousedown', e => e.preventDefault());
  btnFwd.addEventListener('mousedown', e => e.preventDefault());

  function renderBar(canBack, canFwd) {
    btnBack.disabled = !canBack;
    btnFwd.disabled  = !canFwd;
  }

  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__ifm_navstate') return;
    renderBar(e.data.canBack, e.data.canFwd);
    _cur = e.data.url || _cur;
    if (document.activeElement !== urlInput) urlInput.value = _cur;
    if (e.data.keepOpen) _show();
  });

  btnBack.addEventListener('click', () => sendUp({ type: '__ifm_goback' }));
  btnFwd.addEventListener('click',  () => sendUp({ type: '__ifm_goforward' }));
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
      try { (0, eval)(val); } catch (err) { console.warn('Bookmarklet:', err); }
      urlInput.blur();
      return;
    }
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    requestNav(val);
    urlInput.blur();
  }

  /* ── Hover trigger ── */
  let _ht = null;
  let _barHovered = false;

  const _show = () => { clearTimeout(_ht); bar.classList.add('show'); };
  const _hide = () => {
    clearTimeout(_ht);
    _ht = setTimeout(() => { if (!_barHovered) bar.classList.remove('show'); }, 180);
  };

  document.addEventListener('mousemove', e => {
    const inCorner = window.innerWidth - e.clientX <= COR_W && window.innerHeight - e.clientY <= COR_H;
    if (inCorner) {
      _show();
    } else if (!_barHovered) {
      _hide();
    }
  }, { passive: true });

  bar.addEventListener('mouseenter', () => { _barHovered = true; _show(); });
  bar.addEventListener('mouseleave', () => {
    _barHovered = false;
    // Hide immediately without waiting for mousemove
    clearTimeout(_ht);
    _ht = setTimeout(() => bar.classList.remove('show'), 180);
  });
  // Catch mouse leaving the window entirely
  document.addEventListener('mouseleave', () => {
    _barHovered = false;
    clearTimeout(_ht);
    bar.classList.remove('show');
  });

})();
