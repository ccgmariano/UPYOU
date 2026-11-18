// Aba Independente: Analisador de Telemetria Multi-Camadas (15s por Km) com Botões Passo a Passo (◀ / ▶) e Teclado

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
  { key: 'alt', label: '🏔️ Altimetria (m)', color: '#94a3b8' },
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

// Injeta os botões ◀ Anterior e Próxima ▶ ao lado do Slider sem precisar editar o index.html
function ensureTelStepButtons() {
  const slider = document.getElementById('telRideSlider');
  if (!slider || document.getElementById('telPrevBtn')) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; width: 100%;';

  const btnStyle = 'background: #1e293b; color: #facc15; border: 1px solid #475569; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer; white-space: nowrap; transition: 0.15s;';

  const prevBtn = document.createElement('button');
  prevBtn.id = 'telPrevBtn';
  prevBtn.innerHTML = '◀ Anterior';
  prevBtn.title = 'Pedalada Anterior (ou Seta Esquerda do teclado)';
  prevBtn.style.cssText = btnStyle;
  prevBtn.onclick = () => window.stepTelRide(-1);

  const nextBtn = document.createElement('button');
  nextBtn.id = 'telNextBtn';
  nextBtn.innerHTML = 'Próxima ▶';
  nextBtn.title = 'Próxima Pedalada (ou Seta Direita do teclado)';
  nextBtn.style.cssText = btnStyle;
  nextBtn.onclick = () => window.stepTelRide(1);

  slider.parentNode.insertBefore(wrapper, slider);
  wrapper.appendChild(prevBtn);
  wrapper.appendChild(slider);
  wrapper.appendChild(nextBtn);
}

window.stepTelRide = function(delta) {
  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;
  const nextIdx = Math.max(0, Math.min(dbActivities.length - 1, currentTelRideIndex + delta));
  if (nextIdx === currentTelRideIndex) return;
  currentTelRideIndex = nextIdx;
  const slider = document.getElementById('telRideSlider');
  if (slider) slider.value = currentTelRideIndex;
  renderTelemetriaChart();
};

function updateTelStepButtonsState() {
  const prevBtn = document.getElementById('telPrevBtn');
  const nextBtn = document.getElementById('telNextBtn');
  if (!prevBtn || !nextBtn || typeof dbActivities === 'undefined') return;

  const atStart = currentTelRideIndex <= 0;
  const atEnd = currentTelRideIndex >= dbActivities.length - 1;

  prevBtn.disabled = atStart;
  prevBtn.style.opacity = atStart ? '0.4' : '1';
  prevBtn.style.cursor = atStart ? 'not-allowed' : 'pointer';

  nextBtn.disabled = atEnd;
  nextBtn.style.opacity = atEnd ? '0.4' : '1';
  nextBtn.style.cursor = atEnd ? 'not-allowed' : 'pointer';
}

// Atalho de teclado (Setas Esquerda e Direita) quando a aba Telemetria estiver visível
if (!window._telKeyListenerAdded) {
  window._telKeyListenerAdded = true;
  window.addEventListener('keydown', (e) => {
    const tab = document.getElementById('telemetriaTab');
    if (!tab || tab.style.display === 'none') return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && document.activeElement?.id !== 'telRideSlider') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      window.stepTelRide(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      window.stepTelRide(1);
    }
  });
}

function getSanitizedStream(act) {
  if (!Array.isArray(act.telemetry15s) || act.telemetry15s.length < 2) return [];
  const raw = act.telemetry15s;

  let minAlt = Infinity, maxAlt = -Infinity, sumSpd = 0, sumPReal = 0;
  raw.forEach(p => {
    if (p.alt !== null && p.alt !== undefined) {
      if (p.alt < minAlt) minAlt = p.alt;
      if (p.alt > maxAlt) maxAlt = p.alt;
    }
    sumSpd += (p.spd || 0);
    sumPReal += (p.pReal || 0);
  });

  const avgSpd = sumSpd / raw.length;
  const avgPReal = sumPReal / raw.length;
  const altRange = isFinite(minAlt) ? (maxAlt - minAlt) : 0;

  const isIndoorDetected = Boolean(raw[0].indoor) || Boolean(act.estMetrics?.isIndoorTrainer) || (altRange <= 9 && avgSpd < 20.5 && avgPReal > 125);
  const altOffset = (isFinite(minAlt) && minAlt < 0) ? (-minAlt + 4) : 0;

  const clean = raw.map((pt, idx) => {
    let pEst = pt.pEst || 0;
    let wind = pt.wind || 0;
    let alt = (pt.alt !== null && pt.alt !== undefined) ? (pt.alt + altOffset) : null;

    if (isIndoorDetected) {
      wind = 0;
      pEst = pt.pReal > 0 ? pt.pReal : (pt.hr > 95 ? Math.round((pt.hr - 75) * 2.1) : pEst);
    } else {
      if (idx > 0 && idx < raw.length - 1) {
        const neighborAvg = ((raw[idx - 1].pEst || 0) + (raw[idx + 1].pEst || 0)) / 2;
        if (pEst > 360 && pEst > neighborAvg * 1.65) {
          pEst = Math.round(neighborAvg * 1.15);
        }
      }
      if (idx > 0 && idx < raw.length - 1) {
        wind = parseFloat((((raw[idx - 1].wind || 0) + wind * 2 + (raw[idx + 1].wind || 0)) / 4).toFixed(1));
      }
    }

    return { ...pt, alt, pEst, wind, indoor: isIndoorDetected };
  });

  return clean;
}

window.initTelemetriaTab = function() {
  loadSavedTelemetryLayers();
  renderTelemetryLayerButtons();
  ensureTelStepButtons();

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  const slider = document.getElementById('telRideSlider');
  if (slider) {
    slider.min = 0;
    slider.max = Math.max(0, dbActivities.length - 1);
    if (currentTelRideIndex < 0 || currentTelRideIndex >= dbActivities.length) {
      currentTelRideIndex = dbActivities.length - 1;
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
  ensureTelStepButtons();
  const canvas = document.getElementById('telemetriaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 920, h = 430;
  const padL = 55, padR = 58, padT = 28, padB = 42;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  if (currentTelRideIndex < 0 || currentTelRideIndex >= dbActivities.length) {
    currentTelRideIndex = dbActivities.length - 1;
  }

  updateTelStepButtonsState();

  const act = dbActivities[currentTelRideIndex];
  const stream = getSanitizedStream(act);
  const isIndoor = stream.length > 0 && stream[0].indoor;

  const labelEl = document.getElementById('telSliderLabel');
  if (labelEl) {
    const distTxt = (act.metrics && act.metrics.distKm) ? `${act.metrics.distKm} km` : '';
    const modeTag = isIndoor ? ' 🏠 [ROLO INDOOR DETECTADO]' : ' 🛣️ [ESTRADA]';
    labelEl.innerText = `[#${currentTelRideIndex + 1}/${dbActivities.length}] ${act.date} — ${act.name} (${distTxt})${modeTag}`;
  }

  updateTelemetryAuditCard(act, stream, isIndoor);

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
    const xKm = (km !== undefined && km > 0) ? km : (idx / Math.max(1, stream.length - 1)) * maxKm;
    return padL + (Math.min(maxKm, xKm) / maxKm) * drawW;
  };

  let maxPwr = 300;
  let minAlt = Infinity, maxAlt = -Infinity;
  let validAltPts = 0;

  stream.forEach(p => {
    if (p.pReal > maxPwr) maxPwr = p.pReal;
    if (p.pEst > maxPwr) maxPwr = p.pEst;
    if (p.alt !== null && p.alt !== undefined && !isNaN(p.alt)) {
      if (p.alt < minAlt) minAlt = p.alt;
      if (p.alt > maxAlt) maxAlt = p.alt;
      validAltPts++;
    }
  });

  maxPwr = Math.min(750, Math.ceil((maxPwr * 1.12) / 50) * 50);
  if (!isFinite(minAlt)) { minAlt = 0; maxAlt = 100; }
  const altDiff = Math.max(12, maxAlt - minAlt);

  const getYPwr = (pwr) => padT + drawH - (Math.max(0, Math.min(maxPwr, pwr)) / maxPwr) * drawH;
  const getYHr = (hr) => padT + drawH - ((Math.max(80, Math.min(205, hr)) - 80) / (205 - 80)) * drawH;
  const getYAlt = (alt) => padT + drawH - ((alt - minAlt) / altDiff) * (drawH * 0.62);
  const getYSpd = (spd) => padT + drawH - (Math.max(0, Math.min(60, spd)) / 60) * drawH;
  const getYWind = (wnd) => (padT + drawH * 0.5) - (Math.max(-30, Math.min(30, wnd)) / 60) * drawH;

  // Grade Horizontal
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

  // Grade Vertical em Km
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

  // 1. Camada de Altimetria Real Translúcida ao Fundo
  if (telActiveLayers.alt && !isIndoor && validAltPts > 3 && (maxAlt - minAlt) >= 4) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, padT + drawH * 0.35, 0, padT + drawH);
    grad.addColorStop(0, 'rgba(148, 163, 184, 0.45)');
    grad.addColorStop(1, 'rgba(30, 41, 59, 0.08)');

    ctx.beginPath();
    ctx.moveTo(getX(stream[0].km, 0), padT + drawH);
    stream.forEach((pt, idx) => {
      const a = (pt.alt !== null && pt.alt !== undefined) ? pt.alt : minAlt;
      ctx.lineTo(getX(pt.km, idx), getYAlt(a));
    });
    ctx.lineTo(getX(stream[stream.length - 1].km, stream.length - 1), padT + drawH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    stream.forEach((pt, idx) => {
      const a = (pt.alt !== null && pt.alt !== undefined) ? pt.alt : minAlt;
      const x = getX(pt.km, idx), y = getYAlt(a);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10.5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🏔️ Elevação: ${minAlt}m ➔ ${maxAlt}m (Δ ${maxAlt - minAlt}m)`, padL + 8, padT + 14);
    ctx.restore();
  }

  const drawMetricCurve = (getterY, color, lineWidth = 1.8, dashed = false) => {
    ctx.save();
    ctx.beginPath();
    if (dashed) ctx.setLineDash([4, 3]);
    let started = false;
    stream.forEach((pt, idx) => {
      const val = getterY(pt);
      if (val === null || isNaN(val)) return;
      const x = getX(pt.km, idx);
      if (!started) { ctx.moveTo(x, val); started = true; }
      else ctx.lineTo(x, val);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.restore();
  };

  // 2. Vento Frontal Relativo
  if (telActiveLayers.wind && !isIndoor) {
    drawMetricCurve(pt => pt.wind !== null ? getYWind(pt.wind) : null, '#a855f7', 1.5, true);
  }

  // 3. Velocidade Real 15s (km/h)
  if (telActiveLayers.spd) {
    drawMetricCurve(pt => pt.spd !== null ? getYSpd(pt.spd) : null, '#38bdf8', 1.6, false);
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

function updateTelemetryAuditCard(act, stream, isIndoor) {
  const box = document.getElementById('telAuditCard');
  if (!box) return;

  const rm = act.realMetrics;
  const em = act.estMetrics || act.metrics;
  const hasReal = rm && rm.avgPwr > 15;

  if (isIndoor) {
    const pwrVal = rm ? rm.avgPwr : (em?.avgPwr || 0);
    const npVal = rm ? rm.np : (em?.np || 0);
    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <span>🏠 <strong>Treino em Rolo (Indoor) Detectado:</strong> Altimetria e vento de rua desativados automaticamente (GPS estacionário).</span>
        <span>⚡ <strong>Potência:</strong> <strong style="color:#22c55e;">${pwrVal} W</strong> (NP: ${npVal} W) | ❤️ <strong>FC Média:</strong> ${(rm || em)?.avgHr || 0} bpm</span>
      </div>
    `;
    return;
  }

  if (!hasReal) {
    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <span>📡 <strong>Atividade Sem Sensor de Potência Real:</strong> Reconstruída 100% pelo Motor Físico + Vento ERA5.</span>
        <span>🔮 <strong>Potência Estimada:</strong> <strong style="color:#eab308;">${em?.avgPwr || 0} W</strong> (NP: ${em?.np || 0} W) | ❤️ <strong>FC Média:</strong> ${em?.avgHr || 0} bpm</span>
      </div>
    `;
    return;
  }

  let sumReal = 0, sumEst = 0, movCnt = 0;
  let sumAbsErr = 0;
  let climbDiffSum = 0, climbCnt = 0;
  let flatDiffSum = 0, flatCnt = 0;

  if (Array.isArray(stream) && stream.length > 0) {
    stream.forEach(pt => {
      if (pt.pReal > 20 || pt.pEst > 20) {
        sumReal += pt.pReal;
        sumEst += pt.pEst;
        movCnt++;
        sumAbsErr += Math.abs(pt.pEst - pt.pReal);
        if (pt.grade >= 2.5) {
          climbDiffSum += (pt.pEst - pt.pReal);
          climbCnt++;
        } else if (Math.abs(pt.grade) <= 1.5) {
          flatDiffSum += (pt.pEst - pt.pReal);
          flatCnt++;
        }
      }
    });
  }

  const realAvg = rm.avgPwr || (movCnt > 0 ? Math.round(sumReal / movCnt) : 0);
  const estAvg = movCnt > 0 ? Math.round(sumEst / movCnt) : (em?.avgPwr || 0);
  const diffW = estAvg - realAvg;
  const diffPct = realAvg > 0 ? ((diffW / realAvg) * 100).toFixed(1) : '0.0';

  const mae = movCnt > 0 ? Math.round(sumAbsErr / movCnt) : Math.abs(diffW);
  const climbBias = climbCnt > 0 ? `${climbDiffSum >= 0 ? '+' : ''}${Math.round(climbDiffSum / climbCnt)}W` : 's/ rampa';
  const flatBias = flatCnt > 0 ? `${flatDiffSum >= 0 ? '+' : ''}${Math.round(flatDiffSum / flatCnt)}W` : `${diffW >= 0 ? '+' : ''}${diffW}W`;
  const biasColor = Math.abs(diffW) <= 12 ? '#22c55e' : (Math.abs(diffW) <= 25 ? '#eab308' : '#f87171');

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        ⚡ <strong>Real (Sensor):</strong> <span style="color:#22c55e; font-weight:bold;">${realAvg} W</span> (NP ${rm.np}W) &nbsp;|&nbsp;
        🔮 <strong>Simulada (Motor):</strong> <span style="color:#eab308; font-weight:bold;">${estAvg} W</span>
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
