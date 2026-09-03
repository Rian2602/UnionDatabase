/* SPM Kecap Bango - Buku Kas Keuangan (ledger mandiri manual di halaman Iuran & Keuangan) */
Object.assign(SPMApp.prototype, {
    renderBukuKas() {
        const el = document.getElementById('bukuKasBody');
        if (!el) return;
        const entries = this.bukuKas.slice().sort((a, b) => {
            if (a.tanggal < b.tanggal) return -1;
            if (a.tanggal > b.tanggal) return 1;
            return (a.id || 0) - (b.id || 0);
        });
        let saldo = 0;
        const decorated = entries.map(e => {
            const d = Number(e.debit) || 0, k = Number(e.kredit) || 0;
            saldo += d - k;
            return { e, d, k, saldo };
        });
        const total = decorated.length ? decorated[decorated.length - 1].saldo : 0;
        const saldoEl = document.getElementById('bukuKasSaldo');
        if (saldoEl) saldoEl.textContent = this.formatRupiah(total);
        const { totalPages, start, paged } = this.pageSlice(decorated, 'bukuKas');
        document.getElementById('bukuKasBody').innerHTML = paged.length ? paged.map(({ e, d, k, saldo }) => `
            <tr>
                <td>${this.escapeHtml(e.tanggal)}</td>
                <td>${this.escapeHtml(e.uraian)}</td>
                <td>${this.escapeHtml(e.kategori)}</td>
                <td class="money">${d ? this.formatRupiah(d) : ''}</td>
                <td class="money">${k ? this.formatRupiah(k) : ''}</td>
                <td class="money"><strong>${this.formatRupiah(saldo)}</strong></td>
                <td><button class="btn btn-sm btn-primary" onclick="App.editBukuKas('${this.escapeJsStr(e.id)}')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="App.deleteBukuKas('${this.escapeJsStr(e.id)}')"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('') : this.emptyRow(7, 'Belum ada transaksi', 'fa-book');
        this.renderPag(totalPages, decorated.length, 'bukuKasPagination', 'bukuKas');
    },
    addBukuKas() {
        this.openModal(`
            <div class="form-grid">
                <div class="form-group"><label>Tanggal *</label><input type="date" id="fBKTanggal" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group"><label>Kategori *</label><select id="fBKKategori"><option value="">Pilih</option><option>Iuran</option><option>Sumbangan</option><option>Donasi</option><option>Operasional</option><option>Kegiatan</option><option>Lain-lain</option></select></div>
                <div class="form-group full"><label>Uraian *</label><input id="fBKUraian" maxlength="200"></div>
                <div class="form-group"><label>Pemasukan (Debit, Rp)</label><input type="number" id="fBKDebit" min="0" value=""></div>
                <div class="form-group"><label>Pengeluaran (Kredit, Rp)</label><input type="number" id="fBKKredit" min="0" value=""></div>
                <div class="form-group full"><em>Isi salah satu saja: Debit (pemasukan) ATAU Kredit (pengeluaran), tidak boleh keduanya.</em></div>
            </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveBukuKas()"><i class="fas fa-save"></i> Simpan</button>`, 'Tambah Transaksi Buku Kas');
    },
    editBukuKas(id) {
        id = String(id);
        const e = this.bukuKas.find(x => String(x.id) === id); if (!e) return;
        if (e.sourceDuesId) { this.showToast('Baris synced dari iuran tidak bisa diedit', 'error'); return; }
        const d = Number(e.debit) || 0, k = Number(e.kredit) || 0;
        this.openModal(`
            <div class="form-grid">
                <div class="form-group"><label>Tanggal *</label><input type="date" id="fBKTanggal" value="${this.escapeHtml(e.tanggal)}"></div>
                <div class="form-group"><label>Kategori *</label><select id="fBKKategori"><option value="">Pilih</option>${['Iuran','Sumbangan','Donasi','Operasional','Kegiatan','Lain-lain'].map(k => `<option${k === e.kategori ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
                <div class="form-group full"><label>Uraian *</label><input id="fBKUraian" maxlength="200" value="${this.escapeHtml(e.uraian)}"></div>
                <div class="form-group"><label>Pemasukan (Debit, Rp)</label><input type="number" id="fBKDebit" min="0" value="${d}"></div>
                <div class="form-group"><label>Pengeluaran (Kredit, Rp)</label><input type="number" id="fBKKredit" min="0" value="${k}"></div>
                <div class="form-group full"><em>Isi salah satu saja: Debit (pemasukan) ATAU Kredit (pengeluaran).</em></div>
            </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveBukuKas('${this.escapeJsStr(id)}')"><i class="fas fa-save"></i> Simpan</button>`, 'Edit Transaksi Buku Kas');
    },
    saveBukuKas(editId) {
        try {
            if (editId !== undefined) editId = String(editId);
            if (!this.validateRequired([
                ['fBKTanggal', 'Tanggal', { required: true }],
                ['fBKUraian', 'Uraian', { required: true }],
                ['fBKKategori', 'Kategori', { required: true }]
            ])) return;
            const v = this.getFormValues(['fBKTanggal', 'fBKUraian', 'fBKKategori', 'fBKDebit', 'fBKKredit']);
            const validKategori = ['Iuran','Sumbangan','Donasi','Operasional','Kegiatan','Lain-lain'];
            if (!validKategori.includes(v.fBKKategori)) { this.showToast('Kategori tidak valid', 'error'); return; }
            const debit = parseInt(v.fBKDebit);
            const kredit = parseInt(v.fBKKredit);
            const hasDebit = !isNaN(debit) && debit > 0;
            const hasKredit = !isNaN(kredit) && kredit > 0;
            if ((hasDebit && hasKredit) || (!hasDebit && !hasKredit)) { this.showToast('Isi salah satu saja: Debit ATAU Kredit (> 0)', 'error'); return; }
            const rec = { tanggal: v.fBKTanggal, uraian: v.fBKUraian, kategori: v.fBKKategori, debit: hasDebit ? debit : 0, kredit: hasKredit ? kredit : 0 };
            if (editId !== undefined) {
                const e = this.bukuKas.find(x => String(x.id) === editId); if (!e) return;
                Object.assign(e, rec);
            } else {
                rec.id = this._nextId();
                this.bukuKas.push(rec);
            }
            this.saveLocal('bukuKas', this.bukuKas);
            this.closeModal(); this.renderBukuKas(); this.showToast('Transaksi berhasil disimpan', 'success');
        } catch (e) { console.error(e); this.showToast('Gagal menyimpan buku kas: ' + e.message, 'error'); }
    },
    deleteBukuKas(id) {
        id = String(id);
        const e = this.bukuKas.find(x => String(x.id) === id);
        if (e && e.sourceDuesId) { this.showToast('Baris synced dari iuran tidak bisa dihapus', 'error'); return; }
        if (!confirm('Hapus transaksi buku kas ini?')) return;
        try {
            this.bukuKas = this.bukuKas.filter(x => String(x.id) !== id);
            this.saveLocal('bukuKas', this.bukuKas);
            this.renderBukuKas(); this.showToast('Transaksi berhasil dihapus', 'success');
        } catch (e) { console.error(e); this.showToast('Gagal menghapus transaksi: ' + e.message, 'error'); }
    },
});
