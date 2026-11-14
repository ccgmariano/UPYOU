// Aba 2: Evolução de FTP
let chartFtpInstance = null;

window.renderTabFtp = function(activities) {
    const ctx = document.getElementById('chart-ftp');
    if (!ctx) return;

    const valid = activities
        .filter(a => (a.np || a.estNp || a.avgPower || 0) > 60 && (a.duration || 0) >= 1200)
        .slice()
        .reverse();

    const labels = valid.map(a => formatShortDate(a.date));
    let runningFtp = 0;
    const ftpSeries = valid.map(a => {
        const pwr20 = a.best20m || ((a.np || a.estNp || a.avgPower) * 1.02);
        const candidate = Math.round(pwr20 * 0.95);
        runningFtp = runningFtp === 0 ? candidate : Math.round(Math.max(candidate, runningFtp * 0.985));
        return runningFtp;
    });

    if (chartFtpInstance) chartFtpInstance.destroy();
    chartFtpInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'FTP Estimado (W)',
                data: ftpSeries,
                borderColor: UpYouChartTheme.colors.orange,
                backgroundColor: 'rgba(255, 87, 0, 0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 4
            }]
        },
        options: UpYouChartTheme.baseOptions('Watts (W)')
    });
};
