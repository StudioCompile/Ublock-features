/// ublock.js
(function () {
  const img = document.createElement('img');
  img.src = 'https://placeats.com/60/60';
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
  img.onerror = function () {
    eval("const dot = document.createElement('div'); dot.style.cssText = 'position:fixed;top:10px;left:10px;width:10px;height:10px;border-radius:50%;background:red;z-index:999999'; document.body.appendChild(dot);");
  };
  document.documentElement.appendChild(img);
})();
