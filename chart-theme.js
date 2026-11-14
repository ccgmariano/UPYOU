// Configuração Visual Global para todos os gráficos do UPYOU
window.UpYouChartTheme = {
    colors: {
        orange: '#ff5700',
        sky: '#38bdf8',
        purple: '#a855f7',
        green: '#22c55e',
        amber: '#f59e0b',
        red: '#ef4444',
        slate: '#64748b',
        grid: 'rgba(148, 163, 184, 0.12)',
        text: '#cbd5e1'
    },
    baseOptions(yLabel = '') {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1', font: { size: 12, weight: '600' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#38bdf8',
                    bodyColor: '#f1f5f9',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', maxRotation: 45 },
                    grid: { color: 'rgba(148, 163, 184, 0.08)' }
                },
                y: {
                    title: { display: Boolean(yLabel), text: yLabel, color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.12)' }
                }
            }
        };
    }
};
