/// uFeatures.js
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

  var SITE_KEY  = "__uFeaturesScripts";
  var SITES_KEY = "__uFeaturesSites";
  var chiiState = 0;
  var _referrer = document.referrer ? new URL(document.referrer).hostname : "";

  var IS_SETTINGS = (
    (location.hostname === "www.google.com" || location.hostname === "google.com") &&
    location.pathname === "/ufeatures"
  );

  // ── Storage ───────────────────────────────────────────────────────
  function siteLoad(){
    try{ return JSON.parse(localStorage.getItem(SITE_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function siteSave(arr){
    localStorage.setItem(SITE_KEY, JSON.stringify(arr));
  }
  function getSites(){
    try{ return JSON.parse(localStorage.getItem(SITES_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function addSite(origin){
    var list = getSites();
    if(list.indexOf(origin)===-1){ list.push(origin); localStorage.setItem(SITES_KEY, JSON.stringify(list)); }
  }

  // ── Bridge ────────────────────────────────────────────────────────
  // Opens a tab on the target origin. Polls by sending uf_bridge_set every
  // 150ms until the tab acks. No handshake — just send and wait for ack.
  //
  // Fast-fail: if a site's CSP blocks our injected script entirely, NO message
  // ever comes back — there's nothing to catch, so normally we'd sit through the
  // full timeout with zero signal. To fail faster, we poll tab.location.href:
  // while the tab is still about:blank this read succeeds (same-origin); the
  // instant it navigates to the cross-origin target, the read throws. That throw
  // tells us navigation has begun, almost immediately (~tens of ms). From that
  // point a working site's bridge listener acks within a few hundred ms (it's
  // injected at document-start), so we only need to wait a short grace window
  // after navigation is detected — not the full timeout — before concluding the
  // site is blocking us. A hard cap remains as a fallback for edge cases where
  // navigation detection itself doesn't fire.

  function pushToSite(origin, scripts, onDone){
    var done    = false;
    var poll    = null;
    var navPoll = null;
    var timer   = null;
    var graceTimer = null;
    var navigated = false;
    var token = Math.random().toString(36).slice(2);
    var winName = "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");

    function finish(err){
      if(done) return;
      done = true;
      clearInterval(poll);
      clearInterval(navPoll);
      clearTimeout(timer);
      clearTimeout(graceTimer);
      window.removeEventListener("message", onMsg);
      setTimeout(function(){ try{ tab && tab.close(); }catch(e){} }, 500);
      if(onDone) onDone(err||null);
    }

    function onMsg(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.token !== token) return;
      if(d.type === "uf_bridge_ack"){
        finish(d.error ? "save-error:"+d.error : null);
      }
    }

    window.addEventListener("message", onMsg);

    var tab = window.open(origin + "/?__ufb=1", winName);
    if(!tab){
      window.removeEventListener("message", onMsg);
      if(onDone) onDone("blocked");
      setSt("Popup blocked \u2014 allow popups from google.com","#cc0000");
      return;
    }

    // Keep sending the payload until the tab acks (it may still be loading)
    poll = setInterval(function(){
      if(done) { clearInterval(poll); return; }
      if(tab.closed){ finish("closed"); return; }
      try{ tab.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts, token:token }, "*"); }catch(e){}
    }, 60);

    // Detect navigation start as fast as possible (tight poll, cheap check)
    navPoll = setInterval(function(){
      if(done || navigated){ clearInterval(navPoll); return; }
      try{
        // Still same-origin (about:blank) — hasn't navigated yet, keep waiting
        var href = tab.location.href;
        if(href && href !== "about:blank") {
          // Same-origin but already past blank — treat as navigated too
          navigated = true;
        }
      }catch(navErr){
        // Cross-origin throw means navigation to the target has begun
        navigated = true;
      }
      if(navigated){
        clearInterval(navPoll);
        // Short grace window once we know the page is loading — a working
        // site's bridge responds within document-start, so this stays tight.
        graceTimer = setTimeout(function(){
          if(!done) finish("timeout");
        }, 700);
      }
    }, 25);

    // Hard cap fallback in case navigation detection never fires
    timer = setTimeout(function(){ if(!done) finish("timeout"); }, 5000);
  }

  // ── Bridge message listener (runs on EVERY page) ──────────────────
  // Never use document.write here — it kills these listeners.
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || typeof d !== "object") return;

    if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
      try{
        // Test whether this site's CSP allows dynamic JS execution before saving.
        // If new Function() is blocked (common CSP restriction), scripts saved here
        // would never actually run on real page loads, so we must fail closed.
        try{ new Function("return 1")(); }
        catch(execErr){
          try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token, error:"CSP blocks script execution on this site" }, "*"); }catch(ex3){}
          var stErr = document.getElementById("__uf_bridge_st");
          if(stErr){ stErr.textContent = "Blocked by site \u2717"; stErr.style.color = "#cc0000"; }
          return;
        }
        localStorage.setItem(d.key, JSON.stringify(d.scripts));
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token }, "*"); }catch(ex2){}
        var st = document.getElementById("__uf_bridge_st");
        if(st){ st.textContent = "Saved \u2713"; st.style.color = "#1e7e34"; }
      }catch(ex){
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token, error:String(ex) }, "*"); }catch(e2){}
      }
    }
  });

  // ── Bridge page overlay ───────────────────────────────────────────
  // Show a plain white "Saving…" screen on the bridge tab.
  // Use a fixed overlay div — NOT document.write — so the message listeners survive.
  (function(){
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(!isBridge || IS_SETTINGS) return;

    // We only need OUR script to run on this tab — the actual page content and
    // its scripts are irrelevant and can only get in the way (slow us down,
    // trigger CSP noise, etc). window.stop() halts the parser immediately:
    // it cancels any scripts/resources still queued to load or run, same as
    // hitting the browser's stop button. Whatever already ran before this line
    // executed still ran (we can't undo that), but nothing further will.
    try{ window.stop(); }catch(ex){}

    // Remove any <script> tags already sitting in the DOM so they can't be
    // re-triggered or read by anything else, and strip any that get added
    // afterward (e.g. by an inline handler that fired before window.stop()).
    function stripScripts(){
      var scripts = document.querySelectorAll("script");
      for(var i=0;i<scripts.length;i++){
        try{ scripts[i].remove(); }catch(ex){}
      }
    }
    stripScripts();
    new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var added = muts[i].addedNodes;
        for(var j=0;j<added.length;j++){
          var n = added[j];
          if(n.tagName === "SCRIPT"){ try{ n.remove(); }catch(ex){} }
        }
      }
    }).observe(document.documentElement || document, { childList:true, subtree:true });

    function showOverlay(){
      if(document.getElementById("__uf_bridge_overlay")) return;
      stripScripts();
      var s = document.createElement("style");
      s.textContent = "html,body{background:#fff!important;overflow:hidden!important;margin:0!important;padding:0!important}body>*:not(#__uf_bridge_overlay){display:none!important}";
      (document.head||document.documentElement).appendChild(s);

      var ov = document.createElement("div");
      ov.id = "__uf_bridge_overlay";
      ov.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:13px;color:#555;z-index:2147483647";

      var lbl = document.createElement("div");
      lbl.id = "__uf_bridge_st";
      lbl.textContent = "Saving\u2026";

      ov.appendChild(lbl);
      if(document.body) document.body.appendChild(ov);
      else document.documentElement.appendChild(ov);
    }

    if(document.readyState === "loading"){
      var es = document.createElement("style");
      es.textContent = "html,body{background:#fff!important;overflow:hidden!important}body>*{display:none!important}";
      (document.head||document.documentElement).appendChild(es);
      document.addEventListener("DOMContentLoaded", showOverlay);
    }
    // Call immediately regardless of readyState — window.stop() can prevent
    // DOMContentLoaded from ever firing, so we can't rely on it alone.
    // showOverlay() guards against running twice.
    showOverlay();
  })();

  // ── Securly blocker ───────────────────────────────────────────────
  function killSecurly(){
    var el = document.getElementById("securly_overlay");
    if(el) el.remove();
    ["securly-overlay","securly_overlay","securly-extension"].forEach(function(c){
      var nl = document.getElementsByClassName(c);
      for(var i=nl.length-1;i>=0;i--) nl[i].remove();
    });
  }
  new MutationObserver(killSecurly).observe(document.documentElement,{childList:true,subtree:true});
  killSecurly();

  // ── Domain matching ───────────────────────────────────────────────
  function stripWww(h){ return h.replace(/^www\./,""); }
  function stripProtocol(s){ return s.replace(/^https?:\/\//i,""); }

  function matchesDomain(pattern){
    if(!pattern||!pattern.trim()) return false;
    var host = stripWww(location.hostname), path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = stripProtocol(p.trim()); if(!p) return false;
      var si = p.indexOf("/");
      var hp = stripWww(si===-1 ? p : p.slice(0,si));
      var pp = si===-1 ? "" : p.slice(si);
      var hm = hp.slice(0,2)==="*."
        ? host===hp.slice(2)||host.endsWith("."+hp.slice(2))
        : host===hp;
      if(!hm) return false; if(!pp) return true;
      var norm = pp.endsWith("/") ? pp : pp+"/";
      return path===pp||path.startsWith(norm);
    });
  }

  function domainMatchesOrigin(pattern, origin){
    if(!pattern||!pattern.trim()) return false;
    try{
      var host = stripWww(new URL(origin).hostname);
      return pattern.trim().split(",").some(function(p){
        p = stripProtocol(p.trim()); if(!p) return false;
        var si = p.indexOf("/");
        var hp = stripWww(si===-1 ? p : p.slice(0,si));
        return hp.slice(0,2)==="*."
          ? host===hp.slice(2)||host.endsWith("."+hp.slice(2))
          : host===hp;
      });
    }catch(e){ return false; }
  }

  // ── Run stored scripts ────────────────────────────────────────────
  function runSiteScripts(){
    if(IS_SETTINGS) return;
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(isBridge) return;
    siteLoad().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ new Function(s.code)(); }
        catch(e){ console.warn("[uFeatures]", s.name, e); }
      }
    });
  }

  // ── Iframe corner menu ────────────────────────────────────────────
  (function(){
    if(window === window.top) return;
    if(IS_SETTINGS) return;
    var isBridge = location.search.indexOf("__ufb=1")!==-1
                || (window.name && window.name.indexOf("uf_bridge_")===0);
    if(isBridge) return;

    // 12x12 invisible hot zone fixed to bottom-right corner
    var zone = document.createElement("div");
    zone.style.cssText = "position:fixed;bottom:0;right:0;width:12px;height:12px;z-index:2147483644";

    // Buffer so mouse can travel from corner to popup without it closing
    var buffer = document.createElement("div");
    buffer.style.cssText = "position:fixed;bottom:0;right:0;width:320px;height:60px;z-index:2147483645;pointer-events:none";

    // Single-line popup — input + go button connected as one piece, matching settings UI
    var popup = document.createElement("div");
    popup.style.cssText = [
      "position:fixed;bottom:4px;right:4px;z-index:2147483646",
      "display:flex;align-items:stretch",
      "border:1px solid #cfcfcf;border-radius:5px;overflow:hidden",
      "font-family:'Segoe UI',system-ui,-apple-system,sans-serif",
      "opacity:0;pointer-events:none",
      "transition:opacity .15s ease"
    ].join(";");

    var input = document.createElement("input");
    input.type = "text";
    input.style.cssText = [
      "border:none;padding:0 8px",
      "font-family:inherit;font-size:12px",
      "color:#1c1b22;background:#fff;outline:none",
      "width:220px;height:28px;box-sizing:border-box"
    ].join(";");

    var btnGo = document.createElement("button");
    btnGo.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><polyline points="13 5 20 12 13 19"></polyline></svg>';
    btnGo.style.cssText = [
      "width:28px;height:28px;padding:0",
      "display:flex;align-items:center;justify-content:center",
      "font-family:inherit;line-height:1",
      "cursor:pointer;border:none;border-left:1px solid #cfcfcf",
      "background:#7f0000;color:#fff;outline:none;flex-shrink:0"
    ].join(";");
    btnGo.onmouseover = function(){ this.style.background="#6a0000"; };
    btnGo.onmouseout  = function(){ this.style.background="#7f0000"; };
    btnGo.onclick = function(e){
      e.stopPropagation();
      var url = input.value.trim();
      if(url) try{ window.parent.postMessage({ type:"uf_iframe_nav", url:url }, "*"); }catch(ex){}
    };
    input.onkeydown = function(e){ if(e.key==="Enter") btnGo.click(); };

    popup.appendChild(input);
    popup.appendChild(btnGo);

    var hideTimer = null;
    var visible = false;

    function show(){
      clearTimeout(hideTimer);
      if(visible) return;
      visible = true;
      input.value = location.href;
      popup.style.pointerEvents = "auto";
      buffer.style.pointerEvents = "auto";
      popup.style.opacity = "1";
    }
    function scheduleHide(){
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){
        visible = false;
        popup.style.opacity = "0";
        popup.style.pointerEvents = "none";
        buffer.style.pointerEvents = "none";
      }, 250);
    }

    zone.addEventListener("mouseenter", show);
    zone.addEventListener("mouseleave", scheduleHide);
    buffer.addEventListener("mouseenter", function(){ clearTimeout(hideTimer); });
    buffer.addEventListener("mouseleave", scheduleHide);
    popup.addEventListener("mouseenter", function(){ clearTimeout(hideTimer); });
    popup.addEventListener("mouseleave", scheduleHide);

    function attach(){
      if(!document.body) return;
      document.body.appendChild(zone);
      document.body.appendChild(buffer);
      document.body.appendChild(popup);
    }
    if(document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach);

    // If parent told us to reopen after a navigation, show once loaded
    window.addEventListener("message", function(e){
      if(e.data && e.data.type === "uf_iframe_reopen") show();
    });
  })();

  // Parent side: listen for uf_iframe_nav, update src, then tell new page to reopen popup
  if(window === window.top){
    window.addEventListener("message", function(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.type !== "uf_iframe_nav" || !d.url) return;
      var frames = document.querySelectorAll("iframe");
      for(var i=0; i<frames.length; i++){
        try{
          if(frames[i].contentWindow === e.source){
            frames[i].src = d.url;
            // After load, tell the new page to show the popup
            frames[i].addEventListener("load", function(){
              try{ frames[i].contentWindow.postMessage({ type:"uf_iframe_reopen" }, "*"); }catch(ex){}
            }, { once:true });
            return;
          }
        }catch(ex){}
      }
    });
  }

  // ── Bookmarklet runner ────────────────────────────────────────────
  function runBookmarklet(text){
    var t=(text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ new Function(t.replace(/^javascript:/i,""))(); }
    catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Chii debugger ─────────────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{
        var u=new URL(HTMLElement.prototype.getAttribute.call(f,"src"));
        return u.host==="chii.liriliri.io"&&u.pathname==="/front_end/chii_app.html";
      }catch(e){ return false; }
    })[0];
  }
  function showChii(){
    var f=getChiiFrame(); if(!f) return;
    var w=f.parentNode;
    w.style.cssText+=";display:block!important;background:#282828!important;opacity:1!important;pointer-events:auto!important;";
    f.style.cssText+=";background:#282828!important;opacity:1!important;display:block!important;";
    f.addEventListener("contextmenu",function(e){e.preventDefault();e.stopPropagation();},true);
    f.addEventListener("keydown",function(e){
      if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&(e.key==="I"||e.key==="J"||e.key==="C"))||(e.ctrlKey&&e.key==="U"))
        e.preventDefault();
    },true);
    document.body.style.height=(document.documentElement.clientHeight-Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px";
  }
  function toggleChii(){
    var f=getChiiFrame(); if(!f) return;
    var w=f.parentNode;
    if(window.getComputedStyle(w).display==="none"){
      w.style.background="#282828";f.style.background="#282828";f.style.opacity="1";
      w.style.display="";
      document.body.style.height=(document.documentElement.clientHeight-Math.floor(Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100))+"px";
    }else{
      w.style.display="none";document.body.style.height="";
    }
  }
  function injectChii(){
    if(chiiState===1) return;
    if(chiiState===2){ toggleChii(); return; }
    chiiState=1;
    var ph=document.createElement("div"); ph.id="__uf_chii_ph";
    ph.style.cssText="position:fixed;bottom:0;left:0;width:100%;height:50%;background:#282828;z-index:2147483640;display:flex;align-items:center;justify-content:center;";
    ph.innerHTML='<span style="color:#666;font-family:monospace;font-size:13px;">Loading Chii\u2026</span>';
    document.body.appendChild(ph);
    var s=document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s,"embedded","true");
    HTMLElement.prototype.setAttribute.call(s,"src","https://chii.liriliri.io/target.js");
    s.addEventListener("load",function(){
      var n=0,poll=setInterval(function(){
        var f=getChiiFrame();
        if(f){clearInterval(poll);chiiState=2;var p=document.getElementById("__uf_chii_ph");if(p)p.remove();showChii();}
        if(++n>40){clearInterval(poll);chiiState=0;var p=document.getElementById("__uf_chii_ph");if(p)p.remove();}
      },100);
    });
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS PAGE  —  google.com/ufeatures
  // ════════════════════════════════════════════════════════════════════

  function bootSettingsPage(){
    document.title = "uFeatures";
    while(document.documentElement.firstChild)
      document.documentElement.removeChild(document.documentElement.firstChild);
    var head=document.createElement("head");
    var meta=document.createElement("meta"); meta.setAttribute("charset","utf-8"); head.appendChild(meta);
    var vp=document.createElement("meta"); vp.name="viewport"; vp.content="width=device-width,initial-scale=1"; head.appendChild(vp);
    var ti=document.createElement("title"); ti.textContent="uFeatures"; head.appendChild(ti);
    var fav=document.createElement("link"); fav.rel="icon"; fav.type="image/png";
    fav.href="https://raw.githubusercontent.com/StudioCompile/uFeatures/main/Logo.png";
    head.appendChild(fav);
    var style=document.createElement("style"); style.textContent=settingsCSS(); head.appendChild(style);
    document.documentElement.appendChild(head);
    var body=document.createElement("body");
    body.innerHTML=settingsHTML();
    document.documentElement.appendChild(body);
    wireSettings();
  }

  function settingsCSS(){
    return [
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
      "html,body{height:100%;background:#f5f5f5;color:#1c1b22;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:13px}",
      "#uf-wrap{display:flex;flex-direction:column;height:100vh;overflow:hidden}",
      // Topbar
      "#uf-top{display:flex;align-items:stretch;background:#fff;border-bottom:1px solid #d8d8d8;height:38px;flex-shrink:0}",
      ".uf-logo{display:flex;align-items:center;gap:7px;padding:0 14px;border-right:1px solid #d8d8d8;font-size:13px;font-weight:600;color:#1c1b22;white-space:nowrap;cursor:pointer;text-decoration:none}",
      ".uf-logo:hover{background:#f7f7f7}",
      ".uf-tabs{display:flex;align-items:stretch}",
      ".uf-tab{display:flex;align-items:center;padding:0 14px;cursor:pointer;font-size:13px;color:#6f6e77;border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none}",
      ".uf-tab:hover{background:#f7f7f7;color:#1c1b22}",
      ".uf-tab.on{color:#1c1b22;border-bottom-color:#7f0000}",
      // Body
      "#uf-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}",
      ".uf-scroll{flex:1;overflow-y:auto;padding:18px 22px 36px}",
      ".uf-sec{display:none}.uf-sec.on{display:flex;flex-direction:column;flex:1;min-height:0}",
      // Status bar
      "#uf-bar{height:20px;background:#e8e8e8;display:flex;align-items:center;padding:0 10px;gap:14px;flex-shrink:0;border-top:1px solid #d8d8d8}",
      "#uf-bar span{font-size:11px;color:#6f6e77}",
      "#uf-barst{margin-left:auto;font-size:11px}",
      // Buttons
      ".uf-btn{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #cfcfcf;background:#fff;color:#1c1b22;border-radius:3px}",
      ".uf-btn:hover{background:#f0f0f0}",
      ".uf-btn:disabled{opacity:.4;cursor:default;pointer-events:none}",
      ".uf-btn.prim{background:#7f0000;border-color:#7f0000;color:#fff}",
      ".uf-btn.prim:hover{background:#6a0000}",
      ".uf-btn.danger{color:#7f0000;border-color:#cfcfcf}",
      ".uf-btn.danger:hover{background:#fbecec;border-color:#7f0000}",
      // Labels / inputs
      ".uf-lbl{font-size:11px;color:#6f6e77;margin-bottom:3px}",
      ".uf-sh{font-size:11px;font-weight:600;color:#6f6e77;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #d8d8d8}",
      ".uf-card{background:#fff;border:1px solid #d8d8d8;margin-bottom:14px;border-radius:4px;overflow:hidden}",
      ".uf-fa{padding:12px 14px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #ececec}",
      ".uf-g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      "input.uf-in{border:1px solid #cfcfcf;padding:5px 8px;font-family:inherit;font-size:13px;outline:none;width:100%;color:#1c1b22;background:#fff;border-radius:3px}",
      "input.uf-in:focus{border-color:#7f0000}",
      "textarea.uf-ta{border:1px solid #cfcfcf;padding:6px 8px;font-family:Consolas,Menlo,monospace;font-size:12px;outline:none;width:100%;resize:vertical;line-height:1.5;min-height:120px;color:#1c1b22;background:#fff;border-radius:3px}",
      "textarea.uf-ta:focus{border-color:#7f0000}",
      ".uf-ff{display:flex;gap:6px;align-items:center;padding:8px 14px;background:#f7f7f7;border-top:1px solid #ececec}",
      "#uf-st{flex:1;font-size:11px}",
      // Script rows — checkbox | info | push-st | edit | delete
      ".uf-srow{display:grid;grid-template-columns:16px 1fr auto 50px 50px;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #ececec}",
      ".uf-srow:last-child{border-bottom:none}",
      ".uf-srow:hover{background:#fafafa}",
      ".uf-sinfo{min-width:0}",
      ".uf-sname{font-size:13px;color:#1c1b22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".uf-sname.dim{color:#bbb}",
      ".uf-sdomain{font-size:11px;color:#999}",
      ".uf-push-st{font-size:10px;color:#bbb;text-align:right;white-space:nowrap}",
      ".uf-empty{padding:24px;text-align:center;color:#bbb}",
      // Checkbox — 16px, red when checked, bigger checkmark
      ".uf-cb{position:relative;width:16px;height:16px;flex-shrink:0;cursor:pointer}",
      ".uf-cb input{opacity:0;position:absolute;width:0;height:0}",
      ".uf-cb .box{position:absolute;inset:0;border:1px solid #cfcfcf;background:#fff;border-radius:3px}",
      ".uf-cb input:checked+.box{background:#7f0000;border-color:#7f0000}",
      ".uf-cb input:checked+.box::after{content:'';position:absolute;left:4px;top:1px;width:6px;height:9px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}",
      // Shortcuts
      ".uf-krow{display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid #ececec}",
      ".uf-krow:last-child{border-bottom:none}",
      ".uf-kbd{background:#f0f0f0;border:1px solid #d8d8d8;padding:2px 8px;font-family:monospace;font-size:12px;min-width:160px;text-align:center;border-radius:3px}",
      ".uf-kdesc{font-size:12px;color:#6f6e77}",
      "code.uf-c{background:#f0f0f0;padding:1px 4px;font-family:monospace;font-size:11px;border-radius:2px}",
      // Home
      ".uf-home-hero{display:flex;align-items:center;gap:14px;padding:18px 0 16px}",
      ".uf-home-hero h1{font-size:20px;font-weight:600;color:#1c1b22}",
      ".uf-home-credit{font-size:11px;color:#aaa;margin-top:3px}",
      ".uf-home-desc{font-size:13px;color:#444;line-height:1.65;margin-bottom:16px}",
      ".uf-feat-text p{font-size:13px;color:#444;line-height:1.7;margin-bottom:8px}",
      ".uf-feat-text p b{font-weight:600;color:#1c1b22}"
    ].join("\n");
  }

  function settingsHTML(){
    var icon="https://raw.githubusercontent.com/StudioCompile/uFeatures/main/Logo.png";
    return '<div id="uf-wrap">'
      +'<div id="uf-top">'
        +'<a class="uf-logo" id="uf-home-link" href="https://www.google.com/ufeatures"><img src="'+icon+'" width="18" height="18" style="object-fit:contain;image-rendering:auto">uFeatures</a>'
        +'<div class="uf-tabs">'
          +'<div class="uf-tab on" data-tab="home">Home</div>'
          +'<div class="uf-tab" data-tab="scripts">Scripts</div>'
          +'<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        +'</div>'
      +'</div>'

      +'<div id="uf-body">'

        // HOME
        +'<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          +'<div class="uf-home-hero">'
            +'<img src="'+icon+'" width="56" height="56" style="object-fit:contain;flex-shrink:0;image-rendering:auto">'
            +'<div>'
              +'<h1>uFeatures</h1>'
              +'<div class="uf-home-credit">By StudioCompile &mdash; Roblox: studiocompile &middot; Discord: @roblox_studio</div>'
            +'</div>'
          +'</div>'
          +'<div class="uf-home-desc">uBlock Origin lets you inject JS into almost any website, which has a lot of potential. There are already projects out there for it, but you can only add one at a time and most aren\'t great. uFeatures is a great way to add all of these features &mdash; and easily add even more.</div>'
          +'<div class="uf-sh">Features</div>'
          +'<div class="uf-feat-text">'
            +'<p><b>Script Manager</b> &mdash; Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete from My Scripts.</p>'
            +'<p><b>Securly Blocker</b> &mdash; Removes Securly overlay elements on load and watches via MutationObserver so they cannot come back.</p>'
            +'<p><b>Inspect Element</b> &mdash; Injects a remote DevTools panel into any page. Ctrl+Shift+I to toggle.</p>'
            +'<p><b>Bookmarklet Runner</b> &mdash; Copy any javascript: URL then press Ctrl+V outside a text field to run it on the current page.</p>'
            +'<p><b>Iframe Navigator</b> &mdash; Hover the bottom-right corner of any iframe to navigate it to a new URL.</p>'
          +'</div>'
        +'</div></div>'

        // SCRIPTS
        +'<div class="uf-sec" id="uf-tab-scripts"><div class="uf-scroll">'
          +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
            +'<div class="uf-sh" style="margin-bottom:0;border-bottom:none;padding-bottom:0">Add / Edit Script</div>'
            +'<button class="uf-btn" id="uf-update" style="font-size:11px">&#8635; Update all sites</button>'
          +'</div>'
          +'<div class="uf-card"><div class="uf-fa">'
            +'<div class="uf-g2">'
              +'<div><div class="uf-lbl">Script name</div><input id="uf-nameF" class="uf-in" type="text" value="My Script"></div>'
              +'<div><div class="uf-lbl">Target domain (e.g. example.com)</div><input id="uf-domF" class="uf-in" type="text" placeholder="example.com"></div>'
            +'</div>'
            +'<div><div class="uf-lbl">JavaScript</div><textarea id="uf-codeF" class="uf-ta" placeholder="// Your script here..."></textarea></div>'
          +'</div>'
          +'<div class="uf-ff">'
            +'<span id="uf-st"></span>'
            +'<button class="uf-btn" id="uf-cancelEdit" style="display:none">Cancel</button>'
            +'<button class="uf-btn prim" id="uf-saveBtn">Save Script</button>'
          +'</div></div>'
          +'<div class="uf-sh" style="margin-top:18px;margin-bottom:10px">Saved Scripts</div>'
          +'<div class="uf-card" id="uf-slist"></div>'
        +'</div></div>'

        // SHORTCUTS
        +'<div class="uf-sec" id="uf-tab-keys"><div class="uf-scroll">'
          +'<div class="uf-sh" style="margin-bottom:10px">Keyboard Shortcuts</div>'
          +'<div class="uf-card">'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + `</span><span class="uf-kdesc">Open uFeatures in a new tab</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Toggle Inspect Element</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> URL from clipboard (outside a text field)</span></div>'
          +'</div>'
        +'</div></div>'

      +'</div>'

      +'<div id="uf-bar">'
        +'<span id="uf-cnt-s">0 scripts</span>'
        +'<span id="uf-cnt-si">0 sites</span>'
        +'<span id="uf-barst"></span>'
      +'</div>'
    +'</div>';
  }

  // ── Settings wiring ───────────────────────────────────────────────
  var _editingName = null;

  function setSt(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      el.textContent=msg; el.style.color=color||"#777";
    });
    if(msg) setTimeout(function(){
      ["uf-st","uf-barst"].forEach(function(id){
        var el=document.getElementById(id); if(el&&el.textContent===msg) el.textContent="";
      });
    },3000);
  }

  // Like setSt but does NOT auto-clear — used for failures so the user
  // can't miss them. Clears only when the next setSt/setStPersist call happens.
  function setStPersist(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      el.textContent=msg; el.style.color=color||"#cc0000";
    });
  }

  // Switch to the Scripts tab so the user actually sees the error,
  // regardless of which tab they were on when the save happened.
  function focusScriptsTab(){
    var tab = document.querySelector("[data-tab='scripts']");
    var sec = document.getElementById("uf-tab-scripts");
    if(!tab || !sec) return;
    document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
    document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
    tab.classList.add("on");
    sec.classList.add("on");
    var scroll = sec.querySelector(".uf-scroll");
    if(scroll) scroll.scrollTop = 0;
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
      em.textContent="No scripts yet."; c.appendChild(em); return;
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
      var dm=document.createElement("div"); dm.className="uf-sdomain"; dm.textContent=s.domain||"(no domain)";
      info.appendChild(nm); info.appendChild(dm);

      // Push status
      var pst=document.createElement("span"); pst.className="uf-push-st";

      cb.onchange=(function(idx,nmEl,pstEl){ return function(){
        var checked=this.checked;
        cb.disabled=true;
        var a=siteLoad(); a[idx].enabled=checked; siteSave(a);
        nmEl.className="uf-sname"+(checked?"":" dim");
        pstEl.textContent="pushing\u2026";
        pushForDomain(a[idx].domain, a, function(ok){
          cb.disabled=false;
          pstEl.textContent=ok?"synced \u2713":"failed";
          pstEl.style.color=ok?"green":"#900";
          updateBar();
        });
      }; })(i,nm,pst);

      // Edit
      var eb=document.createElement("button"); eb.className="uf-btn"; eb.textContent="Edit";
      eb.style.width="50px";
      eb.onclick=(function(sc){ return function(){
        _editingName=sc.name;
        document.getElementById("uf-nameF").value=sc.name;
        document.getElementById("uf-domF").value=sc.domain||"";
        document.getElementById("uf-codeF").value=sc.code;
        document.getElementById("uf-saveBtn").textContent="Update";
        document.getElementById("uf-cancelEdit").style.display="";
        document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
        document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
        document.querySelector("[data-tab='scripts']").classList.add("on");
        document.getElementById("uf-tab-scripts").classList.add("on");
        document.getElementById("uf-tab-scripts").querySelector(".uf-scroll").scrollTop=0;
        document.getElementById("uf-nameF").focus();
      }; })(s);

      // Delete — optimistic: remove locally immediately, push in background
      var db=document.createElement("button"); db.className="uf-btn danger"; db.textContent="Delete";
      db.style.cssText="width:50px;text-align:center";
      db.onclick=(function(idx,name,domain){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a=siteLoad(); a.splice(idx,1); siteSave(a);
        renderScripts(); updateBar();
        pushForDomain(domain, a, function(ok){
          if(!ok) setSt("Deleted locally; remote push failed","#900");
        });
      }; })(i,s.name,s.domain);

      row.appendChild(lbl); row.appendChild(info); row.appendChild(pst); row.appendChild(eb); row.appendChild(db);
      c.appendChild(row);
    });
  }

  function wireSettings(){
    var domF=document.getElementById("uf-domF");
    if(_referrer) domF.value=_referrer;

    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click",function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
        document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
        tab.classList.add("on");
        var sec=document.getElementById("uf-tab-"+tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    document.getElementById("uf-cancelEdit").addEventListener("click",function(){
      _editingName=null;
      document.getElementById("uf-nameF").value="My Script";
      document.getElementById("uf-domF").value=_referrer||"";
      document.getElementById("uf-codeF").value="";
      document.getElementById("uf-saveBtn").textContent="Save Script";
      document.getElementById("uf-cancelEdit").style.display="none";
      setSt("","");
    });

    document.getElementById("uf-saveBtn").addEventListener("click",function(){
      var name=(document.getElementById("uf-nameF").value.trim())||"My Script";
      var domain=document.getElementById("uf-domF").value.trim();
      var code=document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Code is required.","#900"); return; }

      var arr=siteLoad(), idx=-1;
      if(_editingName) arr.forEach(function(s,i){ if(s.name===_editingName) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      var candidate=arr.slice();
      if(idx>=0) candidate[idx]=entry; else candidate.push(entry);

      var saveBtn=document.getElementById("uf-saveBtn");
      saveBtn.disabled=true;

      function commit(){
        siteSave(candidate);
        _editingName=null;
        saveBtn.textContent="Save Script";
        saveBtn.disabled=false;
        document.getElementById("uf-cancelEdit").style.display="none";
        document.getElementById("uf-nameF").value="My Script";
        document.getElementById("uf-codeF").value="";
        document.getElementById("uf-domF").value=_referrer||"";
        renderScripts(); updateBar();
      }

      if(!domain){
        // Nothing to verify against — safe to save locally right away
        commit();
        return;
      }

      // Don't persist until the push to the target site actually succeeds.
      // If the site blocks script execution (CSP) or can't be reached, the
      // script never gets committed — so it never shows as "saved" when it
      // wouldn't actually run.
      setSt("Verifying "+domain+"\u2026","#777");
      pushForDomain(domain, candidate, function(ok){
        saveBtn.disabled=false;
        if(ok) commit();
        // On failure, pushForDomain already shows a persistent error message
        // and switches to the Scripts tab. Form stays filled so nothing is lost.
      });
    });

    document.getElementById("uf-update").addEventListener("click",function(){
      var sites=getSites(), scripts=siteLoad();
      if(!sites.length){ setSt("No tracked sites.","#777"); return; }
      var rem=sites.length, failed=0;
      setSt("Updating "+rem+" site(s)\u2026","#777");
      sites.forEach(function(origin){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
        pushToSite(origin,toSend,function(err){
          rem--; if(err) failed++;
          if(rem<=0){
            if(failed===0) setSt("All updated \u2713","green");
            else setSt(failed+" failed","#900");
          }
        });
      });
    });

    renderScripts(); updateBar();
  }

  // ── pushForDomain ─────────────────────────────────────────────────
  function pushForDomain(domain, arr, cb){
    if(!domain){
      setSt("Saved (no domain \u2014 not pushed)","#777");
      if(cb) cb(false); return;
    }
    var raw=stripWww(stripProtocol(domain.split(",")[0].trim().replace(/^\*\./,"")));
    var sl=raw.indexOf("/"); if(sl!==-1) raw=raw.slice(0,sl);
    if(!raw){ setSt("Saved","#777"); if(cb) cb(false); return; }

    // Find tracked origins matching this domain (www-insensitive)
    var known=getSites().filter(function(o){
      try{ return stripWww(new URL(o).hostname)===raw; }catch(e){ return false; }
    });
    // First time: open one tab without www — window.name survives any redirect
    var origins=known.length ? known : ["https://"+raw];

    var rem=origins.length, failed=0, anyOk=false, errMsgs=[];
    setSt("Pushing to "+raw+"\u2026","#777");
    origins.forEach(function(origin){
      var toSend=arr.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
      pushToSite(origin, toSend, function(err){
        rem--;
        if(err){ failed++; errMsgs.push(err); }
        else{ anyOk=true; addSite(origin); updateBar(); }
        if(rem<=0){
          if(anyOk){
            setSt("Saved \u2713","green");
          } else {
            // Clear, persistent failure message — doesn't auto-clear like normal status
            var reason = errMsgs[0]||"unknown error";
            var human = reason.indexOf("CSP")!==-1
              ? raw+" blocks script execution \u2014 this won't run there"
              : reason==="timeout"
                ? "Could not reach "+raw+" (timed out)"
                : reason==="blocked"
                  ? "Popup blocked \u2014 allow popups for google.com"
                  : "Failed to save to "+raw;
            setStPersist("\u2717 Not saved: "+human,"#cc0000");
            focusScriptsTab();
          }
          if(cb) cb(anyOk);
        }
      });
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if(IS_SETTINGS){
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded",bootSettingsPage);
    else bootSettingsPage();
  } else {
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded",runSiteScripts);
    else runSiteScripts();
  }

  // ── Global shortcuts ──────────────────────────────────────────────
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
