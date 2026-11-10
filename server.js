'use strict';
/*
  FC26 Auction server. No dependencies, just Node 18+.
  - The server owns all game state and enforces every rule (engine.js).
  - Browsers send actions with POST /api/act and receive live state over Server-Sent Events.
  - Rooms are kept in memory and saved to DATA_DIR/rooms.json so a restart does not wipe them.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./engine.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'rooms.json');
const PUB = __dirname;
const MAX_ROOMS = 300;
const ROOM_TTL = 24 * 3600 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;

const rooms = new Map(); // code -> { S, tokens, clients:Set, last }
let dirty = false;

const code6 = () => { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; return s; };
const rid = n => crypto.randomBytes(n).toString('base64url');

/* ---------- persistence ---------- */
function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const r of j.rooms || []) {
      const tokens = Object.assign(Object.create(null), r.tokens || {});
      rooms.set(r.S.code, { S: r.S, tokens, clients: new Set(), last: r.last || Date.now() });
    }
    console.log('Loaded ' + rooms.size + ' room(s)');
  } catch (e) { /* first run */ }
}
function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const out = { rooms: [...rooms.values()].map(r => ({ S: r.S, tokens: r.tokens, last: r.last })) };
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('Save failed:', e.message); }
}

/* ---------- helpers ---------- */
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0; const ch = [];
    req.on('data', d => { n += d.length; if (n > 20000) { no(new Error('too big')); req.destroy(); return; } ch.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch (e) { no(e); } });
    req.on('error', no);
  });
}
function auth(code, id, token) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room || typeof id !== 'string' || !ID_RE.test(id) || typeof token !== 'string') return null;
  const t = room.tokens[id];
  if (!t) return null;
  const a = Buffer.from(t), b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!E.mg(room.S, id)) return null;
  return room;
}
function broadcast(room) {
  const now = Date.now();
  room.S.ts = now;
  const msg = 'data: ' + JSON.stringify({ now, S: room.S }) + '\n\n';
  for (const c of room.clients) { try { c.res.write(msg); } catch (e) { /* closed */ } }
  dirty = true;
}
function pruneTokens(room) {
  for (const id of Object.keys(room.tokens)) if (!E.mg(room.S, id)) delete room.tokens[id];
}


/* ---------- rate limiting (best effort, per IP) ---------- */
const hits = new Map(); // key -> { n, reset }
function limited(key, max, windowMs) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || now > h.reset) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
  h.n++;
  return h.n > max;
}
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const TOO_MANY = { ok: false, err: 'Too many requests. Wait a minute and try again.' };

/* ---------- routes ---------- */
async function api(req, res, u) {
  if (req.method === 'GET' && u.pathname === '/api/events') {
    const room = auth(u.searchParams.get('code'), u.searchParams.get('id'), u.searchParams.get('token'));
    if (!room) return send(res, 404, { ok: false });
    if (limited('sse:' + ipOf(req), 60, 60000)) return send(res, 429, TOO_MANY);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    const c = { res, id: u.searchParams.get('id') };
    room.clients.add(c);
    room.last = Date.now();
    res.write('data: ' + JSON.stringify({ now: Date.now(), S: room.S }) + '\n\n');
    req.on('close', () => room.clients.delete(c));
    return;
  }
  if (req.method === 'GET' && u.pathname === '/api/check') {
    const room = auth(u.searchParams.get('code'), u.searchParams.get('id'), u.searchParams.get('token'));
    return send(res, room ? 200 : 404, { ok: !!room });
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, err: 'Method not allowed' });

  let b;
  try { b = await readBody(req); } catch (e) { return send(res, 400, { ok: false, err: 'Bad request' }); }
  if (!b || typeof b !== 'object') return send(res, 400, { ok: false, err: 'Bad request' });

  const ip = ipOf(req);
  if (limited('all:' + ip, 300, 10000)) return send(res, 429, TOO_MANY);

  if (u.pathname === '/api/create') {
    if (limited('create:' + ip, 8, 600000)) return send(res, 429, TOO_MANY);
    if (rooms.size >= MAX_ROOMS) return send(res, 503, { ok: false, err: 'Server is full, try again later' });
    const name = String(b.name || '').trim().slice(0, 16);
    if (!name) return send(res, 400, { ok: false, err: 'Enter a name' });
    let code; do { code = code6(); } while (rooms.has(code));
    const id = rid(9), token = rid(18);
    const S = E.newState(code, id, name, !!b.practice);
    if (b.practice) for (let i = 0; i < 3; i++) E.apply(S, id, { type: 'addbot' }, Date.now());
    const tokens = Object.create(null); tokens[id] = token;
    rooms.set(code, { S, tokens, clients: new Set(), last: Date.now() });
    dirty = true;
    return send(res, 200, { ok: true, code, id, token });
  }

  if (u.pathname === '/api/join') {
    if (limited('join:' + ip, 20, 60000)) return send(res, 429, TOO_MANY);
    const code = String(b.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(res, 404, { ok: false, err: 'Room not found' });
    if (room.S.practice) return send(res, 400, { ok: false, err: 'That is a practice room' });
    const id = rid(9), token = rid(18);
    const r = E.apply(room.S, id, { type: 'join', name: b.name }, Date.now());
    if (!r.ok) return send(res, 400, r);
    room.tokens[id] = token; room.last = Date.now();
    broadcast(room);
    return send(res, 200, { ok: true, code, id, token });
  }

  if (u.pathname === '/api/act') {
    const room = auth(b.code, b.id, b.token);
    if (!room) return send(res, 403, { ok: false, err: 'Session expired' });
    const a = b.action;
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') return send(res, 400, { ok: false, err: 'Bad action' });
    const r = E.apply(room.S, b.id, a, Date.now());
    if (r.ok) { pruneTokens(room); room.last = Date.now(); broadcast(room); }
    return send(res, 200, r);
  }

  return send(res, 404, { ok: false, err: 'Not found' });
}

const STATIC = {
  '/': [path.join(PUB, 'index.html'), 'text/html; charset=utf-8'],
  '/index.html': [path.join(PUB, 'index.html'), 'text/html; charset=utf-8'],
  '/engine.js': [path.join(__dirname, 'engine.js'), 'application/javascript; charset=utf-8']
};

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  if (u.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (u.pathname.startsWith('/api/')) {
    api(req, res, u).catch(e => { console.error(e); try { send(res, 500, { ok: false, err: 'Server error' }); } catch (x) { /* ignore */ } });
    return;
  }
  const s = STATIC[u.pathname];
  if (!s) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  fs.readFile(s[0], (err, buf) => {
    if (err) { res.writeHead(500); return res.end('Server error'); }
    res.writeHead(200, { 'Content-Type': s[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
});

/* ---------- loops ---------- */
setInterval(() => { // timers and bots
  const now = Date.now();
  for (const room of rooms.values()) {
    const S = room.S;
    if (S.phase !== 'auction') continue;
    let ch = false;
    if (E.tick(S, now)) ch = true;
    if (E.botStep(S, now)) ch = true;
    if (ch) broadcast(room);
  }
}, 250);
setInterval(() => { for (const room of rooms.values()) for (const c of room.clients) { try { c.res.write(': ping\n\n'); } catch (e) { /* closed */ } } }, 15000);
setInterval(save, 5000);
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now > h.reset) hits.delete(k); }, 60000);
setInterval(() => { // expire old rooms
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.last > ROOM_TTL && room.clients.size === 0) { rooms.delete(code); dirty = true; }
  }
}, 600000);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { dirty = true; save(); process.exit(0); });

load();
server.listen(PORT, () => console.log('FC26 Auction running on port ' + PORT));
