/// execute_scripts.js

const img = document.createElement('img');
img.src = 'x';
img.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;width:50px;height:50px;';

img.onerror = () => {
  img.remove();
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:99999;width:14px;height:14px;border-radius:50%;background:red;';
  document.body.appendChild(dot);
};

document.body.appendChild(img);
