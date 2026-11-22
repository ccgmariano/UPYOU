// Módulo de sincronização em nuvem do UpYou via Supabase (PostgreSQL + Storage)
const SUPABASE_URL = "https://aigyyfjaclbsofqfbzhy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_K0x2DfxGmWNObCkGODdtDw_MNLd2GKI";
const SUPABASE_ACTIVITIES_TABLE = "upyou_activities";
const SUPABASE_TELEMETRY_BUCKET = "telemetry-streams";

function getSupabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function getTelemetryStoragePath(googleId, activityKey) {
  const safeUser = encodeURIComponent(String(googleId || "default"));
  const safeKey = encodeURIComponent(String(activityKey || "unknown")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safeUser}/${safeKey}.json`;
}

function serializeActivityForCloud(act) {
  const { telemetry15s, dateObj, ...rest } = act;
  return {
    ...rest,
    dateIso: dateObj instanceof Date ? dateObj.toISOString() : (act.dateIso || new Date().toISOString())
  };
}

function deserializeActivityFromCloud(row) {
  const payload = row?.payload || {};
  const parsedDate = payload.dateIso
    ? new Date(payload.dateIso)
    : (row?.date_obj ? new Date(row.date_obj) : new Date());

  return {
    ...payload,
    garminId: payload.garminId || (row.source === "garmin" ? row.activity_key : undefined),
    source: payload.source || row.source || "strava",
    hasSavedTelemetry: Boolean(row.has_telemetry || payload.hasSavedTelemetry),
    dateObj: isNaN(parsedDate.getTime()) ? new Date() : parsedDate
  };
}

window.uploadTelemetryStreamToSupabase = async function(activityKey, stream) {
  if (!currentUserId || !activityKey || !Array.isArray(stream) || stream.length === 0) return false;
  try {
    const path = getTelemetryStoragePath(currentUserId, activityKey);
    const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_TELEMETRY_BUCKET}/${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "x-upsert": "true"
      },
      body: JSON.stringify(stream)
    });
    return res.ok;
  } catch (e) {
    console.warn("Falha ao enviar telemetria ao Supabase Storage:", e);
    return false;
  }
};

window.downloadTelemetryStreamFromSupabase = async function(activityKey) {
  if (!currentUserId || !activityKey) return null;
  try {
    const path = getTelemetryStoragePath(currentUserId, activityKey);
    const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_TELEMETRY_BUCKET}/${path}?t=${Date.now()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.warn("Falha ao baixar telemetria do Supabase Storage:", e);
    return null;
  }
};

window.upsertActivitiesToSupabase = async function(activities, onProgress = null) {
  if (!currentUserId || !Array.isArray(activities) || activities.length === 0) return;

  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_ACTIVITIES_TABLE}?on_conflict=google_id,activity_key`;
  const headers = getSupabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" });
  const batchSize = 5;

  for (let i = 0; i < activities.length; i += batchSize) {
    const chunk = activities.slice(i, i + batchSize);
    const rows = chunk.map(act => {
      const actKey = typeof window.getActivityUniqueKey === "function"
        ? window.getActivityUniqueKey(act)
        : String(act.garminId || act.file || `${act.date}_${act.name}`);

      const stream = Array.isArray(act.telemetry15s) && act.telemetry15s.length > 0 ? act.telemetry15s : null;
      const hasTel = Boolean(stream || act.hasSavedTelemetry);

      if (stream) {
        window.uploadTelemetryStreamToSupabase(actKey, stream).catch(() => {});
      }

      const dObj = act.dateObj instanceof Date ? act.dateObj : new Date(act.dateObj || Date.now());
      const cleanPayload = JSON.parse(JSON.stringify(serializeActivityForCloud({ ...act, hasSavedTelemetry: hasTel })));

      return {
        google_id: String(currentUserId),
        activity_key: String(actKey),
        date_obj: isNaN(dObj.getTime()) ? new Date().toISOString() : dObj.toISOString(),
        source: act.source || (act.garminId ? "garmin" : "strava"),
        has_telemetry: hasTel,
        payload: cleanPayload,
        updated_at: new Date().toISOString()
      };
    });

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(rows)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Lote ${i} falhou (${res.status}), tentando individualmente:`, errText);
      for (const singleRow of rows) {
        const singleRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify([singleRow])
        });
        if (!singleRes.ok) {
          const singleErr = await singleRes.text().catch(() => "");
          console.error(`Falha na atividade ${singleRow.activity_key} (${singleRes.status}):`, singleErr);
        }
      }
    }

    if (typeof onProgress === "function") {
      onProgress(Math.min(i + chunk.length, activities.length), activities.length);
    }
  }
};

window.fetchActivitiesFromSupabase = async function() {
  if (!currentUserId) return [];
  const pageSize = 250;
  let from = 0;
  let allRows = [];
  const msgEl = document.getElementById("statusMsg");

  while (true) {
    if (msgEl) {
      msgEl.style.color = "#38bdf8";
      msgEl.innerText = `Baixando histórico da nuvem: ${allRows.length} atividades...`;
    }

    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_ACTIVITIES_TABLE}?google_id=eq.${encodeURIComponent(String(currentUserId))}&order=date_obj.desc&select=activity_key,date_obj,source,has_telemetry,payload`;
    const res = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders({
        Range: `${from}-${from + pageSize - 1}`
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (msgEl) {
        msgEl.style.color = "#ef4444";
        msgEl.innerText = `Erro Supabase (${res.status}): ${errText}`;
      }
      throw new Error(`Supabase fetch falhou (${res.status}): ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows.map(deserializeActivityFromCloud);
};

window.deleteActivityFromSupabase = async function(activityKey) {
  if (!currentUserId || !activityKey) return;
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_ACTIVITIES_TABLE}?google_id=eq.${encodeURIComponent(String(currentUserId))}&activity_key=eq.${encodeURIComponent(String(activityKey))}`;
  await fetch(url, {
    method: "DELETE",
    headers: getSupabaseHeaders({ Prefer: "return=minimal" })
  }).catch(() => {});

  const path = getTelemetryStoragePath(currentUserId, activityKey);
  await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_TELEMETRY_BUCKET}/${path}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  }).catch(() => {});
};

window.syncLocalTelemetryToSupabase = async function(onProgress = null) {
  if (!currentUserId || typeof initDB !== "function") return 0;
  const db = await initDB();
  const tx = db.transaction(TELEMETRY_STORE, "readonly");
  const store = tx.objectStore(TELEMETRY_STORE);

  const allRecords = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  const prefix = `${currentUserId}_`;
  const userStreams = allRecords.filter((r) => r.id && r.id.startsWith(prefix) && Array.isArray(r.stream) && r.stream.length > 0);

  let uploaded = 0;
  for (let i = 0; i < userStreams.length; i++) {
    const item = userStreams[i];
    const actKey = item.id.slice(prefix.length);
    const ok = await window.uploadTelemetryStreamToSupabase(actKey, item.stream);
    if (ok) uploaded++;
    if (typeof onProgress === "function") onProgress(i + 1, userStreams.length);
  }
  return uploaded;
};
