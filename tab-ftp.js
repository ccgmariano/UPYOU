// Aba 2: Evolução Fisiológica & Carga (Multi-Camadas + Eixos Balanceados + Média Móvel + Zoom Ancorado à Direita)

const FTP_LAYERS_CFG_KEY = 'upyou_ftp_layers_cfg_v1';

const FTP_LAYER_DEFS = [
  { key: 'ftp',   label: 'FTP',      unit: 'W',     color: '#fc5200', group: 'W',    smoothed: false, width: 2.5, dash: [] },
  { key: 'lthr',  label: 'LTHR',     unit: 'bpm',   color: '#ef4444', group: 'bpm',  smoothed: false, width: 2.0, dash: [5, 3] },
  { key: 'ef',    label: 'EF',       unit: 'W/bpm', color: '#38bdf8', group: 'ef',   smoothed: true,  width: 2.0, dash: [] },
  { key: 'drift', label: 'Drift',    unit: '%',     color: '#f59e0b', group: 'pct',  smoothed: true,  width: 1.8, dash: [] },
  { key: 'wkg',   label: 'W/kg',     unit: 'W/kg',  color: '#a855f7', group: 'wkg',  smoothed: false, width: 2.0, dash: [] },
  { key: 'ctl',   label: 'CTL',      unit: 'TSS',   color: '#10b981', group: 'load', smoothed: false, width: 2.0, dash: [] },
  { key: 'atl',   label: 'ATL',      unit: 'TSS',   color: '#ec4899', group: 'load', smoothed: false, width: 1.6, dash: [4, 2] },
  { key: 'tsb',   label: 'TSB',      unit: 'TSB',   color: '#eab308', group: 'tsb',  smoothed: false, width: 1.8, dash: [3, 3] },
  { key: 'tss',   label: 'TSS',      unit: 'TSS',   color: '#6366f1', group: 'load', smoothed: true,  width: 1.6, dash: [] },
  { key: 'ifVal', label: 'IF',       unit: '',      color: '#14b8a6', group: 'if',   smoothed: true,  width: 1.8, dash: [] },
  { key: 'vol',   label: 'Vol/Sem',  unit: 'h',     color: '#84cc16', group: 'vol',  smoothed: false, width: 1.8, dash: [] },
  { key: 'vi',    label: 'VI',       unit: '',      color: '#94a3b8', group: 'vi',   smoothed: true,  width: 1.6, dash: [2, 2] }
];

let ftpLayerState = {
  active: { ftp: true, lthr: true, ef: false, drift: false, wkg: false, ctl: false, atl: false, tsb: false, tss: false, ifVal: false, vol: false, vi: false },
  maDays: 14
};

let ftpZoomState = { startFrac: 0, endFrac: 1 };
let ftpPanState = { active: false, startX: 0, origStart: 0, origEnd: 1 };
let ftpPinchState = { active: false, startDist: 0, origStart: 0, origEnd: 1 };
let lastFtpChartData = [];
let lastFtpRenderMeta = null;

function loadFtpLayerConfig() {
  try {
    const raw = localStorage.getItem(FTP_LAYERS_CFG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.active && typeof parsed.active === 'object') {
      FTP_LAYER_DEFS.forEach(d => {
        if (typeof parsed.active[d.key] === 'boolean') ftpLayerState.active[d.key] = parsed.active[d.key];
      });
    }
    if (parsed.maDays >= 1 && parsed.maDays <= 90) ftpLayerState.maDays = parseInt(parsed.maDays, 10);
  } catch (e) {}
}

function saveFtpLayerConfig() {
  try { localStorage.setItem(FTP_LAYERS_CFG_KEY, JSON.stringify(ftpLayerState)); } catch (e) {}
}

loadFtpLayerConfig();

window.toggleFtpLayer = function(key) {
  ftpLayerState.active[key] = !ftpLayerState.active[key];
  saveFtpLayerConfig();
  updateFtpLayerButtonsUI();
  renderFtpChart(lastFtpChartData);
};

window.onFtpMaDaysChange = function(val) {
  const days = Math.max(1, Math.min(90, parseInt(val, 10) || 14));
  ftpLayerState.maDays = days;
  saveFtpLayerConfig();
  renderFtpChart(lastFtpChartData);
};

function updateFtpLayerButtonsUI() {
  FTP_LAYER_DEFS.forEach(def => {
    const btn = document.getElementById(`ftpLayerBtn_${def.key}`);
    if (!btn) return;
    const on = Boolean(ftpLayerState.active[def.key]);
    btn.style.background = on ? `${def.color}22` : '#0f172a';
    btn.style.borderColor = on ? def.color : '#334155';
    btn.style.color = on ? '#f8fafc' : '#64748b';
    btn.style.fontWeight = on ? '700' : '500';
  });
  const maInp = document.getElementById('ftpMaDaysInput');
  if (maInp) maInp.value = ftpLayerState.maDays;
}

function ensureFtpControls(canvas) {
  if (!canvas || document.getElementById('ftpLayerControlsBar')) return;

  const bar = document.createElement('div');
  bar.id = 'ftpLayerControlsBar';
  bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 12px; margin-bottom:10px;';

  const btnsHtml = FTP_LAYER_DEFS.map(def => `
    <button type="button" id="ftpLayerBtn_${def.key}" onclick="toggleFtpLayer('${def.key}')"
            title="${def.smoothed ? 'Suavizado pela Média Móvel' : 'Cálculo nativo'}"
            style="display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:99px; border:1px solid #334155; background:#0f172a; color:#64748b; font-size:0.74rem; cursor:pointer; transition:all 0.15s;">
      <span style="width:7px; height:7px; border-radius:50%; background:${def.color}; display:inline-block;"></span>
      ${def.label}
    </button>
  `).join('');

  bar.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
      ${btnsHtml}
    </div>
    <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#cbd5e1;">
      <label for="ftpMaDaysInput" title="Aplicada em EF, Drift, IF, TSS e VI">Média Móvel:</label>
      <input type="number" id="ftpMaDaysInput" value="${ftpLayerState.maDays}" min="1" max="90" step="1"
             onchange="onFtpMaDaysChange(this.value)"
             class="custom-select" style="width:54px; padding:3px 6px; font-size:0.75rem;">
      <span style="color:#64748b;">dias</span>
    </div>
  `;

  canvas.parentNode.insertBefore(bar, canvas);
  updateFtpLayerButtonsUI();
}

function getFtpRiderWeightKg(dateObj) {
  if (typeof getEstimatedRiderWeightKg === 'function') return getEstimatedRiderWeightKg(dateObj);
  const el = document.getElementById('totalWeightInput');
  return Math.max(45, (el ? (parseFloat(el.value) || 82) : 82) - 8.5);
}

function buildEnrichedFtpSeries(fallbackData) {
  const hasDb = typeof dbActivities !== 'undefined' && Array.isArray(dbActivities) && dbActivities.length >= 2;
  if (!hasDb) {
    return (Array.isArray(fallbackData) ? fallbackData : []).map(d => ({
      date: d.date, ftp: d.ftp, lthr: d.lthr || null
    }));
  }

  const acts = dbActivities
    .filter(a => a && a.dateObj instanceof Date && !isNaN(a.dateObj.getTime()) && a.metrics)
    .sort((a, b) => a.dateObj - b.dateObj);

  if (acts.length < 2) return [];

  const msDay = 86400000;
  const maMs = Math.max(1, ftpLayerState.maDays) * msDay;

  // 1) Extrai métricas brutas por atividade + mapa diário de TSS para PMC real (CTL 42d / ATL 7d / TSB)
  const rawPts = [];
  const dailyTss = {};

  acts.forEach(act => {
    const m = act.metrics || {};
    const dur = m.movingSecs || m.totalSecs || m.durationSec || (act.telemetry15s ? act.telemetry15s.length * 15 : 0);
    const ftp = act.currentFtp || 220;
    const lthr = act.currentLthr || null;
    const np = m.np || m.avgPwr || 0;
    const ifVal = (ftp > 0 && np > 0) ? (np / ftp) : null;
    const tss = (ftp > 0 && np > 0 && dur > 0) ? ((dur * np * (np / ftp)) / (ftp * 36)) : 0;
    const vi = (m.vi && m.vi > 0) ? m.vi : null;
    const ef = (vi && vi <= 1.12 && m.avgHr > 90 && np > 80) ? (np / m.avgHr) : null;
    const drift = (vi && vi <= 1.12 && m.drift !== null && m.drift !== undefined && !isNaN(m.drift)) ? m.drift : null;
    const riderKg = getFtpRiderWeightKg(act.dateObj);
    const wkg = ftp > 0 ? (ftp / riderKg) : null;

    const dayKey = act.dateObj.toISOString().slice(0, 10);
    dailyTss[dayKey] = (dailyTss[dayKey] || 0) + tss;

    rawPts.push({
      date: act.dateObj,
      t: act.dateObj.getTime(),
      dayKey,
      dur,
      ftp,
      lthr,
      wkg,
      rawEf: ef,
      rawDrift: drift,
      rawIf: ifVal,
      rawTss: tss > 0 ? tss : null,
      rawVi: vi
    });
  });

  // 2) Calcula CTL (42d), ATL (7d) e TSB dia a dia no calendário
  const pmcByDay = {};
  const startDay = new Date(rawPts[0].dayKey + 'T00:00:00Z').getTime();
  const endDay = new Date(rawPts[rawPts.length - 1].dayKey + 'T00:00:00Z').getTime();
  let ctl = 0, atl = 0;

  for (let d = startDay; d <= endDay; d += msDay) {
    const key = new Date(d).toISOString().slice(0, 10);
    const tssToday = dailyTss[key] || 0;
    ctl = ctl + (tssToday - ctl) / 42;
    atl = atl + (tssToday - atl) / 7;
    pmcByDay[key] = { ctl, atl, tsb: ctl - atl };
  }

  // 3) Aplica Média Móvel (ef, drift, ifVal, tss, vi) e Volume Semanal (7d)
  return rawPts.map((pt, idx) => {
    const pmc = pmcByDay[pt.dayKey] || { ctl: 0, atl: 0, tsb: 0 };

    // Volume semanal (horas acumuladas nos últimos 7 dias)
    let volSecs = 0;
    for (let j = idx; j >= 0; j--) {
      if (pt.t - rawPts[j].t > 7 * msDay) break;
      volSecs += rawPts[j].dur;
    }

    const avgField = (field) => {
      if (ftpLayerState.maDays <= 1) return pt[field];
      let sum = 0, cnt = 0;
      for (let j = idx; j >= 0; j--) {
        if (pt.t - rawPts[j].t > maMs) break;
        const v = rawPts[j][field];
        if (v !== null && v !== undefined && !isNaN(v)) { sum += v; cnt++; }
      }
      return cnt > 0 ? (sum / cnt) : null;
    };

    return {
      date: pt.date,
      ftp: pt.ftp,
      lthr: pt.lthr,
      wkg: pt.wkg,
      ctl: pmc.ctl,
      atl: pmc.atl,
      tsb: pmc.tsb,
      vol: volSecs / 3600,
      ef: avgField('rawEf'),
      drift: avgField('rawDrift'),
      ifVal: avgField('rawIf'),
      tss: avgField('rawTss'),
      vi: avgField('rawVi')
    };
  });
}

function applyFtpRightZoom(zoomFactor) {
  const span = ftpZoomState.endFrac - ftpZoomState.startFrac;
  const newSpan = Math.max(0.03, Math.min(1, span * zoomFactor));
  ftpZoomState = {
    startFrac: Math.max(0, 1 - newSpan),
    endFrac: 1
  };
  renderFtpChart(lastFtpChartData);
}

function getFtpTooltipEl(canvas) {
  if (!canvas._ftpTooltipDiv) {
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
    canvas._ftpTooltipDiv = div;
  }
  return canvas._ftpTooltipDiv;
}

function formatFtpLayerVal(key, val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  if (key === 'ftp') return `${Math.round(val)} W`;
  if (key === 'lthr') return `${Math.round(val)} bpm`;
  if (key === 'ef') return `${val.toFixed(2)} W/bpm`;
  if (key === 'drift') return `${val.toFixed(1)}%`;
  if (key === 'wkg') return `${val.toFixed(2)} W/kg`;
  if (key === 'ctl' || key === 'atl' || key === 'tss') return `${Math.round(val)} TSS`;
  if (key === 'tsb') return `${val >= 0 ? '+' : ''}${Math.round(val)}`;
  if (key === 'ifVal' || key === 'vi') return val.toFixed(2);
  if (key === 'vol') return `${val.toFixed(1)} h/sem`;
  return String(val);
}

function formatAxisTick(group, val) {
  if (group === 'W') return `${Math.round(val)}W`;
  if (group === 'bpm') return `${Math.round(val)}`;
  if (group === 'ef' || group === 'wkg' || group === 'if' || group === 'vi') return val.toFixed(2);
  if (group === 'pct') return `${val.toFixed(0)}%`;
  if (group === 'vol') return `${val.toFixed(1)}h`;
  return `${Math.round(val)}`;
}

function attachFtpZoomInteractions(canvas) {
  if (!canvas || canvas._ftpZoomBound) return;
  canvas._ftpZoomBound = true;
  canvas.style.touchAction = 'none';

  const tipEl = getFtpTooltipEl(canvas);

  canvas.addEventListener('mousemove', (e) => {
    if (!lastFtpRenderMeta || !Array.isArray(lastFtpRenderMeta.points) || lastFtpRenderMeta.points.length === 0) {
      tipEl.style.display = 'none';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { padL, padR, padT, padB, w, h, points, activeDefs } = lastFtpRenderMeta;

    if (mx < padL || mx > w - padR || my < padT || my > h - padB) {
      tipEl.style.display = 'none';
      return;
    }

    let nearest = points[0];
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - mx);
      if (d < bestDist) {
        bestDist = d;
        nearest = points[i];
      }
    }

    const tolX = Math.max(16, ((w - padL - padR) / Math.max(1, points.length)) * 0.85);
    if (bestDist > tolX) {
      tipEl.style.display = 'none';
      return;
    }

    const dateLabel = nearest.date instanceof Date && !isNaN(nearest.date.getTime())
      ? nearest.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '--';

    const linesHtml = activeDefs.map(def => {
      const v = nearest.row[def.key];
      const tag = def.smoothed && ftpLayerState.maDays > 1 ? ` <span style="color:#64748b; font-size:10px;">(${ftpLayerState.maDays}d)</span>` : '';
      return `<span style="color:${def.color};">● ${def.label}:</span> <b>${formatFtpLayerVal(def.key, v)}</b>${tag}`;
    }).join('<br/>');

    tipEl.innerHTML = `<div style="color:#38bdf8; font-weight:700; margin-bottom:4px;">${dateLabel}</div>${linesHtml}`;

    if (typeof window.positionTooltipSmart === 'function') {
      window.positionTooltipSmart(tipEl, e.clientX, e.clientY, e.pageX, e.pageY);
    } else {
      tipEl.style.display = 'block';
      tipEl.style.left = `${e.pageX + 14}px`;
      tipEl.style.top = `${e.pageY + 14}px`;
    }
  });

  canvas.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyFtpRightZoom(e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (ftpZoomState.endFrac - ftpZoomState.startFrac >= 0.999) return;
    ftpPanState = { active: true, startX: e.clientX, origStart: ftpZoomState.startFrac, origEnd: ftpZoomState.endFrac };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!ftpPanState.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 100);
    const span = ftpPanState.origEnd - ftpPanState.origStart;
    const deltaFrac = -((e.clientX - ftpPanState.startX) / drawW) * span;

    let newStart = ftpPanState.origStart + deltaFrac;
    let newEnd = ftpPanState.origEnd + deltaFrac;
    if (newStart < 0) { newStart = 0; newEnd = span; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

    ftpZoomState = { startFrac: newStart, endFrac: newEnd };
    renderFtpChart(lastFtpChartData);
  });

  window.addEventListener('mouseup', () => {
    if (!ftpPanState.active) return;
    ftpPanState.active = false;
    canvas.style.cursor = (ftpZoomState.endFrac - ftpZoomState.startFrac < 0.999) ? 'grab' : 'default';
  });

  canvas.addEventListener('dblclick', () => {
    ftpZoomState = { startFrac: 0, endFrac: 1 };
    renderFtpChart(lastFtpChartData);
  });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      ftpPinchState = { active: true, startDist: Math.hypot(dx, dy) || 1, origStart: ftpZoomState.startFrac, origEnd: ftpZoomState.endFrac };
      ftpPanState.active = false;
    } else if (e.touches.length === 1 && ftpZoomState.endFrac - ftpZoomState.startFrac < 0.999) {
      ftpPanState = { active: true, startX: e.touches[0].clientX, origStart: ftpZoomState.startFrac, origEnd: ftpZoomState.endFrac };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (ftpPinchState.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = ftpPinchState.startDist / dist;
      const newSpan = Math.max(0.03, Math.min(1, (ftpPinchState.origEnd - ftpPinchState.origStart) * scale));
      ftpZoomState = { startFrac: Math.max(0, 1 - newSpan), endFrac: 1 };
      renderFtpChart(lastFtpChartData);
    } else if (ftpPanState.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 100);
      const span = ftpPanState.origEnd - ftpPanState.origStart;
      const deltaFrac = -((e.touches[0].clientX - ftpPanState.startX) / drawW) * span;

      let newStart = ftpPanState.origStart + deltaFrac;
      let newEnd = ftpPanState.origEnd + deltaFrac;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

      ftpZoomState = { startFrac: newStart, endFrac: newEnd };
      renderFtpChart(lastFtpChartData);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    ftpPinchState.active = false;
    ftpPanState.active = false;
  });
}

function renderFtpChart(data) {
  if (Array.isArray(data) && data.length > 0) {
    lastFtpChartData = data;
  } else {
    data = lastFtpChartData;
  }

  const canvas = document.getElementById('ftpCanvas');
  if (!canvas) return;
  ensureFtpControls(canvas);
  attachFtpZoomInteractions(canvas);

  const series = buildEnrichedFtpSeries(data);
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 380;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (series.length < 2) {
    lastFtpRenderMeta = null;
    return;
  }

  const activeDefs = FTP_LAYER_DEFS.filter(d => ftpLayerState.active[d.key]);
  if (activeDefs.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Ative pelo menos uma camada acima para visualizar o gráfico.', w / 2, h / 2);
    lastFtpRenderMeta = null;
    return;
  }

  const total = series.length;
  const startIdx = Math.max(0, Math.floor(ftpZoomState.startFrac * (total - 1)));
  const endIdx = Math.min(total - 1, Math.ceil(ftpZoomState.endFrac * (total - 1)));
  const viewData = series.slice(startIdx, Math.max(startIdx + 2, endIdx + 1));

  // Agrupa escalas por unidade/grupo e calcula min/max de cada eixo ativo
  const axisMap = new Map();
  activeDefs.forEach(def => {
    const vals = viewData.map(r => r[def.key]).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (vals.length === 0) return;
    if (!axisMap.has(def.group)) {
      axisMap.set(def.group, { group: def.group, unit: def.unit, color: def.color, defs: [def], min: Infinity, max: -Infinity });
    } else {
      axisMap.get(def.group).defs.push(def);
    }
    const ax = axisMap.get(def.group);
    ax.min = Math.min(ax.min, ...vals);
    ax.max = Math.max(ax.max, ...vals);
  });

  const axes = Array.from(axisMap.values());
  axes.forEach(ax => {
    const span = ax.max - ax.min;
    const margin = span > 0 ? span * 0.12 : Math.max(1, Math.abs(ax.max) * 0.15);
    ax.min = ax.min - margin;
    ax.max = ax.max + margin;
    if (['W', 'bpm', 'ef', 'wkg', 'load', 'if', 'vol', 'vi'].includes(ax.group)) {
      ax.min = Math.max(0, ax.min);
    }
  });

  // Distribui eixos igualmente entre esquerda e direita (alternado: Esq, Dir, Esq, Dir...)
  const leftAxes = [];
  const rightAxes = [];
  axes.forEach((ax, idx) => {
    if (idx % 2 === 0) leftAxes.push(ax);
    else rightAxes.push(ax);
  });

  const axisSlotW = 48;
  const padL = Math.max(20, leftAxes.length * axisSlotW + 6);
  const padR = Math.max(20, rightAxes.length * axisSlotW + 6);
  const padT = 26, padB = 30;
  const drawW = Math.max(60, w - padL - padR);
  const drawH = h - padT - padB;

  const minT = viewData[0].date.getTime();
  const maxT = viewData[viewData.length - 1].date.getTime();
  const getX = (t) => padL + ((t - minT) / Math.max(1, maxT - minT)) * drawW;
  const getYForAxis = (ax, v) => padT + drawH - ((v - ax.min) / Math.max(0.0001, ax.max - ax.min)) * drawH;

  if (ftpZoomState.endFrac - ftpZoomState.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom à direita (duplo clique para resetar)', w - padR, 14);
  }

  // Grade horizontal (5 níveis)
  const ticksCount = 5;
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= ticksCount; i++) {
    const y = padT + (drawH * i) / ticksCount;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // Desenha eixos da esquerda
  leftAxes.forEach((ax, aIdx) => {
    const xLine = padL - aIdx * axisSlotW;
    ctx.strokeStyle = `${ax.color}66`;
    ctx.beginPath();
    ctx.moveTo(xLine, padT);
    ctx.lineTo(xLine, padT + drawH);
    ctx.stroke();

    ctx.fillStyle = ax.color;
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= ticksCount; i++) {
      const val = ax.max - ((ax.max - ax.min) * i) / ticksCount;
      const y = padT + (drawH * i) / ticksCount;
      ctx.fillText(formatAxisTick(ax.group, val), xLine - 4, y + 3);
    }
  });

  // Desenha eixos da direita
  rightAxes.forEach((ax, aIdx) => {
    const xLine = (w - padR) + aIdx * axisSlotW;
    ctx.strokeStyle = `${ax.color}66`;
    ctx.beginPath();
    ctx.moveTo(xLine, padT);
    ctx.lineTo(xLine, padT + drawH);
    ctx.stroke();

    ctx.fillStyle = ax.color;
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i <= ticksCount; i++) {
      const val = ax.max - ((ax.max - ax.min) * i) / ticksCount;
      const y = padT + (drawH * i) / ticksCount;
      ctx.fillText(formatAxisTick(ax.group, val), xLine + 4, y + 3);
    }
  });

  // Linha de referência zero se TSB estiver ativo
  const tsbAxis = axisMap.get('tsb');
  if (tsbAxis && tsbAxis.min < 0 && tsbAxis.max > 0) {
    const y0 = getYForAxis(tsbAxis, 0);
    ctx.save();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - padR, y0);
    ctx.stroke();
    ctx.restore();
  }

  // Datas no eixo X
  ctx.fillStyle = '#64748b';
  ctx.font = '9.5px sans-serif';
  ctx.textAlign = 'center';
  const xLabels = Math.min(6, viewData.length);
  for (let i = 0; i < xLabels; i++) {
    const idx = Math.round((i * (viewData.length - 1)) / Math.max(1, xLabels - 1));
    const pt = viewData[idx];
    const lbl = pt.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    ctx.fillText(lbl, getX(pt.date.getTime()), h - 10);
  }

  // Desenha todas as camadas ativas
  activeDefs.forEach(def => {
    const ax = axisMap.get(def.group);
    if (!ax) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = def.width;
    if (def.dash && def.dash.length) ctx.setLineDash(def.dash);
    let started = false;
    viewData.forEach(row => {
      const v = row[def.key];
      if (v === null || v === undefined || isNaN(v)) return;
      const x = getX(row.date.getTime());
      const y = getYForAxis(ax, v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  });

  const points = viewData.map(row => ({
    x: getX(row.date.getTime()),
    date: row.date,
    row
  }));

  lastFtpRenderMeta = { padL, padR, padT, padB, w, h, points, activeDefs };
}
