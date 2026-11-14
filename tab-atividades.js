// Aba 1: Tabela de Pedaladas eClassificação de Perfil
window. renderTabAtividades = function(activities) {
    const tbody = document.getElementById('activities-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!activities || activities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:28px;">Nenhuma atividade sincronizada ainda. Clique em "Sincronizar Garmin" ou importe seu ZIP.</td></tr>';
        return;
    }

    activities.forEach(act => {
        const tr = document.createElement('tr');
        const dateStr = formatActivityDate(act.date);
        const distKm = ((act.distance || 0) / 1000).toFixed(2);
        const avgPwr = Math.round(act.avgPower || act.estAvgPower || 0);
        const npPwr = Math.round(act.np || act.estNp || avgPwr);
        const isEstimated = (!act.avgPower || act.avgPower === 0) && avgPwr > 0;

        const isStruct = isActivityStructured(act);
        const badgePerfil = avgPwr === 0
            ? '<span class="badge-free">S/ Potência</span>'
            : (isStruct ? '<span class="badge-structured">Estruturado</span>' : '<span class="badge-free">Livre</span>');

        const sourceBadge = act.source === 'garmin' ? '<span class="badge-garmin">GARMIN</span>' : '';
        const estBadge = isEstimated ? '<span class="badge-est" title="Potência Estimada por Física + FC">EST</span>' : '';

        tr.innerHTML = `
            <td><strong>${dateStr}</strong></td>
            <td>${escapeHtml(act.name || 'Pedalada')}${sourceBadge}</td>
            <td>${distKm} km</td>
            <td>${avgPwr} W / <span class="np-highlight">${npPwr} W</span>${estBadge}</td>
            <td>${badgePerfil}</td>
            <td><button class="btn-details" onclick="openActivityDetails('${act.id}')">Detalhes</button></td>
        `;
        tbody.appendChild(tr);
    });
};

window.isActivityStructured = function(act) {
    const avg = act.avgPower || act.estAvgPower || 0;
    const np = act.np || act.estNp || 0;
    if (avg <= 0 || np <= 0) return false;
    const vi = np / avg;
    return vi <= 1.08;
};
