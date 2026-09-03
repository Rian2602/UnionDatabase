/* SPM Kecap Bango - Dashboard */
Object.assign(SPMApp.prototype, {
        // refreshDashboard: re-render dashboard HANYA bila halaman dashboard sedang aktif.
        // renderDashboard() = 2 HTML/CSS chart re-render + scan penuh members/dues/events/complaints -
        // sia-sia dipanggil dari handler mutasi saat user sedang di halaman lain (outputnya dibuang,
        // dan showPage('dashboard') selalu re-render fresh saat navigasi).
        refreshDashboard() {
            const activePage = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
            if (activePage === 'dashboard') this.renderDashboard();
        },
        calcDashboardStats() {
            const now = new Date(); const cm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
            let youth = 0, monthEventCount = 0, unresolvedCount = 0;
            this.members.forEach(m => { if ((this.computeAge(m) ?? Infinity) <= 35) youth++; });
            this.events.forEach(e => { if (String(e.date).startsWith(cm)) monthEventCount++; });
            this.complaints.forEach(c => { if (c.status !== 'Selesai') unresolvedCount++; });
            return { totalMembers: this.members.length, youth, monthEventCount, unresolvedCount, totalDues: this.thisMonthDuesTotal() };
        },
        renderDashboard() {
            const stats = this.calcDashboardStats();
            requestAnimationFrame(() => {
                const ed = new Date();
                document.getElementById('pageStampEdition').textContent = String(ed.getMonth() + 1).padStart(2, '0') + ' / ' + String(ed.getFullYear()).slice(2);
                document.getElementById('statMembers').textContent = stats.totalMembers;
                document.getElementById('statActive').textContent = stats.youth;
                document.getElementById('statDues').textContent = this.formatRupiah(stats.totalDues);
                document.getElementById('statEvents').textContent = stats.monthEventCount;
                document.getElementById('notifBadge').textContent = stats.unresolvedCount;
                this.renderDashMemberStatus();
                this.renderDashDept();
                this.renderDashEvents();
                this.renderDashComplaints();
            });
        },
        renderDashMemberStatus() {
            const counts = {};
            this.members.forEach(m => { const g = m.gender || 'Lainnya'; counts[g] = (counts[g] || 0) + 1; });
            const palette = { 'Laki-Laki': '#2563eb', 'Perempuan': '#ec4899', 'Lainnya': '#94a3b8' };
            const labels = ['Laki-Laki', 'Perempuan', 'Lainnya'].filter(l => counts[l]);
            const data = labels.map(l => counts[l]);
            const colors = labels.map(l => palette[l]);
            this.renderHtmlDoughnut('chartMemberStatus', labels, data, colors, 'Total Anggota', true);
        },
        renderDashDept() {
            const counts = {};
            this.members.forEach(m => { counts[m.department] = (counts[m.department] || 0) + 1; });
            const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
            const maxVal = sorted.length ? sorted[0][1] : 1;
            const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            const bars = sorted.map(([k, v], i) => `<div class="html-bar-row"><span class="html-bar-label">${this.escapeHtml(k)}</span><div class="html-bar-track"><div class="html-bar-fill" style="width:${(v/maxVal*100).toFixed(1)}%;background:${colors[i % colors.length]}"><span>${v}</span></div></div></div>`).join('');
            document.getElementById('chartDept').innerHTML = `<div class="html-bar-chart">${bars}</div>`;
        },
        renderDashEvents() {
            const now = Date.now();
            const upcoming = this.events.filter(e => this.isValidDate(e.date) && new Date(e.date).getTime() >= now).sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0, 5);
            document.getElementById('upcomingEvents').innerHTML = upcoming.length ? upcoming.map(e => `
                <div onclick="App.showPage('calendar')" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
                    <div style="min-width:40px;text-align:center;"><div style="font-size:18px;font-weight:700;color:var(--primary);">${new Date(e.date).getDate()}</div><div style="font-size:10px;color:var(--muted);">${new Date(e.date).toLocaleDateString('id-ID',{month:'short'})}</div></div>
                    <div><div style="font-size:13px;font-weight:600;">${this.escapeHtml(e.title)}</div><div style="font-size:11px;color:var(--muted);">${this.escapeHtml(e.type)}</div></div>
                </div>
            `).join('') : '<div class="empty-state"><p>Tidak ada kegiatan mendatang</p></div>';
        },
        renderDashComplaints() {
            const recent = [...this.complaints].filter(c => this.isValidDate(c.tanggal)).sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal)).slice(0, 5);
            document.getElementById('recentComplaints').innerHTML = recent.length ? recent.map(c => `
                <div onclick="App.viewComplaint('${this.escapeJsStr(c.id)}')" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;font-weight:600;">${this.escapeHtml(c.judul)}</span>${this.badge(c.status)}</div>
                    <div style="font-size:11px;color:var(--muted);">${this.escapeHtml(c.pelapor)} - ${this.escapeHtml(c.tanggal)}</div>
                </div>
            `).join('') : '<div class="empty-state"><p>Tidak ada pengaduan</p></div>';
        }
});
