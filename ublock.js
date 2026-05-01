/// ublock.js
(function() {
    // TEST: This will show in the browser console (F12) on every page
    console.log("DEBUG: uBlock script is ACTIVE on " + window.location.href);

    // TEST: This creates a small red dot in the corner of every page 
    // so you can visually see it's working without opening console
    var testDot = document.createElement('div');
    testDot.style.cssText = "position:fixed;top:10px;right:10px;width:10px;height:10px;background:red;z-index:999999;border-radius:50%;pointer-events:none;";
    document.body ? document.body.appendChild(testDot) : document.addEventListener('DOMContentLoaded', () => document.body.appendChild(testDot));

    // --- YOUR ACTUAL CODE ---
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') {
            alert("Shortcut triggered!");
        }
    });
})();

