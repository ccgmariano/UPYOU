// Módulo de Dispersão Avançada: Cores de Alto Contraste e Legenda Interna no Canto Superior Esquerdo
let dispAllBlocks = [];
let dispUniquePeriods = [];
let dispCurrentSliderIndex = 0;

// Paleta de alto contraste para diferenciar claramente cada período
const DISTINCT_COLORS = [
  [56, 189, 248],   // Azul Claro (Sky)
  [249, 115, 22],   // Laranja Vivo
  [168, 85, 247],   // Roxo (Purple)
  [234, 179, 8],    // Amarelo Ouro
  [239, 68, 68],    // Vermelho Coral
  [236, 72, 153],   // Rosa / Magenta
  [20, 184, 166],   // Turquesa (Teal)
  [248, 250, 252],  // Branco Gelo
  [99, 102, 241],   // Índigo
  [217, 119, 6],    // Âmbar
  [14, 165, 233],   // Azul Oceano
  [244, 63, 94]     // Carmim
];

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

// Retorna cor de alto contraste; o período mais recente da janela é sempre Verde Limão (#22c55e)
function getDistinctPeriodColor(idx, total, alpha = 1) {
  if (idx === total - 1) {
    return `rgba(34, 197, 94, ${alpha})`; // Verde destaque para o último período da janela
  }
  const rgb = DISTINCT_COLORS[idx % DISTINCT_COLORS.length];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function renderDispersaoChart() {
  const canvas = document.getElementById('dispersaoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 420;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  // Limpa eventual container HTML externo se existir
  const legendBox = document.getElementById('dspLegendContainer');
  if (legendBox) legendBox.innerHTML = '';

  const qtdPeriodos = parseInt(document.getElementById('dspQtdPeriodos')?.value || '3', 10);
  
  if (dispUniquePeriods.length === 0 || dispAllBlocks.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhum ponto encontrado para este intervalo.', w / 2, h / 2);
    return;
  }

  const endIndex = Math.min(dispCurrentSliderIndex, dispUniquePeriods.length - 1);
  const startIndex = Math.max(0, endIndex - qtdPeriodos + 1);
  const activePeriods = dispUniquePeriods.slice(startIndex, endIndex + 1);

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

  // 1. Desenha os micro-pontos de cada período com cores contrastantes
  activePeriods.forEach((pKey, idx) => {
    const pts = periodGroups[pKey];
    const isLatest = (idx === activePeriods.length - 1);
    const ptAlpha = activePeriods.length > 8 ? 0.55 : 0.75;
    ctx.fillStyle = getDistinctPeriodColor(idx, activePeriods.length, isLatest ? 0.95 : ptAlpha);
    const sz = isLatest ? 2.2 : 1.8;
    const half = sz / 2;

    for (let i = 0; i < pts.length; i++) {
      ctx.fillRect(getX(pts[i].x) - half, getY(pts[i].y) - half, sz, sz);
    }
  });

  // 2. Desenha as linhas de tendência de cada período
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, drawW, drawH);
  ctx.clip();

  activePeriods.forEach((pKey, idx) => {
    const pts = periodGroups[pKey];
    const isLatest = (idx === activePeriods.length - 1);
    const lineColor = getDistinctPeriodColor(idx, activePeriods.length, isLatest ? 1 : 0.9);

    if (pts.length >= 2) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = pts.length;
      for (let i = 0; i < n; i++) {
        sumX += pts[i].x; sumY += pts[i].y;
        sumXY += (pts[i].x * pts[i].y); sumXX += (pts[i].x * pts[i].x);
      }
      const denom = (n * sumXX - sumX * sumX);
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        const x1 = minX, y1 = slope * x1 + intercept;
        const x2 = maxX, y2 = slope * x2 + intercept;

        ctx.beginPath();
        ctx.moveTo(getX(x1), getY(y1));
        ctx.lineTo(getX(x2), getY(y2));
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isLatest ? 2.8 : 1.8;
        if (!isLatest) {
          ctx.setLineDash([5, 3]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      }
    }
  });
  ctx.restore();

  // 3. Legenda Discreta no Canto Superior Esquerdo do Canvas (organizada em colunas se houver muitos períodos)
  const maxRowsPerCol = 8;
  const numCols = Math.ceil(activePeriods.length / maxRowsPerCol);
  const colWidth = 148;
  const rowHeight = 15;
  const rowsInBox = Math.min(activePeriods.length, maxRowsPerCol);
  const boxW = numCols * colWidth + 10;
  const boxH = rowsInBox * rowHeight + 10;

  // Fundo escuro translúcido discreto atrás da legenda para garantir leitura
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.fillRect(padL + 8, padT + 6, boxW, boxH);
  ctx.strokeRect(padL + 8, padT + 6, boxW, boxH);

  ctx.textAlign = 'left';
  activePeriods.forEach((pKey, idx) => {
    const ptsCount = periodGroups[pKey].length;
    const isLatest = (idx === activePeriods.length - 1);
    const solidColor = getDistinctPeriodColor(idx, activePeriods.length, 1);

    const col = Math.floor(idx / maxRowsPerCol);
    const row = idx % maxRowsPerCol;
    const lx = padL + 15 + col * colWidth;
    const ly = padT + 19 + row * rowHeight;

    // Traço colorido identificador
    ctx.strokeStyle = solidColor;
    ctx.lineWidth = isLatest ? 2.8 : 2;
    if (!isLatest) ctx.setLineDash([3, 2]); else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(lx, ly - 3);
    ctx.lineTo(lx + 16, ly - 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Texto do período + número de pontos
    ctx.fillStyle = isLatest ? '#f8fafc' : '#cbd5e1';
    ctx.font = isLatest ? 'bold 10.5px sans-serif' : '10.5px sans-serif';
    ctx.fillText(`${pKey} (${ptsCount} pts)`, lx + 21, ly);
  });
}

window.updateDispersaoChart = function() {
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    processDispersaoData();
  }
};
