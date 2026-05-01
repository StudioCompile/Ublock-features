/// ublock.js
/// alias ublock
/// world MAIN

(function() {
  // All your code goes here, but as an "Immediately Invoked Function Expression" (IIFE)
  // This ensures it runs as soon as uBlock injects it.
  
  console.log("uBlock Custom Features Loaded!");

  var chiiState = 0;
  var managerOpen = false;
  // ... (rest of your original code) ...

  // Keyboard shortcut: Ctrl + Shift + `
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') {
       alert("Menu opened!"); // Test to see if it works
    }
  });
})();
