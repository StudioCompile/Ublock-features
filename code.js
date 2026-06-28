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
  //
  // The bridge tab is a page on the TARGET origin that has uFeatures injected.
  // We open it, wait for it to signal ready (it posts uf_bridge_ready to opener),
  // then send the payload. It saves and posts uf_bridge_ack back.
  // window.name persists across redirects — if the tab redirects, uFeatures
  // still recognises it as a bridge tab and takes over the page immediately.
  //
  // We use "*" as postMessage target since we control both sides and need to
  // send to the tab regardless of what URL it ended up on after redirects.

  function pushToSite(origin, scripts, onDone){
    var done = false;
    var tab = null;
    var poll = null;
    var timeoutTimer = null;

    function finish(err){
      if(done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeoutTimer);
      window.removeEventListener("message", onMsg);
      if(!err){
        // Close tab after a moment so user sees "Saved ✓"
        setTimeout(function(){ try{ tab.close(); }catch(e){} }, 800);
      } else {
        try{ tab.close(); }catch(e){}
      }
      if(onDone) onDone(err||null);
    }

    function onMsg(e){
      var d = e.data; if(!d || typeof d !== "object") return;
      // Must come from our tab
      if(e.source !== tab) return;

      if(d.type === "uf_bridge_ready"){
        // Tab is ready — send the payload
        clearInterval(poll); poll = null;
        try{
          tab.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts }, origin);
        }catch(ex){ finish("send-failed"); }
      }

      if(d.type === "uf_bridge_ack"){
        if(d.error){ finish("save-error: "+d.error); }
        else { finish(null); }
      }
    }

    window.addEventListener("message", onMsg);

    // Open tab — no size args = opens as a real browser tab
    var winName = "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");
    tab = window.open(origin + "/?__ufb=1", winName);
    if(!tab){
      window.removeEventListener("message", onMsg);
      if(onDone) onDone("blocked");
      setSt("Popup blocked \u2014 allow popups from google.com", "#cc0000");
      return;
    }

    // Poll until tab signals ready — handles case where tab takes a moment to load
    // and the first few postMessages are missed. We send a ping every 200ms.
    var pingAttempts = 0;
    poll = setInterval(function(){
      if(done){ clearInterval(poll); return; }
      try{ tab.postMessage({ type:"uf_bridge_ping" }, "*"); }catch(e){}
      pingAttempts++;
    }, 200);

    // Hard timeout — 10 seconds
    timeoutTimer = setTimeout(function(){
      if(!done) finish("timeout");
    }, 10000);
  }

  // ── Bridge listener: every page with uFeatures receives bridge messages ──
  // When this page is a bridge tab, it responds to pings and saves data.
  window.addEventListener("message", function(e){
    var d = e.data; if(!d || typeof d !== "object") return;

    // Respond to ping from opener — signals we are ready
    if(d.type === "uf_bridge_ping"){
      try{ e.source.postMessage({ type:"uf_bridge_ready" }, e.origin); }catch(ex){}
    }

    // Receive data to save
    if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
      try{
        localStorage.setItem(d.key, JSON.stringify(d.scripts));
        e.source.postMessage({ type:"uf_bridge_ack" }, e.origin);
        var st = document.getElementById("__uf_bridge_st");
        if(st){ st.textContent = "Saved \u2713"; st.style.color = "#1e7e34"; }
      }catch(ex){
        try{ e.source.postMessage({ type:"uf_bridge_ack", error:String(ex) }, e.origin); }catch(e2){}}
      }
    }
  });

  // ── Bridge page takeover ─────────────────────────────────────────
  // Detects it's a bridge tab via ?__ufb=1 param OR window.name prefix.
  // window.name persists across redirects so this works even if the site
  // redirects away from the ?__ufb=1 URL.
  // Uses document.open() + document.write() to strip ALL existing HTML
  // synchronously — fires before any site scripts or redirects can run.
  (function(){
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(!isBridge || IS_SETTINGS) return;

    function takeover(){
      try{
        document.open("text/html", "replace");
        document.write(
          '<!DOCTYPE html><html><head>'
          +'<meta charset="utf-8"><title>Saving data\u2026</title>'
          +'<style>'
          +'*{margin:0;padding:0;box-sizing:border-box}'
          +'html,body{height:100%;background:#f8f9fa;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;font-size:13px;color:#5f6368;user-select:none;overflow:hidden}'
          +'body{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px}'
          +'.spin{width:20px;height:20px;border:2px solid #e0e0e0;border-top-color:#5f6368;border-radius:50%;animation:s 0.8s linear infinite}'
          +'@keyframes s{to{transform:rotate(360deg)}}'
          +'#__uf_bridge_st{font-size:12px;color:#5f6368}'
          +'</style>'
          +'</head><body>'
          +'<div class="spin"></div>'
          +'<div id="__uf_bridge_st">Saving data\u2026</div>'
          +'</body></html>'
        );
        document.close();
      }catch(ex){}
    }

    // Fire as early as possible — synchronously if doc is not yet loaded
    takeover();

    // Also hook DOMContentLoaded in case document.write wasn't enough
    // (some browsers ignore document.write after certain redirects)
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", function(){
        // If the page somehow still has content, take over again
        if(!document.getElementById("__uf_bridge_st")) takeover();
      });
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
      ".uf-feat-text p{font-size:13px;color:#3c3c43;line-height:1.7;margin-bottom:10px}",
      ".uf-feat-text p:last-child{margin-bottom:0}",
      ".uf-feat-text p b{font-weight:600;color:#1c1b22}"
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
          +'<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        +'</div>'
        +'<div class="uf-top-actions">'
          +'<button class="uf-btn" id="uf-update" title="Re-push all scripts to all tracked sites">&#8635; Update all sites</button>'
        +'</div>'
      +'</div>'

      +'<div id="uf-body">'

        // HOME TAB
        +'<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          +'<div class="uf-home-hero">'
            +'<img src="'+iconUrl+'" width="44" height="44" style="object-fit:contain;flex-shrink:0">'
            +'<div>'
              +'<h1>u<b>Features</b></h1>'
              +'<div class="uf-home-credit">By StudioCompile &mdash; Roblox: studiocompile &middot; Discord: @roblox_studio</div>'
            +'</div>'
          +'</div>'
          +'<div class="uf-sh">Features</div>'
          +'<div class="uf-feat-text">'
            +'<p><b>Script Manager</b> &mdash; Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete from My Scripts.</p>'
            +'<p><b>Script Sync</b> &mdash; Scripts are stored on google.com and pushed to target sites via a bridge tab. Changes sync on save, toggle, and delete.</p>'
            +'<p><b>Securly Blocker</b> &mdash; Removes Securly overlay elements on load and watches via MutationObserver so they cannot come back.</p>'
            +'<p><b>Chii Debugger</b> &mdash; Injects the Chii remote DevTools panel into any page with a dark background so you know it activated. Ctrl+Shift+I to toggle.</p>'
            +'<p><b>Bookmarklet Runner</b> &mdash; Copy any javascript: URL then press Ctrl+V outside a text field to run it on the current page.</p>'
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
            +'<button class="uf-btn" id="uf-cancelEdit" style="display:none">Cancel edit</button>'
            +'<button class="uf-btn prim" id="uf-saveBtn">Save script</button>'
          +'</div></div>'
          +'<div class="uf-sh" style="margin-top:20px">Saved Scripts</div>'
          +'<div class="uf-card" id="uf-slist"></div>'
        +'</div></div>'

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
        // Show editing state
        document.getElementById("uf-saveBtn").textContent="Update script";
        document.getElementById("uf-saveBtn").className="uf-btn prim";
        document.getElementById("uf-cancelEdit").style.display="";
        // Switch to scripts tab and scroll to top
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        document.querySelector("[data-tab='scripts']").classList.add("on");
        document.getElementById("uf-tab-scripts").classList.add("on");
        document.getElementById("uf-tab-scripts").querySelector(".uf-scroll").scrollTop=0;
        document.getElementById("uf-nameF").focus();
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

  function wireSettings(){
    // Auto-fill domain from referrer (the site that opened settings)
    var domF = document.getElementById("uf-domF");
    if(_referrer) domF.value = _referrer;

    // Tabs
    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        tab.classList.add("on");
        var sec=document.getElementById("uf-tab-"+tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    // Cancel edit
    document.getElementById("uf-cancelEdit").addEventListener("click", function(){
      _editingName = null;
      document.getElementById("uf-nameF").value = "Example Script";
      document.getElementById("uf-domF").value = _referrer || "";
      document.getElementById("uf-codeF").value = "";
      document.getElementById("uf-saveBtn").textContent = "Save script";
      document.getElementById("uf-saveBtn").className = "uf-btn prim";
      document.getElementById("uf-cancelEdit").style.display = "none";
    });

    // Save script
    document.getElementById("uf-saveBtn").addEventListener("click", function(){
      var name=(document.getElementById("uf-nameF").value.trim())||"Example Script";
      var domain=document.getElementById("uf-domF").value.trim();
      var code=document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Code is required.","#cc0000"); return; }

      var arr=siteLoad();
      var idx=-1;
      // Only replace an existing script if we're explicitly editing one
      if(_editingName) arr.forEach(function(s,i){ if(s.name===_editingName) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      if(idx>=0) arr[idx]=entry; else arr.push(entry);
      siteSave(arr);

      // Reset editing state
      _editingName=null;
      document.getElementById("uf-saveBtn").textContent="Save script";
      document.getElementById("uf-saveBtn").className="uf-btn prim";
      document.getElementById("uf-cancelEdit").style.display="none";

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
      setSt("Updating "+rem+" site(s)\u2026","#6f6e77");
      sites.forEach(function(origin){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
        pushToSite(origin,toSend,function(){ rem--; if(rem<=0) setSt("All sites updated \u2713","green"); });
      });
    });

    renderScripts(); updateBar();
  }

  // Helper: derive origin from domain string and push
  function pushForDomain(domain, arr){
    if(!domain){ setSt("Saved (no domain — not pushed to any site)","#6f6e77"); return; }
    var rawDomain=domain.split(",")[0].trim().replace(/^\*\./,"");
    var slash=rawDomain.indexOf("/"); if(slash!==-1) rawDomain=rawDomain.slice(0,slash);
    if(!rawDomain){ setSt("Saved","#6f6e77"); return; }
    var known=getSites().filter(function(o){ return o.indexOf(rawDomain)!==-1; });
    var origins=known.length ? known : ["https://"+rawDomain];
    var rem=origins.length, failed=0;
    setSt("Pushing to "+rawDomain+"\u2026","#6f6e77");
    origins.forEach(function(origin){
      addSite(origin); updateBar();
      var toSend=arr.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
      pushToSite(origin, toSend, function(err){
        rem--;
        if(err) failed++;
        if(rem<=0){
          if(failed===0) setSt("Saved \u2713","#1e7e34");
          else setSt("Saved locally but push to "+rawDomain+" failed ("+failed+" error"+(failed>1?"s":"")+")","#cc0000");
        }
      });
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
