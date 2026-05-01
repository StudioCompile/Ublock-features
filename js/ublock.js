/// execute_script.js
// Visual confirmation dot (Blue means System is Active)
const dot = document.createElement('div');
dot.style.cssText = 'position:fixed;top:5px;right:5px;width:8px;height:8px;background:blue;z-index:2147483647;pointer-events:none;border-radius:50%;opacity:0.8;border:1px solid white;';
const injectDot = () => document.body ? document.body.appendChild(dot) : setTimeout(injectDot, 100);
injectDot();

// Full Script Manager Implementation (Self-Contained)
!function(){
  console.log("uBlock Script Manager Initializing...");
  var chiiState=0;
  var STORE_KEY="__ublockScripts";
  var managerOpen=false;
  var managerEl=null;

  // ── Chii ────────────────────────────────────────────────────────
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
    document.body.style.height=hidden?(document.documentElement.clientHeight-Math.floor(
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

  // ── Script storage ───────────────────────────────────────────────
  function loadScripts(){
    try{return JSON.parse(localStorage.getItem(STORE_KEY)||"[]");}
    catch(e){return[];}
  }
  function saveScripts(arr){
    localStorage.setItem(STORE_KEY,JSON.stringify(arr));
  }
  function matchesDomain(pattern){
    if(!pattern||pattern.trim()==="*")return true;
    var host=location.hostname;
    return pattern.trim().split(",").map(function(p){return p.trim();}).some(function(p){
      if(p==="*")return true;
      if(p.indexOf("*.")===0)return host===p.slice(2)||host.endsWith("."+p.slice(2));
      return host===p||host.endsWith("."+p);
    });
  }
  function runStoredScripts(){
    loadScripts().forEach(function(s){
      if(s.enabled&&matchesDomain(s.domain)){
        try{Function(s.code)();}
        catch(e){console.warn("[devTools]",s.name,":",e);}
      }
    });
  }

  // ── Style helper ─────────────────────────────────────────────────
  function mk(tag,styles,props){
    var e=document.createElement(tag);
    if(styles)Object.keys(styles).forEach(function(k){e.style[k]=styles[k];});
    if(props)Object.keys(props).forEach(function(k){e[k]=props[k];});
    return e;
  }
  function apx(parent){
    [].slice.call(arguments,1).forEach(function(c){parent.appendChild(c);});
    return parent;
  }

  // ── Script Manager ───────────────────────────────────────────────
  var C={
    bg:"#1a1a1a",
    surface:"#242424",
    border:"#333333",
    accent:"#4d9de0",
    text:"#cccccc",
    muted:"#666666",
    danger:"#e05555",
    input:"#1e1e1e",
    font:"'Consolas','Menlo','Monaco',monospace"
  };

  function inp(ph,multiline){
    var base={
      background:C.input,
      border:"1px solid "+C.border,
      color:C.text,
      borderRadius:"3px",
      padding:"6px 8px",
      fontFamily:C.font,
      fontSize:"12px",
      width:"100%",
      boxSizing:"border-box",
      outline:"none"
    };
    var e;
    if(multiline){
      e=mk("textarea",base,{placeholder:ph,rows:7,spellcheck:false});
      e.style.resize="vertical";
    }else{
      e=mk("input",base,{placeholder:ph,type:"text"});
    }
    e.addEventListener("focus",function(){this.style.borderColor=C.accent;});
    e.addEventListener("blur",function(){this.style.borderColor=C.border;});
    return e;
  }

  function btn(label,bg,fg){
    var e=mk("button",{
      background:bg||C.surface,
      border:"1px solid "+(bg?bg:C.border),
      color:fg||C.text,
      borderRadius:"3px",
      padding:"5px 12px",
      fontSize:"12px",
      fontFamily:C.font,
      cursor:"pointer",
      whiteSpace:"nowrap"
    });
    e.textContent=label;
    e.addEventListener("mouseover",function(){this.style.opacity="0.8";});
    e.addEventListener("mouseout",function(){this.style.opacity="1";});
    return e;
  }

  function renderList(list){
    while(list.firstChild)list.removeChild(list.firstChild);
    var scripts=loadScripts();
    if(!scripts.length){
      var empty=mk("div",{color:C.muted,padding:"16px",fontSize:"12px",textAlign:"center"});
      empty.textContent="No scripts saved. Add one above.";
      list.appendChild(empty);
      return;
    }
    scripts.forEach(function(s,i){
      var row=mk("div",{
        display:"flex",alignItems:"center",gap:"8px",
        padding:"8px 10px",borderBottom:"1px solid "+C.border,
        background:"transparent"
      });

      var cb=mk("input",{cursor:"pointer",flexShrink:"0"},{type:"checkbox"});
      cb.checked=!!s.enabled;
      cb.title="Enable/disable";
      cb.onchange=function(){
        var arr=loadScripts();
        arr[i].enabled=this.checked;
        saveScripts(arr);
      };

      var info=mk("div",{flex:"1",minWidth:"0"});
      var nameEl=mk("div",{
        color:s.enabled?C.text:C.muted,
        fontSize:"12px",
        fontFamily:C.font,
        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
      });
      nameEl.textContent=s.name;
      var domainEl=mk("div",{color:C.muted,fontSize:"11px",fontFamily:C.font});
      domainEl.textContent=s.domain||"*";
      apx(info,nameEl,domainEl);

      var editB=btn("Edit");
      editB.onclick=function(){
        managerEl.__name.value=s.name;
        managerEl.__domain.value=s.domain;
        managerEl.__code.value=s.code;
        managerEl.__name.focus();
      };

      var delB=btn("Delete",null,C.danger);
      delB.style.borderColor=C.danger;
      delB.onclick=function(){
        if(!confirm("Delete script \""+s.name+"\"?"))return;
        var arr=loadScripts();
        arr.splice(i,1);
        saveScripts(arr);
        renderList(list);
      };

      apx(row,cb,info,editB,delB);
      list.appendChild(row);
    });
  }

  function makeDraggable(wrap,handle){
    var dx=0,dy=0,mx=0,my=0;
    handle.style.cursor="move";
    handle.addEventListener("mousedown",function(e){
      e.preventDefault();
      mx=e.clientX;my=e.clientY;
      document.addEventListener("mousemove",onMove);
      document.addEventListener("mouseup",onUp);
    });
    function onMove(e){
      dx=mx-e.clientX;dy=my-e.clientY;
      mx=e.clientX;my=e.clientY;
      wrap.style.top=(wrap.offsetTop-dy)+"px";
      wrap.style.left=(wrap.offsetLeft-dx)+"px";
      wrap.style.right="auto";
    }
    function onUp(){
      document.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseup",onUp);
    }
  }

  function buildManager(){
    if(managerEl)return;

    var wrap=mk("div",{
      position:"fixed",
      top:"48px",right:"48px",
      width:"500px",
      maxHeight:"600px",
      background:C.bg,
      border:"1px solid "+C.border,
      borderRadius:"4px",
      boxShadow:"0 8px 40px rgba(0,0,0,0.7)",
      zIndex:"2147483647",
      display:"none",
      flexDirection:"column",
      overflow:"hidden",
      fontFamily:C.font
    });

    // ── Title bar
    var titleBar=mk("div",{
      display:"flex",alignItems:"center",
      justifyContent:"space-between",
      padding:"0 12px",
      height:"36px",
      background:C.surface,
      borderBottom:"1px solid "+C.border,
      flexShrink:"0",
      userSelect:"none"
    });
    var titleTxt=mk("span",{color:C.text,fontSize:"12px",fontFamily:C.font});
    titleTxt.textContent="Script Manager";
    var closeB=mk("button",{
      background:"none",border:"none",
      color:C.muted,fontSize:"18px",
      cursor:"pointer",lineHeight:"1",
      padding:"0 2px"
    });
    closeB.textContent="\u00d7";
    closeB.title="Close (Ctrl+`)";
    closeB.onclick=closeManager;
    closeB.addEventListener("mouseover",function(){this.style.color=C.text;});
    closeB.addEventListener("mouseout",function(){this.style.color=C.muted;});
    apx(titleBar,titleTxt,closeB);
    makeDraggable(wrap,titleBar);

    // ── Form area
    var form=mk("div",{
      padding:"12px",
      borderBottom:"1px solid "+C.border,
      display:"flex",flexDirection:"column",gap:"8px",
      flexShrink:"0",background:C.surface
    });

    var row1=mk("div",{display:"flex",gap:"8px"});
    var nameInp=inp("Script name");
    nameInp.style.flex="1";
    var domainInp=inp("Domain (* = all, e.g. example.com)");
    domainInp.style.flex="1";
    apx(row1,nameInp,domainInp);

    var codeArea=inp("// JavaScript code...",true);

    var btnRow=mk("div",{display:"flex",gap:"8px",justifyContent:"flex-end"});
    var runB=btn("Run Now");
    var saveB=btn("Save",C.accent,"#fff");
    saveB.style.border="1px solid "+C.accent;
    apx(btnRow,runB,saveB);

    apx(form,row1,codeArea,btnRow);

    // ── List
    var list=mk("div",{overflowY:"auto",flex:"1"});

    apx(wrap,titleBar,form,list);
    document.body.appendChild(wrap);
    managerEl=wrap;
    wrap.__name=nameInp;
    wrap.__domain=domainInp;
    wrap.__code=codeArea;
    wrap.__list=list;

    saveB.onclick=function(){
      var name=nameInp.value.trim();
      var domain=domainInp.value.trim()||"*";
      var code=codeArea.value.trim();
      if(!name||!code){alert("Name and code are required.");return;}
      var arr=loadScripts();
      var idx=-1;
      arr.forEach(function(s,i){if(s.name===name)idx=i;});
      var entry={name:name,domain:domain,code:code,enabled:true};
      if(idx>=0)arr[idx]=entry;else arr.push(entry);
      saveScripts(arr);
      nameInp.value="";domainInp.value="";codeArea.value="";
      renderList(list);
    };

    runB.onclick=function(){
      var code=codeArea.value.trim();
      if(!code)return;
      try{Function(code)();}
      catch(e){alert("Error:\n"+e);}
    };

    renderList(list);
  }

  function openManager(){
    buildManager();
    managerEl.style.display="flex";
    managerOpen=true;
    renderList(managerEl.__list);
  }
  function closeManager(){
    if(managerEl)managerEl.style.display="none";
    managerOpen=false;
  }

  // ── Init ─────────────────────────────────────────────────────────
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",runStoredScripts);
  }else{
    runStoredScripts();
  }

  // ── Shortcuts ────────────────────────────────────────────────────
  // Use capturing phase to bypass page interference
  window.addEventListener("keydown",function(e){
    var tag=(document.activeElement||{}).tagName;
    var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";

    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&(e.key==="I"||e.key==="i")){
      if(typing)return;
      e.preventDefault();
      e.stopImmediatePropagation();
      injectChii();
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&(e.key==="`"||e.key==="~")){
      e.preventDefault();
      e.stopImmediatePropagation();
      managerOpen?closeManager():openManager();
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&(e.key==="v"||e.key==="V")){
      if(typing)return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){
          e.preventDefault();
          e.stopImmediatePropagation();
          runBookmarklet(text);
        }
      }).catch(function(){});
    }
  }, true);
  
  console.log("uBlock Script Manager Loaded Successfully.");
}();
