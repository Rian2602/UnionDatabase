/* SPMKB dev server - static files + POST /api/data untuk integrasi data.json
   Jalankan: node server.js  (bind 127.0.0.1; PORT env untuk ubah port)

   KEPUTUSAN DESAIN: server ini SELALU hanya di 127.0.0.1 (localhost).
   POST /api/data butuh bearer token (isAuthorized, default SPMKB_AUTH_PASSWORD)
   + rate limit 30/menit/IP + Host/Origin loopback-only. JANGAN ubah HOST ke LAN
   tanpa mempertahankan otentikasi (data roster & upah sensitif). */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1', PORT = process.env.PORT || 9000;
const ROOT = __dirname;
// ponytail: DATA_FILE bisa ditimpa env - dipakai test.js agar POST-uji tak menyentuh data.json asli
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data.json');
const AUTH_PASSWORD = process.env.SPMKB_AUTH_PASSWORD || 'spmkb123';
const KEYS = ['members', 'dues', 'events', 'attendance', 'letters', 'complaints', 'deletedNiks', 'sanksi', 'bukuKas'];
const BODY_LIMIT = 5 * 1024 * 1024;
const ARRAY_LIMIT = 5000; // DoS guard: max elements per collection write
const RATE_LIMIT = 30; // Max POST requests per minute per IP
const rateLimitMap = new Map(); // IP -> { count, resetTime }
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.jpeg': 'image/jpeg' };
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

function isAuthorized(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(AUTH_PASSWORD);
  const supplied = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function writeData(data) {
  // ponytail: rotasi .bak sebelum tulis atomik - rollback sekali klik kalau tulisan rusak
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return {}; }
}

// ponytail: antrean write memastikan read-modify-write urut - dua POST
// nyaris-bersamaan (dua tab/officer) tak bisa saling menimpa update.
let writeQueue = Promise.resolve();
function queuedUpdate(key, value) {
  writeQueue = writeQueue.then(() => {
    const data = readData();
    data[key] = value;
    writeData(data);
  });
  return writeQueue;
}

// safeDecode: GET /% (decodeURIComponent malformed) throw URIError -> tanpa guard = uncaught exception & proses crash (DoS)
function safeDecode(urlEncoded) {
  try { return decodeURIComponent(urlEncoded); }
  catch (e) { return null; }
}

// respondError: semua respons non-200 wajib membawa SEC_HEADERS (sebelumnya hanya jalur 200 yg punya)
function respondError(res, status, body) {
  const headers = Object.assign({}, SEC_HEADERS);
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer';
  res.writeHead(status, headers);
  res.end(body);
}

// isRateLimited: fixed-window counter per bucket (ip:get / ip:post). GET & POST punya kuota
// sendiri, jadi brute-force login (GET data.json) tak bisa menghabiskan kuota autosave (POST /api/data).
function isRateLimited(clientIP, bucket) {
  const now = Date.now();
  const id = clientIP + ':' + bucket;
  const rl = rateLimitMap.get(id);
  if (rl && now < rl.resetTime) {
    if (rl.count >= RATE_LIMIT) return true;
    rl.count++;
  } else {
    rateLimitMap.set(id, { count: 1, resetTime: now + 60000 });
  }
  return false;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/data') {
    // Rate limit: max RATE_LIMIT req/menit per IP per bucket (loopback only, defense-in-depth)
    const clientIP = req.socket.remoteAddress || '127.0.0.1';
    if (isRateLimited(clientIP, 'post')) return respondError(res, 429, '{"ok":false,"reason":"rate limit"}');
    // S4 (penegakan): loopback-only + rate limit + auth (isAuthorized di bawah).
    // V-03a: DNS-rebinding guard - cek Host header SUNGGUHAN (bukan konstanta HOST yg selalu false).
    const hostHdr = (req.headers.host || '').split(':')[0];
    // V-HOST: tolak Host kosong/missing DAN bukan loopback — empty Host bypass lama cek DNS-rebinding
    if (!hostHdr || (hostHdr !== '127.0.0.1' && hostHdr !== 'localhost')) return respondError(res, 403, '{"ok":false,"reason":"host must be 127.0.0.1"}');
    // V-03b: CSRF guard - hanya terima same-origin loopback (Origin/Referer) + Content-Type json.
    // Tanpa ini, fetch cross-origin Content-Type text/plain (no-preflight) bisa corrupt data.json.
    const ct = req.headers['content-type'] || '';
    // V-CT: startsWith — includes() bypassable dgn Content-Type: text/html, application/json
    if (!ct.toLowerCase().startsWith('application/json')) return respondError(res, 415, '{"ok":false,"reason":"json only"}');
    const origin = req.headers.origin || req.headers.referer || '';
    const loopback = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(origin);
    if (!loopback) return respondError(res, 403, '{"ok":false,"reason":"cross-origin"}');
    if (!isAuthorized(req)) return respondError(res, 401, '{"ok":false,"reason":"unauthorized"}');
    const chunks = [];
    let overflow = false;
    req.on('data', c => {
      // jangan req.destroy() saat overflow — socket mati = event 'end' tak akan terpanggil & 413 tak pernah terkirim
      if (overflow) return;
      chunks.push(c);
      let len = 0; for (const ch of chunks) len += ch.length;
      if (len > BODY_LIMIT) { overflow = true; req.resume(); }
    });
    req.on('end', () => {
      if (overflow) return respondError(res, 413, '{"ok":false}');
      const body = chunks.join('');
      let payload;
      try { payload = JSON.parse(body); } catch (e) { return respondError(res, 400, '{"ok":false}'); }
      const key = (payload.key || '').trim(), value = payload.value;
      if (!key || !KEYS.includes(key)) return respondError(res, 400, '{"ok":false}');
      // ponytail: trust boundary - kontrak app selalu array untuk semua key; tolak value non-array agar tak korup data.json
      if (!Array.isArray(value)) return respondError(res, 400, '{"ok":false}');
      // DoS guard: reject oversized arrays
      if (value.length > ARRAY_LIMIT) return respondError(res, 413, '{"ok":false,"reason":"array too large"}');
      // ponytail: elemen wajib object (bukan primitif/null) - primitif bisa bikin render/search crash (mis. m.nama.toLowerCase()). Verify per-field di-skip (YAGNI).
      if (value.some(v => v === null || typeof v !== 'object')) return respondError(res, 400, '{"ok":false}');
      // F-1/F-2: money fields wajib finite & >= 0 - Infinity/NaN/negatif yg konsisten bisa bikin rekonsiliasi
      // iuran<>bukuKas hijau palsu (Infinity===Infinity, -500===-500) & meracuni pesangon/iuranBulanan.
      const MONEY = { members: ['gaji_pokok_2025', 'iuranBulanan', 'total_kenaikan', 'gaji_pokok_2026'], dues: ['jumlah'], bukuKas: ['debit', 'kredit'] };
      if (MONEY[key]) {
        for (const o of value) for (const f of MONEY[key]) {
          if (o[f] === undefined || o[f] === null) continue;
          const n = Number(o[f]);
          if (!Number.isFinite(n) || n < 0) return respondError(res, 400, '{"ok":false,"reason":"bad money"}');
        }
      }
      // V-KATEGORI: bukuKas kategori whitelist
      if (key === 'bukuKas') {
        const VALID_KATEGORI = ['Iuran','Sumbangan','Donasi','Operasional','Kegiatan','Lain-lain'];
        for (const o of value) {
          if (o.kategori && !VALID_KATEGORI.includes(o.kategori)) {
            return respondError(res, 400, '{"ok":false,"reason":"invalid kategori"}');
          }
        }
      }
      queuedUpdate(key, value).then(() => {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, SEC_HEADERS));
        res.end('{"ok":true}');
      }).catch(e => {
        console.error(e);
        respondError(res, 500, '{"ok":false}');
      });
    });
    return;
  }

  // safeDecode: decodeURIComponent malformed (GET /%) throw URIError -> 400, bukan crash proses (SRV-DECODE-SAFE)
  const urlPath = safeDecode(req.url.split('?')[0]);
  if (urlPath === null) return respondError(res, 400, 'Bad request');
  // V-GRL: GET rate limit untuk /data.json — defense-in-depth (brute-force auth), bucket terpisah dari POST
  const clientIP = req.socket.remoteAddress || '127.0.0.1';
  if (urlPath === '/data.json') {
    if (isRateLimited(clientIP, 'get')) return respondError(res, 429, '{"ok":false,"reason":"rate limit"}');
    if (!isAuthorized(req)) {
      // V-AUTH-LOG: log percobaan auth gagal
      console.warn(`SPMKB: unauthorized GET /data.json from ${clientIP}`);
      return respondError(res, 401, 'Unauthorized');
    }
  }
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  // ponytail: containment via path.relative - startsWith(ROOT) bisa lolos ke sibling ber-prefix nama
  const rel = path.relative(ROOT, file);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return respondError(res, 403, '');
  // V-01: deny file sensitif/generated yg MUNGKIN ada DI DALAM ROOT. Containment di atas cegah
  // "keluar ROOT", tapi TIDAK cegah baca file sensitif di dalam ROOT (data.json.bak = snapshot PII).
  if (/data\.json\.(bak|tmp)$/.test(file) || /(^|[\\/])\.git([\\/]|$)/.test(file) || /\.env(\.|$)/.test(file)) return respondError(res, 403, '');
  fs.realpath(file, (realpathErr, realFile) => {
    if (realpathErr) return respondError(res, 404, 'Not found');
    const realRel = path.relative(ROOT, realFile);
    if (realRel.startsWith('..') || path.isAbsolute(realRel)) return respondError(res, 403, '');
    fs.readFile(realFile, (err, buf) => {
    if (err) return respondError(res, 404, 'Not found');
    const ext = path.extname(realFile);
    const headers = Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream'
    }, SEC_HEADERS);
    // V-CSP: Content-Security-Policy — partial protection (unsafe-inline required for onclick handlers)
    // Blocks: eval, new Function, string setTimeout, external script injection, javascript: URLs
    if (ext === '.html') headers['Content-Security-Policy'] = "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; img-src 'self' https: data:; default-src 'self'";
    // Cache static assets briefly; never cache data.json (roster/PII must stay fresh)
    if (ext === '.json') headers['Cache-Control'] = 'no-store';
    else if (ext === '.js' || ext === '.css') headers['Cache-Control'] = 'public, max-age=300';
    else headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(buf);
    });
  });
});

server.listen(PORT, HOST, () => console.log(`SPMKB server: http://localhost:${PORT}`));
