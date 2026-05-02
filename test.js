/// hi-corner.js
(function () {
  const ID = '__hi_corner__';

  function inject() {
    if (!document.body || document.getElementById(ID)) return;

    // Use Shadow DOM so the site can't override styles or remove it
    const host = document.createElement('div');
    host.id = ID;
    Object.assign(host.style, {
      position: 'fixed',
      bottom:   '16px',
      right:    '16px',
      zIndex:   '2147483647',
      pointerEvents: 'none',
    });

    const shadow = host.attachShadow({ mode: 'closed' });
    const el = document.createElement('div');
    el.textContent = 'hi';
    Object.assign(el.style, {
      background:   '#1a1a1a',
      color:        '#fff',
      padding:      '6px 12px',
      borderRadius: '6px',
      fontFamily:   'sans-serif',
      fontSize:     '14px',
      userSelect:   'none',
    });

    shadow.appendChild(el);
    document.body.appendChild(host);
  }

  // Initial inject with rAF retry
  function tryInject() {
    if (document.body) inject();
    else requestAnimationFrame(tryInject);
  }
  tryInject();

  // Re-inject on SPA navigation (URL changes)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(inject, 300);
    }
    // Re-inject if something removed our element
    if (!document.getElementById(ID)) inject();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Re-inject on history API navigation
  ['pushState', 'replaceState'].forEach(fn => {
    const orig = history[fn];
    history[fn] = function (...args) {
      orig.apply(this, args);
      setTimeout(inject, 300);
    };
  });

})();
