/// devTools.js
!function(){
  var chiiState   = 0;
  var _managerWin = null;

  var STORAGE_URL = "https://studiocompile.github.io/Ublock-features/storage.html";
  var NS          = "__devToolsScripts";
  var SCRIPTS_KEY = "scripts";

  // ── iframe postMessage bridge ─────────────────────────────────────
  // All reads/writes go through a hidden iframe pointing at storage.html.
  // That page's localStorage is always the same origin so it persists
  // forever across every domain and browser restart.

  var _iframe   = null;
  var _iframeReady = false;
  var _pending  = {}; // id -> {resolve, reject}
  var _queue    = []; // messages to send before iframe is ready

  function getIframe(){
    if(_iframe) return _iframe;
    _iframe = document.createElement("iframe");
    _iframe.src = STORAGE_URL;
    _iframe.style.cssText = "display:none;position:fixed;width:0;height:0;border:none;z-index:-1";
    _iframe.addEventListener("load", function(){
      _iframeReady = true;
      _queue.forEach(function(fn){ fn(); });
      _queue = [];
    });
    (document.body || document.documentElement).appendChild(_iframe);
    return _iframe;
  }

  function storageCall(action, key, value){
    return new Promise(function(resolve, reject){
      var id = Math.random().toString(36).slice(2);
      _pending[id] = { resolve: resolve, reject: reject };
      var timer = setTimeout(function(){
        delete _pending[id];
        reject(new Error("storage timeout"));
      }, 5000);
      _pending[id].timer = timer;

      var send = function(){
        var msg = { ns: NS, id: id, action: action, key: key };
        if(action === "set") msg.value = value;
        try{ _iframe.contentWindow.postMessage(msg, "*"); }
        catch(e){ reject(e); }
      };

      getIframe();
      if(_iframeReady) send();
      else _queue.push(send);
    });
  }

  window.addEventListener("message", function(e){
    var d = e.data;
    // Handle storage replies
    if(d && d.ns === NS && d.id && _pending[d.id]){
      var p = _pending[d.id];
      clearTimeout(p.timer);
      delete _pending[d.id];
      if(d.error) p.reject(new Error(d.error));
      else p.resolve(d);
      return;
    }
    // Handle manager messages
    if(!d) return;
    if(d.type === "devtools_run"){
      try{ Function(d.code)(); }catch(err){ console.error("[devTools]", err); }
    }
    if(d.type === "devtools_update"){
      storageCall("set", SCRIPTS_KEY, JSON.stringify(d.scripts));
    }
    if(d.type === "devtools_req"){
      readScripts().then(function(scripts){
        if(_managerWin && !_managerWin.closed)
          _managerWin.postMessage({ type: "devtools_load", scripts: scripts }, "*");
      });
    }
  });

  // ── Read/write helpers ────────────────────────────────────────────
  function readScripts(){
    return storageCall("get", SCRIPTS_KEY).then(function(d){
      try{ return JSON.parse(d.value); }catch(e){ return []; }
    }).catch(function(){ return []; });
  }

  function writeScripts(arr){
    return storageCall("set", SCRIPTS_KEY, JSON.stringify(arr));
  }

  // ── Domain matching ───────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname;
    return pattern.trim().split(",").map(function(p){ return p.trim(); }).some(function(p){
      if(!p || p === "*") return true;
      if(p.indexOf("*.") === 0) return host === p.slice(2) || host.endsWith("." + p.slice(2));
      return host === p || host.endsWith("." + p);
    });
  }

  // ── Run scripts on page load ──────────────────────────────────────
  function runStoredScripts(){
    getIframe(); // warm up iframe early
    readScripts().then(function(scripts){
      scripts.forEach(function(s){
        if(s.enabled && matchesDomain(s.domain)){
          try{ Function(s.code)(); }
          catch(e){ console.warn("[devTools] " + s.name + ":", e); }
        }
      });
    });
  }

  // ── Open manager ──────────────────────────────────────────────────
  function openManager(){
    if(_managerWin && !_managerWin.closed){
      _managerWin.focus();
      // Re-send latest scripts in case manager lost state
      readScripts().then(function(scripts){
        if(_managerWin && !_managerWin.closed)
          _managerWin.postMessage({ type: "devtools_load", scripts: scripts }, "*");
      });
      return;
    }
    _managerWin = window.open("about:blank", "_blank");
    var doc = _managerWin.document;
    doc.open(); doc.write(managerHTML()); doc.close();
    // Send scripts once manager has had time to init
    setTimeout(function(){
      readScripts().then(function(scripts){
        if(_managerWin && !_managerWin.closed)
          _managerWin.postMessage({ type: "devtools_load", scripts: scripts }, "*");
      });
    }, 300);
  }

  // ── Chii ──────────────────────────────────────────────────────────
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

  // ── Bookmarklet ───────────────────────────────────────────────────
  function runBookmarklet(text){
    var t = (text || "").trim();
    if(!t.match(/^javascript:/i)) return false;
    try{ Function(t.replace(/^javascript:/i, ""))(); }
    catch(e){ alert("Bookmarklet error:\n" + e); }
    return true;
  }

  // ── Manager HTML ──────────────────────────────────────────────────
  function managerHTML(){
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>DevTools</title><style>'
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
    + '.row{display:flex;gap:10px}'
    + 'input[type=text]{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:inherit;font-size:13px;outline:none;color:#202124;width:100%;transition:border-color .15s,box-shadow .15s}'
    + 'input[type=text]:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
    + 'textarea{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;outline:none;color:#202124;resize:vertical;width:100%;line-height:1.5;transition:border-color .15s,box-shadow .15s}'
    + 'textarea:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
    + '.ff{display:flex;gap:8px;align-items:center}'
    + '#fs{flex:1;font-size:12px}'
    + '.btn{padding:7px 20px;border-radius:6px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;border:none;transition:background .15s}'
    + '.bp{background:#1a73e8;color:#fff}.bp:hover{background:#1765cc}'
    + '.bg{background:transparent;color:#1a73e8;border:1px solid #dadce0}.bg:hover{background:#f0f6ff;border-color:#1a73e8}'
    + '.sm{padding:5px 13px;font-size:12px}'
    + '.sr{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f3f4;transition:background .1s}'
    + '.sr:last-child{border-bottom:none}.sr:hover{background:#fafafa}'
    + '.sn{font-size:13px;font-weight:500;color:#202124}.sn.dim{color:#80868b}'
    + '.sd{font-size:11px;color:#80868b;margin-top:2px}'
    + '.sx{background:none;border:none;color:#dadce0;font-size:20px;cursor:pointer;padding:0;line-height:1;transition:color .15s;flex-shrink:0}'
    + '.sx:hover{color:#ea4335}'
    + '.empty{padding:32px;text-align:center;color:#80868b;font-size:13px}'
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
    + 'code{font-family:monospace;background:#f1f3f4;padding:1px 4px;border-radius:3px;font-size:11px}'
    + '</style></head><body><div id="app">'
    + '<div id="sb"><div class="logo">Dev<b>Tools</b></div><nav class="sb-nav">'
    + '<div class="ni on" data-s="scripts" onclick="go(this)"><i class="ic">&#9998;</i>Scripts</div>'
    + '<div class="ni" data-s="keys" onclick="go(this)"><i class="ic">&#9000;</i>Keybinds</div>'
    + '<div class="ni" data-s="about" onclick="go(this)"><i class="ic">&#9432;</i>Features</div>'
    + '</nav></div>'
    + '<div id="main">'

    + '<div id="sec-scripts" class="sec on"><h2>Scripts</h2><div class="card">'
    + '<div class="ch">New / Edit Script</div>'
    + '<div class="fa"><div class="row">'
    + '<input type="text" id="nameF" placeholder="Script name" style="flex:2">'
    + '<input type="text" id="domF" placeholder="Domain (blank = all sites)" style="flex:1">'
    + '</div>'
    + '<textarea id="codeF" rows="9" placeholder="// JavaScript..."></textarea>'
    + '<div class="ff"><span id="fs"></span>'
    + '<button class="btn bg sm" onclick="runOnPage()">Run on page</button>'
    + '<button class="btn bp sm" onclick="doSave()">Save</button>'
    + '</div></div><div id="sList"></div></div></div>'

    + '<div id="sec-keys" class="sec"><h2>Keyboard Shortcuts</h2><div class="card">'
    + '<div class="kr"><span class="kbd">Ctrl + `</span><span>Open this manager tab</span></div>'
    + '<div class="kr"><span class="kbd">Ctrl + Shift + I</span><span>Toggle Chii remote debugger</span></div>'
    + '<div class="kr"><span class="kbd">Ctrl + V</span><span>Run a <code>javascript:</code> bookmarklet from clipboard</span></div>'
    + '<div class="kr"><span class="kbd">Esc</span><span>Close this tab</span></div>'
    + '</div></div>'

    + '<div id="sec-about" class="sec"><h2>Features</h2><div class="card">'
    + '<div class="fr"><div class="ft">Script Manager</div><div class="fd">Save JS snippets that auto-run on matching domains on every page. Leave domain blank to run everywhere. Supports wildcards like <code>*.example.com</code>.</div></div>'
    + '<div class="fr"><div class="ft">Persistent Storage</div><div class="fd">Scripts are stored via a hidden iframe on <code>studiocompile.github.io</code> — same origin every time, persists across all domains and browser restarts.</div></div>'
    + '<div class="fr"><div class="ft">Chii Debugger</div><div class="fd">Injects a remote DevTools inspector into any page. Press Ctrl+Shift+I to toggle.</div></div>'
    + '<div class="fr"><div class="ft">Bookmarklet Runner</div><div class="fd">Copy any <code>javascript:</code> URL then Ctrl+V outside a text field to run it.</div></div>'
    + '</div></div>'

    + '</div></div>'
    + '<script>'
    + 'var scripts=[];'

    + 'window.addEventListener("message",function(e){'
    +   'if(e.data&&e.data.type==="devtools_load"&&Array.isArray(e.data.scripts)){'
    +     'scripts=e.data.scripts;render();'
    +   '}'
    + '});'

    // Ask opener for scripts
    + 'setTimeout(function(){'
    +   'try{if(window.opener&&!window.opener.closed)'
    +     'window.opener.postMessage({type:"devtools_req"},"*");'
    +   '}catch(e){}},100);'

    + 'function notify(){'
    +   'try{if(window.opener&&!window.opener.closed)'
    +     'window.opener.postMessage({type:"devtools_update",scripts:scripts},"*");'
    +   '}catch(e){}'
    + '}'

    + 'function render(){'
    +   'var l=document.getElementById("sList");'
    +   'while(l.firstChild)l.removeChild(l.firstChild);'
    +   'if(!scripts.length){'
    +     'var em=document.createElement("div");em.className="empty";'
    +     'em.textContent="No scripts yet. Add one above.";l.appendChild(em);return;'
    +   '}'
    +   'scripts.forEach(function(s,i){'
    +     'var row=document.createElement("div");row.className="sr";'
    +     'var lbl=document.createElement("label");lbl.className="tog";'
    +     'var cb=document.createElement("input");cb.type="checkbox";cb.checked=!!s.enabled;'
    +     'var tr=document.createElement("span");tr.className="ttr";'
    +     'var th=document.createElement("span");th.className="tth";'
    +     'lbl.appendChild(cb);lbl.appendChild(tr);lbl.appendChild(th);'
    +     'var info=document.createElement("div");info.style.cssText="flex:1;min-width:0";'
    +     'var nm=document.createElement("div");nm.className="sn"+(s.enabled?"":" dim");nm.textContent=s.name;'
    +     'var dm=document.createElement("div");dm.className="sd";dm.textContent=s.domain||"all sites";'
    +     'info.appendChild(nm);info.appendChild(dm);'
    +     'cb.onchange=(function(i,nm){return function(){'
    +       'scripts[i].enabled=this.checked;'
    +       'nm.className="sn"+(this.checked?"":" dim");'
    +       'notify();'
    +     '};})(i,nm);'
    +     'var eb=document.createElement("button");eb.className="btn bg sm";eb.textContent="Edit";'
    +     'eb.onclick=(function(s){return function(){'
    +       'document.getElementById("nameF").value=s.name;'
    +       'document.getElementById("domF").value=s.domain||"";'
    +       'document.getElementById("codeF").value=s.code;'
    +       'document.getElementById("nameF").focus();'
    +     '};})(s);'
    +     'var db=document.createElement("button");db.className="sx";db.innerHTML="\u00d7";db.title="Delete";'
    +     'db.onclick=(function(i,name){return function(){'
    +       'if(!confirm("Delete \\""+name+"\\"?"))return;'
    +       'scripts.splice(i,1);notify();render();'
    +     '};})(i,s.name);'
    +     'row.appendChild(lbl);row.appendChild(info);row.appendChild(eb);row.appendChild(db);'
    +     'l.appendChild(row);'
    +   '});'
    + '}'

    + 'function doSave(){'
    +   'var name=document.getElementById("nameF").value.trim();'
    +   'var domain=document.getElementById("domF").value.trim();'
    +   'var code=document.getElementById("codeF").value.trim();'
    +   'if(!name||!code){alert("Name and code are required.");return;}'
    +   'var idx=-1;scripts.forEach(function(s,i){if(s.name===name)idx=i;});'
    +   'var entry={name:name,domain:domain,code:code,enabled:true};'
    +   'if(idx>=0)scripts[idx]=entry;else scripts.push(entry);'
    +   'notify();render();setStatus("Saved \u2713","#1a73e8");'
    +   'document.getElementById("nameF").value="";'
    +   'document.getElementById("domF").value="";'
    +   'document.getElementById("codeF").value="";'
    + '}'

    + 'function runOnPage(){'
    +   'var code=document.getElementById("codeF").value.trim();if(!code)return;'
    +   'try{'
    +     'if(window.opener&&!window.opener.closed)'
    +       'window.opener.postMessage({type:"devtools_run",code:code},"*");'
    +     'else alert("No opener page \u2014 open manager via Ctrl+` from a page.");'
    +   '}catch(e){alert("Error: "+e);}'
    + '}'

    + 'function setStatus(msg,color){'
    +   'var el=document.getElementById("fs");'
    +   'el.textContent=msg;el.style.color=color||"#80868b";'
    +   'if(msg)setTimeout(function(){if(el.textContent===msg)el.textContent="";},2500);'
    + '}'

    + 'function go(el){'
    +   'document.querySelectorAll(".ni").forEach(function(n){n.classList.remove("on");});'
    +   'document.querySelectorAll(".sec").forEach(function(s){s.classList.remove("on");});'
    +   'el.classList.add("on");'
    +   'document.getElementById("sec-"+el.getAttribute("data-s")).classList.add("on");'
    + '}'

    + 'document.addEventListener("keydown",function(e){if(e.key==="Escape")window.close();});'
    + '<\/script></body></html>';
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
