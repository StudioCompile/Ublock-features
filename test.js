/// execute_scripts.js

!async function(){try{
  let e=document.createElement("script");
  HTMLElement.prototype.setAttribute.bind(e,"src","https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js")();
  "loading"===document.readyState
    ?document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(this)}.bind(e))
    :document.head.appendChild(e);
}catch{}}();
