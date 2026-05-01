/// execute_script.js
// Bookmarklet-style Loader
(function() {
    const CORE_URL = 'https://raw.githubusercontent.com/StudioCompile/ublock-core/main/core.js?t=' + Date.now();
    
    // Create a script element to load the core JS
    const script = document.createElement('script');
    script.src = CORE_URL;
    
    // Inject it into the page
    (document.head || document.documentElement).appendChild(script);
    
    console.log("uBlock Loader: Injecting core bookmarklet...");
})();
