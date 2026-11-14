// Aba 3: Assinatura Cardíaca (Eficiência Aeróbica NP / FC)
let chartAssinaturaInstance = null;

window.renderTabAssinatura = function(activities) {
    const ctx = document.getElementById('chart-assinatura');
    if (!ctx) return;

    const valid = activities
        .filter(a => (a.np || a.estNp || a.avgPower || 0) > 50 && (a.avgHr || 0) > 80)
        .slice()
        .reverse();

    const labels = valid.map(a => formatShortDate(a.date));
    const efData = valid.map(a => {
        const pwr = a.np || a.estNp || a.avgPower;
        return Number((pwr / a.avgHr).toFixed(2));
    });

    if (chartAssinaturaInstance) chartAssinaturaInstance.destroy();
    chartAssinaturaInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Fator de Eficiência (W / bpm)',
                data: efData,
                borderColor: UpYouChartTheme.colors.sky,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                fill: true,
                tension: 0.25,
                pointRadius: 4
            }]
        },
        options: UpYouChartTheme.baseOptions('Watts por BPM')
    });
};
