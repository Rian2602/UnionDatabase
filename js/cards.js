/* SPM Kecap Bango - Kartu Anggota (Cards)
 * Single source of truth for card data + visual specification.
 * Web preview, PDF and browser print intentionally use the same dimensions,
 * labels, hierarchy, colors and member fields.
 */
Object.assign(SPMApp.prototype, {
    /** Centralized card spec — shared between web, PDF, and print */
    _cardSpec: {
        width: 85.6, height: 54,
        yearOffset: 1,
        palette: {
            green950: [6, 46, 37], green900: [10, 61, 47],
            lime: [201, 212, 58], paper: [250, 249, 245],
            ink: [12, 26, 18], muted: [93, 109, 99],
            line: [206, 216, 210], white: [255, 255, 255],
            photoBg: [226, 240, 233]
        }
    },

    async _loadCardLogoDataUrl() {
        if (this._cardLogoDataUrl) return this._cardLogoDataUrl;
        try {
            const response = await fetch('assets/spmkb-logo-aktual.jpeg');
            if (!response.ok) throw new Error(response.status);
            const blob = await response.blob();
            this._cardLogoDataUrl = await this._pdfFileReader(blob);
        } catch (e) { this._cardLogoDataUrl = ''; }
        return this._cardLogoDataUrl;
    },

    /** Convert photo URL to data URL for PDF embedding (avoids CORS) */
    async _cardPhotoDataUrl(url) {
        if (!url || !this.isSafePhotoUrl(url)) return '';
        if (String(url).startsWith('data:image/')) return String(url);
        try {
            const r = await fetch(url);
            if (!r.ok) return '';
            const blob = await r.blob();
            return await this._pdfFileReader(blob);
        } catch (e) { return ''; }
    },

    /** Centralized member data extraction — single source of truth */
    _cardMemberData(m) {
        const initials = String(m?.nama || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const no = String(m?.no ?? '').padStart(4, '0');
        const noAnggota = `SPM-${no}`;
        const tahun = new Date().getFullYear() + this._cardSpec.yearOffset;
        const nik = String(m?.nik || '-');
        const barcodeBars = Array.from({ length: 30 }, (_, i) => {
            const seed = nik.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            return 1 + ((seed * (i + 11)) % 3);
        });
        return {
            initials, noAnggota, tahun, nik,
            foto: m?.foto && this.isSafePhotoUrl(m.foto) ? String(m.foto) : '',
            nama: String(m?.nama || '-'),
            alamat: String(m?.alamat || '-'),
            ttl: [m?.tempatLahir, m?.tanggalLahir].filter(Boolean).map(String).join(', ') || '-',
            gender: String(m?.gender || '-'),
            dept: String(m?.department || '-'),
            jabatan: String(m?.jabatan || '-'),
            jobclass: String(m?.jobclass || '-'),
            barcodeBars
        };
    },

    /** Live search: filter members by name, NIK, or number */
    _cardSearchMembers(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return [];
        return this.members.filter(m =>
            this.str(m.nama).toLowerCase().includes(q) ||
            this.str(m.nik).toLowerCase().includes(q) ||
            this.str(m.no).toLowerCase().includes(q)
        ).slice(0, 12);
    },

    generateCard() {
        const input = document.getElementById('cardSearch');
        const q = input?.value?.trim() || '';
        if (!q) { this.showToast('Ketik nama, NIK, atau nomor anggota', 'error'); input?.focus(); return; }

        const ql = q.toLowerCase();
        const m = this.memberByNik.get(q) || this.members.find(x =>
            this.str(x.nama).toLowerCase().includes(ql) ||
            this.str(x.nik).includes(q) ||
            this.str(x.no).includes(q)
        );
        if (!m) { this.showToast('Anggota tidak ditemukan', 'error'); return; }

        this._cardMember = m;
        this._renderCardPreview(m);
        this.renderCardList();
    },

    /** Render card preview with toolbar (title + actions) */
    _renderCardPreview(m) {
        const d = this._cardMemberData(m);
        const showFoto = !!d.foto;
        const safe = v => this.escapeHtml(v);

        document.getElementById('cardPreview').innerHTML = `
            <div class="card-preview-toolbar">
                <div class="card-preview-title">
                    <span class="page-kicker">LIVE PREVIEW</span>
                    <strong>${safe(d.nama)}</strong>
                    <small>${safe(d.noAnggota)} · ${safe(d.nik)}</small>
                </div>
                <div class="card-view-actions">
                    <button class="btn btn-sm btn-secondary" onclick="App.flipCard()" type="button"><i class="fas fa-sync-alt"></i> Balik Kartu</button>
                    <button class="btn btn-sm btn-primary" onclick="App.downloadCardPDF()" type="button"><i class="fas fa-file-pdf"></i> PDF</button>
                    <button class="btn btn-sm btn-success" onclick="App.printCard()" type="button"><i class="fas fa-print"></i> Cetak</button>
                </div>
            </div>
            <div class="card-flip-container">
                <div class="member-card" id="printableCard" aria-label="Kartu anggota ${safe(d.nama)}">
                    <button class="flip-btn" onclick="App.flipCard()" title="Balik kartu" aria-label="Balik kartu" type="button">
                        <i class="fas fa-sync-alt"></i>
                    </button>

                    <!-- ═══ FRONT ═══ -->
                    <div class="member-card-front member-card-shell">
                        <div class="member-card-topline"></div>
                        <header class="member-card-header">
                            <div class="card-brand">
                                <img class="card-brand-logo" src="assets/spmkb-logo-aktual.jpeg" alt="Logo SPMKB">
                                <div class="card-brand-copy">
                                    <span class="card-brand-kicker">SERIKAT PEKERJA MANDIRI</span>
                                    <strong>SPMKB</strong>
                                    <small>PT. Anugrah Mutu Bersama</small>
                                </div>
                            </div>

                        </header>
                        <section class="member-card-main">
                            <div class="member-card-photo-wrap">
                                <div class="member-card-photo">
                                    ${showFoto
                                        ? `<img src="${safe(d.foto)}" alt="Foto ${safe(d.nama)}" class="card-photo-img">`
                                        : `<span class="card-initials">${safe(d.initials)}</span>`}
                                </div>
                                <span class="card-photo-caption">IDENTITAS ANGGOTA</span>
                            </div>
                            <div class="member-card-identity">
                                <span class="member-card-label">NAMA ANGGOTA</span>
                                <h3>${safe(d.nama)}</h3>
                                <div class="member-card-rule"></div>
                                <div class="member-card-meta">
                                    <div><span>ID ANGGOTA</span><strong>${safe(d.noAnggota)}</strong></div>
                                </div>
                            </div>
                        </section>
                        <footer class="member-card-footer">
                            <div class="member-card-validity"><span>BERLAKU s.d.</span><strong>${d.tahun}</strong></div>
                            <div class="member-card-nik"><span>NIK</span><strong>${safe(d.nik)}</strong></div>
                            <span class="member-card-motto">BERANI BERJUANG PASTI MENANG</span>
                        </footer>
                    </div>

                    <!-- ═══ BACK ═══ -->
                    <div class="member-card-back">
                        <div class="member-card-back-topline"></div>
                        <div class="member-card-back-header">
                            <div class="card-brand" style="gap:8px">
                                <img class="card-brand-logo" src="assets/spmkb-logo-aktual.jpeg" alt="Logo SPMKB" style="width:32px;height:32px">
                                <div class="card-brand-copy">
                                    <strong>Serikat Pekerja Mandiri Kecap Bango (SPMKB)</strong>
                                </div>
                            </div>
                            <span class="card-status">${safe(d.noAnggota)}</span>
                        </div>
                        <div class="member-card-back-body">
                            <div class="member-card-back-field"><label>NIK</label><span>${safe(d.nik)}</span></div>
                            <div class="member-card-back-field"><label>JENIS KELAMIN</label><span>${safe(d.gender)}</span></div>
                            <div class="member-card-back-field"><label>TTL</label><span>${safe(d.ttl)}</span></div>
                            <div class="member-card-back-field"><label>DEPARTEMEN</label><span>${safe(d.dept)}</span></div>
                            <div class="member-card-back-field"><label>JABATAN</label><span>${safe(d.jabatan)}</span></div>
                            <div class="member-card-back-field"><label>JOB CLASS</label><span>${safe(d.jobclass)}</span></div>
                            <div class="member-card-back-field full"><label>ALAMAT</label><span>${safe(d.alamat)}</span></div>
                            <div class="member-card-back-barcode" aria-label="Identitas NIK">
                                <div class="barcode-lines">${d.barcodeBars.map((w, i) => `<span style="width:${w}px;height:${10 + ((i * 7) % 18)}px"></span>`).join('')}</div>
                                <small>NIK ${safe(d.nik)}</small>
                            </div>
                        </div>
                        <div class="member-card-back-footer">
                            <span>BERLAKU s.d. ${d.tahun}</span>
                            <span>BERANI BERJUANG PASTI MENANG</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-print-note"><i class="fas fa-info-circle"></i> Cetak menampilkan sisi depan dan belakang berdampingan agar hasil dapat dipotong/ditata dengan mudah.</div>`;
    },

    /** Toggle flip kartu depan-belakang */
    flipCard() {
        const card = document.getElementById('printableCard');
        if (card) card.classList.toggle('flipped');
    },

    /** Live search dropdown */
    _onCardSearchInput() {
        const input = document.getElementById('cardSearch');
        const box = document.getElementById('cardSearchResults');
        if (!input || !box) return;
        const rows = this._cardSearchMembers(input.value);
        if (!input.value.trim() || !rows.length) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        box.innerHTML = rows.map(m => `
            <button type="button" class="card-search-result" onclick="App.selectCardMember('${this.escapeJsStr(m.nik)}')">
                <strong>${this.escapeHtml(m.nama)}</strong><span>${this.escapeHtml(m.nik)} · SPM-${this.escapeHtml(String(m.no).padStart(4,'0'))}</span>
            </button>`).join('');
    },

    /** Select member from search dropdown */
    selectCardMember(nik) {
        const m = this.memberByNik.get(String(nik));
        if (!m) return;
        const input = document.getElementById('cardSearch');
        if (input) input.value = m.nama;
        const box = document.getElementById('cardSearchResults');
        if (box) box.hidden = true;
        this._cardMember = m;
        this._renderCardPreview(m);
    },

    /** Render member list for batch selection with counter */
    renderCardList() {
        const container = document.getElementById('cardMemberList');
        if (!container) return;
        if (!this._cardListCache) {
            this._cardListCache = [...this.members].sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
        }
        const members = this._cardListCache;
        container.innerHTML = `
            <div class="card-batch-head">
                <div><strong><i class="fas fa-users"></i> Daftar Anggota</strong><span>${members.length} anggota</span></div>
                <div class="card-batch-actions">
                    <button class="btn btn-sm btn-primary" onclick="App.batchSelectAll()" type="button"><i class="fas fa-check-double"></i> Pilih Semua</button>
                    <button class="btn btn-sm btn-secondary" onclick="App.batchSelectNone()" type="button"><i class="fas fa-times"></i> Batal Pilih</button>
                    <button class="btn btn-sm btn-success" onclick="App.batchGeneratePDF()" type="button"><i class="fas fa-file-pdf"></i> Unduh PDF Terpilih</button>
                </div>
            </div>
            <div class="card-batch-list" id="cardBatchList">
                ${members.map(m => `
                    <label class="card-batch-item" data-nik="${this.escapeHtml(m.nik)}">
                        <input type="checkbox" value="${this.escapeHtml(m.nik)}" onchange="App._onBatchCheck(this)">
                        <span class="batch-name">${this.escapeHtml(m.nama)}</span>
                        <span class="batch-nik">${this.escapeHtml(m.nik)}</span>
                    </label>`).join('')}
            </div>`;
    },

    _onBatchCheck(cb) {
        cb.closest('.card-batch-item')?.classList.toggle('selected', cb.checked);
        const count = document.querySelectorAll('#cardBatchList input[type=checkbox]:checked').length;
        const label = document.querySelector('.card-batch-head > div:first-child span');
        if (label) label.textContent = `${count} dipilih · ${this.members.length} anggota`;
    },

    batchSelectAll() {
        document.querySelectorAll('#cardBatchList input[type=checkbox]').forEach(cb => {
            cb.checked = true; cb.closest('.card-batch-item')?.classList.add('selected');
        });
        this._onBatchCheck(document.querySelector('#cardBatchList input[type=checkbox]'));
    },

    batchSelectNone() {
        document.querySelectorAll('#cardBatchList input[type=checkbox]').forEach(cb => {
            cb.checked = false; cb.closest('.card-batch-item')?.classList.remove('selected');
        });
        const label = document.querySelector('.card-batch-head > div:first-child span');
        if (label) label.textContent = `${this.members.length} anggota`;
    },

    /** Batch generate PDF — front + back for each selected member */
    async batchGeneratePDF() {
        const checked = [...document.querySelectorAll('#cardBatchList input[type=checkbox]:checked')];
        if (!checked.length) { this.showToast('Pilih minimal 1 anggota', 'error'); return; }
        if (typeof jspdf === 'undefined') { this.showToast('Library PDF belum dimuat', 'error'); return; }

        const members = checked.map(cb => this.memberByNik.get(String(cb.value))).filter(Boolean);
        if (!members.length) { this.showToast('Data anggota tidak ditemukan', 'error'); return; }
        this.showToast(`Membuat ${members.length} kartu PDF (depan + belakang)…`, 'info');
        let success = 0, failed = 0;
        for (let i = 0; i < members.length; i++) {
            try {
                const doc = new jspdf.jsPDF({ unit: 'mm', format: [this._cardSpec.width, this._cardSpec.height], orientation: 'landscape' });
                await this._renderPDFCard(doc, members[i]);
                doc.save(`kartu-${members[i].nik}.pdf`);
                success++;
            } catch (e) {
                failed++;
                console.error(`PDF gen failed for ${members[i].nik}:`, e);
            }
            if (i < members.length - 1) await new Promise(r => setTimeout(r, 250));
        }
        if (failed) this.showToast(`${success} berhasil, ${failed} gagal`, 'warning');
        else this.showToast(`${success} kartu PDF selesai dibuat`, 'success');
    },

    /** Shared FileReader → data-URL helper (dedup between logo + photo) */
    _pdfFileReader(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    },

    /** PDF text helper — DRY for all text rendering */
    _pdfText(doc, text, x, y, maxWidth, fontSize, color, bold = true) {
        const [r, g, b] = color;
        doc.setTextColor(r, g, b);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(String(text || '-'), maxWidth);
        doc.text(lines.slice(0, 2), x, y);
        return lines.length;
    },

    /** Render single PDF card page (front + back, shared by single + batch) */
    async _renderPDFCard(doc, m) {
        const d = this._cardMemberData(m);
        const p = this._cardSpec.palette;
        const w = this._cardSpec.width, h = this._cardSpec.height;
        const logo = await this._loadCardLogoDataUrl();
        const photo = await this._cardPhotoDataUrl(d.foto);

        const drawBase = () => {
            doc.setFillColor(...p.paper); doc.rect(0, 0, w, h, 'F');
            doc.setFillColor(...p.lime); doc.rect(0, 0, w, 1.5, 'F');
            doc.setDrawColor(...p.line); doc.setLineWidth(.25); doc.rect(.35, .35, w-.7, h-.7);
        };
        const drawHeader = () => {
            doc.setFillColor(...p.green950); doc.rect(0, 1.5, w, 14, 'F');
            if (logo) doc.addImage(logo, 'JPEG', 5, 3.5, 10, 10);
            doc.setTextColor(...p.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
            doc.text('SERIKAT PEKERJA MANDIRI', 18, 7);
            doc.setFontSize(8.5); doc.text('SPMKB', 18, 11.7);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(4.1); doc.text('PT. Anugrah Mutu Bersama', 18, 14.4);
            doc.setFillColor(...p.lime); doc.roundedRect(w-27, 5.7, 22, 5.5, 1.2, 1.2, 'F');
            doc.setTextColor(...p.green950); doc.setFont('helvetica', 'bold'); doc.setFontSize(3.7);

        };

        // ═══ FRONT ═══
        drawBase(); drawHeader();
        doc.setFillColor(...p.photoBg); doc.roundedRect(5, 18, 17, 22, 1.5, 1.5, 'F');
        if (photo) {
            try { doc.addImage(photo, 'JPEG', 6, 19, 15, 20); } catch (e) { /* ponytail: format foto tak didukung */ }
        } else {
            this._pdfText(doc, d.initials, 13.5, 30, 15, 7, p.green900, true);
        }
        this._pdfText(doc, 'IDENTITAS ANGGOTA', 13.5, 42.5, 20, 3.1, p.muted, true);
        this._pdfText(doc, 'NAMA ANGGOTA', 27, 20.5, 53, 3.7, p.green900, true);
        this._pdfText(doc, d.nama, 27, 26.5, 53, 8.7, p.ink, true);
        doc.setDrawColor(...p.line); doc.line(27, 34.5, w-5, 34.5);
        this._pdfText(doc, 'ID ANGGOTA', 27, 38, 30, 3.3, p.muted, true);
        this._pdfText(doc, d.noAnggota, 27, 42.2, 35, 5, p.ink, true);
        doc.setFillColor(...p.lime); doc.rect(0, h-6.5, w, .5, 'F');
        doc.setFillColor(...p.green950); doc.rect(0, h-6, w, 6, 'F');
        this._pdfText(doc, 'BERLAKU s.d. ' + d.tahun, 5, h-2.5, 25, 3.5, p.white, true);
        this._pdfText(doc, 'NIK ' + d.nik, w/2, h-2.5, 30, 3.5, p.white, true);
        doc.setTextColor(...p.lime); doc.setFont('helvetica','normal'); doc.setFontSize(3.5);
        doc.text('BERANI BERJUANG PASTI MENANG', w-5, h-2.5, { align:'right' });

        // ═══ BACK ═══
        doc.addPage([w, h], 'landscape');
        drawBase();
        doc.setFillColor(...p.green950); doc.rect(0, 1.5, w, 11.5, 'F');
        if (logo) doc.addImage(logo, 'JPEG', 5, 2.5, 8, 8);
        doc.setTextColor(...p.white); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.text('SPMKB', 16, 7);
        doc.setFont('helvetica','normal'); doc.setFontSize(3.7); doc.text('Serikat Pekerja Mandiri Kecap Bango (SPMKB)', 16, 10);
        doc.setFillColor(...p.lime); doc.roundedRect(w-27, 4.5, 22, 5.5, 1.2, 1.2, 'F');
        doc.setTextColor(...p.green950); doc.setFont('helvetica','bold'); doc.setFontSize(3.8); doc.text(d.noAnggota, w-16, 8, {align:'center'});

        const fields = [
            ['NIK', d.nik], ['JENIS KELAMIN', d.gender],
            ['TTL', d.ttl], ['DEPARTEMEN', d.dept],
            ['JABATAN', d.jabatan], ['JOB CLASS', d.jobclass]
        ];
        let y = 18;
        fields.forEach(([label, value], i) => {
            const x = i % 2 ? 48 : 5;
            const yy = y + Math.floor(i / 2) * 7.2;
            this._pdfText(doc, label, x, yy, 38, 3.1, p.green900, true);
            this._pdfText(doc, value, x, yy+3.8, 38, 4.1, p.ink, false);
        });
        this._pdfText(doc, 'ALAMAT', 5, 40, 75, 3.1, p.green900, true);
        this._pdfText(doc, d.alamat, 5, 44, 75, 4, p.ink, false);
        doc.setDrawColor(...p.line); doc.line(5, 44, w-5, 44);
        // Barcode
        let bx = 15;
        d.barcodeBars.forEach((bar, i) => {
            const bh = 1.8 + ((i * 4) % 4);
            doc.setFillColor(...p.ink); doc.rect(bx, 46-bh, bar*.5, bh, 'F'); bx += bar*.5 + .7;
        });
        doc.setTextColor(...p.muted); doc.setFont('helvetica','normal'); doc.setFontSize(2.5);
        doc.text('IDENTITAS NIK \u00b7 ' + d.nik, w/2, 47.5, {align:'center'});
        // Footer band — match web card back footer
        doc.setFillColor(...p.lime); doc.rect(0, h-6.5, w, .5, 'F');
        doc.setFillColor(...p.green950); doc.rect(0, h-6, w, 6, 'F');
        const backFootY = h - 3;
        doc.setTextColor(...p.white); doc.setFont('helvetica','bold'); doc.setFontSize(3.5);
        doc.text('BERLAKU s.d. ' + d.tahun, 5, backFootY);
        doc.text('NIK ' + d.nik, w/2, backFootY, { align: 'center' });
        doc.setTextColor(...p.lime); doc.setFont('helvetica','bold');
        doc.text('BERANI BERJUANG PASTI MENANG', w-5, backFootY, { align: 'right' });
    },

    /** Download single card PDF (front + back) */
    async downloadCardPDF() {
        const m = this._cardMember;
        if (!m) { this.showToast('Generate kartu terlebih dahulu', 'error'); return; }
        if (typeof jspdf === 'undefined') { this.showToast('Library PDF belum dimuat', 'error'); return; }
        const doc = new jspdf.jsPDF({ unit: 'mm', format: [this._cardSpec.width, this._cardSpec.height], orientation: 'landscape' });
        await this._renderPDFCard(doc, m);
        doc.save('kartu-' + m.nik + '.pdf');
        this.showToast('PDF kartu depan + belakang diunduh', 'success');
    },

    printCard() {
        const card = document.getElementById('printableCard');
        if (!card) { this.showToast('Generate kartu terlebih dahulu', 'error'); return; }
        card.classList.remove('flipped');
        document.getElementById('cards')?.classList.add('printing');
        window.print();
        window.setTimeout(() => document.getElementById('cards')?.classList.remove('printing'), 500);
    }
});
