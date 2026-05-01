'use strict';

/// ublock.js
/// alias ublock
/// world MAIN

(function() {
    // Immediate visual confirmation
    function makeRed() {
        if (!document.body) return;
        document.body.style.backgroundColor = "red";
        document.body.style.backgroundImage = "none";
        
        var msg = document.createElement('div');
        msg.innerHTML = "<h1>UBLOCK SCRIPT IS WORKING!</h1>";
        msg.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:50px;font-weight:bold;z-index:9999999;background:black;padding:20px;border:5px solid white;text-align:center;";
        document.body.appendChild(msg);
        
        console.log("!!! UBLOCK SCRIPT EXECUTED SUCCESSFULLY !!!");
    }

    if (document.body) {
        makeRed();
    } else {
        document.addEventListener('DOMContentLoaded', makeRed);
    }
})();
