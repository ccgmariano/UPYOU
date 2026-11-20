// Aba: Telemetria Multi-Camadas Matrix Neon Precision (Seleção Interativa, Eixo Tempo+Km, Cards Dinâmicos)

const TEL_LAYERS_STORAGE_KEY = 'upyou_telemetry_layers_v2';

let telActiveLayers = {
  alt: true,
  pReal: true,
  pEst: true,
  hr: true,
  cad: false,
  spd: false,
  wind: false
};

let currentTelRideIndex = -1;
let telSelection = { startIdx: null, endIdx: null };
let telDragState = { mode: null, anchorIdx: null };
let telRenderMeta = null;

const LAYER_META = [
  { key: 'alt', label: 'Altimetria (m)', color: '#94a3b8' },
  { key: 'pReal', label: 'Potência Real (W)', color: '#10b981' },
  { key: 'pEst', label: 'Potência Simulada (W)', color: '#eab308' },
  { key: 'hr', label: 'Batimentos (bpm)', color: '#ef4444' },
  { key: 'cad', label: 'Cadência (rpm)', color: '#06b6d4' },
  { key: 'spd', label: 'Velocidade (km/h)', color: '#38bdf8' },
  { key: 'wind', label: 'Vento Frontal (km/h)', color: '#a855f7' }
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

function formatDurationShort(totalSecs) {
  const s = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return sec > 0 ? `${m}m${String(sec).padStart(2, '0')}s` : `${m}m`;
  return `${sec}s`;
}

function formatAxisTime(totalSecs) {
  const s = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m`;
}

function clearTelSelection() {
  telSelection = { startIdx: null, endIdx: null };
  telDragState = { mode: null, anchorIdx: null };
}

window.clearTelemetrySelection = function() {
  clearTelSelection();
  renderTelemetriaChart();
};

function renderTelemetryLayerButtons() {
  const container = document.getElementById('telLayerButtons');
  if (!container) return;

  container.innerHTML = `<span class="pill-label">CAMADAS:</span>` +
    LAYER_META.map(l => {
      const active = Boolean(telActiveLayers[l.key]);
      const bg = active ? 'rgba(21, 29, 46, 0.95)' : '#05070b';
      const border = active ? l.color : 'rgba(255,255,255,0.1)';
      const textCol = active ? '#f1f5f9' : '#64748b';
      const glow = active ? `0 0 10px ${l.color}44` : 'none';
      return `
        <button onclick="toggleTelemetryLayer('${l.key}')" style="background: ${bg}; color: ${textCol}; border: 1px solid ${border}; box-shadow: ${glow}; padding: 5px 11px; border-radius: 20px; font-size: 0.74rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.15s;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${active ? l.color : '#475569'}; display: inline-block;"></span>
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

function ensureTelStepButtons() {
  const slider = document.getElementById('telRideSlider');
  if (!slider || document.getElementById('telPrevBtn')) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; width: 100%;';

  const btnStyle = 'background: #0f1522; color: #34d399; border: 1px solid rgba(16,185,129,0.35); padding: 6px 14px; border-radius: 6px; font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 0.76rem; cursor: pointer; white-space: nowrap; transition: 0.15s;';

  const prevBtn = document.createElement('button');
  prevBtn.id = 'telPrevBtn';
  prevBtn.innerHTML = '&larr; Anterior';
  prevBtn.style.cssText = btnStyle;
  prevBtn.onclick = () => window.stepTelRide(-1);

  const nextBtn = document.createElement('button');
  nextBtn.id = 'telNextBtn';
  nextBtn.innerHTML = 'Próxima &rarr;';
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
  clearTelSelection();
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
  prevBtn.style.opacity = atStart ? '0.35' : '1';
  nextBtn.disabled = atEnd;
  nextBtn.style.opacity = atEnd ? '0.35' : '1';
}

if (!window._telKeyListenerAdded) {
  window._telKeyListenerAdded = true;
  window.addEventListener('keydown', (e) => {
    const tab = document.getElementById('telemetriaTab');
    if (!tab || tab.style.display === 'none') return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && document.activeElement?.id !== 'telRideSlider') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); window.stepTelRide(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); window.stepTelRide(1); }
    else if (e.key === 'Escape' && telSelection.startIdx !== null) { window.clearTelemetrySelection(); }
  });
}

function findNearestStreamIdx(mouseX) {
  if (!telRenderMeta || !telRenderMeta.xPositions || telRenderMeta.xPositions.length === 0) return 0;
  const xs = telRenderMeta.xPositions;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - mouseX);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function getCanvasMousePos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function attachTelemetryCanvasInteractions(canvas) {
  if (!canvas || canvas._telSelectionBound) return;
  canvas._telSelectionBound = true;

  canvas.addEventListener('mousedown', (e) => {
    if (!telRenderMeta || !telRenderMeta.stream || telRenderMeta.stream.length < 2) return;
    const { x, y } = getCanvasMousePos(canvas, e);
    const { padL, padT, drawW, drawH, xPositions } = telRenderMeta;
    if (x < padL || x > padL + drawW || y < padT || y > padT + drawH) return;

    // Verifica se clicou nas bordas da seleção atual para redimensionar
    if (telSelection.startIdx !== null && telSelection.endIdx !== null) {
      const x1 = xPositions[telSelection.startIdx];
      const x2 = xPositions[telSelection.endIdx];
      if (Math.abs(x - x1) <= 9) {
        telDragState = { mode: 'resize-left', anchorIdx: telSelection.endIdx };
        return;
      }
      if (Math.abs(x - x2) <= 9) {
        telDragState = { mode: 'resize-right', anchorIdx: telSelection.startIdx };
        return;
      }
    }

    // Inicia nova seleção
    const idx = findNearestStreamIdx(x);
    telDragState = { mode: 'new', anchorIdx: idx };
    telSelection = { startIdx: idx, endIdx: idx };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!telRenderMeta || !telRenderMeta.stream || telRenderMeta.stream.length < 2) return;
    const { x, y } = getCanvasMousePos(canvas, e);
    const { padL, padT, drawW, drawH, xPositions } = telRenderMeta;

    if (!telDragState.mode) {
      if (x >= padL && x <= padL + drawW && y >= padT && y <= padT + drawH) {
        if (telSelection.startIdx !== null && telSelection.endIdx !== null) {
          const x1 = xPositions[telSelection.startIdx];
          const x2 = xPositions[telSelection.endIdx];
          if (Math.abs(x - x1) <= 9 || Math.abs(x - x2) <= 9) {
            canvas.style.cursor = 'ew-resize';
            return;
          }
        }
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'default';
      }
      return;
    }

    const clampedX = Math.max(padL, Math.min(padL + drawW, x));
    const idx = findNearestStreamIdx(clampedX);

    if (telDragState.mode === 'new' || telDragState.mode === 'resize-left' || telDragState.mode === 'resize-right') {
      const a = telDragState.anchorIdx;
      telSelection.startIdx = Math.min(a, idx);
      telSelection.endIdx = Math.max(a, idx);
      drawTelemetryFrame();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!telDragState.mode) return;
    const mode = telDragState.mode;
    telDragState = { mode: null, anchorIdx: null };

    // Clique simples sem arrastar limpa a seleção
    if (mode === 'new' && telSelection.startIdx === telSelection.endIdx) {
      clearTelSelection();
    }
    drawTelemetryFrame();
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

  return raw.map((pt, idx) => {
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
        wind = parseFloat((((raw[idx - 1].wind || 0) + wind * 2 + (raw[idx + 1].wind || 0)) / 4).toFixed(1));
      }
    }

    return { ...pt, alt, pEst, wind, cad: pt.cad || 0, indoor: isIndoorDetected };
  });
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
  clearTelSelection();
  renderTelemetriaChart();
};

window.renderTelemetriaChart = async function() {
  ensureTelStepButtons();
  const canvas = document.getElementById('telemetriaCanvas');
  if (!canvas) return;
  attachTelemetryCanvasInteractions(canvas);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  if (currentTelRideIndex < 0 || currentTelRideIndex >= dbActivities.length) {
    currentTelRideIndex = dbActivities.length - 1;
  }

  updateTelStepButtonsState();

  const act = dbActivities[currentTelRideIndex];

  if (!act.telemetry15s && typeof window.loadTelemetryForActivityOnDemand === 'function') {
    await window.loadTelemetryForActivityOnDemand(act);
  }

  const stream = getSanitizedStream(act);
  const isIndoor = stream.length > 0 && stream[0].indoor;

  const labelEl = document.getElementById('telSliderLabel');
  if (labelEl) {
    const distTxt = (act.metrics && act.metrics.distKm) ? `${act.metrics.distKm} km` : '';
    const modeTag = isIndoor ? ' [ROLO INDOOR]' : ' [ESTRADA]';
    labelEl.innerText = `[#${currentTelRideIndex + 1}/${dbActivities.length}] ${act.date} — ${act.name} (${distTxt})${modeTag}`;
  }

  // Atualiza layout da coluna lateral antes de medir largura do canvas
  updateTelemetryAuditAndNeonCards(act, stream, isIndoor);

  telRenderMeta = { act, stream, isIndoor };
  drawTelemetryFrame();
};

function drawTelemetryFrame() {
  if (!telRenderMeta) return;
  const { act, stream, isIndoor } = telRenderMeta;

  const canvas = document.getElementById('telemetriaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 860, h = 420;
  const padL = 56, padR = 64, padT = 28, padB = 50;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  updateTelemetryAuditAndNeonCards(act, stream, isIndoor);

  if (!stream || stream.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Telemetria detalhada não disponível para esta atividade.', w / 2, h / 2);
    return;
  }

  const drawW = w - padL - padR;
  const drawH = h - padT - padB;

  const maxKm = Math.max(0.5, stream[stream.length - 1].km || parseFloat(act.metrics?.distKm) || 10);
  const getX = (km, idx) => {
    const xKm = (km !== undefined && km > 0) ? km : (idx / Math.max(1, stream.length - 1)) * maxKm;
    return padL + (Math.min(maxKm, xKm) / maxKm) * drawW;
  };

  const xPositions = stream.map((pt, idx) => getX(pt.km, idx));
  telRenderMeta.padL = padL;
  telRenderMeta.padR = padR;
  telRenderMeta.padT = padT;
  telRenderMeta.padB = padB;
  telRenderMeta.drawW = drawW;
  telRenderMeta.drawH = drawH;
  telRenderMeta.maxKm = maxKm;
  telRenderMeta.xPositions = xPositions;

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
  const getYCad = (cad) => padT + drawH - (Math.max(0, Math.min(130, cad)) / 130) * drawH;
  const getYAlt = (alt) => padT + drawH - ((alt - minAlt) / altDiff) * (drawH * 0.62);
  const getYSpd = (spd) => padT + drawH - (Math.max(0, Math.min(60, spd)) / 60) * drawH;
  const getYWind = (wnd) => (padT + drawH * 0.5) - (Math.max(-30, Math.min(30, wnd)) / 60) * drawH;

  // Grade Horizontal
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.font = '10px "JetBrains Mono", monospace';

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
    ctx.fillText(`${wVal}W`, padL - 7, y + 3);

    ctx.textAlign = 'left';
    if (telActiveLayers.hr) {
      const hrVal = Math.round(80 + frac * (205 - 80));
      ctx.fillStyle = '#ef4444';
      ctx.fillText(`${hrVal}bpm`, w - padR + 7, y + 3);
    } else if (telActiveLayers.cad) {
      const cadVal = Math.round(frac * 130);
      ctx.fillStyle = '#06b6d4';
      ctx.fillText(`${cadVal}rpm`, w - padR + 7, y + 3);
    } else if (telActiveLayers.spd) {
      const spdVal = Math.round(frac * 60);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${spdVal}km/h`, w - padR + 7, y + 3);
    } else if (telActiveLayers.wind) {
      const wndVal = Math.round(-30 + frac * 60);
      ctx.fillStyle = '#a855f7';
      ctx.fillText(`${wndVal > 0 ? '+' : ''}${wndVal}km/h`, w - padR + 7, y + 3);
    }
  }

  // Eixo Horizontal: Distância (km) + Tempo Decorrido (min/h)
  const kmStep = maxKm <= 15 ? 2 : (maxKm <= 40 ? 5 : (maxKm <= 90 ? 10 : 20));
  ctx.textAlign = 'center';
  for (let k = 0; k <= maxKm; k += kmStep) {
    const x = padL + (k / maxKm) * drawW;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + drawH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${k} km`, x, padT + drawH + 16);

    // Tempo aproximado no ponto k
    const nearIdx = findNearestStreamIdx(x);
    const elapsedSecs = nearIdx * 15;
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(formatAxisTime(elapsedSecs), x, padT + drawH + 30);
  }

  // Altimetria
  if (telActiveLayers.alt && !isIndoor && validAltPts > 3 && (maxAlt - minAlt) >= 4) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, padT + drawH * 0.35, 0, padT + drawH);
    grad.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
    grad.addColorStop(1, 'rgba(10, 14, 23, 0.04)');

    ctx.beginPath();
    ctx.moveTo(xPositions[0], padT + drawH);
    stream.forEach((pt, idx) => {
      const a = (pt.alt !== null && pt.alt !== undefined) ? pt.alt : minAlt;
      ctx.lineTo(xPositions[idx], getYAlt(a));
    });
    ctx.lineTo(xPositions[stream.length - 1], padT + drawH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    stream.forEach((pt, idx) => {
      const a = (pt.alt !== null && pt.alt !== undefined) ? pt.alt : minAlt;
      const x = xPositions[idx], y = getYAlt(a);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ALT: ${Math.round(minAlt)}m -> ${Math.round(maxAlt)}m (+${Math.round(maxAlt - minAlt)}m)`, padL + 8, padT + 14);
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
      const x = xPositions[idx];
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

  if (telActiveLayers.wind && !isIndoor) {
    const yZeroWind = padT + drawH * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2, 4]);
    ctx.moveTo(padL, yZeroWind);
    ctx.lineTo(w - padR, yZeroWind);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
    ctx.stroke();
    ctx.fillStyle = '#a855f7';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('VENTO 0 km/h (+CONTRA / -FAVOR)', w - padR - 6, yZeroWind - 4);
    ctx.restore();

    drawMetricCurve(pt => pt.wind !== null ? getYWind(pt.wind) : null, '#a855f7', 1.6, true);
  }

  if (telActiveLayers.spd) {
    drawMetricCurve(pt => pt.spd !== null ? getYSpd(pt.spd) : null, '#38bdf8', 1.6, false);
  }

  if (telActiveLayers.cad) {
    drawMetricCurve(pt => pt.cad > 15 ? getYCad(pt.cad) : null, '#06b6d4', 1.7, false);
  }

  if (telActiveLayers.hr) {
    drawMetricCurve(pt => pt.hr > 40 ? getYHr(pt.hr) : null, '#ef4444', 1.6, false);
  }

  if (telActiveLayers.pReal && act.realMetrics && act.realMetrics.avgPwr > 15) {
    drawMetricCurve(pt => getYPwr(pt.pReal || 0), '#10b981', 2.0, false);
  }

  if (telActiveLayers.pEst) {
    drawMetricCurve(pt => getYPwr(pt.pEst || 0), '#eab308', 2.0, false);
  }

  // Sobreposição visual do trecho selecionado
  if (telSelection.startIdx !== null && telSelection.endIdx !== null && telSelection.endIdx > telSelection.startIdx) {
    const x1 = xPositions[telSelection.startIdx];
    const x2 = xPositions[telSelection.endIdx];
    const selW = Math.max(2, x2 - x1);

    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    ctx.fillRect(x1, padT, selW, drawH);

    // Bordas/Alças laterais
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, padT); ctx.lineTo(x1, padT + drawH);
    ctx.moveTo(x2, padT); ctx.lineTo(x2, padT + drawH);
    ctx.stroke();

    // Puxadores discretos no meio das bordas
    ctx.fillStyle = '#34d399';
    const midY = padT + drawH / 2;
    ctx.fillRect(x1 - 3, midY - 14, 6, 28);
    ctx.fillRect(x2 - 3, midY - 14, 6, 28);

    // Rótulo do trecho no topo da seleção
    const segSecs = (telSelection.endIdx - telSelection.startIdx) * 15;
    const km1 = (stream[telSelection.startIdx].km || 0).toFixed(1);
    const km2 = (stream[telSelection.endIdx].km || 0).toFixed(1);
    const tag = `${km1}–${km2} km (${formatDurationShort(segSecs)})`;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const tw = ctx.measureText(tag).width + 12;
    const tx = Math.max(padL + 2, Math.min(w - padR - tw - 2, x1 + selW / 2 - tw / 2));
    ctx.fillStyle = 'rgba(10, 14, 23, 0.92)';
    ctx.fillRect(tx, padT + 4, tw, 18);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, padT + 4, tw, 18);
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'center';
    ctx.fillText(tag, tx + tw / 2, padT + 16);
    ctx.restore();
  }
}

function updateTelemetryAuditAndNeonCards(act, stream, isIndoor) {
  const auditBox = document.getElementById('telAuditCard');
  const kpiCol = document.getElementById('telNeonSidebarCards');
  const gridEl = kpiCol ? kpiCol.closest('.telemetry-cockpit-grid') : null;

  const hasSelection = Array.isArray(stream) &&
    telSelection.startIdx !== null &&
    telSelection.endIdx !== null &&
    telSelection.endIdx > telSelection.startIdx &&
    telSelection.endIdx < stream.length;

  const slice = hasSelection
    ? stream.slice(telSelection.startIdx, telSelection.endIdx + 1)
    : (Array.isArray(stream) ? stream : []);

  const rm = act.realMetrics;
  const em = act.estMetrics || act.metrics;
  const m = rm || em || act.metrics || {};
  const hasReal = rm && rm.avgPwr > 15;

  let sumReal = 0, sumEst = 0, cntPwr = 0, sumPwr4 = 0, sumAbsErr = 0;
  let sumHr = 0, cntHr = 0, maxHrSeg = 0;
  let sumSpd = 0, cntSpd = 0, sumWind = 0, cntWind = 0;
  let sumCad = 0, cntCad = 0;
  let climbDiffSum = 0, climbCnt = 0, flatDiffSum = 0, flatCnt = 0;
  let altGain = 0, minAltSeg = Infinity, maxAltSeg = -Infinity;

  slice.forEach((pt, idx) => {
    if (pt.pReal > 20 || pt.pEst > 20) {
      sumReal += (pt.pReal || 0);
      sumEst += (pt.pEst || 0);
      const pRef = hasReal ? (pt.pReal || 0) : (pt.pEst || 0);
      sumPwr4 += Math.pow(pRef, 4);
      cntPwr++;
      sumAbsErr += Math.abs((pt.pEst || 0) - (pt.pReal || 0));
      if (pt.grade >= 2.5) { climbDiffSum += ((pt.pEst || 0) - (pt.pReal || 0)); climbCnt++; }
      else if (Math.abs(pt.grade) <= 1.5) { flatDiffSum += ((pt.pEst || 0) - (pt.pReal || 0)); flatCnt++; }
    }
    if (pt.hr > 40) {
      sumHr += pt.hr;
      cntHr++;
      if (pt.hr > maxHrSeg) maxHrSeg = pt.hr;
    }
    if (pt.spd !== null && pt.spd !== undefined && pt.spd > 0) { sumSpd += pt.spd; cntSpd++; }
    if (!isIndoor && pt.wind !== null && pt.wind !== undefined) { sumWind += pt.wind; cntWind++; }
    if (pt.cad > 20) { sumCad += pt.cad; cntCad++; }
    if (pt.alt !== null && pt.alt !== undefined) {
      if (pt.alt < minAltSeg) minAltSeg = pt.alt;
      if (pt.alt > maxAltSeg) maxAltSeg = pt.alt;
      if (idx > 0 && slice[idx - 1].alt !== null && slice[idx - 1].alt !== undefined) {
        const diff = pt.alt - slice[idx - 1].alt;
        if (diff > 0) altGain += diff;
      }
    }
  });

  const realAvg = hasSelection
    ? (cntPwr > 0 ? Math.round(sumReal / cntPwr) : 0)
    : (hasReal ? rm.avgPwr : 0);
  const estAvg = cntPwr > 0 ? Math.round(sumEst / cntPwr) : (em?.avgPwr || 0);
  const displayPwr = hasReal ? realAvg : estAvg;
  const displayNp = hasSelection
    ? (cntPwr > 0 ? Math.round(Math.pow(sumPwr4 / cntPwr, 0.25)) : displayPwr)
    : (hasReal ? (rm.np || realAvg) : (em?.np || estAvg));
  const displayHr = hasSelection
    ? (cntHr > 0 ? Math.round(sumHr / cntHr) : 0)
    : (m.avgHr || 0);
  const displaySpd = hasSelection
    ? (cntSpd > 0 ? (sumSpd / cntSpd).toFixed(1) : '0.0')
    : (m.avgSpeed || '0.0');
  const displayCad = cntCad > 0 ? Math.round(sumCad / cntCad) : (hasSelection ? 0 : (m.avgCad || 0));
  const avgWind = cntWind > 0 ? (sumWind / cntWind).toFixed(1) : '0.0';

  const segDist = hasSelection
    ? Math.max(0, (slice[slice.length - 1].km || 0) - (slice[0].km || 0)).toFixed(2)
    : (m.distKm || '0.00');
  const segSecs = hasSelection
    ? (telSelection.endIdx - telSelection.startIdx) * 15
    : (stream.length * 15);

  if (kpiCol) {
    const cards = [];

    if (hasSelection) {
      cards.push(`
        <div class="neon-kpi-card" style="border-left-color:#34d399; background:rgba(16,185,129,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="neon-kpi-label" style="color:#34d399;">TRECHO SELECIONADO</span>
            <button onclick="clearTelemetrySelection()" style="background:transparent; border:none; color:#94a3b8; font-size:0.7rem; cursor:pointer; font-weight:700;" title="Limpar seleção">✕</button>
          </div>
          <div class="neon-kpi-sub" style="color:#e2e8f0; font-weight:700; margin-top:2px;">${segDist} km &bull; ${formatDurationShort(segSecs)}</div>
        </div>
      `);
    }

    if (telActiveLayers.pReal || telActiveLayers.pEst) {
      cards.push(`
        <div class="neon-kpi-card green">
          <div class="neon-kpi-label">${hasReal && telActiveLayers.pReal ? 'POTÊNCIA REAL' : 'POTÊNCIA SIMULADA'}</div>
          <div class="neon-kpi-main neon-green">${displayPwr} <span>W</span></div>
          <div class="neon-kpi-sub">NP ${displayNp}W${hasReal && estAvg > 0 ? ` | Sim ${estAvg}W` : ''}</div>
        </div>
      `);
    }

    if (telActiveLayers.hr) {
      const hrSub = hasSelection
        ? `Máx: ${maxHrSeg > 0 ? maxHrSeg + ' bpm' : '--'}`
        : `VI: ${m.vi ? m.vi.toFixed(2) : '--'} | Drift: ${m.drift !== null && m.drift !== undefined ? m.drift.toFixed(1) + '%' : 'N/A'}`;
      cards.push(`
        <div class="neon-kpi-card red">
          <div class="neon-kpi-label">FREQ. CARDÍACA</div>
          <div class="neon-kpi-main neon-red">${displayHr} <span>bpm</span></div>
          <div class="neon-kpi-sub">${hrSub}</div>
        </div>
      `);
    }

    if (telActiveLayers.spd || telActiveLayers.wind) {
      cards.push(`
        <div class="neon-kpi-card cyan">
          <div class="neon-kpi-label">VELOCIDADE &amp; VENTO</div>
          <div class="neon-kpi-main neon-cyan">${displaySpd} <span>km/h</span></div>
          <div class="neon-kpi-sub">Vento: ${avgWind > 0 ? '+' : ''}${avgWind} km/h</div>
        </div>
      `);
    }

    if (telActiveLayers.cad) {
      cards.push(`
        <div class="neon-kpi-card yellow">
          <div class="neon-kpi-label">CADÊNCIA MÉDIA</div>
          <div class="neon-kpi-main neon-yellow">${displayCad > 0 ? displayCad : '--'} <span>rpm</span></div>
          <div class="neon-kpi-sub">Dist: ${segDist} km</div>
        </div>
      `);
    }

    if (telActiveLayers.alt && !isIndoor && isFinite(minAltSeg)) {
      cards.push(`
        <div class="neon-kpi-card" style="border-left-color:#94a3b8;">
          <div class="neon-kpi-label">ALTIMETRIA</div>
          <div class="neon-kpi-main" style="color:#e2e8f0;">+${Math.round(altGain)} <span>m</span></div>
          <div class="neon-kpi-sub">${Math.round(minAltSeg)}m &rarr; ${Math.round(maxAltSeg)}m</div>
        </div>
      `);
    }

    kpiCol.innerHTML = cards.join('');
    if (gridEl) {
      gridEl.classList.toggle('no-sidebar', cards.length === 0);
    }
  }

  if (!auditBox) return;

  if (isIndoor) {
    auditBox.innerHTML = `<span style="color:#34d399; font-weight:600;">&#127968; ROLO INDOOR DETECTADO:</span> Altimetria e vento desativados automaticamente (GPS estacionário).`;
    return;
  }

  if (!hasReal) {
    auditBox.innerHTML = `<span style="color:#eab308; font-weight:600;">&#128225; RECONSTRUÇÃO FÍSICA (ERA5):</span> Atividade sem sensor de potência real. Curva estimada pelo motor aerodinâmico.`;
    return;
  }

  const diffW = estAvg - realAvg;
  const diffPct = realAvg > 0 ? ((diffW / realAvg) * 100).toFixed(1) : '0.0';
  const mae = cntPwr > 0 ? Math.round(sumAbsErr / cntPwr) : Math.abs(diffW);
  const climbBias = climbCnt > 0 ? `${climbDiffSum >= 0 ? '+' : ''}${Math.round(climbDiffSum / climbCnt)}W` : 's/ rampa';
  const flatBias = flatCnt > 0 ? `${flatDiffSum >= 0 ? '+' : ''}${Math.round(flatDiffSum / flatCnt)}W` : `${diffW >= 0 ? '+' : ''}${diffW}W`;
  const biasColor = Math.abs(diffW) <= 12 ? '#10b981' : (Math.abs(diffW) <= 25 ? '#eab308' : '#ef4444');
  const scopeLabel = hasSelection ? '<strong style="color:#34d399;">[TRECHO]</strong> ' : '';

  auditBox.innerHTML = `
    <span class="mono">
      ${scopeLabel}<strong>BIAS:</strong> <span style="color:${biasColor}; font-weight:700;">${diffW >= 0 ? '+' : ''}${diffW}W (${diffW >= 0 ? '+' : ''}${diffPct}%)</span> &bull;
      <strong>MAE (15s):</strong> &plusmn;${mae}W &bull;
      <strong>SUBIDAS:</strong> ${climbBias} &bull;
      <strong>PLANOS:</strong> ${flatBias}
    </span>
  `;
}
