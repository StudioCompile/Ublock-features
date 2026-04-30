/// devTools.js
!function(){
  var chiiState=0;
  var STORE_KEY="__ublockScripts";

  // ── Storage helpers ──────────────────────────────────────────────
  function loadScripts(){
    try{return JSON.parse(localStorage.getItem(STORE_KEY)||"[]");}
    catch(e){return[];}
  }
  function saveScripts(arr){
    localStorage.setItem(STORE_KEY,JSON.stringify(arr));
  }

  // ── Domain matching ──────────────────────────────────────────────
  function matchesDomain(pattern){
    if(!pattern||pattern.trim()==="*")return true;
    var host=location.hostname;
    return pattern.trim().split(",").map(function(p){return p.trim();}).some(function(p){
      if(p==="*")return true;
      if(p.startsWith("*."))return host===p.slice(2)||host.endsWith("."+p.slice(2));
      return host===p||host.endsWith("."+p);
    });
  }

  // ── Run stored scripts on page load ─────────────────────────────
  function runStoredScripts(){
    loadScripts().forEach(function(s){
      if(s.enabled&&matchesDomain(s.domain)){
        try{Function(s.code)();}
        catch(e){console.warn("[devTools] Script '"+s.name+"' error:",e);}
      }
    });
  }

  // ── Chii ─────────────────────────────────────────────────────────
  function getChiiFrame(){
    return[].slice.call(document.querySelectorAll("iframe[src]")).filter(function(f){
      try{
        var u=new URL(HTMLElement.prototype.getAttribute.call(f,"src"));
        return u.host==="chii.liriliri.io"&&u.pathname==="/front_end/chii_app.html";
      }catch(e){return false;}
    })[0];
  }
  function showChii(){
    var frame=getChiiFrame();
    if(!frame)return;
    var panel=frame.parentNode;
    panel.style.display="";
    document.body.style.height=(document.documentElement.clientHeight-Math.floor(
      Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
    ))+"px";
  }
  function toggleChii(){
    var frame=getChiiFrame();
    if(!frame)return;
    var panel=frame.parentNode;
    var hidden=window.getComputedStyle(panel,null).display==="none";
    panel.style.display=hidden?"":"none";
    document.body.style.height=hidden
      ?(document.documentElement.clientHeight-Math.floor(
          Number(localStorage["chii-embedded-height"]||document.documentElement.clientHeight/2)||100
        ))+"px":"";
  }
  function injectChii(){
    if(chiiState===1)return;
    if(chiiState===2){toggleChii();return;}
    chiiState=1;
    var s=document.createElement("script");
    HTMLElement.prototype.setAttribute.call(s,"embedded","true");
    HTMLElement.prototype.setAttribute.call(s,"src","https://chii.liriliri.io/target.js");
    s.addEventListener("load",function(){
      var attempts=0;
      var poll=setInterval(function(){
        var frame=getChiiFrame();
        if(frame){clearInterval(poll);chiiState=2;showChii();}
        if(++attempts>40){clearInterval(poll);chiiState=0;}
      },100);
    });
    document.head.appendChild(s);
  }

  // ── Bookmarklet ──────────────────────────────────────────────────
  function runBookmarklet(text){
    var t=(text||"").trim();
    if(!t.match(/^javascript:/i))return false;
    try{Function(t.replace(/^javascript:/i,""))();}
    catch(e){alert("Error running bookmarklet:\n"+e);}
    return true;
  }

  // ── Script Manager UI ────────────────────────────────────────────
  var managerOpen=false;
  var managerEl=null;

  function buildManager(){
    if(managerEl)return;
    var el=document.createElement("div");
    el.id="__devToolsManager";
    el.style.cssText=[
      "position:fixed","top:40px","right:40px","width:480px","max-height:80vh",
      "background:#1e1e1e","color:#d4d4d4","font-family:monospace","font-size:13px",
      "border:1px solid #444","border-radius:8px","box-shadow:0 8px 32px rgba(0,0,0,.6)",
      "z-index:2147483647","display:none","flex-direction:column","overflow:hidden"
    ].join(";");

    el.innerHTML=[
      '',
        'Script Manager',
        '✕',
      '',
      '',
        '',
        '',
        '',
        '',
          'Save Script',
          'Run Now',
        '',
      '',
      ''
    ].join("");

    document.body.appendChild(el);
    managerEl=el;

    el.querySelector("#__dtClose").onclick=closeManager;

    el.querySelector("#__dtSave").onclick=function(){
      var name=el.querySelector("#__dtName").value.trim();
      var domain=el.querySelector("#__dtDomain").value.trim();
      var code=el.querySelector("#__dtCode").value.trim();
      if(!name||!code)return alert("Name and code are required.");
      var scripts=loadScripts();
      var existing=scripts.findIndex(function(s){return s.name===name;});
      var entry={name:name,domain:domain||"*",code:code,enabled:true};
      if(existing>=0)scripts[existing]=entry;
      else scripts.push(entry);
      saveScripts(scripts);
      el.querySelector("#__dtName").value="";
      el.querySelector("#__dtDomain").value="";
      el.querySelector("#__dtCode").value="";
      renderList();
    };

    el.querySelector("#__dtRun").onclick=function(){
      var code=el.querySelector("#__dtCode").value.trim();
      if(!code)return;
      try{Function(code)();}
      catch(e){alert("Error:\n"+e);}
    };

    renderList();
  }

  function renderList(){
    if(!managerEl)return;
    var list=managerEl.querySelector("#__dtList");
    var scripts=loadScripts();
    if(!scripts.length){list.innerHTML='No scripts saved yet.';return;}
    list.innerHTML=scripts.map(function(s,i){
      return[
        '',
          '',
          '',
            ''+escHtml(s.name)+'',
            ''+escHtml(s.domain)+'',
          '',
          'Edit',
          '✕',
        ''
      ].join("");
    }).join("");

    list.querySelectorAll(".__dtToggle").forEach(function(cb){
      cb.onchange=function(){
        var scripts=loadScripts();
        scripts[+this.dataset.i].enabled=this.checked;
        saveScripts(scripts);
      };
    });
    list.querySelectorAll(".__dtEdit").forEach(function(btn){
      btn.onclick=function(){
        var s=loadScripts()[+this.dataset.i];
        managerEl.querySelector("#__dtName").value=s.name;
        managerEl.querySelector("#__dtDomain").value=s.domain;
        managerEl.querySelector("#__dtCode").value=s.code;
      };
    });
    list.querySelectorAll(".__dtDel").forEach(function(btn){
      btn.onclick=function(){
        var scripts=loadScripts();
        scripts.splice(+this.dataset.i,1);
        saveScripts(scripts);
        renderList();
      };
    });
  }

  function escHtml(s){
    return s.replace(/&/g,"&").replace(//g,">");
  }

  function openManager(){
    buildManager();
    managerEl.style.display="flex";
    managerOpen=true;
    renderList();
  }
  function closeManager(){
    if(managerEl)managerEl.style.display="none";
    managerOpen=false;
  }
  function toggleManager(){
    managerOpen?closeManager():openManager();
  }

  // ── Init ─────────────────────────────────────────────────────────
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",runStoredScripts);
  }else{
    runStoredScripts();
  }

  document.addEventListener("keydown",function(e){
    // Ctrl+Shift+I → Chii
    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      var tag=(document.activeElement||{}).tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return;
      e.preventDefault();
      injectChii();
      return;
    }
    // Ctrl+~ → Script Manager
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&(e.key==="`"||e.key==="~")){
      e.preventDefault();
      toggleManager();
      return;
    }
    // Ctrl+V → bookmarklet
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.key==="v"){
      var tag=(document.activeElement||{}).tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){
          e.preventDefault();
          runBookmarklet(text);
        }
      }).catch(function(){});
    }
  });
}();
