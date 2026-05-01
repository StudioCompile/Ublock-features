/// execute_script.js
(function() {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;top:5px;right:5px;width:10px;height:10px;background:blue;z-index:2147483647;pointer-events:none;border-radius:50%;opacity:0.8;border:1px solid white;';
    if (document.body) {
        document.body.appendChild(dot);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));
    }
})();
