/* SPM Kecap Bango - Perundingan Upah (Wages) */
const WAGE_SCENARIOS = ['Pertemuan1','Pertemuan2','Pertemuan3','Pertemuan4','Pertemuan5'];
const WAGE_SCENARIO_DESCS = ['Full (X+Y+Z)', 'Tanpa Z (UMK)', 'X Only, Tanpa Z', 'Ajuan Bargaining Mediasi', 'Kenaikan UMK Kab.Subang'];
Object.assign(SPMApp.prototype, {
        renderWages() {
        try {
            const scenario = document.getElementById('wageScenario')?.value || 'Pertemuan1';
            const data = this.wageData[scenario] || [];
            const dept = document.getElementById('wageDept')?.value || '';
            const jc = document.getElementById('wageJC')?.value || '';
    
            // Single-pass filter: data.filter() creates new array — no [...data] spread needed
            const filtered = data.filter(r => {
                if (dept && r.department !== dept) return false;
                if (jc && r.jobclass !== jc) return false;
                return true;
            });
    
            // Stats: single-pass avg + max + total (avoids Math.max spread stack limit)
            let maxRaise = 0;
            const sum = filtered.reduce((s,r) => { const v = Number(r.total_kenaikan) || 0; if (v > maxRaise) maxRaise = v; return s + v; }, 0);
            const avgRaise = filtered.length ? sum / filtered.length : 0;
    
            document.getElementById('wageStats').innerHTML = [
                this.renderStatCard('users', filtered.length, 'Karyawan', 'blue'),
                this.renderStatCard('arrow-up', this.formatRupiah(avgRaise), 'Rata-rata Kenaikan', 'green'),
                this.renderStatCard('crown', this.formatRupiah(maxRaise), 'Kenaikan Tertinggi', 'orange'),
                this.renderStatCard('coins', this.formatRupiah(sum), 'Total Anggaran Kenaikan', 'purple')
            ].join('');
    
            const { totalPages, start, paged } = this.pageSlice(filtered, 'wages');
    
            // Show table card (restore from comparison view)
            const tableCard = document.querySelector('#wages .card');
            if (tableCard) tableCard.style.display = '';

            if (filtered.length === 0) {
                document.getElementById('wagesBody').innerHTML = this.emptyRow(13, 'Tidak ada data untuk filter ini', 'fa-money-bill-wave');
            } else {
                document.getElementById('wagesBody').innerHTML = paged.map(r => `
                    <tr>
                        <td>${this.escapeHtml(r.no)}</td><td><strong>${this.escapeHtml(r.nama)}</strong></td><td>${this.escapeHtml(r.nik)}</td>
                        <td>${this.escapeHtml(r.department)}</td><td>${this.escapeHtml(r.jabatan)}</td><td><span class="job-badge">${this.escapeHtml(r.jobclass)}</span></td>
                        <td class="money">${this.formatRupiah(r.gaji_pokok_2025)}</td>
                        <td class="money">${this.formatRupiah(r.xtot)}</td>
                        <td class="money">${this.formatRupiah(r.ytot)}</td>
                        <td class="money">${this.formatRupiah(r.ztot)}</td>
                        <td class="money">${this.formatRupiah(r.gaji_pokok_2026)}</td>
                        <td class="money money-pos">+${this.formatRupiah(r.total_kenaikan)}</td>
                        <td><button class="btn btn-sm btn-info" onclick="App.viewWageDetail(${this.escapeJsStr(r.no)},'${this.escapeJsStr(scenario)}')"><i class="fas fa-eye"></i></button></td>
                    </tr>
                `).join('');
            }
    
            this.renderPag(totalPages, filtered.length, 'wagesPagination', 'wages');
        } catch (e) { console.error(e); this.showToast('Gagal memuat data upah: ' + e.message, 'error'); }
        },
        viewWageDetail(no, scenario) {
            const allMatch = {};
            WAGE_SCENARIOS.forEach(s => { const byNo = new Map((this.wageData[s] || []).map(r => [String(r.no), r])); const m = byNo.get(String(no)); if (m) allMatch[s] = m; });
            const first = allMatch['Pertemuan1']; if (!first) return;
    
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>NIK</label><p>${this.escapeHtml(first.nik)}</p></div>
                    <div class="detail-item"><label>Job Class</label><p><span class="job-badge">${this.escapeHtml(first.jobclass)}</span></p></div>
                    <div class="detail-item full"><label>Nama</label><p><strong>${this.escapeHtml(first.nama)}</strong></p></div>
                    <div class="detail-item"><label>Departemen</label><p>${this.escapeHtml(first.department)}</p></div>
                    <div class="detail-item"><label>Jabatan</label><p>${this.escapeHtml(first.jabatan)}</p></div>
                </div>
                <h4 style="margin:16px 0 8px;font-size:13px;color:var(--muted);">Perbandingan 5 Skenario</h4>
                <table class="data-table"><thead><tr><th>Skenario</th><th>Deskripsi</th><th>GP 2026</th><th>Kenaikan</th><th>% </th></tr></thead><tbody>
                ${WAGE_SCENARIOS.map((s,i) => { const m = allMatch[s]; if (!m) return ''; const pct = m.gaji_pokok_2025 > 0 ? ((m.total_kenaikan/m.gaji_pokok_2025)*100).toFixed(1) : 0; return `<tr><td><strong>P${i+1}</strong></td><td>${WAGE_SCENARIO_DESCS[i]}</td><td class="money">${this.formatRupiah(m.gaji_pokok_2026)}</td><td class="money money-pos">+${this.formatRupiah(m.total_kenaikan)}</td><td class="money money-pos">+${pct}%</td></tr>`; }).join('')}
                </tbody></table>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, `Detail Gaji: ${first.nama}`);
        },
        showWageComparison() {
            const colors = ['blue','green','orange','red','purple'];
            const statsHtml = WAGE_SCENARIOS.map((s,i) => {
                const data = this.wageData[s] || [];
                const avg = data.length ? data.reduce((a,r) => a+(Number(r.total_kenaikan)||0), 0)/data.length : 0;
                return this.renderStatCard('chart-line', this.formatRupiah(avg), 'P'+(i+1)+' Rata-rata', colors[i]);
            }).join('');
            document.getElementById('wageStats').innerHTML = statsHtml + `<div class="stat-card full-width" style="grid-column:1/-1;text-align:center;margin-top:10px;"><button class="btn btn-primary" onclick="App.renderWages()"><i class="fas fa-arrow-left"></i> Kembali ke Detail</button></div>`;
            // Hide table during comparison view
            const tableCard = document.querySelector('#wages .card');
            if (tableCard) tableCard.style.display = 'none';
        },
        exportWageCSV() {
            const scenario = document.getElementById('wageScenario')?.value || 'Pertemuan1';
            const data = this.wageData[scenario] || [];
            const dept = document.getElementById('wageDept')?.value || '';
            const jc = document.getElementById('wageJC')?.value || '';
            const filtered = data.filter(r => {
                if (dept && r.department !== dept) return false;
                if (jc && r.jobclass !== jc) return false;
                return true;
            });
            this.exportToCSV(filtered, 'data_perundingan_upah.csv', ['no','nama','nik','department','bagian','jabatan','jobclass','gaji_pokok_2025','xtot','y_huruf','y_angka','ytot','z_angka','ztot','gaji_pokok_2026','total_kenaikan']);
        }
});
