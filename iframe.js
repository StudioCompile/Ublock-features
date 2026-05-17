(function () {
  'use strict';

  // Prevent double-injection
  if (window.__devMenuInjected) return;
  window.__devMenuInjected = true;

  /* ─────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────── */
  const TRIGGER_HEIGHT = 8;   // px from bottom edge that activates the zone
  const MENU_ID        = '__dev-corner-menu';
  const STYLE_ID       = '__dev-corner-style';

  /* ─────────────────────────────────────────────
     STYLES
  ───────────────────────────────────────────── */
  const css = `
    #${MENU_ID} {
      all: initial;
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    #${MENU_ID}.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }

    /* Card container */
    #${MENU_ID} .dm-card {
      background: #ffffff;
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.07);
      overflow: hidden;
      display: none;
      flex-direction: column;
      min-width: 260px;
      max-width: 340px;
    }
    #${MENU_ID} .dm-card.open {
      display: flex;
    }

    /* Card header */
    #${MENU_ID} .dm-card-header {
      padding: 8px 12px 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #999;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
    }

    /* URL panel */
    #${MENU_ID} .dm-url-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
    }
    #${MENU_ID} .dm-url-text {
      flex: 1;
      font-size: 12px;
      color: #333;
      word-break: break-all;
      line-height: 1.4;
      max-height: 56px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    #${MENU_ID} .dm-copy-btn {
      flex-shrink: 0;
      border: 1px solid #ddd;
      background: #fff;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 500;
      color: #444;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      white-space: nowrap;
    }
    #${MENU_ID} .dm-copy-btn:hover {
      background: #f0f0f0;
    }
    #${MENU_ID} .dm-copy-btn.copied {
      background: #e6f9ee;
      color: #1a9e50;
      border-color: #a8e6c0;
    }

    /* Button row */
    #${MENU_ID} .dm-btn-row {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    #${MENU_ID} .dm-icon-btn {
      all: unset;
      width: 36px;
      height: 36px;
      background: #ffffff;
      border: 1px solid #e2e2e2;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: background 0.12s, box-shadow 0.12s, transform 0.1s;
      color: #555;
    }
    #${MENU_ID} .dm-icon-btn:hover {
      background: #f5f5f5;
      box-shadow: 0 3px 12px rgba(0,0,0,0.13);
      transform: translateY(-1px);
    }
    #${MENU_ID} .dm-icon-btn.active {
      background: #f0f4ff;
      border-color: #b0c0f0;
      color: #2244cc;
    }
    #${MENU_ID} .dm-icon-btn svg {
      width: 16px;
      height: 16px;
      display: block;
    }

    /* Inspect iframe */
    #${MENU_ID} .dm-inspect-frame-wrap {
      display: none;
    }
    #${MENU_ID} .dm-inspect-frame-wrap.open {
      display: block;
    }
    #${MENU_ID} .dm-inspect-frame-wrap iframe {
      display: block;
      width: 100%;
      height: 340px;
      border: none;
    }
  `;

  /* ─────────────────────────────────────────────
     SVG ICONS
  ───────────────────────────────────────────── */
  const ICON_URL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="8"/>
    <path d="M2 10h16M10 2a13 13 0 0 1 0 16M10 2a13 13 0 0 0 0 16"/>
  </svg>`;

  const ICON_INSPECT = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="16" height="12" rx="2"/>
    <path d="M7 17h6M10 15v2"/>
    <path d="M6 7l2.5 2.5L6 12M10.5 12h3.5"/>
  </svg>`;

  /* ─────────────────────────────────────────────
     BUILD DOM
  ───────────────────────────────────────────── */
  function buildMenu() {
    // Style tag
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }

    const menu = document.createElement('div');
    menu.id = MENU_ID;

    // ── URL Card ──────────────────────────────
    const urlCard = document.createElement('div');
    urlCard.className = 'dm-card';
    urlCard.id = '__dm-url-card';
    urlCard.innerHTML = `
      <div class="dm-card-header">Current URL</div>
      <div class="dm-url-row">
        <div class="dm-url-text" id="__dm-url-text">${location.href}</div>
        <button class="dm-copy-btn" id="__dm-copy-btn">Copy</button>
      </div>`;

    // ── Inspect Card ──────────────────────────
    const inspectCard = document.createElement('div');
    inspectCard.className = 'dm-card';
    inspectCard.id = '__dm-inspect-card';
    inspectCard.innerHTML = `
      <div class="dm-card-header">Inspect (Chii)</div>
      <div class="dm-inspect-frame-wrap open">
        <iframe src="https://chii.liriliri.io" id="__dm-chii-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>`;

    // ── Icon Buttons ───────────────────────────
    const btnRow = document.createElement('div');
    btnRow.className = 'dm-btn-row';

    const urlBtn = document.createElement('button');
    urlBtn.className = 'dm-icon-btn';
    urlBtn.title = 'Show URL';
    urlBtn.innerHTML = ICON_URL;

    const inspectBtn = document.createElement('button');
    inspectBtn.className = 'dm-icon-btn';
    inspectBtn.title = 'Inspect (Chii)';
    inspectBtn.innerHTML = ICON_INSPECT;

    btnRow.appendChild(urlBtn);
    btnRow.appendChild(inspectBtn);

    menu.appendChild(urlCard);
    menu.appendChild(inspectCard);
    menu.appendChild(btnRow);

    (document.body || document.documentElement).appendChild(menu);

    // ── State ─────────────────────────────────
    let urlOpen     = false;
    let inspectOpen = false;

    function setUrl(open) {
      urlOpen = open;
      urlCard.classList.toggle('open', open);
      urlBtn.classList.toggle('active', open);
      if (open) document.getElementById('__dm-url-text').textContent = location.href;
    }

    function setInspect(open) {
      inspectOpen = open;
      inspectCard.classList.toggle('open', open);
      inspectBtn.classList.toggle('active', open);
    }

    urlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setUrl(!urlOpen);
    });

    inspectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setInspect(!inspectOpen);
    });

    // Copy button
    document.getElementById('__dm-copy-btn').addEventListener('click', () => {
      const url = location.href;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('__dm-copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      });
    });

    return menu;
  }

  /* ─────────────────────────────────────────────
     HOVER TRIGGER ZONE (bottom 8px of window)
  ───────────────────────────────────────────── */
  function initHoverTrigger(menu) {
    let hideTimer = null;

    function show() {
      clearTimeout(hideTimer);
      menu.classList.add('visible');
    }

    function scheduleHide() {
      hideTimer = setTimeout(() => {
        // Only hide if mouse is not over the menu itself
        menu.classList.remove('visible');
      }, 300);
    }

    document.addEventListener('mousemove', (e) => {
      const fromBottom = window.innerHeight - e.clientY;
      if (fromBottom <= TRIGGER_HEIGHT) {
        show();
      }
    }, { passive: true });

    menu.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      menu.classList.add('visible');
    });

    menu.addEventListener('mouseleave', scheduleHide);

    document.addEventListener('mouseleave', scheduleHide);
  }

  /* ─────────────────────────────────────────────
     IFRAME NAVIGATION INTERCEPTOR
     When this script runs inside an iframe, intercept
     link clicks and tell the top layer to recreate
     the iframe with the new URL.
  ───────────────────────────────────────────── */
  function initIframeNavInterceptor() {
    if (window === window.top) return; // only in iframes

    function interceptLink(e) {
      const anchor = e.composedPath().find(el => el.tagName === 'A');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

      // Resolve to absolute URL
      let resolved;
      try {
        resolved = new URL(href, location.href).href;
      } catch {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Post message to parent (top layer) to recreate iframe
      window.top.postMessage({ type: '__devMenu_navigate', url: resolved }, '*');
    }

    document.addEventListener('click', interceptLink, true);

    // Also intercept form submissions
    document.addEventListener('submit', (e) => {
      const form = e.target;
      let action = form.getAttribute('action') || location.href;
      try { action = new URL(action, location.href).href; } catch { return; }
      e.preventDefault();
      window.top.postMessage({ type: '__devMenu_navigate', url: action }, '*');
    }, true);
  }

  /* ─────────────────────────────────────────────
     TOP-LAYER IFRAME MANAGER
     If running in the top window, listen for
     navigation messages and recreate the iframe.
  ───────────────────────────────────────────── */
  function initTopLayerManager() {
    if (window !== window.top) return;

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== '__devMenu_navigate') return;
      const newUrl = e.data.url;
      if (!newUrl) return;

      // Find the iframe that sent the message
      const frames = document.querySelectorAll('iframe');
      let targetIframe = null;

      for (const f of frames) {
        try {
          if (f.contentWindow === e.source) {
            targetIframe = f;
            break;
          }
        } catch {}
      }

      if (!targetIframe) return;

      // Clone attributes from old iframe
      const parent  = targetIframe.parentNode;
      const nextSib = targetIframe.nextSibling;
      const attrs   = [...targetIframe.attributes];

      // Remove old
      targetIframe.remove();

      // Create new
      const newFrame = document.createElement('iframe');
      for (const attr of attrs) {
        if (attr.name !== 'src') newFrame.setAttribute(attr.name, attr.value);
      }
      newFrame.src = newUrl;

      // Re-insert in same position
      if (nextSib) {
        parent.insertBefore(newFrame, nextSib);
      } else {
        parent.appendChild(newFrame);
      }
    });
  }

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  function init() {
    const menu = buildMenu();
    initHoverTrigger(menu);
    initIframeNavInterceptor();
    initTopLayerManager();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
