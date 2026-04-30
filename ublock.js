/// ublock.js
!function(){
  var chiiState = 0;
  var managerOpen = false;
  var managerEl = null;

  // ── Storage ──────────────────────────────────────────────────────
  // Scripts are stored in the localStorage of the GitHub Pages origin,
  // so they're the same no matter which site this script runs on.
  // If the site's CSP blocks the iframe, falls back to page localStorage.

  var STORAGE_URL  = "https://studiocompile.github.io/Ublock-features/storage.html";
  var STORE_KEY    = "__devToolsScripts";
  var CACHE_KEY    = "__devToolsScripts_cache"; // local fallback
  var NS           = STORE_KEY;
  var IFRAME_TIMEOUT = 3000; // ms before giving up on iframe

  var _cache   = null;
  var _frame   = null;
  var _ready   = false;
  var _failed  = false;
  var _pending = {};
  var _msgId   = 0;
  var _queue   = [];

  // Inject hidden iframe, give it IFRAME_TIMEOUT ms to load
  (function(){
    var timer = setTimeout(function(){
      if(!_ready){ _failed = true; _runQueue(); }
    }, IFRAME_TIMEOUT);

    var f = document.createElement("iframe");
    f.src = STORAGE_URL;
    f.style.cssText = "display:none!important;position:fixed;width:0;height:0;border:0";
    function attach(){
      document.body.appendChild(f);
      _frame = f;
      f.addEventListener("load", function(){
        clearTimeout(timer);
        _ready = true;
        _runQueue();
      });
    }
    document.body ? attach() : document.addEventListener("DOMContentLoaded", attach);
  })();

  function _runQueue(){
    _queue.forEach(function(fn){ fn(); });
    _queue = [];
  }

  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || d.ns !== NS || !d.id) return;
    var cb = _pending[d.id];
    if(cb){ delete _pending[d.id]; cb(d); }
  });

  function _send(action, value, cb){
    var id = ++_msgId;
    _pending[id] = cb || function(){};
    function go(){
      if(_failed){
        // Iframe blocked — simulate response using page localStorage
        var reply = { ns: NS, id: id };
        if(action === "get") reply.value = localStorage.getItem(STORE_KEY) || "[]";
        else if(action === "set") localStorage.setItem(STORE_KEY, value);
        (_pending[id] || function(){})(reply);
        delete _pending[id];
      } else {
        _frame.contentWindow.postMessage(
          { ns: NS, id: id, action: action, key: STORE_KEY, value: value }, "*"
        );
      }
    }
    (_ready || _failed) ? go() : _queue.push(go);
  }

  // Always write to both iframe storage AND local cache so reads are instant
  function fetchScripts(cb){
    // Return local cache immediately so UI doesn't wait
    var local = [];
    try{ local = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); }catch(e){}
    if(local.length && _cache === null){ _cache = local; }

    _send("get", null, function(msg){
      try{ _cache = JSON.parse(msg.value || "[]"); }catch(e){ _cache = []; }
      localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
      cb(_cache);
    });
  }

  function loadScripts(){ return _cache || []; }

  function saveScripts(arr, cb){
    _cache = arr;
    localStorage.setItem(CACHE_KEY, JSON.stringify(arr));
    _send("set", JSON.stringify(arr), function(){ if(cb) cb(); });
  }

  // ── Chii ────────────────────────────────────────────────────────
  function getChiiFrame(){
    return [].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{
        var u = new URL(HTMLElement.prototype.getAttribute.call(f,"src"));
        return u.host === "chii.liriliri.io" && u.pathname === "/front_end/chii_app.html";
      }catch(e){ return false; }
    })[0];
  }
  function showChii(){
    var f = getChiiFrame(); if(!f) return;
    f.parentNode.style.display = "";
    document.body.style.height = (document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight/2) || 100
    )) + "px";
  }
  function toggleChii(){
    var f = getChiiFrame(); if(!f) return;
    var hidden = window.getComputedStyle(f.parentNode, null).display === "none";
    f.parentNode.style.display = hidden ? "" : "none";
    document.body.style.height = hidden ? (document.documentElement.clientHeight - Math.floor(
      Number(localStorage["chii-embedded-height"] || document.documentElement.clientHeight/2) || 100
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
    var t = (text||"").trim();
    if(!t.match(/^javascript:/i)) return false;
    try{ Function(t.replace(/^javascript:/i, ""))(); }
    catch(e){ alert("Bookmarklet error:\n" + e); }
    return true;
  }

  // ── Domain matching ──────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname;
    return pattern.trim().split(",").map(function(p){ return p.trim(); }).some(function(p){
      if(!p) return true;
      if(p.indexOf("*.") === 0) return host === p.slice(2) || host.endsWith("." + p.slice(2));
      return host === p || host.endsWith("." + p);
    });
  }

  function runStoredScripts(){
    fetchScripts(function(scripts){
      scripts.forEach(function(s){
        if(s.enabled && matchesDomain(s.domain)){
          try{ Function(s.code)(); }
          catch(e){ console.warn("[devTools]", s.name, ":", e); }
        }
      });
    });
  }

  // ── UI ───────────────────────────────────────────────────────────
  var C = {
    bg:          "#ffffff",
    panel:       "#f7f7f8",
    border:      "#e5e5e5",
    accent:      "#15c39a",
    text:        "#1a1a1a",
    sub:         "#555555",
    muted:       "#aaaaaa",
    danger:      "#e53935",
    input:       "#ffffff",
    shadow:      "0 8px 30px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.08)",
    font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono:        "'Consolas','Menlo','Monaco', monospace"
  };

  function mk(tag, css, props){
    var e = document.createElement(tag);
    if(css)   Object.keys(css).forEach(function(k){ e.style[k] = css[k]; });
    if(props) Object.keys(props).forEach(function(k){ e[k] = props[k]; });
    return e;
  }
  function apx(p){
    [].slice.call(arguments, 1).forEach(function(c){ p.appendChild(c); });
    return p;
  }

  function field(ph, multi){
    var base = {
      background: C.input, border: "1px solid #d8d8d8", color: C.text,
      borderRadius: "7px", padding: "7px 10px",
      fontFamily: multi ? C.mono : C.font,
      fontSize: multi ? "12px" : "13px",
      width: "100%", boxSizing: "border-box", outline: "none"
    };
    var e;
    if(multi){
      e = mk("textarea", base, { placeholder: ph, rows: 6, spellcheck: false });
      e.style.resize = "vertical";
    } else {
      e = mk("input", base, { placeholder: ph, type: "text" });
    }
    e.addEventListener("focus", function(){
      this.style.borderColor = C.accent;
      this.style.boxShadow = "0 0 0 3px rgba(21,195,154,.15)";
    });
    e.addEventListener("blur", function(){
      this.style.borderColor = "#d8d8d8";
      this.style.boxShadow = "none";
    });
    return e;
  }

  function btn(label, primary){
    var e = mk("button", {
      background:  primary ? C.accent : "transparent",
      border:      "1px solid " + (primary ? C.accent : "#d0d0d0"),
      color:       primary ? "#fff" : C.sub,
      borderRadius:"7px", padding: "6px 16px",
      fontSize: "13px", fontFamily: C.font,
      fontWeight: primary ? "600" : "400",
      cursor: "pointer", whiteSpace: "nowrap"
    });
    e.textContent = label;
    e.addEventListener("mouseover", function(){ this.style.opacity = ".8"; });
    e.addEventListener("mouseout",  function(){ this.style.opacity = "1"; });
    return e;
  }

  // ── List ─────────────────────────────────────────────────────────
  function renderList(list, loading){
    while(list.firstChild) list.removeChild(list.firstChild);

    if(loading){
      var spin = mk("div",{ color: C.muted, padding: "24px", fontSize: "13px",
        textAlign: "center", fontFamily: C.font });
      spin.textContent = "Loading…";
      list.appendChild(spin); return;
    }

    var scripts = loadScripts();
    if(!scripts.length){
      var empty = mk("div",{ color: C.muted, padding: "24px", fontSize: "13px",
        textAlign: "center", fontFamily: C.font });
      empty.textContent = "No scripts yet.";
      list.appendChild(empty); return;
    }

    scripts.forEach(function(s, i){
      var row = mk("div",{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 14px", borderBottom: "1px solid " + C.border,
        background: "#fff"
      });
      row.addEventListener("mouseover", function(){ this.style.background = "#fafafa"; });
      row.addEventListener("mouseout",  function(){ this.style.background = "#fff"; });

      var cb = mk("input",{ cursor: "pointer", flexShrink: "0", accentColor: C.accent },{ type: "checkbox" });
      cb.checked = !!s.enabled;
      cb.onchange = function(){
        var arr = loadScripts(); arr[i].enabled = this.checked; saveScripts(arr);
      };

      var info = mk("div",{ flex: "1", minWidth: "0" });
      var name = mk("div",{
        color: s.enabled ? C.text : C.muted, fontSize: "13px",
        fontFamily: C.font, fontWeight: "500",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
      });
      name.textContent = s.name;
      var dom = mk("div",{ color: C.muted, fontSize: "11px", fontFamily: C.font, marginTop: "2px" });
      dom.textContent = s.domain || "all sites";
      apx(info, name, dom);

      var editB = btn("Edit");
      editB.style.padding = "4px 12px";
      editB.style.fontSize = "12px";
      editB.onclick = function(){
        managerEl.__name.value   = s.name;
        managerEl.__domain.value = s.domain || "";
        managerEl.__code.value   = s.code;
        managerEl.__name.focus();
      };

      var delB = mk("button",{
        background: "none", border: "none", color: C.muted,
        fontSize: "18px", cursor: "pointer", padding: "0", lineHeight: "1",
        fontFamily: C.font
      });
      delB.textContent = "×";
      delB.addEventListener("mouseover", function(){ this.style.color = C.danger; });
      delB.addEventListener("mouseout",  function(){ this.style.color = C.muted; });
      delB.onclick = function(){
        if(!confirm('Delete "' + s.name + '"?')) return;
        var arr = loadScripts(); arr.splice(i, 1);
        saveScripts(arr, function(){ renderList(list); });
      };

      apx(row, cb, info, editB, delB);
      list.appendChild(row);
    });
  }

  // ── Drag ─────────────────────────────────────────────────────────
  function draggable(wrap, handle){
    var dx=0, dy=0, mx=0, my=0;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", function(e){
      if(e.target.tagName === "BUTTON") return;
      e.preventDefault(); mx = e.clientX; my = e.clientY;
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    function move(e){
      dx = mx - e.clientX; dy = my - e.clientY;
      mx = e.clientX; my = e.clientY;
      wrap.style.top  = (wrap.offsetTop  - dy) + "px";
      wrap.style.left = (wrap.offsetLeft - dx) + "px";
      wrap.style.right = "auto";
    }
    function up(){
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    }
  }

  // ── Manager ──────────────────────────────────────────────────────
  function buildManager(){
    if(managerEl) return;
    var wrap = mk("div",{
      position: "fixed", top: "48px", right: "48px",
      width: "420px", maxHeight: "560px",
      background: C.bg, border: "1px solid " + C.border,
      borderRadius: "12px", boxShadow: C.shadow,
      zIndex: "2147483647", display: "none",
      flexDirection: "column", overflow: "hidden",
      fontFamily: C.font
    });

    // header
    var bar = mk("div",{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 14px", height: "46px",
      background: C.panel, borderBottom: "1px solid " + C.border,
      flexShrink: "0", userSelect: "none",
      borderRadius: "12px 12px 0 0"
    });
    var titleRow = mk("div",{ display: "flex", alignItems: "center", gap: "8px" });
    var dot = mk("div",{ width: "9px", height: "9px", borderRadius: "50%", background: C.accent });
    var titleTxt = mk("span",{ color: C.text, fontSize: "14px", fontWeight: "600" });
    titleTxt.textContent = "Script Manager";
    apx(titleRow, dot, titleTxt);
    var closeB = mk("button",{
      background: "none", border: "none", color: C.muted,
      fontSize: "20px", cursor: "pointer", lineHeight: "1", padding: "0"
    });
    closeB.textContent = "×";
    closeB.addEventListener("mouseover", function(){ this.style.color = C.text; });
    closeB.addEventListener("mouseout",  function(){ this.style.color = C.muted; });
    closeB.onclick = closeManager;
    apx(bar, titleRow, closeB);
    draggable(wrap, bar);

    // form
    var form = mk("div",{
      padding: "12px 14px", borderBottom: "1px solid " + C.border,
      display: "flex", flexDirection: "column", gap: "8px",
      flexShrink: "0", background: C.panel
    });
    var row1 = mk("div",{ display: "flex", gap: "8px" });
    var nameF   = field("Script name");  nameF.style.flex = "2";
    var domainF = field("Domain (optional)"); domainF.style.flex = "1";
    apx(row1, nameF, domainF);
    var codeF = field("// JavaScript code…", true);
    var actions = mk("div",{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" });
    var statusEl = mk("span",{ color: C.muted, fontSize: "11px", flex: "1" });
    var runB  = btn("Run");
    var saveB = btn("Save", true);
    apx(actions, statusEl, runB, saveB);
    apx(form, row1, codeF, actions);

    // list
    var list = mk("div",{ overflowY: "auto", flex: "1" });
    apx(wrap, bar, form, list);
    document.body.appendChild(wrap);

    managerEl = wrap;
    wrap.__name   = nameF;
    wrap.__domain = domainF;
    wrap.__code   = codeF;
    wrap.__list   = list;

    function setStatus(msg, color){
      statusEl.textContent = msg; statusEl.style.color = color || C.muted;
      if(msg) setTimeout(function(){ if(statusEl.textContent === msg) statusEl.textContent = ""; }, 3000);
    }

    saveB.onclick = function(){
      var name   = nameF.value.trim();
      var domain = domainF.value.trim();
      var code   = codeF.value.trim();
      if(!name || !code){ alert("Name and code are required."); return; }
      saveB.disabled = true;
      setStatus("Saving…");
      var arr = loadScripts();
      var idx = -1; arr.forEach(function(s, i){ if(s.name === name) idx = i; });
      var entry = { name: name, domain: domain, code: code, enabled: true };
      if(idx >= 0) arr[idx] = entry; else arr.push(entry);
      saveScripts(arr, function(){
        saveB.disabled = false;
        setStatus("Saved ✓", C.accent);
        nameF.value = ""; domainF.value = ""; codeF.value = "";
        renderList(list);
        if(matchesDomain(domain)){
          try{ Function(code)(); }catch(e){ console.warn("[devTools] run on save:", e); }
        }
      });
    };

    runB.onclick = function(){
      var code = codeF.value.trim(); if(!code) return;
      try{ Function(code)(); }catch(e){ alert("Error:\n" + e); }
    };

    renderList(list);
  }

  function openManager(){
    buildManager();
    managerEl.style.display = "flex";
    managerOpen = true;
    // Show local cache instantly, then sync from iframe
    if(_cache && _cache.length) renderList(managerEl.__list);
    else renderList(managerEl.__list, true);
    fetchScripts(function(){ renderList(managerEl.__list); });
  }
  function closeManager(){
    if(managerEl) managerEl.style.display = "none";
    managerOpen = false;
  }

  // ── Init ─────────────────────────────────────────────────────────
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", runStoredScripts);
  else runStoredScripts();

  // ── Shortcuts ────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag = (document.activeElement || {}).tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key === "I"){
      if(typing) return; e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "`" || e.key === "~")){
      e.preventDefault(); managerOpen ? closeManager() : openManager(); return;
    }
    if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });
}();
