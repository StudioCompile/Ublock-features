(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  /* ════════════════════════════════════════════════════════
     HOST PAGE
  ════════════════════════════════════════════════════════ */
  if (!IS_IFRAME) {

    function hijackSrc(frame) {
      let _src = frame.getAttribute('src') || '';
      const define = () => Object.defineProperty(frame, 'src', {
        get: () => _src,
        set: (v) => { _src = v; }, // silent no-op — won't trigger navigation
        configurable: true,
        enumerable: true,
      });
      define();
      return {
        navigate(url) {
          delete frame.src;   // restore native setter temporarily
          frame.src = url;    // real navigation
          _src = url;
          define();           // re-shadow immediately so reads stay current
        },
        update(url) {
          _src = url;         // reflect same-domain pushState/popstate silently
        }
      };
    }

    function getOrInitSrc(frame) {
      if (!frame.__ifmSrc) frame.__ifmSrc = hijackSrc(frame);
      return frame.__ifmSrc;
    }

    function findFrameByWindow(win) {
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentWindow === win) return f; } catch {}
      }
      return null;
    }

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
      getOrInitSrc(frame).navigate(url);
      frame.addEventListener('load', () => {
        setTimeout(() => sendNavState(frame), 100);
      }, { once: true });
    }

    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;
      const frame = findFrameByWindow(e.source);
      if (!frame) return;

      if (e.data.type === '__ifm_navigate') {
        const url = e.data.url;
        const old = frame.__ifmPendingUrl;
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        if (old && !old.startsWith('data:') && old !== 'about:blank') frame.__ifmHist.push(old);
        frame.__ifmFwd = [];
        doFrameNav(frame, url);
      }

      if (e.data.type === '__ifm_goback') {
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const prev = frame.__ifmHist.pop();
        if (!prev) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmFwd.unshift(cur);
        doFrameNav(frame, prev);
      }

      if (e.data.type === '__ifm_goforward') {
        if (!frame.__ifmHist) frame.__ifmHist = [];
        if (!frame.__ifmFwd)  frame.__ifmFwd  = [];
        const next = frame.__ifmFwd.shift();
        if (!next) return;
        const cur = frame.__ifmPendingUrl;
        if (cur && !cur.startsWith('data:')) frame.__ifmHist.push(cur);
        doFrameNav(frame, next);
      }

      // Iframe reports its real current URL (initial load + every same-domain path change)
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
        getOrInitSrc(frame).update(newUrl); // silently keeps frame.src current, no reload
        sendNavState(frame);
      }
    });

    return; // host page done
  }

  /* ════════════════════════════════════════════════════════
     IFRAME SIDE
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
    if (href.startsWith('javascript:')) return;
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

  reportUrl(location.href);

  /* ════════════════════════════
     BAR UI
  ════════════════════════════ */
  const COR_W = 80;
  const COR_H = 52;

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

  const btnGoogle = document.createElement('button');
  btnGoogle.className = '__ugl';
  btnGoogle.title = 'Go to Google';
  btnGoogle.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'Enter URL or javascript:…';
  urlInput.value = _cur;

  bar.appendChild(btnBack);
  bar.appendChild(btnFwd);
  bar.appendChild(btnGoogle);
  bar.appendChild(urlInput);
  document.body.appendChild(bar);

  function renderBar(canBack, canFwd) {
    btnBack.disabled = !canBack;
    btnFwd.disabled  = !canFwd;
  }

  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__ifm_navstate') return;
    renderBar(e.data.canBack, e.data.canFwd);
    _cur = e.data.url || _cur;
    if (document.activeElement !== urlInput) urlInput.value = _cur;
  });

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

  let _ht = null;
  let _barHovered = false;
  const _hide = () => { _ht = setTimeout(() => bar.classList.remove('show'), 220); };
  const _show = () => { clearTimeout(_ht); bar.classList.add('show'); };

  document.addEventListener('mousemove', e => {
    const inCorner = window.innerWidth - e.clientX <= COR_W && window.innerHeight - e.clientY <= COR_H;
    if (inCorner || _barHovered) _show();
  }, { passive: true });
  bar.addEventListener('mouseenter', () => { _barHovered = true;  _show(); });
  bar.addEventListener('mouseleave', () => { _barHovered = false; _hide(); });
  document.addEventListener('mouseleave', () => { _barHovered = false; _hide(); });

})();
