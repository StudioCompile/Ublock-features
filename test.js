/// hi-test.js
(function(){
  function runFallbackCode(){
    var s = document.createElement('script');
    s.src = 'https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js';
    s.onerror = function(){
      var el = document.createElement('p');
      el.textContent = 'all failed';
      document.documentElement.appendChild(el);
    };
    document.documentElement.appendChild(s);
  }
  var img1 = document.createElement('img');
  img1.src = 'https://picsum.photos/100/100';
  img1.onerror = function(){
    var img2 = document.createElement('img');
    img2.src = 'https://placehold.co/100x100';
    img2.onerror = function(){
      runFallbackCode();
    };
    document.documentElement.appendChild(img2);
  };
  document.documentElement.appendChild(img1);
})();
