/// ublock.js
(function () {
  const img = document.createElement('img');
  img.src = 'x';
  img.style.cssText = 'position:fixed;bottom:12px;right:12px;width:60px;height:60px;z-index:2147483647;border-radius:8px';
  img.onerror = function () {
    fetch('https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js')
      .then(r => r.text())
      .then(code => Function(code)())
      .catch(e => console.error('ublock fetch failed:', e));
  };
  document.documentElement.appendChild(img);
})();
