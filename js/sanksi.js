Object.assign(SPMApp.prototype, {
    renderSanksi(nik, memberId) {
        const list = this.sanksi.filter(s => s.nik === nik)
            .sort((a, b) => (a.mulai < b.mulai ? 1 : -1));
        const today = new Date().toISOString().slice(0, 10);
        const rows = list.length ? list.map(s => {
            const berakhir = this.berakhirSanksi(s.mulai, s.jenis);
            const status = berakhir && berakhir < today ? 'Riwayat' : 'Berjalan';
            return `<tr>
                <td>${this.badge(s.jenis)}</td>
                <td>${this.escapeHtml(s.mulai)}</td>
                <td>${this.escapeHtml(berakhir || '-')}</td>
                <td>${this.escapeHtml(s.pasal)}</td>
                <td>${this.escapeHtml(s.pelanggaran)}</td>
                <td>${this.badge(status)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="App.editSanksi('${this.escapeJsStr(s.id)}','${this.escapeJsStr(memberId)}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="App.deleteSanksi('${this.escapeJsStr(s.id)}','${this.escapeJsStr(memberId)}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('') : '';
        return `<div class="sanksi-panel" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong>Riwayat Sanksi</strong>
                <button class="btn btn-sm btn-primary" onclick="App.addSanksi('${this.escapeJsStr(nik)}','${this.escapeJsStr(memberId)}')"><i class="fas fa-plus"></i> Tambah</button>
            </div>
            ${list.length ? `<table class="table table-sm">
                <thead><tr><th>Jenis</th><th>Mulai</th><th>Berakhir</th><th>Pasal PKB</th><th>Pelanggaran</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>` : this.emptyRow(7, 'Belum ada sanksi', 'fa-gavel')}
        </div>`;
    },
    addSanksi(nik, memberId) {
        this.openModal(`
            <div class="form-grid">
                <div class="form-group"><label>Jenis Sanksi</label>
                    <select id="fSJenis"><option value="" disabled selected>Pilih jenis</option><option value="STT">STT</option><option value="SP1">SP1</option><option value="SP2">SP2</option><option value="SP3">SP3</option></select></div>
                <div class="form-group"><label>Tanggal Mulai</label><input id="fSMulai" type="date"></div>
                <div class="form-group full"><label>Pasal PKB</label><input id="fSPasal" maxlength="200"></div>
                <div class="form-group full"><label>Pelanggaran</label><input id="fSPelanggaran" maxlength="500"></div>
                <div class="form-group full"><em>Tanggal Berakhir otomatis dihitung dari jenis (STT/SP1/SP2: 3 bln, SP3: 6 bln).</em></div>
            </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveSanksi('${this.escapeJsStr(nik)}','${this.escapeJsStr(memberId)}')"><i class="fas fa-save"></i> Simpan</button>`, 'Tambah Sanksi');
    },
    editSanksi(id, memberId) {
        id = String(id); memberId = String(memberId);
        const s = this.sanksi.find(x => String(x.id) === id); if (!s) return;
        const nik = s.nik;
        const berakhir = this.berakhirSanksi(s.mulai, s.jenis);
        this.openModal(`
            <div class="form-grid">
                <div class="form-group"><label>Jenis Sanksi</label>
                    <select id="fSJenis"><option ${s.jenis==='STT'?'selected':''}>STT</option><option ${s.jenis==='SP1'?'selected':''}>SP1</option><option ${s.jenis==='SP2'?'selected':''}>SP2</option><option ${s.jenis==='SP3'?'selected':''}>SP3</option></select></div>
                <div class="form-group"><label>Tanggal Mulai</label><input id="fSMulai" type="date" value="${this.escapeHtml(s.mulai)}"></div>
                <div class="form-group"><label>Berakhir (otomatis)</label><input value="${this.escapeHtml(berakhir || '-')}" disabled></div>
                <div class="form-group full"><label>Pasal PKB</label><input id="fSPasal" maxlength="200" value="${this.escapeHtml(s.pasal)}"></div>
                <div class="form-group full"><label>Pelanggaran</label><input id="fSPelanggaran" maxlength="500" value="${this.escapeHtml(s.pelanggaran)}"></div>
            </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveSanksi('${this.escapeJsStr(nik)}','${this.escapeJsStr(memberId)}','${this.escapeJsStr(id)}')"><i class="fas fa-save"></i> Simpan</button>`, `Edit Sanksi ${s.jenis}`);
    },
    saveSanksi(nik, memberId, editId) {
        try {
            if (editId !== undefined) editId = String(editId);
            memberId = String(memberId);
            const jenis = document.getElementById('fSJenis').value;
            const mulai = (document.getElementById('fSMulai').value || '').trim();
            const pasal = (document.getElementById('fSPasal')?.value || '').trim();
            const pelanggaran = (document.getElementById('fSPelanggaran')?.value || '').trim();
            if (!['STT', 'SP1', 'SP2', 'SP3'].includes(jenis)) { this.showToast('Pilih jenis sanksi', 'error'); return; }
            if (!mulai) { this.showToast('Tanggal mulai wajib diisi', 'error'); return; }
            if (!pasal) { this.showToast('Pasal PKB wajib diisi', 'error'); return; }
            if (!pelanggaran) { this.showToast('Pelanggaran wajib diisi', 'error'); return; }
            if (editId !== undefined) {
                const s = this.sanksi.find(x => String(x.id) === editId); if (!s) return;
                s.jenis = jenis; s.mulai = mulai; s.pasal = pasal; s.pelanggaran = pelanggaran;
            } else {
                this.sanksi.push({ id: this._nextId(), nik, jenis, mulai, pasal, pelanggaran });
            }
            this.saveLocal('sanksi', this.sanksi);
            this.closeModal();
            this.viewMember(memberId);
            this.showToast('Sanksi berhasil disimpan', 'success');
        } catch (e) { console.error(e); this.showToast('Gagal menyimpan sanksi: ' + e.message, 'error'); }
    },
    deleteSanksi(id, memberId) {
        id = String(id); memberId = String(memberId);
        if (!confirm('Hapus sanksi ini?')) return;
        try {
            this.sanksi = this.sanksi.filter(x => String(x.id) !== id);
            this.saveLocal('sanksi', this.sanksi);
            this.viewMember(memberId);
            this.showToast('Sanksi berhasil dihapus', 'success');
        } catch (e) { console.error(e); this.showToast('Gagal menghapus sanksi: ' + e.message, 'error'); }
    },
});
