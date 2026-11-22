// Aba: Curva de Potência Máxima Média (MMP: 5s, 15s, 1m, 5m, 15m, 20m, 60m, 120m) — Exclusiva com Dados Reais de Sensor + Tooltip Interpolado

const MMP_DURATIONS = [
  { sec: 5, label: '5s', title: '5 Segundos (Sprint Neuromuscular)' },
  { sec: 15, label: '15s', title: '15 Segundos (Capacidade Anaeróbica)' },
  { sec: 60, label: '1min', title: '1 Minuto (Potência Anaeróbica / Ataque)' },
  { sec: 300, label: '5min', title: '5 Minutos (VO2 Máximo)' },
  { sec: 900, label: '15min', title: '15 Minutos (Sub-Limiar / Ritmo)' },
  { sec: 1200, label: '20min', title: '20 Minutos (Base de FTP — MMP20)' },
  { sec: 3600, label: '60min', title: '60 Minutos (1 Hora — Limiar Funcional)' },
  { sec: 7200, label: '120min', title: '120 Minutos (2 Horas — Resistência Aeróbica)' }
];

const CURVE_PALETTE = [
  '#f97316', '#38bdf8', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e', '#84cc16', '#6366f1'
];

let selectedMmpYears = ['all'];
let selectedMmpDurationSec = 1200;
let mmpHistorySortMode = 'date_desc';
let lastMmpRenderMeta = null;

function formatDurationLabelFromSec(sec) {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const mins = s / 60;
    return Number.isInteger(mins) ? `${mins}min` : `${mins.toFixed(1)}min`;
  }
  const hrs = s / 3600;
  return Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`;
}

function getMmpTooltipEl(canvas) {
  if (!canvas._mmpTooltipDiv) {
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'absolute',
      background: 'rgba(10, 14, 23, 0.96)',
      border: '1px solid #475569',
      padding: '10px 12px',
      borderRadius: '7px',
      color: '#f1f5f9',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '120',
      fontSize: '12px',
      fontFamily: '"JetBrains Mono", monospace',
      lineHeight: '1.5',
      boxShadow: '0 10px 25px rgba(0,0,0,0.65)'
    });
    document.body.appendChild(div);
    canvas._mmpTooltipDiv = div;
  }
  return canvas._mmpTooltipDiv;
}

function attachMmpTooltipInteractions(canvas) {
  if (!canvas || canvas._mmpTooltipBound) return;
  canvas._mmpTooltipBound = true;

  const tipEl = getMmpTooltipEl(canvas);

  canvas.addEventListener('mousemove', (e) => {
    if (!lastMmpRenderMeta || !Array.isArray(lastMmpRenderMeta.seriesList) || lastMmpRenderMeta.seriesList.length === 0) {
      tipEl.style.display = 'none';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { padL, padT, drawW, drawH, seriesList } = lastMmpRenderMeta;

    if (mx < padL || mx > padL + drawW || my < padT || my > padT + drawH) {
      tipEl.style.display = 'none';
      return;
    }

    const nDur = MMP_DURATIONS.length;
    const exactSlot = Math.max(0, Math.min(nDur - 1, ((mx - padL) / drawW) * (nDur - 1)));
    const i0 = Math.floor(exactSlot);
    const i1 = Math.min(nDur - 1, i0 + 1);
    const t = i1 === i0 ? 0 : (exactSlot - i0);

    const sec0 = MMP_DURATIONS[i0].sec;
    const sec1 = MMP_DURATIONS[i1].sec;
    const interpSec = Math.round(sec0 + t * (sec1 - sec0));

    const nearFixed = Math.abs(exactSlot - Math.round(exactSlot)) < 0.14;
    const fixedMeta = nearFixed ? MMP_DURATIONS[Math.round(exactSlot)] : null;
    const headerTitle = fixedMeta ? `${fixedMeta.label} — ${fixedMeta.title}` : `Intervalo ~${formatDurationLabelFromSec(interpSec)} (interpolado)`;

    const rows = seriesList.map(s => {
      const p0 = s.points[i0]?.watts || 0;
      const p1 = s.points[i1]?.watts || 0;
      let val = 0;
      if (p0 > 0 && p1 > 0) val = Math.round(p0 + t * (p1 - p0));
      else if (p0 > 0 && t < 0.5) val = p0;
      else if (p1 > 0 && t >= 0.5) val = p1;

      if (val <= 0) return null;
      return `<span style="color:${s.color};">● ${s.name}:</span> <b>${val} W</b>`;
    }).filter(Boolean);

    if (rows.length === 0) {
      tipEl.style.display = 'none';
      return;
    }

    tipEl.innerHTML = `<div style="color:#fb923c; font-weight:700; margin-bottom:4px;">${headerTitle}</div>${rows.join('<br/>')}`;

    if (typeof window.positionTooltipSmart === 'function') {
      window.positionTooltipSmart(tipEl, e.clientX, e.clientY, e.pageX, e.pageY);
    } else {
      tipEl.style.display = 'block';
      tipEl.style.left = `${e.pageX + 14}px`;
      tipEl.style.top = `${e.pageY + 14}px`;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tipEl.style.display = 'none';
  });
}

function getRealSensorMetrics(act) {
  if (!act) return null;
  if (act.realMetrics && !act.realMetrics.isEstimated && (act.realMetrics.avgPwr > 0 || act.realMetrics.mmp20 > 0)) {
    return act.realMetrics;
  }
  if (act.metrics && !act.metrics.isEstimated && (act.metrics.avgPwr > 0 || act.metrics.mmp20 > 0)) {
    return act.metrics;
  }
  return null;
}

function getRealSensorActivities() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return [];
  return dbActivities.filter(a => getRealSensorMetrics(a) !== null);
}

window.getActivityMmpForDuration = function(act, sec) {
  const m = getRealSensorMetrics(act);
  if (!m) return 0;

  const totalDur = m.movingSecs || m.totalSecs || 0;
  if (totalDur < sec * 0.90) return 0;

  if (m.mmpCurve && m.mmpCurve[sec] !== undefined && m.mmpCurve[sec] > 0) {
    return Math.round(m.mmpCurve[sec]);
  }

  if (sec === 1200 && m.mmp20 && m.mmp20 > 0) return Math.round(m.mmp20);

  const dw = m.dispWindows || {};
  if (dw[sec] && Array.isArray(dw[sec]) && dw[sec].length > 0) {
    let best = 0;
    for (let i = 0; i < dw[sec].length; i++) {
      if (dw[sec][i][0] > best) best = dw[sec][i][0];
    }
    if (best > 0) return Math.round(best);
  }

  if (sec === 1200 && dw[300] && dw[300].length >= 4) {
    let best = 0;
    for (let i = 0; i <= dw[300].length - 4; i++) {
      const avg4 = (dw[300][i][0] + dw[300][i + 1][0] + dw[300][i + 2][0] + dw[300][i + 3][0]) / 4;
      if (avg4 > best) best = avg4;
    }
    if (best > 0) return Math.round(best);
  }

  if (sec === 7200) {
    if (dw[3600] && dw[3600].length >= 2) {
      let best = 0;
      for (let i = 0; i <= dw[3600].length - 2; i++) {
        const avg2 = (dw[3600][i][0] + dw[3600][i + 1][0]) / 2;
        if (avg2 > best) best = avg2;
      }
      if (best > 0) return Math.round(best);
    }
    if (totalDur >= 7200 && m.avgPwr > 0) return Math.round(m.avgPwr);
  }

  if (sec === 3600 && totalDur >= 3600 && m.avgPwr > 0) {
    if (dw[900] && dw[900].length >= 4) {
      let best = 0;
      for (let i = 0; i <= dw[900].length - 4; i++) {
        const avg4 = (dw[900][i][0] + dw[900][i + 1][0] + dw[900][i + 2][0] + dw[900][i + 3][0]) / 4;
        if (avg4 > best) best = avg4;
      }
      if (best > 0) return Math.round(best);
    }
    return Math.round(m.avgPwr);
  }

  return 0;
};

function getAvailableYearsFromActivities() {
  const yearsSet = new Set();
  getRealSensorActivities().forEach(a => {
    if (a.dateObj instanceof Date && !isNaN(a.dateObj.getTime())) {
      yearsSet.add(String(a.dateObj.getFullYear()));
    }
  });
  return Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
}

function renderMmpYearSelector() {
  const container = document.getElementById('mmpYearSelector');
  if (!container) return;

  const years = getAvailableYearsFromActivities();
  const options = [{ key: 'all', label: '🌐 Todo o Histórico (Sensor)' }, ...years.map(y => ({ key: y, label: y }))];

  container.innerHTML = `<span style="font-size: 0.8rem; color: #94a3b8; font-weight: bold; display: flex; align-items: center; margin-right: 6px;">Períodos (Apenas Sensor Real):</span>` +
    options.map((opt) => {
      const isSelected = selectedMmpYears.includes(opt.key);
      const colorIdx = selectedMmpYears.indexOf(opt.key);
      const col = isSelected ? CURVE_PALETTE[colorIdx % CURVE_PALETTE.length] : '#475569';
      const bg = isSelected ? 'rgba(30, 41, 59, 0.95)' : '#020617';
      const textCol = isSelected ? '#f8fafc' : '#64748b';
      const glow = isSelected ? `0 0 8px ${col}55` : 'none';

      return `
        <button onclick="toggleMmpYear('${opt.key}')" style="background: ${bg}; color: ${textCol}; border: 1.5px solid ${col}; box-shadow: ${glow}; padding: 5px 12px; border-radius: 18px; font-size: 0.78rem; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.15s;">
          <span style="width: 9px; height: 9px; border-radius: 50%; background: ${col}; display: inline-block;"></span>
          ${opt.label}
        </button>
      `;
    }).join('');
}

window.toggleMmpYear = function(yearKey) {
  const idx = selectedMmpYears.indexOf(yearKey);
  if (idx !== -1) {
    if (selectedMmpYears.length > 1) {
      selectedMmpYears.splice(idx, 1);
    }
  } else {
    selectedMmpYears.push(yearKey);
  }
  renderMmpYearSelector();
  renderCurvaPotenciaChart();
  renderMmpBestCards();
  renderMmpHistoryTable();
};

function filterActivitiesBySelectedYears(yearKey) {
  const realActs = getRealSensorActivities();
  if (yearKey === 'all') return realActs;
  return realActs.filter(a => a.dateObj instanceof Date && String(a.dateObj.getFullYear()) === String(yearKey));
}

function getCombinedActivitiesForActiveSelection() {
  const realActs = getRealSensorActivities();
  if (selectedMmpYears.includes('all')) return realActs;
  return realActs.filter(a => a.dateObj instanceof Date && selectedMmpYears.includes(String(a.dateObj.getFullYear())));
}

window.initCurvaPotenciaTab = function() {
  renderMmpYearSelector();
  renderCurvaPotenciaChart();
  renderMmpBestCards();
  renderMmpHistoryTable();
};

window.renderCurvaPotenciaChart = function() {
  const canvas = document.getElementById('curvaPotenciaCanvas');
  if (!canvas) return;
  attachMmpTooltipInteractions(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 920, h = 390;
  const padL = 55, padR = 35, padT = 30, padB = 45;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const realActs = getRealSensorActivities();
  if (realActs.length === 0) return;

  const drawW = w - padL - padR;
  const drawH = h - padT - padB;

  const seriesList = selectedMmpYears.map((yKey, sIdx) => {
    const acts = filterActivitiesBySelectedYears(yKey);
    const points = MMP_DURATIONS.map((d, dIdx) => {
      let bestW = 0;
      let bestAct = null;
      for (let i = 0; i < acts.length; i++) {
        const val = window.getActivityMmpForDuration(acts[i], d.sec);
        if (val > bestW) {
          bestW = val;
          bestAct = acts[i];
        }
      }
      return { sec: d.sec, label: d.label, watts: bestW, act: bestAct, dIdx };
    });
    return {
      key: yKey,
      name: yKey === 'all' ? 'Todo o Histórico' : `Ano ${yKey}`,
      color: CURVE_PALETTE[sIdx % CURVE_PALETTE.length],
      points
    };
  });

  lastMmpRenderMeta = { padL, padR, padT, padB, drawW, drawH, seriesList };

  let maxWatts = 350;
  seriesList.forEach(s => s.points.forEach(p => { if (p.watts > maxWatts) maxWatts = p.watts; }));
  maxWatts = Math.ceil((maxWatts * 1.12) / 50) * 50;

  const getX = (dIdx) => padL + (dIdx / (MMP_DURATIONS.length - 1)) * drawW;
  const getY = (watts) => padT + drawH - (Math.max(0, Math.min(maxWatts, watts)) / maxWatts) * drawH;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';
  for (let i = 0; i <= 5; i++) {
    const frac = i / 5;
    const y = padT + drawH - frac * drawH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(frac * maxWatts)} W`, padL - 8, y + 4);
  }

  MMP_DURATIONS.forEach((d, dIdx) => {
    const x = getX(dIdx);
    const isSel = d.sec === selectedMmpDurationSec;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + drawH);
    ctx.strokeStyle = isSel ? 'rgba(251, 146, 60, 0.55)' : 'rgba(30, 41, 59, 0.7)';
    ctx.lineWidth = isSel ? 1.8 : 1;
    ctx.stroke();

    ctx.fillStyle = isSel ? '#fb923c' : '#cbd5e1';
    ctx.font = isSel ? 'bold 12px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x, padT + drawH + 22);
  });

  seriesList.forEach((s, sIdx) => {
    const validPts = s.points.filter(p => p.watts > 0);
    if (validPts.length === 0) return;

    if (sIdx === 0) {
      ctx.save();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + drawH);
      grad.addColorStop(0, `${s.color}38`);
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
      ctx.beginPath();
      ctx.moveTo(getX(validPts[0].dIdx), padT + drawH);
      validPts.forEach(p => ctx.lineTo(getX(p.dIdx), getY(p.watts)));
      ctx.lineTo(getX(validPts[validPts.length - 1].dIdx), padT + drawH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    validPts.forEach((p, i) => {
      const x = getX(p.dIdx), y = getY(p.watts);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.6;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();

    validPts.forEach(p => {
      const x = getX(p.dIdx), y = getY(p.watts);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = s.color;
      ctx.stroke();

      ctx.fillStyle = s.color;
      ctx.font = 'bold 10.5px sans-serif';
      ctx.textAlign = 'center';
      const yOffset = (sIdx % 2 === 0) ? -10 : 15;
      ctx.fillText(`${p.watts}W`, x, y + yOffset);
    });
  });
};

function renderMmpBestCards() {
  const grid = document.getElementById('mmpBestCardsGrid');
  if (!grid) return;

  const activeActs = getCombinedActivitiesForActiveSelection();

  grid.innerHTML = MMP_DURATIONS.map(d => {
    let bestW = 0;
    let bestAct = null;
    for (let i = 0; i < activeActs.length; i++) {
      const w = window.getActivityMmpForDuration(activeActs[i], d.sec);
      if (w > bestW) {
        bestW = w;
        bestAct = activeActs[i];
      }
    }

    const isSelected = d.sec === selectedMmpDurationSec;
    const borderCol = isSelected ? '#fb923c' : '#334155';
    const bgCol = isSelected ? '#1e293b' : '#0f172a';
    const shadow = isSelected ? '0 0 12px rgba(251, 146, 60, 0.35)' : 'none';
    const dateSub = bestAct ? bestAct.date : 'Sem registo real';

    return `
      <div onclick="selectMmpDurationCard(${d.sec})" style="background: ${bgCol}; border: 2px solid ${borderCol}; box-shadow: ${shadow}; border-radius: 8px; padding: 10px 8px; text-align: center; cursor: pointer; transition: 0.15s;">
        <div style="font-size: 0.78rem; color: #94a3b8; font-weight: bold;">MMP ${d.label}</div>
        <div style="font-size: 1.25rem; font-weight: 800; color: ${isSelected ? '#fb923c' : '#38bdf8'}; margin: 4px 0;">${bestW > 0 ? `${bestW} W` : '--'}</div>
        <div style="font-size: 0.68rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dateSub}</div>
      </div>
    `;
  }).join('');
}

window.selectMmpDurationCard = function(sec) {
  selectedMmpDurationSec = sec;
  renderCurvaPotenciaChart();
  renderMmpBestCards();
  renderMmpHistoryTable();
};

window.toggleMmpHistorySort = function(mode) {
  mmpHistorySortMode = mode;
  renderMmpHistoryTable();
};

function renderMmpHistoryTable() {
  const container = document.getElementById('mmpHistoryContainer');
  if (!container) return;

  const dMeta = MMP_DURATIONS.find(d => d.sec === selectedMmpDurationSec) || MMP_DURATIONS[5];
  const activeActs = getCombinedActivitiesForActiveSelection();

  const records = [];
  activeActs.forEach(act => {
    const w = window.getActivityMmpForDuration(act, dMeta.sec);
    if (w > 0) {
      records.push({ act, watts: w, dateObj: act.dateObj || new Date(0) });
    }
  });

  let maxRecordW = 0;
  records.forEach(r => { if (r.watts > maxRecordW) maxRecordW = r.watts; });

  if (mmpHistorySortMode === 'pwr_desc') {
    records.sort((a, b) => b.watts - a.watts || b.dateObj - a.dateObj);
  } else {
    records.sort((a, b) => b.dateObj - a.dateObj);
  }

  const displayed = records.slice(0, 120);

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">
      <div>
        <h4 style="margin: 0; color: #fb923c; font-size: 0.95rem;">📋 Histórico de Marcas Reais (Sensor) — ${dMeta.title}</h4>
        <span style="font-size: 0.76rem; color: #94a3b8;">Total de ${records.length} pedalada(s) com sensor real nos períodos selecionados (Recorde: <strong style="color:#22c55e;">${maxRecordW} W</strong>)</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="toggleMmpHistorySort('date_desc')" style="background: ${mmpHistorySortMode === 'date_desc' ? '#fb923c' : '#1e293b'}; color: ${mmpHistorySortMode === 'date_desc' ? '#020617' : '#cbd5e1'}; border: 1px solid #475569; padding: 5px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: bold; cursor: pointer;">
          📅 Mais Recente &rarr; Mais Antiga
        </button>
        <button onclick="toggleMmpHistorySort('pwr_desc')" style="background: ${mmpHistorySortMode === 'pwr_desc' ? '#fb923c' : '#1e293b'}; color: ${mmpHistorySortMode === 'pwr_desc' ? '#020617' : '#cbd5e1'}; border: 1px solid #475569; padding: 5px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: bold; cursor: pointer;">
          ⚡ Maior Potência (Ranking)
        </button>
      </div>
    </div>

    <div style="max-height: 360px; overflow-y: auto;">
      <table class="summary-table" style="margin: 0;">
        <thead>
          <tr>
            <th>Data</th>
            <th>Pedalada</th>
            <th>Marca (${dMeta.label})</th>
            <th>Pot. Média / NP (Sensor)</th>
            <th>Distância</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${displayed.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:16px;">Nenhuma atividade com sensor real e duração suficiente para ${dMeta.label}.</td></tr>` : displayed.map(r => {
            const a = r.act;
            const m = getRealSensorMetrics(a) || {};
            const uKey = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(a).replace(/'/g, "\\'") : '';
            const isRecord = r.watts === maxRecordW;
            const badge = isRecord ? `<span style="background:#eab308; color:#020617; font-size:0.65rem; font-weight:bold; padding:2px 5px; border-radius:4px; margin-left:6px;">🏆 RECORDE</span>` : '';
            return `
              <tr>
                <td><strong>${a.date}</strong></td>
                <td>${a.name}${badge}</td>
                <td><strong style="color: ${isRecord ? '#22c55e' : '#fb923c'}; font-size: 0.95rem;">${r.watts} W</strong></td>
                <td>${m.avgPwr || 0} W / ${m.np || 0} W</td>
                <td>${m.distKm || '0.00'} km</td>
                <td>
                  <button class="btn" style="padding: 4px 9px; font-size: 0.74rem; margin: 0;" onclick="openRideInTelemetryByKey('${uKey}')">Ver Telemetria</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.openRideInTelemetryByKey = function(uKey) {
  if (typeof dbActivities === 'undefined') return;
  const idx = dbActivities.findIndex(a => window.getActivityUniqueKey(a) === uKey);
  if (idx === -1) return;
  const telBtn = document.querySelector("button[onclick*='telemetriaTab']");
  if (telBtn) {
    window.switchDashboardTab('telemetriaTab', telBtn);
    if (typeof window.onTelSliderInput === 'function') {
      const slider = document.getElementById('telRideSlider');
      if (slider) slider.value = idx;
      window.onTelSliderInput(idx);
    }
  }
};
