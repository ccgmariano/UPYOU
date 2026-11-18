// Módulo da Aba "As Suas Pedaladas" (Tabela de Histórico, Detalhes e Exclusão Segura por Chave Única)

window.getActivityUniqueKey = function(act) {
  if (!act) return '';
  if (act.garminId) return `garmin_${act.garminId}`;
  if (act.file) return String(act.file);
  const t = act.dateObj instanceof Date && !isNaN(act.dateObj.getTime()) ? act.dateObj.getTime() : 0;
  return `${act.date}_${act.name}_${t}`;
};

window.renderSummaryTable = function() {
  const tbody = document.getElementById('summaryBody');
  const summaryArea = document.getElementById('summaryArea');
  if (!tbody || !summaryArea) return;

  summaryArea.style.display = 'block';
  tbody.innerHTML = '';

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 20px;">Nenhuma pedalada encontrada.</td></tr>';
    return;
  }

  // Ordena da mais recente para a mais antiga para exibição na tabela
  const sorted = [...dbActivities].sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));

  sorted.forEach((act) => {
    const m = act.metrics || {};
    const tr = document.createElement('tr');
    const uKey = window.getActivityUniqueKey(act);
    const safeKey = uKey.replace(/'/g, "\\'");

    const isGarmin = act.source === 'garmin' || String(act.file || '').startsWith('garmin_') || Boolean(act.garminId);
    const garminBadge = isGarmin
      ? `<span style="background:#0284c7; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:4px; margin-left:6px; vertical-align:middle;">GARMIN</span>`
      : '';

    const isEst = Boolean(m.isEstimated);
    const estBadge = (isEst && m.avgPwr > 0)
      ? `<span style="color:#eab308; font-size:0.7rem; margin-left:4px;" title="Potência reconstruída pelo Motor Físico">~est</span>`
      : '';

    const pwrText = (m.avgPwr && m.avgPwr > 0)
      ? `${m.avgPwr} W / <strong style="color:#a78bfa;">${m.np || m.avgPwr} W</strong>${estBadge}`
      : `0 W`;

    let profileBadge = `<span style="background:#1e293b; color:#64748b; padding:3px 8px; border-radius:4px; font-size:0.75rem;">S/ Dados</span>`;
    if (m.avgPwr > 0 && m.vi > 0) {
      if (m.vi <= 1.10) {
        profileBadge = `<span style="background:#16a34a; color:#fff; padding:3px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Estruturado</span>`;
      } else {
        profileBadge = `<span style="background:#475569; color:#f8fafc; padding:3px 8px; border-radius:4px; font-size:0.75rem;">Livre</span>`;
      }
    }

    tr.innerHTML = `
      <td><strong>${act.date || '--'}</strong></td>
      <td>${act.name || 'Pedalada'}${garminBadge}</td>
      <td>${m.distKm || '0.00'} km</td>
      <td>${pwrText}</td>
      <td>${profileBadge}</td>
      <td style="white-space: nowrap;">
        <button class="btn" style="padding: 5px 10px; font-size: 0.78rem; margin: 0 4px 0 0;" onclick="showActivityDetailByKey('${safeKey}')">Detalhes</button>
        <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.78rem; margin: 0; background: #dc2626; color: #fff;" onclick="deleteActivityByKey('${safeKey}')">Excluir</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
};

window.showActivityDetailByKey = function(uKey) {
  if (typeof dbActivities === 'undefined') return;
  const idx = dbActivities.findIndex(a => window.getActivityUniqueKey(a) === uKey);
  if (idx !== -1) window.showActivityDetail(idx);
};

window.showActivityDetail = function(idx) {
  if (typeof dbActivities === 'undefined' || !dbActivities[idx]) return;
  const act = dbActivities[idx];
  const m = act.metrics || {};

  document.getElementById('summaryArea').style.display = 'none';
  document.getElementById('detailArea').style.display = 'block';

  document.getElementById('actTitle').innerText = `${act.date} — ${act.name}`;
  document.getElementById('npVal').innerText = m.np ? `${m.np} W` : '--';
  document.getElementById('viVal').innerText = m.vi ? m.vi.toFixed(2) : '--';

  const structEl = document.getElementById('structureVal');
  if (structEl) {
    if (m.blocksCount && m.blocksCount > 0) {
      structEl.innerHTML = `<span style="color:#22c55e; font-weight:bold;">${m.blocksCount} bloco(s) constante(s) ≥ 5 min</span> (Treino com controle de ritmo)`;
    } else if (m.avgPwr > 0) {
      structEl.innerHTML = `<span style="color:#94a3b8;">Pedalada livre / variável</span> (Sem blocos isocinéticos longos)`;
    } else {
      structEl.innerText = 'Sem dados de potência.';
    }
  }

  const hrs = Math.floor((m.movingSecs || m.totalSecs || 0) / 3600);
  const mins = Math.floor(((m.movingSecs || m.totalSecs || 0) % 3600) / 60);
  const secs = Math.floor((m.movingSecs || m.totalSecs || 0) % 60);
  document.getElementById('totalTime').innerText = `${hrs}h ${mins}m ${secs}s`;
  document.getElementById('totalDist').innerText = `${m.distKm || '0.00'} km`;
  document.getElementById('avgSpeed').innerText = `${m.avgSpeed || '0.0'} km/h`;
  document.getElementById('avgPwr').innerText = `${m.avgPwr || 0} W`;
  document.getElementById('avgHr').innerText = m.avgHr ? `${m.avgHr} bpm` : '--';
  document.getElementById('avgCad').innerText = m.avgCad ? `${m.avgCad} rpm` : '--';

  const driftEl = document.getElementById('driftVal');
  if (driftEl) {
    if (m.drift !== null && m.drift !== undefined) {
      const dVal = parseFloat(m.drift).toFixed(1);
      driftEl.style.color = m.drift <= 5.0 ? '#22c55e' : '#eab308';
      driftEl.innerText = `${dVal}%`;
    } else {
      driftEl.style.color = '#94a3b8';
      driftEl.innerText = 'N/A';
    }
  }

  document.getElementById('mmp20Val').innerText = m.mmp20 ? `${m.mmp20} W (FTP est: ${Math.round(m.mmp20 * 0.95)} W)` : 'Menos de 20 min ou s/ dados';

  const top4El = document.getElementById('top4Mins');
  if (top4El) {
    if (Array.isArray(m.top4) && m.top4.length > 0) {
      top4El.innerHTML = m.top4.map((t, i) => `<strong>#${i + 1}:</strong> ${t.avg} W`).join(' &nbsp;|&nbsp; ');
    } else {
      top4El.innerText = 'Sem intervalos suficientes.';
    }
  }
};

window.showSummary = function() {
  document.getElementById('detailArea').style.display = 'none';
  document.getElementById('summaryArea').style.display = 'block';
};
