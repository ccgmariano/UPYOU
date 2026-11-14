// Aba 6: Evolução do Desacoplamento Cardíaco (Drift %)
let chartDriftInstance = null;

window.renderTabDrift = function(activities) {
    const ctx = document.getElementById('chart-drift');
    if (!ctx) return;

    const valid = activities
        .filter(a => typeof a.drift === 'number' && !isNaN(a.drift))
        .slice()
        .reverse();

    const labels = valid.map(a => formatShortDate(a.date));
    const data = valid.map(a => Number(a.drift.toFixed(2)));

    if (chartDriftInstance) chartDriftInstance.destroy();
    chartDriftInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Drift Cardíaco (%)',
                data,
                borderColor: UpYouChartTheme.colors.amber,
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                fill: true,
                tension: 0.25,
                pointRadius: 4
            }]
        },
        options: UpYouChartTheme.baseOptions('Drift (%)')
    });
};
