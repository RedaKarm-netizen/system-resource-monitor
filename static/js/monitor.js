const MAX_HIST = 60;
const cpuHist  = Array(MAX_HIST).fill(0);
const memHist  = Array(MAX_HIST).fill(0);
const labels   = Array(MAX_HIST).fill('');
let   coresBuilt = false;
let   swapHidden = false;

// ── HELPERS ──────────────────────────────────────────────

function colorFor(pct) {
  if (pct < 50) return '#00d4aa';
  if (pct < 80) return '#f59e0b';
  return '#ef4444';
}

function classFor(pct) {
  if (pct < 50) return 'c-green';
  if (pct < 80) return 'c-yellow';
  return 'c-red';
}

function setGauge(id, pct, isBlue) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = 125.6 - (pct / 100) * 125.6;
  el.style.strokeDashoffset = offset;
  if (!isBlue) el.style.stroke = colorFor(pct);
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = pct + '%';
  el.className   = 'bar-fill' + (pct >= 80 ? ' danger' : pct >= 60 ? ' warn' : '');
}

function hideSwap() {
  if (swapHidden) return;
  swapHidden = true;
  const card = document.querySelector('.accent-yellow');
  if (card) card.style.display = 'none';
  const swapRow = document.getElementById('swap-bar')?.closest('.mem-row');
  if (swapRow) swapRow.style.display = 'none';
}

// ── SPARKLINES ───────────────────────────────────────────

const sparkOpts = (hist, color) => ({
  type: 'line',
  data: {
    labels,
    datasets: [{
      data: hist,
      borderColor: color,
      borderWidth: 1.5,
      fill: true,
      backgroundColor: color + '18',
      tension: 0.4,
      pointRadius: 0,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, min: 0, max: 100 }
    }
  }
});

const cpuChart = new Chart(document.getElementById('cpu-spark'), sparkOpts(cpuHist, '#00d4aa'));
const memChart = new Chart(document.getElementById('mem-spark'), sparkOpts(memHist, '#4f9eff'));

// ── CORES ────────────────────────────────────────────────

function buildCores(count) {
  if (coresBuilt) return;
  coresBuilt = true;
  const g = document.getElementById('cores-grid');
  g.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="core-cell">
      <div class="core-label">C${i}</div>
      <div class="core-bar-wrap">
        <div class="core-bar" id="core-bar-${i}" style="height:0%"></div>
      </div>
      <div class="core-pct" id="core-pct-${i}">0%</div>
    </div>`).join('');
}

function updateCores(perCore) {
  perCore.forEach((v, i) => {
    const bar = document.getElementById(`core-bar-${i}`);
    const lbl = document.getElementById(`core-pct-${i}`);
    if (!bar) return;
    bar.style.height     = v + '%';
    bar.style.background = colorFor(v);
    lbl.textContent      = v.toFixed(0) + '%';
    lbl.className        = 'core-pct ' + classFor(v);
  });
}

// ── DISK ─────────────────────────────────────────────────

function updateDisks(disks) {
  document.getElementById('disk-list').innerHTML = disks.map(d => `
    <div class="disk-row">
      <div class="disk-mount" title="${d.mount}">${d.mount}</div>
      <div class="disk-bar-wrap">
        <div class="disk-bar" style="width:${d.pct}%;background:${colorFor(d.pct)}"></div>
      </div>
      <div class="disk-info">${d.pct}% &middot; ${d.used}/${d.total}</div>
    </div>`).join('');
}

// ── PROCESSES ────────────────────────────────────────────

function badgeFor(status) {
  if (status === 'running')  return `<span class="badge badge-run">running</span>`;
  if (status === 'sleeping') return `<span class="badge badge-slp">sleep</span>`;
  return `<span class="badge badge-oth">${status}</span>`;
}

function updateProcs(procs) {
  document.getElementById('proc-tbody').innerHTML = procs.map(p => `
    <tr>
      <td><div class="proc-name">${p.name}</div></td>
      <td><span class="proc-pid">${p.pid}</span></td>
      <td class="${classFor(p.cpu)}">${p.cpu.toFixed(1)}</td>
      <td>${p.mem.toFixed(1)}</td>
      <td>${badgeFor(p.status)}</td>
    </tr>`).join('');
}

// ── MAIN UPDATE ──────────────────────────────────────────

function applyStats(d) {
  // Header
  document.getElementById('uptime').textContent = d.uptime;

  // Summary cards
  document.getElementById('cpu-val').textContent = d.cpu.toFixed(1) + '%';
  document.getElementById('cpu-sub').textContent = `${d.cores_logical} logical / ${d.cores_physical} physical`;
  document.getElementById('mem-val').textContent = d.mem_pct.toFixed(1) + '%';
  document.getElementById('mem-sub').textContent = d.mem_used + ' used';
  document.getElementById('proc-val').textContent = d.proc_count;
  document.getElementById('freq-sub').textContent = d.freq_cur + ' / ' + d.freq_max + ' MHz';

  // Swap — hide entirely on Windows
  if (d.is_windows) {
    hideSwap();
  } else {
    document.getElementById('swap-val').textContent      = d.swap_pct.toFixed(1) + '%';
    document.getElementById('swap-sub').textContent      = d.swap_used + ' used';
    document.getElementById('swap-bar-label').textContent = d.swap_pct.toFixed(1) + '%';
    setBar('swap-bar', d.swap_pct);
  }

  // Gauges
  setGauge('gauge-cpu', d.cpu, false);
  setGauge('gauge-mem', d.mem_pct, true);

  // Badges
  document.getElementById('cpu-freq-badge').textContent  = d.freq_cur + ' MHz';
  document.getElementById('mem-total-badge').textContent = d.mem_total;

  // RAM bar
  setBar('mem-bar', d.mem_pct);
  document.getElementById('mem-bar-label').textContent = d.mem_pct.toFixed(1) + '%';

  // Sparklines
  cpuHist.push(d.cpu);     cpuHist.shift();
  memHist.push(d.mem_pct); memHist.shift();
  cpuChart.update('none');
  memChart.update('none');

  // Cores
  buildCores(d.per_core.length);
  updateCores(d.per_core);

  // Disk, procs, mem info
  updateDisks(d.disks);
  updateProcs(d.procs);

  const swapRow = d.is_windows
    ? ''
    : `<tr><td>Swap used</td><td>${d.swap_used} / ${d.swap_total}</td></tr>`;

  document.getElementById('mem-info-table').innerHTML = `
    <tr><td>Used</td><td>${d.mem_used}</td></tr>
    <tr><td>Free</td><td>${d.mem_free}</td></tr>
    <tr><td>Total</td><td>${d.mem_total}</td></tr>
    ${swapRow}`;
}

// ── SSE STREAM ───────────────────────────────────────────

const es = new EventSource('/api/stream');
es.onmessage = e => applyStats(JSON.parse(e.data));
es.onerror   = () => console.warn('stream lost, browser will reconnect...');
