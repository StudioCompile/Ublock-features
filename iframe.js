(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  /* ─────────────────────────────────────────────
     HOST-PAGE MANAGER  (runs on your website)
     - Watches iframes for load events
     - Detects Chrome blocked/error pages and
       replaces them with a custom blocked page
     - Handles the "Go back" postMessage
     No menu is rendered here.
  ───────────────────────────────────────────── */
  if (!IS_IFRAME) {

    // Watch every iframe that exists now or is added later
    function watchIframe(frame) {
      if (frame.__ifmWatched) return;
      frame.__ifmWatched = true;

      frame.addEventListener('load', () => {
        // Small delay — Chrome's error page needs a tick to fully render
        setTimeout(() => checkForBlockedPage(frame), 50);
      });

      // Also check immediately in case it already loaded
      setTimeout(() => checkForBlockedPage(frame), 50);
    }

    document.querySelectorAll('iframe').forEach(watchIframe);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(n => {
          if (n.tagName === 'IFRAME') watchIframe(n);
          if (n.querySelectorAll) n.querySelectorAll('iframe').forEach(watchIframe);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Back button from blocked page srcdoc
    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== '__ifm_back') return;
      // Find which iframe sent this (srcdoc iframes have null contentWindow origin
      // but e.source still matches)
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if (f.contentWindow === e.source) {
            // Navigate it back using our tracked history
            const hist = f.__ifmHistory || [];
            hist.pop(); // remove current (blocked) entry
            const prev = hist.pop(); // go to previous
            if (prev) {
              f.__ifmHistory = hist;
              f.src = prev;
            } else {
              f.src = 'about:blank';
            }
            break;
          }
        } catch {}
      }
    });

    function checkForBlockedPage(frame) {
      let doc;
      try {
        doc = frame.contentDocument;
      } catch {
        // SecurityError → legitimate cross-origin page loaded fine; do nothing
        return;
      }

      if (!doc) return;

      const frameUrl = (() => { try { return frame.contentWindow.location.href; } catch { return ''; } })();

      // Chrome wraps network/blocked errors in chrome-error:// pages
      const isChromError = frameUrl.startsWith('chrome-error://');
      // Chrome also sometimes gives about:blank on X-Frame-Options blocks
      const isAboutBlank = frameUrl === 'about:blank' || frameUrl === '';
      // The error page contains this specific element
      const hasErrorEl   = !!doc.getElementById('main-frame-error');

      if (!isChromError && !hasErrorEl) return; // page loaded fine

      // Grab the attempted URL from the frame's src before we overwrite it
      const attemptedUrl = frame.getAttribute('src') || frameUrl || '';

      injectBlockedPage(frame, attemptedUrl);
    }

    function injectBlockedPage(frame, blockedUrl) {
      // Track history so Go Back works
      if (!frame.__ifmHistory) frame.__ifmHistory = [];
      // Don't push the blocked page itself — the previous src is already tracked

      const safeUrl = (blockedUrl || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      frame.removeAttribute('src');
      frame.srcdoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Can't open page</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:#f5f5f7;display:flex;align-items:center;justify-content:center;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
  .card{background:#fff;border:1px solid #e0e0e3;border-radius:18px;box-shadow:0 2px 24px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);padding:44px 40px 36px;max-width:400px;width:92%;text-align:center}
  .badge{width:56px;height:56px;background:#fff2f2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 22px;border:1.5px solid #ffd0d0}
  .badge svg{width:26px;height:26px;stroke:#d94f4f;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:18px;font-weight:700;color:#111;margin-bottom:6px;letter-spacing:-.02em}
  .url-pill{display:inline-block;font-size:11px;color:#888;background:#f2f2f4;border-radius:20px;padding:4px 12px;margin:10px 0 18px;max-width:100%;word-break:break-all;line-height:1.5}
  p{font-size:13.5px;color:#555;line-height:1.65;margin-bottom:28px}
  .btn{display:inline-flex;align-items:center;gap:7px;background:#111;color:#fff;border:none;border-radius:10px;padding:11px 24px;font-size:13.5px;font-weight:500;cursor:pointer;letter-spacing:-.01em;transition:opacity .15s,transform .1s}
  .btn:hover{opacity:.85;transform:translateY(-1px)}
  .btn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}
</style>
</head>
<body>
<div class="card">
  <div class="badge">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="#d94f4f"/></svg>
  </div>
  <h1>This page can't be opened</h1>
  <div class="url-pill">${safeUrl}</div>
  <p>This site has blocked iframe embedding, refused the connection, or isn't reachable right now.</p>
  <button class="btn" onclick="window.parent.postMessage({type:'__ifm_back'},'*')">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    Go back
  </button>
</div>
</body>
</html>`;
    }

    // Track iframe src changes so Go Back has a history to work with
    const srcObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IFRAME') {
          const frame = m.target;
          if (!frame.__ifmHistory) frame.__ifmHistory = [];
          const newSrc = frame.getAttribute('src');
          if (newSrc && newSrc !== 'about:blank') frame.__ifmHistory.push(newSrc);
        }
      }
    });
    srcObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true });

    // Done — no menu on host page
    return;
  }

  /* ─────────────────────────────────────────────
     IFRAME-ONLY  ─  hover menu + URL broadcast
  ───────────────────────────────────────────── */

  const TRIGGER_HEIGHT = 8;
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

  let urlOpen = false;
  let urlCard, urlBtn;

  function closeCard() {
    if (!urlOpen) return;
    urlOpen = false;
    urlCard.classList.remove('open');
    urlBtn.classList.remove('active');
  }

  function buildMenu() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }

    const menu = document.createElement('div');
    menu.id = MENU_ID;

    urlCard = document.createElement('div');
    urlCard.className = 'ifm-card';
    urlCard.innerHTML = `
      <div class="ifm-card-header">Current URL</div>
      <div class="ifm-url-row">
        <div class="ifm-url-text" id="__ifm-url-text">${location.href}</div>
        <button class="ifm-copy-btn" id="__ifm-copy-btn">Copy</button>
      </div>`;

    const btnRow = document.createElement('div');
    btnRow.className = 'ifm-btn-row';

    urlBtn = document.createElement('button');
    urlBtn.className = 'ifm-icon-btn';
    urlBtn.title = 'Show URL';
    urlBtn.innerHTML = ICON_URL;
    btnRow.appendChild(urlBtn);

    menu.appendChild(urlCard);
    menu.appendChild(btnRow);
    (document.body || document.documentElement).appendChild(menu);

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
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
          // Close the card after copy confirmation clears
          closeCard();
        }, 1200);
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
    const hide = () => {
      timer = setTimeout(() => {
        menu.classList.remove('visible');
        // Also close the card when the whole menu hides
        closeCard();
      }, 280);
    };

    document.addEventListener('mousemove', (e) => {
      if (window.innerHeight - e.clientY <= TRIGGER_HEIGHT) show();
    }, { passive: true });

    menu.addEventListener('mouseenter', show);
    menu.addEventListener('mouseleave', hide);
    document.addEventListener('mouseleave', hide);
  }

  // Broadcast URL to host page via postMessage
  // Host listens: window.addEventListener('message', e => { if(e.data?.type==='__ifm_urlChange') ... })
  function broadcastUrl(url) {
    try { window.top.postMessage({ type: '__ifm_urlChange', url }, '*'); } catch {}
  }

  function initNavInterceptor() {
    broadcastUrl(location.href);

    // SPA navigation hooks
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
