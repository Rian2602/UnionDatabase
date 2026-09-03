/* SPM Kecap Bango - Surat & Dokumen (Letters) */
Object.assign(SPMApp.prototype, {
        editLetter(id) {
            id = String(id);
            const l = this.letters.find(x => String(x.id) === id); if (!l) return;
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>No. Surat *</label><input id="fLetterNo" maxlength="100" value="${this.escapeHtml(l.noSurat)}"></div>
                    <div class="form-group"><label>Tanggal *</label><input type="date" id="fLetterDate" value="${this.escapeHtml(l.tanggal)}"></div>
                    <div class="form-group"><label>Tipe *</label><select id="fLetterType"><option ${l.tipe==='Masuk'?'selected':''}>Masuk</option><option ${l.tipe==='Keluar'?'selected':''}>Keluar</option><option ${l.tipe==='Notulis'?'selected':''}>Notulis</option><option ${l.tipe==='Perjanjian'?'selected':''}>Perjanjian</option></select></div>
                    <div class="form-group"><label>Dari/Untuk</label><input id="fLetterFrom" maxlength="200" value="${this.escapeHtml(l.dari)}"></div>
                    <div class="form-group full"><label>Perihal *</label><input id="fLetterSubject" maxlength="200" value="${this.escapeHtml(l.perihal)}"></div>
                    <div class="form-group full"><label>Dokumen (URL/Referensi, opsional)</label><input id="fLetterUrl" placeholder="https://..." value="${this.escapeHtml(l.fileUrl || '')}"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveEditLetter('${this.escapeJsStr(id)}')"><i class="fas fa-save"></i> Simpan</button>`, `Edit: ${l.noSurat}`);
        },
        saveEditLetter(id) {
            try {
                id = String(id);
                const l = this.letters.find(x => String(x.id) === id); if (!l) return;
                if (!this.validateRequired([
                    ['fLetterNo', 'No. Surat', { required: true, maxLength: 100 }],
                    ['fLetterSubject', 'Perihal', { required: true, maxLength: 200 }]
                ])) return;
                const v = this.getFormValues(['fLetterNo', 'fLetterDate', 'fLetterType', 'fLetterSubject', 'fLetterFrom', 'fLetterUrl']);
                l.noSurat = v.fLetterNo;
                l.tanggal = v.fLetterDate;
                l.tipe = v.fLetterType || 'Masuk';
                l.perihal = v.fLetterSubject;
                l.dari = v.fLetterFrom;
                l.fileUrl = v.fLetterUrl;
                this.saveAndClose('letters', 'renderLetters', 'Surat berhasil diperbarui');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        deleteLetter(id) {
            id = String(id);
            if (!confirm('Hapus surat ini?')) return;
            this.letters = this.letters.filter(x => String(x.id) !== id);
            this.saveLocal('letters', this.letters);
            this.renderLetters();
            this.showToast('Surat berhasil dihapus', 'success');
        },
        renderLetters() {
            try {
                // Single-pass filter: this.letters.filter() creates new array — no [...this.letters] spread needed
                const tipe = document.getElementById('letterType')?.value || '';
                const data = tipe ? this.letters.filter(l => l.tipe === tipe) : this.letters;

                // Stats: single-pass count per tipe + status
                let masuk = 0, keluar = 0, notulis = 0, perjanjian = 0, selesai = 0;
                this.letters.forEach(l => {
                    if (l.tipe === 'Masuk') masuk++;
                    else if (l.tipe === 'Keluar') keluar++;
                    else if (l.tipe === 'Notulis') notulis++;
                    else if (l.tipe === 'Perjanjian') perjanjian++;
                    if (l.status === 'Selesai') selesai++;
                });

                document.getElementById('letterStats').innerHTML = [
                    this.renderStatCard('envelope', this.letters.length, 'Total Surat', 'blue'),
                    this.renderStatCard('sign-in-alt', masuk, 'Surat Masuk', 'green'),
                    this.renderStatCard('sign-out-alt', keluar, 'Surat Keluar', 'orange'),
                    this.renderStatCard('check-circle', selesai, 'Selesai', 'purple')
                ].join('');

                const { totalPages, start, paged } = this.pageSlice(data, 'letters');

                document.getElementById('lettersBody').innerHTML = paged.length ? paged.map(l => `
                    <tr>
                        <td>${this.escapeHtml(l.id)}</td><td>${this.escapeHtml(l.tanggal)}</td><td>${this.escapeHtml(l.noSurat)}</td>
                        <td><span class="status-badge status-baru">${this.escapeHtml(l.tipe)}</span></td>
                        <td><strong>${this.escapeHtml(l.perihal)}</strong></td><td>${this.escapeHtml(l.dari)}</td>
                        <td><span class="status-badge status-${this.statusClass(l.status)}">${this.escapeHtml(l.status)}</span></td>
                        <td><button class="btn btn-sm btn-info" onclick="App.viewLetter('${this.escapeJsStr(l.id)}')"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-primary" onclick="App.editLetter('${this.escapeJsStr(l.id)}')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="App.deleteLetter('${this.escapeJsStr(l.id)}')"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `).join('') : this.emptyRow(8, 'Tidak ada surat');

                this.renderPag(totalPages, data.length, 'lettersPagination', 'letters');
            } catch (e) { console.error(e); this.showToast('Gagal memuat data surat: ' + e.message, 'error'); }
        },
        viewLetter(id) {
            id = String(id);
            const l = this.letters.find(x => String(x.id) === id); if (!l) return;
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>No. Surat</label><p>${this.escapeHtml(l.noSurat)}</p></div>
                    <div class="detail-item"><label>Tanggal</label><p>${this.escapeHtml(l.tanggal)}</p></div>
                    <div class="detail-item"><label>Tipe</label><p>${this.escapeHtml(l.tipe)}</p></div>
                    <div class="detail-item"><label>Status</label><p><span class="status-badge status-${this.statusClass(l.status)}">${this.escapeHtml(l.status)}</span></p></div>
                    <div class="detail-item full"><label>Perihal</label><p><strong>${this.escapeHtml(l.perihal)}</strong></p></div>
                    <div class="detail-item full"><label>Dari / Untuk</label><p>${this.escapeHtml(l.dari)}</p></div>
                    ${l.fileUrl ? `<div class="detail-item full"><label>Dokumen</label><p>${this.isSafeFileUrl(l.fileUrl) ? `<a href="${this.escapeHtml(l.fileUrl)}" target="_blank" rel="noopener">${this.escapeHtml(l.fileUrl)}</a>` : `<span>${this.escapeHtml(l.fileUrl)}</span>`}</p></div>` : ''}
                </div>
                <div class="form-grid" style="margin-top:12px">
                    <div class="form-group full"><label>Ubah Status</label>
                        <select id="fLetterStatus">
                            <option ${l.status==='Baru'?'selected':''}>Baru</option>
                            <option ${l.status==='Diterima'?'selected':''}>Diterima</option>
                            <option ${l.status==='Terkirim'?'selected':''}>Terkirim</option>
                            <option ${l.status==='Selesai'?'selected':''}>Selesai</option>
                        </select>
                    </div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button><button class="btn btn-primary" onclick="App.updateLetterStatus('${this.escapeJsStr(l.id)}', document.getElementById('fLetterStatus').value)"><i class="fas fa-check"></i> Ubah Status</button>`, `Detail Surat: ${l.noSurat}`);
        },
        updateLetterStatus(id, status) {
            id = String(id);
            const l = this.letters.find(x => String(x.id) === id); if (!l) return;
            l.status = status;
            this.saveAndClose('letters', 'renderLetters', 'Status surat diperbarui');
        },
        showAddLetter() {
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>No. Surat *</label><input id="fLetterNo" maxlength="100"></div>
                    <div class="form-group"><label>Tanggal *</label><input type="date" id="fLetterDate" value="${new Date().toISOString().slice(0,10)}"></div>
                    <div class="form-group"><label>Tipe *</label><select id="fLetterType"><option>Masuk</option><option>Keluar</option><option>Notulis</option><option>Perjanjian</option></select></div>
                    <div class="form-group"><label>Dari/Untuk</label><input id="fLetterFrom" maxlength="200"></div>
                    <div class="form-group full"><label>Perihal *</label><input id="fLetterSubject" maxlength="200"></div>
                    <div class="form-group full"><label>Dokumen (URL/Referensi, opsional)</label><input id="fLetterUrl" placeholder="https://..."></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveLetter()"><i class="fas fa-save"></i> Simpan</button>`, 'Tambah Surat/Dokumen');
        },
        saveLetter() {
            try {
                if (!this.validateRequired([
                    ['fLetterNo', 'No. Surat', { required: true, maxLength: 100 }],
                    ['fLetterSubject', 'Perihal', { required: true, maxLength: 200 }]
                ])) return;
                const v = this.getFormValues(['fLetterNo', 'fLetterDate', 'fLetterType', 'fLetterSubject', 'fLetterFrom', 'fLetterUrl']);
                this.letters.push({
                    id: this._nextId(), tanggal: v.fLetterDate,
                    noSurat: v.fLetterNo, tipe: v.fLetterType || 'Masuk',
                    perihal: v.fLetterSubject,
                    dari: v.fLetterFrom, fileUrl: v.fLetterUrl,
                    status: 'Baru'
                });
                this.saveAndClose('letters', 'renderLetters', 'Surat berhasil ditambahkan');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        exportLetterCSV() {
            const tipe = document.getElementById('letterType')?.value || '';
            const data = tipe ? this.letters.filter(l => l.tipe === tipe) : this.letters;
            this.exportToCSV(data, 'data_surat.csv', ['tanggal','noSurat','tipe','perihal','dari','status']);
        }
});
