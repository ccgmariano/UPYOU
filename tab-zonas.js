// Abas 4 e 5: Tempo por Zona de Potência (Coggan Z1-Z7) e Tempo por Zona Cardíaca (Coggan Z1-Z5 via LTHR de Janela Móvel 42 Dias - 100% MHR20) + Zoom Ancorado à Direita

const zonesZoomState = {
  pwr: { startFrac: 0, endFrac: 1 },
  hr: { startFrac: 0, endFrac: 1 }
};

const zonesPanState = {
  pwr: { active: false, startX: 0, origStart: 0, origEnd: 1 },
  hr: { active: false, startX: 0, origStart: 0, origEnd: 1 }
};

const zonesPinchState = {
  pwr: { active: false, startDist: 0, origStart: 0, origEnd: 1 },
  hr: { active: false, startDist: 0, origStart: 0, origEnd: 1 }
};

window.getEstimatedLthr = function() {
  const maxHr = typeof userMaxHr !== 'undefined' ? userMaxHr : 187;
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    for (let i = dbActivities.length - 1; i >= 0; i--) {
      if (dbActivities[i].currentLthr && dbActivities[i].currentLthr >= 130) {
        return dbActivities[i].currentLthr;
      }
    }
  }
  return Math.round(maxHr * 0.90);
};

function applyZonesRightZoom(type, zoomFactor) {
  const st = zonesZoomState[type];
  const span = st.endFrac - st.startFrac;
  const newSpan = Math.max(0.05, Math.min(1, span * zoomFactor));
  zonesZoomState[type] = {
    startFrac: Math.max(0, 1 - newSpan),
    endFrac: 1
  };
  renderStackedZonesChart(type);
}

function attachZonesZoomInteractions(canvas, type) {
  if (!canvas || canvas._zonesZoomBound) return;
  canvas._zonesZoomBound = true;
  canvas.style.touchAction = 'none';

  // Zoom com roda do mouse ancorado na extrema direita
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
    applyZonesRightZoom(type, zoomFactor);
  }, { passive: false });

  // Arrastar (Pan) com mouse
  canvas.addEventListener('mousedown', (e) => {
    const st = zonesZoomState[type];
    if (st.endFrac - st.startFrac >= 0.999) return;
    zonesPanState[type] = {
      active: true,
      startX: e.clientX,
      origStart: st.startFrac,
      origEnd: st.endFrac
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    const pan = zonesPanState[type];
    if (!pan || !pan.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 70);
    const span = pan.origEnd - pan.origStart;
    const deltaFrac = -((e.clientX - pan.startX) / drawW) * span;

    let newStart = pan.origStart + deltaFrac;
    let newEnd = pan.origEnd + deltaFrac;
    if (newStart < 0) { newStart = 0; newEnd = span; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

    zonesZoomState[type] = { startFrac: newStart, endFrac: newEnd };
    renderStackedZonesChart(type);
  });

  window.addEventListener('mouseup', () => {
    const pan = zonesPanState[type];
    if (!pan || !pan.active) return;
    pan.active = false;
    const st = zonesZoomState[type];
    canvas.style.cursor = (st.endFrac - st.startFrac < 0.999) ? 'grab' : 'default';
  });

  // Duplo clique reseta o zoom
  canvas.addEventListener('dblclick', () => {
    zonesZoomState[type] = { startFrac: 0, endFrac: 1 };
    renderStackedZonesChart(type);
  });

  // Pinça (Zoom ancorado à direita) e Arraste (Pan) no celular
  canvas.addEventListener('touchstart', (e) => {
    const st = zonesZoomState[type];
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      zonesPinchState[type] = {
        active: true,
        startDist: Math.hypot(dx, dy) || 1,
        origStart: st.startFrac,
        origEnd: st.endFrac
      };
      zonesPanState[type].active = false;
    } else if (e.touches.length === 1 && st.endFrac - st.startFrac < 0.999) {
      zonesPanState[type] = {
        active: true,
        startX: e.touches[0].clientX,
        origStart: st.startFrac,
        origEnd: st.endFrac
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    const pinch = zonesPinchState[type];
    const pan = zonesPanState[type];
    if (pinch && pinch.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = pinch.startDist / dist;
      const origSpan = pinch.origEnd - pinch.origStart;
      const newSpan = Math.max(0.05, Math.min(1, origSpan * scale));
      zonesZoomState[type] = {
        startFrac: Math.max(0, 1 - newSpan),
        endFrac: 1
      };
      renderStackedZonesChart(type);
    } else if (pan && pan.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 70);
      const span = pan.origEnd - pan.origStart;
      const deltaFrac = -((e.touches[0].clientX - pan.startX) / drawW) * span;

      let newStart = pan.origStart + deltaFrac;
      let newEnd = pan.origEnd + deltaFrac;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

      zonesZoomState[type] = { startFrac: newStart, endFrac: newEnd };
      renderStackedZonesChart(type);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    zonesPinchState[type].active = false;
    zonesPanState[type].active = false;
  });
}

function renderStackedZonesChart(type) {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById(type === 'pwr' ? 'pwrTimeCanvas' : 'hrTimeCanvas');
  if (!canvas) return;

  attachZonesZoomInteractions(canvas, type);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const latestLthr = window.getEstimatedLthr();

  const sub = document.getElementById('hrZoneSubtitle');
  if (sub) {
    sub.innerText = `Alinhado a Andrew Coggan via LTHR Dinâmica (Janela 42d 100% MMP20-FC | Atual: ${latestLthr} bpm | FC Máx: ${userMaxHr} bpm). Eixo vertical = Horas Absolutas.`;
  }

  const groups = {};
  dbActivities.forEach(act => {
    if (!act.metrics || !act.currentFtp) return;
    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) groups[key] = { Z1:0, Z2:0, Z3:0, Z4:0, Z5:0, Z6:0, Z7:0, total:0 };
    
    if (type === 'pwr') {
      for (let p in act.metrics.pwrHist) {
        const sec = act.metrics.pwrHist[p], ratio = parseInt(p, 10) / act.currentFtp;
        if (ratio <= 0.55) groups[key].Z1 += sec;
        else if (ratio <= 0.75) groups[key].Z2 += sec;
        else if (ratio <= 0.90) groups[key].Z3 += sec;
        else if (ratio <= 1.05) groups[key].Z4 += sec;
        else if (ratio <= 1.20) groups[key].Z5 += sec;
        else if (ratio <= 1.50) groups[key].Z6 += sec;
        else groups[key].Z7 += sec;
        groups[key].total += sec;
      }
    } else {
      const actLthr = act.currentLthr || latestLthr;
      const z1Lim = Math.round(actLthr * 0.68);
      const z2Lim = Math.round(actLthr * 0.83);
      const z3Lim = Math.round(actLthr * 0.94);
      const z4Lim = Math.round(actLthr * 1.05);

      for (let hrStr in act.metrics.hrHist) {
        const sec = act.metrics.hrHist[hrStr], hr = parseInt(hrStr, 10);
        if (hr <= z1Lim) groups[key].Z1 += sec;
        else if (hr <= z2Lim) groups[key].Z2 += sec;
        else if (hr <= z3Lim) groups[key].Z3 += sec;
        else if (hr <= z4Lim) groups[key].Z4 += sec;
        else groups[key].Z5 += sec;
        groups[key].total += sec;
      }
    }
  });

  const allKeys = Object.keys(groups).sort();
  if (allKeys.length === 0) return;

  const st = zonesZoomState[type];
  const totalKeys = allKeys.length;
  const startIdx = Math.max(0, Math.floor(st.startFrac * (totalKeys - 1)));
  const endIdx = Math.min(totalKeys - 1, Math.ceil(st.endFrac * (totalKeys - 1)));
  const sortedKeys = allKeys.slice(startIdx, Math.max(startIdx + 1, endIdx + 1));

  let maxTotalSec = 0;
  sortedKeys.forEach(k => { if (groups[k].total > maxTotalSec) maxTotalSec = groups[k].total; });
  if (maxTotalSec === 0) return;

  const padL = 50, padR = 20, padT = 22, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const barW = Math.max(8, (drawW / sortedKeys.length) - 4);
  const maxHours = maxTotalSec / 3600;
  let step = maxHours > 100 ? 20 : (maxHours > 50 ? 10 : (maxHours > 20 ? 5 : (maxHours > 5 ? 2 : 1)));
  if (step === 0) step = 1;

  if (st.endFrac - st.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom à direita (duplo clique para resetar)', w - padR, 13);
  }

  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= maxHours; i += step) {
    const y = padT + drawH - (i / maxHours) * drawH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${i}h`, padL - 5, y + 3);
  }

  const colors = type === 'pwr'
    ? { Z1: '#94a3b8', Z2: '#38bdf8', Z3: '#22c55e', Z4: '#eab308', Z5: '#f97316', Z6: '#ef4444', Z7: '#a855f7' }
    : { Z1: '#94a3b8', Z2: '#38bdf8', Z3: '#22c55e', Z4: '#eab308', Z5: '#ef4444' };
  canvas.chartHitboxes = [];
  
  sortedKeys.forEach((k, idx) => {
    const g = groups[k], x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length - barW) / 2;
    let currentY = padT + drawH;
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length / 20) === 0) {
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(k, x + barW / 2, h - 15);
    }

    const zones = type === 'pwr' ? ['Z1','Z2','Z3','Z4','Z5','Z6','Z7'] : ['Z1','Z2','Z3','Z4','Z5'];
    let barData = { key: k, total: g.total, zones: {} };
    zones.forEach(z => {
      if (g[z] > 0) {
        const zoneH = (g[z] / 3600) / maxHours * drawH;
        ctx.fillStyle = colors[z];
        ctx.fillRect(x, currentY - zoneH, barW, zoneH);
        currentY -= zoneH;
        barData.zones[z] = { hours: (g[z] / 3600).toFixed(1), pct: ((g[z] / g.total) * 100).toFixed(1) + '%' };
      }
    });
    canvas.chartHitboxes.push({ x, y: padT, w: barW, h: drawH, data: barData, type: 'zone' });
  });
  setupTooltip(canvas);
}
