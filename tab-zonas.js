// Abas 4 e 5: Tempo por Zona de Potência e Tempo por Zona Cardíaca
function renderStackedZonesChart(type) {
  const period = document.querySelector('.time-filter').value;
  const canvas = document.getElementById(type === 'pwr' ? 'pwrTimeCanvas' : 'hrTimeCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const groups = {}; 
  const z1Lim = Math.round(userMaxHr * 0.60);
  const z2Lim = Math.round(userMaxHr * 0.70);
  const z3Lim = Math.round(userMaxHr * 0.80);
  const z4Lim = Math.round(userMaxHr * 0.90);

  dbActivities.forEach(act => {
    if (!act.metrics || !act.currentFtp) return;
    const key = getPeriodKey(act.dateObj, period);
    if (!groups[key]) groups[key] = { Z1:0, Z2:0, Z3:0, Z4:0, Z5:0, Z6:0, total:0 };
    
    if (type === 'pwr') {
      for (let p in act.metrics.pwrHist) {
        const sec = act.metrics.pwrHist[p], ratio = parseInt(p, 10) / act.currentFtp;
        if (ratio < 0.55) groups[key].Z1 += sec; else if (ratio <= 0.75) groups[key].Z2 += sec; else if (ratio <= 0.90) groups[key].Z3 += sec; else if (ratio <= 1.05) groups[key].Z4 += sec; else if (ratio <= 1.20) groups[key].Z5 += sec; else groups[key].Z6 += sec;
        groups[key].total += sec;
      }
    } else {
      for (let hrStr in act.metrics.hrHist) {
        const sec = act.metrics.hrHist[hrStr], hr = parseInt(hrStr, 10); 
        if (hr < z1Lim) groups[key].Z1 += sec; else if (hr <= z2Lim) groups[key].Z2 += sec; else if (hr <= z3Lim) groups[key].Z3 += sec; else if (hr <= z4Lim) groups[key].Z4 += sec; else groups[key].Z5 += sec;
        groups[key].total += sec;
      }
    }
  });

  const sortedKeys = Object.keys(groups).sort(); if (sortedKeys.length === 0) return;
  let maxTotalSec = 0; sortedKeys.forEach(k => { if (groups[k].total > maxTotalSec) maxTotalSec = groups[k].total; });
  if (maxTotalSec === 0) return;
  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const barW = Math.max(8, (drawW / sortedKeys.length) - 4);
  const maxHours = maxTotalSec / 3600;
  let step = maxHours > 100 ? 20 : (maxHours > 50 ? 10 : (maxHours > 20 ? 5 : (maxHours > 5 ? 2 : 1))); if (step === 0) step = 1;

  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= maxHours; i += step) {
    const y = padT + drawH - (i / maxHours) * drawH; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.fillText(`${i}h`, padL - 5, y + 3);
  }

  const colors = type === 'pwr' ? { Z1: '#94a3b8', Z2: '#38bdf8', Z3: '#22c55e', Z4: '#eab308', Z5: '#f97316', Z6: '#ef4444' } : { Z1: '#94a3b8', Z2: '#38bdf8', Z3: '#22c55e', Z4: '#eab308', Z5: '#ef4444' };
  canvas.chartHitboxes = [];
  
  sortedKeys.forEach((k, idx) => {
    const g = groups[k], x = padL + idx * (drawW / sortedKeys.length) + (drawW / sortedKeys.length - barW) / 2;
    let currentY = padT + drawH;
    if (sortedKeys.length < 35 || idx % Math.ceil(sortedKeys.length/20) === 0) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(k, x + barW/2, h - 15); }

    const zones = type === 'pwr' ? ['Z1','Z2','Z3','Z4','Z5','Z6'] : ['Z1','Z2','Z3','Z4','Z5'];
    let barData = { key: k, total: g.total, zones: {} };
    zones.forEach(z => {
      if (g[z] > 0) {
        const zoneH = (g[z] / 3600) / maxHours * drawH; ctx.fillStyle = colors[z]; ctx.fillRect(x, currentY - zoneH, barW, zoneH);
        currentY -= zoneH; barData.zones[z] = { hours: (g[z]/3600).toFixed(1), pct: ((g[z]/g.total)*100).toFixed(1) + '%' };
      }
    });
    canvas.chartHitboxes.push({ x, y: padT, w: barW, h: drawH, data: barData, type: 'zone' });
  });
  setupTooltip(canvas);
}
