// Aba 3: Assinatura Cardíaca pareada segundo a segundo por Zona Dinâmica de Potência
function renderDynamicZones() {
  const zonesData = {
    Z1: { minP: 0.20, maxP: 0.55, sumHrSec: 0, totSec: 0, color: '#94a3b8', n: 'Z1 (<55%)' },
    Z2: { minP: 0.55, maxP: 0.75, sumHrSec: 0, totSec: 0, color: '#38bdf8', n: 'Z2 (56-75%)' },
    Z3: { minP: 0.75, maxP: 0.90, sumHrSec: 0, totSec: 0, color: '#22c55e', n: 'Z3 (76-90%)' },
    Z4: { minP: 0.90, maxP: 1.05, sumHrSec: 0, totSec: 0, color: '#eab308', n: 'Z4 (91-105%)' },
    Z5: { minP: 1.05, maxP: 1.20, sumHrSec: 0, totSec: 0, color: '#f97316', n: 'Z5 (106-120%)' },
    Z6: { minP: 1.20, maxP: 2.50, sumHrSec: 0, totSec: 0, color: '#ef4444', n: 'Z6 (>120%)' }
  };

  dbActivities.forEach(act => {
    const m = act.metrics;
    if (!m || !act.currentFtp) return;

    if (m.pwrHrPairs && Object.keys(m.pwrHrPairs).length > 0) {
      for (const pStr in m.pwrHrPairs) {
        const p = parseInt(pStr, 10);
        const pair = m.pwrHrPairs[pStr];
        if (!pair || pair.secs <= 0) continue;
        const ratio = p / act.currentFtp;
        for (const key in zonesData) {
          const z = zonesData[key];
          if (ratio > z.minP && ratio <= z.maxP) {
            z.sumHrSec += pair.sumHr;
            z.totSec += pair.secs;
            break;
          }
        }
      }
    } else if (m.pwrHist && m.hrHist && m.avgHr >= 60) {
      let pEntries = Object.entries(m.pwrHist).map(([w, s]) => ({ w: parseInt(w, 10), s })).filter(x => x.w > 20).sort((a, b) => a.w - b.w);
      let hEntries = Object.entries(m.hrHist).map(([h, s]) => ({ h: parseInt(h, 10), s })).filter(x => x.h >= 60).sort((a, b) => a.h - b.h);
      const totP = pEntries.reduce((a, x) => a + x.s, 0);
      const totH = hEntries.reduce((a, x) => a + x.s, 0);
      if (totP > 300 && totH > 300) {
        let cumP = 0;
        for (const pe of pEntries) {
          const midPct = (cumP + pe.s / 2) / totP;
          cumP += pe.s;
          let cumH = 0, matchedHr = m.avgHr;
          for (const he of hEntries) {
            if ((cumH + he.s) / totH >= midPct) { matchedHr = he.h; break; }
            cumH += he.s;
          }
          const ratio = pe.w / act.currentFtp;
          for (const key in zonesData) {
            const z = zonesData[key];
            if (ratio > z.minP && ratio <= z.maxP) {
              z.sumHrSec += matchedHr * pe.s;
              z.totSec += pe.s;
              break;
            }
          }
        }
      }
    }
  });

  const canvas = document.getElementById('zonesCanvas'); const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 350, pad = 40; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
  const zoneKeys = Object.keys(zonesData); const barWidth = (w - pad * 2) / zoneKeys.length - 15;

  zoneKeys.forEach((key, idx) => {
    const z = zonesData[key], avgHr = z.totSec > 60 ? Math.round(z.sumHrSec / z.totSec) : 0;
    const x = pad + idx * (barWidth + 15) + 10;
    const barH = avgHr > 0 ? Math.max(10, ((avgHr - 80) / 115) * (h - pad * 2)) : 5;
    const y = h - pad - barH;
    ctx.fillStyle = z.color; ctx.fillRect(x, y, barWidth, barH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    if (avgHr > 0) ctx.fillText(`${avgHr} bpm`, x + barWidth / 2, y - 8);
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.fillText(z.n, x + barWidth / 2, h - pad + 16);
  });
}
