/// ublock.js
(function () {
  const img = document.createElement('img');
  img.src = 'https://placecats.com/60/60'; // ← swap this URL for any image
  img.style.cssText = [
    'position: fixed',
    'bottom: 12px',
    'right: 12px',
    'width: 60px',
    'height: 60px',
    'z-index: 2147483647',
    'border-radius: 8px',
    'opacity: 0.9',
    'pointer-events: none',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
  ].join(';');
  document.documentElement.appendChild(img);
})();
