/// runscript.js
// Loads code.js from GitHub via XHR and executes it.
// On sites that block external scripts, use Ctrl+Shift+`
// to manually run a javascript: bookmarklet or remote URL instead.

(function(){

  // ── Load main script ─────────────────────────────────────────────
  var x = new XMLHttpRequest();
  x.open('GET', 'https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js', true);
  x.onload = function(){
    if(x.status === 200){
      (0,eval)(x.responseText);
    } else {
      console.error('[runscript] failed to load code.js: HTTP ' + x.status);
    }
  };
  x.onerror = function(){
    console.error('[runscript] network error loading code.js');
  };
  x.send();

  // ── Bookmarklet / URL loader ──────────────────────────────────────
  // Ctrl+Shift+` → prompt to run a javascript: bookmarklet or
  // any https:// URL. Executes via XHR+eval so it works even on
  // sites that block bookmarklet navigation in the address bar.
  document.addEventListener('keydown', function(e){
    if(!e.ctrlKey || !e.shiftKey || e.altKey) return;
    if(e.code !== 'Backquote') return;
    var tag = (document.activeElement || {}).tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();

    var input = prompt('Run script\n\nPaste a javascript: bookmarklet or a https:// script URL:');
    if(!input) return;
    input = input.trim();

    if(/^javascript:/i.test(input)){
      // Run bookmarklet inline
      try{ (0,eval)(input.replace(/^javascript:/i, '')); }
      catch(err){ alert('Error:\n' + err); }

    } else if(/^https?:\/\//i.test(input)){
      // Fetch remote URL and eval — same method as loading code.js
      var r = new XMLHttpRequest();
      r.open('GET', input, true);
      r.onload = function(){
        if(r.status === 200){
          try{ (0,eval)(r.responseText); }
          catch(err){ alert('Error running script:\n' + err); }
        } else {
          alert('Fetch failed: HTTP ' + r.status);
        }
      };
      r.onerror = function(){ alert('Network error fetching script.'); };
      r.send();

    } else {
      alert('Paste a javascript: URL or a https:// URL.');
    }
  });

})();
