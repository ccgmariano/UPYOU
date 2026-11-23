// Núcleo Principal Otimizado (Abertura Instantânea via Cache Local + Sync Contínuo Supabase/Garmin em Segundo Plano)
let dbActivities = [];
let currentUserId = null;
let currentUserName = "";
let userMaxHr = 187;
let activeDashboardTabId = "tableTab";

const GOOGLE_CLIENT_ID = "731921508137-alvl8q48tpsvhp02531v1el2naia457g.apps.googleusercontent.com";
const DB_NAME = "UpYouDB";
const STORE_NAME = "activitiesStore";
const TELEMETRY_STORE = "telemetryStore";
const GARMIN_API_URL = "https://garmin-webhook-731921508137.us-central1.run.app";

const CURRENT_DATA_SCHEMA_VERSION = 4;

// --- AUTO-AJUSTE DA ORDEM DAS TABS POR FREQUÊNCIA DE ACESSO ---
function getTabUsageStorageKey() {
  return `upyou_tab_clicks_${currentUserId || 'default'}`;
}

function getTabClickCounts() {
  try {
    const raw = localStorage.getItem(getTabUsageStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveTabClickCounts(counts) {
  try {
    localStorage.setItem(getTabUsageStorageKey(), JSON.stringify(counts));
  } catch (e) {}
}

function recordTabAccess(tabId) {
  if (!tabId) return;
  const counts = getTabClickCounts();
  counts[tabId] = (counts[tabId] || 0) + 1;
  saveTabClickCounts(counts);
}

function applyTabOrderByUsage(preserveScrollTabId = null) {
  const nav = document.getElementById('dashboardNavTabs');
  if (!nav) return;

  const buttons = Array.from(nav.querySelectorAll('.tab-btn'));
  if (buttons.length <= 1) return;

  buttons.forEach((btn, idx) => {
    if (btn.dataset.origOrder === undefined) {
      btn.dataset.origOrder = String(idx);
    }
  });

  const counts = getTabClickCounts();
  const hasAnyClick = buttons.some(btn => (counts[btn.dataset.tab] || 0) > 0);
  if (!hasAnyClick) return;

  const targetBtn = preserveScrollTabId
    ? buttons.find(b => b.dataset.tab === preserveScrollTabId)
    : null;
  const prevLeftOffset = targetBtn ? targetBtn.getBoundingClientRect().left : null;

  buttons.sort((a, b) => {
    const tabA = a.dataset.tab;
    const tabB = b.dataset.tab;
    const cA = counts[tabA] || 0;
    const cB = counts[tabB] || 0;
    if (cB !== cA) return cB - cA;
    return parseInt(a.dataset.origOrder, 10) - parseInt(b.dataset.origOrder, 10);
  });

  const fragment = document.createDocumentFragment();
  buttons.forEach(btn => fragment.appendChild(btn));
  nav.appendChild(fragment);

  if (targetBtn && prevLeftOffset !== null) {
    const newLeftOffset = targetBtn.getBoundingClientRect().left;
    nav.scrollLeft += (newLeftOffset - prevLeftOffset);
  }
}

function activateFirstOrderedTab(renderNow = false) {
  const nav = document.getElementById('dashboardNavTabs');
  const firstBtn = nav ? nav.querySelector('.tab-btn') : null;
  const firstTabId = (firstBtn && firstBtn.dataset.tab) ? firstBtn.dataset.tab : 'tableTab';
  window.switchDashboardTab(firstTabId, firstBtn, false, renderNow);
}

window.initGoogleSignIn = function() {
  const btnContainer = document.getElementById('googleSignInBtn');
  if (!btnContainer || btnContainer.childElementCount > 0) return;

  if (window.google && google.accounts && google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      google.accounts.id.renderButton(btnContainer, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: 'signin_with',
        size: 'large',
        logo_alignment: 'left'
      });
    } catch (e) {
      console.warn('Erro ao renderizar botão Google:', e);
    }
  } else {
    setTimeout(window.initGoogleSignIn, 250);
  }
};

window.addEventListener('load', window.initGoogleSignIn);

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
  if (typeof window.deleteActivityFromSupabase === 'function') {
    await window.deleteActivityFromSupabase(uKey).catch(() => {});
  }

  if (act.garminId) {
    addDeletedActivityKey(String(act.garminId));
    if (typeof window.deleteActivityFromSupabase === 'function') {
      await window.deleteActivityFromSupabase(String(act.garminId)).catch(() => {});
    }
    try {
      fetch(`${GARMIN_API_URL}?action=delete&google_id=${encodeURIComponent(currentUserId)}&id=${encodeURIComponent(act.garminId)}`, { method: 'DELETE' }).catch(() => {});
    } catch (e) {}
  }

  dbActivities.splice(idx, 1);
  await saveToDB(dbActivities, false);

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
  window.initGoogleSignIn();

  const savedUser = localStorage.getItem('upyou_user') || sessionStorage.getItem('upyou_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      currentUserId = parsed.id;
      currentUserName = parsed.name;
      localStorage.setItem('upyou_user', JSON.stringify({ id: currentUserId, name: currentUserName }));
      loadUserPreferences();
      if (typeof loadPowerEnginePreferences === 'function') loadPowerEnginePreferences();
      applyTabOrderByUsage();
      activateFirstOrderedTab(false);
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

window.handleCredentialResponse = function(response) {
  if (!response || !response.credential) return;
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
  applyTabOrderByUsage();
  activateFirstOrderedTab(false);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('userGreeting').innerText = currentUserName;

  initializeAppForUser();
};

// --- SINCRONIZAÇÃO DE PERFIL (NUVEM SUPABASE) ---
let _isApplyingCloudProfile = false;

function collectUserProfileSettings() {
  let weightHistory = [];
  try {
    weightHistory = JSON.parse(localStorage.getItem('upyou_weight_history_v1') || '[]');
  } catch (e) {}

  return {
    totalWeight: parseFloat(document.getElementById('totalWeightInput')?.value) || 82,
    userHeight: parseFloat(document.getElementById('userHeightInput')?.value) || 175,
    userAge: parseInt(document.getElementById('userAgeInput')?.value, 10) || 50,
    maxHr: parseInt(document.getElementById('maxHrInput')?.value, 10) || userMaxHr || 187,
    bikeType: document.getElementById('bikeTypeSelect')?.value || 'road',
    weightHistory: Array.isArray(weightHistory) ? weightHistory : []
  };
}

window.syncUserProfileToCloud = async function() {
  if (_isApplyingCloudProfile || !currentUserId || typeof window.saveUserProfileToSupabase !== 'function') return;
  const settings = collectUserProfileSettings();
  await window.saveUserProfileToSupabase(settings);
};

async function syncUserProfileFromCloud() {
  if (!currentUserId || typeof window.fetchUserProfileFromSupabase !== 'function') return;
  const cloudRow = await window.fetchUserProfileFromSupabase();

  if (!cloudRow || !cloudRow.settings || Object.keys(cloudRow.settings).length === 0) {
    // Primeiro acesso sem perfil na nuvem: envia os dados locais atuais
    await window.syncUserProfileToCloud();
    return;
  }

  const s = cloudRow.settings;
  _isApplyingCloudProfile = true;
  try {
    if (s.totalWeight) {
      const el = document.getElementById('totalWeightInput');
      if (el) el.value = s.totalWeight;
    }
    if (s.userHeight) {
      const el = document.getElementById('userHeightInput');
      if (el) el.value = s.userHeight;
    }
    if (s.userAge) {
      const el = document.getElementById('userAgeInput');
      if (el) el.value = s.userAge;
      localStorage.setItem('upyou_user_age_v1', String(s.userAge));
    }
    if (s.maxHr) {
      userMaxHr = parseInt(s.maxHr, 10) || 187;
      const el = document.getElementById('maxHrInput');
      if (el) el.value = userMaxHr;
      localStorage.setItem(`upyou_maxhr_${currentUserId}`, String(userMaxHr));
    }
    if (s.bikeType) {
      const el = document.getElementById('bikeTypeSelect');
      if (el) el.value = s.bikeType;
    }
    if (Array.isArray(s.weightHistory)) {
      localStorage.setItem('upyou_weight_history_v1', JSON.stringify(s.weightHistory));
    }
    if (typeof window.updatePowerEngineParams === 'function') window.updatePowerEngineParams();
    updateHrSubtitle();
  } finally {
    _isApplyingCloudProfile = false;
  }
}

// Salva na nuvem automaticamente quando qualquer campo do perfil mudar
window.addEventListener('DOMContentLoaded', () => {
  ['totalWeightInput', 'userHeightInput', 'userAgeInput', 'maxHrInput', 'bikeTypeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => window.syncUserProfileToCloud());
  });
});

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
        const statusTxt = document.getElementById('garminStatusText');
        const btn = document.getElementById('btnConnectGarmin');
        if (badge) badge.style.display = 'inline-flex';
        if (statusTxt) statusTxt.innerText = 'Garmin Conectado';
        if (btn) btn.innerText = 'Reconectar Garmin';
      }
    }
  } catch (e) {
    console.warn('Não foi possível verificar status Garmin:', e);
  }
}

function initDB() {
  return new Promise((resolve, reject) => {
    const lastVersion = parseInt(localStorage.getItem('upyou_db_schema_version') || String(CURRENT_DATA_SCHEMA_VERSION), 10);
    const targetVersion = Math.max(CURRENT_DATA_SCHEMA_VERSION, isNaN(lastVersion) ? CURRENT_DATA_SCHEMA_VERSION : lastVersion);

    const openWithVersion = (ver) => {
      const request = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
        if (!db.objectStoreNames.contains(TELEMETRY_STORE)) db.createObjectStore(TELEMETRY_STORE, { keyPath: "id" });
        localStorage.setItem('upyou_db_schema_version', String(db.version));
      };
      request.onsuccess = () => {
        const db = request.result;
        localStorage.setItem('upyou_db_schema_version', String(db.version));
        resolve(db);
      };
      request.onerror = () => {
        if (ver && request.error && request.error.name === 'VersionError') {
          openWithVersion(null);
        } else {
          reject(request.error);
        }
      };
    };

    openWithVersion(targetVersion);
  });
}

async function saveToDB(activities, syncCloud = true) {
  if (!currentUserId) return;
  try {
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
    await new Promise(resolve => tx.oncomplete = resolve);
  } catch (e) {}

  if (syncCloud && typeof window.upsertActivitiesToSupabase === 'function') {
    try {
      await window.upsertActivitiesToSupabase(activities);
    } catch (e) {
      console.warn('Falha ao sincronizar com Supabase:', e);
    }
  }
}

async function loadFromDB() {
  if (!currentUserId) return null;
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(currentUserId);
    return await new Promise(resolve => {
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

window.loadTelemetryForActivityOnDemand = async function(act) {
  if (!act || (Array.isArray(act.telemetry15s) && act.telemetry15s.length > 0)) return act?.telemetry15s || [];
  const uKey = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(act) : String(act.garminId || act.file);

  if (typeof window.downloadTelemetryStreamFromSupabase === 'function') {
    const cloudStream = await window.downloadTelemetryStreamFromSupabase(uKey);
    if (Array.isArray(cloudStream) && cloudStream.length > 0) {
      act.telemetry15s = cloudStream;
      act.hasSavedTelemetry = true;
      return act.telemetry15s;
    }
  }

  try {
    const db = await initDB();
    const tx = db.transaction(TELEMETRY_STORE, "readonly");
    const store = tx.objectStore(TELEMETRY_STORE);
    const localStream = await new Promise(resolve => {
      const req = store.get(`${currentUserId}_${uKey}`);
      req.onsuccess = () => resolve(req.result && Array.isArray(req.result.stream) ? req.result.stream : null);
      req.onerror = () => resolve(null);
    });
    if (localStream && localStream.length > 0) {
      act.telemetry15s = localStream;
      return act.telemetry15s;
    }
  } catch (e) {}

  return [];
};

async function clearLocalDatabase() {
  if (confirm("Tem a certeza que deseja limpar o cache local deste navegador? Seus dados permanecem salvos na nuvem Supabase.")) {
    try {
      const db = await initDB();
      const tx = db.transaction([STORE_NAME, TELEMETRY_STORE], "readwrite");
      tx.objectStore(STORE_NAME).delete(currentUserId);
      await new Promise(resolve => tx.oncomplete = resolve);
    } catch (e) {}
    dbActivities = [];
    await syncWithSupabaseCloud();
  }
}

async function syncWithSupabaseCloud() {
  if (!currentUserId || typeof window.fetchActivitiesFromSupabase !== 'function') return;
  const msgEl = document.getElementById('statusMsg');

  try {
    const cloudActs = await window.fetchActivitiesFromSupabase();
    if (!Array.isArray(cloudActs)) return;

    const deletedKeys = getDeletedActivityKeys();
    const getKey = (a) => typeof window.getActivityUniqueKey === 'function'
      ? window.getActivityUniqueKey(a)
      : String(a.garminId || a.file || `${a.date}_${a.name}`);

    const validCloudActs = cloudActs.filter(a => {
      const k = getKey(a);
      return !deletedKeys.includes(k) && (!a.garminId || !deletedKeys.includes(String(a.garminId)));
    });

    const mergedMap = new Map();
    validCloudActs.forEach(a => mergedMap.set(getKey(a), a));
    dbActivities.forEach(a => {
      const k = getKey(a);
      if (!mergedMap.has(k)) mergedMap.set(k, a);
    });

    dbActivities = Array.from(mergedMap.values());
    dbActivities.forEach(a => { a.dateObj = new Date(a.dateObj); });
    if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();

    const loadingEl = document.getElementById('loadingCloudArea');
    if (loadingEl) loadingEl.style.display = 'none';

    if (dbActivities.length > 0) {
      document.getElementById('summaryArea').style.display = 'block';
      processGlobalMetrics();
      renderSummaryTable();
      updateDynamicCharts();
      saveToDB(dbActivities, false).catch(() => {});
    }

    const cloudKeySet = new Set(validCloudActs.map(getKey));
    const missingInCloud = dbActivities.filter(a => !cloudKeySet.has(getKey(a)));

    if (missingInCloud.length > 0 && typeof window.upsertActivitiesToSupabase === 'function') {
      const totalMissing = missingInCloud.length;
      if (msgEl) {
        msgEl.style.color = '#38bdf8';
        msgEl.innerText = `A enviar ${totalMissing} atividade(s) para o Supabase...`;
      }
      await window.upsertActivitiesToSupabase(missingInCloud, (done, total) => {
        if (msgEl) msgEl.innerText = `A enviar para o Supabase: ${done} de ${total}...`;
      });
    }

    if (msgEl) {
      msgEl.innerText = '';
    }
  } catch (e) {
    console.warn('Erro ao sincronizar com Supabase:', e);
    const loadingEl = document.getElementById('loadingCloudArea');
    if (loadingEl && dbActivities.length === 0) {
      loadingEl.innerText = 'Não foi possível carregar as atividades da nuvem.';
    }
  }
}

async function initializeAppForUser() {
  const loadingEl = document.getElementById('loadingCloudArea');
  const savedData = await loadFromDB();

  if (Array.isArray(savedData) && savedData.length > 0) {
    const deletedKeys = getDeletedActivityKeys();
    dbActivities = savedData.filter(a => {
      const k = typeof window.getActivityUniqueKey === 'function' ? window.getActivityUniqueKey(a) : String(a.garminId || a.file);
      return !deletedKeys.includes(k) && !deletedKeys.includes(String(a.garminId));
    });
    dbActivities.forEach(a => { a.dateObj = new Date(a.dateObj); });

    if (loadingEl) loadingEl.style.display = 'none';
    document.getElementById('summaryArea').style.display = 'block';
    if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
    processGlobalMetrics();
    renderSummaryTable();
    updateDynamicCharts();
  } else {
    if (loadingEl) {
      loadingEl.innerText = 'Aguardando carregamento das atividades...';
      loadingEl.style.display = 'block';
    }
    document.getElementById('summaryArea').style.display = 'none';
  }

  await syncUserProfileFromCloud();
  await syncWithSupabaseCloud();
  await checkGarminConnectionStatus();
  await syncWithGarminCloud();

  if (loadingEl) loadingEl.style.display = 'none';
  if (dbActivities.length > 0) {
    document.getElementById('summaryArea').style.display = 'block';
  }
}

async function syncWithGarminCloud() {
  if (!currentUserId) return;
  const msgEl = document.getElementById('statusMsg');

  try {
    const res = await fetch(`${GARMIN_API_URL}?google_id=${encodeURIComponent(currentUserId)}&t=${Date.now()}`);
    if (!res.ok) throw new Error('Falha ao contactar servidor Garmin');
    const cloudList = await res.json();
    const deletedKeys = getDeletedActivityKeys();

    let newCount = 0;
    let updatedCount = 0;
    const touchedActs = [];

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
            touchedActs.push(parsedAct);
          }
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('garmin') === 'ok') {
      if (msgEl) {
        msgEl.style.color = '#10b981';
        msgEl.innerText = 'Conta Garmin vinculada com sucesso!';
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if ((newCount > 0 || updatedCount > 0) && msgEl) {
      msgEl.style.color = '#10b981';
      msgEl.innerText = `${newCount} nova(s) e ${updatedCount} atividade(s) sincronizada(s) com a nuvem!`;
    }

    if (touchedActs.length > 0) {
      await saveToDB(dbActivities, false).catch(() => {});
      if (typeof window.upsertActivitiesToSupabase === 'function') {
        await window.upsertActivitiesToSupabase(touchedActs).catch(() => {});
      }
    }

    if (dbActivities.length > 0) {
      if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
      document.getElementById('summaryArea').style.display = 'block';
      processGlobalMetrics();
      renderSummaryTable();
      updateDynamicCharts();
    }
  } catch (err) {
    console.warn('Erro ao sincronizar Garmin:', err);
  }
  setTimeout(() => {
    if (msgEl && (msgEl.innerText.includes('sincronizada') || msgEl.innerText.includes('vinculada'))) {
      msgEl.innerText = '';
    }
  }, 4000);
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
        timestamp: startSec + t,
        power: stepPwr,
        hr: stepHr,
        cad: Math.round(summary.averageBikeCadenceInRoundsPerMinute || 82),
        hasCadSensor: Boolean(summary.averageBikeCadenceInRoundsPerMinute),
        speed: Math.max(10, spdKmh + wave * 2.2),
        distance: prog * distM,
        altitude: synthAlt,
        lat: startLat + prog * 0.025,
        lon: startLon + prog * 0.025,
        bearing: prog < 0.5 ? 35 : 215
      });
    }
  }

  const { realMetrics, estMetrics, telemetry15s } = await buildDualMetricsFromRecords(records, dateObj);
  let activeMetrics = realMetrics || estMetrics;

  if (!activeMetrics && summary) {
    const totalSecs = summary.durationInSeconds || 0;
    const distKm = ((summary.distanceInMeters || 0) / 1000).toFixed(2);
    const avgSpeed = ((summary.averageSpeedInMetersPerSecond || 0) * 3.6).toFixed(1);
    const avgPwr = Math.round(summary.averagePowerInWatts || 0);
    const avgHr = Math.round(summary.averageHeartRateInBeatsPerMinute || 0);
    const avgCad = Math.round(summary.averageBikeCadenceInRoundsPerMinute || 0);
    activeMetrics = {
      totalSecs, movingSecs: totalSecs, distKm, avgPwr, avgHr, avgCad, avgSpeed,
      top4: [], drift: null, driftEligible: false,
      mmp20: totalSecs >= 1200 ? avgPwr : 0,
      mhr20: totalSecs >= 1200 ? avgHr : 0,
      pwrHist: {}, hrHist: {}, pwrHrPairs: {}, dispWindows: { 5: [], 15: [], 60: [], 300: [], 600: [], 900: [], 3600: [] },
      np: avgPwr, vi: avgPwr > 0 ? 1.0 : 0, blocksCount: 0
    };
  }

  if (!activeMetrics) return null;

  [realMetrics, estMetrics, activeMetrics].forEach(m => {
    if (!m) return;
    if (parseFloat(m.distKm) === 0 && summary.distanceInMeters) {
      m.distKm = (summary.distanceInMeters / 1000).toFixed(2);
    }
    if (m.totalSecs === 0 && summary.durationInSeconds) {
      m.totalSecs = summary.durationInSeconds;
    }
  });

  let finalRealMetrics = realMetrics;
  if (!finalRealMetrics && summary.averagePowerInWatts && summary.averagePowerInWatts > 15 && estMetrics) {
    finalRealMetrics = JSON.parse(JSON.stringify(estMetrics));
    finalRealMetrics.isEstimated = false;
    finalRealMetrics.avgPwr = Math.round(summary.averagePowerInWatts);
    finalRealMetrics.np = Math.round(summary.weightedAveragePowerInWatts || summary.averagePowerInWatts);
  } else if (!finalRealMetrics && estMetrics && records.length > 0 && summary.distanceInMeters > 1000) {
    finalRealMetrics = estMetrics;
  }

  return {
    garminId: String(actId),
    date: dateStr,
    name: actName,
    file: `garmin_${actId}.json`,
    metrics: finalRealMetrics || estMetrics || activeMetrics,
    realMetrics: finalRealMetrics,
    estMetrics,
    telemetry15s,
    hasSavedTelemetry: telemetry15s.length > 0,
    dateObj,
    source: 'garmin'
  };
}

window.triggerNavByTab = function(tabId) {
  const topBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  window.switchDashboardTab(tabId, topBtn);
};

window.switchDashboardTab = function(tabId, el, shouldRecord = true, shouldRender = true) {
  activeDashboardTabId = tabId;
  if (shouldRecord) recordTabAccess(tabId);

  const detailArea = document.getElementById('detailArea');
  const summaryArea = document.getElementById('summaryArea');
  if (detailArea) detailArea.style.display = 'none';
  if (summaryArea && shouldRender) summaryArea.style.display = 'block';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  ['tableTab', 'ftpTab', 'curvaPotenciaTab', 'zonesTab', 'pwrTimeTab', 'hrTimeTab', 'driftChartTab', 'viChartTab', 'structureVolTab', 'eficienciaTab', 'dispersaoTab', 'isoPotenciaTab', 'telemetriaTab', 'treinadorTab'].forEach(id => {
    const sec = document.getElementById(id);
    if (sec) sec.style.display = 'none';
  });

  if (el) el.classList.add('active');
  const targetSec = document.getElementById(tabId);
  if (targetSec) targetSec.style.display = 'block';

  if (shouldRecord) applyTabOrderByUsage(tabId);
  if (shouldRender) updateDynamicCharts();
};

window.syncFiltersAndUpdate = function(value) {
  document.querySelectorAll('.time-filter').forEach(select => select.value = value);
  updateDynamicCharts();
};

document.getElementById('zipInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

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

      const existingByKey = new Map();
      const getKey = (a) => typeof window.getActivityUniqueKey === 'function'
        ? window.getActivityUniqueKey(a)
        : String(a.garminId || a.file || `${a.date}_${a.name}`);
      dbActivities.forEach(a => existingByKey.set(getKey(a), a));

      const importedZipActs = [];

      for (let i = 0; i < queue.length; i++) {
        const task = queue[i];
        progressText.innerText = `A processar fisiologia, altimetria, cadência e vento (ERA5): ${i + 1} de ${queue.length}...`;
        progressFill.style.width = `${((i + 1) / queue.length) * 100}%`;

        let zipEntry = null;
        zip.forEach((path, entry) => { if (path.toLowerCase().includes(task.file.toLowerCase())) zipEntry = entry; });

        if (zipEntry) {
          try {
            const rawData = await zipEntry.async("uint8array");
            let decompressed = rawData;
            if (task.file.toLowerCase().endsWith('.gz')) decompressed = pako.inflate(rawData);
            const records = parseFitNative(decompressed);
            const dateObj = parseStravaDate(task.date);
            const { realMetrics, estMetrics, telemetry15s } = await buildDualMetricsFromRecords(records, dateObj);
            const activeMetrics = realMetrics || estMetrics;
            if (activeMetrics) {
              const actObj = { ...task, metrics: activeMetrics, realMetrics, estMetrics, telemetry15s, hasSavedTelemetry: telemetry15s.length > 0, dateObj, source: 'strava' };
              existingByKey.set(getKey(actObj), actObj);
              importedZipActs.push(actObj);
            }
          } catch (e) { console.warn(`Aviso: ${task.file}`); }
        }
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 1));
      }

      dbActivities = Array.from(existingByKey.values());
      document.getElementById('progressArea').style.display = 'none';
      if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
      processGlobalMetrics();
      await saveToDB(dbActivities, false);

      if (importedZipActs.length > 0 && typeof window.upsertActivitiesToSupabase === 'function') {
        progressText.innerText = "A enviar histórico para a nuvem Supabase...";
        document.getElementById('progressArea').style.display = 'block';
        progressFill.style.width = '100%';
        await window.upsertActivitiesToSupabase(importedZipActs, (done, total) => {
          progressText.innerText = `A sincronizar com a nuvem Supabase: ${done} de ${total}...`;
        }).catch(e => console.warn('Aviso upload Supabase:', e));
        document.getElementById('progressArea').style.display = 'none';
      }

      document.getElementById('summaryArea').style.display = 'block';
      renderSummaryTable();
      updateDynamicCharts();
      event.target.value = '';

    } catch (err) {
      msgEl.style.color = '#ef4444'; msgEl.innerText = 'Erro Crítico: ' + err.message; progressText.innerText = 'Interrompido.';
    }
  }, 500);
});

function parseStravaDate(str) {
  if (!str) return new Date();
  const months = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
  const parts = str.match(/(\d{1,2})\s+de\s+([a-zç]{3})[^\s]*\s+de\s+(\d{4})/i);
  if (parts) return new Date(parseInt(parts[3]), months[parts[2].toLowerCase()] || 0, parseInt(parts[1]), 11, 0, 0);
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

function parseFitNative(u8) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let offset = view.getUint8(0);
  const endOffset = offset + view.getUint32(4, true);
  const localDefinitions = {};
  const records = [];
  let prevLat = null, prevLon = null, prevTime = null, prevDist = null, lastBearing = null;

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
        let rec = { timestamp: 0, power: 0, hr: 0, cad: 0, hasCadSensor: false, speed: -1, distance: 0, altitude: null, lat: 0, lon: 0, bearing: null };
        let isRec = def.globalNum === 20;
        let lat = 0, lon = 0;

        for (const f of def.fields) {
          let val = 0;
          let signedVal = 0;
          if (f.size === 1) { val = view.getUint8(offset); signedVal = view.getInt8(offset); }
          else if (f.size === 2) { val = view.getUint16(offset, def.le); signedVal = view.getInt16(offset, def.le); }
          else if (f.size === 4) { val = view.getUint32(offset, def.le); signedVal = view.getInt32(offset, def.le); }
          offset += f.size;

          if (isRec) {
            if (f.num === 253) rec.timestamp = val;
            else if (f.num === 7) rec.power = (val !== 0xFFFF && val < 3000) ? val : 0;
            else if (f.num === 3) rec.hr = (val !== 0xFF && val < 240) ? val : 0;
            else if (f.num === 4) {
              if (val !== 0xFF && val < 200) { rec.cad = val; rec.hasCadSensor = true; }
            }
            else if (f.num === 5) rec.distance = (val !== 0xFFFFFFFF) ? val / 100 : 0;
            else if (f.num === 6) { if (val !== 0xFFFF) rec.speed = (val / 1000) * 3.6; }
            else if (f.num === 73 || f.num === 134) {
              if (val !== 0xFFFFFFFF) rec.speed = (val / 1000) * 3.6;
            }
            else if (f.num === 2) {
              if (val !== 0xFFFF) {
                const alt = (val / 5) - 500;
                if (alt >= -200 && alt <= 6000) rec.altitude = alt;
              }
            }
            else if (f.num === 78) {
              if (val !== 0xFFFFFFFF) {
                const alt = (val / 5) - 500;
                if (alt >= -200 && alt <= 6000) rec.altitude = alt;
              }
            }
            else if (f.num === 0) lat = (signedVal !== 0x7FFFFFFF && signedVal !== 0) ? signedVal * (180 / Math.pow(2, 31)) : 0;
            else if (f.num === 1) lon = (signedVal !== 0x7FFFFFFF && signedVal !== 0) ? signedVal * (180 / Math.pow(2, 31)) : 0;
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
                if (rec.distance === 0 && prevDist !== null) rec.distance = prevDist + distKm * 1000;
              } else {
                rec.speed = 0;
              }
            } else {
              rec.speed = 0;
            }
          }
          if (rec.speed > 130) rec.speed = 0;

          if (lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            rec.lat = lat;
            rec.lon = lon;
            if (prevLat !== null && (lat !== prevLat || lon !== prevLon) && typeof window.calculateBearingDeg === 'function') {
              const distStepMeters = getDistanceFromLatLonInKm(prevLat, prevLon, lat, lon) * 1000;
              if (distStepMeters >= 3.0) {
                lastBearing = window.calculateBearingDeg(prevLat, prevLon, lat, lon);
                prevLat = lat;
                prevLon = lon;
              }
            } else if (prevLat === null) {
              prevLat = lat;
              prevLon = lon;
            }
          }
          rec.bearing = lastBearing;
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

function calculateMetrics(records) {
  if (!records || records.length === 0) return null;
  records.sort((a, b) => a.timestamp - b.timestamp);

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

  const hasSpeedData = uniqueRecs.some(r => r.speed >= 3);

  let movingSecs = 0;
  let sumPwrDt = 0, sumSpeedDt = 0;
  let sumHrDt = 0, hrSecs = 0;
  let sumCadDt = 0, cadSecs = 0;

  const pwrHist = {};
  const hrHist = {};
  const pwrHrPairs = {};
  const movingSamples = [];

  for (let i = 0; i < uniqueRecs.length; i++) {
    const r = uniqueRecs[i];
    let dt = (i < uniqueRecs.length - 1) ? (uniqueRecs[i + 1].timestamp - r.timestamp) : 1;
    if (dt <= 0) dt = 1;
    if (dt > 10) dt = 1;

    const isMoving = hasSpeedData ? (r.speed >= 3) : (r.power > 0 || r.cad > 0 || r.hr > 90);
    if (!isMoving) continue;

    movingSecs += dt;
    sumPwrDt += (r.power || 0) * dt;
    sumSpeedDt += (r.speed || 0) * dt;

    if (r.hr > 40 && r.hr < 230) {
      sumHrDt += r.hr * dt;
      hrSecs += dt;
      hrHist[r.hr] = (hrHist[r.hr] || 0) + dt;
    }
    const cadVal = r.cad || r.cadence || 0;
    if (cadVal > 0 && cadVal < 190) {
      sumCadDt += cadVal * dt;
      cadSecs += dt;
    }

    const pBucket = Math.round((r.power || 0) / 5) * 5;
    if (r.power > 0) {
      pwrHist[pBucket] = (pwrHist[pBucket] || 0) + dt;
    }

    const elapsed = r.timestamp - startT;
    if (r.power > 20 && r.hr >= 60 && r.hr < 225 && (elapsed >= 300 || totalSecs < 600)) {
      if (!pwrHrPairs[pBucket]) pwrHrPairs[pBucket] = { sumHr: 0, secs: 0 };
      pwrHrPairs[pBucket].sumHr += r.hr * dt;
      pwrHrPairs[pBucket].secs += dt;
    }

    movingSamples.push({ elapsed, power: r.power || 0, hr: r.hr || 0, dt });
  }

  if (movingSecs === 0) return null;

  const dispWindows = { 5: [], 15: [], 60: [], 300: [], 600: [], 900: [], 3600: [] };
  [5, 15, 60, 300, 600, 900, 3600].forEach(wSize => {
    let accDt = 0, sPwr = 0, sHr = 0;
    for (let i = 0; i < movingSamples.length; i++) {
      const s = movingSamples[i];
      if (s.power > 10 && s.hr > 45 && s.hr < 230) {
        sPwr += s.power * s.dt;
        sHr += s.hr * s.dt;
        accDt += s.dt;
        if (accDt >= wSize) {
          const avgP = Math.round(sPwr / accDt);
          const avgH = Math.round(sHr / accDt);
          if (avgP >= 40 && avgH >= 50 && avgH <= 225) {
            dispWindows[wSize].push([avgP, avgH]);
          }
          accDt = 0; sPwr = 0; sHr = 0;
        }
      }
    }
  });

  const avgPwr = Math.round(sumPwrDt / movingSecs);
  const avgHr = hrSecs > 0 ? Math.round(sumHrDt / hrSecs) : 0;
  const avgCad = cadSecs > 0 ? Math.round(sumCadDt / cadSecs) : 0;
  const avgSpeed = (sumSpeedDt / movingSecs).toFixed(1);

  let timeline = [];
  let hrTimeline = [];
  for (let i = 0; i < uniqueRecs.length - 1; i++) {
    const curr = uniqueRecs[i];
    const gap = uniqueRecs[i + 1].timestamp - curr.timestamp;
    const fillPwr = gap <= 8 ? (curr.power || 0) : 0;
    const fillHr = (gap <= 12 && curr.hr > 45 && curr.hr < 230) ? curr.hr : 0;
    for (let s = 0; s < gap; s++) {
      timeline.push(fillPwr);
      hrTimeline.push(fillHr);
      if (timeline.length > 54000) break;
    }
  }
  const lastRec = uniqueRecs[uniqueRecs.length - 1];
  timeline.push(lastRec.power || 0);
  hrTimeline.push((lastRec.hr > 45 && lastRec.hr < 230) ? lastRec.hr : 0);

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

  const mmpCurve = {};
  [5, 15, 60, 300, 900, 1200, 3600, 7200].forEach(dur => {
    if (timeline.length >= dur) {
      let sum = 0;
      for (let i = 0; i < dur; i++) sum += timeline[i];
      let best = sum / dur;
      for (let i = dur; i < timeline.length; i++) {
        sum = sum - timeline[i - dur] + timeline[i];
        const avg = sum / dur;
        if (avg > best) best = avg;
      }
      mmpCurve[dur] = Math.round(best);
    } else {
      mmpCurve[dur] = 0;
    }
  });

  const mmp20 = mmpCurve[1200] || 0;

  let mhr20 = 0;
  if (hrTimeline.length >= 1200) {
    let sumH = 0, validH = 0;
    for (let i = 0; i < 1200; i++) {
      if (hrTimeline[i] > 0) { sumH += hrTimeline[i]; validH++; }
    }
    let maxHr20 = validH >= 1080 ? (sumH / validH) : 0;
    for (let i = 1200; i < hrTimeline.length; i++) {
      if (hrTimeline[i - 1200] > 0) { sumH -= hrTimeline[i - 1200]; validH--; }
      if (hrTimeline[i] > 0) { sumH += hrTimeline[i]; validH++; }
      if (validH >= 1080) {
        const avg20 = sumH / validH;
        if (avg20 > maxHr20) maxHr20 = avg20;
      }
    }
    mhr20 = Math.round(maxHr20);
  }

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

  const driftEligible = (movingSecs >= 1800 && vi > 0 && vi <= 1.12 && drift !== null && Math.abs(drift) <= 25);

  return {
    totalSecs, movingSecs, distKm: (maxDist / 1000).toFixed(2),
    avgPwr, avgHr, avgCad, avgSpeed, top4, drift, driftEligible, mmp20, mmpCurve, mhr20,
    pwrHist, hrHist, pwrHrPairs, dispWindows, np, vi, blocksCount
  };
}

function getActivityBest20MinHr(act) {
  if (!act || !act.metrics) return 0;
  const m = act.metrics;
  if (m.mhr20 && m.mhr20 >= 135) return m.mhr20;

  if ((m.totalSecs || 0) < 1200 && (m.movingSecs || 0) < 1200) return 0;

  if (m.dispWindows) {
    if (m.dispWindows[300] && m.dispWindows[300].length >= 4) {
      const arr = m.dispWindows[300];
      let best = 0;
      for (let i = 0; i <= arr.length - 4; i++) {
        const avg4 = (arr[i][1] + arr[i+1][1] + arr[i+2][1] + arr[i+3][1]) / 4;
        if (avg4 > best) best = avg4;
      }
      if (best >= 135) return Math.round(best);
    }
    if (m.dispWindows[60] && m.dispWindows[60].length >= 20) {
      const arr = m.dispWindows[60];
      let sum = 0;
      for (let i = 0; i < 20; i++) sum += arr[i][1];
      let best = sum / 20;
      for (let i = 20; i < arr.length; i++) {
        sum = sum - arr[i - 20][1] + arr[i][1];
        if (sum / 20 > best) best = sum / 20;
      }
      if (best >= 135) return Math.round(best);
    }
  }
  return 0;
}

let cachedFtpHistory = [];

function processGlobalMetrics() {
  if (typeof window.applyGlobalPowerSource === 'function') window.applyGlobalPowerSource();
  dbActivities.sort((a, b) => a.dateObj - b.dateObj);
  const daysWindow = 42;
  cachedFtpHistory = [];

  let firstValidMmp20 = 0;
  let firstValidMhr20 = 0;
  for (const a of dbActivities) {
    if (!firstValidMmp20 && a.metrics && a.metrics.mmp20 >= 100) firstValidMmp20 = a.metrics.mmp20;
    const h20 = getActivityBest20MinHr(a);
    if (!firstValidMhr20 && h20 >= 140) firstValidMhr20 = h20;
    if (firstValidMmp20 && firstValidMhr20) break;
  }

  let rollingFtp = firstValidMmp20 > 0 ? Math.round(firstValidMmp20 * 0.95) : 200;
  let rollingLthr = firstValidMhr20 > 0 ? Math.round(firstValidMhr20 * 0.96) : Math.round(userMaxHr * 0.89);

  for (let i = 0; i < dbActivities.length; i++) {
    const curr = dbActivities[i];
    const minDate = new Date(curr.dateObj.getTime() - (daysWindow * 86400000));
    const windowActs = dbActivities.filter(a => a.dateObj >= minDate && a.dateObj <= curr.dateObj);

    const validMmps = windowActs
      .filter(a => a.metrics && (a.metrics.totalSecs >= 1200 || !a.metrics.movingSecs) && a.metrics.mmp20 >= 100)
      .map(a => a.metrics.mmp20);

    const windowBestFtp = validMmps.length > 0 ? Math.round(Math.max(...validMmps) * 0.95) : 0;

    const validMhrs = windowActs
      .map(a => getActivityBest20MinHr(a))
      .filter(h => h >= 140 && h <= Math.round(userMaxHr * 0.98));

    const windowBestLthr = validMhrs.length > 0 ? Math.round(Math.max(...validMhrs) * 0.96) : 0;

    if (i > 0) {
      const daysDiff = Math.max(0, (curr.dateObj - dbActivities[i - 1].dateObj) / 86400000);
      const decayedPrevFtp = Math.round(rollingFtp * Math.pow(0.9993, daysDiff));
      rollingFtp = Math.max(windowBestFtp, decayedPrevFtp, 120);

      const decayedPrevLthr = Math.round(rollingLthr * Math.pow(0.9998, daysDiff));
      rollingLthr = Math.max(windowBestLthr, decayedPrevLthr, Math.round(userMaxHr * 0.84));
    } else {
      if (windowBestFtp > 0) rollingFtp = windowBestFtp;
      if (windowBestLthr > 0) rollingLthr = windowBestLthr;
    }

    curr.currentFtp = rollingFtp;
    curr._rawLthr = rollingLthr;
    curr.currentLthr = rollingLthr;
    cachedFtpHistory.push({ date: curr.dateObj, ftp: rollingFtp, lthr: rollingLthr });
  }

  // Aplica LTHR Consenso automaticamente se a opção estiver ativada
  if (typeof applyGlobalLthrMode === 'function' && localStorage.getItem('upyou_use_lthr_consensus') === 'true') {
    const savedCons = parseInt(localStorage.getItem('upyou_lthr_consensus_val'), 10);
    if (savedCons >= 120 && savedCons < 215) {
      applyGlobalLthrMode(savedCons);
    }
  }

  if (activeDashboardTabId === 'ftpTab') renderFtpChart(cachedFtpHistory);
  if (activeDashboardTabId === 'zonesTab') renderDynamicZones();
}

updateDynamicCharts = function() {
  switch (activeDashboardTabId) {
    case 'tableTab':
      renderSummaryTable();
      break;
    case 'ftpTab':
      renderFtpChart(cachedFtpHistory);
      break;
    case 'curvaPotenciaTab':
      if (typeof initCurvaPotenciaTab === 'function') initCurvaPotenciaTab();
      break;
    case 'zonesTab':
      renderDynamicZones();
      break;
    case 'pwrTimeTab':
      renderStackedZonesChart('pwr');
      break;
    case 'hrTimeTab':
      renderStackedZonesChart('hr');
      break;
    case 'driftChartTab':
      renderDriftChart();
      break;
    case 'viChartTab':
      renderViChart();
      break;
    case 'structureVolTab':
      renderStructureVolChart();
      break;
    case 'eficienciaTab':
      if (typeof renderEficienciaChart === 'function') renderEficienciaChart();
      break;
    case 'dispersaoTab':
      if (typeof initDispersaoTab === 'function') initDispersaoTab();
      break;
    case 'isoPotenciaTab':
      if (typeof initIsoPotenciaTab === 'function') initIsoPotenciaTab();
      break;
    case 'telemetriaTab':
      if (typeof initTelemetriaTab === 'function') initTelemetriaTab();
      break;
    case 'treinadorTab':
      if (typeof initTreinadorTab === 'function') initTreinadorTab();
      break;
  }
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180), dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function checkForUpdates() {
  const repoUrl = 'https://api.github.com/repos/ccgmariano/UPYOU/commits/main';
  fetch(repoUrl)
    .then(res => res.json())
    .then(data => {
      if (data && data.sha) {
        const localSha = localStorage.getItem('upyou_version_sha');
        if (localSha && localSha !== data.sha) {
          showUpdateBanner();
        } else if (!localSha) {
          localStorage.setItem('upyou_version_sha', data.sha);
        }
      }
    })
    .catch(e => console.warn('Falha silenciosa ao checar atualizações do GitHub:', e));
}

function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; background: #10b981; color: #020617; text-align: center; padding: 10px; z-index: 9999; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; gap: 16px; font-family: Inter, sans-serif; font-size: 0.85rem;';
  banner.innerHTML = `
    <span>&#128640; <strong>Nova versão detectada!</strong> Pressione <kbd style="background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px;">Ctrl + F5</kbd> ou clique ao lado.</span>
    <button onclick="forceAppUpdate()" style="background: #05070b; color: #34d399; border: 1px solid #05070b; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-weight: 700;">Atualizar Agora</button>
  `;
  document.body.appendChild(banner);
}

window.forceAppUpdate = function() {
  localStorage.removeItem('upyou_version_sha');
  window.location.href = window.location.pathname + '?v=' + new Date().getTime();
};

setTimeout(checkForUpdates, 3000);
setInterval(checkForUpdates, 180000);
