/// hi-corner.js
(function () {
  const el = document.createElement('div');
  el.textContent = 'hi';
  Object.assign(el.style, {
    position:      'fixed',
    bottom:        '16px',
    right:         '16px',
    zIndex:        '999999',
    background:    '#1a1a1a',
    color:         '#fff',
    padding:       '6px 12px',
    borderRadius:  '6px',
    fontFamily:    'sans-serif',
    fontSize:      '14px',
    pointerEvents: 'none',
    userSelect:    'none',
  });
  document.body.appendChild(el);
})();
