// Núcleo Principal Otimizado (Cockpit Matrix Neon Precision, Lazy Loading de Telemetria, Exclusão por Chave Única e Curva MMP)
let dbActivities = [];
let currentUserId = null;
let currentUserName = "";
let userMaxHr = 187;
let activeDashboardTabId = "tableTab";

const DB_NAME = "UpYouDB";
const STORE_NAME = "activitiesStore";
const TELEMETRY_STORE = "telemetryStore";
const GARMIN_API_URL = "https://garmin-webhook-731921508137.us-central1.run.app";

function getDeletedIdsKey() {
  return `upyou_deleted_keys_${currentUserId || 'default'}`;
}

function getDeletedActivityKeys() {
  try {
    const raw = localStorage.getItem(getDeletedIdsKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function addDeletedActivityKey(uKey) {
  if (!uKey) return;
  const list = getDeletedActivityKeys();
  if (!list.includes(uKey)) {
    list.push(uKey);
    localStorage.setItem(getDeletedIdsKey(), JSON.stringify(list));
  }
}

window.deleteActivityByKey = async function(uKey) {
  if (typeof dbActivities === 'undefined' || !uKey) return;
  const idx = dbActivities.findIndex(a => window.getActivityUniqueKey(a) === uKey);
  if (idx === -1) return;

  const act = dbActivities[idx];
  const distTxt = act.metrics?.distKm ? `${act.metrics.distKm} km` : '';

  const confirmed = confirm(`Tem certeza que deseja excluir a atividade:\n\n"${act.date} — ${act.name} (${distTxt})"?`);
  if (!confirmed) return;

  addDeletedActivityKey(uKey);
  if (act.garminId) {
    addDeletedActivityKey(String(act.garminId));
    try {
      fetch(`${GARMIN_API_URL}?action=delete&google_id=${encodeURIComponent(currentUserId)}&id=${encodeURIComponent(act.garminId)}`, { method: 'DELETE' }).catch(() => {});
    } catch (e) {}
  }

  dbActivities.splice(idx, 1);
  await saveToDB(dbActivities);

  if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
  processGlobalMetrics();
  renderSummaryTable();
  updateDynamicCharts();
};

window.deleteActivityByIndex = async function(idx) {
  if (typeof dbActivities === 'undefined' || !dbActivities[idx]) return;
  const uKey = window.getActivityUniqueKey(dbActivities[idx]);
  await window.deleteActivityByKey(uKey);
};

window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('upyou_user') || sessionStorage.getItem('upyou_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      currentUserId = parsed.id;
      currentUserName = parsed.name;
      localStorage.setItem('upyou_user', JSON.stringify({ id: currentUserId, name: currentUserName }));
      loadUserPreferences();
      if (typeof loadPowerEnginePreferences === 'function') loadPowerEnginePreferences();
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'flex';
      document.getElementById('userGreeting').innerText = currentUserName;
      initializeAppForUser();
    } catch (e) {}
  }
});

function loadUserPreferences() {
  if (!currentUserId) return;
  const savedMaxHr = localStorage.getItem(`upyou_maxhr_${currentUserId}`);
  if (savedMaxHr) {
    userMaxHr = parseInt(savedMaxHr, 10) || 187;
    const hrInp = document.getElementById('maxHrInput');
    if (hrInp) hrInp.value = userMaxHr;
  }
  updateHrSubtitle();
}

window.updateUserMaxHr = function(val) {
  const parsed = parseInt(val, 10);
  if (parsed >= 120 && parsed <= 230) {
    userMaxHr = parsed;
    if (currentUserId) localStorage.setItem(`upyou_maxhr_${currentUserId}`, userMaxHr);
    if (dbActivities.length > 0) {
      processGlobalMetrics();
      updateDynamicCharts();
    } else {
      updateHrSubtitle();
    }
  }
};

function updateHrSubtitle() {
  const sub = document.getElementById('hrZoneSubtitle');
  if (sub) {
    const lthr = typeof window.getEstimatedLthr === 'function' ? window.getEstimatedLthr() : Math.round(userMaxHr * 0.90);
    sub.innerText = `Alinhado a Andrew Coggan via LTHR Dinâmica (Janela 42d 100% MMP20-FC | Atual: ${lthr} bpm | FC Máx: ${userMaxHr} bpm).`;
  }
}

function handleCredentialResponse(response) {
  const base64Url = response.credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  
  const payload = JSON.parse(jsonPayload);
  
  currentUserId = payload.sub;
  currentUserName = payload.given_name || payload.name;
  localStorage.setItem('upyou_user', JSON.stringify({ id: currentUserId, name: currentUserName }));

  loadUserPreferences();
  if (typeof loadPowerEnginePreferences === 'function') loadPowerEnginePreferences();
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('userGreeting').innerText = currentUserName;

  initializeAppForUser();
}

function logout() {
  currentUserId = null;
  dbActivities = [];
  localStorage.removeItem('upyou_user');
  sessionStorage.removeItem('upyou_user');
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  location.href = location.pathname; 
}

function connectGarminAccount() {
  if (!currentUserId) {
    alert("Faça login com o Google primeiro.");
    return;
  }
  window.location.href = `${GARMIN_API_URL}?action=auth&google_id=${encodeURIComponent(currentUserId)}`;
}

async function checkGarminConnectionStatus() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${GARMIN_API_URL}?action=status&google_id=${encodeURIComponent(currentUserId)}`);
    if (res.ok) {
      const status = await res.json();
      if (status.connected) {
        const badge = document.getElementById('garminConnectedBadge');
        const btn = document.getElementById('btnConnectGarmin');
        if (badge) badge.style.display = 'inline-flex';
        if (btn) btn.innerText = 'Reconectar Garmin';
      }
    }
  } catch (e) {
    console.warn('Não foi possível verificar status Garmin:', e);
  }
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TELEMETRY_STORE)) db.createObjectStore(TELEMETRY_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME) || !db.objectStoreNames.contains(TELEMETRY_STORE)) {
        const nextVer = db.version + 1;
        db.close();
        const upg = indexedDB.open(DB_NAME, nextVer);
        upg.onupgradeneeded = (ev) => {
          const uDb = ev.target.result;
          if (!uDb.objectStoreNames.contains(STORE_NAME)) uDb.createObjectStore(STORE_NAME, { keyPath: "id" });
          if (!uDb.objectStoreNames.contains(TELEMETRY_STORE)) uDb.createObjectStore(TELEMETRY_STORE, { keyPath: "id" });
        };
        upg.onsuccess = () => resolve(upg.result);
        upg.onerror = () => reject(upg.error);
      } else {
        resolve(db);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveToDB(activities) {
  if (!currentUserId) return;
  const db = await initDB();
  const tx = db.transaction([STORE_NAME, TELEMETRY_STORE], "readwrite");
  const mainStore = tx.objectStore(STORE_NAME);
  const telStore = tx.objectStore(TELEMETRY_STORE);

  const lightActivities = activities.map(act => {
    const uKey = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(act) : String(act.garminId || act.file || Math.random());
    if (Array.isArray(act.telemetry15s) && act.telemetry15s.length > 0) {
      telStore.put({ id: `${currentUserId}_${uKey}`, stream: act.telemetry15s });
      act.hasSavedTelemetry = true;
    }
    const { telemetry15s, ...lightCopy } = act;
    return lightCopy;
  });

  mainStore.put({ id: currentUserId, data: lightActivities });
  return new Promise(resolve => tx.oncomplete = resolve);
}

async function loadFromDB() {
  if (!currentUserId) return null;
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const request = store.get(currentUserId);
  return new Promise(resolve => {
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => resolve(null);
  });
}

window.loadTelemetryForActivityOnDemand = async function(act) {
  if (!act || (Array.isArray(act.telemetry15s) && act.telemetry15s.length > 0)) return act?.telemetry15s || [];
  try {
    const uKey = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(act) : String(act.garminId || act.file);
    const db = await initDB();
    const tx = db.transaction(TELEMETRY_STORE, "readonly");
    const store = tx.objectStore(TELEMETRY_STORE);
    const req = store.get(`${currentUserId}_${uKey}`);
    return new Promise(resolve => {
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.stream)) {
          act.telemetry15s = req.result.stream;
          resolve(act.telemetry15s);
        } else {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
};

async function clearLocalDatabase() {
  if(confirm("Tem a certeza que deseja apagar o histórico local? As atividades na nuvem Garmin serão recarregadas na próxima sincronização.")) {
    localStorage.removeItem(getDeletedIdsKey());
    const db = await initDB();
    const tx = db.transaction([STORE_NAME, TELEMETRY_STORE], "readwrite");
    tx.objectStore(STORE_NAME).delete(currentUserId);
    document.getElementById('summaryArea').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
    dbActivities = [];
  }
}

async function initializeAppForUser() {
  const savedData = await loadFromDB();
  if (savedData && savedData.length > 0) {
    const deletedKeys = getDeletedActivityKeys();
    let needsMigration = false;

    dbActivities = savedData.filter(a => {
      const k = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(a) : String(a.garminId || a.file);
      if (Array.isArray(a.telemetry15s) && a.telemetry15s.length > 0) needsMigration = true;
      return !deletedKeys.includes(k) && !deletedKeys.includes(String(a.garminId));
    });

    dbActivities.forEach(a => a.dateObj = new Date(a.dateObj));
    document.getElementById('uploadArea').style.display = 'none';
    if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
    processGlobalMetrics();
    renderSummaryTable();

    if (needsMigration) {
      setTimeout(() => saveToDB(dbActivities), 800);
    }
  }
  await checkGarminConnectionStatus();
  await syncWithGarminCloud();
}

async function syncWithGarminCloud() {
  if (!currentUserId) return;
  const msgEl = document.getElementById('statusMsg');
  msgEl.style.color = '#38bdf8';
  msgEl.innerText = 'A sincronizar atividades e telemetria com a nuvem Garmin...';

  try {
    const res = await fetch(`${GARMIN_API_URL}?google_id=${encodeURIComponent(currentUserId)}&t=${Date.now()}`);
    if (!res.ok) throw new Error('Falha ao contactar servidor Garmin');
    const cloudList = await res.json();
    const deletedKeys = getDeletedActivityKeys();

    let newCount = 0;
    let updatedCount = 0;

    for (const item of cloudList) {
      if (!item.id || item.id === 'dados') continue;
      if (deletedKeys.includes(String(item.id)) || deletedKeys.includes(`garmin_${item.id}`)) continue;

      const existingIdx = dbActivities.findIndex(a => String(a.garminId) === String(item.id));
      const existingAct = existingIdx !== -1 ? dbActivities[existingIdx] : null;

      const rm = existingAct ? existingAct.realMetrics : null;
      const em = existingAct ? existingAct.estMetrics : null;
      const baseM = rm || em || (existingAct ? existingAct.metrics : null);

      const hasValidPwr = baseM && baseM.avgPwr > 10;
      const hasValidDisp = baseM && baseM.dispWindows && Array.isArray(baseM.dispWindows[5]) && baseM.dispWindows[5].length > 0;
      const hasValidTel = existingAct && (existingAct.hasSavedTelemetry || (Array.isArray(existingAct.telemetry15s) && existingAct.telemetry15s.length > 2));

      if (existingIdx === -1 || !hasValidPwr || !hasValidDisp || !hasValidTel) {
        const detailRes = await fetch(`${GARMIN_API_URL}?google_id=${encodeURIComponent(currentUserId)}&id=${encodeURIComponent(item.id)}&t=${Date.now()}`);
        if (detailRes.ok) {
          const garminJson = await detailRes.json();
          const parsedAct = await parseGarminJsonToActivity(garminJson, item.id);
          if (parsedAct) {
            if (existingIdx !== -1) {
              dbActivities[existingIdx] = parsedAct;
              updatedCount++;
            } else {
              dbActivities.push(parsedAct);
              newCount++;
            }
          }
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('garmin') === 'ok') {
      msgEl.style.color = '#10b981';
      msgEl.innerText = 'Conta Garmin vinculada com sucesso!';
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (newCount > 0 || updatedCount > 0) {
      msgEl.style.color = '#10b981';
      msgEl.innerText = `${newCount} nova(s) e ${updatedCount} atividade(s) atualizada(s) da nuvem Garmin!`;
    } else if (dbActivities.length > 0) {
      msgEl.style.color = '#10b981';
      msgEl.innerText = 'Histórico atualizado com a nuvem Garmin.';
    } else {
      msgEl.innerText = '';
    }

    if (dbActivities.length > 0) {
      if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
      await saveToDB(dbActivities);
      document.getElementById('uploadArea').style.display = 'none';
      processGlobalMetrics();
      renderSummaryTable();
      updateDynamicCharts();
    } else {
      document.getElementById('uploadArea').style.display = 'block';
      document.getElementById('summaryArea').style.display = 'none';
    }
  } catch (err) {
    console.warn('Erro ao sincronizar Garmin:', err);
    msgEl.style.color = '#ef4444';
    msgEl.innerText = 'Modo offline: não foi possível verificar novas atividades na nuvem.';
  }
  setTimeout(() => { if (msgEl.innerText.includes('sincronizada') || msgEl.innerText.includes('atualizada') || msgEl.innerText.includes('atualizado') || msgEl.innerText.includes('vinculada')) msgEl.innerText = ''; }, 4000);
}

async function buildDualMetricsFromRecords(records, dateObj) {
  if (!records || records.length === 0) return { realMetrics: null, estMetrics: null, telemetry15s: [] };

  const hasRealPower = records.some(r => r.power > 15);
  const realMetrics = hasRealPower ? calculateMetrics(records) : null;

  let sumLat = 0, sumLon = 0, gpsCnt = 0;
  for (let i = 0; i < records.length; i += 10) {
    if (records[i].lat && records[i].lon && Math.abs(records[i].lat) > 0.01) {
      sumLat += records[i].lat;
      sumLon += records[i].lon;
      gpsCnt++;
    }
  }

  let weatherHourly = null;
  if (gpsCnt > 0 && typeof window.fetchHistoricalWeatherForActivity === 'function') {
    weatherHourly = await window.fetchHistoricalWeatherForActivity(sumLat / gpsCnt, sumLon / gpsCnt, dateObj);
  }

  let estMetrics = null;
  let telemetry15s = [];
  if (typeof window.simulatePowerAndTelemetry === 'function') {
    const simResult = window.simulatePowerAndTelemetry(records, weatherHourly, dateObj);
    telemetry15s = simResult.telemetry15s || [];
    estMetrics = calculateMetrics(simResult.simRecords);
    if (estMetrics) {
      estMetrics.isEstimated = true;
      estMetrics.isIndoorTrainer = simResult.isIndoor;
      const cfg = window.userPowerConfig || { totalWeightKg: 82, cda: 0.328, crr: 0.0045 };
      estMetrics.simParams = {
        totalWeightKg: cfg.totalWeightKg,
        cda: cfg.cda,
        crr: cfg.crr,
        weatherUsed: Boolean(weatherHourly)
      };
    }
  }

  return { realMetrics, estMetrics, telemetry15s };
}

async function parseGarminJsonToActivity(data, fallbackId) {
  if (!data) return null;
  let summary = null;
  let samples = [];

  if (Array.isArray(data.activityDetails) && data.activityDetails.length > 0) {
    const detailWithSamples = data.activityDetails.find(d => Array.isArray(d.samples) && d.samples.length > 0) || data.activityDetails[0];
    summary = detailWithSamples.summary || {};
    samples = detailWithSamples.samples || [];
  }
  if ((!samples || samples.length === 0) && Array.isArray(data.samples)) {
    samples = data.samples;
  }
  if (!summary && Array.isArray(data.activities) && data.activities.length > 0) {
    summary = data.activities[0];
    if ((!samples || samples.length === 0) && Array.isArray(summary.samples)) {
      samples = summary.samples;
    }
  }
  if (!summary && (data.summary || data.activityId || data.durationInSeconds)) {
    summary = data.summary || data;
  }
  if (!summary) return null;

  const actId = summary.activityId || fallbackId;
  const startSec = summary.startTimeInSeconds || Math.floor(Date.now() / 1000);
  const dateObj = new Date(startSec * 1000);
  const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const actName = summary.activityName || 'Tubarão Ciclismo de rua';

  let records = [];
  if (Array.isArray(samples) && samples.length > 0) {
    let prevLat = null, prevLon = null, lastBearing = null;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const ts = s.startTimeInSeconds || s.timestamp || (startSec + i);
      const lat = s.latitudeInDegree || 0;
      const lon = s.longitudeInDegree || 0;
      if (lat !== 0 && lon !== 0 && prevLat !== null && (lat !== prevLat || lon !== prevLon)) {
        if (typeof window.calculateBearingDeg === 'function') {
          lastBearing = window.calculateBearingDeg(prevLat, prevLon, lat, lon);
        }
      }
      if (lat !== 0 && lon !== 0) { prevLat = lat; prevLon = lon; }

      records.push({
        timestamp: ts,
        power: s.powerInWatts !== undefined ? s.powerInWatts : 0,
        hr: s.heartRate || 0,
        cad: s.bikeCadenceInRPM || 0,
        hasCadSensor: s.bikeCadenceInRPM !== undefined,
        speed: (s.speedMetersPerSecond || 0) * 3.6,
        distance: s.totalDistanceInMeters || 0,
        altitude: s.elevationInMeters !== undefined ? s.elevationInMeters : null,
        lat,
        lon,
        bearing: lastBearing
      });
    }
  }

  if (records.length === 0 && (summary.distanceInMeters > 200 || summary.durationInSeconds > 60)) {
    const dur = Math.max(60, summary.movingDurationInSeconds || summary.durationInSeconds || 3600);
    const distM = summary.distanceInMeters || 0;
    const spdMs = summary.averageSpeedInMetersPerSecond || (distM / dur);
    const spdKmh = spdMs * 3.6;
    const hrAvg = Math.round(summary.averageHeartRateInBeatsPerMinute || 145);
    const pwrAvg = Math.round(summary.averagePowerInWatts || 0);
    const startLat = summary.startingLatitudeInDegree || -28.48;
    const startLon = summary.startingLongitudeInDegree || -49.00;
    const elevGain = summary.totalElevationGainInMeters || summary.elevationGainInMeters || 35;

    for (let t = 0; t < dur; t += 5) {
      const prog = t / dur;
      const wave = Math.sin(prog * Math.PI * 4);
      const synthAlt = 12 + (elevGain * 0.25) * Math.sin(prog * Math.PI * 2);
      const stepPwr = pwrAvg > 0 ? Math.max(40, Math.round(pwrAvg + wave * 18)) : 0;
      const stepHr = Math.max(90, Math.round(hrAvg + wave * 6));
      records.push({
        timestamp:
