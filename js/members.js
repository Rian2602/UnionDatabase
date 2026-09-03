/* SPM Kecap Bango - Data Keanggotaan (Members) */
Object.assign(SPMApp.prototype, {
        deleteMember(id) {
            id = +id;
            const m = this.members.find(x => x.id === id);
            if (!m) return;
            if (!confirm('Hapus anggota "' + m.nama + '"? Tindakan ini permanen.')) return;
            this.members = this.members.filter(x => x.id !== id);
            this.rebuildMemberIndex(); this._buildSearchIndex();
            // ponytail: anggota roster ditandai deletedNiks agar tidak dibangkitkan merge-NIK saat reload
            if (!m._manual) { this.deletedNiks.push(m.nik); this.saveLocal('deletedNiks', this.deletedNiks); }
            this.saveLocal('members', this.members);
            this.renderMembers(); this.refreshDashboard();
            this.showToast('Anggota berhasil dihapus', 'success');
        },
        getFilteredMembers() {
            let data = [...this.members];
            const dept = document.getElementById('memDeptFilter')?.value;
            const jc = document.getElementById('memJCFilter')?.value;
            const gender = document.getElementById('memGenderFilter')?.value;
            const youth = document.getElementById('memYouthFilter')?.value;
            return data.filter(m => {
                if (dept && m.department !== dept) return false;
                if (jc && m.jobclass !== jc) return false;
                if (gender && m.gender !== gender) return false;
                if (youth) {
                    const isYouth = (this.computeAge(m) ?? Infinity) <= 35;
                    if ((youth === 'youth') !== isYouth) return false;
                }
                return true;
            });
        },
        renderMembers() {
            let data = this.getFilteredMembers();
    
            data.sort((a,b) => { let va = a[this.sortField], vb = b[this.sortField]; if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); } return (va < vb ? -1 : va > vb ? 1 : 0) * (this.sortDir === 'asc' ? 1 : -1); });
    
            const { totalPages, start, paged } = this.pageSlice(data, 'members');
    
            document.getElementById('membersBody').innerHTML = paged.length ? paged.map(m => `
                <tr>
                    <td>${this.escapeHtml(m.no)}</td><td><strong>${this.escapeHtml(m.nama)}</strong></td><td>${this.escapeHtml(m.nik)}</td>
                    <td>${this.escapeHtml(m.department)}</td><td>${this.escapeHtml(m.jabatan)}</td><td><span class="job-badge">${this.escapeHtml(m.jobclass)}</span></td>
                    <td><button class="btn btn-sm btn-info" onclick="App.viewMember('${this.escapeJsStr(m.id)}')" aria-label="Lihat ${this.escapeHtml(m.nama)}"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="App.editMember('${this.escapeJsStr(m.id)}')" aria-label="Edit ${this.escapeHtml(m.nama)}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="App.deleteMember('${this.escapeJsStr(m.id)}')" aria-label="Hapus ${this.escapeHtml(m.nama)}"><i class="fas fa-trash"></i></button></td>
                </tr>
            `).join('') : this.emptyRow(7, 'Tidak ada data', 'fa-users');
            this.updateSortAria();
            this.renderPag(totalPages, data.length, 'membersPagination', 'members');
        },
        viewMember(id) {
            id = +id;
            const m = this.members.find(x => x.id === id); if (!m) return;
            const usia = this.computeAge(m);
            const masaKerja = this.masaKerja(m.nik);
            const pensiun = this.pensiunTahun(m);
            this.openModal(`
                <div class="detail-grid">
                    <div class="detail-item"><label>NIK</label><p>${this.escapeHtml(m.nik)}</p></div>
                    <div class="detail-item"><label>No. Anggota</label><p>SPM-${this.escapeHtml(m.no)}</p></div>
                    <div class="detail-item full"><label>Nama</label><p><strong>${this.escapeHtml(m.nama)}</strong></p></div>
                    <div class="detail-item"><label>Departemen</label><p>${this.escapeHtml(m.department)}</p></div>
                    <div class="detail-item"><label>Bagian</label><p>${this.escapeHtml(m.bagian)}</p></div>
                    <div class="detail-item"><label>Jabatan</label><p>${this.escapeHtml(m.jabatan)}</p></div>
                    <div class="detail-item"><label>Job Class</label><p><span class="job-badge">${this.escapeHtml(m.jobclass)}</span></p></div>
                    <div class="detail-item"><label>Gender</label><p>${this.escapeHtml(m.gender) || '-'}</p></div>
                    <div class="detail-item"><label>Pendidikan</label><p>${this.escapeHtml(m.pendidikan) || '-'}</p></div>
                    <div class="detail-item full"><label>Alamat</label><p>${this.escapeHtml(m.alamat)}</p></div>
                    <div class="detail-item"><label>Tempat Lahir</label><p>${this.escapeHtml(m.tempatLahir) || '-'}</p></div>
                    <div class="detail-item"><label>Tanggal Lahir</label><p>${this.escapeHtml(m.tanggalLahir) || '-'}</p></div>
                    <div class="detail-item"><label>Usia</label><p>${usia !== null ? usia + ' tahun' : '-'}</p></div>
                    <div class="detail-item"><label>Masa Kerja</label><p>${masaKerja !== null ? masaKerja + ' tahun' : '-'}</p></div>
                    <div class="detail-item"><label>Estimasi Pensiun</label><p>${pensiun !== null ? pensiun : '-'}</p></div>
                    <div class="detail-item"><label>Gaji Pokok 2025</label><p class="money">${this.formatRupiah(m.gaji_pokok_2025)}</p></div>
                    <div class="detail-item"><label>Gaji Pokok 2026</label><p class="money">${this.formatRupiah(m.gaji_pokok_2026)}</p></div>
                    <div class="detail-item"><label>Iuran Bulanan (1%)</label><p class="money">${this.formatRupiah(m.iuranBulanan)}</p></div>
                </div>
                <hr style="margin:16px 0">
                ${this.renderSanksi(m.nik, m.id)}
                `, `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button><button class="btn btn-primary" onclick="App.closeModal();App.editMember('${this.escapeJsStr(m.id)}')"><i class="fas fa-edit"></i> Edit</button>`, `Detail: ${m.nama}`);
        },
        editMember(id) {
            id = +id;
            const m = this.members.find(x => x.id === id); if (!m) return;
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>Nama</label><input id="fNama" value="${this.escapeHtml(m.nama)}" maxlength="200"></div>
                    <div class="form-group"><label>NIK</label><input id="fNik" value="${this.escapeHtml(m.nik)}" maxlength="8"></div>
                    <div class="form-group"><label>Departemen</label><input id="fDept" value="${this.escapeHtml(m.department)}" maxlength="100"></div>
                    <div class="form-group"><label>Bagian</label><input id="fBagian" value="${this.escapeHtml(m.bagian)}" maxlength="100"></div>
                    <div class="form-group"><label>Jabatan</label><input id="fJabatan" value="${this.escapeHtml(m.jabatan)}" maxlength="100"></div>
                    <div class="form-group"><label>Job Class</label><input id="fJC" value="${this.escapeHtml(m.jobclass)}"></div>
                    <div class="form-group"><label>Gaji Pokok 2025 (Rp)</label><input type="number" id="fGaji2025" min="0" value="${m.gaji_pokok_2025 || 0}"></div>
                    <div class="form-group"><label>Gaji Pokok 2026 (Rp)</label><input type="number" id="fGaji2026" min="0" value="${m.gaji_pokok_2026 || 0}"></div>
                    <div class="form-group"><label>Gender</label><select id="fGender"><option value="">-</option><option ${m.gender==='Laki-Laki'?'selected':''}>Laki-Laki</option><option ${m.gender==='Perempuan'?'selected':''}>Perempuan</option></select></div>
                    <div class="form-group"><label>Pendidikan</label><select id="fPendidikan"><option value="">-</option><option ${m.pendidikan==='SD'?'selected':''}>SD</option><option ${m.pendidikan==='SMP'?'selected':''}>SMP</option><option ${m.pendidikan==='SLTA/Sederajat'?'selected':''}>SLTA/Sederajat</option><option ${m.pendidikan==='D3'?'selected':''}>D3</option><option ${m.pendidikan==='S1'?'selected':''}>S1</option></select></div>
                    <div class="form-group"><label>Alamat</label><input id="fAlamat" value="${this.escapeHtml(m.alamat)}"></div>
                    <div class="form-group"><label>Tempat Lahir</label><input id="fTempatLahir" value="${this.escapeHtml(m.tempatLahir) || ''}"></div>
                    <div class="form-group"><label>Tanggal Lahir</label><input id="fTanggalLahir" value="${this.escapeHtml(m.tanggalLahir) || ''}"></div>
                    <div class="form-group full"><label>Foto (URL/Data URL, opsional)</label><input id="fFoto" value="${this.escapeHtml(m.foto) || ''}"></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveMemberEdit('${this.escapeJsStr(m.id)}')"><i class="fas fa-save"></i> Simpan</button>`, `Edit: ${m.nama}`);
        },
        saveMemberEdit(id) {
            try {
                id = +id;
                const m = this.members.find(x => x.id === id); if (!m) return;
                if (!this.validateRequired([
                    ['fNama', 'Nama', { required: true, maxLength: 200 }],
                    ['fNik', 'NIK', { required: true }]
                ])) return;
                const v = this.getFormValues(['fNik', 'fNama', 'fDept', 'fBagian', 'fJabatan', 'fJC', 'fGender', 'fPendidikan', 'fAlamat', 'fTempatLahir', 'fTanggalLahir', 'fFoto', 'fGaji2025', 'fGaji2026']);
                if (!this.isValidNik(v.fNik)) { this.showToast('NIK harus 8 digit angka', 'error'); return; }
                if (this.members.some(x => x.nik === v.fNik && x.id !== id)) { this.showToast('NIK sudah terdaftar', 'error'); return; }
                m.nama = v.fNama;
                m.nik = v.fNik;
                m.department = v.fDept;
                m.bagian = v.fBagian;
                m.jabatan = v.fJabatan;
                m.jobclass = v.fJC;
                m.gender = v.fGender;
                m.pendidikan = v.fPendidikan;
                m.alamat = v.fAlamat;
                m.tempatLahir = v.fTempatLahir;
                m.tanggalLahir = this.normalizeBirth(v.fTanggalLahir);
                if (!this.isValidTempatLahir(m.tempatLahir, m.tanggalLahir)) { this.showToast('Tempat lahir tidak boleh berupa tanggal / identik dengan tanggal lahir', 'error'); return; }
                m.gaji_pokok_2025 = parseInt(v.fGaji2025) || 0;
                m.gaji_pokok_2026 = parseInt(v.fGaji2026) || 0;
                m.total_kenaikan = m.gaji_pokok_2026 - m.gaji_pokok_2025;
                m.foto = v.fFoto || null;
                m.iuranBulanan = this.iuranBulanan(m);
                this.rebuildMemberIndex(); this._buildSearchIndex();
                this.saveLocal('members', this.members);
                this.closeModal(); this.renderMembers(); this.refreshDashboard(); this.showToast('Data anggota berhasil disimpan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        showAddMember() {
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group"><label>Nama *</label><input id="fNama" maxlength="200"></div>
                    <div class="form-group"><label>NIK *</label><input id="fNik" maxlength="8"></div>
                    <div class="form-group"><label>Departemen *</label><input id="fDept" maxlength="100"></div>
                    <div class="form-group"><label>Bagian</label><input id="fBagian" maxlength="100"></div>
                    <div class="form-group"><label>Jabatan *</label><input id="fJabatan" maxlength="100"></div>
                    <div class="form-group"><label>Job Class</label><input id="fJC"></div>
                    <div class="form-group"><label>Gaji Pokok 2025 (Rp)</label><input type="number" id="fGaji2025" min="0" value="0"></div>
                    <div class="form-group"><label>Gaji Pokok 2026 (Rp)</label><input type="number" id="fGaji2026" min="0" value="0"></div>
                    <div class="form-group full"><label>Alamat</label><input id="fAlamat"></div>
                    <div class="form-group"><label>Tempat Lahir</label><input id="fTempatLahir"></div>
                    <div class="form-group"><label>Tanggal Lahir</label><input id="fTanggalLahir"></div>
                    <div class="form-group full"><label>Foto (URL/Data URL, opsional)</label><input id="fFoto"></div>
                    <div class="form-group"><label>Gender</label><select id="fGender"><option value="">-</option><option>Laki-Laki</option><option>Perempuan</option></select></div>
                    <div class="form-group"><label>Pendidikan</label><select id="fPendidikan"><option value="">-</option><option>SD</option><option>SMP</option><option>SLTA/Sederajat</option><option>D3</option><option>S1</option></select></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveNewMember()"><i class="fas fa-save"></i> Simpan</button>`, 'Tambah Anggota Baru');
        },
        saveNewMember() {
            try {
                if (!this.validateRequired([
                    ['fNama', 'Nama', { required: true, maxLength: 200 }],
                    ['fNik', 'NIK', { required: true }]
                ])) return;
                const v = this.getFormValues(['fNama', 'fNik', 'fDept', 'fBagian', 'fJabatan', 'fJC', 'fGender', 'fPendidikan', 'fAlamat', 'fTempatLahir', 'fTanggalLahir', 'fFoto', 'fGaji2025', 'fGaji2026']);
                if (!this.isValidNik(v.fNik)) { this.showToast('NIK harus 8 digit angka', 'error'); return; }
                if (this.members.some(m => m.nik === v.fNik)) { this.showToast('NIK sudah terdaftar', 'error'); return; }
                const tempatLahir = v.fTempatLahir;
                const tanggalLahir = this.normalizeBirth(v.fTanggalLahir);
                if (!this.isValidTempatLahir(tempatLahir, tanggalLahir)) { this.showToast('Tempat lahir tidak boleh berupa tanggal / identik dengan tanggal lahir', 'error'); return; }
                const newId = Math.max(0, ...this.members.filter(m => Number.isFinite(+m.id)).map(m => +m.id)) + 1;
                this.members.push({
                    id: newId, no: newId, nama: v.fNama, nik: v.fNik, _manual: true,
                    department: v.fDept, bagian: v.fBagian, jabatan: v.fJabatan,
                    jobclass: v.fJC, gender: v.fGender, pendidikan: v.fPendidikan,
                    gaji_pokok_2025: parseInt(v.fGaji2025) || 0,
                    gaji_pokok_2026: parseInt(v.fGaji2026) || 0,
                    total_kenaikan: (parseInt(v.fGaji2026) || 0) - (parseInt(v.fGaji2025) || 0),
                    alamat: v.fAlamat, tempatLahir, tanggalLahir,
                    foto: v.fFoto || null,
                    iuranBulanan: this.iuranBulanan({ gaji_pokok_2025: parseInt(v.fGaji2025) || 0, jobclass: v.fJC })
                });
                this.rebuildMemberIndex(); this._buildSearchIndex();
                this.saveLocal('members', this.members);
                this.closeModal(); this.renderMembers(); this.refreshDashboard(); this.showToast('Anggota baru berhasil ditambahkan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        exportMembersCSV() { this.exportToCSV(this.getFilteredMembers(), 'data_keanggotaan.csv', ['no','nama','nik','department','bagian','jabatan','jobclass','gender','pendidikan','alamat','tempatLahir','tanggalLahir']); }
});
