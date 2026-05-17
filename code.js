/// devTools.js  v2
// Self-contained — no external files needed.
// Scripts stored in localStorage on every page devTools.js runs on.
// Manager overlays the current page (injected into DOM) when Ctrl+` is pressed.
// localStorage bridge: opens a tiny hidden window to push scripts to any site.

!function(){

  var STORE_KEY   = "__devToolsScripts";
  var chiiState   = 0;
  var _overlay    = null;  // manager overlay element

  // ── Random script name generator ────────────────────────────────
  var ADJ = ["alpha","bravo","cosmic","delta","echo","fast","golden","hyper",
             "iron","jade","keen","lunar","neon","omega","prime","quick",
             "rapid","solar","turbo","ultra","vivid","wild","xray","zeta"];
  var NON = ["archer","blaze","circuit","drift","ember","forge","grid",
             "hawk","ignite","jolt","kernel","lance","matrix","node",
             "orbit","patch","quest","relay","script","trace","uplink","vault"];
  function randomName(){
    var a = ADJ[Math.floor(Math.random()*ADJ.length)];
    var n = NON[Math.floor(Math.random()*NON.length)];
    return a+"-"+n;
  }

  // ── Storage ──────────────────────────────────────────────────────
  function loadScripts(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function saveScripts(arr){
    localStorage.setItem(STORE_KEY, JSON.stringify(arr));
  }

  // ── localStorage bridge ──────────────────────────────────────────
  // Opens a hidden window to a target origin, posts a message to set its localStorage,
  // then closes it after a short delay.
  function pushStorageToSite(targetOrigin, key, value){
    var win = window.open(targetOrigin + "?__dtbridge=1", "_blank",
      "width=1,height=1,top=-100,left=-100,menubar=no,toolbar=no,status=no");
    if(!win){ console.warn("[devTools] Could not open bridge window — popup blocked?"); return; }
    var attempts = 0;
    var poll = setInterval(function(){
      try{
        win.postMessage({ type:"dt_storage_set", key:key, value:value }, targetOrigin);
        attempts++;
        if(attempts > 20){ clearInterval(poll); setTimeout(function(){ try{win.close();}catch(e){} }, 200); }
      }catch(e){ /* cross-origin not ready yet */ }
    }, 150);
    // Receive ack
    var ack = function(e){
      if(e.source === win && e.data && e.data.type === "dt_storage_ack"){
        clearInterval(poll);
        window.removeEventListener("message", ack);
        setTimeout(function(){ try{win.close();}catch(e){} }, 300);
      }
    };
    window.addEventListener("message", ack);
  }

  // On any page: listen for bridge requests (in case this page was opened as bridge)
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d) return;

    if(d.type === "dt_storage_set" && d.key){
      try{
        localStorage.setItem(d.key, d.value);
        e.source.postMessage({ type:"dt_storage_ack", key:d.key }, e.origin);
      }catch(ex){ console.warn("[devTools] bridge set failed:", ex); }
    }
    if(d.type === "dt_run"){
      try{ Function(d.code)(); }
      catch(err){ console.error("[devTools] run error:", err); }
    }
  });

  // ── Securly overlay blocker ──────────────────────────────────────
  function killSecurly(){
    var el = document.getElementById("securly_overlay");
    if(el) el.remove();
    // Also kill by common class patterns
    ["securly-overlay","securly_overlay","securly-extension"].forEach(function(c){
      var nodes = document.getElementsByClassName(c);
      for(var i=nodes.length-1;i>=0;i--) nodes[i].remove();
    });
  }
  function watchSecurly(){
    killSecurly();
    var obs = new MutationObserver(killSecurly);
    obs.observe(document.documentElement, { childList:true, subtree:true, attributes:false });
  }

  // ── Run scripts on page load ─────────────────────────────────────
  function runStoredScripts(){
    watchSecurly();
    loadScripts().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); }
        catch(e){ console.warn("[devTools]", s.name, e); }
      }
    });
  }

  // ── Domain matching ──────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname, path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = p.trim();
      if(!p || p === "*") return true;
      var si = p.indexOf("/");
      var hp = si === -1 ? p      : p.slice(0, si);
      var pp = si === -1 ? ""     : p.slice(si);
      var hm = hp.slice(0,2) === "*."
        ? host === hp.slice(2) || host.endsWith("." + hp.slice(2))
        : host === hp;
      if(!hm) return false;
      if(!pp) return true;
      var norm = pp.endsWith("/") ? pp : pp + "/";
      return path === pp || path.startsWith(norm);
    });
  }

  // ── Chii ─────────────────────────────────────────────────────────
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
    var wrap = f.parentNode;
    wrap.style.display = "";
    // Dark background while chii loads
    wrap.style.background = "#282828";
    f.style.background    = "#282828";
    f.style.opacity       = "1";
    document.body.style.height = (document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight/2) || 100
    )) + "px";
    // Once iframe loads, it fills naturally — keep dark bg on wrapper so no flash
    f.addEventListener("load", function(){ wrap.style.background = "#282828"; }, { once:true });
  }
  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var wrap = f.parentNode;
    var hidden = window.getComputedStyle(wrap,null).display === "none";
    if(hidden){
      wrap.style.background = "#282828";
      f.style.background    = "#282828";
      f.style.opacity       = "1";
      wrap.style.display    = "";
      document.body.style.height = (document.documentElement.clientHeight - Math.floor(
        Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight/2) || 100
      )) + "px";
    } else {
      wrap.style.display    = "none";
      document.body.style.height = "";
    }
  }
  function injectChii(){
    if(chiiState===1) return;
    if(chiiState===2){ toggleChii(); return; }
    chiiState = 1;
    // Pre-create a wrapper with dark bg so it shows immediately
    var placeholder = document.createElement("div");
    placeholder.style.cssText = "position:fixed;bottom:0;left:0;width:100%;height:50%;background:#282828;z-index:2147483640;display:flex;align-items:center;justify-content:center;";
    placeholder.innerHTML = '<span style="color:#555;font-family:monospace;font-size:13px;">Loading Chii…</span>';
    placeholder.id = "__dt_chii_placeholder";
    document.body.appendChild(placeholder);

    var s = document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s, "embedded", "true");
    HTMLElement.prototype.setAttribute.call(s, "src", "https://chii.liriliri.io/target.js");
    s.addEventListener("load", function(){
      var n=0, poll=setInterval(function(){
        var f = getChiiFrame();
        if(f){
          clearInterval(poll);
          chiiState = 2;
          var ph = document.getElementById("__dt_chii_placeholder");
          if(ph) ph.remove();
          showChii();
        }
        if(++n > 40){ clearInterval(poll); chiiState=0;
          var ph = document.getElementById("__dt_chii_placeholder");
          if(ph) ph.remove();
        }
      }, 100);
    });
    document.head.appendChild(s);
  }

  // ── Bookmarklet ──────────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }
    catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Manager overlay (injected into current page) ─────────────────
  function openManager(){
    if(_overlay){
      _overlay.style.display = _overlay.style.display === "none" ? "flex" : "none";
      if(_overlay.style.display === "flex") refreshManagerScripts();
      return;
    }
    _overlay = document.createElement("div");
    _overlay.id = "__devToolsOverlay";
    _overlay.style.cssText = [
      "position:fixed","top:0","left:0","width:100%","height:100%",
      "z-index:2147483647","display:flex","align-items:center","justify-content:center",
      "background:rgba(0,0,0,.45)","backdrop-filter:blur(3px)","-webkit-backdrop-filter:blur(3px)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
    ].join(";");
    _overlay.innerHTML = buildManagerHTML();
    document.body.appendChild(_overlay);
    // Close on backdrop click
    _overlay.addEventListener("click", function(e){
      if(e.target === _overlay) closeManager();
    });
    // Inject styles into page
    var style = document.createElement("style");
    style.id  = "__devToolsStyles";
    style.textContent = managerCSS();
    document.head.appendChild(style);
    // Wire up all the manager logic
    initManagerLogic();
    refreshManagerScripts();
  }
  function closeManager(){
    if(_overlay) _overlay.style.display = "none";
  }

  function managerCSS(){
    return [
      "#__dtPanel{width:780px;max-width:96vw;height:540px;max-height:92vh;background:#18181b;border-radius:12px;border:1px solid #2e2e36;display:flex;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.7);animation:__dtFadeIn .15s}",
      "@keyframes __dtFadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}",
      "#__dtSb{width:200px;flex-shrink:0;background:#111113;border-right:1px solid #2e2e36;display:flex;flex-direction:column;padding:16px 0}",
      "#__dtSb .logo{padding:4px 20px 18px;font-size:17px;font-weight:300;color:#e4e4e7;letter-spacing:-.3px}",
      "#__dtSb .logo b{color:#6366f1;font-weight:700}",
      "#__dtSb .ni{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;border-radius:0 20px 20px 0;margin-right:8px;font-size:13px;color:#a1a1aa;transition:background .12s,color .12s;user-select:none}",
      "#__dtSb .ni:hover{background:#1e1e24;color:#e4e4e7}",
      "#__dtSb .ni.on{background:#26263a;color:#818cf8;font-weight:500}",
      "#__dtSb .ni .ic{width:16px;text-align:center}",
      "#__dtMain{flex:1;overflow-y:auto;padding:24px 28px 36px;scrollbar-width:thin;scrollbar-color:#2e2e36 transparent}",
      "#__dtMain h2{font-size:13px;font-weight:500;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #2e2e36}",
      "#__dtMain .sec{display:none}#__dtMain .sec.on{display:block}",
      ".dt-card{background:#111113;border-radius:8px;border:1px solid #2e2e36;overflow:hidden;margin-bottom:18px}",
      ".dt-ch{font-size:10px;font-weight:600;color:#52525b;letter-spacing:.1em;text-transform:uppercase;padding:12px 16px 4px}",
      ".dt-fa{padding:12px 16px 14px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #27272a}",
      ".dt-ff{display:flex;gap:8px;align-items:center}",
      "#__dtFs{flex:1;font-size:12px;color:#6366f1}",
      ".__dtIn{border:1px solid #2e2e36;border-radius:6px;padding:7px 10px;font-family:inherit;font-size:13px;outline:none;color:#e4e4e7;width:100%;background:#18181b;transition:border-color .15s}",
      ".__dtIn:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.18)}",
      ".__dtTa{border:1px solid #2e2e36;border-radius:6px;padding:8px 10px;font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;outline:none;color:#e4e4e7;resize:vertical;width:100%;line-height:1.55;background:#18181b;transition:border-color .15s}",
      ".__dtTa:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.18)}",
      ".dt-btn{padding:6px 16px;border-radius:6px;font-size:12px;font-family:inherit;cursor:pointer;font-weight:500;border:none;transition:background .15s}",
      ".dt-bp{background:#6366f1;color:#fff}.dt-bp:hover{background:#4f52d9}",
      ".dt-bg{background:transparent;color:#818cf8;border:1px solid #2e2e36}.dt-bg:hover{background:#1e1e30;border-color:#6366f1}",
      ".dt-bd{background:transparent;color:#ef4444;border:1px solid #2e2e36}.dt-bd:hover{background:#2a1212;border-color:#ef4444}",
      ".dt-sr{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #27272a;transition:background .1s}",
      ".dt-sr:last-child{border-bottom:none}.dt-sr:hover{background:#18181b}",
      ".dt-sn{font-size:13px;font-weight:500;color:#e4e4e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dt-sn.dim{color:#52525b}",
      ".dt-sd{font-size:11px;color:#52525b;margin-top:1px}",
      ".dt-empty{padding:28px;text-align:center;color:#52525b;font-size:13px}",
      ".dt-tog{position:relative;width:34px;height:19px;flex-shrink:0;cursor:pointer}",
      ".dt-tog input{opacity:0;width:0;height:0;position:absolute}",
      ".dt-ttr{position:absolute;inset:0;background:#2e2e36;border-radius:10px;transition:background .2s}",
      ".dt-tog input:checked+.dt-ttr{background:#6366f1}",
      ".dt-tth{position:absolute;width:13px;height:13px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.4)}",
      ".dt-tog input:checked~.dt-tth{transform:translateX(15px)}",
      ".dt-kr{display:flex;align-items:center;gap:16px;padding:11px 16px;border-bottom:1px solid #27272a}",
      ".dt-kr:last-child{border-bottom:none}",
      ".dt-kbd{background:#1e1e24;border:1px solid #2e2e36;border-radius:4px;padding:4px 11px;font-family:monospace;font-size:12px;white-space:nowrap;min-width:160px;text-align:center;color:#a78bfa}",
      ".dt-kdesc{font-size:13px;color:#a1a1aa}",
      ".dt-close{position:absolute;top:0;right:0;background:none;border:none;color:#52525b;font-size:22px;cursor:pointer;padding:10px 14px;line-height:1;transition:color .15s}",
      ".dt-close:hover{color:#e4e4e7}",
      ".dt-push-row{display:flex;gap:8px;align-items:center}",
      ".dt-push-row .__dtIn{flex:1}"
    ].join("\n");
  }

  function buildManagerHTML(){
    return '<div id="__dtPanel" style="position:relative">'
      +'<button class="dt-close" id="__dtClose" title="Close (Esc)">&times;</button>'
      +'<div id="__dtSb">'
        +'<div class="logo">Dev<b>Tools</b></div>'
        +'<div class="ni on" data-s="scripts"><i class="ic">&#9998;</i> Scripts</div>'
        +'<div class="ni" data-s="push"><i class="ic">&#8593;</i> Push Storage</div>'
        +'<div class="ni" data-s="keys"><i class="ic">&#9000;</i> Keybinds</div>'
      +'</div>'
      +'<div id="__dtMain">'
        // Scripts
        +'<div id="__dt-sec-scripts" class="sec on">'
          +'<h2>Scripts</h2>'
          +'<div class="dt-card">'
            +'<div class="dt-ch">Add / Edit</div>'
            +'<div class="dt-fa">'
              +'<input id="__dtNameF" class="__dtIn" type="text" placeholder="Script name">'
              +'<input id="__dtDomF"  class="__dtIn" type="text" placeholder="Domain — blank = all sites, e.g. example.com or *.example.com">'
              +'<textarea id="__dtCodeF" class="__dtTa" rows="8" placeholder="// JavaScript..."></textarea>'
              +'<div class="dt-ff">'
                +'<span id="__dtFs"></span>'
                +'<button class="dt-btn dt-bg" id="__dtRunBtn">Run on page</button>'
                +'<button class="dt-btn dt-bp" id="__dtSaveBtn">Save</button>'
              +'</div>'
            +'</div>'
            +'<div id="__dtSList"></div>'
          +'</div>'
        +'</div>'
        // Push Storage
        +'<div id="__dt-sec-push" class="sec">'
          +'<h2>Push Scripts to Another Site</h2>'
          +'<div class="dt-card">'
            +'<div class="dt-ch">Target origin</div>'
            +'<div class="dt-fa">'
              +'<div class="dt-push-row">'
                +'<input id="__dtPushUrl" class="__dtIn" type="text" placeholder="https://example.com">'
                +'<button class="dt-btn dt-bp" id="__dtPushBtn">Push Scripts</button>'
              +'</div>'
              +'<div style="font-size:11px;color:#52525b;line-height:1.6">Opens a tiny hidden window to the target site, sets its localStorage key <code style="background:#1e1e24;padding:1px 5px;border-radius:3px;color:#a78bfa">__devToolsScripts</code> to match this page\'s scripts, then closes. The target site must have devTools.js injected for scripts to run.</div>'
            +'</div>'
          +'</div>'
        +'</div>'
        // Keybinds
        +'<div id="__dt-sec-keys" class="sec">'
          +'<h2>Keyboard Shortcuts</h2>'
          +'<div class="dt-card">'
            +'<div class="dt-kr"><span class="dt-kbd">Ctrl + `</span><span class="dt-kdesc">Open / hide this manager</span></div>'
            +'<div class="dt-kr"><span class="dt-kbd">Ctrl + Shift + I</span><span class="dt-kdesc">Toggle Chii remote debugger</span></div>'
            +'<div class="dt-kr"><span class="dt-kbd">Ctrl + V</span><span class="dt-kdesc">Run a <code style="background:#1e1e24;padding:1px 4px;border-radius:3px;color:#a78bfa">javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>'
            +'<div class="dt-kr"><span class="dt-kbd">Esc</span><span class="dt-kdesc">Close this manager</span></div>'
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>';
  }

  function initManagerLogic(){
    // Nav
    _overlay.querySelectorAll("#__dtSb .ni").forEach(function(ni){
      ni.addEventListener("click", function(){
        _overlay.querySelectorAll("#__dtSb .ni").forEach(function(n){ n.classList.remove("on"); });
        _overlay.querySelectorAll("#__dtMain .sec").forEach(function(s){ s.classList.remove("on"); });
        ni.classList.add("on");
        var sec = _overlay.querySelector("#__dt-sec-"+ni.getAttribute("data-s"));
        if(sec) sec.classList.add("on");
      });
    });

    // Close button & Esc (only when overlay is open)
    _overlay.querySelector("#__dtClose").addEventListener("click", closeManager);

    // Pre-fill name with random suggestion
    var nameF = _overlay.querySelector("#__dtNameF");
    nameF.placeholder = randomName();

    // Pre-fill domain with current host
    _overlay.querySelector("#__dtDomF").value = location.hostname;

    // Save button
    _overlay.querySelector("#__dtSaveBtn").addEventListener("click", function(){
      var name = nameF.value.trim() || nameF.placeholder;
      var domain = _overlay.querySelector("#__dtDomF").value.trim();
      var code   = _overlay.querySelector("#__dtCodeF").value.trim();
      if(!code){ setSt("Code is required.","#ef4444"); return; }
      var scripts = loadScripts();
      var idx = -1;
      scripts.forEach(function(s,i){ if(s.name===name) idx=i; });
      var entry = { name:name, domain:domain, code:code, enabled:true };
      if(idx>=0) scripts[idx]=entry; else scripts.push(entry);
      saveScripts(scripts);
      refreshManagerScripts();
      setSt("Saved \u2713","#22c55e");
      nameF.value = "";
      nameF.placeholder = randomName();
      _overlay.querySelector("#__dtDomF").value = location.hostname;
      _overlay.querySelector("#__dtCodeF").value = "";
      // Run immediately on this page
      try{ Function(code)(); }catch(e){ console.error("[devTools]", e); }
    });

    // Run on page
    _overlay.querySelector("#__dtRunBtn").addEventListener("click", function(){
      var code = _overlay.querySelector("#__dtCodeF").value.trim();
      if(!code) return;
      try{ Function(code)(); setSt("Ran \u2713","#22c55e"); }
      catch(e){ setSt("Error: "+e.message,"#ef4444"); }
    });

    // Push storage button
    _overlay.querySelector("#__dtPushBtn").addEventListener("click", function(){
      var url = _overlay.querySelector("#__dtPushUrl").value.trim();
      if(!url){ setSt("Enter a URL.","#ef4444"); return; }
      try{
        var origin = new URL(url).origin;
        var scripts = loadScripts();
        pushStorageToSite(origin, STORE_KEY, JSON.stringify(scripts));
        setSt("Pushing to "+origin+"…","#6366f1");
      }catch(e){ setSt("Invalid URL","#ef4444"); }
    });
  }

  function refreshManagerScripts(){
    if(!_overlay) return;
    var container = _overlay.querySelector("#__dtSList");
    if(!container) return;
    while(container.firstChild) container.removeChild(container.firstChild);
    var scripts = loadScripts();
    if(!scripts.length){
      var em = document.createElement("div");
      em.className = "dt-empty";
      em.textContent = "No scripts yet. Add one above.";
      container.appendChild(em);
      return;
    }
    scripts.forEach(function(s,i){
      var row  = document.createElement("div"); row.className = "dt-sr";
      var lbl  = document.createElement("label"); lbl.className = "dt-tog";
      var cb   = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!s.enabled;
      var ttr  = document.createElement("span"); ttr.className = "dt-ttr";
      var tth  = document.createElement("span"); tth.className = "dt-tth";
      lbl.appendChild(cb); lbl.appendChild(ttr); lbl.appendChild(tth);

      var info = document.createElement("div"); info.style.cssText = "flex:1;min-width:0";
      var nm   = document.createElement("div"); nm.className = "dt-sn"+(s.enabled?"":" dim"); nm.textContent = s.name;
      var dm   = document.createElement("div"); dm.className = "dt-sd"; dm.textContent = s.domain||"all sites";
      info.appendChild(nm); info.appendChild(dm);

      cb.onchange = (function(idx, nmEl){ return function(){
        var arr = loadScripts();
        arr[idx].enabled = this.checked;
        nmEl.className = "dt-sn"+(this.checked?"":" dim");
        saveScripts(arr);
      }; })(i, nm);

      var eb = document.createElement("button"); eb.className = "dt-btn dt-bg"; eb.textContent = "Edit";
      eb.onclick = (function(sc){ return function(){
        var nameF = _overlay.querySelector("#__dtNameF");
        nameF.value = sc.name;
        _overlay.querySelector("#__dtDomF").value  = sc.domain||"";
        _overlay.querySelector("#__dtCodeF").value = sc.code;
        nameF.focus();
        // Switch to scripts tab
        _overlay.querySelectorAll("#__dtSb .ni").forEach(function(n){ n.classList.remove("on"); });
        _overlay.querySelectorAll("#__dtMain .sec").forEach(function(s){ s.classList.remove("on"); });
        _overlay.querySelector("[data-s='scripts']").classList.add("on");
        _overlay.querySelector("#__dt-sec-scripts").classList.add("on");
      }; })(s);

      var db = document.createElement("button"); db.className = "dt-btn dt-bd"; db.textContent = "Del";
      db.onclick = (function(idx, name){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var arr = loadScripts();
        arr.splice(idx,1);
        saveScripts(arr);
        refreshManagerScripts();
      }; })(i, s.name);

      row.appendChild(lbl); row.appendChild(info); row.appendChild(eb); row.appendChild(db);
      container.appendChild(row);
    });
  }

  function setSt(msg, color){
    var el = _overlay && _overlay.querySelector("#__dtFs");
    if(!el) return;
    el.textContent = msg;
    el.style.color = color||"#6b7280";
    if(msg) setTimeout(function(){ if(el && el.textContent===msg) el.textContent=""; }, 2500);
  }

  // ── Init ─────────────────────────────────────────────────────────
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded", runStoredScripts);
  else
    runStoredScripts();

  // ── Shortcuts ─────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement||{}).tagName;
    var typing = tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";

    // Esc closes manager if open
    if(e.key==="Escape" && _overlay && _overlay.style.display!=="none"){
      closeManager(); return;
    }
    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key==="I"){
      if(typing) return;
      e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.code==="Backquote"){
      e.preventDefault(); openManager(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key==="v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
