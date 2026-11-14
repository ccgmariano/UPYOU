// Aba 6: Evolução do Cardiac Drift
function renderDriftChart() {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById('driftCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const groups = {}; 
  dbActivities.forEach(act => {
    const m = act.metrics;
    if (!m || m.drift === null) return;
    const isEligible = m.driftEligible !== undefined ? m.driftEligible : (m.totalSecs >= 1800 && m.vi <= 1.12 && Math.abs(m.drift) <= 25);
    if (!isEligible) return;

    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) groups[key] = { sumDrift: 0, count: 0 };
    groups[key].sumDrift += Math.max(0, m.drift);
    groups[key].count++;
  });

  const sortedKeys = Object.keys(groups).sort(); if (sortedKeys.length === 0) return;
  let maxDrift = 10; 
  sortedKeys.forEach(k => { const avg = groups[k].sumDrift / groups[k].count; if (avg > maxDrift) maxDrift = Math.ceil(avg); });

  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const barW = Math.max(8, (drawW / sortedKeys.length) - 4);

  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= maxDrift; i += 5) {
    const y = padT + drawH - (i / maxDrift) * drawH; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.fillText(`${i}%`, padL - 5, y + 3);
  }
  
  const y5 = padT + drawH - (5 / maxDrift) * drawH;
  ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.moveTo(padL, y5); ctx.lineTo(w - padR, y5); ctx.strokeStyle = '#22c55e'; ctx.stroke(); ctx.setLineDash([]);

  canvas.chartHitboxes = [];
  sortedKeys.forEach((k, idx) => {
    const avg = groups[k].sumDrift / groups[k].count;
    const x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length - barW) / 2;
    const barH = Math.max(2, (avg / maxDrift) * drawH); const y = padT + drawH - barH;
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length/20) === 0) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(k, x + barW/2, h - 15); }
    ctx.fillStyle = avg <= 5 ? '#22c55e' : '#ef4444'; ctx.fillRect(x, y, barW, barH);
    canvas.chartHitboxes.push({ x, y, w: barW, h: barH, data: { key: k, drift: avg.toFixed(1), count: groups[k].count }, type: 'drift' });
  });
  setupTooltip(canvas);
}
