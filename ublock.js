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

    const dot = document.createElement('div');
    dot.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      width: 16px;
      height: 16px;
      background: red;
      border-radius: 50%;
      z-index: 999999;
    `;
    document.body.appendChild(dot);
  };

  document.body.appendChild(img);
})();
