/// execute_script.js
// This version uses the "Flat Script" method which is proven to work.
// To update your script, edit this file directly on GitHub.

(function() {
    console.log("uBlock Scriptlet: Active");
    
    // Visual confirmation: Blue Dot
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;top:5px;right:5px;width:10px;height:10px;background:blue;z-index:2147483647;pointer-events:none;border-radius:50%;opacity:0.8;border:1px solid white;';
    
    const inject = () => {
        if (document.body) {
            document.body.appendChild(dot);
        } else {
            setTimeout(inject, 100);
        }
    };
    inject();

    // You can add your custom bookmarklet logic below this line:
    // ---------------------------------------------------------
    
})();
