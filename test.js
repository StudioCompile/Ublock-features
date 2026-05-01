/// ublock.js
(() => {
    'use strict';

    self.__ublock_scriptlets = self.__ublock_scriptlets || {};

    self.__ublock_scriptlets["ublock.js"] = function () {
        console.log("UBLOCK SCRIPT RUNNING");

        const div = document.createElement("div");
        div.textContent = "Hello from uBlock scriptlet";
        div.style.position = "fixed";
        div.style.top = "10px";
        div.style.left = "10px";
        div.style.zIndex = "999999";

        document.body.appendChild(div);
    };
})();
