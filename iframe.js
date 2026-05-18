(function () {
  'use strict';
 
  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;
 
  const IS_TOP = window === window.top;
 
  /* ── HOST PAGE ── */
  if (IS_TOP) {
 
    function findFrame(win) {
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentWindow === win) return f; } catch {}
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
 
  // Relay messages from child iframes upward through the frame chain
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object') return;
    const t = e.data.type;
    if (t === '__ifm_navigate' || t === '__ifm_currenturl') sendUp(e.data);
  });
 
  // Intercept link clicks — robust for ChromeOS/WebView
  function interceptAnchor(e) {
    let a = null;
    try { a = e.composedPath().find(n => n && n.tagName === 'A'); } catch {}
    if (!a) { let n = e.target; while (n && n !== document) { if (n.tagName === 'A') { a = n; break; } n = n.parentElement; } }
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (e.ctrlKey || e.metaKey) return;
    if (a.target === '_blank') a.target = '_self';
    e.preventDefault();
    e.stopPropagation();
    let resolved; try { resolved = new URL(href, location.href).href; } catch { return; }
    requestNav(resolved);
  }
  document.addEventListener('click', interceptAnchor, true);
  document.addEventListener('auxclick', interceptAnchor, true);
 
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
 
  // ALL iframes get the bar — remove nested iframe restriction
 
  /* ── BAR UI ── */
  // Pure CSS hover: a transparent trigger zone in the corner reveals the bar.
  // Wrap trigger + bar in a container; hovering anywhere in it keeps bar visible.
  // No JS timers needed for show/hide.
 
  const sty = document.createElement('style');
  sty.textContent = `
#__ufb-wrap{all:initial;position:fixed;bottom:0;right:0;z-index:2147483647;
  display:block;width:60px;height:44px}
#__ufb-wrap:hover #__ufb{opacity:1;pointer-events:all}
#__ufb{all:initial;position:absolute;bottom:0;right:0;
  display:flex;align-items:stretch;background:#fff;
  border-top:1px solid #e0e0e0;border-left:1px solid #e0e0e0;
  border-top-left-radius:4px;pointer-events:none;opacity:0;
  font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  height:24px;overflow:hidden;white-space:nowrap;
  box-shadow:-1px -1px 4px rgba(0,0,0,.06);
  width:220px}
#__ufb .__ui{all:unset;height:24px;padding:0 8px;font-size:10.5px;color:#333;
  width:220px;cursor:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__ufb .__ui:focus{background:#fafafa;outline:none}
#__ufb .__ui::placeholder{color:#bbb}`;
  (document.head || document.documentElement).appendChild(sty);
 
  const wrap = document.createElement('div');
  wrap.id = '__ufb-wrap';
 
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
  wrap.appendChild(bar);
  document.body.appendChild(wrap);
 
  // Expand wrap to cover the bar width when bar is hovered
  // so moving from trigger zone into the bar keeps it open
  bar.addEventListener('mouseenter', () => { wrap.style.width = '220px'; wrap.style.height = '24px'; });
  bar.addEventListener('mouseleave', () => { wrap.style.width = '60px'; wrap.style.height = '44px'; });
 
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
 
})();
