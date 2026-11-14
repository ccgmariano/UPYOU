// Aba 1: Tabela de Pedaladas e Ecrã de Detalhes
function renderSummaryTable() {
  document.getElementById('summaryArea').style.display = 'block'; document.getElementById('detailArea').style.display = 'none';
  const tbody = document.getElementById('summaryBody'); tbody.innerHTML = '';
  [...dbActivities].reverse().forEach((act) => {
    if (!act.metrics) return;
    
    let pwrStr = `${act.metrics.avgPwr} W`;
    let badgeHtml = `<span style="color:#64748b; font-size:0.8rem;">S/ Dados</span>`;
    if (act.metrics.vi) {
      pwrStr = `${act.metrics.avgPwr} W / <span style="color:#a78bfa; font-weight:bold;">${act.metrics.np} W</span>`;
      if (isActivityStructured(act.metrics)) badgeHtml = `<span class="badge-estruturado">Estruturado</span>`;
      else badgeHtml = `<span class="badge-livre">Livre</span>`;
    }

    const sourceBadge = act.source === 'garmin' ? `<span class="badge-garmin">GARMIN</span>` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${act.date}</strong></td><td>${act.name}${sourceBadge}</td><td>${act.metrics.distKm} km</td><td>${pwrStr}</td><td>${badgeHtml}</td><td><button class="btn-small" onclick="viewDetails(${dbActivities.indexOf(act)})">Detalhes</button></td>`;
    tbody.appendChild(tr);
  });
}

window.viewDetails = function(index) {
  const act = dbActivities[index]; if (!act || !act.metrics) return;
  document.getElementById('summaryArea').style.display = 'none'; document.getElementById('detailArea').style.display = 'block';
  document.getElementById('actTitle').innerText = `${act.name} (${act.date})`;
  const m = act.metrics;

  document.getElementById('npVal').innerText = m.np ? `${m.np} W` : "--";
  if (m.vi) {
    document.getElementById('viVal').innerHTML = `<span style="color: ${m.vi <= 1.10 ? '#22c55e' : '#ef4444'}">${m.vi}</span>`;
  } else { document.getElementById('viVal').innerText = "--"; }
  
  if (m.blocksCount !== undefined) {
    if (m.blocksCount > 0) document.getElementById('structureVal').innerHTML = `<span style="color:#22c55e; font-weight:bold;">${m.blocksCount} bloco(s) estável(is) detetado(s)</span><br><span style="color:#94a3b8; font-size:0.8rem;">Ritmo disciplinado encontrado</span>`;
    else document.getElementById('structureVal').innerHTML = `<span style="color:#ef4444; font-weight:bold;">Nenhum bloco estável ≥ 5m</span><br><span style="color:#94a3b8; font-size:0.8rem;">Padrão livre / estocástico</span>`;
  } else { document.getElementById('structureVal').innerText = "--"; }

  document.getElementById('totalTime').innerText = `${Math.floor(m.totalSecs/3600)>0?Math.floor(m.totalSecs/3600)+'h ':''}${Math.floor((m.totalSecs%3600)/60)}m ${m.totalSecs%60}s`;
  document.getElementById('totalDist').innerText = `${m.distKm} km`; document.getElementById('avgSpeed').innerText = `${m.avgSpeed} km/h`;
  document.getElementById('avgPwr').innerText = `${m.avgPwr} W`; document.getElementById('avgHr').innerText = `${m.avgHr} bpm`;
  document.getElementById('avgCad').innerText = `${m.avgCad} rpm`;
  document.getElementById('mmp20Val').innerText = m.mmp20 && m.mmp20 > 0 ? `${m.mmp20} W` : "Treino < 20 min";
  if (m.drift !== null) {
    const eligibilityNote = (m.driftEligible === false) ? ` <span style="font-size:0.75rem; color:#94a3b8;">(Treino curto/variável)</span>` : '';
    document.getElementById('driftVal').innerHTML = `<span style="color: ${m.drift<=5?'#22c55e':'#f87171'}">${m.drift.toFixed(2)}%</span>${eligibilityNote}`;
  } else {
    document.getElementById('driftVal').innerText = "S/ Dados (< 15 min)";
  }
  document.getElementById('top4Mins').innerHTML = m.top4 && m.top4.length > 0 ? m.top4.map((item, idx) => `<b>${idx + 1}º esforço:</b> <span style="color: #fc5200; font-weight: bold;">${item.avg} W</span> (Média 4m)`).join('<br>') : 'Dados insuficientes (< 4 min).';
};

window.showSummary = function() { document.getElementById('detailArea').style.display = 'none'; document.getElementById('summaryArea').style.display = 'block'; };
