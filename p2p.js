/* FC26_P2P_SHIM
   Makes the game work with no server. The host's browser plays the part of the server
   (same rules engine) and friends connect to it directly through PeerJS (WebRTC).
   The page code is unchanged: this file replaces fetch('/api/...') and EventSource. */
(function () {
  'use strict';
  var E = FC26;
  var PREFIX = 'fc26auction-';
  var CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var RealFetch = window.fetch ? window.fetch.bind(window) : null;
  var NET_ERR = 'Could not reach the matchmaking service. Check your internet and try again.';
  var NO_ROOM = 'Could not reach that room. Check the code and make sure the host has the page open.';
  var TOO_MANY = { ok: false, err: 'Too many requests. Wait a minute and try again.' };

  function randId(n) {
    var a = new Uint8Array(n); crypto.getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, n * 2);
  }
  function code6() {
    var a = new Uint8Array(6); crypto.getRandomValues(a);
    return Array.from(a, function (b) { return CHARS[b % CHARS.length]; }).join('');
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function jres(status, obj) {
    return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } });
  }
  var hits = new Map();
  function limited(key, max, win) {
    var now = Date.now(), h = hits.get(key);
    if (!h || now > h.reset) { h = { n: 0, reset: now + win }; hits.set(key, h); }
    h.n++;
    return h.n > max;
  }
  setInterval(function () { var now = Date.now(); hits.forEach(function (h, k) { if (now > h.reset) hits.delete(k); }); }, 60000);

  /* ---------------- host side: the "server" lives in this page ---------------- */
  var HOST = null; // { S, tokens, subs:Set, peer, practice }
  var dirty = false;
  var lock = null;

  function wake() {
    try {
      if ('wakeLock' in navigator && !lock) {
        navigator.wakeLock.request('screen').then(function (l) {
          lock = l; l.addEventListener('release', function () { lock = null; });
        }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && HOST) wake(); });

  function saveHost() {
    if (!HOST || !dirty) return;
    dirty = false;
    try { localStorage.setItem('fc26host', JSON.stringify({ S: HOST.S, tokens: HOST.tokens, t: Date.now() })); } catch (e) { /* ignore */ }
  }
  function broadcast() {
    if (!HOST) return;
    var now = Date.now();
    HOST.S.ts = now;
    var msg = { t: 'state', now: now, S: HOST.S };
    HOST.subs.forEach(function (s) { try { s.send(msg); } catch (e) { HOST.subs.delete(s); } });
    dirty = true;
  }
  function auth(code, id, token) {
    if (!HOST || String(code || '').toUpperCase() !== HOST.S.code) return false;
    var t = HOST.tokens[id];
    return !!t && t === token && !!E.mg(HOST.S, id);
  }
  function pruneTokens() {
    Object.keys(HOST.tokens).forEach(function (id) { if (!E.mg(HOST.S, id)) delete HOST.tokens[id]; });
  }

  function serve(method, path, q, b, who) {
    if (who !== 'local' && limited('all:' + who, 300, 10000)) return { status: 429, json: TOO_MANY };
    if (path === '/api/check') {
      var okc = auth(q.code, q.id, q.token);
      return { status: okc ? 200 : 404, json: { ok: okc } };
    }
    if (path === '/api/join') {
      if (!HOST || String(b.code || '').toUpperCase() !== HOST.S.code) return { status: 404, json: { ok: false, err: 'Room not found' } };
      if (HOST.practice) return { status: 400, json: { ok: false, err: 'That is a practice room' } };
      if (limited('join:' + who, 20, 60000)) return { status: 429, json: TOO_MANY };
      var id = randId(9), token = randId(18);
      var r = E.apply(HOST.S, id, { type: 'join', name: b.name }, Date.now());
      if (!r.ok) return { status: 400, json: r };
      HOST.tokens[id] = token;
      broadcast();
      return { status: 200, json: { ok: true, code: HOST.S.code, id: id, token: token } };
    }
    if (path === '/api/act') {
      if (!auth(b.code, b.id, b.token)) return { status: 403, json: { ok: false, err: 'Session expired' } };
      var a = b.action;
      if (!a || typeof a !== 'object' || typeof a.type !== 'string') return { status: 400, json: { ok: false, err: 'Bad action' } };
      var res = E.apply(HOST.S, b.id, a, Date.now());
      if (res.ok) { pruneTokens(); broadcast(); }
      return { status: 200, json: res };
    }
    return { status: 404, json: { ok: false, err: 'Not found' } };
  }

  function onConn(conn) {
    if (!HOST) { try { conn.close(); } catch (e) { /* ignore */ } return; }
    if (HOST.subs.size > 40) { try { conn.close(); } catch (e) { /* ignore */ } return; }
    var queue = [];
    function put(m) { if (conn.open) conn.send(m); else queue.push(m); }
    conn.on('open', function () { while (queue.length && conn.open) conn.send(queue.shift()); });
    var sub = { send: put };
    conn.on('data', function (d) {
      if (!HOST || !d || typeof d !== 'object') return;
      if (d.t === 'req') {
        var r = serve(String(d.method || 'POST'), String(d.path || ''), d.query || {}, d.body || {}, 'peer:' + conn.peer);
        put({ t: 'res', n: d.n, status: r.status, json: r.json });
      } else if (d.t === 'sub') {
        if (auth(d.code, d.id, d.token)) {
          HOST.subs.add(sub);
          put({ t: 'state', now: Date.now(), S: HOST.S });
        } else {
          put({ t: 'sub-denied' });
        }
      }
    });
    function gone() { if (HOST) HOST.subs.delete(sub); }
    conn.on('close', gone);
    conn.on('error', gone);
  }

  function openPeer(code) {
    return new Promise(function (resolve, reject) {
      if (typeof Peer === 'undefined') { reject({ type: 'nolib' }); return; }
      var peer = new Peer(PREFIX + code, { debug: 0 });
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; try { peer.destroy(); } catch (e) { /* ignore */ } reject({ type: 'timeout' }); }
      }, 15000);
      peer.on('open', function () { if (!done) { done = true; clearTimeout(timer); resolve(peer); } });
      peer.on('error', function (e) { if (!done) { done = true; clearTimeout(timer); reject(e || { type: 'error' }); } });
      peer.on('connection', onConn);
      peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    });
  }

  function closeHost() {
    if (HOST && HOST.peer) { try { HOST.peer.destroy(); } catch (e) { /* ignore */ } }
    HOST = null;
    try { localStorage.removeItem('fc26host'); } catch (e) { /* ignore */ }
    updateNote();
  }

  async function createRoom(b) {
    var name = String(b.name || '').trim().slice(0, 16);
    if (!name) return { status: 400, json: { ok: false, err: 'Enter a name' } };
    var practice = !!b.practice;
    closeHost();
    var code = null, peer = null;
    if (practice) {
      code = code6();
    } else {
      for (var i = 0; i < 6 && !peer; i++) {
        code = code6();
        try { peer = await openPeer(code); }
        catch (e) {
          if (e && e.type === 'unavailable-id') continue;
          return { status: 503, json: { ok: false, err: NET_ERR } };
        }
      }
      if (!peer) return { status: 503, json: { ok: false, err: 'Could not reserve a room code. Try again.' } };
    }
    var id = randId(9), token = randId(18);
    var S = E.newState(code, id, name, practice);
    if (practice) for (var k = 0; k < 3; k++) E.apply(S, id, { type: 'addbot' }, Date.now());
    var tokens = Object.create(null); tokens[id] = token;
    HOST = { S: S, tokens: tokens, subs: new Set(), peer: peer, practice: practice };
    dirty = true; saveHost(); wake(); updateNote();
    return { status: 200, json: { ok: true, code: code, id: id, token: token } };
  }

  async function reopenPeer(code) {
    for (var i = 0; i < 40 && HOST && HOST.S.code === code && !HOST.peer; i++) {
      try { HOST.peer = await openPeer(code); return; }
      catch (e) { await sleep(1500); } // the old tab may still hold the id for a few seconds
    }
  }
  function loadSavedHost() {
    try {
      var raw = localStorage.getItem('fc26host');
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !d.S || Date.now() - d.t > 24 * 3600 * 1000) { localStorage.removeItem('fc26host'); return; }
      HOST = { S: d.S, tokens: Object.assign(Object.create(null), d.tokens || {}), subs: new Set(), peer: null, practice: !!d.S.practice };
      if (!HOST.practice) reopenPeer(HOST.S.code);
      wake();
    } catch (e) { /* ignore */ }
  }

  setInterval(function () {
    if (!HOST) return;
    var S = HOST.S, now = Date.now(), ch = false;
    if (S.phase === 'auction') {
      if (E.tick(S, now)) ch = true;
      if (E.botStep(S, now)) ch = true;
    }
    if (ch) broadcast();
  }, 250);
  setInterval(saveHost, 2000);
  setInterval(function () { if (HOST && HOST.subs.size > 1) broadcast(); }, 8000); // safety net: refresh everyone's screen
  window.addEventListener('pagehide', function () { dirty = true; saveHost(); });

  /* ---------------- friend side: talk to the host over WebRTC ---------------- */
  var REMOTE = { code: null, peer: null, conn: null, pending: new Map(), n: 0, es: null, connecting: null };

  function cleanupRemote() {
    if (REMOTE.conn) { try { REMOTE.conn.close(); } catch (e) { /* ignore */ } }
    if (REMOTE.peer) { try { REMOTE.peer.destroy(); } catch (e) { /* ignore */ } }
    REMOTE.conn = null; REMOTE.peer = null; REMOTE.connecting = null;
  }
  function failPending() {
    REMOTE.pending.forEach(function (p) { p.reject({ type: 'closed' }); });
    REMOTE.pending.clear();
  }
  function remoteConnect(code) {
    if (REMOTE.conn && REMOTE.conn.open && REMOTE.code === code) return Promise.resolve(REMOTE.conn);
    if (REMOTE.connecting && REMOTE.code === code) return REMOTE.connecting;
    cleanupRemote();
    REMOTE.code = code;
    var p = (async function () {
      if (typeof Peer === 'undefined') throw { type: 'nolib' };
      var peer = await new Promise(function (res, rej) {
        var pr = new Peer({ debug: 0 }), d = false;
        var t = setTimeout(function () { if (!d) { d = true; rej({ type: 'timeout' }); } }, 8000);
        pr.on('open', function () { if (!d) { d = true; clearTimeout(t); res(pr); } });
        pr.on('error', function (e) { if (!d) { d = true; clearTimeout(t); rej(e || { type: 'error' }); } });
      });
      REMOTE.peer = peer;
      var conn = await new Promise(function (res, rej) {
        var c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }), d = false;
        var t = setTimeout(function () { if (!d) { d = true; rej({ type: 'timeout' }); } }, 8000);
        c.on('open', function () { if (!d) { d = true; clearTimeout(t); res(c); } });
        c.on('error', function (e) { if (!d) { d = true; clearTimeout(t); rej(e || { type: 'error' }); } });
        peer.on('error', function (e) { if (!d) { d = true; clearTimeout(t); rej(e || { type: 'error' }); } });
      });
      conn.on('data', function (m) {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'res') {
          var p2 = REMOTE.pending.get(m.n);
          if (p2) { REMOTE.pending.delete(m.n); p2.resolve({ status: m.status, json: m.json }); }
        } else if (m.t === 'state') {
          if (REMOTE.es) REMOTE.es._deliver(m);
        }
      });
      conn.on('close', function () {
        if (REMOTE.conn === conn) REMOTE.conn = null;
        failPending();
        if (REMOTE.es) REMOTE.es._fail();
      });
      REMOTE.conn = conn;
      return conn;
    })();
    REMOTE.connecting = p;
    p.then(function () { REMOTE.connecting = null; }, function () { REMOTE.connecting = null; cleanupRemote(); });
    return p;
  }
  function remoteReq(code, method, path, query, body) {
    return remoteConnect(code).then(function (conn) {
      return new Promise(function (resolve, reject) {
        var n = ++REMOTE.n;
        REMOTE.pending.set(n, { resolve: resolve, reject: reject });
        conn.send({ t: 'req', n: n, method: method, path: path, query: query, body: body });
        setTimeout(function () { if (REMOTE.pending.delete(n)) reject({ type: 'timeout' }); }, 10000);
      });
    });
  }

  /* ---------------- replace fetch and EventSource ---------------- */
  async function route(method, path, q, b) {
    try {
      if (path === '/api/create') { var cr = await createRoom(b); return jres(cr.status, cr.json); }
      var code = String((path === '/api/check' ? q.code : b.code) || '').toUpperCase();
      if (HOST && HOST.S.code === code) { var lr = serve(method, path, q, b, 'local'); return jres(lr.status, lr.json); }
      var rr = await remoteReq(code, method, path, q, b);
      return jres(rr.status, rr.json);
    } catch (e) {
      if (path === '/api/check') return jres(503, { ok: false });
      return jres(503, { ok: false, err: NO_ROOM });
    }
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') !== 0) return RealFetch ? RealFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
    var u = new URL(url, 'http://x');
    var method = String((init && init.method) || 'GET').toUpperCase();
    var body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { /* ignore */ }
    var q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
    return route(method, u.pathname, q, body);
  };

  function FakeES(url) {
    var self = this;
    var u = new URL(url, 'http://x'), q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    this.readyState = 0; this.onmessage = null; this.onerror = null; this.onopen = null;
    this._q = q;
    var code = String(q.code || '').toUpperCase();
    if (HOST && HOST.S.code === code) {
      if (!auth(code, q.id, q.token)) { setTimeout(function () { self._fail(); }, 0); return; }
      this._sub = { send: function (m) { self._deliver(m); } };
      HOST.subs.add(this._sub);
      this.readyState = 1;
      setTimeout(function () { self._deliver({ t: 'state', now: Date.now(), S: HOST ? HOST.S : null }); }, 0);
    } else {
      remoteConnect(code).then(function (conn) {
        if (self.readyState === 2) return;
        REMOTE.es = self;
        self.readyState = 1;
        conn.send({ t: 'sub', code: code, id: q.id, token: q.token });
      }).catch(function () { self._fail(); });
    }
  }
  FakeES.prototype._deliver = function (m) {
    if (this.readyState === 2 || !m || !m.S || !this.onmessage) return;
    this.onmessage({ data: JSON.stringify({ now: m.now, S: m.S }) });
  };
  FakeES.prototype._fail = function () {
    if (this.readyState === 2) return;
    this.readyState = 2;
    if (this.onerror) this.onerror({});
  };
  FakeES.prototype.close = function () {
    this.readyState = 2;
    if (this._sub && HOST) HOST.subs.delete(this._sub);
    if (REMOTE.es === this) REMOTE.es = null;
  };
  window.EventSource = FakeES;

  /* ---------------- small notice for the host ---------------- */
  function updateNote() {
    function go() {
      var el = document.getElementById('fc26-host-note');
      var show = !!HOST && !HOST.practice;
      if (!show) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'fc26-host-note';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:60;background:#0F4C3A;color:#F4F7F4;border:2px solid #FFD23F;border-radius:10px;padding:6px 10px;font:600 12px system-ui,sans-serif;max-width:70vw';
        el.textContent = 'You are the host: keep this page open and your screen on.';
        document.body.appendChild(el);
      }
    }
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  loadSavedHost();
  updateNote();
})();
     
