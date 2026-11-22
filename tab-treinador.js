// Aba: Diagnóstico & Coach (Janelas Parametrizáveis, Slider Histórico, FC/LTHR de Apoio, Auditoria e Treino Estruturado)

const COACH_CFG_KEY = 'upyou_coach_config_v1';

let coachConfig = { recentDays: 30, prevDays: 60 };
let coachRefIdx = -1;

function loadCoachConfig() {
  try {
    const raw = localStorage.getItem(COACH_CFG_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.recentDays >= 7 && p.recentDays <= 180) coachConfig.recentDays = parseInt(p.recentDays, 10);
      if (p.prevDays >= 14 && p.prevDays <= 365) coachConfig.prevDays = parseInt(p.prevDays, 10);
    }
  } catch (e) {}
}

function saveCoachConfig() {
  try {
    localStorage.setItem(COACH_CFG_KEY, JSON.stringify(coachConfig));
  } catch (e) {}
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

function computeWindowStats(acts, daysSpan) {
  const weeks = Math.max(1 / 7, daysSpan / 7);
  let totalSecs = 0, totalDist = 0, totalTss = 0;
  let efSum = 0, efCnt = 0;
  let driftSum = 0, driftCnt = 0;
  let durabSum = 0, durabCnt = 0;
  let lthrSum = 0, lthrCnt = 0;

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

    const ifVal = ftp > 0 ? (np / ftp) : 0.7;
    const tss = (dur * np * ifVal) / (Math.max(100, ftp) * 36);
    totalTss += tss;

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
        if (hz) {
          hrZones[hz] += sec;
          hrZones.total += sec;
        }
      }
    } else if (m.avgHr > 60 && dur > 0) {
      const hz = classifyHrZone(m.avgHr, lthr);
      if (hz) {
        hrZones[hz] += dur;
        hrZones.total += dur;
      }
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
    ridesPerWeek: acts.length / weeks,
    distPerWeek: totalDist / weeks,
    tssPerDay: totalTss / Math.max(1, daysSpan),
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

function buildCoachDiagnosis(rec, prev, ftp) {
  const tsb = Math.round(prev.tssPerDay - rec.tssPerDay);
  let readiness = 75 + tsb * 1.4 - (rec.monotony > 1.8 ? (rec.monotony - 1.8) * 18 : 0);
  if (rec.drift !== null && rec.drift > 6.5) readiness -= 10;
  readiness = Math.max(15, Math.min(98, Math.round(readiness)));

  const readinessLabel = readiness >= 75 ? 'Ótima' : (readiness >= 55 ? 'Moderada' : 'Fadiga Alta');
  const readinessColor = readiness >= 75 ? '#10b981' : (readiness >= 55 ? '#eab308' : '#ef4444');

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

  const r5s = ftp > 0 && rec.mmp[5] ? rec.mmp[5] / ftp : 0;
  const r5m = ftp > 0 && rec.mmp[300] ? rec.mmp[300] / ftp : 0;
  const r20m = ftp > 0 && rec.mmp[1200] ? rec.mmp[1200] / ftp : 0;

  let mmpCaption = 'Dados de sensor insuficientes para classificar perfil.';
  if (rec.mmp[1200] > 0 || rec.mmp[300] > 0) {
    if (r5s > 3.2 && r20m < 1.0) mmpCaption = 'Perfil Sprinter: pico explosivo forte, espaço para evoluir limiar (20m–60m).';
    else if (r20m >= 1.0 && r5m < 1.15) mmpCaption = 'Perfil Passista/Escalador: boa base em 20m, lacuna em VO2máx (1m–5m).';
    else if (r5m >= 1.18) mmpCaption = 'Perfil Puncheur/All-Rounder: boa sustentação em ataques de 1m–5m.';
    else mmpCaption = 'Perfil Equilibrado: evolução homogênea entre base e intensidade.';
  }

  let estado = 'Estável / Em Evolução';
  let estadoColor = '#10b981';
  let pontoForte = 'Consistência Geral';
  let lacuna = 'Estímulo de VO2máx (Z5)';
  let focoKey = 'vo2max';
  let focoLabel = '1x Treino VO2máx/semana';
  let texto = '';

  if (readiness < 50 || (tsb < -15 && driftDelta > 1.5)) {
    estado = 'Sobrecarga / Fadiga Acumulada';
    estadoColor = '#ef4444';
    pontoForte = 'Alto Volume de Carga';
    lacuna = 'Recuperação e Regeneração';
    focoKey = 'recovery';
    focoLabel = 'Semana Regenerativa (Z1–Z2 leve)';
    texto = `Sua carga recente (${rec.hoursPerWeek.toFixed(1)}h/sem) superou a base anterior com sinais de fadiga (TSB ${tsb}, prontidão ${readiness}/100). Reduza a intensidade por 4–5 dias com giros leves em Z1/Z2 para consolidar os ganhos e baixar o Cardiac Drift.`;
  } else if (lowConditioning) {
    estado = 'Condicionamento em Reconstrução';
    estadoColor = '#eab308';
    pontoForte = z2HrPct >= 25 ? `Estímulo Aeróbico em Z2 FC (${z2HrPct.toFixed(0)}%)` : 'Constância na Pedalada';
    lacuna = 'Eficiência W/bpm e Durabilidade';
    focoKey = 'base_z2';
    focoLabel = 'Base Aeróbica Guiada por FC (Z2 FC)';
    texto = `O EF variou de ${prev.ef ? prev.ef.toFixed(2) : '--'} para ${rec.ef ? rec.ef.toFixed(2) : '--'}${rec.drift !== null ? ` com Drift de ${rec.drift.toFixed(1)}%` : ''}. Parte do esforço aeróbico está aparecendo em Watts baixos (Z1 potência) com FC em Z2 (LTHR ~${rec.lthr} bpm). Priorize base contínua controlada por FC antes de forçar picos de Watts.`;
  } else if (lowPwrPct < 55 && lowHrPct < 55 && midPct > 28) {
    estado = 'Atenção: Excesso de Zona Cinza';
    estadoColor = '#eab308';
    pontoForte = 'Ritmo Constante (Tempo/Z3)';
    lacuna = 'Base Aeróbica Pura (Z2)';
    focoKey = 'base_z2';
    focoLabel = '2x Blocos Longos em Z2 Estável';
    texto = `Você concentrou ${midPct.toFixed(0)}% do tempo em Z3 e apenas ${lowPwrPct.toFixed(0)}% em Z1–Z2 de potência (e ${lowHrPct.toFixed(0)}% em Z1–Z2 de FC). Segure os treinos leves em Z2 para melhorar o EF e a durabilidade.`;
  } else if ((highPct < 6 && highHrPct < 8) || (prev.mmp[300] > 0 && rec.mmp[300] < prev.mmp[300] * 0.96)) {
    estado = efDelta >= 0 ? 'Base Sólida / Pronto p/ Pico' : 'Estável / Em Evolução';
    estadoColor = '#10b981';
    pontoForte = efDelta >= 0 ? 'Eficiência Aeróbica (EF)' : 'Resistência de Base (Z2)';
    lacuna = 'Picos de VO2máx (1m–5m)';
    focoKey = 'vo2max';
    focoLabel = '1x Treino VO2máx/semana';
    texto = `A base aeróbica está consistente (${rec.hoursPerWeek.toFixed(1)}h/sem), mas o estímulo em alta intensidade ficou baixo. Introduza 1 sessão semanal de VO2máx para elevar o teto aeróbico.`;
  } else if (rec.drift !== null && rec.drift > 5.5) {
    estado = 'Boa Intensidade / Drift Elevado';
    estadoColor = '#eab308';
    pontoForte = 'Potência em Limiar / Alta Intensidade';
    lacuna = 'Durabilidade Aeróbica';
    focoKey = 'sweetspot';
    focoLabel = '1x Sweet Spot Contínuo (88–92% FTP)';
    texto = `O Cardiac Drift médio ficou em ${rec.drift.toFixed(1)}% nos treinos estáveis. Trabalhe blocos contínuos de Sweet Spot (2x20min a 88–92% do FTP) com boa hidratação para melhorar a resistência à fadiga.`;
  } else {
    estado = 'Evolução Equilibrada';
    estadoColor = '#10b981';
    pontoForte = 'Equilíbrio Base vs. Intensidade';
    lacuna = 'Sustentação no Limiar (FTP)';
    focoKey = 'threshold';
    focoLabel = '1x Limiar (2x15min a 98–102% FTP)';
    texto = `Excelente distribuição entre volume (${rec.hoursPerWeek.toFixed(1)}h/sem), eficiência (EF ${rec.ef ? rec.ef.toFixed(2) : '--'}) e recuperação (${readiness}/100). Mantenha a consistência e aplique 1 sessão semanal de Limiar para empurrar o FTP para cima.`;
  }

  return {
    tsb, readiness, readinessLabel, readinessColor,
    lowConditioning, mmpCaption, estado, estadoColor, pontoForte, lacuna, focoKey, focoLabel, texto
  };
}

function getSuggestedWorkout(focoKey, ftp, diag, rec) {
  const f = Math.max(120, Math.round(ftp || 220));
  const cautious = Boolean(diag && diag.lowConditioning);
  const w = (pct) => Math.round(f * (cautious ? Math.min(pct, 0.92) : pct));
  const lthr = (rec && rec.lthr) ? rec.lthr : 165;
  const z2HrLow = Math.round(lthr * 0.72);
  const z2HrHigh = Math.round(lthr * 0.83);

  const templates = {
    vo2max: {
      title: cautious
        ? `Estímulo Moderado — 3x3min @ ${w(0.92)}W`
        : `VO2máx Clássico — 4x4min @ ${w(1.12)}W`,
      subtitle: cautious
        ? `Ajustado p/ condicionamento • Alvo moderado ~${w(0.92)}W (FC ≤ ${Math.round(lthr * 0.94)} bpm)`
        : `Baseado no FTP ${f}W • Duração total: 56 min`,
      blocks: cautious
        ? [
            { label: 'Aquec.', mins: 12, pct: 0.60, zone: 'Z2', color: '#38bdf8' },
            { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
            { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
            { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
            { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
            { label: '3m Mod.', mins: 3, pct: 0.92, zone: 'Z3', color: '#22c55e' },
            { label: 'Desaq.', mins: 14, pct: 0.52, zone: 'Z1', color: '#38bdf8' }
          ]
        : [
            { label: 'Aquec.', mins: 12, pct: 0.62, zone: 'Z2', color: '#38bdf8' },
            { label: '4m VO2', mins: 4, pct: 1.12, zone: 'Z5', color: '#f97316' },
            { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
            { label: '4m VO2', mins: 4, pct: 1.12, zone: 'Z5', color: '#f97316' },
            { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
            { label: '4m VO2', mins: 4, pct: 1.12, zone: 'Z5', color: '#f97316' },
            { label: 'Rec', mins: 4, pct: 0.50, zone: 'Z1', color: '#64748b' },
            { label: '4m VO2', mins: 4, pct: 1.12, zone: 'Z5', color: '#f97316' },
            { label: 'Desaq.', mins: 16, pct: 0.55, zone: 'Z1', color: '#38bdf8' }
          ]
    },
    base_z2: {
      title: `Base Aeróbica por FC — ${z2HrLow}–${z2HrHigh} bpm (~${w(0.65)}W)`,
      subtitle: `LTHR ${lthr} bpm • Mantenha a FC em Z2 mesmo que os Watts fiquem baixos`,
      blocks: [
        { label: 'Aquec.', mins: 15, pct: 0.55, zone: 'Z1', color: '#64748b' },
        { label: `Z2 (${z2HrLow}-${z2HrHigh}bpm)`, mins: 65, pct: 0.65, zone: 'Z2', color: '#38bdf8' },
        { label: 'Desaq.', mins: 10, pct: 0.50, zone: 'Z1', color: '#64748b' }
      ]
    },
    sweetspot: {
      title: cautious
        ? `Ritmo Estável — 2x15min @ ${w(0.85)}W`
        : `Sweet Spot Durabilidade — 2x20min @ ${w(0.90)}W`,
      subtitle: `LTHR ${lthr} bpm • Controle o desacoplamento cardíaco no 2º bloco`,
      blocks: [
        { label: 'Aquec.', mins: 12, pct: 0.60, zone: 'Z2', color: '#38bdf8' },
        { label: '15m Ritmo', mins: 15, pct: cautious ? 0.85 : 0.90, zone: 'Z3', color: '#22c55e' },
        { label: 'Rec', mins: 6, pct: 0.55, zone: 'Z1', color: '#64748b' },
        { label: '15m Ritmo', mins: 15, pct: cautious ? 0.85 : 0.90, zone: 'Z3', color: '#22c55e' },
        { label: 'Desaq.', mins: 10, pct: 0.52, zone: 'Z1', color: '#38bdf8' }
      ]
    },
    threshold: {
      title: `Limiar Funcional — 2x15min @ ${w(1.00)}W`,
      subtitle: `Baseado no FTP ${f}W • Duração total: 60 min`,
      blocks: [
        { label: 'Aquec.', mins: 12, pct: 0.65, zone: 'Z2', color: '#38bdf8' },
        { label: '15m FTP', mins: 15, pct: 1.00, zone: 'Z4', color: '#eab308' },
        { label: 'Rec', mins: 8, pct: 0.52, zone: 'Z1', color: '#64748b' },
        { label: '15m FTP', mins: 15, pct: 1.00, zone: 'Z4', color: '#eab308' },
        { label: 'Desaq.', mins: 10, pct: 0.55, zone: 'Z1', color: '#38bdf8' }
      ]
    },
    recovery: {
      title: `Giro Regenerativo — 45min @ ${w(0.52)}W (FC < ${Math.round(lthr * 0.72)} bpm)`,
      subtitle: `LTHR ${lthr} bpm • Cadência solta, sem forçar`,
      blocks: [
        { label: 'Soltar', mins: 10, pct: 0.48, zone: 'Z1', color: '#64748b' },
        { label: 'Z1 Leve', mins: 25, pct: 0.53, zone: 'Z1', color: '#94a3b8' },
        { label: 'Desaq.', mins: 10, pct: 0.45, zone: 'Z1', color: '#64748b' }
      ]
    }
  };
  return templates[focoKey] || templates.vo2max;
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
    const lowPct = Math.max(stats.zonePct.Z1 + stats.zonePct.Z2, stats.hrZonePct.Z1 + stats.hrZonePct.Z2);
    score = lowPct >= 75 ? 2 : 1;
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

  const msDay = 86400000;
  const recentStart = new Date(refDate.getTime() - coachConfig.recentDays * msDay);
  const prevStart = new Date(recentStart.getTime() - coachConfig.prevDays * msDay);

  const recentActs = allActs.filter(a => a.dateObj > recentStart && a.dateObj <= refDate);
  const prevActs = allActs.filter(a => a.dateObj > prevStart && a.dateObj <= recentStart);

  const rec = computeWindowStats(recentActs, coachConfig.recentDays);
  const prev = computeWindowStats(prevActs, coachConfig.prevDays);
  const diag = buildCoachDiagnosis(rec, prev, refFtp);
  const workout = getSuggestedWorkout(diag.focoKey, refFtp, diag, rec);
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
          <span>Monotonia: <strong>${rec.monotony.toFixed(1)}</strong></span>
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
        <div style="font-size:0.75rem; font-weight:700; color:#94a3b8; margin-bottom:4px;">4. PERFIL DE POTÊNCIA (MMP)</div>
        <canvas id="coachRadarCanvas" style="width:100%; height:132px;"></canvas>
        <div style="font-size:0.7rem; color:#cbd5e1; text-align:center; line-height:1.35; margin-top:4px;">${diag.mmpCaption}</div>
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
        <canvas id="coachWorkoutCanvas" style="width:100%; height:180px;"></canvas>
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
  const w = c.offsetWidth || 420, h = 180;
  c.width = w; c.height = h;

  const padL = 10, padR = 10, padT = 26, padB = 24;
  const drawW = w - padL - padR, drawH = h - padT - padB;
  const totalMins = workout.blocks.reduce((s, b) => s + b.mins, 0);
  const maxPct = Math.max(1.2, ...workout.blocks.map(b => b.pct));

  let curX = padL;
  workout.blocks.forEach(b => {
    const bw = Math.max(8, (b.mins / totalMins) * drawW);
    const bh = (b.pct / maxPct) * drawH;
    const y = padT + drawH - bh;

    ctx.fillStyle = b.color;
    ctx.fillRect(curX + 1, y, Math.max(2, bw - 2), bh);

    if (bw >= 26) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(b.pct * ftp)}W`, curX + bw / 2, y - 5);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.fillText(`${b.mins}m`, curX + bw / 2, h - 7);
    }
    curX += bw;
  });
}
