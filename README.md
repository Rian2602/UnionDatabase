# SPM Kecap Bango (SPMKB) — Pusat Data Serikat Pekerja

> ⚠️ **PROYEK INTERNAL-ONLY.** Aplikasi ini menyimpan data pribadi (PII) ratusan pekerja:
> NIK, upah, alamat, tanggal lahir. **DILARANG** mempublikasikan, meng-commit, atau
> membagikan data ini ke luar organisasi. Lihat kebijakan di bawah.

Database manajemen data Serikat Pekerja Mandiri (SPM) Kecap Bango, PT. Anugrah Mutu
Bersama. Aplikasi web statis tanpa build step dan tanpa dependency pihak ketiga di sisi
server — cukup Node.js standar.

## Menjalankan

App memuat data via `fetch('data.json')` yang **gagal diam-diam** pada protokol `file://`
(blok CORS). Wajib dilayani lewat HTTP dari root repo — gunakan server bawaan:

```bash
SPMKB_AUTH_PASSWORD='gunakan-kata-sandi-kuat' node server.js
```

Server tetap terikat ke `127.0.0.1`; kata sandi lingkungan wajib untuk membaca `data.json` dan menulis melalui `POST /api/data`.

Alternatif hanya-baca (fallback ke localStorage, baca saja):

```bash
python3 -m http.server 9000
```

## Visual Design

**Swiss Brutalist Green** — grid editorial, typography hierarchy kuat, border tegas,
palette hijau Bango-inspired (`--green-950: #073b32`, `--lime: #c9d43a`).
Dashboard punya editorial masthead + quick actions. Responsive 3 breakpoints
(1100/820/520px) + print styles.

## Struktur

- `index.html` — kerangka SPA, semua seksi halaman ada di sini; editorial masthead di dashboard
- `style.css` — Swiss Brutalist Green palette; CSS variables; grid editorial; responsive
- `js/*.js` — kode aplikasi, dipisah per domain:
  - `core.js` — kelas `SPMApp` + state + persistensi + navigasi + util
  - `members.js`, `dues.js`, `bukuKas.js`, `sanksi.js`, `cards.js`, `attendance.js`,
    `calendar.js`, `wages.js`, `letters.js`, `complaints.js`, `dashboard.js`,
    `reports.js`, `pesangon.js`
  - `app.js` — titik masuk: `const App = new SPMApp()`
- `server.js` — server statis Node stdlib + `POST /api/data` (write-back, berantre, atomik)
- `data.json` — data runtime (di-`gitignore`, TIDAK di-commit)
- `data-src/` — **sumber data mentah (PII)**, di-`gitignore`, TIDAK di-commit
- `test.js` — regression suite (275 guards), single source of truth untuk invariants

## 11 Modul Fitur

| Modul | Fungsi | CRUD | Export | Filter |
|---|---|---|---|---|
| Dashboard | Ringkasan visual + charts | Read-only | — | — |
| Data Keanggotaan | Kelola 429 anggota + denda/sanksi per anggota | ✅ | ✅ CSV | Dept/Status/JC/Gender/Youth |
| Iuran & Keuangan | Iuran bulanan + Buku Kas (manual) | ✅ | ✅ CSV | Bulan/Tahun |
| Kartu Anggota | Generate + cetak kartu | Read-only | ✅ PDF + Print | Search |
| Absensi Kehadiran | Tracking kehadiran | ✅ | ✅ CSV | Kegiatan/Status |
| Kalender Kegiatan | Jadwal rapat/aksi | ✅ | — | — |
| Perundingan Upah | Analisis 5 skenario gaji | Read-only | ✅ CSV | Skenario/Dept |
| Surat & Dokumen | Manajemen surat | ✅ | ✅ CSV | Tipe |
| Pengaduan & Aspirasi | Sistem pengaduan | ✅ | — | Kategori/Status |
| Laporan & Statistik | Analisis data | Read-only | ✅ PDF | Modul/Tanggal |
| Simulasi Pesangon | 25 skenario PHK | Simulasi | ✅ CSV | Search Anggota |

## Arsitektur data

Data disimpan sebagai satu file `data.json` dengan dua arah (baca/tulis):
- **Membaca:** app men-`fetch('data.json')`; koleksi di-hydrate dari key-nya.
- **Menulis:** setiap mutasi lewat `saveLocal(key, data)` → perbarui mirror `localStorage`
  DAN `POST /api/data`; server menulis atomik (`data.json.tmp` → rename), merotasi file
  sebelumnya ke `data.json.bak`. Hanya key ter-whitelist yang diterima; batas body 5 MB.
- Key operasional: `members`, `dues`, `events`, `attendance`, `letters`, `complaints`,
  `deletedNiks`, `sanksi`, `bukuKas`. Skenario upah `Pertemuan1–5` dimuat baca-saja.

Sinkronisasi roster berjalan **merge-berdasarkan-NIK** tiap muat: edit manual selamat,
penambahan/pengurangan dari sumber propagasi, anggota yang dihapus tetap terhapus via
`deletedNiks`, anggota tambahan manual (`_manual`) selalu dipertahankan.

## Simulasi Pesangon

Modul simulasi perhitungan hak pesangon berdasarkan dokumen PHK perusahaan:
- **25 skenario PHK** dengan multiplier UP/UPMK yang berbeda
- **Masa kerja otomatis** dari NIK dengan adjustment (1220xxxx → -2 thn, 1221-1223xxxx → -1 thn)
- **Komponen:** UP (skala × pengali × upah), UPMK, UPH (15% atau 0), Uang Pisah (1 × upah)
- **Tunjangan tetap:** JC 4A/B = Rp800.000, lainnya = Rp625.000
- **Comparison mode:** bandingkan 2 skenario side-by-side
- **Disclaimer:** Belum termasuk pajak, sisa cuti yang belum diambil, dan uang transport ke tempat asal
- **Export CSV** memakai guard anti formula-injection `csvEsc` (`= + - @`) miliknya sendiri di `exportPesangonCSV()`

## Sanksi Anggota

Modul `js/sanksi.js` untuk denda/punishment per anggota, ditampilkan di **detail anggota**
(Data Keanggotaan). Tanggal berakhir sanksi (`berakhirSanksi`) bersifat **turunan, tidak
disimpan**: masa STT/SP1/SP2 = 3 bulan, SP3 = 6 bulan, dibulatkan ke akhir bulan tanpa
`setMonth`-rolling.

## Keamanan

- **XSS defense:** Every user value → `escapeHtml()`. onclick ID sinks → `escapeJsStr()` + `id = +id` type coercion.
- **Server security:** `path.relative()` containment, KEYS whitelist, Array.isArray + element-is-object, .bak/.tmp deny, HOST=127.0.0.1 only.
- **Security headers:** `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` on all responses.
- **CSV injection prevention:** `csvEsc` prepends `'` to values starting with `= + - @`.
- **NIK validation:** 8-digit format (`^\d{8}$`), duplicate check.
- **Error handling:** All save functions have try/catch to prevent silent data loss.

## Kebijakan

- **Kerahasiaan data:** NIK, upah, alamat, dan tanggal lahir pekerja adalah data sensitif.
  `data.json` dan seluruh isi `data-src/` di-`gitignore`; **jangan pernah** `git add -f`
  atau menyalinnya ke luar.
- **Verifikasi:** `node --check` pada semua `js/*.js` + `server.js` + `test.js`.
  Uji otomatis: `node test.js` (275 guards harus semua PASS).
- **TDD workflow:** tambah guard di `test.js` dulu (RED), implement (GREEN), buktikan revert gagal.
- **Hak akses:** server hanya berjalan di 127.0.0.1. Jangan ubah `HOST` ke jaringan LAN
  sebelum menambahkan otentikasi.
