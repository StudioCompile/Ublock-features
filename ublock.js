/// devTools.js
!function(){
  var chiiState   = 0;
  var _managerWin = null;
  var _cache      = [];

  // ── URL of your hosted manager page ─────────────────────────────
  // Commit manager.html to your repo and enable GitHub Pages.
  var MANAGER_URL = "https://studiocompile.github.io/Ublock-features/manager.html";

  // ── Fetch scripts via hidden iframe ──────────────────────────────
  // On every page load, manager.html is loaded silently in a hidden
  // iframe. It reads from its own localStorage (always the same origin)
  // and postMessages the scripts back. This works on every site.
  function fetchAndRun(){
    // Seed cache from local copy so there's no delay on repeat visits
    try{ _cache = JSON.parse(localStorage.getItem("__dtCache") || "[]"); }
    catch(e){ _cache = []; }

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "display:none;position:fixed;width:0;height:0;border:none;z-index:-1";
    iframe.src = MANAGER_URL;

    var done = false;
    var timer = setTimeout(function(){
      if(done) return; done = true;
      // Timed out — run from local cache anyway
      runScripts(_cache);
      cleanup();
    }, 6000);

    function cleanup(){
      try{ document.body.removeChild(iframe); } catch(e){}
    }

    // Listen for manager.html signalling it's ready inside the iframe
    function onMsg(e){
      if(done) return;
      if(!e.data) return;

      // manager.html sends devtools_ready when it loads in iframe mode
      if(e.data.type === "devtools_ready"){
        // Now request the scripts
        try{ iframe.contentWindow.postMessage({ type: "devtools_fetch" }, "*"); }
        catch(ex){}
      }

      // manager.html sends back the scripts
      if(e.data.type === "devtools_scripts"){
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        _cache = e.data.scripts || [];
        try{ localStorage.setItem("__dtCache", JSON.stringify(_cache)); }catch(ex){}
        runScripts(_cache);
        cleanup();
      }
    }

    window.addEventListener("message", onMsg);

    if(document.body){
      document.body.appendChild(iframe);
    } else {
      document.addEventListener("DOMContentLoaded", function(){
        document.body.appendChild(iframe);
      });
    }
  }

  // ── Run scripts matching current domain ──────────────────────────
  function runScripts(scripts){
    scripts.forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); }
        catch(e){ console.warn("[devTools]", s.name, ":", e); }
      }
    });
  }

  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname;
    return pattern.trim().split(",").map(function(p){ return p.trim(); }).some(function(p){
      if(!p || p === "*") return true;
      if(p.indexOf("*.") === 0) return host === p.slice(2) || host.endsWith("." + p.slice(2));
      return host === p || host.endsWith("." + p);
    });
  }

  // ── postMessage handlers (from manager popup) ────────────────────
  window.addEventListener("message", function(e){
    var d = e.data; if(!d) return;
    // Run code on this page from the manager's "Run on page" button
    if(d.type === "devtools_run"){
      try{ Function(d.code)(); } catch(err){ console.error("[devTools]", err); }
    }
    // Manager saved changes — update local cache
    if(d.type === "devtools_update"){
      _cache = d.scripts || [];
      try{ localStorage.setItem("__dtCache", JSON.stringify(_cache)); } catch(ex){}
    }
  });

  // ── Chii ─────────────────────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{
        var u = new URL(HTMLElement.prototype.getAttribute.call(f, "src"));
        return u.host === "chii.liriliri.io" && u.pathname === "/front_end/chii_app.html";
      }catch(e){ return false; }
    })[0];
  }
  function showChii(){
    var f = getChiiFrame(); if(!f) return;
    f.parentNode.style.display = "";
    document.body.style.height = (document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight / 2) || 100
    )) + "px";
  }
  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var hidden = window.getComputedStyle(f.parentNode, null).display === "none";
    f.parentNode.style.display = hidden ? "" : "none";
    document.body.style.height = hidden ? (document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight / 2) || 100
    )) + "px" : "";
  }
  function injectChii(){
    if(chiiState === 1) return;
    if(chiiState === 2){ toggleChii(); return; }
    chiiState = 1;
    var s = document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s, "embedded", "true");
    HTMLElement.prototype.setAttribute.call(s, "src", "https://chii.liriliri.io/target.js");
    s.addEventListener("load", function(){
      var attempts = 0, poll = setInterval(function(){
        var f = getChiiFrame();
        if(f){ clearInterval(poll); chiiState = 2; showChii(); }
        if(++attempts > 40){ clearInterval(poll); chiiState = 0; }
      }, 100);
    });
    document.head.appendChild(s);
  }

  // ── Bookmarklet ──────────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text || "").trim();
    if(!t.match(/^javascript:/i)) return false;
    try{ Function(t.replace(/^javascript:/i, ""))(); }
    catch(e){ alert("Bookmarklet error:\n" + e); }
    return true;
  }

  // ── Open manager popup ───────────────────────────────────────────
  function openManager(){
    if(_managerWin && !_managerWin.closed){ _managerWin.focus(); return; }
    _managerWin = window.open(MANAGER_URL, "_blank", "width=900,height=700");
  }

  // ── Init ─────────────────────────────────────────────────────────
  fetchAndRun();

  // ── Shortcuts ────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement || {}).tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key === "I"){
      if(typing) return;
      e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "`" || e.key === "~")){
      e.preventDefault(); openManager(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });
}();
