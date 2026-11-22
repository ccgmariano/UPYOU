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

  const batchSize = 50;
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

      return {
        google_id: String(currentUserId),
        activity_key: String(actKey),
        date_obj: isNaN(dObj.getTime()) ? new Date().toISOString() : dObj.toISOString(),
        source: act.source || (act.garminId ? "garmin" : "strava"),
        has_telemetry: hasTel,
        payload: serializeActivityForCloud({ ...act, hasSavedTelemetry: hasTel }),
        updated_at: new Date().toISOString()
      };
    });

    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_ACTIVITIES_TABLE}?on_conflict=google_id,activity_key`;
    const res = await fetch(url, {
      method: "POST",
      headers: getSupabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase upsert falhou (${res.status}): ${errText}`);
    }

    if (typeof onProgress === "function") {
      onProgress(Math.min(i + chunk.length, activities.length), activities.length);
    }
  }
};

window.fetchActivitiesFromSupabase = async function() {
  if (!currentUserId) return [];
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_ACTIVITIES_TABLE}?google_id=eq.${encodeURIComponent(String(currentUserId))}&order=date_obj.asc&select=activity_key,date_obj,source,has_telemetry,payload`;
  const res = await fetch(url, {
    method: "GET",
    headers: getSupabaseHeaders()
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase fetch falhou (${res.status}): ${errText}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(deserializeActivityFromCloud);
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
