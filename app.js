'use strict';
/* ===== LOCKIN — cœur de l'app ===== */
const VERSION = '1.2.0';
const KEY = 'lockin_v1';

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const dk = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDk = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = d => { const x = sod(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const daysBetween = (a, b) => Math.round((sod(b) - sod(a)) / 864e5);
const roundTo = (n, s) => Math.round(n / s) * s;
const fmt = (n, dec = 0) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('fr-CA', { maximumFractionDigits: dec });
const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const dateLong = d => new Date(d).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = d => new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtDurShort = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const hexA = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const e1rm = (w, r) => (!w || !r) ? 0 : r === 1 ? w : w * (1 + Math.min(r, 15) / 30);
const ACC = '#C8FF2E';

/* ---------- état ---------- */
function defaultState() {
  return {
    v: 1,
    settings: {
      name: '', unit: 'lb', weeklyTarget: 4, rest: 90, barWeight: 45, increment: 5, sound: true,
      goals: { cal: 2500, p: 180, c: 260, f: 75, water: 3000 },
      goalWeight: null, height: null, age: null, sex: 'h', activity: 1.55, goalType: 'maintain', onboarded: false
    },
    exercises: [], routines: presetPack('ppl'), workouts: [],
    body: [], meas: [], photos: [], foods: [], log: {}, water: {},
    active: null,
    ui: { tab: 'home', calMonth: null, nutDate: null, progEx: null, progMetric: 'e1rm', bwRange: 90, measKey: 'waist' }
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.settings) S = defaultState();
function migrateState() { const d = defaultState(); for (const k in d) if (S[k] === undefined) S[k] = d[k]; for (const k in d.settings) if (S.settings[k] === undefined) S.settings[k] = d.settings[k]; for (const k in d.ui) if (S.ui[k] === undefined) S.ui[k] = d.ui[k]; }
migrateState();

let saveT;
function save() { S.updatedAt = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => { saveNow(); window.cloudPush && window.cloudPush(); }, 120); }
function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Stockage plein — exporte une sauvegarde'); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

const u = () => S.settings.unit;

/* ---------- exercices ---------- */
let EXMAP = {};
function rebuildEx() {
  EXMAP = {};
  LIB_RAW.forEach(([id, name, muscle, equip, type]) => EXMAP[id] = { id, name, muscle, equip, type: type || 'w' });
  S.exercises.forEach(e => EXMAP[e.id] = { ...e, custom: true });
}
rebuildEx();
const EX = id => EXMAP[id] || { id, name: 'Exercice supprimé', muscle: 'Abdos', equip: '', type: 'w' };
const allEx = () => Object.values(EXMAP).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

/* ---------- routines prédéfinies ---------- */
function R(name, list) { return { id: uid(), name, ex: list.map(([exId, sets, reps]) => ({ exId, sets, reps, rest: null })) }; }
function presetPack(k) {
  const P = {
    ppl: () => [
      R('Push', [['bench', 4, '6-10'], ['db_incline', 3, '8-12'], ['db_ohp', 3, '8-12'], ['lat_raise', 4, '12-15'], ['rope_pushdown', 3, '10-12'], ['oh_ext', 3, '10-12']]),
      R('Pull', [['pullup', 4, '6-10'], ['bb_row', 4, '6-10'], ['cable_row', 3, '10-12'], ['face_pull', 3, '12-15'], ['bb_curl', 3, '8-12'], ['hammer', 3, '10-12']]),
      R('Legs', [['squat', 4, '5-8'], ['rdl', 3, '8-10'], ['leg_press', 3, '10-12'], ['leg_curl', 3, '10-12'], ['leg_ext', 3, '12-15'], ['calf_raise', 4, '10-15']])
    ],
    ul: () => [
      R('Haut A', [['bench', 4, '5-8'], ['bb_row', 4, '6-10'], ['db_ohp', 3, '8-12'], ['lat_pulldown', 3, '8-12'], ['db_curl', 3, '10-12'], ['pushdown', 3, '10-12']]),
      R('Bas A', [['squat', 4, '5-8'], ['rdl', 3, '8-10'], ['leg_ext', 3, '12-15'], ['leg_curl', 3, '10-12'], ['calf_raise', 4, '10-15'], ['hanging_leg', 3, '10-15']]),
      R('Haut B', [['ohp', 4, '5-8'], ['pullup', 4, '6-10'], ['db_incline', 3, '8-12'], ['cable_row', 3, '10-12'], ['lat_raise', 4, '12-15'], ['hammer', 3, '10-12']]),
      R('Bas B', [['deadlift', 3, '3-5'], ['bulgarian', 3, '8-12'], ['hip_thrust', 3, '8-12'], ['seated_curl', 3, '10-12'], ['seated_calf', 4, '12-15'], ['cable_crunch', 3, '10-15']])
    ],
    fb: () => [
      R('Full Body A', [['squat', 3, '6-10'], ['bench', 3, '6-10'], ['bb_row', 3, '8-12'], ['lat_raise', 3, '12-15'], ['plank', 3, '30-60']]),
      R('Full Body B', [['deadlift', 3, '4-6'], ['ohp', 3, '6-10'], ['lat_pulldown', 3, '8-12'], ['leg_press', 3, '10-12'], ['db_curl', 3, '10-12']]),
      R('Full Body C', [['front_squat', 3, '6-10'], ['db_incline', 3, '8-12'], ['cable_row', 3, '10-12'], ['rdl', 3, '8-10'], ['rope_pushdown', 3, '10-12']])
    ],
    home: () => [
      R('Maison A', [['db_bench', 4, '8-12'], ['db_row', 4, '8-12'], ['goblet', 4, '10-15'], ['db_ohp', 3, '8-12'], ['db_curl', 3, '10-12'], ['plank', 3, '30-60']]),
      R('Maison B', [['bulgarian', 3, '8-12'], ['pushup', 3, '10-20'], ['db_row', 3, '10-12'], ['step_up', 3, '10-12'], ['lat_raise', 3, '12-15'], ['kickback', 3, '12-15']])
    ],
    bw: () => [
      R('Poids du corps A', [['pushup', 4, '10-25'], ['pullup', 4, '5-12'], ['glute_bridge', 3, '15-20'], ['dips', 3, '8-15'], ['leg_raise', 3, '10-15'], ['plank', 3, '30-60']]),
      R('Poids du corps B', [['chinup', 4, '5-12'], ['pushup', 4, '10-25'], ['lunge', 3, '10-15'], ['back_ext', 3, '12-20'], ['hanging_leg', 3, '8-15'], ['nordic', 3, '3-8']])
    ],
    fivex5: () => [
      R('5x5 A', [['squat', 5, '5-5'], ['bench', 5, '5-5'], ['bb_row', 5, '5-5']]),
      R('5x5 B', [['squat', 5, '5-5'], ['ohp', 5, '5-5'], ['deadlift', 1, '5-5']])
    ]
  };
  return P[k] ? P[k]() : [];
}
const PACKS = [['ppl', 'Push / Pull / Legs', '3-6 jours · hypertrophie'], ['ul', 'Upper / Lower', '4 jours · force + masse'], ['fb', 'Full Body', '3 jours · parfait pour débuter'], ['fivex5', '5x5 Force', '3 jours · force pure'], ['home', 'Maison (haltères)', '2-4 jours · sans gym'], ['bw', 'Poids du corps', '2-4 jours · zéro équipement']];

/* ---------- historique / stats ---------- */
function sortWorkouts() { S.workouts.sort((a, b) => a.start - b.start); }
function exSessions(exId, excludeId) {
  const out = [];
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const w = S.workouts[i]; if (w.id === excludeId) continue;
    w.ex.forEach(e => { if (e.exId === exId && e.sets.length) out.push({ date: w.start, sets: e.sets, wid: w.id }); });
  }
  return out; // plus récent en premier
}
const working = sets => sets.filter(s => s.t !== 'w' && (s.r > 0));
function sessStats(sets) {
  const ws = working(sets);
  let e = 0, mw = 0, vol = 0, mr = 0;
  ws.forEach(s => { e = Math.max(e, e1rm(s.w, s.r)); mw = Math.max(mw, s.w || 0); vol += (s.w || 0) * s.r; mr = Math.max(mr, s.r); });
  return { e1rm: e, maxW: mw, vol, maxR: mr, sets: ws.length };
}
function parseRange(r) {
  if (!r) return null; const m = String(r).match(/(\d+)\s*[-–à]\s*(\d+)/); if (m) return [+m[1], +m[2]];
  const n = parseInt(r); return n ? [n, n] : null;
}
function incFor(exId) { const base = S.settings.increment || (u() === 'kg' ? 2.5 : 5); return LOWER.has(exId) ? base * 2 : base; }

/* Progression : double progression + détection de plateau */
function suggest(exId, reps) {
  const ex = EX(exId); const hist = exSessions(exId, S.active?.id);
  if (!hist.length) return null;
  const ws = working(hist[0].sets); if (!ws.length) return null;
  if (ex.type === 'c') return null;
  if (ex.type !== 'w' || !ws.some(s => s.w > 0)) {
    const best = Math.max(...ws.map(s => s.r));
    const unit = ex.type === 't' ? ' sec' : ' reps';
    const add = ex.type === 't' ? 5 : 1;
    return { w: ws[0].w || '', r: best + add, kind: 'rep', msg: `Dernière fois ${best}${unit} max → vise ${best + add}${unit}` };
  }
  const top = ws.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r)) ? b : a);
  const rng = parseRange(reps) || (top.r <= 5 ? [3, 5] : top.r <= 8 ? [6, 8] : [8, 12]);
  const [lo, hi] = rng;
  const atTop = ws.filter(s => s.w === top.w);
  const inc = incFor(exId);
  // plateau : 3 dernières séances sans hausse de 1RM estimé
  if (hist.length >= 4) {
    const es = hist.slice(0, 4).map(h => sessStats(h.sets).e1rm);
    if (es[0] <= es[3] && es[1] <= es[3] && es[2] <= es[3]) {
      const dw = roundTo(top.w * 0.9, inc / 2 || 1);
      return { w: dw, r: hi, kind: 'deload', msg: `Plateau sur 3 séances → deload à ${fmt(dw, 1)} ${u()} × ${hi}, puis remonte` };
    }
  }
  if (atTop.every(s => s.r >= hi)) {
    const nw = top.w + inc;
    return { w: nw, r: lo, kind: 'up', msg: `${hi} reps atteintes partout → monte à ${fmt(nw, 1)} ${u()} × ${lo}` };
  }
  const nr = Math.min(Math.max(top.r + 1, lo), hi);
  return { w: top.w, r: nr, kind: 'rep', msg: `Garde ${fmt(top.w, 1)} ${u()} et vise ${nr} reps (objectif ${lo}-${hi})` };
}

function bestOf(exId, excludeId) {
  let w = 0, e = 0; exSessions(exId, excludeId).forEach(h => { const s = sessStats(h.sets); w = Math.max(w, s.maxW); e = Math.max(e, s.e1rm); });
  return { w, e };
}
function computePRs(wo) {
  const prs = [];
  wo.ex.forEach(e => {
    if (EX(e.exId).type !== 'w') return;
    const hist = exSessions(e.exId, wo.id); if (!hist.length) return;
    const b = bestOf(e.exId, wo.id); const s = sessStats(e.sets);
    if (s.maxW > b.w && b.w > 0) prs.push({ exId: e.exId, kind: 'Poids max', val: s.maxW });
    if (s.e1rm > b.e + 0.01 && b.e > 0) prs.push({ exId: e.exId, kind: '1RM estimé', val: Math.round(s.e1rm) });
  });
  return prs;
}
function woVolume(wo) { let v = 0; wo.ex.forEach(e => { if (EX(e.exId).type === 'c') return; working(e.sets).forEach(s => v += (num(s.w) || 0) * (num(s.r) || 0)); }); return Math.round(v); }

function dayMap() {
  const m = {};
  S.workouts.forEach(w => { const k = dk(w.start); (m[k] = m[k] || { n: 0, vol: 0, ws: [] }); m[k].n++; m[k].vol += w.vol || 0; m[k].ws.push(w); });
  return m;
}
function weekCount(ws) { const a = ws.getTime(), b = addDays(ws, 7).getTime(); return S.workouts.filter(x => x.start >= a && x.start < b).length; }
function weekStreak() {
  const t = S.settings.weeklyTarget; let ws = startOfWeek(new Date()), n = 0;
  if (weekCount(ws) >= t) n++;
  ws = addDays(ws, -7);
  while (weekCount(ws) >= t && n < 999) { n++; ws = addDays(ws, -7); }
  return n;
}
function consistency(weeks = 12) {
  const t = S.settings.weeklyTarget; let hit = 0, ws = startOfWeek(new Date());
  const first = S.workouts[0] ? startOfWeek(S.workouts[0].start) : ws;
  let total = 0;
  for (let i = 0; i < weeks; i++) { const w = addDays(ws, -7 * i); if (w < first) break; total++; if (weekCount(w) >= t || (i === 0 && weekCount(w) >= t)) hit++; }
  // la semaine courante ne compte pas contre toi si elle n'est pas finie
  if (total && weekCount(ws) < t) total--;
  return total ? Math.round(hit / total * 100) : (weekCount(ws) >= t ? 100 : 0);
}
function lastMuscleDates() {
  const m = {};
  S.workouts.forEach(w => w.ex.forEach(e => { const mu = EX(e.exId).muscle; if (working(e.sets).length) m[mu] = Math.max(m[mu] || 0, w.start); }));
  return m;
}
function nextRoutine() {
  if (!S.routines.length) return null;
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const idx = S.routines.findIndex(r => r.id === S.workouts[i].routineId);
    if (idx >= 0) return S.routines[(idx + 1) % S.routines.length];
  }
  return S.routines[0];
}

/* ---------- nutrition / corps helpers ---------- */
function dayTotals(k) { return (S.log[k] || []).reduce((a, x) => ({ cal: a.cal + x.cal * x.q, p: a.p + x.p * x.q, c: a.c + x.c * x.q, f: a.f + x.f * x.q }), { cal: 0, p: 0, c: 0, f: 0 }); }
function latestBW() { return S.body.length ? S.body[S.body.length - 1] : null; }
function bwAt(daysAgo) { const t = dk(addDays(new Date(), -daysAgo)); let best = null; S.body.forEach(b => { if (b.d <= t) best = b; }); return best; }
function avgBW(days = 7) { const from = dk(addDays(new Date(), -days + 1)); const L = S.body.filter(b => b.d >= from); return L.length ? L.reduce((a, b) => a + b.w, 0) / L.length : null; }

/* ---------- UI : toast, son, sheets ---------- */
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms); }
let AC;
function beep(times = 3) {
  if (!S.settings.sound) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); for (let i = 0; i < times; i++) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = i === times - 1 ? 1320 : 880; o.connect(g); g.connect(AC.destination); const t0 = AC.currentTime + i * 0.25; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.start(t0); o.stop(t0 + 0.22); } } catch (e) { }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { }
}
document.addEventListener('touchstart', () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) { } }, { once: true });

const SH = [];
function openSheet(render, opts = {}) {
  const el = document.createElement('div'); el.className = 'sheetwrap';
  el.innerHTML = `<div class="backdrop" data-a="closeSheet"></div><div class="sheet ${opts.full ? 'full' : ''}"><div class="grab" data-a="closeSheet"></div><div class="sheetbody"></div></div>`;
  document.body.appendChild(el);
  const s = { el, render, opts }; SH.push(s); paintSheet(s);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return s;
}
function paintSheet(s = SH[SH.length - 1]) { if (!s) return; const b = s.el.querySelector('.sheetbody'); const st = b.scrollTop; b.innerHTML = s.render(); b.scrollTop = st; s.opts.mount && s.opts.mount(b); }
function closeSheet() { const s = SH.pop(); if (!s) return; s.el.classList.remove('open'); setTimeout(() => s.el.remove(), 260); s.opts.onClose && s.opts.onClose(); }
function closeAllSheets() { while (SH.length) closeSheet(); }
function confirmSheet(title, msg, okLabel, onOk, danger = true) {
  openSheet(() => `<h2 class="sh-t">${esc(title)}</h2><p class="muted mb">${esc(msg)}</p><button class="btn block ${danger ? 'danger' : 'acc'}" data-a="cfOk">${esc(okLabel)}</button><button class="btn block ghost mt8" data-a="closeSheet">Annuler</button>`);
  A.cfOk = () => { closeSheet(); onOk(); };
}

/* ---------- graphiques ---------- */
function prepCanvas(cv) { const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight || 180; cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H); return { c, W, H }; }
function emptyMsg(c, W, H, msg) { c.fillStyle = '#6b6b70'; c.font = '13px -apple-system,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(msg, W / 2, H / 2); }
function lineChart(cv, pts, o = {}) {
  if (!cv) return; const { c, W, H } = prepCanvas(cv);
  if (!pts.length) return emptyMsg(c, W, H, o.empty || 'Pas encore de données');
  const pad = { l: 40, r: 12, t: 12, b: 22 };
  let ys = pts.map(p => p.y); if (o.goal != null) ys.push(o.goal); if (o.trend) ys = ys.concat(o.trend.map(p => p.y));
  let mn = Math.min(...ys), mx = Math.max(...ys); if (mn === mx) { mn -= 1; mx += 1; } const sp = mx - mn; mn -= sp * .12; mx += sp * .12;
  let x0 = pts[0].x, x1 = pts[pts.length - 1].x; if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  const X = x => pad.l + (x - x0) / (x1 - x0) * (W - pad.l - pad.r), Y = y => pad.t + (1 - (y - mn) / (mx - mn)) * (H - pad.t - pad.b);
  c.strokeStyle = 'rgba(255,255,255,.06)'; c.fillStyle = '#7c7c82'; c.font = '10px -apple-system,system-ui'; c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) { const v = mn + (mx - mn) * i / 3, y = Y(v); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke(); c.fillText(fmt(v, sp < 10 ? 1 : 0), pad.l - 6, y); }
  c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillText(shortDate(x0), pad.l, H - 5); c.textAlign = 'right'; c.fillText(shortDate(x1), W - pad.r, H - 5);
  if (o.goal != null) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.moveTo(pad.l, Y(o.goal)); c.lineTo(W - pad.r, Y(o.goal)); c.stroke(); c.setLineDash([]); }
  const col = o.color || ACC;
  if (pts.length > 1) {
    const g = c.createLinearGradient(0, pad.t, 0, H - pad.b); g.addColorStop(0, hexA(col, .25)); g.addColorStop(1, hexA(col, 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(X(pts[0].x), H - pad.b); pts.forEach(p => c.lineTo(X(p.x), Y(p.y))); c.lineTo(X(pts[pts.length - 1].x), H - pad.b); c.closePath(); c.fill();
  }
  c.strokeStyle = o.trend ? hexA(col, .4) : col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke();
  if (pts.length <= 45) { c.fillStyle = o.trend ? hexA(col, .6) : col; pts.forEach(p => { c.beginPath(); c.arc(X(p.x), Y(p.y), 2.5, 0, 7); c.fill(); }); }
  if (o.trend && o.trend.length > 1) { c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); o.trend.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke(); }
  const lp = pts[pts.length - 1]; c.fillStyle = col; c.beginPath(); c.arc(X(lp.x), Y(lp.y), 4.5, 0, 7); c.fill();
}
function barChart(cv, items, o = {}) {
  if (!cv) return; const { c, W, H } = prepCanvas(cv);
  if (!items.length || items.every(i => !i.v) && o.goal == null) return emptyMsg(c, W, H, o.empty || 'Pas encore de données');
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const mx = Math.max(...items.map(i => i.v), o.goal || 0) * 1.12 || 1;
  const bw = (W - pad.l - pad.r) / items.length;
  const Y = v => pad.t + (1 - v / mx) * (H - pad.t - pad.b);
  c.strokeStyle = 'rgba(255,255,255,.06)'; c.fillStyle = '#7c7c82'; c.font = '10px -apple-system,system-ui'; c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let i = 0; i <= 2; i++) { const v = mx * i / 2, y = Y(v); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke(); c.fillText(v >= 10000 ? fmt(v / 1000, 0) + 'k' : fmt(v, 0), pad.l - 5, y); }
  items.forEach((it, i) => {
    const x = pad.l + i * bw + bw * .18, w = bw * .64, y = Y(it.v), h = H - pad.b - y;
    c.fillStyle = it.c || (o.goal != null && it.v >= o.goal ? ACC : hexA(ACC, .55));
    const r = Math.min(5, w / 2, h / 2 || 0); c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, Math.max(h, 0), [r, r, 0, 0]); else c.rect(x, y, w, Math.max(h, 0)); c.fill();
    c.fillStyle = '#7c7c82'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; if (items.length <= 14 || i % 2 === 0) c.fillText(it.l, x + w / 2, H - 5);
  });
  if (o.goal != null) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.moveTo(pad.l, Y(o.goal)); c.lineTo(W - pad.r, Y(o.goal)); c.stroke(); c.setLineDash([]); }
}
function ring(pct, size = 120, stroke = 11, color = ACC, track = 'rgba(255,255,255,.08)') {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  const col = pct > 1.05 ? '#FF453A' : color;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function bar(label, v, goal, color, unit = 'g') {
  const p = goal ? Math.min(1, v / goal) : 0;
  return `<div class="mbar"><div class="mbar-top"><span>${label}</span><span><b>${fmt(v)}</b><span class="muted"> / ${fmt(goal)}${unit}</span></span></div><div class="track"><div class="fill" style="width:${p * 100}%;background:${v > goal * 1.08 ? '#FF453A' : color}"></div></div></div>`;
}

/* ---------- icônes ---------- */
const IC = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  fire: '🔥'
};

/* ---------- ACCUEIL ---------- */
const VIEWS = {}, POST = {}, A = {}, I = {}, C = {};
const TITLES = { home: 'Lockin', train: 'Entraînement', progress: 'Progrès', nutrition: 'Nutrition', body: 'Corps' };

VIEWS.home = () => {
  const now = new Date(), g = S.settings.goals, t = S.settings.weeklyTarget;
  const ws = startOfWeek(now), wc = weekCount(ws), dm = dayMap();
  const streak = weekStreak(), cons = consistency(12);
  const nx = nextRoutine();
  const T = dayTotals(dk()); const bw = latestBW(); const d7 = bwAt(7);
  const week = DOW.map((l, i) => { const d = addDays(ws, i), k = dk(d); return `<div class="wd ${dm[k] ? 'on' : ''} ${k === dk() ? 'today' : ''}"><span>${l}</span><i>${dm[k] ? IC.check : ''}</i></div>`; }).join('');
  return `
  <div class="hello"><div class="muted sm">${cap(dateLong(now))}</div><h1>${S.settings.name ? `Yo ${esc(S.settings.name)}` : 'Lock in.'}</h1></div>
  ${S.active ? `<button class="cta" data-a="openWorkout"><div><div class="cta-k">Séance en cours</div><div class="cta-t">${esc(S.active.name)} · <span data-elapsed>${fmtDur(Date.now() - S.active.start)}</span></div></div><span class="cta-i">${IC.play}</span></button>`
      : `<button class="cta" data-a="quickStart"><div><div class="cta-k">${nx ? 'Prochaine séance' : 'Commencer'}</div><div class="cta-t">${nx ? esc(nx.name) : 'Séance vide'}</div></div><span class="cta-i">${IC.play}</span></button>`}
  <div class="card streak">
    <div class="streak-top">
      <div><div class="big">${streak}<small> sem.</small></div><div class="muted sm">streak d'objectif hebdo ${IC.fire}</div></div>
      <div class="right"><div class="big">${wc}<small>/${t}</small></div><div class="muted sm">cette semaine</div></div>
    </div>
    <div class="week">${week}</div>
    <div class="track mt8"><div class="fill" style="width:${Math.min(100, wc / t * 100)}%"></div></div>
  </div>
  <div class="card"><h3>Constance <span class="pill">${cons}% · 12 sem.</span></h3>${calMonthHTML()}</div>
  <div class="grid2">
    <div class="card tap mini" data-a="tab" data-tab="nutrition">
      <h3>Aujourd'hui</h3>
      <div class="ringwrap sm">${ring(T.cal / g.cal, 84, 9)}<div class="ringtxt"><b>${fmt(Math.max(0, g.cal - T.cal))}</b><span>cal rest.</span></div></div>
      <div class="mini-p"><b>${fmt(T.p)}</b><span class="muted">/${g.p} g prot</span></div>
    </div>
    <div class="card tap mini" data-a="tab" data-tab="body">
      <h3>Poids</h3>
      <div class="bigw">${bw ? fmt(bw.w, 1) : '–'}<small> ${u()}</small></div>
      <div class="muted sm">${bw && d7 && d7 !== bw ? `${bw.w - d7.w >= 0 ? '+' : ''}${fmt(bw.w - d7.w, 1)} ${u()} / 7 j` : 'Pèse-toi le matin'}</div>
      <canvas id="cvHomeBW" class="spark"></canvas>
    </div>
  </div>
  <div class="card"><h3>Coach</h3>${insights().map(x => `<div class="ins"><span class="ins-i">${x.i}</span><div><b>${esc(x.t)}</b><div class="muted sm">${esc(x.s)}</div></div></div>`).join('')}</div>
  <div class="card"><h3>Récupération musculaire</h3>${recoveryHTML()}</div>`;
};
POST.home = () => {
  const from = dk(addDays(new Date(), -30));
  lineChart($('#cvHomeBW'), S.body.filter(b => b.d >= from).map(b => ({ x: parseDk(b.d).getTime(), y: b.w })), { empty: ' ' });
};

function calMonthHTML() {
  const base = S.ui.calMonth ? parseDk(S.ui.calMonth) : new Date();
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), off = (first.getDay() + 6) % 7;
  const dm = dayMap(); const vols = Object.values(dm).map(d => d.vol).filter(Boolean).sort((a, b) => a - b);
  const q = p => vols.length ? vols[Math.floor((vols.length - 1) * p)] : 0;
  let cells = '', cnt = 0;
  for (let i = 0; i < off; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const k = dk(new Date(y, m, d)), x = dm[k], nut = (S.log[k] || []).length, isT = k === dk();
    let lvl = 0; if (x) { cnt++; lvl = x.vol >= q(.75) ? 3 : x.vol >= q(.35) ? 2 : 1; }
    cells += `<button class="cd l${lvl} ${isT ? 'today' : ''} ${k > dk() ? 'fut' : ''}" data-a="calDay" data-d="${k}">${d}${nut ? '<i></i>' : ''}</button>`;
  }
  return `<div class="calnav"><button class="icon sm" data-a="calPrev">‹</button><b>${cap(MONTHS[m])} ${y}</b><button class="icon sm" data-a="calNext">›</button></div>
  <div class="calgrid">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
  <div class="cal-foot muted sm"><span>${cnt} séance${cnt > 1 ? 's' : ''} ce mois</span><span class="leg"><i class="l1"></i><i class="l2"></i><i class="l3"></i> volume · <i class="dot"></i> bouffe loggée</span></div>`;
}
A.calPrev = () => { const b = S.ui.calMonth ? parseDk(S.ui.calMonth) : new Date(); S.ui.calMonth = dk(new Date(b.getFullYear(), b.getMonth() - 1, 1)); render(); };
A.calNext = () => { const b = S.ui.calMonth ? parseDk(S.ui.calMonth) : new Date(); S.ui.calMonth = dk(new Date(b.getFullYear(), b.getMonth() + 1, 1)); render(); };
A.calDay = el => {
  const k = el.dataset.d, ws = S.workouts.filter(w => dk(w.start) === k), T = dayTotals(k), b = S.body.find(x => x.d === k);
  openSheet(() => `<h2 class="sh-t">${cap(dateLong(parseDk(k)))}</h2>
    ${ws.length ? ws.map(w => `<button class="li tap" data-a="woDetail" data-id="${w.id}"><div><b>${esc(w.name)}</b><div class="muted sm">${fmtDurShort((w.end || w.start) - w.start)} · ${w.ex.length} exos · ${fmt(w.vol)} ${u()}${w.prs?.length ? ` · 🏆 ${w.prs.length}` : ''}</div></div><span class="chev">›</span></button>`).join('') : `<p class="muted mb">Pas de séance ce jour-là.</p>`}
    <div class="grid3 mt">${statBox('Calories', fmt(T.cal))}${statBox('Protéines', fmt(T.p) + ' g')}${statBox('Poids', b ? fmt(b.w, 1) + ' ' + u() : '–')}</div>
    ${!ws.length && k <= dk() ? `<button class="btn block ghost mt" data-a="logPast" data-d="${k}">+ Ajouter une séance passée ce jour-là</button>` : ''}`);
};
A.logPast = el => { const k = el.dataset.d; closeAllSheets(); startWorkout(null, null, parseDk(k).getTime() + 18 * 36e5); };
const statBox = (l, v) => `<div class="stat"><div class="stat-v">${v}</div><div class="stat-l">${l}</div></div>`;

function insights() {
  const out = [], now = Date.now(), t = S.settings.weeklyTarget, g = S.settings.goals;
  if (!S.workouts.length) out.push({ i: '🚀', t: 'Fais ta première séance', s: 'Choisis une routine (Push/Pull/Legs est déjà prête) ou démarre une séance vide.' });
  else {
    const last = S.workouts[S.workouts.length - 1]; const d = daysBetween(last.start, now);
    const wc = weekCount(startOfWeek(new Date())); const left = t - wc; const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    if (left > 0 && left >= daysLeft) out.push({ i: '⚠️', t: `Il te reste ${left} séance${left > 1 ? 's' : ''} en ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`, s: 'Pour garder ta streak, faut pas skipper aujourd’hui.' });
    else if (d >= 3) out.push({ i: '⏰', t: `${d} jours sans gym`, s: 'Une séance courte vaut mieux que zéro. Lock in.' });
    else if (left <= 0) out.push({ i: '✅', t: 'Objectif de la semaine atteint', s: 'Tout ce que tu fais de plus, c’est du bonus. Récupère bien.' });
    // PR récents
    const prs = S.workouts.filter(w => now - w.start < 7 * 864e5).flatMap(w => w.prs || []);
    if (prs.length) out.push({ i: '🏆', t: `${prs.length} record${prs.length > 1 ? 's' : ''} cette semaine`, s: prs.slice(0, 2).map(p => `${EX(p.exId).name} ${fmt(p.val, 1)} ${u()}`).join(' · ') });
    // progression 30 jours sur l'exo le plus fait
    const cnt = {}; S.workouts.forEach(w => w.ex.forEach(e => { if (EX(e.exId).type === 'w') cnt[e.exId] = (cnt[e.exId] || 0) + 1; }));
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    if (top) {
      const h = exSessions(top).filter(x => x.sets.length); const recent = h[0]; const old = h.find(x => now - x.date >= 28 * 864e5) || h[h.length - 1];
      if (recent && old && recent !== old) { const a = sessStats(old.sets).e1rm, b = sessStats(recent.sets).e1rm; if (a && b) { const pc = (b - a) / a * 100; out.push({ i: pc >= 0 ? '📈' : '📉', t: `${EX(top).name} : ${pc >= 0 ? '+' : ''}${fmt(pc, 1)} %`, s: `1RM estimé ${fmt(a)} → ${fmt(b)} ${u()}${pc < 0 ? ' — check ton sommeil pis ta bouffe.' : ''}` }); } }
    }
    // muscles négligés
    const lm = lastMuscleDates(); const neg = ['Pectoraux', 'Dos', 'Épaules', 'Quadriceps', 'Ischios', 'Biceps', 'Triceps'].filter(m => lm[m] && daysBetween(lm[m], now) >= 8);
    if (neg.length) out.push({ i: '🎯', t: `Négligé : ${neg.slice(0, 3).join(', ')}`, s: 'Plus de 8 jours sans les travailler. Mets-les dans ta prochaine séance.' });
    // plateaux
    const plat = Object.keys(cnt).filter(id => { const s = suggest(id); return s && s.kind === 'deload'; });
    if (plat.length) out.push({ i: '🧱', t: `Plateau : ${EX(plat[0]).name}`, s: 'Fais un deload de 10 % une semaine, ça repart souvent après.' });
  }
  // nutrition 7 jours
  let pd = 0, pn = 0; for (let i = 1; i <= 7; i++) { const k = dk(addDays(new Date(), -i)); if ((S.log[k] || []).length) { pn++; pd += dayTotals(k).p; } }
  if (pn >= 3) { const avg = pd / pn; out.push(avg < g.p * .9 ? { i: '🥩', t: `Protéines : ${fmt(avg)} g/jour en moyenne`, s: `Ton objectif c’est ${g.p} g. Ajoute un shake ou une portion de viande.` } : { i: '💪', t: `Protéines sur la coche (${fmt(avg)} g/j)`, s: 'Continue de même, c’est là que les gains se font.' }); }
  // poids vs objectif
  const a7 = avgBW(7), p7 = (() => { const from = dk(addDays(new Date(), -13)), to = dk(addDays(new Date(), -7)); const L = S.body.filter(b => b.d >= from && b.d <= to); return L.length ? L.reduce((a, b) => a + b.w, 0) / L.length : null; })();
  if (a7 && p7) {
    const d = a7 - p7, gt = S.settings.goalType;
    if (gt === 'cut' && d > 0) out.push({ i: '⚖️', t: `+${fmt(d, 1)} ${u()} cette semaine en sèche`, s: 'Baisse de ~150-200 cal/jour ou ajoute du cardio.' });
    else if (gt === 'bulk' && d <= 0) out.push({ i: '⚖️', t: 'Le poids monte pas en bulk', s: 'Ajoute ~200 cal/jour (glucides autour de l’entraînement).' });
    else out.push({ i: '⚖️', t: `Moyenne 7 j : ${fmt(a7, 1)} ${u()} (${d >= 0 ? '+' : ''}${fmt(d, 1)})`, s: gt === 'cut' ? 'Ça descend, t’es sur la bonne track.' : gt === 'bulk' ? 'Ça monte, parfait pour un bulk propre.' : 'Poids stable.' });
  }
  return out.slice(0, 5);
}
function recoveryHTML() {
  const lm = lastMuscleDates(), now = Date.now();
  return `<div class="chips">${Object.keys(MUSCLES).filter(m => m !== 'Cardio').map(m => {
    if (!lm[m]) return `<span class="rc none">${m}<small>jamais</small></span>`;
    const d = daysBetween(lm[m], now); const cls = d <= 1 ? 'rec' : d <= 4 ? 'ready' : 'due';
    return `<span class="rc ${cls}">${m}<small>${d === 0 ? 'auj.' : d + ' j'}</small></span>`;
  }).join('')}</div><div class="muted sm mt8"><span class="lg rec"></span>en récup · <span class="lg ready"></span>prêt · <span class="lg due"></span>à entraîner</div>`;
}

A.quickStart = () => { const nx = nextRoutine(); startWorkout(nx ? nx.id : null); };

/* ---------- ENTRAÎNEMENT ---------- */
VIEWS.train = () => {
  const lastBy = {}; S.workouts.forEach(w => { if (w.routineId) lastBy[w.routineId] = w.start; });
  const hist = S.workouts.slice().reverse().slice(0, 40);
  let curM = '';
  return `
  <div class="grid2">
    <button class="tile acc" data-a="startEmpty"><span>${IC.plus}</span><b>Séance vide</b></button>
    <button class="tile" data-a="openCoach"><span>${IC.cam}</span><b>Coach caméra</b><small>forme + reps par IA</small></button>
  </div>
  <h3 class="sec">Mes routines <button class="link" data-a="newRoutine">+ Nouvelle</button></h3>
  ${S.routines.length ? S.routines.map(r => `<div class="card routine">
    <div class="r-top"><div><b>${esc(r.name)}</b><div class="muted sm">${r.ex.length} exos · ${lastBy[r.id] ? 'fait ' + relDay(lastBy[r.id]) : 'jamais fait'}</div></div><button class="icon" data-a="editRoutine" data-id="${r.id}">${IC.dots}</button></div>
    <div class="r-ex muted sm">${r.ex.map(e => esc(EX(e.exId).name)).join(' · ')}</div>
    <button class="btn block acc mt8" data-a="startRoutine" data-id="${r.id}">Démarrer</button></div>`).join('') : `<p class="muted">Aucune routine. Crée-en une ou ajoute un programme ci-dessous.</p>`}
  <h3 class="sec">Programmes prêts</h3>
  <div class="hscroll">${PACKS.map(([k, n, d]) => `<button class="pack" data-a="addPack" data-k="${k}"><b>${n}</b><span class="muted sm">${d}</span><span class="pack-add">+ Ajouter</span></button>`).join('')}</div>
  <h3 class="sec">Outils</h3>
  <div class="grid3">
    <button class="tool" data-a="plates">🏋️<span>Plaques</span></button>
    <button class="tool" data-a="calc1rm">🧮<span>1RM</span></button>
    <button class="tool" data-a="library">📚<span>Exercices</span></button>
  </div>
  <h3 class="sec">Historique <span class="muted sm">${S.workouts.length} séances</span></h3>
  ${hist.length ? hist.map(w => { const m = cap(MONTHS[new Date(w.start).getMonth()]) + ' ' + new Date(w.start).getFullYear(); const hd = m !== curM ? `<div class="month-h">${m}</div>` : ''; curM = m; return hd + `<button class="li tap" data-a="woDetail" data-id="${w.id}"><div class="li-d"><b>${new Date(w.start).getDate()}</b><small>${new Date(w.start).toLocaleDateString('fr-CA', { weekday: 'short' })}</small></div><div class="grow"><b>${esc(w.name)}</b><div class="muted sm">${fmtDurShort((w.end || w.start) - w.start)} · ${fmt(w.vol)} ${u()} · ${w.ex.length} exos${w.prs?.length ? ` · 🏆 ${w.prs.length}` : ''}</div></div><span class="chev">›</span></button>`; }).join('') : `<p class="muted">Tes séances vont apparaître ici.</p>`}`;
};
const relDay = t => { const d = daysBetween(t, Date.now()); return d === 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} j`; };

A.startEmpty = () => startWorkout(null);
A.startRoutine = el => startWorkout(el.dataset.id);
A.addPack = el => { const rs = presetPack(el.dataset.k); S.routines.push(...rs); save(); render(); toast(`${rs.length} routines ajoutées`); };

/* éditeur de routine */
let RE = null;
A.newRoutine = () => { RE = { id: null, name: 'Nouvelle routine', ex: [] }; openRoutineEditor(); };
A.editRoutine = el => { const r = S.routines.find(x => x.id === el.dataset.id); RE = JSON.parse(JSON.stringify(r)); openRoutineEditor(); };
function openRoutineEditor() {
  openSheet(() => `<input class="title-in" data-i="reName" value="${esc(RE.name)}" placeholder="Nom de la routine">
    ${RE.ex.map((e, i) => `<div class="re-row"><div class="grow"><b>${esc(EX(e.exId).name)}</b><div class="re-f"><label>Séries<input inputmode="numeric" data-i="reSets" data-n="${i}" value="${e.sets}"></label><label>Reps<input data-i="reReps" data-n="${i}" value="${esc(e.reps)}" placeholder="8-12"></label><label>Repos (s)<input inputmode="numeric" data-i="reRest" data-n="${i}" value="${e.rest ?? ''}" placeholder="${S.settings.rest}"></label></div></div>
      <div class="re-btns"><button class="icon sm" data-a="reUp" data-n="${i}">↑</button><button class="icon sm" data-a="reDown" data-n="${i}">↓</button><button class="icon sm red" data-a="reDel" data-n="${i}">${IC.x}</button></div></div>`).join('')}
    <button class="btn block ghost mt8" data-a="reAdd">+ Ajouter des exercices</button>
    <button class="btn block acc mt" data-a="reSave">Enregistrer</button>
    ${RE.id ? `<button class="btn block danger-ghost mt8" data-a="reDelete">Supprimer la routine</button>` : ''}`, { full: true });
}
I.reName = el => RE.name = el.value;
I.reSets = el => RE.ex[+el.dataset.n].sets = parseInt(el.value) || 1;
I.reReps = el => RE.ex[+el.dataset.n].reps = el.value;
I.reRest = el => RE.ex[+el.dataset.n].rest = parseInt(el.value) || null;
A.reUp = el => { const i = +el.dataset.n; if (i > 0) { [RE.ex[i - 1], RE.ex[i]] = [RE.ex[i], RE.ex[i - 1]]; paintSheet(); } };
A.reDown = el => { const i = +el.dataset.n; if (i < RE.ex.length - 1) { [RE.ex[i + 1], RE.ex[i]] = [RE.ex[i], RE.ex[i + 1]]; paintSheet(); } };
A.reDel = el => { RE.ex.splice(+el.dataset.n, 1); paintSheet(); };
A.reAdd = () => pickExercises(ids => { ids.forEach(id => RE.ex.push({ exId: id, sets: 3, reps: EX(id).type === 't' ? '30-60' : '8-12', rest: null })); paintSheet(); });
A.reSave = () => {
  if (!RE.ex.length) return toast('Ajoute au moins un exercice');
  if (RE.id) { const i = S.routines.findIndex(r => r.id === RE.id); S.routines[i] = RE; } else { RE.id = uid(); S.routines.push(RE); }
  save(); closeSheet(); render(); toast('Routine enregistrée');
};
A.reDelete = () => confirmSheet('Supprimer la routine?', 'Ton historique reste intact.', 'Supprimer', () => { S.routines = S.routines.filter(r => r.id !== RE.id); save(); closeAllSheets(); render(); });

/* sélecteur d'exercices */
let PK = null;
function pickExercises(cb, single = false) {
  PK = { cb, single, sel: [], q: '', m: '' };
  openSheet(() => `<h2 class="sh-t">Exercices</h2>
    <input type="search" data-i="pkQ" placeholder="Rechercher..." value="${esc(PK.q)}">
    <div class="chips scroll mt8">${['', ...Object.keys(MUSCLES)].map(m => `<button class="chip ${PK.m === m ? 'on' : ''}" data-a="pkM" data-m="${m}">${m || 'Tous'}</button>`).join('')}</div>
    <div id="pkList" class="mt8">${pkList()}</div>
    <button class="btn block ghost mt8" data-a="newExercise">+ Créer un exercice</button>
    ${single ? '' : `<div class="sticky-bottom"><button class="btn block acc" data-a="pkDone">Ajouter (${PK.sel.length})</button></div>`}`, { full: true });
}
function pkList() {
  const q = norm(PK.q.trim());
  const used = {}; S.workouts.forEach(w => w.ex.forEach(e => used[e.exId] = (used[e.exId] || 0) + 1));
  const L = allEx().filter(e => (!PK.m || e.muscle === PK.m) && (!q || norm(e.name).includes(q)))
    .sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0));
  return L.map(e => `<button class="li tap ${PK.sel.includes(e.id) ? 'sel' : ''}" data-a="pkTap" data-id="${e.id}"><span class="mdot" style="background:${MUSCLES[e.muscle]}"></span><div class="grow"><b>${esc(e.name)}</b><div class="muted sm">${e.muscle} · ${e.equip}${used[e.id] ? ` · ${used[e.id]}×` : ''}</div></div><span class="ck">${PK.sel.includes(e.id) ? IC.check : ''}</span></button>`).join('') || '<p class="muted">Rien trouvé.</p>';
}
I.pkQ = el => { PK.q = el.value; $('#pkList').innerHTML = pkList(); };
A.pkM = el => { PK.m = el.dataset.m; paintSheet(); };
A.pkTap = el => {
  const id = el.dataset.id;
  if (PK.single) { closeSheet(); PK.cb([id]); return; }
  PK.sel.includes(id) ? PK.sel.splice(PK.sel.indexOf(id), 1) : PK.sel.push(id);
  $('#pkList').innerHTML = pkList(); const b = $('[data-a="pkDone"]'); if (b) b.textContent = `Ajouter (${PK.sel.length})`;
};
A.pkDone = () => { const s = PK.sel.slice(); closeSheet(); if (s.length) PK.cb(s); };
let NE = null;
A.newExercise = () => {
  NE = { name: PK?.q || '', muscle: PK?.m || 'Pectoraux', equip: 'Haltères', type: 'w' };
  openSheet(() => `<h2 class="sh-t">Nouvel exercice</h2>
    <label class="fl">Nom<input data-i="neName" value="${esc(NE.name)}" placeholder="ex. Curl araignée"></label>
    <label class="fl">Muscle<select data-i="neMuscle">${Object.keys(MUSCLES).map(m => `<option ${m === NE.muscle ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label class="fl">Équipement<select data-i="neEquip">${['Barre', 'Haltères', 'Machine', 'Poulie', 'Poids du corps', 'Kettlebell', 'Cardio', 'Autre'].map(m => `<option ${m === NE.equip ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label class="fl">Type<select data-i="neType">${[['w', 'Poids × reps'], ['bw', 'Poids du corps × reps'], ['t', 'Temps (secondes)'], ['c', 'Cardio (km + min)']].map(([k, l]) => `<option value="${k}" ${k === NE.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn block acc mt" data-a="neSave">Créer</button>`);
};
I.neName = el => NE.name = el.value; I.neMuscle = el => NE.muscle = el.value; I.neEquip = el => NE.equip = el.value; I.neType = el => NE.type = el.value;
C.neMuscle = I.neMuscle; C.neEquip = I.neEquip; C.neType = I.neType;
A.neSave = () => { if (!NE.name.trim()) return toast('Donne-lui un nom'); const e = { id: 'c_' + uid(), name: NE.name.trim(), muscle: NE.muscle, equip: NE.equip, type: NE.type }; S.exercises.push(e); rebuildEx(); save(); closeSheet(); if (PK && SH.length) { PK.q = ''; paintSheet(); } toast('Exercice créé'); };

A.library = () => { pickExercises(ids => showExInfo(ids[0]), true); };
A.exInfo = el => showExInfo(el.dataset.ex);
function showExInfo(id) {
  const e = EX(id), h = exSessions(id), b = bestOf(id);
  openSheet(() => `<h2 class="sh-t">${esc(e.name)}</h2><div class="muted mb">${e.muscle} · ${e.equip}</div>
    ${e.type === 'w' ? `<div class="grid3">${statBox('Poids max', b.w ? fmt(b.w, 1) + ' ' + u() : '–')}${statBox('1RM est.', b.e ? fmt(b.e) + ' ' + u() : '–')}${statBox('Séances', h.length)}</div><canvas id="cvExInfo" class="chart mt"></canvas>` : statBox('Séances', h.length)}
    <h3 class="mt">Historique</h3>
    ${h.slice(0, 15).map(x => `<div class="hrow"><span class="muted sm">${shortDate(x.date)}</span><span>${x.sets.map(s => setStr(s, e.type)).join(' · ')}</span></div>`).join('') || '<p class="muted">Jamais fait.</p>'}
    ${e.custom ? `<button class="btn block danger-ghost mt" data-a="delExercise" data-id="${id}">Supprimer cet exercice</button>` : ''}`,
    { full: true, mount: () => e.type === 'w' && lineChart($('#cvExInfo'), h.slice().reverse().map(x => ({ x: x.date, y: Math.round(sessStats(x.sets).e1rm) }))) });
}
A.delExercise = el => confirmSheet('Supprimer l’exercice?', 'Il disparaîtra de la liste (ton historique garde les chiffres).', 'Supprimer', () => { S.exercises = S.exercises.filter(x => x.id !== el.dataset.id); rebuildEx(); save(); closeAllSheets(); render(); });
function setStr(s, type) {
  const w = num(s.w), r = num(s.r);
  if (type === 'c') return `${w ? fmt(w, 2) + ' km ' : ''}${r ? fmt(r) + ' min' : ''}` || '–';
  if (type === 't') return `${r || 0}s${w ? ' +' + fmt(w, 1) : ''}`;
  if (type === 'bw') return `${w ? '+' + fmt(w, 1) + '×' : ''}${r || 0}`;
  return `${fmt(w || 0, 1)}×${r || 0}`;
}

/* ---------- SÉANCE ACTIVE ---------- */
const newSet = (t = 'n') => ({ w: '', r: '', rpe: '', t, done: false });
function defaultWorkoutName() { const h = new Date().getHours(); return h < 11 ? 'Séance du matin' : h < 14 ? 'Séance du midi' : h < 18 ? "Séance de l'après-midi" : 'Séance du soir'; }
function startWorkout(routineId, from, startAt) {
  const go = () => {
    const r = routineId ? S.routines.find(x => x.id === routineId) : null;
    let ex = [];
    if (r) ex = r.ex.map(e => ({ k: uid(), exId: e.exId, note: '', reps: e.reps, rest: e.rest, sets: Array.from({ length: Math.max(1, +e.sets || 3) }, () => newSet()) }));
    if (from) ex = from.ex.map(e => ({ k: uid(), exId: e.exId, note: '', reps: null, rest: null, sets: e.sets.map(s => newSet(s.t)) }));
    S.active = { id: uid(), start: startAt || Date.now(), past: !!startAt, name: r ? r.name : from ? from.name : defaultWorkoutName(), routineId: r ? r.id : from ? from.routineId : null, ex, restEnd: 0, restTotal: 0, note: '' };
    save(); render(); openWorkout();
  };
  if (S.active) confirmSheet('Séance déjà en cours', 'Veux-tu l’abandonner pour en commencer une nouvelle?', 'Remplacer', go); else go();
}
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) { } }
function openWorkout() { if (!S.active) return; $('#wo').classList.add('open'); document.body.classList.add('lock'); renderWorkout(); keepAwake(); }
function closeWorkout() { $('#wo').classList.remove('open'); if (!S.active) setTimeout(() => { if (!S.active) $('#wo').innerHTML = ''; }, 350); document.body.classList.remove('lock'); render(); }
A.openWorkout = openWorkout;
A.woMin = closeWorkout;

function lastSets(exId) { const h = exSessions(exId, S.active?.id); return h.length ? h[0].sets : []; }
function renderWorkout() {
  const W = S.active; if (!W) return closeWorkout();
  const done = W.ex.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  const tot = W.ex.reduce((a, e) => a + e.sets.length, 0);
  const vol = woVolume({ ex: W.ex.map(e => ({ exId: e.exId, sets: e.sets.filter(s => s.done) })) });
  const sc = $('#wo .wobody')?.scrollTop || 0;
  $('#wo').innerHTML = `<header class="wohead">
      <button class="icon" data-a="woMin">${IC.down}</button>
      <div class="wotitle"><input class="woname" data-i="woName" value="${esc(W.name)}"><div class="muted sm">${W.past ? shortDate(W.start) + ' (passée)' : `<span data-elapsed>${fmtDur(Date.now() - W.start)}</span>`} · ${done}/${tot} séries · ${fmt(vol)} ${u()}</div></div>
      <button class="btn sm acc" data-a="woFinish">Terminer</button>
    </header>
    <div class="track thin"><div class="fill" style="width:${tot ? done / tot * 100 : 0}%"></div></div>
    <div class="wobody">
      ${W.ex.map((e, i) => exCard(e, i)).join('') || `<div class="empty"><div class="empty-i">🏋️</div><p class="muted">Ajoute ton premier exercice</p></div>`}
      <button class="btn block acc" data-a="woAddEx">+ Ajouter un exercice</button>
      <div class="grid3 mt8"><button class="tool" data-a="plates">🏋️<span>Plaques</span></button><button class="tool" data-a="openCoach">🎥<span>Coach</span></button><button class="tool" data-a="woNote">📝<span>Note</span></button></div>
      <button class="btn block danger-ghost mt" data-a="woCancel">Abandonner la séance</button>
      <div style="height:120px"></div>
    </div>
    <div id="restbar"></div>`;
  $('#wo .wobody').scrollTop = sc;
  updateRest();
}
function exCard(e, i) {
  const ex = EX(e.exId), type = ex.type, cols = COLS[type], prev = lastSets(e.exId), sug = suggest(e.exId, e.reps);
  let n = 0;
  const rows = e.sets.map((s, j) => {
    if (s.t !== 'w') n++;
    const p = prev[j];
    const usesSug = sug && s.t !== 'w' && (sug.kind !== 'rep' || !p);
    const wPh = usesSug ? sug.w : p ? p.w : '';
    const rPh = usesSug ? sug.r : p ? p.r : (parseRange(e.reps)?.[1] || '');
    const lab = s.t === 'w' ? 'É' : s.t === 'd' ? 'D' : s.t === 'f' ? 'F' : n;
    return `<div class="setrow ${s.done ? 'done' : ''} t-${s.t}">
      <button class="setn" data-a="setType" data-n="${i}" data-j="${j}">${lab}</button>
      <span class="prev">${p ? setStr(p, type) : '–'}</span>
      <input data-i="set" data-n="${i}" data-j="${j}" data-f="w" inputmode="decimal" placeholder="${wPh === '' || wPh == null ? (type === 'w' ? u() : '–') : fmt(wPh, 2)}" value="${esc(s.w)}">
      <input data-i="set" data-n="${i}" data-j="${j}" data-f="r" inputmode="decimal" placeholder="${rPh ?? ''}" value="${esc(s.r)}">
      <input data-i="set" data-n="${i}" data-j="${j}" data-f="rpe" inputmode="decimal" placeholder="–" value="${esc(s.rpe)}">
      <button class="setck" data-a="setDone" data-n="${i}" data-j="${j}">${IC.check}</button></div>`;
  }).join('');
  return `<div class="excard">
    <div class="exhead"><div class="grow" data-a="exInfo" data-ex="${e.exId}"><div class="exname">${esc(ex.name)}</div><span class="mtag" style="--m:${MUSCLES[ex.muscle]}">${ex.muscle}</span>${e.reps ? `<span class="muted sm"> · obj. ${esc(e.reps)}</span>` : ''}</div><button class="icon" data-a="exMenu" data-n="${i}">${IC.dots}</button></div>
    ${sug ? `<div class="sug ${sug.kind}">${sug.kind === 'up' ? '⬆️' : sug.kind === 'deload' ? '🔄' : '➕'} ${esc(sug.msg)}</div>` : ''}
    ${e.note ? `<div class="exnote">📝 ${esc(e.note)}</div>` : ''}
    <div class="sethead"><span>Série</span><span>Précédent</span><span>${cols[0]}</span><span>${cols[1]}</span><span>RPE</span><span></span></div>
    ${rows}
    <div class="row gap mt8"><button class="btn sm ghost grow" data-a="addSet" data-n="${i}">+ Série</button><button class="btn sm ghost" data-a="rmSet" data-n="${i}">− Série</button></div>
  </div>`;
}
I.woName = el => { S.active.name = el.value; save(); };
I.set = el => { const s = S.active.ex[+el.dataset.n].sets[+el.dataset.j]; s[el.dataset.f] = el.value; save(); };
A.setType = el => { const s = S.active.ex[+el.dataset.n].sets[+el.dataset.j]; const order = ['n', 'w', 'd', 'f']; s.t = order[(order.indexOf(s.t) + 1) % 4]; save(); renderWorkout(); toast({ n: 'Série normale', w: 'Échauffement', d: 'Série dégressive', f: 'Jusqu’à l’échec' }[s.t], 1200); };
A.setDone = el => {
  const e = S.active.ex[+el.dataset.n], s = e.sets[+el.dataset.j];
  if (s.done) { s.done = false; save(); return renderWorkout(); }
  const row = el.closest('.setrow'); const ins = $$('input', row);
  if (s.w === '' && ins[0].placeholder && !isNaN(num(ins[0].placeholder))) s.w = String(num(ins[0].placeholder));
  if (s.r === '' && ins[1].placeholder && !isNaN(num(ins[1].placeholder))) s.r = String(num(ins[1].placeholder));
  if (!num(s.r) && !num(s.w)) return toast('Entre tes reps');
  s.done = true;
  // PR en direct
  const ex = EX(e.exId);
  if (ex.type === 'w' && s.t !== 'w') {
    const b = bestOf(e.exId, S.active.id), est = e1rm(num(s.w), num(s.r));
    const thisBest = Math.max(0, ...e.sets.filter(x => x.done && x !== s && x.t !== 'w').map(x => e1rm(num(x.w), num(x.r))));
    if (b.e > 0 && est > b.e && est > thisBest) { toast(`🏆 Nouveau record! 1RM est. ${fmt(est)} ${u()}`, 2600); try { navigator.vibrate && navigator.vibrate(80); } catch (x) { } }
  }
  if (!S.active.past) startRest(e.rest || S.settings.rest);
  save(); renderWorkout();
};
A.addSet = el => { const e = S.active.ex[+el.dataset.n]; const last = e.sets[e.sets.length - 1]; e.sets.push(newSet(last && last.t === 'w' ? 'n' : last ? last.t : 'n')); save(); renderWorkout(); };
A.rmSet = el => { const e = S.active.ex[+el.dataset.n]; if (e.sets.length) e.sets.pop(); save(); renderWorkout(); };
A.woAddEx = () => pickExercises(ids => { ids.forEach(id => S.active.ex.push({ k: uid(), exId: id, note: '', reps: null, rest: null, sets: [newSet(), newSet(), newSet()] })); save(); renderWorkout(); });
A.exMenu = el => {
  const i = +el.dataset.n, e = S.active.ex[i];
  openSheet(() => `<h2 class="sh-t">${esc(EX(e.exId).name)}</h2>
    <label class="fl">Note<textarea data-i="exNote" data-n="${i}" rows="2" placeholder="ex. siège au cran 4">${esc(e.note)}</textarea></label>
    <label class="fl">Repos (secondes)<input inputmode="numeric" data-i="exRest" data-n="${i}" value="${e.rest ?? ''}" placeholder="${S.settings.rest}"></label>
    <button class="li tap" data-a="exReplace" data-n="${i}">🔁 Remplacer l’exercice</button>
    <button class="li tap" data-a="exMove" data-n="${i}" data-d="-1">⬆️ Monter</button>
    <button class="li tap" data-a="exMove" data-n="${i}" data-d="1">⬇️ Descendre</button>
    <button class="li tap" data-a="exInfo" data-ex="${e.exId}">📈 Historique & graphique</button>
    <button class="li tap red" data-a="exRemove" data-n="${i}">🗑️ Retirer de la séance</button>`, { onClose: () => renderWorkout() });
};
I.exNote = el => { S.active.ex[+el.dataset.n].note = el.value; save(); };
I.exRest = el => { S.active.ex[+el.dataset.n].rest = parseInt(el.value) || null; save(); };
A.exReplace = el => { const i = +el.dataset.n; closeSheet(); pickExercises(ids => { S.active.ex[i].exId = ids[0]; save(); renderWorkout(); }, true); };
A.exMove = el => { const i = +el.dataset.n, d = +el.dataset.d, j = i + d, L = S.active.ex; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; save(); closeSheet(); };
A.exRemove = el => { S.active.ex.splice(+el.dataset.n, 1); save(); closeSheet(); };
A.woNote = () => openSheet(() => `<h2 class="sh-t">Note de séance</h2><textarea data-i="woNoteIn" rows="4" placeholder="Comment tu te sens, énergie, sommeil...">${esc(S.active.note || '')}</textarea><button class="btn block acc mt" data-a="closeSheet">OK</button>`);
I.woNoteIn = el => { S.active.note = el.value; save(); };
A.woCancel = () => confirmSheet('Abandonner la séance?', 'Rien ne sera enregistré.', 'Abandonner', () => { S.active = null; save(); closeWorkout(); });
A.woFinish = () => {
  const W = S.active;
  const ex = W.ex.map(e => ({ exId: e.exId, note: e.note, sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w) || 0, r: num(s.r) || 0, rpe: num(s.rpe), t: s.t })) })).filter(e => e.sets.length);
  if (!ex.length) return confirmSheet('Aucune série complétée', 'Coche au moins une série (✓) ou abandonne la séance.', 'Abandonner la séance', () => { S.active = null; save(); closeWorkout(); });
  const pending = W.ex.reduce((a, e) => a + e.sets.filter(s => !s.done).length, 0);
  const finish = () => {
    const wo = { id: W.id, start: W.start, end: W.past ? W.start + 60 * 6e4 : Date.now(), name: W.name || 'Séance', routineId: W.routineId, ex, note: W.note || '' };
    wo.vol = woVolume(wo); wo.prs = computePRs(wo);
    S.workouts.push(wo); sortWorkouts(); S.active = null; save();
    $('#wo').classList.remove('open'); document.body.classList.remove('lock'); setTimeout(() => { if (!S.active) $('#wo').innerHTML = ''; }, 350);
    if (wakeLock) { wakeLock.release().catch(() => { }); wakeLock = null; }
    S.ui.tab = 'home'; render(); summary(wo);
  };
  if (pending) confirmSheet('Terminer la séance?', `${pending} série${pending > 1 ? 's' : ''} pas cochée${pending > 1 ? 's' : ''} — elle${pending > 1 ? 's' : ''} ne compteront pas.`, 'Terminer', finish, false); else finish();
};
function summary(wo) {
  const n = S.workouts.length, sets = wo.ex.reduce((a, e) => a + working(e.sets).length, 0);
  openSheet(() => `<div class="sum-h"><div class="sum-i">🔒</div><h2>Séance #${n} complétée</h2><p class="muted">${esc(wo.name)} · ${cap(dateLong(wo.start))}</p></div>
    <div class="grid3">${statBox('Durée', fmtDurShort(wo.end - wo.start))}${statBox('Volume', fmt(wo.vol) + ' ' + u())}${statBox('Séries', sets)}</div>
    ${wo.prs.length ? `<div class="prbox mt"><b>🏆 ${wo.prs.length} nouveau${wo.prs.length > 1 ? 'x' : ''} record${wo.prs.length > 1 ? 's' : ''}</b>${wo.prs.map(p => `<div>${esc(EX(p.exId).name)} — ${p.kind} <b>${fmt(p.val, 1)} ${u()}</b></div>`).join('')}</div>` : ''}
    <div class="muted sm mt center">Streak : ${weekStreak()} sem. · ${weekCount(startOfWeek(new Date()))}/${S.settings.weeklyTarget} cette semaine</div>
    ${!wo.routineId ? `<button class="btn block ghost mt" data-a="wToRoutine" data-id="${wo.id}">Sauvegarder comme routine</button>` : ''}
    <button class="btn block acc mt8" data-a="closeSheet">Nice 💪</button>`);
}
function workoutDetail(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  openSheet(() => `<h2 class="sh-t">${esc(w.name)}</h2><div class="muted mb">${cap(dateLong(w.start))} · ${fmtDurShort((w.end || w.start) - w.start)} · ${fmt(w.vol)} ${u()}</div>
    ${w.prs?.length ? `<div class="prbox">${w.prs.map(p => `<div>🏆 ${esc(EX(p.exId).name)} — ${p.kind} <b>${fmt(p.val, 1)}</b></div>`).join('')}</div>` : ''}
    ${w.ex.map(e => { const t = EX(e.exId).type; let n = 0; return `<div class="detex"><b>${esc(EX(e.exId).name)}</b>${e.note ? `<div class="muted sm">📝 ${esc(e.note)}</div>` : ''}${e.sets.map(s => { if (s.t !== 'w') n++; return `<div class="detset"><span class="setn sm t-${s.t}">${s.t === 'w' ? 'É' : s.t === 'd' ? 'D' : s.t === 'f' ? 'F' : n}</span><span>${setStr(s, t)}</span><span class="muted sm">${s.rpe ? 'RPE ' + s.rpe : ''}${t === 'w' && s.t !== 'w' ? ' · 1RM ' + fmt(e1rm(s.w, s.r)) : ''}</span></div>`; }).join('')}</div>`; }).join('')}
    ${w.note ? `<div class="exnote mt">📝 ${esc(w.note)}</div>` : ''}
    <div class="grid3 mt"><button class="btn" data-a="repeatW" data-id="${w.id}">Refaire</button><button class="btn ghost" data-a="wToRoutine" data-id="${w.id}">→ Routine</button><button class="btn danger-ghost" data-a="delW" data-id="${w.id}">Supprimer</button></div>`, { full: true });
}
A.woDetail = el => workoutDetail(el.dataset.id);
A.repeatW = el => { const w = S.workouts.find(x => x.id === el.dataset.id); closeAllSheets(); startWorkout(null, w); };
A.wToRoutine = el => { const w = S.workouts.find(x => x.id === el.dataset.id); const r = { id: uid(), name: w.name, ex: w.ex.map(e => ({ exId: e.exId, sets: working(e.sets).length || e.sets.length, reps: '8-12', rest: null })) }; S.routines.push(r); w.routineId = r.id; save(); closeAllSheets(); render(); toast('Routine créée'); };
A.delW = el => confirmSheet('Supprimer la séance?', 'C’est définitif.', 'Supprimer', () => { S.workouts = S.workouts.filter(x => x.id !== el.dataset.id); save(); closeAllSheets(); render(); });

/* minuteur de repos */
let restFired = false;
function startRest(sec) { S.active.restTotal = sec; S.active.restEnd = Date.now() + sec * 1000; restFired = false; save(); updateRest(); }
function updateRest() {
  const el = $('#restbar'); if (!el || !S.active) return;
  const left = S.active.restEnd - Date.now();
  if (left <= 0) { el.innerHTML = ''; el.className = ''; return; }
  const p = 1 - left / (S.active.restTotal * 1000);
  if (!el.firstChild) el.innerHTML = `<div class="rest-in"><div class="rest-fill"></div><button class="icon sm" data-a="restAdj" data-d="-15">−15</button><div class="rest-t"><small>Repos</small><b></b></div><button class="icon sm" data-a="restAdj" data-d="15">+15</button><button class="btn sm" data-a="restSkip">Passer</button></div>`;
  el.className = 'show';
  $('.rest-t b', el).textContent = fmtDur(left + 999);
  $('.rest-fill', el).style.width = (p * 100) + '%';
}
A.restAdj = el => { S.active.restEnd += (+el.dataset.d) * 1000; S.active.restTotal = Math.max(5, S.active.restTotal + (+el.dataset.d)); save(); updateRest(); };
A.restSkip = () => { S.active.restEnd = 0; save(); updateRest(); };

setInterval(() => {
  if (!S.active) return;
  $$('[data-elapsed]').forEach(e => e.textContent = fmtDur(Date.now() - S.active.start));
  if (S.active.restEnd) {
    if (Date.now() >= S.active.restEnd) { if (!restFired) { restFired = true; beep(3); toast('⏱️ Repos terminé — go!'); } S.active.restEnd = 0; save(); }
    updateRest();
  }
  const ab = $('#activebar .ab-t'); if (ab) ab.textContent = fmtDur(Date.now() - S.active.start);
}, 500);

/* calculatrice de plaques */
let PL = { target: '' };
A.plates = () => {
  openSheet(() => {
    const t = num(PL.target), bar = S.settings.barWeight;
    const plates = u() === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
    let side = t ? (t - bar) / 2 : 0, res = [];
    if (side > 0) plates.forEach(p => { while (side >= p - 1e-9) { res.push(p); side -= p; } });
    const col = { 45: '#FF453A', 25: '#4DA3FF', 35: '#FFD60A', 10: '#33D17A', 5: '#f5f5f7', 2.5: '#8E8E93', 20: '#4DA3FF', 15: '#FFD60A', 1.25: '#8E8E93' };
    return `<h2 class="sh-t">Calculatrice de plaques</h2>
      <label class="fl">Poids total visé (${u()})<input inputmode="decimal" data-i="plT" value="${esc(PL.target)}" placeholder="ex. 225"></label>
      <label class="fl">Barre (${u()})<input inputmode="decimal" data-i="plBar" value="${bar}"></label>
      <div class="barviz">${t && t > bar ? `<div class="bar-sleeve"></div>${res.map(p => `<div class="plate" style="height:${40 + p / plates[0] * 70}px;background:${col[p] || '#aaa'}">${fmt(p, 2)}</div>`).join('')}` : '<span class="muted">Entre un poids plus lourd que la barre</span>'}</div>
      ${res.length ? `<p class="center"><b>Par côté :</b> ${res.map(p => fmt(p, 2)).join(' + ')}${side > 0.01 ? `<br><span class="muted sm">(${fmt(side * 2, 2)} ${u()} impossible à faire exactement)</span>` : ''}</p>` : ''}`;
  });
};
I.plT = el => { PL.target = el.value; const b = SH[SH.length - 1].el.querySelector('.sheetbody'); const pos = el.selectionStart; paintSheet(); const n = $('[data-i="plT"]', b); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } };
I.plBar = el => { const v = num(el.value); if (v != null) { S.settings.barWeight = v; save(); } };
C.plBar = () => paintSheet();

/* calculatrice 1RM */
let RM = { w: '', r: '' };
A.calc1rm = () => openSheet(() => {
  const w = num(RM.w), r = num(RM.r), e = w && r ? e1rm(w, r) : 0;
  return `<h2 class="sh-t">Calculatrice 1RM</h2>
    <div class="grid2"><label class="fl">Poids<input inputmode="decimal" data-i="rmW" value="${esc(RM.w)}"></label><label class="fl">Reps<input inputmode="numeric" data-i="rmR" value="${esc(RM.r)}"></label></div>
    <div class="center big mt">${e ? fmt(e) + ' <small>' + u() + '</small>' : '–'}</div><div class="muted sm center mb">1RM estimé (Epley)</div>
    ${e ? `<div class="pct">${[[95, 2], [90, 4], [85, 6], [80, 8], [75, 10], [70, 12], [65, 15], [60, 20]].map(([p, rr]) => `<div><b>${p} %</b><span>${fmt(roundTo(e * p / 100, u() === 'kg' ? 2.5 : 5))} ${u()}</span><small class="muted">~${rr} reps</small></div>`).join('')}</div>` : ''}`;
});
I.rmW = el => { RM.w = el.value; repaintKeepFocus(el); };
I.rmR = el => { RM.r = el.value; repaintKeepFocus(el); };
function repaintKeepFocus(el) { const key = el.dataset.i, pos = el.selectionStart; paintSheet(); const n = $(`.sheetwrap:last-child [data-i="${key}"]`) || $(`[data-i="${key}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } }

/* coach caméra */
A.openCoach = async () => {
  closeAllSheets();
  try {
    toast('Chargement du coach...', 1200);
    const m = await import('./coach.js');
    m.openCoach({
      unit: u(), toast, esc, EX, fmt,
      addSet: (exId, reps, w, score) => {
        if (!S.active) { S.active = { id: uid(), start: Date.now(), name: defaultWorkoutName(), routineId: null, ex: [], restEnd: 0, restTotal: 0, note: '' }; }
        let e = S.active.ex.find(x => x.exId === exId);
        if (!e) { e = { k: uid(), exId, note: '', reps: null, rest: null, sets: [] }; S.active.ex.push(e); }
        const empty = e.sets.find(s => !s.done && s.r === '' && s.w === '');
        const set = empty || newSet(); set.w = w != null ? String(w) : ''; set.r = String(reps); set.done = true; if (!empty) e.sets.push(set);
        if (score != null) e.note = (e.note ? e.note + ' · ' : '') + `Forme ${score}/100`;
        save(); toast('Série ajoutée à ta séance ✅');
      },
      onClose: () => { if (S.active && $('#wo').classList.contains('open')) renderWorkout(); else render(); }
    });
  } catch (e) { console.error(e); toast('Impossible de charger le coach (connexion?)'); }
};

/* ---------- rendu principal ---------- */
function render() {
  const t = S.ui.tab;
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#title').textContent = TITLES[t];
  $('#view').innerHTML = VIEWS[t]();
  const ab = $('#activebar');
  if (S.active && !$('#wo').classList.contains('open') && t !== 'home') { ab.innerHTML = `<button data-a="openWorkout"><span class="pulse"></span><b>${esc(S.active.name)}</b><span class="ab-t">${fmtDur(Date.now() - S.active.start)}</span><span>Reprendre ›</span></button>`; ab.className = 'show'; }
  else { ab.innerHTML = ''; ab.className = ''; }
  requestAnimationFrame(() => POST[t] && POST[t]());
}
A.tab = el => { S.ui.tab = el.dataset.tab; save(); closeAllSheets(); render(); window.scrollTo(0, 0); };
A.closeSheet = () => closeSheet();

document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const fn = A[t.dataset.a]; if (fn) { e.preventDefault(); fn(t, e); }
});
document.addEventListener('input', e => { const t = e.target; const fn = t.dataset && I[t.dataset.i]; if (fn) fn(t, e); });
document.addEventListener('change', e => { const t = e.target; const fn = t.dataset && C[t.dataset.i]; if (fn) fn(t, e); });
window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => POST[S.ui.tab] && POST[S.ui.tab](), 200); });
