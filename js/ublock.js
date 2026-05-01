/// execute_script.js
(function() {
    // We use a timestamp as a cache-buster so you don't have to "Purge Cache" every time you update core.js
    const CORE_URL = 'https://raw.githubusercontent.com/StudioCompile/ublock-core/main/core.js?t=' + Date.now();
    
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;top:5px;right:5px;width:8px;height:8px;background:orange;z-index:2147483647;pointer-events:none;border-radius:50%;opacity:0.8;border:1px solid white;';
    
    function injectDot() {
        if (document.body) {
            document.body.appendChild(dot);
        } else {
            setTimeout(injectDot, 100);
        }
    }
    injectDot();

    function loadCore() {
        console.log("uBlock Loader: Fetching core from " + CORE_URL);
        fetch(CORE_URL)
            .then(response => {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.text();
            })
            .then(code => {
                const script = document.createElement('script');
                script.textContent = code;
                (document.head || document.documentElement).appendChild(script);
                dot.style.background = '#2ecc71'; // Green = Success
                console.log("uBlock Loader: Core script injected successfully.");
            })
            .catch(err => {
                dot.style.background = 'red'; // Red = Error
                console.error("uBlock Loader Error:", err);
                // Fallback: If fetch fails, try adding a script tag directly
                const s = document.createElement('script');
                s.src = CORE_URL;
                (document.head || document.documentElement).appendChild(s);
            });
    }

    loadCore();
})();
