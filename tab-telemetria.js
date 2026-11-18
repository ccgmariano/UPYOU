// Aba Independente: Analisador de Telemetria Multi-Camadas (15s por Km) com Altimetria Translúcida e Slider Histórico

const TEL_LAYERS_STORAGE_KEY = 'upyou_telemetry_layers_v1';

let telActiveLayers = {
  alt: true,
  pReal: true,
  pEst: true,
  hr: true,
  spd: false,
  wind: false
};

let currentTelRideIndex = -1;

const LAYER_META = [
  { key: 'alt', label: '🏔️ Altimetria (m)', color: '#64748b' },
  { key: 'pReal', label: '⚡ Potência Real (W)', color: '#22c55e' },
  { key: 'pEst', label: '🔮 Potência Estimada (W)', color: '#eab308' },
  { key: 'hr', label: '❤️ Batimentos (bpm)', color: '#ef4444' },
  { key: 'spd', label: '🚀 Velocidade (km/h)', color: '#38bdf8' },
  { key: 'wind', label: '💨 Vento Frontal (km/h)', color: '#a855f7' }
];

function loadSavedTelemetryLayers() {
  try {
    const raw = localStorage.getItem(TEL_LAYERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(telActiveLayers, parsed);
    }
  } catch (e) {}
}

function saveTelemetryLayers() {
  try {
    localStorage.setItem(TEL_LAYERS_STORAGE_KEY, JSON.stringify(telActiveLayers));
  } catch (e) {}
}

function renderTelemetryLayerButtons() {
  const container = document.getElementById('telLayerButtons');
  if (!container) return;

  container.innerHTML = `<span style="font-size: 0.8rem; color: #94a3b8; font-weight: bold; margin-right: 4px; display: flex; align-items: center;">Camadas Ativas:</span>` +
    LAYER_META.map(l => {
      const active = Boolean(telActiveLayers[l.key]);
      const bg = active ? 'rgba(30, 41, 59, 0.95)' : '#020617';
      const border = active ? l.color : '#334155';
      const textCol = active ? '#f8fafc' : '#64748b';
      const glow = active ? `0 0 8px ${l.color}55` : 'none';
      return `
        <button onclick="toggleTelemetryLayer('${l.key}')" style="background: ${bg}; color: ${textCol}; border: 1.5px solid ${border}; box-shadow: ${glow}; padding: 5px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.15s;">
          <span style="width: 9px; height: 9px; border-radius: 50%; background: ${active ? l.color : '#475569'}; display: inline-block;"></span>
          ${l.label}
        </button>
      `;
    }).join('');
}

window.toggleTelemetryLayer = function(key) {
  telActiveLayers[key] = !telActiveLayers[key];
  saveTelemetryLayers();
  renderTelemetryLayerButtons();
  renderTelemetriaChart();
};

// Reconstrói uma série sintética de 15s por km para atividades que foram salvas antes da Fase 4
function buildFallbackTelemetry15s(act) {
  const rm = act.realMetrics;
  const em = act.estMetrics || act.metrics;
  const baseM = rm || em || act.metrics;
  if (!baseM) return [];

  const totalDistKm = Math.max(1, parseFloat(baseM.distKm) || 25);
  const realWin = (rm && rm.dispWindows && rm.dispWindows[15] && rm.dispWindows[15].length > 0) ? rm.dispWindows[15] : [];
  const estWin = (em && em.dispWindows && em.dispWindows[15] && em.dispWindows[15].length > 0) ? em.dispWindows[15] : [];
  const count = Math.max(realWin.length, estWin.length, 30);

  const pts = [];
  for (let i = 0; i < count; i++) {
    const progress = i / Math.max(1, count - 1);
    const km = parseFloat((progress * totalDistKm).toFixed(2));
    const pReal = realWin[i] ? realWin[i][0] : (rm ? rm.avgPwr : 0);
    const pEst = estWin[i] ? estWin[i][0] : (em ? em.avgPwr : 0);
    const hr = realWin[i] ? realWin[i][1] : (estWin[i] ? estWin[i][1] : (baseM.avgHr || 0));
    const spd = parseFloat(baseM.avgSpeed) || 26;
    // Perfil altimétrico ilustrativo proporcional à diferença de potência quando a atividade antiga não possui stream bruto
    const synthAlt = Math.max(5, Math.round(35 + 25 * Math.sin(progress * Math.PI * 3) + (pEst - (em?.avgPwr || 150)) * 0.12));

    pts.push({
      km,
      sec: i * 15,
      alt: synthAlt,
      pReal,
      pEst,
      hr,
      spd,
      wind: 0,
      grade: 0,
      isFallback: true
    });
  }
  return pts;
}

window.initTelemetriaTab = function() {
  loadSavedTelemetryLayers();
  renderTelemetryLayerButtons();

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  const slider = document.getElementById('telRideSlider');
  if (slider) {
    slider.min = 0;
    slider.max = Math.max(0, dbActivities.length - 1);
    if (currentTelRideIndex < 0 || currentTelRideIndex >= dbActivities.length) {
      currentTelRideIndex = dbActivities.length - 1; // Abre na última pedalada (extrema direita)
    }
    slider.value = currentTelRideIndex;
  }

  renderTelemetriaChart();
};

window.onTelSliderInput = function(val) {
  currentTelRideIndex = parseInt(val, 10) || 0;
  renderTelemetriaChart();
};

window.renderTelemetriaChart = function() {
  const canvas = document.getElementById('telemetriaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 920, h = 430;
  const padL = 52, padR = 52, padT = 28, padB = 42;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  if (currentTelRideIndex < 0 || currentTelRideIndex >= dbActivities.length) {
    currentTelRideIndex = dbActivities.length - 1;
  }

  const act = dbActivities[currentTelRideIndex];
  const stream = (Array.isArray(act.telemetry15s) && act.telemetry15s.length > 1)
    ? act.telemetry15s
    : buildFallbackTelemetry15s(act);

  const labelEl = document.getElementById('telSliderLabel');
  if (labelEl) {
    const distTxt = (act.metrics && act.metrics.distKm) ? `${act.metrics.distKm} km` : '';
    labelEl.innerText = `[#${currentTelRideIndex + 1}/${dbActivities.length}] ${act.date} — ${act.name} (${distTxt})`;
  }

  updateTelemetryAuditCard(act, stream);

  if (!stream || stream.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Telemetria insuficiente para esta atividade.', w / 2, h / 2);
    return;
  }

  const drawW = w - padL - padR;
  const drawH = h - padT - padB;

  const maxKm = Math.max(0.5, stream[stream.length - 1].km || parseFloat(act.metrics?.distKm) || 10);
  const getX = (km, idx) => {
    const xKm = km > 0 ? km : (idx / Math.max(1, stream.length - 1)) * maxKm;
    return padL + (Math.min(maxKm, xKm) / maxKm) * drawW;
  };

  // Escalas Verticais Independentes
  let maxPwr = 320;
  let minAlt = Infinity, maxAlt = -Infinity;
  stream.forEach(p => {
    if (p.pReal > maxPwr) maxPwr = p.pReal;
    if (p.pEst > maxPwr) maxPwr = p.pEst;
    if (p.alt < minAlt) minAlt = p.alt;
    if (p.alt > maxAlt) maxAlt = p.alt;
  });
  maxPwr = Math.min(900, Math.ceil((maxPwr * 1.1) / 50) * 50);
  if (!isFinite(minAlt)) { minAlt = 0; maxAlt = 100; }
  const altSpan = Math.max(30, (maxAlt - minAlt) * 1.35);

  const getYPwr = (pwr) => padT + drawH - (Math.max(0, Math.min(maxPwr, pwr)) / maxPwr) * drawH;
  const getYHr = (hr) => padT + drawH - ((Math.max(80, Math.min(205, hr)) - 80) / (205 - 80)) * drawH;
  const getYAlt = (alt) => padT + drawH - ((alt - minAlt) / altSpan) * (drawH * 0.72);
  const getYSpd = (spd) => padT + drawH - (Math.max(0, Math.min(70, spd)) / 70) * drawH;
  const getYWind = (wnd) => (padT + drawH * 0.5) - (Math.max(-35, Math.min(35, wnd)) / 70) * drawH;

  // Grade Horizontal e Eixos (Esquerda = Watts, Direita = BPM / Alt)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';

  for (let i = 0; i <= 5; i++) {
    const frac = i / 5;
    const y = padT + drawH - frac * drawH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();

    const wVal = Math.round(frac * maxPwr);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`${wVal}W`, padL - 6, y + 3);

    const hrVal = Math.round(80 + frac * (205 - 80));
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'left';
    ctx.fillText(`${hrVal} bpm`, w - padR + 6, y + 3);
  }

  // Grade e Rótulos do Eixo X em Km
  const kmStep = maxKm <= 15 ? 2 : (maxKm <= 40 ? 5 : (maxKm <= 90 ? 10 : 20));
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  for (let k = 0; k <= maxKm; k += kmStep) {
    const x = padL + (k / maxKm) * drawW;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + drawH);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.stroke();
    ctx.fillText(`${k} km`, x, padT + drawH + 18);
  }

  // 1. Camada de Altimetria Translúcida ao Fundo (Silhueta de Montanha estilo Garmin/WKO)
  if (telActiveLayers.alt) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + drawH);
    grad.addColorStop(0, 'rgba(148, 163, 184, 0.36)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');

    ctx.beginPath();
    ctx.moveTo(getX(stream[0].km, 0), padT + drawH);
    stream.forEach((pt, idx) => {
      ctx.lineTo(getX(pt.km, idx), getYAlt(pt.alt));
    });
    ctx.lineTo(getX(stream[stream.length - 1].km, stream.length - 1), padT + drawH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    stream.forEach((pt, idx) => {
      const x = getX(pt.km, idx), y = getYAlt(pt.alt);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Função auxiliar para desenhar linhas com efeito Neon suave
  const drawMetricCurve = (getterY, color, lineWidth = 1.8, dashed = false) => {
    ctx.save();
    ctx.beginPath();
    if (dashed) ctx.setLineDash([4, 3]);
    let started = false;
    stream.forEach((pt, idx) => {
      const val = getterY(pt);
      if (val === null) return;
      const x = getX(pt.km, idx);
      if (!started) { ctx.moveTo(x, val); started = true; }
      else ctx.lineTo(x, val);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();
  };

  // 2. Vento Frontal Relativo
  if (telActiveLayers.wind) {
    drawMetricCurve(pt => getYWind(pt.wind || 0), '#a855f7', 1.4, true);
  }

  // 3. Velocidade (km/h)
  if (telActiveLayers.spd) {
    drawMetricCurve(pt => getYSpd(pt.spd || 0), '#38bdf8', 1.5, false);
  }

  // 4. Batimentos Cardíacos (BPM)
  if (telActiveLayers.hr) {
    drawMetricCurve(pt => pt.hr > 40 ? getYHr(pt.hr) : null, '#ef4444', 1.6, false);
  }

  // 5. Potência Real (Sensor)
  if (telActiveLayers.pReal && act.realMetrics && act.realMetrics.avgPwr > 15) {
    drawMetricCurve(pt => getYPwr(pt.pReal || 0), '#22c55e', 2.0, false);
  }

  // 6. Potência Estimada (Motor Físico + Vento ERA5)
  if (telActiveLayers.pEst) {
    drawMetricCurve(pt => getYPwr(pt.pEst || 0), '#eab308', 2.0, false);
  }
};

function updateTelemetryAuditCard(act, stream) {
  const box = document.getElementById('telAuditCard');
  if (!box) return;

  const rm = act.realMetrics;
  const em = act.estMetrics || act.metrics;
  const hasReal = rm && rm.avgPwr > 15;

  if (!hasReal) {
    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <span>📡 <strong>Atividade Sem Sensor de Potência Real:</strong> Reconstruída 100% pelo Motor Físico + Vento ERA5.</span>
        <span>🔮 <strong>Potência Estimada:</strong> <strong style="color:#eab308;">${em?.avgPwr || 0} W</strong> (NP: ${em?.np || 0} W) | ❤️ <strong>FC Média:</strong> ${em?.avgHr || 0} bpm</span>
      </div>
    `;
    return;
  }

  const realAvg = rm.avgPwr || 0;
  const estAvg = em?.avgPwr || 0;
  const diffW = estAvg - realAvg;
  const diffPct = realAvg > 0 ? ((diffW / realAvg) * 100).toFixed(1) : '0.0';

  // Cálculo de Erro Absoluto Médio (MAE) e separação Plano vs Subida nos blocos de 15s em movimento
  let sumAbsErr = 0, validCnt = 0;
  let climbDiffSum = 0, climbCnt = 0;
  let flatDiffSum = 0, flatCnt = 0;

  if (Array.isArray(stream)) {
    stream.forEach(pt => {
      if (pt.pReal > 30 || pt.pEst > 30) {
        sumAbsErr += Math.abs(pt.pEst - pt.pReal);
        validCnt++;
        if (pt.grade >= 3.0) {
          climbDiffSum += (pt.pEst - pt.pReal);
          climbCnt++;
        } else if (Math.abs(pt.grade) <= 1.5) {
          flatDiffSum += (pt.pEst - pt.pReal);
          flatCnt++;
        }
      }
    });
  }

  const mae = validCnt > 0 ? Math.round(sumAbsErr / validCnt) : Math.abs(diffW);
  const climbBias = climbCnt > 0 ? `${climbDiffSum >= 0 ? '+' : ''}${Math.round(climbDiffSum / climbCnt)}W` : 's/ rampa';
  const flatBias = flatCnt > 0 ? `${flatDiffSum >= 0 ? '+' : ''}${Math.round(flatDiffSum / flatCnt)}W` : `${diffW >= 0 ? '+' : ''}${diffW}W`;
  const biasColor = Math.abs(diffW) <= 12 ? '#22c55e' : (Math.abs(diffW) <= 25 ? '#eab308' : '#f87171');

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        ⚡ <strong>Real (Sensor):</strong> <span style="color:#22c55e; font-weight:bold;">${realAvg} W</span> (NP ${rm.np}W) &nbsp;|&nbsp;
        🔮 <strong>Simulada (Motor):</strong> <span style="color:#eab308; font-weight:bold;">${estAvg} W</span> (NP ${em?.np || 0}W)
      </div>
      <div>
        📏 <strong>Divergência Média (Bias):</strong> <span style="color:${biasColor}; font-weight:bold;">${diffW >= 0 ? '+' : ''}${diffW} W (${diffW >= 0 ? '+' : ''}${diffPct}%)</span> &nbsp;|&nbsp;
        🎯 <strong>Erro Absoluto (15s):</strong> ±${mae} W &nbsp;|&nbsp;
        🏔️ <strong>Subidas:</strong> ${climbBias} &nbsp;|&nbsp;
        🛣️ <strong>Planos:</strong> ${flatBias}
      </div>
    </div>
  `;
}
