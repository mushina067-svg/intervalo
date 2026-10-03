(() => {
'use strict';
const { simulateSession } = window.PhysioModel;
const A = window.SimApp;
const { state, parseTime, fmtSec, fmtClock, css, baseOpts, axisTitle } = A;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const COLORS = ['#0e8798', '#d2521f', '#6b5bd2', '#2f8f5b', '#c58a12', '#c43d6b', '#3b6fb6', '#7d7d2a'];
const colorOf = (i) => COLORS[i % COLORS.length];

/* ---------- Datos ---------- */
const blank = () => ({ name: '', reps: 4, dist: 50, intensity: 100, dur: '', rest: '1:00', mode: 'pasivo', best: '', real: '', trans: '4:00', transMode: 'activo', la: '', laMin: '3' });
const EXAMPLE = [
  { name: 'Snorkel 6×50 (25 pat / 25 libre)', reps: 6, dist: 50, intensity: 85, dur: '', rest: '1:31.174, 1:32.109, 1:30.859, 1:32.557, 1:31.543', mode: 'pasivo', best: '', real: '32.186, 32.395, 32.024, 32.344, 32.290, 32.256', trans: '4:00', transMode: 'activo' },
  { name: '2×100 libre (resp. c/2)', reps: 2, dist: 100, intensity: 95, dur: '', rest: '1:56.818', mode: 'pasivo', best: '', real: '1:01.815, 1:02.864', trans: '4:00', transMode: 'activo' },
  { name: '4×50 libre (resp. c/2)', reps: 4, dist: 50, intensity: 93, dur: '', rest: '1:50.155, 1:32.991, 1:34.858', mode: 'pasivo', best: '', real: '28.092, 27.822, 28.428, 28.295', trans: '4:00', transMode: 'activo' },
  { name: '4×75 libre (resp. c/2)', reps: 4, dist: 75, intensity: 100, dur: '', rest: '4:17.298, 4:20.095, 4:13.968', mode: 'pasivo', best: '', real: '41.920, 42.121, 42.909, 42.956', trans: '4:00', transMode: 'activo' },
  { name: '4×50 libre (resp. c/2)', reps: 4, dist: 50, intensity: 100, dur: '', rest: '3:37.240, 4:01.138, 4:20.862', mode: 'pasivo', best: '', real: '25.856, 26.294, 26.694, 26.341', trans: '10:00', transMode: 'activo' },
];
EXAMPLE.forEach(b => { b.la = ''; b.laMin = '3'; });
let blocks = EXAMPLE.map(b => ({ ...b }));
let last = null;

const parseList = (txt) => String(txt || '').split(/[;,\n]+|\s{1,}(?=\d)/).map(x => x.trim()).filter(Boolean).map(parseTime).filter(v => v > 0);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function resolve(b) {
  const real = parseList(b.real);
  const best = parseTime(b.best);
  const I = Math.max(40, Math.min(100, +b.intensity || 100));
  let work = parseTime(b.dur), auto = '';
  if (!(work > 0)) {
    if (real.length) { work = mean(real); auto = 'media real'; }
    else if (best > 0) { work = best * 100 / I; auto = 'máx ÷ intens.'; }
    else work = null;
  }
  const rl = parseList(b.rest);
  const reps = Math.max(1, Math.min(40, Math.round(+b.reps || 1)));
  const rests = rl.length ? Array.from({ length: Math.max(0, reps - 1) }, (_, i) => rl[Math.min(i, rl.length - 1)]) : Array(Math.max(0, reps - 1)).fill(60);
  const trans = parseTime(b.trans);
  const la = parseFloat(String(b.la || '').replace(',', '.')); const laMin = parseFloat(String(b.laMin || '3').replace(',', '.'));
  return { la: la > 0 && la < 30 ? la : null, laMin: laMin >= 0 ? laMin : 3, reps, work, auto, I, rests, real, best: best > 0 ? best : null, dist: +b.dist || 0, mode: b.mode, trans: trans > 0 ? trans : 0, transMode: b.transMode, name: b.name };
}
const toModel = (r) => ({ reps: r.reps, work: r.work, intensity: r.I, rests: r.rests, mode: r.mode, activeInt: state.activeInt, trans: r.trans, transMode: r.transMode, transAct: state.activeInt });
const opts = () => ({ profile: state.profile, age: state.age, laBase: state.laBase, laScale: state.laScale, dt: 1, post: 600 });

/* ---------- Editor ---------- */
function renderEditor() {
  const body = $('#sbBody');
  if (!blocks.length) { body.innerHTML = '<tr><td colspan="15" style="font-family:var(--font-body);color:var(--color-text-muted)">No hay bloques. Añade uno o carga el ejemplo.</td></tr>'; return; }
  body.innerHTML = blocks.map((b, i) => `<tr data-i="${i}">
    <td><span class="blk-dot" style="background:${colorOf(i)}"></span>${i + 1}</td>
    <td><input class="txt name" data-k="name" value="${esc(b.name)}" placeholder="Bloque ${i + 1}" aria-label="Nombre del bloque ${i + 1}"></td>
    <td><input class="txt xs" data-k="reps" value="${b.reps}" inputmode="numeric" aria-label="Repeticiones"></td>
    <td><input class="txt xs" data-k="dist" value="${b.dist || ''}" inputmode="numeric" aria-label="Distancia"></td>
    <td><input class="txt xs${b.estI ? ' est' : ''}" data-k="intensity" value="${b.intensity}" title="${b.estI ? 'Intensidad estimada al importar: revísala' : ''}" inputmode="numeric" aria-label="Intensidad"></td>
    <td><input class="txt" data-k="dur" value="${esc(b.dur)}" placeholder="auto" aria-label="Tiempo por repetición"><span class="auto" data-auto="${i}"></span></td>
    <td><input class="txt list" data-k="rest" value="${esc(b.rest)}" placeholder="1:00" aria-label="Descanso entre repeticiones"></td>
    <td><select class="txt" data-k="mode" aria-label="Tipo de descanso"><option value="pasivo"${b.mode === 'pasivo' ? ' selected' : ''}>Pasivo</option><option value="activo"${b.mode === 'activo' ? ' selected' : ''}>Activo</option></select></td>
    <td><input class="txt" data-k="best" value="${esc(b.best)}" placeholder="ej. 25.40" aria-label="Tiempo máximo"></td>
    <td><input class="txt list" data-k="real" value="${esc(b.real)}" placeholder="ej. 26.1, 26.4" aria-label="Tiempos reales"></td>
    <td>${i < blocks.length - 1 ? `<input class="txt" data-k="trans" value="${esc(b.trans)}" placeholder="4:00" aria-label="Pausa al siguiente bloque">` : `<input class="txt" data-k="trans" value="${esc(b.trans)}" placeholder="10:00" aria-label="Vuelta a la calma" title="Vuelta a la calma tras el último bloque">`}</td>
    <td><select class="txt" data-k="transMode" aria-label="Tipo de pausa entre bloques"><option value="pasivo"${b.transMode === 'pasivo' ? ' selected' : ''}>Pasivo</option><option value="activo"${b.transMode === 'activo' ? ' selected' : ''}>Activo</option></select></td>
    <td><input class="txt xs" data-k="la" value="${esc(b.la || '')}" placeholder="mmol" inputmode="decimal" aria-label="Lactato medido tras el bloque"></td>
    <td><input class="txt xs" data-k="laMin" value="${esc(b.laMin ?? '3')}" inputmode="decimal" aria-label="Minuto de la medición"></td>
    <td><div class="acts"><button type="button" class="icon-btn" data-a="up" aria-label="Subir">↑</button><button type="button" class="icon-btn" data-a="down" aria-label="Bajar">↓</button><button type="button" class="icon-btn" data-a="dup" aria-label="Duplicar">⧉</button><button type="button" class="icon-btn" data-a="del" aria-label="Eliminar">×</button></div></td>
  </tr>`).join('');
}
let tmr = null;
const later = () => { clearTimeout(tmr); tmr = setTimeout(run, 220); };
$('#sbBody').addEventListener('input', e => {
  const el = e.target, tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
  const bk = blocks[+tr.dataset.i]; bk[el.dataset.k] = el.value; if (el.dataset.k === 'intensity') { bk.estI = false; el.classList.remove('est'); } later();
});
$('#sbBody').addEventListener('change', e => { if (e.target.tagName === 'SELECT') run(); });
$('#sbBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-a]'); if (!btn) return;
  const i = +btn.closest('tr').dataset.i, a = btn.dataset.a;
  if (a === 'del') blocks.splice(i, 1);
  else if (a === 'dup') blocks.splice(i + 1, 0, { ...blocks[i] });
  else if (a === 'up' && i > 0) [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
  else if (a === 'down' && i < blocks.length - 1) [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
  renderEditor(); run();
});
$('#sbAdd').addEventListener('click', () => { blocks.push(blank()); renderEditor(); run(); });
$('#sbExample').addEventListener('click', () => { blocks = EXAMPLE.map(b => ({ ...b })); renderEditor(); run(); });
$('#sbClear').addEventListener('click', () => { blocks = []; renderEditor(); run(); });
$('#sbFromSerie').addEventListener('click', () => {
  const sw = A.sw;
  blocks.push({ name: (sw.name ? sw.name + ' · ' : '') + `${state.reps}×${sw.dist || ''}${sw.dist ? ' m' : fmtSec(state.work) + ' s'}`, reps: state.reps, dist: sw.dist || '', intensity: Math.round(state.intensity),
    dur: sw.best > 0 ? '' : String(Math.round(state.work * 10) / 10), rest: fmtClock(state.rest), mode: state.mode, best: sw.best > 0 ? fmtSec(sw.best) : '',
    real: (sw.real || []).filter(v => v > 0).map(fmtSec).join(', '), trans: '4:00', transMode: 'activo' });
  renderEditor(); run();
});

/* ---------- Gráficos ---------- */
const charts = {};
const blockLabels = {
  id: 'blockLabels',
  afterDatasetsDraw(chart, _a, o) {
    if (!o.items || !o.items.length) return;
    const { ctx, chartArea: ca, scales: { x } } = chart;
    ctx.save(); ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.textBaseline = 'top';
    o.items.forEach(it => { const px = x.getPixelForValue(it.t); if (px < ca.left - 1 || px > ca.right) return;
      ctx.fillStyle = it.color; ctx.fillRect(px, ca.top, 2, ca.bottom - ca.top);
      ctx.fillText('B' + it.n, px + 4, ca.top + 4); });
    ctx.restore();
  }
};
Chart.register(blockLabels);
function build() {
  Object.values(charts).forEach(c => c.destroy());
  const pcr = css('--c-pcr'), la = css('--c-la'), muted = css('--color-text-muted');
  let o = baseOpts();
  o.scales.x.type = 'linear'; o.scales.x.min = 0; o.scales.x.title = axisTitle('Tiempo de sesión (min)'); o.scales.x.ticks.callback = v => Math.round(v / 60) + "'"; o.scales.x.ticks.maxTicksLimit = 14;
  o.scales.y.min = 0; o.scales.y.max = 100; o.scales.y.title = axisTitle('PCr (% reposo)');
  o.scales.y1 = { position: 'right', min: 0, suggestedMax: 12, grid: { display: false }, border: { display: false }, ticks: { color: muted, padding: 6 }, title: axisTitle('Lactato (mmol/L)') };
  o.plugins.workShade = { intervals: [], color: css('--c-work') };
  o.plugins.blockLabels = { items: [] };
  o.plugins.tooltip.callbacks = { title: i => 't = ' + fmtClock(i[0].parsed.x), label: c => c.datasetIndex === 0 ? ` PCr ${c.parsed.y.toFixed(0)} %` : ` Lactato ${c.parsed.y.toFixed(1)} mmol/L` };
  o.elements = { point: { radius: 0, hoverRadius: 4 } };
  charts.time = new Chart($('#sbTime'), { type: 'line', data: { datasets: [
    { data: [], borderColor: pcr, backgroundColor: pcr + '22', fill: true, borderWidth: 1.8, tension: 0.1, yAxisID: 'y' },
    { data: [], borderColor: la, borderWidth: 2.4, tension: 0.2, yAxisID: 'y1' }
  ] }, options: o });

  o = baseOpts();
  o.scales.y.title = axisTitle('% de la velocidad máxima'); o.scales.y.suggestedMin = 80; o.scales.y.max = 101;
  o.scales.x.grid.display = false; o.scales.x.title = axisTitle('Bloque · repetición'); o.scales.x.ticks.autoSkip = false; o.scales.x.ticks.font = { size: 10 };
  o.plugins.tooltip.callbacks = {
    title: i => { const r = last && last.rows[i[0].dataIndex]; return r ? `${r.bName} · rep ${r.rep}` : ''; },
    label: c => { const r = last && last.rows[c.dataIndex]; if (!r || c.parsed.y == null) return null;
      return c.datasetIndex === 0 ? ` Modelo: ${c.parsed.y.toFixed(1)} %${r.predT ? ' · ' + fmtSec(r.predT) + ' s' : ''}` : ` Real: ${c.parsed.y.toFixed(1)} % · ${fmtSec(r.realT)} s`; } };
  charts.reps = new Chart($('#sbReps'), { data: { labels: [], datasets: [
    { type: 'bar', data: [], backgroundColor: [], borderRadius: 3, maxBarThickness: 26, order: 2 },
    { type: 'line', data: [], showLine: false, pointRadius: 5, pointHoverRadius: 6, pointBackgroundColor: la, pointBorderColor: css('--color-surface'), pointBorderWidth: 2, order: 0 }
  ] }, options: o });
}
document.addEventListener('sim:theme', () => { build(); run(); });
document.addEventListener('sim:render', () => later());

/* ---------- Simulación ---------- */
const laAt = (res, bi, min) => { const b = res.blocks[bi]; const t = b.tEnd + min * 60; const i = Math.min(res.series.length - 1, Math.max(0, Math.round(t) - 1)); return res.series[i].la; };
const realSds = (t) => t.length >= 2 ? (mean(t) / Math.min(...t) - 1) * 100 : null;
function startOf(res, bi) { return res.blocks[bi]; }
function findTransition(rs, j) {
  // pausa (activa) antes del bloque j para llegar con PCr ≥ 95 % y lactato ≤ 4 mmol/L
  for (let t = 60; t <= 1500; t += 30) {
    const m = rs.map(toModel); m[j - 1] = { ...m[j - 1], trans: t, transMode: 'activo' };
    const r = simulateSession(m.slice(0, j + 1), { ...opts(), post: 1 });
    const s = r.blocks[j]; if (s.pcrStart >= 95 && s.laStart <= 4) return t;
  }
  return null;
}
function run() {
  const rs = blocks.map(resolve);
  const bad = rs.findIndex(r => !(r.work > 0));
  const sum = $('#sbSummary');
  rs.forEach((r, i) => { const el = $(`[data-auto="${i}"]`); if (el) el.textContent = r.auto && r.work ? `${fmtSec(r.work)} s (${r.auto})` : ''; });
  if (!rs.length || bad >= 0) {
    sum.innerHTML = rs.length ? `<p>Al bloque ${bad + 1} le falta el tiempo por repetición: escríbelo, o pon tiempos reales o el tiempo máximo.</p>` : '<p>Añade bloques para simular la sesión.</p>';
    charts.time.data.datasets.forEach(d => d.data = []); charts.time.update('none');
    charts.reps.data.labels = []; charts.reps.data.datasets.forEach(d => d.data = []); charts.reps.update('none');
    $('#sbResults').innerHTML = ''; $('#sbRecs').innerHTML = ''; last = null; return;
  }
  const res = simulateSession(rs.map(toModel), opts());
  // filas por repetición
  const rows = [];
  const bSds = [];
  rs.forEach((b, bi) => {
    const rr = res.reps.filter(r => r.bi === bi);
    const T = Math.min(b.I, 98);
    const pp = rr.map(r => r.cap >= T - 0.05 ? b.I : r.cap);
    const mx = Math.max(...pp); bSds[bi] = (1 - mean(pp) / mx) * 100; res.blocks[bi].sds = bSds[bi];
    rr.forEach((r, k) => {
      const realT = b.real[k] || null;
      let predT = null, realP = null;
      if (b.best) { predT = b.best * 100 / pp[k]; if (realT) realP = b.best / realT * 100; }
      else if (b.real[0]) { predT = b.real[0] * pp[0] / pp[k]; if (realT) realP = pp[0] * b.real[0] / realT; }
      rows.push({ bi, rep: k + 1, bName: b.name || `Bloque ${bi + 1}`, pct: pp[k], predT, realT, realP, pcr: r.pcr, la: r.laStart });
    });
  });
  last = { res, rs, rows };

  // gráfico temporal
  const ser = res.series.filter((p, i) => i % 2 === 0);
  charts.time.data.datasets[0].data = ser.map(p => ({ x: p.t, y: p.pcr }));
  charts.time.data.datasets[1].data = ser.map(p => ({ x: p.t, y: p.la }));
  charts.time.options.scales.x.max = res.total;
  charts.time.options.plugins.workShade.intervals = res.reps.map(r => [r.t0, r.t0 + rs[r.bi].work]);
  charts.time.options.plugins.blockLabels.items = res.blocks.map((b, i) => ({ t: b.tStart, n: i + 1, color: colorOf(i) }));
  charts.time.update('none');
  // por repetición
  charts.reps.data.labels = rows.map(r => `B${r.bi + 1}·${r.rep}`);
  charts.reps.data.datasets[0].data = rows.map(r => r.pct);
  charts.reps.data.datasets[0].backgroundColor = rows.map(r => colorOf(r.bi) + 'cc');
  charts.reps.data.datasets[1].data = rows.map(r => r.realP);
  const lo = Math.min(...rows.map(r => r.pct), ...rows.filter(r => r.realP).map(r => r.realP));
  charts.reps.options.scales.y.min = Math.max(0, Math.floor((lo - 3) / 5) * 5);
  charts.reps.update('none');

  // resultados por bloque
  const totM = rs.reduce((a, b) => a + b.reps * b.dist, 0);
  const effort = rs.reduce((a, b) => a + b.reps * b.work, 0);
  const peak = Math.max(...res.blocks.map(b => b.peakLa));
  const worst = res.blocks.reduce((w, b, i) => b.sds > res.blocks[w].sds ? i : w, 0);
  $('#sbResults').innerHTML = rs.map((b, i) => {
    const s = res.blocks[i]; const rsd = realSds(b.real);
    const diff = rsd == null ? null : rsd - s.sds;
    const cls = diff == null ? '' : Math.abs(diff) < 1 ? 'good' : diff < 0 ? 'warn' : 'bad';
    const preds = rows.filter(r => r.bi === i).map(r => r.predT ? fmtSec(r.predT) : r.pct.toFixed(1) + '%').join(' · ');
    return `<tr><td style="font-family:var(--font-body)"><span class="blk-dot" style="background:${colorOf(i)}"></span>${esc(b.name || 'Bloque ' + (i + 1))}</td>
      <td class="${s.pcrStart < 85 ? 'bad' : s.pcrStart < 95 ? 'warn' : 'good'}">${s.pcrStart.toFixed(0)} %</td>
      <td class="${s.laStart > 6 ? 'bad' : s.laStart > 4 ? 'warn' : 'good'}">${s.laStart.toFixed(1)}</td>
      <td>${s.sds.toFixed(1)} %</td>
      <td class="${cls}">${rsd == null ? '—' : rsd.toFixed(1) + ' %'}</td>
      <td>${s.peakLa.toFixed(1)}</td>
      <td class="${b.la == null ? '' : Math.abs(b.la - laAt(res, i, b.laMin)) < 1 ? 'good' : 'warn'}">${b.la == null ? '— / ' + laAt(res, i, b.laMin).toFixed(1) : b.la.toFixed(1) + ' / ' + laAt(res, i, b.laMin).toFixed(1)}</td>
      <td>${preds}</td></tr>`;
  }).join('');
  sum.innerHTML = `<div class="chips">
    <div class="chip">Duración simulada<b>${fmtClock(res.total)}</b></div>
    <div class="chip">Metros de calidad<b>${totM ? totM + ' m' : '—'}</b></div>
    <div class="chip">Tiempo de esfuerzo<b>${fmtClock(effort)}</b></div>
    <div class="chip">Lactato pico de la sesión<b>${peak.toFixed(1)} mmol/L</b></div>
    <div class="chip">Bloque con más fatiga<b>B${worst + 1} · ${res.blocks[worst].sds.toFixed(1)} %</b></div>
  </div><p>Perfil ${state.profile}${state.age ? ', ' + state.age + ' años' : ''}${state.laScale !== 1 ? ', lactato calibrado ×' + state.laScale.toFixed(2) : ''}. Las barras son el modelo y los puntos, los tiempos reales.</p>${laBlock(rs, res)}`;
  const cb = $('#sbCalib'); if (cb) cb.addEventListener('click', () => calibrate(rs));
  const rb = $('#sbCalibReset'); if (rb) rb.addEventListener('click', () => { state.laScale = 1; A.schedule(); });
  renderRecs(rs, res);
}

function laBlock(rs, res) {
  const m = rs.map((b, i) => ({ b, i })).filter(x => x.b.la != null);
  const chip = state.laScale !== 1 ? `<div class="calib-chip">Lactato calibrado ×${state.laScale.toFixed(2)} <button type="button" id="sbCalibReset">quitar</button></div>` : '';
  if (!m.length) return `<p>Escribe el lactato medido en la columna “Lactato medido” (y el minuto tras el bloque) para compararlo con el modelo.</p>${chip}`;
  const bias = mean(m.map(x => x.b.la - laAt(res, x.i, x.b.laMin)));
  const msg = Math.abs(bias) < 1 ? 'El lactato del modelo coincide con tus lecturas.' : bias > 0 ? `Mariano produce más lactato que el modelo (+${bias.toFixed(1)} mmol/L de media).` : `El nadador produce menos lactato que el modelo (${bias.toFixed(1)} mmol/L de media).`;
  return `<p>${msg.replace('Mariano', 'El nadador')}</p>${Math.abs(bias) >= 1 ? '<button type="button" class="btn ghost" id="sbCalib" style="margin-top:.5rem">Calibrar lactato con estas lecturas</button>' : ''}${chip}`;
}
function calibrate(rs) {
  const m = rs.map((b, i) => ({ b, i })).filter(x => x.b.la != null);
  let best = { s: 1, e: Infinity };
  for (let sc = 0.2; sc <= 2.51; sc += 0.05) {
    const r = simulateSession(rs.map(toModel), { ...opts(), laScale: sc });
    const e = m.reduce((a, x) => { const d = x.b.la - laAt(r, x.i, x.b.laMin); return a + d * d; }, 0);
    if (e < best.e) best = { s: sc, e };
  }
  state.laScale = Math.round(best.s * 100) / 100; A.schedule();
}

/* ---------- Importar PDF del Timer ---------- */
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
async function pdfText(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); out += ' ' + tc.items.map(it => it.str).join(' '); }
  return out.replace(/\s+/g, ' ').replace(/−/g, '-');
}
const T = '(?:\\d+:)?\\d{1,2}\\.\\d{1,3}';
function parseTimer(txt) {
  const head = /(\d+)\s*[×x]\s*(\d+)\s*m\b([^·]*?)·\s*([\d.]+)\s*%/g;
  const heads = []; let h;
  while ((h = head.exec(txt))) heads.push({ idx: h.index, end: head.lastIndex, reps: +h[1], dist: +h[2], desc: h[3].trim(), pct: +h[4] });
  const rowRe = new RegExp(`(?:^|\\s)(\\d{1,2})\\s+(${T})s?\\s+(${T})s?\\s+[+-]?${T}s?\\s+([\\d.]+)%\\s+\\S+\\s+(\\d{1,2}:\\d{2}(?:\\.\\d+)?|—|–|-)`, 'g');
  const out = heads.map((hd, k) => {
    const prev = txt.slice(k ? heads[k - 1].end : 0, hd.idx);
    const lab = (prev.match(/([A-ZÁÉÍÓÚÑ0-9\/][A-ZÁÉÍÓÚÑ0-9\/ ]{1,40})\s*$/) || [, ''])[1].trim();
    const seg = txt.slice(hd.end, k < heads.length - 1 ? heads[k + 1].idx : txt.length);
    const rows = []; let r; rowRe.lastIndex = 0;
    while ((r = rowRe.exec(seg))) { rows.push({ n: +r[1], t: parseTime(r[2]), obj: parseTime(r[3]), rest: /\d/.test(r[5]) ? parseTime(r[5]) : null }); rowRe.lastIndex -= 1; }
    const uniq = []; rows.forEach(x => { if (!uniq.find(u => u.n === x.n) && x.n >= 1 && x.n <= hd.reps) uniq.push(x); });
    uniq.sort((a, b) => a.n - b.n);
    return { ...hd, label: lab.replace(/^\d+(\s|$)/, '').trim(), rows: uniq };
  }).filter(b => b.rows.length);
  const who = (txt.match(/(?:GLUCOLISIS|FOSFAGENO|AER[ÓO]BICO|[A-ZÁÉÍÓÚ\/]{4,})\s+([A-ZÁÉÍÓÚÑ]{3,}(?: [A-ZÁÉÍÓÚÑ]{2,})?)\s+CUMPLIMIENTO/) || [])[1] || '';
  const date = (txt.match(/(\d{1,2} [a-zé]{3,5}\.? \d{4})/) || [])[1] || '';
  return { who, date, blocks: out };
}
function toBlocks(parsed) {
  // intensidad estimada: velocidad respecto a la mejor marca de la sesión, normalizada por distancia (Riegel 1,06)
  const eq = (t, d) => t / Math.pow(d / 50, 1.06);
  let ref = Infinity; parsed.blocks.forEach(b => b.rows.forEach(r => { ref = Math.min(ref, eq(r.t, b.dist)); }));
  return parsed.blocks.map((b, i) => {
    const bestRep = Math.min(...b.rows.map(r => r.t));
    const I0 = Math.max(60, Math.min(100, Math.round(ref * Math.pow(b.dist / 50, 1.06) / bestRep * 100)));
    const I = I0 >= 95 ? 100 : I0; // ≥ 95 % de la mejor velocidad equivalente → esfuerzo máximo
    const rests = b.rows.slice(0, -1).map(r => r.rest).filter(Boolean);
    return { name: `${b.reps}×${b.dist} ${b.desc}${b.label ? ' (' + b.label.toLowerCase() + ')' : ''}`.replace(/\s+/g, ' ').trim(), reps: b.rows.length, dist: b.dist, intensity: I, estI: true, dur: '',
      rest: rests.length ? rests.map(fmtSec).join(', ') : '1:00', mode: 'pasivo', best: '', real: b.rows.map(r => fmtSec(r.t)).join(', '),
      trans: i < parsed.blocks.length - 1 ? '4:00' : '10:00', transMode: 'activo', la: '', laMin: '3' };
  });
}
$('#sbPdf').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const note = $('#sbImport'); note.hidden = false; note.className = 'import-note'; note.textContent = 'Leyendo el PDF…';
  try {
    if (!window.pdfjsLib) throw new Error('no se pudo cargar el lector de PDF');
    const txt = await pdfText(f); const parsed = parseTimer(txt);
    if (!parsed.blocks.length) throw new Error('no encontré bloques con el formato del Timer (ej. “4×50m libre · 102%”)');
    blocks = toBlocks(parsed); renderEditor(); run();
    const nR = parsed.blocks.reduce((a, b) => a + b.rows.length, 0);
    note.innerHTML = `Importado <b>${esc(f.name)}</b>${parsed.who ? ' · ' + esc(parsed.who) : ''}${parsed.date ? ' · ' + esc(parsed.date) : ''}: <b>${parsed.blocks.length} bloques</b> y <b>${nR} repeticiones</b> con sus tiempos y descansos. Revisa lo que el PDF no trae: la <b>intensidad</b> (estimada, en naranja), si los descansos fueron <b>pasivos o activos</b> y la <b>pausa entre bloques</b> (puesta en 4:00 activa). Luego añade el lactato medido.`;
  } catch (err) { note.className = 'import-note err'; note.textContent = 'No pude leer el PDF: ' + err.message + '.'; }
  e.target.value = '';
});

function renderRecs(rs, res) {
  const out = [];
  // llegada a cada bloque
  for (let j = 1; j < rs.length; j++) {
    const s = res.blocks[j]; if (!(s.laStart > 5 || s.pcrStart < 90)) continue;
    const need = findTransition(rs, j);
    const nm = rs[j].name || 'Bloque ' + (j + 1);
    out.push({ c: s.laStart > 7 ? 'bad' : 'warn', h: `B${j + 1}: empieza con fatiga`, p: `<strong>${esc(nm)}</strong> arranca con ${s.laStart.toFixed(1)} mmol/L de lactato y la PCr al ${s.pcrStart.toFixed(0)} %. ${need ? `Para llegar fresco (PCr ≥ 95 %, lactato ≤ 4) haz unos <strong>${fmtClock(need)} de recuperación activa</strong> antes de empezarlo (ahora: ${fmtClock(rs[j - 1].trans)} ${rs[j - 1].transMode}).` : 'Ni con 25 min de recuperación activa vuelve a valores basales: considera mover este bloque antes en la sesión.'} Si buscas tolerancia a la fatiga, puede ser intencional.` });
  }
  // modelo vs real
  const cmp = rs.map((b, i) => ({ i, r: realSds(b.real), m: res.blocks[i].sds })).filter(x => x.r != null);
  if (cmp.length) {
    const bias = mean(cmp.map(x => x.r - x.m));
    if (Math.abs(bias) < 1) out.push({ c: 'good', h: 'El modelo describe bien la sesión', p: `El decremento real se separa del modelo ${bias >= 0 ? '+' : ''}${bias.toFixed(1)} puntos de media. El perfil <strong>${state.profile}</strong> representa bien a este nadador.` });
    else if (bias < 0) out.push({ c: 'warn', h: 'Recupera mejor que el modelo', p: `De media, el nadador perdió ${Math.abs(bias).toFixed(1)} puntos menos de lo previsto. Puede que los descansos fueran más activos de lo indicado, que el esfuerzo no fuera al 100 %, o que su perfil sea más ${state.profile === 'velocista' ? 'mixto' : 'aeróbico'}. Prueba a cambiar el perfil en el panel izquierdo o a marcar el descanso como activo.` });
    else out.push({ c: 'bad', h: 'Se fatiga más que el modelo', p: `De media, el nadador perdió ${bias.toFixed(1)} puntos más de lo previsto. Revisa el sueño, la carga previa o la técnica bajo fatiga; si se repite, cambia el perfil a <strong>velocista</strong> o calibra el lactato.` });
  }
  // bloque con más decremento
  const w = res.blocks.reduce((a, b, i) => b.sds > res.blocks[a].sds ? i : a, 0);
  if (res.blocks[w].sds > 3) out.push({ c: 'warn', h: `B${w + 1} es el bloque más exigente`, p: `Decremento previsto ${res.blocks[w].sds.toFixed(1)} %. Si quieres velocidad de calidad en ese bloque, alarga el descanso entre repeticiones o cámbialo a activo; usa el simulador de serie única para encontrar el descanso exacto.` });
  // lactato final
  const lastB = res.series[res.series.length - 1];
  if (lastB.la > 4) out.push({ c: 'warn', h: 'Vuelta a la calma', p: `Tras la vuelta a la calma indicada, el lactato sigue en ${lastB.la.toFixed(1)} mmol/L. Alarga el nado suave (≈ 35–45 % de esfuerzo) para bajarlo antes del siguiente entrenamiento.` });
  out.push({ c: '', h: 'Qué medir para validar', p: 'Mide el lactato a los 1, 3 y 5 min del bloque más intenso y anota los tiempos reales de cada bloque. Escríbelo en la columna “Lactato medido” de cada bloque y pulsa “Calibrar lactato” para ajustar el modelo a este nadador.' });
  $('#sbRecs').innerHTML = out.map(r => `<div class="rec ${r.c}"><h3>${r.h}</h3><p>${r.p}</p></div>`).join('');
}

$('#sbCsv').addEventListener('click', () => {
  if (!last) return;
  const L = [['bloque', 'nombre', 'rep', 'velocidad_modelo_%', 'tiempo_modelo_s', 'tiempo_real_s', 'velocidad_real_%', 'pcr_inicio_%', 'lactato_inicio']];
  last.rows.forEach(r => L.push([r.bi + 1, '"' + r.bName.replace(/"/g, "'") + '"', r.rep, r.pct.toFixed(2), r.predT ? r.predT.toFixed(2) : '', r.realT ? r.realT.toFixed(2) : '', r.realP ? r.realP.toFixed(2) : '', r.pcr.toFixed(1), r.la.toFixed(2)]));
  L.push([]); L.push(['bloque', 'pcr_inicio', 'lactato_inicio', 'sds_modelo', 'sds_real', 'lactato_pico']);
  last.res.blocks.forEach((b, i) => { const rsd = realSds(last.rs[i].real); L.push([i + 1, b.pcrStart.toFixed(1), b.laStart.toFixed(2), b.sds.toFixed(2), rsd == null ? '' : rsd.toFixed(2), b.peakLa.toFixed(2)]); });
  const blob = new Blob([L.map(x => x.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sesion-completa.csv'; a.click(); URL.revokeObjectURL(a.href);
});

build();
renderEditor();
})();
