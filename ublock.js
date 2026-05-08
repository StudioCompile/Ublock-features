/// runscript.js
(0,eval)((function(){/*!
!function(){

// ═══════════════════════════════════════════════════════════════════
// DevTools — Enhanced Bookmarklet
// Ctrl+`         → Quick popup
// Ctrl+Shift+I   → Toggle Chii inspector
// Ctrl+Shift+N   → Toggle notes
// Ctrl+V (field) → Run clipboard bookmarklet
// ═══════════════════════════════════════════════════════════════════

var STORE_KEY    = '__devToolsScripts';
var NOTES_KEY    = '__dt_notes';
var MGR_WIN_NAME = 'dt-mgr-v3';

var chiiState    = 0;
var _managerWin  = null;
var _popup       = null;
var _notesPanel  = null;
var _notesTimer  = null;
var _mouse       = { x: (window.innerWidth||800)/2, y: (window.innerHeight||600)/2 };

document.addEventListener('mousemove', function(e){
  _mouse.x = e.clientX; _mouse.y = e.clientY;
}, { passive: true, capture: true });

// ═══════════════════════════════════════════════════════════════════
// SECURLY REMOVAL — strips #Securly_overlay from page + iframes
// ═══════════════════════════════════════════════════════════════════
function scrubSecurly(doc) {
  try {
    doc.querySelectorAll(
      '#Securly_overlay,[id*="Securly"],[id*="securly"],[class*="Securly"],[class*="securly"]'
    ).forEach(function(el){ el.remove(); });

    new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if (n.nodeType !== 1) return;
          var id  = (n.id  || '');
          var cls = (n.className || '').toString();
          if (/securly/i.test(id) || /securly/i.test(cls)) { n.remove(); return; }
          try {
            n.querySelectorAll('[id*="Securly"],[id*="securly"],[class*="Securly"],[class*="securly"]')
             .forEach(function(el){ el.remove(); });
          } catch(e){}
        });
      });
    }).observe(doc.documentElement, { childList: true, subtree: true });
  } catch(e){}
}

function removeSecurly() {
  scrubSecurly(document);

  function doIframes(doc) {
    try {
      doc.querySelectorAll('iframe').forEach(function(f){
        try {
          var d = f.contentDocument;
          if (d) { scrubSecurly(d); doIframes(d); }
        } catch(e){}
      });
    } catch(e){}
  }
  doIframes(document);

  new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes.forEach(function(n){
        if ((n.tagName||'') === 'IFRAME') {
          n.addEventListener('load', function(){
            try { var d = n.contentDocument; if(d){ scrubSecurly(d); doIframes(d); } } catch(e){}
          });
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════
// ADAPTIVE THEME — reads page background luminance
// ═══════════════════════════════════════════════════════════════════
function getLuminance() {
  try {
    var el = document.elementFromPoint(_mouse.x, _mouse.y);
    while (el && el !== document.documentElement) {
      var bg = window.getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        var m = bg.match(/[\d.]+/g);
        if (m && m.length >= 3)
          return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
      }
      el = el.parentElement;
    }
    var b = window.getComputedStyle(document.body).backgroundColor;
    var m2 = b.match(/[\d.]+/g);
    if (m2 && m2.length >= 3)
      return (0.299 * +m2[0] + 0.587 * +m2[1] + 0.114 * +m2[2]) / 255;
  } catch(e){}
  return 1;
}

function getTheme() {
  var dark = getLuminance() < 0.45;
  return {
    dark:   dark,
    bg:     dark ? 'rgba(25,25,28,0.97)'  : 'rgba(255,255,255,0.97)',
    text:   dark ? '#f0f0f5'              : '#1c1c1e',
    sub:    dark ? '#8e8e93'              : '#6c6c70',
    border: dark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.1)',
    accent: dark ? '#0a84ff'              : '#007aff',
    hov:    dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
    div:    dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    shadow: dark ? '0 8px 32px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4)'
                 : '0 8px 32px rgba(0,0,0,0.14),0 2px 8px rgba(0,0,0,0.08)'
  };
}

function ensureStyles() {
  if (document.getElementById('__dt_css')) return;
  var s = document.createElement('style');
  s.id = '__dt_css';
  s.textContent =
    '@keyframes __dt_fadein{from{opacity:0;transform:scale(.93) translateY(-5px)}to{opacity:1;transform:none}}' +
    '#__dt_pop *{box-sizing:border-box}' +
    '#__dt_notes *{box-sizing:border-box}';
  (document.head || document.documentElement).appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════
// NOTES — draggable, subtle, saves per-page
// ═══════════════════════════════════════════════════════════════════
function loadNotes() {
  // Try localStorage first (no size limit), fall back to cookie
  try { var ls = localStorage.getItem(NOTES_KEY); if (ls !== null) return ls; } catch(e){}
  try {
    var pair = document.cookie.split(';').filter(function(c){ return c.trim().indexOf(NOTES_KEY+'=') === 0; })[0];
    if (pair) return decodeURIComponent(pair.trim().slice(NOTES_KEY.length + 1));
  } catch(e){}
  return '';
}

function saveNotes(text) {
  try { localStorage.setItem(NOTES_KEY, text); } catch(e){}
  try {
    var enc = encodeURIComponent(text).slice(0, 3800);
    document.cookie = NOTES_KEY + '=' + enc + ';path=/;max-age=31536000;SameSite=Lax';
  } catch(e){}
}

function buildNotesPanel() {
  if (_notesPanel) {
    _notesPanel.style.display = '';
    var ta = _notesPanel.querySelector('textarea');
    if (ta) ta.focus();
    return;
  }
  ensureStyles();
  var t = getTheme();

  var panel = document.createElement('div');
  panel.id = '__dt_notes';
  panel.style.cssText = [
    'position:fixed', 'bottom:22px', 'right:22px', 'width:275px',
    'z-index:2147483646', 'border-radius:12px', 'overflow:hidden',
    'box-shadow:' + t.shadow, 'opacity:0.15',
    'transition:opacity .2s ease,box-shadow .2s ease',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'backdrop-filter:blur(18px)', '-webkit-backdrop-filter:blur(18px)',
    'border:1px solid ' + t.border, 'background:' + t.bg, 'color:' + t.text
  ].join(';');

  // Header / drag handle
  var hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:7px 11px', 'cursor:move', 'user-select:none',
    'border-bottom:1px solid ' + t.div,
    'font-size:10px', 'font-weight:700', 'letter-spacing:.07em',
    'text-transform:uppercase', 'color:' + t.sub
  ].join(';');
  hdr.innerHTML = '<span>📝 Notes</span>';

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'background:none;border:none;color:' + t.sub +
    ';font-size:18px;line-height:1;cursor:pointer;padding:0;opacity:.7;transition:opacity .15s';
  closeBtn.addEventListener('mouseenter', function(){ closeBtn.style.opacity = '1'; });
  closeBtn.addEventListener('mouseleave', function(){ closeBtn.style.opacity = '.7'; });
  closeBtn.onclick = function(){ _notesPanel.style.display = 'none'; };
  hdr.appendChild(closeBtn);

  // Textarea
  var ta = document.createElement('textarea');
  ta.placeholder = 'Notes for this page…';
  ta.value = loadNotes();
  ta.style.cssText = [
    'display:block', 'width:100%', 'height:155px',
    'padding:9px 11px', 'border:none', 'outline:none',
    'resize:vertical', 'font-size:13px', 'line-height:1.55',
    'font-family:inherit', 'background:transparent', 'color:' + t.text,
    'box-sizing:border-box', 'min-height:60px'
  ].join(';');
  ta.addEventListener('input', function(){
    clearTimeout(_notesTimer);
    _notesTimer = setTimeout(function(){ saveNotes(ta.value); }, 350);
  });
  ta.addEventListener('keydown', function(e){ e.stopPropagation(); }); // don't trigger shortcuts

  panel.appendChild(hdr);
  panel.appendChild(ta);

  // Drag
  var drag = null;
  hdr.addEventListener('mousedown', function(e){
    if (e.target === closeBtn) return;
    panel.style.bottom = 'auto'; panel.style.right = 'auto';
    var r = panel.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e){
    if (!drag) return;
    var nx = e.clientX - drag.ox;
    var ny = e.clientY - drag.oy;
    nx = Math.max(0, Math.min(nx, window.innerWidth - panel.offsetWidth));
    ny = Math.max(0, Math.min(ny, window.innerHeight - panel.offsetHeight));
    panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
  });
  document.addEventListener('mouseup', function(){ drag = null; });

  // Subtle hover behavior
  panel.addEventListener('mouseenter', function(){
    panel.style.opacity = '0.96';
    panel.style.boxShadow = t.shadow;
  });
  panel.addEventListener('mouseleave', function(){
    if (document.activeElement !== ta) panel.style.opacity = '0.15';
  });
  ta.addEventListener('focus', function(){ panel.style.opacity = '0.96'; });
  ta.addEventListener('blur',  function(){ panel.style.opacity = '0.15'; });

  document.documentElement.appendChild(panel);
  _notesPanel = panel;
  setTimeout(function(){ ta.focus(); }, 40);
}

function toggleNotes() {
  if (_notesPanel && _notesPanel.style.display !== 'none') {
    _notesPanel.style.display = 'none';
  } else {
    buildNotesPanel();
  }
}

// ═══════════════════════════════════════════════════════════════════
// QUICK POPUP — context-menu style, appears at cursor
// ═══════════════════════════════════════════════════════════════════
function hidePopup() {
  if (_popup) { _popup.remove(); _popup = null; }
  document.removeEventListener('click', _popupAway, true);
  document.removeEventListener('keydown', _popupKey, true);
}
function _popupAway(e) { if (_popup && !_popup.contains(e.target)) hidePopup(); }
function _popupKey(e)  { if (e.key === 'Escape') { e.stopPropagation(); hidePopup(); } }

function showPopup() {
  if (_popup) { hidePopup(); return; }
  ensureStyles();
  var t = getTheme();

  var x = Math.max(4, Math.min(_mouse.x, (window.innerWidth  || 800) - 218));
  var y = Math.max(4, Math.min(_mouse.y, (window.innerHeight || 600) - 260));

  var pop = document.createElement('div');
  pop.id = '__dt_pop';
  pop.style.cssText = [
    'position:fixed', 'left:' + x + 'px', 'top:' + y + 'px', 'width:210px',
    'z-index:2147483647', 'border-radius:11px', 'overflow:hidden',
    'box-shadow:' + t.shadow,
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:13px', 'backdrop-filter:blur(22px)', '-webkit-backdrop-filter:blur(22px)',
    'border:1px solid ' + t.border, 'background:' + t.bg, 'color:' + t.text,
    'animation:__dt_fadein .13s ease', 'user-select:none'
  ].join(';');

  function row(icon, label, kbd, action) {
    var el = document.createElement('div');
    el.style.cssText = [
      'display:flex', 'align-items:center', 'gap:9px', 'padding:8px 13px',
      'cursor:pointer', 'transition:background .07s'
    ].join(';');
    el.innerHTML =
      '<span style="font-size:14px;width:17px;text-align:center;flex-shrink:0">' + icon + '</span>' +
      '<span style="flex:1">' + label + '</span>' +
      (kbd ? '<span style="font-size:10px;color:' + t.sub + ';white-space:nowrap;font-variant-numeric:tabular-nums">' + kbd + '</span>' : '');
    el.addEventListener('mouseenter', function(){ el.style.background = t.hov; });
    el.addEventListener('mouseleave', function(){ el.style.background = '';    });
    el.addEventListener('click', function(e){ e.stopPropagation(); hidePopup(); action(); });
    return el;
  }

  function divider() {
    var d = document.createElement('div');
    d.style.cssText = 'height:1px;background:' + t.div + ';margin:3px 0';
    return d;
  }

  pop.appendChild(row('🔍', 'Inspect Page',    '⌃⇧I', function(){ injectChii();  }));
  pop.appendChild(row('📝', 'Notes',           '⌃⇧N', toggleNotes));
  pop.appendChild(divider());
  pop.appendChild(row('📂', 'Script Manager',  '',     function(){ openManager('scripts');  }));
  pop.appendChild(row('⚙️', 'Settings',         '',     function(){ openManager('settings'); }));
  pop.appendChild(divider());

  var hint = document.createElement('div');
  hint.style.cssText = 'padding:7px 13px 8px;font-size:10px;color:' + t.sub + ';line-height:1.5';
  hint.innerHTML = '<span style="opacity:.6">⌃V outside text fields → run bookmarklet<br>Esc → close</span>';
  pop.appendChild(hint);

  document.documentElement.appendChild(pop);
  _popup = pop;

  setTimeout(function(){
    document.addEventListener('click',   _popupAway, true);
    document.addEventListener('keydown', _popupKey,  true);
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════
// STORAGE (per-origin)
// ═══════════════════════════════════════════════════════════════════
function loadScripts() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch(e) { return []; }
}
function saveScripts(arr) {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
}

// ═══════════════════════════════════════════════════════════════════
// DOMAIN MATCHING
// ═══════════════════════════════════════════════════════════════════
function matchesDomain(pattern) {
  if (!pattern || !pattern.trim()) return true;
  var host = location.hostname, path = location.pathname;
  return pattern.trim().split(',').some(function(p){
    p = p.trim(); if (!p || p === '*') return true;
    var si = p.indexOf('/');
    var hp = si === -1 ? p : p.slice(0, si);
    var pp = si === -1 ? '' : p.slice(si);
    var hm = hp.slice(0,2) === '*.'
      ? host === hp.slice(2) || host.endsWith('.' + hp.slice(2))
      : host === hp;
    if (!hm) return false;
    if (!pp) return true;
    var norm = pp.endsWith('/') ? pp : pp + '/';
    return path === pp || path.startsWith(norm);
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCRIPT RUNNER
// ═══════════════════════════════════════════════════════════════════
function runOne(s) {
  if (s.enabled && matchesDomain(s.domain)) {
    try { Function(s.code)(); }
    catch(e) { console.warn('[devTools]', s.name, e); }
  }
}

function runStoredScripts() {
  loadScripts().forEach(runOne);
  // Ask global manager (if open in another tab) for scripts matching this domain
  tryFetchFromManager(function(globalScripts){
    globalScripts.forEach(runOne);
  });
}

// Non-blocking: tries window.open('',name) to get reference to already-open manager
function tryFetchFromManager(cb) {
  try {
    var mgr = window.open('', MGR_WIN_NAME);
    if (!mgr || mgr.closed || mgr === window) { cb([]); return; }
    var done = false;
    var h = function(e){
      if (e.data && e.data.type === 'dt_scripts_response') {
        done = true;
        window.removeEventListener('message', h);
        cb(e.data.scripts || []);
      }
    };
    window.addEventListener('message', h);
    setTimeout(function(){
      if (!done) { window.removeEventListener('message', h); cb([]); }
    }, 1200);
    mgr.postMessage({ type: 'dt_request_scripts', domain: location.hostname }, '*');
  } catch(e) { cb([]); }
}

// ═══════════════════════════════════════════════════════════════════
// CHII DEBUGGER
// ═══════════════════════════════════════════════════════════════════
function getChiiFrame() {
  return [].slice.call(document.querySelectorAll('iframe[src]')).filter(function(f){
    try {
      var u = new URL(HTMLElement.prototype.getAttribute.call(f, 'src'));
      return u.host === 'chii.liriliri.io' && u.pathname === '/front_end/chii_app.html';
    } catch(e) { return false; }
  })[0];
}
function showChii() {
  var f = getChiiFrame(); if (!f) return;
  f.parentNode.style.display = '';
  document.body.style.height = (document.documentElement.clientHeight -
    Math.floor(Number(localStorage['chii-embedded-height'] ||
    document.documentElement.clientHeight / 2) || 100)) + 'px';
}
function toggleChii() {
  var f = getChiiFrame(); if (!f) return;
  var h = window.getComputedStyle(f.parentNode, null).display === 'none';
  f.parentNode.style.display = h ? '' : 'none';
  document.body.style.height = h ? (document.documentElement.clientHeight -
    Math.floor(Number(localStorage['chii-embedded-height'] ||
    document.documentElement.clientHeight / 2) || 100)) + 'px' : '';
}
function injectChii() {
  if (chiiState === 1) return;
  if (chiiState === 2) { toggleChii(); return; }
  chiiState = 1;
  var s = document.createElement('script');
  HTMLElement.prototype.setAttribute.call(s, 'embedded', 'true');
  HTMLElement.prototype.setAttribute.call(s, 'src', 'https://chii.liriliri.io/target.js');
  s.addEventListener('load', function(){
    var n = 0, poll = setInterval(function(){
      var f = getChiiFrame();
      if (f) { clearInterval(poll); chiiState = 2; showChii(); }
      if (++n > 40) { clearInterval(poll); chiiState = 0; }
    }, 100);
  });
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════
// BOOKMARKLET RUNNER
// ═══════════════════════════════════════════════════════════════════
function runBookmarklet(text) {
  var t = (text || '').trim();
  if (!/^javascript:/i.test(t)) return false;
  try { Function(t.replace(/^javascript:/i, ''))(); }
  catch(e) { alert('Bookmarklet error:\n' + e); }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// MANAGER — postMessage relay from this page
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('message', function(e){
  var d = e.data; if (!d) return;
  if (d.type === 'dt_fetch') {
    try {
      if (_managerWin && !_managerWin.closed)
        _managerWin.postMessage({ type: 'dt_load', scripts: loadScripts() }, '*');
    } catch(e){}
  }
  if (d.type === 'dt_save') { saveScripts(d.scripts); }
  if (d.type === 'dt_run') {
    try { Function(d.code)(); }
    catch(err) { console.error('[devTools] run error:', err); }
  }
});

function openManager(section) {
  var sec = section || 'scripts';
  if (_managerWin && !_managerWin.closed) {
    _managerWin.focus();
    try { _managerWin.postMessage({ type: 'dt_navigate', section: sec }, '*'); } catch(e){}
    return;
  }
  _managerWin = window.open('about:blank', MGR_WIN_NAME);
  var doc = _managerWin.document;
  doc.open();
  doc.write(buildManagerHTML(location.hostname, sec));
  doc.close();
  setTimeout(function(){
    try {
      if (_managerWin && !_managerWin.closed)
        _managerWin.postMessage({ type: 'dt_load', scripts: loadScripts() }, '*');
    } catch(e){}
  }, 160);
}

// ═══════════════════════════════════════════════════════════════════
// MANAGER HTML
// ═══════════════════════════════════════════════════════════════════
function buildManagerHTML(openerHost, initialSection) {
  var oh  = (openerHost || '').replace(/"/g, '');
  var sec = initialSection || 'scripts';

  var CSS = [
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;background:#f2f2f7;color:#1c1c1e}',
    '#app{display:flex;height:100vh}',
    // Sidebar
    '#sb{width:210px;flex-shrink:0;background:#fff;border-right:1px solid #e5e5ea;display:flex;flex-direction:column;padding-top:4px}',
    '.logo{padding:18px 18px 12px;display:flex;align-items:center;gap:8px}',
    '.logo-icon{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#007aff,#5856d6);display:flex;align-items:center;justify-content:center;font-size:14px}',
    '.logo-text{font-size:15px;font-weight:600;color:#1c1c1e}',
    '.logo-text span{color:#007aff}',
    '.nav{flex:1;padding:0 8px}',
    '.ni{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-radius:8px;font-size:13px;user-select:none;transition:background .1s,color .1s;color:#3c3c43;margin-bottom:1px}',
    '.ni:hover{background:#f2f2f7}',
    '.ni.on{background:#e5f0ff;color:#007aff;font-weight:500}',
    '.ni-ic{width:16px;text-align:center;font-size:14px}',
    '.sb-footer{padding:12px 18px;font-size:11px;color:#8e8e93;border-top:1px solid #e5e5ea}',
    // Main
    '#main{flex:1;overflow-y:auto;padding:24px 32px 48px;max-width:100%}',
    '.sec{display:none}.sec.on{display:block;animation:fadein .14s ease}',
    '@keyframes fadein{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}',
    'h2{font-size:16px;font-weight:600;margin-bottom:16px;color:#1c1c1e}',
    '.card{background:#fff;border-radius:12px;border:1px solid #e5e5ea;overflow:hidden;margin-bottom:18px}',
    '.card-title{font-size:11px;font-weight:600;color:#8e8e93;letter-spacing:.06em;text-transform:uppercase;padding:13px 16px 4px}',
    '.form-body{padding:12px 16px 14px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #f2f2f7}',
    'input[type=text]{border:1px solid #d1d1d6;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;color:#1c1c1e;width:100%;background:#fff;transition:border-color .15s,box-shadow .15s}',
    'input[type=text]:focus{border-color:#007aff;box-shadow:0 0 0 3px rgba(0,122,255,.12)}',
    'textarea{border:1px solid #d1d1d6;border-radius:8px;padding:8px 10px;font-family:Menlo,Consolas,Monaco,monospace;font-size:12px;outline:none;color:#1c1c1e;resize:vertical;width:100%;line-height:1.5;background:#fff;transition:border-color .15s,box-shadow .15s}',
    'textarea:focus{border-color:#007aff;box-shadow:0 0 0 3px rgba(0,122,255,.12)}',
    '.form-row{display:flex;gap:8px;align-items:center}',
    '#form-status{flex:1;font-size:12px;color:#8e8e93}',
    '.btn{padding:7px 16px;border-radius:8px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;border:none;transition:background .12s,opacity .12s;white-space:nowrap}',
    '.btn:disabled{opacity:.45;cursor:default}',
    '.btn-primary{background:#007aff;color:#fff}.btn-primary:hover:not(:disabled){background:#0066d6}',
    '.btn-ghost{background:transparent;color:#007aff;border:1px solid #d1d1d6}.btn-ghost:hover{background:#f0f7ff;border-color:#007aff}',
    '.btn-danger{background:transparent;color:#ff3b30;border:1px solid #ffd1cf}.btn-danger:hover{background:#fff5f5}',
    '.btn-sm{padding:5px 11px;font-size:12px;border-radius:7px}',
    // Script rows
    '.script-list{}',
    '.script-row{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f2f2f7;transition:background .08s}',
    '.script-row:last-child{border-bottom:none}',
    '.script-row:hover{background:#fafafa}',
    '.script-name{font-size:13px;font-weight:500;color:#1c1c1e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.script-name.dim{color:#8e8e93}',
    '.script-domain{font-size:11px;color:#8e8e93;margin-top:1px}',
    '.domain-badge{display:inline-block;font-size:10px;color:#007aff;background:#e5f0ff;border-radius:4px;padding:1px 5px;margin-top:2px;font-weight:500}',
    '.domain-badge.all{color:#34c759;background:#e8faf0}',
    '.delete-btn{background:none;border:none;color:#d1d1d6;font-size:20px;cursor:pointer;padding:0;line-height:1;transition:color .12s;flex-shrink:0}',
    '.delete-btn:hover{color:#ff3b30}',
    '.toggle{position:relative;width:34px;height:19px;flex-shrink:0;cursor:pointer}',
    '.toggle input{opacity:0;position:absolute;width:0;height:0}',
    '.toggle-track{position:absolute;inset:0;background:#d1d1d6;border-radius:10px;transition:background .18s}',
    '.toggle input:checked+.toggle-track{background:#34c759}',
    '.toggle-thumb{position:absolute;width:15px;height:15px;background:#fff;border-radius:50%;top:2px;left:2px;transition:transform .18s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
    '.toggle input:checked~.toggle-thumb{transform:translateX(15px)}',
    '.empty-state{padding:36px;text-align:center;color:#8e8e93;font-size:13px}',
    // Keybinds
    '.kb-row{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #f2f2f7}',
    '.kb-row:last-child{border-bottom:none}',
    '.kbd{background:#f2f2f7;border:1px solid #d1d1d6;border-radius:6px;padding:4px 10px;font-family:Menlo,monospace;font-size:12px;color:#1c1c1e;white-space:nowrap;min-width:130px;text-align:center}',
    // Settings
    '.setting-row{padding:14px 16px;border-bottom:1px solid #f2f2f7}',
    '.setting-row:last-child{border-bottom:none}',
    '.setting-title{font-size:13px;font-weight:500;margin-bottom:4px;color:#1c1c1e}',
    '.setting-desc{font-size:12px;color:#8e8e93;line-height:1.55}',
    '.setting-desc code{font-family:Menlo,monospace;background:#f2f2f7;padding:1px 5px;border-radius:4px;font-size:11px}',
    '.setting-actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}',
    '.about-box{background:#f9f9fb;border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:13px;line-height:1.6;color:#3c3c43}',
    'textarea#import-area{height:80px;font-size:11px}',
    // Global scripts badge
    '.global-tag{font-size:10px;color:#5856d6;background:#f0eeff;border-radius:4px;padding:1px 5px;font-weight:600;margin-left:4px}'
  ].join('');

  var JS = [
    // ── State ──
    'var scripts=[];',
    'var OPENER_HOST="' + oh + '";',
    'var WIN_NAME="' + MGR_WIN_NAME + '";',

    // ── window.name persistence (survives navigation within tab) ──
    'function wname_load(){',
    '  try{var d=JSON.parse(window.name||"{}");if(d.__dt_scripts)scripts=d.__dt_scripts;}catch(e){}',
    '}',
    'function wname_save(){',
    '  try{var d={};try{d=JSON.parse(window.name||"{}");}catch(e){}',
    '  d.__dt_scripts=scripts;window.name=JSON.stringify(d);}catch(e){}',
    '}',

    // ── Opener localStorage sync ──
    'function persist(){',
    '  wname_save();',
    '  try{',
    '    if(window.opener&&!window.opener.closed)',
    '      window.opener.postMessage({type:"dt_save",scripts:scripts},"*");',
    '  }catch(e){}',
    '}',

    // ── Respond to script requests from any page ──
    'function domMatches(pattern,host){',
    '  if(!pattern||!pattern.trim())return true;',
    '  return pattern.trim().split(",").some(function(p){',
    '    p=p.trim();if(!p||p==="*")return true;',
    '    var si=p.indexOf("/");',
    '    var hp=si===-1?p:p.slice(0,si);',
    '    if(hp.slice(0,2)==="*.")return host===hp.slice(2)||host.endsWith("."+hp.slice(2));',
    '    return host===hp;',
    '  });',
    '}',

    // ── Message listener ──
    'window.addEventListener("message",function(e){',
    '  var d=e.data;if(!d)return;',
    '  if(d.type==="dt_load"){',
    '    if(d.scripts&&d.scripts.length){',
    '      var existing=scripts.map(function(s){return s.name;});',
    '      d.scripts.forEach(function(s){if(existing.indexOf(s.name)<0)scripts.push(s);});',
    '      persist();render();',
    '    }',
    '  }',
    '  if(d.type==="dt_navigate"){go(d.section);}',
    '  if(d.type==="dt_request_scripts"){',
    '    var dom=d.domain;',
    '    var matching=scripts.filter(function(s){return s.enabled&&domMatches(s.domain,dom);});',
    '    try{e.source.postMessage({type:"dt_scripts_response",scripts:matching},"*");}catch(ex){}',
    '  }',
    '});',

    // ── Request initial scripts from opener ──
    'try{',
    '  if(window.opener&&!window.opener.closed)',
    '    window.opener.postMessage({type:"dt_fetch"},"*");',
    '}catch(e){}',

    // ── Render script list ──
    'function render(){',
    '  var l=document.getElementById("script-list");',
    '  while(l.firstChild)l.removeChild(l.firstChild);',
    '  if(!scripts.length){',
    '    var em=document.createElement("div");em.className="empty-state";',
    '    em.textContent="No scripts yet. Add one above.";l.appendChild(em);return;',
    '  }',
    '  scripts.forEach(function(s,i){',
    '    var row=document.createElement("div");row.className="script-row";',
    '    // Toggle',
    '    var lbl=document.createElement("label");lbl.className="toggle";',
    '    var cb=document.createElement("input");cb.type="checkbox";cb.checked=!!s.enabled;',
    '    var trk=document.createElement("span");trk.className="toggle-track";',
    '    var thm=document.createElement("span");thm.className="toggle-thumb";',
    '    lbl.appendChild(cb);lbl.appendChild(trk);lbl.appendChild(thm);',
    '    // Info',
    '    var info=document.createElement("div");info.style.cssText="flex:1;min-width:0";',
    '    var nm=document.createElement("div");nm.className="script-name"+(s.enabled?"":" dim");nm.textContent=s.name;',
    '    var dm=document.createElement("div");',
    '    dm.innerHTML=\'<span class="domain-badge\'+((!s.domain||s.domain==="*")?" all":"")+'"\'>\'+(s.domain||"all sites")+"</span>";',
    '    info.appendChild(nm);info.appendChild(dm);',
    '    cb.onchange=(function(i,nm){return function(){',
    '      scripts[i].enabled=this.checked;nm.className="script-name"+(this.checked?"":" dim");persist();',
    '    };})(i,nm);',
    '    // Edit btn',
    '    var eb=document.createElement("button");eb.className="btn btn-ghost btn-sm";eb.textContent="Edit";',
    '    eb.onclick=(function(s){return function(){',
    '      document.getElementById("name-f").value=s.name;',
    '      document.getElementById("domain-f").value=s.domain||"";',
    '      document.getElementById("code-f").value=s.code;',
    '      document.getElementById("name-f").focus();',
    '      document.getElementById("name-f").scrollIntoView({behavior:"smooth",block:"nearest"});',
    '    };})(s);',
    '    // Open domain btn (only if domain is set)',
    '    var ob=null;',
    '    if(s.domain&&s.domain!=="*"){',
    '      ob=document.createElement("button");ob.className="btn btn-ghost btn-sm";ob.textContent="↗";ob.title="Open domain";',
    '      ob.style.padding="5px 8px";',
    '      ob.onclick=(function(d){return function(){',
    '        var url=d.indexOf("//")>=0?d:"https://"+d.split("/")[0];',
    '        window.open(url,"_blank");',
    '      };})(s.domain);',
    '    }',
    '    // Delete btn',
    '    var db=document.createElement("button");db.className="delete-btn";db.innerHTML="&times;";db.title="Delete";',
    '    db.onclick=(function(i,n){return function(){',
    '      if(!confirm("Delete \\""+n+"\\"?"))return;',
    '      scripts.splice(i,1);persist();render();',
    '    };})(i,s.name);',
    '    row.appendChild(lbl);row.appendChild(info);row.appendChild(eb);',
    '    if(ob)row.appendChild(ob);',
    '    row.appendChild(db);',
    '    l.appendChild(row);',
    '  });',
    '}',

    // ── Save ──
    'function doSave(){',
    '  var name=document.getElementById("name-f").value.trim();',
    '  var domain=document.getElementById("domain-f").value.trim();',
    '  var code=document.getElementById("code-f").value.trim();',
    '  if(!name||!code){setStatus("Name and code required.","#ff3b30");return;}',
    '  var idx=-1;scripts.forEach(function(s,i){if(s.name===name)idx=i;});',
    '  var entry={name:name,domain:domain,code:code,enabled:true};',
    '  if(idx>=0)scripts[idx]=entry;else scripts.push(entry);',
    '  persist();render();setStatus("Saved ✓","#34c759");',
    '  document.getElementById("name-f").value="";',
    '  document.getElementById("domain-f").value=OPENER_HOST;',
    '  document.getElementById("code-f").value="";',
    '  try{',
    '    if(window.opener&&!window.opener.closed)',
    '      window.opener.postMessage({type:"dt_run",code:code},"*");',
    '  }catch(e){}',
    '}',

    // ── Run on page ──
    'function runOnPage(){',
    '  var code=document.getElementById("code-f").value.trim();if(!code)return;',
    '  try{',
    '    if(window.opener&&!window.opener.closed)',
    '      window.opener.postMessage({type:"dt_run",code:code},"*");',
    '    else alert("No opener — open this manager from a page first.");',
    '  }catch(e){alert("Error: "+e);}',
    '}',

    // ── Status ──
    'function setStatus(msg,color){',
    '  var el=document.getElementById("form-status");',
    '  el.textContent=msg;el.style.color=color||"#8e8e93";',
    '  if(msg)setTimeout(function(){if(el.textContent===msg)el.textContent="";},2800);',
    '}',

    // ── Navigation ──
    'function go(id){',
    '  document.querySelectorAll(".ni").forEach(function(n){n.classList.remove("on");});',
    '  document.querySelectorAll(".sec").forEach(function(s){s.classList.remove("on");});',
    '  var ni=document.querySelector(".ni[data-s=\\""+id+"\\"]");',
    '  if(ni)ni.classList.add("on");',
    '  var sec=document.getElementById("sec-"+id);',
    '  if(sec)sec.classList.add("on");',
    '}',

    // ── Export ──
    'function exportScripts(){',
    '  var json=JSON.stringify(scripts,null,2);',
    '  var b=new Blob([json],{type:"application/json"});',
    '  var a=document.createElement("a");a.href=URL.createObjectURL(b);',
    '  a.download="devtools-scripts.json";a.click();',
    '}',

    // ── Import ──
    'function importScripts(){',
    '  var raw=document.getElementById("import-area").value.trim();',
    '  try{',
    '    var arr=JSON.parse(raw);',
    '    if(!Array.isArray(arr))throw new Error("Expected array");',
    '    var added=0;',
    '    arr.forEach(function(s){',
    '      if(!s.name||!s.code)return;',
    '      var exists=scripts.some(function(x){return x.name===s.name;});',
    '      if(!exists){scripts.push({name:s.name,domain:s.domain||"",code:s.code,enabled:!!s.enabled});added++;}',
    '    });',
    '    persist();render();',
    '    document.getElementById("import-area").value="";',
    '    alert("Imported "+added+" script(s).");',
    '  }catch(e){alert("Import error: "+e.message);}',
    '}',

    // ── Clear all ──
    'function clearAll(){',
    '  if(!confirm("Delete ALL scripts? This cannot be undone."))return;',
    '  scripts=[];persist();render();',
    '  try{',
    '    if(window.opener&&!window.opener.closed)',
    '      window.opener.localStorage.removeItem("__devToolsScripts");',
    '  }catch(e){}',
    '  alert("All scripts cleared.");',
    '}',

    // ── Init ──
    'wname_load();',
    'if(OPENER_HOST)document.getElementById("domain-f").value=OPENER_HOST;',
    'go("' + sec + '");',
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")window.close();});'
  ].join('\n');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>DevTools Manager</title><style>' + CSS + '</style></head><body>' +
    '<div id="app">' +
    // Sidebar
    '<div id="sb">' +
    '<div class="logo"><div class="logo-icon">🛠</div><div class="logo-text">Dev<span>Tools</span></div></div>' +
    '<nav class="nav">' +
    '<div class="ni on" data-s="scripts"  onclick="go(\'scripts\')"  ><span class="ni-ic">📂</span> Scripts</div>' +
    '<div class="ni"    data-s="keys"     onclick="go(\'keys\')"     ><span class="ni-ic">⌨️</span> Keybinds</div>' +
    '<div class="ni"    data-s="settings" onclick="go(\'settings\')" ><span class="ni-ic">⚙️</span> Settings</div>' +
    '</nav>' +
    '<div class="sb-footer">Global Script Manager</div>' +
    '</div>' +
    // Main area
    '<div id="main">' +

    // ── Scripts section ──
    '<div id="sec-scripts" class="sec">' +
    '<h2>Script Manager</h2>' +
    '<div class="card">' +
    '<div class="card-title">Add / Edit Script</div>' +
    '<div class="form-body">' +
    '<input id="name-f"   type="text" placeholder="Script name">' +
    '<input id="domain-f" type="text" placeholder="Domain — blank = all sites · e.g. example.com · *.example.com · example.com/path">' +
    '<textarea id="code-f" rows="9" placeholder="// JavaScript code…"></textarea>' +
    '<div class="form-row">' +
    '<span id="form-status"></span>' +
    '<button class="btn btn-ghost btn-sm" onclick="runOnPage()">▶ Run on page</button>' +
    '<button class="btn btn-primary btn-sm" onclick="doSave()">Save</button>' +
    '</div>' +
    '</div>' +
    '<div id="script-list" class="script-list"></div>' +
    '</div>' +
    '</div>' +

    // ── Keybinds section ──
    '<div id="sec-keys" class="sec">' +
    '<h2>Keyboard Shortcuts</h2>' +
    '<div class="card">' +
    '<div class="kb-row"><span class="kbd">Ctrl + `</span><span>Open quick popup (on injected page)</span></div>' +
    '<div class="kb-row"><span class="kbd">Ctrl + Shift + I</span><span>Toggle Chii remote debugger</span></div>' +
    '<div class="kb-row"><span class="kbd">Ctrl + Shift + N</span><span>Toggle page notes</span></div>' +
    '<div class="kb-row"><span class="kbd">Ctrl + V</span><span>Run <code>javascript:</code> bookmarklet from clipboard (when not in a text field)</span></div>' +
    '<div class="kb-row"><span class="kbd">Esc</span><span>Close popup / close this tab</span></div>' +
    '</div>' +
    '</div>' +

    // ── Settings section ──
    '<div id="sec-settings" class="sec">' +
    '<h2>Settings & About</h2>' +
    '<div class="about-box">' +
    '<strong>DevTools</strong> is a lightweight browser toolbox injected via bookmarklet. ' +
    'It runs on any page and provides: a global JS script manager, Chii remote DevTools inspector, ' +
    'per-page sticky notes, and a bookmarklet runner. No extension required.' +
    '</div>' +
    '<div class="card">' +
    '<div class="setting-row">' +
    '<div class="setting-title">Script Storage</div>' +
    '<div class="setting-desc">' +
    'Scripts are stored in two places: <code>localStorage</code> on the page that opened this manager ' +
    '(for scripts running on that origin), and <code>window.name</code> of this tab (global, survives navigation within this tab). ' +
    'When any page with the bookmarklet loads, it checks both its local storage and requests scripts from this manager tab if it\'s open. ' +
    'Use Export to create a backup that survives closing this tab.' +
    '</div>' +
    '</div>' +
    '<div class="setting-row">' +
    '<div class="setting-title">Export Scripts</div>' +
    '<div class="setting-desc">Download all scripts as a JSON file. Use this to back up your scripts or move them to another browser.</div>' +
    '<div class="setting-actions"><button class="btn btn-ghost btn-sm" onclick="exportScripts()">⬇ Export JSON</button></div>' +
    '</div>' +
    '<div class="setting-row">' +
    '<div class="setting-title">Import Scripts</div>' +
    '<div class="setting-desc">Paste exported JSON below to import. Existing scripts with the same name won\'t be overwritten.</div>' +
    '<div class="setting-actions" style="flex-direction:column;gap:6px">' +
    '<textarea id="import-area" placeholder=\'Paste JSON here…\'></textarea>' +
    '<button class="btn btn-ghost btn-sm" style="align-self:flex-start" onclick="importScripts()">⬆ Import</button>' +
    '</div>' +
    '</div>' +
    '<div class="setting-row">' +
    '<div class="setting-title" style="color:#ff3b30">Danger Zone</div>' +
    '<div class="setting-desc">Delete all saved scripts from both this manager and the opener page\'s localStorage.</div>' +
    '<div class="setting-actions"><button class="btn btn-danger btn-sm" onclick="clearAll()">🗑 Clear All Scripts</button></div>' +
    '</div>' +
    '</div>' +
    '<div class="card" style="margin-top:14px">' +
    '<div class="setting-row">' +
    '<div class="setting-title">Chii Debugger</div>' +
    '<div class="setting-desc">Injects a remote DevTools inspector (<code>chii.liriliri.io</code>) into any page. Useful on mobile or when DevTools is blocked. Press <code>Ctrl+Shift+I</code> on the target page.</div>' +
    '</div>' +
    '<div class="setting-row">' +
    '<div class="setting-title">Notes</div>' +
    '<div class="setting-desc">A draggable, low-opacity sticky note saved per page via <code>localStorage</code> and cookie. Fades to nearly invisible when not focused. Press <code>Ctrl+Shift+N</code> to toggle.</div>' +
    '</div>' +
    '<div class="setting-row">' +
    '<div class="setting-title">Securly Removal</div>' +
    '<div class="setting-desc">Automatically removes <code>#Securly_overlay</code> and related elements from the page and all iframes on every injection. Uses a MutationObserver to catch dynamically added overlays.</div>' +
    '</div>' +
    '</div>' +
    '</div>' +

    '</div></div>' + // end #main, #app
    '<script>' + JS + '<\/script>' +
    '</body></html>';
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e){
  var ae     = document.activeElement || {};
  var tag    = ae.tagName || '';
  var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
               ae.contentEditable === 'true' || ae.isContentEditable;

  // Ctrl+Shift+I — Chii inspector
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'I') {
    if (typing) return;
    e.preventDefault(); injectChii(); return;
  }

  // Ctrl+Shift+N — Notes
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'N') {
    e.preventDefault(); toggleNotes(); return;
  }

  // Ctrl+` — Quick popup
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'Backquote') {
    e.preventDefault(); showPopup(); return;
  }

  // Escape — close popup
  if (e.key === 'Escape' && _popup) {
    hidePopup(); return;
  }

  // Ctrl+V — run bookmarklet from clipboard (only outside text fields)
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'v') {
    if (typing) return;
    navigator.clipboard.readText().then(function(text){
      if (/^javascript:/i.test(text.trim())) {
        e.preventDefault();
        runBookmarklet(text);
      }
    }).catch(function(){});
  }
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
removeSecurly();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runStoredScripts);
} else {
  runStoredScripts();
}

}();
*/}).toString().slice(16,-3))
