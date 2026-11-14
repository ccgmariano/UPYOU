// Aba 7: Média do Índice de Variabilidade (VI)
function renderViChart() {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById('viCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const groups = {}; 
  dbActivities.forEach(act => {
    if (!act.metrics || !act.metrics.vi || act.metrics.avgPwr < 50) return;
    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) groups[key] = { sumVi: 0, count: 0 };
    groups[key].sumVi += act.metrics.vi; groups[key].count++;
  });
  const sortedKeys = Object.keys(groups).sort(); if (sortedKeys.length === 0) return;

  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const minVi = 1.0, maxVi = 1.5; 
  const getY = (val) => padT + drawH - ((Math.min(Math.max(val, minVi), maxVi) - minVi) / (maxVi - minVi)) * drawH;

  ctx.fillStyle = 'rgba(34, 197, 94, 0.1)'; ctx.fillRect(padL, getY(1.10), drawW, getY(1.0) - getY(1.10));
  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let v = 1.0; v <= 1.5; v += 0.1) {
    const y = getY(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.fillText(v.toFixed(1), padL - 5, y + 3);
  }

  const pointSpacing = drawW / Math.max(1, sortedKeys.length - 1);
  
  canvas.chartHitboxes = [];
  sortedKeys.forEach((k, idx) => {
    const avgVi = groups[k].sumVi / groups[k].count, x = padL + idx * pointSpacing, y = getY(avgVi);
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length/20) === 0) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(k, x, h - 15); }
    canvas.chartHitboxes.push({ x: x-5, y: y-5, w: 10, h: 10, data: { key: k, vi: avgVi.toFixed(2), count: groups[k].count }, type: 'vi' });
  });

  sortedKeys.forEach((k, idx) => {
    const avgVi = groups[k].sumVi / groups[k].count, x = padL + idx * pointSpacing, y = getY(avgVi);
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 2*Math.PI);
    ctx.fillStyle = avgVi <= 1.10 ? '#22c55e' : '#a78bfa'; ctx.fill();
  });
  setupTooltip(canvas);
}
