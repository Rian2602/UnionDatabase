/* SPM Kecap Bango - Absensi Kegiatan (Attendance) */
Object.assign(SPMApp.prototype, {
        deleteAttendance(id) {
            if (!confirm('Hapus catatan absensi ini?')) return;
            id = String(id);
            this.attendance = this.attendance.filter(x => String(x.id) !== id);
            this.saveLocal('attendance', this.attendance);
            this.renderAttendance();
            this.showToast('Absensi berhasil dihapus', 'success');
        },
        renderAttendance() {
            // Populate event filter dynamically
            const attEventFilter = document.getElementById('attEventFilter');
            if (attEventFilter && attEventFilter.options.length <= 1) {
                const events = [...new Set(this.events.map(e => e.title))];
                attEventFilter.innerHTML = '<option value="">Semua Kegiatan</option>' +
                    events.map(e => `<option value="${this.escapeHtml(e)}">${this.escapeHtml(e)}</option>`).join('');
            }
            let data = [...this.attendance];
            const ev = document.getElementById('attEventFilter')?.value;
            const st = document.getElementById('attStatusFilter')?.value;
            data = data.filter(d => {
                if (ev && d.kegiatan !== ev) return false;
                if (st && d.status !== st) return false;
                return true;
            });
    
            const { totalPages, start, paged } = this.pageSlice(data, 'attendance');
    
            document.getElementById('attBody').innerHTML = paged.length ? paged.map((a,i) => `
                <tr>
                    <td>${start + i + 1}</td><td><strong>${this.escapeHtml(a.nama)}</strong></td><td>${this.escapeHtml(a.kegiatan)}</td>
                    <td>${this.escapeHtml(a.tanggal)}</td>
                    <td>${this.badge(a.status)}</td>
                    <td>${this.escapeHtml(a.keterangan) || '-'}</td>
                    <td><button class="btn btn-sm btn-info" onclick="App.viewAttendance('${this.escapeJsStr(a.id)}')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="App.deleteAttendance('${this.escapeJsStr(a.id)}')"><i class="fas fa-trash"></i></button></td>
                </tr>
            `).join('') : this.emptyRow(7, 'Tidak ada data absensi');
    
            this.renderPag(totalPages, data.length, 'attPagination', 'attendance');
        },
        viewAttendance(id) {
            id = String(id);
            const a = this.attendance.find(x => String(x.id) === id); if (!a) return;
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>Nama</label><p>${this.escapeHtml(a.nama)}</p></div>
                    <div class="detail-item"><label>NIK</label><p>${this.escapeHtml(a.nik)}</p></div>
                    <div class="detail-item"><label>Kegiatan</label><p>${this.escapeHtml(a.kegiatan)}</p></div>
                    <div class="detail-item"><label>Tanggal</label><p>${this.escapeHtml(a.tanggal)}</p></div>
                    <div class="detail-item"><label>Status</label><p>${this.badge(a.status)}</p></div>
                    <div class="detail-item"><label>Keterangan</label><p>${this.escapeHtml(a.keterangan) || '-'}</p></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, `Absensi: ${a.nama}`);
        },
        showAddAttendance() {
            const events = [...new Set(this.events.map(e => e.title))];
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>Anggota *</label><select id="fAttNik"><option value="">Pilih</option>${this.members.map(m => `<option value="${this.escapeHtml(m.nik)}">${this.escapeHtml(m.nama)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Kegiatan *</label><select id="fAttEvent"><option value="">Pilih</option>${events.map(e => `<option>${this.escapeHtml(e)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Tanggal *</label><input type="date" id="fAttDate" value="${new Date().toISOString().slice(0,10)}"></div>
                    <div class="form-group"><label>Status *</label><select id="fAttStatus"><option>Hadir</option><option>Izin</option><option>Alpha</option></select></div>
                    <div class="form-group full"><label>Keterangan</label><input id="fAttNote" maxlength="500"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveAttendance()"><i class="fas fa-save"></i> Simpan</button>`, 'Input Absensi');
        },
        saveAttendance() {
            try {
                if (!this.validateRequired([
                    ['fAttNik', 'Anggota', { required: true }],
                    ['fAttEvent', 'Kegiatan', { required: true }]
                ])) return;
                const v = this.getFormValues(['fAttNik', 'fAttEvent', 'fAttDate', 'fAttStatus', 'fAttNote']);
                const nik = (v.fAttNik || '').trim();
                const kegiatan = (v.fAttEvent || '').trim();
                const tanggal = (v.fAttDate || '').trim();
                const keterangan = (v.fAttNote || '').trim();
                if (keterangan.length > 500) { this.showToast('Keterangan maksimal 500 karakter', 'error'); return; }
                if (tanggal && !this.isValidDate(tanggal)) { this.showToast('Format tanggal tidak valid', 'error'); return; }
                // Check for duplicate attendance
                const exists = this.attendance.some(a => a.nik === nik && a.kegiatan === kegiatan && a.tanggal === tanggal);
                if (exists) { this.showToast('Anggota sudah tercatat hadir untuk kegiatan ini', 'error'); return; }
                const m = this.members.find(x => x.nik === nik);
                this.attendance.push({
                    id: `att-${this._nextId()}`, nama: m?.nama || '', nik,
                    kegiatan, tanggal,
                    status: (v.fAttStatus || 'Hadir').trim(),
                    keterangan
                });
                this.saveLocal('attendance', this.attendance);
                this.closeModal(); this.renderAttendance(); this.showToast('Absensi berhasil disimpan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        exportAttendanceCSV() { this.exportToCSV(this.attendance, 'data_absensi.csv', ['nik','nama','kegiatan','tanggal','status','keterangan']); }
});
