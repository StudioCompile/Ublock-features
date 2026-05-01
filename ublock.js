/// ublock.js
/// alias ublock
/// world MAIN

function ublock() {
  var chiiState = 0;
  var managerOpen = false;
  var managerEl = null;

  // ── Storage ──────────────────────────────────────────────────────
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

  (function(){
    var timer = setTimeout(function(){
      if(!_ready){ _failed = true; _runQueue(); }
    }, IFRAME_TIMEOUT);

    var f = document.createElement("iframe");
    f.src = STORAGE_URL;
    f.style.cssText = "display:none!important;position:fixed;width:0;height:0;border:0";
    function attach(){
      if (!document.body) return;
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

  function fetchScripts(cb){
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

  function runStoredScripts(){
    fetchScripts(function(scripts){
      scripts.forEach(function(s){
        if(s.enabled){
           // Domain matching logic would go here
           try { (new Function(s.code))(); } catch(e) { console.error(e); }
        }
      });
    });
  }

  // Keyboard shortcut: Ctrl + Shift + `
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') {
       // Your UI toggle logic here
       console.log("uBlock Custom Features Menu Opened");
       runStoredScripts();
    }
  });
}
