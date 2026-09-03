# SPMKB — AGENTS.md

Static SPA for a labor union's member data (429 workers, PII). **No build step, no npm deps** — pure static files + a Node stdlib server. There is **no root package.json** (the app has no npm dependencies); `.opencod/package.json` is OpenCode-agent config only, not project code.

## Serve (HTTP only — `file://` fetch fails with CORS)

```bash
node server.js          # http://127.0.0.1:9000  (PORT env to change)
```

`python3 -m http.server 9000` works read-only; the app falls back to localStorage and **/data.json is NOT auth-gated** under it — but writes never persist.

### Auth (MANDATORY — not in server.js comment, easy to miss)
`POST /api/data` and `GET /data.json` both require a bearer token. The server sets
`AUTH_PASSWORD = process.env.SPMKB_AUTH_PASSWORD || 'spmkb123'` (default is weak — **override in prod**).
- Run: `SPMKB_AUTH_PASSWORD='…' node server.js`
- The browser never hardcodes it: `index.html` has a **login gate** (`body.spmkb-locked` + `#spmkbLoginGate` + inline `#spmkb-login-script`). You type the password; the script verifies it by `fetch('data.json', {headers:{Authorization:'Bearer '+pw}})` (200 = unlock), then calls `startApp(pw)`. Token lives only in sessionStorage for the tab; 5-attempt lockout over 30s. A `#spmkbLogout` button reloads.

**CDN (2, not 3):** Font Awesome 6.4.0 + jsPDF 2.5.1. **Chart.js and anime.js are deleted** — every chart is hand-rolled HTML/CSS (`html-chart-container`, `html-doughnut`/`html-bar-chart` with CSS conic-gradient; no `<canvas>`). The old "3 CDN including Chart.js" claim is stale.

**Dark mode:** `toggleDarkMode()` sets `data-theme="dark"` on `<html>`, persisted in `localStorage['spm_theme']`, re-applied on boot by `_applyTheme()`. CSS variables under `[data-theme="dark"]` in `style.css`.

## Structure
- `js/core.js` — `SPMApp` class (state, persistence, nav, utils) + helpers `emptyRow`/`badge`/`pageSlice`/`openModal`/`csvEsc`/`formatRupiah`/`parseBirth`/`normalizeBirth`/`normalizeMonth`/`computeAge`/`iuranBulanan`/`thisMonthDuesTotal`/`collectedDuesTotal`/`duesRowsForSelectedMonth`/`escapeHtml`/`escapeJsStr`/`isSafePhotoUrl`/`isSafeFileUrl`/`str`/`validateRequired`/`getFormValues`.
- Domain files (`members/dues/bukuKas/sanksi/cards/attendance/calendar/wages/letters/complaints/dashboard/reports/pesangon.js`) attach via `Object.assign(SPMApp.prototype, {...})`.
- `js/wage-data.js` — UMD module; `hydrateWageData()` normalizes `data.json` wage scenarios (Pertemuan1–5) on load.
- `js/app.js` = entry: `let App; function startApp(authToken) { App = new SPMApp(authToken); }`.
- **New page rule:** register in 3 places or it breaks — `index.html` sidebar `.nav-item[data-page]` + `core.js titles` + `core.js renderPage` map.
- `data.json` + `data-src/` are **git-ignored** (PII, never commit — see `.gitignore`). `data.json` ships wage scenarios (Pertemuan1–5) + roster (429 = 428 Excel + Andre, NIK 12220009); operational keys (`members`,`dues`,`events`,`attendance`,`letters`,`complaints`,`deletedNiks`,`sanksi`,`bukuKas`) are written at runtime.

## Verify (single source of truth)
```bash
node --check js/*.js server.js test.js   # syntax
node test.js                              # 275 guards, must ALL pass
```
(test spawns `server.js` on port 9457, reads `data.json`, POST-tests use a `DATA_FILE` temp file so **real data.json is never written**.) Guard-tag scheme: `P/R/S/GK/GD/GM/GX/V` plus ad-hoc tags (`S26`/`R-NAV`/`NUM`/`V-LOGO`/`V-03`/`TC-1..6`/`F-1..3`); see `test.js` for the full list. **Never hand-edit a guard to dodge a failure.**

### TDD + guard-proof workflow
Add the guard in `test.js` first (RED), implement (GREEN), then revert to prove it fails. **Anchor trap:** slice method *definitions*, not call-sites — `renderMembers(search = '') {` needs `indexOf('renderMembers(')`, not `'renderMembers() {'`. After reverting, open the slice and confirm it still contains the asserted token (a token left in a comment still passes).

## Server invariants (don't weaken) — server.js
- Binds `127.0.0.1` only.
- Containment via `path.relative(ROOT, file)` (not `startsWith`).
- Hard 403: `data.json.bak/.tmp`, `.git/`, `.env`.
- `GET /data.json` → 401 without valid `Authorization: Bearer` (timing-safe equal).
- `POST /api/data`: `Content-Type` must `startsWith('application/json')` else 415; `Host` must be loopback (`127.0.0.1`/`localhost`) else 403; `Origin`/`Referer` must be loopback-or-absent else 403 (V-03 CSRF/DNS-rebinding). Rate-limited (30/min/IP → 429).
- Trust boundary: each `value` must be an array of **objects** (not primitives/null), ≤5000 elements (413); key must be in the whitelist `['members','dues','events','attendance','letters','complaints','deletedNiks','sanksi','bukuKas']`.
- MONEY fields (`gaji_pokok_2025/iuranBulanan/total_kenaikan/gaji_pokok_2026` on members; `jumlah` on dues; `debit`/`kredit` on bukuKas) must be finite & ≥0 else 400 (F-1/F-2).
- Atomic write: `data.json.tmp` → rename, rotates `.bak` first. `DATA_FILE` env overrides (test.js uses it to avoid touching real `data.json`).
- Headers on all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. Static assets cache 5 min; `data.json` is `no-store`.

## Data model (the traps)
- **Persistence:** `saveLocal(key,data)` → `localStorage` sync + debounced (180 ms coalescing) `POST /api/data`. Every `save*` is wrapped in try/catch (P8).
- **Roster merge-by-NIK on every load** (`seedSampleData`): manual edits survive; Pertemuan1 adds/removals propagate; `deletedNiks` keeps deleted deleted; `_manual` members always kept.
- **NIK = 8 digits** (`/^\d{8}$/`). Duplicate NIK rejected. `dues.id = ${nik}-${bulan}`.
- **"Iuran Bulan Ini" = PROYEKSI payroll** (Σ `iuranBulanan`), via ONE core helper `thisMonthDuesTotal()` — used by dashboard `statDues` AND dues page `duesThisMonth` so they can never diverge (NUM guard). `dues` page `renderDues()` AND `renderBukuKas()` both run (two separate tables).
- **"Iuran ↔ Buku Kas" sync was DELETED** — README's reconciliation section is stale. `bukuKas` is a manual ledger; nothing auto-syncs `iuran` into it. The `sourceDuesId` checks in `bukuKas.js` (`editBukuKas`/`deleteBukuKas`) are **vestigial** guards from the removed sync feature — keep them, do not rip out.
- `duesRowsForSelectedMonth()` (core.js) is the **single source** for both `renderDues` (view) and `exportDuesCSV` (export) — projection by selected month/year (default current month), Map-by-nik lookup. `exportDuesCSV` exports these rows, NOT raw `this.dues` (which is empty in the projection model → toast "Tidak ada data").
- Month keys normalized via `normalizeMonth()` (`2026-8`→`2026-08`) on save + filter.
- **`tanggalLahir` canonical = `DD-MM-YYYY` (dash):** form input unified via `normalizeBirth()` (slash→dash); other delimiters rejected (GK-SLASH/GK-DATE). `parseBirth` splits on `-` only — never store slashes.
- **`tempatLahir` = place name (kota/kabupaten, e.g. SUBANG), not a date:** GK-PLACE rejects `DD-MM-YYYY`-shaped values and anything equal to `tanggalLahir`.
- **Global search (`#globalSearch`) is the only search.** It searches across all modules (members, dues, attendance, letters, complaints, wages) and navigates directly to the specific record (e.g. `viewMember(id)`, `viewDuesDetail(id)`) — not just to the page. No separate table search exists.
- **Sortable members table:** click `th[data-sort]` → `bindEvents` sets `sortField`/toggles `sortDir`, resets page, re-renders; comparator applies `dir==='asc'?1:-1`.
- **Youth filter** (members page `memYouthFilter` AND dashboard `statActive`) MUST both use `(this.computeAge(m) ?? Infinity) <= 35` — keep identical, no local variant.
- **Dashboard GC-DASH clickables:** 4 stat cards → `showPage('members'/'dues'/'calendar')`; "Kegiatan Mendatang" → `showPage('calendar')`; "Pengaduan Terbaru" → `viewComplaint('${this.escapeJsStr(c.id)}')` (reuses existing modal).

## Editing rules & traps (XSS/CSV/numeric)
- `innerHTML` via template strings: **every user value → `escapeHtml()`**; any `onclick="App.foo('${id}')"` JS-sink → **`escapeJsStr()`** (never escapeHtml there). Server validates only array/object-ness, so **any field is attacker-reachable via POST** — escaping is the only XSS defense. Modal title = `textContent`; body/footer = `innerHTML` (escape).
- P0 guards (all GREEN): `badge()` class token alnum-sanitized; `isSafePhotoUrl` (raster/https only, reject `data:image/svg+xml`); `isSafeFileUrl` (http(s) only); `String(e.date).startsWith` (TC-1); `str()` for search (TC-2); `id=String(id)` in delete/view (TC-3); `Number.isFinite(+m.id)` in `saveNewMember` (TC-4); `String(m.nama)` in `generateCard` (TC-5); server money finite/≥0 (F-1/F-2).
- **Hotspot:** never `array.find()` inside a per-item `.map` — build a `Map` first (dues render is O(members×dues) otherwise).
- **Money reduce precedence (NUM):** reduce body is `s+(Number(d.jumlah)||0)` — NOT `s+Number(d.jumlah)||0` (that parses as `(s+...)||0`; one NaN resets acc to 0). `+=` is safe.
- **CSV formula-injection guard lives in ONE place** — `csvEsc(v)` prepends `'` to `[=+\-@]`, shared by `exportToCSV` and `pesangon.exportPesangonCSV`. Do NOT re-dupe a local `esc` or strip the guard (S8/S26/UNIT).
- `emptyRow`/`badge`/`pageSlice`/`openModal`/`formatRupiah` exist — reuse, don't rewrite.
