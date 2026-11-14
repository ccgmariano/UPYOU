// Módulo de Dispersão Avançada: Resolução de 1W / 1BPM, Micro-Pontos (1.5px) e Janelas Reais (1m, 5m, 10m, 15m, 60m)
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
  let hasLegacyOnly = false;

  dbActivities.forEach(act => {
    if (!act.dateObj || !act.metrics) return;
    const pKey = getPeriodKey(act.dateObj, agrupamento);

    // 1. Lê as janelas exatas (1W e 1BPM) pré-calculadas no app.js para o intervalo selecionado
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
      // Caso o banco local ainda tenha atividades antigas do ZIP do Strava sem dispWindows
      hasLegacyOnly = true;
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
    renderDispersaoChart(hasLegacyOnly);
    return;
  }

  if (slider) {
    slider.min = 0;
    slider.max = Math.max(0, dispUniquePeriods.length - 1);
    dispCurrentSliderIndex = dispUniquePeriods.length - 1;
    slider.value = dispCurrentSliderIndex;
  }

  renderDispersaoChart(hasLegacyOnly);
}

function renderDispersaoChart(hasLegacyOnly = false) {
  const canvas = document.getElementById('dispersaoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const qtdPeriodos = parseInt(document.getElementById('dspQtdPeriodos')?.value || '3', 10);
  
  if (dispUniquePeriods.length === 0 || dispAllBlocks.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhum ponto para este intervalo. Se usa ZIP do Strava, clique em "+ Importar / Recalcular ZIP" abaixo para gerar janelas de 1W.', w / 2, h / 2);
    return;
  }

  const endIndex = Math.min(dispCurrentSliderIndex, dispUniquePeriods.length - 1);
  const startIndex = Math.max(0, endIndex - qtdPeriodos + 1);
  const activePeriods = dispUniquePeriods.slice(startIndex, endIndex + 1);

  const sliderLabel = document.getElementById('dspSliderLabel');
  if (sliderLabel) {
    const activeCount = dispAllBlocks.filter(pt => activePeriods.includes(pt.periodKey)).length;
    sliderLabel.innerText = `Janela Ativa: ${activePeriods[0]} até ${activePeriods[activePeriods.length - 1]} (${activePeriods.length} períodos | ${activeCount} pontos)`;
  }

  // Escala de 1W em 1W (Eixo X) e 1BPM em 1BPM (Eixo Y)
  const minX = 60, maxX = 340;
  const minY = 95, maxY = 190;

  const padL = 50, padR = 20, padT = 25, padB = 40;
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

  // 1. Pontos do Histórico (Fundo - micro-pontos de 1.5x1.5 px, ~10x menor em área que o círculo anterior)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  const bgPoints = [];
  const activePoints = [];

  for (let i = 0; i < dispAllBlocks.length; i++) {
    const pt = dispAllBlocks[i];
    if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) continue;
    if (activePeriods.includes(pt.periodKey)) {
      activePoints.push(pt);
    } else {
      bgPoints.push(pt);
      ctx.fillRect(getX(pt.x) - 0.75, getY(pt.y) - 0.75, 1.5, 1.5);
    }
  }

  // 2. Pontos da Janela Ativa (Destaque - micro-pontos de 2x2 px)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
  for (let i = 0; i < activePoints.length; i++) {
    const pt = activePoints[i];
    ctx.fillRect(getX(pt.x) - 1, getY(pt.y) - 1, 2, 2);
  }

  function drawTrend(points, color, width, isDash) {
    if (points.length < 2) return;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = points.length;
    for (let i = 0; i < n; i++) {
      const pt = points[i];
      sumX += pt.x; sumY += pt.y;
      sumXY += (pt.x * pt.y); sumXX += (pt.x * pt.x);
    }
    const denom = (n * sumXX - sumX * sumX);
    if (denom === 0) return;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const x1 = minX, y1 = slope * x1 + intercept;
    const x2 = maxX, y2 = slope * x2 + intercept;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, drawW, drawH);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(getX(x1), getY(y1));
    ctx.lineTo(getX(x2), getY(y2));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (isDash) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  if (bgPoints.length > 5) drawTrend(bgPoints, '#94a3b8', 1.5, true);
  if (activePoints.length > 3) drawTrend(activePoints, '#22c55e', 2.2, false);

  // Legenda no Canvas
  ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Tendência Janela Ativa (${activePeriods[0]} ... ${activePeriods[activePeriods.length - 1]}): Verde (${activePoints.length} pts)`, padL + 10, padT + 15);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Tendência Histórica Geral: Tracejada Cinza (${bgPoints.length} pts)`, padL + 10, padT + 30);

  if (hasLegacyOnly) {
    ctx.fillStyle = '#eab308'; ctx.font = '11px sans-serif';
    ctx.fillText(`⚠ Dados antigos em 5W detetados: clique em "+ Importar / Recalcular ZIP do Strava" para habilitar 1W exato.`, padL + 10, h - padB - 8);
  }
}

window.updateDispersaoChart = function() {
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    processDispersaoData();
  }
};
