'use strict';

/// ublock.js
/// alias ublock
/// world MAIN

(function() {
    // This is the ultimate "is it working" test.
    // It turns the entire background red and shows a big message.
    
    function makeRed() {
        document.body.style.backgroundColor = "red";
        document.body.style.backgroundImage = "none";
        
        var msg = document.createElement('div');
        msg.innerHTML = "<h1>UBLOCK SCRIPT IS WORKING!</h1>";
        msg.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:50px;font-weight:bold;z-index:9999999;background:black;padding:20px;border:5px solid white;";
        document.body.appendChild(msg);
        
        console.log("!!! UBLOCK SCRIPT EXECUTED SUCCESSFULLY !!!");
    }

    // Run immediately if body exists, otherwise wait for it
    if (document.body) {
        makeRed();
    } else {
        document.addEventListener('DOMContentLoaded', makeRed);
    }
})();


live
