// Módulo de Evolução Histórica Iso-Potência (Conceito 1: FC estimada por Regressão Linear em 3 Potências Fixas + Volume ao fundo)

window.initIsoPotenciaTab = function() {
  renderIsoPotenciaChart();
};

window.renderIsoPotenciaChart = function() {
  const canvas = document.getElementById('isoPotenciaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 420;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Nenhuma atividade carregada.', w / 2, h / 2);
    return;
  }

  const agrupamento = document.getElementById('isoAgrupamento')?.value || 'trimestre';
  const janelaSecs = parseInt(document.getElementById('isoJanelaPonto')?.value || '15', 10);

  const p1 = parseInt(document.getElementById('isoPwr1')?.value || '140', 10);
  const p2 = parseInt(document.getElementById('isoPwr2')?.value || '200', 10);
  const p3 = parseInt(document.getElementById('isoPwr3')?.value || '240', 10);

  // Agrupa pontos e horas em movimento por período
  const periodData = {};

  dbActivities.forEach(act => {
    if (!act.dateObj || !act.metrics) return;
    const pKey = getPeriodKey(act.dateObj, agrupamento);
    if (!periodData[pKey]) {
      periodData[pKey] = { pts: [], movingSecs: 0 };
    }
    periodData[pKey].movingSecs += (act.metrics.movingSecs || act.metrics.totalSecs || 0);

    if (act.metrics.dispWindows && act.metrics.dispWindows[janelaSecs]) {
      const wPts = act.metrics.dispWindows[janelaSecs];
      for (let i = 0; i < wPts.length; i++) {
        const px = wPts[i][0], py = wPts[i][1];
        if (px >= 50 && px <= 360 && py >= 60 && py <= 220) {
          periodData[pKey].pts.push({ x: px, y: py });
        }
      }
    }
  });

  const sortedKeys = Object.keys(periodData).sort();
  const series = [];

  sortedKeys.forEach(k => {
    const d = periodData[k];
    const pts = d.pts;
    // Exige amostra mínima no período para calcular regressão confiável
    if (pts.length >= 8) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = pts.length;
      for (let i = 0; i < n; i++) {
        sumX += pts[i].x; sumY += pts[i].y;
        sumXY += (pts[i].x * pts[i].y); sumXX += (pts[i].x * pts[i].x);
      }
      const denom = (n * sumXX - sumX * sumX);
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        // Filtra regressões válidas (inclinação positiva fisiológica)
        if (slope > 0.03 && slope < 0.85) {
          const clampHr = (val) => Math.max(85, Math.min(205, val));
          series.push({
            key: k,
            hours: +(d.movingSecs / 3600).toFixed(1),
            ptsCount: n,
            hr1: clampHr(slope * p1 + intercept),
            hr2: clampHr(slope * p2 + intercept),
            hr3: clampHr(slope * p3 + intercept)
          });
        }
      }
    }
  });

  if (series.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Dados insuficientes para traçar a evolução com os parâmetros selecionados.', w / 2, h / 2);
    return;
  }

  // Margens e escalas dinâmicas de BPM
  const padL = 52, padR = 48, padT = 25, padB = 45;
  const drawW = w - padL - padR, drawH = h - padT - padB;

  let minHr = 200, maxHr = 100, maxHours = 1;
  series.forEach(s => {
    minHr = Math.min(minHr, s.hr1, s.hr2, s.hr3);
    maxHr = Math.max(maxHr, s.hr1, s.hr2, s.hr3);
    if (s.hours > maxHours) maxHours = s.hours;
  });

  minHr = Math.max(85, Math.floor((minHr - 6) / 10) * 10);
  maxHr = Math.min(205, Math.ceil((maxHr + 6) / 10) * 10);
  if (maxHr - minHr < 30) maxHr = minHr + 30;

  const getX = (idx) => {
    if (series.length === 1) return padL + drawW / 2;
    return padL + (idx / (series.length - 1)) * drawW;
  };
  const getY = (hr) => padT + drawH - ((hr - minHr) / (maxHr - minHr)) * drawH;

  // 1. Grid Horizontal (BPM - Eixo Esquerdo)
  ctx.strokeStyle = '#1e293b'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  const stepHr = (maxHr - minHr) > 60 ? 15 : 10;
  for (let hr = minHr; hr <= maxHr; hr += stepHr) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 8, y + 3);
  }

  // Eixo Direito (Escala de Horas do Volume)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  for (let i = 0; i <= 4; i++) {
    const hVal = Math.round((maxHours / 4) * i);
    const y = padT + drawH - (i / 4) * (drawH * 0.82);
    ctx.fillText(`${hVal}h`, w - padR + 8, y + 3);
  }

  // 2. Barras Verticais de Volume ao Fundo (Azul Escuro Translucido estilo Conceito 1)
  const barW = Math.max(4, Math.min(34, (drawW / series.length) * 0.62));
  series.forEach((s, idx) => {
    const x = getX(idx);
    const barH = (s.hours / maxHours) * (drawH * 0.82);
    const y = padT + drawH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, padT + drawH);
    grad.addColorStop(0, 'rgba(30, 64, 175, 0.42)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.12)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
    ctx.lineWidth = 1;
    ctx.fillRect(x - barW / 2, y, barW, barH);
    ctx.strokeRect(x - barW / 2, y, barW, barH);
  });

  // 3. Rótulos do Eixo X (Períodos)
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const labelSkip = Math.max(1, Math.ceil(series.length / 12));
  series.forEach((s, idx) => {
    if (idx % labelSkip === 0 || idx === series.length - 1) {
      const x = getX(idx);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + drawH);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)'; ctx.stroke();
      ctx.fillText(s.key, x, h - padB + 18);
    }
  });

  // 4. Função para desenhar curvas suaves (Spline Catmull-Rom / Bezier) com efeito Glow (Conceito 1)
  function drawSmoothGlowCurve(keyProp, color, glowColor) {
    if (series.length === 0) return;
    const pts = series.map((s, idx) => ({ x: getX(idx), y: getY(s[keyProp]), val: Math.round(s[keyProp]) }));

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, drawW, drawH);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else if (pts.length > 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? i : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }

    // Camada de brilho (Glow)
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Linha principal
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.restore();

    // Pequenos pontos nos vértices e valor no último período
    pts.forEach((pt, idx) => {
      const isLast = (idx === pts.length - 1);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isLast ? 4 : 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      if (isLast) {
        ctx.fillStyle = color;
        ctx.font = 'bold 10.5px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${pt.val}`, pt.x + 7, pt.y + 3);
      }
    });
  }

  // Desenha as 3 curvas: Verde (P1), Ciano (P2) e Amarela (P3)
  drawSmoothGlowCurve('hr1', '#22c55e', 'rgba(34, 197, 94, 0.22)');
  drawSmoothGlowCurve('hr2', '#06b6d4', 'rgba(6, 182, 212, 0.22)');
  drawSmoothGlowCurve('hr3', '#eab308', 'rgba(234, 179, 8, 0.22)');
};
