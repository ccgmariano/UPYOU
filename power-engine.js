// Motor Físico, Biométrico, Integração Meteorológica ERA5 (Open-Meteo) e Extrator de Área Frontal (Fases 1, 2 e 3)

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

const WEATHER_CACHE_KEY = 'upyou_era5_weather_cache_v1';
let weatherMemoryCache = null;

function getWeatherCache() {
  if (weatherMemoryCache) return weatherMemoryCache;
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    weatherMemoryCache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    weatherMemoryCache = {};
  }
  return weatherMemoryCache;
}

function saveWeatherCache() {
  if (!weatherMemoryCache) return;
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherMemoryCache));
  } catch (e) {}
}

function getPowerStorageKey() {
  const uid = (typeof currentUserId !== 'undefined' && currentUserId) ? currentUserId : 'default';
  return `upyou_pwr_cfg_${uid}`;
}

// Cálculo Antropométrico Padrão de Área Frontal (A), CdA e Crr com base em Peso do Conjunto, Altura e Tipo de Bike
window.computeDefaultAeroParams = function(totalWeightKg, heightCm, bikeType) {
  const isMtb = bikeType === 'mtb';
  const estBikeMass = isMtb ? 12.5 : 9.0;
  const riderMassKg = Math.max(42, totalWeightKg - estBikeMass);

  // Área de Superfície Corporal de DuBois (BSA em m²)
  const bsa = 0.007184 * Math.pow(riderMassKg, 0.425) * Math.pow(heightCm, 0.725);

  const riderProjFactor = isMtb ? 0.222 : 0.184;
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

// Re-escala instantaneamente estMetrics existentes quando o usuário altera Peso, Altura, Bike ou Área Frontal no topo
function rescaleExistingSimulatedMetrics() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return;
  const cfg = window.userPowerConfig;

  dbActivities.forEach(act => {
    // Se a atividade ainda não tem estMetrics mas tem realMetrics, cria uma estimativa base sintética até o próximo sync/reprocessamento
    if (!act.estMetrics && act.realMetrics) {
      act.estMetrics = buildSyntheticEstFromReal(act.realMetrics, cfg);
    }
    if (!act.estMetrics) return;

    const em = act.estMetrics;
    const baseMass = em.simParams?.totalWeightKg || 82;
    const baseCda = em.simParams?.cda || 0.361;
    const baseCrr = em.simParams?.crr || 0.0045;

    const vMs = Math.max(4.5, (parseFloat(em.avgSpeed) || 25) / 3.6);
    const oldAeroW = 0.5 * 1.20 * baseCda * Math.pow(vMs, 3);
    const oldGravRollW = baseMass * 9.80665 * (baseCrr + 0.006) * vMs;
    const newAeroW = 0.5 * 1.20 * cfg.cda * Math.pow(vMs, 3);
    const newGravRollW = cfg.totalWeightKg * 9.80665 * (cfg.crr + 0.006) * vMs;

    const ratio = (oldAeroW + oldGravRollW) > 10 ? ((newAeroW + newGravRollW) / (oldAeroW + oldGravRollW)) : 1.0;
    if (Math.abs(ratio - 1.0) < 0.003) return;

    scaleMetricsObject(em, ratio, cfg);
  });
}

function buildSyntheticEstFromReal(rm, cfg) {
  const clone = JSON.parse(JSON.stringify(rm));
  clone.isEstimated = true;
  clone.simParams = { totalWeightKg: 82, cda: 0.361, crr: 0.0045, weatherUsed: false };
  const vMs = Math.max(4.5, (parseFloat(rm.avgSpeed) || 25) / 3.6);
  const baseW = 0.5 * 1.20 * 0.361 * Math.pow(vMs, 3) + 82 * 9.80665 * (0.0045 + 0.006) * vMs;
  const targetW = 0.5 * 1.20 * cfg.cda * Math.pow(vMs, 3) + cfg.totalWeightKg * 9.80665 * (cfg.crr + 0.006) * vMs;
  const ratio = baseW > 10 ? (targetW / baseW) : 1.0;
  scaleMetricsObject(clone, ratio, cfg);
  return clone;
}

function scaleMetricsObject(m, ratio, cfg) {
  m.avgPwr = Math.round((m.avgPwr || 0) * ratio);
  m.np = Math.round((m.np || 0) * ratio);
  m.mmp20 = Math.round((m.mmp20 || 0) * ratio);

  if (Array.isArray(m.top4)) {
    m.top4 = m.top4.map(t => ({ ...t, avg: Math.round(t.avg * ratio) }));
  }

  if (m.pwrHist) {
    const newHist = {};
    for (const pStr in m.pwrHist) {
      const scaledP = Math.round((parseInt(pStr, 10) * ratio) / 5) * 5;
      newHist[scaledP] = (newHist[scaledP] || 0) + m.pwrHist[pStr];
    }
    m.pwrHist = newHist;
  }

  if (m.pwrHrPairs) {
    const newPairs = {};
    for (const pStr in m.pwrHrPairs) {
      const scaledP = Math.round((parseInt(pStr, 10) * ratio) / 5) * 5;
      if (!newPairs[scaledP]) newPairs[scaledP] = { sumHr: 0, secs: 0 };
      newPairs[scaledP].sumHr += m.pwrHrPairs[pStr].sumHr;
      newPairs[scaledP].secs += m.pwrHrPairs[pStr].secs;
    }
    m.pwrHrPairs = newPairs;
  }

  if (m.dispWindows) {
    for (const wSize in m.dispWindows) {
      if (Array.isArray(m.dispWindows[wSize])) {
        m.dispWindows[wSize] = m.dispWindows[wSize].map(pt => [Math.round(pt[0] * ratio), pt[1]]);
      }
    }
  }

  m.simParams = {
    totalWeightKg: cfg.totalWeightKg,
    cda: cfg.cda,
    crr: cfg.crr,
    weatherUsed: m.simParams?.weatherUsed || false
  };
}

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
    rescaleExistingSimulatedMetrics();
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
    rescaleExistingSimulatedMetrics();
    window.applyGlobalPowerSource();
    if (typeof processGlobalMetrics === 'function') processGlobalMetrics();
    if (typeof renderSummaryTable === 'function') renderSummaryTable();
    if (typeof updateDynamicCharts === 'function') updateDynamicCharts();
  }
};

// Camada de Abstração Global: Alterna entre Sensor Real (realMetrics) e Motor Físico (estMetrics)
window.applyGlobalPowerSource = function() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return;
  const mode = window.userPowerConfig.powerSource || 'hybrid';
  const cfg = window.userPowerConfig;

  dbActivities.forEach(act => {
    if (act.realMetrics === undefined) {
      const hasRealSensor = act.metrics && act.metrics.avgPwr > 15 && !act.metrics.isEstimated;
      act.realMetrics = hasRealSensor ? act.metrics : null;
    }

    if (!act.estMetrics && act.realMetrics) {
      act.estMetrics = buildSyntheticEstFromReal(act.realMetrics, cfg);
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
      // Modo Híbrido: Sensor real quando disponível (2017–2026) e Motor Físico quando sem sensor (2014–2016)
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

// --- FASE 2: INTEGRAÇÃO METEOROLÓGICA ERA5 / ECMWF (OPEN-METEO ARCHIVE API) ---
window.fetchHistoricalWeatherForActivity = async function(lat, lon, dateObj) {
  if (!lat || !lon || !dateObj || isNaN(dateObj.getTime())) return null;

  const rLat = (Math.round(lat * 10) / 10).toFixed(1);
  const rLon = (Math.round(lon * 10) / 10).toFixed(1);
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateIso = `${yyyy}-${mm}-${dd}`;
  const cacheKey = `${rLat}_${rLon}_${dateIso}`;

  const cache = getWeatherCache();
  if (cache[cacheKey]) return cache[cacheKey];

  // Evita consultar datas futuras no arquivo histórico
  const now = new Date();
  const isRecent = (now.getTime() - dateObj.getTime()) < 5 * 86400000;
  const baseUrl = isRecent
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/archive';

  const url = `${baseUrl}?latitude=${rLat}&longitude=${rLon}&start_date=${dateIso}&end_date=${dateIso}&hourly=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.hourly && Array.isArray(data.hourly.wind_speed_10m)) {
      const entry = {
        temp: data.hourly.temperature_2m || [],
        press: data.hourly.surface_pressure || [],
        wSpeed: data.hourly.wind_speed_10m || [],
        wDir: data.hourly.wind_direction_10m || []
      };
      cache[cacheKey] = entry;
      saveWeatherCache();
      return entry;
    }
  } catch (e) {}
  return null;
};

// Calcula o rumo (bearing em graus: 0° = Norte, 90° = Leste, 180° = Sul, 270° = Oeste) entre 2 coordenadas GPS
window.calculateBearingDeg = function(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad, phi2 = lat2 * toRad;
  const dLambda = (lon2 - lon1) * toRad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
};

// --- FASE 3: MOTOR DE ESTIMATIVA DE POTÊNCIA SEGUNDO A SEGUNDO ---
// Gera um array de records clonados com `power` calculado pela física (Gravidade + Rolagem + Aerodinâmica com Vento ERA5 + Inércia)
window.simulatePowerOnRecords = function(records, weatherHourly, fallbackDateObj) {
  if (!records || records.length === 0) return [];
  const cfg = window.userPowerConfig;
  const mass = cfg.totalWeightKg || 82.0;
  const cda = cfg.cda || 0.361;
  const crr = cfg.crr || 0.0045;
  const g = 9.80665;
  const drivetrainEff = 0.975; // 2.5% perda na relação/corrente
  const groundWindFactor = 0.70; // Redução da velocidade do vento de 10m (ECMWF) para 1.5m (altura do ciclista)

  // Suavização de Altitude (janela móvel de ±4 amostras para eliminar degraus barométricos no cálculo do grade %)
  const n = records.length;
  const smoothAlt = new Array(n);
  for (let i = 0; i < n; i++) {
    let sumA = 0, cntA = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
      if (records[j].altitude !== undefined && records[j].altitude !== null && !isNaN(records[j].altitude)) {
        sumA += records[j].altitude;
        cntA++;
      }
    }
    smoothAlt[i] = cntA > 0 ? (sumA / cntA) : null;
  }

  // Hora UTC inicial para indexar o vetor meteorológico (0 a 23h)
  const baseHourUtc = fallbackDateObj ? fallbackDateObj.getUTCHours() : 12;
  const startTs = records[0].timestamp || 0;

  const simRecords = new Array(n);

  for (let i = 0; i < n; i++) {
    const r = records[i];
    const vMs = Math.max(0, (r.speed || 0) / 3.6);

    // Se a bike está parada ou abaixo de 3 km/h, potência é zero
    if (vMs < 0.85) {
      simRecords[i] = { ...r, power: 0 };
      continue;
    }

    // 1. Inclinação (Grade) usando janela de distância de ~25m a 60m para estabilidade física
    let grade = 0;
    if (smoothAlt[i] !== null) {
      let backIdx = Math.max(0, i - 6);
      let fwdIdx = Math.min(n - 1, i + 6);
      const dDist = (records[fwdIdx].distance || 0) - (records[backIdx].distance || 0);
      if (dDist >= 12 && smoothAlt[fwdIdx] !== null && smoothAlt[backIdx] !== null) {
        grade = (smoothAlt[fwdIdx] - smoothAlt[backIdx]) / dDist;
        // Limita inclinação entre -18% e +24% para evitar artefatos de GPS
        grade = Math.max(-0.18, Math.min(0.24, grade));
      }
    }

    // 2. Condições Meteorológicas (Densidade do Ar e Vento Relativo na hora correspondente)
    const elapsedHours = Math.floor(Math.max(0, (r.timestamp - startTs)) / 3600);
    const hourIdx = Math.min(23, Math.max(0, baseHourUtc + elapsedHours));

    let tempC = 22.0;
    let pressHpa = 1013.25;
    let windSpeedMs = 0;
    let windFromDeg = 0;

    if (weatherHourly) {
      if (weatherHourly.temp[hourIdx] !== undefined) tempC = weatherHourly.temp[hourIdx];
      if (weatherHourly.press[hourIdx] !== undefined) pressHpa = weatherHourly.press[hourIdx];
      if (weatherHourly.wSpeed[hourIdx] !== undefined) windSpeedMs = weatherHourly.wSpeed[hourIdx] * groundWindFactor;
      if (weatherHourly.wDir[hourIdx] !== undefined) windFromDeg = weatherHourly.wDir[hourIdx];
    } else if (smoothAlt[i] !== null) {
      // Pressão barométrica estimada pela altitude quando offline
      pressHpa = 1013.25 * Math.pow(1 - (0.0065 * Math.max(0, smoothAlt[i])) / 288.15, 5.255);
    }

    // Densidade do ar seco (kg/m³): rho = P(Pa) / (R_especifico * T(K))
    const rho = (pressHpa * 100) / (287.058 * (tempC + 273.15));

    // Componente de vento frontal (headwind > 0 quando o vento sopra de frente para o rumo da bike)
    let headwindMs = 0;
    if (windSpeedMs > 0 && r.bearing !== undefined && r.bearing !== null) {
      const angleDiffRad = ((windFromDeg - r.bearing) * Math.PI) / 180;
      headwindMs = windSpeedMs * Math.cos(angleDiffRad);
    }

    const vAir = vMs + headwindMs;

    // 3. Forças Físicas: Gravidade + Rolagem + Aerodinâmica + Aceleração Cinética
    const theta = Math.atan(grade);
    const pGrav = mass * g * Math.sin(theta) * vMs;
    const pRoll = crr * mass * g * Math.cos(theta) * vMs;
    const pAero = 0.5 * rho * cda * vMs * vAir * Math.abs(vAir);

    let pKin = 0;
    if (i > 0) {
      const dt = Math.max(1, (r.timestamp - records[i - 1].timestamp));
      if (dt <= 5) {
        const prevV = Math.max(0, (records[i - 1].speed || 0) / 3.6);
        const dv = vMs - prevV;
        // Limita aceleração máxima considerada para evitar saltos de sinal GPS
        const clampedAcc = Math.max(-1.2, Math.min(1.2, dv / dt));
        pKin = mass * 1.04 * vMs * clampedAcc;
      }
    }

    let totalWatts = (pGrav + pRoll + pAero + pKin) / drivetrainEff;

    // Se o sensor de cadência estiver presente e marcando zero (roda livre), ou força resultante negativa em descida, zera os Watts
    if ((r.hasCadSensor && r.cad === 0) || totalWatts <= 0) {
      totalWatts = 0;
    } else if (totalWatts > 1400) {
      totalWatts = 1400;
    }

    simRecords[i] = { ...r, power: Math.round(totalWatts) };
  }

  return simRecords;
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

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; flex-wrap: wrap; gap: 10px;">
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
      d[i] = Math.min(255, Math.round(d[i] * 0.55 + 14));
      d[i + 1] = Math.min(255, Math.round(d[i + 1] * 0.55 + 165));
      d[i + 2] = Math.min(255, Math.round(d[i + 2] * 0.55 + 233));
    }
  }
  ctx.putImageData(imgData, 0, 0);

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
