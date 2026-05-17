(function () {
  'use strict';

  // Prevent double-injection
  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  /* ─────────────────────────────────────────────
     TOP-LAYER MANAGER
     Runs on the host page (your website).
     - Listens for navigate / urlChange messages
     - Recreates the iframe on navigation
     - Broadcasts current URL via custom event
     - Detects blocked/error pages and swaps in custom page
  ───────────────────────────────────────────── */
  if (!IS_IFRAME) {
    window.addEventListener('message', (e) => {
      if (!e.data || typeof e.data !== 'object') return;

      // ── Recreate iframe with new src ──────────
      if (e.data.type === '__ifm_navigate') {
        const newUrl = e.data.url;
        if (!newUrl) return;

        const target = findIframeByWindow(e.source);
        if (!target) return;

        recreateIframe(target, newUrl);
        dispatchUrlEvent(newUrl);
      }

      // ── URL change reported by iframe ─────────
      if (e.data.type === '__ifm_urlChange') {
        dispatchUrlEvent(e.data.url);
      }

      // ── Back button on blocked page ───────────
      if (e.data.type === '__ifm_back') {
        const target = findIframeByWindow(e.source);
        if (target) {
          try { target.contentWindow.history.back(); } catch {}
        }
      }
    });

    function findIframeByWindow(win) {
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentWindow === win) return f; } catch {}
      }
      return null;
    }

    function recreateIframe(oldFrame, newUrl) {
      const parent  = oldFrame.parentNode;
      const nextSib = oldFrame.nextSibling;
      const attrs   = [...oldFrame.attributes];

      oldFrame.remove();

      const fresh = document.createElement('iframe');
      for (const a of attrs) {
        if (a.name !== 'src' && a.name !== 'srcdoc') fresh.setAttribute(a.name, a.value);
      }
      fresh.src = newUrl;

      if (nextSib) parent.insertBefore(fresh, nextSib);
      else parent.appendChild(fresh);

      // After load, check if the page is blocked
      fresh.addEventListener('load', () => checkForBlockedPage(fresh, newUrl));
    }

    /**
     * Dispatch a custom event on the host window so your page JS can listen:
     *   window.addEventListener('iframeUrlChange', e => console.log(e.detail.url));
     *
     * Also re-emits the raw postMessage so you can use either pattern:
     *   window.addEventListener('message', e => { if(e.data?.type==='__ifm_urlChange') ... })
     */
    function dispatchUrlEvent(url) {
      window.dispatchEvent(new CustomEvent('iframeUrlChange', { detail: { url } }));
    }

    /**
     * Try to detect Chrome ERR_ / blocked pages.
     * - If we can read the document and it has #main-frame-error → blocked
     * - If we can't read (cross-origin SecurityError) the page loaded but
     *   X-Frame-Options / CSP blocked the embed → show blocked page
     */
    function checkForBlockedPage(frame, attemptedUrl) {
      let isBlocked = false;
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        // Chrome error pages have this element
        if (doc.getElementById('main-frame-error')) isBlocked = true;
        // ERR_ in title is another signal
        if (!isBlocked && doc.title && /err_|blocked|denied|refused|cannot/i.test(doc.title)) {
          isBlocked = true;
        }
        // about:blank after a failed load (Chrome sometimes lands here)
        if (!isBlocked && doc.URL === 'about:blank' && attemptedUrl !== 'about:blank') {
          isBlocked = true;
        }
      } catch {
        // SecurityError = cross-origin page that loaded (fine, leave it)
        // BUT if it's a real network error Chrome loads an error page at the
        // same origin so we'd have gotten a SecurityError — treat as blocked.
        isBlocked = true;
      }

      if (isBlocked) injectBlockedPage(frame, attemptedUrl);
    }

    function injectBlockedPage(frame, blockedUrl) {
      frame.removeAttribute('src');
      frame.srcdoc = buildBlockedPageHTML(blockedUrl);
    }

    function buildBlockedPageHTML(blockedUrl) {
      const safeUrl = (blockedUrl || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page Blocked</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:#f7f7f8;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif}
  .card{background:#fff;border:1px solid #e3e3e6;border-radius:16px;box-shadow:0 4px 28px rgba(0,0,0,0.09);padding:40px 36px 32px;max-width:380px;width:90%;text-align:center}
  .icon{width:52px;height:52px;background:#fff1f1;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:1.5px solid #fcd0d0}
  .icon svg{width:24px;height:24px;stroke:#e05252}
  h1{font-size:17px;font-weight:650;color:#1a1a1a;margin-bottom:8px;letter-spacing:-.01em}
  .url-box{font-size:11px;color:#888;background:#f3f3f5;border-radius:6px;padding:6px 10px;word-break:break-all;margin:10px 0 22px;line-height:1.5;text-align:left}
  p{font-size:13px;color:#666;line-height:1.6;margin-bottom:24px}
  .back-btn{display:inline-flex;align-items:center;gap:6px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s,transform .1s;text-decoration:none}
  .back-btn:hover{background:#333;transform:translateY(-1px)}
  .back-btn svg{width:14px;height:14px;stroke:currentColor}
</style>
</head>
<body>
<div class="card">
  <div class="icon">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  </div>
  <h1>This page can't be displayed</h1>
  <div class="url-box">${safeUrl}</div>
  <p>This site is blocked, refused the connection, or doesn't allow embedding in iframes.</p>
  <button class="back-btn" onclick="window.parent.postMessage({type:'__ifm_back'},'*')">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
    Go back
  </button>
</div>
</body>
</html>`;
    }

    // Host-page setup done — no menu injected here
    return;
  }

  /* ─────────────────────────────────────────────
     IFRAME-ONLY: MENU + NAV INTERCEPTOR
  ───────────────────────────────────────────── */

  const TRIGGER_HEIGHT = 8;   // px from bottom that reveals menu
  const MENU_ID  = '__ifm-menu';
  const STYLE_ID = '__ifm-style';

  const css = `
    #${MENU_ID} {
      all: initial;
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 2147483647;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(5px);
      transition: opacity 0.16s ease, transform 0.16s ease;
    }
    #${MENU_ID}.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }
    #${MENU_ID} .ifm-card {
      background: #fff;
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
      display: none;
      flex-direction: column;
      min-width: 260px;
      max-width: 340px;
    }
    #${MENU_ID} .ifm-card.open { display: flex; }
    #${MENU_ID} .ifm-card-header {
      padding: 7px 12px 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #aaa;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
    }
    #${MENU_ID} .ifm-url-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
    }
    #${MENU_ID} .ifm-url-text {
      flex: 1;
      font-size: 11.5px;
      color: #333;
      word-break: break-all;
      line-height: 1.45;
      max-height: 58px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    #${MENU_ID} .ifm-copy-btn {
      flex-shrink: 0;
      border: 1px solid #ddd;
      background: #fff;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 500;
      color: #444;
      cursor: pointer;
      transition: background .12s, color .12s, border-color .12s;
      white-space: nowrap;
    }
    #${MENU_ID} .ifm-copy-btn:hover { background: #f0f0f0; }
    #${MENU_ID} .ifm-copy-btn.copied {
      background: #e8faf2;
      color: #1a9e50;
      border-color: #aadfc0;
    }
    #${MENU_ID} .ifm-btn-row {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    #${MENU_ID} .ifm-icon-btn {
      all: unset;
      width: 34px;
      height: 34px;
      background: #fff;
      border: 1px solid #e2e2e2;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: background .12s, box-shadow .12s, transform .1s;
      color: #555;
    }
    #${MENU_ID} .ifm-icon-btn:hover {
      background: #f5f5f5;
      box-shadow: 0 3px 12px rgba(0,0,0,0.12);
      transform: translateY(-1px);
    }
    #${MENU_ID} .ifm-icon-btn.active {
      background: #f0f4ff;
      border-color: #b0c2f5;
      color: #2244cc;
    }
    #${MENU_ID} .ifm-icon-btn svg {
      width: 15px;
      height: 15px;
      display: block;
    }
  `;

  const ICON_URL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="8"/>
    <path d="M2 10h16M10 2a13 13 0 0 1 0 16M10 2a13 13 0 0 0 0 16"/>
  </svg>`;

  function buildMenu() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }

    const menu = document.createElement('div');
    menu.id = MENU_ID;

    const urlCard = document.createElement('div');
    urlCard.className = 'ifm-card';
    urlCard.innerHTML = `
      <div class="ifm-card-header">Current URL</div>
      <div class="ifm-url-row">
        <div class="ifm-url-text" id="__ifm-url-text">${location.href}</div>
        <button class="ifm-copy-btn" id="__ifm-copy-btn">Copy</button>
      </div>`;

    const btnRow = document.createElement('div');
    btnRow.className = 'ifm-btn-row';

    const urlBtn = document.createElement('button');
    urlBtn.className = 'ifm-icon-btn';
    urlBtn.title = 'Show URL';
    urlBtn.innerHTML = ICON_URL;
    btnRow.appendChild(urlBtn);

    menu.appendChild(urlCard);
    menu.appendChild(btnRow);
    (document.body || document.documentElement).appendChild(menu);

    let urlOpen = false;

    urlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      urlOpen = !urlOpen;
      urlCard.classList.toggle('open', urlOpen);
      urlBtn.classList.toggle('active', urlOpen);
      if (urlOpen) document.getElementById('__ifm-url-text').textContent = location.href;
    });

    document.getElementById('__ifm-copy-btn').addEventListener('click', () => {
      const url = location.href;
      const btn = document.getElementById('__ifm-copy-btn');
      const done = () => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
      } else {
        fallbackCopy(url, done);
      }
    });

    return menu;
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', opacity: '0', top: '0', left: '0' });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch {}
    ta.remove();
  }

  function initHoverTrigger(menu) {
    let timer = null;
    const show = () => { clearTimeout(timer); menu.classList.add('visible'); };
    const hide = () => { timer = setTimeout(() => menu.classList.remove('visible'), 280); };

    document.addEventListener('mousemove', (e) => {
      if (window.innerHeight - e.clientY <= TRIGGER_HEIGHT) show();
    }, { passive: true });

    menu.addEventListener('mouseenter', show);
    menu.addEventListener('mouseleave', hide);
    document.addEventListener('mouseleave', hide);
  }

  /**
   * Broadcast current URL to the host page.
   *
   * Host page listens via EITHER:
   *   window.addEventListener('message', e => {
   *     if (e.data?.type === '__ifm_urlChange') console.log(e.data.url);
   *   });
   * OR (same-origin only — the top-layer manager fires this):
   *   window.addEventListener('iframeUrlChange', e => console.log(e.detail.url));
   */
  function broadcastUrl(url) {
    try {
      window.top.postMessage({ type: '__ifm_urlChange', url }, '*');
    } catch {}
  }

  function initNavInterceptor() {
    // Immediately broadcast on load
    broadcastUrl(location.href);

    // Intercept anchor clicks
    document.addEventListener('click', (e) => {
      const anchor = e.composedPath().find(el => el && el.tagName === 'A');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
      let resolved;
      try { resolved = new URL(href, location.href).href; } catch { return; }

      // Same-page anchors already filtered; external navigation → intercept
      e.preventDefault();
      e.stopPropagation();
      window.top.postMessage({ type: '__ifm_navigate', url: resolved }, '*');
    }, true);

    // Intercept form submissions
    document.addEventListener('submit', (e) => {
      let action = e.target.getAttribute('action') || location.href;
      try { action = new URL(action, location.href).href; } catch { return; }
      e.preventDefault();
      window.top.postMessage({ type: '__ifm_navigate', url: action }, '*');
    }, true);

    // SPA navigation (pushState / replaceState / popstate)
    const wrap = (orig) => function (...args) {
      const r = orig.apply(this, args);
      broadcastUrl(location.href);
      return r;
    };
    history.pushState    = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', () => broadcastUrl(location.href));
  }

  function init() {
    const menu = buildMenu();
    initHoverTrigger(menu);
    initNavInterceptor();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
