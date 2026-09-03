/* SPM Kecap Bango - Laporan & Statistik (Reports) */
Object.assign(SPMApp.prototype, {
        renderReports() {
            try { this.updateReportCharts(); } catch (e) { console.error(e); this.showToast('Gagal memuat laporan: ' + e.message, 'error'); }
        },
        /** Render HTML bar chart (horizontal) into container id */
        renderHtmlBarChart(elId, labels, data, colors) {
            const el = document.getElementById(elId); if (!el) return;
            const maxVal = Math.max(...data, 1);
            const palette = colors || ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            el.innerHTML = '<div class="html-bar-chart">' + labels.map((l, i) => `<div class="html-bar-row"><span class="html-bar-label">${this.escapeHtml(l)}</span><div class="html-bar-track"><div class="html-bar-fill" style="width:${(data[i]/maxVal*100).toFixed(1)}%;background:${palette[i % palette.length]}"><span>${data[i]}</span></div></div></div>`).join('') + '</div>';
        },
        /** Render HTML doughnut chart into container id */
        renderHtmlDoughnut(elId, labels, data, colors, totalLabel, showPct) {
            const el = document.getElementById(elId); if (!el) return;
            const total = data.reduce((s, v) => s + v, 0);
            const palette = colors || ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            let cumulative = 0;
            const conicParts = data.map((v, i) => { const pct = (v / total) * 100; const start = cumulative; cumulative += pct; return `${palette[i % palette.length]} ${start}% ${cumulative}%`; });
            const legend = labels.map((l, i) => { const pctStr = showPct ? ` (${((data[i]/total)*100).toFixed(1)}%)` : ''; return `<span class="html-legend-item"><span class="html-legend-dot" style="background:${palette[i % palette.length]}"></span>${this.escapeHtml(l)} <span class="html-legend-value">${data[i]}${pctStr}</span></span>`; }).join('');
            el.innerHTML = `<div class="html-doughnut-wrap"><div class="html-doughnut" style="--doughnut-conic: ${conicParts.join(', ')}"><div class="html-doughnut-center"><span class="total">${total}</span><span class="label">${this.escapeHtml(totalLabel || 'Total')}</span></div></div><div class="html-chart-legend">${legend}</div></div>`;
        },
updateReportCharts() {
			const modul = document.getElementById('reportModule')?.value || 'members';

			// Dynamic chart card headers sesuai modul
			const headers = {
				members: { h1: 'Distribusi Departemen', h2: 'Job Class' },
				dues: { h1: 'Iuran per Bulan', h2: 'Status Pembayaran' },
				attendance: { h1: 'Status Kehadiran', h2: 'Kegiatan' },
				complaints: { h1: 'Status Pengaduan', h2: 'Kategori' },
				wages: { h1: 'Rata-rata Kenaikan per Skenario', h2: 'GP 2025 per Job Class' }
			};
			const h = headers[modul] || { h1: 'Distribusi Data', h2: 'Tren Data' };
			const cards = document.querySelectorAll('#reports .chart-card .card-header h3');
			if (cards[0]) cards[0].innerHTML = '<i class="fas fa-chart-pie"></i> ' + h.h1;
			if (cards[1]) cards[1].innerHTML = '<i class="fas fa-chart-bar"></i> ' + h.h2;

			// Date range filter
			const fromEl = document.getElementById('reportFrom');
			const toEl = document.getElementById('reportTo');
			const fromStr = fromEl?.value || '';
			const toStr = toEl?.value || '';
			const fromDate = fromStr ? new Date(fromStr + '-01') : null;
			const toDate = toStr ? new Date(toStr + '-01') : null;
			const dateFilter = (d, dateField) => {
				if (!fromDate && !toDate) return true;
				const val = d[dateField];
				if (!val) return true;
				const itemDate = dateField === 'bulan' ? new Date(val + '-01') : new Date(val);
				if (fromDate && itemDate < fromDate) return false;
				if (toDate && itemDate > toDate) return false;
				return true;
			};

			// Filter collections based on date range
			const members = this.members; // no date field for members
			const dues = this.dues.filter(d => dateFilter(d, 'bulan'));
			const attendance = this.attendance.filter(a => dateFilter(a, 'tanggal'));
			const complaints = this.complaints.filter(c => dateFilter(c, 'tanggal'));
			const wages = this.wageData;

			if (modul === 'members') {
				// Single-pass: deptCounts + jcCounts + deptSet + jcSet dalam 1 forEach
				const deptCounts = {}, jcCounts = {}, deptSet = new Set(), jcSet = new Set();
				members.forEach(m => {
					deptCounts[m.department] = (deptCounts[m.department]||0)+1;
					jcCounts[m.jobclass] = (jcCounts[m.jobclass]||0)+1;
					deptSet.add(m.department);
					jcSet.add(m.jobclass);
				});
                const jcLabels = Object.keys(jcCounts).sort();
                this.renderHtmlDoughnut('reportChart1', Object.keys(deptCounts), Object.values(deptCounts), ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'], 'Departemen');
                this.renderHtmlBarChart('reportChart2', jcLabels, jcLabels.map(k => jcCounts[k]));

				document.getElementById('reportSummary').innerHTML = `<div class="detail-grid">
					<div class="detail-item"><label>Total Anggota</label><p>${members.length}</p></div>
					<div class="detail-item"><label>Departemen</label><p>${deptSet.size}</p></div>
					<div class="detail-item"><label>Job Class</label><p>${jcSet.size}</p></div>
				</div>`;
} else if (modul === 'dues') {
                // Generate semua bulan dalam rentang date filter (termasuk yg 0 data)
                const monthCounts = {};
                if (fromDate && toDate) {
                    const cursor = new Date(fromDate);
                    while (cursor <= toDate) {
                        const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
                        monthCounts[key] = 0;
                        cursor.setMonth(cursor.getMonth() + 1);
                    }
                }
                dues.forEach(d => { monthCounts[d.bulan] = (monthCounts[d.bulan]||0)+1; });
                const monthLabels = Object.keys(monthCounts).sort();
                this.renderHtmlBarChart('reportChart1', monthLabels, monthLabels.map(k => monthCounts[k]), ['#10b981']);

				const statusCounts = {};
				dues.forEach(d => { statusCounts[d.status] = (statusCounts[d.status]||0)+1; });
                this.renderHtmlDoughnut('reportChart2', Object.keys(statusCounts), Object.values(statusCounts), ['#10b981','#ef4444','#f59e0b'], 'Status');

				const lunasData = dues.filter(d => d.status === 'Lunas');
				const lunas = lunasData.length;
				const lunasTotal = lunasData.reduce((s,d)=>s+(Number(d.jumlah)||0),0);
				document.getElementById('reportSummary').innerHTML = `<div class="detail-grid">
					<div class="detail-item"><label>Total Record</label><p>${dues.length}</p></div>
					<div class="detail-item"><label>Lunas</label><p>${lunas}</p></div>
					<div class="detail-item"><label>Belum Bayar</label><p>${dues.length - lunas}</p></div>
					<div class="detail-item"><label>Total Terkumpul</label><p class="money">${this.formatRupiah(lunasTotal)}</p></div>
				</div>`;
            } else if (modul === 'wages') {
                const scenarios = ['Pertemuan1','Pertemuan2','Pertemuan3','Pertemuan4','Pertemuan5'];
                const avgs = scenarios.map(s => { const d = wages[s]||[]; return d.length ? d.reduce((a,r)=>a+(Number(r.total_kenaikan)||0),0)/d.length : 0; });
                this.renderHtmlBarChart('reportChart1', ['P1','P2','P3','P4','P5'], avgs.map(v => Math.round(v)), ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6']);
    
                const data = wages['Pertemuan1'] || [];
                const jcAvg = {};
                data.forEach(r => { if (!jcAvg[r.jobclass]) jcAvg[r.jobclass] = { s: 0, c: 0 }; jcAvg[r.jobclass].s += Number(r.gaji_pokok_2025) || 0; jcAvg[r.jobclass].c++; });
                const jcAvgLabels = Object.keys(jcAvg).sort();
                this.renderHtmlBarChart('reportChart2', jcAvgLabels, jcAvgLabels.map(k => Math.round(jcAvg[k].s/jcAvg[k].c)), ['#94a3b8']);
                // Single-pass: maxGaji + maxKenaikan dalam 1 reduce (bukan Math.max spread)
                const stats = data.reduce((acc, r) => {
                    const g = Number(r.gaji_pokok_2025) || 0;
                    const k = Number(r.total_kenaikan) || 0;
                    if (g > acc.maxGaji) acc.maxGaji = g;
                    if (k > acc.maxKenaikan) acc.maxKenaikan = k;
                    return acc;
                }, { maxGaji: 0, maxKenaikan: 0 });
                const deptCount = data.reduce((s, r) => { s.deptSet.add(r.department); return s; }, { deptSet: new Set() }).deptSet.size;
    
                document.getElementById('reportSummary').innerHTML = `<div class="detail-grid">
                    <div class="detail-item"><label>Total Karyawan</label><p>${data.length}</p></div>
                    <div class="detail-item"><label>GP 2025 Tertinggi</label><p class="money">${this.formatRupiah(stats.maxGaji)}</p></div>
                    <div class="detail-item"><label>Kenaikan Tertinggi (P1)</label><p class="money money-pos">${this.formatRupiah(stats.maxKenaikan)}</p></div>
                    <div class="detail-item"><label>Departemen</label><p>${deptCount}</p></div>
                </div>`;
            } else if (modul === 'attendance') {
                // Single-pass: statusCounts + eventCounts + hadir/izin/alpha dalam 1 forEach (3 filter -> 0)
                const statusCounts = {}, eventCounts = {};
                let hadir = 0, izin = 0, alpha = 0;
                attendance.forEach(a => { statusCounts[a.status] = (statusCounts[a.status]||0)+1; eventCounts[a.kegiatan] = (eventCounts[a.kegiatan]||0)+1; if (a.status === 'Hadir') hadir++; else if (a.status === 'Izin') izin++; else if (a.status === 'Alpha') alpha++; });
                this.renderHtmlDoughnut('reportChart1', Object.keys(statusCounts), Object.values(statusCounts), ['#10b981','#f59e0b','#ef4444'], 'Status');
                this.renderHtmlBarChart('reportChart2', Object.keys(eventCounts), Object.values(eventCounts), ['#2563eb']);
                document.getElementById('reportSummary').innerHTML = `<div class="detail-grid">
                    <div class="detail-item"><label>Total Absensi</label><p>${attendance.length}</p></div>
                    <div class="detail-item"><label>Hadir</label><p>${hadir}</p></div>
                    <div class="detail-item"><label>Izin</label><p>${izin}</p></div>
                    <div class="detail-item"><label>Alpha</label><p>${alpha}</p></div>
                </div>`;
 } else if (modul === 'complaints') {
                const statusCounts = {};
                complaints.forEach(c => { statusCounts[c.status] = (statusCounts[c.status]||0)+1; });
                this.renderHtmlDoughnut('reportChart1', Object.keys(statusCounts), Object.values(statusCounts), ['#2563eb','#f59e0b','#10b981','#ef4444'], 'Status');

                // Single-pass: catCounts + baru/proses/selesai dalam 1 forEach
                const catCounts = {};
                let compBaru = 0, compProses = 0, compSelesai = 0;
                complaints.forEach(c => { catCounts[c.kategori] = (catCounts[c.kategori]||0)+1; if (c.status==='Baru') compBaru++; else if (c.status==='Proses') compProses++; else if (c.status==='Selesai') compSelesai++; });
                this.renderHtmlBarChart('reportChart2', Object.keys(catCounts), Object.values(catCounts), ['#8b5cf6']);
                document.getElementById('reportSummary').innerHTML = `<div class="detail-grid">
                    <div class="detail-item"><label>Total</label><p>${complaints.length}</p></div>
                    <div class="detail-item"><label>Baru</label><p>${compBaru}</p></div>
                    <div class="detail-item"><label>Proses</label><p>${compProses}</p></div>
                    <div class="detail-item"><label>Selesai</label><p>${compSelesai}</p></div>
                </div>`;
            } else {
                document.getElementById('reportChart1').innerHTML = '';
                document.getElementById('reportChart2').innerHTML = '';
                document.getElementById('reportSummary').innerHTML = '<div class="empty-state"><p>Data untuk modul ini akan segera tersedia</p></div>';
            }
        },
        generateReport() { this.updateReportCharts(); this.showToast('Laporan berhasil digenerate', 'success'); },
        exportReportPDF() {
            const modul = document.getElementById('reportModule')?.value || 'members';
            const labels = { members: 'Keanggotaan', dues: 'Iuran', attendance: 'Kehadiran', complaints: 'Pengaduan', wages: 'Perundingan Upah' };
            const total = modul === 'wages' ? (this.wageData.Pertemuan1 || []).length
                : modul === 'members' ? this.members.length : this[modul].length;
            const h = document.getElementById('reportPrintHeader');
            if (h) h.innerHTML = `<h2>Serikat Pekerja Mandiri Kecap Bango (SPMKB)</h2><p>Laporan ${labels[modul] || modul} · ${total} data</p><p>Dicetak ${new Date().toLocaleString('id-ID')}</p>`;
            window.print();
        }
});
