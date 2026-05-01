/// execute_script.js
fetch("https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js")
  .then(r => r.text())
  .then(code => {
    let s = document.createElement("script");
    s.textContent = code;
    document.head.appendChild(s);
  });
