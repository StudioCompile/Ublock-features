/// uFeatures.js
// Inject on every site via a userscript manager (Violentmonkey / Tampermonkey).
// @run-at document-start
//
// HOW IT WORKS:
//   1. Visit google.com/ufeatures  →  page is taken over, shows the full settings UI.
//   2. Scripts are saved in google.com localStorage (the master list).
//   3. When you save/edit/delete/toggle a script, it opens a bridge TAB for the
//      target site, strips the page completely, saves to that site's localStorage, then closes.
//   4. On every other page load, uFeatures reads THAT site's localStorage and runs matching scripts.
//   5. Ctrl+`  →  opens google.com/ufeatures settings in a new tab.
//   6. Ctrl+Shift+I  →  Chii remote debugger.

!function(){

  var SITE_KEY  = "__uFeaturesScripts";
  var SITES_KEY = "__uFeaturesSites";
  var chiiState = 0;
  var _referrer = document.referrer ? new URL(document.referrer).hostname : "";
  var _editingName = null;

  var IS_SETTINGS = (
    (location.hostname === "www.google.com" || location.hostname === "google.com") &&
    location.pathname === "/ufeatures"
  );

  // ── Storage (per-site) ────────────────────────────────────────────
  function siteLoad(){
    try{ return JSON.parse(localStorage.getItem(SITE_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function siteSave(arr){
    localStorage.setItem(SITE_KEY, JSON.stringify(arr));
  }

  // ── Known-sites list (google.com only) ───────────────────────────
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

  // ── Bridge: push scripts into another site's localStorage ─────────
  // Uses a stable window name per origin so the browser reuses an existing tab.
  // The bridge tab strips the page entirely and saves, then closes.
  function originToWinName(origin){
    return "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");
  }

  function pushToSite(origin, scripts, onDone, onFail){
    var winName = originToWinName(origin);
    // Open as a full tab (no size/position params). Stable name reuses existing tab.
    var win = window.open(origin + "/?__ufb=1", winName);
    if(!win){
      if(onFail) onFail("popup blocked — allow popups for this site");
      return;
    }

    var done = false, attempts = 0;
    // Poll with postMessage("*") so redirects to www. or other subdomains still work
    var poll = setInterval(function(){
      if(done || attempts > 150){ // 15s timeout
        clearInterval(poll);
        if(!done){
          try{ win.close(); }catch(e){}
          if(onFail) onFail("timed out — tab may have been blocked or redirected away");
        }
        return;
      }
      try{ win.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts }, "*"); }
      catch(e){}
      attempts++;
    }, 100);

    var handler = function(e){
      if(e.source !== win || !e.data || e.data.type !== "uf_bridge_ack") return;
      done = true;
      clearInterval(poll);
      window.removeEventListener("message", handler);
      if(e.data.error){
        try{ win.close(); }catch(ex){}
        if(onFail) onFail(e.data.error);
        return;
      }
      // Give the tab a moment to show "Saved ✓" then close
      setTimeout(function(){ try{ win.close(); }catch(ex){} }, 900);
      if(onDone) onDone();
    };
    window.addEventListener("message", handler);
  }

  // ── Bridge listener (runs on every page, handles incoming pushes) ─
  // Also survives after document.open() because window object persists.
  if(!window.__ufBridgeListenerAdded){
    window.__ufBridgeListenerAdded = true;
    window.addEventListener("message", function(e){
      var d = e.data; if(!d) return;
      if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
        try{
          localStorage.setItem(d.key, JSON.stringify(d.scripts));
          e.source.postMessage({ type:"uf_bridge_ack" }, "*");
          var st = document.getElementById("__uf_bridge_st");
          if(st) st.textContent = "Saved \u2713";
        }catch(ex){
          try{ e.source.postMessage({ type:"uf_bridge_ack", error: String(ex) }, "*"); }catch(e2){}
        }
      }
    });
  }

  // ── Bridge page takeover ──────────────────────────────────────────
  // Fires as early as possible. Detects bridge via query param OR window.name
  // (window.name survives cross-origin redirects, so even if the site redirects
  // from example.com → www.example.com the takeover still fires on the final page).
  (function(){
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(!isBridge || IS_SETTINGS) return;

    function takeover(){
      try{
        // document.open() replaces the entire document, stopping all site JS & redirects.
        // The inline <script> re-registers the message listener in the new document context
        // as a backup (window listeners from the userscript context survive, but belt+suspenders).
        document.open();
        document.write(
          '<!DOCTYPE html><html><head>'
          + '<meta charset="utf-8">'
          + '<title>Saving data\u2026</title>'
          + '<style>'
          + '*{margin:0;padding:0;box-sizing:border-box}'
          + 'html,body{height:100%;background:#1c1b22;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;color:#c8c8cc;display:flex;align-items:center;justify-content:center}'
          + '#s{text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}'
          + '#msg{font-size:15px;letter-spacing:.01em}'
          + '.ring{width:28px;height:28px;border:3px solid #333;border-top-color:#7f0000;border-radius:50%;animation:spin .8s linear infinite}'
          + '@keyframes spin{to{transform:rotate(360deg)}}'
          + '</style>'
          + '</head><body>'
          + '<div id="s"><div class="ring"></div><span id="__uf_bridge_st" id="msg">Saving data\u2026</span></div>'
          // Inline listener — backup in case window listeners from userscript context are gone
          + '<script>'
          + '(function(){'
          + 'if(window.__ufBridgeInlineAdded)return;window.__ufBridgeInlineAdded=true;'
          + 'var KEY="__uFeaturesScripts";'
          + 'window.addEventListener("message",function(e){'
          +   'var d=e.data;if(!d||d.type!=="uf_bridge_set"||!d.key||!Array.isArray(d.scripts))return;'
          +   'try{'
          +     'localStorage.setItem(d.key,JSON.stringify(d.scripts));'
          +     'e.source.postMessage({type:"uf_bridge_ack"},"*");'
          +     'var el=document.getElementById("__uf_bridge_st");if(el){el.textContent="Saved \u2713";el.style.color="#3fc33f";}'
          +     'var r=document.querySelector(".ring");if(r){r.style.borderTopColor="#3fc33f";}'
          +   '}catch(ex){'
          +     'try{e.source.postMessage({type:"uf_bridge_ack",error:String(ex)},"*");}catch(e2){}'
          +     'var el=document.getElementById("__uf_bridge_st");if(el){el.textContent="Error: "+ex;el.style.color="#cc0000";}'
          +   '}'
          + '});'
          + '})()'
          + '<\/script>'
          + '</body></html>'
        );
        document.close();
      }catch(ex){}
    }

    // Fire immediately — @run-at document-start means we're here before site JS
    takeover();
  })();

  // ── Securly blocker ───────────────────────────────────────────────
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

  // ── Domain matching ───────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return false;
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

  // ── Run stored scripts on this page ──────────────────────────────
  function runSiteScripts(){
    if(IS_SETTINGS) return;
    siteLoad().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); }
        catch(e){ console.warn("[uFeatures]", s.name, e); }
      }
    });
  }

  // ── Bookmarklet runner ────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }
    catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Chii debugger ─────────────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe")).filter(function(f){
      try{
        var src = HTMLElement.prototype.getAttribute.call(f,"src") || "";
        return src.indexOf("chii.liriliri.io") !== -1;
      }catch(e){ return false; }
    })[0];
  }

  function showChii(){
    var f = getChiiFrame(); if(!f) return;
    var w = f.parentNode;
    var h = Math.floor(Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight / 2) || 280);
    w.style.cssText = "position:fixed!important;bottom:0!important;left:0!important;width:100%!important;height:"+h+"px!important;z-index:2147483640!important;background:#282828!important;display:block!important;pointer-events:auto!important;";
    f.style.cssText = "width:100%!important;height:100%!important;border:none!important;background:#282828!important;display:block!important;opacity:1!important;";
    document.body.style.marginBottom = h + "px";
  }

  function hideChii(){
    var f = getChiiFrame(); if(!f) return;
    f.parentNode.style.display = "none";
    document.body.style.marginBottom = "";
  }

  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var w = f.parentNode;
    if(window.getComputedStyle(w).display === "none") showChii();
    else hideChii();
  }

  function injectChii(){
    if(chiiState === 1) return;
    if(chiiState === 2){ toggleChii(); return; }
    chiiState = 1;

    var ph = document.createElement("div"); ph.id = "__uf_chii_ph";
    ph.style.cssText = "position:fixed;bottom:0;left:0;width:100%;height:50%;background:#282828;z-index:2147483640;display:flex;align-items:center;justify-content:center;";
    ph.innerHTML = '<span style="color:#555;font-family:monospace;font-size:13px;">Loading Chii\u2026</span>';
    document.body.appendChild(ph);

    var s = document.createElement("script");
    // Use prototype methods to bypass any site overrides
    HTMLElement.prototype.setAttribute.call(s, "embedded", "true");
    HTMLElement.prototype.setAttribute.call(s, "src", "https://chii.liriliri.io/target.js");

    s.addEventListener("load", function(){
      var n = 0, poll = setInterval(function(){
        var f = getChiiFrame();
        if(f){
          clearInterval(poll);
          chiiState = 2;
          var p = document.getElementById("__uf_chii_ph"); if(p) p.remove();
          showChii();
        }
        if(++n > 60){ // 6s timeout
          clearInterval(poll);
          chiiState = 0;
          var p = document.getElementById("__uf_chii_ph"); if(p) p.remove();
          console.warn("[uFeatures] Chii failed to load");
        }
      }, 100);
    });

    s.addEventListener("error", function(){
      chiiState = 0;
      var p = document.getElementById("__uf_chii_ph"); if(p) p.remove();
      console.warn("[uFeatures] Chii script failed to load");
    });

    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS PAGE  ─  google.com/ufeatures
  // ════════════════════════════════════════════════════════════════════

  function bootSettingsPage(){
    document.title = "uFeatures";
    while(document.documentElement.firstChild)
      document.documentElement.removeChild(document.documentElement.firstChild);

    var head = document.createElement("head");
    ["utf-8"].forEach(function(c){
      var m = document.createElement("meta"); m.setAttribute("charset", c); head.appendChild(m);
    });
    var vp = document.createElement("meta"); vp.name = "viewport"; vp.content = "width=device-width,initial-scale=1"; head.appendChild(vp);
    var ti = document.createElement("title"); ti.textContent = "uFeatures"; head.appendChild(ti);
    var fav = document.createElement("link"); fav.rel = "icon"; fav.type = "image/png";
    fav.href = "https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png";
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
      // Body
      "#uf-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}",
      ".uf-scroll{flex:1;overflow-y:auto;padding:22px 28px 48px;scrollbar-width:thin;scrollbar-color:#c8c8cc transparent}",
      ".uf-sec{display:none}.uf-sec.on{display:flex;flex-direction:column;flex:1;min-height:0}",
      // Status bar
      "#uf-bar{height:22px;background:#e0e0e4;display:flex;align-items:center;padding:0 12px;gap:20px;flex-shrink:0}",
      "#uf-bar span{font-size:11px;color:#6f6e77}",
      "#uf-bar b{color:#1c1b22;font-weight:400}",
      "#uf-barst{margin-left:auto;font-size:11px}",
      // Buttons
      ".uf-btn{padding:5px 14px;border-radius:3px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #c8c8cc;background:#fff;color:#1c1b22;transition:background .1s,border-color .1s}",
      ".uf-btn:hover{background:#f0f0f4;border-color:#adadb1}",
      ".uf-btn:disabled{opacity:.45;cursor:default;pointer-events:none}",
      ".uf-btn.prim{background:#7f0000;border-color:#7f0000;color:#fff}.uf-btn.prim:hover{background:#6a0000;border-color:#6a0000}",
      ".uf-btn.edit-mode{background:#0057a8;border-color:#0057a8;color:#fff}.uf-btn.edit-mode:hover{background:#004590;border-color:#004590}",
      ".uf-btn.danger{color:#cc0000;border-color:#c8c8cc;background:#fff}.uf-btn.danger:hover{background:#fff0f0;border-color:#cc0000}",
      // Section header
      ".uf-sh{font-size:11px;font-weight:600;color:#6f6e77;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #c8c8cc}",
      // Card
      ".uf-card{background:#fff;border:1px solid #c8c8cc;border-radius:4px;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}",
      ".uf-fa{padding:14px 16px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #e0e0e4}",
      ".uf-g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
      ".uf-lbl{font-size:11px;color:#6f6e77;margin-bottom:3px}",
      "input.uf-in{border:1px solid #c8c8cc;border-radius:3px;padding:6px 9px;font-family:inherit;font-size:13px;outline:none;color:#1c1b22;background:#fff;width:100%;transition:border-color .12s}",
      "input.uf-in:focus{border-color:#7f0000;box-shadow:0 0 0 1px rgba(127,0,0,.2)}",
      "textarea.uf-ta{border:1px solid #c8c8cc;border-radius:3px;padding:7px 9px;font-family:Consolas,Menlo,monospace;font-size:12px;outline:none;color:#1c1b22;background:#fff;width:100%;resize:vertical;line-height:1.55;min-height:140px;transition:border-color .12s}",
      "textarea.uf-ta:focus{border-color:#7f0000;box-shadow:0 0 0 1px rgba(127,0,0,.2)}",
      ".uf-ff{display:flex;gap:8px;align-items:center}",
      "#uf-st{flex:1;font-size:11px}",
      // Edit mode banner
      "#uf-edit-banner{display:none;background:#fff8e1;border:1px solid #ffc107;border-radius:3px;padding:7px 12px;margin-bottom:12px;font-size:12px;color:#795800;align-items:center;gap:8px}",
      "#uf-edit-banner.on{display:flex}",
      "#uf-edit-banner b{font-weight:600}",
      "#uf-cancel-edit{margin-left:auto;background:none;border:none;font-size:11px;color:#7f0000;cursor:pointer;padding:0;font-family:inherit;text-decoration:underline}",
      "#uf-cancel-edit:hover{color:#6a0000}",
      // Script list
      ".uf-srow{display:grid;grid-template-columns:18px 1fr auto auto;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #e0e0e4}",
      ".uf-srow:last-child{border-bottom:none}",
      ".uf-srow:hover{background:#f9f9fb}",
      ".uf-sinfo{min-width:0}",
      ".uf-sname{font-size:13px;color:#1c1b22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".uf-sname.dim{color:#adadb1}",
      ".uf-sdomain{font-size:11px;color:#6f6e77}",
      ".uf-empty{padding:28px;text-align:center;color:#adadb1}",
      // Checkbox
      ".uf-cb{position:relative;width:16px;height:16px;flex-shrink:0;cursor:pointer}",
      ".uf-cb input{opacity:0;position:absolute;width:0;height:0}",
      ".uf-cb .box{position:absolute;inset:0;border:1px solid #adadb1;border-radius:2px;background:#fff;transition:background .12s,border-color .12s}",
      ".uf-cb input:checked+.box{background:#7f0000;border-color:#7f0000}",
      ".uf-cb input:checked+.box::after{content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}",
      // Keys tab
      ".uf-krow{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #e0e0e4}",
      ".uf-krow:last-child{border-bottom:none}",
      ".uf-kbd{background:#f0f0f4;border:1px solid #c8c8cc;border-radius:3px;padding:3px 10px;font-family:monospace;font-size:12px;color:#1c1b22;min-width:180px;text-align:center}",
      ".uf-kdesc{font-size:12px;color:#6f6e77}",
      "code.uf-c{background:#f0f0f4;padding:1px 4px;border-radius:2px;font-family:monospace;font-size:11px;color:#1c1b22}",
      // Home
      ".uf-home-hero{display:flex;align-items:center;gap:16px;padding:24px 0 20px}",
      ".uf-home-hero h1{font-size:22px;font-weight:300;color:#1c1b22;letter-spacing:-.3px}",
      ".uf-home-hero h1 b{font-weight:700;color:#7f0000}",
      ".uf-home-credit{font-size:11px;color:#adadb1;margin-top:2px}",
      ".uf-home-credit a{color:#7f0000;text-decoration:none}.uf-home-credit a:hover{text-decoration:underline}",
      ".uf-feat-list{margin-top:6px;display:flex;flex-direction:column;gap:7px}",
      ".uf-feat-row{font-size:13px;color:#1c1b22;line-height:1.6}",
      ".uf-feat-row b{color:#7f0000;font-weight:600}",
      ".uf-feat-row .desc{color:#6f6e77;font-size:12px}"
    ].join("\n");
  }

  function settingsHTML(){
    var iconUrl = "https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png";
    return (
      '<div id="uf-wrap">'
      // ── Top bar
      + '<div id="uf-top">'
        + '<div class="uf-logo"><img src="'+iconUrl+'" width="20" height="20" style="object-fit:contain"> uFeatures</div>'
        + '<div class="uf-tabs">'
          + '<div class="uf-tab on" data-tab="home">Home</div>'
          + '<div class="uf-tab" data-tab="scripts">My Scripts</div>'
          + '<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        + '</div>'
        + '<div class="uf-top-actions">'
          + '<button class="uf-btn" id="uf-update">&#8635; Update all sites</button>'
        + '</div>'
      + '</div>'

      // ── Body
      + '<div id="uf-body">'

        // HOME TAB
        + '<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          + '<div class="uf-home-hero">'
            + '<img src="'+iconUrl+'" width="48" height="48" style="object-fit:contain;flex-shrink:0">'
            + '<div>'
              + '<h1>u<b>Features</b></h1>'
              + '<div class="uf-home-credit">By StudioCompile &mdash; Roblox: studiocompile &middot; Discord: @roblox_studio</div>'
            + '</div>'
          + '</div>'
          + '<div class="uf-sh">Features</div>'
          + '<div class="uf-feat-list">'
            + '<div class="uf-feat-row"><b>Script Manager</b> &mdash; <span class="desc">Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete from My Scripts.</span></div>'
            + '<div class="uf-feat-row"><b>Script Sync</b> &mdash; <span class="desc">Scripts are stored on google.com and pushed to target sites via a bridge tab that strips itself and saves silently.</span></div>'
            + '<div class="uf-feat-row"><b>Securly Blocker</b> &mdash; <span class="desc">Removes Securly overlay elements on every page load using a MutationObserver that catches re-injections immediately.</span></div>'
            + '<div class="uf-feat-row"><b>Chii Debugger</b> &mdash; <span class="desc">Injects the Chii remote DevTools panel into any page. Press Ctrl+Shift+I to toggle it on or off.</span></div>'
            + '<div class="uf-feat-row"><b>Bookmarklet Runner</b> &mdash; <span class="desc">Copy any javascript: URL, then press Ctrl+V outside a text field to run it immediately on the current page.</span></div>'
          + '</div>'
        + '</div></div>'

        // SCRIPTS TAB
        + '<div class="uf-sec" id="uf-tab-scripts"><div class="uf-scroll">'
          // Edit mode banner
          + '<div id="uf-edit-banner"><span>&#9998;&nbsp; Editing script: <b id="uf-editing-label"></b></span><button id="uf-cancel-edit">Cancel edit</button></div>'
          + '<div class="uf-sh">Add / Edit Script</div>'
          + '<div class="uf-card"><div class="uf-fa">'
            + '<div class="uf-g2">'
              + '<div><div class="uf-lbl">Script name</div><input id="uf-nameF" class="uf-in" type="text" value="Example Script"></div>'
              + '<div><div class="uf-lbl">Target domain</div><input id="uf-domF" class="uf-in" type="text" placeholder="example.com or *.example.com/path"></div>'
            + '</div>'
            + '<div><div class="uf-lbl">JavaScript</div><textarea id="uf-codeF" class="uf-ta" placeholder="// Your script here..."></textarea></div>'
          + '</div>'
          + '<div class="uf-ff" style="padding:10px 16px;background:#f0f0f4;border-top:1px solid #c8c8cc">'
            + '<span id="uf-st"></span>'
            + '<button class="uf-btn prim" id="uf-saveBtn">Save script</button>'
          + '</div></div>'
          + '<div class="uf-sh" style="margin-top:20px">Saved Scripts</div>'
          + '<div class="uf-card" id="uf-slist"></div>'
        + '</div></div>'

        // KEYS TAB
        + '<div class="uf-sec" id="uf-tab-keys"><div class="uf-scroll">'
          + '<div class="uf-sh">Keyboard Shortcuts</div>'
          + '<div class="uf-card">'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + `</span><span class="uf-kdesc">Open uFeatures settings in a new tab</span></div>'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Toggle Chii remote debugger on any page</span></div>'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>'
          + '</div>'
        + '</div></div>'

      + '</div>'

      // Status bar
      + '<div id="uf-bar">'
        + '<span>uFeatures &mdash; storage: <b>google.com</b></span>'
        + '<span id="uf-cnt-s">0 scripts</span>'
        + '<span id="uf-cnt-si">0 sites</span>'
        + '<span id="uf-barst"></span>'
      + '</div>'
    + '</div>'
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function setSt(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el = document.getElementById(id); if(!el) return;
      el.textContent = msg; el.style.color = color || "#8f8f9d";
    });
    if(msg) setTimeout(function(){
      ["uf-st","uf-barst"].forEach(function(id){
        var el = document.getElementById(id);
        if(el && el.textContent === msg){ el.textContent = ""; }
      });
    }, 4000);
  }

  function updateBar(){
    var s = siteLoad(), si = getSites();
    var cs = document.getElementById("uf-cnt-s"), csi = document.getElementById("uf-cnt-si");
    if(cs) cs.textContent = s.length + " script" + (s.length !== 1 ? "s" : "");
    if(csi) csi.textContent = si.length + " site" + (si.length !== 1 ? "s" : "");
  }

  function setEditMode(name){
    _editingName = name || null;
    var banner = document.getElementById("uf-edit-banner");
    var label  = document.getElementById("uf-editing-label");
    var btn    = document.getElementById("uf-saveBtn");
    if(!banner || !btn) return;
    if(_editingName){
      banner.classList.add("on");
      if(label) label.textContent = _editingName;
      btn.textContent = "Update script";
      btn.className = "uf-btn edit-mode";
    } else {
      banner.classList.remove("on");
      btn.textContent = "Save script";
      btn.className = "uf-btn prim";
    }
  }

  function cancelEdit(){
    setEditMode(null);
    document.getElementById("uf-nameF").value = "Example Script";
    document.getElementById("uf-domF").value = _referrer || "";
    document.getElementById("uf-codeF").value = "";
  }

  function renderScripts(){
    var c = document.getElementById("uf-slist"); if(!c) return;
    while(c.firstChild) c.removeChild(c.firstChild);
    var arr = siteLoad();
    if(!arr.length){
      var em = document.createElement("div"); em.className = "uf-empty";
      em.textContent = "No scripts yet — add one above."; c.appendChild(em); return;
    }
    arr.forEach(function(s, i){
      var row = document.createElement("div"); row.className = "uf-srow";

      var lbl = document.createElement("label"); lbl.className = "uf-cb";
      var cb  = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!s.enabled;
      var box = document.createElement("span"); box.className = "box";
      lbl.appendChild(cb); lbl.appendChild(box);

      var info = document.createElement("div"); info.className = "uf-sinfo";
      var nm   = document.createElement("div"); nm.className = "uf-sname" + (s.enabled ? "" : " dim"); nm.textContent = s.name;
      var dm   = document.createElement("div"); dm.className = "uf-sdomain"; dm.textContent = s.domain || "all sites";
      info.appendChild(nm); info.appendChild(dm);

      cb.onchange = (function(idx, nmEl){ return function(){
        var a = siteLoad(); a[idx].enabled = this.checked; siteSave(a);
        nmEl.className = "uf-sname" + (this.checked ? "" : " dim"); updateBar();
        pushForDomain(a[idx].domain, a);
      }; })(i, nm);

      var eb = document.createElement("button"); eb.className = "uf-btn"; eb.textContent = "Edit";
      eb.onclick = (function(sc){ return function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        document.querySelector("[data-tab='scripts']").classList.add("on");
        document.getElementById("uf-tab-scripts").classList.add("on");
        document.getElementById("uf-nameF").value = sc.name;
        document.getElementById("uf-domF").value  = sc.domain || "";
        document.getElementById("uf-codeF").value = sc.code;
        setEditMode(sc.name);
        document.getElementById("uf-nameF").focus();
      }; })(s);

      var db = document.createElement("button"); db.className = "uf-btn danger"; db.textContent = "Delete";
      db.onclick = (function(idx, name, domain){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a = siteLoad(); a.splice(idx, 1); siteSave(a);
        if(_editingName === name) cancelEdit();
        renderScripts(); updateBar();
        pushForDomain(domain, a);
      }; })(i, s.name, s.domain);

      row.appendChild(lbl); row.appendChild(info); row.appendChild(eb); row.appendChild(db);
      c.appendChild(row);
    });
  }

  // ── Wire the settings page ────────────────────────────────────────
  function wireSettings(){
    var domF = document.getElementById("uf-domF");
    if(_referrer) domF.value = _referrer;

    // Tabs
    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        tab.classList.add("on");
        var sec = document.getElementById("uf-tab-" + tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    // Cancel edit
    document.getElementById("uf-cancel-edit").addEventListener("click", cancelEdit);

    // Save / Update script
    document.getElementById("uf-saveBtn").addEventListener("click", function(){
      var name   = (document.getElementById("uf-nameF").value.trim()) || "Example Script";
      var domain = document.getElementById("uf-domF").value.trim();
      var code   = document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Code is required.", "#cc0000"); return; }

      var arr = siteLoad(), idx = -1;
      arr.forEach(function(s, i){ if(s.name === (_editingName || name)) idx = i; });
      var entry = { name:name, domain:domain, code:code, enabled:true };
      if(idx >= 0) arr[idx] = entry; else arr.push(entry);
      siteSave(arr);
      setEditMode(null);
      renderScripts(); updateBar();
      pushForDomain(domain, arr);
      document.getElementById("uf-nameF").value = "Example Script";
      document.getElementById("uf-codeF").value = "";
    });

    // Update all sites
    document.getElementById("uf-update").addEventListener("click", function(){
      var sites = getSites(), scripts = siteLoad();
      if(!sites.length){ setSt("No tracked sites.", "#6f6e77"); return; }
      var rem = sites.length, errs = 0;
      setSt("Updating " + rem + " site(s)\u2026", "#6f6e77");
      sites.forEach(function(origin){
        var toSend = scripts.filter(function(s){ return !s.domain || domainMatchesOrigin(s.domain, origin); });
        pushToSite(origin, toSend,
          function(){ rem--; if(rem <= 0) setSt(errs ? errs+" site(s) failed" : "All sites updated \u2713", errs ? "#cc0000" : "green"); },
          function(err){ rem--; errs++; setSt("Error on "+origin+": "+err, "#cc0000"); }
        );
      });
    });

    renderScripts(); updateBar();
  }

  // ── Push helper ───────────────────────────────────────────────────
  // Derives the origin from the domain string, checks known sites first,
  // opens the bridge tab, and only records the site on success.
  function pushForDomain(domain, arr){
    if(!domain){ setSt("Saved (no domain — scripts won\u2019t sync).", "#6f6e77"); return; }
    // Strip wildcard prefix and path
    var rawDomain = domain.split(",")[0].trim().replace(/^\*\./, "");
    var slash = rawDomain.indexOf("/"); if(slash !== -1) rawDomain = rawDomain.slice(0, slash);
    if(!rawDomain){ setSt("Saved.", "#6f6e77"); return; }

    // Prefer already-known origins that match, otherwise assume https://
    var known   = getSites().filter(function(o){ return o.indexOf(rawDomain) !== -1; });
    var origins = known.length ? known : ["https://" + rawDomain];
    var rem = origins.length, errs = 0;
    setSt("Saving & pushing to " + origins.length + " site(s)\u2026", "#6f6e77");

    origins.forEach(function(origin){
      var toSend = arr.filter(function(s){ return !s.domain || domainMatchesOrigin(s.domain, origin); });
      pushToSite(origin, toSend,
        function(){
          // Only record the site once we confirm it received the data
          addSite(origin);
          updateBar();
          rem--;
          if(rem <= 0) setSt(errs ? errs+" site(s) failed to sync" : "Saved & synced \u2713", errs ? "#cc0000" : "green");
        },
        function(err){
          rem--; errs++;
          setSt("Sync failed for "+origin+": "+err, "#cc0000");
        }
      );
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────
  if(IS_SETTINGS){
    if(document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", bootSettingsPage);
    else
      bootSettingsPage();
  } else {
    if(document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", runSiteScripts);
    else
      runSiteScripts();
  }

  // ── Global keyboard shortcuts ─────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement || {}).tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
              || (document.activeElement || {}).isContentEditable;

    // Ctrl+Shift+I → Chii
    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key === "I"){
      if(typing) return;
      e.preventDefault();
      injectChii();
      return;
    }

    // Ctrl+` → open settings
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "Backquote"){
      e.preventDefault();
      if(!IS_SETTINGS) window.open("https://www.google.com/ufeatures", "_blank");
      return;
    }

    // Ctrl+V → run bookmarklet from clipboard (outside text fields)
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(/^javascript:/i.test(text.trim())){ runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
