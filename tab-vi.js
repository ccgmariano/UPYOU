// Aba 7: Índice de Variabilidade (VI) - Apenas pontos sem linhas conectando
let chartViInstance = null;

window.renderTabVi = function(activities) {
    const ctx = document.getElementById('chart-vi');
    if (!ctx) return;

    const valid = activities
        .filter(a => (a.avgPower || a.estAvgPower || 0) > 20)
        .slice()
        .reverse();

    const labels = valid.map(a => formatShortDate(a.date));
    const viPoints = valid.map(a => {
        const avg = a.avgPower || a.estAvgPower;
        const np = a.np || a.estNp || avg;
        return Number((np / avg).toFixed(2));
    });

    const pointColors = viPoints.map(v => v <= 1.08 ? UpYouChartTheme.colors.green : UpYouChartTheme.colors.purple);

    if (chartViInstance) chartViInstance.destroy();
    chartViInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Índice de Variabilidade (VI)',
                data: viPoints,
                showLine: false,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#0b111e',
                pointBorderWidth: 1.5
            }]
        },
        options: UpYouChartTheme.baseOptions('VI (NP / Potência Média)')
    });
};
