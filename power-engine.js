// Motor Físico, Biométrico, Integração Meteorológica ERA5, Telemetria 15s (com Cadência RPM) e Auto-Calibrador

window.userPowerConfig = {
  bikeType: 'road',
  totalWeightKg: 82.0,
  heightCm: 175,
  customFrontalArea: null,
  powerSource: 'hybrid',
  frontalAreaM2: 0.41,
  cd: 0.80,
  cda: 0.328,
  crr: 0.0045,
  calibratedCdScale: 1.0,
  calibratedCrr: null,
  windShelterFactor: 0.55
};

const WEATHER_CACHE_KEY = 'upyou_era5_weather_cache_v2';
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

window.computeDefaultAeroParams = function(totalWeightKg, heightCm, bikeType) {
  const isMtb = bikeType === 'mtb';
  const estBikeMass = isMtb ? 12.5 : 9.0;
  const riderMassKg = Math.max(42, totalWeightKg - estBikeMass);

  const bsa = 0.007184 * Math.pow(riderMassKg, 0.425) * Math.pow(heightCm, 0.725);
  const riderProjFactor = isMtb ? 0.215 : 0.178;
  const bikeFrontalM2 = isMtb ? 0.095 : 0.065;

  const defaultArea = parseFloat((bsa * riderProjFactor + bikeFrontalM2).toFixed(3));
  const baseCd = isMtb ? 0.96 : 0.80;
  const cdScale = window.userPowerConfig.calibratedCdScale || 1.0;
  const cd = parseFloat((baseCd * cdScale).toFixed(3));

  const baseCrr = isMtb ? 0.0075 : 0.0045;
  const crr = window.userPowerConfig.calibratedCrr !== null && window.userPowerConfig.calibratedCrr !== undefined
    ? window.userPowerConfig.calibratedCrr
    : baseCrr;

  const activeArea = (window.userPowerConfig.customFrontalArea && window.userPowerConfig.customFrontalArea >= 0.22 && window.userPowerConfig.customFrontalArea <= 0.95)
    ? window.userPowerConfig.customFrontalArea
    : defaultArea;

  const cda = parseFloat((activeArea * cd).toFixed(3));

  return {
    defaultArea,
    activeArea,
    isCustomPhoto: Boolean(window.userPowerConfig.customFrontalArea),
    isCalibrated: Math.abs(cdScale - 1.0) > 0.005 || Boolean(window.userPowerConfig.calibratedCrr),
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

function rescaleExistingSimulatedMetrics() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return;
  const cfg = window.userPowerConfig;

  dbActivities.forEach(act => {
    if (!act.estMetrics && act.realMetrics) {
      act.estMetrics = buildSyntheticEstFromReal(act.realMetrics, cfg);
    }
    if (!act.estMetrics) return;

    const em = act.estMetrics;
    if (em.isIndoorTrainer) return;

    const baseMass = em.simParams?.totalWeightKg || 82;
    const baseCda = em.simParams?.cda || 0.328;
    const baseCrr = em.simParams?.crr || 0.0045;

    const vMs = Math.max(4.5, (parseFloat(em.avgSpeed) || 25) / 3.6);
    const oldAeroW = 0.5 * 1.20 * baseCda * Math.pow(vMs, 3);
    const oldGravRollW = baseMass * 9.80665 * (baseCrr + 0.005) * vMs;
    const newAeroW = 0.5 * 1.20 * cfg.cda * Math.pow(vMs, 3);
    const newGravRollW = cfg.totalWeightKg * 9.80665 * (cfg.crr + 0.005) * vMs;

    const ratio = (oldAeroW + oldGravRollW) > 10 ? ((newAeroW + newGravRollW) / (oldAeroW + oldGravRollW)) : 1.0;
    if (Math.abs(ratio - 1.0) < 0.002) return;

    scaleMetricsObject(em, ratio, cfg);

    if (Array.isArray(act.telemetry15s)) {
      act.telemetry15s.forEach(pt => {
        if (pt.pEst > 0) pt.pEst = Math.round(pt.pEst * ratio);
      });
    }
  });
}

function buildSyntheticEstFromReal(rm, cfg) {
  const clone = JSON.parse(JSON.stringify(rm));
  clone.isEstimated = true;
  clone.simParams = { totalWeightKg: 82, cda: 0.328, crr: 0.0045, weatherUsed: false };
  const vMs = Math.max(4.5, (parseFloat(rm.avgSpeed) || 25) / 3.6);
  const baseW = 0.5 * 1.20 * 0.328 * Math.pow(vMs, 3) + 82 * 9.80665 * (0.0045 + 0.005) * vMs;
  const targetW = 0.5 * 1.20 * cfg.cda * Math.pow(vMs, 3) + cfg.totalWeightKg * 9.80665 * (cfg.crr + 0.005) * vMs;
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
    let originLabel = aero.isCustomPhoto ? 'Foto' : 'Padrão';
    if (aero.isCalibrated) originLabel += '+Calib';
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

window.fetchHistoricalWeatherForActivity = async function(lat, lon, dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return null;

  const validLat = (lat && Math.abs(lat) > 0.1) ? lat : -28.48;
  const validLon = (lon && Math.abs(lon) > 0.1) ? lon : -49.00;

  const rLat = (Math.round(validLat * 5) / 5).toFixed(1);
  const rLon = (Math.round(validLon * 5) / 5).toFixed(1);
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateIso = `${yyyy}-${mm}-${dd}`;
  const cacheKey = `${rLat}_${rLon}_${dateIso}`;

  const cache = getWeatherCache();
  if (cache[cacheKey]) return cache[cacheKey];

  const now = new Date();
  const isRecent = (now.getTime() - dateObj.getTime()) < 5 * 86400000;
  const baseUrl = isRecent
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/archive';

  const url = `${baseUrl}?latitude=${rLat}&longitude=${rLon}&start_date=${dateIso}&end_date=${dateIso}&hourly=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
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

window.calculateBearingDeg = function(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad, phi2 = lat2 * toRad;
  const dLambda = (lon2 - lon1) * toRad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
};

// --- MOTOR FÍSICO + TELEMETRIA 15s (INCLUINDO CADÊNCIA RPM) ---
window.simulatePowerAndTelemetry = function(records, weatherHourly, fallbackDateObj) {
  if (!records || records.length === 0) return { simRecords: [], telemetry15s: [], isIndoor: false };
  const cfg = window.userPowerConfig;
  const mass = cfg.totalWeightKg || 82.0;
  const cda = cfg.cda || 0.328;
  const crr = cfg.crr || 0.0045;
  const g = 9.80665;
  const drivetrainEff = 0.975;
  const groundWindFactor = cfg.windShelterFactor || 0.55;

  const n = records.length;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  let gpsValidCount = 0;
  for (let i = 0; i < n; i += 3) {
    const la = records[i].lat, lo = records[i].lon;
    if (la && lo && Math.abs(la) > 0.01 && Math.abs(lo) > 0.01) {
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
      gpsValidCount++;
    }
  }

  let bboxSpanMeters = 0;
  if (gpsValidCount >= 5 && isFinite(minLat)) {
    const dLatM = (maxLat - minLat) * 111320;
    const dLonM = (maxLon - minLon) * 111320 * Math.cos((minLat * Math.PI) / 180);
    bboxSpanMeters = Math.hypot(dLatM, dLonM);
  }
  const isIndoor = (gpsValidCount < 10) || (bboxSpanMeters < 280);

  let rawMinAlt = Infinity;
  for (let i = 0; i < n; i++) {
    const a = records[i].altitude;
    if (a !== undefined && a !== null && !isNaN(a) && a < rawMinAlt) rawMinAlt = a;
  }
  const altFloorOffset = (isFinite(rawMinAlt) && rawMinAlt < 0) ? (-rawMinAlt + 4) : 0;

  const smoothAlt = new Array(n);
  for (let i = 0; i < n; i++) {
    let sumA = 0, cntA = 0;
    for (let j = Math.max(0, i - 10); j <= Math.min(n - 1, i + 10); j++) {
      if (records[j].altitude !== undefined && records[j].altitude !== null && !isNaN(records[j].altitude)) {
        sumA += (records[j].altitude + altFloorOffset);
        cntA++;
      }
    }
    smoothAlt[i] = cntA > 0 ? (sumA / cntA) : null;
  }

  const smoothBearing = new Array(n).fill(null);
  if (!isIndoor) {
    let lastValidBrng = null;
    for (let i = 0; i < n; i++) {
      let back = i;
      while (back > 0 && ((records[i].distance || 0) - (records[back].distance || 0)) < 25) back--;
      if (records[i].lat && records[i].lon && records[back].lat && records[back].lon && back < i) {
        const dLatM = (records[i].lat - records[back].lat) * 111320;
        const dLonM = (records[i].lon - records[back].lon) * 111320;
        if (Math.hypot(dLatM, dLonM) >= 12) {
          lastValidBrng = window.calculateBearingDeg(records[back].lat, records[back].lon, records[i].lat, records[i].lon);
        }
      }
      smoothBearing[i] = lastValidBrng !== null ? lastValidBrng : records[i].bearing;
    }
  }

  const smoothSpdKmh = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      const sp = records[j].speed || 0;
      if (sp >= 0 && sp < 110) { s += sp; c++; }
    }
    smoothSpdKmh[i] = c > 0 ? (s / c) : 0;
  }

  const baseHourUtc = fallbackDateObj ? fallbackDateObj.getUTCHours() : 12;
  const startTs = records[0].timestamp || 0;
  const simRecords = new Array(n);
  const headwindArr = new Array(n).fill(0);
  const gradeArr = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const r = records[i];
    const vMs = Math.max(0, smoothSpdKmh[i] / 3.6);

    if (isIndoor) {
      let indoorW = 0;
      if (r.power > 0) {
        indoorW = r.power;
      } else if (r.hr > 95) {
        indoorW = Math.max(45, Math.round((r.hr - 75) * 2.1));
      } else if (vMs >= 1.0) {
        indoorW = Math.round(0.22 * Math.pow(vMs, 3) + 4.2 * vMs);
      }
      simRecords[i] = { ...r, power: indoorW };
      headwindArr[i] = 0;
      gradeArr[i] = 0;
      continue;
    }

    if (vMs < 0.85) {
      simRecords[i] = { ...r, power: 0 };
      continue;
    }

    let grade = 0;
    if (smoothAlt[i] !== null) {
      let backIdx = i, fwdIdx = i;
      while (backIdx > 0 && ((records[i].distance || 0) - (records[backIdx].distance || 0)) < 25) backIdx--;
      while (fwdIdx < n - 1 && ((records[fwdIdx].distance || 0) - (records[i].distance || 0)) < 25) fwdIdx++;
      const dDist = (records[fwdIdx].distance || 0) - (records[backIdx].distance || 0);
      if (dDist >= 35 && smoothAlt[fwdIdx] !== null && smoothAlt[backIdx] !== null) {
        grade = (smoothAlt[fwdIdx] - smoothAlt[backIdx]) / dDist;
        grade = Math.max(-0.14, Math.min(0.18, grade));
      }
    }
    gradeArr[i] = grade;

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
      pressHpa = 1013.25 * Math.pow(1 - (0.0065 * Math.max(0, smoothAlt[i])) / 288.15, 5.255);
    }

    const rho = (pressHpa * 100) / (287.058 * (tempC + 273.15));

    let headwindMs = 0;
    const brng = smoothBearing[i];
    if (windSpeedMs > 0 && brng !== undefined && brng !== null) {
      const angleDiffRad = ((windFromDeg - brng) * Math.PI) / 180;
      headwindMs = windSpeedMs * Math.cos(angleDiffRad);
    }
    headwindArr[i] = headwindMs * 3.6;

    const vAir = vMs + headwindMs;
    const theta = Math.atan(grade);
    const pGrav = mass * g * Math.sin(theta) * vMs;
    const pRoll = crr * mass * g * Math.cos(theta) * vMs;
    const pAero = 0.5 * rho * cda * vMs * vAir * Math.abs(vAir);

    let pKin = 0;
    if (i >= 8) {
      const dt = Math.max(1, (r.timestamp - records[i - 8].timestamp));
      if (dt >= 6 && dt <= 16) {
        const prevV = Math.max(0, smoothSpdKmh[i - 8] / 3.6);
        const dv = vMs - prevV;
        const clampedAcc = Math.max(-0.32, Math.min(0.32, dv / dt));
        pKin = mass * 1.03 * vMs * clampedAcc;
      }
    }

    let totalWatts = (pGrav + pRoll + pAero + pKin) / drivetrainEff;

    if ((r.hasCadSensor && r.cad === 0) || totalWatts <= 0) {
      totalWatts = 0;
    } else if (totalWatts > 680) {
      totalWatts = 680;
    }

    simRecords[i] = { ...r, power: Math.round(totalWatts) };
  }

  // Série de Telemetria Compacta a cada 15 Segundos (Agora inclui Cadência RPM!)
  const telemetry15s = [];
  let accDt = 0, sumPReal = 0, sumPEst = 0, sumHr = 0, cntHr = 0, sumCad = 0, cntCad = 0, sumSpd = 0, sumAlt = 0, cntAlt = 0, sumWind = 0, sumGrade = 0;
  let lastDistMeters = 0;

  for (let i = 0; i < n; i++) {
    const rOrig = records[i];
    const rSim = simRecords[i];
    let dt = (i < n - 1)
