edpuzzle.com##+js(nowoif, () => {
  const box = document.createElement('div');
  box.style.cssText =
    "position:fixed;top:10px;right:10px;z-index:2147483647;background:#111;color:#0f0;padding:10px;font-family:monospace;border-radius:8px";

  box.innerHTML =
    "JS OK (uBO)<br>" +
    "<input id='a' style='width:60px'> <input id='b' style='width:60px'><br>" +
    "<button id='add'>+</button> <button id='sub'>-</button>" +
    "<div id='out'></div>";

  document.body.appendChild(box);

  function calc(op){
    const a = +document.getElementById('a').value;
    const b = +document.getElementById('b').value;
    document.getElementById('out').textContent =
      op === '+' ? a + b : a - b;
  }

  box.querySelector('#add').onclick = () => calc('+');
  box.querySelector('#sub').onclick = () => calc('-');
});
