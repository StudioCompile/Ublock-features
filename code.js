/// uFeatures.js
// Inject on every site via a userscript manager (Violentmonkey / Tampermonkey).
// @run-at document-start

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

  // ── Storage ───────────────────────────────────────────────────────
  function siteLoad(){
    try{ return JSON.parse(localStorage.getItem(SITE_KEY)||"[]"); } catch(e){ return []; }
  }
  function siteSave(arr){ localStorage.setItem(SITE_KEY, JSON.stringify(arr)); }

  function getSites(){
    try{ return JSON.parse(localStorage.getItem(SITES_KEY)||"[]"); } catch(e){ return []; }
  }
  function addSite(origin){
    var list = getSites();
    if(list.indexOf(origin) === -1){ list.push(origin); localStorage.setItem(SITES_KEY, JSON.stringify(list)); }
  }
  function removeSite(origin){
    localStorage.setItem(SITES_KEY, JSON.stringify(getSites().filter(function(s){ return s !== origin; })));
  }

  // ── Bridge ────────────────────────────────────────────────────────
  function originToWinName(origin){
    return "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");
  }

  function pushToSite(origin, scripts, onDone, onFail){
    var winName = originToWinName(origin);
    var win = window.open(origin + "/?__ufb=1", winName);
    if(!win){
      if(onFail) onFail("popups are blocked — please allow popups for this site");
      return;
    }
    var done = false, attempts = 0;
    var poll = setInterval(function(){
      if(done || attempts > 150){
        clearInterval(poll);
        if(!done){ try{ win.close(); }catch(e){} if(onFail) onFail("timed out"); }
        return;
      }
      try{ win.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts }, "*"); } catch(e){}
      attempts++;
    }, 100);
    var handler = function(e){
      if(e.source !== win || !e.data || e.data.type !== "uf_bridge_ack") return;
      done = true; clearInterval(poll); window.removeEventListener("message", handler);
      if(e.data.error){ try{ win.close(); }catch(ex){} if(onFail) onFail(e.data.error); return; }
      setTimeout(function(){ try{ win.close(); }catch(ex){} }, 900);
      if(onDone) onDone();
    };
    window.addEventListener("message", handler);
  }

  // ── Bridge listener ───────────────────────────────────────────────
  if(!window.__ufBridgeListenerAdded){
    window.__ufBridgeListenerAdded = true;
    window.addEventListener("message", function(e){
      var d = e.data; if(!d) return;
      if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
        try{
          localStorage.setItem(d.key, JSON.stringify(d.scripts));
          e.source.postMessage({ type:"uf_bridge_ack" }, "*");
          var st = document.getElementById("__uf_bridge_st");
          if(st){ st.textContent = "Saved!"; st.style.color = "#1a7f37"; }
          var ic = document.getElementById("__uf_bridge_ic");
          if(ic){ ic.textContent = "\u2713"; ic.style.color = "#1a7f37"; ic.style.animation = "none"; }
        }catch(ex){
          try{ e.source.postMessage({ type:"uf_bridge_ack", error: String(ex) }, "*"); }catch(e2){}
        }
      }
    });
  }

  // ── Bridge page takeover ──────────────────────────────────────────
  (function(){
    var isBridge = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);
    if(!isBridge || IS_SETTINGS) return;

    function takeover(){
      try{
        document.open();
        document.write(
          '<!DOCTYPE html><html><head>'
          + '<meta charset="utf-8"><title>Saving\u2026</title>'
          + '<style>'
          + '*{margin:0;padding:0;box-sizing:border-box}'
          + 'html,body{height:100%;background:#f4f4f6;font-family:"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center}'
          + '#card{background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:36px 48px;display:flex;flex-direction:column;align-items:center;gap:16px;box-shadow:0 4px 20px rgba(0,0,0,.08);text-align:center}'
          + '#__uf_bridge_ic{font-size:32px;display:inline-block;color:#7f0000;animation:spin .9s linear infinite}'
          + '@keyframes spin{to{transform:rotate(360deg)}}'
          + '#__uf_bridge_st{font-size:15px;font-weight:500;color:#52525b}'
          + '.sub{font-size:12px;color:#a1a1aa}'
          + '</style>'
          + '</head><body>'
          + '<div id="card">'
          + '<span id="__uf_bridge_ic">&#10227;</span>'
          + '<span id="__uf_bridge_st">Saving your scripts\u2026</span>'
          + '<span class="sub">This tab will close automatically</span>'
          + '</div>'
          + '<script>'
          + '(function(){'
          + 'if(window.__ufBridgeInlineAdded)return;window.__ufBridgeInlineAdded=true;'
          + 'window.addEventListener("message",function(e){'
          +   'var d=e.data;if(!d||d.type!=="uf_bridge_set"||!d.key||!Array.isArray(d.scripts))return;'
          +   'try{'
          +     'localStorage.setItem(d.key,JSON.stringify(d.scripts));'
          +     'e.source.postMessage({type:"uf_bridge_ack"},"*");'
          +     'var st=document.getElementById("__uf_bridge_st");'
          +     'var ic=document.getElementById("__uf_bridge_ic");'
          +     'if(st){st.textContent="Saved!";st.style.color="#1a7f37";}'
          +     'if(ic){ic.textContent="\u2713";ic.style.color="#1a7f37";ic.style.animation="none";ic.style.fontSize="36px";}'
          +   '}catch(ex){'
          +     'try{e.source.postMessage({type:"uf_bridge_ack",error:String(ex)},"*");}catch(e2){}'
          +     'var st=document.getElementById("__uf_bridge_st");'
          +     'if(st){st.textContent="Something went wrong.";st.style.color="#dc2626";}'
          +   '}'
          + '});'
          + '})()'
          + '<\/script>'
          + '</body></html>'
        );
        document.close();
      }catch(ex){}
    }
    takeover();
  })();

  // ── Securly blocker ───────────────────────────────────────────────
  function killSecurly(){
    var el = document.getElementById("securly_overlay"); if(el) el.remove();
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
      var si = p.indexOf("/"), hp = si === -1 ? p : p.slice(0,si), pp = si === -1 ? "" : p.slice(si);
      var hm = hp.slice(0,2) === "*." ? host === hp.slice(2) || host.endsWith("."+hp.slice(2)) : host === hp;
      if(!hm) return false; if(!pp) return true;
      var norm = pp.endsWith("/") ? pp : pp+"/";
      return path === pp || path.startsWith(norm);
    });
  }

  function domainMatchesOrigin(pattern, origin){
    if(!pattern || !pattern.trim()) return false;
    try{
      var host = new URL(origin).hostname;
      return pattern.trim().split(",").some(function(p){
        p = p.trim(); if(!p) return false;
        var si = p.indexOf("/"), hp = si === -1 ? p : p.slice(0,si);
        return hp.slice(0,2) === "*." ? host === hp.slice(2) || host.endsWith("."+hp.slice(2)) : host === hp;
      });
    }catch(e){ return false; }
  }

  // ── Run scripts ───────────────────────────────────────────────────
  function runSiteScripts(){
    if(IS_SETTINGS) return;
    siteLoad().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); } catch(e){ console.warn("[uFeatures]", s.name, e); }
      }
    });
  }

  // ── Bookmarklet ───────────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); } catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Inspect Element (Chii) ────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe")).filter(function(f){
      try{ return (HTMLElement.prototype.getAttribute.call(f,"src")||"").indexOf("chii.liriliri.io") !== -1; }
      catch(e){ return false; }
    })[0];
  }
  function showChii(){
    var f = getChiiFrame(); if(!f) return;
    var h = Math.floor(Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight/2) || 300);
    f.parentNode.style.cssText = "position:fixed!important;bottom:0!important;left:0!important;width:100%!important;height:"+h+"px!important;z-index:2147483640!important;background:#282828!important;display:block!important;pointer-events:auto!important;";
    f.style.cssText = "width:100%!important;height:100%!important;border:none!important;display:block!important;opacity:1!important;";
    document.body.style.marginBottom = h + "px";
  }
  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var w = f.parentNode;
    if(window.getComputedStyle(w).display === "none"){ showChii(); }
    else{ w.style.display = "none"; document.body.style.marginBottom = ""; }
  }
  function injectChii(){
    if(chiiState === 1) return;
    if(chiiState === 2){ toggleChii(); return; }
    chiiState = 1;
    var ph = document.createElement("div"); ph.id = "__uf_chii_ph";
    ph.style.cssText = "position:fixed;bottom:0;left:0;width:100%;height:50%;background:#282828;z-index:2147483640;display:flex;align-items:center;justify-content:center;";
    ph.innerHTML = '<span style="color:#555;font-family:monospace;font-size:13px;">Loading inspector\u2026</span>';
    document.body.appendChild(ph);
    var s = document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s, "embedded", "true");
    HTMLElement.prototype.setAttribute.call(s, "src", "https://chii.liriliri.io/target.js");
    s.addEventListener("load", function(){
      var n = 0, poll = setInterval(function(){
        var f = getChiiFrame();
        if(f){ clearInterval(poll); chiiState = 2; var p = document.getElementById("__uf_chii_ph"); if(p) p.remove(); showChii(); }
        if(++n > 60){ clearInterval(poll); chiiState = 0; var p = document.getElementById("__uf_chii_ph"); if(p) p.remove(); }
      }, 100);
    });
    s.addEventListener("error", function(){ chiiState = 0; var p = document.getElementById("__uf_chii_ph"); if(p) p.remove(); });
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS PAGE
  // ════════════════════════════════════════════════════════════════════

  var ICON = "https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/ufeatures.png";

  function bootSettingsPage(){
    document.title = "uFeatures";
    while(document.documentElement.firstChild)
      document.documentElement.removeChild(document.documentElement.firstChild);
    var head = document.createElement("head");
    var mc = document.createElement("meta"); mc.setAttribute("charset","utf-8"); head.appendChild(mc);
    var vp = document.createElement("meta"); vp.name="viewport"; vp.content="width=device-width,initial-scale=1"; head.appendChild(vp);
    var ti = document.createElement("title"); ti.textContent="uFeatures"; head.appendChild(ti);
    var fav = document.createElement("link"); fav.rel="icon"; fav.type="image/png"; fav.href=ICON; head.appendChild(fav);
    var style = document.createElement("style"); style.textContent = pageCSS(); head.appendChild(style);
    document.documentElement.appendChild(head);
    var body = document.createElement("body");
    body.innerHTML = pageHTML();
    document.documentElement.appendChild(body);
    wire();
  }

  function pageCSS(){
    return [
      "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
      "html, body { height: 100%; background: #f4f4f6; color: #18181b; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; -webkit-font-smoothing: antialiased; }",

      "#uf-wrap { display: flex; flex-direction: column; height: 100vh; }",

      // Top bar
      "#uf-top { display: flex; align-items: center; background: #fff; border-bottom: 1px solid #e4e4e7; height: 54px; flex-shrink: 0; padding: 0 24px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }",
      ".uf-logo { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #18181b; letter-spacing: -.3px; margin-right: 32px; }",
      ".uf-logo img { border-radius: 6px; }",
      ".uf-tabs { display: flex; align-items: stretch; flex: 1; height: 100%; }",
      ".uf-tab { display: flex; align-items: center; padding: 0 20px; cursor: pointer; font-size: 13.5px; font-weight: 500; color: #71717a; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s, border-color .15s; user-select: none; }",
      ".uf-tab:hover { color: #18181b; }",
      ".uf-tab.on { color: #7f0000; border-bottom-color: #7f0000; }",
      ".uf-top-end { margin-left: auto; display: flex; align-items: center; gap: 8px; }",

      // Body
      "#uf-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }",
      ".uf-scroll { flex: 1; overflow-y: auto; padding: 30px 36px 64px; scrollbar-width: thin; scrollbar-color: #d4d4d8 transparent; max-width: 900px; width: 100%; }",
      ".uf-sec { display: none; align-items: flex-start; } .uf-sec.on { display: flex; flex-direction: column; flex: 1; min-height: 0; align-items: center; }",

      // Status bar
      "#uf-bar { height: 28px; background: #fff; border-top: 1px solid #e4e4e7; display: flex; align-items: center; padding: 0 24px; gap: 28px; flex-shrink: 0; }",
      "#uf-bar span { font-size: 11.5px; color: #a1a1aa; }",
      "#uf-bar b { color: #52525b; font-weight: 600; }",
      "#uf-barst { margin-left: auto; font-size: 12px; font-weight: 500; }",

      // Buttons
      ".uf-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; border: 1px solid #e4e4e7; background: #fff; color: #18181b; transition: background .12s, border-color .12s; line-height: 1.2; white-space: nowrap; }",
      ".uf-btn:hover { background: #f4f4f6; border-color: #d4d4d8; }",
      ".uf-btn:active { transform: scale(.98); }",
      ".uf-btn:disabled { opacity: .4; cursor: default; pointer-events: none; }",
      ".uf-btn.prim { background: #7f0000; border-color: #7f0000; color: #fff; } .uf-btn.prim:hover { background: #6a0000; }",
      ".uf-btn.blue { background: #1d4ed8; border-color: #1d4ed8; color: #fff; } .uf-btn.blue:hover { background: #1e40af; }",
      ".uf-btn.ghost { background: transparent; border-color: transparent; color: #52525b; } .uf-btn.ghost:hover { background: #f4f4f6; border-color: #e4e4e7; color: #18181b; }",
      ".uf-btn.sm { padding: 5px 13px; font-size: 12.5px; border-radius: 7px; }",
      ".uf-btn.danger { color: #dc2626; } .uf-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; }",

      // Section header
      ".uf-sh { font-size: 11px; font-weight: 700; color: #a1a1aa; letter-spacing: .09em; text-transform: uppercase; margin-bottom: 10px; }",

      // Panel/card
      ".uf-panel { background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.05); width: 100%; }",

      // Form
      ".uf-form-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }",
      ".uf-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }",
      ".uf-field label { display: block; font-size: 12px; font-weight: 600; color: #52525b; margin-bottom: 6px; letter-spacing: .01em; }",
      "input.uf-in { width: 100%; border: 1px solid #e4e4e7; border-radius: 8px; padding: 9px 13px; font-family: inherit; font-size: 13.5px; color: #18181b; background: #fafafa; outline: none; transition: border-color .15s, box-shadow .15s, background .15s; }",
      "input.uf-in:focus { border-color: #7f0000; background: #fff; box-shadow: 0 0 0 3px rgba(127,0,0,.1); }",
      "input.uf-in::placeholder { color: #a1a1aa; }",
      "textarea.uf-ta { width: 100%; border: 1px solid #e4e4e7; border-radius: 8px; padding: 11px 13px; font-family: Consolas, 'Courier New', monospace; font-size: 12.5px; color: #18181b; background: #fafafa; outline: none; resize: vertical; line-height: 1.65; min-height: 160px; transition: border-color .15s, box-shadow .15s, background .15s; }",
      "textarea.uf-ta:focus { border-color: #7f0000; background: #fff; box-shadow: 0 0 0 3px rgba(127,0,0,.1); }",
      "textarea.uf-ta::placeholder { color: #a1a1aa; }",
      ".uf-form-footer { display: flex; align-items: center; gap: 10px; padding: 13px 22px; background: #fafafa; border-top: 1px solid #f0f0f0; }",
      "#uf-st { flex: 1; font-size: 12.5px; font-weight: 500; }",

      // Edit banner
      "#uf-edit-banner { display: none; align-items: center; gap: 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 11px 16px; margin-bottom: 18px; font-size: 13px; color: #1e40af; width: 100%; }",
      "#uf-edit-banner.on { display: flex; }",
      "#uf-edit-banner b { font-weight: 600; }",
      "#uf-cancel-btn { margin-left: auto; }",

      // Script list rows
      ".uf-srow { display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: 14px; padding: 13px 22px; border-bottom: 1px solid #f4f4f6; transition: background .1s; }",
      ".uf-srow:last-child { border-bottom: none; }",
      ".uf-srow:hover { background: #fafafa; }",
      ".uf-sinfo { min-width: 0; }",
      ".uf-sname { font-size: 13.5px; font-weight: 600; color: #18181b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      ".uf-sname.dim { color: #a1a1aa; font-weight: 400; }",
      ".uf-sdomain { font-size: 12px; color: #71717a; margin-top: 2px; }",
      ".uf-sbtns { display: flex; gap: 6px; flex-shrink: 0; }",
      ".uf-empty { padding: 40px 20px; text-align: center; color: #a1a1aa; font-size: 13.5px; line-height: 1.6; }",
      ".uf-empty-icon { font-size: 30px; margin-bottom: 10px; }",

      // Toggle switch
      ".uf-toggle { position: relative; width: 36px; height: 21px; flex-shrink: 0; cursor: pointer; }",
      ".uf-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }",
      ".uf-track { position: absolute; inset: 0; background: #d4d4d8; border-radius: 999px; transition: background .2s; }",
      ".uf-track::after { content: ''; position: absolute; left: 3px; top: 3px; width: 15px; height: 15px; background: #fff; border-radius: 50%; transition: transform .2s; box-shadow: 0 1px 4px rgba(0,0,0,.2); }",
      ".uf-toggle input:checked + .uf-track { background: #7f0000; }",
      ".uf-toggle input:checked + .uf-track::after { transform: translateX(15px); }",

      // Home
      ".uf-hero { display: flex; align-items: center; gap: 20px; padding: 6px 0 32px; }",
      ".uf-hero-text h1 { font-size: 26px; font-weight: 800; color: #18181b; letter-spacing: -.5px; }",
      ".uf-hero-text h1 span { color: #7f0000; }",
      ".uf-hero-credit { font-size: 12.5px; color: #a1a1aa; margin-top: 5px; }",
      ".uf-feat-list { display: flex; flex-direction: column; }",
      ".uf-feat-item { display: flex; align-items: flex-start; gap: 16px; padding: 18px 22px; border-bottom: 1px solid #f4f4f6; }",
      ".uf-feat-item:last-child { border-bottom: none; }",
      ".uf-feat-icon { font-size: 22px; flex-shrink: 0; width: 36px; text-align: center; margin-top: 1px; }",
      ".uf-feat-name { font-size: 14px; font-weight: 600; color: #18181b; margin-bottom: 4px; }",
      ".uf-feat-desc { font-size: 13px; color: #71717a; line-height: 1.65; }",

      // Shortcuts tab
      ".uf-krow { display: flex; align-items: center; gap: 20px; padding: 15px 22px; border-bottom: 1px solid #f4f4f6; }",
      ".uf-krow:last-child { border-bottom: none; }",
      ".uf-kbd { background: #f4f4f6; border: 1px solid #d4d4d8; border-bottom-width: 2px; border-radius: 7px; padding: 5px 14px; font-family: monospace; font-size: 13px; color: #18181b; white-space: nowrap; flex-shrink: 0; }",
      ".uf-kdesc { font-size: 13.5px; color: #52525b; line-height: 1.5; }",
      "code.uf-c { background: #f4f4f6; border: 1px solid #e4e4e7; padding: 1px 5px; border-radius: 5px; font-family: monospace; font-size: 12px; color: #18181b; }"
    ].join("\n");
  }

  function pageHTML(){
    return (
      '<div id="uf-wrap">'

      + '<div id="uf-top">'
        + '<span class="uf-logo"><img src="'+ICON+'" width="28" height="28">uFeatures</span>'
        + '<div class="uf-tabs">'
          + '<div class="uf-tab on" data-tab="home">Home</div>'
          + '<div class="uf-tab" data-tab="scripts">My Scripts</div>'
          + '<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        + '</div>'
        + '<div class="uf-top-end">'
          + '<button class="uf-btn ghost" id="uf-update">&#8635;&ensp;Sync all</button>'
        + '</div>'
      + '</div>'

      + '<div id="uf-body">'

        // HOME
        + '<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          + '<div class="uf-hero">'
            + '<img src="'+ICON+'" width="60" height="60" style="border-radius:14px;flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,.12)">'
            + '<div class="uf-hero-text">'
              + '<h1>u<span>Features</span></h1>'
              + '<div class="uf-hero-credit">Roblox:&ensp;studiocompile&ensp;&middot;&ensp;Discord:&ensp;roblox_studio</div>'
            + '</div>'
          + '</div>'
          + '<div class="uf-sh">What it does</div>'
          + '<div class="uf-panel"><div class="uf-feat-list">'
            + feat("📜","Script Manager","Write small JavaScript snippets that run automatically when you visit certain sites. Set a domain, paste your code, and it runs every time — no extra steps. Manage everything from the My Scripts tab.")
            + feat("🚫","Securly Blocker","Automatically removes the Securly blocking screen whenever it shows up, so it can\'t block you.")
            + feat("🔍","Inspect Element","Adds a real developer tools panel to the bottom of any page. Press Ctrl+Shift+I to open or close it.")
            + feat("⚡","Bookmarklet Runner","Copy any <code class=\"uf-c\">javascript:</code> link, then press Ctrl+V outside a text box to instantly run it on the page.")
          + '</div></div>'
        + '</div></div>'

        // SCRIPTS
        + '<div class="uf-sec" id="uf-tab-scripts"><div class="uf-scroll">'
          + '<div id="uf-edit-banner"><span>&#9998;&ensp;Editing: <b id="uf-editing-label"></b></span><button class="uf-btn sm ghost" id="uf-cancel-edit" style="margin-left:auto">&#10005;&ensp;Cancel</button></div>'
          + '<div class="uf-sh">New script</div>'
          + '<div class="uf-panel">'
            + '<div class="uf-form-body">'
              + '<div class="uf-row2">'
                + '<div class="uf-field"><label for="uf-nameF">Name</label><input id="uf-nameF" class="uf-in" type="text" placeholder="My Script"></div>'
                + '<div class="uf-field"><label for="uf-domF">Run on</label><input id="uf-domF" class="uf-in" type="text" placeholder="example.com"></div>'
              + '</div>'
              + '<div class="uf-field"><label for="uf-codeF">JavaScript</label><textarea id="uf-codeF" class="uf-ta" placeholder="// Paste or write your script here..."></textarea></div>'
            + '</div>'
            + '<div class="uf-form-footer"><span id="uf-st"></span><button class="uf-btn prim" id="uf-saveBtn">Save script</button></div>'
          + '</div>'
          + '<div class="uf-sh" style="margin-top:30px">Your scripts</div>'
          + '<div class="uf-panel" id="uf-slist"></div>'
        + '</div></div>'

        // SHORTCUTS
        + '<div class="uf-sec" id="uf-tab-keys"><div class="uf-scroll">'
          + '<div class="uf-sh">Keyboard shortcuts</div>'
          + '<div class="uf-panel">'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + `</span><span class="uf-kdesc">Open uFeatures from any page</span></div>'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Open or close the Inspect Element panel</span></div>'
            + '<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> link from your clipboard (only when you\'re not typing in a field)</span></div>'
          + '</div>'
        + '</div></div>'

      + '</div>'

      + '<div id="uf-bar">'
        + '<span>uFeatures &mdash; storage: <b>google.com</b></span>'
        + '<span id="uf-cnt-s">0 scripts</span>'
        + '<span id="uf-cnt-si">0 sites</span>'
        + '<span id="uf-barst"></span>'
      + '</div>'

      + '</div>'
    );
  }

  function feat(icon, name, desc){
    return '<div class="uf-feat-item"><div class="uf-feat-icon">'+icon+'</div><div><div class="uf-feat-name">'+name+'</div><div class="uf-feat-desc">'+desc+'</div></div></div>';
  }

  // ── UI helpers ────────────────────────────────────────────────────
  function setSt(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el = document.getElementById(id); if(!el) return;
      el.textContent = msg; el.style.color = color || "#71717a";
    });
    if(msg) setTimeout(function(){
      ["uf-st","uf-barst"].forEach(function(id){
        var el = document.getElementById(id);
        if(el && el.textContent === msg) el.textContent = "";
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
      btn.className = "uf-btn blue";
    } else {
      banner.classList.remove("on");
      btn.textContent = "Save script";
      btn.className = "uf-btn prim";
    }
  }

  function cancelEdit(){
    setEditMode(null);
    var nf = document.getElementById("uf-nameF"), df = document.getElementById("uf-domF"), cf = document.getElementById("uf-codeF");
    if(nf) nf.value = ""; if(df) df.value = _referrer || ""; if(cf) cf.value = "";
  }

  function renderScripts(){
    var c = document.getElementById("uf-slist"); if(!c) return;
    while(c.firstChild) c.removeChild(c.firstChild);
    var arr = siteLoad();
    if(!arr.length){
      var em = document.createElement("div"); em.className = "uf-empty";
      em.innerHTML = '<div class="uf-empty-icon">📭</div>No scripts yet.<br>Add one above to get started.';
      c.appendChild(em); return;
    }
    arr.forEach(function(s, i){
      var row = document.createElement("div"); row.className = "uf-srow";

      var tog = document.createElement("label"); tog.className = "uf-toggle";
      var cb  = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!s.enabled;
      var trk = document.createElement("span"); trk.className = "uf-track";
      tog.appendChild(cb); tog.appendChild(trk);

      var info = document.createElement("div"); info.className = "uf-sinfo";
      var nm   = document.createElement("div"); nm.className = "uf-sname" + (s.enabled ? "" : " dim"); nm.textContent = s.name;
      var dm   = document.createElement("div"); dm.className = "uf-sdomain"; dm.textContent = s.domain ? "Runs on \u00a0" + s.domain : "No domain set";
      info.appendChild(nm); info.appendChild(dm);

      cb.onchange = (function(idx, nmEl){ return function(){
        var a = siteLoad(); a[idx].enabled = this.checked; siteSave(a);
        nmEl.className = "uf-sname" + (this.checked ? "" : " dim");
        updateBar(); pushForDomain(a[idx].domain, a);
      }; })(i, nm);

      var btns = document.createElement("div"); btns.className = "uf-sbtns";
      var eb = document.createElement("button"); eb.className = "uf-btn sm"; eb.textContent = "Edit";
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

      var db = document.createElement("button"); db.className = "uf-btn sm danger"; db.textContent = "Delete";
      db.onclick = (function(idx, name, domain){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a = siteLoad(); a.splice(idx, 1); siteSave(a);
        if(_editingName === name) cancelEdit();
        renderScripts(); updateBar(); pushForDomain(domain, a);
      }; })(i, s.name, s.domain);

      btns.appendChild(eb); btns.appendChild(db);
      row.appendChild(tog); row.appendChild(info); row.appendChild(btns);
      c.appendChild(row);
    });
  }

  function wire(){
    var domF = document.getElementById("uf-domF");
    if(_referrer) domF.value = _referrer;

    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        tab.classList.add("on");
        var sec = document.getElementById("uf-tab-" + tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    document.getElementById("uf-cancel-edit").addEventListener("click", cancelEdit);

    document.getElementById("uf-saveBtn").addEventListener("click", function(){
      var name   = (document.getElementById("uf-nameF").value.trim()) || "My Script";
      var domain = document.getElementById("uf-domF").value.trim();
      var code   = document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Please add some code first.", "#dc2626"); return; }

      var arr = siteLoad(), idx = -1;
      arr.forEach(function(s, i){ if(s.name === (_editingName || name)) idx = i; });
      var entry = { name:name, domain:domain, code:code, enabled:true };
      if(idx >= 0) arr[idx] = entry; else arr.push(entry);
      siteSave(arr);
      setEditMode(null);
      renderScripts(); updateBar();
      pushForDomain(domain, arr);
      document.getElementById("uf-nameF").value = "";
      document.getElementById("uf-codeF").value = "";
    });

    document.getElementById("uf-update").addEventListener("click", function(){
      var sites = getSites(), scripts = siteLoad();
      if(!sites.length){ setSt("No sites to sync yet.", "#71717a"); return; }
      var rem = sites.length, errs = 0;
      setSt("Syncing " + rem + " site(s)\u2026", "#71717a");
      sites.forEach(function(origin){
        var toSend = scripts.filter(function(s){ return !s.domain || domainMatchesOrigin(s.domain, origin); });
        pushToSite(origin, toSend,
          function(){ rem--; if(rem <= 0) setSt(errs ? errs+" failed" : "All synced \u2713", errs ? "#dc2626" : "#1a7f37"); },
          function(){ rem--; errs++; if(rem <= 0) setSt(errs+" site(s) couldn\u2019t sync.", "#dc2626"); }
        );
      });
    });

    renderScripts(); updateBar();
  }

  // ── Push helper ───────────────────────────────────────────────────
  function pushForDomain(domain, arr){
    if(!domain){ setSt("Saved! (No domain set \u2014 script won\u2019t run anywhere.)", "#71717a"); return; }
    var rawDomain = domain.split(",")[0].trim().replace(/^\*\./, "");
    var slash = rawDomain.indexOf("/"); if(slash !== -1) rawDomain = rawDomain.slice(0, slash);
    if(!rawDomain){ setSt("Saved.", "#71717a"); return; }
    var known   = getSites().filter(function(o){ return o.indexOf(rawDomain) !== -1; });
    var origins = known.length ? known : ["https://" + rawDomain];
    var rem = origins.length, errs = 0;
    setSt("Saving\u2026", "#71717a");
    origins.forEach(function(origin){
      var toSend = arr.filter(function(s){ return !s.domain || domainMatchesOrigin(s.domain, origin); });
      pushToSite(origin, toSend,
        function(){ addSite(origin); updateBar(); rem--; if(rem <= 0) setSt(errs ? errs+" failed" : "Saved \u2713", errs ? "#dc2626" : "#1a7f37"); },
        function(err){ rem--; errs++; if(rem <= 0) setSt("Couldn\u2019t sync: " + err, "#dc2626"); }
      );
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if(IS_SETTINGS){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSettingsPage);
    else bootSettingsPage();
  } else {
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", runSiteScripts);
    else runSiteScripts();
  }

  // ── Shortcuts ─────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement || {}).tagName;
    var typing = tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT" || !!(document.activeElement||{}).isContentEditable;
    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key === "I"){
      if(typing) return; e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "Backquote"){
      e.preventDefault();
      if(!IS_SETTINGS) window.open("https://www.google.com/ufeatures", "_blank");
      return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(/^javascript:/i.test(text.trim())) runBookmarklet(text);
      }).catch(function(){});
    }
  });

}();
