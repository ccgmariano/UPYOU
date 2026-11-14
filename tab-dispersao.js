// Módulo de Dispersão Avançada: Comparação Direta de N Períodos com Gradiente Cronológico
let dispAllBlocks = [];
let dispUniquePeriods = [];
let dispCurrentSliderIndex = 0;

window.initDispersaoTab = function() {
  processDispersaoData();
};

window.onDispParamChange = function() {
  processDispersaoData();
};

window.onDispSliderInput = function(val) {
  dispCurrentSliderIndex = parseInt(val, 10);
  renderDispersaoChart();
};

function processDispersaoData() {
  const agrupamento = document.getElementById('dspAgrupamento')?.value || 'mes';
  const janelaSecs = parseInt(document.getElementById('dspJanelaPonto')?.value || '600', 10);

  dispAllBlocks = [];
  const periodMap = new Set();

  dbActivities.forEach(act => {
    if (!act.dateObj || !act.metrics) return;
    const pKey = getPeriodKey(act.dateObj, agrupamento);

    if (act.metrics.dispWindows && act.metrics.dispWindows[janelaSecs]) {
      const pts = act.metrics.dispWindows[janelaSecs];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i][0];
        const h = pts[i][1];
        if (p >= 40 && h >= 50 && h <= 225) {
          dispAllBlocks.push({ x: p, y: h, periodKey: pKey });
          periodMap.add(pKey);
        }
      }
    } else if (act.metrics.pwrHrPairs) {
      for (const pStr in act.metrics.pwrHrPairs) {
        const p = parseInt(pStr, 10);
        const pair = act.metrics.pwrHrPairs[pStr];
        if (p >= 40 && pair && pair.secs >= janelaSecs) {
          const numBlocos = Math.floor(pair.secs / janelaSecs);
          const avgHr = Math.round(pair.sumHr / pair.secs);
          if (avgHr >= 50 && avgHr <= 225) {
            for (let k = 0; k < numBlocos; k++) {
              dispAllBlocks.push({ x: p, y: avgHr, periodKey: pKey });
            }
            periodMap.add(pKey);
          }
        }
      }
    }
  });

  dispUniquePeriods = Array.from(periodMap).sort();
  const slider = document.getElementById('dspTimeSlider');
  
  if (dispUniquePeriods.length === 0) {
    if (slider) { slider.min = 0; slider.max = 0; slider.value = 0; }
    renderDispersaoChart();
    return;
  }

  if (slider) {
    slider.min = 0;
    slider.max = Math.max(0, dispUniquePeriods.length - 1);
    dispCurrentSliderIndex = dispUniquePeriods.length - 1;
    slider.value = dispCurrentSliderIndex;
  }

  renderDispersaoChart();
}

// Gera cor cronológica: do Roxo/Azul (mais antigo da janela) ao Verde/Amarelo (mais recente da janela)
function getPeriodColor(idx, total, alpha = 1) {
  if (total <= 1) return `hsla(142, 76%, 50%, ${alpha})`;
  const ratio = idx / (total - 1); // 0 = mais antigo, 1 = mais recente
  // Hue: 265 (roxo) -> 195 (ciano) -> 135 (verde) -> 55 (amarelo vivo)
  const hue = Math.round(265 - ratio * 200);
  const light = Math.round(52 + ratio * 8);
  return `hsla(${hue}, 85%, ${light}%, ${alpha})`;
}

function renderDispersaoChart() {
  const canvas = document.getElementById('dispersaoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 420;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const qtdPeriodos = parseInt(document.getElementById('dspQtdPeriodos')?.value || '3', 10);
  const legendBox = document.getElementById('dspLegendContainer');
  
  if (dispUniquePeriods.length === 0 || dispAllBlocks.length === 0) {
    if (legendBox) legendBox.innerHTML = '';
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhum ponto encontrado para este intervalo.', w / 2, h / 2);
    return;
  }

  const endIndex = Math.min(dispCurrentSliderIndex, dispUniquePeriods.length - 1);
  const startIndex = Math.max(0, endIndex - qtdPeriodos + 1);
  const activePeriods = dispUniquePeriods.slice(startIndex, endIndex + 1);

  // Agrupa os pontos exclusivamente dos períodos selecionados na janela
  const periodGroups = {};
  activePeriods.forEach(p => periodGroups[p] = []);

  const minX = 60, maxX = 340;
  const minY = 95, maxY = 190;

  let totalActivePts = 0;
  for (let i = 0; i < dispAllBlocks.length; i++) {
    const pt = dispAllBlocks[i];
    if (periodGroups[pt.periodKey] !== undefined) {
      if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
        periodGroups[pt.periodKey].push(pt);
        totalActivePts++;
      }
    }
  }

  const sliderLabel = document.getElementById('dspSliderLabel');
  if (sliderLabel) {
    sliderLabel.innerText = `Janela Ativa: ${activePeriods[0]} até ${activePeriods[activePeriods.length - 1]} (${activePeriods.length} períodos | ${totalActivePts} pontos)`;
  }

  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;

  const getX = (p) => padL + ((p - minX) / (maxX - minX)) * drawW;
  const getY = (hr) => padT + drawH - ((hr - minY) / (maxY - minY)) * drawH;

  // Grid e Eixos
  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let hr = 100; hr <= maxY; hr += 15) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 8, y + 3);
  }

  ctx.textAlign = 'center';
  for (let p = 60; p <= maxX; p += 40) {
    const x = getX(p);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
    ctx.fillText(`${p}W`, x, h - padB + 15);
  }

  // 1. Desenha os micro-pontos de cada período (do mais antigo para o mais recente)
  activePeriods.forEach((pKey, idx) => {
    const pts = periodGroups[pKey];
    const isLatest = (idx === activePeriods.length - 1);
    const ptAlpha = activePeriods.length > 8 ? 0.45 : 0.7;
    ctx.fillStyle = getPeriodColor(idx, activePeriods.length, isLatest ? 0.9 : ptAlpha);
    const sz = isLatest ? 2.2 : 1.7;
    const half = sz / 2;

    for (let i = 0; i < pts.length; i++) {
      ctx.fillRect(getX(pts[i].x) - half, getY(pts[i].y) - half, sz, sz);
    }
  });

  // 2. Calcula e desenha a linha de tendência individual de cada período + monta legenda
  let legendHtml = '';

  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, drawW, drawH);
  ctx.clip();

  activePeriods.forEach((pKey, idx) => {
    const pts = periodGroups[pKey];
    const isLatest = (idx === activePeriods.length - 1);
    const solidColor = getPeriodColor(idx, activePeriods.length, 1);
    const lineColor = getPeriodColor(idx, activePeriods.length, isLatest ? 1 : 0.85);

    let hrAt200W = '--';

    if (pts.length >= 3) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = pts.length;
      for (let i = 0; i < n; i++) {
        sumX += pts[i].x; sumY += pts[i].y;
        sumXY += (pts[i].x * pts[i].y); sumXX += (pts[i].x * pts[i].x);
      }
      const denom = (n * sumXX - sumX * sumX);
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        hrAt200W = Math.round(slope * 200 + intercept) + ' bpm';

        const x1 = minX, y1 = slope * x1 + intercept;
        const x2 = maxX, y2 = slope * x2 + intercept;

        ctx.beginPath();
        ctx.moveTo(getX(x1), getY(y1));
        ctx.lineTo(getX(x2), getY(y2));
        ctx.strokeStyle = lineColor;
        // O período mais recente da janela ganha linha sólida mais grossa; anteriores ficam tracejados suaves
        ctx.lineWidth = isLatest ? 2.8 : 1.6;
        if (!isLatest && activePeriods.length > 3) {
          ctx.setLineDash([5, 3]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      }
    }

    legendHtml += `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: #1e293b; padding: 4px 9px; border-radius: 4px; border-left: 3px solid ${solidColor}; font-size: 0.76rem; color: ${isLatest ? '#f8fafc' : '#cbd5e1'}; font-weight: ${isLatest ? 'bold' : 'normal'};">
        <span>${pKey}</span>
        <span style="color: #94a3b8; font-size: 0.72rem;">(${pts.length} pts | 200W: <strong style="color:${solidColor}">${hrAt200W}</strong>)</span>
      </div>`;
  });

  ctx.restore();

  if (legendBox) {
    legendBox.innerHTML = legendHtml;
  }
}

window.updateDispersaoChart = function() {
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    processDispersaoData();
  }
};
