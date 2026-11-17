// Motor Físico, Biométrico e Extrator de Área Frontal por Visão Computacional (Fase 1)

window.userPowerConfig = {
  bikeType: 'road',       // 'road' ou 'mtb'
  totalWeightKg: 82.0,    // Massa total (Ciclista + Bike + Equipamento)
  heightCm: 175,          // Altura do ciclista em cm
  customFrontalArea: null,// Área frontal extraída por foto (m²) ou null para cálculo antropométrico padrão
  powerSource: 'hybrid',  // 'hybrid' | 'real' | 'simulated'
  frontalAreaM2: 0.41,
  cd: 0.88,
  cda: 0.361,
  crr: 0.0045
};

function getPowerStorageKey() {
  const uid = (typeof currentUserId !== 'undefined' && currentUserId) ? currentUserId : 'default';
  return `upyou_pwr_cfg_${uid}`;
}

// Cálculo Antropométrico Padrão de Área Frontal (A), CdA e Crr com base em Peso do Conjunto, Altura e Tipo de Bike
window.computeDefaultAeroParams = function(totalWeightKg, heightCm, bikeType) {
  const isMtb = bikeType === 'mtb';
  // Desconta o peso estimado da bike + acessórios para isolar a massa corporal na fórmula de DuBois
  const estBikeMass = isMtb ? 12.5 : 9.0;
  const riderMassKg = Math.max(42, totalWeightKg - estBikeMass);

  // Área de Superfície Corporal de DuBois (BSA em m²)
  const bsa = 0.007184 * Math.pow(riderMassKg, 0.425) * Math.pow(heightCm, 0.725);

  // Fator de projeção frontal do ciclista (Hoods/Drops em Road vs Posição mais ereta/guidão largo em MTB)
  const riderProjFactor = isMtb ? 0.222 : 0.184;
  // Área frontal exposta dos pneus/quadro/guidão
  const bikeFrontalM2 = isMtb ? 0.105 : 0.072;

  const defaultArea = parseFloat((bsa * riderProjFactor + bikeFrontalM2).toFixed(3));
  const cd = isMtb ? 1.04 : 0.88;
  const crr = isMtb ? 0.0075 : 0.0045;

  const activeArea = (window.userPowerConfig.customFrontalArea && window.userPowerConfig.customFrontalArea >= 0.22 && window.userPowerConfig.customFrontalArea <= 0.95)
    ? window.userPowerConfig.customFrontalArea
    : defaultArea;

  const cda = parseFloat((activeArea * cd).toFixed(3));

  return {
    defaultArea,
    activeArea,
    isCustomPhoto: Boolean(window.userPowerConfig.customFrontalArea),
    cd,
    cda,
    crr
  };
};

window.loadPowerEnginePreferences = function() {
  try {
    const raw = localStorage.getItem(getPowerStorageKey()) || localStorage.getItem('upyou_pwr_cfg_default');
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(window.userPowerConfig, parsed);
    }
  } catch (e) {}

  const bikeSel = document.getElementById('bikeTypeSelect');
  const weightInp = document.getElementById('totalWeightInput');
  const heightInp = document.getElementById('userHeightInput');
  const sourceSel = document.getElementById('powerSourceSelect');

  if (bikeSel) bikeSel.value = window.userPowerConfig.bikeType || 'road';
  if (weightInp) weightInp.value = window.userPowerConfig.totalWeightKg || 82;
  if (heightInp) heightInp.value = window.userPowerConfig.heightCm || 175;
  if (sourceSel) sourceSel.value = window.userPowerConfig.powerSource || 'hybrid';

  recalcPowerEngineState(false);
};

window.savePowerEnginePreferences = function() {
  try {
    const json = JSON.stringify(window.userPowerConfig);
    localStorage.setItem(getPowerStorageKey(), json);
    localStorage.setItem('upyou_pwr_cfg_default', json);
  } catch (e) {}
};

function recalcPowerEngineState(triggerCharts = true) {
  const cfg = window.userPowerConfig;
  const aero = window.computeDefaultAeroParams(cfg.totalWeightKg, cfg.heightCm, cfg.bikeType);

  cfg.frontalAreaM2 = aero.activeArea;
  cfg.cd = aero.cd;
  cfg.cda = aero.cda;
  cfg.crr = aero.crr;

  const badge = document.getElementById('headerAreaBadge');
  if (badge) {
    const originLabel = aero.isCustomPhoto ? 'Foto' : 'Padrão';
    badge.innerText = `${cfg.frontalAreaM2.toFixed(3)} m² | CdA ${cfg.cda.toFixed(3)} (${originLabel})`;
  }

  savePowerEnginePreferences();

  if (triggerCharts && typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    window.applyGlobalPowerSource();
    if (typeof processGlobalMetrics === 'function') processGlobalMetrics();
    if (typeof renderSummaryTable === 'function') renderSummaryTable();
    if (typeof updateDynamicCharts === 'function') updateDynamicCharts();
  }
}

window.updatePowerEngineParams = function() {
  const bikeSel = document.getElementById('bikeTypeSelect');
  const weightInp = document.getElementById('totalWeightInput');
  const heightInp = document.getElementById('userHeightInput');

  if (bikeSel) window.userPowerConfig.bikeType = bikeSel.value;
  if (weightInp) {
    const w = parseFloat(weightInp.value);
    if (w >= 40 && w <= 180) window.userPowerConfig.totalWeightKg = w;
  }
  if (heightInp) {
    const h = parseInt(heightInp.value, 10);
    if (h >= 130 && h <= 225) window.userPowerConfig.heightCm = h;
  }

  recalcPowerEngineState(true);
};

window.updatePowerSourceMode = function(mode) {
  window.userPowerConfig.powerSource = mode || 'hybrid';
  savePowerEnginePreferences();
  if (typeof dbActivities !== 'undefined' && dbActivities.length > 0) {
    window.applyGlobalPowerSource();
    if (typeof processGlobalMetrics === 'function') processGlobalMetrics();
    if (typeof renderSummaryTable === 'function') renderSummaryTable();
    if (typeof updateDynamicCharts === 'function') updateDynamicCharts();
  }
};

// Camada de Abstração Global: Alimenta todas as abas (FTP, Zonas, Assinatura, Dispersão, Iso-Potência, VI, Drift)
// alternando entre Sensor Real (realMetrics) e Motor Físico (estMetrics) conforme o seletor do cabeçalho.
window.applyGlobalPowerSource = function() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return;
  const mode = window.userPowerConfig.powerSource || 'hybrid';

  dbActivities.forEach(act => {
    // Preserva os dados originais na primeira execução
    if (act.realMetrics === undefined) {
      const hasRealSensor = act.metrics && act.metrics.avgPwr > 15 && !act.metrics.isEstimated;
      act.realMetrics = hasRealSensor ? act.metrics : null;
    }

    if (mode === 'real') {
      if (act.realMetrics) {
        act.metrics = act.realMetrics;
      } else if (act.metrics || act.estMetrics) {
        const base = act.estMetrics || act.metrics;
        act.metrics = {
          ...base,
          avgPwr: 0, np: 0, vi: 0, mmp20: 0,
          pwrHist: {}, pwrHrPairs: {},
          dispWindows: { 5: [], 15: [], 60: [], 300: [], 600: [], 900: [], 3600: [] },
          top4: [], blocksCount: 0, drift: null, driftEligible: false
        };
      }
    } else if (mode === 'simulated') {
      act.metrics = act.estMetrics || act.realMetrics || act.metrics;
    } else {
      // Modo Híbrido (Usa sensor real quando disponível, e estimada nos anos sem potenciômetro)
      act.metrics = act.realMetrics || act.estMetrics || act.metrics;
    }
  });
};

window.getActiveMetrics = function(act) {
  if (!act) return null;
  const mode = window.userPowerConfig.powerSource || 'hybrid';
  if (mode === 'real') return act.realMetrics || null;
  if (mode === 'simulated') return act.estMetrics || act.realMetrics || act.metrics;
  return act.realMetrics || act.estMetrics || act.metrics;
};

// --- MODAL E EXTRATOR DE ÁREA FRONTAL POR FOTO (VISÃO COMPUTACIONAL EM CANVAS) ---
let photoState = {
  img: null,
  scalePts: [],
  bgColor: null,
  tolerance: 38,
  computedAreaM2: null
};

function ensureFrontalAreaModal() {
  if (document.getElementById('frontalAreaModal')) return;

  const modal = document.createElement('div');
  modal.id = 'frontalAreaModal';
  modal.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(2, 6, 23, 0.85); z-index: 10000; align-items: center; justify-content: center; padding: 15px;';

  modal.innerHTML = `
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; max-width: 780px; width: 100%; max-height: 92vh; overflow-y: auto; padding: 20px; color: #f8fafc; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 14px;">
        <h3 style="margin: 0; color: #38bdf8;">📐 Extrator de Área Frontal (A & CdA) — Foto vs. Antropometria</h3>
        <button onclick="closeFrontalAreaModal()" style="background: transparent; border: none; color: #94a3b8; font-size: 1.3rem; cursor: pointer;">✕</button>
      </div>

      <div id="aeroSummaryBox" style="background: #1e293b; padding: 12px 15px; border-radius: 6px; border-left: 4px solid #38bdf8; margin-bottom: 15px; font-size: 0.85rem; line-height: 1.5;"></div>

      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px;">
        <label class="btn" style="background: #2563eb; padding: 7px 14px; font-size: 0.82rem; cursor: pointer; margin: 0;">
          📷 Carregar Foto de Frente na Bike
          <input type="file" id="frontalPhotoInput" accept="image/*" style="display: none;" onchange="handleFrontalPhotoUpload(event)">
        </label>

        <label style="font-size: 0.82rem; color: #cbd5e1;">Referência de Escala (2 cliques):
          <select id="photoRefType" onchange="recomputePhotoSilhouette()" style="background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 4px; padding: 4px 8px; font-weight: bold;">
            <option value="0.622" selected>Aro da Roda 700c / 29" (0.622 m)</option>
            <option value="0.680">Roda Completa c/ Pneu (0.680 m)</option>
            <option value="0.420">Largura do Guidão Road (0.420 m)</option>
            <option value="0.720">Largura do Guidão MTB (0.720 m)</option>
            <option value="height">Minha Altura Completa</option>
          </select>
        </label>

        <label style="font-size: 0.82rem; color: #cbd5e1;">Sensibilidade do Fundo:
          <input type="range" id="photoToleranceSlider" min="12" max="90" value="38" oninput="onPhotoToleranceChange(this.value)" style="vertical-align: middle; width: 95px; accent-color: #38bdf8;">
        </label>
      </div>

      <p style="font-size: 0.78rem; color: #94a3b8; margin: 0 0 10px 0;">
        <strong>Como usar com foto:</strong> 1) Envie uma foto sua de frente montado na bike contra uma parede/fundo uniforme. 2) Clique no <strong>topo e na base do aro da roda</strong> (ou nos 2 extremos da referência escolhida) para definir a escala em metros. 3) O algoritmo separa o fundo automaticamente e mede os pixels reais da sua silhueta! Caso não envie foto, o sistema usa a fórmula antropométrica padrão.
      </p>

      <div style="text-align: center; background: #020617; border: 1px dashed #334155; border-radius: 6px; padding: 8px; min-height: 240px; display: flex; align-items: center; justify-content: center;">
        <canvas id="frontalPhotoCanvas" width="520" height="360" style="max-width: 100%; cursor: crosshair;"></canvas>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; pt-10; flex-wrap: wrap; gap: 10px;">
        <button onclick="resetToDefaultFrontalArea()" style="background: #334155; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: bold;">
          ↺ Usar Fórmula Padrão (Sem Foto)
        </button>
        <div style="display: flex; gap: 10px;">
          <button onclick="clearPhotoScalePoints()" style="background: #475569; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.82rem;">
            Refazer Marcação
          </button>
          <button onclick="applyPhotoFrontalArea()" id="btnApplyPhotoArea" style="background: #22c55e; color: #020617; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: bold;">
            ✓ Salvar Área Extraída da Foto
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const canvas = document.getElementById('frontalPhotoCanvas');
  canvas.addEventListener('click', (e) => {
    if (!photoState.img) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    if (photoState.scalePts.length < 2) {
      photoState.scalePts.push({ x, y });
    } else {
      // 3º clique amostra a cor exata do fundo onde o usuário clicou
      const ctx = canvas.getContext('2d');
      drawPhotoBase(ctx, canvas);
      const px = ctx.getImageData(x, y, 1, 1).data;
      photoState.bgColor = [px[0], px[1], px[2]];
    }
    recomputePhotoSilhouette();
  });
}

window.openFrontalAreaModal = function() {
  ensureFrontalAreaModal();
  updateModalAeroSummary();
  document.getElementById('frontalAreaModal').style.display = 'flex';
  if (!photoState.img) {
    const canvas = document.getElementById('frontalPhotoCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma foto carregada. Usando cálculo antropométrico padrão (Peso + Altura + Bike).', canvas.width / 2, canvas.height / 2);
  } else {
    recomputePhotoSilhouette();
  }
};

window.closeFrontalAreaModal = function() {
  const modal = document.getElementById('frontalAreaModal');
  if (modal) modal.style.display = 'none';
};

function updateModalAeroSummary() {
  const cfg = window.userPowerConfig;
  const aero = window.computeDefaultAeroParams(cfg.totalWeightKg, cfg.heightCm, cfg.bikeType);
  const box = document.getElementById('aeroSummaryBox');
  if (!box) return;

  const photoInfo = photoState.computedAreaM2
    ? `<span style="color:#22c55e; font-weight:bold;"> | Medida na Foto Atual: ${photoState.computedAreaM2.toFixed(3)} m²</span>`
    : '';

  box.innerHTML = `
    <div><strong>Conjunto Atual:</strong> ${cfg.bikeType.toUpperCase()} | Peso Total: <strong>${cfg.totalWeightKg} kg</strong> | Altura: <strong>${cfg.heightCm} cm</strong></div>
    <div><strong>Área Frontal Padrão (Fórmula Antropométrica):</strong> ${aero.defaultArea.toFixed(3)} m²</div>
    <div><strong>Área Frontal Ativa no Motor:</strong> <span style="color:#38bdf8; font-weight:bold;">${aero.activeArea.toFixed(3)} m²</span> (${aero.isCustomPhoto ? 'Extraída via Foto' : 'Fórmula Padrão'}) | <strong>Cd:</strong> ${aero.cd} | <strong>CdA Final:</strong> <span style="color:#eab308; font-weight:bold;">${aero.cda.toFixed(3)} m²</span> | <strong>Crr:</strong> ${aero.crr}${photoInfo}</div>
  `;
}

window.handleFrontalPhotoUpload = function(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      photoState.img = img;
      photoState.scalePts = [];
      photoState.bgColor = null;
      photoState.computedAreaM2 = null;
      recomputePhotoSilhouette();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function drawPhotoBase(ctx, canvas) {
  const img = photoState.img;
  if (!img) return;
  const maxW = 620, maxH = 420;
  let w = img.width, h = img.height;
  const ratio = Math.min(maxW / w, maxH / h);
  w = Math.round(w * ratio);
  h = Math.round(h * ratio);
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
}

window.onPhotoToleranceChange = function(val) {
  photoState.tolerance = parseInt(val, 10) || 38;
  recomputePhotoSilhouette();
};

window.clearPhotoScalePoints = function() {
  photoState.scalePts = [];
  photoState.computedAreaM2 = null;
  recomputePhotoSilhouette();
};

window.recomputePhotoSilhouette = function() {
  const canvas = document.getElementById('frontalPhotoCanvas');
  if (!canvas || !photoState.img) return;
  const ctx = canvas.getContext('2d');
  drawPhotoBase(ctx, canvas);

  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Amostra automática do fundo nos cantos superiores caso o usuário não tenha clicado no fundo
  let bg = photoState.bgColor;
  if (!bg) {
    const p1 = [d[0], d[1], d[2]];
    const idxR = (w - 1) * 4;
    const p2 = [d[idxR], d[idxR + 1], d[idxR + 2]];
    bg = [Math.round((p1[0] + p2[0]) / 2), Math.round((p1[1] + p2[1]) / 2), Math.round((p1[2] + p2[2]) / 2)];
  }

  const tol = photoState.tolerance;
  let foregroundPixels = 0;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - bg[0];
    const dg = d[i + 1] - bg[1];
    const db = d[i + 2] - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist > tol) {
      foregroundPixels++;
      // Destaca a silhueta detectada em ciano translúcido
      d[i] = Math.min(255, Math.round(d[i] * 0.55 + 14));
      d[i + 1] = Math.min(255, Math.round(d[i + 1] * 0.55 + 165));
      d[i + 2] = Math.min(255, Math.round(d[i + 2] * 0.55 + 233));
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Desenha os pontos e linha de escala
  if (photoState.scalePts.length > 0) {
    ctx.strokeStyle = '#eab308';
    ctx.fillStyle = '#eab308';
    ctx.lineWidth = 2.5;
    photoState.scalePts.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (photoState.scalePts.length === 2) {
      const p1 = photoState.scalePts[0], p2 = photoState.scalePts[1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const refSel = document.getElementById('photoRefType')?.value || '0.622';
      const refMeters = refSel === 'height' ? (window.userPowerConfig.heightCm / 100) : parseFloat(refSel);

      if (pixelDist > 15 && refMeters > 0) {
        const metersPerPixel = refMeters / pixelDist;
        const areaPerPixel = metersPerPixel * metersPerPixel;
        const rawArea = foregroundPixels * areaPerPixel;

        // Validação de segurança: se a área sair fora dos limites físicos (0.22 a 0.95 m²), avisa e mantém o padrão
        if (rawArea >= 0.22 && rawArea <= 0.95) {
          photoState.computedAreaM2 = parseFloat(rawArea.toFixed(3));
        } else {
          photoState.computedAreaM2 = null;
        }
      }
    }
  }

  updateModalAeroSummary();
};

window.applyPhotoFrontalArea = function() {
  if (!photoState.computedAreaM2 || photoState.computedAreaM2 < 0.22 || photoState.computedAreaM2 > 0.95) {
    alert('A foto ainda não possui uma escala válida (entre 0.22 m² e 0.95 m²). Marque os 2 pontos de referência na imagem ou use a Fórmula Padrão.');
    return;
  }
  window.userPowerConfig.customFrontalArea = photoState.computedAreaM2;
  recalcPowerEngineState(true);
  updateModalAeroSummary();
  closeFrontalAreaModal();
};

window.resetToDefaultFrontalArea = function() {
  window.userPowerConfig.customFrontalArea = null;
  photoState.computedAreaM2 = null;
  recalcPowerEngineState(true);
  updateModalAeroSummary();
};

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadPowerEnginePreferences, 150);
});
