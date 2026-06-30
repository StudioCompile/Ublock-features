/// runscript.js
(function(){
  var x = new XMLHttpRequest();
  x.open('GET','https://raw.githubusercontent.com/StudioCompile/uFeatures/refs/heads/main/code.js',true);
  x.onload = function(){
    if(x.status === 200){
      (0,eval)(x.responseText);
    }
  };
  x.onerror = function(){
    console.error('xhr failed');
  };
  x.send();
})();
