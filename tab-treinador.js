// Aba: Diagnóstico & Coach (Coggan/Allen Power Profile W/kg + Idade Não Linear 50%, FC/LTHR, Volume Real, TSS/IF e Auditoria)

const COACH_CFG_KEY = 'upyou_coach_config_v1';
const USER_AGE_KEY = 'upyou_user_age_v1';

let coachConfig = { recentDays: 30, prevDays: 60 };
let coachRefIdx = -1;

// Tabela 4.1 (Men - W/kg): degraus de referência (Untrained -> World Class)
const COGGAN_PROFILE_TABLE = [
  { label: 'Untrained',     s5: 10.08, m1: 5.64,  m5: 2.33, ftp: 1.86 },
  { label: 'Fair (Cat V)',  s5: 12.15, m1: 6.21,  m5: 2.84, ftp: 2.31 },
  { label: 'Moderate (IV)', s5: 13.93, m1: 7.13,  m5: 3.57, ftp: 2.93 },
  { label: 'Good (Cat III)',s5: 15.70, m1: 7.82,  m5: 4.29, ftp: 3.55 },
  { label: 'Very Good (II)',s5: 17.48, m1: 8.51,  m5: 4.91, ftp: 4.09 },
  { label: 'Excellent (I)', s5: 19.26, m1: 9.20,  m5: 5.53, ftp: 4.62 },
  { label: 'Exceptional',   s5: 21.33, m1: 10.01, m5: 6.26, ftp: 5.24 },
  { label: 'World Class',   s5: 24.00, m1: 11.04, m5: 7.19, ftp: 6.04 }
];

// Tabela 3.1 & 3.2: Metadados fisiológicos por zona
const ZONE_META = {
  Z1: { fthr: '<68% FTHR', rpe: 'RPE <2',  adapt: 'Recuperação ativa e remoção de fadiga' },
  Z2: { fthr: '69–83% FTHR', rpe: 'RPE 2–3', adapt: 'Base aeróbica, capilarização e mitocôndrias' },
  Z3: { fthr: '84–94% FTHR', rpe: 'RPE 3–4', adapt: 'Estoque de glicogênio muscular e resistência' },
  Z4: { fthr: '95–105% FTHR', rpe: 'RPE 4–5', adapt: 'Enzimas mitocondriais e elevação do limiar (FTP)' },
  Z5: { fthr: '>106% FTHR', rpe: 'RPE 6–7', adapt: 'Volume plasmático, débito cardíaco e VO2máx' },
  Z6: { fthr: 'N/A', rpe: 'RPE >7', adapt: 'Capacidade anaeróbica e tolerância ao lactato' },
  Z7: { fthr: 'N/A', rpe: 'Máximo', adapt: 'Potência neuromuscular e fibras rápidas' }
};

function loadCoachConfig() {
  try {
    const raw = localStorage.getItem(COACH_CFG_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.recentDays >= 7 && p.recentDays <= 180) coachConfig.recentDays = parseInt(p.recentDays, 10);
      if (p.prevDays >= 14 && p.prevDays <= 365) coachConfig.prevDays = parseInt(p.prevDays, 10);
    }
    const savedAge = localStorage.getItem(USER_AGE_KEY);
    const ageEl = document.getElementById('userAgeInput');
    if (savedAge && ageEl) {
      const parsedAge = parseInt(savedAge, 10);
      if (parsedAge >= 15 && parsedAge <= 90) ageEl.value = parsedAge;
    }
  } catch (e) {}
}

function saveCoachConfig() {
  try {
    localStorage.setItem(COACH_CFG_KEY, JSON.stringify(coachConfig));
  } catch (e) {}
}

function getUserAge() {
  const el = document.getElementById('userAgeInput');
  if (el) {
    const v = parseInt(el.value, 10);
    if (v >= 15 && v <= 90) return v;
  }
  try {
    const saved = parseInt(localStorage.getItem(USER_AGE_KEY), 10);
    if (saved >= 15 && saved <= 90) return saved;
  } catch (e) {}
  return 50;
}

window.onUserAgeChange = function(val) {
  const age = Math.max(15, Math.min(90, parseInt(val, 10) || 50));
  try { localStorage.setItem(USER_AGE_KEY, String(age)); } catch (e) {}
  const tab = document.getElementById('treinadorTab');
  if (tab && tab.style.display !== 'none') renderTreinadorTab();
};

// Atenuador não linear da Tabela 4.1 (metade do peso fisiológico padrão)
function getAgePowerAttenuation(age, durationKey) {
  if (!age || age <= 35) return 1.0;
  let baseDrop = 0;
  if (age <= 45) {
    baseDrop = (age - 35) * 0.0025; // 0.25%/ano
  } else if (age <= 55) {
    baseDrop = 0.025 + (age - 45) * 0.0038; // 0.38%/ano
  } else {
    baseDrop = 0.063 + (age - 55) * 0.0050; // 0.50%/ano
  }
  const mult = { s5: 1.45, m1: 1.35, m5: 1.00, ftp: 0.78 }[durationKey] || 1.0;
  return Math.max(0.78, 1.0 - (baseDrop * mult));
}

// Fator não linear de recuperação (metade do peso: ~1.09 aos 50 anos, teto 1.225)
function getAgeRecoveryFactor(age) {
  if (!age || age <= 35) return 1.0;
  let extra = 0;
  if (age <= 45) {
    extra = (age - 35) * 0.005; // +0.5%/ano
  } else if (age <= 55) {
    extra = 0.05 + (age - 45) * 0.0075; // +0.75%/ano (~+8.75% aos 50)
  } else {
    extra = 0.125 + (age - 55) * 0.01; // +1.0%/ano
  }
  return Math.min(1.225, 1.0 + extra);
}

function getEstimatedRiderWeightKg() {
  const el = document.getElementById('totalWeightInput');
  const totalW = el ? (parseFloat(el.value) || 82) : 82;
  return Math.max(45, totalW - 8.5);
}

function getSortedCoachActivities() {
  if (typeof dbActivities === 'undefined' || !Array.isArray(dbActivities)) return [];
  return dbActivities
    .filter(a => a && a.dateObj instanceof Date && !isNaN(a.dateObj.getTime()) && a.metrics)
    .sort((a, b) => a.dateObj - b.dateObj);
}

function getActDurationSec(act) {
  const m = act.metrics || {};
  return m.movingSecs || m.totalSecs || m.durationSec || (act.telemetry15s ? act.telemetry15s.length * 15 : 0);
}

function getActBestMmp(act, sec) {
  if (typeof window.getActivityMmpForDuration === 'function') {
    const realVal = window.getActivityMmpForDuration(act, sec);
    if (realVal > 0) return realVal;
  }
  const m = act.metrics || {};
  if (m.mmpCurve && m.mmpCurve[sec] > 0) return Math.round(m.mmpCurve[sec]);
  if (sec === 1200 && m.mmp20 > 0) return Math.round(m.mmp20);
  if (sec === 3600 && getActDurationSec(act) >= 3400 && m.avgPwr > 0) return Math.round(m.avgPwr);
  return 0;
}

function getReferenceLthr(act, fallbackMaxHr = 187) {
  const m = (act && act.metrics) || {};
  if (m.lthr && m.lthr > 100 && m.lthr < 215) return Math.round(m.lthr);
  if (act && act.lthr && act.lthr > 100 && act.lthr < 215) return Math.round(act.lthr);
  const maxHrInput = document.getElementById('maxHrInput');
  const maxHr = maxHrInput ? (parseInt(maxHrInput.value, 10) || fallbackMaxHr) : fallbackMaxHr;
  return Math.round(maxHr * 0.88);
}

function classifyHrZone(hr, lthr) {
  if (!hr || hr < 60 || !lthr || lthr <= 0) return null;
  const ratio = hr / lthr;
  if (ratio <= 0.68) return 'Z1';
  if (ratio <= 0.83) return 'Z2';
  if (ratio <= 0.94) return 'Z3';
  if (ratio <= 1.05) return 'Z4';
  return 'Z5';
}

function getProfileRank(wkg, key, age) {
  if (!wkg || wkg <= 0) return null;
  const factor = getAgePowerAttenuation(age, key);
  for (let i = 0; i < COGGAN_PROFILE_TABLE.length; i++) {
    const threshold = COGGAN_PROFILE_TABLE[i][key] * factor;
    if (wkg < threshold) {
      if (i === 0) return 0.5;
      const prev = COGGAN_PROFILE_TABLE[i - 1][key] * factor;
      return (i - 1) + (wkg - prev) / Math.max(0.01, threshold - prev);
    }
  }
  return COGGAN_PROFILE_TABLE.length - 1;
}

function classifyCogganProfile(mmp, ftp, riderKg, age) {
  const w5s = mmp[5] ? mmp[5] / riderKg : 0;
  const w1m = mmp[60] ? mmp[60] / riderKg : 0;
  const w5m = mmp[300] ? mmp[300] / riderKg : 0;
  const wFtp = ftp ? ftp / riderKg : 0;

  if (!w5m && !wFtp) {
    return { type: 'Indefinido', caption: 'Dados insuficientes para classificar perfil (Tabela 4.1).', vWarning: false };
  }

  const r5s = getProfileRank(w5s, 's5', age);
  const r1m = getProfileRank(w1m, 'm1', age);
  const r5m = getProfileRank(w5m, 'm5', age);
  const rFtp = getProfileRank(wFtp, 'ftp', age);

  const ftpTier = COGGAN_PROFILE_TABLE[Math.max(0, Math.min(COGGAN_PROFILE_TABLE.length - 1, Math.round(rFtp || 0)))].label;
  const vWarning = (r5s !== null && r1m !== null && r5m !== null && rFtp !== null) &&
                   (r5s - r1m > 1.8 && rFtp - r5m > 1.8);

  let type = 'All-Rounder';
  let desc = `Equilibrado (${wFtp.toFixed(2)} W/kg • ${ftpTier}).`;

  if (vWarning) {
    type = 'Padrão em V (Revisar)';
    desc = `Padrão incomum entre 5s/FTP e 1m–5m: valide se os picos ou FTP (${ftp}W) estão atuais.`;
  } else if (r1m !== null && r5m !== null && (r1m - r5m) >= 1.2 && (r5s === null || r5s >= r5m + 0.8)) {
    type = 'Sprinter';
    desc = `Queda de 1m→5m (${w5s.toFixed(1)} / ${w1m.toFixed(1)} W/kg); espaço para evoluir base/FTP.`;
  } else if (r1m !== null && r5m !== null && rFtp !== null && (rFtp - r1m) >= 1.0 && r5m >= r1m + 0.5) {
    type = 'Passista / Escalador';
    desc = `Curva ascendente até o FTP (${wFtp.toFixed(2)} W/kg • ${ftpTier}); evite focar em sprints.`;
  } else if (r5s !== null && r1m !== null && r5m !== null && rFtp !== null &&
             Math.max(r1m, r5m) - r5s >= 0.9 && Math.max(r1m, r5m) - rFtp >= 0.9) {
    type = 'Pursuiter';
    desc = `V invertido (forte em 1m–5m: ${w5m.toFixed(2)} W/kg); potencial para elevar o limiar.`;
  }

  const ageTag = age > 35 ? `Ajuste ${age}a` : 'Ref. padrão';
  return { type, caption: `${type}: ${desc} (${ageTag})`, vWarning, ftpTier, wFtp };
}

function computeWindowStats(acts, daysSpan) {
  const weeks = Math.max(1 / 7, daysSpan / 7);
  let totalSecs = 0, totalDist = 0, totalTss = 0;
  let efSum = 0, efCnt = 0;
  let driftSum = 0, driftCnt = 0;
  let durabSum = 0, durabCnt = 0;
  let lthrSum = 0, lthrCnt = 0;
  let maxSingleTss = 0, ifSum = 0, ifCnt = 0;

  const zones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0, total: 0 };
  const hrZones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, total: 0 };
  const mmp = { 5: 0, 60: 0, 300: 0, 1200: 0, 3600: 0 };
  const dailyLoads = {};

  acts.forEach(act => {
    const m = act.metrics || {};
    const dur = getActDurationSec(act);
    const ftp = act.currentFtp || 220;
    const np = m.np || m.avgPwr || 0;
    const lthr = getReferenceLthr(act);
    lthrSum += lthr;
    lthrCnt++;

    totalSecs += dur;
    totalDist += parseFloat(m.distKm) || 0;

    const ifVal = ftp > 0 && np > 0 ? (np / ftp) : 0.7;
    if (np > 0 && ftp > 0) { ifSum += ifVal; ifCnt++; }
    const tss = (dur * np * ifVal) / (Math.max(100, ftp) * 36);
    totalTss += tss;
    if (tss > maxSingleTss) maxSingleTss = tss;

    const dayKey = act.date || act.dateObj.toISOString().slice(0, 10);
    dailyLoads[dayKey] = (dailyLoads[dayKey] || 0) + tss;

    if (m.pwrHist && ftp > 0) {
      for (const pStr in m.pwrHist) {
        const sec = m.pwrHist[pStr];
        const ratio = parseInt(pStr, 10) / ftp;
        if (ratio <= 0.55) zones.Z1 += sec;
        else if (ratio <= 0.75) zones.Z2 += sec;
        else if (ratio <= 0.90) zones.Z3 += sec;
        else if (ratio <= 1.05) zones.Z4 += sec;
        else if (ratio <= 1.20) zones.Z5 += sec;
        else if (ratio <= 1.50) zones.Z6 += sec;
        else zones.Z7 += sec;
        zones.total += sec;
      }
    }

    if (m.hrHist && lthr > 0) {
      for (const hrStr in m.hrHist) {
        const sec = m.hrHist[hrStr];
        const hz = classifyHrZone(parseInt(hrStr, 10), lthr);
        if (hz) { hrZones[hz] += sec; hrZones.total += sec; }
      }
    } else if (m.avgHr > 60 && dur > 0) {
      const hz = classifyHrZone(m.avgHr, lthr);
      if (hz) { hrZones[hz] += dur; hrZones.total += dur; }
    }

    if (m.vi && m.vi <= 1.12 && m.avgHr > 90 && np > 80) {
      efSum += (np / m.avgHr);
      efCnt++;
    }
    if (m.vi && m.vi <= 1.12 && m.drift !== null && m.drift !== undefined && !isNaN(m.drift)) {
      driftSum += m.drift;
      driftCnt++;
      if (dur >= 5400) {
        durabSum += Math.max(70, Math.min(105, 100 - m.drift));
        durabCnt++;
      }
    }

    [5, 60, 300, 1200, 3600].forEach(sec => {
      const val = getActBestMmp(act, sec);
      if (val > mmp[sec]) mmp[sec] = val;
    });
  });

  const loadsArr = [];
  for (let i = 0; i < daysSpan; i++) loadsArr.push(0);
  const vals = Object.values(dailyLoads);
  for (let i = 0; i < Math.min(vals.length, loadsArr.length); i++) loadsArr[i] = vals[i];
  const meanLoad = loadsArr.reduce((a, b) => a + b, 0) / Math.max(1, loadsArr.length);
  const variance = loadsArr.reduce((a, b) => a + Math.pow(b - meanLoad, 2), 0) / Math.max(1, loadsArr.length);
  const stdLoad = Math.sqrt(variance);
  const monotony = stdLoad > 1 ? Math.min(3.5, meanLoad / stdLoad) : 1.0;

  const zonePct = {};
  ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'].forEach(z => {
    zonePct[z] = zones.total > 0 ? (zones[z] / zones.total) * 100 : 0;
  });

  const hrZonePct = {};
  ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].forEach(z => {
    hrZonePct[z] = hrZones.total > 0 ? (hrZones[z] / hrZones.total) * 100 : 0;
  });

  const avgDrift = driftCnt > 0 ? (driftSum / driftCnt) : null;
  const durability = durabCnt > 0 ? (durabSum / durabCnt) : (avgDrift !== null ? Math.max(75, Math.min(100, 100 - avgDrift)) : null);

  return {
    count: acts.length,
    hoursPerWeek: (totalSecs / 3600) / weeks,
    avgRideMins: acts.length > 0 ? (totalSecs / 60) / acts.length : 60,
    ridesPerWeek: acts.length / weeks,
    distPerWeek: totalDist / weeks,
    tssPerDay: totalTss / Math.max(1, daysSpan),
    maxSingleTss,
    avgIf: ifCnt > 0 ? (ifSum / ifCnt) : 0.72,
    monotony,
    ef: efCnt > 0 ? (efSum / efCnt) : null,
    drift: avgDrift,
    durability,
    lthr: lthrCnt > 0 ? Math.round(lthrSum / lthrCnt) : 165,
    zones,
    hrZones,
    zonePct,
    hrZonePct,
    mmp
  };
}

function buildCoachDiagnosis(rec, prev, ftp, allActs, refDate, age) {
  const riderKg = getEstimatedRiderWeightKg();
  const profile = classifyCogganProfile(rec.mmp, ftp, riderKg, age);
  const recovFactor = getAgeRecoveryFactor(age);

  // Fadiga residual pela Tabela 7.3 ajustada pela metade do fator de idade
  let tssPenalty = 0;
  const lookbackDays = 3 * recovFactor;
  const recentHeavy = allActs.filter(a => a.dateObj <= refDate && (refDate - a.dateObj) / 86400000 <= lookbackDays);
  recentHeavy.forEach(a => {
    const m = a.metrics || {};
    const dur = getActDurationSec(a);
    const np = m.np || m.avgPwr || 0;
    const f = a.currentFtp || ftp || 220;
    const tss = (dur * np * (np / f)) / (f * 36);
    const daysAgo = (refDate - a.dateObj) / 86400000;
    if (tss > 450 && daysAgo <= 3 * recovFactor) tssPenalty += 18 * recovFactor;
    else if (tss >= 300 && daysAgo <= 2 * recovFactor) tssPenalty += 12 * recovFactor;
    else if (tss >= 150 && daysAgo <= 1.5 * recovFactor) tssPenalty += 6 * recovFactor;
  });

  const tsb = Math.round(prev.tssPerDay - rec.tssPerDay);
  let readiness = 75 + tsb * 1.3 - tssPenalty - (rec.monotony > 1.8 ? (rec.monotony - 1.8) * 16 : 0);
  if (rec.drift !== null && rec.drift > 6.5) readiness -= 10;
  readiness = Math.max(15, Math.min(98, Math.round(readiness)));

  const overloadReadinessCut = Math.round(50 + (recovFactor - 1.0) * 28); // ~52 aos 50a
  const overloadTsbCut = Math.round(-15 + (recovFactor - 1.0) * 18);     // ~-13 aos 50a

  const readinessLabel = readiness >= 75 ? 'Ótima' : (readiness >= overloadReadinessCut + 3 ? 'Moderada' : 'Fadiga Alta');
  const readinessColor = readiness >= 75 ? '#10b981' : (readiness >= overloadReadinessCut + 3 ? '#eab308' : '#ef4444');

  // Alerta de reavaliação de FTP (>75 dias)
  let daysSinceFtpTest = 999;
  for (let i = allActs.length - 1; i >= 0; i--) {
    const a = allActs[i];
    if (a.dateObj > refDate) continue;
    const m20 = getActBestMmp(a, 1200);
    if (m20 > 0 && ftp > 0 && m20 >= ftp * 0.98) {
      daysSinceFtpTest = Math.round((refDate - a.dateObj) / 86400000);
      break;
    }
  }
  const ftpTestAlert = daysSinceFtpTest > 75
    ? ` • Reavalie o FTP (último esforço representativo há ${daysSinceFtpTest}d).`
    : '';

  // Checa se faz >14 dias sem Z5 (manutenção de VO2máx para 45+, sem limitar empilhamento)
  const last14d = allActs.filter(a => a.dateObj <= refDate && (refDate - a.dateObj) / 86400000 <= 14);
  const stats14d = computeWindowStats(last14d, 14);
  const needsVo2Maintenance = age >= 45 && readiness >= 70 && ((stats14d.zones.Z5 + stats14d.zones.Z6) / 60) < 5;

  const lowPwrPct = rec.zonePct.Z1 + rec.zonePct.Z2;
  const lowHrPct = rec.hrZonePct.Z1 + rec.hrZonePct.Z2;
  const z2HrPct = rec.hrZonePct.Z2;
  const midPct = rec.zonePct.Z3;
  const highPct = rec.zonePct.Z4 + rec.zonePct.Z5 + rec.zonePct.Z6 + rec.zonePct.Z7;
  const highHrPct = rec.hrZonePct.Z4 + rec.hrZonePct.Z5;

  const efDelta = (rec.ef !== null && prev.ef !== null) ? (rec.ef - prev.ef) : 0;
  const efDropPct = (rec.ef !== null && prev.ef !== null && prev.ef > 0) ? ((rec.ef - prev.ef) / prev.ef) * 100 : 0;
  const driftDelta = (rec.drift !== null && prev.drift !== null) ? (rec.drift - prev.drift) : 0;
  const lowConditioning = (efDropPct < -8) || (rec.drift !== null && rec.drift > 6.5 && lowPwrPct > 55 && z2HrPct >= 25);

  let estado = 'Estável / Em Evolução';
  let estadoColor = '#10b981';
  let pontoForte = 'Consistência Geral';
  let lacuna = 'Estímulo de VO2máx (Z5)';
  let focoKey = 'vo2max';
  let focoLabel = 'Treino VO2máx (L5: 106–120% FTP)';
  let texto = '';

  if (readiness < overloadReadinessCut || (tsb < overloadTsbCut && driftDelta > 1.5) || tssPenalty >= 15) {
    estado = 'Sobrecarga / Fadiga Acumulada';
    estadoColor = '#ef4444';
    pontoForte = 'Alto Volume de Carga';
    lacuna = 'Recuperação e Regeneração (L1)';
    focoKey = 'recovery';
    focoLabel = 'Recuperação Ativa (Média <55% FTP)';
    texto = `Sinais de fadiga acumulada (TSB ${tsb}, prontidão ${readiness}/100, IF médio ${rec.avgIf.toFixed(2)}). Faça giros leves em L1 mantendo a potência média final abaixo de 55% do FTP para recuperar sem perder o ritmo.${ftpTestAlert}`;
  } else if (lowConditioning) {
    estado = 'Condicionamento em Reconstrução';
    estadoColor = '#eab308';
    pontoForte = z2HrPct >= 25 ? `Estímulo Aeróbico em Z2 FC (${z2HrPct.toFixed(0)}%)` : 'Constância na Pedalada';
    lacuna = 'Eficiência W/bpm e Base (L2)';
    focoKey = 'base_z2';
    focoLabel = 'Endurance Guiada por FC (69–83% FTHR)';
    texto = `O EF variou de ${prev.ef ? prev.ef.toFixed(2) : '--'} para ${rec.ef ? rec.ef.toFixed(2) : '--'}${rec.drift !== null ? ` com Drift de ${rec.drift.toFixed(1)}%` : ''}. Com a FC em Z2 (LTHR ~${rec.lthr} bpm) mesmo em Watts baixos, priorize Endurance contínua controlada por FC para reconstruir mitocôndrias e capilarização.${ftpTestAlert}`;
  } else if (lowPwrPct < 55 && lowHrPct < 55 && midPct > 28) {
    estado = 'Atenção: Excesso de Zona Cinza';
    estadoColor = '#eab308';
    pontoForte = 'Ritmo Constante (Tempo/L3)';
    lacuna = 'Base Aeróbica Pura (L2)';
    focoKey = 'base_z2';
    focoLabel = 'Endurance Contínua (69–75% FTP)';
    texto = `Você concentrou ${midPct.toFixed(0)}% em L3 e apenas ${lowPwrPct.toFixed(0)}% em L1–L2. Segure os treinos leves estritamente em L2 (69–75% FTP / 69–83% FTHR) para consolidar a base aeróbica.${ftpTestAlert}`;
  } else if ((highPct < 6 && highHrPct < 8) || (prev.mmp[300] > 0 && rec.mmp[300] < prev.mmp[300] * 0.96) || needsVo2Maintenance) {
    estado = efDelta >= 0 ? 'Base Sólida / Pronto p/ Pico' : 'Estável / Em Evolução';
    estadoColor = '#10b981';
    pontoForte = efDelta >= 0 ? 'Eficiência Aeróbica (EF)' : 'Resistência de Base (L2)';
    lacuna = 'Potência Aeróbica Máxima (L5)';
    focoKey = 'vo2max';
    focoLabel = 'VO2máx (L5: 106–120% FTP)';
    texto = needsVo2Maintenance
      ? `Boa prontidão (${readiness}/100) e mais de 14 dias sem estímulo relevante em Z5. Inserir VO2máx ajuda a preservar o teto aeróbico e o débito cardíaco.${ftpTestAlert}`
      : `Base consistente (${rec.hoursPerWeek.toFixed(1)}h/sem), mas baixo estímulo em L5. Sessões de VO2máx elevam volume plasmático, débito cardíaco e teto aeróbico.${ftpTestAlert}`;
  } else if (rec.drift !== null && rec.drift > 5.5) {
    estado = 'Boa Intensidade / Drift Elevado';
    estadoColor = '#eab308';
    pontoForte = 'Potência em Limiar / Alta Intensidade';
    lacuna = 'Durabilidade Aeróbica';
    focoKey = 'sweetspot';
    focoLabel = 'Sweet Spot (88–94% FTP)';
    texto = `O Cardiac Drift ficou em ${rec.drift.toFixed(1)}%. Blocos contínuos no Sweet Spot (88–94% FTP) maximizam o retorno sobre o limiar com menor estresse fisiológico que L4 pleno.${ftpTestAlert}`;
  } else {
    estado = 'Evolução Equilibrada';
    estadoColor = '#10b981';
    pontoForte = 'Equilíbrio Base vs. Intensidade';
    lacuna = 'Sustentação no Limiar (L4)';
    focoKey = 'threshold';
    focoLabel = 'Limiar Funcional (91–105% FTP)';
    texto = `Ótimo equilíbrio entre volume (${rec.hoursPerWeek.toFixed(1)}h/sem), EF (${rec.ef ? rec.ef.toFixed(2) : '--'}) e prontidão (${readiness}/100). Aplique sessões em L4 para empurrar enzimas mitocondriais e FTP.${ftpTestAlert}`;
  }

  return {
    tsb, readiness, readinessLabel, readinessColor,
    lowConditioning, profile, mmpCaption: profile.caption,
    estado, estadoColor, pontoForte, lacuna, focoKey, focoLabel, texto
  };
}

function scaleWorkoutByVolume(workout, focoKey, diag, rec) {
  const baseMins = workout.blocks.reduce((s, b) => s + b.mins, 0);
  const avgRide = Math.max(40, Math.min(120, rec && rec.avgRideMins ? rec.avgRideMins : 60));

  let volFactor = 1.0;
  let volNote = 'mantendo média';
  if (focoKey === 'recovery' || (diag && diag.readiness < 55)) {
    volFactor = 0.80;
    volNote = 'volume reduzido (-20%)';
  } else if (diag && diag.readiness >= 75 && !diag.lowConditioning && (rec.drift === null || rec.drift <= 5)) {
    volFactor = 1.10;
    volNote = 'progressão suave (+10%)';
  }

  const targetMins = Math.max(35, Math.min(130, Math.round(avgRide * volFactor)));
  const ratio = Math.max(0.65, Math.min(1.45, targetMins / Math.max(1, baseMins)));

  const scaledBlocks = workout.blocks.map((b, idx) => {
    const isEdge = idx === 0 || idx === workout.blocks.length - 1;
    const raw = b.mins * (isEdge ? (0.5 + 0.5 * ratio) : ratio);
    return { ...b, mins: Math.max(2, Math.round(raw)) };
  });

  const totalMins = scaledBlocks.reduce((s, b) => s + b.mins, 0);
  return {
    ...workout,
    blocks: scaledBlocks,
    subtitle: `${workout.subtitle} • Total: ${totalMins} min (${volNote}, média ${rec.hoursPerWeek.toFixed(1)}h/sem)`
  };
}

function getSuggestedWorkout(focoKey, ftp, diag, rec, refIdx = 0) {
  const f = Math.max(120, Math.round(ftp || 220));
  const cautious = Boolean(diag && diag.lowConditioning);
  const w = (pct) => Math.round(f * (cautious ? Math.min(pct, 0.92) : pct));
  const lthr = (rec && rec.lthr) ? rec.lthr : 165;
  const z2HrLow = Math.round(lthr * 0.69);
  const z2HrHigh = Math.round(lthr * 0.83);
  const pick = (arr) => arr[Math.abs(refIdx) % arr.length];

  const catalogs = {
    recovery: [
      {
        title: `L1 Recuperação Ativa @ <${w(0.55)}W (<68% FTHR)`,
        subtitle: `RPE <2 • Potência média final obrigatoriamente <55% FTP`,
        blocks: [
          { label: 'Soltar', mins: 10, pct: 0.48, zone: 'Z1', color: '#64748b' },
          { label: 'L1 Contínuo', mins: 30, pct: 0.53, zone: 'Z1', color: '#94a3b8' },
          { label: 'Desaq.', mins: 10, pct: 0.45, zone: 'Z1', color: '#64748b' }
        ]
      }
    ],
    base_z2: [
      {
        title: `L2 Endurance Oficial @ ${w(0.72)}W (${z2HrLow}–${z2HrHigh} bpm)`,
        subtitle: `69–75% FTP • 69–83% FTHR • RPE 2–3`,
        blocks: [
          { label: 'Aquec.', mins: 15, pct: 0.55, zone: 'Z1', color: '#64748b' },
          { label: 'L2 Endurance', mins: 60, pct: 0.72, zone: 'Z2', color: '#38bdf8' },
          { label: 'Desaq.', mins: 15, pct: 0.55, zone: 'Z1', color: '#64748b' }
        ]
      },
      {
        title: `L2 Base Guiada por FC (${z2HrLow}–${z2HrHigh} bpm / ~${w(0.69)}W)`,
        subtitle: `LTHR ${lthr} bpm • Mantenha FC em Z2 mesmo se os Watts caírem`,
        blocks: [
          { label: 'Aquec.', mins: 12, pct: 0.54, zone: 'Z1', color: '#64748b' },
          { label: 'Z2 FC', mins: 50, pct: 0.69, zone: 'Z2', color: '#38bdf8' },
          { label: 'Desaq.', mins: 12, pct: 0.52, zone: 'Z1', color: '#64748b' }
        ]
      }
    ],
    sweetspot: [
      {
        title: `Sweet Spot Oficial — 2x20m @ ${w(0.91)}W (88–94% FTP)`,
        subtitle: `Inclui ativação 5m @ 100% FTP • RPE 3–4`,
        blocks: [
          { label: 'Aquec.', mins: 15, pct: 0.66, zone: 'Z2', color: '#38bdf8' },
          { label: 'Ativ. FTP', mins: 5, pct: 1.00, zone: 'Z4', color: '#eab308' },
          { label: 'Rec', mins: 5, pct: 0.55, zone: 'Z1', color: '#64748b' },
          { label: '20m SS', mins: 20, pct: 0.91, zone: 'Z3', color: '#22c55e' },
          { label: 'Rec', mins: 10, pct: 0.55, zone: 'Z1', color: '#64748b' },
          { label: '20m SS', mins: 20, pct: 0.91, zone: 'Z3', color: '#22c55e' },
          { label: 'Desaq.', mins: 10, pct: 0.55, zone: 'Z1', color: '#38bdf8' }
        ]
      },
      {
        title: `Tempo / Sweet Spot — 3x15m @ ${w(0.89)}W`,
        subtitle: `Foco em glicogênio e durabilidade • RPE 3–4`,
        blocks: [
          { label: 'Aquec.', mins: 12, pct: 0.62, zone: 'Z2', color: '#38bdf8' },
          { label: '15m SS', mins: 15, pct: 0.89, zone: 'Z3', color: '#22c55e' },
          { label: 'Rec', mins: 5, pct: 0.54, zone: 'Z1', color: '#64748b' },
          { label: '15m SS', mins: 15, pct: 0.89, zone: 'Z3', color: '#22c55e' },
          { label: 'Rec', mins: 5, pct: 0.54, zone: 'Z1', color: '#64748b' },
          { label: '15m SS', mins: 15, pct: 0.89, zone: 'Z3', color: '#22c55e' },
          { label: 'Desaq.', mins: 10, pct: 0.54, zone: 'Z1', color: '#38bdf8' }
        ]
      }
    ],
    vo2max: [
      cautious
        ? {
            title: `Estímulo Moderado — 3x3m @ ${w(0.92)}W`,
            subtitle: `Ajustado p/ condicionamento • FC ≤ ${Math.round(lthr * 0.94)} bpm`,
            blocks: [
              { label: 'Aquec.', mins: 12, pct: 0.60, zone: 'Z2', color: '#38bdf8' },
              { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
              { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
              { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
              { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
              { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
              { label: 'Desaq.', mins: 12, pct: 0.52, zone: 'Z1', color: '#38bdf8' }
            ]
          }
        : {
            title: `L5 VO2máx Intervals — 6x3m @ ${w(1.17)}W`,
            subtitle: `Ativação 5m @ 100% FTP + L5 (117% FTP) • RPE 6–7`,
            blocks: [
              { label: 'Aquec.', mins: 15, pct: 0.66, zone: 'Z2', color: '#38bdf8' },
              { label: '5m FTP', mins: 5, pct: 1.00, zone: 'Z4', color: '#eab308' },
              { label: 'Rec', mins: 5, pct: 0.60, zone: 'Z2', color: '#64748b' },
              { label: '3m VO2', mins: 3, pct: 1.17, zone: 'Z5', color: '#f97316' },
              { label: 'Rec', mins: 3, pct: 0.52, zone: 'Z1', color: '#64748b' },
              { label: '3m VO2', mins: 3, pct: 1.17, zone: 'Z5', color: '#f97316' },
              { label: 'Rec', mins: 3, pct: 0.52, zone: 'Z1', color: '#64748b' },
              { label: '3m VO2', mins: 3, pct: 1.17, zone: 'Z5', color: '#f97316' },
              { label: 'Rec', mins: 3, pct: 0.52, zone: 'Z1', color: '#64748b' },
              { label: '3m VO2', mins: 3, pct: 1.17, zone: 'Z5', color: '#f97316' },
              { label: 'Desaq.', mins: 12, pct: 0.60, zone: 'Z2', color: '#38bdf8' }
            ]
          },
      {
        title: `L5 VO2máx Build — Progressivo @ ${w(1.13)}W`,
        subtitle: `Séries crescentes (5m → 6m → 7m) a 113% FTP • RPE 6–7`,
        blocks: [
          { label: 'Aquec.', mins: 15, pct: 0.66, zone: 'Z2', color: '#38bdf8' },
          { label: '5m FTP', mins: 5, pct: 1.00, zone: 'Z4', color: '#eab308' },
          { label: 'Rec', mins: 5, pct: 0.60, zone: 'Z2', color: '#64748b' },
          { label: '5m VO2', mins: 5, pct: 1.13, zone: 'Z5', color: '#f97316' },
          { label: 'Rec', mins: 5, pct: 0.52, zone: 'Z1', color: '#64748b' },
          { label: '6m VO2', mins: 6, pct: 1.13, zone: 'Z5', color: '#f97316' },
          { label: 'Rec', mins: 5, pct: 0.52, zone: 'Z1', color: '#64748b' },
          { label: '7m VO2', mins: 7, pct: 1.13, zone: 'Z5', color: '#f97316' },
          { label: 'Desaq.', mins: 12, pct: 0.60, zone: 'Z2', color: '#38bdf8' }
        ]
      }
    ],
    threshold: [
      {
        title: `L4 Limiar Funcional — 2x15m @ ${w(1.00)}W`,
        subtitle: `95–105% FTHR • RPE 4–5 • Elevação de FTP`,
        blocks: [
          { label: 'Aquec.', mins: 12, pct: 0.65, zone: 'Z2', color: '#38bdf8' },
          { label: '15m FTP', mins: 15, pct: 1.00, zone: 'Z4', color: '#eab308' },
          { label: 'Rec', mins: 8, pct: 0.52, zone: 'Z1', color: '#64748b' },
          { label: '15m FTP', mins: 15, pct: 1.00, zone: 'Z4', color: '#eab308' },
          { label: 'Desaq.', mins: 10, pct: 0.55, zone: 'Z1', color: '#38bdf8' }
        ]
      },
      {
        title: `L4 Over-Unders (${w(0.90)}W / ${w(1.05)}W)`,
        subtitle: `Alternância abaixo/acima do limiar • RPE 4–5`,
        blocks: [
          { label: 'Aquec.', mins: 12, pct: 0.62, zone: 'Z2', color: '#38bdf8' },
          { label: 'Under', mins: 4, pct: 0.90, zone: 'Z3', color: '#22c55e' },
          { label: 'Over', mins: 2, pct: 1.05, zone: 'Z4', color: '#f97316' },
          { label: 'Under', mins: 4, pct: 0.90, zone: 'Z3', color: '#22c55e' },
          { label: 'Over', mins: 2, pct: 1.05, zone: 'Z4', color: '#f97316' },
          { label: 'Rec', mins: 6, pct: 0.52, zone: 'Z1', color: '#64748b' },
          { label: 'O/U 12m', mins: 12, pct: 0.96, zone: 'Z4', color: '#eab308' },
          { label: 'Desaq.', mins: 10, pct: 0.54, zone: 'Z1', color: '#38bdf8' }
        ]
      }
    ]
  };

  const chosen = pick(catalogs[focoKey] || catalogs.vo2max);
  return scaleWorkoutByVolume(chosen, focoKey, diag, rec);
}

function auditCompliance(allActs, refDate, focoKey, latestDate) {
  const daysAfterLatest = (latestDate - refDate) / 86400000;
  if (daysAfterLatest < 5) {
    return { status: 'pending', badge: '⏳ Aguardando execução (próximos 7–14d)', color: '#94a3b8' };
  }

  const endCheck = new Date(refDate.getTime() + 14 * 86400000);
  const nextActs = allActs.filter(a => a.dateObj > refDate && a.dateObj <= endCheck);
  if (nextActs.length === 0) {
    return { status: 'missed', badge: '❌ Não realizado (sem treinos nos 14d seguintes)', color: '#ef4444' };
  }

  const stats = computeWindowStats(nextActs, 14);
  let score = 0;

  if (focoKey === 'vo2max') {
    const z5PwrMin = (stats.zones.Z5 + stats.zones.Z6) / 60;
    const z45HrMin = (stats.hrZones.Z4 + stats.hrZones.Z5) / 60;
    const bestMin = Math.max(z5PwrMin, z45HrMin * 0.8);
    score = bestMin >= 14 ? 2 : (bestMin >= 6 ? 1 : 0);
  } else if (focoKey === 'base_z2') {
    const z2PwrHrs = stats.zones.Z2 / 3600;
    const z2HrHrs = stats.hrZones.Z2 / 3600;
    const bestHrs = Math.max(z2PwrHrs, z2HrHrs);
    score = bestHrs >= 2.5 ? 2 : (bestHrs >= 1.2 ? 1 : 0);
  } else if (focoKey === 'sweetspot' || focoKey === 'threshold') {
    const z34PwrMin = (stats.zones.Z3 + stats.zones.Z4) / 60;
    const z34HrMin = (stats.hrZones.Z3 + stats.hrZones.Z4) / 60;
    const bestMin = Math.max(z34PwrMin, z34HrMin);
    score = bestMin >= 30 ? 2 : (bestMin >= 15 ? 1 : 0);
  } else if (focoKey === 'recovery') {
    const hasL1Ride = nextActs.some(a => {
      const m = a.metrics || {};
      const f = a.currentFtp || 220;
      return m.avgPwr > 0 && (m.avgPwr / f) <= 0.56;
    });
    const lowPct = Math.max(stats.zonePct.Z1 + stats.zonePct.Z2, stats.hrZonePct.Z1 + stats.hrZonePct.Z2);
    score = (hasL1Ride || lowPct >= 75) ? 2 : 1;
  }

  if (score === 2) return { status: 'done', badge: '✅ Recomendação cumprida nos 14d seguintes', color: '#10b981' };
  if (score === 1) return { status: 'partial', badge: '⚠️ Cumprimento parcial nos 14d seguintes', color: '#eab308' };
  return { status: 'missed', badge: '❌ Estímulo não detectado nos 14d seguintes', color: '#ef4444' };
}

window.initTreinadorTab = function() {
  loadCoachConfig();
  const acts = getSortedCoachActivities();
  if (acts.length === 0) return;
  if (coachRefIdx < 0 || coachRefIdx >= acts.length) {
    coachRefIdx = acts.length - 1;
  }
  renderTreinadorTab();
};

window.onCoachSliderChange = function(val) {
  coachRefIdx = parseInt(val, 10) || 0;
  renderTreinadorTab();
};

window.onCoachConfigApply = function() {
  const rEl = document.getElementById('coachRecentDays');
  const pEl = document.getElementById('coachPrevDays');
  if (rEl) coachConfig.recentDays = Math.max(7, Math.min(180, parseInt(rEl.value, 10) || 30));
  if (pEl) coachConfig.prevDays = Math.max(14, Math.min(365, parseInt(pEl.value, 10) || 60));
  saveCoachConfig();
  renderTreinadorTab();
};

function renderTreinadorTab() {
  const root = document.getElementById('treinadorRoot');
  if (!root) return;

  const allActs = getSortedCoachActivities();
  if (allActs.length === 0) {
    root.innerHTML = `<div style="padding:30px; text-align:center; color:#94a3b8;">Carregue suas atividades para gerar o Diagnóstico &amp; Coach.</div>`;
    return;
  }

  if (coachRefIdx < 0 || coachRefIdx >= allActs.length) coachRefIdx = allActs.length - 1;
  const refAct = allActs[coachRefIdx];
  const refDate = refAct.dateObj;
  const latestDate = allActs[allActs.length - 1].dateObj;
  const refFtp = refAct.currentFtp || 220;
  const userAge = getUserAge();

  const msDay = 86400000;
  const recentStart = new Date(refDate.getTime() - coachConfig.recentDays * msDay);
  const prevStart = new Date(recentStart.getTime() - coachConfig.prevDays * msDay);

  const recentActs = allActs.filter(a => a.dateObj > recentStart && a.dateObj <= refDate);
  const prevActs = allActs.filter(a => a.dateObj > prevStart && a.dateObj <= recentStart);

  const rec = computeWindowStats(recentActs, coachConfig.recentDays);
  const prev = computeWindowStats(prevActs, coachConfig.prevDays);
  const diag = buildCoachDiagnosis(rec, prev, refFtp, allActs, refDate, userAge);
  const workout = getSuggestedWorkout(diag.focoKey, refFtp, diag, rec, coachRefIdx);
  const audit = auditCompliance(allActs, refDate, diag.focoKey, latestDate);

  const fmtDate = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const durabTxt = rec.durability !== null ? `${rec.durability.toFixed(1)}%` : 'N/A';
  const durabDelta = (rec.durability !== null && prev.durability !== null)
    ? ` (${rec.durability - prev.durability >= 0 ? '+' : ''}${(rec.durability - prev.durability).toFixed(1)}%)`
    : '';

  root.innerHTML = `
    <div style="background:#0f1522; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 16px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
        <span style="font-size:0.78rem; font-weight:700; color:#34d399;">📅 DATA DE REFERÊNCIA: ${fmtDate(refDate)} (${refAct.name})</span>
        <span style="font-size:0.74rem; color:${audit.color}; font-weight:700;">${audit.badge}</span>
      </div>
      <input type="range" min="0" max="${allActs.length - 1}" value="${coachRefIdx}" step="1"
             oninput="onCoachSliderChange(this.value)"
             style="width:100%; accent-color:#10b981; cursor:pointer;">
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px 14px; margin-bottom:14px;">
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; font-size:0.78rem; color:#cbd5e1;">
        <strong style="color:#f8fafc;">CONFIGURAÇÃO:</strong>
        <label>Recente (dias):
          <input type="number" id="coachRecentDays" value="${coachConfig.recentDays}" min="7" max="180" class="custom-select" style="width:62px; margin-left:4px;">
        </label>
        <label>Anterior (dias):
          <input type="number" id="coachPrevDays" value="${coachConfig.prevDays}" min="14" max="365" class="custom-select" style="width:62px; margin-left:4px;">
        </label>
        <button type="button" class="btn-cockpit primary" style="padding:5px 12px; font-size:0.74rem;" onclick="onCoachConfigApply()">Atualizar</button>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; font-size:0.74rem;">
        <span style="background:#0f1522; border:1px solid rgba(56,189,248,0.3); padding:4px 10px; border-radius:20px; color:#cbd5e1;">
          Durabilidade: <strong style="color:#38bdf8;">${durabTxt}${durabDelta}</strong>
        </span>
        <span style="background:#0f1522; border:1px solid rgba(16,185,129,0.3); padding:4px 10px; border-radius:20px; color:#cbd5e1;">
          Volume: <strong style="color:#10b981;">${rec.hoursPerWeek.toFixed(1)}h/sem</strong> <span style="color:#64748b;">(ant: ${prev.hoursPerWeek.toFixed(1)}h)</span>
        </span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px; margin-bottom:14px;">
      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px;">
        <div style="font-size:0.75rem; font-weight:700; color:#94a3b8; margin-bottom:8px;">1. FADIGA &amp; RECUPERAÇÃO</div>
        <canvas id="coachGaugeCanvas" style="width:100%; height:135px;"></canvas>
        <div style="display:flex; justify-content:space-between; font-size:0.74rem; color:#cbd5e1; margin-top:6px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
          <span>TSB: <strong style="color:${diag.tsb >= 0 ? '#10b981' : '#f97316'};">${diag.tsb >= 0 ? '+' : ''}${diag.tsb}</strong></span>
          <span>IF Méd: <strong>${rec.avgIf.toFixed(2)}</strong></span>
          <span>Pedais: <strong>${rec.count}</strong></span>
        </div>
      </div>

      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px;">
        <div style="font-size:0.75rem; font-weight:700; color:#94a3b8; margin-bottom:8px;">2. DISTRIBUIÇÃO POR ZONAS (W)</div>
        <canvas id="coachZonesCanvas" style="width:100%; height:142px;"></canvas>
        <div style="font-size:0.69rem; color:#94a3b8; margin-top:4px; text-align:center;">
          Z2 FC (LTHR ~${rec.lthr} bpm): <strong style="color:#38bdf8;">${rec.hrZonePct.Z2.toFixed(0)}%</strong>
        </div>
      </div>

      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="font-size:0.75rem; font-weight:700; color:#94a3b8;">3. EFICIÊNCIA (EF) &amp; DRIFT</div>
        <div style="text-align:center; margin:6px 0;">
          <div style="font-size:0.72rem; color:#64748b;">EF Factor (W/bpm • VI ≤ 1.12)</div>
          <div style="font-size:1.35rem; font-weight:800; color:#38bdf8;">
            ${rec.ef ? rec.ef.toFixed(2) : '--'}
            <span style="font-size:0.8rem; color:#94a3b8; font-weight:500;"> vs ${prev.ef ? prev.ef.toFixed(2) : '--'}</span>
          </div>
        </div>
        <div style="text-align:center; margin:6px 0;">
          <div style="font-size:0.72rem; color:#64748b;">Cardiac Drift Médio</div>
          <div style="font-size:1.35rem; font-weight:800; color:${rec.drift !== null && rec.drift <= 5 ? '#10b981' : '#f97316'};">
            ${rec.drift !== null ? rec.drift.toFixed(1) + '%' : '--'}
            <span style="font-size:0.8rem; color:#94a3b8; font-weight:500;"> vs ${prev.drift !== null ? prev.drift.toFixed(1) + '%' : '--'}</span>
          </div>
        </div>
        <div style="font-size:0.7rem; color:#64748b; text-align:center;">FTP Ref.: ${refFtp}W • LTHR: ${rec.lthr} bpm</div>
      </div>

      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px;">
        <div style="font-size:0.75rem; font-weight:700; color:#94a3b8; margin-bottom:4px;">4. PERFIL DE POTÊNCIA (W/kg)</div>
        <canvas id="coachRadarCanvas" style="width:100%; height:132px;"></canvas>
        <div style="font-size:0.69rem; color:${diag.profile.vWarning ? '#f97316' : '#cbd5e1'}; text-align:center; line-height:1.35; margin-top:4px;">${diag.mmpCaption}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:16px;">
        <div style="font-size:0.76rem; font-weight:700; color:#94a3b8; margin-bottom:10px;">VEREDITO &amp; COACH DIÁRIO</div>
        <div style="display:grid; gap:6px; font-size:0.84rem; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
          <div><span style="color:#64748b; font-weight:700;">ESTADO ATUAL:</span> <strong style="color:${diag.estadoColor};">${diag.estado}</strong></div>
          <div><span style="color:#64748b; font-weight:700;">PONTO FORTE:</span> <strong style="color:#38bdf8;">${diag.pontoForte}</strong></div>
          <div><span style="color:#64748b; font-weight:700;">LACUNA:</span> <strong style="color:#f97316;">${diag.lacuna}</strong></div>
          <div><span style="color:#64748b; font-weight:700;">FOCO PRÁTICO:</span> <strong style="color:#f8fafc;">${diag.focoLabel}</strong></div>
        </div>
        <div style="font-size:0.8rem; color:#cbd5e1; line-height:1.55;">
          <strong style="color:#34d399;">Análise do Coach:</strong> ${diag.texto}
        </div>
      </div>

      <div style="background:#0a0e17; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
          <span style="font-size:0.76rem; font-weight:700; color:#94a3b8;">SUGESTÃO DE TREINO (FOCO PRÁTICO)</span>
          <span style="font-size:0.72rem; color:#38bdf8; font-weight:600;">${workout.title}</span>
        </div>
        <div style="font-size:0.72rem; color:#64748b; margin-bottom:8px;">${workout.subtitle}</div>
        <canvas id="coachWorkoutCanvas" style="width:100%; height:190px;"></canvas>
      </div>
    </div>
  `;

  drawCoachGauge(diag);
  drawCoachZones(rec, prev);
  drawCoachRadar(rec, prev);
  drawCoachWorkout(workout, refFtp);
}

function drawCoachGauge(diag) {
  const c = document.getElementById('coachGaugeCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.offsetWidth || 240, h = 135;
  c.width = w; c.height = h;
  const cx = w / 2, cy = h - 22, r = Math.min(w * 0.38, 62);

  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  const endAngle = Math.PI + (diag.readiness / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, endAngle);
  ctx.strokeStyle = diag.readinessColor;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${diag.readiness}/100`, cx, cy - 14);
  ctx.fillStyle = diag.readinessColor;
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(diag.readinessLabel, cx, cy + 6);
}

function drawCoachZones(rec, prev) {
  const c = document.getElementById('coachZonesCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.offsetWidth || 240, h = 142;
  c.width = w; c.height = h;

  const zs = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'];
  const colors = ['#94a3b8', '#38bdf8', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'];
  const padL = 24, padR = 8, padT = 18, padB = 22;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const maxPct = Math.max(30, ...zs.map(z => Math.max(rec.zonePct[z], prev.zonePct[z])));
  const slotW = drawW / zs.length;

  ctx.font = '9px sans-serif';
  ctx.fillStyle = '#f97316'; ctx.fillText('■ Recente', padL, 10);
  ctx.fillStyle = '#475569'; ctx.fillText('■ Anterior', padL + 62, 10);

  zs.forEach((z, i) => {
    const x0 = padL + i * slotW + 3;
    const bw = Math.max(5, (slotW - 8) / 2);
    const hPrev = (prev.zonePct[z] / maxPct) * drawH;
    const hRec = (rec.zonePct[z] / maxPct) * drawH;

    ctx.fillStyle = '#334155';
    ctx.fillRect(x0, padT + drawH - hPrev, bw, hPrev);

    ctx.fillStyle = colors[i];
    ctx.fillRect(x0 + bw + 1, padT + drawH - hRec, bw, hRec);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(z, x0 + bw, h - 6);
  });
}

function drawCoachRadar(rec, prev) {
  const c = document.getElementById('coachRadarCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.offsetWidth || 240, h = 132;
  c.width = w; c.height = h;

  const keys = [5, 60, 300, 1200, 3600];
  const labels = ['5s', '1m', '5m', '20m', '60m'];
  const cx = w / 2, cy = h / 2 + 4, rMax = Math.min(w, h) * 0.36;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  [0.33, 0.66, 1].forEach(lvl => {
    ctx.beginPath();
    keys.forEach((_, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
      const x = cx + Math.cos(ang) * rMax * lvl;
      const y = cy + Math.sin(ang) * rMax * lvl;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.stroke();
  });

  const drawPoly = (mmpObj, stroke, fill) => {
    ctx.beginPath();
    keys.forEach((k, i) => {
      const refMax = Math.max(100, rec.mmp[k] || 0, prev.mmp[k] || 0);
      const frac = Math.min(1, (mmpObj[k] || 0) / refMax);
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
      const x = cx + Math.cos(ang) * rMax * frac;
      const y = cy + Math.sin(ang) * rMax * frac;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  };

  drawPoly(prev.mmp, '#38bdf8', 'rgba(56,189,248,0.14)');
  drawPoly(rec.mmp, '#f97316', 'rgba(249,115,22,0.22)');

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  keys.forEach((k, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
    const lx = cx + Math.cos(ang) * (rMax + 14);
    const ly = cy + Math.sin(ang) * (rMax + 14) + 3;
    ctx.fillText(labels[i], lx, ly);
  });
}

function drawCoachWorkout(workout, ftp) {
  const c = document.getElementById('coachWorkoutCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.offsetWidth || 420, h = 190;
  c.width = w; c.height = h;

  const padL = 10, padR = 10, padT = 34, padB = 26;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const totalMins = workout.blocks.reduce((s, b) => s + b.mins, 0);
  const maxPct = Math.max(1.2, ...workout.blocks.map(b => b.pct));

  const hitboxes = [];
  let curX = padL;

  workout.blocks.forEach((b, idx) => {
    const bw = (b.mins / Math.max(1, totalMins)) * drawW;
    const bh = (b.pct / maxPct) * drawH;
    const y = padT + drawH - bh;
    const watts = Math.round(b.pct * ftp);

    ctx.fillStyle = b.color;
    ctx.fillRect(curX + 1, y, Math.max(2, bw - 2), bh);

    const isNarrow = bw < 32;
    const yOff = isNarrow && (idx % 2 === 1) ? 17 : 6;
    ctx.fillStyle = '#f8fafc';
    ctx.font = isNarrow ? 'bold 8.5px "JetBrains Mono", monospace' : 'bold 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${watts}W`, curX + bw / 2, Math.max(11, y - yOff));

    ctx.fillStyle = '#94a3b8';
    ctx.font = isNarrow ? '8px sans-serif' : '9px sans-serif';
    ctx.fillText(`${b.mins}m`, curX + bw / 2, h - 8);

    hitboxes.push({ x: curX, y: padT, w: bw, h: drawH, label: b.label, zone: b.zone, mins: b.mins, watts, color: b.color });
    curX += bw;
  });

  if (!c._workoutTipBound) {
    c._workoutTipBound = true;
    const tip = document.createElement('div');
    Object.assign(tip.style, {
      position: 'absolute', background: 'rgba(10,14,23,0.96)', border: '1px solid #475569',
      padding: '8px 10px', borderRadius: '6px', color: '#f1f5f9', pointerEvents: 'none',
      display: 'none', zIndex: '130', fontSize: '12px', fontFamily: '"JetBrains Mono", monospace'
    });
    document.body.appendChild(tip);
    c._workoutTip = tip;

    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const boxes = c._workoutHitboxes || [];
      const hit = boxes.find(b => mx >= b.x && mx <= b.x + b.w);
      if (!hit) { tip.style.display = 'none'; return; }
      const meta = ZONE_META[hit.zone] || { fthr: '--', rpe: '--', adapt: '' };
      tip.innerHTML = `<strong style="color:${hit.color};">${hit.label} (${hit.zone})</strong><br/>` +
                      `Alvo: <b>${hit.watts}W</b> • <b>${hit.mins} min</b><br/>` +
                      `<span style="color:#94a3b8;">${meta.fthr} • ${meta.rpe}</span><br/>` +
                      `<span style="color:#34d399; font-size:11px;">${meta.adapt}</span>`;
      if (typeof window.positionTooltipSmart === 'function') {
        window.positionTooltipSmart(tip, e.clientX, e.clientY, e.pageX, e.pageY);
      } else {
        tip.style.display = 'block';
        tip.style.left = `${e.pageX + 12}px`;
        tip.style.top = `${e.pageY + 12}px`;
      }
    });
    c.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }
  c._workoutHitboxes = hitboxes;
}
