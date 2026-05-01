/// execute_script.js
// Loader Script for StudioCompile/ublock-core
(function() {
    const CORE_URL = 'https://raw.githubusercontent.com/StudioCompile/ublock-core/main/core.js';
    
    // Visual confirmation (Yellow means Loading, Green means Loaded)
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;top:5px;right:5px;width:8px;height:8px;background:yellow;z-index:999999;pointer-events:none;border-radius:50%;opacity:0.8;border:1px solid white;';
    document.body ? document.body.appendChild(dot) : document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));

    function loadCore() {
        fetch(CORE_URL)
            .then(response => response.text())
            .then(code => {
                // Execute the core code
                const script = document.createElement('script');
                script.textContent = code;
                document.head.appendChild(script);
                dot.style.background = '#2ecc71'; // Green
                console.log("uBlock Loader: Core script injected.");
            })
            .catch(err => {
                dot.style.background = 'red'; // Error
                console.error("uBlock Loader Error:", err);
            });
    }

    // Delay slightly to ensure DOM is ready for injection
    setTimeout(loadCore, 500);
})();
