(function () {
  'use strict';

  if (window.__iframeMenuInjected) return;
  window.__iframeMenuInjected = true;

  const IS_IFRAME = window !== window.top;

  /* ═══════════════════════════════════════════════════════════
     HOST-PAGE MANAGER
     Runs on your website (top layer).
     - Intercepts all iframe navigations BEFORE loading
     - Preflight-checks each URL for X-Frame-Options / CSP
     - Shows custom blocked page instead of Chrome's error
     - Handles "Go back" from blocked page
     - Recreates iframe on navigation (so host can observe src)
     - Hover menu + URL copy lives HERE (not inside iframe)
       because cross-origin iframes can't be read
  ═══════════════════════════════════════════════════════════ */
  if (!IS_IFRAME) {

    /* ── Preflight check ────────────────────────────────────
       Fetch the URL with no-cors to see if it's reachable,
       then do a second fetch (cors mode) to read the headers.
       X-Frame-Options / CSP frame-ancestors block embedding.

       Returns: 'ok' | 'blocked' | 'error'
    ──────────────────────────────────────────────────────── */
    async function preflightCheck(url) {
      try {
        // Use 'cors' mode — if the server sends X-Frame-Options or
        // frame-ancestors CSP the response headers will tell us.
        // We use a HEAD request to avoid downloading the body.
        const res = await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',   // won't throw on XFO, but also won't expose headers
          signal: AbortSignal.timeout(6000),
        });
        // no-cors always gives opaque response (status 0) for cross-origin
        // We can't read headers in no-cors mode, so we do a second cors fetch
        // just to read headers — it will throw if CORS not allowed, but that
        // only means CORS isn't set up; XFO is a different header.
        // Best approach: try cors HEAD and catch; if network error → unreachable
      } catch (e) {
        if (e.name === 'TimeoutError' || e.name === 'TypeError') return 'error';
      }

      // Second pass: cors mode to actually read response headers
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          mode: 'cors',
          signal: AbortSignal.timeout(6000),
        });
        const xfo = res.headers.get('x-frame-options');
        const csp = res.headers.get('content-security-policy');

        if (xfo) {
          const v = xfo.trim().toUpperCase();
          if (v === 'DENY' || v === 'SAMEORIGIN') return 'blocked';
        }
        if (csp) {
          // Check frame-ancestors directive
          const match = csp.match(/frame-ancestors\s+([^;]+)/i);
          if (match) {
            const val = match[1].trim();
            // 'none' or only 'self' means no external embedding
            if (val === "'none'" || val === "'self'") return 'blocked';
          }
        }
        return 'ok';
      } catch {
        // CORS not allowed — doesn't tell us about XFO.
        // We'll have to let it load and detect post-load.
        return 'unknown';
      }
    }

    /* ── Navigate: recreate iframe with preflight ─────────── */
    async function navigateIframe(frame, newUrl) {
      const prevSrc = frame.getAttribute('src') || frame.__ifmLastSrc || '';

      // Track history before navigating
      if (!frame.__ifmHistory) frame.__ifmHistory = [];
      if (prevSrc && prevSrc !== 'about:blank') frame.__ifmHistory.push(prevSrc);

      // Show loading state while we preflight
      showLoading(frame, newUrl);

      const status = await preflightCheck(newUrl);

      if (status === 'blocked' || status === 'error') {
        injectBlockedPage(frame, newUrl, status);
        return;
      }

      // 'ok' or 'unknown' — load it and detect post-load
      frame.__ifmLastSrc = newUrl;
      frame.__ifmPendingUrl = newUrl;
      frame.removeAttribute('srcdoc');
      frame.src = newUrl;
    }

    function showLoading(frame, url) {
      const safeUrl = escHtml(url);
      frame.removeAttribute('src');
      frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f5f5f7;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
  .wrap{text-align:center;color:#999}
  .spinner{width:32px;height:32px;border:2.5px solid #e0e0e0;border-top-color:#aaa;
            border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 14px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .url{font-size:11px;margin-top:8px;word-break:break-all;max-width:320px;color:#bbb}
</style></head><body>
<div class="wrap"><div class="spinner"></div><div>Loading…</div>
<div class="url">${safeUrl}</div></div>
</body></html>`;
    }

    /* ── Post-load blocked page detection ───────────────────
       Fallback for when preflight returned 'unknown'.
       Chrome loads chrome-error:// pages inside the iframe
       which we CAN read (same process, not cross-origin).
    ──────────────────────────────────────────────────────── */
    function checkPostLoad(frame) {
      const pendingUrl = frame.__ifmPendingUrl || frame.getAttribute('src') || '';
      frame.__ifmPendingUrl = null;

      let doc, frameHref;
      try {
        doc = frame.contentDocument;
        frameHref = frame.contentWindow.location.href;
      } catch {
        // Real cross-origin success — can't read, page is fine
        return;
      }

      if (!doc) return;

      const isChromErr = frameHref && frameHref.startsWith('chrome-error://');
      const hasErrEl   = !!doc.getElementById('main-frame-error');

      if (isChromErr || hasErrEl) {
        injectBlockedPage(frame, pendingUrl || frameHref, 'blocked');
      }
    }

    /* ── Watch iframes ──────────────────────────────────── */
    function watchIframe(frame) {
      if (frame.__ifmWatched) return;
      frame.__ifmWatched = true;

      frame.addEventListener('load', () => {
        setTimeout(() => checkPostLoad(frame), 80);
      });

      // Intercept navigation attempts via src attribute changes from external code
      // (MutationObserver handles this below)
    }

    // MutationObserver to intercept src changes on iframes
    const srcObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes') continue;
        const el = m.target;
        if (el.tagName !== 'IFRAME') continue;

        if (m.attributeName === 'src') {
          const newSrc = el.getAttribute('src');
          // Only intercept real URLs, not our own srcdoc swaps
          if (!newSrc || newSrc === 'about:blank') continue;
          // Prevent infinite loop: if we just set this src, skip
          if (newSrc === el.__ifmLastSrc) continue;

          // Cancel the browser's navigation by immediately removing src
          el.removeAttribute('src');
          navigateIframe(el, newSrc);
        }
      }
    });
    srcObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['src'],
      subtree: true,
    });

    // Watch for new iframes
    const domObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'IFRAME') watchIframe(n);
          n.querySelectorAll && n.querySelectorAll('iframe').forEach(watchIframe);
        });
      }
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('iframe').forEach(f => {
      watchIframe(f);
      // Trigger preflight on the current src if one exists
      const src = f.getAttribute('src');
      if (src && src !== 'about:blank') {
        f.__ifmLastSrc = src; // don't re-intercept
        f.__ifmPendingUrl = src;
      }
    });

    /* ── Blocked page HTML ──────────────────────────────── */
    function injectBlockedPage(frame, blockedUrl, reason) {
      const safeUrl = escHtml(blockedUrl || '');
      const msg = reason === 'error'
        ? 'This site couldn\'t be reached. It may be down, or the URL is incorrect.'
        : 'This site has blocked iframe embedding or refused the connection.';

      frame.__ifmLastSrc = null; // clear so history works
      frame.removeAttribute('src');
      frame.srcdoc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Can't open page</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:#f5f5f7;display:flex;align-items:center;
    justify-content:center;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
  .card{background:#fff;border:1px solid #e0e0e3;border-radius:18px;
    box-shadow:0 2px 24px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);
    padding:44px 40px 36px;max-width:400px;width:92%;text-align:center}
  .badge{width:56px;height:56px;background:#fff2f2;border-radius:50%;
    display:flex;align-items:center;justify-content:center;margin:0 auto 22px;
    border:1.5px solid #ffd0d0}
  .badge svg{width:26px;height:26px;stroke:#d94f4f;fill:none;stroke-width:2;
    stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:18px;font-weight:700;color:#111;margin-bottom:6px;letter-spacing:-.02em}
  .url-pill{display:inline-block;font-size:11px;color:#888;background:#f2f2f4;
    border-radius:20px;padding:4px 12px;margin:10px 0 18px;max-width:100%;
    word-break:break-all;line-height:1.5}
  p{font-size:13.5px;color:#555;line-height:1.65;margin-bottom:28px}
  .btn{display:inline-flex;align-items:center;gap:7px;background:#111;color:#fff;
    border:none;border-radius:10px;padding:11px 24px;font-size:13.5px;font-weight:500;
    cursor:pointer;letter-spacing:-.01em;transition:opacity .15s,transform .1s}
  .btn:hover{opacity:.85;transform:translateY(-1px)}
  .btn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.3;
    stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<div class="card">
  <div class="badge">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <circle cx="12" cy="16" r=".6" fill="#d94f4f" stroke="none"/></svg>
  </div>
  <h1>This page can't be opened</h1>
  <div class="url-pill">${safeUrl}</div>
  <p>${msg}</p>
  <button class="btn" onclick="window.parent.postMessage({type:'__ifm_back'},'*')">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    Go back
  </button>
</div></body></html>`;
    }

    /* ── "Go back" handler ──────────────────────────────── */
    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== '__ifm_back') return;
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if (f.contentWindow !== e.source) continue;
          const hist = f.__ifmHistory || [];
          const prev = hist.pop();
          f.__ifmHistory = hist;
          if (prev) {
            f.__ifmLastSrc = prev;
            f.__ifmPendingUrl = prev;
            f.removeAttribute('srcdoc');
            f.src = prev;
          } else {
            f.removeAttribute('srcdoc');
            f.src = 'about:blank';
          }
          break;
        } catch {}
      }
    });

    /* ── HOST-PAGE HOVER MENU ───────────────────────────────
       Because we can't inject into cross-origin iframes and
       read their URL, the menu lives on the host page and
       reads the iframe's src attribute directly.
    ──────────────────────────────────────────────────────── */
    const TRIGGER_HEIGHT = 8;
    const MENU_ID  = '__ifm-host-menu';
    const STYLE_ID = '__ifm-host-style';

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
      #${MENU_ID}.visible { opacity:1; transform:translateY(0); pointer-events:all; }

      #${MENU_ID} .hm-card {
        background:#fff;border:1px solid #e2e2e2;border-radius:10px;
        box-shadow:0 4px 20px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06);
        overflow:hidden;display:none;flex-direction:column;
        min-width:260px;max-width:340px;
      }
      #${MENU_ID} .hm-card.open { display:flex; }
      #${MENU_ID} .hm-card-header {
        padding:7px 12px 6px;font-size:10px;font-weight:600;
        letter-spacing:.08em;text-transform:uppercase;color:#aaa;
        border-bottom:1px solid #f0f0f0;background:#fafafa;
      }
      #${MENU_ID} .hm-url-row { display:flex;align-items:center;gap:8px;padding:10px 12px; }
      #${MENU_ID} .hm-url-text {
        flex:1;font-size:11.5px;color:#333;word-break:break-all;
        line-height:1.45;max-height:58px;overflow-y:auto;scrollbar-width:thin;
      }
      #${MENU_ID} .hm-copy-btn {
        flex-shrink:0;border:1px solid #ddd;background:#fff;border-radius:6px;
        padding:5px 10px;font-size:11px;font-weight:500;color:#444;cursor:pointer;
        transition:background .12s,color .12s,border-color .12s;white-space:nowrap;
      }
      #${MENU_ID} .hm-copy-btn:hover { background:#f0f0f0; }
      #${MENU_ID} .hm-copy-btn.copied { background:#e8faf2;color:#1a9e50;border-color:#aadfc0; }

      #${MENU_ID} .hm-btn-row { display:flex;gap:6px;justify-content:flex-end; }
      #${MENU_ID} .hm-icon-btn {
        all:unset;width:34px;height:34px;background:#fff;border:1px solid #e2e2e2;
        border-radius:8px;display:flex;align-items:center;justify-content:center;
        cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);
        transition:background .12s,box-shadow .12s,transform .1s;color:#555;
      }
      #${MENU_ID} .hm-icon-btn:hover {
        background:#f5f5f5;box-shadow:0 3px 12px rgba(0,0,0,0.12);transform:translateY(-1px);
      }
      #${MENU_ID} .hm-icon-btn.active { background:#f0f4ff;border-color:#b0c2f5;color:#2244cc; }
      #${MENU_ID} .hm-icon-btn svg { width:15px;height:15px;display:block; }
    `;

    const ICON_URL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10" cy="10" r="8"/>
      <path d="M2 10h16M10 2a13 13 0 0 1 0 16M10 2a13 13 0 0 0 0 16"/>
    </svg>`;

    let hmUrlOpen = false;
    let hmUrlCard, hmUrlBtn, hmUrlText, hmCopyBtn;

    function getCurrentIframeSrc() {
      // Find the most relevant (visible, non-srcdoc) iframe
      for (const f of document.querySelectorAll('iframe')) {
        const src = f.__ifmLastSrc || f.getAttribute('src');
        if (src && src !== 'about:blank') return src;
      }
      return location.href;
    }

    function hmCloseCard() {
      if (!hmUrlOpen) return;
      hmUrlOpen = false;
      hmUrlCard.classList.remove('open');
      hmUrlBtn.classList.remove('active');
    }

    function buildHostMenu() {
      if (document.getElementById(STYLE_ID)) return;
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);

      const menu = document.createElement('div');
      menu.id = MENU_ID;

      hmUrlCard = document.createElement('div');
      hmUrlCard.className = 'hm-card';
      hmUrlCard.innerHTML = `
        <div class="hm-card-header">Current URL</div>
        <div class="hm-url-row">
          <div class="hm-url-text" id="__hm-url-text"></div>
          <button class="hm-copy-btn" id="__hm-copy-btn">Copy</button>
        </div>`;

      const btnRow = document.createElement('div');
      btnRow.className = 'hm-btn-row';

      hmUrlBtn = document.createElement('button');
      hmUrlBtn.className = 'hm-icon-btn';
      hmUrlBtn.title = 'Show iframe URL';
      hmUrlBtn.innerHTML = ICON_URL;
      btnRow.appendChild(hmUrlBtn);

      menu.appendChild(hmUrlCard);
      menu.appendChild(btnRow);
      document.body.appendChild(menu);

      hmUrlText = document.getElementById('__hm-url-text');
      hmCopyBtn = document.getElementById('__hm-copy-btn');

      hmUrlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hmUrlOpen = !hmUrlOpen;
        hmUrlCard.classList.toggle('open', hmUrlOpen);
        hmUrlBtn.classList.toggle('active', hmUrlOpen);
        if (hmUrlOpen) hmUrlText.textContent = getCurrentIframeSrc();
      });

      hmCopyBtn.addEventListener('click', () => {
        const url = getCurrentIframeSrc();
        const done = () => {
          hmCopyBtn.textContent = 'Copied!';
          hmCopyBtn.classList.add('copied');
          setTimeout(() => {
            hmCopyBtn.textContent = 'Copy';
            hmCopyBtn.classList.remove('copied');
            hmCloseCard();
          }, 1200);
        };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(done).catch(() => hmFallbackCopy(url, done));
        } else {
          hmFallbackCopy(url, done);
        }
      });

      // Hover trigger
      let timer = null;
      const show = () => { clearTimeout(timer); menu.classList.add('visible'); };
      const hide = () => {
        timer = setTimeout(() => {
          menu.classList.remove('visible');
          hmCloseCard();
        }, 280);
      };

      document.addEventListener('mousemove', (e) => {
        if (window.innerHeight - e.clientY <= TRIGGER_HEIGHT) show();
      }, { passive: true });
      menu.addEventListener('mouseenter', show);
      menu.addEventListener('mouseleave', hide);
      document.addEventListener('mouseleave', hide);
    }

    function hmFallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      Object.assign(ta.style, { position:'fixed', opacity:'0', top:'0', left:'0' });
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); cb(); } catch {}
      ta.remove();
    }

    function escHtml(s) {
      return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // Build host menu after DOM ready
    if (document.body) buildHostMenu();
    else document.addEventListener('DOMContentLoaded', buildHostMenu);

    return; // end of host-page code
  }

  /* ═══════════════════════════════════════════════════════════
     IFRAME-ONLY
     Minimal: just SPA URL broadcasting (no menu — it's on host)
  ═══════════════════════════════════════════════════════════ */

  function broadcastUrl(url) {
    try { window.top.postMessage({ type: '__ifm_urlChange', url }, '*'); } catch {}
  }

  function initNavInterceptor() {
    broadcastUrl(location.href);
    const wrap = (orig) => function (...args) {
      const r = orig.apply(this, args);
      broadcastUrl(location.href);
      return r;
    };
    history.pushState    = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', () => broadcastUrl(location.href));
  }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  if (document.body) initNavInterceptor();
  else document.addEventListener('DOMContentLoaded', initNavInterceptor);

})();
