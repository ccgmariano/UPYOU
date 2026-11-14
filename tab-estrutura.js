// Aba 8: Volume de Estrutura (Estruturado vs Livre por Mês)
let chartEstruturaInstance = null;

window.renderTabEstrutura = function(activities) {
    const ctx = document.getElementById('chart-estrutura');
    if (!ctx) return;

    const buckets = {};
    activities.forEach(a => {
        if (!a.date) return;
        const d = new Date(a.date);
        if (isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets[key]) buckets[key] = { structured: 0, free: 0 };
        const hrs = (a.duration || 0) / 3600;
        if (window.isActivityStructured(a)) {
            buckets[key].structured += hrs;
        } else {
            buckets[key].free += hrs;
        }
    });

    const keys = Object.keys(buckets).sort();
    const structData = keys.map(k => Number(buckets[k].structured.toFixed(2)));
    const freeData = keys.map(k => Number(buckets[k].free.toFixed(2)));

    if (chartEstruturaInstance) chartEstruturaInstance.destroy();
    chartEstruturaInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [
                {
                    label: 'Estruturado (h)',
                    data: structData,
                    backgroundColor: UpYouChartTheme.colors.green
                },
                {
                    label: 'Livre (h)',
                    data: freeData,
                    backgroundColor: UpYouChartTheme.colors.purple
                }
            ]
        },
        options: UpYouChartTheme.baseOptions('Horas (h)')
    });
};
