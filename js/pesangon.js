/* SPM Kecap Bango - Simulasi Pesangon (Severance Pay) */
Object.assign(SPMApp.prototype, {

    /* ── Skala UP (Bulan Upah) — Ayat 3 ── */
    _skalaUP(mk) {
        if (mk < 1) return 1;
        if (mk < 2) return 2;
        if (mk < 3) return 3;
        if (mk < 4) return 4;
        if (mk < 5) return 5;
        if (mk < 6) return 6;
        if (mk < 7) return 7;
        if (mk < 8) return 8;
        return 9;
    },

    /* ── Skala UPMK (Bulan Upah) — Ayat 4 ── */
    _skalaUPMK(mk) {
        if (mk < 3) return 0;
        if (mk < 6) return 2;
        if (mk < 9) return 3;
        if (mk < 12) return 4;
        if (mk < 15) return 5;
        if (mk < 18) return 6;
        if (mk < 21) return 7;
        if (mk < 24) return 8;
        return 10;
    },

    /* ── Masa Kerja dengan Adjustment ── */
    _pesangonMK(nik) {
        const jy = this.joinYear(nik);
        if (jy === null) return { mk: 0, adj: 0, base: 0 };
        const base = Math.max(0, new Date().getFullYear() - jy);
        const s = String(nik);
        let adj = 0;
        if (s.startsWith('1220')) adj = 2;
        else if (s.startsWith('1221') || s.startsWith('1222') || s.startsWith('1223')) adj = 1;
        return { mk: Math.max(0, base - adj), adj, base };
    },

    /* ── Tunjangan Tetap ── */
    _tunjanganTetap(jobclass) {
        return (jobclass || '').startsWith('4') ? 800000 : 625000;
    },

    /* ── Upah per Bulan ── */
    _upahPerBulan(m) {
        return (Number(m.gaji_pokok_2025) || 0) + this._tunjanganTetap(m.jobclass);
    },

    /* ── 25 Skenario PHK ── */
    _scenarios: [
        { id: 1,  name: 'Penggabungan/peleburan (tak lanjut)',           up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 2,  name: 'Pengambilalihan (berlanjut)',                    up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 3,  name: 'Pengambilalihan (tak lanjut)',                   up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 4,  name: 'Efisiensi (perusahaan rugi)',                    up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 5,  name: 'Efisiensi (cegah rugi)',                         up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 6,  name: 'Tutup (rugi ≥2 tahun)',                          up: 0.5, upmk: 1,   uph15: false, pisah: false },
        { id: 7,  name: 'Tutup (bukan rugi)',                             up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 8,  name: 'Tutup (force majeur)',                           up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 9,  name: 'Force majeur (tak tutup)',                       up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 10, name: 'PKPU (rugi)',                                    up: 0.5, upmk: 1,   uph15: false, pisah: false },
        { id: 11, name: 'PKPU (bukan rugi)',                              up: 1,   upmk: 1,   uph15: false, pisah: false },
        { id: 12, name: 'Pailit',                                         up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 13, name: 'PHK pekerja (pengusaha salah)',                  up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 14, name: 'Putusan PPHI (pengusaha tdk salah)',            up: 0,   upmk: 0,   uph15: false, pisah: true  },
        { id: 15, name: 'Pengunduran diri (memenuhi syarat)',             up: 0,   upmk: 0,   uph15: false, pisah: true  },
        { id: 16, name: 'Mangkir ≥5 hari',                               up: 0,   upmk: 0,   uph15: true,  pisah: true  },
        { id: 17, name: 'Pelanggaran 3× surat peringatan',               up: 0.75,upmk: 1,   uph15: true,  pisah: false },
        { id: 18, name: 'Pelanggaran mendesak',                           up: 0.5, upmk: 1,   uph15: true,  pisah: true  },
        { id: 19, name: 'Ditahan 6 bln (pidana, kerugian)',              up: 0,   upmk: 0,   uph15: false, pisah: true  },
        { id: 20, name: 'Ditahan 6 bln (pidana, tdk kerugian)',          up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 21, name: 'Putusan pidana <6 bln (kerugian, bersalah)',    up: 0,   upmk: 1,   uph15: false, pisah: true  },
        { id: 22, name: 'Putusan pidana <6 bln (tdk kerugian, bersalah)',up: 1,   upmk: 1,   uph15: true,  pisah: false },
        { id: 23, name: 'Sakit berkepanjangan/cacat >12 bln',            up: 2,   upmk: 2,   uph15: true,  pisah: false },
        { id: 24, name: 'Pensiun',                                        up: 2,   upmk: 1,   uph15: true,  pisah: false },
        { id: 25, name: 'Meninggal dunia',                                up: 2,   upmk: 1,   uph15: true,  pisah: false },
    ],

    /* ── Kalkulasi Pesangon ── */
    _hitungPesangon(m, scenarioId) {
        const sc = this._scenarios.find(s => s.id === scenarioId);
        if (!sc) return null;

        const upah = this._upahPerBulan(m);
        const { mk, adj, base } = this._pesangonMK(m.nik);
        const skUP = this._skalaUP(mk);
        const skUPMK = this._skalaUPMK(mk);

        const nominalUP = skUP * sc.up * upah;
        const nominalUPMK = skUPMK * sc.upmk * upah;
        const nominalUPH = sc.uph15 ? 0.15 * (nominalUP + nominalUPMK) : 0;
        const nominalPisah = sc.pisah ? 1 * upah : 0;

        return {
            nama: m.nama, nik: m.nik, dept: m.department, jobclass: m.jobclass,
            gajiPokok: Number(m.gaji_pokok_2025) || 0,
            tunjangan: this._tunjanganTetap(m.jobclass),
            upah,
            mkBase: base, mkAdj: adj, mk,
            skUP, pengaliUP: sc.up,
            skUPMK, pengaliUPMK: sc.upmk,
            uph15: sc.uph15,
            nominalUP, nominalUPMK, nominalUPH, nominalPisah,
            total: nominalUP + nominalUPMK + nominalUPH + nominalPisah,
            scenario: sc,
        };
    },

    /* ── Helper: render satu blok hasil ── */
    _renderPesangonCard(r) {
        return `
            <div class="pesangon-card">
                <h4><i class="fas fa-calculator"></i> ${this.escapeHtml(r.scenario.name)}</h4>
                <table class="pesangon-calc">
                    <tr><td>Uang Pesangon (UP)</td><td>${r.skUP} bln × ${r.pengaliUP} × ${this.formatRupiah(r.upah)}</td><td class="money"><strong>${this.formatRupiah(r.nominalUP)}</strong></td></tr>
                    <tr><td>Uang Penghargaan MK (UPMK)</td><td>${r.skUPMK} bln × ${r.pengaliUPMK} × ${this.formatRupiah(r.upah)}</td><td class="money"><strong>${this.formatRupiah(r.nominalUPMK)}</strong></td></tr>
                    <tr><td>Uang Penggantian Hak (UPH)</td><td>${r.uph15 ? '15% × (' + this.formatRupiah(r.nominalUP) + ' + ' + this.formatRupiah(r.nominalUPMK) + ')' : '0 (a+b)'}</td><td class="money"><strong>${this.formatRupiah(r.nominalUPH)}</strong></td></tr>
                    <tr><td>Uang Pisah</td><td>${r.scenario.pisah ? '1 × ' + this.formatRupiah(r.upah) : '-'}</td><td class="money"><strong>${r.nominalPisah > 0 ? this.formatRupiah(r.nominalPisah) : '-'}</strong></td></tr>
                    <tr class="pesangon-total"><td><strong>TOTAL</strong></td><td></td><td class="money"><strong>${this.formatRupiah(r.total)}</strong></td></tr>
                </table>
            </div>`;
    },

    /* ── Search Anggota ── */
    _pesangonSearch(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return this.members.slice(0, 50);
        return this.members.filter(m =>
            this.str(m.nama).toLowerCase().includes(q) ||
            this.str(m.nik).includes(q) ||
            this.str(m.department).toLowerCase().includes(q)
        ).slice(0, 50);
    },

    _pesangonSearchTimeout: null,
    onPesangonSearch(val) {
        clearTimeout(this._pesangonSearchTimeout);
        this._pesangonSearchTimeout = setTimeout(() => {
            const list = document.getElementById('pesangonSearchList');
            if (!list) return;
            const results = this._pesangonSearch(val);
            if (!val && results.length === 0) { list.style.display = 'none'; return; }
            list.innerHTML = results.length === 0
                ? '<div class="pesangon-search-item pesangon-search-empty">Tidak ditemukan</div>'
                : results.slice(0, 20).map(m =>
                    `<div class="pesangon-search-item" onclick="App.selectPesangonMember('${this.escapeJsStr(m.nik)}')">${this.escapeHtml(m.nama)}                         <span class="pesangon-search-nik">${this.escapeHtml(m.nik)}</span> <span class="pesangon-search-dept">${this.escapeHtml(m.department || '')}</span></div>`
                ).join('');
            list.style.display = 'block';
        }, 200);
    },

    selectPesangonMember(nik) {
        document.getElementById('pesangonNik').value = nik;
        document.getElementById('pesangonSearchInput').value = '';
        document.getElementById('pesangonSearchList').style.display = 'none';
        this.renderPesangon();
    },

    /* ── Export CSV ── */
    _pesangonLastResults: [],
    exportPesangonCSV() {
        if (!this._pesangonLastResults.length) return;
        const rows = [['Nama','NIK','Department','Jobclass','Upah/Bulan','MK','Skenario','UP','UPMK','UPH','Uang Pisah','Total']];
        this._pesangonLastResults.forEach(r => {
            rows.push([
                r.nama, r.nik, r.dept, r.jobclass,
                r.upah, r.mk, r.scenario.name,
                r.nominalUP, r.nominalUPMK, r.nominalUPH, r.nominalPisah, r.total
            ]);
        });
        const csv = rows.map(r => r.map(v => this.csvEsc(v)).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'simulasi_pesangon_' + new Date().toISOString().slice(0,10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    },

    /* ── Render Halaman Pesangon ── */
    renderPesangon() {
    try {
        const nik = document.getElementById('pesangonNik')?.value || '';
        const scId = parseInt(document.getElementById('pesangonScenario')?.value || '0', 10);
        const scId2 = parseInt(document.getElementById('pesangonScenario2')?.value || '0', 10);

        // Populate scenario dropdowns (cached)
        if (!this._pesangonScenarioOptions) {
            this._pesangonScenarioOptions = this._scenarios.map(
                s => `<option value="${s.id}">${s.id}. ${this.escapeHtml(s.name)}</option>`
            ).join('');
        }
        ['pesangonScenario', 'pesangonScenario2'].forEach((id, i) => {
            const sel = document.getElementById(id);
            if (sel && sel.options.length <= 1) {
                const placeholder = i === 0 ? '— Pilih Skenario —' : '— Bandingkan (opsional) —';
                sel.innerHTML = `<option value="0">${placeholder}</option>` + this._pesangonScenarioOptions;
            }
        });

        const result = document.getElementById('pesangonResult');
        const exportBtn = document.getElementById('pesangonExportBtn');
        if (!result) return;
        if (!nik || !scId) {
            result.innerHTML = '';
            if (exportBtn) exportBtn.style.display = 'none';
            this._pesangonLastResults = [];
            return;
        }

        const m = this.memberByNik.get(String(nik));
        if (!m) { result.innerHTML = '<p style="color:var(--danger)">Anggota tidak ditemukan.</p>'; return; }
        if (!this._pesangonClickOutsideBound) {
            document.addEventListener('click', e => {
                const list = document.getElementById('pesangonSearchList');
                if (list && !(e.target instanceof Element && e.target.closest('#pesangonSearchInput, #pesangonSearchList'))) {
                    list.style.display = 'none';
                }
            });
            this._pesangonClickOutsideBound = true;
        }

        const r1 = this._hitungPesangon(m, scId);
        if (!r1) return;

        this._pesangonLastResults = [r1];
        let html = `
            <div class="pesangon-card">
                <h4><i class="fas fa-user"></i> Data Pekerja</h4>
                <table class="pesangon-info">
                    <tr><td>Nama</td><td><strong>${this.escapeHtml(r1.nama)}</strong></td></tr>
                    <tr><td>NIK</td><td>${this.escapeHtml(r1.nik)}</td></tr>
                    <tr><td>Department</td><td>${this.escapeHtml(r1.dept)}</td></tr>
                    <tr><td>Jobclass</td><td>${this.escapeHtml(r1.jobclass)}</td></tr>
                    <tr><td>Gaji Pokok</td><td class="money">${this.formatRupiah(r1.gajiPokok)}</td></tr>
                    <tr><td>Tunjangan Tetap</td><td class="money">${this.formatRupiah(r1.tunjangan)}</td></tr>
                    <tr><td><strong>Upah/Bulan</strong></td><td class="money"><strong>${this.formatRupiah(r1.upah)}</strong></td></tr>
                    <tr><td>Masa Kerja</td><td>${r1.mk} tahun (asli: ${r1.mkBase}, adj: ${r1.mkAdj > 0 ? '-' + r1.mkAdj : 0})</td></tr>
                </table>
            </div>`;

        // Comparison mode
        if (scId2 && scId2 !== scId) {
            const r2 = this._hitungPesangon(m, scId2);
            if (r2) {
                this._pesangonLastResults.push(r2);
                html += `<div class="pesangon-compare">
                    <div class="pesangon-compare-col">${this._renderPesangonCard(r1)}</div>
                    <div class="pesangon-compare-vs">VS</div>
                    <div class="pesangon-compare-col">${this._renderPesangonCard(r2)}</div>
                </div>`;
            }
        } else {
            html += this._renderPesangonCard(r1);
        }

        html += `<div class="pesangon-note">
            <p><i class="fas fa-info-circle"></i> Belum termasuk: pajak, sisa cuti yang belum diambil, dan uang transport ke tempat asal.</p>
            <p><i class="fas fa-clock"></i> Masa kerja disesuaikan: pekerja NIK 1220xxxx dikurangi 2 thn, NIK 1221-1223xxxx dikurangi 1 thn (diangkat setelah kontrak).</p>
        </div>`;

        result.innerHTML = html;
        if (exportBtn) exportBtn.style.display = this._pesangonLastResults.length ? '' : 'none';
    } catch (e) { console.error(e); this.showToast('Gagal memuat simulasi pesangon: ' + e.message, 'error'); }
    },
});
