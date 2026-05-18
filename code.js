/// uFeatures.js
// Inject on every site via a userscript manager (Violentmonkey / Tampermonkey).
//
// HOW IT WORKS:
//   1. Visit google.com/ufeatures  →  page is taken over, shows the full settings UI.
//   2. Scripts are saved in google.com localStorage (the master list).
//   3. When you save/edit/delete/toggle a script, it ALSO pushes to the target
//      site's own localStorage via a quick hidden bridge window (open → set → close).
//   4. On EVERY other page load, uFeatures reads THAT site's localStorage and
//      runs matching scripts. No persistent tab, no bridge needed at runtime.
//   5. Ctrl+`  →  opens google.com/ufeatures settings in a new tab.
//   6. Ctrl+Shift+I  →  Chii remote debugger.

!function(){

  var SITE_KEY  = "__uFeaturesScripts";   // per-site localStorage key
  var SITES_KEY = "__uFeaturesSites";     // list of known sites (google.com only)
  var chiiState = 0;
  var _nameIdx  = 0;
  var _referrer = document.referrer ? new URL(document.referrer).hostname : "";

  var IS_SETTINGS = (
    (location.hostname === "www.google.com" || location.hostname === "google.com") &&
    location.pathname === "/ufeatures"
  );

  // ── Name helper ─────────────────────────────────────────────────
  function nextName(){
    _nameIdx++;
    return "Example Script" + (_nameIdx > 1 ? " " + _nameIdx : "");
  }

  // ── Storage (per-site — direct localStorage) ─────────────────────
  function siteLoad(){
    try{ return JSON.parse(localStorage.getItem(SITE_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function siteSave(arr){
    localStorage.setItem(SITE_KEY, JSON.stringify(arr));
  }

  // ── Known-sites list (only meaningful on google.com) ─────────────
  function getSites(){
    try{ return JSON.parse(localStorage.getItem(SITES_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function addSite(origin){
    var list = getSites();
    if(list.indexOf(origin) === -1){ list.push(origin); localStorage.setItem(SITES_KEY, JSON.stringify(list)); }
  }
  function removeSite(origin){
    localStorage.setItem(SITES_KEY, JSON.stringify(getSites().filter(function(s){ return s !== origin; })));
  }

  // ── Bridge: push scripts into another site's localStorage ────────
  // Uses window.open with a stable name per origin so the browser reuses
  // an already-open tab for that origin instead of spawning a new one.
  // The bridge page takes over immediately via document.write to show
  // "Saving data…" no matter what the site would normally render.

  function originToWinName(origin){
    // Stable window name from origin — strips protocol and special chars
    return "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");
  }

  function pushToSite(origin, scripts, onDone){
    var winName = originToWinName(origin);

    var win = window.open(origin + "/?__ufb=1", winName,
      "width=420,height=28,top="+(screen.availHeight-40)+",left=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=no");
    if(!win){
      alert("[uFeatures] Popup blocked — please allow popups for this site.");
      return;
    }

    var done = false, attempts = 0;
    var poll = setInterval(function(){
      if(done || attempts > 100){ clearInterval(poll); if(!done){ try{win.close();}catch(e){} } return; }
      try{ win.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts }, origin); }
      catch(e){}
      attempts++;
    }, 100);

    var handler = function(e){
      if(e.source !== win || !e.data || e.data.type !== "uf_bridge_ack") return;
      done = true;
      clearInterval(poll);
      window.removeEventListener("message", handler);
      // Leave window open a moment so it can finish rendering "Saved ✓"
      setTimeout(function(){ try{win.close();}catch(e){} }, 800);
      if(onDone) onDone();
    };
    window.addEventListener("message", handler);
  }

  // ── Bridge listener: every page receives pushes ───────────────────
  window.addEventListener("message", function(e){
    var d = e.data; if(!d) return;
    if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
      try{
        siteSave(d.scripts);
        e.source.postMessage({ type:"uf_bridge_ack" }, e.origin);
        // Update status text to "Saved ✓" if we're the bridge page
        var st = document.getElementById("__uf_bridge_st");
        if(st) st.textContent = "Saved \u2713";
      }catch(ex){}
    }
  });

  // ── Bridge page takeover ─────────────────────────────────────────
  // Runs as early as possible — before any site JS or redirects can fire.
  // Checks both the query string AND the window name so it works even
  // if the site strips or rewrites the query param on redirect.
  (function(){
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(!isBridge || IS_SETTINGS) return;

    // Take over immediately — document.open() nukes all existing content
    // and stops any pending navigation/scripts the original page had.
    function takeover(){
      try{
        document.open();
        document.write(
          '<!DOCTYPE html><html><head>'
          +'<meta charset="utf-8">'
          +'<title>Saving data\u2026</title>'
          +'<style>'
          +'*{margin:0;padding:0;box-sizing:border-box}'
          +'html,body{height:100%;overflow:hidden;background:#f1f3f4;font-family:"Segoe UI",system-ui,sans-serif;font-size:12px;color:#5f6368;user-select:none}'
          +'body{display:flex;align-items:center;padding:0 12px;gap:8px}'
          +'#__uf_bridge_st{}'
          +'</style>'
          +'</head><body>'
          +'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;animation:spin 1.2s linear infinite" xmlns="http://www.w3.org/2000/svg">'
          +'<circle cx="12" cy="12" r="9" stroke="#c8c8cc" stroke-width="2"/>'
          +'<path d="M12 3a9 9 0 0 1 9 9" stroke="#5f6368" stroke-width="2" stroke-linecap="round"/>'
          +'</svg>'
          +'<style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>'
          +'<span id="__uf_bridge_st">Saving data\u2026</span>'
          +'</body></html>'
        );
        document.close();
      }catch(ex){}
    }

    // Run immediately if we can, otherwise as early as possible
    if(document.readyState === "loading"){
      // Fire synchronously before DOMContentLoaded — inline script timing
      takeover();
    } else {
      takeover();
    }
  })();

  // ── Securly blocker ──────────────────────────────────────────────
  function killSecurly(){
    var el = document.getElementById("securly_overlay");
    if(el) el.remove();
    ["securly-overlay","securly_overlay","securly-extension"].forEach(function(c){
      var nl = document.getElementsByClassName(c);
      for(var i = nl.length-1; i >= 0; i--) nl[i].remove();
    });
  }
  new MutationObserver(killSecurly).observe(document.documentElement, { childList:true, subtree:true });
  killSecurly();

  // ── Domain matching ──────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return false; // blank = never run (must specify domain)
    var host = location.hostname, path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = p.trim(); if(!p) return false;
      var si = p.indexOf("/");
      var hp = si === -1 ? p : p.slice(0, si);
      var pp = si === -1 ? "" : p.slice(si);
      var hm = hp.slice(0,2) === "*."
        ? host === hp.slice(2) || host.endsWith("." + hp.slice(2))
        : host === hp;
      if(!hm) return false; if(!pp) return true;
      var norm = pp.endsWith("/") ? pp : pp + "/";
      return path === pp || path.startsWith(norm);
    });
  }

  function domainMatchesOrigin(pattern, origin){
    if(!pattern || !pattern.trim()) return false;
    try{
      var host = new URL(origin).hostname;
      return pattern.trim().split(",").some(function(p){
        p = p.trim(); if(!p) return false;
        var si = p.indexOf("/"); var hp = si === -1 ? p : p.slice(0, si);
        return hp.slice(0,2) === "*."
          ? host === hp.slice(2) || host.endsWith("." + hp.slice(2))
          : host === hp;
      });
    }catch(e){ return false; }
  }

  // ── Run stored scripts on this page ─────────────────────────────
  function runSiteScripts(){
    if(IS_SETTINGS) return;
    siteLoad().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); }
        catch(e){ console.warn("[uFeatures]", s.name, e); }
      }
    });
  }

  // ── Bookmarklet runner ───────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }
    catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Chii debugger ───────────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{
        var u = new URL(HTMLElement.prototype.getAttribute.call(f,"src"));
        return u.host==="chii.liriliri.io" && u.pathname==="/front_end/chii_app.html";
      }catch(e){ return false; }
    })[0];
  }
  function showChii(){
    var f = getChiiFrame(); if(!f) return;
    var w = f.parentNode;
    w.style.cssText += ";display:block!important;background:#282828!important;opacity:1!important;pointer-events:auto!important;";
    f.style.cssText += ";background:#282828!important;opacity:1!important;display:block!important;";
    // Block inspect/devtools on the chii iframe itself
    f.addEventListener("contextmenu", function(e){ e.preventDefault(); e.stopPropagation(); }, true);
    f.addEventListener("keydown", function(e){
      if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&(e.key==="I"||e.key==="J"||e.key==="C"))||(e.ctrlKey&&e.key==="U"))
        e.preventDefault();
    }, true);
    document.body.style.height=(document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px";
  }
  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var w = f.parentNode;
    if(window.getComputedStyle(w).display==="none"){
      w.style.background="#282828"; f.style.background="#282828"; f.style.opacity="1";
      w.style.display="";
      document.body.style.height=(document.documentElement.clientHeight-Math.floor(Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100))+"px";
    } else {
      w.style.display="none"; document.body.style.height="";
    }
  }
  function injectChii(){
    if(chiiState===1) return;
    if(chiiState===2){ toggleChii(); return; }
    chiiState=1;
    var ph=document.createElement("div"); ph.id="__uf_chii_ph";
    ph.style.cssText="position:fixed;bottom:0;left:0;width:100%;height:50%;background:#282828;z-index:2147483640;display:flex;align-items:center;justify-content:center;";
    ph.innerHTML='<span style="color:#666;font-family:monospace;font-size:13px;">Loading Chii…</span>';
    document.body.appendChild(ph);
    var s=document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s,"embedded","true");
    HTMLElement.prototype.setAttribute.call(s,"src","https://chii.liriliri.io/target.js");
    s.addEventListener("load",function(){
      var n=0, poll=setInterval(function(){
        var f=getChiiFrame();
        if(f){ clearInterval(poll); chiiState=2; var p=document.getElementById("__uf_chii_ph"); if(p)p.remove(); showChii(); }
        if(++n>40){ clearInterval(poll); chiiState=0; var p=document.getElementById("__uf_chii_ph"); if(p)p.remove(); }
      },100);
    });
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS PAGE  ─  google.com/ufeatures
  // ════════════════════════════════════════════════════════════════════

  function bootSettingsPage(){
    document.title = "uFeatures";
    // Nuke existing page content, keep <html>
    while(document.documentElement.firstChild)
      document.documentElement.removeChild(document.documentElement.firstChild);

    var head = document.createElement("head");
    var meta = document.createElement("meta"); meta.setAttribute("charset","utf-8"); head.appendChild(meta);
    var vp = document.createElement("meta"); vp.name="viewport"; vp.content="width=device-width,initial-scale=1"; head.appendChild(vp);
    var ti = document.createElement("title"); ti.textContent="uFeatures"; head.appendChild(ti);
    var fav = document.createElement("link"); fav.rel="icon"; fav.type="image/png";
    fav.href="https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png";
    head.appendChild(fav);
    var style = document.createElement("style"); style.textContent = settingsCSS(); head.appendChild(style);
    document.documentElement.appendChild(head);

    var body = document.createElement("body");
    body.innerHTML = settingsHTML();
    document.documentElement.appendChild(body);

    wireSettings();
  }

  function settingsCSS(){
    return [
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
      "html,body{height:100%;background:#f9f9fb;color:#1c1b22;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px}",
      // Layout
      "#uf-wrap{display:flex;flex-direction:column;height:100vh;overflow:hidden}",
      // Topbar
      "#uf-top{display:flex;align-items:stretch;background:#fff;border-bottom:1px solid #c8c8cc;height:40px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.06)}",
      ".uf-logo{display:flex;align-items:center;gap:8px;padding:0 16px;border-right:1px solid #c8c8cc;font-size:14px;font-weight:600;letter-spacing:-.2px;white-space:nowrap;color:#1c1b22}",
      ".uf-tabs{display:flex;align-items:stretch}",
      ".uf-tab{display:flex;align-items:center;padding:0 16px;cursor:pointer;font-size:13px;color:#6f6e77;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .1s,border-color .1s;user-select:none}",
      ".uf-tab:hover{color:#1c1b22;background:rgba(0,0,0,.03)}",
      ".uf-tab.on{color:#1c1b22;border-bottom-color:#7f0000}",
      ".uf-top-actions{margin-left:auto;display:flex;align-items:center;gap:6px;padding:0 12px}",
      // Body — normal scrollable for most tabs
      "#uf-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}",
      ".uf-scroll{flex:1;overflow-y:auto;padding:22px 28px 48px;scrollbar-width:thin;scrollbar-color:#c8c8cc transparent}",
      ".uf-sec{display:none}.uf-sec.on{display:flex;flex-direction:column;flex:1;min-height:0}",
      // Status bar
      "#uf-bar{height:22px;background:#e0e0e4;display:flex;align-items:center;padding:0 12px;gap:20px;flex-shrink:0}",
      "#uf-bar span{font-size:11px;color:#6f6e77}","#uf-bar b{color:#1c1b22;font-weight:400}",
      "#uf-barst{margin-left:auto;font-size:11px;color:#6f6e77}",
      // Buttons
      ".uf-btn{padding:5px 14px;border-radius:3px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #c8c8cc;background:#fff;color:#1c1b22;transition:background .1s,border-color .1s}",
      ".uf-btn:hover{background:#f0f0f4;border-color:#adadb1}",
      ".uf-btn:disabled{opacity:.45;cursor:default;pointer-events:none}",
      ".uf-btn.prim{background:#7f0000;border-color:#7f0000;color:#fff}.uf-btn.prim:hover{background:#6a0000;border-color:#6a0000}",
      ".uf-btn.danger{color:#cc0000;border-color:#c8c8cc;background:#fff}.uf-btn.danger:hover{background:#fff0f0;border-color:#cc0000}",
      ".uf-btn.icon{padding:4px 8px;font-size:14px;line-height:1}",
      // Section header
      ".uf-sh{font-size:11px;font-weight:600;color:#6f6e77;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #c8c8cc}",
      // Card
      ".uf-card{background:#fff;border:1px solid #c8c8cc;border-radius:4px;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}",
      ".uf-fa{padding:14px 16px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #e0e0e4}",
      ".uf-g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
      ".uf-lbl{font-size:11px;color:#6f6e77;margin-bottom:3px}",
      "input.uf-in{border:1px solid #c8c8cc;border-radius:3px;padding:6px 9px;font-family:inherit;font-size:13px;outline:none;color:#1c1b22;background:#fff;width:100%;transition:border-color .12s}",
      "input.uf-in:focus{border-color:#7f0000;box-shadow:0 0 0 1px rgba(127,0,0,.2)}",
      "textarea.uf-ta{border:1px solid #c8c8cc;border-radius:3px;padding:7px 9px;font-family:Consolas,Menlo,monospace;font-size:12px;outline:none;color:#1c1b22;background:#fff;width:100%;resize:vertical;line-height:1.55;min-height:130px;transition:border-color .12s}",
      "textarea.uf-ta:focus{border-color:#7f0000;box-shadow:0 0 0 1px rgba(127,0,0,.2)}",
      ".uf-ff{display:flex;gap:8px;align-items:center}",
      "#uf-st{flex:1;font-size:11px}",
      // Script list
      ".uf-srow{display:grid;grid-template-columns:18px 1fr auto auto;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #e0e0e4}",
      ".uf-srow:last-child{border-bottom:none}",
      ".uf-srow:hover{background:#f9f9fb}",
      ".uf-sinfo{min-width:0}",
      ".uf-sname{font-size:13px;color:#1c1b22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".uf-sname.dim{color:#adadb1}",
      ".uf-sdomain{font-size:11px;color:#6f6e77}",
      ".uf-empty{padding:28px;text-align:center;color:#adadb1}",
      // uBlock-style checkbox
      ".uf-cb{position:relative;width:16px;height:16px;flex-shrink:0;cursor:pointer}",
      ".uf-cb input{opacity:0;position:absolute;width:0;height:0}",
      ".uf-cb .box{position:absolute;inset:0;border:1px solid #adadb1;border-radius:2px;background:#fff;transition:background .12s,border-color .12s}",
      ".uf-cb input:checked+.box{background:#7f0000;border-color:#7f0000}",
      ".uf-cb input:checked+.box::after{content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}",
      // Keys tab
      ".uf-krow{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #e0e0e4}",
      ".uf-krow:last-child{border-bottom:none}",
      ".uf-kbd{background:#f0f0f4;border:1px solid #c8c8cc;border-radius:3px;padding:3px 10px;font-family:monospace;font-size:12px;color:#1c1b22;min-width:170px;text-align:center}",
      ".uf-kdesc{font-size:12px;color:#6f6e77}",
      "code.uf-c{background:#f0f0f4;padding:1px 4px;border-radius:2px;font-family:monospace;font-size:11px;color:#1c1b22}",
      // Home tab
      ".uf-home-hero{display:flex;align-items:center;gap:16px;padding:24px 0 20px}",
      ".uf-home-hero h1{font-size:22px;font-weight:300;color:#1c1b22;letter-spacing:-.3px}",
      ".uf-home-hero h1 b{font-weight:700;color:#7f0000}",
      ".uf-home-credit{font-size:11px;color:#adadb1;margin-top:2px}",
      ".uf-home-credit a{color:#7f0000;text-decoration:none}.uf-home-credit a:hover{text-decoration:underline}",
      ".uf-feat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:4px}",
      ".uf-feat{background:#fff;border:1px solid #c8c8cc;border-radius:4px;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}",
      ".uf-feat-title{font-size:13px;font-weight:600;color:#1c1b22;margin-bottom:4px;display:flex;align-items:center;gap:7px}",
      ".uf-feat-icon{font-size:15px}",
      ".uf-feat-desc{font-size:12px;color:#6f6e77;line-height:1.6}",
      // Games tab
      "#uf-tab-games{flex:1;min-height:0}",
      "#uf-games-wrap{display:flex;flex-direction:column;flex:1;min-height:0;background:#f9f9fb}",
      "#uf-games-wrap.fs-mode #uf-games-nav,#uf-games-wrap.fs-mode #uf-bm-bar{display:none}",
      "#uf-games-wrap.fs-mode #uf-games-frame{flex:1}",
      // Nav bar
      "#uf-games-nav{display:flex;align-items:center;gap:2px;padding:4px 6px;background:#fff;border-bottom:1px solid #c8c8cc;flex-shrink:0}",
      ".uf-gn-btn{border:none;background:transparent;border-radius:3px;width:26px;height:26px;font-size:14px;cursor:pointer;color:#5f6368;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .1s,color .1s;padding:0}",
      ".uf-gn-btn:hover{background:#f0f0f4;color:#1c1b22}",
      ".uf-gn-btn:disabled{color:#d0d0d0;cursor:default}",
      "#uf-games-url{flex:1;border:1px solid #c8c8cc;border-radius:10px;padding:4px 10px;font-size:12px;font-family:inherit;outline:none;color:#1c1b22;background:#f9f9fb;margin:0 4px;transition:border-color .12s,background .12s}",
      "#uf-games-url:focus{border-color:#7f0000;background:#fff;box-shadow:0 0 0 1px rgba(127,0,0,.12);border-radius:3px}",
      // Bookmarks bar - horizontal, compact
      "#uf-bm-bar{display:flex;align-items:center;gap:0;padding:0 4px;background:#f9f9fb;border-bottom:1px solid #e0e0e4;flex-shrink:0;height:26px;overflow-x:auto;scrollbar-width:none}",
      "#uf-bm-bar::-webkit-scrollbar{display:none}",
      "#uf-bm-list{display:flex;align-items:center;gap:0;flex:1;min-width:0}",
      ".uf-bm{display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:3px;font-size:11.5px;color:#1c1b22;cursor:pointer;white-space:nowrap;max-width:140px;transition:background .1s;height:22px;user-select:none}",
      ".uf-bm:hover{background:#e8e8ed}",
      ".uf-bm img{width:14px;height:14px;flex-shrink:0;object-fit:contain}",
      ".uf-bm-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".uf-bm-add{border:none;background:transparent;font-size:16px;color:#6f6e77;cursor:pointer;padding:0 6px;height:22px;border-radius:3px;flex-shrink:0;transition:background .1s;line-height:1}",
      ".uf-bm-add:hover{background:#e8e8ed;color:#1c1b22}",
      // Iframe
      "#uf-games-frame{flex:1;width:100%;border:none;background:#fff;display:block;min-height:0}"
    ].join("\n");
  }

  function settingsHTML(){
    var iconUrl = "https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png";
    return '<div id="uf-wrap">'
      // Top bar
      +'<div id="uf-top">'
        +'<div class="uf-logo"><img src="'+iconUrl+'" width="20" height="20" style="object-fit:contain">uFeatures</div>'
        +'<div class="uf-tabs">'
          +'<div class="uf-tab on" data-tab="home">Home</div>'
          +'<div class="uf-tab" data-tab="scripts">My Scripts</div>'
          +'<div class="uf-tab" data-tab="games">Iframe</div>'
          +'<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        +'</div>'
        +'<div class="uf-top-actions">'
          +'<button class="uf-btn" id="uf-update" title="Re-push all scripts to all tracked sites">&#8635; Update all sites</button>'
        +'</div>'
      +'</div>'

      // Body — flex container so Games tab can fill height
      +'<div id="uf-body">'

        // HOME TAB
        +'<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          +'<div class="uf-home-hero">'
            +'<img src="'+iconUrl+'" width="48" height="48" style="object-fit:contain;flex-shrink:0">'
            +'<div>'
              +'<h1>u<b>Features</b></h1>'
              +'<div class="uf-home-credit">By StudioCompile &mdash; Roblox: studiocompile &middot; Discord: @roblox_studio</div>'
            +'</div>'
          +'</div>'
          +'<div class="uf-sh">Features</div>'
          +'<div class="uf-feat-grid">'
            +'<div class="uf-feat"><div class="uf-feat-title">Script Manager</div><div class="uf-feat-desc">Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete scripts at any time from the My Scripts tab.</div></div>'
            +'<div class="uf-feat"><div class="uf-feat-title">Script Sync</div><div class="uf-feat-desc">Scripts are stored on google.com and pushed to target sites via a discreet bridge window. Changes sync automatically on save, toggle, or delete.</div></div>'
            +'<div class="uf-feat"><div class="uf-feat-title">Securly Blocker</div><div class="uf-feat-desc">Removes Securly overlay elements on every page load. A MutationObserver watches for them being re-added and removes them immediately.</div></div>'
            +'<div class="uf-feat"><div class="uf-feat-title">Chii Debugger</div><div class="uf-feat-desc">Injects the Chii remote DevTools panel into any page. Dark background appears immediately on activation. Use Ctrl+Shift+I to toggle.</div></div>'
            +'<div class="uf-feat"><div class="uf-feat-title">Iframe Browser</div><div class="uf-feat-desc">A full-page iframe browser with back and forward history, editable bookmarks, a URL bar, and a fullscreen mode that hides all chrome.</div></div>'
            +'<div class="uf-feat"><div class="uf-feat-title">Bookmarklet Runner</div><div class="uf-feat-desc">Copy any javascript: URL, then press Ctrl+V outside a text field to run it on the current page. Also works in the iframe URL bar.</div></div>'
          +'</div>'
        +'</div></div>'

        // SCRIPTS TAB
        +'<div class="uf-sec" id="uf-tab-scripts"><div class="uf-scroll">'
          +'<div class="uf-sh">Add / Edit Script</div>'
          +'<div class="uf-card"><div class="uf-fa">'
            +'<div class="uf-g2">'
              +'<div><div class="uf-lbl">Script name</div><input id="uf-nameF" class="uf-in" type="text" value="Example Script"></div>'
              +'<div><div class="uf-lbl">Target domain</div><input id="uf-domF" class="uf-in" type="text" placeholder="example.com or *.example.com/path"></div>'
            +'</div>'
            +'<div><div class="uf-lbl">JavaScript</div><textarea id="uf-codeF" class="uf-ta" placeholder="// Your script here..."></textarea></div>'
          +'</div>'
          +'<div class="uf-ff" style="padding:10px 16px;background:#f0f0f4;border-top:1px solid #c8c8cc">'
            +'<span id="uf-st"></span>'
            +'<button class="uf-btn prim" id="uf-saveBtn">Save script</button>'
          +'</div></div>'
          +'<div class="uf-sh" style="margin-top:20px">Saved Scripts</div>'
          +'<div class="uf-card" id="uf-slist"></div>'
        +'</div></div>'

        // IFRAME TAB
        +'<div class="uf-sec" id="uf-tab-games">'
          +'<div id="uf-games-wrap">'
            // Nav bar - back, forward, url input, fullscreen
            +'<div id="uf-games-nav">'
              +'<button class="uf-gn-btn" id="uf-g-back" title="Back" disabled>&#8592;</button>'
              +'<button class="uf-gn-btn" id="uf-g-fwd"  title="Forward" disabled>&#8594;</button>'
              +'<input id="uf-games-url" type="text" spellcheck="false" autocomplete="off" placeholder="Enter URL and press Enter&hellip;">'
              +'<button class="uf-gn-btn" id="uf-g-fs" title="Focus iframe / exit focus">&#9974;</button>'
            +'</div>'
            // Bookmarks bar - horizontal with favicons
            +'<div id="uf-bm-bar">'
              +'<div id="uf-bm-list"></div>'
              +'<button class="uf-bm-add" id="uf-bm-add" title="Bookmark current page">+</button>'
            +'</div>'
            // Iframe fills remaining space
            +'<iframe id="uf-games-frame" src="https://www.google.com?igu=1" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-presentation"></iframe>'
          +'</div>'
        +'</div>'

        // KEYS TAB
        +'<div class="uf-sec" id="uf-tab-keys"><div class="uf-scroll">'
          +'<div class="uf-sh">Keyboard Shortcuts</div>'
          +'<div class="uf-card">'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + `</span><span class="uf-kdesc">Open uFeatures settings in a new tab</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Toggle Chii remote debugger</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>'
          +'</div>'
        +'</div></div>'

      +'</div>'

      // Status bar
      +'<div id="uf-bar">'
        +'<span>uFeatures &mdash; storage: <b>google.com</b></span>'
        +'<span id="uf-cnt-s">0 scripts</span>'
        +'<span id="uf-cnt-si">0 sites</span>'
        +'<span id="uf-barst"></span>'
      +'</div>'
    +'</div>';
  }

  // ── Settings wiring ──────────────────────────────────────────────
  var _editingName = null;

  function setSt(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el = document.getElementById(id); if(!el) return;
      el.textContent = msg; el.style.color = color||"#8f8f9d";
    });
    if(msg) setTimeout(function(){
      ["uf-st","uf-barst"].forEach(function(id){
        var el=document.getElementById(id); if(el&&el.textContent===msg) el.textContent="";
      });
    }, 3000);
  }

  function updateBar(){
    var s=siteLoad(), si=getSites();
    var cs=document.getElementById("uf-cnt-s"), csi=document.getElementById("uf-cnt-si");
    if(cs) cs.textContent=s.length+" script"+(s.length!==1?"s":"");
    if(csi) csi.textContent=si.length+" site"+(si.length!==1?"s":"");
  }

  function renderScripts(){
    var c=document.getElementById("uf-slist"); if(!c) return;
    while(c.firstChild) c.removeChild(c.firstChild);
    var arr=siteLoad();
    if(!arr.length){
      var em=document.createElement("div"); em.className="uf-empty";
      em.textContent="No scripts yet. Add one above."; c.appendChild(em); return;
    }
    arr.forEach(function(s,i){
      var row=document.createElement("div"); row.className="uf-srow";

      // Checkbox
      var lbl=document.createElement("label"); lbl.className="uf-cb";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!s.enabled;
      var box=document.createElement("span"); box.className="box";
      lbl.appendChild(cb); lbl.appendChild(box);

      // Info
      var info=document.createElement("div"); info.className="uf-sinfo";
      var nm=document.createElement("div"); nm.className="uf-sname"+(s.enabled?"":" dim"); nm.textContent=s.name;
      var dm=document.createElement("div"); dm.className="uf-sdomain"; dm.textContent=s.domain||"all sites";
      info.appendChild(nm); info.appendChild(dm);

      cb.onchange=(function(idx,nmEl){ return function(){
        var a=siteLoad(); a[idx].enabled=this.checked; siteSave(a);
        nmEl.className="uf-sname"+(this.checked?"":" dim"); updateBar();
        pushForDomain(a[idx].domain, a);
      }; })(i,nm);

      // Edit
      var eb=document.createElement("button"); eb.className="uf-btn"; eb.textContent="Edit";
      eb.onclick=(function(sc){ return function(){
        _editingName=sc.name;
        document.getElementById("uf-nameF").value=sc.name;
        document.getElementById("uf-domF").value=sc.domain||"";
        document.getElementById("uf-codeF").value=sc.code;
        document.getElementById("uf-body").scrollTop=0;
        document.getElementById("uf-nameF").focus();
        // switch to scripts tab
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        document.querySelector("[data-tab='scripts']").classList.add("on");
        document.getElementById("uf-tab-scripts").classList.add("on");
      }; })(s);

      // Delete
      var db=document.createElement("button"); db.className="uf-btn danger"; db.textContent="Delete";
      db.onclick=(function(idx,name,domain){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a=siteLoad(); a.splice(idx,1); siteSave(a);
        renderScripts(); updateBar();
        pushForDomain(domain, a);
      }; })(i,s.name,s.domain);

      row.appendChild(lbl); row.appendChild(info); row.appendChild(eb); row.appendChild(db);
      c.appendChild(row);
    });
  }

  function renderSites(){
    var c=document.getElementById("uf-sitelist"); if(!c) return;
    while(c.firstChild) c.removeChild(c.firstChild);
    var sites=getSites(), scripts=siteLoad();
    if(!sites.length){
      var em=document.createElement("div"); em.className="uf-empty";
      em.textContent="No sites tracked yet. Push a script to a site first."; c.appendChild(em); return;
    }
    sites.forEach(function(origin){
      var ct=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); }).length;
      var row=document.createElement("div"); row.className="uf-site-row";
      var nm=document.createElement("div"); nm.className="uf-site-name"; nm.textContent=origin;
      var cts=document.createElement("div"); cts.className="uf-site-ct"; cts.textContent=ct+" script"+(ct!==1?"s":"")+" targeting this site";
      var rb=document.createElement("button"); rb.className="uf-btn"; rb.textContent="Re-push";
      rb.onclick=(function(o){ return function(){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,o); });
        pushToSite(o,toSend,function(){ setSt("Pushed to "+o+" \u2713","#3fc33f"); });
        setSt("Pushing to "+o+"…","#e66000");
      }; })(origin);
      var xb=document.createElement("button"); xb.className="uf-btn danger"; xb.textContent="Remove";
      xb.onclick=(function(o){ return function(){
        if(!confirm("Remove "+o+" from tracked sites?")) return;
        removeSite(o); renderSites(); updateBar();
      }; })(origin);
      row.appendChild(nm); row.appendChild(cts); row.appendChild(rb); row.appendChild(xb);
      c.appendChild(row);
    });
  }

  function wireSettings(){
    // Auto-fill domain from referrer (the site that opened settings)
    var domF = document.getElementById("uf-domF");
    if(_referrer) domF.value = _referrer;

    // Tabs — sections are flex children of #uf-body
    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        tab.classList.add("on");
        var sec=document.getElementById("uf-tab-"+tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    // Save script
    document.getElementById("uf-saveBtn").addEventListener("click", function(){
      var name=(document.getElementById("uf-nameF").value.trim())||"Example Script";
      var domain=document.getElementById("uf-domF").value.trim();
      var code=document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Code is required.","#cc0000"); return; }

      var arr=siteLoad();
      var idx=-1;
      arr.forEach(function(s,i){ if(s.name===(_editingName||name)) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      if(idx>=0) arr[idx]=entry; else arr.push(entry);
      siteSave(arr);
      _editingName=null;
      renderScripts(); updateBar();
      pushForDomain(domain, arr);

      document.getElementById("uf-nameF").value="Example Script";
      document.getElementById("uf-codeF").value="";
    });

    // Update all sites button
    document.getElementById("uf-update").addEventListener("click", function(){
      var sites=getSites(), scripts=siteLoad();
      if(!sites.length){ setSt("No tracked sites.","#6f6e77"); return; }
      var rem=sites.length;
      setSt("Updating "+rem+" site(s)…","#6f6e77");
      sites.forEach(function(origin){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
        pushToSite(origin,toSend,function(){ rem--; if(rem<=0) setSt("All sites updated \u2713","green"); });
      });
    });

    wireGames();
    renderScripts(); updateBar();
  }

  // ── Games / Iframe tab ───────────────────────────────────────────
  var BM_KEY = "__uFeaturesBookmarks";
  var _gCurrent = "https://www.google.com?igu=1";
  var _gFS = false; // fullscreen mode state

  function loadBookmarks(){
    try{ return JSON.parse(localStorage.getItem(BM_KEY)||"null"); }catch(e){ return null; }
  }
  function saveBookmarks(arr){ localStorage.setItem(BM_KEY, JSON.stringify(arr)); }

  var DEFAULT_BOOKMARKS = [
    { title:"AZ Games",       url:"https://www.azgames.io" },
    { title:"Zap Games",      url:"https://zapgames.io" },
    { title:"Pizza Edition",  url:"https://learncodingdaily.com" }
  ];

  function faviconUrl(url){
    try{
      var origin = new URL(url).origin;
      return "https://www.google.com/s2/favicons?domain="+encodeURIComponent(origin)+"&sz=32";
    }catch(e){ return ""; }
  }

  function wireGames(){
    var frame   = document.getElementById("uf-games-frame");
    var urlInput= document.getElementById("uf-games-url");
    var backBtn = document.getElementById("uf-g-back");
    var fwdBtn  = document.getElementById("uf-g-fwd");
    var fsBtn   = document.getElementById("uf-g-fs");
    var wrap    = document.getElementById("uf-games-wrap");

    if(!frame) return;

    // Init bookmarks
    var bms = loadBookmarks() || DEFAULT_BOOKMARKS.slice();
    renderBookmarks(bms, frame, urlInput);

    // Update url bar and button states from iframe.js navstate messages
    window.addEventListener("message", function(e){
      var d = e.data; if(!d || typeof d !== "object") return;
      // iframe.js sends __ifm_navstate to the iframe side, but we're the host page here.
      // We drive back/fwd ourselves via __ifm_goback/__ifm_goforward sent to frame.
      if(d.type === "__ifm_currenturl"){
        var url = d.url; if(!url) return;
        _gCurrent = url;
        if(document.activeElement !== urlInput) urlInput.value = url;
      }
      if(d.type === "__ifm_navstate"){
        backBtn.disabled = !d.canBack;
        fwdBtn.disabled  = !d.canFwd;
        if(d.url && document.activeElement !== urlInput) urlInput.value = d.url;
      }
    });

    // Back / Forward — send to iframe (iframe.js handles history on host side)
    backBtn.addEventListener("click", function(){
      try{ frame.contentWindow.postMessage({type:"__ifm_goback"},"*"); }catch(e){}
    });
    fwdBtn.addEventListener("click", function(){
      try{ frame.contentWindow.postMessage({type:"__ifm_goforward"},"*"); }catch(e){}
    });

    // Fullscreen toggle — hides nav/bookmarks bar, iframe fills tab
    fsBtn.addEventListener("click", function(){
      _gFS = !_gFS;
      if(_gFS){
        wrap.classList.add("fs-mode");
        fsBtn.title = "Exit focus mode";
        fsBtn.textContent = "\u2715";
      } else {
        wrap.classList.remove("fs-mode");
        fsBtn.title = "Focus iframe";
        fsBtn.innerHTML = "&#9974;";
      }
    });

    // URL bar
    urlInput.value = _gCurrent;
    urlInput.addEventListener("focus", function(){ urlInput.select(); });
    urlInput.addEventListener("keydown", function(e){
      if(e.key === "Escape"){ urlInput.value = _gCurrent; urlInput.blur(); return; }
      if(e.key !== "Enter") return;
      e.preventDefault();
      var val = urlInput.value.trim(); if(!val) return;
      // Bookmarklet — eval inside iframe
      if(/^javascript:/i.test(val)){
        try{ frame.contentWindow.eval(val.replace(/^javascript:/i,"")); }
        catch(ex){ alert("Bookmarklet error: "+ex); }
        urlInput.blur(); return;
      }
      if(!/^https?:\/\//i.test(val)) val = "https://"+val;
      // Send navigate message — iframe.js will pick it up on the iframe side
      // But since we're the host, just set src directly via the iframe.js host protocol
      try{ frame.contentWindow.postMessage({type:"__ifm_navigate",url:val},"*"); }catch(ex){}
      // Fallback: direct src
      _gCurrent = val;
      frame.src = val;
      urlInput.blur();
    });
  }

  function renderBookmarks(bms, frame, urlInput){
    var list = document.getElementById("uf-bm-list");
    var addBtn = document.getElementById("uf-bm-add");
    if(!list) return;
    list.innerHTML = "";

    bms.forEach(function(bm, i){
      var span = document.createElement("span");
      span.className = "uf-bm";
      span.title = bm.url;

      // Favicon
      var fav = document.createElement("img");
      fav.src = faviconUrl(bm.url);
      fav.width = 14; fav.height = 14;
      fav.onerror = function(){ this.style.display="none"; };

      var label = document.createElement("span");
      label.className = "uf-bm-label";
      label.textContent = bm.title;

      span.appendChild(fav);
      span.appendChild(label);

      // Left click: navigate iframe
      span.addEventListener("click", function(e){
        if(e.ctrlKey || e.metaKey){ window.open(bm.url,"_blank"); return; }
        var f = document.getElementById("uf-games-frame"); if(!f) return;
        // Switch to iframe tab first
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        document.querySelector("[data-tab='games']").classList.add("on");
        document.getElementById("uf-tab-games").classList.add("on");
        // Navigate
        _gCurrent = bm.url;
        f.src = bm.url;
        if(urlInput) urlInput.value = bm.url;
      });

      // Right-click: edit/delete
      span.addEventListener("contextmenu", function(e){
        e.preventDefault();
        var action = prompt("Edit bookmark — enter new name:title|url — or type DELETE to remove\n\nCurrent: "+bm.title+" | "+bm.url, bm.title+"|"+bm.url);
        if(action === null) return;
        if(action.trim().toUpperCase() === "DELETE"){
          bms.splice(i,1); saveBookmarks(bms); renderBookmarks(bms,frame,urlInput); return;
        }
        var parts = action.split("|");
        bms[i] = { title:(parts[0]||bm.title).trim(), url:(parts[1]||bm.url).trim() };
        saveBookmarks(bms); renderBookmarks(bms,frame,urlInput);
      });

      list.appendChild(span);
    });

    // Add bookmark button
    if(addBtn){
      addBtn.onclick = function(){
        var currentUrl = (urlInput && urlInput.value.trim()) || _gCurrent || "";
        var defaultName = "";
        try{ defaultName = new URL(currentUrl).hostname.replace(/^www\./,""); }catch(e){}
        var t = prompt("Bookmark name:", defaultName); if(!t) return;
        var u = prompt("URL:", currentUrl); if(!u) return;
        bms.push({ title:t.trim(), url:u.trim() });
        saveBookmarks(bms); renderBookmarks(bms,frame,urlInput);
      };
    }
  }

  // Helper: derive origin from domain string and push
  function pushForDomain(domain, arr){
    if(!domain){ setSt("Saved.","#6f6e77"); return; }
    var rawDomain=domain.split(",")[0].trim().replace(/^\*\./,"");
    var slash=rawDomain.indexOf("/"); if(slash!==-1) rawDomain=rawDomain.slice(0,slash);
    if(!rawDomain){ setSt("Saved.","#6f6e77"); return; }
    var known=getSites().filter(function(o){ return o.indexOf(rawDomain)!==-1; });
    var origins=known.length ? known : ["https://"+rawDomain];
    var rem=origins.length;
    setSt("Saving & pushing…","#6f6e77");
    origins.forEach(function(origin){
      addSite(origin); updateBar();
      var toSend=arr.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
      pushToSite(origin,toSend,function(){ rem--; if(rem<=0) setSt("Saved & pushed \u2713","green"); });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────
  if(IS_SETTINGS){
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded", bootSettingsPage);
    else
      bootSettingsPage();
  } else {
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded", runSiteScripts);
    else
      runSiteScripts();
  }

  // ── Global shortcuts ─────────────────────────────────────────────
  document.addEventListener("keydown",function(e){
    var tag=(document.activeElement||{}).tagName;
    var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";

    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      if(typing) return; e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.code==="Backquote"){
      e.preventDefault();
      if(!IS_SETTINGS) window.open("https://www.google.com/ufeatures","_blank");
      return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.key==="v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
