(() => {
'use strict';
const { simulate } = window.PhysioModel;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Tema ---------- */
const root = document.documentElement;
let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
root.setAttribute('data-theme', theme);
const toggle = $('[data-theme-toggle]');
const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>';
const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const paintToggle = () => { toggle.innerHTML = theme === 'dark' ? sun : moon; toggle.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'); };
paintToggle();
toggle.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', theme); paintToggle(); rebuildCharts(); });

/* ---------- Estado ---------- */
const state = { work: 12, intensity: 100, reps: 8, rest: 60, mode: 'pasivo', activeInt: 35, profile: 'mixto', goal: 'auto', age: null, laScale: 1, laBase: null };
const sw = { name: '', dist: null, best: null, target: null, real: [] };
const lab = { rows: [{ type: 'post', at: 1, val: null }, { type: 'post', at: 3, val: null }, { type: 'post', at: 5, val: null }] };
let lastLa = null;
const dataMode = () => sw.dist > 0 && sw.best > 0;

const PRESETS = [
  { id: 'vel', label: 'Velocidad pura 6×15 m / 2:30', s: { work: 7, intensity: 100, reps: 6, rest: 150, mode: 'pasivo' } },
  { id: 'gait', label: '10 × 6 s / 30 s', s: { work: 6, intensity: 100, reps: 10, rest: 30, mode: 'pasivo' } },
  { id: 's25', label: 'Sprint 8×25 m / 1:00', s: { work: 12, intensity: 100, reps: 8, rest: 60, mode: 'pasivo' } },
  { id: 'prod', label: 'Producción láctica 4×50 m / 4:00', s: { work: 26, intensity: 100, reps: 4, rest: 240, mode: 'activo', activeInt: 35 } },
  { id: 'tol', label: 'Tolerancia 6×50 m / 0:30', s: { work: 28, intensity: 95, reps: 6, rest: 30, mode: 'pasivo' } },
  { id: 'pico', label: 'Pico de lactato 3×100 m / 8:00', s: { work: 55, intensity: 100, reps: 3, rest: 480, mode: 'activo', activeInt: 35 } },
  { id: 'usrpt', label: 'Ritmo 100 m 20×25 m / 0:20', s: { work: 13, intensity: 90, reps: 20, rest: 20, mode: 'pasivo' } },
  { id: 'umb', label: 'Umbral 10×100 m / 0:15', s: { work: 70, intensity: 75, reps: 10, rest: 15, mode: 'pasivo' } },
];

/* ---------- Utilidades ---------- */
const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
const fmtTime = (s) => { s = Math.round(s); if (s < 60) return `${s} s`; const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; };
const fmtClock = (s) => { s = Math.round(s); const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; };
const ratioStr = (w, r) => { const x = r / w; return `1:${x >= 10 ? x.toFixed(0) : x.toFixed(x < 1 ? 2 : 1).replace(/\.0$/, '')}`; };
const approxDist = (t) => { const v = Math.max(1.45, 1.95 - 0.0035 * t); return Math.round(t * v / 5) * 5; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const params = (over = {}) => ({ ...state, ...over });
const effTarget = (I) => Math.min(I, 98);
// "12.4", "58.3", "1:05.2" → segundos
function parseTime(v) {
  if (v == null) return null; v = String(v).trim().replace(',', '.').replace(/\s*(s|seg)$/i, '');
  if (!v) return null;
  const p = v.split(':');
  if (p.length > 3 || p.some(x => x === '' || isNaN(+x))) return NaN;
  return p.reduce((acc, x) => acc * 60 + +x, 0);
}
const fmtSec = (t) => { if (t == null || isNaN(t)) return '—'; if (t < 60) return t.toFixed(2); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
const r1 = (x) => Math.round(x * 10) / 10;
const sustainedCount = (res, I) => { const T = effTarget(I); let n = 0; for (const r of res.reps) { if (r.cap >= T - 0.05) n++; else break; } return n; };

function classify(work, I, rest = state.rest) {
  const ratio = rest / work;
  if (I < 80) return { key: 'aer', name: 'Aeróbico / ritmo', sys: 'Aeróbico', sds: 4, ratio: '1:0.2 – 1:1', desc: 'Intensidad submáxima: predomina el metabolismo oxidativo y la PCr apenas se agota. Pausas cortas mantienen la densidad del estímulo.' };
  if (work <= 10 && I >= 90 && ratio >= 8) return { key: 'alp', name: 'Potencia aláctica', sys: 'ATP-PCr', sds: 2, ratio: '1:12 – 1:30', desc: 'Esfuerzos breves y máximos dependientes de fosfágenos. La prioridad es llegar a cada repetición con la PCr casi completa y sin acidosis.' };
  if (work <= 20 && I >= 85) return { key: 'alc', name: 'Capacidad aláctica / velocidad repetida', sys: 'ATP-PCr + glucolítico', sds: 4, ratio: '1:4 – 1:10', desc: 'Se busca repetir velocidad alta con resíntesis parcial de PCr, aceptando una caída moderada de rendimiento.' };
  if (work > 20 && work <= 60 && I >= 90 && ratio >= 5) return { key: 'glp', name: 'Potencia glucolítica (producción)', sys: 'Glucolítico', sds: 3, ratio: '1:8 – 1:15+', desc: 'Máxima tasa de producción de lactato. Requiere recuperación casi completa entre repeticiones para volver a producir a tope.' };
  return { key: 'glc', name: 'Capacidad glucolítica / tolerancia', sys: 'Glucolítico + aeróbico', sds: 8, ratio: '1:1 – 1:4', desc: 'Entrenar la tolerancia y el tamponamiento con acidosis acumulada. La fatiga creciente es parte del estímulo.' };
}
function goalThreshold(cls) {
  if (state.goal === 'calidad') return Math.min(cls.sds, 2);
  if (state.goal === 'densidad') return Math.max(cls.sds, 6);
  return cls.sds;
}
function minRestFor(mode, thr) {
  const reps = Math.max(state.reps, 2);
  const f = (rest) => simulate(params({ rest, mode, reps, lite: true, dt: 1, post: 0 })).sds;
  if (f(5) <= thr) return 5;
  if (f(900) > thr) return null;
  let lo = 5, hi = 900;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (f(mid) <= thr) hi = mid; else lo = mid; }
  return Math.ceil(hi / 5) * 5;
}

/* ---------- Controles ---------- */
const inputs = { work: $('#work'), intensity: $('#intensity'), reps: $('#reps'), rest: $('#rest'), activeInt: $('#activeInt') };
const presetBox = $('#presets');
// Plantillas propias: se guardan en el navegador si es posible; siempre exportables a archivo
let custom = [];
function persist() { updateStoreNote(); }
function updateStoreNote() {
  const n = $('#storeNote'); if (!n) return;
  n.textContent = custom.length ? 'Tus series se mantienen mientras la página esté abierta. Pulsa Exportar para guardarlas en un archivo e Importar para recuperarlas otro día.' : '';
}
function applyPreset(p, id) {
  if (dataMode()) { const { work, intensity, ...rest } = p.s; Object.assign(state, { activeInt: 35 }, rest); sw.target = intensity >= 100 ? null : r1(sw.best * 100 / intensity * 100) / 100; $('#swTarget').value = sw.target ? fmtSec(sw.target) : ''; applyData(); }
  else Object.assign(state, { activeInt: 35 }, p.s);
  state.planDist = p.s.dist || null;
  syncInputs(); markPreset(id); schedule();
}
function renderPresets() {
  presetBox.innerHTML = '';
  const all = [...PRESETS.map(p => ({ ...p, own: false })), ...custom.map(p => ({ ...p, own: true }))];
  all.forEach(p => {
    const wrap = document.createElement('span'); wrap.className = 'preset-wrap' + (p.own ? ' own' : '');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'preset'; b.textContent = p.label; b.dataset.id = p.id; b.setAttribute('aria-pressed', 'false');
    b.title = `${p.s.reps} × ${fmtTime(p.s.work)} @ ${p.s.intensity} % · desc. ${fmtClock(p.s.rest)} ${p.s.mode}`;
    b.addEventListener('click', () => applyPreset(p, p.id));
    wrap.appendChild(b);
    if (p.own) {
      const e = document.createElement('button'); e.type = 'button'; e.className = 'preset-x'; e.textContent = '✎'; e.setAttribute('aria-label', 'Editar ' + p.label);
      e.addEventListener('click', () => openForm(p));
      const x = document.createElement('button'); x.type = 'button'; x.className = 'preset-x'; x.textContent = '×'; x.setAttribute('aria-label', 'Eliminar ' + p.label);
      x.addEventListener('click', () => { if (confirm(`¿Eliminar la serie "${p.label}"?`)) { custom = custom.filter(c => c.id !== p.id); persist(); renderPresets(); } });
      wrap.append(e, x);
    }
    presetBox.appendChild(wrap);
  });
  updateStoreNote();
}
// Formulario
const form = $('#serieForm');
let editingId = null;
function openForm(p) {
  editingId = p ? p.id : null;
  const src = p ? p.s : { reps: state.reps, work: state.work, intensity: r1(state.intensity), rest: state.rest, mode: state.mode, activeInt: state.activeInt, dist: dataMode() ? sw.dist : null };
  $('#fName').value = p ? p.label : '';
  $('#fReps').value = src.reps;
  $('#fDist').value = src.dist || '';
  $('#fWork').value = src.work < 60 ? r1(src.work) : fmtClock(src.work);
  $('#fInt').value = src.intensity;
  $('#fRest').value = src.rest < 60 ? src.rest : fmtClock(src.rest);
  $('#fMode').value = src.mode;
  $('#fAct').value = src.activeInt || 35;
  $('#fActField').hidden = src.mode !== 'activo';
  $('#formTitle').textContent = p ? 'Editar serie' : 'Nueva serie';
  $('#formErr').textContent = '';
  form.hidden = false; $('#newSerie').hidden = true;
  $('#fName').focus();
}
function closeForm() { form.hidden = true; $('#newSerie').hidden = false; editingId = null; }
$('#newSerie').addEventListener('click', () => openForm(null));
$('#fCancel').addEventListener('click', closeForm);
$('#fMode').addEventListener('change', e => { $('#fActField').hidden = e.target.value !== 'activo'; });
form.addEventListener('submit', e => {
  e.preventDefault();
  const reps = parseInt($('#fReps').value, 10);
  const work = parseTime($('#fWork').value);
  const I = parseFloat(String($('#fInt').value).replace(',', '.'));
  const rest = parseTime($('#fRest').value);
  const dist = parseFloat($('#fDist').value);
  const errs = [];
  if (!(reps >= 1 && reps <= 40)) errs.push('repeticiones entre 1 y 40');
  if (!(work >= 2 && work <= 240)) errs.push('duración entre 2 s y 4:00');
  if (!(I >= 40 && I <= 100)) errs.push('intensidad entre 40 y 100 %');
  if (!(rest >= 5 && rest <= 900)) errs.push('descanso entre 5 s y 15:00');
  if (errs.length) { $('#formErr').textContent = 'Revisa: ' + errs.join(', ') + '.'; return; }
  const mode = $('#fMode').value;
  const s = { reps, work, intensity: I, rest, mode, activeInt: mode === 'activo' ? clamp(parseFloat($('#fAct').value) || 35, 15, 70) : 35, dist: dist > 0 ? dist : null };
  const auto = `${reps}×${s.dist ? s.dist + ' m' : fmtTime(work)} / ${fmtClock(rest)}`;
  const label = $('#fName').value.trim() ? `${$('#fName').value.trim()}` : auto;
  const id = editingId || 'c' + Date.now();
  const item = { id, label, s };
  const i = custom.findIndex(c => c.id === id);
  if (i >= 0) custom[i] = item; else custom.push(item);
  persist(); renderPresets(); closeForm(); applyPreset(item, id);
});
// Exportar / importar plantillas
$('#expSeries').addEventListener('click', () => {
  if (!custom.length) { $('#storeNote').textContent = 'Aún no has creado series propias.'; return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(custom, null, 2)], { type: 'application/json' }));
  a.download = 'mis_series_intervalo.json'; document.body.appendChild(a); a.click(); a.remove();
});
$('#impSeries').addEventListener('click', () => $('#impFile').click());
$('#impFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const arr = JSON.parse(await f.text());
    const ok = arr.filter(p => p && p.label && p.s && p.s.reps && p.s.work && p.s.rest && p.s.intensity);
    ok.forEach(p => { p.id = p.id || 'c' + Math.random().toString(36).slice(2); const i = custom.findIndex(c => c.id === p.id); if (i >= 0) custom[i] = p; else custom.push(p); });
    persist(); renderPresets();
    $('#storeNote').textContent = `${ok.length} series importadas.`;
  } catch (err) { $('#storeNote').textContent = 'No se pudo leer el archivo.'; }
  e.target.value = '';
});
renderPresets();
function markPreset(id) { $$('.preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id))); }
function setFill(el) { const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--fill', p + '%'); }
function syncInputs() {
  for (const k in inputs) inputs[k].value = state[k];
  $$('.seg[aria-label="Tipo de descanso"] button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
  $('#profile').value = state.profile; $('#goal').value = state.goal;
  updateLabels();
}
function setVal(id, v) { const el = $('#' + id); if (document.activeElement !== el) el.value = v; }
function updateLabels() {
  const dm = dataMode();
  setVal('workOut', state.work < 60 ? `${r1(state.work)} s` : fmtClock(state.work));
  $('#workHint').textContent = dm ? `${sw.dist} m en ${fmtSec(state.work)} s` : `≈ ${approxDist(state.work)} m de crol a máxima velocidad (nadador entrenado)`;
  setVal('intensityOut', r1(state.intensity) + ' %');
  setVal('repsOut', state.reps);
  setVal('restOut', state.rest < 60 ? `${state.rest} s` : fmtClock(state.rest));
  setVal('activeOut', state.activeInt + ' %');
  $('#ratioOut').textContent = ratioStr(state.work, state.rest);
  $('#activeField').hidden = state.mode !== 'activo';
  ['work', 'intensity'].forEach(k => { inputs[k].disabled = dm; $('#' + k + 'Out').disabled = dm; });
  $('#lockNote').hidden = !dm;
  for (const k in inputs) setFill(inputs[k]);
  const who = [sw.name, state.age ? state.age + ' años' : ''].filter(Boolean).join(', ');
  const dist = dm ? `${sw.dist} m` : state.planDist ? `${state.planDist} m` : `≈${approxDist(state.work)} m`;
  const tgt = dm ? ` en ${fmtSec(state.work)}` : '';
  $('#setString').textContent = `${who ? who + ' · ' : ''}${state.reps} × ${dist}${tgt} (${state.work < 60 ? r1(state.work) + ' s' : fmtClock(state.work)}) @ ${r1(state.intensity)} % · desc. ${fmtClock(state.rest)} ${state.mode}${state.mode === 'activo' ? ' ' + state.activeInt + ' %' : ''} · ${ratioStr(state.work, state.rest)}`;
  // resumen de datos
  const ds = $('#dataSummary');
  ds.hidden = !dm; $('#clearData').hidden = !(dm || sw.name || state.age);
  if (dm) {
    const vmax = sw.dist / sw.best, vt = sw.dist / state.work;
    const ag = window.PhysioModel.ageFactors(state.age);
    ds.innerHTML = `<div><span>Vel. máx</span><b>${vmax.toFixed(2)} m/s</b></div><div><span>Vel. objetivo</span><b>${vt.toFixed(2)} m/s</b></div><div><span>Intensidad</span><b>${r1(state.intensity)} %</b></div>` +
      (state.age ? `<div style="grid-column:1/-1"><span>Ajuste por edad: ${ag.label}</span></div>` : '');
  }
}
for (const k in inputs) inputs[k].addEventListener('input', e => { state[k] = +e.target.value; if (k === 'work') state.planDist = null; markPreset(null); updateLabels(); schedule(); });
// Casillas editables junto a cada control
const VALS = {
  workOut: { k: 'work', parse: parseTime, min: 2, max: 240 },
  intensityOut: { k: 'intensity', parse: v => parseFloat(String(v).replace(',', '.')), min: 40, max: 100 },
  repsOut: { k: 'reps', parse: v => Math.round(parseFloat(v)), min: 1, max: 40 },
  restOut: { k: 'rest', parse: parseTime, min: 5, max: 900 },
  activeOut: { k: 'activeInt', parse: v => parseFloat(String(v).replace(',', '.')), min: 15, max: 70 },
};
for (const id in VALS) {
  const el = $('#' + id), cfg = VALS[id];
  el.addEventListener('focus', () => el.select());
  el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = ''; el.blur(); } });
  el.addEventListener('change', () => {
    const v = cfg.parse(el.value.replace('%', '').trim());
    if (v != null && !isNaN(v)) { state[cfg.k] = clamp(v, cfg.min, cfg.max); markPreset(null); if (inputs[cfg.k]) inputs[cfg.k].value = state[cfg.k]; schedule(); }
    el.blur(); updateLabels();
  });
  el.addEventListener('blur', () => updateLabels());
}
// Datos del nadador
function applyData() {
  if (!dataMode()) return;
  const t = sw.target && sw.target >= sw.best ? sw.target : sw.best;
  state.work = t;
  state.intensity = Math.min(100, sw.best / t * 100);
  inputs.work.value = state.work; inputs.intensity.value = state.intensity;
}
function readData() {
  sw.name = $('#swName').value.trim();
  const age = parseInt($('#swAge').value, 10); state.age = isNaN(age) ? null : clamp(age, 6, 90);
  const d = parseFloat($('#swDist').value); sw.dist = isNaN(d) || d <= 0 ? null : d;
  const b = parseTime($('#swBest').value); $('#swBest').classList.toggle('invalid', Number.isNaN(b) || (b != null && b <= 0));
  sw.best = b > 0 ? b : null;
  const t = parseTime($('#swTarget').value);
  const badT = Number.isNaN(t) || (t != null && sw.best && t < sw.best);
  $('#swTarget').classList.toggle('invalid', badT);
  sw.target = t > 0 && !badT ? t : null;
  applyData(); markPreset(null); updateLabels(); schedule();
}
['swName', 'swAge', 'swDist', 'swBest', 'swTarget'].forEach(id => { $('#' + id).addEventListener('change', readData); $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); }); });
$('#clearData').addEventListener('click', () => {
  ['swName', 'swAge', 'swDist', 'swBest', 'swTarget'].forEach(id => { $('#' + id).value = ''; $('#' + id).classList.remove('invalid'); });
  Object.assign(sw, { name: '', dist: null, best: null, target: null }); state.age = null; updateLabels(); schedule();
});

$$('.seg[aria-label="Tipo de descanso"] button').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; markPreset(null); syncInputs(); schedule(); }));
$('#profile').addEventListener('change', e => { state.profile = e.target.value; schedule(); });
$('#goal').addEventListener('change', e => { state.goal = e.target.value; schedule(); });
let sensMetric = 'sds';
$$('#sensMetric button').forEach(b => b.addEventListener('click', () => { sensMetric = b.dataset.metric; $$('#sensMetric button').forEach(x => x.setAttribute('aria-checked', String(x === b))); renderSens(); }));

/* ---------- Gráficos ---------- */
Chart.defaults.font.family = "'Satoshi', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.animation.duration = 250;
const charts = {};
let lastMain = null, sensData = null, heatData = null;

const workShade = {
  id: 'workShade',
  beforeDatasetsDraw(chart, _a, opts) {
    const iv = opts.intervals; if (!iv || !iv.length) return;
    const { ctx, chartArea: ca, scales: { x } } = chart;
    ctx.save(); ctx.fillStyle = opts.color;
    for (const [a, b] of iv) { const x0 = x.getPixelForValue(a), x1 = x.getPixelForValue(b); ctx.fillRect(Math.max(x0, ca.left), ca.top, Math.min(x1, ca.right) - Math.max(x0, ca.left), ca.bottom - ca.top); }
    ctx.restore();
  }
};
const vLine = {
  id: 'vLine',
  afterDatasetsDraw(chart, _a, opts) {
    if (opts.x == null) return;
    const { ctx, chartArea: ca, scales: { x } } = chart; const px = x.getPixelForValue(opts.x);
    if (px < ca.left || px > ca.right) return;
    ctx.save(); ctx.strokeStyle = opts.color; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = opts.color; ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.textAlign = px > ca.right - 90 ? 'right' : 'left';
    ctx.fillText(opts.label, px + (ctx.textAlign === 'right' ? -6 : 6), ca.top + 12); ctx.restore();
  }
};
Chart.register(workShade, vLine);

function baseOpts() {
  const grid = css('--color-divider'), tick = css('--color-text-muted');
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--color-text'), titleColor: css('--color-surface'), bodyColor: css('--color-surface'), padding: 10, cornerRadius: 6, boxPadding: 4, titleFont: { family: "'JetBrains Mono', monospace", size: 11 }, bodyFont: { size: 12 } } },
    scales: {
      x: { grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: tick, padding: 6 } },
      y: { grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: tick, padding: 6 } }
    }
  };
}
const axisTitle = (t) => ({ display: true, text: t, color: css('--color-text-muted'), font: { size: 11 } });

function buildCharts() {
  const pcr = css('--c-pcr'), la = css('--c-la'), cap = css('--c-cap'), fail = css('--c-fail'), muted = css('--color-text-muted'), primary = css('--color-primary');
  // Temporal
  let o = baseOpts();
  o.scales.x.type = 'linear'; o.scales.x.title = axisTitle('Tiempo (min:s)'); o.scales.x.ticks.callback = v => fmtClock(v); o.scales.x.ticks.maxTicksLimit = 10;
  o.scales.y.min = 0; o.scales.y.max = 100; o.scales.y.title = axisTitle('PCr (% reposo)');
  o.scales.y1 = { position: 'right', min: 0, suggestedMax: 12, grid: { display: false }, border: { display: false }, ticks: { color: muted, padding: 6 }, title: axisTitle('Lactato (mmol/L)') };
  o.plugins.workShade = { intervals: [], color: css('--c-work') };
  o.plugins.tooltip.callbacks = { title: i => 't = ' + fmtClock(i[0].parsed.x), label: c => c.datasetIndex === 0 ? ` PCr ${c.parsed.y.toFixed(0)} %` : ` Lactato ${c.parsed.y.toFixed(1)} mmol/L` };
  o.elements = { point: { radius: 0, hoverRadius: 4 } };
  charts.time = new Chart($('#timeChart'), { type: 'line', data: { datasets: [
    { data: [], borderColor: pcr, backgroundColor: pcr + '22', fill: true, borderWidth: 2, tension: 0.15, yAxisID: 'y' },
    { data: [], borderColor: la, borderWidth: 2.4, tension: 0.2, yAxisID: 'y1' }
  ] }, options: o });

  // Repeticiones
  o = baseOpts();
  o.scales.y.title = axisTitle('% de la velocidad máxima'); o.scales.y.max = 101;
  o.scales.x.grid.display = false; o.scales.x.title = axisTitle('Repetición');
  o.scales.y1 = { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { color: muted, padding: 6 }, title: axisTitle('PCr inicial (% reposo)') };
  o.plugins.tooltip.callbacks = { title: i => 'Repetición ' + i[0].label, label: c => c.parsed.y == null ? null : [' Velocidad disponible', ' Objetivo', ' PCr inicial', ' Real'][c.datasetIndex] + ': ' + c.parsed.y.toFixed(1) + ' %' };
  charts.rep = new Chart($('#repChart'), { data: { labels: [], datasets: [
    { type: 'bar', data: [], backgroundColor: [], borderRadius: 4, maxBarThickness: 38, order: 3 },
    { type: 'line', data: [], borderColor: primary, borderDash: [6, 4], borderWidth: 1.6, pointRadius: 0, order: 1 },
    { type: 'line', data: [], borderColor: pcr, borderWidth: 2, pointRadius: 3, pointBackgroundColor: pcr, tension: 0.2, order: 2, yAxisID: 'y1' },
    { type: 'line', data: [], showLine: false, pointRadius: 6, pointHoverRadius: 7, pointBackgroundColor: la, pointBorderColor: css('--color-surface'), pointBorderWidth: 2, order: 0 }
  ] }, options: o });

  // PCr
  o = baseOpts();
  o.scales.x.type = 'linear'; o.scales.x.min = 0; o.scales.x.max = 480; o.scales.x.ticks.callback = v => fmtClock(v); o.scales.x.title = axisTitle('Descanso tras el esfuerzo (min:s)'); o.scales.x.ticks.stepSize = 60;
  o.scales.y.min = 0; o.scales.y.max = 100; o.scales.y.title = axisTitle('PCr (% reposo)');
  o.elements = { point: { radius: 0, hoverRadius: 4 } };
  o.plugins.vLine = { x: null, label: '', color: muted };
  o.plugins.tooltip.callbacks = { title: i => 'Descanso ' + fmtClock(i[0].parsed.x), label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(0)} %` };
  o.plugins.legend = { display: true, position: 'top', align: 'end', labels: { color: muted, boxWidth: 14, boxHeight: 3, font: { size: 11 } } };
  charts.pcr = new Chart($('#pcrChart'), { type: 'line', data: { datasets: [
    { label: 'Pasivo', data: [], borderColor: pcr, borderWidth: 2.4, tension: 0.2 },
    { label: 'Activo', data: [], borderColor: muted, borderDash: [5, 4], borderWidth: 2, tension: 0.2 },
    { label: 'Medido', data: [], type: 'scatter', pointRadius: 6, pointHoverRadius: 7, pointBackgroundColor: css('--color-text'), pointBorderColor: css('--color-surface'), pointBorderWidth: 2 }
  ] }, options: o });

  // Lactato
  o = baseOpts();
  o.scales.x.type = 'linear'; o.scales.x.min = 0; o.scales.x.ticks.callback = v => Math.round(v / 60) + "'"; o.scales.x.title = axisTitle('Tiempo desde el inicio (min)'); o.scales.x.ticks.stepSize = 120;
  o.scales.y.min = 0; o.scales.y.title = axisTitle('Lactato (mmol/L)');
  o.elements = { point: { radius: 0, hoverRadius: 4 } };
  o.plugins.vLine = { x: null, label: 'fin de la serie', color: muted };
  o.plugins.tooltip.callbacks = { title: i => 't = ' + fmtClock(i[0].parsed.x), label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} mmol/L` };
  o.plugins.legend = { display: true, position: 'top', align: 'end', labels: { color: muted, boxWidth: 14, boxHeight: 3, font: { size: 11 } } };
  charts.la = new Chart($('#laChart'), { type: 'line', data: { datasets: [
    { label: 'Pasivo', data: [], borderColor: la, borderWidth: 2.4, tension: 0.2 },
    { label: 'Activo', data: [], borderColor: muted, borderDash: [5, 4], borderWidth: 2, tension: 0.2 },
    { label: 'Medido', data: [], type: 'scatter', pointRadius: 6, pointHoverRadius: 7, pointBackgroundColor: css('--color-text'), pointBorderColor: css('--color-surface'), pointBorderWidth: 2 }
  ] }, options: o });

  // Sensibilidad
  o = baseOpts();
  o.scales.x.type = 'logarithmic'; o.scales.x.min = 0.5; o.scales.x.max = 20; o.scales.x.title = axisTitle('Ratio trabajo:descanso (1:x, escala log)');
  o.scales.x.afterBuildTicks = ax => { ax.ticks = [0.5, 1, 2, 3, 5, 8, 12, 20].map(v => ({ value: v })); };
  o.scales.x.ticks.callback = v => '1:' + v;
  o.elements = { point: { radius: 0, hoverRadius: 4 } };
  o.interaction = { mode: 'nearest', intersect: false, axis: 'x' };
  charts.sens = new Chart($('#sensChart'), { type: 'line', data: { datasets: [
    { label: 'Pasivo', data: [], borderColor: primary, borderWidth: 2.4, tension: 0.3 },
    { label: 'Activo', data: [], borderColor: la, borderWidth: 2, borderDash: [5, 4], tension: 0.3 },
    { label: 'Tu serie', data: [], type: 'scatter', pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: css('--color-surface'), pointBorderColor: css('--color-text'), pointBorderWidth: 2.5 }
  ] }, options: o });
}
function rebuildCharts() { Object.values(charts).forEach(c => c.destroy()); buildCharts(); renderAll(true); document.dispatchEvent(new Event('sim:theme')); }

/* ---------- Render principal ---------- */
function renderMain() {
  const res = simulate(params());
  lastMain = res;
  const cls = classify(state.work, state.intensity);
  const thr = goalThreshold(cls);
  // Temporal
  const step = Math.max(1, Math.round(res.series.length / 900));
  const ser = res.series.filter((_, i) => i % step === 0);
  charts.time.data.datasets[0].data = ser.map(s => ({ x: s.t, y: s.pcr }));
  charts.time.data.datasets[1].data = ser.map(s => ({ x: s.t, y: s.la }));
  const iv = []; for (let i = 0; i < state.reps; i++) { const a = i * (state.work + state.rest); iv.push([a, a + state.work]); }
  charts.time.options.plugins.workShade.intervals = iv;
  charts.time.options.plugins.workShade.color = css('--c-work');
  charts.time.options.scales.x.max = res.series[res.series.length - 1].t;
  charts.time.update();

  // Reps
  const fail = css('--c-fail'), cap = css('--c-cap');
  charts.rep.data.labels = res.reps.map(r => r.rep);
  charts.rep.data.datasets[0].data = res.reps.map(r => r.cap);
  charts.rep.data.datasets[0].backgroundColor = res.reps.map(r => r.cap >= effTarget(state.intensity) - 0.05 ? cap : fail);
  charts.rep.data.datasets[1].data = res.reps.map(() => effTarget(state.intensity));
  charts.rep.data.datasets[2].data = res.reps.map(r => r.pcr);
  charts.rep.data.datasets[3].data = realPct(res.reps.length);
  const minY = Math.min(...res.reps.map(r => r.cap), effTarget(state.intensity), ...charts.rep.data.datasets[3].data.filter(v => v != null));
  charts.rep.options.scales.y.min = Math.max(0, Math.floor((minY - 3) / 2) * 2);
  charts.rep.update();

  // PCr resíntesis tras un esfuerzo único
  const pcrCurves = {};
  for (const m of ['pasivo', 'activo']) {
    const r = simulate(params({ reps: 1, mode: m, post: 480, dt: 1 }));
    pcrCurves[m] = r.series.filter(s => s.t >= state.work).map(s => ({ x: s.t - state.work, y: s.pcr }));
  }
  charts.pcr.data.datasets[0].data = pcrCurves.pasivo;
  charts.pcr.data.datasets[1].data = pcrCurves.activo;
  charts.pcr.options.plugins.vLine = { x: state.rest, label: 'tu descanso ' + fmtClock(state.rest), color: css('--color-text-muted') };
  charts.pcr.update();
  const at = (arr, t) => { const p = arr.find(q => q.x >= t - 1e-6); return p ? p.y : arr[arr.length - 1].y; };
  const tTo = (arr, v) => { const p = arr.find(q => q.y >= v); return p ? p.x : null; };
  const pcrMin = pcrCurves.pasivo[0].y;
  const half = pcrMin + (100 - pcrMin) * 0.5;
  $('#pcrTable').innerHTML = [
    ['PCr al terminar', pcrMin.toFixed(0) + ' %'],
    ['Semirrecuperación', (tTo(pcrCurves.pasivo, half) != null ? fmtTime(tTo(pcrCurves.pasivo, half)) : '—')],
    ['90 % pasivo / activo', `${fmtT(tTo(pcrCurves.pasivo, 90))} / ${fmtT(tTo(pcrCurves.activo, 90))}`],
    [`A ${fmtClock(state.rest)} pas. / act.`, `${at(pcrCurves.pasivo, state.rest).toFixed(0)} / ${at(pcrCurves.activo, state.rest).toFixed(0)} %`]
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');

  // Lactato: serie completa con cada tipo de descanso + 15 min
  const endT = state.reps * state.work + (state.reps - 1) * state.rest;
  const laCurves = {}, laRes = {};
  for (const m of ['pasivo', 'activo']) {
    const r = simulate(params({ mode: m, post: 900, dt: 1 }));
    laRes[m] = r;
    const st = Math.max(1, Math.round(r.series.length / 700));
    laCurves[m] = r.series.filter((_, i) => i % st === 0).map(s => ({ x: s.t, y: s.la }));
  }
  charts.la.data.datasets[0].data = laCurves.pasivo;
  charts.la.data.datasets[1].data = laCurves.activo;
  charts.la.options.scales.x.max = endT + 900;
  charts.la.options.scales.x.ticks.stepSize = (endT + 900) > 1800 ? 300 : 120;
  charts.la.options.plugins.vLine = { x: endT, label: 'fin de la serie', color: css('--color-text-muted') };
  charts.la.update();
  const below = (r, v) => { const p = r.series.find(s => s.t > endT && s.la <= v && s.t > (r.series.reduce((m, q) => q.la > m.la ? q : m).t)); return p ? p.t - endT : null; };
  const post10 = (r) => { const p = r.series.find(s => s.t >= endT + 600); return p ? p.la : null; };
  $('#laTable').innerHTML = [
    ['Pico pasivo / activo', `${laRes.pasivo.peakLa.toFixed(1)} / ${laRes.activo.peakLa.toFixed(1)}`],
    ['A 10 min post pas.', (post10(laRes.pasivo) ?? 0).toFixed(1) + ' mmol/L'],
    ['A 10 min post act.', (post10(laRes.activo) ?? 0).toFixed(1) + ' mmol/L'],
    ['< 4 mmol/L pas. / act.', `${fmtT(below(laRes.pasivo, 4), '> 15′')} / ${fmtT(below(laRes.activo, 4), '> 15′')}`]
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');

  lastLa = { r: laRes[state.mode], endT };
  return { res, cls, thr, laRes, pcrCurves, endT };
}
function fmtT(t, none = '> 8′') { return t == null ? none : fmtClock(t); }

/* ---------- KPIs ---------- */
function renderKpis(ctx) {
  const { res, cls, thr } = ctx;
  const n = res.reps.length;
  const sust = sustainedCount(res, state.intensity);
  const pcr2 = n > 1 ? res.reps[1].pcr : null;
  const pcrLast = res.reps[n - 1].pcr;
  const sdsCls = res.sds <= thr ? 'good' : res.sds <= thr * 1.8 ? 'warn' : 'bad';
  const la = res.peakLa;
  const laZone = la < 4 ? 'Aeróbico / aláctico' : la < 8 ? 'Mixto' : la < 12 ? 'Glucolítico alto' : 'Tolerancia máxima';
  const opt = ctx.optRest;
  const kp = [
    { l: 'Ratio trabajo:descanso', v: ratioStr(state.work, state.rest), note: cls.sys },
    { l: 'PCr al iniciar la rep. 2', v: pcr2 == null ? '—' : pcr2.toFixed(0), u: pcr2 == null ? '' : '%', note: pcr2 == null ? 'Serie de 1 repetición' : 'del valor de reposo' },
    { l: 'PCr antes de la última', v: pcrLast.toFixed(0), u: '%', note: `mínimo en esfuerzo: ${Math.min(...res.reps.map(r => r.pcrEnd)).toFixed(0)} %` },
    { l: 'Lactato pico estimado', v: la.toFixed(1), u: 'mmol/L', note: laZone },
    { l: 'Sprint decrement score', v: res.sds.toFixed(1), u: '%', note: `umbral del objetivo ≤ ${thr} %`, dot: sdsCls },
    { l: 'Índice de fatiga', v: res.fi.toFixed(1), u: '%', note: 'última vs. mejor repetición' },
    { l: 'Repeticiones sostenibles', v: `${sust}/${n}`, note: sust === n ? `mantiene ≥ ${effTarget(state.intensity)} % de vel.` : `cae bajo el ${effTarget(state.intensity)} % en la rep. ${sust + 1}`, dot: sust === n ? 'good' : sust >= n * 0.6 ? 'warn' : 'bad' },
    { l: 'Descanso óptimo estimado', v: opt.rest == null ? '> 15:00' : fmtClock(opt.rest), note: opt.rest == null ? 'reduce repeticiones' : `${opt.mode} · ${ratioStr(state.work, opt.rest)}` }
  ];
  $('#kpis').innerHTML = kp.map(k => `<div class="kpi"><div class="kpi-label">${k.dot ? `<i class="dot ${k.dot}"></i>` : ''}${k.l}</div><div class="kpi-value">${k.v}${k.u ? `<small>${k.u}</small>` : ''}</div><div class="kpi-note">${k.note}</div></div>`).join('');
}

/* ---------- Sensibilidad ---------- */
const RATIOS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
function computeSens() {
  const reps = Math.max(state.reps, 2);
  const out = { pasivo: [], activo: [] };
  for (const m of ['pasivo', 'activo']) for (const r of RATIOS) {
    const s = simulate(params({ rest: state.work * r, mode: m, reps, lite: true, dt: 1, post: 240 }));
    out[m].push({ r, sds: s.sds, pcr: s.reps[s.reps.length - 1].pcr, la: s.peakLa });
  }
  const cur = simulate(params({ reps, lite: true, dt: 1, post: 240 }));
  out.cur = { r: state.rest / state.work, sds: cur.sds, pcr: cur.reps[cur.reps.length - 1].pcr, la: cur.peakLa };
  sensData = out;
}
function renderSens() {
  if (!sensData) return;
  const k = sensMetric;
  const lab = { sds: 'Sprint decrement score (%)', pcr: 'PCr antes de la última rep. (%)', la: 'Lactato pico (mmol/L)' }[k];
  const c = charts.sens;
  c.data.datasets[0].data = sensData.pasivo.map(d => ({ x: d.r, y: d[k] }));
  c.data.datasets[1].data = sensData.activo.map(d => ({ x: d.r, y: d[k] }));
  const cr = clamp(sensData.cur.r, 0.5, 20);
  c.data.datasets[2].data = [{ x: cr, y: sensData.cur[k] }];
  c.data.datasets[2].label = `Tu serie (${state.mode})`;
  c.options.scales.y.title = axisTitle(lab);
  c.options.scales.y.min = 0;
  c.options.scales.y.max = k === 'pcr' ? 100 : undefined;
  const unit = k === 'la' ? ' mmol/L' : ' %';
  c.options.plugins.tooltip.callbacks = { title: i => 'Ratio 1:' + (+i[0].parsed.x.toFixed(2)), label: x => ` ${x.dataset.label}: ${x.parsed.y.toFixed(1)}${unit}` };
  c.options.plugins.legend = { display: true, position: 'top', align: 'end', labels: { color: css('--color-text-muted'), boxWidth: 14, boxHeight: 3, font: { size: 11 } } };
  c.update();
}

/* ---------- Mapa de calor ---------- */
const H_DUR = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 90, 120, 180];
const H_RAT = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
function computeHeat() {
  const reps = Math.max(state.reps, 2);
  heatData = H_DUR.map(w => H_RAT.map(r => simulate(params({ work: w, rest: w * r, reps, lite: true, dt: 1, post: 0 })).sds));
}
const STOPS = [[0, [31, 157, 107]], [0.25, [140, 193, 82]], [0.5, [242, 201, 76]], [0.75, [238, 138, 58]], [1, [200, 50, 59]]];
function heatColor(v) {
  const t = clamp(v / 12, 0, 1);
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i]; const f = (t - a) / (b - a);
    return ca.map((c, j) => Math.round(c + (cb[j] - c) * f));
  }
  return STOPS[STOPS.length - 1][1];
}
let heatGeom = null;
function drawHeat() {
  const cv = $('#heatmap'); const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const padL = 58, padB = 44, padT = 8, padR = 8;
  const cw = (W - padL - padR) / H_RAT.length, ch = (H - padT - padB) / H_DUR.length;
  heatGeom = { padL, padT, cw, ch };
  const small = W < 520;
  ctx.font = `${small ? 10 : 11}px 'JetBrains Mono', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // celdas (duración ascendente de arriba a abajo)
  H_DUR.forEach((w, i) => H_RAT.forEach((r, j) => {
    const v = heatData[i][j]; const [R, G, B] = heatColor(v);
    const x = padL + j * cw, y = padT + i * ch;
    ctx.fillStyle = `rgb(${R},${G},${B})`; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    if (!small || cw > 26) { const lum = 0.299 * R + 0.587 * G + 0.114 * B; ctx.fillStyle = lum > 150 ? 'rgba(10,20,25,.85)' : 'rgba(255,255,255,.95)'; ctx.fillText(cw > 34 ? v.toFixed(1) : v.toFixed(0), x + cw / 2, y + ch / 2); }
  }));
  // selección actual
  const ni = nearestIdx(H_DUR, state.work), nj = nearestIdx(H_RAT, state.rest / state.work);
  ctx.strokeStyle = css('--color-text'); ctx.lineWidth = 2.5; ctx.strokeRect(padL + nj * cw + 1, padT + ni * ch + 1, cw - 2, ch - 2);
  // ejes
  ctx.fillStyle = css('--color-text-muted'); ctx.textAlign = 'right';
  H_DUR.forEach((w, i) => ctx.fillText(w + ' s', padL - 8, padT + i * ch + ch / 2));
  ctx.textAlign = 'center';
  H_RAT.forEach((r, j) => { if (!small || j % 2 === 0) ctx.fillText('1:' + r, padL + j * cw + cw / 2, H - padB + 14); });
  ctx.font = "11px 'Satoshi', sans-serif";
  ctx.fillText('Ratio trabajo:descanso', padL + (W - padL - padR) / 2, H - 10);
  ctx.save(); ctx.translate(12, padT + (H - padT - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Duración del esfuerzo', 0, 0); ctx.restore();
}
function nearestIdx(arr, v) { let b = 0; arr.forEach((a, i) => { if (Math.abs(Math.log(a) - Math.log(v)) < Math.abs(Math.log(arr[b]) - Math.log(v))) b = i; }); return b; }
const hc = $('#heatmap'), tip = $('#heatTip');
hc.addEventListener('mousemove', e => {
  if (!heatGeom) return; const r = hc.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  const j = Math.floor((x - heatGeom.padL) / heatGeom.cw), i = Math.floor((y - heatGeom.padT) / heatGeom.ch);
  if (i < 0 || j < 0 || i >= H_DUR.length || j >= H_RAT.length) { tip.hidden = true; return; }
  tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px';
  tip.textContent = `${H_DUR[i]} s · 1:${H_RAT[j]} (desc. ${fmtTime(H_DUR[i] * H_RAT[j])}) → decremento ${heatData[i][j].toFixed(1)} %`;
});
hc.addEventListener('mouseleave', () => tip.hidden = true);
hc.addEventListener('click', e => {
  const r = hc.getBoundingClientRect(); const j = Math.floor((e.clientX - r.left - heatGeom.padL) / heatGeom.cw), i = Math.floor((e.clientY - r.top - heatGeom.padT) / heatGeom.ch);
  if (i < 0 || j < 0 || i >= H_DUR.length || j >= H_RAT.length) return;
  state.work = H_DUR[i]; state.rest = clamp(Math.round(H_DUR[i] * H_RAT[j] / 5) * 5, 5, 600); markPreset(null); syncInputs(); schedule();
});
window.addEventListener('resize', () => { if (heatData) drawHeat(); });

/* ---------- Recomendaciones ---------- */
function renderRecs(ctx) {
  const { res, cls, thr, laRes, endT } = ctx;
  const n = state.reps, I = state.intensity;
  $('#classBadge').textContent = cls.name;
  const recs = [];
  const opt = ctx.optRest, mrP = ctx.mrP, mrA = ctx.mrA;

  // 1. Descanso recomendado
  {
    let status = 'good', msg;
    if (opt.rest == null) { status = 'bad'; msg = `Ni con 15 min de pausa se logra un decremento ≤ ${thr} % con ${Math.max(n, 2)} repeticiones. Reduce repeticiones, acorta el esfuerzo o divide en series.`; }
    else {
      const diff = state.rest - opt.rest;
      if (diff < -5) { status = res.sds > thr * 1.8 ? 'bad' : 'warn'; msg = `Tu pausa de <strong>${fmtClock(state.rest)}</strong> se queda corta en ${fmtTime(-diff)}. Con ella el decremento llega al ${res.sds.toFixed(1)} %.`; }
      else if (diff > Math.max(30, opt.rest * 0.6) && (cls.key === 'glc' || cls.key === 'alc' || cls.key === 'aer')) { status = 'warn'; msg = `Tu pausa de <strong>${fmtClock(state.rest)}</strong> es más larga de lo necesario para este objetivo: puedes acortarla hasta ${fmtClock(opt.rest)} y ganar densidad sin perder calidad.`; }
      else msg = `Tu pausa de <strong>${fmtClock(state.rest)}</strong> cumple el objetivo (decremento ${res.sds.toFixed(1)} % ≤ ${thr} %).`;
    }
    recs.push({ s: status, h: 'Descanso recomendado', body: `<span class="big">${opt.rest == null ? '> 15:00' : fmtClock(opt.rest) + ' · ' + ratioStr(state.work, opt.rest)}</span><p>Pausa mínima para mantener el decremento ≤ ${thr} % (${opt.mode}). Rango típico para ${cls.name.toLowerCase()}: <strong>${cls.ratio}</strong>.</p><p style="margin-top:.5rem">${msg}</p><ul><li>Pasivo: ${mrP == null ? '> 15:00' : fmtClock(mrP)}</li><li>Activo (${state.activeInt} %): ${mrA == null ? '> 15:00' : fmtClock(mrA)}</li></ul>` });
  }

  // 2. Pasivo vs activo
  {
    const reps = Math.max(n, 2);
    const sp = simulate(params({ mode: 'pasivo', reps, lite: true, dt: 1, post: 240 }));
    const sa = simulate(params({ mode: 'activo', reps, lite: true, dt: 1, post: 240 }));
    const d = sp.sds - sa.sds;
    let pick, why, s = 'good';
    if (Math.abs(d) < 0.3) { pick = state.rest < 90 ? 'Pasivo' : 'Activo suave'; why = `Diferencia mínima en rendimiento (${sp.sds.toFixed(1)} % vs ${sa.sds.toFixed(1)} %). ${state.rest < 90 ? 'Con pausas cortas, el pasivo protege la resíntesis de PCr.' : 'El activo baja más el lactato sin coste en velocidad.'}`; }
    else if (d > 0) { pick = 'Activo'; why = `El activo reduce el decremento de ${sp.sds.toFixed(1)} % a ${sa.sds.toFixed(1)} % y el lactato pico de ${sp.peakLa.toFixed(1)} a ${sa.peakLa.toFixed(1)} mmol/L: con esta pausa pesa más eliminar acidosis que resintetizar PCr.`; }
    else { pick = 'Pasivo'; why = `El pasivo mantiene mejor la velocidad (${sp.sds.toFixed(1)} % vs ${sa.sds.toFixed(1)} % de decremento): la pausa es demasiado corta para que el activo compense la resíntesis de PCr más lenta.`; }
    if (Math.abs(d) >= 0.3 && !pick.toLowerCase().startsWith(state.mode)) s = 'warn';
    recs.push({ s, h: 'Pasivo o activo', body: `<span class="big">${pick}</span><p>${why}</p>${s === 'warn' ? `<p style="margin-top:.5rem">Estás usando descanso <strong>${state.mode}</strong>; cambiarlo mejora la serie según el modelo.</p>` : ''}` });
  }

  // 3. Estructura
  {
    const sust = sustainedCount(res, I);
    if (sust >= n) {
      let more = n;
      for (let k = n + 1; k <= 40; k++) { const s = simulate(params({ reps: k, lite: true, dt: 1, post: 0 })); if (sustainedCount(s, I) < k) break; more = k; }
      recs.push({ s: 'good', h: 'Volumen de la serie', body: `<span class="big">${n} de ${n} sostenibles</span><p>La velocidad disponible se mantiene ≥ ${effTarget(I)} % en todas las repeticiones. ${more > n ? `Podrías llegar a <strong>${more >= 40 ? '40 o más' : more}</strong> repeticiones antes de perder el ritmo objetivo.` : 'Es el máximo sostenible con esta pausa.'}</p>` });
    } else {
      const rps = Math.max(1, sust);
      const sets = Math.ceil(n / rps);
      const blk = simulate(params({ reps: rps, mode: 'activo', post: 900, dt: 1 }));
      const tEnd = rps * state.work + (rps - 1) * state.rest;
      const pk = blk.series.reduce((m, q) => q.t > tEnd && q.la > m.la ? q : m, { la: 0, t: tEnd });
      const p = blk.series.find(q => q.t > pk.t && q.pcr >= 95 && q.la <= Math.max(4, pk.la * 0.6));
      const setRest = p ? Math.ceil((p.t - tEnd) / 30) * 30 : 900;
      recs.push({ s: sust >= n * 0.6 ? 'warn' : 'bad', h: 'Estructura en series', body: `<span class="big">${sets} × ${rps} rep.</span><p>La velocidad disponible cae bajo el ${effTarget(I)} % en la repetición ${sust + 1}. Divide en <strong>${sets} series de ${Math.min(rps, n)}</strong> con la misma pausa entre repeticiones y <strong>${fmtClock(setRest)} de recuperación activa</strong> entre series (PCr ≥ 95 % y lactato en descenso).</p><ul><li>Alternativa: bajar la intensidad al ${Math.max(50, Math.floor(res.reps[n - 1].cap))} % para completar las ${n} repeticiones.</li></ul>` });
    }
  }

  // 4. Estímulo energético
  {
    const la = res.peakLa; let s = 'good', txt = '';
    const pcrLast = res.reps[res.reps.length - 1].pcr;
    if (cls.key === 'alp') {
      if (la > 6) { s = 'warn'; txt = `Lactato de ${la.toFixed(1)} mmol/L: hay contaminación glucolítica en un trabajo que debería ser aláctico. Alarga la pausa o acorta el esfuerzo.`; }
      else if (pcrLast < 85 && n > 1) { s = 'warn'; txt = `La PCr llega al ${pcrLast.toFixed(0)} % a la última repetición: alarga la pausa para entrenar potencia pura.`; }
      else txt = `Estímulo aláctico limpio: lactato ${la.toFixed(1)} mmol/L y PCr ≥ ${pcrLast.toFixed(0)} % antes de cada repetición.`;
    } else if (cls.key === 'glc') {
      if (la < 8) { s = 'warn'; txt = `Lactato de ${la.toFixed(1)} mmol/L: estímulo de tolerancia insuficiente. Acorta la pausa o aumenta repeticiones.`; }
      else txt = `Lactato de ${la.toFixed(1)} mmol/L: rango adecuado para tolerancia y tamponamiento.`;
    } else if (cls.key === 'glp') {
      if (res.sds > thr) { s = 'warn'; txt = `La producción cae entre repeticiones (decremento ${res.sds.toFixed(1)} %). Para potencia glucolítica cada esfuerzo debe ser casi tan rápido como el primero.`; }
      else txt = `Lactato pico de ${la.toFixed(1)} mmol/L con velocidad mantenida: buen estímulo de producción.`;
    } else if (cls.key === 'alc') {
      txt = la > 10 ? `Lactato de ${la.toFixed(1)} mmol/L: la serie deriva hacia tolerancia láctica; si buscas velocidad repetida, alarga la pausa.` : `Lactato de ${la.toFixed(1)} mmol/L y PCr parcial (${pcrLast.toFixed(0)} %): estímulo mixto adecuado para velocidad repetida.`;
      if (la > 10) s = 'warn';
    } else {
      txt = la > 6 ? `Lactato de ${la.toFixed(1)} mmol/L: la intensidad supera el umbral para un trabajo aeróbico; baja un 3–5 %.` : `Lactato de ${la.toFixed(1)} mmol/L: estímulo aeróbico controlado.`;
      if (la > 6) s = 'warn';
    }
    recs.push({ s, h: 'Estímulo energético', body: `<span class="big">${cls.sys}</span><p>${cls.desc}</p><p style="margin-top:.5rem">${txt}</p>` });
  }

  // 5. Recuperación activa: cómo
  {
    let s = 'good', txt;
    if (state.activeInt > 50) { s = 'warn'; txt = `Tu intensidad de recuperación activa (${state.activeInt} %) es alta: aumenta el coste de O₂ y frena la resíntesis de PCr. Bájala al 30–40 %.`; }
    else if (state.activeInt < 25) { s = 'warn'; txt = `Con ${state.activeInt} % el aclaramiento apenas supera al pasivo. Sube al 30–40 % para aprovechar el flujo sanguíneo.`; }
    else txt = `Intensidad de ${state.activeInt} %: dentro del rango eficaz para aclarar lactato.`;
    recs.push({ s, h: 'Cómo hacer el activo', body: `<p>${txt}</p><ul><li>Nado continuo muy suave o técnica, por debajo del umbral de lactato.</li><li>Útil en pausas ≥ 2–3 min y entre series; en pausas &lt; 60 s de velocidad, mejor pasivo.</li><li>Tras la serie, 10–15 min de activo antes de la siguiente tarea de calidad.</li></ul>` });
  }

  // 6. Vuelta a la calma
  {
    const find = (r) => { const pk = r.series.reduce((m, q) => q.la > m.la ? q : m); const p = r.series.find(q => q.t > pk.t && q.t > endT && q.la <= 4); return p ? p.t - endT : null; };
    const tp = find(laRes.pasivo), ta = find(laRes.activo);
    const s = laRes.pasivo.peakLa > 8 ? 'warn' : 'good';
    recs.push({ s, h: 'Después de la serie', body: `<span class="big">${ta == null ? '> 15′' : fmtClock(ta)} activo</span><p>Tiempo estimado hasta bajar de 4 mmol/L tras la última repetición con recuperación activa (pasivo: ${tp == null ? 'más de 15 min' : fmtClock(tp)}). ${laRes.pasivo.peakLa > 8 ? 'Programa la siguiente tarea de velocidad o PAP después de ese margen.' : 'Carga láctica baja: puedes encadenar la siguiente tarea tras unos minutos.'}</p>` });
  }

  $('#recGrid').innerHTML = recs.map(r => `<article class="rec ${r.s}"><h3><i class="dot ${r.s}"></i>${r.h}</h3>${r.body}</article>`).join('');
}

/* ---------- Registro de tiempos reales ---------- */
function realPct(n) {
  const r = sw.real.slice(0, n);
  const valid = r.filter(v => v > 0);
  if (!valid.length) return Array(n).fill(null);
  const ref = dataMode() ? sw.best : Math.min(...valid);
  return Array.from({ length: n }, (_, i) => r[i] > 0 ? ref / r[i] * 100 : null);
}
function predTimes(res) {
  const T = effTarget(state.intensity);
  return res.reps.map(r => {
    if (!dataMode()) return null;
    return r.cap >= T - 0.05 ? state.work : sw.best * 100 / Math.min(r.cap, state.intensity);
  });
}
let regRows = -1, regDM = null;
function renderRegistro() {
  const res = lastMain; if (!res) return;
  const n = res.reps.length, dm = dataMode();
  const body = $('#regBody');
  if (regRows !== n || regDM !== dm) {
    body.innerHTML = res.reps.map((r, i) => `<tr><td>${i + 1}</td><td data-c="obj"></td><td data-c="pred"></td><td><input type="text" class="txt" data-i="${i}" inputmode="decimal" placeholder="${dm ? 'ss.cc' : 's'}" value="${sw.real[i] > 0 ? fmtSec(sw.real[i]) : ''}" aria-label="Tiempo real repetición ${i + 1}"></td><td data-c="diff"></td><td data-c="pct"></td></tr>`).join('');
    regRows = n; regDM = dm;
    $$('input[data-i]', body).forEach(inp => {
      inp.addEventListener('change', () => {
        const v = parseTime(inp.value); const i = +inp.dataset.i;
        inp.classList.toggle('invalid', Number.isNaN(v));
        sw.real[i] = v > 0 ? v : null; if (v > 0) inp.value = fmtSec(v);
        updateRegistro(); updateRealOnChart();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const nx = body.querySelector(`input[data-i="${+inp.dataset.i + 1}"]`); inp.blur(); if (nx) nx.focus(); } });
    });
  }
  $('#regSub').textContent = dm
    ? `Escribe el tiempo que hizo ${sw.name || 'el nadador'} en cada repetición de ${sw.dist} m. La predicción usa su tiempo máximo (${fmtSec(sw.best)} s) y la fatiga estimada por el modelo.`
    : 'Escribe el tiempo que hizo el nadador en cada repetición para compararlo con el modelo. Para ver predicciones en segundos, completa distancia y tiempo máximo en Datos del nadador.';
  updateRegistro();
}
function updateRegistro() {
  const res = lastMain; const n = res.reps.length, dm = dataMode();
  const pred = predTimes(res), pct = realPct(n);
  const rows = $$('#regBody tr');
  rows.forEach((tr, i) => {
    const r = res.reps[i], real = sw.real[i];
    tr.querySelector('[data-c="obj"]').textContent = dm ? fmtSec(state.work) : `${r1(state.intensity)} %`;
    tr.querySelector('[data-c="pred"]').textContent = dm ? fmtSec(pred[i]) : `${Math.min(r.cap, state.intensity).toFixed(1)} %`;
    const dc = tr.querySelector('[data-c="diff"]');
    if (dm && real > 0) { const d = real - pred[i]; dc.textContent = (d >= 0 ? '+' : '') + d.toFixed(2) + ' s'; dc.className = Math.abs(d) < 0.15 ? '' : d > 0 ? 'bad' : 'good'; }
    else { dc.textContent = '—'; dc.className = ''; }
    tr.querySelector('[data-c="pct"]').textContent = pct[i] != null ? pct[i].toFixed(1) + ' %' : '—';
  });
  // resumen
  const vals = sw.real.slice(0, n).filter(v => v > 0);
  const box = $('#regSummary');
  if (vals.length < 2) { box.innerHTML = '<p>Introduce al menos dos tiempos para calcular la fatiga real y compararla con la predicción.</p>'; return; }
  const bestRep = Math.min(...vals);
  const sdsReal = (vals.reduce((a, b) => a + b, 0) / (bestRep * vals.length) - 1) * 100;
  const fiReal = (vals[vals.length - 1] / vals[0] - 1) * 100;
  const k = vals.length;
  const capsK = res.reps.slice(0, k).map(r => Math.min(r.cap, state.intensity));
  const sdsModel = (1 - capsK.reduce((a, b) => a + b, 0) / (Math.max(...capsK) * k)) * 100;
  const chips = [
    ['Decremento real', sdsReal.toFixed(1) + ' %'], ['Decremento modelo', sdsModel.toFixed(1) + ' %'],
    ['Caída 1.ª → última', (fiReal >= 0 ? '+' : '') + fiReal.toFixed(1) + ' %'], ['Mejor repetición', fmtSec(bestRep) + ' s']
  ];
  const gap = sdsReal - sdsModel;
  let msg;
  if (Math.abs(gap) <= 1) msg = 'Los tiempos reales coinciden con el modelo: el perfil elegido representa bien a este nadador.';
  else if (gap > 1) msg = `El nadador se fatiga más de lo previsto (+${gap.toFixed(1)} puntos). Alarga el descanso, reduce repeticiones o calibra el perfil.`;
  else msg = `El nadador recupera mejor de lo previsto (${gap.toFixed(1)} puntos). Puedes acortar el descanso o calibrar el perfil.`;
  box.innerHTML = `<div class="chips">${chips.map(([a, b]) => `<div class="chip">${a}<b>${b}</b></div>`).join('')}</div><p>${msg}</p>${Math.abs(gap) > 1 ? '<button type="button" class="btn ghost" id="calib" style="margin-top:.5rem">Calibrar perfil con estos tiempos</button>' : ''}`;
  const cb = $('#calib');
  if (cb) cb.addEventListener('click', () => {
    let best = null;
    for (const p of ['velocista', 'mixto', 'fondista']) {
      const r = simulate(params({ profile: p, lite: true, dt: 1, post: 0 }));
      const c = r.reps.slice(0, k).map(x => Math.min(x.cap, state.intensity));
      const sd = (1 - c.reduce((a, b) => a + b, 0) / (Math.max(...c) * k)) * 100;
      if (!best || Math.abs(sd - sdsReal) < best.d) best = { p, d: Math.abs(sd - sdsReal) };
    }
    state.profile = best.p; $('#profile').value = best.p; schedule();
  });
}
function updateRealOnChart() {
  const n = lastMain.reps.length; const d = realPct(n);
  charts.rep.data.datasets[3].data = d;
  const minY = Math.min(...lastMain.reps.map(r => r.cap), effTarget(state.intensity), ...d.filter(v => v != null));
  charts.rep.options.scales.y.min = Math.max(0, Math.floor((minY - 3) / 2) * 2);
  charts.rep.update();
}
$('#clearReal').addEventListener('click', () => { sw.real = []; regRows = -1; renderRegistro(); updateRealOnChart(); });
$('#fillPred').addEventListener('click', () => {
  if (!dataMode()) { $('#swDist').focus(); return; }
  sw.real = predTimes(lastMain).map(t => Math.round(t * 100) / 100); regRows = -1; renderRegistro(); updateRealOnChart();
});
$('#exportCsv').addEventListener('click', () => {
  const res = lastMain, pred = predTimes(res), pct = realPct(res.reps.length);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Nadador', sw.name], ['Edad', state.age ?? ''], ['Distancia (m)', sw.dist ?? ''], ['Tiempo máximo (s)', sw.best ?? ''],
    ['Serie', $('#setString').textContent], ['Perfil', state.profile], ['Lactato basal (mmol/L)', state.laBase ?? ''], ['Calibración lactato', state.laScale.toFixed(2)], ...lab.rows.filter(r => r.val > 0).map(r => ['Lactato ' + laLabel(r) + ' (mmol/L)', r.val, 'modelo', (laModelAt(r) ?? 0).toFixed(1)]), [],
    ['Repetición', 'Objetivo', 'Predicción (s)', 'Velocidad disponible modelo (%)', 'PCr inicial modelo (%)', 'Tiempo real (s)', '% vel. máx real']
  ];
  res.reps.forEach((r, i) => lines.push([i + 1, dataMode() ? state.work.toFixed(2) : r1(state.intensity) + ' %', pred[i] ? pred[i].toFixed(2) : '', r.cap.toFixed(1), r.pcr.toFixed(0), sw.real[i] ? sw.real[i].toFixed(2) : '', pct[i] ? pct[i].toFixed(1) : '']));
  const csv = '\ufeff' + lines.map(l => l.map(q).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `serie_${(sw.name || 'nadador').replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});

/* ---------- Lactato medido ---------- */
const numv = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x; };
function laTime(row) {
  const L = lastLa; if (!L) return null;
  if (row.type === 'post') return L.endT + row.at * 60;
  const n = clamp(Math.round(row.at), 1, state.reps);
  const endRep = n * state.work + (n - 1) * state.rest;
  return n >= state.reps ? endRep + 60 : endRep + Math.min(45, state.rest * 0.9);
}
function laModelAt(row, r = lastLa && lastLa.r) {
  const t = laTime(row); if (t == null || !r) return null;
  const p = r.series.find(q => q.t >= t - 1e-6); return p ? p.la : r.series[r.series.length - 1].la;
}
const laLabel = (row) => row.type === 'post' ? `min ${row.at} post-serie` : `tras rep. ${row.at}`;
let laRows = -1;
function renderLab() {
  const body = $('#laBody');
  if (laRows !== lab.rows.length) {
    body.innerHTML = lab.rows.map((r, i) => `<tr>
      <td><select class="txt" data-f="type" data-i="${i}"><option value="post"${r.type === 'post' ? ' selected' : ''}>Post-serie</option><option value="rep"${r.type === 'rep' ? ' selected' : ''}>Tras repetición</option></select></td>
      <td><span class="unit-wrap" style="display:inline-block"><input type="number" class="txt sm" data-f="at" data-i="${i}" value="${r.at}" min="${r.type === 'post' ? 0 : 1}" step="1"><span data-u="${i}">${r.type === 'post' ? 'min' : 'rep'}</span></span></td>
      <td><input type="text" class="txt sm" data-f="val" data-i="${i}" inputmode="decimal" placeholder="mmol/L" value="${r.val ?? ''}"></td>
      <td data-c="mod"></td><td data-c="dif"></td>
      <td><button type="button" class="icon-btn" data-del="${i}" aria-label="Eliminar lectura">×</button></td></tr>`).join('');
    laRows = lab.rows.length;
    $$('[data-f]', body).forEach(el => el.addEventListener('change', () => {
      const i = +el.dataset.i, f = el.dataset.f, row = lab.rows[i];
      if (f === 'type') { row.type = el.value; row.at = row.type === 'post' ? 3 : Math.min(state.reps, Math.max(1, Math.round(state.reps / 2))); laRows = -1; renderLab(); return; }
      if (f === 'at') row.at = Math.max(row.type === 'post' ? 0 : 1, numv(el.value) ?? row.at);
      if (f === 'val') { const v = numv(el.value); row.val = v > 0 && v < 35 ? v : null; el.classList.toggle('invalid', el.value.trim() !== '' && row.val == null); }
      updateLab();
    }));
    $$('[data-del]', body).forEach(b => b.addEventListener('click', () => { lab.rows.splice(+b.dataset.del, 1); laRows = -1; renderLab(); }));
  }
  updateLab();
}
function updateLab() {
  const rows = $$('#laBody tr');
  lab.rows.forEach((r, i) => {
    const tr = rows[i]; if (!tr) return;
    const mv = laModelAt(r);
    tr.querySelector('[data-c="mod"]').textContent = mv == null ? '—' : mv.toFixed(1);
    const dc = tr.querySelector('[data-c="dif"]');
    if (r.val > 0 && mv != null) { const d = r.val - mv; dc.textContent = (d >= 0 ? '+' : '') + d.toFixed(1); dc.className = Math.abs(d) < 1 ? 'good' : d > 0 ? 'bad' : 'warn'; }
    else { dc.textContent = '—'; dc.className = ''; }
  });
  // puntos en el gráfico
  const pts = lab.rows.filter(r => r.val > 0).map(r => ({ x: laTime(r), y: r.val }));
  if (state.laBase > 0) pts.unshift({ x: 0, y: state.laBase });
  charts.la.data.datasets[2].data = pts;
  charts.la.update('none');
  // resumen
  const box = $('#laSummary');
  const meas = lab.rows.filter(r => r.val > 0);
  const calibChip = state.laScale !== 1 ? `<div class="calib-chip">Modelo calibrado: producción de lactato ×${state.laScale.toFixed(2)} <button type="button" id="laReset">quitar</button></div>` : '';
  if (!meas.length) { box.innerHTML = `<p>Escribe al menos una lectura para compararla con el modelo.</p>${calibChip}`; bindReset(); return; }
  const pk = meas.reduce((a, b) => b.val > a.val ? b : a);
  const mPk = Math.max(...meas.map(r => laModelAt(r) ?? 0));
  const zone = pk.val < 4 ? 'aeróbica / aláctica' : pk.val < 8 ? 'mixta' : pk.val < 12 ? 'glucolítica alta' : 'tolerancia máxima';
  const cls = classify(state.work, state.intensity);
  let fit = '';
  if (cls.key === 'alp' && pk.val > 6) fit = 'Para un trabajo de potencia aláctica, el lactato es alto: alarga la pausa o acorta el esfuerzo.';
  else if (cls.key === 'glc' && pk.val < 8) fit = 'Para tolerancia láctica, el estímulo se quedó corto: acorta la pausa o sube repeticiones.';
  else if (cls.key === 'alc' && pk.val > 10) fit = 'Para velocidad repetida, el lactato es alto: la serie se está yendo hacia tolerancia láctica. Si buscas velocidad, alarga la pausa.';
  else if (cls.key === 'aer' && pk.val > 6) fit = 'Para un trabajo aeróbico, el lactato está por encima del umbral: baja un poco la intensidad.';
  else fit = `La lectura encaja con el objetivo (${cls.name.toLowerCase()}).`;
  const post = meas.filter(r => r.type === 'post');
  const peakNote = post.length >= 2 && post[post.length - 1] === pk && pk.at < 7 ? ' Tu valor más alto es la última lectura: es posible que el pico real llegara después; añade una medición más tarde.' : '';
  const errs = meas.map(r => r.val - (laModelAt(r) ?? 0));
  const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
  const fitMsg = Math.abs(bias) < 1 ? 'El modelo coincide con tus mediciones.' : bias > 0 ? `El nadador produce más lactato que el modelo (+${bias.toFixed(1)} mmol/L de media).` : `El nadador produce menos lactato que el modelo (${bias.toFixed(1)} mmol/L de media).`;
  box.innerHTML = `<div class="chips">
      <div class="chip">Pico medido<b>${pk.val.toFixed(1)} mmol/L</b></div>
      <div class="chip">Modelo en esos momentos<b>${mPk.toFixed(1)} mmol/L</b></div>
      <div class="chip">Zona medida<b>${zone}</b></div>
      ${state.laBase > 0 ? `<div class="chip">Δ sobre basal<b>+${(pk.val - state.laBase).toFixed(1)} mmol/L</b></div>` : ''}
    </div>
    <p>${fitMsg} ${fit}${peakNote}</p>
    ${Math.abs(bias) >= 1 ? '<button type="button" class="btn ghost" id="laCalib" style="margin-top:.5rem">Calibrar modelo con estas lecturas</button>' : ''}
    ${calibChip}`;
  const cb = $('#laCalib');
  if (cb) cb.addEventListener('click', () => {
    let best = { s: 1, e: Infinity };
    for (let sc = 0.2; sc <= 2.51; sc += 0.05) {
      const r = simulate(params({ laScale: sc, post: 900, dt: 1 }));
      const e = meas.reduce((acc, row) => { const d = row.val - laModelAt(row, r); return acc + d * d; }, 0);
      if (e < best.e) best = { s: sc, e };
    }
    state.laScale = Math.round(best.s * 100) / 100; schedule();
  });
  bindReset();
}
function bindReset() { const b = $('#laReset'); if (b) b.addEventListener('click', () => { state.laScale = 1; schedule(); }); }
$('#laAdd').addEventListener('click', () => { const last = lab.rows[lab.rows.length - 1]; lab.rows.push({ type: 'post', at: last && last.type === 'post' ? last.at + 2 : 3, val: null }); laRows = -1; renderLab(); });
$('#laClear').addEventListener('click', () => { lab.rows = [{ type: 'post', at: 1, val: null }, { type: 'post', at: 3, val: null }, { type: 'post', at: 5, val: null }]; state.laBase = null; $('#laBasal').value = ''; laRows = -1; schedule(); });
$('#laBasal').addEventListener('change', e => { const v = numv(e.target.value); state.laBase = v > 0 && v < 10 ? v : null; e.target.classList.toggle('invalid', e.target.value.trim() !== '' && state.laBase == null); schedule(); });

/* ---------- Orquestación ---------- */
function renderAll() {
  const ctx = renderMain();
  ctx.mrP = minRestFor('pasivo', ctx.thr);
  ctx.mrA = minRestFor('activo', ctx.thr);
  const cand = [['pasivo', ctx.mrP], ['activo', ctx.mrA]].filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
  ctx.optRest = cand.length ? { mode: cand[0][0], rest: cand[0][1] } : { mode: state.mode, rest: null };
  renderKpis(ctx);
  computeSens(); renderSens();
  computeHeat(); drawHeat();
  renderRecs(ctx);
  renderRegistro();
  renderLab();
  document.dispatchEvent(new Event('sim:render'));
}
let raf = null;
function schedule() { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { raf = null; renderAll(); }); }

window.SimApp = { schedule: () => schedule(), state, sw, parseTime, fmtSec, fmtClock, css, baseOpts, axisTitle, effTarget };
buildCharts();
markPreset('s25');
syncInputs();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => renderAll());
})();
