/* SPM Kecap Bango - Core: state, persistence, navigation, utils */
class SPMApp {
    constructor(authToken) {
        this.authToken = authToken;
        this.wageData = {};
        this.members = [];
        this.memberByNik = new Map(); // O(1) NIK lookup — rebuilt on member mutations
        this.dues = [];
        this.events = [];
        this.attendance = [];
        this.letters = [];
        this.complaints = [];
        this.sanksi = [];
        this.bukuKas = [];
        this.calDate = new Date();
        this.pages = { members: 1, dues: 1, attendance: 1, letters: 1, complaints: 1, wages: 1, bukuKas: 1 };
        this.sortField = 'no'; this.sortDir = 'asc';
        this.ITEMS = 20;
        this._saveTimers = {}; // debounced POST per key
        this._birthCache = new Map(); // PERF: cache parseBirth results by NIK
        this._filterTimers = {}; // PERF: debounce filter changes
        this.init();
    }
    async init() {
        await this.loadData();
        this.seedSampleData();
        this.rebuildMemberIndex();
        this._buildSearchIndex();
        this._applyTheme();
        this._bindKeyboard();
        this.bindEvents();
        this.populateAllFilters();
        try { this.renderDashboard(); } catch (e) { console.error('Dashboard render failed:', e); this.showToast('Beberapa grafik gagal dimuat. Fitur lain tetap berfungsi.', 'error'); }
    }
    /** Rebuild NIK → member Map after any members[] mutation */
    rebuildMemberIndex() {
        this.memberByNik = new Map(this.members.map(m => [String(m.nik), m]));
    }
    /** Safe photo URL: only https or data:image/{png,jpeg,jpg,gif,webp} raster - blocks local-network requests, javascript:, svg+xml */
    isSafePhotoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const s = url.trim();
        if (s.length > 500000) return false; // guard oversized data URLs
        return /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(s);
    }
    /** Safe file URL for href download: only http(s) — blocks javascript:/data: schemes (XSS-3) */
    isSafeFileUrl(v) { return !!v && typeof v === 'string' && /^https?:\/\//i.test(v.trim()); }
    /** Safe string coercion for search/render: null/undefined -> "", otherwise String(v) — prevents .toLowerCase/.includes TypeError on non-string POST (TC-2) */
    str(v) { return (v === null || v === undefined) ? '' : String(v); }
    authHeaders() { return { Authorization: `Bearer ${this.authToken}` }; }
    async loadData() {
        try {
            const r = await fetch('data.json', { headers: this.authHeaders() });
            if (!r.ok) throw new Error(r.status);
            this.wageData = hydrateWageData(await r.json());
        } catch (e) { this.wageData = {}; }
    }
    getStoredArray(key) {
        try { return JSON.parse(localStorage.getItem(`spm_${key}`) || '[]'); }
        catch (e) { console.error(e); return []; }
    }
    loadDataLocal() {
        ['members', 'dues', 'events', 'attendance', 'letters', 'complaints', 'sanksi', 'bukuKas'].forEach(k => { this[k] = this.getStoredArray(k); });
    }
    saveLocal(key, data) {
        // localStorage always sync (offline-first); server POST debounced to coalesce rapid edits
        localStorage.setItem(`spm_${key}`, JSON.stringify(data));
        clearTimeout(this._saveTimers[key]);
        this._saveTimers[key] = setTimeout(() => {
            fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.authHeaders() }, body: JSON.stringify({ key, value: data }) })
                .then(r => { if (!r.ok) throw new Error(r.status); })
                .catch(() => console.warn(`SPMKB: server tidak terjangkau - '${key}' hanya tersimpan di localStorage`));
        }, 180);
    }
    seedSampleData() {
        const KEYS = ['members', 'dues', 'events', 'attendance', 'letters', 'complaints', 'sanksi', 'bukuKas'];
        let dirty = false;
        let membersDirty = false;
        // data.json = sumber utama; key yang belum ada di disk dimigrasi dari localStorage
        KEYS.forEach(k => {
            if (Array.isArray(this.wageData[k])) {
                this[k] = this.wageData[k];
            } else {
                this[k] = this.getStoredArray(k);
                if (this[k].length) dirty = true;
            }
        });
        this.deletedNiks = Array.isArray(this.wageData.deletedNiks) ? [...this.wageData.deletedNiks] : [];

        const base = this.wageData['Pertemuan1'] || [];
        // ponytail: merge-by-NIK jalan SETIAP load - edit manual selamat, roster Excel propagate, deletedNiks dicegah bangkit
        const localByNik = new Map(this.members.map(m => [m.nik, m]));
        const dead = new Set(this.deletedNiks);
        const baseNiks = new Set(base.map(r => r.nik));
        const beforeCount = this.members.length;
        this.members = this.members.filter(m => m._manual || (baseNiks.has(m.nik) && !dead.has(m.nik)));
        if (this.members.length !== beforeCount) membersDirty = true;
        base.forEach(r => {
            if (!localByNik.has(r.nik) && !dead.has(r.nik)) {
                membersDirty = true;
                this.members.push({
                    id: r.no, no: r.no, nama: r.nama, nik: r.nik, department: r.department,
                    bagian: r.bagian, jabatan: r.jabatan, jobclass: r.jobclass,
                    gaji_pokok_2025: r.gaji_pokok_2025, gaji_pokok_2026: r.gaji_pokok_2026,
                    total_kenaikan: r.total_kenaikan,
                    alamat: '',
                    tempatLahir: '',
                    tanggalLahir: '',
                    foto: null
                });
            }
        });
        this.members.forEach(m => { m.iuranBulanan = this.iuranBulanan(m); });

        // Database dimulai Agustus 2026 — kosongkan iuran sebelum bulan itu
        const beforeAg = this.dues.length;
        this.dues = this.dues.filter(d => this.normalizeMonth(d.bulan) >= '2026-08');
        if (this.dues.length !== beforeAg) dirty = true;
        // Force save ke localStorage agar pembersihan persistensi antar reload
        this.saveLocal('dues', this.dues);

        // Auto-generate iuran Agustus 2026 (bulan pertama) utk semua anggota — status Lunas, tgl bayar 1 Sep 2026
        const ag2026 = '2026-08';
        const hasAg = new Map(this.dues.filter(d => this.normalizeMonth(d.bulan) === ag2026).map(d => [d.nik, true]));
        if (this.members.length > 0 && !hasAg.size) {
            this.members.forEach(m => {
                this.dues.push({
                    id: `${m.nik}-${ag2026}`, nama: m.nama || '', nik: m.nik,
                    department: m.department || '', bulan: ag2026,
                    jumlah: m.iuranBulanan || 0, tanggalBayar: '2026-09-01', status: 'Lunas'
                });
            });
            dirty = true;
        }

        // ponytail: 7 POST terpisah (6 key + deletedNiks) di jalur seed - sengaja dibiarkan.
        // Hanya jalan saat dirty (migrasi legacy / delta roster), sekali di boot, di loopback (latency mikro-detik).
        // Gabung ke 1 POST batch bila ini pernah jadi bottleneck - butuh endpoint baru, YAGNI sekarang.
        if (dirty || membersDirty) {
            KEYS.forEach(k => this.saveLocal(k, this[k]));
            this.saveLocal('deletedNiks', this.deletedNiks);
        }
    }
    iuranBulanan(m) {
        const tunj = (m.jobclass || '').startsWith('4') ? 800000 : 625000;
        return Math.round((Number(m.gaji_pokok_2025) + tunj) * 0.01);
    }
    /** Collision-safe ID generator: Date.now() + random hex suffix */
    _nextId() {
        const rand = Math.random().toString(16).slice(2, 10);
        return Date.now().toString(36) + '-' + rand;
    }
    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', e => {
            e.preventDefault(); this.showPage(n.dataset.page);
        }));
        document.getElementById('menuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
        document.getElementById('closeSidebar')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));
        document.getElementById('globalSearch')?.addEventListener('input', e => this.debouncedGlobalSearch(e.target.value));
        document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
            const f = th.dataset.sort;
            if (this.sortField === f) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            else { this.sortField = f; this.sortDir = 'asc'; }
            this.pages.members = 1;
            this.renderMembers();
        }));
        this.updateSortAria();

        // Filter reset listeners
        const filterReset = (ids, stateKey, renderFn) => {
            ids.forEach(id => document.getElementById(id)?.addEventListener('change', () => {
                if (stateKey) this.pages[stateKey] = 1;
                // PERF: debounce filter changes to avoid rapid re-renders
                clearTimeout(this._filterTimers[stateKey]);
                this._filterTimers[stateKey] = setTimeout(() => renderFn.call(this), 100);
            }));
        };
        filterReset(['memDeptFilter','memJCFilter','memGenderFilter','memYouthFilter'], 'members', this.renderMembers);
        filterReset(['duesMonth','duesYear'], 'dues', this.renderDues);
        filterReset(['attEventFilter','attStatusFilter'], 'attendance', this.renderAttendance);
        filterReset(['letterType'], 'letters', this.renderLetters);
        filterReset(['compCategory','compStatus','compPriority'], 'complaints', this.renderComplaints);
        filterReset(['wageScenario','wageDept','wageJC'], 'wages', this.renderWages);
        filterReset(['reportModule','reportFrom','reportTo'], 'reports', this.renderReports);
    }
    showPage(page) {
        document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
        document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
        document.querySelector(`.nav-item[data-page="${page}"]`)?.setAttribute('aria-current', 'page');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(page)?.classList.add('active');
        document.getElementById('sidebar').classList.remove('active');

        const titles = {
            dashboard: ['Dashboard', 'Ringkasan data serikat pekerja'],
            members: ['Data Keanggotaan', 'Kelola data seluruh anggota'],
            dues: ['Iuran & Keuangan', 'Kelola iuran bulanan anggota'],
            cards: ['Kartu Anggota Digital', 'Generate dan cetak kartu anggota'],
            attendance: ['Absensi Kehadiran', 'Tracking kehadiran anggota'],
            calendar: ['Kalender Kegiatan', 'Jadwal kegiatan serikat'],
            wages: ['Perundingan Pengupahan', 'Analisis data perundingan gaji'],
            letters: ['Surat & Dokumen', 'Manajemen surat dan dokumen'],
            complaints: ['Pengaduan & Aspirasi', 'Sistem pengaduan anggota'],
            reports: ['Laporan & Statistik', 'Analisis data serikat'],
            pesangon: ['Simulasi Pesangon', 'Perhitungan hak pesangon berdasarkan PP 35/2021'],
        };
        const t = titles[page] || ['', ''];
        document.getElementById('pageTitle').textContent = t[0];
        document.getElementById('pageSubtitle').textContent = t[1];

        this.renderPage(page);
        const main = document.getElementById('mainContent');
        if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }); }
    }
    renderPage(page) {
        const map = {
            dashboard: () => this.renderDashboard(),
            members: () => this.renderMembers(),
            dues: () => { this.renderDues(); this.renderBukuKas(); },
            cards: () => this.renderCardList(),
            attendance: () => this.renderAttendance(),
            calendar: () => this.renderCalendar(),
            wages: () => this.renderWages(),
            letters: () => this.renderLetters(),
            complaints: () => this.renderComplaints(),
            reports: () => this.renderReports(),
            pesangon: () => this.renderPesangon(),
        };
        map[page]?.();
    }
    debouncedGlobalSearch(q) {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.globalSearch(q), 120);
    }
    globalSearch(q) {
        if (!q) {
            const activePage = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
            this.renderPage(activePage);
            return;
        }
        // P1-IDX: gunakan pre-built search index — O(n) single scan, bukan 6x forEach terpisah
        if (!this._searchIndex) this._buildSearchIndex();
        const ql = q.toLowerCase();
        const results = this._searchIndex.filter(r => r.searchable.includes(ql));
        this.showGlobalResults(q, results);
    }
    showGlobalResults(q, results) {
        const self = this;
        const body = results.length
            ? results.slice(0, 100).map((r, i) => `<div class="search-result" data-idx="${i}" style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer"><span class="job-badge" style="margin-right:8px">${this.escapeHtml(r.mod)}</span>${this.escapeHtml(r.text)}</div>`).join('')
            : `<div class="empty-state"><i class="fas fa-search"></i><h3>Tidak ada hasil untuk "${this.escapeHtml(q)}"</h3></div>`;
        this.openModal(`<h3 style="margin-bottom:12px">Hasil Pencarian: ${this.escapeHtml(q)} (${results.length})</h3><div class="search-results">${body}</div>`,
            `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, 'Pencarian Global');
        // Attach click handlers after modal renders
        const modal = document.querySelector('.modal-body .search-results');
        if (modal) {
            modal.querySelectorAll('.search-result').forEach(el => {
                el.addEventListener('click', () => {
                    const r = results[+el.dataset.idx];
                    if (!r) return;
                    self.closeModal();
                    self.showPage(r.page);
                    // Navigate to the specific record after page renders
                    const viewMap = {
                        members: () => self.viewMember(r.id),
                        dues: () => self.viewDuesDetail(r.id),
                        attendance: () => self.viewAttendance(r.id),
                        letters: () => self.viewLetter(r.id),
                        complaints: () => self.viewComplaint(r.id),
                        wages: () => self.viewWageDetail(r.id, 'Pertemuan1'),
                    };
                    viewMap[r.page]?.();
                });
            });
        }
    }
    renderPag(totalPages, totalItems, containerId, stateKey) {
        const c = document.getElementById(containerId);
        if (!c || totalPages <= 1) { if (c) c.innerHTML = ''; return; }
        let h = `<button ${this.pages[stateKey]===1?'disabled':''} onclick="App.goPage('${stateKey}',${this.pages[stateKey]-1})">‹</button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (i===1||i===totalPages||(i>=this.pages[stateKey]-2&&i<=this.pages[stateKey]+2)) h += `<button class="${i===this.pages[stateKey]?'active':''}" onclick="App.goPage('${stateKey}',${i})">${i}</button>`;
            else if (i===this.pages[stateKey]-3||i===this.pages[stateKey]+3) h += `<button disabled>…</button>`;
        }
        h += `<button ${this.pages[stateKey]===totalPages?'disabled':''} onclick="App.goPage('${stateKey}',${this.pages[stateKey]+1})">›</button>`;
        h += `<span style="margin-left:10px;color:var(--muted);font-size:12px;">${totalItems} data</span>`;
        c.innerHTML = h;
    }
    goPage(stateKey, page) { this.pages[stateKey] = page; this.renderPage(stateKey); }
    updateSortAria() {
        document.querySelectorAll('#membersTable th[data-sort]').forEach(th => {
            th.setAttribute('aria-sort', th.dataset.sort === this.sortField ? (this.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
        });
    }
    openModal(body, footer = '', title = '') {
        if (title) document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer;
        document.getElementById('mainModal').classList.add('active');
    }
    closeModal() { document.getElementById('mainModal').classList.remove('active'); }
    showNotifications() { this.showPage('complaints'); }
    populateAllFilters() {
        const depts = [...new Set(this.members.map(m => m.department))].sort();
        const jcs = [...new Set(this.members.map(m => m.jobclass))].sort();

        const setOpts = (id, vals, ph) => { const el = document.getElementById(id); if (!el) return; el.innerHTML = `<option value="">${this.escapeHtml(ph)}</option>` + vals.map(v => `<option value="${this.escapeHtml(v)}">${this.escapeHtml(v)}</option>`).join(''); };
        setOpts('memDeptFilter', depts, 'Semua');
        setOpts('memJCFilter', jcs, 'Semua');
        setOpts('wageDept', depts, 'Semua');
        setOpts('wageJC', jcs, 'Semua');

        const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
        const mEl = document.getElementById('duesMonth');
        if (mEl) mEl.innerHTML = '<option value="">Semua</option>' + months.map((m,i) => `<option value="${m}">${new Date(2026,i).toLocaleDateString('id-ID',{month:'long'})}</option>`).join('');

        const yEl = document.getElementById('duesYear');
        if (yEl) yEl.innerHTML = '<option value="2026" selected>2026</option>';

        const attEvents = [...new Set(this.events.map(e => e.title))];
        const attEvEl = document.getElementById('attEventFilter');
        if (attEvEl) attEvEl.innerHTML = '<option value="">Semua Kegiatan</option>' + attEvents.map(e => `<option>${this.escapeHtml(e)}</option>`).join('');
    }
    /** CSV formula-injection guard: prepend ' to values starting with = + - @ (S8/S26/UNIT — shared by exportToCSV, exportPesangonCSV) */
    csvEsc(v) { const s = String(v ?? ''); const f = /^[=+\-@]/.test(s) ? "'" : ''; return f + (s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s); }
    exportToCSV(data, filename, fields) {
        if (!data.length) { this.showToast('Tidak ada data', 'error'); return; }
        let csv = fields.join(',') + '\n';
        data.forEach(r => { csv += fields.map(f => this.csvEsc(r[f])).join(',') + '\n'; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url); this.showToast('Export berhasil', 'success');
    }
    formatRupiah(v) { if (!v || isNaN(v)) return 'Rp 0'; return 'Rp ' + Number(v).toLocaleString('id-ID'); }
    parseBirth(m) {
        // PERF: cache by NIK to avoid 429× date parsing in dashboard
        const nik = String(m?.nik || '');
        if (nik && this._birthCache && this._birthCache.has(nik)) return this._birthCache.get(nik);
        const s = String(m?.tanggalLahir || '');
        const a = s.split('-');
        if (a.length !== 3) { if (nik && this._birthCache) this._birthCache.set(nik, null); return null; }
        const y = +a[2], mo = +a[1], d = +a[0];
        const nowYear = new Date().getFullYear();
        if (!Number.isInteger(y) || y < 1900 || y > nowYear) { if (nik && this._birthCache) this._birthCache.set(nik, null); return null; }
        if (!Number.isInteger(mo) || mo < 1 || mo > 12) { if (nik && this._birthCache) this._birthCache.set(nik, null); return null; }
        if (!Number.isInteger(d) || d < 1 || d > 31) { if (nik && this._birthCache) this._birthCache.set(nik, null); return null; }
        const bd = new Date(y, mo - 1, d);
        if (bd.getFullYear() !== y || bd.getMonth() !== mo - 1 || bd.getDate() !== d) { if (nik && this._birthCache) this._birthCache.set(nik, null); return null; }
        const result = { y, m: mo, d };
        if (nik && this._birthCache) this._birthCache.set(nik, result);
        return result;
    }
    normalizeBirth(s) {
        const v = String(s || '').trim();
        if (!v) return '';
        // V-NORM: seragamkan DD/MM/YYYY -> DD-MM-YYYY; tolak delimiter lain (dot/spasi)
        const normalized = v.includes('/') ? v.replace(/\//g, '-') : v;
        // Validasi: harus format DD-MM-YYYY (2 digit dash 2 digit dash 4 digit)
        if (!/^\d{2}-\d{2}-\d{4}$/.test(normalized)) return '';
        return normalized;
    }
    /** Normalisasi kunci bulan -> YYYY-MM (mm 2 digit). Tahan mismatch '2026-8' vs '2026-08'. Nilai tak-bentuk bulan dibiarkan. */
    normalizeMonth(k) {
        const v = String(k || '').trim();
        const m = /^(\d{4})-(\d{1,2})$/.exec(v);
        return m ? `${m[1]}-${String(+m[2]).padStart(2, '0')}` : v;
    }
    /** 'Iuran Bulan Ini' = PROYEKSI payroll: total iuranBulanan seluruh anggota (informasi 'harusnya' masuk sebelum verifikasi payroll). Satu sumber utk dashboard & Iuran&Keuangan (integrasi modul). */
    thisMonthDuesTotal() {
        return this.members.reduce((s, m) => s + (Number(m.iuranBulanan) || 0), 0);
    }
    /** Total iuran yang BENAR-BENAR TERKUMPUL (Σ jumlah dari record iuran lunas) utk bulan tertentu. */
    collectedDuesTotal(bulan) {
        return this.dues
            .filter(d => this.normalizeMonth(d.bulan) === bulan && d.status === 'Lunas')
            .reduce((s, d) => s + (Number(d.jumlah) || 0), 0);
    }
    /** Baris data iuran per anggota utk bulan terpilih (filter duesMonth/duesYear, default bulan berjalan).
        Satu sumber utk renderDues (tampilan) & exportDuesCSV (export) — anti-divergen; Map by nik (normalize bulan) utk lookup O(1). */
    duesRowsForSelectedMonth() {
        const month = document.getElementById('duesMonth')?.value || '';
        const year = document.getElementById('duesYear')?.value || '';
        const now = new Date();
        const bulan = this.normalizeMonth((year && month) ? `${year}-${month}` : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
        const duesThisBulan = new Map(this.dues.filter(d => this.normalizeMonth(d.bulan) === bulan).map(d => [d.nik, d]));
        const data = this.members.map(m => ({ m, rec: duesThisBulan.get(m.nik) }));
        // Database dimulai Agustus 2026 — bulan sebelumnya kosong
        if (bulan < '2026-08') return { bulan, data: [] };
        return { bulan, data };
    }
    computeAge(m, now = new Date()) {
        const p = this.parseBirth(m);
        if (!p) return null;
        let age = now.getFullYear() - p.y;
        if (now.getMonth() < p.m - 1 || (now.getMonth() === p.m - 1 && now.getDate() < p.d)) age--;
        return age >= 0 ? age : 0;
    }
    joinYear(nik) {
        const s = String(nik ?? '');
        if (s.length !== 8 || !/^\d+$/.test(s)) return null;
        return 2000 + parseInt(s.slice(2, 4), 10);
    }
    masaKerja(nik, now = new Date()) {
        const jy = this.joinYear(nik);
        if (jy === null) return null;
        return Math.max(0, now.getFullYear() - jy);
    }
    pensiunTahun(m) {
        const p = this.parseBirth(m);
        if (!p) return null;
        return p.y + 56;
    }
    berakhirSanksi(mulai, jenis) {
        // Masa berlaku: STT:3, SP1:3, SP2:3, SP3:6 (bulan). Berakhir = mulai + masa.
        // Clamp hari ke akhir bulan target (31 Jan + 3 bln -> 30 Apr), hindari setMonth-rolling.
        const MASA = { STT: 3, SP1: 3, SP2: 3, SP3: 6 };
        const m = MASA[jenis];
        if (!m) return null;
        const a = String(mulai || '').split('-');
        if (a.length !== 3) return null;
        const y = +a[0], mo = +a[1], d = +a[2];
        if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
        let tm = mo - 1 + m;
        let ty = y + Math.floor(tm / 12);
        tm = ((tm % 12) + 12) % 12;
        const last = new Date(ty, tm + 1, 0).getDate();
        const td = Math.min(d, last);
        return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
    }
    escapeHtml(v) { if (v === null || v === undefined) return ''; return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    isValidNik(nik) { if (nik === null || nik === undefined) return false; return /^\d{8}$/.test(String(nik)); }
    escapeJsStr(s) { if (s === null || s === undefined) return ''; return String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\u0027').replace(/"/g, '\\u0022').replace(/`/g, '\\u0060').replace(/\n/g, '\\n').replace(/<\//g, '<\\/'); }
    showToast(msg, type = 'info') { const c = document.getElementById('toastContainer'); const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'times-circle':'info-circle'}"></i> ${this.escapeHtml(msg)}`; c.appendChild(t); setTimeout(() => t.remove(), 3000); }
    emptyRow(colspan, message, icon = '') {
        // ponytail: icon opsional utk melestarikan output render modul tertentu (mis. fa-users di members)
        return `<tr><td colspan="${colspan}"><div class="empty-state">${icon ? `<i class="fas ${icon}"></i>` : ''}<h3>${this.escapeHtml(message)}</h3></div></td></tr>`;
    }
    badge(text, kind = 'status') {
        // ponytail: token class di-sanitasi alnum-whitelist - text user-supplied (prioritas/status) tak boleh masuk class attr mentah (cegah class-injection onmouseover/onload)
        const token = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const cls = kind === 'priority' ? `priority-${token}` : `status-${token}`;
        return `<span class="status-badge ${cls}">${this.escapeHtml(text)}</span>`;
    }
    pageSlice(data, stateKey) {
        const start = (this.pages[stateKey] - 1) * this.ITEMS;
        return { totalPages: Math.ceil(data.length / this.ITEMS), start, paged: data.slice(start, start + this.ITEMS) };
    }
    /** REFORM: validateRequired — centralize form validation (required, maxLength) */
    validateRequired(fields) {
        for (const [id, label, opts = {}] of fields) {
            const val = (document.getElementById(id)?.value || '').trim();
            if (opts.required && !val) {
                this.showToast(`${label} wajib diisi`, 'error');
                return false;
            }
            if (opts.maxLength && val.length > opts.maxLength) {
                this.showToast(`${label} maksimal ${opts.maxLength} karakter`, 'error');
                return false;
            }
        }
        return true;
    }
    /** REFORM: getFormValues — batch read form fields */
    getFormValues(ids) {
        const result = {};
        for (const id of ids) {
            result[id] = (document.getElementById(id)?.value || '').trim();
        }
        return result;
    }
    /** REFORM: statusClass — map status string to CSS class */
    statusClass(status) {
        const map = {
            'Baru': 'baru', 'Diterima': 'aktif', 'Terkirim': 'proses',
            'Selesai': 'selesai', 'Lunas': 'lunas', 'Belum Lunas': 'tidak-aktif',
            'Proses': 'proses', 'Ditolak': 'tidak-aktif'
        };
        return map[status] || 'baru';
    }
    /** REFORM: saveAndClose — batch save, close modal, render, toast */
    saveAndClose(key, renderFn, successMsg) {
        this.saveLocal(key, this[key]);
        this.closeModal();
        this[renderFn]();
        this.showToast(successMsg, 'success');
    }
    /** DASH: isValidDate — safe date validation */
    isValidDate(dateStr) {
        const d = new Date(dateStr);
        return !isNaN(d.getTime());
    }
    /** MEM: isValidTempatLahir — validate tempat lahir (not date, not same as tanggalLahir) */
    isValidTempatLahir(val, tanggalLahir) {
        if (!val) return true;
        if (/^\d{2}-\d{2}-\d{4}$/.test(val)) return false;
        if (val === tanggalLahir) return false;
        return true;
    }
    /** DUES: getOrphanDues — get dues records for deleted members */
    getOrphanDues(bulan) {
        const memberNiks = new Set(this.members.map(m => m.nik));
        return this.dues.filter(d => this.normalizeMonth(d.bulan) === bulan && !memberNiks.has(d.nik));
    }
    /** P1-HELPER: render satu stat card (icon, value, label, color) — dipakai dashboard/wages/reports */
    renderStatCard(icon, value, label, color) {
        return `<div class="stat-card"><div class="stat-icon bg-${this.escapeHtml(color)}"><i class="fas fa-${this.escapeHtml(icon)}"></i></div><div class="stat-info"><h3>${value}</h3><p>${this.escapeHtml(label)}</p></div></div>`;
    }
    /** P1-IDX: build search index — precompute lowercase searchable text per record utk globalSearch O(1) lookup */
    _buildSearchIndex() {
        this._searchIndex = [];
        this.members.forEach(m => {
            this._searchIndex.push({ mod: 'Anggota', page: 'members', id: m.id,
                text: `${m.nama} (${m.nik}) — ${m.department}`,
                searchable: `${this.str(m.nama)} ${this.str(m.nik)} ${this.str(m.department)}`.toLowerCase() });
        });
        this.dues.forEach(d => {
            const mm = this.memberByNik.get(String(d.nik));
            this._searchIndex.push({ mod: 'Iuran', page: 'dues', id: d.id,
                text: `${mm ? mm.nama : d.nik} — ${d.bulan} — ${this.formatRupiah(d.jumlah)}`,
                searchable: `${this.str(d.nik)} ${this.str(d.bulan)} ${mm ? mm.nama : ''}`.toLowerCase() });
        });
        this.attendance.forEach(a => {
            const mm = this.memberByNik.get(String(a.nik));
            this._searchIndex.push({ mod: 'Absensi', page: 'attendance', id: a.id,
                text: `${mm ? mm.nama : a.nik} — ${a.kegiatan} (${a.status})`,
                searchable: `${this.str(a.kegiatan)} ${this.str(a.status)} ${mm ? mm.nama : ''} ${this.str(a.nik)}`.toLowerCase() });
        });
        this.letters.forEach(l => {
            this._searchIndex.push({ mod: 'Surat', page: 'letters', id: l.id,
                text: `${l.noSurat} — ${l.perihal}`,
                searchable: `${this.str(l.perihal)} ${this.str(l.noSurat)} ${this.str(l.dari)}`.toLowerCase() });
        });
        this.complaints.forEach(c => {
            this._searchIndex.push({ mod: 'Pengaduan', page: 'complaints', id: c.id,
                text: `${c.pelapor} — ${c.judul}`,
                searchable: `${this.str(c.pelapor)} ${this.str(c.kategori)} ${this.str(c.keterangan)} ${this.str(c.judul)}`.toLowerCase() });
        });
        const wd = (this.wageData && this.wageData.Pertemuan1) || [];
        wd.forEach(r => {
            this._searchIndex.push({ mod: 'Upah', page: 'wages', id: r.no,
                text: `${r.nama} — ${r.department} (${this.formatRupiah(r.total_kenaikan)})`,
                searchable: `${this.str(r.nama)} ${this.str(r.department)}`.toLowerCase() });
        });
    }
    /** P2-DARK: toggle dark mode — save preference ke localStorage */
    toggleDarkMode() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('spm_theme', next);
    }
    /** P2-A11Y: apply saved theme on boot */
    _applyTheme() {
        const saved = localStorage.getItem('spm_theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
    }
    /** P2-A11Y: keyboard handler — Escape tutup modal, navigasi sidebar */
    _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('mainModal');
                if (modal && modal.classList.contains('active')) {
                    this.closeModal();
                    e.preventDefault();
                }
            }
        });
    }
}
