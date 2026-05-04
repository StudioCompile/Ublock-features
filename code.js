/// devTools.js
!function(){
  var chiiState  = 0;
  var _managerWin = null;

  // ── Config ───────────────────────────────────────────────────────
  // Scripts are stored as scripts.json in your public GitHub repo.
  // The runner fetches it via raw.githubusercontent.com — works on
  // every site with no auth and no iframe needed.
  // The manager writes it back via the GitHub Contents API using your PAT.
  var GH_OWNER  = "studiocompile";
  var GH_REPO   = "Ublock-features";
  var GH_FILE   = "scripts.json";
  var GH_BRANCH = "main";

  // Your personal access token — only needed for saving scripts.
  // Generate at: github.com/settings/tokens (scope: public_repo)
  var GH_TOKEN  = "YOUR_GITHUB_PAT_HERE";

  var RAW_URL = "https://raw.githubusercontent.com/"
    + GH_OWNER + "/" + GH_REPO + "/" + GH_BRANCH + "/" + GH_FILE;
  var API_URL = "https://api.github.com/repos/"
    + GH_OWNER + "/" + GH_REPO + "/contents/" + GH_FILE;

  var CACHE_KEY = "__devToolsCache";
  var _cache    = null;
  var _sha      = null; // needed for API writes

  // ── Read scripts (fetch — works on every site) ───────────────────
  function fetchScripts(cb){
    // Return local cache instantly so scripts run without waiting
    if(_cache === null){
      try{ _cache = JSON.parse(localStorage.getItem(CACHE_KEY)||"[]"); }
      catch(e){ _cache = []; }
    }
    fetch(RAW_URL + "?_=" + Date.now()) // bust cache
      .then(function(r){
        if(!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then(function(txt){
        try{ _cache = JSON.parse(txt); }catch(e){ _cache = []; }
        localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
        cb(_cache);
      })
      .catch(function(){
        // Network error or file doesn't exist yet — use local cache
        cb(_cache || []);
      });
  }

  function loadScripts(){ return _cache || []; }

  // ── Write scripts (GitHub Contents API) ──────────────────────────
  function saveScripts(arr, cb){
    _cache = arr;
    localStorage.setItem(CACHE_KEY, JSON.stringify(arr));
    var body = {
      message: "devTools: update scripts",
      content: btoa(unescape(encodeURIComponent(JSON.stringify(arr, null, 2)))),
      branch:  GH_BRANCH
    };
    // Need the current SHA to update an existing file
    function doWrite(sha){
      if(sha) body.sha = sha;
      fetch(API_URL, {
        method:  "PUT",
        headers: {
          "Authorization": "token " + GH_TOKEN,
          "Accept":        "application/vnd.github.v3+json",
          "Content-Type":  "application/json"
        },
        body: JSON.stringify(body)
      })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.content && d.content.sha) _sha = d.content.sha;
        if(cb) cb(null);
      })
      .catch(function(e){ if(cb) cb(e); });
    }
    // Get SHA if we don't have it
    if(_sha){ doWrite(_sha); return; }
    fetch(API_URL, {
      headers:{
        "Authorization": "token " + GH_TOKEN,
        "Accept": "application/vnd.github.v3+json"
      }
    })
    .then(function(r){ return r.json(); })
    .then(function(d){ _sha = d.sha || null; doWrite(_sha); })
    .catch(function(){ doWrite(null); });
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

  // ── Chii ─────────────────────────────────────────────────────────
  function getChiiFrame(){
    return[].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{ var u=new URL(HTMLElement.prototype.getAttribute.call(f,"src"));
        return u.host==="chii.liriliri.io"&&u.pathname==="/front_end/chii_app.html"; }
      catch(e){ return false; }
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
    var hidden=window.getComputedStyle(f.parentNode,null).display==="none";
    f.parentNode.style.display=hidden?"":"none";
    document.body.style.height=hidden?(document.documentElement.clientHeight-Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px":"";
  }
  function injectChii(){
    if(chiiState===1)return; if(chiiState===2){toggleChii();return;}
    chiiState=1;
    var s=document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s,"embedded","true");
    HTMLElement.prototype.setAttribute.call(s,"src","https://chii.liriliri.io/target.js");
    s.addEventListener("load",function(){
      var attempts=0,poll=setInterval(function(){
        var f=getChiiFrame();
        if(f){clearInterval(poll);chiiState=2;showChii();}
        if(++attempts>40){clearInterval(poll);chiiState=0;}
      },100);
    });
    document.head.appendChild(s);
  }

  // ── Bookmarklet ──────────────────────────────────────────────────
  function runBookmarklet(text){
    var t=(text||"").trim(); if(!t.match(/^javascript:/i)) return false;
    try{ Function(t.replace(/^javascript:/i,""))(); }catch(e){ alert("Bookmarklet error:\n"+e); }
    return true;
  }

  // ── Manager tab (about:blank) ─────────────────────────────────────
  // Receives postMessage from manager when scripts are saved/run
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d) return;
    if(d.type === "devtools_run"){
      try{ Function(d.code)(); }catch(err){ console.error("[devTools]", err); }
    }
    if(d.type === "devtools_update"){
      _cache = d.scripts;
      localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
    }
  });

  function openManager(){
    if(_managerWin && !_managerWin.closed){ _managerWin.focus(); return; }
    _managerWin = window.open("about:blank", "_blank");
    var doc = _managerWin.document;
    doc.open();
    doc.write(managerHTML());
    doc.close();
  }

  // ── Manager HTML ──────────────────────────────────────────────────
  function managerHTML(){
    var cfg = JSON.stringify({
      ghOwner:  GH_OWNER,
      ghRepo:   GH_REPO,
      ghFile:   GH_FILE,
      ghBranch: GH_BRANCH,
      ghToken:  GH_TOKEN,
      rawUrl:   RAW_URL,
      apiUrl:   API_URL
    });

    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<title>DevTools</title><style>' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
    'html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;background:#f1f3f4;color:#202124}' +
    '#app{display:flex;height:100vh}' +

    // sidebar
    '#sb{width:256px;flex-shrink:0;background:#fff;border-right:1px solid #e0e0e0;display:flex;flex-direction:column}' +
    '.sb-logo{padding:20px 20px 16px;font-size:20px;font-weight:400;color:#202124;flex-shrink:0}' +
    '.sb-logo b{color:#1a73e8;font-weight:600}' +
    '.sb-nav{flex:1;overflow-y:auto;padding:4px 0}' +
    '.nav-item{display:flex;align-items:center;gap:14px;padding:10px 20px;cursor:pointer;' +
      'border-radius:0 24px 24px 0;margin-right:8px;color:#202124;font-size:13px;' +
      'user-select:none;transition:background .1s}' +
    '.nav-item:hover{background:#f1f3f4}' +
    '.nav-item.on{background:#e8f0fe;color:#1a73e8;font-weight:500}' +
    '.nav-icon{width:18px;text-align:center;font-style:normal;font-size:15px}' +

    // main
    '#main{flex:1;overflow-y:auto;padding:28px 40px 48px}' +
    '.sec{display:none}' +
    '.sec.on{display:block;animation:fi .15s}' +
    '@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}' +
    'h2{font-size:15px;font-weight:400;color:#202124;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e0e0e0}' +

    // card
    '.card{background:#fff;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden;margin-bottom:20px}' +
    '.card-head{font-size:11px;font-weight:500;color:#80868b;letter-spacing:.06em;text-transform:uppercase;padding:14px 16px 0}' +

    // form
    '.form-area{padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid #f1f3f4}' +
    '.row{display:flex;gap:10px}' +
    'input[type=text]{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:inherit;font-size:13px;outline:none;color:#202124;width:100%;transition:border-color .15s,box-shadow .15s}' +
    'input[type=text]:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}' +
    'textarea{border:1px solid #dadce0;border-radius:6px;padding:8px 11px;font-family:"Consolas","Menlo","Monaco",monospace;font-size:12px;outline:none;color:#202124;resize:vertical;width:100%;line-height:1.5;transition:border-color .15s,box-shadow .15s}' +
    'textarea:focus{border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,.14)}' +
    '.form-foot{display:flex;gap:8px;align-items:center}' +
    '#fStatus{flex:1;font-size:12px;color:#1a73e8}' +

    // buttons
    '.btn{padding:7px 20px;border-radius:6px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;transition:background .15s,box-shadow .15s;border:none}' +
    '.btn-p{background:#1a73e8;color:#fff}' +
    '.btn-p:hover{background:#1765cc;box-shadow:0 1px 4px rgba(0,0,0,.2)}' +
    '.btn-p:disabled{opacity:.55;cursor:default}' +
    '.btn-g{background:transparent;color:#1a73e8;border:1px solid #dadce0}' +
    '.btn-g:hover{background:#f0f6ff;border-color:#1a73e8}' +
    '.btn-sm{padding:5px 13px;font-size:12px}' +

    // rows
    '.s-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f3f4;transition:background .1s}' +
    '.s-row:last-child{border-bottom:none}' +
    '.s-row:hover{background:#fafafa}' +
    '.s-name{font-size:13px;font-weight:500;color:#202124}' +
    '.s-name.dim{color:#80868b}' +
    '.s-dom{font-size:11px;color:#80868b;margin-top:2px}' +
    '.s-del{background:none;border:none;color:#dadce0;font-size:20px;cursor:pointer;padding:0;line-height:1;transition:color .15s;flex-shrink:0}' +
    '.s-del:hover{color:#ea4335}' +
    '.empty{padding:32px;text-align:center;color:#80868b;font-size:13px}' +

    // toggle
    '.tog{position:relative;width:36px;height:20px;flex-shrink:0;cursor:pointer}' +
    '.tog input{opacity:0;width:0;height:0;position:absolute}' +
    '.ttrack{position:absolute;inset:0;background:#dadce0;border-radius:10px;transition:background .2s}' +
    '.tog input:checked+.ttrack{background:#1a73e8}' +
    '.tthumb{position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}' +
    '.tog input:checked~.tthumb{transform:translateX(16px)}' +

    // kbd
    '.k-row{display:flex;align-items:center;gap:16px;padding:13px 16px;border-bottom:1px solid #f1f3f4}' +
    '.k-row:last-child{border-bottom:none}' +
    '.kbd{background:#f8f9fa;border:1px solid #dadce0;border-radius:4px;padding:4px 11px;font-family:monospace;font-size:12px;white-space:nowrap;min-width:148px;text-align:center;color:#202124}' +
    '.k-desc{color:#202124;font-size:13px}' +

    // feature rows
    '.f-row{padding:14px 16px;border-bottom:1px solid #f1f3f4}' +
    '.f-row:last-child{border-bottom:none}' +
    '.f-title{font-size:13px;font-weight:500;color:#202124;margin-bottom:4px}' +
    '.f-desc{font-size:12px;color:#80868b;line-height:1.6}' +
    'code{font-family:monospace;background:#f1f3f4;padding:1px 4px;border-radius:3px;font-size:11px}' +

    '</style></head><body><div id="app">' +

    // sidebar
    '<div id="sb">' +
      '<div class="sb-logo">Dev<b>Tools</b></div>' +
      '<nav class="sb-nav">' +
        '<div class="nav-item on" data-s="scripts" onclick="go(this)"><i class="nav-icon">&#9998;</i>Scripts</div>' +
        '<div class="nav-item" data-s="keys" onclick="go(this)"><i class="nav-icon">&#9000;</i>Keybinds</div>' +
        '<div class="nav-item" data-s="about" onclick="go(this)"><i class="nav-icon">&#9432;</i>Features</div>' +
      '</nav>' +
    '</div>' +

    // main
    '<div id="main">' +

      // scripts
      '<div id="sec-scripts" class="sec on">' +
        '<h2>Scripts</h2>' +
        '<div class="card">' +
          '<div class="card-head">New / Edit Script</div>' +
          '<div class="form-area">' +
            '<div class="row">' +
              '<input type="text" id="nameF" placeholder="Script name" style="flex:2">' +
              '<input type="text" id="domF" placeholder="Domain (optional)" style="flex:1">' +
            '</div>' +
            '<textarea id="codeF" rows="9" placeholder="// JavaScript code here&#x2026;"></textarea>' +
            '<div class="form-foot">' +
              '<span id="fStatus"></span>' +
              '<button class="btn btn-g btn-sm" onclick="runOnPage()">Run on page</button>' +
              '<button class="btn btn-p btn-sm" id="saveBtn" onclick="doSave()">Save</button>' +
            '</div>' +
          '</div>' +
          '<div id="sList"></div>' +
        '</div>' +
      '</div>' +

      // keybinds
      '<div id="sec-keys" class="sec">' +
        '<h2>Keyboard Shortcuts</h2>' +
        '<div class="card">' +
          '<div class="k-row"><span class="kbd">Ctrl + `</span><span class="k-desc">Open / focus this manager tab</span></div>' +
          '<div class="k-row"><span class="kbd">Ctrl + Shift + I</span><span class="k-desc">Inject Chii remote debugger panel</span></div>' +
          '<div class="k-row"><span class="kbd">Ctrl + V</span><span class="k-desc">Run a <code>javascript:</code> bookmarklet from clipboard (outside text fields)</span></div>' +
          '<div class="k-row"><span class="kbd">Esc</span><span class="k-desc">Close this tab</span></div>' +
        '</div>' +
      '</div>' +

      // features
      '<div id="sec-about" class="sec">' +
        '<h2>Features</h2>' +
        '<div class="card">' +
          '<div class="f-row"><div class="f-title">Script Manager</div>' +
            '<div class="f-desc">Save JavaScript snippets that auto-run on matching domains whenever devTools.js is injected. ' +
            'Leave domain blank to run on every site. Supports wildcards like <code>*.example.com</code>.</div></div>' +
          '<div class="f-row"><div class="f-title">Global Storage</div>' +
            '<div class="f-desc">Scripts are saved as <code>scripts.json</code> in your GitHub repo and fetched via ' +
            '<code>raw.githubusercontent.com</code>. This works on every site — no iframes, no CSP issues.</div></div>' +
          '<div class="f-row"><div class="f-title">Chii Debugger</div>' +
            '<div class="f-desc">Injects a remote DevTools inspector panel powered by chii.liriliri.io into any page. ' +
            'Use Ctrl+Shift+I to toggle it.</div></div>' +
          '<div class="f-row"><div class="f-title">Bookmarklet Runner</div>' +
            '<div class="f-desc">Copy any <code>javascript:</code> URL, then press Ctrl+V outside a text field ' +
            'to run it immediately on the current page.</div></div>' +
        '</div>' +
      '</div>' +

    '</div></div>' + // #main #app

    '<script>' +
    'var CFG=' + cfg + ';' +
    'var scripts=[],sha=null;' +

    // fetch scripts
    'function loadFromGH(cb){' +
      'fetch(CFG.rawUrl+"?_="+Date.now())' +
        '.then(function(r){return r.ok?r.text():Promise.reject(r.status);})' +
        '.then(function(t){try{scripts=JSON.parse(t);}catch(e){scripts=[];}render();if(cb)cb();})' +
        '.catch(function(){render();if(cb)cb();});' +
    '}' +

    // get SHA then write
    'function saveToGH(arr,cb){' +
      'scripts=arr;' +
      'function write(s){' +
        'var body={message:"devTools: update scripts",' +
          'content:btoa(unescape(encodeURIComponent(JSON.stringify(arr,null,2)))),' +
          'branch:CFG.ghBranch};' +
        'if(s)body.sha=s;' +
        'fetch(CFG.apiUrl,{method:"PUT",' +
          'headers:{"Authorization":"token "+CFG.ghToken,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"},' +
          'body:JSON.stringify(body)})' +
          '.then(function(r){return r.json();})' +
          '.then(function(d){if(d.content&&d.content.sha)sha=d.content.sha;if(cb)cb(null);})' +
          '.catch(function(e){if(cb)cb(e);});' +
      '}' +
      'if(sha){write(sha);return;}' +
      'fetch(CFG.apiUrl,{headers:{"Authorization":"token "+CFG.ghToken,"Accept":"application/vnd.github.v3+json"}})' +
        '.then(function(r){return r.json();})' +
        '.then(function(d){sha=d.sha||null;write(sha);})' +
        '.catch(function(){write(null);});' +
    '}' +

    // notify opener
    'function notify(){' +
      'try{if(window.opener&&!window.opener.closed)' +
        'window.opener.postMessage({type:"devtools_update",scripts:scripts},"*");' +
      '}catch(e){}' +
    '}' +

    // render list
    'function render(){' +
      'var l=document.getElementById("sList");l.innerHTML="";' +
      'if(!scripts.length){l.innerHTML=\'<div class="empty">No scripts yet.</div>\';return;}' +
      'scripts.forEach(function(s,i){' +
        'var row=document.createElement("div");row.className="s-row";' +
        // toggle
        'var lbl=document.createElement("label");lbl.className="tog";' +
        'var cb=document.createElement("input");cb.type="checkbox";cb.checked=!!s.enabled;' +
        'cb.onchange=function(){scripts[i].enabled=this.checked;saveToGH(scripts,notify);};' +
        'var tr=document.createElement("span");tr.className="ttrack";' +
        'var th=document.createElement("span");th.className="tthumb";' +
        'lbl.appendChild(cb);lbl.appendChild(tr);lbl.appendChild(th);' +
        // info
        'var info=document.createElement("div");info.style.flex="1";info.style.minWidth="0";' +
        'var nm=document.createElement("div");nm.className="s-name"+(s.enabled?"":" dim");nm.textContent=s.name;' +
        'var dm=document.createElement("div");dm.className="s-dom";dm.textContent=s.domain||"all sites";' +
        'info.appendChild(nm);info.appendChild(dm);' +
        // edit
        'var eb=document.createElement("button");eb.className="btn btn-g btn-sm";eb.textContent="Edit";' +
        'eb.onclick=(function(s){return function(){' +
          'document.getElementById("nameF").value=s.name;' +
          'document.getElementById("domF").value=s.domain||"";' +
          'document.getElementById("codeF").value=s.code;' +
          'go(document.querySelector("[data-s=scripts]"));' +
          'document.getElementById("nameF").focus();' +
        '};})(s);' +
        // delete
        'var db=document.createElement("button");db.className="s-del";db.textContent="×";db.title="Delete";' +
        'db.onclick=(function(i,name){return function(){' +
          'if(!confirm("Delete \\""+name+"\\"?"))return;' +
          'scripts.splice(i,1);saveToGH(scripts,function(){notify();render();});' +
        '};})(i,s.name);' +
        'row.appendChild(lbl);row.appendChild(info);row.appendChild(eb);row.appendChild(db);' +
        'l.appendChild(row);' +
      '});' +
    '}' +

    // save
    'function doSave(){' +
      'var name=document.getElementById("nameF").value.trim();' +
      'var domain=document.getElementById("domF").value.trim();' +
      'var code=document.getElementById("codeF").value.trim();' +
      'if(!name||!code){alert("Name and code are required.");return;}' +
      'var btn=document.getElementById("saveBtn");btn.disabled=true;' +
      'setStatus("Saving…","#80868b");' +
      'var idx=-1;scripts.forEach(function(s,i){if(s.name===name)idx=i;});' +
      'var entry={name:name,domain:domain,code:code,enabled:true};' +
      'if(idx>=0)scripts[idx]=entry;else scripts.push(entry);' +
      'saveToGH(scripts,function(err){' +
        'btn.disabled=false;' +
        'if(err){setStatus("Save failed — check token","#ea4335");return;}' +
        'setStatus("Saved ✓","#1a73e8");' +
        'document.getElementById("nameF").value="";' +
        'document.getElementById("domF").value="";' +
        'document.getElementById("codeF").value="";' +
        'notify();render();' +
        // run on opener immediately
        'try{if(window.opener&&!window.opener.closed)' +
          'window.opener.postMessage({type:"devtools_run",code:code,domain:domain},"*");}catch(e){}' +
      '});' +
    '}' +

    // run on page
    'function runOnPage(){' +
      'var code=document.getElementById("codeF").value.trim();if(!code)return;' +
      'try{' +
        'if(window.opener&&!window.opener.closed)' +
          'window.opener.postMessage({type:"devtools_run",code:code},"*");' +
        'else alert("No opener page — inject devTools.js on a page first.");' +
      '}catch(e){alert("Error: "+e);}' +
    '}' +

    // status
    'function setStatus(msg,color){' +
      'var el=document.getElementById("fStatus");el.textContent=msg;el.style.color=color||"#80868b";' +
      'if(msg)setTimeout(function(){if(el.textContent===msg)el.textContent="";},3000);' +
    '}' +

    // nav
    'function go(el){' +
      'document.querySelectorAll(".nav-item").forEach(function(n){n.classList.remove("on");});' +
      'document.querySelectorAll(".sec").forEach(function(s){s.classList.remove("on");});' +
      'el.classList.add("on");' +
      'document.getElementById("sec-"+el.getAttribute("data-s")).classList.add("on");' +
    '}' +

    // keyboard
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")window.close();});' +

    // init
    'loadFromGH();' +

    '<\/script></body></html>';
  }

  // ── Init ─────────────────────────────────────────────────────────
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", runStoredScripts);
  else runStoredScripts();

  // ── Shortcuts ────────────────────────────────────────────────────
  document.addEventListener("keydown", function(e){
    var tag = (document.activeElement||{}).tagName;
    var typing = tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      if(typing) return; e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&(e.key==="`"||e.key==="~")){
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
