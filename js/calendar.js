/* SPM Kecap Bango - Kalender Kegiatan (Calendar) */
Object.assign(SPMApp.prototype, {
        /** Shared event validation — single source of truth for saveEvent + saveEditEvent */
        _validateEvent() {
            if (!this.validateRequired([
                ['fEvtTitle', 'Judul', { required: true, maxLength: 200 }],
                ['fEvtDate', 'Tanggal', { required: true }]
            ])) return null;
            const v = this.getFormValues(['fEvtTitle', 'fEvtDate', 'fEvtType', 'fEvtDesc']);
            const title = (v.fEvtTitle || '').trim();
            const date = (v.fEvtDate || '').trim();
            const description = (v.fEvtDesc || '').trim();
            if (description.length > 1000) { this.showToast('Deskripsi maksimal 1000 karakter', 'error'); return null; }
            if (!this.isValidDate(date)) { this.showToast('Format tanggal tidak valid', 'error'); return null; }
            return { title, date, description, type: (v.fEvtType || 'Lainnya').trim() };
        },
        editEvent(id) {
            id = String(id);
            const e = this.events.find(x => String(x.id) === id); if (!e) return;
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group full"><label>Judul *</label><input id="fEvtTitle" maxlength="200" value="${this.escapeHtml(e.title)}"></div>
                    <div class="form-group"><label>Tanggal *</label><input type="date" id="fEvtDate" value="${this.escapeHtml(e.date)}"></div>
                    <div class="form-group"><label>Tipe *</label><select id="fEvtType"><option ${e.type==='Rapat'?'selected':''}>Rapat</option><option ${e.type==='Perundingan'?'selected':''}>Perundingan</option><option ${e.type==='Aksi'?'selected':''}>Aksi</option><option ${e.type==='Lainnya'?'selected':''}>Lainnya</option></select></div>
                    <div class="form-group full"><label>Deskripsi</label><textarea id="fEvtDesc" rows="3" maxlength="1000">${this.escapeHtml(e.description)}</textarea></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveEditEvent('${this.escapeJsStr(id)}')"><i class="fas fa-save"></i> Simpan</button>`, `Edit: ${e.title}`);
        },
        saveEditEvent(id) {
            try {
                id = String(id);
                const e = this.events.find(x => String(x.id) === id); if (!e) return;
                const data = this._validateEvent();
                if (!data) return;
                Object.assign(e, data);
                this.saveLocal('events', this.events);
                this.closeModal(); this.renderCalendar(); this.refreshDashboard(); this.populateAllFilters(); this.showToast('Kegiatan berhasil diperbarui', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        },
        deleteEvent(id) {
            id = String(id);
            const e = this.events.find(x => String(x.id) === id);
            if (!e) return;
            if (!confirm('Hapus kegiatan "' + e.title + '"?')) return;
            this.events = this.events.filter(x => String(x.id) !== id);
            this.saveLocal('events', this.events);            this.closeModal(); this.renderCalendar(); this.refreshDashboard(); this.populateAllFilters(); this.showToast('Kegiatan berhasil dihapus', 'success');
        },
        renderCalendar() {
            const y = this.calDate.getFullYear(), m = this.calDate.getMonth();
            document.getElementById('calMonthYear').textContent = new Date(y, m).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    
            const firstDay = new Date(y, m, 1).getDay();
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const today = new Date();
            const eventsByDate = new Map();
            this.events.forEach(e => {
                const date = String(e.date);
                const events = eventsByDate.get(date);
                if (events) events.push(e); else eventsByDate.set(date, [e]);
            });
    
            const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
            let html = dayNames.map(d => `<div class="cal-header">${d}</div>`).join('');
    
            for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
    
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isToday = today.getDate() === d && today.getMonth() === m && today.getFullYear() === y;
                const dayEvents = eventsByDate.get(dateStr) || [];
                const dayOfWeek = new Date(y, m, d).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
                html += `<div class="cal-day ${isToday ? 'today' : ''}" onclick="App.showDayDetail('${dateStr}')">
                    <div class="day-num ${isWeekend ? 'weekend' : ''}">${d}</div>
                    ${(() => { const VT = ['Rapat','Perundingan','Aksi','Lainnya']; return dayEvents.map(e => {
                        const safeType = VT.includes(e.type) ? e.type : 'Lainnya';
                        const typeClass = safeType.toLowerCase().replace(/\s/g,'');
                        return `<div class="cal-event ${typeClass}">${this.escapeHtml(e.title)}</div>`;
                    }).join(''); })()}
                </div>`;
            }
    
            document.getElementById('calendarGrid').innerHTML = html;
        },
        calPrevMonth() { this.calDate.setMonth(this.calDate.getMonth() - 1); this.renderCalendar(); },
        calNextMonth() { this.calDate.setMonth(this.calDate.getMonth() + 1); this.renderCalendar(); },
        calToday() { this.calDate = new Date(); this.renderCalendar(); },
        showDayDetail(dateStr) {
            const dayEvents = this.events.filter(e => e.date === dateStr);
            this.openModal(dayEvents.length ? dayEvents.map(e => `
                <div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;"><strong>${this.escapeHtml(e.title)}</strong><span class="status-badge status-baru">${this.escapeHtml(e.type)}</span></div>
                    <p style="font-size:12px;color:var(--muted);margin-top:4px;">${this.escapeHtml(e.description)}</p>
                    <button class="btn btn-sm btn-primary" onclick="App.editEvent('${this.escapeJsStr(e.id)}')"><i class="fas fa-edit"></i> Edit</button> <button class="btn btn-sm btn-danger" onclick="App.deleteEvent('${this.escapeJsStr(e.id)}')"><i class="fas fa-trash"></i> Hapus</button>
                </div>
            `).join('') : '<div class="empty-state"><p>Tidak ada kegiatan di hari ini</p></div>', `<button class="btn btn-secondary" onclick="App.closeModal()">Tutup</button>`, `Kegiatan: ${dateStr}`);
        },
        showAddEvent() {
            this.openModal(`
                <div class="form-grid">
                    <div class="form-group full"><label>Judul *</label><input id="fEvtTitle" maxlength="200"></div>
                    <div class="form-group"><label>Tanggal *</label><input type="date" id="fEvtDate" value="${new Date().toISOString().slice(0,10)}"></div>
                    <div class="form-group"><label>Tipe *</label><select id="fEvtType"><option>Rapat</option><option>Perundingan</option><option>Aksi</option><option>Lainnya</option></select></div>
                    <div class="form-group full"><label>Deskripsi</label><textarea id="fEvtDesc" rows="3" maxlength="1000"></textarea></div>
                </div>`, `<button class="btn btn-secondary" onclick="App.closeModal()">Batal</button><button class="btn btn-primary" onclick="App.saveEvent()"><i class="fas fa-save"></i> Simpan</button>`, 'Tambah Kegiatan');
        },
        saveEvent() {
            try {
                const data = this._validateEvent();
                if (!data) return;
                this.events.push({ id: this._nextId(), ...data });
                this.saveLocal('events', this.events);
                this.closeModal(); this.renderCalendar(); this.refreshDashboard(); this.populateAllFilters(); this.showToast('Kegiatan berhasil ditambahkan', 'success');
            } catch (e) { console.error(e); this.showToast('Gagal menyimpan data: ' + e.message, 'error'); }
        }
});
