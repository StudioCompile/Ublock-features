/// hi-test.js
(function(){
  var el = document.createElement('img');
  el.src = 'https://picsum.photos/100/100';
  el.onerror = function(){
    var fallback = document.createElement('img');
    fallback.src = 'https://placehold.co/100x100';
    document.documentElement.appendChild(fallback);
  };
  document.documentElement.appendChild(el);
})();
