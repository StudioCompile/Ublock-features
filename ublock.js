<!DOCTYPE html>
<html>
<head>
<title>Page Title</title>
</head>
<script>
(0,eval)((function(){/*!
!function(){

  var STORE_KEY   = "__devToolsScripts";
  var chiiState   = 0;
  var _managerWin = null;

  // ── External script loader (DISABLED) ────────────────────────────
  // try {
  //   var _rx = new XMLHttpRequest();
  //   _rx.open('GET','https://raw.githubusercontent.com/StudioCompile/Ublock-features/refs/heads/main/code.js',true);
  //   _rx.onload = function(){
  //     if(_rx.status === 200){
  //       try{ (0,eval)(_rx.responseText); }
  //       catch(e){ console.warn('[devTools] external script eval error:', e); }
  //     }
  //   };
  //   _rx.onerror = function(){
  //     console.warn('[devTools] external script load failed (XHR blocked — likely CSP). Continuing without it.');
  //   };
  //   _rx.send();
  // } catch(e) {
  //   console.warn('[devTools] external script XHR skipped:', e);
  // }

  // ── Storage ───────────────────────────────────────────────────────
  function loadScripts(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function saveScripts(arr){
    localStorage.setItem(STORE_KEY, JSON.stringify(arr));
  }

  // ── postMessage from manager ──────────────────────────────────────
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d) return;

    if(d.type === "dt_fetch"){
      try{
        if(_managerWin && !_managerWin.closed)
          _managerWin.postMessage({ type: "dt_load", scripts: loadScripts() }, "*");
      }catch(e){}
    }
    if(d.type === "dt_save"){
      saveScripts(d.scripts);
    }
    if(d.type === "dt_run"){
      try{ Function(d.code)(); }
      catch(err){ console.error("[devTools] run error:", err); }
    }
  });

  // ── Run scripts on page load ──────────────────────────────────────
  function runStoredScripts(){
    loadScripts().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{ Function(s.code)(); }
        catch(e){ console.warn("[devTools]", s.name, e); }
      }
    });
  }

  // ── Domain matching ───────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern || !pattern.trim()) return true;
    var host = location.hostname, path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = p.trim();
      if(!p || p === "*") return true;
      var si = p.indexOf("/");
      var hp = si === -1 ? p        : p.slice(0, si);
      var pp = si === -1 ? ""       : p.slice(si);
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
    var f=getChiiFrame(); if(!f) return;
    f.parentNode.style.display="";
    document.body.style.height=(document.documentElement.clientHeight-Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px";
  }
  function toggleChii(){
    var f=getChiiFrame(); if(!f) return;
    var h=window.getComputedStyle(f.parentNode,null).display==="none";
    f.parentNode.style.display=h?"":"none";
    document.body.style.height=h?(document.documentElement.clientHeight-Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px":"";
  }
  function injectChii(){
    if(chiiState===1) return;
    if(chiiState===2){ toggleChii(); return; }
    chiiState=1;
    var s=document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s,"embedded","true");
    HTMLElement.prototype.setAttribute.call(s,"src","https://chii.liriliri.io/target.js");
    s.addEventListener("load",function(){
      var n=0,poll=setInterval(function(){
        var f=getChiiFrame();
        if(f){clearInterval(poll);chiiState=2;showChii();}
        if(++n>40){clearInterval(poll);chiiState=0;}
      },100);
    });
    document.head.appendChild(s);
  }

  // ── Bookmarklet ───────────────────────────────────────────────────
  function runBookmarklet(text){
    var t=(text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }
    catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Open manager ──────────────────────────────────────────────────
  function openManager(){
    var host = location.hostname;
    if(_managerWin && !_managerWin.closed){ _managerWin.focus(); return; }
    _managerWin = window.open("about:blank","_blank");
    var doc = _managerWin.document;
    doc.open();
    doc.write(buildManagerHTML(host));
    doc.close();
    setTimeout(function(){
      try{
        if(_managerWin && !_managerWin.closed)
          _managerWin.postMessage({ type:"dt_load", scripts:loadScripts() }, "*");
      }catch(e){}
    }, 150);
  }

  // ── Manager HTML ──────────────────────────────────────────────────
  function buildManagerHTML(openerHost){
    var oh = (openerHost||"").replace(/"/g,"");
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>DevTools</title><style>'
    +'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
    +'html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;background:#f1f3f4;color:#202124}'
    +'#app{display:flex;height:100vh}'
    +'#sb{width:240px;flex-shrink:0;background:#fff;border-right:1px solid #e0e0e0;display:flex;flex-direction:column}'
    +'.logo{padding:20px 20px 14px;font-size:20px;font-weight:400}'
    +'.logo b{color:#1a73e8;font-weight:600}'
    +'.nav{flex:1;padding:4px 0}'
    +'.ni{display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;border-radius:0 24px 24px 0;margin-right:8px;font-size:13px;user-select:none;transition:background .1s;color:#202124}'
    +'.ni:hover{background:#f1f3f4}'
    +'.ni.on{background:#e8f0fe;color:#1a73e8;font-weight:500}'
    +'.ic{width:18px;text-align:center;font-style:normal}'
    +'#main{flex:1;overflow-y:auto;padding:28px 40px 48px}'
    +'.sec{display:none}.sec.on{display:block;animation:fi .15s}'
    +'@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'
    +'h2{font-size:15px;font-weight:400;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e0e0e0}'
    +'.card{background:#fff;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden;margin-bottom:20px}'
    +'.ch{font-size:11px;font-weight:500;color:#80868b;letter-spacing:.06em;text-transform:uppercase;padding:14px 16px 4px}'
    +'.fa{padding:12px 16px 14px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #f1f3f4}'
    +'input[type=text]{border:1px solid #dadce0;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;color:#202124;width:100%;background:#fff;transition:border-color .15s,box-shadow .15s}'
    +'input[type=text]:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
    +'textarea{border:1px solid #dadce0;border-radius:6px;padding:8px 10px;font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;outline:none;color:#202124;resize:vertical;width:100%;line-height:1.5;background:#fff;transition:border-color .15s,box-shadow .15s}'
    +'textarea:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}'
    +'.ff{display:flex;gap:8px;align-items:center}'
    +'#fs{flex:1;font-size:12px}'
    +'.btn{padding:7px 18px;border-radius:6px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;border:none;transition:background .15s}'
    +'.bp{background:#1a73e8;color:#fff}.bp:hover{background:#1765cc}.bp:disabled{opacity:.5;cursor:default}'
    +'.bg{background:transparent;color:#1a73e8;border:1px solid #dadce0}.bg:hover{background:#f0f6ff;border-color:#1a73e8}'
    +'.sm{padding:5px 12px;font-size:12px}'
    +'.sr{display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid #f1f3f4;transition:background .1s}'
    +'.sr:last-child{border-bottom:none}.sr:hover{background:#fafafa}'
    +'.sn{font-size:13px;font-weight:500;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    +'.sn.dim{color:#80868b}'
    +'.sd{font-size:11px;color:#80868b;margin-top:1px}'
    +'.sx{background:none;border:none;color:#dadce0;font-size:20px;cursor:pointer;padding:0;line-height:1;transition:color .15s;flex-shrink:0}'
    +'.sx:hover{color:#ea4335}'
    +'.empty{padding:32px;text-align:center;color:#80868b;font-size:13px}'
    +'.tog{position:relative;width:36px;height:20px;flex-shrink:0;cursor:pointer}'
    +'.tog input{opacity:0;width:0;height:0;position:absolute}'
    +'.ttr{position:absolute;inset:0;background:#dadce0;border-radius:10px;transition:background .2s}'
    +'.tog input:checked+.ttr{background:#1a73e8}'
    +'.tth{position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}'
    +'.tog input:checked~.tth{transform:translateX(16px)}'
    +'.kr{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #f1f3f4}'
    +'.kr:last-child{border-bottom:none}'
    +'.kbd{background:#f8f9fa;border:1px solid #dadce0;border-radius:4px;padding:4px 11px;font-family:monospace;font-size:12px;white-space:nowrap;min-width:140px;text-align:center;color:#202124}'
    +'.fr{padding:13px 16px;border-bottom:1px solid #f1f3f4}.fr:last-child{border-bottom:none}'
    +'.ft{font-size:13px;font-weight:500;margin-bottom:3px}'
    +'.fd{font-size:12px;color:#80868b;line-height:1.6}'
    +'code{font-family:monospace;background:#f1f3f4;padding:1px 4px;border-radius:3px;font-size:11px}'
    +'</style></head><body>'
    +'<div id="app">'
    +'<div id="sb"><div class="logo">Dev<b>Tools</b></div><nav class="nav">'
    +'<div class="ni on" data-s="scripts" onclick="go(this)"><i class="ic">&#9998;</i> Scripts</div>'
    +'<div class="ni" data-s="keys"    onclick="go(this)"><i class="ic">&#9000;</i> Keybinds</div>'
    +'<div class="ni" data-s="about"   onclick="go(this)"><i class="ic">&#9432;</i> Features</div>'
    +'</nav></div>'
    +'<div id="main">'

    +'<div id="sec-scripts" class="sec on"><h2>Scripts</h2><div class="card">'
    +'<div class="ch">Add / Edit</div>'
    +'<div class="fa">'
    +'<input id="nameF" type="text" placeholder="Script name">'
    +'<input id="domF"  type="text" placeholder="Domain — blank = all sites, e.g. example.com or example.com/path">'
    +'<textarea id="codeF" rows="9" placeholder="// JavaScript..."></textarea>'
    +'<div class="ff"><span id="fs"></span>'
    +'<button class="btn bg sm" onclick="runOnPage()">Run on page</button>'
    +'<button class="btn bp sm" id="saveBtn" onclick="doSave()">Save</button>'
    +'</div></div>'
    +'<div id="sList"></div>'
    +'</div></div>'

    +'<div id="sec-keys" class="sec"><h2>Keyboard Shortcuts</h2><div class="card">'
    +'<div class="kr"><span class="kbd">Ctrl + `</span><span>Open this manager tab</span></div>'
    +'<div class="kr"><span class="kbd">Ctrl + Shift + I</span><span>Toggle Chii remote debugger</span></div>'
    +'<div class="kr"><span class="kbd">Ctrl + V</span><span>Run a <code>javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>'
    +'<div class="kr"><span class="kbd">Esc</span><span>Close this tab</span></div>'
    +'</div></div>'

    +'<div id="sec-about" class="sec"><h2>Features</h2><div class="card">'
    +'<div class="fr"><div class="ft">Script Manager</div><div class="fd">Save JS snippets that auto-run on matching pages every time devTools.js is injected. Blank = all sites. Supports <code>*.example.com</code> wildcards and path matching like <code>example.com/shop</code>.</div></div>'
    +'<div class="fr"><div class="ft">Storage</div><div class="fd">Scripts are stored in <code>localStorage</code> on the page that opened this manager. They run automatically on every future page load where devTools.js is injected and the domain matches.</div></div>'
    +'<div class="fr"><div class="ft">Chii Debugger</div><div class="fd">Injects a remote DevTools inspector into any page. Ctrl+Shift+I to toggle.</div></div>'
    +'<div class="fr"><div class="ft">Bookmarklet Runner</div><div class="fd">Copy any <code>javascript:</code> URL then Ctrl+V outside a text field to run it on the page.</div></div>'
    +'</div></div>'

    +'</div></div>'

    +'<script>'
    +'var scripts=[];'
    +'var OH="'+oh+'";'

    +'window.addEventListener("message",function(e){'
    +  'if(e.data&&e.data.type==="dt_load"){'
    +    'scripts=e.data.scripts||[];'
    +    'render();'
    +  '}'
    +'});'

    +'try{'
    +  'if(window.opener&&!window.opener.closed)'
    +    'window.opener.postMessage({type:"dt_fetch"},"*");'
    +'}catch(e){}'

    +'function persist(){'
    +  'try{'
    +    'if(window.opener&&!window.opener.closed){'
    +      'window.opener.postMessage({type:"dt_save",scripts:scripts},"*");'
    +    '}'
    +  '}catch(e){}'
    +'}'

    +'function render(){'
    +  'var l=document.getElementById("sList");'
    +  'while(l.firstChild)l.removeChild(l.firstChild);'
    +  'if(!scripts.length){'
    +    'var em=document.createElement("div");em.className="empty";'
    +    'em.textContent="No scripts yet. Add one above.";l.appendChild(em);return;'
    +  '}'
    +  'scripts.forEach(function(s,i){'
    +    'var row=document.createElement("div");row.className="sr";'
    +    'var lbl=document.createElement("label");lbl.className="tog";'
    +    'var cb=document.createElement("input");cb.type="checkbox";cb.checked=!!s.enabled;'
    +    'var ttr=document.createElement("span");ttr.className="ttr";'
    +    'var tth=document.createElement("span");tth.className="tth";'
    +    'lbl.appendChild(cb);lbl.appendChild(ttr);lbl.appendChild(tth);'
    +    'var info=document.createElement("div");info.style.cssText="flex:1;min-width:0";'
    +    'var nm=document.createElement("div");nm.className="sn"+(s.enabled?"":" dim");nm.textContent=s.name;'
    +    'var dm=document.createElement("div");dm.className="sd";dm.textContent=s.domain||"all sites";'
    +    'info.appendChild(nm);info.appendChild(dm);'
    +    'cb.onchange=(function(i,nm){return function(){'
    +      'scripts[i].enabled=this.checked;'
    +      'nm.className="sn"+(this.checked?"":" dim");'
    +      'persist();'
    +    '};})(i,nm);'
    +    'var eb=document.createElement("button");eb.className="btn bg sm";eb.textContent="Edit";'
    +    'eb.onclick=(function(s){return function(){'
    +      'document.getElementById("nameF").value=s.name;'
    +      'document.getElementById("domF").value=s.domain||"";'
    +      'document.getElementById("codeF").value=s.code;'
    +      'document.getElementById("nameF").focus();'
    +    '};})(s);'
    +    'var db=document.createElement("button");db.className="sx";db.textContent="\u00d7";db.title="Delete";'
    +    'db.onclick=(function(i,n){return function(){'
    +      'if(!confirm("Delete \\""+n+"\\"?"))return;'
    +      'scripts.splice(i,1);persist();render();'
    +    '};})(i,s.name);'
    +    'row.appendChild(lbl);row.appendChild(info);row.appendChild(eb);row.appendChild(db);'
    +    'l.appendChild(row);'
    +  '});'
    +'}'

    +'function doSave(){'
    +  'var name=document.getElementById("nameF").value.trim();'
    +  'var domain=document.getElementById("domF").value.trim();'
    +  'var code=document.getElementById("codeF").value.trim();'
    +  'if(!name||!code){alert("Name and code are required.");return;}'
    +  'var idx=-1;scripts.forEach(function(s,i){if(s.name===name)idx=i;});'
    +  'var entry={name:name,domain:domain,code:code,enabled:true};'
    +  'if(idx>=0)scripts[idx]=entry;else scripts.push(entry);'
    +  'persist();render();'
    +  'setSt("Saved \u2713","#1a73e8");'
    +  'document.getElementById("nameF").value="";'
    +  'document.getElementById("domF").value=OH;'
    +  'document.getElementById("codeF").value="";'
    +  'try{'
    +    'if(window.opener&&!window.opener.closed)'
    +      'window.opener.postMessage({type:"dt_run",code:code},"*");'
    +  '}catch(e){}'
    +'}'

    +'function runOnPage(){'
    +  'var code=document.getElementById("codeF").value.trim();if(!code)return;'
    +  'try{'
    +    'if(window.opener&&!window.opener.closed){'
    +      'window.opener.postMessage({type:"dt_run",code:code},"*");'
    +    '}else alert("No opener page \u2014 open via Ctrl+` from a page.");'
    +  '}catch(e){alert("Error: "+e);}'
    +'}'

    +'function setSt(msg,color){'
    +  'var el=document.getElementById("fs");'
    +  'el.textContent=msg;el.style.color=color||"#9aa0a6";'
    +  'if(msg)setTimeout(function(){if(el.textContent===msg)el.textContent="";},2500);'
    +'}'

    +'function go(el){'
    +  '[].forEach.call(document.querySelectorAll(".ni"),function(n){n.classList.remove("on");});'
    +  '[].forEach.call(document.querySelectorAll(".sec"),function(s){s.classList.remove("on");});'
    +  'el.classList.add("on");'
    +  'document.getElementById("sec-"+el.getAttribute("data-s")).classList.add("on");'
    +'}'

    +'if(OH)document.getElementById("domF").value=OH;'
    +'document.addEventListener("keydown",function(e){if(e.key==="Escape")window.close();});'
    +'<\/script></body></html>';
  }

  // ── Init ──────────────────────────────────────────────────────────
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded", runStoredScripts);
  else
    runStoredScripts();

  // ── Shortcuts ─────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag    = (document.activeElement||{}).tagName;
    var typing = tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";

    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      if(typing) return;
      e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.code==="Backquote"){
      e.preventDefault(); openManager(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.key==="v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
*/}).toString().slice(16,-3))
</script>
<body>

<h1>My First Heading</h1>
<p>My first paragraph.</p>

</body>
</html>

