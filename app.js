// Núcleo Principal do UPYOU: Autenticação, IndexedDB Multiusuário, Garmin Cloud Sync e Roteamento de Abas
const WEBHOOK_BASE_URL = "https://garmin-webhook-731921508137.us-central1.run.app";
const DB_NAME = "UpYouDB";
const DB_VERSION = 3;

let currentUser = null;
let currentActivities = [];
let modalChartInstance = null;

// Inicialização ao carregar a página
window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('upyou_google_user');
    const savedMaxHr = localStorage.getItem('upyou_max_hr');
    if (savedMaxHr && document.getElementById('max-hr')) {
        document.getElementById('max-hr').value = savedMaxHr;
    }

    document.getElementById('max-hr')?.addEventListener('change', (e) => {
        localStorage.setItem('upyou_max_hr', e.target.value);
        refreshActiveTab();
    });

    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            await enterApp();
        } catch (e) {
            console.error(e);
        }
    }
});

// Callback do Login Google
window.handleCredentialResponse = async function(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        currentUser = {
            googleId: payload.sub,
            name: payload.given_name || payload.name || 'Ciclista',
            email: payload.email
        };
        localStorage.setItem('upyou_google_user', JSON.stringify(currentUser));
        await enterApp();
    } catch (e) {
        alert("Erro ao autenticar com o Google.");
    }
};

async function enterApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('user-name').textContent = `Olá, ${currentUser.name}`;

    await loadActivitiesFromDB();
    await checkGarminConnectionStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get('garmin') === 'ok') {
        window.history.replaceState({}, document.title, window.location.pathname);
        await syncGarmin(true);
    }
}

window.logout = function() {
    localStorage.removeItem('upyou_google_user');
    currentUser = null;
    currentActivities = [];
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
};

// Gerenciamento do IndexedDB isolado por googleId
function openUpYouDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('activities')) {
                const store = db.createObjectStore('activities', { keyPath: 'uid' });
                store.createIndex('googleId', 'googleId', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveActivityToDB(activity) {
    if (!currentUser) return;
    const db = await openUpYouDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activities', 'readwrite');
        const store = tx.objectStore('activities');
        activity.googleId = currentUser.googleId;
        activity.uid = `${currentUser.googleId}_${activity.id}`;
        store.put(activity);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadActivitiesFromDB() {
    if (!currentUser) return;
    const db = await openUpYouDB();
    return new Promise((resolve) => {
        const tx = db.transaction('activities', 'readonly');
        const store = tx.objectStore('activities');
        const req = store.getAll();
        req.onsuccess = () => {
            const all = req.result || [];
            currentActivities = all
                .filter(item => !item.googleId || item.googleId === currentUser.googleId)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            refreshActiveTab();
            resolve();
        };
    });
}

window.clearLocalDatabase = async function() {
    if (!confirm("Deseja limpar as atividades salvas localmente neste navegador para sua conta?")) return;
    const db = await openUpYouDB();
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const req = store.getAll();
    req.onsuccess = () => {
        (req.result || []).forEach(item => {
            if (!item.googleId || item.googleId === currentUser.googleId) {
                store.delete(item.uid || item.id);
            }
        });
    };
    tx.oncomplete = async () => {
        currentActivities = [];
        refreshActiveTab();
    };
};

// Garmin OAuth e Sincronização Multiusuário
async function checkGarminConnectionStatus() {
    if (!currentUser) return;
    const statusBadge = document.getElementById('garmin-status');
    try {
        const res = await fetch(`${WEBHOOK_BASE_URL}?action=status&google_id=${encodeURIComponent(currentUser.googleId)}`);
        const data = await res.json();
        if (data.connected) {
            statusBadge.textContent = "✓ Garmin Vinculado";
            statusBadge.style.borderColor = "#16a34a";
            statusBadge.style.color = "#4ade80";
        } else {
            statusBadge.textContent = "Garmin Não Vinculado";
            statusBadge.style.borderColor = "#f59e0b";
            statusBadge.style.color = "#fbbf24";
        }
    } catch (e) {
        statusBadge.textContent = "Status Offline";
    }
}

window.connectGarmin = function() {
    if (!currentUser) return;
    window.location.href = `${WEBHOOK_BASE_URL}?action=auth&google_id=${encodeURIComponent(currentUser.googleId)}`;
};

window.syncGarmin = async function(forceBackfill = false) {
    if (!currentUser) return;
    const banner = document.getElementById('sync-progress');
    banner.style.display = 'block';
    banner.textContent = "Consultando atividades exclusivas da sua conta Garmin na nuvem...";

    try {
        const url = `${WEBHOOK_BASE_URL}?google_id=${encodeURIComponent(currentUser.googleId)}${forceBackfill ? '&force_backfill=1' : ''}`;
        const res = await fetch(url);
        const list = await res.json();

        if (!Array.isArray(list) || list.length === 0) {
            banner.textContent = "Nenhuma atividade nova na sua pasta da nuvem no momento.";
            setTimeout(() => { banner.style.display = 'none'; }, 3500);
            return;
        }

        const existingIds = new Set(currentActivities.map(a => String(a.id)));
        const newItems = list.filter(item => !existingIds.has(String(item.id)));

        let imported = 0;
        for (const item of newItems) {
            banner.textContent = `Baixando atividade Garmin ${imported + 1} de ${newItems.length}...`;
            const detailRes = await fetch(`${WEBHOOK_BASE_URL}?google_id=${encodeURIComponent(currentUser.googleId)}&id=${encodeURIComponent(item.id)}`);
            if (detailRes.ok) {
                const rawJson = await detailRes.json();
                const parsed = parseGarminActivityJson(item.id, rawJson);
                if (parsed) {
                    await saveActivityToDB(parsed);
                    imported++;
                }
            }
        }

        await loadActivitiesFromDB();
        banner.textContent = imported > 0
            ? `Sincronização concluída: ${imported} nova(s) atividade(s) carregada(s)!`
            : `Suas atividades Garmin já estão atualizadas (${list.length} na nuvem).`;
        setTimeout(() => { banner.style.display = 'none'; }, 4000);
    } catch (e) {
        console.error(e);
        banner.textContent = "Erro ao sincronizar com o servidor Garmin.";
        setTimeout(() => { banner.style.display = 'none'; }, 4000);
    }
};

function parseGarminActivityJson(actId, raw) {
    const detail = (raw.activityDetails && raw.activityDetails[0]) || null;
    const summary = detail ? (detail.summary || {}) : ((raw.activities && raw.activities[0]) || {});
    const samplesRaw = detail ? (detail.samples || []) : [];

    const startSec = summary.startTimeInSeconds || Math.floor(Date.now() / 1000);
    const dateIso = new Date(startSec * 1000).toISOString();
    const maxHr = parseInt(document.getElementById('max-hr')?.value || '187', 10);

    const samples = samplesRaw.map((s, idx) => ({
        t: (s.startTimeInSeconds || (startSec + idx)) - startSec,
        v: s.speedMetersPerSecond || 0,
        d: s.totalDistanceInMeters || 0,
        alt: s.elevationInMeters || 0,
        hr: s.heartRate || 0,
        pwr: s.powerInWatts || 0,
        cad: s.bikeCadenceInRpm || 0
    }));

    const hasRealPower = samples.some(s => s.pwr > 0) || (summary.averagePowerInWatts > 0);
    const estStream = window.UpYouPhysics.estimateStreamPower(samples, maxHr);

    const realWatts = samples.map(s => s.pwr || 0);
    const avgPower = hasRealPower
        ? (summary.averagePowerInWatts || averageNonZero(realWatts))
        : 0;
    const np = hasRealPower
        ? (summary.normalizedPowerInWatts || window.UpYouPhysics.computeNP(realWatts))
        : 0;

    const estAvgPower = estStream.length > 0 ? averageNonZero(estStream) : 0;
    const estNp = estStream.length > 0 ? window.UpYouPhysics.computeNP(estStream) : 0;

    samples.forEach((s, i) => { s.estPwr = estStream[i] || 0; });

    return {
        id: String(summary.activityId || actId),
        name: summary.activityName || 'Pedalada Garmin',
        date: dateIso,
        distance: summary.distanceInMeters || (samples.length ? samples[samples.length - 1].d : 0),
        duration: summary.durationInSeconds || samples.length || 0,
        avgPower: Math.round(avgPower),
        np: Math.round(np),
        estAvgPower: Math.round(estAvgPower),
        estNp: Math.round(estNp),
        avgHr: Math.round(summary.averageHeartRateInBeatsPerMinute || averageNonZero(samples.map(s => s.hr))),
        drift: computeCardiacDrift(samples, hasRealPower),
        source: 'garmin',
        samples: samples.filter((_, idx) => idx % 3 === 0) // Compactação inteligente 3s
    };
}

window.recalculateEstimatedPowerAll = async function() {
    window.saveRiderPhysics();
    const maxHr = parseInt(document.getElementById('max-hr')?.value || '187', 10);
    for (const act of currentActivities) {
        if (act.samples && act.samples.length > 0) {
            const estStream = window.UpYouPhysics.estimateStreamPower(act.samples, maxHr);
            act.estAvgPower = Math.round(averageNonZero(estStream));
            act.estNp = Math.round(window.UpYouPhysics.computeNP(estStream));
            act.samples.forEach((s, i) => { s.estPwr = estStream[i] || 0; });
            await saveActivityToDB(act);
        }
    }
    refreshActiveTab();
};

// Navegação entre abas
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(sec => {
        sec.style.display = sec.id === `tab-${tabName}` ? 'block' : 'none';
    });
    refreshActiveTab();
};

function refreshActiveTab() {
    const activeBtn = document.querySelector('.tab-btn.active');
    const tab = activeBtn ? activeBtn.dataset.tab : 'atividades';

    if (tab === 'atividades') window.renderTabAtividades(currentActivities);
    else if (tab === 'ftp') window.renderTabFtp(currentActivities);
    else if (tab === 'assinatura') window.renderTabAssinatura(currentActivities);
    else if (tab === 'zonas-potencia') window.renderTabZonasPotencia(currentActivities);
    else if (tab === 'zonas-fc') window.renderTabZonasFc(currentActivities);
    else if (tab === 'drift') window.renderTabDrift(currentActivities);
    else if (tab === 'vi') window.renderTabVi(currentActivities);
    else if (tab === 'estrutura') window.renderTabEstrutura(currentActivities);
    else if (tab === 'potencia-estimada') window.renderTabPotenciaEstimada(currentActivities);
}

// Modal de Detalhes da Pedalada
window.openActivityDetails = function(actId) {
    const act = currentActivities.find(a => String(a.id) === String(actId));
    if (!act) return;

    document.getElementById('modal-title').textContent = `${act.name} (${formatActivityDate(act.date)})`;
    const avgP = act.avgPower || act.estAvgPower || 0;
    const npP = act.np || act.estNp || avgP;
    const vi = avgP > 0 ? (npP / avgP).toFixed(2) : '1.00';

    document.getElementById('modal-kpi-grid').innerHTML = `
        <div class="kpi-box"><span>Distância</span><strong>${((act.distance || 0) / 1000).toFixed(2)} km</strong></div>
        <div class="kpi-box"><span>Duração</span><strong>${Math.round((act.duration || 0) / 60)} min</strong></div>
        <div class="kpi-box"><span>Potência Média</span><strong>${avgP} W</strong></div>
        <div class="kpi-box"><span>Potência Norm. (NP)</span><strong>${npP} W</strong></div>
        <div class="kpi-box"><span>Potência Estimada</span><strong>${act.estAvgPower || avgP} W</strong></div>
        <div class="kpi-box"><span>Índice VI</span><strong>${vi}</strong></div>
        <div class="kpi-box"><span>FC Média</span><strong>${act.avgHr || '--'} bpm</strong></div>
    `;

    document.getElementById('activity-modal').style.display = 'flex';

    const ctx = document.getElementById('chart-modal-streams');
    const samples = act.samples || [];
    const labels = samples.map(s => `${Math.floor((s.t || 0) / 60)}m`);
    const pwrData = samples.map(s => s.pwr || s.estPwr || 0);
    const hrData = samples.map(s => s.hr || 0);

    if (modalChartInstance) modalChartInstance.destroy();
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Potência (W)', data: pwrData, borderColor: '#ff5700', pointRadius: 0, borderWidth: 1.5 },
                { label: 'FC (bpm)', data: hrData, borderColor: '#38bdf8', pointRadius: 0, borderWidth: 1.5 }
            ]
        },
        options: UpYouChartTheme.baseOptions('Telemetria')
    });
};

window.closeModal = function() {
    document.getElementById('activity-modal').style.display = 'none';
};

// Funções Utilitárias Globais
window.formatActivityDate = function(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

window.formatShortDate = function(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

window.escapeHtml = function(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};

window.estimateUserCurrentFtp = function(activities) {
    let best = 200;
    activities.forEach(a => {
        const p = a.np || a.estNp || a.avgPower || 0;
        if (p * 0.95 > best) best = Math.round(p * 0.95);
    });
    return best;
};

function averageNonZero(arr) {
    const valid = arr.filter(v => v > 0);
    if (!valid.length) return 0;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function computeCardiacDrift(samples, hasRealPower) {
    if (!samples || samples.length < 60) return 0;
    const half = Math.floor(samples.length / 2);
    const first = samples.slice(0, half);
    const second = samples.slice(half);

    const ef1 = calcEfSlice(first, hasRealPower);
    const ef2 = calcEfSlice(second, hasRealPower);
    if (ef1 <= 0 || ef2 <= 0) return 0;
    return ((ef1 - ef2) / ef1) * 100;
}

function calcEfSlice(slice, hasRealPower) {
    const pwr = averageNonZero(slice.map(s => hasRealPower ? s.pwr : (s.estPwr || 0)));
    const hr = averageNonZero(slice.map(s => s.hr));
    return hr > 60 ? (pwr / hr) : 0;
}
