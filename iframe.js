(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_TOP = window === window.top;

  /* ── HOST PAGE ── */
  if (IS_TOP) {

    function findFrame(win, root) {
      for (const f of (root || document).querySelectorAll('iframe')) {
        try {
          if (f.contentWindow === win) return f;
          const r = findFrame(win, f.contentDocument); if (r) return r;
        } catch {}
      }
      return null;
    }

    function sendNavState(frame) {
      try {
        frame.contentWindow.postMessage({ type: '__ifm_navstate', url: frame.__ifmPendingUrl || '' }, '*');
      } catch {}
    }

    function doNav(frame, url) {
      frame.__ifmPendingUrl = url;
      frame.src = url;
      // After load, send updated url back so bar input refreshes
      frame.addEventListener('load', () => setTimeout(() => sendNavState(frame), 120), { once: true });
    }

    window.addEventListener('message', e => {
      if (!e.data || typeof e.data !== 'object') return;
      const frame = findFrame(e.source);
      if (!frame) return;

      if (e.data.type === '__ifm_navigate') {
        doNav(frame, e.data.url);
      }

      if (e.data.type === '__ifm_currenturl') {
        // Iframe is reporting its real URL (SPA nav / initial load).
        // Just store it — do NOT setAttribute, that causes a reload loop.
        frame.__ifmPendingUrl = e.data.url;
        sendNavState(frame);
      }
    });

    return;
  }

  /* ── IFRAME SIDE ── */

  let _cur = location.href;

  function sendUp(msg) { try { window.parent.postMessage(msg, '*'); } catch {} }
  function requestNav(url) { sendUp({ type: '__ifm_navigate', url }); }
  function reportUrl(url) { sendUp({ type: '__ifm_currenturl', url }); }

  function onNavigated(url) {
    if (!url || url === _cur) return;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return;
    _cur = url;
    reportUrl(_cur);
  }

  // Intercept link clicks — same iframe unless Ctrl/Meta
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    let resolved; try { resolved = new URL(href, location.href).href; } catch { return; }
    requestNav(resolved);
  }, true);

  // Force _blank links into same frame unless Ctrl/Meta
  document.addEventListener('click', e => {
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (a && a.target === '_blank' && !e.ctrlKey && !e.metaKey) a.target = '_self';
  }, true);

  // SPA hooks
  ['pushState', 'replaceState'].forEach(name => {
    const orig = history[name];
    history[name] = function (...a) {
      const r = orig.apply(this, a);
      setTimeout(() => { if (location.href !== _cur) onNavigated(location.href); }, 0);
      return r;
    };
  });
  window.addEventListener('popstate', () => { if (location.href !== _cur) onNavigated(location.href); });

  // Report initial URL
  reportUrl(location.href);

  // Nested iframes: relay only, no bar
  if (window.parent !== window.top) return;

  /* ── BAR UI ── */
  const COR_W = 50, COR_H = 36;

  const sty = document.createElement('style');
  sty.textContent = `
#__ufb{all:initial;position:fixed;bottom:0;right:0;z-index:2147483647;
  display:flex;align-items:stretch;background:#fff;
  border-top:1px solid #e0e0e0;border-left:1px solid #e0e0e0;
  border-top-left-radius:4px;pointer-events:none;opacity:0;
  transition:opacity .1s ease;
  font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  height:24px;overflow:hidden;white-space:nowrap;
  box-shadow:-1px -1px 4px rgba(0,0,0,.06)}
#__ufb.show{opacity:1;pointer-events:all}
#__ufb .__ui{all:unset;height:24px;padding:0 8px;font-size:10.5px;color:#333;
  width:220px;cursor:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__ufb .__ui:focus{background:#fafafa;outline:none}
#__ufb .__ui::placeholder{color:#bbb}`;
  (document.head || document.documentElement).appendChild(sty);

  const bar = document.createElement('div');
  bar.id = '__ufb';

  const urlInput = document.createElement('input');
  urlInput.className = '__ui';
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  urlInput.autocomplete = 'off';
  urlInput.placeholder = 'URL or javascript:…';
  urlInput.value = _cur;

  bar.appendChild(urlInput);
  document.body.appendChild(bar);

  // Receive nav state from host (url updates)
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__ifm_navstate') return;
    if (e.data.url) { _cur = e.data.url; if (document.activeElement !== urlInput) urlInput.value = _cur; }
  });

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
      urlInput.blur(); return;
    }
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    requestNav(val);
    urlInput.blur();
  }

  /* ── Hover ── */
  let _ht = null, _barHovered = false;
  const _show = () => { clearTimeout(_ht); bar.classList.add('show'); };
  const _hide = () => { clearTimeout(_ht); _ht = setTimeout(() => { if (!_barHovered) bar.classList.remove('show'); }, 180); };

  document.addEventListener('mousemove', e => {
    const inCorner = window.innerWidth - e.clientX <= COR_W && window.innerHeight - e.clientY <= COR_H;
    if (inCorner) _show(); else if (!_barHovered) _hide();
  }, { passive: true });

  bar.addEventListener('mouseenter', () => { _barHovered = true; _show(); });
  bar.addEventListener('mouseleave', () => { _barHovered = false; clearTimeout(_ht); _ht = setTimeout(() => bar.classList.remove('show'), 180); });
  document.addEventListener('mouseleave', () => { _barHovered = false; clearTimeout(_ht); bar.classList.remove('show'); });

})();
