/// uFeatures.js
// Inject on every site via a userscript manager (Violentmonkey / Tampermonkey).
//
// HOW IT WORKS:
//   1. Visit google.com/ufeatures  →  page is taken over, shows the full settings UI.
//   2. Scripts are saved in google.com localStorage (the master list).
//   3. When you save/edit/delete/toggle a script, it ALSO pushes to the target
//      site's own localStorage via a quick hidden bridge window (open → set → close).
//   4. On EVERY other page load, uFeatures reads THAT site's localStorage and
//      runs matching scripts. No persistent tab, no bridge needed at runtime.
//   5. Ctrl+`  →  opens google.com/ufeatures settings in a new tab.
//   6. Ctrl+Shift+I  →  Chii remote debugger.

!function(){

  // Guard against double injection. Some injection methods (including some
  // uBlock Origin configurations) can run the same script more than once on
  // a page. If that happens here, we'd end up with duplicate message
  // listeners, duplicate MutationObservers, and duplicate keydown handlers
  // all fighting each other — which can look like "nothing works" even
  // though the script technically ran. This makes re-injection a no-op.
  if(window.__uFeaturesLoaded) return;
  window.__uFeaturesLoaded = true;

  var SITE_KEY  = "__uFeaturesScripts";
  var SITES_KEY = "__uFeaturesSites";
  var _referrer = document.referrer ? new URL(document.referrer).hostname : "";

  var IS_SETTINGS = (
    (location.hostname === "www.google.com" || location.hostname === "google.com") &&
    location.pathname === "/ufeatures"
  );

  // Computed once, reused everywhere instead of each spot recomputing it
  // slightly differently. True for any tab opened as a bridge target,
  // whether that's a normal site or (since pushAppendToGoogle) our own
  // settings page — window.name is checked too since it survives
  // cross-origin redirects that can strip the query string.
  var IS_BRIDGE = location.search.indexOf("__ufb=1") !== -1
                || (window.name && window.name.indexOf("uf_bridge_") === 0);

  // ── Storage ───────────────────────────────────────────────────────
  function siteLoad(){
    try{ return JSON.parse(localStorage.getItem(SITE_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function siteSave(arr){
    localStorage.setItem(SITE_KEY, JSON.stringify(arr));
  }
  function getSites(){
    try{ return JSON.parse(localStorage.getItem(SITES_KEY)||"[]"); }
    catch(e){ return []; }
  }
  function addSite(origin){
    var list = getSites();
    if(list.indexOf(origin)===-1){ list.push(origin); localStorage.setItem(SITES_KEY, JSON.stringify(list)); }
  }

  // ── Bridge ────────────────────────────────────────────────────────
  // Opens a tab on the target origin. Polls by sending uf_bridge_set every
  // 150ms until the tab acks. No handshake — just send and wait for ack.
  //
  // Fast-fail: if a site's CSP blocks our injected script entirely, NO message
  // ever comes back — there's nothing to catch, so normally we'd sit through the
  // full timeout with zero signal. To fail faster, we poll tab.location.href:
  // while the tab is still about:blank this read succeeds (same-origin); the
  // instant it navigates to the cross-origin target, the read throws. That throw
  // tells us navigation has begun, almost immediately (~tens of ms). From that
  // point a working site's bridge listener acks within a few hundred ms (it's
  // injected at document-start), so we only need to wait a short grace window
  // after navigation is detected — not the full timeout — before concluding the
  // site is blocking us. A hard cap remains as a fallback for edge cases where
  // navigation detection itself doesn't fire.

  function pushToSite(origin, scripts, onDone){
    var done    = false;
    var poll    = null;
    var navPoll = null;
    var timer   = null;
    var graceTimer = null;
    var navigated = false;
    var token = Math.random().toString(36).slice(2);
    var winName = "uf_bridge_" + origin.replace(/[^a-zA-Z0-9]/g,"_");

    function finish(err){
      if(done) return;
      done = true;
      clearInterval(poll);
      clearInterval(navPoll);
      clearTimeout(timer);
      clearTimeout(graceTimer);
      window.removeEventListener("message", onMsg);
      setTimeout(function(){ try{ tab && tab.close(); }catch(e){} }, 500);
      if(onDone) onDone(err||null);
    }

    function onMsg(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.token !== token) return;
      if(d.type === "uf_bridge_ack"){
        finish(d.error ? "save-error:"+d.error : null);
      }
    }

    window.addEventListener("message", onMsg);

    var tab = window.open(origin + "/?__ufb=1", winName);
    if(!tab){
      window.removeEventListener("message", onMsg);
      if(onDone) onDone("blocked");
      setSt("Popup blocked \u2014 allow popups from google.com","#cc0000");
      return;
    }

    // Keep sending the payload until the tab acks (it may still be loading)
    poll = setInterval(function(){
      if(done) { clearInterval(poll); return; }
      if(tab.closed){ finish("closed"); return; }
      try{ tab.postMessage({ type:"uf_bridge_set", key:SITE_KEY, scripts:scripts, token:token }, "*"); }catch(e){}
    }, 60);

    // Detect navigation start as fast as possible (tight poll, cheap check)
    navPoll = setInterval(function(){
      if(done || navigated){ clearInterval(navPoll); return; }
      try{
        // Still same-origin (about:blank) — hasn't navigated yet, keep waiting
        var href = tab.location.href;
        if(href && href !== "about:blank") {
          // Same-origin but already past blank — treat as navigated too
          navigated = true;
        }
      }catch(navErr){
        // Cross-origin throw means navigation to the target has begun
        navigated = true;
      }
      if(navigated){
        clearInterval(navPoll);
        // Short grace window once we know the page is loading — a working
        // site's bridge responds within document-start, so this stays tight.
        graceTimer = setTimeout(function(){
          if(!done) finish("timeout");
        }, 700);
      }
    }, 25);

    // Hard cap fallback in case navigation detection never fires
    timer = setTimeout(function(){ if(!done) finish("timeout"); }, 5000);
  }

  // ── Bridge message listener (runs on EVERY page) ──────────────────
  // Never use document.write here — it kills these listeners.
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || typeof d !== "object") return;

    if(d.type === "uf_bridge_set" && d.key && Array.isArray(d.scripts)){
      try{
        // Test whether this site's CSP allows dynamic JS execution before saving.
        // If new Function() is blocked (common CSP restriction), scripts saved here
        // would never actually run on real page loads, so we must fail closed.
        try{ new Function("return 1")(); }
        catch(execErr){
          try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token, error:"CSP blocks script execution on this site" }, "*"); }catch(ex3){}
          var stErr = document.getElementById("__uf_bridge_st");
          if(stErr){ stErr.textContent = "Blocked by site \u2717"; stErr.style.color = "#cc0000"; }
          return;
        }
        localStorage.setItem(d.key, JSON.stringify(d.scripts));
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token }, "*"); }catch(ex2){}
        var st = document.getElementById("__uf_bridge_st");
        if(st){ st.textContent = "Saved \u2713"; st.style.color = "#1e7e34"; }
      }catch(ex){
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token, error:String(ex) }, "*"); }catch(e2){}
      }
    }

    // Append/update a single script entry without touching the rest of the
    // list — used when saving a script from the quick menu on some random
    // site into the master list kept on google.com.
    if(d.type === "uf_bridge_append" && d.key && d.entry){
      try{
        var arr = [];
        try{ arr = JSON.parse(localStorage.getItem(d.key)||"[]"); }catch(pe){}
        var idx = -1;
        for(var ai=0;ai<arr.length;ai++){ if(arr[ai].name === d.entry.name){ idx=ai; break; } }
        if(idx>=0) arr[idx]=d.entry; else arr.push(d.entry);
        localStorage.setItem(d.key, JSON.stringify(arr));
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token }, "*"); }catch(ex2){}
      }catch(ex){
        try{ e.source.postMessage({ type:"uf_bridge_ack", token:d.token, error:String(ex) }, "*"); }catch(e2){}
      }
    }
  });

  // ── Bridge page overlay ───────────────────────────────────────────
  // Show a plain white "Saving…" screen on the bridge tab.
  // Use a fixed overlay div — NOT document.write — so the message listeners survive.
  (function(){
    // No longer excludes IS_SETTINGS — pushAppendToGoogle now targets our
    // own settings page as its bridge destination, and that tab should
    // show this same clean "Saving…" screen instead of flashing the full
    // settings UI before closing itself a moment later.
    if(!IS_BRIDGE) return;

    // We only need OUR script to run on this tab — the actual page content and
    // its scripts are irrelevant and can only get in the way (slow us down,
    // trigger CSP noise, etc). window.stop() halts the parser immediately:
    // it cancels any scripts/resources still queued to load or run, same as
    // hitting the browser's stop button. Whatever already ran before this line
    // executed still ran (we can't undo that), but nothing further will.
    try{ window.stop(); }catch(ex){}

    // Remove any <script> tags already sitting in the DOM so they can't be
    // re-triggered or read by anything else, and strip any that get added
    // afterward (e.g. by an inline handler that fired before window.stop()).
    function stripScripts(){
      var scripts = document.querySelectorAll("script");
      for(var i=0;i<scripts.length;i++){
        try{ scripts[i].remove(); }catch(ex){}
      }
    }
    stripScripts();
    new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var added = muts[i].addedNodes;
        for(var j=0;j<added.length;j++){
          var n = added[j];
          if(n.tagName === "SCRIPT"){ try{ n.remove(); }catch(ex){} }
        }
      }
    }).observe(document.documentElement || document, { childList:true, subtree:true });

    function showOverlay(){
      if(document.getElementById("__uf_bridge_overlay")) return;
      stripScripts();
      var s = document.createElement("style");
      s.textContent = "html,body{background:#fff!important;overflow:hidden!important;margin:0!important;padding:0!important}body>*:not(#__uf_bridge_overlay){display:none!important}";
      (document.head||document.documentElement).appendChild(s);

      var ov = document.createElement("div");
      ov.id = "__uf_bridge_overlay";
      ov.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:13px;color:#555;z-index:2147483647";

      var lbl = document.createElement("div");
      lbl.id = "__uf_bridge_st";
      lbl.textContent = "Saving\u2026";

      ov.appendChild(lbl);
      if(document.body) document.body.appendChild(ov);
      else document.documentElement.appendChild(ov);
    }

    if(document.readyState === "loading"){
      var es = document.createElement("style");
      es.textContent = "html,body{background:#fff!important;overflow:hidden!important}body>*{display:none!important}";
      (document.head||document.documentElement).appendChild(es);
      document.addEventListener("DOMContentLoaded", showOverlay);
    }
    // Call immediately regardless of readyState — window.stop() can prevent
    // DOMContentLoaded from ever firing, so we can't rely on it alone.
    // showOverlay() guards against running twice.
    showOverlay();
  })();

  // ── Securly blocker ───────────────────────────────────────────────
  function killSecurly(){
    var el = document.getElementById("securly_overlay");
    if(el) el.remove();
    ["securly-overlay","securly_overlay","securly-extension"].forEach(function(c){
      var nl = document.getElementsByClassName(c);
      for(var i=nl.length-1;i>=0;i--) nl[i].remove();
    });
  }
  new MutationObserver(killSecurly).observe(document.documentElement,{childList:true,subtree:true});
  killSecurly();

  // ── Domain matching ───────────────────────────────────────────────
  function stripWww(h){ return h.replace(/^www\./,""); }
  function stripProtocol(s){ return s.replace(/^https?:\/\//i,""); }

  function matchesDomain(pattern){
    if(!pattern||!pattern.trim()) return false;
    var host = stripWww(location.hostname), path = location.pathname;
    return pattern.trim().split(",").some(function(p){
      p = stripProtocol(p.trim()); if(!p) return false;
      var si = p.indexOf("/");
      var hp = stripWww(si===-1 ? p : p.slice(0,si));
      var pp = si===-1 ? "" : p.slice(si);
      var hm = hp.slice(0,2)==="*."
        ? host===hp.slice(2)||host.endsWith("."+hp.slice(2))
        : host===hp;
      if(!hm) return false; if(!pp) return true;
      var norm = pp.endsWith("/") ? pp : pp+"/";
      return path===pp||path.startsWith(norm);
    });
  }

  function domainMatchesOrigin(pattern, origin){
    if(!pattern||!pattern.trim()) return false;
    try{
      var host = stripWww(new URL(origin).hostname);
      return pattern.trim().split(",").some(function(p){
        p = stripProtocol(p.trim()); if(!p) return false;
        var si = p.indexOf("/");
        var hp = stripWww(si===-1 ? p : p.slice(0,si));
        return hp.slice(0,2)==="*."
          ? host===hp.slice(2)||host.endsWith("."+hp.slice(2))
          : host===hp;
      });
    }catch(e){ return false; }
  }

  // Decodes only well-formed %XX runs (including multi-byte UTF-8 sequences
  // like %E2%80%99), leaving any other "%" untouched. Plain decodeURIComponent
  // is all-or-nothing: a single stray "%" anywhere in the string (e.g. "50%
  // off", or "x % y" used as a modulus) makes it throw for the ENTIRE string,
  // so legitimate %20-style escapes never get decoded either — leaving literal
  // "%20" sitting in the code, which then breaks as invalid JS syntax. This
  // decodes each contiguous run of %XX groups independently, so one bad
  // sequence only affects that run rather than everything else in the script.
  function safeDecodeURIComponent(str){
    var out = "", i = 0, n = str.length;
    while(i < n){
      if(str[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(str.substr(i+1,2))){
        var j = i, run = "";
        while(str[j] === "%" && /^[0-9A-Fa-f]{2}$/.test(str.substr(j+1,2))){
          run += str.substr(j,3);
          j += 3;
        }
        try{
          out += decodeURIComponent(run);
          i = j;
          continue;
        }catch(e){
          // Not a valid UTF-8 sequence — keep this run literal and move on
          // one character at a time so we don't lose/skip anything.
        }
      }
      out += str[i];
      i++;
    }
    return out;
  }

  // Strips a leading "javascript:" and URL-decodes the rest. Scripts saved
  // via copy-paste from a browser's bookmarks bar come in exactly that
  // form — percent-encoded, "javascript:" prefix and all — and would
  // otherwise fail outright when run through new Function(). Safe to run
  // on plain, non-encoded code too: safeDecodeURIComponent only touches
  // well-formed %XX runs and leaves everything else (including stray "%"
  // used as a modulus operator or inside a string) exactly as written.
  function normalizeScriptCode(code){
    var c = (code||"").trim();
    c = c.replace(/^javascript:/i, "");
    c = safeDecodeURIComponent(c);
    return c;
  }

  // Populated fresh on every run of runSiteScripts — read by the quick
  // menu's "Running Scripts" view so it always reflects the current page,
  // not stale data from a previous load.
  var _ufRunningScripts = [];

  // ── Run stored scripts ────────────────────────────────────────────
  function runSiteScripts(){
    if(IS_SETTINGS) return;
    if(IS_BRIDGE) return;
    _ufRunningScripts = [];
    siteLoad().forEach(function(s){
      if(s.enabled && matchesDomain(s.domain)){
        try{
          new Function(normalizeScriptCode(s.code))();
          _ufRunningScripts.push({ name:s.name, ok:true });
        }catch(e){
          console.warn("[uFeatures]", s.name, e);
          _ufRunningScripts.push({ name:s.name, ok:false, error:String(e) });
        }
      }
    });
  }

  // ── Iframe maximize relay ─────────────────────────────────────────
  // "Fullscreen" here means expanding within the page/site itself — not the
  // real browser Fullscreen API. When a frame asks to maximize, we walk UP
  // the frame chain. At EVERY level, the iframe element that leads down to
  // the frame that asked breaks completely out of that level's own layout
  // via position:fixed (covering that frame's own 100vw/100vh, which for
  // a nested frame means covering its OWN viewport — not the real browser
  // window). Doing this at every level, not just the true top, matters:
  // if an intermediate iframe only got resized to 100% of its container,
  // it would still be boxed in by whatever layout (headers, sidebars, a
  // fixed-size wrapper) that container has — so the actual clicked-into
  // iframe wouldn't visually fill the screen, some OTHER outer box would.
  // Breaking out of flow at every level avoids that and correctly ends up
  // filling the whole screen with the frame the user actually clicked in.
  //
  // We only ever touch position/top/left/width/height/z-index via
  // setProperty, one at a time — never overwrite the whole style
  // attribute. Sites often control their own iframe's opacity/visibility/
  // display inline (e.g. fading it in via JS); replacing the entire style
  // attribute wipes that out and can make the iframe appear blank/invisible
  // even though it's sized correctly. Only the specific properties we set
  // are ever touched, and only those are restored on toggle-off.
  (function(){
    if(IS_SETTINGS) return;
    if(IS_BRIDGE) return;

    var PROPS = ["position","top","left","width","height","z-index"];

    function saveOrig(f){
      if(f.__ufOrigProps) return;
      f.__ufOrigProps = {};
      PROPS.forEach(function(p){ f.__ufOrigProps[p] = f.style.getPropertyValue(p); });
      f.__ufOrigTransition = f.style.getPropertyValue("transition");
    }
    function restoreOrig(f){
      if(!f.__ufOrigProps) return;
      var orig = f.__ufOrigProps;
      var origTransition = f.__ufOrigTransition;
      // transition is already forced to "none" from applyBreakout, so this
      // snap-back is instant regardless of any transition the site applies.
      Object.keys(orig).forEach(function(p){
        var v = orig[p];
        if(v) f.style.setProperty(p, v);
        else f.style.removeProperty(p);
      });
      delete f.__ufOrigProps;
      // Give the site its own transition back only after the instant snap
      // has painted, so re-enabling it doesn't animate the snap itself.
      requestAnimationFrame(function(){
        if(origTransition) f.style.setProperty("transition", origTransition);
        else f.style.removeProperty("transition");
        delete f.__ufOrigTransition;
      });
    }
    function applyBreakout(f){
      saveOrig(f);
      // Kill transitions first (and force a reflow so it actually takes
      // effect before the next changes) — many sites apply a universal
      // `transition: all ...` rule that would otherwise animate our resize
      // and make it feel slow/laggy, or land mid-animation when a message
      // from another nested level arrives.
      f.style.setProperty("transition","none","important");
      void f.offsetWidth;
      f.style.setProperty("position","fixed","important");
      f.style.setProperty("top","0","important");
      f.style.setProperty("left","0","important");
      f.style.setProperty("width","100vw","important");
      f.style.setProperty("height","100vh","important");
      f.style.setProperty("z-index","2147483000","important");
    }

    window.addEventListener("message", function(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.type !== "uf_frame_maximize") return;
      var frames = document.querySelectorAll("iframe");
      for(var i=0;i<frames.length;i++){
        if(frames[i].contentWindow !== e.source) continue;
        var f = frames[i];
        if(d.on) applyBreakout(f); else restoreOrig(f);
        // Keep relaying upward until we reach the real top page
        if(window !== window.top){
          try{ window.parent.postMessage(d, "*"); }catch(ex){}
        }
        return;
      }
    });
  })();

  // ── Iframe corner menu ────────────────────────────────────────────
  (function(){
    if(window === window.top) return;
    if(IS_SETTINGS) return;
    if(IS_BRIDGE) return;

    // 12x12 invisible hot zone fixed to bottom-right corner
    var zone = document.createElement("div");
    zone.style.cssText = "position:fixed;bottom:0;right:0;width:12px;height:12px;z-index:2147483644";

    // Buffer so mouse can travel from corner to the widget without closing
    var buffer = document.createElement("div");
    buffer.style.cssText = "position:fixed;bottom:0;right:0;width:260px;height:50px;z-index:2147483645;pointer-events:none";

    // Styled like Chrome's own bottom-corner link-preview tooltip — flush
    // against the corner (no offset/gap), white background, square corners,
    // thin single-pixel outline, small text — just a bit taller than
    // Chrome's version and pinned to the right instead of the left. The URL
    // field and the fullscreen toggle are fused into one continuous bar
    // (no gap between them) rather than two separate floating widgets, with
    // the fullscreen button picked out in the site's accent red so it reads
    // as "attached to" the URL it controls.
    var popup = document.createElement("div");
    popup.style.cssText = [
      "position:fixed;bottom:0;right:0;z-index:2147483646",
      "display:flex;align-items:stretch;height:24px",
      "background:#fff;border:1px solid #999;border-radius:0",
      "font-family:'Segoe UI',system-ui,-apple-system,sans-serif",
      "opacity:0;pointer-events:none",
      "transition:opacity .15s ease"
    ].join(";");

    var input = document.createElement("input");
    input.type = "text";
    input.style.cssText = [
      "border:none;padding:0 8px",
      "font-family:inherit;font-size:11px",
      "color:#1c1b22;background:#fff;outline:none",
      "width:200px;height:100%;box-sizing:border-box"
    ].join(";");
    input.onkeydown = function(e){
      if(e.key!=="Enter") return;
      var url = input.value.trim();
      if(url) try{ window.parent.postMessage({ type:"uf_iframe_nav", url:url }, "*"); }catch(ex){}
    };

    var ICON_EXPAND  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 3 3 3 3 8"></polyline><polyline points="16 3 21 3 21 8"></polyline><polyline points="3 16 3 21 8 21"></polyline><polyline points="21 16 21 21 16 21"></polyline></svg>';
    var ICON_RESTORE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 9 9 9 9 4"></polyline><polyline points="20 9 15 9 15 4"></polyline><polyline points="4 15 9 15 9 20"></polyline><polyline points="20 15 15 15 15 20"></polyline></svg>';

    var maximized = false;
    var btnFs = document.createElement("button");
    btnFs.innerHTML = ICON_EXPAND;
    btnFs.style.cssText = [
      "width:24px;height:100%;padding:0",
      "display:flex;align-items:center;justify-content:center",
      "cursor:pointer;border:none;border-left:1px solid #999;border-radius:0",
      "background:#7f0000;outline:none;flex-shrink:0",
      "transition:background .1s"
    ].join(";");
    btnFs.onmouseover = function(){ this.style.background="#6a0000"; };
    btnFs.onmouseout  = function(){ this.style.background="#7f0000"; };
    btnFs.onclick = function(e){
      e.stopPropagation();
      maximized = !maximized;
      btnFs.innerHTML = maximized ? ICON_RESTORE : ICON_EXPAND;
      try{ window.parent.postMessage({ type:"uf_frame_maximize", on:maximized }, "*"); }catch(ex){}
    };

    popup.appendChild(input);
    popup.appendChild(btnFs);

    var hideTimer = null;
    var visible = false;

    function show(){
      clearTimeout(hideTimer);
      if(visible) return;
      visible = true;
      input.value = location.href;
      popup.style.pointerEvents = "auto";
      buffer.style.pointerEvents = "auto";
      popup.style.opacity = "1";
    }
    function scheduleHide(){
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){
        visible = false;
        popup.style.opacity = "0";
        popup.style.pointerEvents = "none";
        buffer.style.pointerEvents = "none";
      }, 250);
    }

    zone.addEventListener("mouseenter", show);
    zone.addEventListener("mouseleave", scheduleHide);
    buffer.addEventListener("mouseenter", function(){ clearTimeout(hideTimer); });
    buffer.addEventListener("mouseleave", scheduleHide);
    popup.addEventListener("mouseenter", function(){ clearTimeout(hideTimer); });
    popup.addEventListener("mouseleave", scheduleHide);

    function attach(){
      if(!document.body) return;
      document.body.appendChild(zone);
      document.body.appendChild(buffer);
      document.body.appendChild(popup);
    }
    if(document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach);

    // If parent told us to reopen after a navigation, show once loaded
    window.addEventListener("message", function(e){
      if(e.data && e.data.type === "uf_iframe_reopen") show();
    });
  })();

  // Parent side: listen for uf_iframe_nav, update src, then tell new page to reopen popup
  if(window === window.top){
    window.addEventListener("message", function(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.type !== "uf_iframe_nav" || !d.url) return;
      var frames = document.querySelectorAll("iframe");
      for(var i=0; i<frames.length; i++){
        try{
          if(frames[i].contentWindow === e.source){
            frames[i].src = d.url;
            // After load, tell the new page to show the popup
            frames[i].addEventListener("load", function(){
              try{ frames[i].contentWindow.postMessage({ type:"uf_iframe_reopen" }, "*"); }catch(ex){}
            }, { once:true });
            return;
          }
        }catch(ex){}
      }
    });
  }

  // ── Bookmarklet runner ────────────────────────────────────────────
  function runBookmarklet(text){
    var t=(text||"").trim();
    if(!/^javascript:/i.test(t)) return false;
    var code = t.replace(/^javascript:/i,"");
    // Many bookmarklets are URL-encoded (spaces as %20, etc). safeDecodeURIComponent
    // decodes only well-formed %XX runs and leaves any stray "%" (a modulus
    // operator, a literal "%" in a string, etc) untouched — a plain
    // decodeURIComponent would throw on the whole string over a single bad
    // sequence, leaving legitimate %20s undecoded and breaking as invalid JS.
    code = safeDecodeURIComponent(code);
    try{ new Function(code)(); }
    catch(e){ showToast("Bookmarklet error: "+e, "#cc0000"); }
    return true;
  }

  // ── Chii debugger ─────────────────────────────────────────────────
  // Two cooperating halves, since this script also runs INSIDE the chii
  // iframe itself (chii.liriliri.io):
  //   1. HOST side (the real page): docks chii's own iframe element at
  //      full panel width — no separate sidebar reserved for us anymore.
  //   2. IFRAME side (running inside chii.liriliri.io): builds a small
  //      close button directly in ITS OWN document, in a Shadow DOM so
  //      chii's own styles can't touch it. This keeps the host page's DOM
  //      completely clean — nothing of ours shows up there for its own
  //      inspector to see — and the close control genuinely lives inside
  //      devtools rather than floating over it from outside.
  var _chiiState = 0; // 0 = not loaded, 1 = loading, 2 = loaded
  var _chiiFrame = null;
  var _chiiWrap = null;
  var _chiiHidden = false;
  var _chiiApplyingStyles = false;
  var _chiiWidth = 420;
  var _chiiLastCss = "";
  var _chiiHost = null;
  var _chiiResizeHandle = null;
  var _chiiFilterRestore = null;
  var _chiiInFrameTopbarReady = false;

  var CHII_SRC = "https://chii.liriliri.io/target.js";
  var CHII_MIN_WIDTH = 260;
  var CHII_MAX_WIDTH = 1600;

  // Properties known to get hijacked by broad host-page CSS resets
  // (grayscale filters behind a site's own modals, opacity tricks, blend
  // modes). Forcing these with !important on every piece of our own UI
  // guarantees it renders identically regardless of what the page around
  // it is doing.
  var UF_STYLE_RESET = "filter:none !important;-webkit-filter:none !important;backdrop-filter:none !important;opacity:1 !important;mix-blend-mode:normal !important;";

  var _chiiCloseBtn = null;

  function _chiiSetupHost(){
    if(_chiiHost) return;

    _chiiHost = document.createElement("div");
    _chiiHost.id = "__chii_host";
    document.documentElement.appendChild(_chiiHost);
    var root = _chiiHost.attachShadow({ mode:"open" });

    var style = document.createElement("style");
    style.textContent = [
      ":host{all:initial;--panel-width:"+_chiiWidth+"px}",
      "*{box-sizing:border-box}",
      "#chii-resize-handle{position:fixed;top:0;right:var(--panel-width);width:5px;margin-right:-2px;height:100vh;cursor:col-resize;z-index:2147483647;background:transparent;touch-action:none;display:none;"+UF_STYLE_RESET+"}",
      "#chii-resize-handle::after{content:'';position:absolute;top:0;left:2px;width:1px;height:100%;background:#474747}",
      "#chii-resize-handle.open{display:block}",
      // Guaranteed close button — lives here on the host side because
      // this script is confirmed to run here. The in-frame version inside
      // chii's own iframe (see _chiiBuildInFrameTopbar) only works if the
      // browser extension is also injecting into that third-party iframe,
      // which depends on your extension's own settings — this one doesn't.
      "#chii-close{position:fixed;top:0;right:0;width:26px;height:26px;z-index:2147483647;"+
        "border:none;background:#3c3c3c;color:#c7c7c7;"+
        "display:none;align-items:center;justify-content:center;padding:0;"+
        UF_STYLE_RESET+"}",
      "#chii-close.open{display:flex}",
      "#chii-close:hover{color:#e3e3e3;background:#464646}",
      "#chii-close svg{width:14px;height:14px;pointer-events:none}"
    ].join("\n");
    root.appendChild(style);

    _chiiResizeHandle = document.createElement("div");
    _chiiResizeHandle.id = "chii-resize-handle";
    root.appendChild(_chiiResizeHandle);

    _chiiCloseBtn = document.createElement("button");
    _chiiCloseBtn.id = "chii-close";
    _chiiCloseBtn.title = "Close DevTools";
    _chiiCloseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
    _chiiCloseBtn.addEventListener("click", function(){ _chiiClose(); });
    root.appendChild(_chiiCloseBtn);

    _chiiResizeHandle.addEventListener("pointerdown", function(e){
      _chiiResizeHandle.setPointerCapture(e.pointerId);
      document.body.style.userSelect = "none";
    });
    _chiiResizeHandle.addEventListener("pointermove", function(e){
      if(!_chiiResizeHandle.hasPointerCapture(e.pointerId)) return;
      _chiiSetWidth(window.innerWidth - e.clientX);
    });
    function endDrag(e){
      if(_chiiResizeHandle.hasPointerCapture(e.pointerId)) _chiiResizeHandle.releasePointerCapture(e.pointerId);
      document.body.style.userSelect = "";
    }
    _chiiResizeHandle.addEventListener("pointerup", endDrag);
    _chiiResizeHandle.addEventListener("pointercancel", endDrag);

    // Bonus path: if the in-frame close button (_chiiBuildInFrameTopbar)
    // ever does manage to run — i.e. your extension does inject into the
    // chii.liriliri.io iframe — it messages us here too. Harmless either
    // way since the host-side button above works regardless.
    window.addEventListener("message", function(e){
      if(e.data && e.data.type === "uf_chii_close") _chiiClose();
    });
  }

  function _chiiSetWidth(px){
    _chiiWidth = Math.max(CHII_MIN_WIDTH, Math.min(CHII_MAX_WIDTH, px));
    _chiiHost.style.setProperty("--panel-width", _chiiWidth+"px");
    _chiiResizeHandle.style.right = _chiiWidth+"px";
    _chiiApplyDockedStyle();
  }

  function _chiiSetOpenState(open){
    if(_chiiResizeHandle) _chiiResizeHandle.classList.toggle("open", open);
  }

  function _chiiMatchesFrame(node){
    if(!node || node.tagName!=="IFRAME") return false;
    var src = node.getAttribute("src")||"";
    return src.indexOf("chii_app.html")!==-1;
  }
  function _chiiFindFrameIn(node){
    if(!node || node.nodeType!==1) return null;
    if(_chiiMatchesFrame(node)) return node;
    if(node.querySelector){
      var f = node.querySelector('iframe[src*="chii_app.html"]');
      if(f) return f;
    }
    return null;
  }

  function _chiiApplyDockedStyle(){
    if(!_chiiWrap || !_chiiFrame) return;
    // No sidebar reserved anymore — the panel occupies its full width,
    // flush against the right edge. filter/opacity/blend-mode are forced
    // here too so the panel itself can't be grayed out or hidden by
    // whatever CSS the host page happens to apply broadly.
    var wrapCss =
      "position:fixed !important;top:0 !important;"+
      "right:0 !important;left:auto !important;bottom:auto !important;"+
      "width:"+_chiiWidth+"px !important;max-width:none !important;"+
      "height:100vh !important;max-height:none !important;"+
      "z-index:2147483647 !important;background:#282828 !important;overflow:hidden !important;"+
      "display:"+(_chiiHidden?"none":"block")+" !important;"+
      "margin:0 !important;padding:0 !important;border:none !important;transform:none !important;"+
      UF_STYLE_RESET;
    var frameCss =
      "width:100% !important;max-width:none !important;"+
      "height:100% !important;max-height:none !important;"+
      "border:none !important;display:block !important;margin:0 !important;padding:0 !important;"+
      "background:#282828 !important;"+
      UF_STYLE_RESET;
    if(wrapCss===_chiiLastCss) return;
    _chiiLastCss = wrapCss;
    _chiiApplyingStyles = true;
    _chiiWrap.style.cssText = wrapCss;
    _chiiFrame.style.cssText = frameCss;
    setTimeout(function(){ _chiiApplyingStyles=false; }, 0);
  }

  function _chiiDockRight(frame){
    _chiiFrame = frame;
    _chiiWrap = frame.parentNode;
    _chiiFrame.setAttribute("scrolling","no");
    _chiiApplyDockedStyle();
    _chiiSetOpenState(true);
    _chiiState = 2;

    var styleObserver = new MutationObserver(function(){
      if(_chiiApplyingStyles) return;
      _chiiApplyDockedStyle();
    });
    styleObserver.observe(_chiiWrap, { attributes:true, attributeFilter:["style"] });
    styleObserver.observe(_chiiFrame, { attributes:true, attributeFilter:["style"] });
  }

  function _chiiOpen(){
    if(!_chiiWrap) return;
    _chiiHidden = false;
    _chiiApplyDockedStyle();
    _chiiSetOpenState(true);
  }
  function _chiiClose(){
    if(!_chiiWrap) return;
    _chiiHidden = true;
    _chiiApplyDockedStyle();
    _chiiSetOpenState(false);
  }
  function toggleChii(){
    if(!_chiiWrap) return;
    if(_chiiHidden) _chiiOpen(); else _chiiClose();
  }

  // Runs INSIDE the chii iframe's own document (a separate script
  // instance, since this file is injected on every frame). Tries to
  // insert a real close button into chii's own tab bar — the empty
  // .tabbed-pane-right-toolbar on the right of its header. If that never
  // shows up (different chii build, markup changed, whatever), a floating
  // fallback button guarantees there's always SOME way to close the
  // panel. A small on-screen status line reports what's actually
  // happening, since this runs inside the devtools frame itself — opening
  // a second, separate devtools just to read a console.log here is
  // awkward, so the status is visible directly on screen too.
  function _chiiBuildInFrameTopbar(){
    if(_chiiInFrameTopbarReady) return;
    _chiiInFrameTopbarReady = true;

    var BTN_ID = "__uf_chii_close_btn";
    var DEBUG_ID = "__uf_chii_debug";

    function closeAction(e){
      if(e) e.stopPropagation();
      try{ window.parent.postMessage({ type:"uf_chii_close" }, "*"); }catch(ex){}
    }

    function setDebug(msg){
      var d = document.getElementById(DEBUG_ID);
      if(d) d.remove();
    }

    function getRoot(){
      return document.body || document.documentElement;
    }

    function whenRootReady(fn){
      if(getRoot()){
        fn();
        return;
      }
      setTimeout(function(){ whenRootReady(fn); }, 25);
    }

    function makeToolbarButton(){
      var btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.className = "toolbar-button toolbar-item toolbar-has-glyph";
      btn.setAttribute("aria-label","Close");
      btn.title = "Close";
      btn.setAttribute("role","button");
      btn.setAttribute("tabindex","-1");
      // Sized to fill whatever height chii's own toolbar actually is,
      // rather than a guessed pixel value — more robust if that changes.
      btn.innerHTML = '<devtools-icon role="presentation" class="toolbar-glyph" name="cross"></devtools-icon><div class="toolbar-text hidden"></div>';
      btn.addEventListener("click", closeAction);
      return btn;
    }

    function wireCloseButton(btn){
      if(!btn) return false;
      var row = btn.parentNode;
      var menu = row && row.querySelector ? row.querySelector(".main-menu") : null;
      if(menu && menu.nextSibling !== btn) row.insertBefore(btn, menu.nextSibling);
      var rightToolbar = btn.closest ? btn.closest(".tabbed-pane-right-toolbar") : null;
      if(rightToolbar){
        rightToolbar.style.setProperty("min-width","78px","important");
        rightToolbar.style.setProperty("flex","0 0 auto","important");
      }
      if(row && row.style){
        row.style.setProperty("display","flex","important");
        row.style.setProperty("align-items","center","important");
        row.style.setProperty("position","relative","important");
      }
      btn.classList.remove("hidden");
      btn.hidden = false;
      btn.style.setProperty("display","flex","important");
      btn.style.setProperty("position","relative","important");
      btn.style.setProperty("inset","auto","important");
      btn.style.setProperty("z-index","auto","important");
      btn.style.setProperty("flex","0 0 26px","important");
      btn.style.setProperty("width","26px","important");
      btn.style.setProperty("height","26px","important");
      btn.style.setProperty("margin","0","important");
      btn.style.setProperty("border","none","important");
      btn.style.setProperty("background","transparent","important");
      btn.setAttribute("aria-label","Close");
      btn.title = "Close";
      if(!btn.__ufChiiCloseWired){
        btn.__ufChiiCloseWired = true;
        btn.addEventListener("click", closeAction, true);
      }
      return true;
    }

    function selectNativeCloseButton(){
      var buttons = document.querySelectorAll("button.close-devtools");
      var selected = null;
      for(var i=0;i<buttons.length;i++){
        var parent = buttons[i].parentNode;
        if(parent && parent.querySelector && parent.querySelector(".main-menu")){
          selected = buttons[i];
          break;
        }
      }
      if(!selected) selected = findDeep(document, ".toolbar-shadow button.close-devtools")
                         || findDeep(document, "button.close-devtools");
      for(var j=0;j<buttons.length;j++){
        if(buttons[j] === selected) continue;
        buttons[j].classList.add("hidden");
        buttons[j].hidden = true;
        buttons[j].style.setProperty("display","none","important");
      }
      return selected;
    }

    function findDeep(root, selector){
      if(!root) return null;
      if(root.querySelector){
        var found = root.querySelector(selector);
        if(found) return found;
      }
      var all = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for(var i=0;i<all.length;i++){
        if(all[i].shadowRoot){
          var nested = findDeep(all[i].shadowRoot, selector);
          if(nested) return nested;
        }
      }
      return null;
    }

    function removeCustomCloseButtons(){
      var buttons = document.querySelectorAll("#"+BTN_ID);
      for(var i=0;i<buttons.length;i++){
        try{ buttons[i].remove(); }catch(ex){}
      }
    }

    function ensureToolbarButton(){
      removeCustomCloseButtons();
      var nativeBtn = selectNativeCloseButton();
      if(nativeBtn) return wireCloseButton(nativeBtn);
      setDebug("looking for native chii close button\u2026");
      return false;
    }

    whenRootReady(function(){
      setDebug("starting\u2026");
      ensureToolbarButton();

    // Keep watching indefinitely — chii can re-render its header after
    // the initial load, which would silently remove our button along
    // with it if we ever stopped checking.
      new MutationObserver(ensureToolbarButton)
        .observe(document.documentElement, { childList:true, subtree:true });

      var fastPoll = setInterval(ensureToolbarButton, 25);
      setTimeout(function(){ clearInterval(fastPoll); }, 5000);
    });
  }

  function injectChii(){
    // If we ARE the chii devtools iframe itself, don't try to load a
    // second nested copy of the inspector inside it — instead build our
    // small close-button UI directly here, inside this frame's own
    // document. Regular nested iframes elsewhere on the page (anything
    // that isn't chii's own app) are completely unaffected.
    if(location.hostname === "chii.liriliri.io"){
      try{ window.parent.postMessage({ type:"uf_chii_close" }, "*"); }catch(ex){}
      return;
    }

    if(_chiiState===1) return;
    if(_chiiState===2){ toggleChii(); return; }
    _chiiState = 1;

    // Some sites apply a filter (commonly grayscale) to <html>/<body> to
    // dim the page behind their own modals. Since filter affects the
    // whole subtree regardless of z-index, that would gray out chii's
    // panel too. Neutralize it once, for the lifetime of this page —
    // toggling chii open/closed afterward shouldn't flicker it back.
    if(!_chiiFilterRestore) _chiiFilterRestore = neutralizePageFilter();

    _chiiSetupHost();

    var observer = new MutationObserver(function(mutations){
      for(var i=0;i<mutations.length;i++){
        var added = mutations[i].addedNodes;
        for(var j=0;j<added.length;j++){
          var frame = _chiiFindFrameIn(added[j]);
          if(frame){
            _chiiDockRight(frame);
            observer.disconnect();
            return;
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, { childList:true, subtree:true });

    var s = document.createElement("script");
    s.setAttribute("embedded","true");
    s.setAttribute("src", CHII_SRC);
    (document.head || document.documentElement).appendChild(s);
  }

  if(location.hostname === "chii.liriliri.io"){
    _chiiBuildInFrameTopbar();
  }

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS PAGE  —  google.com/ufeatures
  // ════════════════════════════════════════════════════════════════════

  function bootSettingsPage(){
    document.title = "uFeatures";
    while(document.documentElement.firstChild)
      document.documentElement.removeChild(document.documentElement.firstChild);
    var head=document.createElement("head");
    var meta=document.createElement("meta"); meta.setAttribute("charset","utf-8"); head.appendChild(meta);
    var vp=document.createElement("meta"); vp.name="viewport"; vp.content="width=device-width,initial-scale=1"; head.appendChild(vp);
    var ti=document.createElement("title"); ti.textContent="uFeatures"; head.appendChild(ti);
    var fav=document.createElement("link"); fav.rel="icon"; fav.type="image/png";
    fav.href="https://raw.githubusercontent.com/StudioCompile/uFeatures/main/Logo.png";
    head.appendChild(fav);
    var style=document.createElement("style"); style.textContent=settingsCSS(); head.appendChild(style);
    document.documentElement.appendChild(head);
    var body=document.createElement("body");
    body.innerHTML=settingsHTML();
    document.documentElement.appendChild(body);
    wireSettings();
  }

  function settingsCSS(){
    return [
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
      "html,body{height:100%;background:#f5f5f5;color:#1c1b22;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:13px}",
      "#uf-wrap{display:flex;flex-direction:column;height:100vh;overflow:hidden}",
      // Topbar
      "#uf-top{display:flex;align-items:stretch;background:#fff;border-bottom:1px solid #d8d8d8;height:38px;flex-shrink:0}",
      ".uf-logo{display:flex;align-items:center;gap:7px;padding:0 14px;border-right:1px solid #d8d8d8;font-size:13px;font-weight:600;color:#1c1b22;white-space:nowrap;cursor:pointer;text-decoration:none}",
      ".uf-logo:hover{background:#f7f7f7}",
      ".uf-tabs{display:flex;align-items:stretch}",
      ".uf-tab{display:flex;align-items:center;padding:0 14px;cursor:pointer;font-size:13px;color:#6f6e77;border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none}",
      ".uf-tab:hover{background:#f7f7f7;color:#1c1b22}",
      ".uf-tab.on{color:#1c1b22;border-bottom-color:#7f0000}",
      // Body
      "#uf-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}",
      ".uf-scroll{flex:1;overflow-y:auto;padding:18px 22px 36px}",
      ".uf-sec{display:none}.uf-sec.on{display:flex;flex-direction:column;flex:1;min-height:0}",
      // Status bar
      "#uf-bar{height:20px;background:#e8e8e8;display:flex;align-items:center;padding:0 10px;gap:14px;flex-shrink:0;border-top:1px solid #d8d8d8}",
      "#uf-bar span{font-size:11px;color:#6f6e77}",
      "#uf-barst{margin-left:auto;font-size:11px}",
      // Buttons
      ".uf-btn{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #cfcfcf;background:#fff;color:#1c1b22;border-radius:3px}",
      ".uf-btn:hover{background:#f0f0f0}",
      ".uf-btn:disabled{opacity:.4;cursor:default;pointer-events:none}",
      ".uf-btn.prim{background:#7f0000;border-color:#7f0000;color:#fff}",
      ".uf-btn.prim:hover{background:#6a0000}",
      ".uf-btn.danger{color:#7f0000;border-color:#cfcfcf}",
      ".uf-btn.danger:hover{background:#fbecec;border-color:#7f0000}",
      // Labels / inputs
      ".uf-lbl{font-size:11px;color:#6f6e77;margin-bottom:3px}",
      ".uf-sh{font-size:11px;font-weight:600;color:#6f6e77;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #d8d8d8}",
      ".uf-card{background:#fff;border:1px solid #d8d8d8;margin-bottom:14px;border-radius:4px;overflow:hidden}",
      ".uf-fa{padding:12px 14px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #ececec}",
      ".uf-g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      "input.uf-in{border:1px solid #cfcfcf;padding:5px 8px;font-family:inherit;font-size:13px;outline:none;width:100%;color:#1c1b22;background:#fff;border-radius:3px}",
      "input.uf-in:focus{border-color:#7f0000}",
      "textarea.uf-ta{border:1px solid #cfcfcf;padding:6px 8px;font-family:Consolas,Menlo,monospace;font-size:12px;outline:none;width:100%;resize:vertical;line-height:1.5;min-height:120px;color:#1c1b22;background:#fff;border-radius:3px}",
      "textarea.uf-ta:focus{border-color:#7f0000}",
      ".uf-ff{display:flex;gap:6px;align-items:center;padding:8px 14px;background:#f7f7f7;border-top:1px solid #ececec}",
      "#uf-st{flex:1;font-size:11px}",
      // Script rows — checkbox | info | push-st | edit | delete
      ".uf-srow{display:grid;grid-template-columns:16px 1fr auto 50px 50px;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #ececec}",
      ".uf-srow:last-child{border-bottom:none}",
      ".uf-srow:hover{background:#fafafa}",
      ".uf-sinfo{min-width:0}",
      ".uf-sname{font-size:13px;color:#1c1b22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".uf-sname.dim{color:#bbb}",
      ".uf-sdomain{font-size:11px;color:#999}",
      ".uf-push-st{font-size:10px;color:#bbb;text-align:right;white-space:nowrap}",
      ".uf-empty{padding:24px;text-align:center;color:#bbb}",
      // Checkbox — 16px, red when checked, bigger checkmark
      ".uf-cb{position:relative;width:16px;height:16px;flex-shrink:0;cursor:pointer}",
      ".uf-cb input{opacity:0;position:absolute;width:0;height:0}",
      ".uf-cb .box{position:absolute;inset:0;border:1px solid #cfcfcf;background:#fff;border-radius:3px}",
      ".uf-cb input:checked+.box{background:#7f0000;border-color:#7f0000}",
      ".uf-cb input:checked+.box::after{content:'';position:absolute;left:4px;top:1px;width:6px;height:9px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}",
      // Shortcuts
      ".uf-krow{display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid #ececec}",
      ".uf-krow:last-child{border-bottom:none}",
      ".uf-kbd{background:#f5f5f5;border:1px solid #d8d8d8;padding:4px 8px;font-family:Consolas,Menlo,monospace;font-size:12px;color:#6f6e77;min-width:160px;text-align:center;border-radius:3px}",
      ".uf-kdesc{font-size:13px;color:#444;line-height:1.5}",
      "code.uf-c{background:#f7f7f7;border:1px solid #d8d8d8;padding:1px 5px;font-family:Consolas,Menlo,monospace;font-size:11px;color:#1c1b22;border-radius:3px}",
      // Home
      ".uf-home-hero{display:flex;align-items:center;gap:14px;padding:18px 0 16px}",
      ".uf-home-hero h1{font-size:20px;font-weight:600;color:#1c1b22}",
      ".uf-home-credit{font-size:11px;color:#aaa;margin-top:3px}",
      ".uf-home-desc{font-size:13px;color:#444;line-height:1.65;margin-bottom:16px}",
      ".uf-feat-text p{font-size:13px;color:#444;line-height:1.7;margin-bottom:8px}",
      ".uf-feat-text p b{font-weight:600;color:#1c1b22}"
    ].join("\n");
  }

  function settingsHTML(){
    var icon="https://raw.githubusercontent.com/StudioCompile/uFeatures/main/Logo.png";
    return '<div id="uf-wrap">'
      +'<div id="uf-top">'
        +'<a class="uf-logo" id="uf-home-link" href="https://www.google.com/ufeatures"><img src="'+icon+'" width="18" height="18" style="object-fit:contain;image-rendering:auto">uFeatures</a>'
        +'<div class="uf-tabs">'
          +'<div class="uf-tab on" data-tab="home">Home</div>'
          +'<div class="uf-tab" data-tab="scripts">Scripts</div>'
          +'<div class="uf-tab" data-tab="keys">Shortcuts</div>'
        +'</div>'
      +'</div>'

      +'<div id="uf-body">'

        // HOME
        +'<div class="uf-sec on" id="uf-tab-home"><div class="uf-scroll">'
          +'<div class="uf-home-hero">'
            +'<img src="'+icon+'" width="56" height="56" style="object-fit:contain;flex-shrink:0;image-rendering:auto">'
            +'<div>'
              +'<h1>uFeatures</h1>'
              +'<div class="uf-home-credit">By StudioCompile &mdash; Roblox: studiocompile &middot; Discord: @roblox_studio</div>'
            +'</div>'
          +'</div>'
          +'<div class="uf-home-desc">uBlock Origin lets you inject JS into almost any website, which has a lot of potential. There are already projects out there for it, but you can only add one at a time and most aren\'t great. uFeatures is a great way to add all of these features &mdash; and easily add even more.</div>'
          +'<div class="uf-sh">Features</div>'
          +'<div class="uf-feat-text">'
            +'<p><b>Script Manager</b> &mdash; Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete from My Scripts.</p>'
            +'<p><b>Remove Securly Loading</b> &mdash; Removes Securly overlay elements on load and watches via MutationObserver so they cannot come back.</p>'
            +'<p><b>Inspect Element</b> &mdash; Injects a remote DevTools panel into any page. Ctrl+Shift+I to toggle.</p>'
            +'<p><b>Bookmarklet Runner</b> &mdash; Copy any javascript: URL then press Ctrl+V outside a text field to run it on the current page.</p>'
            +'<p><b>Iframe Navigator</b> &mdash; Hover the bottom-right corner of any iframe to navigate it to a new URL.</p>'
          +'</div>'
        +'</div></div>'

        // SCRIPTS
        +'<div class="uf-sec" id="uf-tab-scripts"><div class="uf-scroll">'
          +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
            +'<div class="uf-sh" style="margin-bottom:0;border-bottom:none;padding-bottom:0">Add / Edit Script</div>'
            +'<button class="uf-btn" id="uf-update" style="font-size:11px">&#8635; Update all sites</button>'
          +'</div>'
          +'<div class="uf-card"><div class="uf-fa">'
            +'<div class="uf-g2">'
              +'<div><div class="uf-lbl">Script name</div><input id="uf-nameF" class="uf-in" type="text" value="My Script"></div>'
              +'<div><div class="uf-lbl">Target domain (e.g. example.com)</div><input id="uf-domF" class="uf-in" type="text" placeholder="example.com"></div>'
            +'</div>'
            +'<div><div class="uf-lbl">JavaScript</div><textarea id="uf-codeF" class="uf-ta" placeholder="// Your script here..."></textarea></div>'
          +'</div>'
          +'<div class="uf-ff">'
            +'<span id="uf-st"></span>'
            +'<button class="uf-btn" id="uf-cancelEdit" style="display:none">Cancel</button>'
            +'<button class="uf-btn prim" id="uf-saveBtn">Save Script</button>'
          +'</div></div>'
          +'<div class="uf-sh" style="margin-top:18px;margin-bottom:10px">Saved Scripts</div>'
          +'<div class="uf-card" id="uf-slist"></div>'
        +'</div></div>'

        // SHORTCUTS
        +'<div class="uf-sec" id="uf-tab-keys"><div class="uf-scroll">'
          +'<div class="uf-sh" style="margin-bottom:10px">Keyboard Shortcuts</div>'
          +'<div class="uf-card">'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + ~</span><span class="uf-kdesc">Opens the uFeatures menu</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + Shift + I</span><span class="uf-kdesc">Toggle Inspect Element</span></div>'
            +'<div class="uf-krow"><span class="uf-kbd">Ctrl + V</span><span class="uf-kdesc">Run a <code class="uf-c">javascript:</code> URL from clipboard (outside a text field)</span></div>'
          +'</div>'
        +'</div></div>'

      +'</div>'

      +'<div id="uf-bar">'
        +'<span id="uf-cnt-s">0 scripts</span>'
        +'<span id="uf-cnt-si">0 sites</span>'
        +'<span id="uf-barst"></span>'
      +'</div>'
    +'</div>';
  }

  // ── Settings wiring ───────────────────────────────────────────────
  var _editingName = null;

  function setSt(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      el.textContent=msg; el.style.color=color||"#777";
    });
    if(msg) setTimeout(function(){
      ["uf-st","uf-barst"].forEach(function(id){
        var el=document.getElementById(id); if(el&&el.textContent===msg) el.textContent="";
      });
    },3000);
  }

  // Like setSt but does NOT auto-clear — used for failures so the user
  // can't miss them. Clears only when the next setSt/setStPersist call happens.
  function setStPersist(msg, color){
    ["uf-st","uf-barst"].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      el.textContent=msg; el.style.color=color||"#cc0000";
    });
  }

  // Switch to the Scripts tab so the user actually sees the error,
  // regardless of which tab they were on when the save happened.
  function focusScriptsTab(){
    var tab = document.querySelector("[data-tab='scripts']");
    var sec = document.getElementById("uf-tab-scripts");
    if(!tab || !sec) return;
    document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
    document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
    tab.classList.add("on");
    sec.classList.add("on");
    var scroll = sec.querySelector(".uf-scroll");
    if(scroll) scroll.scrollTop = 0;
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
      em.textContent="No scripts yet."; c.appendChild(em); return;
    }
    arr.forEach(function(s,i){
      var row=document.createElement("div"); row.className="uf-srow";
      row.setAttribute("data-name", s.name);

      // Checkbox
      var lbl=document.createElement("label"); lbl.className="uf-cb";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!s.enabled;
      var box=document.createElement("span"); box.className="box";
      lbl.appendChild(cb); lbl.appendChild(box);

      // Info
      var info=document.createElement("div"); info.className="uf-sinfo";
      var nm=document.createElement("div"); nm.className="uf-sname"+(s.enabled?"":" dim"); nm.textContent=s.name;
      var dm=document.createElement("div"); dm.className="uf-sdomain"; dm.textContent=s.domain||"(no domain)";
      info.appendChild(nm); info.appendChild(dm);

      // Push status
      var pst=document.createElement("span"); pst.className="uf-push-st";

      cb.onchange=(function(idx,nmEl,pstEl){ return function(){
        var checked=this.checked;
        cb.disabled=true;
        var a=siteLoad(); a[idx].enabled=checked; siteSave(a);
        nmEl.className="uf-sname"+(checked?"":" dim");
        pstEl.textContent="pushing\u2026";
        pushForDomain(a[idx].domain, a, function(ok){
          cb.disabled=false;
          pstEl.textContent=ok?"synced \u2713":"failed";
          pstEl.style.color=ok?"green":"#900";
          updateBar();
        });
      }; })(i,nm,pst);

      // Edit
      var eb=document.createElement("button"); eb.className="uf-btn"; eb.textContent="Edit";
      eb.style.width="50px";
      eb.onclick=(function(sc){ return function(){
        _editingName=sc.name;
        document.getElementById("uf-nameF").value=sc.name;
        document.getElementById("uf-domF").value=sc.domain||"";
        document.getElementById("uf-codeF").value=sc.code;
        document.getElementById("uf-saveBtn").textContent="Update";
        document.getElementById("uf-cancelEdit").style.display="";
        document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
        document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
        document.querySelector("[data-tab='scripts']").classList.add("on");
        document.getElementById("uf-tab-scripts").classList.add("on");
        document.getElementById("uf-tab-scripts").querySelector(".uf-scroll").scrollTop=0;
        document.getElementById("uf-nameF").focus();
      }; })(s);

      // Delete — optimistic: remove locally immediately, push in background
      var db=document.createElement("button"); db.className="uf-btn danger"; db.textContent="Delete";
      db.style.cssText="width:50px;text-align:center";
      db.onclick=(function(idx,name,domain){ return function(){
        if(!confirm("Delete \""+name+"\"?")) return;
        var a=siteLoad(); a.splice(idx,1); siteSave(a);
        renderScripts(); updateBar();
        pushForDomain(domain, a, function(ok){
          if(!ok) setSt("Deleted locally; remote push failed","#900");
        });
      }; })(i,s.name,s.domain);

      row.appendChild(lbl); row.appendChild(info); row.appendChild(pst); row.appendChild(eb); row.appendChild(db);
      c.appendChild(row);
    });
  }

  function wireSettings(){
    var domF=document.getElementById("uf-domF");
    if(_referrer) domF.value=_referrer;

    document.querySelectorAll(".uf-tab").forEach(function(tab){
      tab.addEventListener("click",function(){
        document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
        document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
        tab.classList.add("on");
        var sec=document.getElementById("uf-tab-"+tab.getAttribute("data-tab"));
        if(sec) sec.classList.add("on");
      });
    });

    document.getElementById("uf-cancelEdit").addEventListener("click",function(){
      _editingName=null;
      document.getElementById("uf-nameF").value="My Script";
      document.getElementById("uf-domF").value=_referrer||"";
      document.getElementById("uf-codeF").value="";
      document.getElementById("uf-saveBtn").textContent="Save Script";
      document.getElementById("uf-cancelEdit").style.display="none";
      setSt("","");
    });

    document.getElementById("uf-saveBtn").addEventListener("click",function(){
      var name=(document.getElementById("uf-nameF").value.trim())||"My Script";
      var domain=document.getElementById("uf-domF").value.trim();
      var code=normalizeScriptCode(document.getElementById("uf-codeF").value.trim());
      if(!code){ setSt("Code is required.","#900"); return; }

      var arr=siteLoad(), idx=-1;
      if(_editingName) arr.forEach(function(s,i){ if(s.name===_editingName) idx=i; });
      var entry={name:name,domain:domain,code:code,enabled:true};
      var candidate=arr.slice();
      if(idx>=0) candidate[idx]=entry; else candidate.push(entry);

      var saveBtn=document.getElementById("uf-saveBtn");
      saveBtn.disabled=true;

      function commit(){
        siteSave(candidate);
        _editingName=null;
        saveBtn.textContent="Save Script";
        saveBtn.disabled=false;
        document.getElementById("uf-cancelEdit").style.display="none";
        document.getElementById("uf-nameF").value="My Script";
        document.getElementById("uf-codeF").value="";
        document.getElementById("uf-domF").value=_referrer||"";
        renderScripts(); updateBar();
      }

      if(!domain){
        // Nothing to verify against — safe to save locally right away
        commit();
        return;
      }

      // Don't persist until the push to the target site actually succeeds.
      // If the site blocks script execution (CSP) or can't be reached, the
      // script never gets committed — so it never shows as "saved" when it
      // wouldn't actually run.
      setSt("Verifying "+domain+"\u2026","#777");
      pushForDomain(domain, candidate, function(ok){
        saveBtn.disabled=false;
        if(ok) commit();
        // On failure, pushForDomain already shows a persistent error message
        // and switches to the Scripts tab. Form stays filled so nothing is lost.
      });
    });

    document.getElementById("uf-update").addEventListener("click",function(){
      var sites=getSites(), scripts=siteLoad();
      if(!sites.length){ setSt("No tracked sites.","#777"); return; }
      var rem=sites.length, failed=0;
      setSt("Updating "+rem+" site(s)\u2026","#777");
      sites.forEach(function(origin){
        var toSend=scripts.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
        pushToSite(origin,toSend,function(err){
          rem--; if(err) failed++;
          if(rem<=0){
            if(failed===0) setSt("All updated \u2713","green");
            else setSt(failed+" failed","#900");
          }
        });
      });
    });

    renderScripts(); updateBar();
    highlightRequestedScript();
  }

  // Called from the quick menu's "View in Settings" button — jumps to the
  // Scripts tab, scrolls the matching row into view, and flashes it so
  // it's obvious which script was meant.
  function highlightRequestedScript(){
    var params = new URLSearchParams(location.search);
    var target = params.get("highlight");
    if(!target) return;

    document.querySelectorAll(".uf-tab").forEach(function(t){t.classList.remove("on");});
    document.querySelectorAll(".uf-sec").forEach(function(s){s.classList.remove("on");});
    var tab = document.querySelector("[data-tab='scripts']");
    var sec = document.getElementById("uf-tab-scripts");
    if(tab) tab.classList.add("on");
    if(sec) sec.classList.add("on");

    var rows = document.querySelectorAll(".uf-srow");
    for(var i=0;i<rows.length;i++){
      if(rows[i].getAttribute("data-name") !== target) continue;
      var row = rows[i];
      row.scrollIntoView({ block:"center" });
      row.style.transition = "background .3s";
      row.style.background = "#fbecec";
      setTimeout(function(){ row.style.background = ""; }, 1600);
      break;
    }
  }

  // ── pushForDomain ─────────────────────────────────────────────────
  function pushForDomain(domain, arr, cb){
    if(!domain){
      setSt("Saved (no domain \u2014 not pushed)","#777");
      if(cb) cb(false); return;
    }
    var raw=stripWww(stripProtocol(domain.split(",")[0].trim().replace(/^\*\./,"")));
    var sl=raw.indexOf("/"); if(sl!==-1) raw=raw.slice(0,sl);
    if(!raw){ setSt("Saved","#777"); if(cb) cb(false); return; }

    // Find tracked origins matching this domain (www-insensitive)
    var known=getSites().filter(function(o){
      try{ return stripWww(new URL(o).hostname)===raw; }catch(e){ return false; }
    });
    // First time: open one tab without www — window.name survives any redirect
    var origins=known.length ? known : ["https://"+raw];

    var rem=origins.length, failed=0, anyOk=false, errMsgs=[];
    setSt("Pushing to "+raw+"\u2026","#777");
    origins.forEach(function(origin){
      var toSend=arr.filter(function(s){ return !s.domain||domainMatchesOrigin(s.domain,origin); });
      pushToSite(origin, toSend, function(err){
        rem--;
        if(err){ failed++; errMsgs.push(err); }
        else{ anyOk=true; addSite(origin); updateBar(); }
        if(rem<=0){
          if(anyOk){
            setSt("Saved \u2713","green");
          } else {
            // Clear, persistent failure message — doesn't auto-clear like normal status
            var reason = errMsgs[0]||"unknown error";
            var human = reason.indexOf("CSP")!==-1
              ? raw+" blocks script execution \u2014 this won't run there"
              : reason==="timeout"
                ? "Could not reach "+raw+" (timed out)"
                : reason==="blocked"
                  ? "Popup blocked \u2014 allow popups for google.com"
                  : "Failed to save to "+raw;
            setStPersist("\u2717 Not saved: "+human,"#cc0000");
            focusScriptsTab();
          }
          if(cb) cb(anyOk);
        }
      });
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if(IS_BRIDGE){
    // This tab's only job is to receive a bridge message and ack it — the
    // overlay IIFE above already handles showing the "Saving…" screen.
    // Booting the real settings UI here would wipe that overlay out from
    // under it (bootSettingsPage clears the whole document), and there's
    // nothing for runSiteScripts to usefully do on a tab that's about to
    // close itself in well under a second either way.
  } else if(IS_SETTINGS){
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded",bootSettingsPage);
    else bootSettingsPage();
  } else {
    if(document.readyState==="loading")
      document.addEventListener("DOMContentLoaded",runSiteScripts);
    else runSiteScripts();
  }

  // ── UI helpers (modal, toast, style hardening) ─────────────────────
  // Shared by the quick menu, Run JavaScript panel, and Save Script flow.
  // Everything here is self-contained inline styles since it can appear on
  // any arbitrary site — never relies on external CSS classes.
  var UF_ICON = "https://raw.githubusercontent.com/StudioCompile/uFeatures/main/Logo.png";
  var _modalEl = null;
  var _modalFilterRestore = null;

  // Sites sometimes apply filter/opacity/box-sizing rules broadly (grayscale
  // overlays behind their own modals, icon resets, box model resets) that
  // would otherwise bleed into anything we inject. This walks every element
  // we just built and forces the properties that matter back to sane
  // values, with !important so it wins even against the site's own
  // !important rules.
  function hardenAgainstPageStyles(root){
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
    all.forEach(function(el){
      try{
        el.style.setProperty("filter","none","important");
        el.style.setProperty("-webkit-filter","none","important");
        el.style.setProperty("backdrop-filter","none","important");
        el.style.setProperty("opacity","1","important");
        el.style.setProperty("mix-blend-mode","normal","important");
        el.style.setProperty("box-sizing","border-box","important");
        el.style.setProperty("text-transform","none","important");
        el.style.setProperty("letter-spacing","normal","important");
        if(el.tagName==="svg" || el.tagName==="SVG"){
          var w=el.getAttribute("width"), h=el.getAttribute("height");
          if(w) el.style.setProperty("width", w+"px", "important");
          if(h) el.style.setProperty("height", h+"px", "important");
        }
      }catch(ex){}
    });
  }

  function neutralizePageFilter(){
    var html = document.documentElement, body = document.body;
    var htmlOrig = html.style.getPropertyValue("filter");
    var bodyOrig = body ? body.style.getPropertyValue("filter") : "";
    html.style.setProperty("filter","none","important");
    if(body) body.style.setProperty("filter","none","important");
    return function(){
      if(htmlOrig) html.style.setProperty("filter", htmlOrig);
      else html.style.removeProperty("filter");
      if(body){
        if(bodyOrig) body.style.setProperty("filter", bodyOrig);
        else body.style.removeProperty("filter");
      }
    };
  }

  function closeModal(){
    if(!_modalEl) return;
    try{ _modalEl.remove(); }catch(ex){}
    _modalEl = null;
    if(_modalFilterRestore){ _modalFilterRestore(); _modalFilterRestore = null; }
  }

  // Generic centered modal shell: backdrop + panel + header (logo, title, X)
  // + whatever body node you pass in. Returns the panel in case the caller
  // needs to focus something inside it.
  function openModal(titleText, bodyNode, widthPx){
    closeModal();
    _modalFilterRestore = neutralizePageFilter();

    var backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center";
    backdrop.addEventListener("click", closeModal);

    // Same card look as Settings — #fff on #d8d8d8, no radius (square
    // corners), 1px outline, no shadow. Centered via the backdrop's flexbox
    // instead of position:fixed + transform:translate(-50%,-50%) — that
    // transform-based approach lands the panel on non-integer sub-pixel
    // coordinates, which makes hairline 1px borders render blurry/doubled.
    // Flex centering keeps everything pixel-aligned so borders stay crisp.
    var panel = document.createElement("div");
    panel.style.cssText = [
      "position:relative;z-index:2147483647",
      "width:"+(widthPx||280)+"px;background:#fff;border:1px solid #d8d8d8;border-radius:0",
      "overflow:hidden",
      "font-family:'Segoe UI',system-ui,-apple-system,sans-serif"
    ].join(";");
    panel.addEventListener("click", function(e){ e.stopPropagation(); });

    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 10px 10px 12px;border-bottom:1px solid #d8d8d8";
    var logoImg = document.createElement("img");
    logoImg.src = UF_ICON;
    logoImg.setAttribute("width","18");
    logoImg.setAttribute("height","18");
    // Same styling as the settings-page topbar logo — object-fit:contain
    // plus image-rendering:auto, no extra border/outline treatment.
    logoImg.style.cssText = "width:18px;height:18px;object-fit:contain;image-rendering:auto;flex-shrink:0";
    var titleEl = document.createElement("span");
    titleEl.textContent = titleText;
    titleEl.style.cssText = "font-size:16px;font-weight:600;color:#1c1b22;flex:1";

    var closeBtn = document.createElement("button");
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#777" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="4" x2="20" y2="20"></line><line x1="20" y1="4" x2="4" y2="20"></line></svg>';
    closeBtn.style.cssText = "width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:0;background:transparent;cursor:pointer;flex-shrink:0";
    closeBtn.onmouseover = function(){ this.style.background="#f0f0f0"; };
    closeBtn.onmouseout  = function(){ this.style.background="transparent"; };
    closeBtn.onclick = function(e){ e.stopPropagation(); closeModal(); };

    header.appendChild(logoImg);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(bodyNode);
    backdrop.appendChild(panel);

    hardenAgainstPageStyles(backdrop);
    document.body.appendChild(backdrop);
    _modalEl = backdrop;

    document.addEventListener("keydown", function escHandler(e){
      if(e.key==="Escape"){ closeModal(); document.removeEventListener("keydown", escHandler); }
    });

    return panel;
  }

  // Lightweight auto-dismissing notification — replaces alert() for errors
  // and confirmations so nothing ever uses a native browser dialog.
  function showToast(msg, color){
    var restore = neutralizePageFilter();
    var t = document.createElement("div");
    t.style.cssText = [
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647",
      "background:#fff;border:1px solid #d8d8d8;border-radius:4px;padding:10px 16px",
      "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:13px",
      "color:"+(color||"#1c1b22"),
      "opacity:0;transition:opacity .15s ease;max-width:320px"
    ].join(";");
    t.textContent = msg;
    hardenAgainstPageStyles(t);
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.style.setProperty("opacity","1","important"); });
    setTimeout(function(){
      t.style.setProperty("opacity","0","important");
      setTimeout(function(){ try{ t.remove(); }catch(ex){} restore(); }, 200);
    }, 3000);
  }

  // Shared field builders for modal forms — same colors/outlines as the
  // Settings inputs (border #cfcfcf, focus #7f0000, radius 3px).
  function ufLabel(text){
    var l = document.createElement("div");
    l.textContent = text;
    l.style.cssText = "font-size:11px;color:#6f6e77;margin-bottom:3px";
    return l;
  }
  function ufInput(value){
    var i = document.createElement("input");
    i.type = "text";
    i.value = value||"";
    i.style.cssText = "border:1px solid #cfcfcf;border-radius:3px;padding:6px 8px;font-family:inherit;font-size:13px;color:#1c1b22;background:#fff;width:100%;outline:none;margin-bottom:10px";
    i.onfocus = function(){ this.style.borderColor="#7f0000"; };
    i.onblur  = function(){ this.style.borderColor="#cfcfcf"; };
    return i;
  }
  function ufTextarea(){
    var t = document.createElement("textarea");
    t.style.cssText = "border:1px solid #cfcfcf;border-radius:3px;padding:7px 8px;font-family:Consolas,Menlo,monospace;font-size:12px;color:#1c1b22;background:#fff;width:100%;min-height:110px;resize:vertical;outline:none;margin-bottom:10px";
    t.placeholder = "// JavaScript to run on this page...";
    t.onfocus = function(){ this.style.borderColor="#7f0000"; };
    t.onblur  = function(){ this.style.borderColor="#cfcfcf"; };
    return t;
  }
  // Buttons: same colors as Settings' .uf-btn/.uf-btn.prim, but square —
  // no border-radius on any popup button.
  function ufRedButton(label){
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1;padding:7px 0;border:1px solid #7f0000;border-radius:0;background:#7f0000;color:#fff;font-family:inherit;font-size:13px;cursor:pointer";
    b.onmouseover = function(){ this.style.background="#6a0000"; };
    b.onmouseout  = function(){ this.style.background="#7f0000"; };
    return b;
  }
  function ufPlainButton(label){
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1;padding:7px 0;border:1px solid #cfcfcf;border-radius:0;background:#fff;color:#1c1b22;font-family:inherit;font-size:13px;cursor:pointer";
    b.onmouseover = function(){ this.style.background="#f0f0f0"; };
    b.onmouseout  = function(){ this.style.background="#fff"; };
    return b;
  }

  // ── Quick menu (Ctrl+`) ────────────────────────────────────────────
  function openQuickMenu(){
    var list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;padding:6px 6px 0";

    function addItem(label, onClick){
      var btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = [
        "display:block;width:100%;text-align:left",
        "padding:9px 10px;margin:0;border:none;border-radius:0",
        "background:transparent;color:#1c1b22",
        "font-family:inherit;font-size:13px;cursor:pointer"
      ].join(";");
      btn.onmouseover = function(){ this.style.background="#f5f5f5"; };
      btn.onmouseout  = function(){ this.style.background="transparent"; };
      btn.onclick = function(e){
        e.stopPropagation();
        closeModal();
        onClick();
      };
      list.appendChild(btn);
    }

    addItem("Settings", function(){
      window.open("https://www.google.com/ufeatures","_blank");
    });
    addItem("Inspect Element", function(){
      injectChii();
    });
    addItem("Run JavaScript", function(){
      openRunJsModal();
    });

    var wrap = document.createElement("div");
    wrap.appendChild(list);

    // Small, quiet summary at the bottom rather than another menu button.
    // Wrapped in a centered row so only the text itself (not the full row
    // width) is the clickable/hoverable target — hovering underlines it,
    // like a normal inline link, and click jumps to the running-scripts list.
    var summaryRow = document.createElement("div");
    summaryRow.style.cssText = "padding:6px 0;text-align:center";

    var summary = document.createElement("span");
    summary.textContent = "1 script";
    summary.style.cssText = [
      "display:inline-block",
      "font-size:10px;color:#888",
      "cursor:pointer",
      "text-decoration:none",
      "line-height:1"
    ].join(";");
    summary.onmouseover = function(){ this.style.color="#555"; this.style.textDecoration="underline"; };
    summary.onmouseout  = function(){ this.style.color="#888"; this.style.textDecoration="none"; };
    summary.onclick = function(e){
      e.stopPropagation();
      openRunningScriptsModal();
    };
    summaryRow.appendChild(summary);
    wrap.appendChild(summaryRow);

    openModal("uFeatures", wrap, 400);
  }

  // ── Running Scripts viewer ──────────────────────────────────────────
  // Shows exactly what runSiteScripts() executed on THIS page load — the
  // scripts that were enabled and matched this domain — with a mark for
  // whether each one actually ran without throwing. Styled to match the
  // Scripts list in Settings. Each row's "View" button opens Settings and
  // scrolls straight to that script, highlighted, instead of letting you
  // edit anything from here.
  function openRunningScriptsModal(){
    var card = document.createElement("div");
    card.style.cssText = "margin:10px;border:1px solid #d8d8d8;border-radius:4px;overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,sans-serif";

    if(!_ufRunningScripts.length){
      var empty = document.createElement("div");
      empty.textContent = "No scripts ran on this page.";
      empty.style.cssText = "padding:24px;text-align:center;color:#bbb;font-size:13px;background:#fff";
      card.appendChild(empty);
    } else {
      _ufRunningScripts.forEach(function(s, i){
        var row = document.createElement("div");
        row.style.cssText = [
          "display:grid;grid-template-columns:8px 1fr 50px",
          "align-items:center;gap:9px;padding:8px 12px",
          "background:#fff",
          i<_ufRunningScripts.length-1 ? "border-bottom:1px solid #d8d8d8" : ""
        ].join(";");

        var dot = document.createElement("span");
        dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:"+(s.ok?"#1e7e34":"#cc0000");
        dot.title = s.ok ? "Ran successfully" : "Threw an error";
        if(!s.ok && s.error) row.title = s.error;

        var name = document.createElement("span");
        name.textContent = s.name;
        name.style.cssText = "font-size:13px;color:#1c1b22;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

        var viewBtn = document.createElement("button");
        viewBtn.textContent = "View";
        viewBtn.style.cssText = "width:50px;padding:4px 0;font-size:12px;font-family:inherit;cursor:pointer;border:1px solid #cfcfcf;background:#fff;color:#1c1b22;border-radius:0";
        viewBtn.onmouseover = function(){ this.style.background="#f0f0f0"; };
        viewBtn.onmouseout  = function(){ this.style.background="#fff"; };
        viewBtn.onclick = function(e){
          e.stopPropagation();
          window.open("https://www.google.com/ufeatures?highlight="+encodeURIComponent(s.name), "_blank");
        };

        row.appendChild(dot);
        row.appendChild(name);
        row.appendChild(viewBtn);
        card.appendChild(row);
      });
    }

    openModal("Running Scripts", card, 340);
  }

  // ── Run JavaScript modal ────────────────────────────────────────────
  // Run it once, or save it as a permanent script for this site — which
  // also pushes it into the master list on the settings page.
  function openRunJsModal(){
    var body = document.createElement("div");
    body.style.cssText = "padding:12px";

    body.appendChild(ufLabel("JavaScript"));
    var codeField = ufTextarea();
    body.appendChild(codeField);

    // Initial actions: run it once, or move to naming it to save permanently
    var actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;gap:8px";

    var runBtn = ufRedButton("Run Once");
    runBtn.onclick = function(){
      var code = normalizeScriptCode(codeField.value.trim());
      if(!code) return;
      closeModal();
      try{ new Function(code)(); }
      catch(err){ showToast("Error: "+err, "#cc0000"); }
    };

    var toSaveBtn = ufPlainButton("Save as Script");

    actionRow.appendChild(runBtn);
    actionRow.appendChild(toSaveBtn);
    body.appendChild(actionRow);

    // Naming step: only shown once "Save as Script" is chosen
    var saveStep = document.createElement("div");
    saveStep.style.cssText = "display:none";

    var nameLabel = ufLabel("Script name");
    var nameField = ufInput("My Script");
    saveStep.appendChild(nameLabel);
    saveStep.appendChild(nameField);

    var saveRow = document.createElement("div");
    saveRow.style.cssText = "display:flex;gap:8px";

    var backBtn = ufPlainButton("Back");
    backBtn.onclick = function(){
      saveStep.style.display = "none";
      actionRow.style.display = "flex";
    };

    var confirmSaveBtn = ufRedButton("Save");
    confirmSaveBtn.onclick = function(){
      var code = normalizeScriptCode(codeField.value.trim());
      var name = nameField.value.trim()||"My Script";
      if(!code) return;
      var entry = { name:name, domain:location.hostname, code:code, enabled:true };

      // Save locally so it runs on THIS site immediately/from now on
      var arr = siteLoad();
      var idx = -1;
      for(var i=0;i<arr.length;i++){ if(arr[i].name===entry.name){ idx=i; break; } }
      if(idx>=0) arr[idx]=entry; else arr.push(entry);
      siteSave(arr);

      closeModal();

      // Also push it into the master list on google.com so it shows up
      // in Settings > My Scripts, same as saving it from there directly.
      pushAppendToGoogle(entry, function(err){
        if(err) showToast("Saved for this site, but couldn't sync to Settings", "#cc0000");
        else showToast("Script saved \u2713 — refresh this page to run it", "#1e7e34");
      });
    };

    saveRow.appendChild(backBtn);
    saveRow.appendChild(confirmSaveBtn);
    saveStep.appendChild(saveRow);
    body.appendChild(saveStep);

    toSaveBtn.onclick = function(){
      actionRow.style.display = "none";
      saveStep.style.display = "block";
      nameField.focus();
      nameField.select();
    };

    var panel = openModal("Run JavaScript", body, 400);
    codeField.focus();
  }

  // Push a single script entry into google.com's master list without
  // touching whatever else is already saved there.
  function pushAppendToGoogle(entry, onDone){
    var done=false, poll=null, timer=null;
    var token = Math.random().toString(36).slice(2);
    // IMPORTANT: this targets our OWN settings page, not Google's real
    // search homepage. The bare homepage is a huge, unpredictable page we
    // don't control — region redirects, consent screens, its own strict
    // CSP — any of which can silently swallow the bridge tab and leave it
    // stuck showing "Saving…" forever with no way to diagnose why. Our
    // settings page is a page we fully control instead.
    //
    // location.pathname never includes the query string, so appending
    // "?__ufb=1" here still leaves pathname exactly "/ufeatures" — IS_SETTINGS
    // stays true, so the real settings UI renders. That's fine: the bridge
    // message listener that handles uf_bridge_append is registered
    // unconditionally (not gated by IS_SETTINGS), so it acks back exactly
    // the same regardless of what's currently on screen in that tab.
    var origin = "https://www.google.com/ufeatures";
    // Unique every call — NOT the predictable "uf_bridge_<origin>" name used
    // elsewhere for tab reuse. If this tab itself was ever previously used
    // as a bridge tab for google.com (e.g. from an earlier Settings push)
    // and then navigated elsewhere without closing, its window.name would
    // still carry that old value. window.open(url, matchingName) navigates
    // WHATEVER window currently has that name — including the calling tab
    // itself — which would silently hijack/replace the page the user is
    // actually on, and kill the very script that was waiting for a
    // response (explaining a save that "just stays on saving" forever).
    // A random suffix guarantees this always opens a fresh, separate tab.
    var winName = "uf_bridge_append_" + Date.now() + "_" + token;

    function finish(err){
      if(done) return;
      done = true;
      clearInterval(poll); clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      setTimeout(function(){ try{ tab && tab.close(); }catch(e){} }, 500);
      if(onDone) onDone(err||null);
    }
    function onMsg(e){
      var d = e.data;
      if(!d || typeof d !== "object" || d.token !== token) return;
      if(d.type === "uf_bridge_ack"){
        finish(d.error ? "save-error:"+d.error : null);
      }
    }
    window.addEventListener("message", onMsg);

    var tab = window.open(origin + "?__ufb=1", winName);
    if(!tab){
      window.removeEventListener("message", onMsg);
      if(onDone) onDone("blocked");
      return;
    }
    poll = setInterval(function(){
      if(done){ clearInterval(poll); return; }
      if(tab.closed){ finish("closed"); return; }
      try{ tab.postMessage({ type:"uf_bridge_append", key:SITE_KEY, entry:entry, token:token }, "*"); }catch(e){}
    }, 60);
    timer = setTimeout(function(){ if(!done) finish("timeout"); }, 5000);
  }

  // ── Global shortcuts ──────────────────────────────────────────────
  document.addEventListener("keydown",function(e){
    var tag=(document.activeElement||{}).tagName;
    var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
    if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key==="I"){
      // No "typing" guard here on purpose — this combo is never something
      // someone would type into a field, and the toggle should always work
      // no matter what has focus on the page.
      e.preventDefault(); injectChii(); return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.code==="Backquote"){
      e.preventDefault();
      if(!IS_SETTINGS) window.open("https://www.google.com/ufeatures","_blank");
      return;
    }
    if(e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.key==="v"){
      if(typing) return;
      navigator.clipboard.readText().then(function(text){
        if(text.trim().match(/^javascript:/i)){ e.preventDefault(); runBookmarklet(text); }
      }).catch(function(){});
    }
  });

}();
