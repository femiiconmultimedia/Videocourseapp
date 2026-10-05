/**
 * Class Registration + Video Course Platform
 * -------------------------------------------
 * Run:   node server.js
 * Open:  http://localhost:3000
 *
 * No npm install required — uses only Node.js built-in modules.
 * Data is stored in data.json (created automatically on first run).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 7;
const COMPLETE_THRESHOLD = 90; // % of video that must be watched to count as complete

/* ============================================================
 * 1. COURSE CONTENT — 2 courses, 6 videos each.
 *    Swap the URLs below for your real videos (Vimeo, Mux,
 *    Cloudflare Stream, or your own MP4 files).
 * ============================================================ */
const SAMPLE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const COURSES = [
  {
    id: 'course-1',
    title: 'Course 1: Getting Started',
    videos: [
      { id: 'c1v1', title: 'Lesson 1 – Welcome & Overview',   url: SAMPLE + 'ForBiggerBlazes.mp4' },
      { id: 'c1v2', title: 'Lesson 2 – Setting Up',           url: SAMPLE + 'ForBiggerEscapes.mp4' },
      { id: 'c1v3', title: 'Lesson 3 – First Steps',          url: SAMPLE + 'ForBiggerFun.mp4' },
      { id: 'c1v4', title: 'Lesson 4 – Core Concepts',        url: SAMPLE + 'ForBiggerJoyrides.mp4' },
      { id: 'c1v5', title: 'Lesson 5 – Common Mistakes',      url: SAMPLE + 'ForBiggerMeltdowns.mp4' },
      { id: 'c1v6', title: 'Lesson 6 – Wrap Up & Next Steps', url: SAMPLE + 'BigBuckBunny.mp4' },
    ],
  },
  {
    id: 'course-2',
    title: 'Course 2: Level Up',
    videos: [
      { id: 'c2v1', title: 'Lesson 1 – Review & Goals',       url: SAMPLE + 'ElephantsDream.mp4' },
      { id: 'c2v2', title: 'Lesson 2 – Deeper Dive',          url: SAMPLE + 'Sintel.mp4' },
      { id: 'c2v3', title: 'Lesson 3 – Advanced Techniques',  url: SAMPLE + 'TearsOfSteel.mp4' },
      { id: 'c2v4', title: 'Lesson 4 – Real World Projects',  url: SAMPLE + 'ForBiggerBlazes.mp4' },
      { id: 'c2v5', title: 'Lesson 5 – Troubleshooting',      url: SAMPLE + 'ForBiggerEscapes.mp4' },
      { id: 'c2v6', title: 'Lesson 6 – Final Project',        url: SAMPLE + 'ForBiggerFun.mp4' },
    ],
  },
];
const ALL_VIDEO_IDS = new Set(COURSES.flatMap(c => c.videos.map(v => v.id)));

/* ============================================================
 * 2. TINY JSON-FILE DATABASE
 * ============================================================ */
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: [], sessions: [], progress: [] }; }
}
let db = loadDB();
let saveTimer = null;
function saveDB() {                       // debounced write so bursts don't hammer the disk
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)), 50);
}

/* ============================================================
 * 3. AUTH HELPERS (scrypt password hashing + cookie sessions)
 * ============================================================ */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function getCookie(req, name) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split('; ').filter(Boolean).map(c => c.split('='))
  );
  return cookies[name];
}
function getSession(req) {
  const token = getCookie(req, 'sid');
  if (!token) return null;
  return db.sessions.find(s => s.token === token && s.expires > Date.now()) || null;
}
function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ token, userId, expires: Date.now() + SESSION_DAYS * 864e5 });
  saveDB();
  return token;
}
function progressMap(userId) {
  const map = {};
  for (const p of db.progress.filter(p => p.userId === userId))
    map[p.videoId] = { percent: p.percent, completed: p.completed };
  return map;
}

/* ============================================================
 * 4. HTTP HELPERS
 * ============================================================ */
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy();      // 1 MB cap
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ============================================================
 * 5. API ROUTES
 * ============================================================ */
async function handleApi(req, res, url) {

  /* ---------- PUBLIC: register ---------- */
  if (url.pathname === '/api/register' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    if (!validEmail(email || '')) return sendJson(res, 400, { error: 'A valid email is required.' });
    if (!password || password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
    const lower = email.toLowerCase();
    if (db.users.some(u => u.email === lower)) return sendJson(res, 409, { error: 'That email is already registered.' });
    const { salt, hash } = hashPassword(password);
    const user = { id: crypto.randomUUID(), email: lower, salt, hash, createdAt: new Date().toISOString() };
    db.users.push(user);
    saveDB();
    setSessionCookie(res, createSession(user.id), SESSION_DAYS * 86400);
    return sendJson(res, 201, { ok: true });
  }

  /* ---------- PUBLIC: login ---------- */
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const user = db.users.find(u => u.email === (email || '').toLowerCase());
    if (!user) return sendJson(res, 401, { error: 'Invalid email or password.' });
    const { hash } = hashPassword(password || '', user.salt);
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(user.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    setSessionCookie(res, createSession(user.id), SESSION_DAYS * 86400);
    return sendJson(res, 200, { ok: true });
  }

  /* ---------- EVERYTHING BELOW REQUIRES LOGIN ---------- */
  const session = getSession(req);
  const user = session ? db.users.find(u => u.id === session.userId) : null;
  if (!user) return sendJson(res, 401, { error: 'Not logged in.' });

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    db.sessions = db.sessions.filter(s => s.token !== session.token);
    saveDB();
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    return sendJson(res, 200, { email: user.email, progress: progressMap(user.id) });
  }

  if (url.pathname === '/api/courses' && req.method === 'GET') {
    return sendJson(res, 200, { courses: COURSES });
  }

  /* Save watching progress; mark complete at >= COMPLETE_THRESHOLD % */
  if (url.pathname === '/api/progress' && req.method === 'POST') {
    const { videoId, percent } = await readBody(req);
    if (!ALL_VIDEO_IDS.has(videoId)) return sendJson(res, 400, { error: 'Unknown video.' });
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    let p = db.progress.find(p => p.userId === user.id && p.videoId === videoId);
    if (!p) { p = { userId: user.id, videoId }; db.progress.push(p); }
    p.percent = Math.max(p.percent || 0, pct);                 // never let progress go backwards
    p.completed = p.completed || p.percent >= COMPLETE_THRESHOLD;
    p.updatedAt = new Date().toISOString();
    saveDB();
    return sendJson(res, 200, { ok: true, completed: p.completed, progress: progressMap(user.id) });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

/* ============================================================
 * 6. STATIC FILE SERVER + APP START
 * ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => console.log(`✔ Server running → http://localhost:${PORT}`));
