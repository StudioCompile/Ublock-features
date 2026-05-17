/// uFeatures.js
// Inject on every site via a userscript manager (Violentmonkey / Tampermonkey).
//
// HOW IT WORKS:
//   1. Visit google.com/ufeatures  →  page is taken over, shows the full settings UI.
//   2. Scripts are saved in google.com localStorage (the master list).
//   3. When you save a script, it ALSO pushes to the target site's own localStorage
//      via a quick hidden bridge window (open → set → ack → close).
//   4. On EVERY other page load, uFeatures reads THAT site's localStorage and
//      runs matching scripts. No persistent tab, no bridge needed at runtime.
//   5. Ctrl+`  →  mini quick-panel on any page (save/run code, link to settings).
//   6. Ctrl+Shift+I  →  Chii remote debugger.

!function(){

  var SITE_KEY  = "__uFeaturesScripts";   // per-site localStorage key
  var SITES_KEY = "__uFeaturesSites";     // list of known sites (google.com only)
  var chiiState = 0;
  var _panel    = null;
  var _nameIdx  = 0;

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

  // ── Bridge: push a script array into another site's localStorage ──
  // Works by opening a tiny hidden window to the target origin.
  // That window has uFeatures.js injected and listens for uf_bridge_set.
  function pushToSite(origin, scripts, onDone){
    var win = window.open(origin + "/?__ufb=1", "_blank",
      "width=1,height=1,top=-300,left=-300,menubar=no,toolbar=no,location=no,status=no");
    if(!win){
      alert("[uFeatures] Popup blocked — please allow popups for this site.");
      return;
    }
    var done = false, attempts = 0;
    var poll = setInterval(function(){
      if(done || attempts > 80){ clearInterval(poll); if(!done){ try{win.close();}catch(e){} } return; }
      try{ win.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts }, origin); }
      catch(e){}
      attempts++;
    }, 100);
    var handler = function(e){
      if(e.source !== win || !e.data || e.data.type !== "uf_bridge_ack") return;
      done = true;
      clearInterval(poll);
      window.removeEventListener("message", handler);
      setTimeout(function(){ try{win.close();}catch(e){} }, 150);
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
      }catch(ex){}
    }
  });

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
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname, path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = p.trim(); if(!p || p === "*") return true;
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
    if(!pattern || !pattern.trim()) return true;
    try{
      var host = new URL(origin).hostname;
      return pattern.trim().split(",").some(function(p){
        p = p.trim(); if(!p || p === "*") return true;
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
    w.style.display=""; w.style.background="#282828";
    f.style.background="#282828"; f.style.opacity="1";
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
      "html,body{height:100%;background:#1c1b22;color:#d7d7db;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px}",
      // Layout
      "#uf-wrap{display:flex;flex-direction:column;height:100vh;overflow:hidden}",
      // Topbar
      "#uf-top{display:flex;align-items:stretch;background:#1c1b22;border-bottom:1px solid #38383d;height:40px;flex-shrink:0}",
      ".uf-logo{display:flex;align-items:center;gap:8px;padding:0 16px;border-right:1px solid #38383d;font-size:14px;font-weight:600;letter-spacing:-.2px;white-space:nowrap}",
      ".uf-tabs{display:flex;align-items:stretch}",
      ".uf-tab{display:flex;align-items:center;padding:0 16px;cursor:pointer;font-size:13px;color:#8f8f9d;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .1s,border-color .1s;user-select:none}",
      ".uf-tab:hover{color:#d7d7db;background:rgba(255,255,255,.04)}",
      ".uf-tab.on{color:#d7d7db;border-bottom-color:#e66000}",
      ".uf-top-actions{margin-left:auto;display:flex;align-items:center;gap:6px;padding:0 12px}",
      // Content
      "#uf-body{flex:1;overflow-y:auto;padding:22px 28px 48px;scrollbar-width:thin;scrollbar-color:#38383d transparent}",
      ".uf-sec{display:none}.uf-sec.on{display:block}",
      // Status bar
      "#uf-bar{height:22px;background:#38383d;display:flex;align-items:center;padding:0 12px;gap:20px;flex-shrink:0}",
      "#uf-bar span{font-size:11px;color:#8f8f9d}","#uf-bar b{color:#d7d7db;font-weight:400}",
      "#uf-barst{margin-left:auto;font-size:11px;color:#8f8f9d}",
      // Buttons
      ".uf-btn{padding:5px 14px;border-radius:3px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #38383d;background:transparent;color:#d7d7db;transition:background .1s,border-color .1s}",
      ".uf-btn:hover{background:rgba(255,255,255,.06)}",
      ".uf-btn.prim{background:#e66000;border-color:#e66000;color:#fff}.uf-btn.prim:hover{background:#cc5500;border-color:#cc5500}",
      ".uf-btn.danger{color:#ff6b6b}.uf-btn.danger:hover{background:rgba(255,100,100,.1);border-color:#ff6b6b}",
      // Section header
      ".uf-sh{font-size:11px;font-weight:600;color:#8f8f9d;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #38383d}",
      // Card
      ".uf-card{background:#2a2a2f;border:1px solid #38383d;border-radius:4px;overflow:hidden;margin-bottom:18px}",
      ".uf-fa{padding:14px 16px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #38383d}",
      ".uf-g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
      ".uf-lbl{font-size:11px;color:#8f8f9d;margin-bottom:3px}",
      "input.uf-in{border:1px solid #38383d;border-radius:3px;padding:6px 9px;font-family:inherit;font-size:13px;outline:none;color:#d7d7db;background:#1c1b22;width:100%;transition:border-color .12s}",
      "input.uf-in:focus{border-color:#e66000;box-shadow:0 0 0 1px rgba(230,96,0,.25)}",
      "textarea.uf-ta{border:1px solid #38383d;border-radius:3px;padding:7px 9px;font-family:Consolas,Menlo,monospace;font-size:12px;outline:none;color:#d7d7db;background:#1c1b22;width:100%;resize:vertical;line-height:1.55;min-height:130px;transition:border-color .12s}",
      "textarea.uf-ta:focus{border-color:#e66000;box-shadow:0 0 0 1px rgba(230,96,0,.25)}",
      ".uf-ff{display:flex;gap:8px;align-items:center}",
      "#uf-st{flex:1;font-size:11px}",
      // Script list
      ".uf-srow{display:grid;grid-template-columns:18px 1fr auto auto;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #38383d}",
      ".uf-srow:last-child{border-bottom:none}",
      ".uf-srow:hover{background:rgba(255,255,255,.025)}",
      ".uf-sinfo{min-width:0}",
      ".uf-sname{font-size:13px;color:#d7d7db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".uf-sname.dim{color:#52525e}",
      ".uf-sdomain{font-size:11px;color:#8f8f9d}",
      ".uf-empty{padding:28px;text-align:center;color:#52525e}",
      // uBlock-style checkbox
      ".uf-cb{position:relative;width:16px;height:16px;flex-shrink:0;cursor:pointer}",
      ".uf-cb input{opacity:0;position:absolute;width:0;height:0}",
      ".uf-cb .box{position:absolute;inset:0;border:1px solid #4a4a52;border-radius:2px;background:#1c1b22;transition:background .12s,border-color .12s}",
      ".uf-cb input:checked+.box{background:#e66000;border-color:#e66000}",
      ".uf-cb input:checked+.box::after{content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}",
      // Sites tab
      ".uf-site-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #38383d}",
      ".uf-site-row:last-child{border-bottom:none}",
      ".uf-site-name{flex:1;font-size:13px;color:#d7d7db}",
      ".uf-site-ct{font-size:11px;color:#8f8f9d}",
      // Keys tab
      ".uf-krow{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #38383d}",
      ".uf-krow:last-child{border-bottom:none}",
      ".uf-kbd{background:#38383d;border:1px solid #4a4a52;border-radius:3px;padding:3px 10px;font-family:monospace;font-size:12px;color:#d7d7db;min-width:170px;text-align:center}",
      ".uf-kdesc{font-size:12px;color:#8f8f9d}",
      "code.uf-c{background:#38383d;padding:1px 4px;border-radius:2px;font-family:monospace;font-size:11px}"
    ].join("\n");
  }

  function settingsHTML(){
    var shield = '<svg width="18" height="18" viewBox="0 0 64 64" fill="none"><path d="M32 4L8 14v18c0 14 10.7 26.5 24 30 13.3-3.5 24-16 24-30V14L32 4z" fill="#e66000"/><path d="M32 10L12 18.5v13.5c0 10.5 8 19.8 20 22.8 12-3 20-12.3 20-22.8V18.5L32 10z" fill="#cc5500"/><path d="M26 32l-5-5-2.5 2.5 7.5 7.5 13-13L36.5 21.5z" fill="#fff"/></svg>';
    return '<div id="uf-wrap">'
      // Top
      +'<div id="uf-top">'
        +'<div class="uf-logo">'+shield+'uFeatures</div>'
        +'<div class="uf-tabs">'
          +'<div class="uf-tab on" data-tab="scripts">My Scripts</div>'
          +'<div class="uf-tab" data-tab="sites">Hosted Sites</div>'
          +'<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        +'</div>'
        +'<div class="uf-top-actions">'
          +'<button class="uf-btn prim" id="uf-apply">&#10003; Apply &amp; Re-push all</button>'
        +'</div>'
      +'</div>'

      // Body
      +'<div id="uf-body">'

        // Scripts
        +'<div class="uf-sec on" id="uf-tab-scripts">'
          +'<div class="uf-sh">Add / Edit Script</div>'
          +'<div class="uf-card"><div class="uf-fa">'
            +'<div class="uf-g2">'
              +'<div><div class="uf-lbl">Script name</div><input id="uf-nameF" class="uf-in" type="text" placeholder="Example Script"></div>'
              +'<div><div class="uf-lbl">Target domain (blank = all sites)</div><input id="uf-domF" class="uf-in" type="text" placeholder="example.com or *.example.com/path"></div>'
            +'</div>'
            +'<div><div class="uf-lbl">JavaScript</div><textarea id="uf-codeF" class="uf-ta" placeholder="// Your script here..."></textarea></div>'
          +'</div>'
          +'<div class="uf-ff" style="padding:10px 16px;background:#222226;border-top:1px solid #38383d">'
            +'<span id="uf-st"></span>'
            +'<button class="uf-btn" id="uf-runBtn">Run on this page</button>'
            +'<button class="uf-btn prim" id="uf-saveBtn">Save &amp; Push to site</button>'
          +'</div></div>'
          +'<div class="uf-sh" style="margin-top:20px">Saved Scripts</div>'
          +'<div class="uf-card" id="uf-slist"></div>'
        +'</div>'

        // Sites
        +'<div class="uf-sec" id="uf-tab-sites">'
          +'<div class="uf-sh">Sites with uFeatures scripts</div>'
          +'<div class="uf-card" id="uf-sitelist"></div>'
          +'<div style="margin-top:18px"><div class="uf-sh">Push all scripts to a site</div>'
          +'<div class="uf-card"><div class="uf-fa">'
            +'<div class="uf-g2">'
              +'<div><div class="uf-lbl">Target origin</div><input id="uf-pushUrl" class="uf-in" placeholder="https://example.com"></div>'
              +'<div style="display:flex;align-items:flex-end"><button class="uf-btn prim" id="uf-pushBtn">Push all scripts</button></div>'
            +'</div>'
            +'<div style="font-size:11px;color:#52525e;line-height:1.7">Opens a brief hidden window to the target, writes matching scripts into its localStorage, then closes. The target site must have uFeatures.js injected.</div>'
          +'</div></div></div>'
        +'</div>'

        // Keys
        +'<div class="uf-sec" id="uf-tab-keys">'
          +'<div class="uf-sh">Keyboard Shortcuts</div>'
          +'<div class="uf-card">'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + `</span><span class="uf-kdesc">Open mini quick-panel on any page</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Toggle Chii remote debugger</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Esc</span><span class="uf-kdesc">Close the quick-panel</span></div>'
          +'</div>'
        +'</div>'

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
      db.onclick=(function(idx,name){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a=siteLoad(); a.splice(idx,1); siteSave(a);
        renderScripts(); updateBar();
      }; })(i,s.name);

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
    // Tabs
    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){ t.classList.remove("on"); });
        document.querySelectorAll(".uf-sec").forEach(function(s){ s.classList.remove("on"); });
        tab.classList.add("on");
        var sec=document.getElementById("uf-tab-"+tab.getAttribute("data-tab"));
        if(sec){ sec.classList.add("on"); if(tab.getAttribute("data-tab")==="sites") renderSites(); }
      });
    });

    // Save & Push
    document.getElementById("uf-saveBtn").addEventListener("click", function(){
      var name=(document.getElementById("uf-nameF").value.trim())||nextName();
      var domain=document.getElementById("uf-domF").value.trim();
      var code=document.getElementById("uf-codeF").value.trim();
      if(!code){ setSt("Code is required.","#ff6b6b"); return; }

      var arr=siteLoad();
      var idx=-1;
      arr.forEach(function(s,i){ if(s.name===(_editingName||name)) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      if(idx>=0) arr[idx]=entry; else arr.push(entry);
      siteSave(arr);
      _editingName=null;
      renderScripts(); updateBar();

      // Push to the target site's localStorage
      if(!domain){
        setSt("Saved. (No specific domain — push manually via Hosted Sites.)","#8f8f9d");
      } else {
        // Derive origin from domain
        var rawDomain=domain.split(",")[0].trim().replace(/^\*\./,"");
        var slash=rawDomain.indexOf("/"); if(slash!==-1) rawDomain=rawDomain.slice(0,slash);
        // Check if we already know the origin scheme
        var known=getSites().filter(function(o){ return o.indexOf(rawDomain)!==-1; });
        var origins=known.length ? known : ["https://"+rawDomain];
        origins.forEach(function(origin){
          addSite(origin);
          var toSend=arr.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
          pushToSite(origin, toSend, function(){ setSt("Saved & pushed \u2713","#3fc33f"); updateBar(); });
        });
        setSt("Saving & pushing…","#e66000");
      }

      document.getElementById("uf-nameF").value="";
      document.getElementById("uf-codeF").value="";
    });

    // Run on this page
    document.getElementById("uf-runBtn").addEventListener("click", function(){
      var code=document.getElementById("uf-codeF").value.trim(); if(!code) return;
      try{ Function(code)(); setSt("Ran \u2713","#3fc33f"); }
      catch(e){ setSt("Error: "+e.message,"#ff6b6b"); }
    });

    // Apply & re-push all
    document.getElementById("uf-apply").addEventListener("click", function(){
      var sites=getSites(), scripts=siteLoad();
      if(!sites.length){ setSt("No tracked sites to push to.","#8f8f9d"); return; }
      var rem=sites.length;
      setSt("Pushing to "+rem+" site(s)…","#e66000");
      sites.forEach(function(origin){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
        pushToSite(origin,toSend,function(){ rem--; if(rem<=0) setSt("All sites updated \u2713","#3fc33f"); });
      });
    });

    // Manual push to URL
    document.getElementById("uf-pushBtn").addEventListener("click", function(){
      var url=document.getElementById("uf-pushUrl").value.trim();
      if(!url){ setSt("Enter a URL.","#ff6b6b"); return; }
      try{
        var origin=new URL(url).origin;
        var scripts=siteLoad();
        addSite(origin); renderSites(); updateBar();
        pushToSite(origin,scripts,function(){ setSt("Pushed to "+origin+" \u2713","#3fc33f"); });
        setSt("Pushing…","#e66000");
      }catch(e){ setSt("Invalid URL","#ff6b6b"); }
    });

    renderScripts(); renderSites(); updateBar();
  }

  // ════════════════════════════════════════════════════════════════════
  // MINI QUICK-PANEL  —  Ctrl+` on any non-settings page
  // ════════════════════════════════════════════════════════════════════

  function openPanel(){
    if(_panel){
      _panel.style.display = _panel.style.display==="none" ? "flex" : "none";
      return;
    }

    var style=document.createElement("style"); style.id="__uf_pstyle";
    style.textContent=[
      "#__ufP{position:fixed;bottom:18px;right:18px;width:340px;background:#1c1b22;border:1px solid #38383d;border-radius:5px;box-shadow:0 8px 40px rgba(0,0,0,.75);z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;color:#d7d7db;animation:__ufIn .12s ease}",
      "@keyframes __ufIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      "#__ufP .ph{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#2a2a2f;border-bottom:1px solid #38383d;user-select:none}",
      "#__ufP .ph .pt{flex:1;font-size:13px;font-weight:600}",
      "#__ufP .ph .px{background:none;border:none;color:#8f8f9d;font-size:19px;cursor:pointer;padding:0;line-height:1;transition:color .1s}",
      "#__ufP .ph .px:hover{color:#d7d7db}",
      "#__ufP .pb{padding:10px 12px;display:flex;flex-direction:column;gap:8px}",
      "#__ufP input.pi{border:1px solid #38383d;border-radius:3px;padding:6px 8px;font-size:12px;font-family:inherit;outline:none;color:#d7d7db;background:#1c1b22;width:100%;transition:border-color .12s}",
      "#__ufP input.pi:focus{border-color:#e66000}",
      "#__ufP textarea.pt2{border:1px solid #38383d;border-radius:3px;padding:6px 8px;font-family:monospace;font-size:12px;outline:none;color:#d7d7db;background:#1c1b22;width:100%;resize:vertical;line-height:1.5;transition:border-color .12s}",
      "#__ufP textarea.pt2:focus{border-color:#e66000}",
      "#__ufP .pr{display:flex;gap:6px;align-items:center}",
      "#__ufP button.pbt{padding:5px 12px;border-radius:3px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #38383d;background:transparent;color:#d7d7db;transition:background .1s}",
      "#__ufP button.pbt:hover{background:rgba(255,255,255,.06)}",
      "#__ufP button.pbt.pp{background:#e66000;border-color:#e66000;color:#fff}.pbt.pp:hover{background:#cc5500}",
      "#__ufP .pst{flex:1;font-size:11px;text-align:right}",
      "#__ufP a.plink{display:flex;align-items:center;gap:6px;padding:7px 12px;border-top:1px solid #38383d;font-size:11px;color:#8f8f9d;text-decoration:none;transition:background .1s,color .1s}",
      "#__ufP a.plink:hover{background:rgba(255,255,255,.04);color:#d7d7db}"
    ].join("\n");
    document.head.appendChild(style);

    var shield='<svg width="13" height="13" viewBox="0 0 64 64" fill="none"><path d="M32 4L8 14v18c0 14 10.7 26.5 24 30 13.3-3.5 24-16 24-30V14L32 4z" fill="#e66000"/><path d="M26 32l-5-5-2.5 2.5 7.5 7.5 13-13L36.5 21.5z" fill="#fff"/></svg>';

    _panel=document.createElement("div"); _panel.id="__ufP";
    _panel.innerHTML=
      '<div class="ph">'+shield+'<span class="pt">uFeatures</span><button class="px" id="__ufX">&times;</button></div>'
      +'<div class="pb">'
        +'<input id="__ufN" class="pi" type="text" placeholder="Script name (e.g. Example Script)">'
        +'<textarea id="__ufC" class="pt2" rows="5" placeholder="// JavaScript to run on this page..."></textarea>'
        +'<div class="pr">'
          +'<button class="pbt" id="__ufRun">Run</button>'
          +'<button class="pbt pp" id="__ufSave">Save &amp; Push</button>'
          +'<span class="pst" id="__ufSt"></span>'
        +'</div>'
      +'</div>'
      +'<a class="plink" href="https://www.google.com/ufeatures" target="_blank">'+shield+' Open uFeatures Settings &rarr;</a>';

    document.body.appendChild(_panel);

    document.getElementById("__ufX").addEventListener("click",function(){ _panel.style.display="none"; });

    document.getElementById("__ufRun").addEventListener("click",function(){
      var code=document.getElementById("__ufC").value.trim(); if(!code) return;
      try{ Function(code)(); pst("Ran \u2713","#3fc33f"); }
      catch(e){ pst("Error: "+e.message,"#ff6b6b"); }
    });

    document.getElementById("__ufSave").addEventListener("click",function(){
      var name=(document.getElementById("__ufN").value.trim())||nextName();
      var code=document.getElementById("__ufC").value.trim();
      var domain=location.hostname;
      if(!code){ pst("Code required","#ff6b6b"); return; }

      // Save to this site's localStorage
      var arr=siteLoad();
      var idx=-1; arr.forEach(function(s,i){ if(s.name===name) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      if(idx>=0) arr[idx]=entry; else arr.push(entry);
      siteSave(arr);
      // Run it immediately
      try{ Function(code)(); }catch(e){}

      // Also push this site's scripts to google.com so settings page stays in sync
      pushToSite("https://www.google.com", arr, function(){ pst("Saved \u2713","#3fc33f"); });
      pst("Saving…","#e66000");
    });
  }

  function pst(msg,color){
    var el=_panel&&_panel.querySelector("#__ufSt"); if(!el) return;
    el.textContent=msg; el.style.color=color||"#8f8f9d";
    if(msg) setTimeout(function(){ if(el.textContent===msg) el.textContent=""; },2500);
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

    if(e.key==="Escape"&&_panel&&_panel.style.display!=="none"){
      _panel.style.display="none"; return;
    }
    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      if(typing) return; e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.code==="Backquote"){
      e.preventDefault();
      if(IS_SETTINGS) return; // already on settings
      openPanel(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.key==="v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
