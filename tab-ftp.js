// Aba 2: Evolução de FTP + Zoom Ancorado à Direita + Tooltip

let ftpZoomState = { startFrac: 0, endFrac: 1 };
let ftpPanState = { active: false, startX: 0, origStart: 0, origEnd: 1 };
let ftpPinchState = { active: false, startDist: 0, origStart: 0, origEnd: 1 };
let lastFtpChartData = [];
let lastFtpRenderMeta = null;

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
    const { pad, w, h, points } = lastFtpRenderMeta;

    if (mx < pad || mx > w - pad || my < pad || my > h - pad) {
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

    const tolX = Math.max(16, ((w - pad * 2) / Math.max(1, points.length)) * 0.8);
    if (bestDist > tolX) {
      tipEl.style.display = 'none';
      return;
    }

    const dateLabel = nearest.date instanceof Date && !isNaN(nearest.date.getTime())
      ? nearest.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '--';

    const lthrLine = nearest.lthr
      ? `<br/><span style="color:#ef4444;">● LTHR:</span> <b>${Math.round(nearest.lthr)} bpm</b>`
      : '';

    tipEl.innerHTML = `
      <div style="color:#38bdf8; font-weight:700; margin-bottom:4px;">${dateLabel}</div>
      <span style="color:#fc5200;">● FTP:</span> <b>${Math.round(nearest.ftp)} W</b>${lthrLine}
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
    applyFtpRightZoom(e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (ftpZoomState.endFrac - ftpZoomState.startFrac >= 0.999) return;
    ftpPanState = {
      active: true,
      startX: e.clientX,
      origStart: ftpZoomState.startFrac,
      origEnd: ftpZoomState.endFrac
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!ftpPanState.active) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = Math.max(1, rect.width - 90);
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
      ftpPinchState = {
        active: true,
        startDist: Math.hypot(dx, dy) || 1,
        origStart: ftpZoomState.startFrac,
        origEnd: ftpZoomState.endFrac
      };
      ftpPanState.active = false;
    } else if (e.touches.length === 1 && ftpZoomState.endFrac - ftpZoomState.startFrac < 0.999) {
      ftpPanState = {
        active: true,
        startX: e.touches[0].clientX,
        origStart: ftpZoomState.startFrac,
        origEnd: ftpZoomState.endFrac
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (ftpPinchState.active && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = ftpPinchState.startDist / dist;
      const origSpan = ftpPinchState.origEnd - ftpPinchState.origStart;
      const newSpan = Math.max(0.03, Math.min(1, origSpan * scale));
      ftpZoomState = {
        startFrac: Math.max(0, 1 - newSpan),
        endFrac: 1
      };
      renderFtpChart(lastFtpChartData);
    } else if (ftpPanState.active && e.touches.length === 1) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const drawW = Math.max(1, rect.width - 90);
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
  attachFtpZoomInteractions(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 350; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
  if (!Array.isArray(data) || data.length < 2) {
    lastFtpRenderMeta = null;
    return;
  }

  const total = data.length;
  const startIdx = Math.max(0, Math.floor(ftpZoomState.startFrac * (total - 1)));
  const endIdx = Math.min(total - 1, Math.ceil(ftpZoomState.endFrac * (total - 1)));
  const viewData = data.slice(startIdx, Math.max(startIdx + 2, endIdx + 1));

  const minT = viewData[0].date.getTime(), maxT = viewData[viewData.length - 1].date.getTime();
  const minF = Math.max(0, Math.min(...viewData.map(d => d.ftp)) * 0.85), maxF = Math.max(...viewData.map(d => d.ftp)) * 1.1;
  const pad = 45;
  const getX = (t) => pad + ((t - minT) / Math.max(1, maxT - minT)) * (w - pad * 2);
  const getY = (f) => h - pad - ((f - minF) / Math.max(1, maxF - minF)) * (h - pad * 2);

  if (ftpZoomState.endFrac - ftpZoomState.startFrac < 0.999) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoom à direita (duplo clique para resetar)', w - pad, 16);
  }

  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let f = Math.ceil(minF / 25) * 25; f <= maxF; f += 25) {
    const y = getY(f); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${f}W`, pad - 6, y + 3);
  }

  const points = [];
  ctx.beginPath(); ctx.strokeStyle = '#fc5200'; ctx.lineWidth = 2.5;
  viewData.forEach((pt, idx) => {
    const x = getX(pt.date.getTime()), y = getY(pt.ftp);
    points.push({ x, y, date: pt.date, ftp: pt.ftp, lthr: pt.lthr });
    if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  lastFtpRenderMeta = { pad, w, h, points };
}
