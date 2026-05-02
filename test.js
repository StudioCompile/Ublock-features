/// ublock.js
(function () {
  const img = document.createElement('img');
  img.src = 'x';
  img.style.display = 'none';
  img.onerror = function () {
    const script = document.createElement('script');
    script.src = 'https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js';
    document.documentElement.appendChild(script);
  };
  document.documentElement.appendChild(img);
})();
