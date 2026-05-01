(function() {
    console.log("uBlock Custom Features Active");
    
    // Your code here...
    
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') {
            alert("Menu Opened!");
        }
    });
})();
