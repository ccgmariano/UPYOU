// Aba 8: Volume de Estrutura (Estruturado vs Livre)
function renderStructureVolChart() {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById('structureVolCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const groups = {}; 
  dbActivities.forEach(act => {
    if (!act.metrics || !act.metrics.vi) return;
    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) groups[key] = { estruturado: 0, livre: 0, total: 0 };
    const dur = act.metrics.movingSecs || act.metrics.totalSecs || 0;
    if (isActivityStructured(act.metrics)) groups[key].estruturado += dur; else groups[key].livre += dur;
    groups[key].total += dur;
  });

  const sortedKeys = Object.keys(groups).sort(); if (sortedKeys.length === 0) return;
  let maxTotalSec = 0; sortedKeys.forEach(k => { if (groups[k].total > maxTotalSec) maxTotalSec = groups[k].total; });
  if (maxTotalSec === 0) maxTotalSec = 3600;

  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const barW = Math.max(8, (drawW / sortedKeys.length) - 4);
  const maxHours = maxTotalSec / 3600;
  let step = maxHours > 100 ? 20 : (maxHours > 50 ? 10 : (maxHours > 20 ? 5 : (maxHours > 5 ? 2 : 1))); if (step === 0) step = 1;

  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= maxHours; i += step) {
    const y = padT + drawH - (i / maxHours) * drawH; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.fillText(`${i}h`, padL - 5, y + 3);
  }

  canvas.chartHitboxes = [];
  sortedKeys.forEach((k, idx) => {
    const g = groups[k], x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length - barW) / 2;
    let currentY = padT + drawH;
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length/20) === 0) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(k, x + barW/2, h - 15); }

    const hEstruturado = (g.estruturado / 3600) / maxHours * drawH, hLivre = (g.livre / 3600) / maxHours * drawH;
    ctx.fillStyle = '#22c55e'; ctx.fillRect(x, currentY - hEstruturado, barW, hEstruturado); currentY -= hEstruturado;
    ctx.fillStyle = '#64748b'; ctx.fillRect(x, currentY - hLivre, barW, hLivre);
    canvas.chartHitboxes.push({ x, y: padT, w: barW, h: drawH, data: { key: k, estruturado: (g.estruturado/3600).toFixed(1), livre: (g.livre/3600).toFixed(1), total: (g.total/3600).toFixed(1) }, type: 'vol' });
  });
  setupTooltip(canvas);
}
