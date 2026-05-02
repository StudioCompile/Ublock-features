/// load-external.js
(function () {
  const url = 'https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js';
  fetch(url)
    .then(function (r) { return r.text(); })
    .then(function (code) { (0, eval)(code); })
    .catch(function (e) { console.error('uBO loader failed:', e); });
})();
