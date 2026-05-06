/// runscript.js

// ── Load main script ───────────────────────────────────────────────
(function(){
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js', true);
  xhr.onload = function(){
    if(xhr.status === 200) (0,eval)(xhr.responseText);
    else console.error('[runscript] HTTP ' + xhr.status);
  };
  xhr.onerror = function(){ console.error('[runscript] network error'); };
  xhr.send();
})();

// ── Bookmarklet / URL loader ───────────────────────────────────────
// For sites that block the address bar javascript: shortcut.
// Ctrl+Shift+` (backtick) → prompt → runs via XHR+eval.
(function(){
  function run(input){
    input = (input||'').trim();
    if(!input) return;

    if(/^javascript:/i.test(input)){
      try{ (0,eval)(input.replace(/^javascript:\s*/i,'')); }
      catch(e){ alert('Error:\n'+e); }

    } else if(/^https?:\/\//i.test(input)){
      var r = new XMLHttpRequest();
      r.open('GET', input, true);
      r.onload = function(){
        if(r.status === 200){
          try{ (0,eval)(r.responseText); }
          catch(e){ alert('Error running script:\n'+e); }
        } else {
          alert('Fetch failed: HTTP '+r.status);
        }
      };
      r.onerror = function(){ alert('Network error.'); };
      r.send();

    } else {
      alert('Paste a javascript: URL or https:// URL.');
    }
  }

  document.addEventListener('keydown', function(e){
    // Ctrl+Shift+` (backtick key, code=Backquote)
    if(!e.ctrlKey || !e.shiftKey) return;
    var isBacktick = e.code === 'Backquote' || e.key === '`' || e.key === '~';
    if(!isBacktick) return;
    var tag = (document.activeElement||{}).tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
    e.preventDefault();
    var input = prompt('Run script\n\nPaste a javascript: bookmarklet or https:// URL:');
    run(input);
  });
})();
