// Aba 9: Laboratório de Potência Estimada (Comparativo Real vs Estimada e Evolução)
let chartPotenciaEstInstance = null;

window.renderTabPotenciaEstimada = function(activities) {
    const ctx = document.getElementById('chart-potencia-estimada');
    if (!ctx) return;

    const cfg = window.UpYouPhysics.getSettings();
    const rw = document.getElementById('rider-weight');
    const bw = document.getElementById('bike-weight');
    const cda = document.getElementById('rider-cda');
    const crr = document.getElementById('rider-crr');
    if (rw) rw.value = cfg.riderWeight;
    if (bw) bw.value = cfg.bikeWeight;
    if (cda) cda.value = cfg.cda;
    if (crr) crr.value = cfg.crr;

    const valid = activities
        .filter(a => (a.avgPower || a.estAvgPower || 0) > 0)
        .slice()
        .reverse();

    const labels = valid.map(a => formatShortDate(a.date));
    const realSeries = valid.map(a => a.avgPower ? Math.round(a.avgPower) : null);
    const estSeries = valid.map(a => Math.round(a.estAvgPower || a.avgPower || 0));

    if (chartPotenciaEstInstance) chartPotenciaEstInstance.destroy();
    chartPotenciaEstInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Potência Real Medidor (W)',
                    data: realSeries,
                    borderColor: UpYouChartTheme.colors.orange,
                    backgroundColor: 'rgba(255, 87, 0, 0.15)',
                    tension: 0.25,
                    pointRadius: 4,
                    spanGaps: true
                },
                {
                    label: 'Potência Física Estimada (W)',
                    data: estSeries,
                    borderColor: UpYouChartTheme.colors.green,
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    borderDash: [5, 5],
                    tension: 0.25,
                    pointRadius: 4
                }
            ]
        },
        options: UpYouChartTheme.baseOptions('Watts Médios (W)')
    });
};

window.saveRiderPhysics = function() {
    const settings = {
        riderWeight: parseFloat(document.getElementById('rider-weight')?.value || '75'),
        bikeWeight: parseFloat(document.getElementById('bike-weight')?.value || '9'),
        cda: parseFloat(document.getElementById('rider-cda')?.value || '0.32'),
        crr: parseFloat(document.getElementById('rider-crr')?.value || '0.005')
    };
    window.UpYouPhysics.saveSettings(settings);
};
