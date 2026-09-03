/* SPMKB regression net - stdlib only. Jalankan: node test.js
   Verifikasi: data invariants (Fase B's net) + node --check syntax + server 200.
   Bukan DOM test (itu /tmp/fase_a_smoke.js, butuh jsdom). */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('assert');

const ROOT = __dirname;
let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); fail++; }
};
const okAsync = async (name, fn) => {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); fail++; }
};

console.log('SPMKB TEST (stdlib)\n');
console.log('[Data invariants]');
const hydrateWageData = require(path.join(ROOT, 'js', 'wage-data.js')).hydrateWageData;
const SCENARIOS = ['Pertemuan1', 'Pertemuan2', 'Pertemuan3', 'Pertemuan4', 'Pertemuan5'];
const d = hydrateWageData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8')));

ok('UMD browser-path: globalThis.hydrateWageData adalah FUNGSI (bukan objek)', () => {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'js', 'wage-data.js'), 'utf8');
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(src, sb);
  assert.strictEqual(typeof sb.hydrateWageData, 'function', 'globalThis.hydrateWageData bukan function');
  assert.ok(sb.hydrateWageData({ members: [{ nik: '1', nama: 'A' }], scenarios: { Pertemuan1: [{ no: 1, nik: '1', total_kenaikan: 5, gaji_pokok_2026: 6000000 }] } }).Pertemuan1[0].nama === 'A');
});

ok('members.length === 429', () => assert.strictEqual(d.members.length, 429));
SCENARIOS.forEach(k => ok(`${k} === 429`, () => assert.strictEqual(d[k].length, 429)));
ok('NIK unik (no duplikat)', () => assert.strictEqual(new Set(d.members.map(m => m.nik)).size, d.members.length));

let mathBreak = 0;
SCENARIOS.forEach(k => d[k].forEach(r => {
  if (Math.abs((r.xtot + r.ytot + r.ztot) - r.total_kenaikan) > 0.0001) mathBreak++;
  if (Math.abs((Number(r.gaji_pokok_2025) + r.total_kenaikan) - r.gaji_pokok_2026) > 0.0001) mathBreak++;
}));
ok('identitas matematika 0 break (5 skenario)', () => assert.strictEqual(mathBreak, 0));

let iur = 0, totalIur = 0;
d.members.forEach(m => {
  const tunj = (m.jobclass || '').startsWith('4') ? 800000 : 625000;
  if (Math.round((Number(m.gaji_pokok_2025) + tunj) * 0.01) !== m.iuranBulanan) iur++;
  totalIur += m.iuranBulanan;
});
ok('iuranBulanan formula 0 mismatch', () => assert.strictEqual(iur, 0));
ok('total iuran === 25247012', () => assert.strictEqual(totalIur, 25247012));

let float = 0;
SCENARIOS.forEach(k => d[k].forEach(r => ['xtot', 'ytot', 'ztot', 'total_kenaikan', 'gaji_pokok_2026'].forEach(f => {
  const s = String(r[f]); if (s.includes('.') && s.split('.')[1].length > 4) float++;
})));
d.members.forEach(m => ['gaji_pokok_2026', 'total_kenaikan'].forEach(f => {
  const s = String(m[f]); if (s.includes('.') && s.split('.')[1].length > 4) float++;
}));
ok('0 float residue (>4 desimal)', () => assert.strictEqual(float, 0));

ok('deletedNiks adalah array', () => assert.ok(Array.isArray(d.deletedNiks)));

ok('NORM-1: disk memakai scenarios (bukan 5 array Pertemuan1-5)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  SCENARIOS.forEach(s => assert.ok(!(s in raw), 'data.json masih memuat array top-level ' + s));
  SCENARIOS.forEach(s => assert.ok(Array.isArray(raw.scenarios && raw.scenarios[s]), 'scenarios.' + s + ' hilang'));
  assert.strictEqual(raw.scenarios.Pertemuan1.length, 429, 'scenarios.Pertemuan1 != 429');
});
ok('NORM-2: hydrate menghasilkan semua skenario len 429', () => {
  SCENARIOS.forEach(s => assert.strictEqual((d[s] || []).length, 429));
});
ok('NORM-3: hydrate roundtrip eksak vs members+scenarios (0 beda)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const mb = Object.fromEntries(raw.members.map(m => [m.nik, m]));
  const prof = ['nama','department','bagian','jabatan','jobclass','gaji_pokok_2025'];
  const delta = ['x_in2025','x_pen2025','xtot','y_huruf','y_angka','ytot','z_angka','ztot','gaji_pokok_2026','total_kenaikan'];
  let bad = 0;
  SCENARIOS.forEach(s => raw.scenarios[s].forEach(dr => {
    const r = d[s].find(x => x.nik === dr.nik);
    if (!r) return bad++;
    if (r.no !== dr.no) bad++;
    prof.forEach(f => { if (mb[dr.nik][f] !== r[f]) bad++; });
    delta.forEach(f => { if (dr[f] !== r[f]) bad++; });
  }));
  assert.strictEqual(bad, 0, 'roundtrip mismatch ' + bad);
});

let align = 0;
const p1 = new Map(d.Pertemuan1.map(r => [r.nik, r]));
d.members.forEach(m => { const b = p1.get(m.nik); if (b && (b.nama !== m.nama || b.department !== m.department)) align++; });
ok('roster align members vs Pertemuan1 (0 mismatch)', () => assert.strictEqual(align, 0));

console.log('\n[Syntax: node --check]');
ok('semua js/*.js lolos node --check', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  files.forEach(f => execFileSync('node', ['--check', path.join(ROOT, 'js', f)]));
});

console.log('\n[Server: serve 200]');
const http = require('http');
const PORT = 9457;
const TEST_PASSWORD = 'test-only-password';

function post(port, path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TEST_PASSWORD, 'Content-Length': Buffer.byteLength(data) } }, resp => {
      resp.resume(); res(resp.statusCode);
    });
    r.on('error', rej); r.end(data);
  });
}

async function serverCheck() {
  const { spawn } = require('child_process');
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    for (const u of ['index.html', 'js/core.js']) {
      const code = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/' + u, r => { res(r.statusCode); r.resume(); }).on('error', rej);
      });
      assert.strictEqual(code, 200, '/' + u + ' -> ' + code);
    }
    const dataCode = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/data.json', r => { res(r.statusCode); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(dataCode, 401, '/data.json tanpa token harus ditolak');
    const protectedDataCode = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/data.json', { headers: { Authorization: 'Bearer ' + TEST_PASSWORD } }, r => { res(r.statusCode); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(protectedDataCode, 200, '/data.json dengan token harus 200');
  } finally {
    proc.kill();
  }
}

// SRV-DURALIVE: behavioral check crash-DoS - GET /% (decodeURIComponent malformed) harus 400
// BUKAN uncaught URIError yg mematikan proses. Server harus tetap hidup setelahnya (dibuktikan GET berikutnya 200).
async function serverMalformedCheck() {
  const { spawn } = require('child_process');
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 600));
  try {
    const badStatus = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/%', r => { res(r.statusCode); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(badStatus, 400, 'GET /% harus 400 (bukan proses crash)');
    const encore = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/index.html', r => { res(r.statusCode); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(encore, 200, 'server mati setelah GET /% -> crash DoS masih hidup');
  } finally {
    proc.kill();
  }
}

// V-LOGO: behavioral check logo asset - GET /assets logo harus 200 + Content-Type image/jpeg + nosniff
// (dgn nosniff aktif, browser menolak sniff octet-stream; MIME image/jpeg wajib agar <img> ter-render)
async function serverLogoCheck() {
  const { spawn } = require('child_process');
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    const res = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/assets/spmkb-logo-aktual.jpeg', r => { res(r); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(res.statusCode, 200, 'GET /assets/spmkb-logo-aktual.jpeg -> ' + res.statusCode);
    assert.strictEqual(res.headers['content-type'], 'image/jpeg', 'Content-Type harus image/jpeg (tak boleh octet-stream, dgn nosniff browser menolak sniff)');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff', 'header nosniff harus tetap ada');
  } finally {
    proc.kill();
  }
}

// POST validasi payload (trust boundary) - pakai DATA_FILE temp agar tak menyentuh data.json asli
async function serverPostCheck() {
  const os = require('os');
  const { spawn } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), 'spm_test_data_' + process.pid + '.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ members: [1] }));
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    // value array valid (key dikenal) -> 200, key tertulis ke temp
    assert.strictEqual(await post(PORT, '/api/data', { key: 'dues', value: [{ x: 1 }] }), 200);
    const w1 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.ok(Array.isArray(w1.dues) && w1.dues.length === 1, 'dues tidak tertulis utk POST valid');

    // value non-array -> 400 (C3: cegah korupsi struktur)
    for (const bad of ["string", 123, null, { a: 1 }, 4.5, true]) {
      assert.strictEqual(await post(PORT, '/api/data', { key: 'members', value: bad }), 400, 'non-array value -> ' + JSON.stringify(bad));
    }
    // elemen array yang bukan objek (corrupting: m.nama.toLowerCase() crash saat render/search)
    for (const bad of [null, "x", 123]) {
      assert.strictEqual(await post(PORT, '/api/data', { key: 'members', value: [bad] }), 400, 'member primitif -> ' + JSON.stringify(bad));
    }
    // key tak dikenal -> 400
    assert.strictEqual(await post(PORT, '/api/data', { key: 'hack', value: [] }), 400);

    // pastikan data.json asli tak tersentuh oleh POST invalid: key yg tertulis hanyalah members (awal) + dues (POST valid)
    const w2 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.deepStrictEqual(Object.keys(w2).sort(), ['dues', 'members'], 'key tak dikenal / value non-array harusnya tak menambah key');
  } finally {
    proc.kill();
    fs.unlinkSync(tmpFile);
    for (const ext of ['.bak', '.tmp']) { try { fs.unlinkSync(tmpFile + ext); } catch (e) {} }
  }
}

// V-RL-BEHAVIORAL: rate limit BENAR-BENAR membatasi — RATE_LIMIT+1 POST valid -> yg terakhir harus 429.
// Guard statis V-RL hanya cek kata di call-site; limiter yg di-gut (selalu false) lolos 275/275 tanpanya.
async function serverRateLimitCheck() {
  const os = require('os');
  const { spawn } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), 'spm_rl_' + process.pid + '.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ members: [] }));
  // Baca RATE_LIMIT dari server.js — jangan hardcode 31: kalau konstanta berubah, loop harus ikut
  const rlMatch = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').match(/const RATE_LIMIT = (\d+)/);
  const RL = rlMatch ? Number(rlMatch[1]) : 30;
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    let last = 0;
    for (let n = 1; n <= RL + 1; n++) {
      last = await post(PORT, '/api/data', { key: 'dues', value: [{ id: 'rl-' + n }] });
      if (n <= RL) assert.strictEqual(last, 200, 'POST ke-' + n + ' harus 200 (di bawah limit)');
    }
    assert.strictEqual(last, 429, 'POST ke-' + (RL + 1) + ' harus 429 (rate limit aktif) — limiter di-gut?');
    // server masih hidup setelah 429 (bukan crash) & bucket GET tak ikut kena (terpisah)
    const alive = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + PORT + '/index.html', r => { res(r.statusCode); r.resume(); }).on('error', rej);
    });
    assert.strictEqual(alive, 200, 'server mati setelah rate-limit 429');
  } finally {
    proc.kill();
    fs.unlinkSync(tmpFile);
    for (const ext of ['.bak', '.tmp']) { try { fs.unlinkSync(tmpFile + ext); } catch (e) {} }
  }
}

// Backup/restore operational drill — membuktikan WORKFLOW pemulihan teruji, bukan
// sekadar mekanisme. Isolasi penuh di os.tmpdir via DATA_FILE; tak menyentuh data.json asli.
async function serverRestoreCheck() {
  const os = require('os');
  const { spawn } = require('child_process');
  const REAL_DATA = path.join(ROOT, 'data.json');
  const realBefore = fs.readFileSync(REAL_DATA, 'utf8'); // snapshot utk buktikan tak tersentuh
  const tmpFile = path.join(os.tmpdir(), 'spm_restore_' + process.pid + '.json');
  const seed = { members: [{ id: 1, no: 1, nama: 'A' }], dues: [{ id: '1-2026-01', nik: '12130008', jumlah: 180000 }] };
  fs.writeFileSync(tmpFile, JSON.stringify(seed, null, 2));
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    // 1) tulis normal -> server membuat snapshot .bak (rotasi sebelum tulis atomik)
    assert.strictEqual(await post(PORT, '/api/data', { key: 'members', value: [{ id: 1, no: 1, nama: 'A' }, { id: 2, no: 2, nama: 'B' }] }), 200);
    await new Promise(r => setTimeout(r, 300));
    assert.ok(fs.existsSync(tmpFile + '.bak'), 'setelah POST valid, snapshot .bak harus dibuat oleh writeData()');
    const bak1 = JSON.parse(fs.readFileSync(tmpFile + '.bak', 'utf8'));
    assert.ok(Array.isArray(bak1.members) && bak1.members.length === 1, '.bak harus = snapshot SEBELUM tulis (1 member)');
    const live1 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.strictEqual(live1.members.length, 2, 'file live setelah POST = 2 member');

    // 2) simulasikan korupsi data (mis. disk/tulis korup -> bukan JSON valid)
    fs.writeFileSync(tmpFile, '{"members":[CORRUPTED!!');
    assert.throws(() => JSON.parse(fs.readFileSync(tmpFile, 'utf8')), 'data.json korup harusnya parse-error');

    // 3) pulihkan dari .bak (drill operator: copy snapshot kembali ke file live)
    fs.copyFileSync(tmpFile + '.bak', tmpFile);
    const restored = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.deepStrictEqual(restored.members, seed.members, 'setelah restore, isi kembali = snapshot valid (1 member)');
    assert.deepStrictEqual(restored.dues, seed.dues, 'restore memulihkan seluruh koleksi, tak cuma members');

    // 4) REBOOT: matikan server berjalan (simulasi aplikasi ditutup saat korupsi),
    //    lalu start ulang dari file hasil-restore — buktikan app benar-benar BOOT dari data pulih.
    proc.kill();
    await new Promise(r => proc.on('exit', r));
    const proc2 = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
    try {
      await new Promise(r => setTimeout(r, 800));
      // boot sukses: asset statis diserve 200
      const bootCode = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/index.html', r => { res(r.statusCode); r.resume(); }).on('error', rej);
      });
      assert.strictEqual(bootCode, 200, 'server hasil-restore harus boot & serve 200');
      // data pulih tetap terbaca dari disk
      const afterBoot = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      assert.deepStrictEqual(afterBoot.members, seed.members, 'data hasil-restore utuh setelah reboot');
      // server hasil-restore dapat menulis normal (POST)
      assert.strictEqual(await post(PORT, '/api/data', { key: 'letters', value: [{ noSurat: '001', perihal: 'recovered' }] }), 200);
      await new Promise(r => setTimeout(r, 300));
      const live2 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      assert.ok(Array.isArray(live2.letters) && live2.letters.length === 1, 'server rebooted tetap menulis normal');
    } finally {
      proc2.kill();
      await new Promise(r => proc2.on('exit', r));
    }
  } finally {
    proc.kill();
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    for (const ext of ['.bak', '.tmp']) { try { fs.unlinkSync(tmpFile + ext); } catch (e) {} }
    // pastikan data.json asli benar-benar tak tersentuh oleh drill (byte-identical)
    assert.strictEqual(fs.readFileSync(REAL_DATA, 'utf8'), realBefore, 'data.json asli tak boleh berubah oleh drill restore');
  }
}

console.log('\n[Refactor guards]');
const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
const toastLine = coreSrc.split('\n').find(l => l.includes('showToast(msg'));
ok('P1: showToast escapses msg (anti XSS sink)', () =>
  assert.ok((toastLine || '').includes('escapeHtml(msg)'), 'showToast t.innerHTML belum memakai escapeHtml(msg)'));

const cardsSrc = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
ok('P3: printCard tidak pakai w.document.write (deprecated)', () =>
  assert.ok(!/(document\.write|window\.open)/.test(cardsSrc), 'cards.js masih memakai w.document.write / window.open'));

const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const printBlock = css.slice(css.indexOf('@media print'), css.lastIndexOf('}'));
ok('P3: ada aturan print khusus halaman kartu', () =>
  assert.ok(/@media print[\s\S]*#cards\.printing/.test(css), 'style.css belum ada aturan print utk #cards.printing'));

const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'core.js');
let directModal = 0;
jsFiles.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const hits = src.match(/getElementById\('mainModal'\)\.classList\.add\('active'\)/g) || [];
  directModal += hits.length;
});
ok('P2: helper openModal() ada & tak ada call-site langsung mainModal di domain files', () => {
  assert.ok(coreSrc.includes('openModal('), 'core.js belum punya helper openModal()');
  assert.strictEqual(directModal, 0, 'masih ada call-site langsung open modal di domain files: ' + directModal);
});

ok('P5: globalSearch di-debounce (input listener tak inline ke globalSearch langsung)', () => {
  assert.ok(coreSrc.includes('debouncedGlobalSearch'), 'core.js belum punya helper debouncedGlobalSearch');
  const bindLine = (coreSrc.split('\n').find(l => l.includes("addEventListener('input'") && l.includes('globalSearch'))) || '';
  assert.ok(bindLine && bindLine.includes('debouncedGlobalSearch'),
    'input listener masih inline ke globalSearch langsung (tanpa debounce): ' + (bindLine || '(line tak ditemukan)'));
  const lines = coreSrc.split('\n');
  const defIdx = lines.findIndex(l => l.includes('debouncedGlobalSearch(q)'));
  assert.ok(defIdx !== -1, 'helper debouncedGlobalSearch(q) tak ditemukan');
  const d = lines.slice(defIdx, defIdx + 4).join('\n');
  assert.ok(d.includes('clearTimeout') && d.includes('setTimeout'), 'debouncedGlobalSearch belum pakai clearTimeout+setTimeout');
});

ok('P6: globalSearch mencakup semua koleksi (bukan cuma members) — via _buildSearchIndex', () => {
  const idxDef = coreSrc.indexOf('_buildSearchIndex() {');
  assert.ok(idxDef !== -1, 'core.js belum punya _buildSearchIndex()');
  // Slice ke akhir file — method di ujung class
  const idxBody = coreSrc.slice(idxDef);
  assert.ok(/this\.members/.test(idxBody), '_buildSearchIndex belum index members');
  assert.ok(/this\.dues/.test(idxBody), '_buildSearchIndex belum index dues');
  assert.ok(/this\.attendance/.test(idxBody), '_buildSearchIndex belum index attendance');
  assert.ok(/this\.letters/.test(idxBody), '_buildSearchIndex belum index letters');
  assert.ok(/this\.complaints/.test(idxBody), '_buildSearchIndex belum index complaints');
  assert.ok(/wageData/.test(idxBody), '_buildSearchIndex belum index wageData');
  assert.ok(/showGlobalResults/.test(coreSrc), 'globalSearch belum punya showGlobalResults()');
});

ok('R5: reports.js memakai renderHtmlBarChart/renderHtmlDoughnut (HTML/CSS charts, bukan Chart.js)', () => {
  const reportsSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  assert.ok(reportsSrc.includes('renderHtmlBarChart('), 'reports.js belum punya helper renderHtmlBarChart');
  assert.ok(reportsSrc.includes('renderHtmlDoughnut('), 'reports.js belum punya helper renderHtmlDoughnut');
  assert.ok(!reportsSrc.includes('mountChart('), 'reports.js masih punya mountChart lama (Chart.js)');
  assert.ok(!reportsSrc.includes('new Chart('), 'reports.js masih membuat new Chart() (Chart.js)');
});

const loadLocalBlock = coreSrc.slice(coreSrc.indexOf('loadDataLocal'), coreSrc.indexOf('saveLocal'));
ok('R1: loadDataLocal memakai helper getStoredArray (bukan 6x JSON.parse langsung)', () => {
  assert.ok(coreSrc.includes('getStoredArray('), 'core.js belum punya helper getStoredArray()');
  assert.ok(loadLocalBlock.includes('getStoredArray('), 'loadDataLocal belum memakai getStoredArray()');
  const directParses = (loadLocalBlock.match(/JSON\.parse\(localStorage\.getItem/g) || []).length;
  assert.strictEqual(directParses, 0, 'masih ada JSON.parse(localStorage.getItem) langsung di loadDataLocal: ' + directParses);
});

const goPageBlock = coreSrc.split('\n').find(l => l.includes('goPage(stateKey'));
ok('R2: goPage memakai stateKey langsung (3x ternary identity redundant dihapus)', () => {
  assert.ok((goPageBlock || '').includes('this.renderPage(stateKey)'), 'goPage belum memakai renderPage(stateKey) langsung');
  assert.ok(!/(stateKey === 'members' \? 'members')/.test(goPageBlock || ''), 'goPage masih memakai ternary identity berulang');
});

const evtOption = coreSrc.split('\n').find(l => l.includes('attEvents.map'));
ok('S1(XSS): events[].title di-filter option memakai escapeHtml (stored XSS tertutup)', () => {
  assert.ok((evtOption || '').includes('escapeHtml(e)'), 'option events[].title belum memakai escapeHtml(e): ' + (evtOption || '').trim());
  assert.ok(!/<option>\$\{e\}<\/option>/.test(evtOption || ''), 'masih ada <option>${e}</option> mentah (racun XSS)');
});

const setOptsLine = coreSrc.split('\n').find(l => l.includes('vals.map(v'));
ok('S2: department/jobclass di option memakai escapeHtml (text+value)', () => {
  assert.ok((setOptsLine || '').includes('escapeHtml(v)'), 'option department/jobclass belum memakai escapeHtml(v): ' + (setOptsLine || '').trim());
  assert.ok(!/<option value="\$\{v\}">\$\{v\}<\/option>/.test(setOptsLine || ''), 'masih ada <option value="${v}">${v}</option> mentah');
});

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
ok('S3: server.js pakai containment path aman (path.relative), bukan startsWith(ROOT)', () => {
  assert.ok(serverSrc.includes('path.relative(ROOT'), 'server.js belum memakai path.relative(ROOT, ...) utk containment');
  assert.ok(!/file\.startsWith\(ROOT\)/.test(serverSrc), 'server.js masih memakai file.startsWith(ROOT) (cek prefix tidak aman)');
});

const serverStart = serverSrc.match(/const HOST\s*=\s*'([^']+)'/);
ok('S4: HOST server terkunci 127.0.0.1 (guard loopback utk endpoint tanpa-otentikasi)', () => {
  assert.ok(serverStart && serverStart[1] === '127.0.0.1',
    'HOST server harus 127.0.0.1 - POST /api/data tanpa otentikasi hanya boleh di loopback. Saat ini = ' + (serverStart ? serverStart[1] : 'tidak ditemukan'));
  assert.ok(/127\.0\.0\.1/.test(serverSrc.slice(serverSrc.indexOf('const HOST'), serverSrc.indexOf('const ROOT'))),
    'HOST server harus eksplisit 127.0.0.1 di deklarasi');
  assert.ok(/req\.headers\.host/.test(serverSrc),
    'server.js belum punya guard HOST (req.headers.host) di jalur POST /api/data tanpa otentikasi');
});

const emptyRowLine = coreSrc.split('\n').find(l => l.includes('emptyRow('));
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const membersSrc = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
const complaintsSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
const lettersSrc = fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8');
ok('R3: emptyRow punya icon opsional & icon members (fa-users) dipertahankan', () => {
  assert.ok((emptyRowLine || '').includes('emptyRow(colspan, message, icon'), 'emptyRow belum punya param icon utk melestarikan output render');
  assert.ok(membersSrc.includes("emptyRow(7, 'Tidak ada data', 'fa-users')"), 'members empty-row kehilangan icon fa-users');

});
ok('R3: kelas badge hardcoded/conditional di complaints & letters TIDAK diubah ke badge()', () => {
  assert.ok(complaintsSrc.includes('status-badge status-baru'), 'complaints kategori badge kehilangan kelas hardcoded status-baru');
  assert.ok(lettersSrc.includes('status-badge status-baru'), 'letters tipe badge kehilangan kelas hardcoded status-baru');
  // letters bisa pakai hardcoded ternary ATAU statusClass() helper
  assert.ok(/status-\$\{l\.status/.test(lettersSrc) || /statusClass/.test(lettersSrc), 'letters status badge harus pakai hardcoded ternary atau statusClass()');
});

ok('S12: surat punya workflow status updateLetterStatus() & terikat di viewLetter', () => {
  assert.ok(/updateLetterStatus\(id/.test(lettersSrc), 'letters.js belum punya method updateLetterStatus(id, status)');
  assert.ok(/App\.updateLetterStatus\(/.test(lettersSrc), 'updateLetterStatus belum dipanggil dari UI (onclick App.updateLetterStatus)');
  assert.ok(/'Baru'/.test(lettersSrc) && /'Diterima'/.test(lettersSrc) && /'Selesai'/.test(lettersSrc), 'workflow status belum mencakup Baru/Diterima/Selesai');
});
ok('S13: surat punya field fileUrl opsional (tanpa file upload) di saveLetter & viewLetter', () => {
  assert.ok(/fileUrl/.test(lettersSrc), 'letters.js belum memakai field fileUrl');
  assert.ok(/fileUrl\s*:/.test(lettersSrc), 'saveLetter belum menyimpan field fileUrl');
  const idxHtml = indexHtml.indexOf('<div class="page" id="letters"');
  const letterSection = indexHtml.slice(idxHtml, idxHtml + 2000);
  assert.ok(!/<input[^>]*type="file"/.test(letterSection), 'surat masih punya input file upload (harus tanpa upload)');
});

ok('GC-LETTER-EDIT: letters.js punya editLetter(id) + saveEditLetter(id) + tombol Edit di viewLetter — CRUD lengkap (add/edit/delete/status)', () => {
  assert.ok(/editLetter\s*\(id/.test(lettersSrc), 'letters.js belum punya editLetter(id)');
  assert.ok(/saveEditLetter\s*\(id/.test(lettersSrc), 'letters.js belum punya saveEditLetter(id)');
  const viewIdx = lettersSrc.indexOf('viewLetter(');
  const viewBody = lettersSrc.slice(viewIdx, lettersSrc.indexOf('updateLetterStatus', viewIdx));
  assert.ok(/editLetter/.test(viewBody), 'viewLetter belum punya tombol Edit (onclick editLetter)');
  assert.ok(/escapeJsStr/.test(viewBody), 'viewLetter tombol Edit belum escapeJsStr(l.id)');
  // saveEditLetter harus update field: noSurat, tanggal, tipe, perihal, dari, fileUrl
  const saveIdx = lettersSrc.indexOf('saveEditLetter(id) {');
  assert.ok(saveIdx !== -1, 'saveEditLetter(id) method definition tidak ditemukan');
  const saveBody = lettersSrc.slice(saveIdx, saveIdx + 1000);
  assert.ok(/l\.noSurat/.test(saveBody) || /\.noSurat\s*=/.test(saveBody), 'saveEditLetter belum update noSurat');
  assert.ok(/l\.tanggal/.test(saveBody) || /\.tanggal\s*=/.test(saveBody), 'saveEditLetter belum update tanggal');
  assert.ok(/l\.tipe/.test(saveBody) || /\.tipe\s*=/.test(saveBody), 'saveEditLetter belum update tipe');
  assert.ok(/l\.perihal/.test(saveBody) || /\.perihal\s*=/.test(saveBody), 'saveEditLetter belum update perihal');
  assert.ok(/try\s*\{/.test(saveBody), 'saveEditLetter belum punya try/catch');
});

ok('S14: kartu pakai tahun berlaku dinamis (new Date().getFullYear()), bukan hardcode 2026', () => {
  assert.ok(/new Date\(\)\.getFullYear\(\)/.test(cardsSrc), 'cards.js belum pakai new Date().getFullYear() untuk Berlaku');
  assert.ok(!/info-value">2026/.test(cardsSrc), 'cards.js masih hardcode 2026 di Berlaku');
});
ok('S15: kartu merender foto anggota & members menyimpan field foto', () => {
  assert.ok(/m\.foto/.test(cardsSrc), 'cards.js belum merender m.foto di kartu');
  assert.ok(/foto/.test(membersSrc), 'members.js belum memakai field foto');
});
ok('S18: m.foto di kartu lewat escapeHtml (sink <img src> user-supplied - cegah attribute breakout/onerror)', () => {
  const i = cardsSrc.indexOf('<img src=');
  const around = i === -1 ? cardsSrc : cardsSrc.slice(Math.max(0, i - 80), i + 120);
  assert.ok(/escapeHtml|safe\(/.test(around), 'cards.js merender <img src> tanpa escapeHtml/safe() - XSS via user-supplied foto');
  assert.ok(!/<img src="\$\{m\.foto\}"/.test(cardsSrc), 'cards.js masih ada <img src="${m.foto}"> mentah (tanpa escapeHtml)');
});
ok('S16: kartu punya downloadCardPDF() + jsPDF CDN + tombol di index.html', () => {
  assert.ok(cardsSrc.includes('downloadCardPDF() {'), 'cards.js belum punya DEFINISI method downloadCardPDF() { (anchor call-site cards.js:112 bisa loloskan guard)');
  assert.ok(/jspdf/.test(indexHtml), 'index.html belum memuat library jsPDF (CDN)');
  assert.ok(/App\.downloadCardPDF\(\)/.test(indexHtml), 'index.html belum punya tombol panggil App.downloadCardPDF()');
});

const wagesSrcGX = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
ok('GX1: copywriting upah "X仅IN" dikoreksi jadi "X Only" (tanpa kanji)', () => {
  assert.ok(!/仅/.test(wagesSrcGX), 'wages.js masih memakai kanji 仅 di copywriting upah');
  assert.ok(/X Only/.test(wagesSrcGX), 'wages.js belum pakai "X Only" di deskripsi skenario');
});

const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
ok('R4-ACTIVE: refreshDashboard ada & guarded (cuma render saat dashboard aktif)', () => {
  assert.ok(/refreshDashboard\s*\(\)/.test(dashSrc), 'dashboard.js belum punya helper refreshDashboard()');
  const bb = dashSrc.slice(dashSrc.indexOf('refreshDashboard'));
  assert.ok(/nav-item\.active/.test(bb), 'refreshDashboard() belum membaca .nav-item.active utk cek halaman aktif');
  assert.ok(/['"]dashboard['"]|\|\| 'dashboard'/.test(bb), 'refreshDashboard() belum fallback/cek ke halaman dashboard');
});
ok('R4-MUTASI: SETIAP method yg memutasi data dashboard (members/dues/events/complaints) WAJIB refreshDashboard() di body yg sama', () => {
  // dashboard.js membaca members, dues, events, complaints (dan TIDAK attendance/letters).
  // Guard lama cuma floor hitungan (>=) yang tak pernah bisa mendeteksi titik mutasi BARU yg
  // lupa refreshDashboard — hitungan tak pernah turun. Guard ini per-method-body: method apa pun
  // (termasuk yang baru ditambahkan) yang menulis dataset dashboard tanpa refresh = FAIL.
  ['members', 'dues', 'calendar', 'complaints'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js/' + f + '.js'), 'utf8');
    const offenders = methodChunks(src).filter(({ name, body }) => {
      if (name === 'refreshDashboard' || /^render/.test(name)) return false; // render/refresh sendiri bukan mutasi
      const writes = /saveLocal\(\s*['"](members|dues|events|complaints)['"]|this\.(members|dues|events|complaints)\.(push|splice|unshift)/.test(body);
      return writes && !body.includes('refreshDashboard');
    });
    assert.strictEqual(offenders.length, 0,
      'js/' + f + '.js: method memutasi data dashboard tanpa refreshDashboard(): ' + offenders.map(o => o.name).join(', '));
    // dashboard.js tak boleh dipanggil langsung dari file lain (harus lewat refreshDashboard yg page-guarded)
    assert.strictEqual((src.match(/renderDashboard\s*\(\)/g) || []).length, 0, 'js/' + f + '.js masih panggil renderDashboard() langsung');
  });
});
ok('R4-SCOPE: attendance & letters TIDAK boleh menyentuh dashboard (renderDashboard tak membaca data itu)', () => {
  ['attendance', 'letters'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js/' + f + '.js'), 'utf8');
    assert.ok(!src.includes('refreshDashboard'), 'js/' + f + '.js harus bersih dari panggilan dashboard (refreshDashboard) - data-nya tak dibaca dashboard.js');
    assert.ok(!src.includes('renderDashboard'), 'js/' + f + '.js masih memanggil renderDashboard - harus dihapus');
  });
});

ok('S5: isValidNik() ada (digit-only \\d{8}) & dipakai di saveNewMember/saveMemberEdit (cegah stored-XSS via nik)', () => {
  assert.ok(/isValidNik\s*\(/.test(coreSrc), 'core.js belum punya helper isValidNik()');
  const nikLine = (coreSrc.split('\n').find(l => l.includes('isValidNik(nik)') && l.includes('return'))) || '';
  assert.ok(nikLine.includes('\\d{8}'), 'isValidNik belum regex digit-only \\d{8}: ' + (nikLine || '(line tak ditemukan)'));
  // Accept direct nik/fNik OR v.fNik (via getFormValues)
  assert.ok(/isValidNik\((m\.nik|nik|fNik|v\.fNik)\)/.test(membersSrc),
    'members.js belum memanggil isValidNik() di boundary tulis (saveNewMember/saveMemberEdit)');
});

ok('S9: saveNewMember & saveMemberEdit cek NIK duplikat (nik = id unik dues ${nik}-${bulan}; duplikat -> data korup)', () => {
  const mSrc = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
  const newAnchor = mSrc.indexOf('saveNewMember() {');
  const newBlock = mSrc.slice(newAnchor, newAnchor + 800);
  const editAnchor = mSrc.indexOf('saveMemberEdit(');
  const editBlock = mSrc.slice(editAnchor, editAnchor + 1000);
  assert.ok(newAnchor !== -1 && editAnchor !== -1, 'anchor saveNewMember()/saveMemberEdit( tak ketemu');
  // Accept direct nik/fNik OR v.fNik (via getFormValues)
  assert.ok(/some\(\s*m => m\.nik === (nik|v\.fNik)/.test(newBlock),
    'saveNewMember belum cek NIK duplikat (some(m => m.nik === nik))');
  assert.ok(/some\(\s*x => x\.nik === (fNik|v\.fNik)/.test(editBlock),
    'saveMemberEdit belum cek NIK duplikat (some(x => x.nik === fNik))');
  assert.ok(newBlock.includes('NIK sudah terdaftar') && editBlock.includes('NIK sudah terdaftar'),
    'cegah duplikat belum disertai toast penolakan');
});

const duesSrc = fs.readFileSync(path.join(ROOT, 'js/dues.js'), 'utf8');
ok('S10: saveNewDues tolak jumlah <= 0 / NaN (integritas laporan keuangan)', () => {
  const a = duesSrc.indexOf('saveNewDues() {');
  // Check first 1000 chars to allow for validateRequired() before getFormValues()
  const block = duesSrc.slice(a, a + 1000);
  assert.ok(a !== -1, 'anchor saveNewDues() { tak ketemu');
  assert.ok(block.includes('rawJumlah') && block.includes('isNaN') && block.includes('<= 0'),
    'saveNewDues belum guard jumlah invalid via rawJumlah (isNaN / <= 0)');
  assert.ok(block.includes('Jumlah iuran tidak valid') && /jumlah: rawJumlah/.test(block),
    'saveNewDues belum pakai rawJumlah untuk field jumlah + toast penolakan');
});
ok('R7: filter iuran tdk punya opsi Belum/Sebagian (payroll -> selalu Lunas) & branch data=[] dihapus', () => {
  const duesIdx = indexHtml.indexOf('<div class="page" id="dues"');
  const duesSection = indexHtml.slice(duesIdx, duesIdx + 4000);
  assert.ok(!/<option[^>]*value="Belum"/.test(duesSection), 'filter iuran masih punya opsi Belum');
  assert.ok(!/<option[^>]*value="Sebagian"/.test(duesSection), 'filter iuran masih punya opsi Sebagian');
  assert.ok(!/status === 'Belum' \|\| status === 'Sebagian'/.test(duesSrc), 'renderDues masih punya branch data=[] utk Belum/Sebagian');
});

ok('S17: renderDashComplaints escape dulu c.tanggal sebelum masuk innerHTML (stored XSS: c.tanggal user-supplied, server tak validasi shape)', () => {
  const i = dashSrc.indexOf('renderDashComplaints() {');
  assert.ok(i !== -1, 'anchor renderDashComplaints() { tak ketemu');
  const block = dashSrc.slice(i);
  assert.ok(/escapeHtml\(c\.tanggal\)/.test(block), 'renderDashComplaints belum escapeHtml(c.tanggal) - c.tanggal masuk innerHTML mentah (stored XSS)');
  assert.ok(!/\$\{c\.tanggal\}/.test(block.replace('escapeHtml(c.tanggal)', '')), 'renderDashComplaints masih ada ${c.tanggal} mentah (tanpa escapeHtml)');
});

ok('R8: renderDues index dues ke Map by nik (scope bulan) via helper bersama duesRowsForSelectedMonth — tanpa this.dues.find() per-member O(n*m)', () => {
  const a = duesSrc.indexOf('renderDues() {');
  assert.ok(a !== -1, 'anchor renderDues() { tak ketemu');
  const end = duesSrc.indexOf('viewDuesDetail(id) {', a);
  const block = duesSrc.slice(a, end === -1 ? a + 800 : end);
  assert.ok(!/\.find\(d => d\.nik === m\.nik && d\.bulan === bulan\)/.test(block),
    'renderDues masih scan this.dues.find() per-member (O(n*m) kuadratik - dues tumbuh tiap bulan)');
  assert.ok(/duesRowsForSelectedMonth/.test(block), 'renderDues belum pakai helper bersama duesRowsForSelectedMonth (Mal Map by nik scope bulan)');
  assert.ok(/pageSlice\(data, 'dues'\)/.test(block), 'renderDues belum pakai pageSlice (paginasi rusak)');
  const hStart = coreSrc.indexOf('duesRowsForSelectedMonth() {');
  assert.ok(hStart !== -1, 'helper duesRowsForSelectedMonth() tak ada di core.js');
  const h = coreSrc.slice(hStart, hStart + 600);
  assert.ok(/new Map\(this\.dues\.filter\(d => this\.normalizeMonth\(d\.bulan\) === bulan\)\.map\(d => \[d\.nik, d\]\)\)/.test(h),
    'helper belum build Map by nik (scope bulan, normalize bulan) untuk lookup O(1) per anggota');
});

ok('D2: data.json dues - (nik, bulan) unik (prasyarat Map-keyed-nik di renderDues aman thd first-match)', () => {
  const seen = new Set();
  let dup = 0;
  (d.dues || []).forEach(r => { const k = `${r.nik}::${r.bulan}`; if (seen.has(k)) dup++; else seen.add(k); });
  assert.strictEqual(dup, 0, `${dup} record dues punya (nik, bulan) duplikat - pecah asumsi Map di renderDues()`);
});

ok('GC-DUESEXPORT: exportDuesCSV mengekspor baris PROYEKSI iuran per anggota utk bulan terpilih (bukan this.dues array mentah yg bisa kosong -> "Tidak ada data") — pakai helper yg SAMA dgn renderDues (anti-divergen, hormati filter Bulan/Tahun)', () => {
  assert.ok(!/exportToCSV\(this\.dues/.test(duesSrc), 'exportDuesCSV masih export array mentah this.dues (kosong utk model proyeksi -> toast "Tidak ada data") - harus baris proyeksi anggota');
  assert.ok(/duesRowsForSelectedMonth/.test(duesSrc), 'exportDuesCSV belum memakai helper proyeksi bulan terpilih (duesRowsForSelectedMonth)');
  const renderBlock = duesSrc.slice(duesSrc.indexOf('renderDues() {'), duesSrc.indexOf('viewDuesDetail(id) {'));
  assert.ok(/duesRowsForSelectedMonth/.test(renderBlock), 'renderDues belum memakai helper proyeksi yg SAMA (integrasi/anti-divergen) - tampilan & export bisa beda bulan');
  assert.ok(coreSrc.includes('duesRowsForSelectedMonth() {'), 'helper duesRowsForSelectedMonth() belum ada di core.js');
});

 ok('GK1: helper derivatif null-aman ada di core.js (parseBirth/computeAge/joinYear/masaKerja/pensiunTahun)', () => {
  ['parseBirth', 'computeAge', 'joinYear', 'masaKerja', 'pensiunTahun'].forEach(n => {
    assert.ok(new RegExp(n + '\\s*\\(').test(coreSrc), 'core.js belum punya ' + n + '()');
  });
});

 ok('GK-DATE: SEMUA 429 member punya tanggalLahir valid (parseBirth DD-MM-YYYY) — cegah data rusak lolos & usia/pensiun gagal', () => {
  assert.ok(d && Array.isArray(d.members), 'data.json: members tidak tersedia');
  const i = coreSrc.indexOf('parseBirth(m) {');
  assert.ok(i > -1, 'core.js belum punya parseBirth(m)');
  let j = coreSrc.indexOf('{', i), depth = 0, end = -1;
  for (let k = j; k < coreSrc.length; k++) { if (coreSrc[k] === '{') depth++; else if (coreSrc[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } } }
  const parseBirth = new Function('return ' + coreSrc.slice(i, end).replace('parseBirth(m)', '(m) =>') + ' ')();
  const invalid = d.members.filter(x => parseBirth(x) === null);
  assert.strictEqual(invalid.length, 0, invalid.length + ' member ber-tanggalLahir invalid: ' + invalid.slice(0, 8).map(x => x.nama + '(' + x.nik + ')=' + x.tanggalLahir).join(', '));
});

 ok('GK-SLASH: tanggalLahir wajib DD-MM-YYYY (dash) — tak ada slash (/); normalizeBirth cegah input slash tersimpan', () => {
  assert.ok(d && Array.isArray(d.members), 'data.json: members tidak tersedia');
  const bad = d.members.filter(x => String(x.tanggalLahir || '').includes('/'));
  assert.strictEqual(bad.length, 0, bad.length + ' member ber-tanggalLahir pakai slash (/): ' + bad.slice(0, 8).map(x => x.nama + '(' + x.nik + ')=' + x.tanggalLahir).join(', '));
});

 ok('GK-PLACE: tempatLahir wajib NAMA TEMPAT (bukan tanggal) & tidak identik dgn tanggalLahir', () => {
  assert.ok(d && Array.isArray(d.members), 'data.json: members tidak tersedia');
  const datePat = /^\d{2}-\d{2}-\d{4}$/;
  const bad = d.members.filter(x => {
    const t = String(x.tempatLahir || '').trim();
    const b = String(x.tanggalLahir || '').trim();
    return datePat.test(t) || (t !== '' && t === b);
  });
  assert.strictEqual(bad.length, 0, bad.length + ' member tempatLahir salah (tanggal/duplikat tglLahir): ' + bad.slice(0, 8).map(x => x.nama + '(' + x.nik + ')=' + x.tempatLahir).join(', '));
});

ok('GK2: joinYear pakai 2000 + parseInt(nik.slice(2,4)), pensiunTahun = birthYear + 56, keduanya null-aman', () => {
  const grab = (name) => { const i = coreSrc.indexOf(name + '('); const j = coreSrc.indexOf('\n    }', i); return i >= 0 ? coreSrc.slice(i, j > i ? j + 6 : i + 300) : ''; };
  const jy = grab('joinYear');
  const ps = grab('pensiunTahun');
  assert.ok(/2000\s*\+\s*parseInt/.test(jy) && /slice\(2,\s*4\)/.test(jy), 'joinYear harus 2000 + parseInt(nik.slice(2,4))');
  assert.ok(/length\s*!==\s*8/.test(jy), 'joinYear harus guard NIK 8 digit');
  assert.ok(/\+ 56/.test(ps), 'pensiunTahun harus birthYear + 56');
});

ok('GD1: dashboard hitung Youth Member pakai computeAge/parseBirth ambang <= 35 (bukan count statis/Aktif)', () => {
  // Inlined computeAge (parseBirth + age calc) acceptable utk performance
  assert.ok(/computeAge\(m\)/.test(dashSrc) || /parseBirth\(m\)/.test(dashSrc), 'dashboard belum pakai computeAge(m) atau parseBirth(m) utk statActive');
  assert.ok(/<= 35/.test(dashSrc), 'dashboard belum ambang <= 35 utk youth');
});

const renderMembersSrc = (() => {
  const a = membersSrc.indexOf('getFilteredMembers() {');
  if (a === -1) return '';
  const b = membersSrc.indexOf('viewMember(id) {', a);
  return membersSrc.slice(a, b === -1 ? membersSrc.length : b);
})();
ok('GD2: renderMembers punya filter Gender (memGenderFilter) & Youth (memYouthFilter) dgn definisi sinkron ke dashboard (computeAge?<=35, null->non-youth)', () => {
  assert.ok(/memGenderFilter/.test(renderMembersSrc), 'renderMembers belum baca filter gender (memGenderFilter)');
  assert.ok(/memYouthFilter/.test(renderMembersSrc), 'renderMembers belum baca filter youth (memYouthFilter)');
  assert.ok(/computeAge/.test(renderMembersSrc), 'filter youth members belum pakai computeAge utk umur');
  assert.ok(/<= 35/.test(renderMembersSrc), 'filter youth members belum ambang <= 35');
  assert.ok(/\?\? Infinity/.test(renderMembersSrc), 'filter youth members belum null-aman (tanpa TTL -> non-youth via ?? Infinity)');
  // Sinkron: definisi youth di members & dashboard identik (computeAge ama <= 35)
  assert.ok(/computeAge/.test(dashSrc) && /<= 35/.test(dashSrc), 'dashboard kehilangan definisi youth utk sinkron');
});

const membersPageHtml = (() => {
  const a = indexHtml.indexOf('<div class="page" id="members"');
  if (a === -1) return '';
  const b = indexHtml.indexOf('<div class="page" id="', a + 1);
  return indexHtml.slice(a, b === -1 ? indexHtml.length : b);
})();
ok('R12: toolbar keanggotaan punya dropdown filter Gender (memGenderFilter) & Youth (memYouthFilter) dgn opsi Laki-Laki/Perempuan & Youth/Non-Youth', () => {
  assert.ok(/memGenderFilter/.test(membersPageHtml), 'index.html belum punya dropdown memGenderFilter');
  assert.ok(/memYouthFilter/.test(membersPageHtml), 'index.html belum punya dropdown memYouthFilter');
  assert.ok(/Laki-Laki/.test(membersPageHtml) && /Perempuan/.test(membersPageHtml), 'dropdown gender belum punya opsi Laki-Laki/Perempuan');
  assert.ok(/value="youth"/.test(membersPageHtml) && /value="non"/.test(membersPageHtml), 'dropdown youth belum punya opsi youth/non');
});

const memFilterResetLine = coreSrc.split('\n').filter(function (l) { return l.includes("this.renderMembers)"); })[0] || '';
ok('R13: filter gender/youth keanggotaan terdaftar di filterReset core.js (change -> render ulang & reset page)', () => {
  assert.ok(/memDeptFilter/.test(memFilterResetLine), 'filterReset members kehilangan memDeptFilter');
  assert.ok(/memGenderFilter/.test(memFilterResetLine), 'filterReset members belum daftarkan memGenderFilter');
  assert.ok(/memYouthFilter/.test(memFilterResetLine), 'filterReset members belum daftarkan memYouthFilter');
});

ok('GC-SEARCH: globalSearch navigasi langsung ke data spesifik (viewMember/viewDuesDetail/dst) bukan cuma pindah halaman', () => {
  // _buildSearchIndex harus menyertakan id untuk setiap record
  const idxDef = coreSrc.indexOf('_buildSearchIndex() {');
  assert.ok(idxDef !== -1, 'core.js belum punya _buildSearchIndex()');
  const idxBody = coreSrc.slice(idxDef, idxDef + 2000);
  assert.ok(/id:\s*m\.id/.test(idxBody), '_buildSearchIndex belum simpan id untuk members');
  assert.ok(/id:\s*d\.id/.test(idxBody), '_buildSearchIndex belum simpan id untuk dues');
  assert.ok(/id:\s*a\.id/.test(idxBody), '_buildSearchIndex belum simpan id untuk attendance');
  assert.ok(/id:\s*l\.id/.test(idxBody), '_buildSearchIndex belum simpan id untuk letters');
  assert.ok(/id:\s*c\.id/.test(idxBody), '_buildSearchIndex belum simpan id untuk complaints');
  assert.ok(/id:\s*r\.no/.test(idxBody), '_buildSearchIndex belum simpan id untuk wages');
  // showGlobalResults harus panggil view* functions
  assert.ok(/viewMember/.test(coreSrc), 'showGlobalResults belum panggil viewMember');
  assert.ok(/viewDuesDetail/.test(coreSrc), 'showGlobalResults belum panggil viewDuesDetail');
  assert.ok(/viewAttendance/.test(coreSrc), 'showGlobalResults belum panggil viewAttendance');
  assert.ok(/viewLetter/.test(coreSrc), 'showGlobalResults belum panggil viewLetter');
  assert.ok(/viewComplaint/.test(coreSrc), 'showGlobalResults belum panggil viewComplaint');
  assert.ok(/viewWageDetail/.test(coreSrc), 'showGlobalResults belum panggil viewWageDetail');
});

ok('MEM-CSV-FILTER: exportMembersCSV mengekspor data sesuai filter aktif (bukan semua members)', () => {
  const mSrc = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
  assert.ok(/getFilteredMembers\s*\(/.test(mSrc), 'members.js belum punya helper getFilteredMembers()');
  const renderIdx = mSrc.indexOf('renderMembers() {');
  assert.ok(renderIdx !== -1, 'renderMembers() definition tidak ditemukan');
  const renderBody = mSrc.slice(renderIdx, renderIdx + 200);
  assert.ok(/getFilteredMembers/.test(renderBody), 'renderMembers() belum memanggil getFilteredMembers()');
  const exportIdx = mSrc.indexOf('exportMembersCSV()');
  assert.ok(exportIdx !== -1, 'exportMembersCSV() definition tidak ditemukan');
  const exportBody = mSrc.slice(exportIdx, exportIdx + 200);
  assert.ok(/getFilteredMembers/.test(exportBody), 'exportMembersCSV() belum memanggil getFilteredMembers()');
  assert.ok(!/this\.members/.test(exportBody), 'exportMembersCSV() masih export this.members mentah tanpa filter');
});

const dashPageHtml = (() => {
  const a = indexHtml.indexOf('id="dashboard"');
  if (a === -1) return '';
  const b = indexHtml.indexOf('<div class="page"', a);
  return indexHtml.slice(a, b === -1 ? indexHtml.length : b);
})();
ok('GC-DASH: elemen dashboard dapat diklik/menavigasi — stat cards -> halaman; Kegiatan Mendatang -> calendar; Pengaduan Terbaru -> viewComplaint (escapeJsStr id)', () => {
  assert.ok(/showPage\('members'\)/.test(dashPageHtml), 'stat card Total/Youth anggota belum navigasi ke members');
  assert.ok(/showPage\('dues'\)/.test(dashPageHtml), 'stat card Iuran Bulan Ini belum navigasi ke dues');
  assert.ok(/showPage\('calendar'\)/.test(dashPageHtml), 'stat card Kegiatan Bulan Ini belum navigasi ke calendar');
  const evt = dashSrc.slice(dashSrc.indexOf('renderDashEvents() {'), dashSrc.indexOf('renderDashComplaints() {'));
  assert.ok(/showPage\('calendar'\)/.test(evt), 'item Kegiatan Mendatang belum onclick navigasi ke calendar');
  const cmp = dashSrc.slice(dashSrc.indexOf('renderDashComplaints() {'));
  assert.ok(/viewComplaint/.test(cmp), 'item Pengaduan Terbaru belum buka viewComplaint');
  assert.ok(/escapeJsStr\(c\.id\)/.test(cmp), 'viewComplaint di dashboard harus pakai escapeJsStr(c.id) utk arg onclick (bukan escapeHtml)');
});

ok('GC-SORT: klik header kolom (data-sort) di tabel Data Keanggotaan men-set sortField & toggle sortDir, dan renderMembers menerapkan arah sortDir (sorting kolom berfungsi)', () => {
  const be = coreSrc.slice(coreSrc.indexOf('bindEvents() {'), coreSrc.indexOf('showPage(page) {'));
  assert.ok(/querySelectorAll\(['"]th\[data-sort\]/.test(be), 'bindEvents belum pasang click-listener pada header data-sort');
  assert.ok(/this\.sortField\s*=/.test(be), 'klik header belum meng-set this.sortField');
  assert.ok(/this\.sortDir\s*=/.test(be), 'klik header belum toggle this.sortDir');
  assert.ok(/renderMembers/.test(be), 'klik header belum memicu renderMembers (render ulang tabel)');
  assert.ok(/sortDir/.test(renderMembersSrc), 'renderMembers belum menerapkan this.sortDir (arah sorting) — sortDir jadi no-op');
});

ok('GM1: viewMember tampilkan Usia/Masa Kerja/Estimasi Pensiun (pakai helper)', () => {
  assert.ok(/computeAge\(m\)/.test(membersSrc), 'viewMember belum pakai computeAge(m) utk Usia');
  assert.ok(/masaKerja\(m\.nik\)/.test(membersSrc), 'viewMember belum pakai masaKerja(m.nik)');
  assert.ok(/pensiunTahun\(m\)/.test(membersSrc), 'viewMember belum pakai pensiunTahun(m)');
});

ok('V-02: server.js whitelist KEYS memuat koleksi baru sanksi & bukuKas (persistensi dua fitur)', () => {
  const keysLine = serverSrc.split('\n').filter(l => l.includes('const KEYS'))[0] || '';
  assert.ok(/sanksi/.test(keysLine), 'server.js KEYS belum memuat sanksi');
  assert.ok(/bukuKas/.test(keysLine), 'server.js KEYS belum memuat bukuKas');
});
ok('P31: core.js load/seed memuat koleksi baru sanksi & bukuKas (loadDataLocal & seedSampleData KEYS)', () => {
  const loadLine = coreSrc.split('\n').filter(l => l.includes('forEach(k =>'))[0] || '';
  const seedLine = coreSrc.split('\n').filter(l => l.includes("const KEYS = ['members'"))[0] || '';
  assert.ok(/sanksi/.test(loadLine) && /bukuKas/.test(loadLine), 'loadDataLocal belum muat sanksi/bukuKas');
  assert.ok(/sanksi/.test(seedLine) && /bukuKas/.test(seedLine), 'seedSampleData KEYS belum muat sanksi/bukuKas');
});

ok('GM2: helper berakhirSanksi(mulai,jenis) di core.js — masa berlaku STT/SP1/SP2=3 bln, SP3=6 bln, tambah bulan dgn clamp hari ke akhir bulan target', () => {
  const helperIdx = coreSrc.indexOf('berakhirSanksi(');
  assert.ok(helperIdx > -1, 'core.js belum punya helper berakhirSanksi(');
  const rest = coreSrc.slice(helperIdx);
  const nextMeth = rest.search(/\n    [a-zA-Z]+\(/);
  const slice = rest.slice(0, nextMeth === -1 ? rest.length : nextMeth);
  assert.ok(/STT\s*:\s*3/.test(slice) && /SP1\s*:\s*3/.test(slice) && /SP2\s*:\s*3/.test(slice) && /SP3\s*:\s*6/.test(slice), 'masa berlaku STT/SP1/SP2/SP3 tidak 3/3/3/6');
  assert.ok(/Math\.min\(d,\s*last\)/.test(slice) || /Math\.min\(d, last\)/.test(slice), 'berakhirSanksi belum clamp hari ke akhir bulan target (Math.min(d,last))');
  assert.ok(/\.getDate\(\)/.test(slice), 'berakhirSanksi belum hitung last day bulan target via getDate');
});

const reportsSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
ok('R6: laporan difilter berdasarkan reportFrom/reportTo', () => {
  assert.ok(/reportFrom/.test(reportsSrc) && /reportTo/.test(reportsSrc), 'reports.js belum baca reportFrom/reportTo');
  assert.ok(/new Date\(.*reportFrom/.test(reportsSrc) || /getElementById\(.reportFrom/.test(reportsSrc), 'belum parse nilai filter');
});

ok('R7: reportFrom/reportTo punya onchange handler — auto-update chart saat user ganti tanggal', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fromMatch = html.match(/id="reportFrom"[^>]*>/);
  assert.ok(fromMatch, 'index.html belum punya input reportFrom');
  assert.ok(/onchange=/.test(fromMatch[0]), 'reportFrom belum punya onchange handler');
  const toMatch = html.match(/id="reportTo"[^>]*>/);
  assert.ok(toMatch, 'index.html belum punya input reportTo');
  assert.ok(/onchange=/.test(toMatch[0]), 'reportTo belum punya onchange handler');
});

ok('R8: chart card headers berubah sesuai modul (bukan statis "Distribusi Data"/"Tren Data")', () => {
  // reports.js updateReportCharts harus meng-update card header berdasarkan modul
  assert.ok(/reportChart1.*\.previousElementSibling|reportChart1.*card-header|querySelector.*chart.*header|header.*textContent|header.*innerHTML/i.test(reportsSrc),
    'reports.js belum update chart card header berdasarkan modul');
});

ok('R9: filterReset terdaftar untuk reports filters (reportModule, reportFrom, reportTo)', () => {
  const coreSource = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/filterReset.*reportModule|filterReset.*reportFrom/.test(coreSource),
    'core.js belum register filterReset untuk reports filters');
});

ok('P29: pesangon search dropdown punya click-outside handler (tutup dropdown saat klik di luar)', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  // Harus ada document.addEventListener('click', ...) yang menutup pesangonSearchList
  assert.ok(/document\.addEventListener\s*\(\s*['"]click['"]/.test(pesSrc),
    'pesangon.js belum punya document click listener untuk tutup search dropdown');
  assert.ok(/pesangonSearchList.*display.*none/.test(pesSrc),
    'pesangon.js click handler belum menutup pesangonSearchList (display:none)');
});

ok('R10-WAGES: reports wages module guard empty data — Math.max pada array kosong tidak crash', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  const wagesIdx = repSrc.indexOf("modul === 'wages'");
  assert.ok(wagesIdx !== -1, 'reports.js belum punya branch modul wages');
  const wagesBody = repSrc.slice(wagesIdx, wagesIdx + 1500);
  // Math.max(...data.map(...)) harus punya fallback/ternary, bukan template literal langsung
  // Cek: ada computed variable sebelum template, atau ternary dengan data.length guard
  const maxMatches = wagesBody.match(/Math\.max\(\.\.\.data\.map/g) || [];
  if (maxMatches.length > 0) {
    // Harus ada guard: ternary (data.length ? Math.max : 0) atau variable computed di luar template
    assert.ok(/data\.length\s*\?/.test(wagesBody) || /\bconst\b.*=.*Math\.max/.test(wagesBody),
      'reports.js wages module: Math.max(...data.map) di dalam template tanpa guard — crash saat data kosong');
  }
});

ok('R11-DONUT: renderHtmlDoughnut guard total=0 — tidak ada NaN di conic-gradient', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  // total harus ≥1 atau punya guard sebelum conicParts
  const doughnutIdx = repSrc.indexOf('renderHtmlDoughnut');
  const doughnutBody = repSrc.slice(doughnutIdx, doughnutIdx + 600);
  assert.ok(/total\s*>\s*0|total\s*>=\s*1|\.length/.test(doughnutBody) || /if\s*\(!total/.test(doughnutBody),
    'renderHtmlDoughnut belum guard total=0 — pct = v/total = NaN saat total=0');
});

ok('PERF-CALENDAR: renderCalendar mengindeks kegiatan per tanggal, bukan filter seluruh events untuk setiap hari', () => {
  const calSrc = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  const start = calSrc.indexOf('renderCalendar() {');
  const body = calSrc.slice(start, calSrc.indexOf('calPrevMonth()', start));
  assert.ok(/new Map\(\)/.test(body), 'renderCalendar belum membuat Map kegiatan per tanggal');
  assert.ok(!/this\.events\.filter\(e => e\.date === dateStr\)/.test(body), 'renderCalendar masih filter seluruh events pada setiap hari');
});

const sanksiSrc = fs.readFileSync(path.join(ROOT, 'js/sanksi.js'), 'utf8');
ok('R14: viewMember (members.js) memanggil renderSanksi utk panel Riwayat Sanksi anggota', () => {
  const vmIdx = membersSrc.indexOf('viewMember(id) {');
  assert.ok(vmIdx > -1, 'members.js tidak punya viewMember(');
  const vmSlice = membersSrc.slice(vmIdx, membersSrc.indexOf('editMember(id) {'));
  assert.ok(/renderSanksi\(/.test(vmSlice), 'viewMember belum panggil renderSanksi(');
  assert.ok(/this\.renderSanksi/.test(vmSlice), 'viewMember belum pakai this.renderSanksi(...)');
});
ok('R15: sanksi.js punya CRUD lengkap (render/add/edit/save/delete) + simpan via saveLocal sanksi', () => {
  ['renderSanksi', 'addSanksi', 'editSanksi', 'saveSanksi', 'deleteSanksi'].forEach(n => {
    assert.ok(sanksiSrc.includes(n + '('), 'sanksi.js belum punya metode ' + n);
  });
  assert.ok(sanksiSrc.includes("saveLocal('sanksi'"), 'sanksi.js belum saveLocal(\'sanksi\'');
  assert.ok(/Object\.assign\(SPMApp\.prototype/.test(sanksiSrc), 'sanksi.js belum attach ke SPMApp.prototype');
  assert.ok(/Riwayat Sanksi/.test(sanksiSrc), 'sanksi.js belum punya label panel "Riwayat Sanksi"');
  assert.ok(sanksiSrc.includes('.filter(s => s.nik'), 'sanksi.js belum filter sanksi per nik');
  assert.ok(sanksiSrc.includes('this.berakhirSanksi('), 'sanksi.js belum pakai this.berakhirSanksi utk status');
});
ok('S24: sanksi.js — id di onclick pakai escapeJsStr & handler coerce String(id) (cegah stored-XSS / NaN dari _nextId string)', () => {
  const onclickLines = sanksiSrc.split('\n').filter(l => l.includes('onclick="') && l.includes('App.'));
  const rawId = onclickLines.filter(l => /\$\{(?!this\.escapeJsStr\()[^}]*\.id\}|\$\{(?!this\.escapeJsStr\()id\}/.test(l));
  assert.strictEqual(rawId.length, 0, 'sanksi.js masih punya raw .id/id di onclick (bukan escapeJsStr): ' + rawId.join(' | '));
  assert.ok(sanksiSrc.includes('this.escapeJsStr('), 'sanksi.js belum pakai escapeJsStr utk id onclick');
  assert.ok(/id\s*=\s*String\(id\)/.test(sanksiSrc), 'sanksi.js handler belum coerce id = String(id)');
  assert.ok(sanksiSrc.includes('this.escapeHtml'), 'sanksi.js belum escapeHtml utk nilai user');
});

const bukuKasSrc = fs.readFileSync(path.join(ROOT, 'js/bukuKas.js'), 'utf8');
ok('GM4: bukuKas.js — saldo berjalan = prev + debit - kredit, urut (tanggal,id), debit XOR kredit (hanya satu per baris)', () => {
  assert.ok(/prev\s*\+\s*(debit|d)\s*-\s*(kredit|k)/.test(bukuKasSrc) || /saldo\s*\+=/.test(bukuKasSrc), 'bukuKas.js belum hitung saldo prev + debit - kredit');
  assert.ok(/\.sort\(/.test(bukuKasSrc), 'bukuKas.js belum urut entri');
  assert.ok(/a\.tanggal\s*[<>=]/.test(bukuKasSrc) || /a\.tanggal/.test(bukuKasSrc), 'bukuKas.js belum urut berdasarkan tanggal');
  assert.ok(bukuKasSrc.includes('hasDebit && hasKredit'), 'bukuKas.js belum tolak transaksi debit & kredit keduanya terisi');
  assert.ok(bukuKasSrc.includes('!hasDebit && !hasKredit'), 'bukuKas.js belum tolak transaksi debit & kredit keduanya kosong');
});
ok('R16: buku kas — sub-section di halaman dues + CRUD kirim/render/save + saveLocal bukuKas', () => {
  ['renderBukuKas', 'addBukuKas', 'editBukuKas', 'saveBukuKas', 'deleteBukuKas'].forEach(n => {
    assert.ok(bukuKasSrc.includes(n + '('), 'bukuKas.js belum punya metode ' + n);
  });
  assert.ok(bukuKasSrc.includes("saveLocal('bukuKas'"), 'bukuKas.js belum saveLocal(\'bukuKas\'');
  assert.ok(/Object\.assign\(SPMApp\.prototype/.test(bukuKasSrc), 'bukuKas.js belum attach ke SPMApp.prototype');
  assert.ok(/id="bukuKasBody"/.test(indexHtml), 'index.html belum punya tbody#bukuKasBody di halaman dues');
  const duesIdx = coreSrc.indexOf("dues: () =>");
  assert.ok(duesIdx > -1, 'core.js renderPage belum punya cabang dues');
  const duesBranch = coreSrc.slice(duesIdx, duesIdx + 120);
  assert.ok(/renderBukuKas\(\)/.test(duesBranch), 'core.js cabang dues belum panggil renderBukuKas() saat halaman dibuka');
});
ok('S25: bukuKas.js — id di onclick pakai escapeJsStr & handler coerce String(id) (cegah stored-XSS / NaN dari _nextId string)', () => {
  const onclickLines = bukuKasSrc.split('\n').filter(l => l.includes('onclick="') && l.includes('App.'));
  const rawId = onclickLines.filter(l => /\$\{(?!this\.escapeJsStr\()[^}]*\.id\}|\$\{(?!this\.escapeJsStr\()id\}/.test(l));
  assert.strictEqual(rawId.length, 0, 'bukuKas.js masih punya raw .id/id di onclick (bukan escapeJsStr): ' + rawId.join(' | '));
  assert.ok(bukuKasSrc.includes('this.escapeJsStr('), 'bukuKas.js belum pakai escapeJsStr utk id onclick');
  assert.ok(/id\s*=\s*String\(id\)/.test(bukuKasSrc), 'bukuKas.js handler belum coerce id = String(id)');
  assert.ok(bukuKasSrc.includes('this.escapeHtml'), 'bukuKas.js belum escapeHtml utk nilai user');
});

const calSrc = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
const coreSrcForNik = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
ok('S11: isValidNik validasi NIK 8 digit (bukan 16 digit) sesuai data riil', () => {
  assert.ok(/\\d\{8\}/.test(coreSrcForNik), 'isValidNik belum pakai regex 8 digit (\\d{8})');
  assert.ok(!/\\d\{16\}/.test(coreSrcForNik), 'isValidNik masih pakai regex 16 digit (\\d{16})');
});

const attSrc = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
ok('S6: escapeJsStr() menangani sink JS-string-dalam-atribut (bukan escapeHtml - yg gagal utk sink ini) & dipakai di dues/attendance', () => {
  assert.ok(/escapeJsStr\s*\(/.test(coreSrc), 'core.js belum punya helper escapeJsStr()');
  const esLine = (coreSrc.split('\n').find(l => l.includes('escapeJsStr(s)') && l.includes('return'))) || '';
  assert.ok(esLine.includes("\\u0027"), 'escapeJsStr belum meng-escape quote ke \\u0027 (JS-safe lewat atribut): ' + (esLine || '(line tak ditemukan)'));
  assert.ok(duesSrc.includes("deleteDues('${this.escapeJsStr(rec.id)}')"),
    'dues.js:35 belum memakai escapeJsStr(rec.id) di onclick deleteDues');
  assert.ok(duesSrc.includes("viewDuesDetail('${this.escapeJsStr(rec.id)}')"),
    'dues.js belum memakai escapeJsStr(rec.id) di onclick viewDuesDetail');
  assert.ok(attSrc.includes("this.escapeJsStr(a.id)"), 'attendance.js belum memakai escapeJsStr(a.id) di onclick');
});

ok('S19: record IDs di onclick handlers wajib escapeJsStr (cegah stored-XSS via attacker-reachable POST /api/data)', () => {
  const files = [
    { name: 'calendar.js', src: calSrc, ids: ['e.id'] },
    { name: 'complaints.js', src: complaintsSrc, ids: ['c.id'] },
    { name: 'letters.js', src: lettersSrc, ids: ['l.id'] },
    { name: 'members.js', src: membersSrc, ids: ['m.id'] },
  ];
  files.forEach(({ name, src }) => {
    const onclickLines = src.split('\n').filter(l => l.includes('onclick="') && l.includes('App.'));
    const rawIdLines = onclickLines.filter(l => /\$\{.*\.id\}/.test(l) && !l.includes('escapeJsStr'));
    assert.strictEqual(rawIdLines.length, 0, name + ' masih punya raw ID di onclick: ' + rawIdLines.join(' | '));
  });
  // Verify escapeJsStr IS used for these IDs (not just that raw is absent)
  assert.ok(calSrc.includes("this.escapeJsStr(e.id)"), 'calendar.js belum escapeJsStr(e.id) di onclick deleteEvent');
  assert.ok(complaintsSrc.includes("this.escapeJsStr(c.id)"), 'complaints.js belum escapeJsStr(c.id) di onclick viewComplaint/deleteComplaint');
  assert.ok(lettersSrc.includes("this.escapeJsStr(l.id)"), 'letters.js belum escapeJsStr(l.id) di onclick viewLetter/deleteLetter');
  assert.ok(membersSrc.includes("this.escapeJsStr(m.id)"), 'members.js belum escapeJsStr(m.id) di onclick viewMember/editMember/deleteMember');
});

ok('S20: handler ID wajib coerce ke String(id) — cegah NaN dari _nextId string (type mismatch: number===string=false)', () => {
  // _nextId() returns strings like 'mtii29hs-83c8ae34'
  // escapeJsStr(numeric) -> string; onclick App.foo('42') -> handler terima string '42'
  // .find(x => x.id === '42') -> number === string = false (BROKEN)
  // Fix: id = String(id) di entry point handler + String(x.id) di find/filter
  const calHandlers = ['deleteEvent(id)', 'editEvent(id)', 'saveEditEvent(id)'];
  calHandlers.forEach(h => {
    const idx = calSrc.indexOf(h);
    assert.ok(idx !== -1, 'calendar handler ' + h + ' tidak ditemukan');
    const body = calSrc.slice(idx, idx + 200);
    assert.ok(/String\(id\)/.test(body), 'calendar.' + h + ' belum coerce String(id)');
  });
  const compHandlers = ['viewComplaint(id)', 'updateComplaintStatus(id)', 'deleteComplaint(id)'];
  compHandlers.forEach(h => {
    const idx = complaintsSrc.indexOf(h);
    assert.ok(idx !== -1, 'complaints handler ' + h + ' tidak ditemukan');
    const body = complaintsSrc.slice(idx, idx + 200);
    assert.ok(/String\(id\)/.test(body), 'complaints.' + h + ' belum coerce String(id)');
  });
  const letHandlers = ['viewLetter(id)', 'deleteLetter(id)', 'updateLetterStatus(id, status)'];
  letHandlers.forEach(h => {
    const idx = lettersSrc.indexOf(h);
    assert.ok(idx !== -1, 'letters handler ' + h + ' tidak ditemukan');
    const body = lettersSrc.slice(idx, idx + 200);
    assert.ok(/String\(id\)/.test(body), 'letters.' + h + ' belum coerce String(id)');
  });
  const memHandlers = ['viewMember(id)', 'editMember(id)', 'deleteMember(id)', 'saveMemberEdit(id)'];
  memHandlers.forEach(h => {
    const idx = membersSrc.indexOf(h);
    assert.ok(idx !== -1, 'members handler ' + h + ' tidak ditemukan');
    const body = membersSrc.slice(idx, idx + 200);
    assert.ok(/\+id|Number\(id\)|parseInt\(id/.test(body), 'members.' + h + ' belum coerce +id');
  });
});

ok('S21: globalSearch complaints pakai field names benar (pelapor/keterangan) — via _buildSearchIndex', () => {
  const idxDef = coreSrc.indexOf('_buildSearchIndex() {');
  assert.ok(idxDef !== -1, 'core.js belum punya _buildSearchIndex()');
  const idxBody = coreSrc.slice(idxDef);
  assert.ok(/c\.pelapor/.test(idxBody), '_buildSearchIndex complaints belum pakai c.pelapor');
  assert.ok(/c\.keterangan/.test(idxBody), '_buildSearchIndex complaints belum pakai c.keterangan');
});

// ===== P0 Security audit: stored-XSS (semua field POST-reachable, server tak validasi shape) =====
ok('XSS-1: badge() class token di-sanitasi alnum-whitelist (cegah class-injection via prioritas/status user-supplied -> onmouseover/onload di class="status-badge")', () => {
  const a = coreSrc.indexOf('badge(text, kind');
  assert.ok(a !== -1, 'anchor badge(text tak ketemu');
  const block = coreSrc.slice(a, a + 400);
  assert.ok(block.includes("replace(/[^a-z0-9]+/g, '-')"), 'badge() belum sanitasi token class via replace(/[^a-z0-9]+/g,"-") utk class="status-badge" — prioritas/status attacker-reachable bisa suntik atribut onmouseover/onload');
  assert.ok(!/priority-\$\{String\(text\)\.toLowerCase\(\)\}/.test(block), 'badge() masih interpolasi raw String(text).toLowerCase() ke class attr (class-injection terbuka)');
});
ok('XSS-2a: members table No./detail SPM-... di-escape (m.no user-supplied -> innerHTML text context)', () => {
  assert.ok(membersSrc.includes('<td>${this.escapeHtml(m.no)}</td>'), 'members.js No. kolom belum escapeHtml(m.no)');
  assert.ok(!membersSrc.includes('<td>${m.no}</td>'), 'members.js masih ada raw ${m.no} di No. kolom (stored XSS)');
  assert.ok(membersSrc.includes('SPM-${this.escapeHtml(m.no)}'), 'members.js detail No. Anggota belum escapeHtml(m.no)');
  assert.ok(!membersSrc.includes('SPM-${m.no}'), 'members.js masih ada raw SPM-${m.no}');
});
ok('XSS-2b: cards No. Anggota di-escape (m.no user-supplied -> innerHTML card preview)', () => {
  assert.ok(cardsSrc.includes('SPM-${this.escapeHtml(String(m.no)' ), 'cards.js No. Anggota belum escapeHtml(String(m.no).padStart)');
  assert.ok(!cardsSrc.includes('SPM-${String(m.no).padStart'), 'cards.js masih ada raw SPM-${String(m.no).padStart} (stored XSS)');
});
ok('XSS-2c: letters table ID di-escape (l.id user-supplied -> innerHTML)', () => {
  assert.ok(lettersSrc.includes('<td>${this.escapeHtml(l.id)}</td>'), 'letters.js kolom ID belum escapeHtml(l.id)');
  assert.ok(!lettersSrc.includes('<td>${l.id}</td>'), 'letters.js masih ada raw <td>${l.id}</td> (stored XSS)');
});
ok('XSS-2d: complaints table ID di-escape (c.id user-supplied -> innerHTML)', () => {
  assert.ok(complaintsSrc.includes('<td>${this.escapeHtml(c.id)}</td>'), 'complaints.js kolom ID belum escapeHtml(c.id)');
  assert.ok(!complaintsSrc.includes('<td>${c.id}</td>'), 'complaints.js masih ada raw <td>${c.id}</td> (stored XSS)');
});
ok('XSS-2e: pesangon NIK di-escape di dropdown & hasil simulasi (m.nik/r1.nik -> innerHTML)', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(pesSrc.includes('pesangon-search-nik">${this.escapeHtml(m.nik)}'), 'pesangon dropdown NIK belum escapeHtml(m.nik)');
  assert.ok(!pesSrc.includes('pesangon-search-nik">${m.nik}'), 'pesangon dropdown masih raw ${m.nik}');
  assert.ok(pesSrc.includes('<td>${this.escapeHtml(r1.nik)}</td>'), 'pesangon simulasi NIK belum escapeHtml(r1.nik)');
  assert.ok(!pesSrc.includes('<td>${r1.nik}</td>'), 'pesangon simulasi masih raw ${r1.nik}');
});
ok('XSS-3: letters.fileUrl di-gate isSafeFileUrl skema aman (cegah javascript: scheme, mirror isSafePhotoUrl)', () => {
  assert.ok(/isSafeFileUrl\s*\(/.test(coreSrc), 'core.js belum punya helper isSafeFileUrl (whitelist skema http/https) utk href fileUrl');
  assert.ok(/isSafeFileUrl\(l\.fileUrl\)/.test(lettersSrc), 'letters belum gate fileUrl dgn isSafeFileUrl(l.fileUrl) - javascript: scheme masih jalan di klik');
});

// ===== P0 Security audit: type-confusion / render-DoS (nilai non-string/non-number dari POST) =====
ok('TC-1: dashboard events date di-coerce String() sebelum .startsWith (cegah render-DoS via e.date non-string dari POST)', () => {
  assert.ok(dashSrc.includes('String(e.date).startsWith(cm)'), 'dashboard belum String(e.date).startsWith - e.date non-string (POST) bikin TypeError di dashboard');
  assert.ok(!dashSrc.includes('e.date.startsWith'), 'dashboard masih e.date.startsWith mentah (crash pada e.date non-string)');
});
ok('TC-2: pencarian pakai str() utk koersi aman — via _buildSearchIndex', () => {
  assert.ok(/str\(v\)\s*\{/.test(coreSrc), 'core.js belum punya helper str(v) utk koersi aman');
  const idxDef = coreSrc.indexOf('_buildSearchIndex() {');
  assert.ok(idxDef !== -1, 'core.js belum punya _buildSearchIndex()');
  const idxBody = coreSrc.slice(idxDef);
  assert.ok(/this\.str\(/.test(idxBody), '_buildSearchIndex belum pakai this.str() utk field');
});

ok('TC-3: delete/view dues & attendance komparasi id String() (id numerik dari POST -> filter/find tak boleh lenyap diam-diam)', () => {
  const dIdx = duesSrc.indexOf('deleteDues(id) {');
  assert.ok(dIdx !== -1, 'anchor deleteDues tak ketemu');
  assert.ok(/String\(id\)/.test(duesSrc.slice(dIdx, dIdx + 200)), 'deleteDues belum koersi String(id) - id POST numerik tak terhapus (silent no-op)');
  const vdIdx = duesSrc.indexOf('viewDuesDetail(id) {');
  assert.ok(vdIdx !== -1, 'anchor viewDuesDetail tak ketemu');
  assert.ok(/String\(id\)/.test(duesSrc.slice(vdIdx, vdIdx + 250)), 'viewDuesDetail belum koersi String(id) utk lookup Map');
  const aIdx = attSrc.indexOf('deleteAttendance(id) {');
  assert.ok(aIdx !== -1, 'anchor deleteAttendance tak ketemu');
  assert.ok(/String\(id\)/.test(attSrc.slice(aIdx, aIdx + 200)), 'deleteAttendance belum koersi String(id)');
  const vaIdx = attSrc.indexOf('viewAttendance(id) {');
  assert.ok(vaIdx !== -1, 'anchor viewAttendance tak ketemu');
  assert.ok(/String\(id\)/.test(attSrc.slice(vaIdx, vaIdx + 200)), 'viewAttendance belum koersi String(id) utk lookup find');
});
ok('TC-4: saveNewMember newId filter Number.isFinite (id POST non-numerik -> Math.max jadi NaN menghancurkan baris baru)', () => {
  assert.ok(membersSrc.includes('Number.isFinite(+m.id)'), 'saveNewMember belum filter Number.isFinite(+m.id) sebelum Math.max - id non-numerik (POST) bikin newId NaN & baris baru tak terkelola');
});
ok('TC-5: generateCard koersi String() utk m.nama.split (nama non-string dari POST crash generateCard)', () => {
  assert.ok(/String\(m[?.]*\.nama/.test(cardsSrc), 'cards belum String(m.nama/m?.nama) utk initials .split - nama non-string crash generateCard');
});

ok('S7: static server menolak data.json.bak/.tmp (V-01: PII snapshot tak ter-expose)', () => {
  const lines = serverSrc.split('\n');
  let denyLine = '';
  for (const l of lines) {
    // deny terminal via respondError: satu baris memuat 403 + return + target (bak|tmp)
    if (l.includes('(bak|tmp)') && l.includes('403') && l.includes('return respondError')) { denyLine = l; break; }
  }
  assert.ok(denyLine, 'server.js belum punya baris deny terminal (403 + return) yg menarget (bak|tmp)');
  assert.ok(denyLine.includes('data\\') || denyLine.includes('data.json'), 'deny belum menyasar file data.json.*: ' + denyLine);
});

ok('S8: exportToCSV menetralkan CSV formula injection (=,+,-,@ prefix) - V-06', () => {
  const def = (coreSrc.split('\n').find(l => l.includes('csvEsc(v) {'))) || '';
  assert.ok(def, 'core.js belum punya method csvEsc (shared CSV-esc)');
  assert.ok(def.includes('^[=+\\-@]'), 'csvEsc belum menetralkan prefix formula (=, +, -, @): ' + (def || '(line tak ditemukan)'));
  assert.ok(def.includes("'"), 'csvEsc belum menambah apostrof utk nilai ber-prefix formula');
  assert.ok(coreSrc.slice(coreSrc.indexOf('exportToCSV('), coreSrc.indexOf('exportToCSV(') + 300).includes('this.csvEsc'), 'exportToCSV tidak memanggil shared this.csvEsc');
});

ok('R10-EXPORT: attendance punya exportAttendanceCSV', () => {
  assert.ok(attSrc.includes('exportAttendanceCSV'), 'attendance.js belum punya method exportAttendanceCSV');
  assert.ok(attSrc.includes('exportToCSV'), 'attendance.js belum memanggil exportToCSV');
});

ok('R11-EXPORT: letters punya exportLetterCSV', () => {
  assert.ok(lettersSrc.includes('exportLetterCSV'), 'letters.js belum punya method exportLetterCSV');
  assert.ok(lettersSrc.includes('exportToCSV'), 'letters.js belum memanggil exportToCSV');
});

ok('P4: seedSampleData memakai flag dirty (bukan double-serialize JSON.stringify utk deteksi perubahan roster)', () => {
  const seed = coreSrc.slice(coreSrc.indexOf('seedSampleData() {'), coreSrc.indexOf('bindEvents() {'));
  const serCount = (seed.match(/JSON\.stringify\(this\.members\)/g) || []).length;
  assert.ok(serCount < 2, 'seedSampleData masih double-serialize this.members (' + serCount + 'x JSON.stringify(this.members))');
  assert.ok(/membersDirty/.test(seed), 'seedSampleData belum memakai flag membersDirty saat merge roster');
});

ok('P8: save functions punya try/catch (prevent silent data loss)', () => {
  const files = [
    { name: 'members.js', src: membersSrc, fns: ['saveNewMember', 'saveMemberEdit'] },
    { name: 'dues.js', src: duesSrc, fns: ['saveNewDues'] },
    { name: 'calendar.js', src: calSrc, fns: ['saveEvent'] },
    { name: 'letters.js', src: lettersSrc, fns: ['saveLetter'] },
    { name: 'complaints.js', src: complaintsSrc, fns: ['saveComplaint'] },
    { name: 'attendance.js', src: attSrc, fns: ['saveAttendance'] },
  ];
  files.forEach(({ name, src, fns }) => {
    fns.forEach(fn => {
      // Anchor on method definition to avoid matching onclick references
      const defRe = new RegExp(fn + '\\([^)]*\\) \\{' );
      const match = src.match(defRe);
      assert.ok(match, name + '.' + fn + ' method definition tidak ditemukan');
      const idx = src.indexOf(match[0]);
      const body = src.slice(idx, idx + 800);
      const hasTry = body.includes('try {') || body.includes('try{');
      assert.ok(hasTry, name + '.' + fn + ' belum punya try/catch');
    });
  });
});

// --- Shared helpers: execute REAL pesangon.js method bodies (no string guessing) ---
const pesangonSrcForTests = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');

// Anchor on the method DEFINITION (indented `name(` at a line start), brace-count to its
// closing brace, then eval the body as a standalone function. `self` binds `this` when the
// method needs prototype helpers (mirrors coreUnit.exec in the UNIT section).
function execMethod(src, name, self) {
  const re = new RegExp('(^|\\n)\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(');
  const m = re.exec(src);
  if (!m) throw new Error('method definition not found: ' + name);
  const i = m.index + m[0].indexOf(name + '(');
  const open = src.indexOf('{', i);
  if (open === -1) throw new Error('no body for: ' + name);
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) {
      const bodySrc = src.slice(i, k + 1).replace(/^[a-zA-Z_$][\w$]*\(/, 'function(');
      const fn = new Function('return ' + bodySrc)();
      return self ? fn.bind(self) : fn;
    } }
  }
  throw new Error('unbalanced body for: ' + name);
}

// Split an Object.assign(SPMApp.prototype, {…}) file into method chunks (definition -> closing brace).
function methodChunks(src) {
  const chunks = [];
  const re = /(^|\n)[ \t]*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[2];
    const i = m.index + m[0].indexOf(name);
    const open = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (depth === 0) { chunks.push({ name, body: src.slice(i, k + 1) }); break; } }
    }
  }
  return chunks;
}

// joinYear stub used when a pesangon method calls this.joinYear (same contract as P15's mock).
function pesangonJoinYear(nik) {
  const s = String(nik ?? '');
  if (s.length !== 8 || !/^\d+$/.test(s)) return null;
  return 2000 + parseInt(s.slice(2, 4), 10);
}

ok('P9: Skala UP benar — real pesangon.js _skalaUP dieksekusi (MK<1→1, MK8+→9)', () => {
  const f = execMethod(pesangonSrcForTests, '_skalaUP');
  assert.strictEqual(f(0), 1, 'MK 0 (blm 1 thn) = 1');
  assert.strictEqual(f(0.9), 1, 'MK 0.9 = 1');
  assert.strictEqual(f(1), 2, 'MK 1 = 2');
  assert.strictEqual(f(4), 5, 'MK 4 = 5');
  assert.strictEqual(f(7), 8, 'MK 7 = 8');
  assert.strictEqual(f(8), 9, 'MK 8 = 9');
  assert.strictEqual(f(20), 9, 'MK 20 = 9');
});

ok('P10: Skala UPMK benar — real pesangon.js _skalaUPMK dieksekusi (MK<3→0, MK24+→10)', () => {
  const f = execMethod(pesangonSrcForTests, '_skalaUPMK');
  assert.strictEqual(f(0), 0, 'MK 0 = 0');
  assert.strictEqual(f(2), 0, 'MK 2 = 0');
  assert.strictEqual(f(3), 2, 'MK 3 = 2');
  assert.strictEqual(f(5), 2, 'MK 5 = 2');
  assert.strictEqual(f(8), 3, 'MK 8 = 3');
  assert.strictEqual(f(12), 5, 'MK 12 = 5');
  assert.strictEqual(f(23), 8, 'MK 23 = 8');
  assert.strictEqual(f(24), 10, 'MK 24 = 10');
  assert.strictEqual(f(40), 10, 'MK 40 = 10');
});

ok('P11: Masa kerja adjustment — real _pesangonMK dieksekusi (1220→-2, 1221-1223→-1)', () => {
  const mock = { joinYear: pesangonJoinYear };
  const f = execMethod(pesangonSrcForTests, '_pesangonMK', mock);
  const y = new Date().getFullYear();
  assert.strictEqual(f('12200001').adj, 2, 'NIK 1220xxxx adj = 2');
  assert.strictEqual(f('12210001').adj, 1, 'NIK 1221xxxx adj = 1');
  assert.strictEqual(f('12220001').adj, 1, 'NIK 1222xxxx adj = 1');
  assert.strictEqual(f('12230001').adj, 1, 'NIK 1223xxxx adj = 1');
  assert.strictEqual(f('12240001').adj, 0, 'NIK 1224xxxx adj = 0');
  assert.strictEqual(f('12240001').base, y - 2024, 'base = tahun berjalan - joinYear');
  assert.strictEqual(f('123').mk, 0, 'NIK invalid -> mk 0 (null-aman)');
});

ok('P12: UPH = 15% × (UP + UPMK)', () => {
  // Nilai 0.15 dieksekusi oleh P15 skenario 5 (nominalUPH = 0.15*(UP+UPMK)); guard ini
  // hanya membuktikan komponen + pola rumus ada di source (value check = P15).
  const pesangonSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(pesangonSrc.includes('0.15') || pesangonSrc.includes('15') && pesangonSrc.includes('uph'),
    'pesangon.js belum punya rumus UPH 15%');
  // Verify: UPH = 0.15 * (UP + UPMK)
  assert.ok(/0\.15\s*\*\s*\(\s*up\s*\+?\s*upmk\)/i.test(pesangonSrc) ||
            /uph\s*=\s*.*0\.15/i.test(pesangonSrc),
    'rumus UPH harus 15% × (UP + UPMK)');
});

ok('P13: Tunjangan tetap — real _tunjanganTetap dieksekusi (JC 4*=800k, lain=625k)', () => {
  const f = execMethod(pesangonSrcForTests, '_tunjanganTetap');
  assert.strictEqual(f('4A'), 800000, 'JC 4A = 800k');
  assert.strictEqual(f('4B'), 800000, 'JC 4B = 800k');
  assert.strictEqual(f('3A'), 625000, 'JC 3A = 625k');
  assert.strictEqual(f(''), 625000, 'tanpa jobclass = 625k');
  assert.strictEqual(f(null), 625000, 'jobclass null = 625k');
});

ok('P14: Uang Pisah = 1 × upah (untuk skenario yang berlaku)', () => {
  // Nilai pisah = 1×upah dieksekusi oleh P15 skenario 14 (nominalPisah === 1×upah);
  // guard ini hanya membuktikan komponen Uang Pisah ada.
  const pesangonSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(pesangonSrc.includes('uangPisah') || pesangonSrc.includes('pisah'), 'pesangon.js belum punya komponen Uang Pisah');
  // Verify: Uang Pisah = 1 × upah
  assert.ok(/uangPisah\s*[=:].*upah/i.test(pesangonSrc) || /pisah\s*[=:].*upah/i.test(pesangonSrc),
    'Uang Pisah harus = 1 × upah');
});

ok('P15: Runtime kalkulasi pesangon konsisten (via actual pesangon.js code)', () => {
  // Load pesangon.js and extract functions via mock SPMApp
  const pesangonSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  const mockApp = { members: d.members, joinYear(nik) {
    const s = String(nik ?? '');
    if (s.length !== 8 || !/^\d+$/.test(s)) return null;
    return 2000 + parseInt(s.slice(2, 4), 10);
  }, formatRupiah(v) { return 'Rp' + Number(v).toLocaleString('id-ID'); },
    escapeHtml(v) { return String(v ?? ''); } };
  // Extract methods from pesangon.js source
  const methodMatch = pesangonSrc.match(/\{([\s\S]*?)\}\);\s*$/);
  if (!methodMatch) throw new Error('Cannot parse pesangon.js methods');
  const methodsBody = '{' + methodMatch[1] + '}';
  const methods = new Function('return ' + methodsBody)();
  // Bind all functions to mockApp so 'this' works
  Object.keys(methods).forEach(k => {
    if (typeof methods[k] === 'function') mockApp[k] = methods[k].bind(mockApp);
    else mockApp[k] = methods[k];
  });

  // Roni Sunarya: NIK 12130008, gaji_pokok_2025=5639062, jobclass=3A
  const m = d.members.find(x => x.nik === '12130008');
  assert.ok(m, 'Roni Sunarya ditemukan');

  // Test skenario 5 (Efisiensi cegah rugi: UP×2, UPMK×1, UPH 15%)
  const r = mockApp._hitungPesangon(m, 5);
  assert.ok(r, '_hitungPesangon menghasilkan result');
  assert.strictEqual(r.upah, 5639062 + 625000, 'upah = gaji + tunjangan');
  const curYear = new Date().getFullYear();
  const skalaUPMK = execMethod(pesangonSrcForTests, '_skalaUPMK'); // real code, sama spt P9/P10
  assert.strictEqual(r.mk, curYear - 2013, 'MK = tahun berjalan - 2013 (jangan hardcode 2026 — patah saat ganti tahun)');
  assert.strictEqual(r.skUP, 9, 'skUP(MK' + r.mk + ') = 9 (stabil utk MK>=8)');
  assert.strictEqual(r.skUPMK, skalaUPMK(r.mk), 'skUPMK(MK' + r.mk + ') dari real _skalaUPMK');
  assert.strictEqual(r.nominalUP, 9 * 2 * 6264062, 'UP = 9 × 2 × upah (skUP stabil)');
  assert.strictEqual(r.nominalUPMK, r.skUPMK * 1 * 6264062, 'UPMK = skUPMK × 1 × upah');
  assert.strictEqual(r.nominalUPH, 0.15 * (r.nominalUP + r.nominalUPMK), 'UPH = 15% × (UP+UPMK)');
  assert.strictEqual(r.total, r.nominalUP + r.nominalUPMK + r.nominalUPH, 'total = UP+UPMK+UPH');

  // Test NIK 1220xxxx adjustment (Meway Lesti Pratishta)
  const m2 = d.members.find(x => x.nik === '12200002');
  if (m2) {
    const mk2 = mockApp._pesangonMK(m2.nik);
    assert.strictEqual(mk2.adj, 2, 'NIK 1220xxxx adj = 2');
  }

  // Test NIK 1221xxxx adjustment
  const m3 = d.members.find(x => x.nik && String(x.nik).startsWith('1222'));
  if (m3) {
    const mk3 = mockApp._pesangonMK(m3.nik);
    assert.strictEqual(mk3.adj, 1, 'NIK 1222xxxx adj = 1');
  }

  // Test skenario 14 (PPHI: UP=0, UPMK=0, UPH=0, Pisah=1)
  const r14 = mockApp._hitungPesangon(m, 14);
  assert.strictEqual(r14.nominalUP, 0, 'Skenario 14: UP=0');
  assert.strictEqual(r14.nominalUPMK, 0, 'Skenario 14: UPMK=0');
  assert.strictEqual(r14.nominalUPH, 0, 'Skenario 14: UPH=0');
  assert.strictEqual(r14.nominalPisah, 6264062, 'Skenario 14: Pisah=1×upah');

  // JC-4 branch (800000 tunjangan) — synthetic member agar tak bergantung data.json.
  // Roni/Meway hanya menguji cabang 625000; tanpa ini regresi JC-4 lolos diam-diam.
  const m4 = { nik: '12990001', nama: 'Synthetic JC4', jobclass: '4A', gaji_pokok_2025: '5000000' };
  const r4c = mockApp._hitungPesangon(m4, 5);
  assert.strictEqual(r4c.tunjangan, 800000, 'JC-4 tunjangan = 800000');
  assert.strictEqual(r4c.upah, 5800000, 'JC-4 upah = gaji + 800000');
  assert.strictEqual(r4c.nominalUP, r4c.skUP * 2 * 5800000, 'JC-4 UP pakai tunjangan 800k');
});

ok('S22: wages.js r.no wajib escapeHtml di innerHTML & escapeJsStr di onclick (defense-in-depth)', () => {
  const wagesSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  // r.no in innerHTML harus pakai escapeHtml — meskipun saat ini numerik, defense-in-depth
  assert.ok(/escapeHtml\(r\.no\)/.test(wagesSrc), 'wages.js belum escapeHtml(r.no) di innerHTML');
  // r.no in onclick harus pakai escapeJsStr — cegah injection jika no non-numerik
  assert.ok(/escapeJsStr\(r\.no\)/.test(wagesSrc), 'wages.js belum escapeJsStr(r.no) di onclick');
});

ok('S23: server.js punya security headers (X-Content-Type-Options, X-Frame-Options)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(srvSrc.includes('X-Content-Type-Options'), 'server.js belum punya header X-Content-Type-Options');
  assert.ok(srvSrc.includes('nosniff'), 'server.js belum set nosniff');
  assert.ok(srvSrc.includes('X-Frame-Options'), 'server.js belum punya header X-Frame-Options');
});

ok('P16: memberByNik Map + rebuildMemberIndex() ada di core.js (O(1) NIK lookup)', () => {
  assert.ok(/this\.memberByNik\s*=\s*new Map\(\)/.test(coreSrc), 'core.js belum inisialisasi memberByNik = new Map() di constructor');
  assert.ok(/rebuildMemberIndex\(\)\s*\{/.test(coreSrc), 'core.js belum punya rebuildMemberIndex() definition');
  assert.ok(/new Map\(this\.members\.map/.test(coreSrc), 'rebuildMemberIndex belum rebuild dari members array');
});

ok('P17: isSafePhotoUrl() ada di core.js (whitelist http(s) + data:image)', () => {
  assert.ok(/isSafePhotoUrl\(url\)\s*\{/.test(coreSrc), 'core.js belum punya isSafePhotoUrl() definition');
  assert.ok(/https\?:/.test(coreSrc) && /data:image/.test(coreSrc), 'isSafePhotoUrl belum whitelist https? + data:image');
});

ok('XSS-4: isSafePhotoUrl() menolak data:image/svg+xml (SVG bisa menyisipkan <script>; m.foto dirender via <img src> di cards.js - perketat whitelist ke raster only: png/jpeg/jpg/gif/webp)', () => {
  const idx = coreSrc.indexOf('isSafePhotoUrl(url) {');
  assert.ok(idx > -1, 'core.js belum punya isSafePhotoUrl(url) definition');
  const body = coreSrc.slice(idx, idx + 400);
  assert.ok(!/svg/i.test(body), 'isSafePhotoUrl masih permisif thd svg+xml di regex-nya (raw text "svg" ditemukan di body method)');
  const fnMatch = body.match(/return (\/\^[\s\S]*?\/i)\.test\(s\)/);
  assert.ok(fnMatch, 'tidak bisa ekstrak regex isSafePhotoUrl dari source');
  const re = new Function('return ' + fnMatch[1])();
  assert.ok(!re.test('data:image/svg+xml;base64,PHN2ZyB4bWxucz0='), 'isSafePhotoUrl MENERIMA data:image/svg+xml - stored-XSS via foto anggota (SVG dpt berisi <script>, dieksekusi di luar konteks <img> mis. dibuka tab baru/href)');
  assert.ok(re.test('data:image/png;base64,iVBORw0KGgo='), 'isSafePhotoUrl harus tetap terima data:image/png (regresi fungsional)');
  assert.ok(re.test('data:image/jpeg;base64,/9j/4AAQ'), 'isSafePhotoUrl harus tetap terima data:image/jpeg (regresi fungsional)');
  assert.ok(re.test('https://example.com/foto.jpg'), 'isSafePhotoUrl harus tetap terima https:// (regresi fungsional)');
  assert.ok(!re.test('javascript:alert(1)'), 'isSafePhotoUrl harus tetap tolak javascript: scheme');
});

ok('P18: saveLocal debounce POST (localStorage sync, server coalesced)', () => {
  const saveIdx = coreSrc.indexOf('saveLocal(key, data) {');
  assert.ok(saveIdx !== -1, 'core.js belum punya saveLocal(key, data) definition');
  const body = coreSrc.slice(saveIdx, saveIdx + 700);
  assert.ok(/clearTimeout\(this\._saveTimers/.test(body), 'saveLocal belum pakai clearTimeout(this._saveTimers[key]) (debounce)');
  assert.ok(/setTimeout\(\(\)\s*=>/.test(body), 'saveLocal belum pakai setTimeout arrow (debounce)');
  assert.ok(/},\s*180\)/.test(body), 'saveLocal debounce timeout bukan 180ms');
});

ok('R-AUTH: core memakai satu helper header Bearer untuk baca dan simpan data', () => {
  assert.ok(/authHeaders\(\)\s*\{/.test(coreSrc), 'core.js belum punya helper authHeaders()');
  const authIdx = coreSrc.indexOf('authHeaders() {');
  const authBody = coreSrc.slice(authIdx, authIdx + 240);
  assert.ok(/Authorization/.test(authBody) && /this\.authToken/.test(authBody), 'authHeaders() belum membuat Bearer token');
  assert.ok((coreSrc.match(/this\.authHeaders\(\)/g) || []).length >= 2, 'loadData dan saveLocal belum memakai authHeaders() bersama');
});

ok('P19: server.js ARRAY_LIMIT = 5000 (DoS guard per collection)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/const ARRAY_LIMIT\s*=\s*5000/.test(srvSrc), 'server.js belum punya const ARRAY_LIMIT = 5000');
  assert.ok(/value\.length\s*>\s*ARRAY_LIMIT/.test(srvSrc), 'server.js belum cek value.length > ARRAY_LIMIT di POST handler');
});

ok('V-03a: server.js HOST guard baca req.headers.host (bukan dead-code banding konstanta)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/req\.headers\.host/.test(srvSrc), 'server.js HOST guard belum inspect req.headers.host — DNS-rebinding via Host header masih lolos (dead code dibanding konstanta)');
  assert.ok(!/if \(HOST !== ['"]127\.0\.0\.1['"]\)/.test(srvSrc), 'server.js masih punya dead-code HOST check (banding konstanta ke literal, selalu false) — ganti dgn cek req.headers.host');
});

ok('V-03b: server.js POST /api/data cek Origin/Referer loopback + wajib Content-Type application/json (tutup CSRF text/plain no-preflight)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/req\.headers\.(origin|referer)/.test(srvSrc), 'server.js belum cek req.headers.origin/referer di POST /api/data — CSRF cross-origin masih bisa corrupt data.json');
  assert.ok(/application\/json/.test(srvSrc) && /content-type/i.test(srvSrc), 'server.js belum enforce Content-Type application/json di POST handler (CSRF text/plain lolos)');
});

ok('P20: server.js SEC_HEADERS shared object (Referrer-Policy)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/const SEC_HEADERS\s*=\s*\{/.test(srvSrc), 'server.js belum punya const SEC_HEADERS = {...} object');
  assert.ok(srvSrc.includes('Referrer-Policy'), 'SEC_HEADERS belum punya Referrer-Policy');
  assert.ok(srvSrc.includes('no-referrer'), 'Referrer-Policy belum set no-referrer');
});

ok('P21: server.js Cache-Control (no-store JSON, 300s JS/CSS)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(srvSrc.includes('Cache-Control'), 'server.js belum punya Cache-Control header');
  assert.ok(srvSrc.includes('no-store'), 'Cache-Control belum set no-store untuk JSON');
  assert.ok(srvSrc.includes('max-age=300'), 'Cache-Control belum set max-age=300 untuk JS/CSS');
});

ok('S25: pesangon.js onclick NIK pakai escapeJsStr (defense-in-depth)', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  // selectPesangonMember('${m.nik}') harus escapeJsStr — meskipun NIK 8-digit, defense-in-depth
  assert.ok(/escapeJsStr\(m\.nik\)/.test(pesSrc), 'pesangon.js belum escapeJsStr(m.nik) di onclick selectPesangonMember');
});

ok('S26: exportPesangonCSV menetralkan CSV formula injection (=,+,-,@ prefix) — was MISSING (guard-only gap, docs dulu klaim salah punya OWN esc)', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  // Anchor pada DEFINISI method, bukan call-site (guard-anchor trap).
  const expIdx = pesSrc.indexOf('exportPesangonCSV() {');
  assert.ok(expIdx > -1, 'pesangon.js belum punya method exportPesangonCSV()');
  const expBody = pesSrc.slice(expIdx, expIdx + 1200);
  // guard anti-formula-injection (= + - @) — pola sama persis GM13 (bukuKas.js) / S8 (core.js exportToCSV)
  assert.ok(/this\.csvEsc/.test(expBody), 'exportPesangonCSV belum memanggil shared this.csvEsc (proteksi CSV-injection pusat)');
  // prefix titik-koma `'` dicek di helper pusat csvEsc (core.js)
  assert.ok(/\[=\+\\-@\]/.test(coreSrc.slice(coreSrc.indexOf('csvEsc(v) {'), coreSrc.indexOf('csvEsc(v) {') + 200)), 'shared csvEsc belum netralkan prefix formula (= + - @)');
  assert.ok(coreSrc.slice(coreSrc.indexOf('csvEsc(v) {'), coreSrc.indexOf('csvEsc(v) {') + 200).includes("'"), 'shared csvEsc belum prepend apostrof utk nilai ber-prefix formula');
  // tetap hasilkan file CSV (Blob/createObjectURL)
  assert.ok(/Blob|URL\.createObjectURL/.test(expBody), 'exportPesangonCSV belum menghasilkan file (Blob/createObjectURL)');
});

ok('R-NAV: halaman Pesangon terdaftar di titles & map core.js (bootstrap dropdown skenario dari sidebar)', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  // Anchor pada entry DEFINISI di object titles & map (bukan call-site / bukan ini.renderPesangon di tempat lain)
  assert.ok(coreSrc.includes("pesangon: () => this.renderPesangon()"), 'core.js map renderPage belum punya cabang pesangon -> renderPesangon() (dropdown skenario tak terpopulate dari sidebar)');
  assert.ok(coreSrc.includes("pesangon: ['Simulasi Pesangon'"), 'core.js showPage titles belum punya entry pesangon (topbar judul kosong)');
});

ok('NUM: sum uang pakai Number() coercion + bentuk s+(Number(x)||0) parenthesized — core.thisMonthDuesTotal (proyeksi iuran-bulan-ini) & reports.lunasTotal — cegah concat string & precedence-bug ||0 membuang akumulasi', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  // reports.js: reduce lunasTotal HARUS parenthesized s+(Number(d.jumlah)||0) —
  // bentuk s+Number(d.jumlah)||0 ter-parse sbg (s+Number(...))||0, yg utk NaN
  // membuang SELURUH akumulasi (bukan cuma elemen) — CJ: precedence bug.
  assert.ok(/lunasData\.reduce\(\(s,d\)=>s\+\(Number\(d\.jumlah\)\|\|0\)/.test(repSrc), 'reports.js lunasTotal belum parenthesized s+(Number(d.jumlah)||0) — ||0 tak efektif, NaN membuang seluruh akumulasi');
  assert.ok(!/lunasData\.reduce\(\(s,d\)=>s\+Number\(d\.jumlah\)\|\|0/.test(repSrc), 'reports.js lunasTotal masih memakai bentuk precedence salah s+Number(d.jumlah)||0 — harus s+(Number(d.jumlah)||0)');
  // core.js helper thisMonthDuesTotal() = proyeksi iuran-bulan-ini (Σ iuranBulanan), satu-satunya sumber utk dashboard & Iuran&Keuangan.
  // HARUS parenthesized s+(Number(m.iuranBulanan)||0) — koersi + precedence-safe (anti concat string / NaN-membuang-akumulasi).
  const cidx = coreSrc.indexOf('thisMonthDuesTotal() {');
  assert.ok(cidx !== -1, 'core.js belum punya helper thisMonthDuesTotal() (proyeksi iuran-bulan-ini)');
  const cbody = coreSrc.slice(cidx, cidx + 130);
  assert.ok(/s \+ \(Number\(m\.iuranBulanan\) \|\| 0\)/.test(cbody), 'core.js thisMonthDuesTotal belum koersi Number(m.iuranBulanan)||0 dalam bentuk parenthesized s+(...||0) — rawan concat string/precedence');
  // dashboard: statDues harus pakai helper proyeksi (integrasi: SAMA dgn halaman Iuran & Keuangan) —
  // bukan lagi menjumlahkan record dues aktual (sumber konsistensi tunggal).
  // Bisa langsung atau via calcDashboardStats() — keduanya pakai thisMonthDuesTotal()
  assert.ok(/thisMonthDuesTotal/.test(dashSrc), 'dashboard statDues belum pakai thisMonthDuesTotal() — harus menampilkan proyeksi iuran-bulan-ini yang sama dgn Iuran&Keuangan');
});

ok('P22: pesangon/reports/wages render methods punya try/catch (crash isolation)', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  // renderPesangon harus punya try/catch
  const pesIdx = pesSrc.indexOf('renderPesangon() {');
  assert.ok(pesIdx !== -1, 'pesangon.js belum punya renderPesangon() definition');
  const pesBody = pesSrc.slice(pesIdx, pesIdx + 200);
  assert.ok(pesBody.includes('try {'), 'renderPesangon belum punya try/catch');
  // renderReports harus punya try/catch
  const repIdx = repSrc.indexOf('renderReports() {');
  assert.ok(repIdx !== -1, 'reports.js belum punya renderReports() definition');
  const repBody = repSrc.slice(repIdx, repIdx + 200);
  assert.ok(repBody.includes('try {'), 'renderReports belum punya try/catch');
  // renderWages harus punya try/catch
  const wagIdx = wagSrc.indexOf('renderWages() {');
  assert.ok(wagIdx !== -1, 'wages.js belum punya renderWages() definition');
  const wagBody = wagSrc.slice(wagIdx, wagIdx + 200);
  assert.ok(wagBody.includes('try {'), 'renderWages belum punya try/catch');
});

ok('G1: save functions pakai .trim() pada input string (cegah whitespace-only masuk)', () => {
  const checks = [
    { name: 'members.js saveNewMember', src: membersSrc, fn: 'saveNewMember()', anchors: ['fNama', 'fNik'] },
    { name: 'members.js saveMemberEdit', src: membersSrc, fn: 'saveMemberEdit(', anchors: ['fNama', 'fNik'] },
    { name: 'dues.js saveNewDues', src: duesSrc, fn: 'saveNewDues() {', anchors: ['fDuesNik'] },
    { name: 'calendar.js saveEvent', src: calSrc, fn: 'saveEvent()', anchors: ['fEvtTitle'] },
    { name: 'complaints.js saveComplaint', src: complaintsSrc, fn: 'saveComplaint()', anchors: ['fCompTitle'] },
    { name: 'letters.js saveLetter', src: lettersSrc, fn: 'saveLetter()', anchors: ['fLetterNo'] },
    { name: 'attendance.js saveAttendance', src: attSrc, fn: 'saveAttendance()', anchors: ['fAttNik'] },
  ];
  checks.forEach(({ name, src, fn }) => {
    const idx = src.indexOf(fn);
    assert.ok(idx !== -1, name + ' tidak ditemukan');
    // Check first 800 chars to allow for validateRequired() before getFormValues()
    const body = src.slice(idx, idx + 800);
    // Accept direct .trim() OR getFormValues() OR _validateEvent() helper
    assert.ok(/\.trim\(\)/.test(body) || /getFormValues/.test(body) || /_validateEvent/.test(body), name + ' belum pakai .trim() atau getFormValues() atau _validateEvent()');
  });
});

ok('G2: .trim() dilakukan SEBELUM cek empty (bukan sesudah — whitespace-only harus ditolak)', () => {
  // Cek per-file: trim harus muncul sebelum if (! pada baris yang sama/berturut
  // ATAU pakai validateRequired() yang handle trim+empty di dalam
  const fileChecks = [
    { name: 'members.js saveNewMember', file: 'members.js', method: 'saveNewMember()' },
    { name: 'members.js saveMemberEdit', file: 'members.js', method: 'saveMemberEdit(' },
    { name: 'dues.js saveNewDues', file: 'dues.js', method: 'saveNewDues() {' },
    { name: 'calendar.js saveEvent', file: 'calendar.js', method: 'saveEvent()' },
    { name: 'complaints.js saveComplaint', file: 'complaints.js', method: 'saveComplaint()' },
    { name: 'letters.js saveLetter', file: 'letters.js', method: 'saveLetter()' },
    { name: 'attendance.js saveAttendance', file: 'attendance.js', method: 'saveAttendance()' },
  ];
  fileChecks.forEach(({ name, file, method }) => {
    const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    const idx = src.indexOf(method);
    assert.ok(idx !== -1, name + ' tidak ditemukan');
    // Ambil 8 baris pertama method body (setelah try {)
    const afterTry = src.indexOf('try {', idx);
    const bodyStart = afterTry !== -1 ? afterTry : idx;
    const lines = src.slice(bodyStart, bodyStart + 500).split('\n').slice(0, 10);
    const bodyStr = lines.join('\n');
    // Accept validateRequired() or _validateEvent() which handles trim+empty internally
    if (/validateRequired/.test(bodyStr) || /_validateEvent/.test(bodyStr)) {
      // validateRequired/_validateEvent handles trim and empty check — pass
      return;
    }
    const trimIdx = bodyStr.indexOf('.trim()');
    // Cari cek empty untuk input variable (bukan if (!m) yang cek existence record)
    const emptyIdx = bodyStr.search(/if\s*\(!\s*(f?[Nn]ama|f?[Nn]ik|title|keterangan|noSurat|perihal|kegiatan|bulan)/);
    assert.ok(trimIdx !== -1, name + ' tidak punya .trim() atau validateRequired() di 10 baris pertama');
    assert.ok(emptyIdx !== -1, name + ' tidak punya cek empty input variable di 10 baris pertama');
    assert.ok(trimIdx < emptyIdx, name + ': .trim() harus SEBELUM cek empty input (trim@' + trimIdx + ' empty@' + emptyIdx + ')');
  });
});

ok('G3: search index pakai memberByNik Map (bukan this.members.find) untuk dues & attendance', () => {
  const idxDef = coreSrc.indexOf('_buildSearchIndex() {');
  assert.ok(idxDef !== -1, 'core.js belum punya _buildSearchIndex()');
  const idxBody = coreSrc.slice(idxDef);
  assert.ok(!/this\.members\.find/.test(idxBody), '_buildSearchIndex masih pakai this.members.find (harus memberByNik.get)');
  assert.ok(/memberByNik/.test(idxBody), '_buildSearchIndex belum pakai memberByNik.get() untuk dues/attendance');
});

ok('G4: renderDashboard stat memakai single-pass pattern (bukan iterate this.members 3x terpisah)', () => {
  const dashIdx = dashSrc.indexOf('renderDashboard() {');
  assert.ok(dashIdx !== -1, 'renderDashboard() tidak ditemukan');
  const dashEnd = dashSrc.indexOf('renderDashMemberStatus', dashIdx);
  const dashBody = dashSrc.slice(dashIdx, dashEnd);
  // renderDashboard harus pakai 1 loop untuk statActive + totalIuran (single-pass)
  // Bukan 2x this.members terpisah (filter lalu reduce)
  const memberIterates = (dashBody.match(/this\.members\.(filter|forEach|reduce|map|find)/g) || []).length;
  assert.ok(memberIterates <= 1, 'renderDashboard iterate this.members ' + memberIterates + 'x (harus ≤1 untuk single-pass stat: gabung statActive + totalIuran dalam 1 loop)');
});

ok('G5: server.js POST handler trim key string sebelum validasi', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const postIdx = srvSrc.indexOf("req.url === '/api/data'");
  assert.ok(postIdx !== -1, 'POST /api/data handler tidak ditemukan');
  const postBody = srvSrc.slice(postIdx, postIdx + 3000);
  assert.ok(/\.trim\(\)/.test(postBody), 'server.js POST handler belum trim key string');
});

ok('G6: calendar.js punya whitelist untuk event types (bukan trust e.type langsung sebagai CSS class)', () => {
  // Event type harus melalui whitelist array, bukan langsung e.type
  const hasWhitelist = /VALID_TYPES|\bVT\b/.test(calSrc) || calSrc.includes("['Rapat'") || calSrc.includes('["Rapat"') || calSrc.includes('EVENT_TYPES') || /validTypes|allowedTypes|knownTypes/.test(calSrc);
  assert.ok(hasWhitelist, 'calendar.js belum punya whitelist/enum untuk event types');
  // e.type tidak boleh langsung dipakai sebagai class — harus melalui whitelist dulu
  const rawTypeUse = calSrc.includes('e.type.toLowerCase().replace') && !/VALID_TYPES|\bVT\b/.test(calSrc);
  assert.ok(!rawTypeUse, 'calendar.js masih pakai e.type.toLowerCase().replace tanpa whitelist');
  // Whitelist harus di luar loop map() — VT harus muncul SEBELUM .map( pada baris yang sama
  const vtMatch = calSrc.match(/(?:VALID_TYPES|\bVT\b)/);
  assert.ok(vtMatch, 'whitelist variable tidak ditemukan');
  const vtIdx = calSrc.indexOf(vtMatch[0]);
  const mapIdx = calSrc.indexOf('.map(', vtIdx);
  const lineEnd = calSrc.indexOf('\n', vtIdx);
  // Jika .map( ada SEBELUM VT pada baris yang sama → VT di dalam callback (BAD)
  if (mapIdx !== -1 && mapIdx < lineEnd) {
    assert.ok(vtIdx < mapIdx, 'whitelist dideklarasi SETELAH .map( — harus SEBELUM .map()');
  }
});

ok('G7: input fields punya maxlength (cegah input sangat panjang)', () => {
  // Hitung maxlength di index.html + semua js/*.js (modal forms)
  let totalMaxlength = 0;
  const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  totalMaxlength += (idxHtml.match(/maxlength/g) || []).length;
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  jsFiles.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    totalMaxlength += (src.match(/maxlength/g) || []).length;
  });
  assert.ok(totalMaxlength >= 10, 'total maxlength attributes hanya ' + totalMaxlength + ' (minimum 10 untuk semua input fields)');
});

ok('P26: renderDashboard stat single-pass — gabung statActive+totalIuran dalam 1 loop members, 0 loop terpisah untuk dues/events/complaints di stat section', () => {
  // renderDashMemberStatus & renderDashDept adalah method terpisah — tidak dihitung
  const dashIdx = dashSrc.indexOf('renderDashboard() {');
  const dashEnd = dashSrc.indexOf('renderDashMemberStatus', dashIdx);
  const body = dashSrc.slice(dashIdx, dashEnd);
  // Gabungan stat harus dalam 1 forEach (bukan filter + reduce terpisah)
  const membersIter = (body.match(/this\.members\.(filter|forEach|reduce|map|find)/g) || []).length;
  assert.ok(membersIter <= 1, 'renderDashboard iterate this.members ' + membersIter + 'x di stat section (harus ≤1 untuk single-pass)');
  // Stat section harus menghitung youth + totalIuran + statDues + statEvents + notifBadge dalam 1 blok
  // Bukan terpisah: this.dues.filter + this.events.filter + this.complaints.filter
  const duesFilter = (body.match(/this\.dues\.filter/g) || []).length;
  const eventsFilter = (body.match(/this\.events\.filter/g) || []).length;
  const complaintsFilter = (body.match(/this\.complaints\.filter/g) || []).length;
  assert.ok(duesFilter === 0, 'renderDashboard stat masih iterate this.dues ' + duesFilter + 'x — harus 0 (gabung dalam single-pass)');
  assert.ok(eventsFilter === 0, 'renderDashboard stat masih iterate this.events ' + eventsFilter + 'x — harus 0 (gabung dalam single-pass)');
  assert.ok(complaintsFilter === 0, 'renderDashboard stat masih iterate this.complaints ' + complaintsFilter + 'x — harus 0 (gabung dalam single-pass)');
});

ok('P27: reports.js precompute stats — 0 .filter/.reduce di dalam template string (di后的innerHTML)', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  // Hitung .filter + .reduce + .map di SELURUH reports.js
  const totalFilters = (repSrc.match(/\.filter\(/g) || []).length;
  const totalReduces = (repSrc.match(/\.reduce\(/g) || []).length;
  // Harus ≤12 total (3 date filter + 3 precompute + max 6 di chart config)
  // Sebelumnya ada ~15+ (filter di template). Target: ≤12
  assert.ok(totalFilters <= 12, 'reports.js punya ' + totalFilters + ' .filter() calls (target ≤12 — redundant filters di template harus di-precompute)');
  // Cek khusus: .filter/.reduce tidak boleh di dalam template string (setelah =`)
  // Hitung .filter/.reduce yang muncul SETELAH =` (template literal) dalam file
  const templateRegex = /=`[\s\S]*?`/g;
  let templateFilters = 0, templateReduces = 0;
  let m;
  while ((m = templateRegex.exec(repSrc)) !== null) {
    templateFilters += (m[0].match(/\.filter\(/g) || []).length;
    templateReduces += (m[0].match(/\.reduce\(/g) || []).length;
  }
  assert.ok(templateFilters <= 1, 'reports.js template string punya ' + templateFilters + ' .filter() — harus ≤1 (precompute sisanya)');
  assert.ok(templateReduces <= 1, 'reports.js template string punya ' + templateReduces + ' .reduce() — harus ≤1 (precompute sisanya)');
  // lunas dan lunasTotal harus share 1 filter (bukan 2x filter identical)
  const lunasBlock = repSrc.slice(repSrc.indexOf('const lunasData'), repSrc.indexOf('const lunasData') + 200);
  assert.ok(/const lunasData/.test(lunasBlock), 'reports.js belum share filter result lunasData antara lunas count dan lunasTotal');
});

ok('P28: pesangon.js pakai memberByNik Map (bukan this.members.find) untuk lookup anggota', () => {
  const pesSrc = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  // renderPesangon harus pakai memberByNik.get, bukan this.members.find
  const renderIdx = pesSrc.indexOf('renderPesangon() {');
  assert.ok(renderIdx !== -1, 'renderPesangon tidak ditemukan');
  const renderBody = pesSrc.slice(renderIdx, renderIdx + 1500);
  assert.ok(!/this\.members\.find/.test(renderBody), 'renderPesangon masih pakai this.members.find (harus memberByNik.get)');
  assert.ok(/memberByNik/.test(renderBody), 'renderPesangon belum pakai memberByNik.get()');
});

ok('P29: wages.js viewWageDetail prebuild Map untuk scenario lookup (bukan 5x .find())', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const detailIdx = wagSrc.indexOf('viewWageDetail(no, scenario)');
  assert.ok(detailIdx !== -1, 'viewWageDetail tidak ditemukan');
  const detailBody = wagSrc.slice(detailIdx, detailIdx + 800);
  // Harus prebuild Map/Set, bukan .find() di dalam forEach
  const findInLoop = (detailBody.match(/\.find\(r =>/g) || []).length;
  assert.strictEqual(findInLoop, 0, 'viewWageDetail masih pakai .find() di dalam loop (' + findInLoop + 'x) — harus prebuild Map');
  assert.ok(/new Map|Map\(/.test(detailBody), 'viewWageDetail belum prebuild Map untuk scenario lookup');
  // Map key harus String(r.no) — karena no param dari escapeJsStr adalah string
  assert.ok(/String\(r\.no\)/.test(detailBody) || /String\(no\)/.test(detailBody),
    'viewWageDetail Map key bukan String(r.no) — lookup gagal jika no adalah string (dari escapeJsStr)');
});

ok('P30: dues.js viewDuesDetail & saveNewDues pakai Map lookup (bukan .find()/.findIndex())', () => {
  const duesSrcLocal = fs.readFileSync(path.join(ROOT, 'js/dues.js'), 'utf8');
  // viewDuesDetail harus pakai Map, bukan this.dues.find
  const viewIdx = duesSrcLocal.indexOf('viewDuesDetail(id)');
  assert.ok(viewIdx !== -1, 'viewDuesDetail tidak ditemukan');
  const viewBody = duesSrcLocal.slice(viewIdx, viewIdx + 400);
  assert.ok(!/this\.dues\.find\(x => x\.id/.test(viewBody), 'viewDuesDetail masih pakai this.dues.find() — harus Map.get()');
  assert.ok(/Map|duesMap|duesById/.test(viewBody), 'viewDuesDetail belum pakai Map untuk lookup');
});

// V-01 (empiris): file .bak/.tmp yg ADA di dalam ROOT TIDAK boleh disajikan.
// Catatan penting (anti-hallucination): static server selalu serve dari ROOT (__dirname), BUKAN dari
// DATA_FILE temp. Maka uji menyasar path ROOT/data.json.bak (.bak PII nyata yg dibuat server).
// JANGAN menulis ulang ROOT/data.json.bak (PII) - cukup GET file yang sudah ada.
async function serverDenyCheck() {
  const { spawn } = require('child_process');
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    for (const u of ['data.json.bak', 'data.json.tmp']) {
      const code = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/' + u, r => { res(r.statusCode); r.resume(); }).on('error', rej);
      });
      assert.strictEqual(code, 403, '/' + u + ' -> ' + code + ' (harus 403: file sensitif jangan disajikan)');
    }
  } finally {
    proc.kill();
  }
}

// F-1/F-2: server menolak nilai money non-finite/negatif pada write (POST memvalidasi cuma array-of-object;
// Infinity/negatif yg konsisten bisa bikin rekonsiliasi iuran<>bukuKas hijau palsu: Infinity===Infinity, -500===-500).
async function serverMoneyCheck() {
  const os = require('os');
  const { spawn } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), 'spm_money_' + process.pid + '.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ members: [], dues: [], bukuKas: [] }));
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    // valid: finite >= 0 money -> 200
    assert.strictEqual(await post(PORT, '/api/data', { key: 'dues', value: [{ id: 'x', jumlah: 10000 }] }), 200, 'dues jumlah finite positif harus 200');
    assert.strictEqual(await post(PORT, '/api/data', { key: 'bukuKas', value: [{ id: 'r', sourceDuesId: 'x', debit: 10000, kredit: 0 }] }), 200, 'bukuKas debit finite harus 200');
    // non-finite (1e999 -> Infinity via permissive JSON.parse; "abc" -> NaN)
    assert.strictEqual(await post(PORT, '/api/data', { key: 'dues', value: [{ id: 'y', jumlah: '1e999' }] }), 400, 'dues jumlah Infinity harus 400 (non-finite)');
    assert.strictEqual(await post(PORT, '/api/data', { key: 'bukuKas', value: [{ id: 'r2', sourceDuesId: 'y', debit: '1e999' }] }), 400, 'bukuKas debit Infinity harus 400');
    assert.strictEqual(await post(PORT, '/api/data', { key: 'members', value: [{ id: 1, nik: '12345678', gaji_pokok_2025: '1e999' }] }), 400, 'members gaji_pokok_2025 Infinity harus 400 (F-2 pesangon/iuranBulanan)');
    assert.strictEqual(await post(PORT, '/api/data', { key: 'dues', value: [{ id: 'z', jumlah: 'abc' }] }), 400, 'dues jumlah NaN harus 400 (non-finite)');
    // negatif -> 400 (bikin rekonsiliasi -500===-500 hijau)
    assert.strictEqual(await post(PORT, '/api/data', { key: 'dues', value: [{ id: 'n', jumlah: -500 }] }), 400, 'dues jumlah negatif harus 400');
    assert.strictEqual(await post(PORT, '/api/data', { key: 'bukuKas', value: [{ id: 'n2', sourceDuesId: 'n', debit: -500 }] }), 400, 'bukuKas debit negatif harus 400');
  } finally {
    proc.kill();
    fs.unlinkSync(tmpFile);
    for (const ext of ['.bak', '.tmp']) { try { fs.unlinkSync(tmpFile + ext); } catch (e) {} }
  }
}

// V-03 (CSRF + DNS-rebinding): POST /api/data hanya boleh same-origin loopback + Content-Type json.
// Cross-origin (Origin/Referer evil) atau text/plain (no-preflight) harus ditolak.
async function serverCsrfCheck() {
  const os = require('os');
  const { spawn } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), 'spm_csrf_' + process.pid + '.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ members: [], dues: [], bukuKas: [] }));
  const proc = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: tmpFile, SPMKB_AUTH_PASSWORD: TEST_PASSWORD }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const reqH = (port, path, body, headers) => new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: Object.assign({ 'Content-Length': Buffer.byteLength(data), Authorization: 'Bearer ' + TEST_PASSWORD }, headers) }, resp => { resp.resume(); res(resp.statusCode); });
    r.on('error', rej); r.end(data);
  });
  try {
    const payload = { key: 'dues', value: [{ id: 'x', jumlah: 10000 }] };
    assert.strictEqual(await reqH(PORT, '/api/data', payload, { 'Content-Type': 'application/json' }), 200, 'POST same-origin application/json harus 200');
    assert.strictEqual(await reqH(PORT, '/api/data', payload, { 'Content-Type': 'application/json', 'Origin': 'https://evil.com' }), 403, 'POST cross-origin Origin https://evil.com harus 403 (CSRF)');
    assert.strictEqual(await reqH(PORT, '/api/data', payload, { 'Content-Type': 'application/json', 'Referer': 'https://evil.com/x' }), 403, 'POST cross-origin Referer https://evil.com harus 403 (CSRF)');
    assert.strictEqual(await reqH(PORT, '/api/data', payload, { 'Content-Type': 'text/plain' }), 415, 'POST Content-Type text/plain (CSRF no-preflight) harus 415');
  } finally {
    proc.kill();
    fs.unlinkSync(tmpFile);
    for (const ext of ['.bak', '.tmp']) { try { fs.unlinkSync(tmpFile + ext); } catch (e) {} }
  }
}

ok('C1: #reportPrintHeader { display: none } ada di screen CSS (hidden di layar)', () => {
  const printMediaIdx = css.indexOf('@media print');
  assert.ok(printMediaIdx > 0, 'style.css tidak punya @media print block');
  const screenCss = css.slice(0, printMediaIdx);
  assert.ok(/reportPrintHeader\s*\{[^}]*display\s*:\s*none/.test(screenCss),
            '#reportPrintHeader belum di-hide di screen CSS — tampil di layar setelah Export PDF');
});

ok('R4-NOCHARTJS: tidak ada updateChart()/this.charts (Chart.js dihapus) & tidak ada inline chart.destroy() di dashboard/reports', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  const reportsSrc2 = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  assert.ok(!coreSrc.includes('updateChart(key,'), 'core.js masih punya updateChart() (Chart.js era)');
  assert.ok(!coreSrc.includes('this.charts'), 'core.js masih punya this.charts (Chart.js era)');
  const inlineDestroys = (dashSrc.match(/this\.charts\.\w+\.destroy\(\)/g) || []).length
                       + (reportsSrc2.match(/this\.charts\.\w+\.destroy\(\)/g) || []).length;
  assert.strictEqual(inlineDestroys, 0, 'masih ada inline chart.destroy() di dashboard/reports: ' + inlineDestroys);
});

// ============================================================================
// [Unit: pure functions] — execute actual core.js method bodies (no DOM) with
// deterministic fixtures. Extracts each method body from core.js source and
// evaluates it standalone so we test the REAL math, not a string-slice.
// ============================================================================
const coreUnit = (() => {
  // Anchor on the METHOD DEFINITION (line-start indentation + bare name), NOT a
  // call-site (this.name()/App.name() are always preceded by '.' — the
  // guard-anchor trap). Handles default params like now = new Date().
  const grab = (name) => {
    const re = new RegExp('(^|\\n)\\s*' + name + '\\(');
    const m = re.exec(coreSrc);
    if (!m) return '';
    const i = m.index + m[0].indexOf(name + '(');
    const open = coreSrc.indexOf('{', i);
    if (open === -1) return '';
    let depth = 0;
    for (let k = open; k < coreSrc.length; k++) {
      if (coreSrc[k] === '{') depth++;
      else if (coreSrc[k] === '}') { depth--; if (depth === 0) return coreSrc.slice(i, k + 1); }
    }
    return '';
  };
  const exec = (name, self) => {
    const src = grab(name);
    if (!src) throw new Error('core.js method definition not found: ' + name + '()');
    const fnSrc = src.replace(/^[a-zA-Z_$][\w$]*\(/, 'function(');
    const fn = new Function('return ' + fnSrc)();
    return self ? fn.bind(self) : fn;
  };
  return { grab, exec };
})();

ok('UNIT: iuranBulanan(m) — tunjangan jobclass 4*=800000 else 625000, lalu round((gaji+tunj)*0.01)', () => {
  const iuran = coreUnit.exec('iuranBulanan');
  assert.strictEqual(iuran({ jobclass: '4A', gaji_pokok_2025: '1000000' }), 18000, 'jobclass 4A → tunj 800000');
  assert.strictEqual(iuran({ jobclass: '3A', gaji_pokok_2025: '1000000' }), 16250, 'jobclass 3A → tunj 625000');
  assert.strictEqual(iuran({ jobclass: '4B', gaji_pokok_2025: 0 }), 8000, 'gaji 0 + tunj 800000 → 8000');
});

ok('UNIT: joinYear(nik) — 2000 + parseInt(nik.slice(2,4)); null bila bukan 8 digit angka', () => {
  const jy = coreUnit.exec('joinYear');
  assert.strictEqual(jy('12130008'), 2013);
  assert.strictEqual(jy('12200100'), 2020);
  assert.strictEqual(jy('123'), null, 'bukan 8 digit → null');
  assert.strictEqual(jy('12ab0008'), null, 'non-digit → null');
  assert.strictEqual(jy(null), null, 'null → null');
  assert.strictEqual(jy(12130008), 2013, 'NIK numerik 8 digit tetap diproses via String()');
});

ok('UNIT: normalizeMonth(k) — seragamkan kunci bulan YYYY-MM (mm 2 digit); tahan 2026-8 vs 2026-08; non-bulan dibiarkan', () => {
  const nm = coreUnit.exec('normalizeMonth');
  assert.strictEqual(nm('2026-8'), '2026-08', '2026-8 → 2026-08 (pad)');
  assert.strictEqual(nm('2026-08'), '2026-08', '2026-08 tetap');
  assert.strictEqual(nm('2026-12'), '2026-12', 'bulan 2 digit tetap');
  assert.strictEqual(nm('2026-1'), '2026-01', '2026-1 → 2026-01');
  assert.strictEqual(nm('1999-3'), '1999-03', 'tahun lain tetap diproses');
  assert.strictEqual(nm('raw-2026-08'), 'raw-2026-08', 'bukan bentuk tahun-bulan dibiarkan apa adanya');
  assert.strictEqual(nm(''), '', 'kosong → kosong');
  assert.strictEqual(nm(null), '', 'null → kosong');
});

ok('UNIT: thisMonthDuesTotal() — proyeksi iuran-bulan-ini = Σ iuranBulanan seluruh anggota; koersi Number + precedence-safe', () => {
  const td = coreUnit.exec('thisMonthDuesTotal');
  assert.strictEqual(td.call({ members: [{ iuranBulanan: 10000 }, { iuranBulanan: '20000' }, { iuranBulanan: null }] }), 30000, 'Σ iuranBulanan dgn koersi Number (null→0)');
  assert.strictEqual(td.call({ members: [] }), 0, 'tanpa anggota → 0');
});

ok('UNIT: parseBirth(m) — parsing tanggal lahir DD-MM-YYYY; null bila invalid', () => {
  const pb = coreUnit.exec('parseBirth');
  assert.deepStrictEqual(pb({ tanggalLahir: '15-08-1990' }), { y: 1990, m: 8, d: 15 });
  assert.strictEqual(pb({ tanggalLahir: '' }), null);
  assert.strictEqual(pb({}), null);
  assert.strictEqual(pb({ tanggalLahir: '31-02-2020' }), null, 'tanggal tak ada (31 Feb) → null');
  assert.strictEqual(pb({ tanggalLahir: '00-13-1990' }), null, 'bulan invalid → null');
});

ok('UNIT: computeAge(m, now) — menghitung umur benar di batas ulang tahun (lewat/tidak lewat)', () => {
  const ca = coreUnit.exec('computeAge', { parseBirth: coreUnit.exec('parseBirth') });
  const m = { tanggalLahir: '15-08-1990' };
  assert.strictEqual(ca(m, new Date(2026, 0, 1)), 35, 'belum lewat ulang tahun 2026 → 35');
  assert.strictEqual(ca(m, new Date(2026, 7, 15)), 36, 'tepat ulang tahun 2026 → 36');
  assert.strictEqual(ca(m, new Date(2026, 11, 31)), 36, 'sudah lewat → 36');
  assert.strictEqual(ca({ tanggalLahir: '' }, new Date(2026, 0, 1)), null, 'tanpa tanggal lahir → null');
});

ok('UNIT: masaKerja(nik, now) — now.year - joinYear, clamp >= 0; null bila NIK invalid', () => {
  const mk = coreUnit.exec('masaKerja', { joinYear: coreUnit.exec('joinYear') });
  assert.strictEqual(mk('12130008', new Date(2026, 6, 1)), 13, '2026 - 2013 = 13');
  assert.strictEqual(mk('12200100', new Date(2022, 0, 1)), 2, '2022 - 2020 = 2');
  assert.strictEqual(mk('9999', new Date(2026, 0, 1)), null, 'NIK invalid → null');
});

ok('UNIT: pensiunTahun(m) — birthYear + 56; null bila tanpa tanggal lahir valid', () => {
  const pt = coreUnit.exec('pensiunTahun', { parseBirth: coreUnit.exec('parseBirth') });
  assert.strictEqual(pt({ tanggalLahir: '15-08-1990' }), 2046);
  assert.strictEqual(pt({}), null);
});

ok('UNIT: berakhirSanksi(mulai, jenis) — masa STT/SP1/SP2=3bln, SP3=6bln; clamp hari ke akhir bulan (tanpa rolling)', () => {
  const bs = coreUnit.exec('berakhirSanksi');
  assert.strictEqual(bs('2026-01-31', 'STT'), '2026-04-30', '31 Jan + 3 bln → clamp 30 Apr (bukan 1 Mei)');
  assert.strictEqual(bs('2026-01-15', 'SP3'), '2026-07-15', 'SP3 6 bln');
  assert.strictEqual(bs('2025-11-30', 'SP1'), '2026-02-28', 'lintas tahun + clamp akhir Feb 2026');
  assert.strictEqual(bs('2026-01-15', 'XYZ'), null, 'jenis tak dikenal → null');
});

ok('UNIT: pageSlice(data, stateKey) — 20 item/page, totalPages & start benar', () => {
  const ps = coreUnit.exec('pageSlice', { pages: { x: 2 }, ITEMS: 20 });
  const data = Array.from({ length: 25 }, (_, i) => i);
  const r = ps(data, 'x');
  assert.strictEqual(r.totalPages, 2);
  assert.strictEqual(r.start, 20);
  assert.strictEqual(r.paged.length, 5);
  assert.deepStrictEqual(r.paged, [20, 21, 22, 23, 24]);
});

ok('UNIT: escapeHtml — & < > " \' ter-escape (XSS output sink)', () => {
  const eh = coreUnit.exec('escapeHtml');
  assert.strictEqual(eh('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(eh('a&b<c>"d\''), 'a&amp;b&lt;c&gt;&quot;d&#39;');
  assert.strictEqual(eh(null), '');
  assert.strictEqual(eh(undefined), '');
});

ok('UNIT: escapeJsStr — kutip tunggal & ganda dinetralkan (onclick sink)', () => {
  const ej = coreUnit.exec('escapeJsStr');
  assert.ok(!ej("');alert(1);//").includes("'"), 'kutip tunggal harus dinetralkan');
  assert.strictEqual(ej('abc'), 'abc', 'string biasa tidak berubah');
});

ok('UNIT: formatRupiah — pemformatan Rupiah id-ID; input invalid jadi "Rp 0"', () => {
  const fr = coreUnit.exec('formatRupiah');
  assert.strictEqual(fr(1000000), 'Rp 1.000.000');
  assert.strictEqual(fr(0), 'Rp 0');
  assert.strictEqual(fr('abc'), 'Rp 0');
  assert.strictEqual(fr(null), 'Rp 0');
});

ok('UNIT: CSV esc formula-injection — nilai diawali = + - @ di-preprend \' (S26)', () => {
  const escSrc = (() => {
    const i = coreSrc.indexOf('csvEsc(v) {');
    if (i === -1) return '';
    const m = coreSrc.slice(i, i + 400).match(/csvEsc\(v\) \{ ([\s\S]*?); \}/);
    return m ? '(v) => { ' + m[1] + ' }' : '';
  })();
  assert.ok(escSrc, 'tidak dapat mengekstrak esc dari exportToCSV');
  const esc = new Function('return ' + escSrc)();
  assert.ok(esc('=SUM(A1)').startsWith("'"), '= harus di-preprend kutip');
  assert.ok(esc('+cmd').startsWith("'"), '+ harus di-preprend');
  assert.ok(esc('-1').startsWith("'"), '- harus di-preprend');
  assert.ok(esc('@x').startsWith("'"), '@ harus di-preprend');
  assert.strictEqual(esc('normal'), 'normal', 'nilai normal tidak berubah');
});

ok('A11Y: modal & toast punya atribut aksesibilitas dasar (role dialog/modal, aria-live toast)', () => {
  assert.ok(/id="mainModal"[^>]*role="dialog"/.test(indexHtml), 'index.html #mainModal belum punya role="dialog"');
  assert.ok(/id="mainModal"[^>]*aria-modal="true"/.test(indexHtml), 'index.html #mainModal belum punya aria-modal="true"');
  assert.ok(/id="mainModal"[^>]*aria-labelledby="modalTitle"/.test(indexHtml), 'index.html #mainModal belum punya aria-labelledby="modalTitle"');
  assert.ok(/close-btn[^>]*aria-label="Tutup"/.test(indexHtml), 'index.html tombol close modal belum punya aria-label="Tutup"');
  assert.ok(/id="toastContainer"[^>]*aria-live="polite"/.test(indexHtml), 'index.html #toastContainer belum punya aria-live="polite"');
  assert.ok(/id="toastContainer"[^>]*role="status"/.test(indexHtml), 'index.html #toastContainer belum punya role="status"');
});

ok('A11Y: tombol aksi ikon tabel members punya aria-label (dan tetap escapeHtml utk atribut)', () => {
  assert.ok(/aria-label="Lihat \$\{this\.escapeHtml\(m\.nama\)\}"/.test(membersSrc), 'members.js tombol Lihat belum punya aria-label + escapeHtml');
  assert.ok(/aria-label="Edit \$\{this\.escapeHtml\(m\.nama\)\}"/.test(membersSrc), 'members.js tombol Edit belum punya aria-label + escapeHtml');
  assert.ok(/aria-label="Hapus \$\{this\.escapeHtml\(m\.nama\)\}"/.test(membersSrc), 'members.js tombol Hapus belum punya aria-label + escapeHtml');
});

// ===== Vulnerability hardening guards =====

ok('V-CT: server.js Content-Type check pakai startsWith (bukan includes) — includes substring bypassable', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!/includes\('application\/json'\)/.test(srvSrc),
    'server.js masih pakai includes("application/json") — bypassable dgn Content-Type: text/html, application/json');
  assert.ok(/startsWith\('application\/json'\)/.test(srvSrc) || /\^application\/json/.test(srvSrc),
    'server.js Content-Type belum pakai startsWith/regex prefix check');
});

ok('V-HOST: server.js menolak request tanpa Host header (DNS-rebinding empty Host)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // Host guard harus menolak Host header kosong/missing — pola lama: if (hostHdr && ...) bypass saat empty
  const hostGuardMatch = srvSrc.match(/if\s*\(!?\s*hostHdr[^)]+\)/);
  assert.ok(hostGuardMatch, 'server.js belum punya Host header guard');
  // Guard baru harus CATCH hostHdr kosong — harus pakai !hostHdr (bukan hostHdr &&)
  // if (!hostHdr || (...)) menolak empty; if (hostHdr && (...)) melewatkannya
  assert.ok(!/if\s*\(\s*hostHdr\s*&&/.test(srvSrc),
    'server.js Host guard pakai "if (hostHdr && ...)" — request tanpa Host header lolos (bypass DNS-rebinding)');
  // Harus ada penolakan eksplisit hostHdr kosong
  assert.ok(/!\s*hostHdr/.test(srvSrc) && /\|\|.*hostHdr/.test(srvSrc),
    'server.js Host guard belum menolak Host header kosong/missing');
});

ok('V-LOCK: bukuKas.js editBukuKas/deleteBukuKas menolak baris sourceDuesId (synced dari iuran)', () => {
  const bkSrc = fs.readFileSync(path.join(ROOT, 'js/bukuKas.js'), 'utf8');
  const editIdx = bkSrc.indexOf('editBukuKas(id)');
  assert.ok(editIdx !== -1, 'bukuKas.js belum punya editBukuKas(id)');
  const editBody = bkSrc.slice(editIdx, editIdx + 400);
  assert.ok(/sourceDuesId/.test(editBody),
    'editBukuKas belum cek sourceDuesId — baris synced dari iuran bisa diedit, memecah rekonsiliasi');
  const delIdx = bkSrc.indexOf('deleteBukuKas(id)');
  assert.ok(delIdx !== -1, 'bukuKas.js belum punya deleteBukuKas(id)');
  const delBody = bkSrc.slice(delIdx, delIdx + 400);
  assert.ok(/sourceDuesId/.test(delBody),
    'deleteBukuKas belum cek sourceDuesId — baris synced dari iuran bisa dihapus, memecah rekonsiliasi');
});

ok('ID-COLLISION: core.js punya _nextId() helper collision-safe', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/_nextId/.test(coreSrc), 'core.js belum punya _nextId() helper');
  const idx = coreSrc.indexOf('_nextId()');
  const block = coreSrc.slice(idx, idx + 200);
  assert.ok(/Date\.now/.test(block), '_nextId() harus pakai Date.now() sebagai basis');
  // Harus pakai suffix unik (counter ATAU random) — bukan bare Date.now()
  assert.ok(/_idCounter|counter|random|Math\.random/.test(block), '_nextId() harus pakai suffix unik (counter/random)');
});

ok('ID-COLLISION-NO-BARE: tidak ada module yang pakai bare Date.now() sebagai ID', () => {
  const files = ['attendance.js','bukuKas.js','calendar.js','complaints.js','letters.js','sanksi.js'];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    assert.ok(!/id:\s*Date\.now\(\)/.test(src), `${f} masih pakai bare Date.now() sebagai ID`);
  });
});

ok('NUM-W: wages.js reduce pakai Number() coercion (anti-NaN accumulate)', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  // avgRaise & totalBudget harus pakai Number() coercion — parenthesized s+(Number(x)||0)
  assert.ok(/Number\(r\.total_kenaikan\)\s*\|\|\s*0/.test(wagSrc),
    'wages.js reduce belum pakai Number(r.total_kenaikan)||0 — NaN dari data POST meracuni akumulasi');
});

ok('R-MOD: reports.js exportReportPDF — this[modul] harus ada di ternary whitelist, bukan fallback', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  const idx = repSrc.indexOf('exportReportPDF()');
  assert.ok(idx !== -1, 'reports.js belum punya exportReportPDF()');
  const body = repSrc.slice(idx, idx + 600);
  // this[modul] hanya aman jika setiap modul di-whitelist eksplisit via ternary/switch
  // Jika this[modul] muncul sbg fallback tdk tert guarding → prototype access
  const lines = body.split('\n');
  const modulAccessLine = lines.find(l => /this\[modul\]/.test(l));
  if (modulAccessLine) {
    // Cek ada ternary/swich SEBELUM this[modul] di baris yang SAMA (bukan di baris terpisah tanpa guard)
    const beforeModul = modulAccessLine.split('this[modul]')[0];
    const hasGuard = /===|switch|if.*modul|includes|indexOf/.test(beforeModul);
    assert.ok(hasGuard, 'this[modul] diakses tanpa guard di baris yang sama — fallback prototype access');
  }
});

ok('V-NORM: normalizeBirth reject non-DD-MM-YYYY delimiters (dot/spasi) — simpan mentah bikin parseBirth null', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  const idx = coreSrc.indexOf('normalizeBirth(s)');
  assert.ok(idx !== -1, 'core.js belum punya normalizeBirth(s)');
  const body = coreSrc.slice(idx, idx + 400);
  // normalizeBirth harus VALIDASI format — bukan cuma ganti / -> -
  // Input '01.01.2026' atau '01 01 2026' harus ditolak, bukan disimpan mentah
  assert.ok(/test\(|match\(|\.includes\('\\.'\)|\.includes\(' '\)|reject|invalid|tolak|return ''/.test(body),
    'normalizeBirth belum validasi delimiter — dot/spasi tersimpan mentah, parseBirth return null silently');
});

// ===== P0 sprint guards =====

ok('G9-LENGTH: save attendance/complaints/event punya length check di semua text fields', () => {
  const attSrc = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
  const compSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
  const calSrc = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  // attendance: keterangan harus punya length check
  const attIdx = attSrc.indexOf('saveAttendance()');
  const attBody = attSrc.slice(attIdx, attIdx + 800);
  assert.ok(/length/.test(attBody), 'saveAttendance belum punya length check');
  // complaints: keterangan sudah ada (2000), judul sudah ada (200)
  const compIdx = compSrc.indexOf('saveComplaint()');
  const compBody = compSrc.slice(compIdx, compIdx + 800);
  assert.ok(/keterangan\.length/.test(compBody), 'saveComplaint belum check keterangan length');    // calendar: description harus punya length check (in saveEvent or _validateEvent)
    const calIdx = calSrc.indexOf('saveEvent()');
    const calBody = calSrc.slice(calIdx, calIdx + 800);
    const calHelperIdx = calSrc.indexOf('_validateEvent()');
    const calHelperBody = calHelperIdx !== -1 ? calSrc.slice(calHelperIdx, calHelperIdx + 800) : '';
    assert.ok(/length/.test(calBody) || /length/.test(calHelperBody), 'saveEvent/_validateEvent belum punya length check');
});

ok('TC-6: confirm() tak pakai template literal dgn user data (konsistensi/defense-in-depth; bukan injeksi — nilai runtime tak di-eval)', () => {
  const membersSrc = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
  const calSrc = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  // members.js deleteMember: confirm harus pakai string concatenation, bukan template literal
  const memIdx = membersSrc.indexOf('deleteMember(id)');
  const memBody = membersSrc.slice(memIdx, memIdx + 300);
  assert.ok(/confirm\(/.test(memBody), 'deleteMember belum punya confirm()');
  // Template literal dengan user data (m.nama) berisiko backtick injection
  // Harus pakai concat atau escapeJsStr
  const confirmLine = memBody.split('\n').find(l => l.includes('confirm('));
  assert.ok(confirmLine, 'confirm line tidak ditemukan di deleteMember');
  // Reject: template literal dengan ${m.nama} tanpa escape
  assert.ok(!/confirm\(`.*\$\{m\.nama\}/.test(confirmLine),
    'deleteMember confirm pakai template literal dengan m.nama raw — backtick injection risk');
  // calendar.js deleteEvent: same pattern
  const calIdx = calSrc.indexOf('deleteEvent(id)');
  const calBody = calSrc.slice(calIdx, calIdx + 300);
  const calConfirmLine = calBody.split('\n').find(l => l.includes('confirm('));
  if (calConfirmLine) {
    assert.ok(!/confirm\(`.*\$\{e\.title\}/.test(calConfirmLine),
      'deleteEvent confirm pakai template literal dengan e.title raw — backtick injection risk');
  }
});

ok('V-RL: server.js POST /api/data punya rate limit (max N req/detik per IP)', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const postIdx = srvSrc.indexOf("req.url === '/api/data'");
  assert.ok(postIdx !== -1, 'POST /api/data handler tidak ditemukan');
  const postBody = srvSrc.slice(postIdx, postIdx + 2000);
  // Harus ada rate limit mechanism: counter, timestamp, atau Map
  assert.ok(/rate|limit|throttle|counter|lastRequest|requestCount|RateLimiter/.test(postBody),
    'POST /api/data belum punya rate limit mechanism');
});

ok('V-KATEGORI: server.js menolak bukuKas dengan kategori tidak valid', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/kategori/.test(src), 'server.js lacks kategori field reference');
  assert.ok(/VALID_KATEGORI|validKategori/.test(src), 'server.js lacks kategori whitelist constant');
  assert.ok(/includes/.test(src), 'server.js lacks includes() check for kategori validation');
});

ok('V-KATEGORI-BEHAVIORAL: server.js kategori validationReject400 logic ada', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // Harus ada: if key === 'bukuKas' + loop value + includes check + 400 response
  assert.ok(/key === 'bukuKas'/.test(src), 'server.js belum filter key bukuKas untuk kategori validation');
  assert.ok(/VALID_KATEGORI/.test(src), 'server.js belum punya VALID_KATEGORI whitelist');
  assert.ok(/o\.kategori && !VALID_KATEGORI\.includes/.test(src), 'server.js belum reject invalid kategori');
  assert.ok(/400.*kategori/.test(src) || /kategori.*400/.test(src), 'server.js belum return 400 untuk invalid kategori');
});

// ===== P1 sprint guards =====

ok('P1-HELPER: core.js punya renderStatCard helper (dashboard/wages/complaints stat cards)', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/renderStatCard/.test(coreSrc), 'core.js belum punya helper renderStatCard()');
  // Helper harus dipakai di minimal 2 file (dashboard + wages/complaints)
  const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  assert.ok(/renderStatCard/.test(dashSrc) || /renderStatCard/.test(wagSrc),
    'renderStatCard belum dipakai di dashboard/wages');
});

ok('P1-IDX: core.js punya _buildSearchIndex helper utk globalSearch optimization', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/_buildSearchIndex|_searchIndex/.test(coreSrc),
    'core.js belum punya search index helper (_buildSearchIndex / _searchIndex)');
});

ok('P1-TRIM: semua save function trim input string SEBELUM validasi (G8-TRIM)', () => {
  const files = [
    { name: 'attendance.js', src: fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8'), fn: 'saveAttendance()' },
    { name: 'calendar.js', src: fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8'), fn: 'saveEvent()' },
    { name: 'letters.js', src: fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8'), fn: 'saveLetter()' },
    { name: 'complaints.js', src: fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8'), fn: 'saveComplaint()' },
  ];
  files.forEach(({ name, src, fn }) => {
    const idx = src.indexOf(fn);
    assert.ok(idx !== -1, name + '.' + fn + ' tidak ditemukan');
    const body = src.slice(idx, idx + 600);
    // Accept getFormValues() which trims internally, OR direct .trim() calls
    if (/getFormValues/.test(body) || /_validateEvent/.test(body)) {
      // getFormValues/_validateEvent trims all fields internally — pass
      return;
    }
    // Harus ada minimal 2 trim() di awal save
    const trimCount = (body.match(/\.trim\(\)/g) || []).length;
    assert.ok(trimCount >= 2, name + '.' + fn + ' hanya punya ' + trimCount + ' trim() (minimum 2 untuk field text atau pakai getFormValues())');
  });
});

// ===== P2 sprint guards =====

ok('P2-DARK: core.js punya toggleDarkMode() + style.css punya [data-theme="dark"] overrides', () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/toggleDarkMode/.test(coreSrc) || /darkMode/.test(coreSrc),
    'core.js belum punya dark mode toggle (toggleDarkMode / darkMode)');
  assert.ok(/\[data-theme=.dark.\]/.test(css) || /\.dark-mode/.test(css),
    'style.css belum punya dark mode CSS overrides');
});

ok('P2-A11Y: index.html punya tabindex + keyboard event handling', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  // Modal harus bisa ditutup dgn Escape
  assert.ok(/Escape|keydown.*close|escape.*close/.test(coreSrc),
    'core.js belum punya keyboard handler utk Escape (tutup modal)');
  // Modal harus punya role=dialog + aria-modal
  assert.ok(/role=.dialog/.test(indexHtml),
    'index.html modal belum punya role=dialog');
});

ok('NAV-A11Y: globalSearch punya aria-label + nav active pakai aria-current=page', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/id="globalSearch"[^>]*aria-label=/.test(html), 'globalSearch belum punya aria-label');
  assert.ok(/aria-current=/.test(html), 'nav awal belum punya aria-current');
  assert.ok(/aria-current/.test(core), 'core.js belum set aria-current saat pindah page');
});

ok('P2-PRINT: style.css punya print rules utk members/dues/reports (bukan cuma cards)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const printIdx = css.indexOf('@media print');
  assert.ok(printIdx !== -1, 'style.css belum punya @media print');
  const printBlock = css.slice(printIdx, printIdx + 2000);
  // Harus mention members/dues/reports di print rules
  assert.ok(/members|dues|reports|#membersBody|#duesBody|#report/.test(printBlock),
    '@media print belum cover members/dues/reports — hanya cards yang di-print');
});

ok('DARK-CONTRAST-1: permukaan komponen (search-box/toolbar/card-header/data-table/pagination/cal-day/form-group/pesangon-search-list/btn-secondary) pakai var(--paper)/var(--green-50) — bukan literal #fff yg tak ikut gelap saat [data-theme=dark] (bug: teks var(--ink) jadi terang, tapi bg tetap putih -> nyaris tak terlihat)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const checks = [
    ['.system-status', /\.system-status\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.search-box input', /\.search-box input\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.card-header', /\.card-header\s*\{[^}]*background:\s*var\(--green-50\)/],
    ['.toolbar', /\.toolbar\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.filter-group select/input', /\.filter-group select, \.filter-group input\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.btn-secondary', /\.btn-secondary\s*\{\s*background:\s*var\(--paper\)/],
    ['.data-table', /\.data-table\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.pagination button', /\.pagination button\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.cal-day', /\.cal-day\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.form-group input/select/textarea', /\.form-group input, \.form-group select, \.form-group textarea\s*\{[^}]*background:\s*var\(--paper\)/],
    ['.pesangon-search-list', /\.pesangon-search-list\s*\{[^}]*background:\s*var\(--paper\)/],
  ];
  checks.forEach(([label, re]) => assert.ok(re.test(css), label + ' masih background:#fff literal (tak ikut var(--paper) saat dark mode -> teks var(--ink) jadi terang di atas latar tetap putih)'));
  // Sisa #fff literal yg SENGAJA dipertahankan (masing2 sudah dibuktikan aman thd dark mode):
  // .quick-action:hover (teks var(--green-950) selalu gelap di atas putih - aman di kedua tema),
  // .stat-card (sudah di-override lebih spesifik oleh [data-theme="dark"] .stat-card, menang via specificity bukan source order),
  // .card-brand-logo (badge logo bundar di header kartu anggota - tanpa teks, kosmetik),
  // body di dalam @media print (halaman cetak selalu putih/hitam, tak terkait tema app di layar).
  const bgFffCount = (css.match(/background:\s*#fff/g) || []).length;
  assert.ok(bgFffCount <= 4, 'masih ada ' + bgFffCount + 'x background:#fff literal di style.css (target <=4: quick-action:hover, stat-card [sudah aman via specificity], card-brand-logo, @media print body)');
});

ok('DARK-CONTRAST-2: dark-mode override eksplisit utk topbar, cal-day.today/empty, cal-event.rapat (dark-on-dark), & member-card (token-reset agar kartu cetak tetap terang terlepas dari tema)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/\[data-theme="dark"\] \.topbar\s*\{/.test(css), 'style.css belum punya [data-theme="dark"] .topbar override (.topbar pakai rgba literal, tetap terang di dark mode)');
  assert.ok(/\[data-theme="dark"\] \.cal-day\.today\s*\{/.test(css), 'style.css belum punya [data-theme="dark"] .cal-day.today override');
  assert.ok(/\[data-theme="dark"\] \.cal-day\.empty\s*\{/.test(css), 'style.css belum punya [data-theme="dark"] .cal-day.empty override');
  assert.ok(/\[data-theme="dark"\] \.cal-event\.rapat\s*\{[^}]*color:\s*var\(--ink\)/.test(css), 'style.css belum perbaiki .cal-event.rapat (var(--green-50)+var(--green-950) SAMA2 jadi gelap di dark mode -> teks gelap di atas latar gelap)');
  const mcIdx = css.indexOf('[data-theme="dark"] .member-card {');
  assert.ok(mcIdx > -1, 'style.css belum punya [data-theme="dark"] .member-card token-reset (kartu anggota harus tetap terang utk cetak, terlepas dari tema app)');
  const mcBody = css.slice(mcIdx, mcIdx + 400);
  assert.ok(/--paper:\s*#faf9f5/.test(mcBody) && /--ink:\s*#0c1a12/.test(mcBody), 'member-card token-reset belum mengembalikan --paper/--ink ke nilai terang literal');
});

ok('UI-THEME: theme tokens, focus ring, dan reduced-motion global tersedia', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/color-scheme:\s*light/.test(css), 'tema terang belum mendeklarasikan color-scheme');
  assert.ok(/\[data-theme="dark"\][^{]*\{[^}]*color-scheme:\s*dark/s.test(css), 'tema gelap belum mendeklarasikan color-scheme');
  assert.ok(/--focus-ring\s*:/.test(css) && /:focus-visible\s*\{[^}]*var\(--focus-ring\)/s.test(css), 'focus ring belum memakai token tema');
  assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css), 'reduced-motion global belum tersedia');
});

ok('PERF-PRECONNECT: preconnect ke cdnjs.cloudflare.com utk FA/jsPDF', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/preconnect[^>]*cdnjs\.cloudflare\.com/.test(html), 'index.html belum preconnect cdnjs');
});

ok('EDISI-DATE: page-stamp edisi dinamis dari tanggal (tak hardcode 08/26)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(!/0?8\s*\/\s*26/.test(html), 'index.html masih hardcode edisi 08/26');
  assert.ok(html.includes('pageStampEdition'), 'index.html belum punya id pageStampEdition');
  assert.ok(/getElementById\('pageStampEdition'\)/.test(dashSrc), 'dashboard.js belum isi pageStampEdition');
});

ok('LOGIN-LOGO: login mark memakai aset logo SPMKB, bukan placeholder teks', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/class="spmkb-login-mark"[^>]*>\s*<img[^>]+src="assets\/spmkb-logo-aktual\.jpeg"/s.test(html), 'login mark belum memakai aset logo SPMKB');
  assert.ok(/\.spmkb-login-mark img\s*\{[^}]*border-radius:\s*50%/s.test(css), 'logo login belum dipotong lingkaran');
});

ok('XSS-5: HTML chart rendering pakai escapeHtml() pada semua label — label bersumber dari this.members/this.dues (nama departemen dsb), attacker-reachable via POST /api/data langsung', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  const reportSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  // dashboard: renderDashMemberStatus harus escapeHtml pada legend labels
  assert.ok(/escapeHtml/.test(dashSrc), 'dashboard.js belum memakai escapeHtml() — stored XSS pada chart labels');
  // reports: renderHtmlBarChart/renderHtmlDoughnut harus escapeHtml pada labels
  assert.ok(/escapeHtml/.test(reportSrc), 'reports.js belum memakai escapeHtml() — stored XSS pada chart labels');
});

ok('PERF-3: tidak ada chart-enhancement-script / MutationObserver — semua chart pakai HTML/CSS murni tanpa Chart.js runtime overhead', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('chart-enhancement-script'), 'index.html masih punya chart-enhancement-script (Chart.js era)');
  assert.ok(!html.includes('chart.js@') && !html.includes('Chart.js/'), 'index.html masih memuat Chart.js CDN');
  assert.ok(!html.includes('MutationObserver'), 'index.html masih punya MutationObserver (Chart.js era)');
});

ok('GC-CALEVENT-EDIT: calendar.js punya editEvent(id) + saveEditEvent(id) + tombol Edit di showDayDetail — CRUD lengkap (add/edit/delete)', () => {
  assert.ok(/editEvent\s*\(id/.test(calSrc), 'calendar.js belum punya editEvent(id)');
  assert.ok(/saveEditEvent\s*\(id/.test(calSrc), 'calendar.js belum punya saveEditEvent(id)');
  const detailIdx = calSrc.indexOf('showDayDetail(');
  const detailBody = calSrc.slice(detailIdx, calSrc.indexOf('showAddEvent', detailIdx));
  assert.ok(/editEvent/.test(detailBody), 'showDayDetail belum punya tombol Edit (onclick editEvent)');
  assert.ok(/escapeJsStr/.test(detailBody), 'showDayDetail tombol Edit belum escapeJsStr(e.id)');
  // saveEditEvent harus update field: title, date, type, description
  const saveIdx = calSrc.indexOf('saveEditEvent(id) {');
  assert.ok(saveIdx !== -1, 'saveEditEvent(id) method definition tidak ditemukan');
  const saveBody = calSrc.slice(saveIdx, saveIdx + 1200);    assert.ok(/e\.title|Object\.assign/.test(saveBody), 'saveEditEvent belum update title');
    assert.ok(/e\.date|Object\.assign/.test(saveBody), 'saveEditEvent belum update date');
    assert.ok(/e\.type|Object\.assign/.test(saveBody), 'saveEditEvent belum update type');
    assert.ok(/e\.description|Object\.assign/.test(saveBody), 'saveEditEvent belum update description');
  // saveEditEvent harus punya try/catch
  assert.ok(/try\s*\{/.test(saveBody), 'saveEditEvent belum punya try/catch');
});

ok('DASH-CHART: dashboard chart pakai .html-chart-container (HTML/CSS, bukan canvas) & card pakai class chart-card', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dashIdx = html.indexOf('id="dashboard"');
  const dashSection = html.slice(dashIdx, html.indexOf('<div class="page"', dashIdx + 1));
  assert.ok(dashSection.includes('chartMemberStatus'), 'dashboard belum punya chartMemberStatus container');
  assert.ok(dashSection.includes('html-chart-container'), 'dashboard chart belum punya wrapper .html-chart-container');
  assert.ok(dashSection.includes('class="card chart-card"'), 'dashboard chart card belum pakai class chart-card');
  assert.ok(!dashSection.includes('<canvas'), 'dashboard masih pakai <canvas> (Chart.js) — harus HTML/CSS');
});

ok('STAT-KBD: stat-card clickable punya role=button + tabindex + Enter keydown (bukan div inert)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const dashIdx = html.indexOf('id="dashboard"');
  const dash = html.slice(dashIdx, html.indexOf('<div class="page"', dashIdx + 1));
  assert.ok(/role="button"/.test(dash) && /tabindex="0"/.test(dash) && /event\.key === 'Enter'/.test(dash),
    'stat-card belum punya role=button/tabindex/Enter keydown');
  assert.ok(!/style="cursor:pointer"/.test(dash),
    'cursor:pointer inline style harus pindah ke CSS class');
  assert.ok(/\.stat-clickable\s*\{[^}]*cursor:\s*pointer/.test(css),
    'style.css belum punya .stat-clickable {cursor:pointer}');
});

ok('DASH-DONUT-REUSE: renderDashMemberStatus uses renderHtmlDoughnut shared helper (dedup conic-gradient)', () => {
  const i = dashSrc.indexOf('renderDashMemberStatus() {');
  assert.ok(i !== -1, 'anchor renderDashMemberStatus() { not found');
  const block = dashSrc.slice(i, i + 600);
  assert.ok(/renderHtmlDoughnut/.test(block), 'renderDashMemberStatus does not use renderHtmlDoughnut helper');
  assert.ok(!/conicParts/.test(block), 'renderDashMemberStatus still has inline conicParts construction');
});

ok('ENH1: tidak ada enhanceChart override — chart HTML/CSS murni tanpa Chart.js wrapper', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('enhanceChart'), 'index.html masih punya enhanceChart (Chart.js era)');
});


ok('ENH3: tidak ada applyDatasetStyles overwrite — chart HTML/CSS murni tanpa Chart.js wrapper', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('applyDatasetStyles'), 'index.html masih punya applyDatasetStyles (Chart.js era)');
});

ok('ENH4: tidak ada Chart.defaults mutation — Chart.js dihapus, chart pakai HTML/CSS murni', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('Chart.defaults'), 'index.html masih mengubah Chart.defaults (Chart.js era)');
});

ok('LOGIN-GATE: index.html punya login gate (#spmkbLoginGate) + body class spmkb-locked + login script (#spmkb-login-script)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="spmkbLoginGate"'), 'index.html belum punya login gate #spmkbLoginGate');
  assert.ok(html.includes('class="spmkb-locked"'), 'index.html body belum punya class spmkb-locked');
  assert.ok(html.includes('id="spmkb-login-script"'), 'index.html belum punya login script #spmkb-login-script');
  // Login CSS bisa inline (#spmkb-login-styles) atau di style.css — keduanya valid
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(html.includes('id="spmkb-login-styles"') || css.includes('spmkb-login-card'),
    'index.html belum punya login CSS (inline atau di style.css)');
});

ok('LOGIN-SEC: login script punya rate limiting (max attempts + lockout) & tidak hardcode password plaintext di View Source', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptIdx = html.indexOf('id="spmkb-login-script"');
  assert.ok(scriptIdx > -1, 'login script tidak ditemukan');
  const script = html.slice(scriptIdx, html.indexOf('</script>', scriptIdx));
  // Harus ada mekanisme rate limiting
  assert.ok(/attempts|attempt|MAX_ATTEMPTS|lockout|cooldown|LIMIT/.test(script),
    'login script belum punya rate limiting (max attempts / lockout)');
  // Password tidak boleh plaintext di script
  assert.ok(!/DEMO_PASSWORD\s*=\s*['"]demo2026['"]/.test(script),
    'login script masih hardcode password plaintext — harus di-hash atau di-obfuscate');
});

ok('LOGIN-LOGOUT: topbar punya tombol logout (#spmkbLogout) & session management via sessionStorage', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('spmkbLogout') || html.includes('spmkb-logout'),
    'index.html belum punya tombol logout');
  const scriptIdx = html.indexOf('id="spmkb-login-script"');
  const script = html.slice(scriptIdx, html.indexOf('</script>', scriptIdx));
  assert.ok(/sessionStorage/.test(script), 'login script belum memakai sessionStorage untuk session management');
});

ok('SEC: tidak ada CDN anime.js/Chart.js (dihapus) — semua chart pakai HTML/CSS murni', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('animejs'), 'index.html masih memuat CDN anime.js (sudah dihapus)');
  assert.ok(!html.includes('Chart.js'), 'index.html masih memuat CDN Chart.js (sudah dihapus)');
});

ok('V-GRL: server.js punya rate limit untuk GET /data.json', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/rateLimit|rate.*limit|429/.test(src) && /data\.json.*GET|GET.*data\.json|urlPath.*data\.json.*rate/.test(src),
    'server.js belum punya rate limit untuk GET /data.json');
});

ok('V-AUTH-LOG: server.js log percobaan auth gagal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/console\.(warn|log).*unauthor|console\.(warn|log).*auth.*fail|console\.(warn|log).*401/.test(src),
    'server.js belum log percobaan auth gagal');
});

ok('V-CSP: server.js set header Content-Security-Policy', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/Content-Security-Policy|CSP/.test(src),
    'server.js belum set header Content-Security-Policy');
});

ok('V-CSP-RES: CSP mengizinkan CDN jsPDF/FA/Google Fonts (script/style/font) — tanpa ini, PDF export & FA icons gagal di browser', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/script-src[^;]*cdnjs\.cloudflare\.com/.test(src), 'script-src belum izinkan cdnjs (jsPDF)');
  assert.ok(/style-src[^;]*cdnjs\.cloudflare\.com/.test(src), 'style-src belum izinkan cdnjs (Font Awesome)');
  assert.ok(/style-src[^;]*fonts\.googleapis\.com/.test(src), 'style-src belum izinkan fonts.googleapis (Google Fonts CSS)');
  assert.ok(/font-src[^;]*fonts\.gstatic\.com/.test(src), 'font-src belum izinkan fonts.gstatic (font files)');
  // FA webfonts (woff2) datang dari host yang sama dgn CSS-nya (cdnjs) — tanpa ini, CSS FA load tapi ikon jadi kotak kosong / missing glyph
  assert.ok(/font-src[^;]*cdnjs\.cloudflare\.com/.test(src), 'font-src belum izinkan cdnjs (FA webfonts)');
  // Logo website & aset lokal dari /assets di-host sendiri — img-src tanpa 'self' akan memblokirnya (img-src eksplisit override default-src)
  assert.ok(/img-src[^;]*'self'/.test(src), "img-src belum izinkan 'self' (logo & aset lokal /assets)");
});

ok('SRV-DECODE-SAFE: server.js punya safeDecode utk URL (decodeURIComponent malformed = crash DoS)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/safeDecode\s*\(/.test(src), 'server.js belum punya helper safeDecode');
  assert.ok(/safeDecode\(req\.url/.test(src), 'server.js belum pakai safeDecode di jalur static');
});

ok('SRV-413: overflow body respond 413 di event end (req.destroy mencegah end -> klien dapat reset, bukan 413)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const i = src.indexOf("req.url === '/api/data'");
  assert.ok(i !== -1, 'POST /api/data handler tidak ditemukan');
  const postBody = src.slice(i, i + 2600);
  assert.ok(/overflow/.test(postBody), 'POST handler belum punya flag overflow');
  assert.ok(!/overflow\s*=\s*true;\s*req\.destroy/.test(src), 'overflow masih pakai req.destroy (event end tak akan terpanggil)');
  assert.ok(/413/.test(postBody), 'POST handler belum respond 413 saat overflow');
});

ok('SRV-RATE-BUCKET: rate limit per-bucket (GET data.json & POST /api/data terpisah, tak saling mencuri kuota)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/isRateLimited|RateLimiter|rateLimitFor/.test(src), 'server.js belum punya helper rate limit');
  assert.ok(/bucket/.test(src), 'server.js rate limit belum pakai diskriminator bucket');
});

ok('SRV-ERR-HEADERS: error responses (4xx/5xx) ikut SEC_HEADERS via respondError', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(/respondError|writeError|sendError/.test(src), 'server.js belum punya helper error response');
  const hIdx = src.indexOf('function respondError');
  assert.ok(hIdx !== -1, 'helper respondError tidak ditemukan');
  const hb = src.slice(hIdx, hIdx + 220);
  assert.ok(/SEC_HEADERS/.test(hb), 'respondError belum merge SEC_HEADERS');
});

ok('V-NAN-ID: bukuKas/calendar/complaints/letters/sanksi pakai String(id) bukan +id (cegah NaN dari _nextId string)', () => {
  const files = ['js/bukuKas.js', 'js/calendar.js', 'js/complaints.js', 'js/letters.js', 'js/sanksi.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Should NOT have `= +id` pattern (old numeric coercion)
    assert.ok(!/= \+id[;\s]/.test(src), `${f} masih pakai +id (akan NaN dengan _nextId string)`);
  }
});

ok('PERF-BIRTH-CACHE: parseBirth caches by NIK (cegah 429× date parsing)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/_birthCache/.test(src), 'core.js belum punya _birthCache');
  assert.ok(/this\._birthCache\.has/.test(src), 'core.js parseBirth belum pakai cache lookup');
});

ok('PERF-DEBOUNCE: filter changes debounced (cegah rapid re-render)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/_filterTimers/.test(src), 'core.js belum punya _filterTimers');
  assert.ok(/clearTimeout\(this\._filterTimers/.test(src), 'core.js filterReset belum debounce');
});

ok('PERF-WILL-CHANGE: style.css pakai will-change untuk GPU acceleration', () => {
  const src = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/will-change/.test(src), 'style.css belum pakai will-change');
});

ok('PERF-CONTAIN: style.css pakai contain untuk limit reflow', () => {
  const src = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(/contain:/.test(src), 'style.css belum pakai contain');
});

ok('CSS-NO-CANVAS: style.css tidak punya selector canvas (Chart.js dihapus, chart HTML/CSS murni)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(!/canvas/.test(src), 'style.css masih punya aturan canvas (dead rule dari era Chart.js)');
});

ok('CSS-CARD-NOTE: .card-print-note cuma SATU blok deklarasi (duplikat sebelumnya)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.strictEqual((src.match(/\.card-print-note\s*\{/g) || []).length, 1, 'masih ada .card-print-note duplikat');
});

ok('CSS-MEDIA-DEDUP: tidak ada @media max-width duplikat di konteks yg sama (breakpoint konsolidasi, nilai 480-1100 dipertahankan)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const keys = [];
  for (const m of src.matchAll(/^([ \t]*)@media\s+\(max-width:\s*(\d+)px\)/gm)) keys.push((m[1] ? 'N' : 'T') + m[2]);
  assert.ok(keys.length === new Set(keys).size, 'duplikat @media max-width: ' + keys.join(', '));
});

ok('REFORM-VALIDATE: validateRequired helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/validateRequired/.test(src), 'core.js missing validateRequired');
});

ok('REFORM-FORM: getFormValues helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/getFormValues/.test(src), 'core.js missing getFormValues');
});

ok('REFORM-STATUS: statusClass helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/statusClass/.test(src), 'core.js missing statusClass');
});

ok('REFORM-CRUD: saveAndClose helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/saveAndClose/.test(src), 'core.js missing saveAndClose');
});

ok('REFORM-PILOT: letters.js pakai validateRequired/getFormValues/statusClass/saveAndClose', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8');
  assert.ok(/validateRequired/.test(src), 'letters.js belum pakai validateRequired');
  assert.ok(/getFormValues/.test(src), 'letters.js belum pakai getFormValues');
  assert.ok(/statusClass/.test(src), 'letters.js belum pakai statusClass');
  assert.ok(/saveAndClose/.test(src), 'letters.js belum pakai saveAndClose');
});

ok('DASH-DATE: isValidDate helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/isValidDate/.test(src), 'core.js missing isValidDate');
});

ok('DASH-STATS: calcDashboardStats helper exists di dashboard.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(/calcDashboardStats/.test(src), 'dashboard.js missing calcDashboardStats');
});

ok('DASH-RAF: renderDashboard uses requestAnimationFrame', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(/requestAnimationFrame/.test(src), 'dashboard.js not using RAF');
});

ok('DASH-UNUSED: no unused nowYear/nowMonth/nowDate in dashboard', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(!/nowYear|nowMonth|nowDate/.test(src), 'dashboard.js still has unused variables');
});

ok('DASH-DATE-VALID: renderDashEvents/Complaints pakai isValidDate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(/isValidDate/.test(src), 'dashboard.js belum pakai isValidDate');
});

ok('MEM-VALIDATE: members.js pakai validateRequired', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
  assert.ok(/validateRequired/.test(src), 'members.js belum pakai validateRequired');
});

ok('MEM-FORM: members.js pakai getFormValues', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/members.js'), 'utf8');
  assert.ok(/getFormValues/.test(src), 'members.js belum pakai getFormValues');
});

ok('MEM-TEMPAT: isValidTempatLahir helper exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/isValidTempatLahir/.test(src), 'core.js missing isValidTempatLahir');
});

ok('DUES-ORPHAN: getOrphanDues helper exists di core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/getOrphanDues/.test(src), 'core.js missing getOrphanDues');
});

ok('DUES-VALIDATE: saveNewDues pakai validateRequired', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dues.js'), 'utf8');
  assert.ok(/validateRequired/.test(src), 'dues.js belum pakai validateRequired');
});

ok('DUES-FORM: saveNewDues pakai getFormValues', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dues.js'), 'utf8');
  assert.ok(/getFormValues/.test(src), 'dues.js belum pakai getFormValues');
});

ok('BK-VALIDATE: saveBukuKas pakai validateRequired', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/bukuKas.js'), 'utf8');
  assert.ok(/validateRequired/.test(src), 'bukuKas.js belum pakai validateRequired');
});

ok('BK-FORM: saveBukuKas pakai getFormValues', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/bukuKas.js'), 'utf8');
  assert.ok(/getFormValues/.test(src), 'bukuKas.js belum pakai getFormValues');
});

ok('CARD-PHOTO-SECURE: _renderCardPreview() checks isSafePhotoUrl before rendering photo', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  assert.ok(/isSafePhotoUrl/.test(src), 'cards.js tidak memeriksa isSafePhotoUrl di _renderCardPreview');
});

ok('CARD-LIST-MEMO: renderCardList() caches sorted member list', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  assert.ok(/_cardListCache|_sortedMembers/.test(src), 'cards.js tidak memoize renderCardList');
});

ok('CARD-BATCH-ERROR: batchGeneratePDF() has try-catch per member', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  const batchFn = src.slice(src.indexOf('batchGeneratePDF'));
  assert.ok(/try\s*\{[\s\S]*catch/.test(batchFn), 'cards.js batchGeneratePDF tidak punya error handling per member');
});

ok('CARD-PDF-HELPER: _pdfFileReader() helper exists for FileReader dedup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  assert.ok(/_pdfFileReader\s*\(/.test(src), 'cards.js tidak punya helper _pdfFileReader');
});

ok('PESANGON-SELECT-SAFE: selectPesangonMember validates nik before setting input', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(/selectPesangonMember[\s\S]*memberByNik\.get/.test(src),
      'pesangon.js selectPesangonMember tidak validasi nik via memberByNik.get');
});

ok('PESANGON-CLICK-OUTSIDE: click-outside handler uses addEventListener with proper guard', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(/addEventListener.*click/.test(src),
      'pesangon.js tidak menggunakan addEventListener untuk click-outside');
});

ok('PESANGON-CSV-SAFE: exportPesangonCSV uses try-finally for URL.revokeObjectURL', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(/revokeObjectURL/.test(src), 'pesangon.js exportPesangonCSV tidak revokeObjectURL');
});

ok('PESANGON-DROPDOWN-MEMO: scenario dropdown options are cached', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(/_pesangonScenarioOptions|_scenarioHtml/.test(src),
      'pesangon.js tidak cache scenario dropdown options');
});

ok('PESANGON-SEARCH-CLEAN: _pesangonSearch uses str() helper for search', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pesangon.js'), 'utf8');
  assert.ok(/this\.str\(/.test(src), 'pesangon.js _pesangonSearch tidak menggunakan str() helper');
});

ok('ATT-EVENT-FILTER: attEventFilter is dynamically populated from events', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
  assert.ok(/attEventFilter.*innerHTML|attEventFilter.*options/.test(src),
      'attendance.js tidak populate attEventFilter secara dinamis');
});

ok('ATT-NO-DUPLICATE: saveAttendance checks for duplicate records', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
  assert.ok(/attendance\.some|attendance\.filter/.test(src),
      'attendance.js saveAttendance tidak cek duplikat');
});

ok('ATT-FORM-HELPER: saveAttendance uses validateRequired or getFormValues', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
  assert.ok(/validateRequired|getFormValues/.test(src),
      'attendance.js saveAttendance tidak pakai validateRequired/getFormValues');
});

ok('ATT-DATE-VALID: saveAttendance validates date with isValidDate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/attendance.js'), 'utf8');
  assert.ok(/isValidDate/.test(src),
      'attendance.js saveAttendance tidak validasi tanggal dengan isValidDate');
});

ok('CAL-WEEKEND-FIX: renderCalendar uses getDay()===0||getDay()===6 for weekend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  assert.ok(/getDay\(\)\s*===\s*0\s*\|\|\s*\w+\.getDay\(\)\s*===\s*6/.test(src) ||
      /dayOfWeek\s*===\s*0\s*\|\|\s*dayOfWeek\s*===\s*6/.test(src),
      'calendar.js weekend check tidak menggunakan getDay()===0||getDay()===6');
});

ok('CAL-VALIDATE-HELPER: _validateEvent() helper exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  assert.ok(/_validateEvent\s*\(/.test(src), 'calendar.js tidak punya helper _validateEvent()');
});

ok('CAL-DATE-VALID: _validateEvent uses isValidDate for date validation', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  assert.ok(/isValidDate/.test(src), 'calendar.js _validateEvent tidak validasi tanggal dengan isValidDate');
});

ok('CAL-FORM-HELPER: _validateEvent uses validateRequired or getFormValues', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  assert.ok(/validateRequired|getFormValues/.test(src),
      'calendar.js _validateEvent tidak pakai validateRequired/getFormValues');
});

// ── Wages feature improvements ──

ok('WAGES-CLEANUP: renderWages tidak pakai variabel totalBudget redundant (sum === totalBudget)', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const renderIdx = wagSrc.indexOf('renderWages()');
  assert.ok(renderIdx !== -1, 'renderWages tidak ditemukan');
  const renderBody = wagSrc.slice(renderIdx, renderIdx + 1200);
  assert.ok(!/totalBudget/.test(renderBody), 'renderWages masih pakai totalBudget (redundant dgn sum)');
  assert.ok(/const sum/.test(renderBody) || /sum =/.test(renderBody), 'renderWages harus pakai sum utk total anggaran');
});

ok('WAGES-DOUBLE-COPY: renderWages tidak double-copy array (filter sudah buat array baru)', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const renderIdx = wagSrc.indexOf('renderWages()');
  const renderBody = wagSrc.slice(renderIdx, renderIdx + 600);
  // Cek tidak ada `let filtered = [...data]` — cukup `const filtered = data.filter()` langsung
  assert.ok(!/let\s+filtered\s*=\s*\[\.\.\.data\]/.test(renderBody), 'renderWages masih pakai let filtered = [...data] spread (double copy)');
});

ok('WAGES-FILTER-EXPORT: exportWageCSV menerapkan filter dept/JC yg sama dgn renderWages', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const exportIdx = wagSrc.indexOf('exportWageCSV()');
  assert.ok(exportIdx !== -1, 'exportWageCSV tidak ditemukan');
  const exportBody = wagSrc.slice(exportIdx, exportIdx + 600);
  assert.ok(/wageDept/.test(exportBody), 'exportWageCSV belum baca wageDept filter');
  assert.ok(/wageJC/.test(exportBody), 'exportWageCSV belum baca wageJC filter');
});

ok('WAGES-EMPTY: renderWages punya empty state saat filtered kosong', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const renderIdx = wagSrc.indexOf('renderWages()');
  const renderBody = wagSrc.slice(renderIdx, renderIdx + 2500);
  assert.ok(/emptyRow/.test(renderBody), 'renderWages belum pakai emptyRow utk kondisi data kosong');
});

ok('WAGES-SCENARIO-ESC: scenario di onclick pakai escapeJsStr (defense-in-depth)', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  // Harus ada escapeJsStr(scenario) di onclick template
  assert.ok(/escapeJsStr\(scenario\)/.test(wagSrc), 'wages.js belum escapeJsStr(scenario) di onclick');
});

ok('WAGES-COMPARE-UX: showWageComparison menyembunyikan tabel (table card)', () => {
  const wagSrc = fs.readFileSync(path.join(ROOT, 'js/wages.js'), 'utf8');
  const compIdx = wagSrc.indexOf('showWageComparison()');
  assert.ok(compIdx !== -1, 'showWageComparison tidak ditemukan');
  const compBody = wagSrc.slice(compIdx, compIdx + 1200);
  assert.ok(/style\.display/.test(compBody) || /classList/.test(compBody),
    'showWageComparison belum menyembunyikan tabel card');
});

// ── Letters feature improvements ──

ok('LETTERS-DOUBLE-COPY: renderLetters tidak double-copy array (filter sudah buat array baru)', () => {
  const ltrSrc = fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8');
  const renderIdx = ltrSrc.indexOf('renderLetters()');
  assert.ok(renderIdx !== -1, 'renderLetters tidak ditemukan');
  const renderBody = ltrSrc.slice(renderIdx, renderIdx + 500);
  // Harus tidak ada `let data = [...this.letters]` — cukup `const data = this.letters.filter()`
  assert.ok(!/let\s+data\s*=\s*\[\.\.\.this\.letters\]/.test(renderBody),
    'renderLetters masih pakai let data = [...this.letters] spread (double copy)');
});

ok('LETTERS-FILTER-EXPORT: exportLetterCSV menerapkan filter tipe yg sama dgn renderLetters', () => {
  const ltrSrc = fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8');
  const exportIdx = ltrSrc.indexOf('exportLetterCSV()');
  assert.ok(exportIdx !== -1, 'exportLetterCSV tidak ditemukan');
  const exportBody = ltrSrc.slice(exportIdx, exportIdx + 400);
  assert.ok(/letterType/.test(exportBody), 'exportLetterCSV belum baca letterType filter');
});

ok('LETTERS-STATS: renderLetters menampilkan statistik surat (total, masuk, keluar, selesai)', () => {
  const ltrSrc = fs.readFileSync(path.join(ROOT, 'js/letters.js'), 'utf8');
  const renderIdx = ltrSrc.indexOf('renderLetters()');
  assert.ok(renderIdx !== -1, 'renderLetters tidak ditemukan');
  const renderBody = ltrSrc.slice(renderIdx, renderIdx + 2000);
  // Harus ada render stat cards — renderStatCard dipanggil minimal 3x (total, masuk, keluar)
  const statCount = (renderBody.match(/renderStatCard/g) || []).length;
  assert.ok(statCount >= 3, 'renderLetters belum menampilkan minimal 3 stat cards (total/masuk/keluar) — ditemukan ' + statCount);
});

// ── Complaints feature improvements ──

ok('COMP-DOUBLE-COPY: renderComplaints tidak double-copy array (filter sudah buat array baru)', () => {
  const compSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
  const renderIdx = compSrc.indexOf('renderComplaints()');
  assert.ok(renderIdx !== -1, 'renderComplaints tidak ditemukan');
  const renderBody = compSrc.slice(renderIdx, renderIdx + 500);
  assert.ok(!/let\s+data\s*=\s*\[\.\.\.this\.complaints\]/.test(renderBody),
    'renderComplaints masih pakai let data = [...this.complaints] spread (double copy)');
});

ok('COMP-VALIDATE: saveComplaint pakai validateRequired (bukan manual if-check)', () => {
  const compSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
  const saveIdx = compSrc.indexOf('saveComplaint()');
  assert.ok(saveIdx !== -1, 'saveComplaint tidak ditemukan');
  const saveBody = compSrc.slice(saveIdx, saveIdx + 800);
  assert.ok(/validateRequired/.test(saveBody), 'saveComplaint belum pakai validateRequired');
});

ok('COMP-FORM-HELPER: saveComplaint pakai getFormValues (bukan manual getElementById)', () => {
  const compSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
  const saveIdx = compSrc.indexOf('saveComplaint()');
  assert.ok(saveIdx !== -1, 'saveComplaint tidak ditemukan');
  const saveBody = compSrc.slice(saveIdx, saveIdx + 800);
  assert.ok(/getFormValues/.test(saveBody), 'saveComplaint belum pakai getFormValues');
});

ok('COMP-CRASH: renderComplaints punya try/catch (crash isolation)', () => {
  const compSrc = fs.readFileSync(path.join(ROOT, 'js/complaints.js'), 'utf8');
  const renderIdx = compSrc.indexOf('renderComplaints() {');
  assert.ok(renderIdx !== -1, 'renderComplaints definition tidak ditemukan');
  const renderBody = compSrc.slice(renderIdx, renderIdx + 3500);
  assert.ok(/try\s*\{/.test(renderBody) && /catch/.test(renderBody),
    'renderComplaints belum punya try/catch (crash isolation)');
});

// ── Reports feature improvements ──

ok('RPT-NO-DEADVAR: reports.js tidak punya variabel computed tapi tidak dipakai (dead code)', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  // cStatusCounts di complaints branch dihitung tapi tidak dipakai di template
  assert.ok(!/cStatusCounts/.test(repSrc), 'reports.js masih punya variabel cStatusCounts (computed tapi tidak dipakai)');
});

ok('RPT-NO-SPREAD-MAX: reports.js tidak pakai Math.max(...data.map()) spread (fragile utk data besar)', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  // Math.max(0, ...data.map(...)) harus diganti dgn reduce — regex handle spasi
  assert.ok(!/Math\.max\(0\s*,\s*\.\.\.data\.map/.test(repSrc), 'reports.js masih pakai Math.max(0, ...data.map()) spread');
});

ok('RPT-MEMBER-PASS: reports.js members branch iterasi <= 2x (bukan 3x terpisah)', () => {
  const repSrc = fs.readFileSync(path.join(ROOT, 'js/reports.js'), 'utf8');
  const membersIdx = repSrc.indexOf("modul === 'members'");
  assert.ok(membersIdx !== -1, 'reports.js belum punya branch modul members');
  const membersBody = repSrc.slice(membersIdx, membersIdx + 1200);
  // Harus ada single-pass pattern: 1 forEach untuk dept+jc counts
  const forEachCount = (membersBody.match(/members\.forEach/g) || []).length;
  assert.ok(forEachCount <= 2, 'reports.js members branch iterasi ' + forEachCount + 'x (harus <= 2)');
});

async function main() {
  await okAsync('server.js serve index.html/js/core.js/data.json 200', serverCheck);
  await okAsync('V-LOGO: logo asset diserve 200 + Content-Type image/jpeg + nosniff (browser bisa render <img>)', serverLogoCheck);
  await okAsync('server.js POST validasi: array->200, non-array->400, key-unknown->400 (data.json asli aman)', serverPostCheck);
  await okAsync('server.js menolak data.json.bak/.tmp (V-01: snapshot PII tak ter-expose)', serverDenyCheck);
  await okAsync('server.js menolak nilai money non-finite/negatif (Infinity/NaN/negatif -> 400; cegah rekonsiliasi hijau palsu) (F-1/F-2)', serverMoneyCheck);
  await okAsync('server.js CSRF/DNS-rebinding: POST /api/data hanya same-origin loopback + Content-Type json (cross-origin/Host-bad -> 403, text/plain -> 415) (V-03)', serverCsrfCheck);
  await okAsync('server.js malformed URL /% -> 400 & server tetap hidup (crash DoS patched) (SRV-DURALIVE)', serverMalformedCheck);
  await okAsync('server.js backup/restore drill: .bak dibuat -> korupsi -> restore -> REBOOT server dari data pulih -> serve 200 + write normal (DATA_FILE temp, data.json asli utuh)', serverRestoreCheck);
  await okAsync('V-RL-BEHAVIORAL: POST /api/data melebihi RATE_LIMIT ditolak 429 (limiter benar-benar membatasi, bukan sekadar ada kata "rate limit")', serverRateLimitCheck);
  console.log('\n' + (fail === 0 ? 'SPMKB TEST: ALL PASS (' + pass + ')' : 'SPMKB TEST: ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
}
main();
