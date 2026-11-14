// Núcleo Principal (100% Fiel ao index.html original: IndexedDB UpYouDB v2, Leitor Nativo FIT/ZIP Strava e Sincronização Garmin)
let dbActivities = [];
let currentUserId = null;
let currentUserName = "";
let userMaxHr = 187;

const DB_NAME = "UpYouDB";
const STORE_NAME = "activitiesStore";
const GARMIN_API_URL = "https://garmin-webhook-731921508137.us-central1.run.app";

// Restaura sessão se o utilizador voltar do redirecionamento da Garmin
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = sessionStorage.getItem('upyou_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      currentUserId = parsed.id;
      currentUserName = parsed.name;
      loadUserPreferences();
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'flex';
      document.getElementById('userGreeting').innerText = `Olá, ${currentUserName}`;
      initializeAppForUser();
    } catch (e) {}
  }
});

function loadUserPreferences() {
  if (!currentUserId) return;
  const savedMaxHr = localStorage.getItem(`upyou_maxhr_${currentUserId}`);
  if (savedMaxHr) {
    userMaxHr = parseInt(savedMaxHr, 10) || 187;
    document.getElementById('maxHrInput').value = userMaxHr;
  }
  updateHrSubtitle();
}

window.updateUserMaxHr = function(val) {
  const parsed = parseInt(val, 10);
  if (parsed >= 120 && parsed <= 230) {
    userMaxHr = parsed;
    if (currentUserId) localStorage.setItem(`upyou_maxhr_${currentUserId}`, userMaxHr);
    updateHrSubtitle();
    if (dbActivities.length > 0) updateDynamicCharts();
  }
};

function updateHrSubtitle() {
  const sub = document.getElementById('hrZoneSubtitle');
  if (sub) sub.innerText = `Zonas baseadas na sua FC Máxima configurada (${userMaxHr} bpm). Eixo vertical = Horas Absolutas.`;
}

// --- SISTEMA DE LOGIN GOOGLE ---
function handleCredentialResponse(response) {
  const base64Url = response.credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  
  const payload = JSON.parse(jsonPayload);
  
  currentUserId = payload.sub;
  currentUserName = payload.given_name || payload.name;
  sessionStorage.setItem('upyou_user', JSON.stringify({ id: currentUserId, name: currentUserName }));

  loadUserPreferences();
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('userGreeting').innerText = `Olá, ${currentUserName}`;

  initializeAppForUser();
}

function logout() {
  currentUserId = null;
  dbActivities = [];
  sessionStorage.removeItem('upyou_user');
  location.href = location.pathname; 
}

// --- VINCULAR CONTA GARMIN (MULTIUSUÁRIO) ---
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
        document.getElementById('garminConnectedBadge').style.display = 'inline-block';
        document.getElementById('btnConnectGarmin').innerText = 'Reconectar Garmin';
        document.getElementById('btnConnectGarmin').style.background = '#475569';
      }
    }
  } catch (e) {
    console.warn('Não foi possível verificar status Garmin:', e);
  }
}

// --- BANCO DE DADOS LOCAL (Compatível com v2 e mesmo caso o navegador tenha aberto v3) ---
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME); // Sem forçar versão menor para abrir tanto v2 quanto v3 sem VersionError
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const nextVer = db.version + 1;
        db.close();
        const upg = indexedDB.open(DB_NAME, nextVer);
        upg.onupgradeneeded = (ev) => {
          ev.target.result.createObjectStore(STORE_NAME, { keyPath: "id" });
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
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put({ id: currentUserId, data: activities });
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

async function clearLocalDatabase() {
  if(confirm("Tem a certeza que deseja apagar o histórico local? As atividades na nuvem Garmin serão recarregadas na próxima sincronização.")) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(currentUserId);
    document.getElementById('summaryArea').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
    dbActivities = [];
  }
}

// --- INICIALIZAÇÃO E SINCRONIZAÇÃO GARMIN CLOUD ---
async function initializeAppForUser() {
  const savedData = await loadFromDB();
  if (savedData && savedData.length > 0) {
    dbActivities = savedData;
    dbActivities.forEach(a => a.dateObj = new Date(a.dateObj));
    document.getElementById('uploadArea').style.display = 'none';
    processGlobalMetrics();
    renderSummaryTable();
    updateDynamicCharts();
  }
  await checkGarminConnectionStatus();
  await syncWithGarminCloud();
}

async function syncWithGarminCloud() {
  if (!currentUserId) return;
  const msgEl = document.getElementById('statusMsg');
  msgEl.style.color = '#38bdf8';
  msgEl.innerText = 'A sincronizar atividades com a nuvem Garmin...';

  try {
    const res = await fetch(`${GARMIN_API_URL}?google_id=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error('Falha ao contactar servidor Garmin');
    const cloudList = await res.json();

    let newCount = 0;
    for (const item of cloudList) {
      if (!item.id || item.id === 'dados') continue;
      const existingIdx = dbActivities.findIndex(a => String(a.garminId) === String(item.id));
      if (existingIdx === -1 || !dbActivities[existingIdx].metrics.pwrHrPairs) {
        const detailRes = await fetch(`${GARMIN_API_URL}?google_id=${encodeURIComponent(currentUserId)}&id=${encodeURIComponent(item.id)}`);
        if (detailRes.ok) {
          const garminJson = await detailRes.json();
          const parsedAct = parseGarminJsonToActivity(garminJson, item.id);
          if (parsedAct) {
            if (existingIdx !== -1) {
              dbActivities[existingIdx] = parsedAct;
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
      msgEl.style.color = '#22c55e';
      msgEl.innerText = 'Conta Garmin vinculada com sucesso!';
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (newCount > 0) {
      msgEl.style.color = '#22c55e';
      msgEl.innerText = `${newCount} nova(s) atividade(s) Garmin sincronizada(s)!`;
    } else if (dbActivities.length > 0) {
      msgEl.style.color = '#22c55e';
      msgEl.innerText = 'Histórico atualizado com a nuvem Garmin.';
    } else {
      msgEl.innerText = '';
    }

    if (dbActivities.length > 0) {
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
    msgEl.style.color = '#f87171';
    msgEl.innerText = 'Modo offline: não foi possível verificar novas atividades na nuvem.';
  }
  setTimeout(() => { if (msgEl.innerText.includes('sincronizada') || msgEl.innerText.includes('atualizado') || msgEl.innerText.includes('vinculada')) msgEl.innerText = ''; }, 4000);
}

function parseGarminJsonToActivity(data, fallbackId) {
  let summary = null;
  let samples = [];

  if (data.activityDetails && data.activityDetails.length > 0) {
    const detail = data.activityDetails[0];
    summary = detail.summary || {};
    samples = detail.samples || [];
  } else if (data.activities && data.activities.length > 0) {
    summary = data.activities[0];
  } else {
    return null;
  }

  const actId = summary.activityId || fallbackId;
  const startSec = summary.startTimeInSeconds || Math.floor(Date.now() / 1000);
  const dateObj = new Date(startSec * 1000);
  const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const actName = summary.activityName || 'Pedalada Garmin';

  let records = [];
  if (samples.length > 0) {
    records = samples.map(s => ({
      timestamp: s.startTimeInSeconds || 0,
      power: s.powerInWatts !== undefined ? s.powerInWatts : 0,
      hr: s.heartRate || 0,
      cad: s.bikeCadenceInRPM || 0,
      speed: (s.speedMetersPerSecond || 0) * 3.6,
      distance: s.totalDistanceInMeters || 0
    })).filter(r => r.timestamp > 0);
  }

  let metrics = calculateMetrics(records);

  if (!metrics && summary) {
    const totalSecs = summary.durationInSeconds || 0;
    const distKm = ((summary.distanceInMeters || 0) / 1000).toFixed(2);
    const avgSpeed = ((summary.averageSpeedInMetersPerSecond || 0) * 3.6).toFixed(1);
    const avgPwr = Math.round(summary.averagePowerInWatts || 0);
    const avgHr = Math.round(summary.averageHeartRateInBeatsPerMinute || 0);
    const avgCad = Math.round(summary.averageBikeCadenceInRoundsPerMinute || 0);
    metrics = {
      totalSecs, movingSecs: totalSecs, distKm, avgPwr, avgHr, avgCad, avgSpeed,
      top4: [], drift: null, driftEligible: false, mmp20: totalSecs >= 1200 ? avgPwr : 0,
      pwrHist: {}, hrHist: {}, pwrHrPairs: {}, np: avgPwr, vi: avgPwr > 0 ? 1.0 : 0, blocksCount: 0
    };
  }

  if (!metrics) return null;

  if (parseFloat(metrics.distKm) === 0 && summary.distanceInMeters) {
    metrics.distKm = (summary.distanceInMeters / 1000).toFixed(2);
  }
  if (metrics.totalSecs === 0 && summary.durationInSeconds) {
    metrics.totalSecs = summary.durationInSeconds;
  }

  return {
    garminId: String(actId),
    date: dateStr,
    name: actName,
    file: `garmin_${actId}.json`,
    metrics,
    dateObj,
    source: 'garmin'
  };
}

window.switchDashboardTab = function(tabId, el) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  ['tableTab', 'ftpTab', 'zonesTab', 'pwrTimeTab', 'hrTimeTab', 'driftChartTab', 'viChartTab', 'structureVolTab'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  el.classList.add('active');
  document.getElementById(tabId).style.display = 'block';
  if (document.getElementById(tabId).classList.contains('dynamic-tab')) updateDynamicCharts();
  if (tabId === 'ftpTab' || tabId === 'zonesTab') processGlobalMetrics();
};

window.syncFiltersAndUpdate = function(value) {
  document.querySelectorAll('.time-filter').forEach(select => select.value = value);
  updateDynamicCharts();
};

document.getElementById('zipInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('uploadArea').style.display = 'none';
  document.getElementById('summaryArea').style.display = 'none';
  document.getElementById('progressArea').style.display = 'block';
  const msgEl = document.getElementById('statusMsg');
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');

  msgEl.innerText = '';
  document.body.offsetHeight; 

  setTimeout(async () => {
    try {
      progressText.innerText = "A carregar o ZIP para a memória...";
      const jszip = new JSZip();
      const zip = await jszip.loadAsync(file);
      
      let csvEntry = null;
      zip.forEach((path, entry) => { if (path.toLowerCase().includes('activities.csv')) csvEntry = entry; });
      if (!csvEntry) throw new Error("O ficheiro 'activities.csv' não foi encontrado.");

      const csvText = await csvEntry.async("string");
      const lines = csvText.split('\n');
      let queue = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let cols = [];
        let inQuote = false, val = '';
        for (let ch of line) {
          if (inQuote) { if (ch === '"') inQuote = false; else val += ch; } 
          else { if (ch === '"') inQuote = true; else if (ch === ',') { cols.push(val); val = ''; } else val += ch; }
        }
        cols.push(val);
        const filePath = cols.find(c => c && c.toLowerCase().includes('activities/') && (c.toLowerCase().endsWith('.fit.gz') || c.toLowerCase().endsWith('.fit')));
        if (filePath) queue.push({ date: cols[1] || 'Data', name: cols[2] || 'Pedalada', file: filePath });
      }

      const garminActs = dbActivities.filter(a => a.source === 'garmin');
      dbActivities = [...garminActs];

      for (let i = 0; i < queue.length; i++) {
        const task = queue[i];
        progressText.innerText = `A processar fisiologia e zonas: atividade ${i + 1} de ${queue.length}...`;
        progressFill.style.width = `${((i + 1) / queue.length) * 100}%`;

        let zipEntry = null;
        zip.forEach((path, entry) => { if (path.toLowerCase().includes(task.file.toLowerCase())) zipEntry = entry; });

        if (zipEntry) {
          try {
            const rawData = await zipEntry.async("uint8array");
            let decompressed = rawData;
            if (task.file.toLowerCase().endsWith('.gz')) decompressed = pako.inflate(rawData);
            const records = parseFitNative(decompressed);
            const metrics = calculateMetrics(records);
            if (metrics) dbActivities.push({ ...task, metrics, dateObj: parseStravaDate(task.date) });
          } catch (e) { console.warn(`Aviso: ${task.file}`); }
        }
        if(i % 5 === 0) await new Promise(r => setTimeout(r, 1)); 
      }

      document.getElementById('progressArea').style.display = 'none';
      processGlobalMetrics();
      
      await saveToDB(dbActivities);
      
      renderSummaryTable();
      updateDynamicCharts();

    } catch (err) {
      msgEl.style.color = '#f87171'; msgEl.innerText = 'Erro Crítico: ' + err.message; progressText.innerText = 'Interrompido.';
    }
  }, 500); 
});

function parseStravaDate(str) {
  if (!str) return new Date();
  const months = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
  const parts = str.match(/(\d{1,2})\s+de\s+([a-zç]{3})[^\s]*\s+de\s+(\d{4})/i);
  if (parts) return new Date(parseInt(parts[3]), months[parts[2].toLowerCase()] || 0, parseInt(parts[1]));
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Leitura nativa de ficheiros FIT com suporte à velocidade oficial do sensor/GPS
function parseFitNative(u8) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let offset = view.getUint8(0);
  const endOffset = offset + view.getUint32(4, true);
  const localDefinitions = {};
  const records = [];
  let prevLat = null, prevLon = null, prevTime = null, prevDist = null;

  while (offset < endOffset && offset < u8.length) {
    const header = view.getUint8(offset++);
    if ((header & 0x80) === 0) {
      const isDef = (header & 0x40) !== 0;
      const localNum = header & 0x0F;
      if (isDef) {
        offset += 1;
        const le = view.getUint8(offset++) === 0;
        const globalNum = view.getUint16(offset, le);
        offset += 2;
        const numFields = view.getUint8(offset++);
        const fields = [];
        for (let i = 0; i < numFields; i++) { fields.push({ num: view.getUint8(offset++), size: view.getUint8(offset++), type: view.getUint8(offset++) }); }
        if ((header & 0x20) !== 0) offset += view.getUint8(offset++) * 3;
        localDefinitions[localNum] = { globalNum, le, fields };
      } else {
        const def = localDefinitions[localNum];
        if (!def) break;
        let rec = { timestamp: 0, power: 0, hr: 0, cad: 0, speed: -1, distance: 0 };
        let isRec = def.globalNum === 20;
        let lat = 0, lon = 0;

        for (const f of def.fields) {
          let val = 0;
          if (f.size === 1) val = view.getUint8(offset);
          else if (f.size === 2) val = view.getUint16(offset, def.le);
          else if (f.size === 4) val = view.getUint32(offset, def.le);
          offset += f.size;

          if (isRec) {
            if (f.num === 253) rec.timestamp = val;
            else if (f.num === 7) rec.power = (val !== 0xFFFF && val < 3000) ? val : 0;
            else if (f.num === 3) rec.hr = (val !== 0xFF && val < 240) ? val : 0;
            else if (f.num === 4) rec.cad = (val !== 0xFF && val < 200) ? val : 0;
            else if (f.num === 5) rec.distance = (val !== 0xFFFFFFFF) ? val / 100 : 0;
            else if (f.num === 6) { if (val !== 0xFFFF) rec.speed = (val / 1000) * 3.6; }
            else if (f.num === 134) { if (val !== 0xFFFFFFFF) rec.speed = (val / 1000) * 3.6; }
            else if (f.num === 0) lat = (val !== 0x7FFFFFFF) ? val * (180 / Math.pow(2, 31)) : 0;
            else if (f.num === 1) lon = (val !== 0x7FFFFFFF) ? val * (180 / Math.pow(2, 31)) : 0;
          }
        }
        if (isRec && rec.timestamp > 0) {
          if (rec.speed < 0) {
            if (prevTime !== null && rec.timestamp > prevTime) {
              const dt = rec.timestamp - prevTime;
              if (prevDist !== null && rec.distance > prevDist) {
                rec.speed = ((rec.distance - prevDist) / dt) * 3.6;
              } else if (lat !== 0 && lon !== 0 && prevLat !== null) {
                const distKm = getDistanceFromLatLonInKm(prevLat, prevLon, lat, lon);
                rec.speed = distKm / (dt / 3600);
              } else {
                rec.speed = 0;
              }
            } else {
              rec.speed = 0;
            }
          }
          if (rec.speed > 130) rec.speed = 0; // Filtra spikes de GPS
          if (lat !== 0 && lon !== 0) { prevLat = lat; prevLon = lon; }
          prevTime = rec.timestamp;
          prevDist = rec.distance;
          records.push(rec);
        }
      }
    } else {
      const def = localDefinitions[(header >> 5) & 0x03];
      if (def) { for (const f of def.fields) offset += f.size; } else break;
    }
  }
  return records;
}

// Cálculo fisiológico completo com delta de tempo real (dt) e pareamento Potência-FC
function calculateMetrics(records) {
  if (!records || records.length === 0) return null;
  records.sort((a, b) => a.timestamp - b.timestamp);

  // Remove timestamps duplicados
  const uniqueRecs = [];
  for (let i = 0; i < records.length; i++) {
    if (i === 0 || records[i].timestamp > records[i - 1].timestamp) {
      uniqueRecs.push(records[i]);
    }
  }
  if (uniqueRecs.length === 0) return null;

  const startT = uniqueRecs[0].timestamp;
  const endT = uniqueRecs[uniqueRecs.length - 1].timestamp;
  const totalSecs = Math.max(1, endT - startT);
  const maxDist = uniqueRecs.reduce((max, r) => r.distance > max ? r.distance : max, 0);

  // Verifica se o treino é outdoor (com deslocamento) ou rolo indoor
  const hasSpeedData = uniqueRecs.some(r => r.speed >= 3);

  let movingSecs = 0;
  let sumPwrDt = 0, sumSpeedDt = 0;
  let sumHrDt = 0, hrSecs = 0;
  let sumCadDt = 0, cadSecs = 0;

  const pwrHist = {};
  const hrHist = {};
  const pwrHrPairs = {}; // Guarda { [wattBucket]: { sumHr, secs } } para Assinatura Cardíaca exata

  const movingSamples = [];

  for (let i = 0; i < uniqueRecs.length; i++) {
    const r = uniqueRecs[i];
    // Calcula a duração real desta amostra (corrige Smart Recording do Garmin Edge)
    let dt = (i < uniqueRecs.length - 1) ? (uniqueRecs[i + 1].timestamp - r.timestamp) : 1;
    if (dt <= 0) dt = 1;
    if (dt > 10) dt = 1; // Pausa de gravação / paragem no semáforo não infla zonas

    const isMoving = hasSpeedData ? (r.speed >= 3) : (r.power > 0 || r.cad > 0 || r.hr > 90);
    if (!isMoving) continue;

    movingSecs += dt;
    // Inclui os zeros em movimento (roda livre na descida/curva) na Potência Média!
    sumPwrDt += (r.power || 0) * dt;
    sumSpeedDt += (r.speed || 0) * dt;

    if (r.hr > 40 && r.hr < 230) {
      sumHrDt += r.hr * dt;
      hrSecs += dt;
      hrHist[r.hr] = (hrHist[r.hr] || 0) + dt;
    }
    if (r.cad > 0 && r.cad < 190) {
      sumCadDt += r.cad * dt;
      cadSecs += dt;
    }

    const pBucket = Math.round((r.power || 0) / 5) * 5;
    if (r.power > 0) {
      pwrHist[pBucket] = (pwrHist[pBucket] || 0) + dt;
    }

    // Assinatura Cardíaca: pareia Potência e FC segundo a segundo após os primeiros 5 min de inércia cardíaca
    const elapsed = r.timestamp - startT;
    if (r.power > 20 && r.hr >= 60 && r.hr < 225 && (elapsed >= 300 || totalSecs < 600)) {
      if (!pwrHrPairs[pBucket]) pwrHrPairs[pBucket] = { sumHr: 0, secs: 0 };
      pwrHrPairs[pBucket].sumHr += r.hr * dt;
      pwrHrPairs[pBucket].secs += dt;
    }

    movingSamples.push({ elapsed, power: r.power || 0, hr: r.hr || 0, dt });
  }

  if (movingSecs === 0) return null;

  const avgPwr = Math.round(sumPwrDt / movingSecs);
  const avgHr = hrSecs > 0 ? Math.round(sumHrDt / hrSecs) : 0;
  const avgCad = cadSecs > 0 ? Math.round(sumCadDt / cadSecs) : 0;
  const avgSpeed = (sumSpeedDt / movingSecs).toFixed(1);

  // Linha do tempo contínua de 1s interpolando Smart Recording (até 8s) e zerando pausas (>8s)
  let timeline = [];
  for (let i = 0; i < uniqueRecs.length - 1; i++) {
    const curr = uniqueRecs[i];
    const gap = uniqueRecs[i + 1].timestamp - curr.timestamp;
    const fillPwr = gap <= 8 ? (curr.power || 0) : 0;
    for (let s = 0; s < gap; s++) {
      timeline.push(fillPwr);
      if (timeline.length > 54000) break; // Limite de segurança de 15h
    }
  }
  timeline.push(uniqueRecs[uniqueRecs.length - 1].power || 0);

  // Potência Normalizada (NP)
  let np = avgPwr;
  if (timeline.length >= 30) {
    let rolling30 = [], sumPwr = 0;
    for (let i = 0; i < 30; i++) sumPwr += timeline[i];
    rolling30.push(sumPwr / 30);
    for (let i = 30; i < timeline.length; i++) {
      sumPwr = sumPwr - timeline[i - 30] + timeline[i];
      rolling30.push(sumPwr / 30);
    }
    let sum4 = 0;
    rolling30.forEach(p => sum4 += Math.pow(p, 4));
    np = Math.round(Math.pow(sum4 / rolling30.length, 0.25));
  }
  const vi = avgPwr > 0 ? parseFloat((np / avgPwr).toFixed(2)) : 0;

  // Deteção informativa de blocos (>= 5 min com Coeficiente de Variação < 15%)
  let blocksCount = 0;
  let skipUntil = 0;
  for (let i = 0; i <= timeline.length - 300; i += 15) {
    if (i < skipUntil) continue;
    let sum = 0;
    for (let j = 0; j < 300; j++) sum += timeline[i + j];
    let mean = sum / 300;
    if (mean >= 100) {
      let sumSq = 0;
      for (let j = 0; j < 300; j++) sumSq += Math.pow(timeline[i + j] - mean, 2);
      let stdDev = Math.sqrt(sumSq / 300);
      if ((stdDev / mean) <= 0.15) {
        blocksCount++;
        skipUntil = i + 300;
      }
    }
  }

  // Top 4 esforços de 4 minutos (240s)
  let top4 = [];
  const windowSize = 240;
  if (timeline.length >= windowSize) {
    let intervals = [];
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += timeline[j];
    intervals.push({ avg: Math.round(sum / windowSize), index: 0 });
    for (let i = 1; i <= timeline.length - windowSize; i++) {
      sum = sum - timeline[i - 1] + timeline[i + windowSize - 1];
      if (i % 5 === 0) intervals.push({ avg: Math.round(sum / windowSize), index: i });
    }
    intervals.sort((a, b) => b.avg - a.avg);
    for (const item of intervals) {
      if (item.avg > 0 && !top4.some(existing => Math.abs(existing.index - item.index) < windowSize)) {
        top4.push(item);
        if (top4.length === 4) break;
      }
    }
  }

  // MMP20: Exige pelo menos 20 minutos (1200s) reais de atividade!
  let mmp20 = 0;
  if (timeline.length >= 1200) {
    let sum = 0;
    for (let i = 0; i < 1200; i++) sum += timeline[i];
    let max20m = sum / 1200;
    for (let i = 1200; i < timeline.length; i++) {
      sum = sum - timeline[i - 1200] + timeline[i];
      if (sum / 1200 > max20m) max20m = sum / 1200;
    }
    mmp20 = Math.round(max20m);
  }

  // Cardiac Drift (Pa:Hr): Calculado após os primeiros 5 min de aquecimento
  let drift = null;
  const steadySamples = movingSamples.filter(s => s.elapsed >= 300 && s.hr > 60 && s.power > 20);
  const steadySecs = steadySamples.reduce((a, s) => a + s.dt, 0);
  if (steadySecs >= 600) {
    let accSec = 0;
    const halfSec = steadySecs / 2;
    const half1 = [], half2 = [];
    for (const s of steadySamples) {
      if (accSec < halfSec) half1.push(s); else half2.push(s);
      accSec += s.dt;
    }
    const calcEF = (arr) => {
      const totDt = arr.reduce((a, s) => a + s.dt, 0);
      if (totDt === 0) return 0;
      const p = arr.reduce((a, s) => a + s.power * s.dt, 0) / totDt;
      const h = arr.reduce((a, s) => a + s.hr * s.dt, 0) / totDt;
      return h > 0 ? p / h : 0;
    };
    const ef1 = calcEF(half1), ef2 = calcEF(half2);
    if (ef1 > 0 && ef2 > 0) drift = ((ef1 - ef2) / ef1) * 100;
  }

  // Elegibilidade fisiológica do Drift para o gráfico de evolução (mín. 30 min em movimento e ritmo constante VI <= 1.12)
  const driftEligible = (movingSecs >= 1800 && vi > 0 && vi <= 1.12 && drift !== null && Math.abs(drift) <= 25);

  return {
    totalSecs, movingSecs, distKm: (maxDist / 1000).toFixed(2),
    avgPwr, avgHr, avgCad, avgSpeed, top4, drift, driftEligible, mmp20,
    pwrHist, hrHist, pwrHrPairs, np, vi, blocksCount
  };
}

// Evolução de FTP com retenção fisiológica (evita quedas abruptas quando não há testes máximos de 20m)
function processGlobalMetrics() {
  dbActivities.sort((a, b) => a.dateObj - b.dateObj); 
  const daysWindow = 42;
  let ftpHistory = [];

  let firstValidMmp20 = 0;
  for (const a of dbActivities) {
    if (a.metrics && a.metrics.mmp20 >= 100) { firstValidMmp20 = a.metrics.mmp20; break; }
  }
  let rollingFtp = firstValidMmp20 > 0 ? Math.round(firstValidMmp20 * 0.95) : 200;

  for (let i = 0; i < dbActivities.length; i++) {
    const curr = dbActivities[i];
    const minDate = new Date(curr.dateObj.getTime() - (daysWindow * 86400000));
    const windowActs = dbActivities.filter(a => a.dateObj >= minDate && a.dateObj <= curr.dateObj);
    
    const validMmps = windowActs
      .filter(a => a.metrics && (a.metrics.totalSecs >= 1200 || !a.metrics.movingSecs) && a.metrics.mmp20 >= 100)
      .map(a => a.metrics.mmp20);

    const windowBestFtp = validMmps.length > 0 ? Math.round(Math.max(...validMmps) * 0.95) : 0;

    if (i > 0) {
      const daysDiff = Math.max(0, (curr.dateObj - dbActivities[i - 1].dateObj) / 86400000);
      const decayedPrev = Math.round(rollingFtp * Math.pow(0.9993, daysDiff));
      rollingFtp = Math.max(windowBestFtp, decayedPrev, 120);
    } else if (windowBestFtp > 0) {
      rollingFtp = windowBestFtp;
    }
    
    curr.currentFtp = rollingFtp;
    ftpHistory.push({ date: curr.dateObj, ftp: rollingFtp });
  }
  renderFtpChart(ftpHistory);
  renderDynamicZones();
}

function updateDynamicCharts() {
  renderStackedZonesChart('pwr');
  renderStackedZonesChart('hr');
  renderDriftChart();
  renderViChart();
  renderStructureVolChart();
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = (lat2 - lat1) * (Math.PI/180), dLon = (lon2 - lon1) * (Math.PI/180); const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); }
