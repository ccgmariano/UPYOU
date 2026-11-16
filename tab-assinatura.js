// Aba 3: Assinatura Cardíaca Estabilizada por Zona Dinâmica de Potência (Coggan Z1-Z7) com Filtro de Janela Temporal e Linha de LTHR

function ensureAssinaturaControls() {
  const canvas = document.getElementById('zonesCanvas');
  if (!canvas || document.getElementById('assinaturaControlsBar')) return;

  const bar = document.createElement('div');
  bar.id = 'assinaturaControlsBar';
  bar.style.cssText = 'display: flex; gap: 15px; flex-wrap: wrap; background: #0f172a; padding: 10px 15px; border-radius: 6px; border: 1px solid #334155; margin: 12px 0; align-items: center; justify-content: space-between;';

  bar.innerHTML = `
    <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: center;">
      <label style="font-size: 0.82rem; color: #cbd5e1;">Período Analisado:
        <select class="custom-select" id="assPeriodoSelect" onchange="renderDynamicZones()" style="padding: 4px 8px; margin-left: 5px;">
          <option value="42" selected>Últimos 42 Dias (Forma Atual)</option>
          <option value="90">Últimos 90 Dias</option>
          <option value="180">Últimos 6 Meses</option>
          <option value="365">Último Ano (365d)</option>
          <option value="all">Todo o Histórico</option>
        </select>
      </label>

      <label style="font-size: 0.82rem; color: #cbd5e1;">Estabilização (Z1–Z5):
        <select class="custom-select" id="assJanelaSelect" onchange="renderDynamicZones()" style="padding: 4px 8px; margin-left: 5px;">
          <option value="300">Blocos de 5 min (Sem Inércia)</option>
          <option value="60" selected>Blocos de 1 min (Equilibrado)</option>
          <option value="15">Blocos de 15 seg (Alta Densidade)</option>
          <option value="5">Blocos de 5 seg (Picos Curtos)</option>
          <option value="1">Segundo a Segundo (Bruto)</option>
        </select>
      </label>
    </div>
    <div id="assResumoLabel" style="font-size: 0.8rem; color: #38bdf8; font-weight: bold;"></div>
  `;

  canvas.parentNode.insertBefore(bar, canvas);
}

function renderDynamicZones() {
  ensureAssinaturaControls();

  const canvas = document.getElementById('zonesCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 370, padL = 45, padR = 25, padT = 35, padB = 52;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (typeof dbActivities === 'undefined' || dbActivities.length === 0) return;

  const periodoVal = document.getElementById('assPeriodoSelect')?.value || '42';
  const janelaSecs = parseInt(document.getElementById('assJanelaSelect')?.value || '60', 10);

  // Determina a data mais recente do banco para filtrar a janela
  const latestDate = dbActivities[dbActivities.length - 1].dateObj || new Date();
  const cutoffTime = periodoVal === 'all' ? 0 : (latestDate.getTime() - parseInt(periodoVal, 10) * 86400000);

  let filteredActs = dbActivities.filter(a => a.dateObj && a.dateObj.getTime() >= cutoffTime && a.metrics && a.currentFtp);
  // Se nos últimos 42 dias houver poucas atividades, expande automaticamente para as últimas 10 atividades com potência
  if (filteredActs.length === 0) {
    filteredActs = dbActivities.filter(a => a.metrics && a.currentFtp).slice(-10);
  }

  const latestFtp = filteredActs.length > 0 ? filteredActs[filteredActs.length - 1].currentFtp : 200;
  const latestLthr = typeof window.getEstimatedLthr === 'function' ? window.getEstimatedLthr() : Math.round(userMaxHr * 0.90);

  const zonesData = {
    Z1: { minP: 0.25, maxP: 0.55, sumHrWeight: 0, totWeight: 0, color: '#94a3b8', n: 'Z1 (<55%)' },
    Z2: { minP: 0.55, maxP: 0.75, sumHrWeight: 0, totWeight: 0, color: '#38bdf8', n: 'Z2 (56-75%)' },
    Z3: { minP: 0.75, maxP: 0.90, sumHrWeight: 0, totWeight: 0, color: '#22c55e', n: 'Z3 (76-90%)' },
    Z4: { minP: 0.90, maxP: 1.05, sumHrWeight: 0, totWeight: 0, color: '#eab308', n: 'Z4 (91-105%)' },
    Z5: { minP: 1.05, maxP: 1.20, sumHrWeight: 0, totWeight: 0, color: '#f97316', n: 'Z5 (106-120%)' },
    Z6: { minP: 1.20, maxP: 1.50, sumHrWeight: 0, totWeight: 0, color: '#ef4444', n: 'Z6 (121-150%)' },
    Z7: { minP: 1.50, maxP: 3.50, sumHrWeight: 0, totWeight: 0, color: '#a855f7', n: 'Z7 (>150%)' }
  };

  filteredActs.forEach(act => {
    const m = act.metrics;
    const ftp = act.currentFtp;
    if (!m || !ftp) return;

    // 1. Usa blocos estabilizados (dispWindows) se selecionados e disponíveis
    if (janelaSecs > 1 && m.dispWindows && m.dispWindows[janelaSecs] && m.dispWindows[janelaSecs].length > 0) {
      const pts = m.dispWindows[janelaSecs];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i][0], hr = pts[i][1];
        const ratio = p / ftp;
        for (const key in zonesData) {
          const z = zonesData[key];
          if (ratio > z.minP && ratio <= z.maxP) {
            z.sumHrWeight += hr * janelaSecs;
            z.totWeight += janelaSecs;
            break;
          }
        }
      }

      // Para Z6 e Z7 (esforços anaeróbicos que duram de 5s a 15s e raramente fecham bloco de 1 ou 5 min),
      // complementa com a janela de 15s ou 5s se a zona tiver ficado vazia nos blocos longos
      if (janelaSecs >= 60) {
        const shortWin = (m.dispWindows[15] && m.dispWindows[15].length > 0) ? m.dispWindows[15] : (m.dispWindows[5] || []);
        for (let i = 0; i < shortWin.length; i++) {
          const p = shortWin[i][0], hr = shortWin[i][1];
          const ratio = p / ftp;
          if (ratio > 1.20 && ratio <= 3.50) {
            const zKey = ratio <= 1.50 ? 'Z6' : 'Z7';
            zonesData[zKey].sumHrWeight += hr * 15;
            zonesData[zKey].totWeight += 15;
          }
        }
      }
    } else if (m.pwrHrPairs && Object.keys(m.pwrHrPairs).length > 0) {
      // Fallback ou modo Segundo a Segundo (1s)
      for (const pStr in m.pwrHrPairs) {
        const p = parseInt(pStr, 10);
        const pair = m.pwrHrPairs[pStr];
        if (!pair || pair.secs <= 0) continue;
        const ratio = p / ftp;
        for (const key in zonesData) {
          const z = zonesData[key];
          if (ratio > z.minP && ratio <= z.maxP) {
            z.sumHrWeight += pair.sumHr;
            z.totWeight += pair.secs;
            break;
          }
        }
      }
    }
  });

  // Se em janelas curtas (ex: 42 dias) o ciclista não fez tiros em Z6 ou Z7, projeta pela regressão/progressão fisiológica ou mantém vazio
  const zoneKeys = Object.keys(zonesData);
  const avgHrs = {};
  zoneKeys.forEach(k => {
    const z = zonesData[k];
    avgHrs[k] = z.totWeight >= 15 ? Math.round(z.sumHrWeight / z.totWeight) : 0;
  });

  const resumoEl = document.getElementById('assResumoLabel');
  if (resumoEl) {
    resumoEl.innerText = `FTP Ref: ${latestFtp}W | LTHR (42d): ${latestLthr} bpm | ${filteredActs.length} pedalada(s)`;
  }

  const drawW = w - padL - padR;
  const drawH = h - padT - padB;
  const minScaleHr = 100, maxScaleHr = Math.max(190, userMaxHr);

  const getY = (hr) => padT + drawH - ((hr - minScaleHr) / (maxScaleHr - minScaleHr)) * drawH;

  // Grade Horizontal de BPM
  ctx.strokeStyle = '#1e293b'; ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let hr = 110; hr <= maxScaleHr; hr += 15) {
    const y = getY(hr);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(`${hr} bpm`, padL - 6, y + 3);
  }

  // Desenha as Barras das 7 Zonas
  const barWidth = (drawW / zoneKeys.length) - 16;

  zoneKeys.forEach((key, idx) => {
    const z = zonesData[key];
    const avgHr = avgHrs[key];
    const x = padL + idx * (barWidth + 16) + 8;

    if (avgHr > 0) {
      const y = Math.max(padT, getY(avgHr));
      const barH = Math.max(8, (padT + drawH) - y);

      ctx.fillStyle = z.color;
      ctx.fillRect(x, y, barWidth, barH);

      // Valor de BPM no topo da barra
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${avgHr} bpm`, x + barWidth / 2, y - 8);

      // Tempo acumulado na zona (discreto dentro da base da barra)
      const mins = Math.round(z.totWeight / 60);
      if (barH > 22 && mins > 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`, x + barWidth / 2, padT + drawH - 6);
      }
    } else {
      // Zona sem estímulo registrado no período
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, padT + drawH - 25, barWidth, 25);
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('s/ amostra', x + barWidth / 2, padT + drawH - 10);
    }

    // Rótulo da Zona + Faixa de Watts vigente no Eixo X
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(z.n, x + barWidth / 2, padT + drawH + 16);

    const wMin = Math.round(z.minP * latestFtp);
    const wMax = Math.round(z.maxP * latestFtp);
    const wLabel = key === 'Z1' ? `< ${wMax}W` : (key === 'Z7' ? `> ${wMin}W` : `${wMin}–${wMax}W`);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText(wLabel, x + barWidth / 2, padT + drawH + 30);
  });

  // Linha de Referência Horizontal do LTHR Dinâmico (42d)
  if (latestLthr >= minScaleHr && latestLthr <= maxScaleHr) {
    const yLthr = getY(latestLthr);
    ctx.save();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yLthr);
    ctx.lineTo(w - padR, yLthr);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 10.5px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`LTHR 42d: ${latestLthr} bpm`, w - padR - 4, yLthr - 5);
    ctx.restore();
  }
}
