// Aba 7: Índice de Variabilidade (VI) + Mapa Térmico de Cardiac Drift + Zoom/Pan Nativo

let viZoomState = { startFrac: 0, endFrac: 1 };
let viPanState = { active: false, startX: 0, origStart: 0, origEnd: 1 };
let viPinchState = { active: false, startDist: 0, origStart: 0, origEnd: 1 };

function getDriftColor(drift) {
  if (drift === null || drift === undefined || isNaN(drift)) return '#94a3b8'; // Sem dados de FC/Drift
  if (drift <= 3) return '#10b981';   // Excelente (Verde/Esmeralda)
  if (drift <= 5) return '#eab308';   // Ideal (Amarelo)
  if (drift <= 8) return '#f97316';   // Alerta (Laranja)
  return '#ef4444';                   // Alto Drift (Vermelho)
}

function attachViZoomInteractions(canvas) {
  if (!canvas || canvas._viZoomBound) return;
  canvas._viZoomBound = true;
  canvas.style.touchAction = 'none';

  // Zoom com roda do mouse
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const padL = 50, padR = 20;
    const drawW = Math.max(1, rect.width - padL - padR);
    const mouseFrac = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / drawW));

    const span = viZoomState.endFrac - viZoomState.startFrac;
    const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
    const newSpan = Math.max(0.03, Math.min(1, span * zoomFactor));

    const focus = viZoomState.startFrac + mouseFrac * span;
    let newStart = focus - mouseFrac * newSpan;
    let newEnd = newStart + newSpan;

    if (newStart < 0) { newStart = 0; newEnd = newSpan; }
    if (newEnd > 1) { newEnd = 1; newStart = Math.max(0, 1 - newSpan); }

    viZoomState = { startFrac: newStart, endFrac: newEnd };
    renderViChart();
  }, { passive: false });

  // Arrastar (Pan) com mouse
  canvas.addEventListener('mousedown', (e) => {
    if (viZoomState.endFrac - viZoomState.startFrac >= 0.999) return;
    viPanState = {
      active: true,
      startX: e.clientX,
      origStart: viZoomState.startFrac,
      origEnd: viZoomState.endFrac
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!viPanState.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 70);
    const span = viPanState.origEnd - viPanState.origStart;
    const deltaFrac = -((e.clientX - viPanState.startX) / drawW) * span;

    let newStart = viPanState.origStart + deltaFrac;
    let newEnd = viPanState.origEnd + deltaFrac;
    if (newStart < 0) { newStart = 0; newEnd = span; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

    viZoomState = { startFrac: newStart, endFrac: newEnd };
    renderViChart();
  });

  window.addEventListener('mouseup', () => {
    if (!viPanState.active) return;
    viPanState.active = false;
    canvas.style.cursor = (viZoomState.endFrac - viZoomState.startFrac < 0.999) ? 'grab' : 'default';
  });

  // Duplo clique reseta o zoom
  canvas.addEventListener('dblclick', () => {
    viZoomState = { startFrac: 0, endFrac: 1 };
    renderViChart();
  });

  // Pinça (Zoom) e Arraste (Pan) no celular
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      viPinchState = {
        active: true,
        startDist: Math.hypot(dx, dy) || 1,
        origStart: viZoomState.startFrac,
        origEnd: viZoomState.endFrac
      };
      viPanState.active = false;
    } else if (e.touches.length === 1 && viZoomState.endFrac - viZoomState.startFrac < 0.999) {
      viPanState = {
        active: true,
        startX: e.touches[0].clientX,
        origStart: viZoomState.startFrac,
        origEnd: viZoomState.endFrac
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (viPinchState.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = viPinchState.startDist / dist;
      const origSpan = viPinchState.origEnd - viPinchState.origStart;
      const newSpan = Math.max(0.03, Math.min(1, origSpan * scale));
      const mid = (viPinchState.origStart + viPinchState.origEnd) / 2;

      let newStart = mid - newSpan / 2;
      let newEnd = mid + newSpan / 2;
      if (newStart < 0) { newStart = 0; newEnd = newSpan; }
      if (newEnd > 1) { newEnd = 1; newStart = Math.max(0, 1 - newSpan); }

      viZoomState = { startFrac: newStart, endFrac: newEnd };
      renderViChart();
    } else if (viPanState.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 70);
      const span = viPanState.origEnd - viPanState.origStart;
      const deltaFrac = -((e.touches[0].clientX - viPanState.startX) / drawW) * span;

      let newStart = viPanState.origStart + deltaFrac;
      let newEnd = viPanState.origEnd + deltaFrac;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

      viZoomState = { startFrac: newStart, endFrac: newEnd };
      renderViChart();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    viPinchState.active = false;
    viPanState.active = false;
  });
}

function renderViChart() {
  const periodEl = document.querySelector('#viChartTab .time-filter') || document.querySelector('.time-filter');
  const period = periodEl ? periodEl.value : 'dia';
  const canvas = document.getElementById('viCanvas');
  if (!canvas) return;

  attachViZoomInteractions(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 420;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const groups = {};
  dbActivities.forEach(act => {
    if (!act.metrics || !act.metrics.vi || act.metrics.avgPwr < 50) return;
    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) {
      groups[key] = { sumVi: 0, count: 0, sumDrift: 0, driftCount: 0, sumDurSec: 0 };
    }
    groups[key].sumVi += act.metrics.vi;
    groups[key].count++;

    const durSec = act.metrics.durationSec || act.metrics.movingTime || act.metrics.time || (act.telemetry15s ? act.telemetry15s.length * 15 : 3600);
    groups[key].sumDurSec += durSec;

    if (act.metrics.drift !== null && act.metrics.drift !== undefined && !isNaN(act.metrics.drift)) {
      groups[key].sumDrift += act.metrics.drift;
      groups[key].driftCount++;
    }
  });

  const allKeys = Object.keys(groups).sort();
  if (allKeys.length === 0) return;

  // Aplica janela de zoom
  const total = allKeys.length;
  const startIdx = Math.max(0, Math.floor(viZoomState.startFrac * (total - 1)));
  const endIdx = Math.min(total - 1, Math.ceil(viZoomState.endFrac * (total - 1)));
  const sortedKeys = allKeys.slice(startIdx, Math.max(startIdx + 1, endIdx + 1));

  const padL = 50, padR = 20, padT = 36, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const minVi = 1.0, maxVi = 1.5;
  const getY = (val) => padT + drawH - ((Math.min(Math.max(val, minVi), maxVi) - minVi) / (maxVi - minVi)) * drawH;

  // Legenda térmica de Drift no topo
  const legendItems = [
    { label: 'VI≤1.12 Drift ≤3%', color: '#10b981' },
    { label: '3–5%', color: '#eab308' },
    { label: '5–8%', color: '#f97316' },
    { label: '>8%', color: '#ef4444' },
    { label: 'S/ Drift', color: '#94a3b8' },
    { label: 'VI>1.12 (Variável)', color: 'rgba(167, 139, 250, 0.55)' }
  ];
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  let lx = padL;
  legendItems.forEach(item => {
    ctx.beginPath();
    ctx.arc(lx + 4, 15, 4, 0, 2 * Math.PI);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(item.label, lx + 12, 18);
    lx += ctx.measureText(item.label).width + 24;
  });

  if (viZoomState.endFrac - viZoomState.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom ativo (duplo clique para resetar)', w - padR, 18);
  }

  // Faixa de controle constante (VI <= 1.12)
  ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
  ctx.fillRect(padL, getY(1.12), drawW, getY(1.0) - getY(1.12));

  // Grade horizontal
  ctx.strokeStyle = '#334155';
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let v = 1.0; v <= 1.501; v += 0.1) {
    const y = getY(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(1), padL - 5, y + 3);
  }

  // Linha tracejada em 1.12
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
  ctx.beginPath();
  ctx.moveTo(padL, getY(1.12));
  ctx.lineTo(w - padR, getY(1.12));
  ctx.stroke();
  ctx.restore();

  const pointSpacing = drawW / Math.max(1, sortedKeys.length - 1);
  canvas.chartHitboxes = [];

  sortedKeys.forEach((k, idx) => {
    const g = groups[k];
    const avgVi = g.sumVi / g.count;
    const avgDrift = g.driftCount > 0 ? (g.sumDrift / g.driftCount) : null;
    const avgDurMin = Math.round((g.sumDurSec / g.count) / 60);
    const x = sortedKeys.length === 1 ? padL + drawW / 2 : padL + idx * pointSpacing;
    const y = getY(avgVi);

    // Rótulo eixo X
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length / 18) === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(k, x, h - 15);
    }

    // Raio proporcional à duração (entre 3.5px e 7px)
    const radius = Math.max(3.5, Math.min(7, 3.2 + (avgDurMin / 45)));

    canvas.chartHitboxes.push({
      x: x - radius - 2,
      y: y - radius - 2,
      w: (radius + 2) * 2,
      h: (radius + 2) * 2,
      data: {
        key: k,
        vi: avgVi.toFixed(2),
        drift: avgDrift !== null ? avgDrift.toFixed(1) : null,
        durMin: avgDurMin,
        count: g.count
      },
      type: 'vi'
    });

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    if (avgVi <= 1.12) {
      ctx.fillStyle = getDriftColor(avgDrift);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.28)';
      ctx.fill();
    }
  });

  setupTooltip(canvas);
}
