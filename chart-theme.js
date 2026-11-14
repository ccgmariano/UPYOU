// Funções utilitárias de período e Tooltips compartilhados pelos gráficos em Canvas
function getPeriodKey(date, period) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (period === 'ano') return `${y}`;
  if (period === 'semestre') return `${y}-S${Math.floor(m/6)+1}`;
  if (period === 'trimestre') return `${y}-T${Math.floor(m/3)+1}`;
  if (period === 'mes') return `${y}-${String(m+1).padStart(2,'0')}`;
  if (period === 'quinzena') return `${y}-${String(m+1).padStart(2,'0')}-Q${d<=15?1:2}`;
  if (period === 'semana') {
    const w = Math.ceil((((date - new Date(y,0,1))/86400000) + new Date(y,0,1).getDay()+1)/7);
    return `${y}-W${String(w).padStart(2,'0')}`;
  }
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// Regra estrita: Estruturado apenas quando VI <= 1.10
function isActivityStructured(m) {
  if (!m || !m.vi) return false;
  return m.vi <= 1.10;
}

function setupTooltip(canvas) {
  if (!canvas.tooltipDiv) {
    canvas.tooltipDiv = document.createElement('div');
    Object.assign(canvas.tooltipDiv.style, {
      position: 'absolute', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #475569',
      padding: '10px', borderRadius: '6px', color: '#fff', pointerEvents: 'none', display: 'none', zIndex: '100', fontSize: '12px'
    });
    document.body.appendChild(canvas.tooltipDiv);

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let found = false;
      if (canvas.chartHitboxes) {
        for (let box of canvas.chartHitboxes) {
          if (mx >= box.x - 2 && mx <= box.x + box.w + 2 && my >= box.y && my <= box.y + box.h) {
            const d = box.data;
            let html = '';
            if (box.type === 'drift') {
              const color = d.drift <= 5 ? '#22c55e' : '#ef4444';
              html = `<strong style="color:#38bdf8">${d.key}</strong><hr style="border-color:#334155; margin:5px 0;"/>Drift Médio: <span style="color:${color}; font-weight:bold">${d.drift}%</span><br/>Pedais elegíveis: ${d.count}`;
            } else if (box.type === 'zone') {
              html = `<strong style="color:#38bdf8">${d.key}</strong><br/>Total: ${(d.total/3600).toFixed(1)}h<hr style="border-color:#334155; margin:5px 0;" />`;
              Object.keys(d.zones).reverse().forEach(z => { html += `<b>${z}:</b> ${d.zones[z].hours}h (${d.zones[z].pct})<br/>`; });
            } else if (box.type === 'vi') {
              const color = d.vi <= 1.10 ? '#22c55e' : '#a78bfa';
              html = `<strong style="color:#38bdf8">${d.key}</strong><hr style="border-color:#334155; margin:5px 0;"/>VI Médio: <span style="color:${color}; font-weight:bold">${d.vi}</span><br/>Treinos: ${d.count}`;
            } else if (box.type === 'vol') {
              html = `<strong style="color:#38bdf8">${d.key}</strong><br/>Total: ${d.total}h<hr style="border-color:#334155; margin:5px 0;" />`;
              html += `<b style="color:#22c55e">Estruturado:</b> ${d.estruturado}h<br/><b style="color:#64748b">Livre:</b> ${d.livre}h`;
            }
            canvas.tooltipDiv.innerHTML = html;
            canvas.tooltipDiv.style.left = (e.pageX + 15) + 'px'; canvas.tooltipDiv.style.top = (e.pageY + 15) + 'px';
            canvas.tooltipDiv.style.display = 'block'; found = true; break;
          }
        }
      }
      if (!found) canvas.tooltipDiv.style.display = 'none';
    });
    canvas.addEventListener('mouseleave', () => canvas.tooltipDiv.style.display = 'none');
  }
}
