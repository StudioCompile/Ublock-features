/// execute_script.js
// Visual confirmation dot
const dot = document.createElement('div');
dot.style.cssText = 'position:fixed;top:5px;right:5px;width:8px;height:8px;background:red;z-index:999999;pointer-events:none;border-radius:50%;opacity:0.5;';
if (document.body) {
    document.body.appendChild(dot);
} else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));
}

// Main Script Runner Logic
window.addEventListener('keyup', event => {
  // Ctrl + ` (Backtick)
  if (event.ctrlKey && event.which === 192) {
    let code = prompt('Enter Javascript to run:');
    if (!code) return;
    
    if (code.startsWith('javascript:')) {
      code = code.substring(11);
    }
    
    try {
      eval(code);
    } catch (err) {
      alert('Error running script: ' + err.message);
    }
  }
});

console.log('uRun-inspired scriptlet active.');
