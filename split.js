/* ===== LOCKIN — split en rotation (ex. Chest/Back → Legs → Arms → Rest) ===== */
const cyc = () => (S.settings.cycle || []).filter(x => x === 'rest' || S.routines.some(r => r.id === x));
const cycName = x => x === 'rest' ? '😴 Rest' : ((S.routines.find(r => r.id === x) || {}).name || '?');

// Où t'es rendu : on rejoue tes séances dans l'ordre. Un « tour » = chaque routine du cycle faite une fois,
// peu importe l'ordre. Si t'inverses Legs pis Arms, l'app te propose celle qui manque.
function cycleState() {
  const C = cyc(), R = C.filter(x => x !== 'rest'); if (!R.length) return null;
  const W = S.workouts.filter(w => R.includes(w.routineId)).slice(-40);
  let round = new Set(), complete = false, last = null;
  W.forEach(w => {
    if (complete || round.has(w.routineId)) { round = new Set(); complete = false; }
    round.add(w.routineId); last = w;
    if (R.every(id => round.has(id))) complete = true;
  });
  if (complete) {
    const lk = dk(last.start), today = dk();
    const rested = Object.keys(S.restDays || {}).some(k => k > lk && k <= today) || daysBetween(last.start, Date.now()) >= 2;
    if (C.includes('rest') && !rested) return { next: 'rest', done: round };
    return { next: mostReady(R), done: new Set() };
  }
  if (!last) return { next: R[0], done: round };
  // prochaine routine pas encore faite dans ce tour, en suivant l'ordre après la dernière faite
  const li = C.indexOf(last.routineId);
  for (let j = 1; j <= C.length; j++) { const x = C[(li + j) % C.length]; if (x !== 'rest' && !round.has(x)) return { next: x, done: round }; }
  return { next: R[0], done: round };
}
// la routine la plus reposée = celle faite il y a le plus longtemps
function mostReady(R) {
  const lastOf = id => { for (let i = S.workouts.length - 1; i >= 0; i--) if (S.workouts[i].routineId === id) return S.workouts[i].start; return 0; };
  return [...R].sort((a, b) => lastOf(a) - lastOf(b))[0];
}
function cycleIdx() { const st = cycleState(); return st ? cyc().indexOf(st.next) : -1; }
function cycleNextWorkout() { const st = cycleState(); if (!st) return null; const C = cyc(), id = st.next === 'rest' ? C.find(x => x !== 'rest') : st.next; return S.routines.find(r => r.id === id); }

// la prochaine séance proposée suit le cycle
const _nextRoutine = nextRoutine;
nextRoutine = function () { return cyc().length ? (cycleNextWorkout() || _nextRoutine()) : _nextRoutine(); };

function splitStripHTML() {
  const C = cyc(); if (!C.length) return `<button class="card tap" data-a="splitOpen" style="width:100%;text-align:left;color:inherit"><b>🔁 Configure ton split</b><div class="muted sm">L’app te dit quel muscle entraîner aujourd’hui</div></button>`;
  const i = cycleIdx(), done = doneToday(), restToday = (S.restDays || {})[dk()];
  const label = done ? `✅ ${esc(done.name)} fait` : restToday ? '😴 Rest aujourd’hui' : C[i] === 'rest' ? '😴 Rest prévu (ou enchaîne si t’es motivé)' : `🏋️ ${esc(cycName(C[i]))}`;
  return `<div class="card"><div class="row between"><b>🔁 Ton split</b><button class="link" data-a="splitOpen">Modifier</button></div>
    <div class="sm mt8">Aujourd’hui : <b class="txt">${label}</b></div>
    <div class="chips mt8">${C.map((x, j) => `<span class="chip ${j === i && !done && !restToday ? 'on' : ''}">${(cycleState() || { done: new Set() }).done.has(x) ? '✓ ' : ''}${esc(cycName(x))}</span>`).join('<span class="muted">›</span>')}</div></div>`;
}
(function hookHomeSplit() { const h = VIEWS.home; VIEWS.home = () => { const html = h(), c = splitStripHTML(), i = html.indexOf('<div class="card streak">'); return i > 0 ? html.slice(0, i) + c + html.slice(i) : html; }; })();

/* ---------- réglage du split + objectif hebdo ---------- */
let SP = null;
A.splitOpen = () => { closeAllSheets(); SP = { c: cyc().slice(), t: S.settings.weeklyTarget || 5, r: restBudget() }; openSheet(spRender, { full: true }); };
function spRender() {
  return `<h2 class="sh-t">🔁 Mon split</h2>
    <p class="muted sm mb">L’ordre de tes séances. L’app te dit laquelle faire ensuite, peu importe le jour.</p>
    <button class="btn block acc" data-a="spPreset">⚡ Chest/Back · Legs · Arms · Rest</button>
    <p class="muted sm mt8">Crée les 3 routines avec des bons exos pis le cycle au complet.</p>
    <h3 class="mt">Ton cycle</h3>
    ${SP.c.length ? SP.c.map((x, j) => `<div class="hrow"><span><b class="muted">${j + 1}.</b> ${esc(cycName(x))}</span><span><button class="icon sm" data-a="spUp" data-n="${j}">↑</button><button class="icon sm" data-a="spDel" data-n="${j}">✕</button></span></div>`).join('') : '<p class="muted sm">Vide — utilise le bouton en haut ou ajoute tes routines ↓</p>'}
    <div class="muted sm mt8">Ajouter :</div>
    <div class="chips mt8">${S.routines.map(r => `<button class="chip" data-a="spAdd" data-id="${r.id}">+ ${esc(r.name)}</button>`).join('')}<button class="chip" data-a="spAdd" data-id="rest">+ 😴 Rest</button></div>
    <h3 class="mt">Ta semaine</h3>
    <label class="fl">Séances visées<div class="seg">${[3, 4, 5, 6, 7].map(v => `<button class="${SP.t === v ? 'on' : ''}" data-a="spT" data-v="${v}">${v}</button>`).join('')}</div></label>
    <label class="fl">Rest days permis<div class="seg">${[0, 1, 2, 3, 4].map(v => `<button class="${SP.r === v ? 'on' : ''}" data-a="spR" data-v="${v}">${v}</button>`).join('')}</div></label>
    <p class="muted sm">Ta streak reste safe tant que tu fais au moins <b>${Math.max(1, 7 - SP.r)}</b> séances (${SP.r} rest${SP.r > 1 ? 's' : ''}). L’objectif de ${SP.t}, c’est ce que tu vises.</p>
    <button class="btn block acc mt" data-a="spSave">Enregistrer</button>`;
}
A.spAdd = el => { SP.c.push(el.dataset.id); paintSheet(); };
A.spDel = el => { SP.c.splice(+el.dataset.n, 1); paintSheet(); };
A.spUp = el => { const j = +el.dataset.n; if (j > 0) { [SP.c[j - 1], SP.c[j]] = [SP.c[j], SP.c[j - 1]]; paintSheet(); } };
A.spT = el => { SP.t = +el.dataset.v; if (SP.r > 7 - SP.t + 1) SP.r = 7 - SP.t; paintSheet(); };
A.spR = el => { SP.r = +el.dataset.v; paintSheet(); };
A.spPreset = () => {
  const mk = (name, list) => { let r = S.routines.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!r) { r = R(name, list); if (typeof applyInjurySwaps === 'function') applyInjurySwaps([r]); S.routines.push(r); } return r.id; };
  const a = mk('Chest/Back', [['bench', 3, '6-10'], ['lat_pulldown', 3, '8-12'], ['db_incline', 3, '8-12'], ['cable_row', 3, '8-12'], ['pec_deck', 2, '10-15'], ['bb_row', 2, '8-10']]);
  const b = mk('Legs', [['squat', 3, '6-10'], ['rdl', 3, '8-10'], ['leg_ext', 3, '10-15'], ['leg_curl', 3, '10-12'], ['calf_raise', 4, '10-15']]);
  const c = mk('Arms', [['ez_curl', 3, '8-12'], ['rope_pushdown', 3, '10-12'], ['hammer', 3, '10-12'], ['oh_ext', 3, '10-12'], ['lat_raise', 3, '12-15']]);
  SP.c = [a, b, c, 'rest']; paintSheet(); toast('Split prêt — tape Enregistrer');
};
A.spSave = () => {
  S.settings.cycle = SP.c.slice(); S.settings.weeklyTarget = SP.t; S.settings.restAllowed = SP.r;
  save(); closeAllSheets(); render(); toast('Split enregistré 🔁');
};
// accès aussi depuis Réglages
(function () { const _s = A.settings; A.settings = () => { _s(); const b = SH[SH.length - 1]; if (!b) return; const r = b.render; b.render = () => r().replace('<h3 class="mt">Raccourcis</h3>', '<button class="li tap" data-a="splitOpen">🔁 Mon split & ma semaine<span class="grow"></span><span class="chev">›</span></button><h3 class="mt">Raccourcis</h3>'); paintSheet(); }; })();
if (S.settings.profileDone) render();
