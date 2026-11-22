// Novo Módulo: Estudo Avançado de Eficiência Cardíaca por Faixa de Watts + Zoom Ancorado à Direita

let efZoomState = { startFrac: 0, endFrac: 1 };
let efPanState = { active: false, startX: 0, origStart: 0, origEnd: 1 };
let efPinchState = { active: false, startDist: 0, origStart: 0, origEnd: 1 };

function applyEfRightZoom(zoomFactor) {
  const span = efZoomState.endFrac - efZoomState.startFrac;
  const newSpan = Math.max(0.05, Math.min(1, span * zoomFactor));
  efZoomState = {
    startFrac: Math.max(0, 1 - newSpan),
    endFrac: 1
  };
  renderEficienciaChart();
}

function attachEfZoomInteractions(canvas) {
  if (!canvas || canvas._efZoomBound) return;
  canvas._efZoomBound = true;
  canvas.style.touchAction = 'none';

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyEfRightZoom(e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (efZoomState.endFrac - efZoomState.startFrac >= 0.999) return;
    efPanState = {
      active: true,
      startX: e.clientX,
      origStart: efZoomState.startFrac,
      origEnd: efZoomState.endFrac
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!efPanState.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 110);
    const span = efPanState.origEnd - efPanState.origStart;
    const deltaFrac = -((e.clientX - efPanState.startX) / drawW) * span;

    let newStart = efPanState.origStart + deltaFrac;
    let newEnd = efPanState.origEnd + deltaFrac;
    if (newStart < 0) { newStart = 0; newEnd = span; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

    efZoomState = { startFrac: newStart, endFrac: newEnd };
    renderEficienciaChart();
  });

  window.addEventListener('mouseup', () => {
    if (!efPanState.active) return;
    efPanState.active = false;
    canvas.style.cursor = (efZoomState.endFrac - efZoomState.startFrac < 0.999) ? 'grab' : 'default';
  });

  canvas.addEventListener('dblclick', () => {
    efZoomState = { startFrac: 0, endFrac: 1 };
    renderEficienciaChart();
  });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      efPinchState = {
        active: true,
        startDist: Math.hypot(dx, dy) || 1,
        origStart: efZoomState.startFrac,
        origEnd: efZoomState.endFrac
      };
      efPanState.active = false;
    } else if (e.touches.length === 1 && efZoomState.endFrac - efZoomState.startFrac < 0.999) {
      efPanState = {
        active: true,
        startX: e.touches[0].clientX,
        origStart: efZoomState.startFrac,
        origEnd: efZoomState.endFrac
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (efPinchState.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = efPinchState.startDist / dist;
      const origSpan = efPinchState.origEnd - efPinchState.origStart;
      const newSpan = Math.max(0.05, Math.min(1, origSpan * scale));
      efZoomState = {
        startFrac: Math.max(0, 1 - newSpan),
        endFrac: 1
      };
      renderEficienciaChart();
    } else if (efPanState.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 110);
      const span = efPanState.origEnd - efPanState.origStart;
      const deltaFrac = -((e.touches[0].clientX - efPanState.startX) / drawW) * span;

      let newStart = efPanState.origStart + deltaFrac;
      let newEnd = efPanState.origEnd + deltaFrac;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

      efZoomState = { startFrac: newStart, endFrac: newEnd };
      renderEficienciaChart();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    efPinchState.active = false;
    efPanState.active = false;
  });
}

function renderEficienciaChart() {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById('eficienciaCanvas');
  if (!canvas) return;
  attachEfZoomInteractions(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const zoneRanges = {
    Z2: { min: 0.56, max: 0.75, name: 'Z2 Resistência', color: '#38bdf8' },
    Z3: { min: 0.76, max: 0.90, name: 'Z3 Tempo', color: '#22c55e' },
    Z4: { min: 0.91, max: 1.05, name: 'Z4 Limiar (FTP)', color: '#eab308' },
    Z5: { min: 1.06, max: 1.20, name: 'Z5 VO2Máx', color: '#f97316' },
    Z6: { min: 1.21, max: 1.50, name: 'Z6 Anaeróbico', color: '#ef4444' },
    Z7: { min: 1.51, max: 3.50, name: 'Z7 Neuromuscular', color: '#a855f7' }
  };

  const activeZones = Object.keys(zoneRanges).filter(z => {
    const chk = document.getElementById(`chk-${z.toLowerCase()}`);
    return chk ? chk.checked : false;
  });

  const monthlyData = {};
  dbActivities.forEach(act => {
    if (!act.dateObj || !act.currentFtp || !act.metrics || !act.metrics.pwrHrPairs) return;
    const key = getPeriodKey(act.dateObj, period);
    
    if (!monthlyData[key]) {
      monthlyData[key] = {};
      Object.keys(zoneRanges).forEach(z => {
        monthlyData[key][z] = { sumHrSec: 0, totSec: 0 };
      });
    }

    const ftp = act.currentFtp;
    for (const pStr in act.metrics.pwrHrPairs) {
      const p = parseInt(pStr, 10);
      const pair = act.metrics.pwrHrPairs[pStr];
      if (!pair || pair.secs <= 0) continue;
      const ratio = p / ftp;

      for (const z of Object.keys(zoneRanges)) {
        const range = zoneRanges[z];
        if (ratio >= range.min && ratio < range.max) {
          monthlyData[key][z].sumHrSec += pair.sumHr;
          monthlyData[key][z].totSec += pair.secs;
          break;
        }
      }
    }
  });

  const allKeys = Object.keys(monthlyData).sort();
  if (allKeys.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhum dado suficiente para o período selecionado.', w / 2, h / 2);
    return;
  }

  const total = allKeys.length;
  const startIdx = Math.max(0, Math.floor(efZoomState.startFrac * (total - 1)));
  const endIdx = Math.min(total - 1, Math.ceil(efZoomState.endFrac * (total - 1)));
  const sortedKeys = allKeys.slice(startIdx, Math.max(startIdx + 1, endIdx + 1));

  let maxMin = 10;
  sortedKeys.forEach(k => {
    activeZones.forEach(z => {
      const mins = monthlyData[k][z].totSec / 60;
      if (mins > maxMin) maxMin = mins;
    });
  });

  const padL = 55, padR = 55, padT = 25, padB = 45;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const barW = Math.max(8, (drawW / sortedKeys.length) - 6);

  const minBpm = 110, maxBpm = 190;
  const getYBpm = (bpm) => padT + drawH - ((Math.min(Math.max(bpm, minBpm), maxBpm) - minBpm) / (maxBpm - minBpm)) * drawH;

  const getMaxMinRounded = Math.ceil(maxMin / 30) * 30 || 120;
  const getYMin = (mins) => padT + drawH - (mins / getMaxMinRounded) * drawH;

  if (efZoomState.endFrac - efZoomState.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom à direita (duplo clique para resetar)', w - padR, 14);
  }

  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let b = minBpm; b <= maxBpm; b += 20) {
    const y = getYBpm(b);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${b} bpm`, padL - 8, y + 3);
  }

  ctx.textAlign = 'left';
  for (let m = 0; m <= getMaxMinRounded; m += Math.max(30, getMaxMinRounded / 4)) {
    const y = getYMin(m);
    ctx.fillText(`${m}m`, w - padR + 8, y + 3);
  }

  canvas.chartHitboxes = [];

  sortedKeys.forEach((k, idx) => {
    const x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length - barW) / 2;
    let stackBottom = padT + drawH;

    activeZones.forEach(z => {
      const zone = zoneRanges[z];
      const mins = monthlyData[k][z].totSec / 60;
      if (mins <= 0) return;
      const barH = (mins / getMaxMinRounded) * drawH;
      const y = stackBottom - barH;

      ctx.fillStyle = zone.color + '33';
      ctx.fillRect(x, y, barW, barH);
      stackBottom = y;
    });

    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length / 20) === 0) {
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
      ctx.fillText(k, x + barW / 2, h - 15);
    }
  });

  activeZones.forEach(z => {
    const zone = zoneRanges[z];
    ctx.beginPath(); ctx.strokeStyle = zone.color; ctx.lineWidth = 2.5;

    let points = [];
    sortedKeys.forEach((k) => {
      const idx = sortedKeys.indexOf(k);
      const item = monthlyData[k][z];
      const x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length) / 2;
      if (item.totSec > 120) {
        const avgBpm = Math.round(item.sumHrSec / item.totSec);
        const y = getYBpm(avgBpm);
        points.push({ x, y, avgBpm, key: k, mins: (item.totSec / 60).toFixed(0) });
      }
    });

    points.forEach((pt, pIdx) => {
      if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);

      canvas.chartHitboxes.push({
        x: pt.x - 6, y: pt.y - 6, w: 12, h: 12,
        data: { key: pt.key, zone: zone.name, bpm: pt.avgBpm, mins: pt.mins, color: zone.color },
        type: 'eficiencia'
      });
    });
    ctx.stroke();

    points.forEach(pt => {
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = zone.color; ctx.fill();
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  });

  setupEficienciaTooltip(canvas);
}

window.updateEficienciaChart = function() {
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    renderEficienciaChart();
  }
};

function setupEficienciaTooltip(canvas) {
  if (!canvas.tooltipDiv) {
    canvas.tooltipDiv = document.createElement('div');
    Object.assign(canvas.tooltipDiv.style, {
      position: 'absolute', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #475569',
      padding: '10px', borderRadius: '6px', color: '#fff', pointerEvents: 'none', display: 'none', zIndex: '100', fontSize: '12px'
    });
    document.body.appendChild(canvas.tooltipDiv);

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let found = false;
      if (canvas.chartHitboxes) {
        for (let box of canvas.chartHitboxes) {
          if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
            const d = box.data;
            canvas.tooltipDiv.innerHTML = `<strong style="color:${d.color}">${d.zone}</strong><br/>Período: <b>${d.key}</b><hr style="border-color:#334155; margin:4px 0;"/>FC Média: <b style="color:#38bdf8">${d.bpm} bpm</b><br/>Volume: ${d.mins} min`;
            canvas.tooltipDiv.style.left = (e.pageX + 15) + 'px'; canvas.tooltipDiv.style.top = (e.pageY + 15) + 'px';
            canvas.tooltipDiv.style.display = 'block'; found = true; break;
          }
        }
      }
      if (!found) canvas.tooltipDiv.style.display = 'none';
    });
    canvas.addEventListener('mouseleave', () => canvas.tooltipDiv.style.display = 'none');
  }
}
