// Aba 3: Assinatura Cardíaca Estabilizada por Zona Dinâmica de Potência (Coggan Z1-Z7) + Motor LTHR Consenso (3 Pilares)

const LTHR_CONSENSUS_KEY = 'upyou_use_lthr_consensus';

function isConsensusLthrEnabled() {
  return localStorage.getItem(LTHR_CONSENSUS_KEY) === 'true';
}

function getBestSustained45to60MinHr(act, maxHr) {
  const m = act && act.metrics;
  if (!m || !m.dispWindows) return 0;

  let best = 0;
  const dw = m.dispWindows;

  // 1) Blocos diretos de 60 min (3600s)
  if (Array.isArray(dw[3600]) && dw[3600].length > 0) {
    for (let i = 0; i < dw[3600].length; i++) {
      const hr = dw[3600][i][1];
      if (hr > best && hr <= maxHr * 0.96) best = hr;
    }
  }

  // 2) Janela móvel de 45 min via blocos de 15 min (3 blocos)
  if (best === 0 && Array.isArray(dw[900]) && dw[900].length >= 3) {
    for (let i = 0; i <= dw[900].length - 3; i++) {
      const avg = (dw[900][i][1] + dw[900][i + 1][1] + dw[900][i + 2][1]) / 3;
      if (avg > best && avg <= maxHr) best = avg;
    }
  }

  // 3) Janela móvel de 45 min via blocos de 5 min (9 blocos)
  if (best === 0 && Array.isArray(dw[300]) && dw[300].length >= 9) {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += dw[300][i][1];
    let localBest = sum / 9;
    for (let i = 9; i < dw[300].length; i++) {
      sum = sum - dw[300][i - 9][1] + dw[300][i][1];
      if (sum / 9 > localBest) localBest = sum / 9;
    }
    if (localBest <= maxHr *) best = localBest;
  }

  // 4) Janela móvel de 45 min via blocos de 1 min (45 blocos)
  if (best === 0 && Array.isArray(dw[60]) && dw[60].length >= 45) {
    let sum = 0;
    for (let i = 0; i < 45; i++) sum += dw[60][i][1];
    let localBest = sum / 45;
    for (let i = 45; i < dw[60].length; i++) {
      sum = sum - dw[60][i - 45][1] + dw[60][i][1];
      if (sum / 45 > localBest) localBest = sum / 45;
    }
    if (localBest <= maxHr) best = localBest;
  }

  return best >= 120 ? Math.round(best) : 0;
}

function computeConsensusLthr(filteredActs, anchorSumHr, anchorSecs, z4AvgHr, z4Secs) {
  const maxHr = typeof userMaxHr !== 'undefined' ? userMaxHr : 187;

  // Pilar 1: Âncora de Potência (95%–105% FTP, fallback Z4 90%–105% se < 3 min)
  let p1Val = 0;
  let p1Info = 'Sem amostra suficiente';
  if (anchorSecs >= 180) {
    p1Val = Math.round(anchorSumHr / anchorSecs);
    p1Info = `${Math.round(anchorSecs / 60)} min em 95–105% FTP`;
  } else if (z4Secs >= 180 && z4AvgHr > 0) {
    p1Val = z4AvgHr;
    p1Info = `${Math.round(z4Secs / 60)} min em Z4 (91–105% FTP)`;
  }

  // Pilar 2: Pico 20 min Corrigido 100% da MMP20-FC)
  let bestMhr20 = 0;
  let bestMhr20Date = '';
  filteredActs.forEach(act => {
    const h20 = typeof getActivityBest20MinHr === 'function'
      ? getActivityBest20MinHr(act)
      : (act.metrics && act.metrics.mhr20 ? act.metrics.mhr20 : 0);
    if (h20 >= 135 && h20 <= maxHr * 0.99 && h20 > bestMhr20) {
      bestMhr20 = h20;
      bestMhr20Date = act.date || '';
    }
  });
  const p2Val = bestMhr20 > 0 ? Math.round(bestMhr20) : 0;
  const p2Info = bestMhr20 > 0
    ? `96% de ${bestMhr20} bpm${bestMhr20Date ? ' (' + bestMhr20Date + ')' : ''}`
    : 'Sem bloco de 20 min no período';

  // Pilar 3: Platô de Longa Duração (45–60 min contínuos)
  let bestLongHr = 0;
  let bestLongDate = '';
  filteredActs.forEach(act => {
    const longHr = getBestSustained45to60MinHr(act, maxHr);
    if (longHr > bestLongHr) {
      bestLongHr = longHr;
      bestLongDate = act.date || '';
    }
  });
  const p3Val = bestLongHr;
  const p3Info = bestLongHr > 0
    ? `Platô contínuo${bestLongDate ? ' (' + bestLongDate + ')' : ''}`
    : 'Sem esforço contínuo ≥ 45 min';

  const pillars = [
    { key: 'anchor', label: 'Âncora de Potência', baseWeight: 0.50, value: p1Val, info: p1Info, color: '#eab308' },
    { key: 'mhr20',  label: 'Pico 20 min ', baseWeight: 0.30, value: p2Val, info: p2Info, color: '#38bdf8' },
    { key: 'long',   label: 'Platô 45–60 min',    baseWeight: 0.20, value: p3Val, info: p3Info, color: '#10b981' }
  ];

  const activePillars = pillars.filter(p => p.value > 0);
  const totalActiveWeight = activePillars.reduce((acc, p) => acc + p.baseWeight, 0);

  let consensus = 0;
  if (totalActiveWeight > 0) {
    let weightedSum = 0;
    pillars.forEach(p => {
      p.effWeight = p.value > 0 ? (p.baseWeight / totalActiveWeight) : 0;
      if (p.value > 0) weightedSum += p.value * p.effWeight;
    });
    consensus = Math.round(weightedSum);
  } else {
    pillars.forEach(p => { p.effWeight = 0; });
    consensus = Math.round(maxHr * 0.90);
  }

  let confidence = 'Baixa';
  let confidenceColor = '#ef4444';
  if (activePillars.length === 3) {
    confidence = 'Alta';
    confidenceColor = '#10b981';
  } else if (activePillars.length === 2) {
    confidence = 'Média';
    confidenceColor = '#eab308';
  }

  return {
    consensus,
    rawMhr20: bestMhr20,
    pctMaxHr: Math.round((consensus / maxHr) * 100),
    confidence,
    confidenceColor,
    activeCount: activePillars.length,
    pillars
  };
}

function applyGlobalLthrMode(consensusVal) {
  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  const enabled = isConsensusLthrEnabled();
  const maxHr = typeof userMaxHr !== 'undefined' ? userMaxHr : 187;

  // Preserva função original de LTHR se existir
  if (typeof window._origGetEstimatedLthr === 'undefined' && typeof window.getEstimatedLthr === 'function') {
    window._origGetEstimatedLthr = window.getEstimatedLthr;
  }

  if (enabled && consensusVal > 0) {
    window._activeConsensusLthr = consensusVal;
    localStorage.setItem('upyou_lthr_consensus_val', String(consensusVal));

    window.getEstimatedLthr = function() {
      return window._activeConsensusLthr || consensusVal;
    };

    // Aplica correção calibrada sobre o LTHR histórico, ancorada no consenso atual
    const lastAct = dbActivities[dbActivities.length - 1];
    const lastRaw = lastAct._rawLthr || lastAct.currentLthr || consensusVal;
    const ratio = lastRaw > 0 ? Math.min(1.05, Math.max(0.88, consensusVal / lastRaw)) : 1.0;

    dbActivities.forEach(act => {
      if (!act._rawLthr && act.currentLthr) act._rawLthr = act.currentLthr;
      if (act._rawLthr) {
        act.currentLthr = Math.round(Math.min(maxHr - 6, act._rawLthr * ratio));
      }
    });
  } else {
    if (typeof window._origGetEstimatedLthr === 'function') {
      window.getEstimatedLthr = window._origGetEstimatedLthr;
    }
    dbActivities.forEach(act => {
      if (act._rawLthr) act.currentLthr = act._rawLthr;
    });
  }

  // Sincroniza o histórico do gráfico FTP + LTHR
  if (typeof cachedFtpHistory !== 'undefined' && Array.isArray(cachedFtpHistory)) {
    cachedFtpHistory = dbActivities.map(act => ({
      date: act.dateObj,
      ftp: act.currentFtp,
      lthr: act.currentLthr
    }));
  }

  if (typeof updateHrSubtitle === 'function') updateHrSubtitle();
  if (typeof activeDashboardTabId !== 'undefined' && activeDashboardTabId === 'ftpTab' && typeof renderFtpChart === 'function') {
    renderFtpChart(cachedFtpHistory);
  }
}

window.toggleConsensusLthrGlobal = function(checked) {
  localStorage.setItem(LTHR_CONSENSUS_KEY, checked ? 'true' : 'false');
  renderDynamicZones();
};

function ensureAssinaturaControls() {
  const canvas = document.getElementById('zonesCanvas');
  if (!canvas) return;

  if (!document.getElementById('assinaturaControlsBar')) {
    const bar = document.createElement('div');
    bar.id = 'assinaturaControlsBar';
    bar.style.cssText = 'display: flex; gap: 15px; flex-wrap: wrap; background: #0f172a; padding: 12px 18px; border-radius: 6px; border: 1px solid #334155; margin: 12px 0; align-items: center; justify-content: space-between;';

    bar.innerHTML = `
      <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: center;">
        <label style="font-size: 0.82rem; color: #cbd5e1;">Período Analisado:
          <select class="custom-select" id="assPeriodoSelect" onchange="renderDynamicZones()" style="padding: 4px 8px; margin-left: 5px; background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 4px;">
            <option value="42" selected>Últimos 42 Dias (Forma Atual)</option>
            <option value="90">Últimos 90 Dias</option>
            <option value="180">Últimos 6 Meses</option>
            <option value="365">Último Ano (365d)</option>
            <option value="all">Todo o Histórico</option>
          </select>
        </label>

        <label style="font-size: 0.82rem; color: #cbd5e1;">Estabilização (Z1–Z5):
          <select class="custom-select" id="assJanelaSelect" onchange="renderDynamicZones()" style="padding: 4px 8px; margin-left: 5px; background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 4px;">
            <option value="300">Blocos de 5 min (Sem Inércia)</option>
            <option value="60" selected>Blocos de 1 min (Equilibrado)</option>
            <option value="15">Blocos de 15 seg (Alta Densidade)</option>
            <option value="5">Blocos de 5 seg (Picos Curtos)</option>
            <option value="1">Segundo a Segundo (Bruto)</option>
          </select>
        </label>
      </div>
      <div id="assResumoLabel" style="font-size: 0.8rem; color: #38bdf8; font-weight: bold;"></div>
    `;

    canvas.parentNode.insertBefore(bar, canvas);
  }

  if (!document.getElementById('assinaturaLthrPanel')) {
    const panel = document.createElement('div');
    panel.id = 'assinaturaLthrPanel';
    panel.style.cssText = 'margin-top: 16px; display: flex; flex-direction: column; gap: 12px;';
    canvas.parentNode.insertBefore(panel, canvas.nextSibling);
  }
}

function renderLthrConsensusPanel(lthrData) {
  const panel = document.getElementById('assinaturaLthrPanel');
  if (!panel || !lthrData) return;

  const maxHr = typeof userMaxHr !== 'undefined' ? userMaxHr : 187;
  const c = lthrData.consensus;
  const enabled = isConsensusLthrEnabled();

  const z1Max = Math.round(c * 0.68);
  const z2Min = z1Max + 1, z2Max = Math.round(c * 0.83);
  const z3Min = z2Max + 1, z3Max = Math.round(c * 0.94);
  const z4Min = z3Max + 1, z4Max = Math.round(c * 1.05);
  const z5Min = z4Max + 1;

  const cardsHtml = lthrData.pillars.map(p => {
    const hasVal = p.value > 0;
    const effPct = Math.round((p.effWeight || 0) * 100);
    return `
      <div style="background: #0f1522; border: 1px solid rgba(255,255,255,0.08); border-left: 3px solid ${hasVal ? p.color : '#475569'}; border-radius: 8px; padding: 10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
          <span style="font-size:0.7rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">${p.label}</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:0.68rem; color:${hasVal ? p.color : '#64748b'}; font-weight:700;">Peso ${effPct}%</span>
        </div>
        <div style="font-family:'JetBrains Mono',monospace; font-size:1.3rem; font-weight:800; color:${hasVal ? '#f8fafc' : '#64748b'}; margin: 4px 0 2px;">
          ${hasVal ? `${p.value} bpm` : '--'}
        </div>
        <div style="font-size:0.71rem; color:#94a3b8;">${p.info}</div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div style="background: #0a0e17; border: 1px solid rgba(234,179,8,0.3); border-radius: 10px; padding: 14px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:0.66rem; color:#94a3b8; letter-spacing:0.06em;">MOTOR LTHR CONSENSO (3 PILARES)</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:2px;">
              <span style="font-family:'JetBrains Mono',monospace; font-size:1.55rem; font-weight:800; color:#eab308;">${c} bpm</span>
              <span style="font-size:0.76rem; color:#cbd5e1;">${lthrData.pctMaxHr}% da FC Máx (${maxHr} bpm)</span>
              <span style="font-family:'JetBrains Mono',monospace; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:99px; background:rgba(255,255,255,0.05); border:1px solid ${lthrData.confidenceColor}; color:${lthrData.confidenceColor};">
                Confiança ${lthrData.confidence} (${lthrData.activeCount}/3)
              </span>
            </div>
          </div>
        </div>

        <label style="display:inline-flex; align-items:center; gap:8px; font-size:0.76rem; color:#e2e8f0; background:#0f1522; border:1px solid rgba(16,185,129,0.35); padding:7px 12px; border-radius:7px; cursor:pointer;">
          <input type="checkbox" id="chkUseConsensusLthr" ${enabled ? 'checked' : ''} onchange="toggleConsensusLthrGlobal(this.checked)" style="accent-color:#10b981; cursor:pointer;">
          <span>Aplicar LTHR Consenso em <strong>Tempo/Zona (FC)</strong></span>
        </label>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin-bottom:14px;">
        ${cardsHtml}
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.75rem; background:#0f1522; border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.08); color:#94a3b8; font-family:'JetBrains Mono',monospace; font-size:0.67rem; text-align:left;">
              <th style="padding:7px 10px;">ZONA COGGAN (FC)</th>
              <th style="padding:7px 10px;">% LTHR</th>
              <th style="padding:7px 10px;">FAIXA CALIBRADA (BPM)</th>
              <th style="padding:7px 10px;">REFERÊNCIA</th>
            </tr>
          </thead>
          <tbody style="color:#e2e8f0;">
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:6px 10px; color:#94a3b8; font-weight:700;">Z1 Recuperação</td><td style="padding:6px 10px;">&lt; 68%</td><td style="padding:6px 10px; font-family:'JetBrains Mono',monospace;">&le; ${z1Max} bpm</td><td style="padding:6px 10px; color:#94a3b8;">Giro regenerativo</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:6px 10px; color:#38bdf8; font-weight:700;">Z2 Resistência</td><td style="padding:6px 10px;">69–83%</td><td style="padding:6px 10px; font-family:'JetBrains Mono',monospace;">${z2Min} – ${z2Max} bpm</td><td style="padding:6px 10px; color:#94a3b8;">Base aeróbica</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:6px 10px; color:#22c55e; font-weight:700;">Z3 Tempo</td><td style="padding:6px 10px;">84–94%</td><td style="padding:6px 10px; font-family:'JetBrains Mono',monospace;">${z3Min} – ${z3Max} bpm</td><td style="padding:6px 10px; color:#94a3b8;">Ritmo sustentado</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:6px 10px; color:#eab308; font-weight:700;">Z4 Limiar (LTHR)</td><td style="padding:6px 10px;">95–105%</td><td style="padding:6px 10px; font-family:'JetBrains Mono',monospace;">${z4Min} – ${z4Max} bpm</td><td style="padding:6px 10px; color:#94a3b8;">Limiar funcional</td></tr>
            <tr><td style="padding:6px 10px; color:#ef4444; font-weight:700;">Z5 VO2Máx / Anaeróbico</td><td style="padding:6px 10px;">&gt; 105%</td><td style="padding:6px 10px; font-family:'JetBrains Mono',monospace; color:#f87171; font-weight:700;">${z5Min} – ${maxHr} bpm</td><td style="padding:6px 10px; color:#94a3b8;">${Math.max(0, maxHr - z5Min + 1)} bpm de margem útil</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDynamicZones() {
  ensureAssinaturaControls();

  const canvas = document.getElementById('zonesCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 380, padL = 45, padR = 25, padT = 35, padB = 68;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  const periodoVal = document.getElementById('assPeriodoSelect')?.value || '42';
  const janelaSecs = parseInt(document.getElementById('assJanelaSelect')?.value || '60', 10);

  const latestDate = dbActivities[dbActivities.length - 1].dateObj || new Date();
  const cutoffTime = periodoVal === 'all' ? 0 : (latestDate.getTime() - parseInt(periodoVal, 10) * 86400000);

  let filteredActs = dbActivities.filter(a => a.dateObj && a.dateObj.getTime() >= cutoffTime && a.metrics && a.currentFtp);
  if (filteredActs.length === 0) {
    filteredActs = dbActivities.filter(a => a.metrics && a.currentFtp).slice(-10);
  }

  const latestFtp = filteredActs.length > 0 ? filteredActs[filteredActs.length - 1].currentFtp : 200;

  const zonesData = {
    Z1: { minP: 0.25, maxP: 0.55, sumHrWeight: 0, totWeight: 0, color: '#94a3b8', n: 'Z1 (<55%)' },
    Z2: { minP: 0.55, maxP: 0.75, sumHrWeight: 0, totWeight: 0, color: '#38bdf8', n: 'Z2 (56-75%)' },
    Z3: { minP: 0.75, maxP: 0.90, sumHrWeight: 0, totWeight: 0, color: '#22c55e', n: 'Z3 (76-90%)' },
    Z4: { minP: 0.90, maxP: 1.05, sumHrWeight: 0, totWeight: 0, color: '#eab308', n: 'Z4 (91-105%)' },
    Z5: { minP: 1.05, maxP: 1.20, sumHrWeight: 0, totWeight: 0, color: '#f97316', n: 'Z5 (106-120%)' },
    Z6: { minP: 1.20, maxP: 1.50, sumHrWeight: 0, totWeight: 0, color: '#ef4444', n: 'Z6 (121-150%)' },
    Z7: { minP: 1.50, maxP: 3.50, sumHrWeight: 0, totWeight: 0, color: '#a855f7', n: 'Z7 (>150%)' }
  };

  let anchorSumHr = 0;
  let anchorSecs = 0;

  filteredActs.forEach(act => {
    const m = act.metrics;
    const ftp = act.currentFtp;
    if (!m || !ftp) return;

    if (janelaSecs > 1 && m.dispWindows && m.dispWindows[janelaSecs] && m.dispWindows[janelaSecs].length > 0) {
      const pts = m.dispWindows[janelaSecs];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i][0], hr = pts[i][1];
        const ratio = p / ftp;

        if (ratio >= 0.95 && ratio <= 1.05) {
          anchorSumHr += hr * janelaSecs;
          anchorSecs += janelaSecs;
        }

        for (const key in zonesData) {
          const z = zonesData[key];
          if (ratio > z.minP && ratio <= z.maxP) {
            z.sumHrWeight += hr * janelaSecs;
            z.totWeight += janelaSecs;
            break;
          }
        }
      }

      if (janelaSecs >= 60) {
        const shortWin = (m.dispWindows[15] && m.dispWindows[15].length > 0) ? m.dispWindows[15] : (m.dispWindows[5] || []);
        for (let i = 0; i < shortWin.length; i++) {
          const p = shortWin[i][0], hr = shortWin[i][1];
          const ratio = p / ftp;
          if (ratio > 1.20 && ratio <= 3.50) {
            const zKey = ratio <= 1.50 ? 'Z6' : 'Z7';
            zonesData[zKey].sumHrWeight += hr * 15;
            zonesData[zKey].totWeight += 15;
          }
        }
      }
    } else if (m.pwrHrPairs && Object.keys(m.pwrHrPairs).length > 0) {
      for (const pStr in m.pwrHrPairs) {
        const p = parseInt(pStr, 10);
        const pair = m.pwrHrPairs[pStr];
        if (!pair || pair.secs <= 0) continue;
        const ratio = p / ftp;

        if (ratio >= 0.95 && ratio <= 1.05) {
          anchorSumHr += pair.sumHr;
          anchorSecs += pair.secs;
        }

        for (const key in zonesData) {
          const z = zonesData[key];
          if (ratio > z.minP && ratio <= z.maxP) {
            z.sumHrWeight += pair.sumHr;
            z.totWeight += pair.secs;
            break;
          }
        }
      }
    }
  });

  const zoneKeys = Object.keys(zonesData);
  const avgHrs = {};
  zoneKeys.forEach(k => {
    const z = zonesData[k];
    avgHrs[k] = z.totWeight >= 15 ? Math.round(z.sumHrWeight / z.totWeight) : 0;
  });

  // Calcula LTHR Consenso (3 Pilares) e aplica modo global se habilitado
  const lthrData = computeConsensusLthr(filteredActs, anchorSumHr, anchorSecs, avgHrs.Z4, zonesData.Z4.totWeight);
  applyGlobalLthrMode(lthrData.consensus);
  const latestLthr = lthrData.consensus;

  const resumoEl = document.getElementById('assResumoLabel');
  if (resumoEl) {
    resumoEl.innerText = `FTP Ref: ${latestFtp}W | LTHR Consenso: ${latestLthr} bpm | ${filteredActs.length} pedalada(s)`;
  }

  const drawW = w - padL - padR;
  const drawH = h - padT - padB;
  const maxHr = typeof userMaxHr !== 'undefined' ? userMaxHr : 187;
  const minScaleHr = 100, maxScaleHr = Math.max(190, maxHr);

  const getY = (hr) => padT + drawH - ((hr - minScaleHr) / (maxScaleHr - minScaleHr)) * drawH;

  // Grade Horizontal
  ctx.strokeStyle = '#1e293b'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let hr = 110; hr <= maxScaleHr; hr += 15) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 6, y + 3);
  }

  const barWidth = (drawW / zoneKeys.length) - 16;

  zoneKeys.forEach((key, idx) => {
    const z = zonesData[key];
    const avgHr = avgHrs[key];
    const x = padL + idx * (barWidth + 16) + 8;

    if (avgHr > 0) {
      const y = Math.max(padT, getY(avgHr));
      const barH = Math.max(8, (padT + drawH) - y);

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = z.color;
      ctx.fillRect(x, y, barWidth, barH);
      ctx.globalAlpha = 1.0;

      ctx.shadowColor = z.color;
      ctx.shadowBlur = 10;
      ctx.fillRect(x, y, barWidth, 3);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${avgHr} bpm`, x + barWidth / 2, y - 10);

      const mins = Math.round(z.totWeight / 60);
      if (barH > 22 && mins > 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`, x + barWidth / 2, padT + drawH - 6);
      }
    } else {
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, padT + drawH - 25, barWidth, 25);
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('s/ amostra', x + barWidth / 2, padT + drawH - 10);
    }

    // Rótulo Principal da Zona
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(z.n, x + barWidth / 2, padT + drawH + 18);

    // 1ª Faixa Esperada (Watts - Baseada no FTP atual)
    const wMin = Math.round(z.minP * latestFtp);
    const wMax = Math.round(z.maxP * latestFtp);
    const wLabel = key === 'Z1' ? `< ${wMax}W` : (key === 'Z7' ? `> ${wMin}W` : `${wMin}–${wMax}W`);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(wLabel, x + barWidth / 2, padT + drawH + 34);

    // 2ª Faixa Esperada (BPM - Limites de Coggan baseados na LTHR Consenso)
    let bpmLabel = '';
    if (key === 'Z1') bpmLabel = `< ${Math.round(latestLthr * 0.68)} bpm`;
    else if (key === 'Z2') bpmLabel = `${Math.round(latestLthr * 0.69)}–${Math.round(latestLthr * 0.83)} bpm`;
    else if (key === 'Z3') bpmLabel = `${Math.round(latestLthr * 0.84)}–${Math.round(latestLthr * 0.94)} bpm`;
    else if (key === 'Z4') bpmLabel = `${Math.round(latestLthr * 0.95)}–${Math.round(latestLthr * 1.05)} bpm`;
    else if (key === 'Z5') bpmLabel = `> ${Math.round(latestLthr * 1.05)} bpm`;
    else bpmLabel = 'N/A';

    ctx.fillStyle = '#64748b';
    ctx.font = '9.5px sans-serif';
    ctx.fillText(bpmLabel, x + barWidth / 2, padT + drawH + 48);
  });

  // Linha de LTHR Consenso
  if (latestLthr >= minScaleHr && latestLthr <= maxScaleHr) {
    const yLthr = getY(latestLthr);
    ctx.save();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yLthr);
    ctx.lineTo(w - padR, yLthr);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 10.5px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`LTHR Consenso: ${latestLthr} bpm`, w - padR - 4, yLthr - 5);
    ctx.restore();
  }

  // Renderiza Painel de Auditoria e Tabela de Zonas abaixo do gráfico
  renderLthrConsensusPanel(lthrData);
}
