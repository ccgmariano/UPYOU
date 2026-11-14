// Abas 4 e 5: Tempo em Zonas de Potência e Frequência Cardíaca
let chartZonasPwrInstance = null;
let chartZonasHrInstance = null;

window.renderTabZonasPotencia = function(activities) {
    const ctx = document.getElementById('chart-zonas-potencia');
    if (!ctx) return;

    const totals = [0, 0, 0, 0, 0, 0, 0];
    const ftp = estimateUserCurrentFtp(activities);

    activities.forEach(a => {
        if (a.powerZones && a.powerZones.length === 7) {
            a.powerZones.forEach((sec, i) => totals[i] += sec);
        } else {
            const p = a.avgPower || a.estAvgPower || 0;
            const dur = a.duration || 0;
            if (p > 0 && dur > 0) {
                const r = p / ftp;
                const idx = r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.90 ? 2 : r < 1.05 ? 3 : r < 1.20 ? 4 : r < 1.50 ? 5 : 6;
                totals[idx] += dur;
            }
        }
    });

    const hours = totals.map(s => Number((s / 3600).toFixed(2)));
    if (chartZonasPwrInstance) chartZonasPwrInstance.destroy();
    chartZonasPwrInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Z1 Recup.', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Limiar (FTP)', 'Z5 VO2Máx', 'Z6 Anaeróbico', 'Z7 Neuromusc.'],
            datasets: [{
                label: 'Horas Acumuladas',
                data: hours,
                backgroundColor: ['#64748b', '#38bdf8', '#22c55e', '#f59e0b', '#ff5700', '#ef4444', '#a855f7']
            }]
        },
        options: UpYouChartTheme.baseOptions('Horas (h)')
    });
};

window.renderTabZonasFc = function(activities) {
    const ctx = document.getElementById('chart-zonas-fc');
    if (!ctx) return;

    const maxHr = parseInt(document.getElementById('max-hr')?.value || '187', 10);
    const totals = [0, 0, 0, 0, 0];

    activities.forEach(a => {
        if (a.hrZones && a.hrZones.length === 5) {
            a.hrZones.forEach((sec, i) => totals[i] += sec);
        } else if (a.avgHr && a.duration) {
            const r = a.avgHr / maxHr;
            const idx = r < 0.60 ? 0 : r < 0.70 ? 1 : r < 0.80 ? 2 : r < 0.90 ? 3 : 4;
            totals[idx] += a.duration;
        }
    });

    const hours = totals.map(s => Number((s / 3600).toFixed(2)));
    if (chartZonasHrInstance) chartZonasHrInstance.destroy();
    chartZonasHrInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Z1 (<60%)', 'Z2 (60-70%)', 'Z3 (70-80%)', 'Z4 (80-90%)', 'Z5 (>90%)'],
            datasets: [{
                label: 'Horas em Zona de FC',
                data: hours,
                backgroundColor: ['#64748b', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444']
            }]
        },
        options: UpYouChartTheme.baseOptions('Horas (h)')
    });
};
