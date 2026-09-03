/* SPM Kecap Bango - Pengaduan & Aspirasi (Complaints) */
Object.assign(SPMApp.prototype, {
        deleteComplaint(id) {
            id = String(id);
            if (!confirm('Hapus pengaduan ini?')) return;
            this.complaints = this.complaints.filter(x => String(x.id) !== id);
            this.saveLocal('complaints', this.complaints);
            this.renderComplaints(); this.refreshDashboard();
            this.showToast('Pengaduan berhasil dihapus', 'success');
        },
        renderComplaints() {
            try {
                // Single-pass filter: this.complaints.filter() creates new array — no [...this.complaints] spread needed
                const cat = document.getElementById('compCategory')?.value || '';
                const st = document.getElementById('compStatus')?.value || '';
                const pr = document.getElementById('compPriority')?.value || '';
                const data = this.complaints.filter(c => {
                    if (cat && c.kategori !== cat) return false;
                    if (st && c.status !== st) return false;
                    if (pr && c.prioritas !== pr) return false;
                    return true;
                });

                // Single-pass: 4 stat dihitung dari filtered data (bukan this.complaints)
                let prog = 0, resolved = 0, asp = 0;
                data.forEach(c => {
                    if (c.status === 'Proses') prog++;
                    else if (c.status === 'Selesai') resolved++;
                    if (c.kategori === 'Aspirasi') asp++;
                });
                const total = data.length;
                document.getElementById('compTotal').textContent = total;
                document.getElementById('compProgress').textContent = prog;
                document.getElementById('compResolved').textContent = resolved;
                document.getElementById('compSuggestion').textContent = asp;

                const { totalPages, start, paged } = this.pageSlice(data, 'complaints');

                document.getElementById('complaintsBody').innerHTML = paged.length ? paged.map(c => `
                    <tr>
                        <td>${this.escapeHtml(c.id)}</td><td>${this.escapeHtml(c.tanggal)}</td><td>${this.escapeHtml(c.pelapor)}</td>
                        <td><span class="status-badge status-baru">${this.escapeHtml(c.kategori)}</span></td>
                        <td><strong>${this.escapeHtml(c.judul)}</strong></td>
                        <td>${this.badge(c.prioritas, 'priority')}</td>
                        <td>${this.badge(c.status)}</td>
                        <td><button class="btn btn-sm btn-info" onclick="App.viewComplaint('${this.escapeJsStr(c.id)}')"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-primary" onclick="App.updateComplaintStatus('${this.escapeJsStr(c.id)}')"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="App.deleteComplaint('${this.escapeJsStr(c.id)}')"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `).join('') : this.emptyRow(8, 'Tidak ada pengaduan');

                this.renderPag(totalPages, data.length, 'complaintsPagination', 'complaints');
            } catch (e) { console.error(e); this.showToast('Gagal memuat data pengaduan: ' + e.message, 'error'); }
        },
        viewComplaint(id) {
            id = String(id);
            const c = this.complaints.find(x => String(x.id) === id); if (!c) return;
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>Pelapor</label><p>${this.escapeHtml(c.pelapor)}</p></div>
                    <div class="detail-item"><label>Tanggal</label><p>${this.escapeHtml(c.tanggal)}</p></div>
                    <div class="detail-item"><label>Kategori</label><p>${this.escapeHtml(c.kategori)}</p></div>
                    <div class="detail-item"><label>Prioritas</label><p>${this.badge(c.prioritas, 'priority')}</p></div>
                    <div class="detail-item"><label>Status</label><p>${this.badge(c.status)}</p></div>
                    <div class="detail-item full"><label>Judul</label><p><strong>${this.escapeHtml(c.judul)}</strong></p></div>
                    <div class="detail-item full"><label>Keterangan</label><p>${this.escapeHtml(c.keterangan)}</p></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, `Pengaduan: ${c.judul}`);
        },
        updateComplaintStatus(id) {
            id = String(id);
            const c = this.complaints.find(x => String(x.id) === id); if (!c) return;
            const next = { 'Baru': 'Proses', 'Proses': 'Selesai', 'Selesai': 'Selesai', 'Ditolak': 'Ditolak' };
            c.status = next[c.status] || 'Proses';
            this.saveLocal('complaints', this.complaints);
            this.renderComplaints(); this.refreshDashboard(); this.showToast(`Status diubah ke "${c.status}"`, 'success');
        },
        showAddComplaint() {
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>Pelapor *</label><select id="fCompPelapor"><option value="">Pilih</option>${this.members.map(m => `<option>${this.escapeHtml(m.nama)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Kategori *</label><select id="fCompCat"><option>Pengaduan</option><option>Aspirasi</option><option>Saran</option><option>Kritik</option></select></div>
                    <div class="form-group"><label>Prioritas *</label><select id="fCompPri"><option>Tinggi</option><option>Sedang</option><option>Rendah</option></select></div>
                    <div class="form-group"><label>Tanggal</label><input type="date" id="fCompDate" value="${new Date().toISOString().slice(0,10)}"></div>
                    <div class="form-group full"><label>Judul *</label><input id="fCompTitle" maxlength="200"></div>
                    <div class="form-group full"><label>Keterangan *</label><textarea id="fCompDesc" rows="3" maxlength="2000"></textarea></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveComplaint()"><i class="fas fa-save"></i> Ajukan</button>`, 'Ajukan Pengaduan/Aspirasi');
        },
        saveComplaint() {
            try {
                const v = this.getFormValues(['fCompPelapor', 'fCompCat', 'fCompPri', 'fCompDate', 'fCompTitle', 'fCompDesc']);
                const keterangan = (v.fCompDesc || '').trim();
                if (keterangan.length > 2000) { this.showToast('Keterangan maksimal 2000 karakter', 'error'); return; }
                if (!this.validateRequired([
                    ['fCompTitle', 'Judul', { required: true, maxLength: 200 }],
                    ['fCompDesc', 'Keterangan', { required: true }]
                ])) return;
                this.complaints.push({
                    id: this._nextId(), tanggal: v.fCompDate,
                    pelapor: v.fCompPelapor,
                    kategori: v.fCompCat || 'Pengaduan',
                    judul: v.fCompTitle, prioritas: v.fCompPri || 'Sedang',
                    status: 'Baru', keterangan: v.fCompDesc,
                });
                this.saveLocal('complaints', this.complaints);
                this.closeModal(); this.renderComplaints(); this.refreshDashboard(); this.showToast('Pengaduan berhasil diajukan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        }
});
