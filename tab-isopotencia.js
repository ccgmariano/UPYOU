// Módulo de Evolução Histórica Iso-Potência + Zoom Ancorado à Direita + Tooltip

let isoZoomState = { startFrac: 0, endFrac: 1 };
let isoPanState = { active: false, startX: 0, origStart: 0, origEnd: 1 };
let isoPinchState = { active: false, startDist: 0, origStart: 0, origEnd: 1 };
let lastIsoRenderMeta = null;

function applyIsoRightZoom(zoomFactor) {
  const span = isoZoomState.endFrac - isoZoomState.startFrac;
  const newSpan = Math.max(0.05, Math.min(1, span * zoomFactor));
  isoZoomState = {
    startFrac: Math.max(0, 1 - newSpan),
    endFrac: 1
  };
  renderIsoPotenciaChart();
}

function getIsoTooltipEl(canvas) {
  if (!canvas._isoTooltipDiv) {
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
    canvas._isoTooltipDiv = div;
  }
  return canvas._isoTooltipDiv;
}

function attachIsoZoomInteractions(canvas) {
  if (!canvas || canvas._isoZoomBound) return;
  canvas._isoZoomBound = true;
  canvas.style.touchAction = 'none';

  const tipEl = getIsoTooltipEl(canvas);

  canvas.addEventListener('mousemove', (e) => {
    if (!lastIsoRenderMeta || !Array.isArray(lastIsoRenderMeta.series) || lastIsoRenderMeta.series.length === 0) {
      tipEl.style.display = 'none';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { padL, padT, drawW, drawH, series, p1, p2, p3 } = lastIsoRenderMeta;

    if (mx < padL || mx > padL + drawW || my < padT || my > padT + drawH) {
      tipEl.style.display = 'none';
      return;
    }

    let nearestIdx = 0;
    let bestDist = Infinity;
    series.forEach((s, idx) => {
      const sx = series.length === 1 ? padL + drawW / 2 : padL + (idx / (series.length - 1)) * drawW;
      const d = Math.abs(sx - mx);
      if (d < bestDist) {
        bestDist = d;
        nearestIdx = idx;
      }
    });

    const tolX = Math.max(18, (drawW / Math.max(1, series.length)) * 0.6);
    if (bestDist > tolX) {
      tipEl.style.display = 'none';
      return;
    }

    const item = series[nearestIdx];
    tipEl.innerHTML = `
      <div style="color:#38bdf8; font-weight:700; margin-bottom:4px;">${item.key}</div>
      <span style="color:#22c55e;">● ${p1}W:</span> <b>${Math.round(item.hr1)} bpm</b><br/>
      <span style="color:#06b6d4;">● ${p2}W:</span> <b>${Math.round(item.hr2)} bpm</b><br/>
      <span style="color:#eab308;">● ${p3}W:</span> <b>${Math.round(item.hr3)} bpm</b>
      <hr style="border:none; border-top:1px solid #334155; margin:5px 0;"/>
      <span style="color:#94a3b8;">Volume:</span> <b>${item.hours}h</b> <span style="color:#64748b;">(${item.ptsCount} pts)</span>
    `;

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

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyIsoRightZoom(e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (isoZoomState.endFrac - isoZoomState.startFrac >= 0.999) return;
    isoPanState = {
      active: true,
      startX: e.clientX,
      origStart: isoZoomState.startFrac,
      origEnd: isoZoomState.endFrac
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isoPanState.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 100);
    const span = isoPanState.origEnd - isoPanState.origStart;
    const deltaFrac = -((e.clientX - isoPanState.startX) / drawW) * span;

    let newStart = isoPanState.origStart + deltaFrac;
    let newEnd = isoPanState.origEnd + deltaFrac;
    if (newStart < 0) { newStart = 0; newEnd = span; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

    isoZoomState = { startFrac: newStart, endFrac: newEnd };
    renderIsoPotenciaChart();
  });

  window.addEventListener('mouseup', () => {
    if (!isoPanState.active) return;
    isoPanState.active = false;
    canvas.style.cursor = (isoZoomState.endFrac - isoZoomState.startFrac < 0.999) ? 'grab' : 'default';
  });

  canvas.addEventListener('dblclick', () => {
    isoZoomState = { startFrac: 0, endFrac: 1 };
    renderIsoPotenciaChart();
  });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      isoPinchState = {
        active: true,
        startDist: Math.hypot(dx, dy) || 1,
        origStart: isoZoomState.startFrac,
        origEnd: isoZoomState.endFrac
      };
      isoPanState.active = false;
    } else if (e.touches.length === 1 && isoZoomState.endFrac - isoZoomState.startFrac < 0.999) {
      isoPanState = {
        active: true,
        startX: e.touches[0].clientX,
        origStart: isoZoomState.startFrac,
        origEnd: isoZoomState.endFrac
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (isoPinchState.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = isoPinchState.startDist / dist;
      const origSpan = isoPinchState.origEnd - isoPinchState.origStart;
      const newSpan = Math.max(0.05, Math.min(1, origSpan * scale));
      isoZoomState = {
        startFrac: Math.max(0, 1 - newSpan),
        endFrac: 1
      };
      renderIsoPotenciaChart();
    } else if (isoPanState.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 100);
      const span = isoPanState.origEnd - isoPanState.origStart;
      const deltaFrac = -((e.touches[0].clientX - isoPanState.startX) / drawW) * span;

      let newStart = isoPanState.origStart + deltaFrac;
      let newEnd = isoPanState.origEnd + deltaFrac;
      if (newStart < 0) { newStart = 0; newEnd = span; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - span; }

      isoZoomState = { startFrac: newStart, endFrac: newEnd };
      renderIsoPotenciaChart();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    isoPinchState.active = false;
    isoPanState.active = false;
  });
}

window.initIsoPotenciaTab = function() {
  renderIsoPotenciaChart();
};

window.renderIsoPotenciaChart = function() {
  const canvas = document.getElementById('isoPotenciaCanvas');
  if (!canvas) return;
  attachIsoZoomInteractions(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 420;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhuma atividade carregada.', w / 2, h / 2);
    return;
  }

  const agrupamento = document.getElementById('isoAgrupamento')?.value || 'trimestre';
  const janelaSecs = parseInt(document.getElementById('isoJanelaPonto')?.value || '15', 10);

  const p1 = parseInt(document.getElementById('isoPwr1')?.value || '140', 10);
  const p2 = parseInt(document.getElementById('isoPwr2')?.value || '200', 10);
  const p3 = parseInt(document.getElementById('isoPwr3')?.value || '240', 10);

  const periodData = {};

  dbActivities.forEach(act => {
    if (!act.dateObj || !act.metrics) return;
    const pKey = getPeriodKey(act.dateObj, agrupamento);
    if (!periodData[pKey]) {
      periodData[pKey] = { pts: [], movingSecs: 0 };
    }
    periodData[pKey].movingSecs += (act.metrics.movingSecs || act.metrics.totalSecs || 0);

    if (act.metrics.dispWindows && act.metrics.dispWindows[janelaSecs]) {
      const wPts = act.metrics.dispWindows[janelaSecs];
      for (let i = 0; i < wPts.length; i++) {
        const px = wPts[i][0], py = wPts[i][1];
        if (px >= 50 && px <= 360 && py >= 60 && py <= 220) {
          periodData[pKey].pts.push({ x: px, y: py });
        }
      }
    }
  });

  const sortedKeys = Object.keys(periodData).sort();
  const fullSeries = [];

  sortedKeys.forEach(k => {
    const d = periodData[k];
    const pts = d.pts;
    if (pts.length >= 8) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = pts.length;
      for (let i = 0; i < n; i++) {
        sumX += pts[i].x; sumY += pts[i].y;
        sumXY += (pts[i].x * pts[i].y); sumXX += (pts[i].x * pts[i].x);
      }
      const denom = (n * sumXX - sumX * sumX);
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        if (slope > 0.03 && slope < 0.85) {
          const clampHr = (val) => Math.max(85, Math.min(205, val));
          fullSeries.push({
            key: k,
            hours: +(d.movingSecs / 3600).toFixed(1),
            ptsCount: n,
            hr1: clampHr(slope * p1 + intercept),
            hr2: clampHr(slope * p2 + intercept),
            hr3: clampHr(slope * p3 + intercept)
          });
        }
      }
    }
  });

  if (fullSeries.length === 0) {
    lastIsoRenderMeta = null;
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Dados insuficientes para traçar a evolução com os parâmetros selecionados.', w / 2, h / 2);
    return;
  }

  const total = fullSeries.length;
  const startIdx = Math.max(0, Math.floor(isoZoomState.startFrac * (total - 1)));
  const endIdx = Math.min(total - 1, Math.ceil(isoZoomState.endFrac * (total - 1)));
  const series = fullSeries.slice(startIdx, Math.max(startIdx + 1, endIdx + 1));

  const padL = 52, padR = 48, padT = 25, padB = 45;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  lastIsoRenderMeta = { padL, padR, padT, padB, drawW, drawH, series, p1, p2, p3 };

  let minHr = 200, maxHr = 100, maxHours = 1;
  series.forEach(s => {
    minHr = Math.min(minHr, s.hr1, s.hr2, s.hr3);
    maxHr = Math.max(maxHr, s.hr1, s.hr2, s.hr3);
    if (s.hours > maxHours) maxHours = s.hours;
  });

  minHr = Math.max(85, Math.floor((minHr - 6) / 10) * 10);
  maxHr = Math.min(205, Math.ceil((maxHr + 6) / 10) * 10);
  if (maxHr - minHr < 30) maxHr = minHr + 30;

  const getX = (idx) => {
    if (series.length === 1) return padL + drawW / 2;
    return padL + (idx / (series.length - 1)) * drawW;
  };
  const getY = (hr) => padT + drawH - ((hr - minHr) / (maxHr - minHr)) * drawH;

  ctx.strokeStyle = '#1e293b'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  const stepHr = (maxHr - minHr) > 60 ? 15 : 10;
  for (let hr = minHr; hr <= maxHr; hr += stepHr) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 8, y + 3);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  for (let i = 0; i <= 4; i++) {
    const hVal = Math.round((maxHours / 4) * i);
    const y = padT + drawH - (i / 4) * (drawH * 0.82);
    ctx.fillText(`${hVal}h`, w - padR + 8, y + 3);
  }

  if (isoZoomState.endFrac - isoZoomState.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom à direita (duplo clique para resetar)', w - padR, 14);
  }

  const barW = Math.max(4, Math.min(34, (drawW / series.length) * 0.62));
  series.forEach((s, idx) => {
    const x = getX(idx);
    const barH = (s.hours / maxHours) * (drawH * 0.82);
    const y = padT + drawH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, padT + drawH);
    grad.addColorStop(0, 'rgba(30, 64, 175, 0.42)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.12)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
    ctx.lineWidth = 1;
    ctx.fillRect(x - barW / 2, y, barW, barH);
    ctx.strokeRect(x - barW / 2, y, barW, barH);
  });

  ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const labelSkip = Math.max(1, Math.ceil(series.length / 12));
  series.forEach((s, idx) => {
    if (idx % labelSkip === 0 || idx === series.length - 1) {
      const x = getX(idx);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + drawH);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)'; ctx.stroke();
      ctx.fillText(s.key, x, h - padB + 18);
    }
  });

  function drawSmoothGlowCurve(keyProp, color, glowColor) {
    if (series.length === 0) return;
    const pts = series.map((s, idx) => ({ x: getX(idx), y: getY(s[keyProp]), val: Math.round(s[keyProp]) }));

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, drawW, drawH);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else if (pts.length > 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? i : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }

    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.restore();

    pts.forEach((pt, idx) => {
      const isLast = (idx === pts.length - 1);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isLast ? 4 : 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      if (isLast) {
        ctx.fillStyle = color;
        ctx.font = 'bold 10.5px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${pt.val}`, pt.x + 7, pt.y + 3);
      }
    });
  }

  drawSmoothGlowCurve('hr1', '#22c55e', 'rgba(34, 197, 94, 0.22)');
  drawSmoothGlowCurve('hr2', '#06b6d4', 'rgba(6, 182, 212, 0.22)');
  drawSmoothGlowCurve('hr3', '#eab308', 'rgba(234, 179, 8, 0.22)');
};
