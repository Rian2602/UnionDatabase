/* SPM Kecap Bango - Iuran & Keuangan (Dues) */
Object.assign(SPMApp.prototype, {
        deleteDues(id) {
            if (!confirm('Hapus catatan iuran ini?')) return;
            id = String(id);
            this.dues = this.dues.filter(x => String(x.id) !== id);
            this.saveLocal('dues', this.dues);
            this.renderDues(); this.refreshDashboard();
            this.showToast('Iuran berhasil dihapus', 'success');
        },
        renderDues() {
            // Hitung bulan terpilih utk statistik
            const month = document.getElementById('duesMonth')?.value || '';
            const year = document.getElementById('duesYear')?.value || '';
            const now = new Date();
            // Wajib pilih bulan & tahun — tampilkan strip jika belum lengkap
            if (!month || !year) {
                document.getElementById('duesTotal').textContent = '-';
                document.getElementById('duesUnpaid').textContent = '-';
                document.getElementById('duesRate').textContent = '-';
                document.getElementById('duesThisMonth').textContent = '-';
                document.getElementById('duesBody').innerHTML = this.emptyRow(8, 'Pilih bulan dan tahun untuk melihat data iuran');
                document.getElementById('duesPagination').innerHTML = '';
                return;
            }
            const selectedBulan = this.normalizeMonth(`${year}-${month}`);
            // Database dimulai Agustus 2026 — bulan sebelumnya nolkan semua statistik
            if (selectedBulan < '2026-08') {
                document.getElementById('duesTotal').textContent = '-';
                document.getElementById('duesUnpaid').textContent = '-';
                document.getElementById('duesRate').textContent = '-';
                document.getElementById('duesThisMonth').textContent = '-';
                document.getElementById('duesBody').innerHTML = this.emptyRow(8, 'Tidak ada data iuran');
                document.getElementById('duesPagination').innerHTML = '';
                return;
            }
            // Statistik berdasarkan bulan yg dipilih
            const totalCollected = this.collectedDuesTotal(selectedBulan);
            const totalProjected = this.thisMonthDuesTotal();
            const lunasNiks = new Set(this.dues.filter(d => this.normalizeMonth(d.bulan) === selectedBulan && d.status === 'Lunas').map(d => d.nik));
            // Tunggakan = proyeksi - terkumpul
            const unpaid = Math.max(0, totalProjected - totalCollected);
            // Tingkat pembayaran = anggota LUNAS / total anggota × 100%
            const rate = this.members.length > 0 ? Math.round((lunasNiks.size / this.members.length) * 100) : 0;
            document.getElementById('duesTotal').textContent = this.formatRupiah(totalCollected);
            document.getElementById('duesUnpaid').textContent = this.formatRupiah(unpaid);
            document.getElementById('duesRate').textContent = rate + '%';
            document.getElementById('duesThisMonth').textContent = this.formatRupiah(totalProjected);

            // Prebuild Map by id untuk viewDuesDetail O(1) lookup
            this._duesById = new Map(this.dues.map(d => [d.id, d]));
            // Baris proyeksi + bulan terpilih via helper bersama (sama utk tampilan & export) — anti-divergen
            const { bulan, data } = this.duesRowsForSelectedMonth();
            // Tambah baris iuran anggota yang sudah dihapus (orphan records — riwayat tetap terlihat)
            this.getOrphanDues(bulan).forEach(d => {
                data.push({ m: { nik: d.nik, nama: d.nama, department: d.department, iuranBulanan: d.jumlah }, rec: d });
            });

            const { totalPages, start, paged } = this.pageSlice(data, 'dues');
    
            document.getElementById('duesBody').innerHTML = paged.length ? paged.map(({ m, rec }) => `
                <tr>
                    <td>${this.escapeHtml(m.nama)}</td><td>${this.escapeHtml(m.nik)}</td><td>${this.escapeHtml(m.department)}</td>
                    <td>${this.escapeHtml(bulan)}</td><td class="money">${this.formatRupiah(m.iuranBulanan)}</td>
                    <td>${rec ? this.escapeHtml(rec.tanggalBayar) : (() => { const [y,m] = bulan.split('-').map(Number); const nm = m === 12 ? 1 : m + 1; const ny = m === 12 ? y + 1 : y; return `${ny}-${String(nm).padStart(2,'0')}-01`; })()}</td>
                    <td>${rec ? '<span class="status-badge status-lunas">Lunas</span> <i class="fas fa-check-circle" title="Terverifikasi" style="color:#166534"></i>' : '<span class="status-badge status-tidak-aktif">Belum Lunas</span> <i class="fas fa-clock" title="Belum dibayar" style="color:#8f211b"></i>'}</td>
                    <td>${rec ? `<button class="btn btn-sm btn-info" onclick="App.viewDuesDetail('${this.escapeJsStr(rec.id)}')" title="Lihat"><i class="fas fa-eye"></i></button> <button class="btn btn-sm btn-primary" onclick="App.editDues('${this.escapeJsStr(rec.id)}')" title="Edit"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="App.deleteDues('${this.escapeJsStr(rec.id)}')" title="Hapus"><i class="fas fa-trash"></i></button>` : `<button class="btn btn-sm btn-success" onclick="App.quickAddDues('${this.escapeJsStr(m.nik)}','${this.escapeJsStr(bulan)}')" title="Input Iuran"><i class="fas fa-plus"></i> Input</button>`}</td>
                </tr>
            `).join('') : this.emptyRow(8, 'Tidak ada data iuran');
    
            this.renderPag(totalPages, data.length, 'duesPagination', 'dues');
        },
        viewDuesDetail(id) {
            id = String(id);
            const d = (this._duesById || new Map(this.dues.map(x => [String(x.id), x]))).get(id); if (!d) return;
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>Nama</label><p>${this.escapeHtml(d.nama)}</p></div>
                    <div class="detail-item"><label>NIK</label><p>${this.escapeHtml(d.nik)}</p></div>
                    <div class="detail-item"><label>Departemen</label><p>${this.escapeHtml(d.department)}</p></div>
                    <div class="detail-item"><label>Bulan</label><p>${this.escapeHtml(d.bulan)}</p></div>
                    <div class="detail-item"><label>Jumlah</label><p class="money">${this.formatRupiah(d.jumlah)}</p></div>
                    <div class="detail-item"><label>Tanggal Bayar</label><p>${this.escapeHtml(d.tanggalBayar) || 'Belum Bayar'}</p></div>
                    <div class="detail-item"><label>Status</label><p>${this.badge(d.status)}</p></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, `Detail Iuran: ${d.nama}`);
        },
        editDues(id) {
            id = String(id);
            const d = (this._duesById || new Map(this.dues.map(x => [String(x.id), x]))).get(id); if (!d) return;
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>NIK Anggota</label><input type="text" value="${this.escapeHtml(d.nik)}" readonly style="background:#f5f5f5"></div>
                    <div class="form-group"><label>Nama</label><input type="text" value="${this.escapeHtml(d.nama)}" readonly style="background:#f5f5f5"></div>
                    <div class="form-group"><label>Bulan</label><input type="month" id="fEditDuesBulan" value="${this.escapeHtml(d.bulan)}"></div>
                    <div class="form-group"><label>Jumlah (Rp) *</label><input type="number" id="fEditDuesJumlah" value="${d.jumlah}"></div>
                    <div class="form-group"><label>Tanggal Bayar</label><input type="date" id="fEditDuesDate" value="${this.escapeHtml(d.tanggalBayar) || ''}"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveEditDues('${this.escapeJsStr(d.id)}')"><i class="fas fa-save"></i> Simpan</button>`, `Edit Iuran: ${d.nama}`);
        },
        saveEditDues(id) {
            try {
                id = String(id);
                const idx = this.dues.findIndex(d => String(d.id) === id);
                if (idx === -1) { this.showToast('Data iuran tidak ditemukan', 'error'); return; }
                const rawJumlah = parseInt(document.getElementById('fEditDuesJumlah')?.value);
                if (isNaN(rawJumlah) || rawJumlah <= 0) { this.showToast('Jumlah iuran tidak valid (harus > 0)', 'error'); return; }
                this.dues[idx].bulan = this.normalizeMonth(document.getElementById('fEditDuesBulan')?.value || this.dues[idx].bulan);
                this.dues[idx].jumlah = rawJumlah;
                this.dues[idx].tanggalBayar = document.getElementById('fEditDuesDate')?.value || '';
                this.dues[idx].id = `${this.dues[idx].nik}-${this.dues[idx].bulan}`;
                this.saveLocal('dues', this.dues);
                this.closeModal(); this.renderDues(); this.refreshDashboard(); this.showToast('Iuran berhasil diperbarui', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        quickAddDues(nik, bulan) {
            const m = this.members.find(x => x.nik === nik) || {};
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>NIK Anggota</label><input type="text" value="${this.escapeHtml(nik)}" readonly style="background:#f5f5f5"></div>
                    <div class="form-group"><label>Nama</label><input type="text" value="${this.escapeHtml(m.nama || '-')}" readonly style="background:#f5f5f5"></div>
                    <div class="form-group"><label>Bulan *</label><input type="month" id="fDuesBulan" value="${bulan}"></div>
                    <div class="form-group"><label>Jumlah (Rp) *</label><input type="number" id="fDuesJumlah" value="${m.iuranBulanan || 0}"></div>
                    <div class="form-group"><label>Tanggal Bayar</label><input type="date" id="fDuesDate"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveNewDues()"><i class="fas fa-save"></i> Simpan</button>`, `Input Iuran: ${m.nama || nik}`);
        },
        showAddDues() {
            const cm = new Date(); const bulan = `${cm.getFullYear()}-${String(cm.getMonth()+1).padStart(2,'0')}`;
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>NIK Anggota *</label><select id="fDuesNik" onchange="App.onDuesNikChange()"><option value="">Pilih Anggota</option>${this.members.map(m => `<option value="${this.escapeHtml(m.nik)}">${this.escapeHtml(m.nama)} (${this.escapeHtml(m.nik)})</option>`).join('')}</select></div>
                    <div class="form-group"><label>Bulan *</label><input type="month" id="fDuesBulan" value="${bulan}"></div>
                    <div class="form-group"><label>Jumlah (Rp) *</label><input type="number" id="fDuesJumlah" value="" placeholder="Pilih anggota dulu"></div>
                    <div class="form-group"><label>Tanggal Bayar</label><input type="date" id="fDuesDate" value="${cm.toISOString().slice(0,10)}"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveNewDues()"><i class="fas fa-save"></i> Simpan</button>`, 'Input Iuran Baru');
        },
        onDuesNikChange() {
            const nik = document.getElementById('fDuesNik')?.value;
            const m = this.members.find(x => x.nik === nik);
            const el = document.getElementById('fDuesJumlah');
            if (m && el) el.value = this.iuranBulanan(m);
        },
        saveNewDues() {
            try {
                if (!this.validateRequired([
                    ['fDuesNik', 'NIK Anggota', { required: true }],
                    ['fDuesBulan', 'Bulan', { required: true }]
                ])) return;
                const v = this.getFormValues(['fDuesNik', 'fDuesBulan', 'fDuesJumlah', 'fDuesDate']);
                const nik = v.fDuesNik;
                const bulan = this.normalizeMonth(v.fDuesBulan);
                const m = this.members.find(x => x.nik === nik);
                const rawJumlah = parseInt(v.fDuesJumlah);
                if (isNaN(rawJumlah) || rawJumlah <= 0) { this.showToast('Jumlah iuran tidak valid (harus > 0)', 'error'); return; }
                const newEntry = {
                    id: `${nik}-${bulan}`, nama: m?.nama || '', nik, department: m?.department || '',
                    bulan, jumlah: rawJumlah,
                    tanggalBayar: v.fDuesDate || '', status: 'Lunas'
                };
                const idx = this.dues.findIndex(d => d.id === `${nik}-${bulan}`);
                if (idx >= 0) this.dues[idx] = newEntry; else this.dues.push(newEntry);
                this.saveLocal('dues', this.dues);
                this.closeModal(); this.renderDues(); this.refreshDashboard(); this.showToast('Iuran berhasil disimpan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        exportDuesCSV() {
            const month = document.getElementById('duesMonth')?.value || '';
            const year = document.getElementById('duesYear')?.value || '';
            if (!month || !year) { this.showToast('Pilih bulan dan tahun terlebih dahulu', 'error'); return; }
            // Export baris PROYEKSI utk bulan terpilih (sama dgn tampilan renderDues) — bukan array mentah this.dues (bisa kosong -> "Tidak ada data")
            const { bulan, data } = this.duesRowsForSelectedMonth();
            // Sertakan orphan records (anggota sudah dihapus)
            this.getOrphanDues(bulan).forEach(d => {
                data.push({ m: { nik: d.nik, nama: d.nama, department: d.department, iuranBulanan: d.jumlah }, rec: d });
            });
            const rows = data.map(({ m, rec }) => ({
                nama: m.nama, nik: m.nik, department: m.department, bulan,
                jumlah: m.iuranBulanan, tanggalBayar: rec ? rec.tanggalBayar : 'Payroll', status: 'Lunas'
            }));
            this.exportToCSV(rows, 'data_iuran.csv', ['nama','nik','department','bulan','jumlah','tanggalBayar','status']);
        }
});
