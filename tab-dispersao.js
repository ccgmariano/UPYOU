// Novo Módulo: Dispersão Avançada (Watt vs. BPM) com Parametrizações e Slider Temporal
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
    if (!act.dateObj || !act.metrics || !act.metrics.movingSamples) return;
    const samples = act.metrics.movingSamples;
    if (samples.length === 0) return;

    // Varre as amostras gerando blocos estáveis com base na janela de tempo escolhida (ex: 1 min a 60 min)
    let windowSecs = 0;
    let sumPwr = 0, sumHr = 0, count = 0;
    let windowStartTimestamp = samples[0].timestamp;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sumPwr += s.power;
      sumHr += s.hr;
      count++;
      windowSecs += s.dt;

      if (windowSecs >= janelaSecs) {
        const avgP = Math.round(sumPwr / count);
        const avgH = Math.round(sumHr / count);
        if (avgP > 50 && avgH > 60 && avgH < 220) {
          const pKey = getPeriodKey(act.dateObj, agrupamento);
          dispAllBlocks.push({ x: avgP, y: avgH, periodKey: pKey, date: act.dateObj });
          periodMap.add(pKey);
        }
        // Reinicia janela
        windowSecs = 0; sumPwr = 0; sumHr = 0; count = 0;
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
    // Por defeito, posiciona no último período disponível
    dispCurrentSliderIndex = dispUniquePeriods.length - 1;
    slider.value = dispCurrentSliderIndex;
  }

  renderDispersaoChart();
}

function renderDispersaoChart() {
  const canvas = document.getElementById('dispersaoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 400; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);

  const qtdPeriodos = parseInt(document.getElementById('dspQtdPeriodos')?.value || '3', 10);
  
  if (dispUniquePeriods.length === 0 || dispAllBlocks.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhum bloco estável encontrado para os parâmetros selecionados.', w / 2, h / 2);
    return;
  }

  // Determina a janela de períodos ativos com base no slider (máquina do tempo)
  const endIndex = Math.min(dispCurrentSliderIndex, dispUniquePeriods.length - 1);
  const startIndex = Math.max(0, endIndex - qtdPeriodos + 1);
  const activePeriods = dispUniquePeriods.slice(startIndex, endIndex + 1);

  const sliderLabel = document.getElementById('dspSliderLabel');
  if (sliderLabel) {
    sliderLabel.innerText = `Janela Ativa: ${activePeriods[0]} até ${activePeriods[activePeriods.length - 1]} (${activePeriods.length} períodos)`;
  }

  // Limites dos eixos
  const minX = 80, maxX = 320;
  const minY = 105, maxY = 185;

  const padL = 50, padR = 20, padT = 20, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;

  const getX = (p) => padL + ((Math.min(Math.max(p, minX), maxX) - minX) / (maxX - minX)) * drawW;
  const getY = (hr) => padT + drawH - ((Math.min(Math.max(hr, minY), maxY) - minY) / (maxY - minY)) * drawH;

  // Grid e Eixos
  ctx.strokeStyle = '#334155'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let hr = minY; hr <= maxY; hr += 15) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 8, y + 3);
  }

  ctx.textAlign = 'center';
  for (let p = minX; p <= maxX; p += 40) {
    const x = getX(p);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
    ctx.fillText(`${p}W`, x, h - padB + 15);
  }

  // 1. Resto do Histórico (Fundo - cinza translúcido)
  dispAllBlocks.filter(pt => !activePeriods.includes(pt.periodKey)).forEach(pt => {
    ctx.beginPath(); ctx.arc(getX(pt.x), getY(pt.y), 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.12)';
    ctx.fill();
  });

  // 2. Janela Ativa (Destaque em tons de azul / verde)
  const activePoints = dispAllBlocks.filter(pt => activePeriods.includes(pt.periodKey));
  activePoints.forEach(pt => {
    ctx.beginPath(); ctx.arc(getX(pt.x), getY(pt.y), 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.fill();
  });

  // Função auxiliar para desenhar linha de tendência (Regressão Linear)
  function drawTrend(points, color, width, isDash) {
    if (points.length < 2) return;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = points.length;
    points.forEach(pt => {
      sumX += pt.x; sumY += pt.y;
      sumXY += (pt.x * pt.y); sumXX += (pt.x * pt.x);
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const x1 = minX, y1 = slope * x1 + intercept;
    const x2 = maxX, y2 = slope * x2 + intercept;

    ctx.beginPath();
    ctx.moveTo(getX(x1), getY(y1));
    ctx.lineTo(getX(x2), getY(y2));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (isDash) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Linha de tendência Histórica Geral (Tracejada)
  const bgPoints = dispAllBlocks.filter(pt => !activePeriods.includes(pt.periodKey));
  if (bgPoints.length > 5) drawTrend(bgPoints, '#94a3b8', 1.5, true);

  // Linha de tendência da Janela Ativa (Destaque Sólido Verde)
  if (activePoints.length > 3) drawTrend(activePoints, '#22c55e', 2.8, false);

  // Legenda no Canvas
  ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Tendência Janela Ativa (${activePeriods[0]} ... ${activePeriods[activePeriods.length - 1]}): Verde`, padL + 10, padT + 15);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Tendência Histórica Geral: Tracejada Cinza`, padL + 10, padT + 32);
};

window.updateDispersaoChart = function() {
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    renderDispersaoChart();
  }
};
