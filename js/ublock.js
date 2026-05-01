/// execute_script.js
(function() {
    // Red box for visual confirmation
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;top:10px;right:10px;width:20px;height:20px;background:red;z-index:999999;pointer-events:none;border:2px solid white;";
    document.body ? document.body.appendChild(box) : document.addEventListener("DOMContentLoaded", () => document.body.appendChild(box));

    // Original eval logic
    window.addEventListener("keyup", event => {
      if (event.ctrlKey && event.which === 192) {
        let code = prompt("Eval:");
        if (code && code.startsWith("javascript:")) {
          code = code.substring(11);
        }
        if (code) eval(code);
      }
    });
})();
