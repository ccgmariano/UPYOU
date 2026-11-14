// Aba 2: Evolução de FTP
function renderFtpChart(data) {
  const canvas = document.getElementById('ftpCanvas'); const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 900, h = 350; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const minT = data[0].date.getTime(), maxT = data[data.length - 1].date.getTime();
  const minF = Math.max(0, Math.min(...data.map(d => d.ftp)) * 0.85), maxF = Math.max(...data.map(d => d.ftp)) * 1.1;
  const pad = 45;
  const getX = (t) => pad + ((t - minT) / Math.max(1, maxT - minT)) * (w - pad * 2), getY = (f) => h - pad - ((f - minF) / Math.max(1, maxF - minF)) * (h - pad * 2);

  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let f = Math.ceil(minF / 25) * 25; f <= maxF; f += 25) {
    const y = getY(f); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${f}W`, pad - 6, y + 3);
  }
  ctx.beginPath(); ctx.strokeStyle = '#fc5200'; ctx.lineWidth = 2.5;
  data.forEach((pt, idx) => { const x = getX(pt.date.getTime()), y = getY(pt.ftp); if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
}
