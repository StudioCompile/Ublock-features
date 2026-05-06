/// devTools.js
!function(){
  var chiiState   = 0;
  var _managerWin = null;

  var STORAGE_URL = "https://studiocompile.github.io/Ublock-features/storage.html";
  var NS          = "__devToolsScripts";
  var SCRIPTS_KEY = "scripts";

  // ── Page-side iframe storage ──────────────────────────────────────
  // Warm up immediately so scripts load fast on page init.
  // The manager has its OWN separate iframe so it never depends
  // on this page having the data — it always reads directly.

  var _iframe = null, _ready = false, _pending = {}, _queue = [], _mid = 0;

  function initIframe(){
    if(_iframe) return;
    _iframe = document.createElement("iframe");
    _iframe.src = STORAGE_URL;
    _iframe.style.cssText = "display:none!important;position:fixed;width:0;height:0;border:none;z-index:-1";
    _iframe.addEventListener("load", function(){
      _ready = true;
      _queue.forEach(function(fn){ fn(); });
      _queue = [];
    });
    (document.body || document.documentElement).appendChild(_iframe);
  }

  function iframeSend(action, value, cb){
    var id = ++_mid;
    var entry = { cb: cb || function(){} };
    entry.timer = setTimeout(function(){
      delete _pending[id];
      entry.cb({ error: "timeout" });
    }, 5000);
    _pending[id] = entry;

    function go(){
      var msg = { ns: NS, id: id, action: action, key: SCRIPTS_KEY };
      if(action === "set") msg.value = value;
      try{ _iframe.contentWindow.postMessage(msg, "*"); }catch(e){}
    }
    _ready ? go() : _queue.push(go);
  }

  function readScripts(cb){
    iframeSend("get", null, function(d){
      try{ cb(JSON.parse(d.value || "[]")); }catch(e){ cb([]); }
    });
  }

  // ── postMessage listener ──────────────────────────────────────────
  window.addEventListener("message", function(e){
    var d = e.data;

    // Reply from this page's storage iframe
    if(d && d.ns === NS && d.id && _pending[d.id]){
      var entry = _pending[d.id];
      clearTimeout(entry.timer);
      delete _pending[d.id];
      entry.cb(d);
      return;
    }

    if(!d) return;

    // Manager: run code on this page right now
    if(d.type === "devtools_run"){
      try{ Function(d.code)(); }catch(err){ console.error("[devTools]", err); }
    }

    // Manager saved scripts — update our iframe storage so the
    // next runStoredScripts() on this page sees the new data
    if(d.type === "devtools_update"){
      iframeSend("set", JSON.stringify(d.scripts));
    }
  });

  // ── Domain + path matching ────────────────────────────────────────
  // Pattern examples:
  //   ""                  → all sites
  //   "example.com"       → any path on example.com
  //   "example.com/shop"  → only paths under /shop on example.com
  //   "*.example.com"     → all subdomains
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname;
    var path = location.pathname;

    return pattern.trim().split(",").some(function(p){
      p = p.trim();
      if(!p || p === "*") return true;

      var slash    = p.indexOf("/");
      var hostPart = slash === -1 ? p         : p.slice(0, slash);
      var pathPart = slash === -1 ? ""        : p.slice(slash);

      var hostMatch;
      if(hostPart.indexOf("*.") === 0){
        hostMatch = host === hostPart.slice(2) || host.endsWith("." + hostPart.slice(2));
      } else {
        hostMatch = host === hostPart;
      }

      if(!hostMatch) return false;
      if(!pathPart)  return true;

      // Path must equal or start with the given prefix (as a directory)
      var norm = pathPart.endsWith("/") ? pathPart : pathPart + "/";
      return path === pathPart || path.startsWith(norm);
    });
  }

  // ── Run scripts on page load ──────────────────────────────────────
  function runStoredScripts(){
    initIframe();
    readScripts(function(scripts){
      scripts.forEach(function(s){
        if(s.enabled && matchesDomain(s.domain)){
          try{ Function(s.code)(); }
          catch(e){ console.warn("[devTools]", s.name, ":", e); }
        }
      });
    });
  }

  // ── Chii ─────────────────────────────────────────────────────────
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
    var hidden = window.getComputedStyle(f.parentNode,null).display === "none";
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

  // ── Bookmarklet ───────────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text||"").trim();
    if(!t.match(/^javascript:/i)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Open manager ──────────────────────────────────────────────────
  function openManager(){
    // Capture opener hostname before opening the tab
    var openerHost = location.hostname;
    if(_managerWin && !_managerWin.closed){ _managerWin.focus(); return; }
    _managerWin = window.open("about:blank", "_blank");
    var doc = _managerWin.document;
    doc.open();
    doc.write(managerHTML(openerHost));
    doc.close();
  }

  // ── Manager HTML ──────────────────────────────────────────────────
  // The manager creates its OWN iframe to storage.html.
  // This means it always reads fresh data no matter which page
  // opened it — it never relies on the opener having scripts cached.
  function managerHTML(openerHost){
    var su = STORAGE_URL;
    var ns = NS;
    var sk = SCRIPTS_KEY;
    var oh = (openerHost || "").replace(/"/g, "");

    var css = ''
      + '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
      + 'html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;background:#f1f3f4;color:#202124}'
      + '#app{display:flex;height:100vh}'
      + '#sb{width:240px;flex-shrink:0;background:#fff;border-right:1px solid #e0e0e0;display:flex;flex-direction:column}'
      + '.logo{padding:20px 20px 16px;font-size:20px;font-weight:400;flex-shrink:0}'
      + '.logo b{color:#1a73e8;font-weight:600}'
      + '.sb-nav{flex:1;overflow-y:auto;padding:4px 0}'
      + '.ni{display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;border-radius:0 24px 24px 0;margin-right:8px;font-size:13px;user-select:none;transition:background .1s;color:#202124}'
      + '.ni:hover{background:#f1f3f4}'
      + '.ni.on{background:#e8f0fe;color:#1a73e8;font-weight:500}'
      + '.ic{width:18px;text-align:center;font-style:normal}'
      + '#main{flex:1;overflow-y:auto;padding:28px 40px 48px}'
      + '.sec{display:none}.sec.on{display:block;animation:fi .15s}'
      + '@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'
      + 'h2{font-size:15px;font-weight:400;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e0e0e0}'
      + '.card{background:#fff;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden;margin-bottom:20px}'
      + '.ch{font-size:11px;font-weight:500;color:#80868b;letter-spacing:.06em;text-transform:uppercase;padding:14px 16px 0}'
      + '.fa{padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid #f1f3f4}'
      + '.hint{font-size:11px;color:#9aa0a6;margin-top:-4px}'
      + 'input[type=text]{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:inherit;font-size:13px;outline:none;color:#202124;width:100%;transition:border-color .15s,box-shadow .15s}'
      + 'input[type=text]:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
      + 'textarea{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;outline:none;color:#202124;resize:vertical;width:100%;line-height:1.5;transition:border-color .15s,box-shadow .15s}'
      + 'textarea:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
      + '.ff{display:flex;gap:8px;align-items:center}'
      + '#fs{flex:1;font-size:12px}'
      + '.btn{padding:7px 20px;border-radius:6px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;border:none;transition:background .15s}'
      + '.bp{background:#1a73e8;color:#fff}.bp:hover{background:#1765cc}.bp:disabled{opacity:.5;cursor:default}'
      + '.bg{background:transparent;color:#1a73e8;border:1px solid #dadce0}.bg:hover{background:#f0f6ff;border-color:#1a73e8}'
      + '.sm{padding:5px 13px;font-size:12px}'
      + '.sr{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f3f4;transition:background .1s}'
      + '.sr:last-child{border-bottom:none}.sr:hover{background:#fafafa}'
      + '.sn{font-size:13px;font-weight:500;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.sn.dim{color:#80868b}'
      + '.sd{font-size:11px;color:#80868b;margin-top:2px}'
      + '.sx{background:none;border:none;color:#dadce0;font-size:20px;cursor:pointer;padding:0;line-height:1;transition:color .15s;flex-shrink:0}'
      + '.sx:hover{color:#ea4335}'
      + '.empty{padding:32px;text-align:center;color:#80868b;font-size:13px}'
      + '.loading{padding:32px;text-align:center;color:#9aa0a6;font-size:13px}'
      + '.tog{position:relative;width:36px;height:20px;flex-shrink:0;cursor:pointer}'
      + '.tog input{opacity:0;width:0;height:0;position:absolute}'
      + '.ttr{position:absolute;inset:0;background:#dadce0;border-radius:10px;transition:background .2s}'
      + '.tog input:checked+.ttr{background:#1a73e8}'
      + '.tth{position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}'
      + '.tog input:checked~.tth{transform:translateX(16px)}'
      + '.kr{display:flex;align-items:center;gap:16px;padding:13px 16px;border-bottom:1px solid #f1f3f4}'
      + '.kr:last-child{border-bottom:none}'
      + '.kbd{background:#f8f9fa;border:1px solid #dadce0;border-radius:4px;padding:4px 11px;font-family:monospace;font-size:12px;white-space:nowrap;min-width:140px;text-align:center;color:#202124}'
      + '.fr{padding:14px 16px;border-bottom:1px solid #f1f3f4}.fr:last-child{border-bottom:none}'
      + '.ft{font-size:13px;font-weight:500;margin-bottom:4px}'
      + '.fd{font-size:12px;color:#80868b;line-height:1.6}'
      + 'code{font-family:monospace;background:#f1f3f4;padding:1px 4px;border-radius:3px;font-size:11px}';

    var html = ''
      + '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>DevTools</title>'
      + '<style>' + css + '</style></head><body><div id="app">'
      + '<div id="sb"><div class="logo">Dev<b>Tools</b></div><nav class="sb-nav">'
      + '<div class="ni on" data-s="scripts" onclick="go(this)"><i class="ic">&#9998;</i>Scripts</div>'
      + '<div class="ni" data-s="keys" onclick="go(this)"><i class="ic">&#9000;</i>Keybinds</div>'
      + '<div class="ni" data-s="about" onclick="go(this)"><i class="ic">&#9432;</i>Features</div>'
      + '</nav></div>'
      + '<div id="main">'

      // Scripts section
      + '<div id="sec-scripts" class="sec on"><h2>Scripts</h2><div class="card">'
      + '<div class="ch">Add / Edit Script</div>'
      + '<div class="fa">'
      + '<input type="text" id="nameF" placeholder="Script name">'
      + '<div>'
      + '<input type="text" id="domF" placeholder="e.g. example.com or example.com/shop">'
      + '<div class="hint">Leave blank to run on every site &bull; add a path to narrow down (e.g. example.com/checkout)</div>'
      + '</div>'
      + '<textarea id="codeF" rows="9" placeholder="// JavaScript..."></textarea>'
      + '<div class="ff"><span id="fs"></span>'
      + '<button class="btn bg sm" onclick="runOnPage()">Run on page</button>'
      + '<button class="btn bp sm" id="saveBtn" onclick="doSave()">Save</button>'
      + '</div></div>'
      + '<div id="sList"><div class="loading">Loading scripts\u2026</div></div>'
      + '</div></div>'

      // Keybinds section
      + '<div id="sec-keys" class="sec"><h2>Keyboard Shortcuts</h2><div class="card">'
      + '<div class="kr"><span class="kbd">Ctrl + `</span><span>Open this manager tab</span></div>'
      + '<div class="kr"><span class="kbd">Ctrl + Shift + I</span><span>Toggle Chii remote debugger on the page</span></div>'
      + '<div class="kr"><span class="kbd">Ctrl + V</span><span>Run a <code>javascript:</code> bookmarklet from clipboard (when not in a text field)</span></div>'
      + '<div class="kr"><span class="kbd">Esc</span><span>Close this tab</span></div>'
      + '</div></div>'

      // Features section
      + '<div id="sec-about" class="sec"><h2>Features</h2><div class="card">'
      + '<div class="fr"><div class="ft">Script Manager</div><div class="fd">'
      + 'Save JS snippets that auto-run on matching pages every time devTools.js is injected. '
      + 'Works on every site. Domain field supports <code>example.com</code> for whole-site matching, '
      + '<code>example.com/shop</code> to narrow to a path, or <code>*.example.com</code> for subdomains. '
      + 'Leave it blank to run everywhere.</div></div>'
      + '<div class="fr"><div class="ft">Global Storage</div><div class="fd">'
      + 'Scripts are stored in the localStorage of <code>studiocompile.github.io</code> via a hidden iframe. '
      + 'The manager has its own independent iframe — it always reads fresh data regardless of which site opened it. '
      + 'The same scripts appear no matter where you open the manager from.</div></div>'
      + '<div class="fr"><div class="ft">Chii Debugger</div><div class="fd">'
      + 'Injects a remote DevTools inspector panel into any page. Press Ctrl+Shift+I to toggle it.</div></div>'
      + '<div class="fr"><div class="ft">Bookmarklet Runner</div><div class="fd">'
      + 'Copy any <code>javascript:</code> URL then press Ctrl+V outside a text field to run it on the page.</div></div>'
      + '</div></div>'

      + '</div></div>'; // #main #app

    // ── Inline script ─────────────────────────────────────────────
    // Uses its own iframe to storage.html so it never depends on
    // the opener page — reads and writes directly, always in sync.
    var script = ''
      + 'var NS="' + ns + '",KEY="' + sk + '",STORAGE_URL="' + su + '",OPENER_HOST="' + oh + '";'
      + 'var scripts=[],sf=null,sfReady=false,sfQueue=[],mid=0,pend={};'

      // Create manager's own storage iframe
      + '(function(){'
      +   'sf=document.createElement("iframe");'
      +   'sf.src=STORAGE_URL;'
      +   'sf.style.cssText="display:none!important;position:fixed;width:0;height:0;border:none";'
      +   'sf.addEventListener("load",function(){'
      +     'sfReady=true;'
      +     'sfQueue.forEach(function(fn){fn();});sfQueue=[];'
      +     // Read scripts as soon as iframe is ready
      +     'sfGet(function(loaded){scripts=loaded;render();});'
      +   '});'
      +   'document.body.appendChild(sf);'
      + '})();'

      // postMessage listener — handles storage replies + run requests
      + 'window.addEventListener("message",function(e){'
      +   'var d=e.data;'
      +   'if(d&&d.ns===NS&&d.id&&pend[d.id]){'
      +     'var cb=pend[d.id];delete pend[d.id];cb(d);return;'
      +   '}'
      + '});'

      // sfGet — read scripts from storage iframe
      + 'function sfGet(cb){'
      +   'var id=++mid;pend[id]=function(d){try{cb(JSON.parse(d.value||"[]"));}catch(e){cb([]);}};'
      +   'var msg={ns:NS,id:id,action:"get",key:KEY};'
      +   'sfReady?sf.contentWindow.postMessage(msg,"*"):sfQueue.push(function(){sf.contentWindow.postMessage(msg,"*");});'
      + '}'

      // sfSet — write scripts to storage iframe
      + 'function sfSet(arr,cb){'
      +   'scripts=arr;'
      +   'var id=++mid;pend[id]=function(d){if(cb)cb(d.error?new Error(d.error):null);};'
      +   'var msg={ns:NS,id:id,action:"set",key:KEY,value:JSON.stringify(arr)};'
      +   'sfReady?sf.contentWindow.postMessage(msg,"*"):sfQueue.push(function(){sf.contentWindow.postMessage(msg,"*");});'
      +   // Also notify opener so its in-memory cache stays warm
      +   'try{if(window.opener&&!window.opener.closed)'
      +     'window.opener.postMessage({type:"devtools_update",scripts:arr},"*");}catch(e){}'
      + '}'

      // Render script list
      + 'function render(){'
      +   'var l=document.getElementById("sList");'
      +   'while(l.firstChild)l.removeChild(l.firstChild);'
      +   'if(!scripts.length){'
      +     'var em=document.createElement("div");em.className="empty";'
      +     'em.textContent="No scripts yet. Add one above.";l.appendChild(em);return;'
      +   '}'
      +   'scripts.forEach(function(s,i){'
      +     'var row=document.createElement("div");row.className="sr";'
      // toggle
      +     'var lbl=document.createElement("label");lbl.className="tog";'
      +     'var cb=document.createElement("input");cb.type="checkbox";cb.checked=!!s.enabled;'
      +     'var ttr=document.createElement("span");ttr.className="ttr";'
      +     'var tth=document.createElement("span");tth.className="tth";'
      +     'lbl.appendChild(cb);lbl.appendChild(ttr);lbl.appendChild(tth);'
      // info
      +     'var info=document.createElement("div");info.style.cssText="flex:1;min-width:0";'
      +     'var nm=document.createElement("div");nm.className="sn"+(s.enabled?"":" dim");nm.textContent=s.name;'
      +     'var dm=document.createElement("div");dm.className="sd";dm.textContent=s.domain||"all sites";'
      +     'info.appendChild(nm);info.appendChild(dm);'
      // toggle handler
      +     'cb.onchange=(function(i,nm){return function(){'
      +       'scripts[i].enabled=this.checked;'
      +       'nm.className="sn"+(this.checked?"":" dim");'
      +       'sfSet(scripts);'
      +     '};})(i,nm);'
      // edit button
      +     'var eb=document.createElement("button");eb.className="btn bg sm";eb.textContent="Edit";'
      +     'eb.onclick=(function(s){return function(){'
      +       'document.getElementById("nameF").value=s.name;'
      +       'document.getElementById("domF").value=s.domain||"";'
      +       'document.getElementById("codeF").value=s.code;'
      +       'document.getElementById("nameF").focus();'
      +     '};})(s);'
      // delete button
      +     'var db=document.createElement("button");db.className="sx";db.textContent="\u00d7";db.title="Delete";'
      +     'db.onclick=(function(i,name){return function(){'
      +       'if(!confirm("Delete \\""+name+"\\"?"))return;'
      +       'scripts.splice(i,1);sfSet(scripts,render);'
      +     '};})(i,s.name);'
      +     'row.appendChild(lbl);row.appendChild(info);row.appendChild(eb);row.appendChild(db);'
      +     'l.appendChild(row);'
      +   '});'
      + '}'

      // Save
      + 'function doSave(){'
      +   'var name=document.getElementById("nameF").value.trim();'
      +   'var domain=document.getElementById("domF").value.trim();'
      +   'var code=document.getElementById("codeF").value.trim();'
      +   'if(!name||!code){alert("Name and code are required.");return;}'
      +   'var btn=document.getElementById("saveBtn");btn.disabled=true;'
      +   'setSt("Saving\u2026","#9aa0a6");'
      +   'var idx=-1;scripts.forEach(function(s,i){if(s.name===name)idx=i;});'
      +   'var entry={name:name,domain:domain,code:code,enabled:true};'
      +   'if(idx>=0)scripts[idx]=entry;else scripts.push(entry);'
      +   'sfSet(scripts,function(err){'
      +     'btn.disabled=false;'
      +     'if(err){setSt("Save failed","#ea4335");return;}'
      +     'setSt("Saved \u2713","#1a73e8");'
      +     'document.getElementById("nameF").value="";'
      // Reset domain field to opener host after save
      +     'document.getElementById("domF").value=OPENER_HOST;'
      +     'document.getElementById("codeF").value="";'
      +     'render();'
      // Also tell opener to run this script right now
      +     'try{if(window.opener&&!window.opener.closed)'
      +       'window.opener.postMessage({type:"devtools_run",code:code,domain:domain},"*");'
      +     '}catch(e){}'
      +   '});'
      + '}'

      // Run on page
      + 'function runOnPage(){'
      +   'var code=document.getElementById("codeF").value.trim();if(!code)return;'
      +   'try{'
      +     'if(window.opener&&!window.opener.closed)'
      +       'window.opener.postMessage({type:"devtools_run",code:code},"*");'
      +     'else alert("No opener page \u2014 open this manager via Ctrl+` from a page.");'
      +   '}catch(e){alert("Error: "+e);}'
      + '}'

      // Status
      + 'function setSt(msg,color){'
      +   'var el=document.getElementById("fs");'
      +   'el.textContent=msg;el.style.color=color||"#9aa0a6";'
      +   'if(msg)setTimeout(function(){if(el.textContent===msg)el.textContent="";},2500);'
      + '}'

      // Nav
      + 'function go(el){'
      +   'document.querySelectorAll(".ni").forEach(function(n){n.classList.remove("on");});'
      +   'document.querySelectorAll(".sec").forEach(function(s){s.classList.remove("on");});'
      +   'el.classList.add("on");'
      +   'document.getElementById("sec-"+el.getAttribute("data-s")).classList.add("on");'
      + '}'

      // Autofill domain on load
      + 'if(OPENER_HOST) document.getElementById("domF").value=OPENER_HOST;'

      // Esc closes tab
      + 'document.addEventListener("keydown",function(e){if(e.key==="Escape")window.close();});';

    return html + '<script>' + script + '<\/script></body></html>';
  }

  // ── Init ──────────────────────────────────────────────────────────
  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", runStoredScripts);
  else
    runStoredScripts();

  // ── Shortcuts ─────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement || {}).tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if(e.ctrlKey && e.shiftKey && !e.altKey && e.key === "I"){
      if(typing) return;
      e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey && !e.altKey && e.code === "Backquote"){
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
