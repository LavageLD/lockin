/* ===== LOCKIN — Coach perso (règles, 100 % sur le téléphone) ===== */
const DAY = 864e5;
const PUSH_M = ['Pectoraux', 'Triceps'], PULL_M = ['Dos', 'Biceps'];
const isPullEx = id => PULL_M.includes(EX(id).muscle) || /face_pull|rear|reverse_fly/.test(id);
const isPushEx = id => !isPullEx(id) && (PUSH_M.includes(EX(id).muscle) || EX(id).muscle === 'Épaules');
const ISO_M = ['Biceps', 'Triceps', 'Mollets', 'Avant-bras', 'Abdos'];
const isIso = id => { const x = EX(id); return x.type === 'w' && (ISO_M.includes(x.muscle) || /raise|fly|curl|_ext|pushdown|pec_deck|kick|face_pull|shrug|leg_ext|calf/.test(id)) && !/squat|dead|row|press|bench/.test(id); };
const isMain = id => /^(bench|incline_bench|squat|front_squat|deadlift|ohp|bb_row|wpullup|rdl|hip_thrust)$/.test(id);
const prof = () => S.profile || {};
const CO = () => (S.coach = S.coach || { dismiss: {} });

/* ---------- données ---------- */
function recentSets(days) {
  const from = Date.now() - days * DAY, out = [];
  S.workouts.filter(w => w.start >= from).forEach(w => w.ex.forEach(e => working(e.sets).forEach(s => out.push({ exId: e.exId, w: +s.w || 0, r: +s.r || 0, d: w.start }))));
  return out;
}
const median = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
function bwTrend() { // variation % par semaine (moyenne 7 j vs 7 j d'avant)
  const a = avgBW(7); const from = dk(addDays(new Date(), -13)), to = dk(addDays(new Date(), -7));
  const L = S.body.filter(b => b.d >= from && b.d <= to); if (!a || L.length < 2 || S.body.filter(b => b.d > to).length < 3) return null;
  const p = L.reduce((x, b) => x + b.w, 0) / L.length; return (a - p) / p * 100;
}
function avgSteps(n) { const v = []; for (let i = 1; i <= n; i++) { const x = (S.steps || {})[dk(addDays(new Date(), -i))]; if (x) v.push(x); } return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function weeksTrained() { let n = 0; for (let i = 1; i <= 12; i++) { const ws = startOfWeek(addDays(new Date(), -7 * i)); if (weekCount(ws) >= Math.max(2, S.settings.weeklyTarget - 1)) n++; else break; } return n; }
function addToRoutine(test, exId, sets, reps) {
  const r = [...S.routines].sort((a, b) => b.ex.filter(e => test(e.exId)).length - a.ex.filter(e => test(e.exId)).length)[0];
  if (!r) return null; if (!r.ex.some(e => e.exId === exId)) r.ex.push({ exId, sets, reps, rest: null }); return r.name;
}
function applyInjurySwaps(rs) { (prof().injuries || []).forEach(inj => rs.forEach(r => r.ex.forEach(e => { const sw = (typeof SWAPS !== 'undefined' && SWAPS[inj] || {})[e.exId]; if (sw) e.exId = sw; }))); return rs; }
function setCal(d) { const g = S.settings.goals; g.cal += d; g.c = Math.max(50, Math.round((g.cal - g.p * 4 - g.f * 9) / 4)); }

/* ---------- règles ---------- */
function coachRules() {
  const P = prof(), goal = P.goal || (S.settings.goalType === 'cut' ? 'cut' : S.settings.goalType === 'bulk' ? 'bulk' : 'health');
  const T = [], tech = P.tech || [], cardio = P.cardio || 'tapis', dis = P.dislikes || [];
  const s21 = recentSets(21).filter(s => EX(s.exId).type === 'w' && s.w > 0);
  const medR = median(s21.map(s => s.r)), mainR = median(s21.filter(s => isMain(s.exId)).map(s => s.r));
  const lean = ['cut', 'recomp', 'bulk', 'health'].includes(goal);

  // 1. reps vs objectif
  if (lean && s21.length >= 12 && medR != null && medR <= 5) {
    const split = S.settings.weeklyTarget <= 3 ? 'fb' : S.settings.weeklyTarget === 4 ? 'ul' : 'ppl';
    T.push({ id: 'reps-low', p: 90, i: '🎯', t: `Tu fais surtout ${medR} reps par série`, s: `Pour ${goal === 'cut' ? 'garder ton muscle en sèche' : goal === 'bulk' ? 'prendre du muscle' : 'ton objectif'}, 6-12 reps marchent mieux que 3-5. Baisse un peu le poids pis vise 8-12.`,
      acts: [['Mettre 8-12 reps', () => { S.routines.forEach(r => r.ex.forEach(e => { const rg = parseRange(e.reps); if (EX(e.exId).type === 'w' && (!rg || rg[1] <= 6)) e.reps = isMain(e.exId) ? '6-10' : '8-12'; })); return 'Routines ajustées : 6-10 sur les gros lifts, 8-12 sur le reste'; }],
        ...(P.program === 'fivex5' ? [['Changer de split', () => { S.routines = applyInjurySwaps(presetPack(split)); P.program = split; return 'Nouveau split : ' + (PACKS.find(p => p[0] === split) || [, ''])[1]; }]] : [])] });
  }
  if (goal === 'strength' && s21.length >= 12 && mainR != null && mainR >= 10) T.push({ id: 'reps-high', p: 85, i: '🏋️', t: `Gros lifts à ${mainR} reps en moyenne`, s: 'Pour monter tes max, fais 3-6 reps lourdes sur bench, squat pis deadlift. Garde 8-12 pour les accessoires.',
    acts: [['Mettre 3-6 sur les gros lifts', () => { S.routines.forEach(r => r.ex.forEach(e => { if (isMain(e.exId)) e.reps = '3-6'; })); return 'Gros lifts à 3-6 reps'; }]] });

  // 2. deload
  const wt = weeksTrained(), dl = CO().deloadUntil;
  const down = Object.keys(s21.reduce((a, s) => (a[s.exId] = 1, a), {})).filter(id => { const s = suggest(id); return s && s.kind === 'deload'; });
  if ((!dl || dl < Date.now() - 28 * DAY) && P.exp !== 'debutant' && (wt >= 6 || down.length >= 3))
    T.push({ id: 'deload', p: 80, i: '🔋', t: down.length >= 3 ? `${down.length} exos bloqués` : `${wt} semaines solides en ligne`, s: 'Semaine de deload : même exos, −1 série pis −10 % de poids. Ton corps récupère pis ça repart plus fort.',
      acts: [['Deload cette semaine', () => { CO().deloadUntil = Date.now() + 7 * DAY; return 'Deload activé 7 jours — les conseils sont dans tes séances'; }]] });

  // 3. plateau
  const plat = down.filter(id => isMain(id) || EX(id).type === 'w')[0];
  if (plat && down.length < 3) T.push({ id: 'plat-' + plat, p: 60, i: '🧱', t: `${EX(plat).name} stagne`, s: 'Essaie +1 rep avant d’ajouter du poids, ou change de variante 3-4 semaines (ex. haltères au lieu de barre).' });

  // 4. cardio / pas
  const st = avgSteps(7);
  if (['cut', 'recomp'].includes(goal) && st != null && st < 7000 && cardio !== 'aucun') {
    const ex = cardio === 'velo' ? 'bike' : cardio === 'marche' ? null : 'incline_walk';
    T.push({ id: 'cardio', p: 70, i: '🚶', t: `${fmt(st)} pas par jour en moyenne`, s: ex ? `En sèche, 10 min de ${ex === 'bike' ? 'vélo' : 'tapis incliné'} après ta séance aide beaucoup sans brûler ta récup.` : 'Vise 8 000+ pas : une marche de 20 min après souper fait la job.',
      acts: ex ? [['Ajouter à mes séances', () => { S.routines.forEach(r => { if (!r.ex.some(e => EX(e.exId).type === 'c')) r.ex.push({ exId: ex, sets: 1, reps: '10', rest: null }); }); return '10 min de cardio ajoutées à la fin de tes routines'; }]] : [] });
  }

  // 5. poids vs objectif
  const tr = bwTrend();
  if (tr != null) {
    if (goal === 'cut' && tr > -0.2) T.push({ id: 'cut-stall', p: 75, i: '⚖️', t: 'Ton poids bouge pas', s: 'Ta moyenne de 7 jours a pas baissé. Enlève 150 cal ou ajoute 2 000 pas par jour.', acts: [['−150 cal', () => { setCal(-150); return 'Objectif −150 cal'; }]] });
    if (goal === 'cut' && tr < -1.1) T.push({ id: 'cut-fast', p: 75, i: '⚠️', t: `Tu perds vite (${fmt(tr, 1)} %/sem.)`, s: 'Plus vite que 1 %/sem., tu risques de perdre du muscle. Ajoute 150 cal.', acts: [['+150 cal', () => { setCal(150); return 'Objectif +150 cal'; }]] });
    if (goal === 'bulk' && tr < 0.1) T.push({ id: 'bulk-stall', p: 75, i: '⚖️', t: 'Ton poids monte pas', s: 'Pour prendre du muscle, faut que la balance monte un peu. Ajoute 150 cal (une collation).', acts: [['+150 cal', () => { setCal(150); return 'Objectif +150 cal'; }]] });
    if (goal === 'bulk' && tr > 0.6) T.push({ id: 'bulk-fast', p: 70, i: '⚠️', t: `Tu prends vite (+${fmt(tr, 1)} %/sem.)`, s: 'Au-dessus de ~0,5 %/sem., c’est surtout du gras. Enlève 100-150 cal.', acts: [['−150 cal', () => { setCal(-150); return 'Objectif −150 cal'; }]] });
  }

  // 6. protéines
  let pd = 0, pn = 0; for (let i = 1; i <= 7; i++) { const k = dk(addDays(new Date(), -i)); if ((S.log[k] || []).length) { pn++; pd += dayTotals(k).p; } }
  const gp = S.settings.goals.p;
  if (pn >= 3 && pd / pn < gp * 0.85) {
    const veg = (P.diet || []).some(d => /Vég/.test(d));
    const meals = allMeals().filter(m => m.cal > 0 && m.p / m.cal * 100 >= 7 && (!veg || !/poulet|bœuf|boeuf|porc|bacon|thon|saumon|steak|jambon|dinde/i.test(m.name))).sort((a, b) => b.p / b.cal - a.p / a.cal).slice(0, 3);
    T.push({ id: 'prot', p: 65, i: '🥩', t: `Protéines : ${fmt(pd / pn)} g/jour sur ${gp} g`, s: `Il te manque ~${fmt(gp - pd / pn)} g. Idées : ${meals.length ? meals.map(m => `${m.name} (${m.p} g)`).join(', ') : 'un shake, du yogourt grec, du poulet'}.` });
  }

  // 7. équilibre push / pull
  const s14 = recentSets(14), pu = s14.filter(s => isPushEx(s.exId)).length, pl = s14.filter(s => isPullEx(s.exId)).length;
  if (pu >= 12 && pl < pu / 1.5) T.push({ id: 'pushpull', p: 60, i: '⚖️', t: `${pu} séries de poussée vs ${pl} de tirage`, s: `Trop de poussée = épaules qui rentrent pis risque de blessure. Ajoute du tirage (face pulls, rows).`,
    acts: [['Ajouter des face pulls', () => { const n = addToRoutine(isPullEx, 'face_pull', 3, '12-15'); return n ? `Face pulls ajoutés à ${n}` : 'Aucune routine trouvée'; }]] });

  // 8. muscles prioritaires
  const FM = { 'Pectoraux': ['Pectoraux'], 'Dos': ['Dos'], 'Épaules': ['Épaules'], 'Bras': ['Biceps', 'Triceps'], 'Jambes': ['Quadriceps', 'Ischios'], 'Fessiers': ['Fessiers'], 'Abdos': ['Abdos'] };
  const ADD = { 'Pectoraux': 'pec_deck', 'Dos': 'cable_row', 'Épaules': 'lat_raise', 'Bras': 'hammer', 'Jambes': 'leg_ext', 'Fessiers': 'hip_thrust', 'Abdos': 'cable_crunch' };
  if (S.workouts.length >= 4) (P.focus || []).forEach(f => {
    const ms = FM[f] || [], n = s14.filter(s => ms.includes(EX(s.exId).muscle)).length / 2;
    if (n < 10) T.push({ id: 'focus-' + f, p: 55, i: '🎯', t: `${f} : ~${Math.round(n)} séries/sem.`, s: `C’est ta priorité, mais 10-20 séries/semaine c’est ce qui fait grossir un muscle. Ajoute 3 séries.`,
      acts: EXMAP[ADD[f]] ? [[`Ajouter ${EX(ADD[f]).name}`, () => { const n2 = addToRoutine(id => ms.includes(EX(id).muscle), ADD[f], 3, '10-12'); return n2 ? `${EX(ADD[f]).name} ajouté à ${n2}` : 'Aucune routine trouvée'; }]] : [] });
  });

  // 9. horaire trop ambitieux
  const wt2 = S.settings.weeklyTarget, l2 = [1, 2].map(i => weekCount(startOfWeek(addDays(new Date(), -7 * i))));
  if (S.workouts.length >= 6 && wt2 >= 4 && l2.every(c => c <= wt2 - 2))
    T.push({ id: 'sched', p: 70, i: '📅', t: `${l2.join(' pis ')} séances les 2 dernières semaines`, s: `Ton objectif est ${wt2}/sem. Mieux vaut ${wt2 - 1} séances que tu fais vraiment. On ajuste?`,
      acts: [[`Passer à ${wt2 - 1}/sem.`, () => { S.settings.weeklyTarget = wt2 - 1; S.settings.gymDays = defaultGymDays(wt2 - 1); return `Objectif : ${wt2 - 1} séances/semaine`; }]] });

  // 10. sommeil
  if (P.sleep && P.sleep <= 6) T.push({ id: 'sleep', p: 40, i: '😴', t: 'Ton sommeil limite tes gains', s: `~${P.sleep} h c’est court. Même 30 min de plus aide ta récup, ta force pis ta faim.` });

  // 11. techniques selon l'objectif
  if (S.workouts.length >= 3 && !tech.includes('non')) {
    if (goal === 'cut' && !tech.length) T.push({ id: 'tech-cut', p: 30, i: '⚡', t: 'Séances plus efficaces en sèche', s: 'Supersets sur les accessoires (ex. curls + pushdowns) : même volume, moins de temps. T’as les conseils dans tes séances.' });
  }
  const D = CO().dismiss, now = Date.now();
  return T.filter(t => !(D[t.id] > now)).sort((a, b) => b.p - a.p);
}

/* ---------- conseils dans la séance ---------- */
function exTips(ex) {
  const P = prof(), goal = P.goal || 'health', tech = P.tech || [], out = [], on = ex.filter(e => e.on);
  const deload = (CO().deloadUntil || 0) > Date.now();
  if (deload) out.push(['🔋', 'Semaine deload : −1 série pis −10 % de poids partout. Pas d’échec.']);
  const iso = on.filter(e => isIso(e.exId)), last = iso[iso.length - 1];
  if (!deload && last && (goal === 'cut' || goal === 'recomp') && !tech.includes('non')) out.push(['🔥', `${EX(last.exId).name} : dernier set en dropset (−25 % pis continue jusqu’à l’échec).`]);
  if (!deload && last && goal === 'bulk' && !tech.includes('non')) out.push(['💥', `${EX(last.exId).name} : dernier set à l’échec, c’est là que ça pousse.`]);
  if (!deload && goal === 'cut' && iso.length >= 2 && (tech.includes('superset') || !tech.length)) out.push(['⚡', `Superset : ${EX(iso[iso.length - 2].exId).name} + ${EX(last.exId).name}, sans repos entre les deux.`]);
  const m = on.find(e => isMain(e.exId));
  if (m && goal === 'strength') out.push(['🏋️', `${EX(m.exId).name} : fais 2-3 séries de montée avant tes séries lourdes.`]);
  on.forEach(e => { const s = suggest(e.exId); if (s && s.kind === 'deload' && !deload) out.push(['🧱', `${EX(e.exId).name} stagne : vise +1 rep au lieu de + poids aujourd’hui.`]); });
  on.forEach(e => { const r = (e.sets[0] || {}).r, x = EX(e.exId); if (x.type === 'w' && ['cut', 'recomp', 'bulk'].includes(goal) && num(r) && num(r) <= 4 && !isMain(e.exId)) out.push(['🎯', `${x.name} : ${r} reps c’est bas pour ton objectif, vise 8-12.`]); });
  const st = avgSteps(7);
  if ((goal === 'cut' || goal === 'recomp') && st != null && st < 7000 && (P.cardio || 'tapis') !== 'aucun' && !on.some(e => EX(e.exId).type === 'c')) out.push(['🚶', `Finis avec 10 min de ${P.cardio === 'velo' ? 'vélo' : 'tapis incliné'}.`]);
  return out.slice(0, 4);
}
function coachExHTML() {
  if (!QL || !QL.ex.length) return '';
  const L = exTips(QL.ex); if (!L.length) return '';
  return `<div class="card inset mb"><b>🧠 Coach</b>${L.map(([i, t]) => `<div class="ins" style="margin-top:8px"><span class="ins-i">${i}</span><div class="sm">${esc(t)}</div></div>`).join('')}</div>`;
}
const _qlRender2 = qlRender;
qlRender = function () { const h = _qlRender2(), c = coachExHTML(), i = h.indexOf('<div class="qlex'); return c && i > 0 ? h.slice(0, i) + c + h.slice(i) : h; };

/* ---------- carte sur l'accueil + liste ---------- */
let CT = [];
function tipHTML(t, n) {
  return `<div class="ins" style="margin-top:10px"><span class="ins-i">${t.i}</span><div class="grow"><b>${esc(t.t)}</b><div class="muted sm">${esc(t.s)}</div>
    <div class="row gap mt8" style="flex-wrap:wrap">${(t.acts || []).map((a, j) => `<button class="btn sm acc" data-a="coApply" data-n="${n}" data-j="${j}">${esc(a[0])}</button>`).join('')}<button class="btn sm ghost" data-a="coSkip" data-n="${n}">Ignorer</button></div></div></div>`;
}
function coachCardHTML() {
  if (!S.settings.profileDone) return '';
  CT = coachRules(); if (!CT.length) return '';
  return `<div class="card"><h3>🧠 Coach ${CT.length > 2 ? `<button class="link" data-a="coAll" style="float:right">Tout voir (${CT.length})</button>` : ''}</h3>${CT.slice(0, 2).map(tipHTML).join('')}</div>`;
}
A.coAll = () => openSheet(() => { CT = coachRules(); return `<h2 class="sh-t">🧠 Ton coach</h2><p class="muted sm">Basé sur ton profil pis ce que tu loggues. Juste des suggestions.</p>${CT.length ? CT.map(tipHTML).join('') : '<p class="muted mt">Rien à signaler, continue de même 🔒</p>'}<button class="btn block ghost mt" data-a="redoQuiz">🎯 Modifier mon profil</button>`; });
A.coApply = el => { const t = CT[+el.dataset.n]; if (!t) return; const msg = t.acts[+el.dataset.j][1](); CO().dismiss[t.id] = Date.now() + 30 * DAY; save(); render(); paintSheet(); toast(msg || 'Appliqué ✓', 2600); };
A.coSkip = el => { const t = CT[+el.dataset.n]; if (!t) return; CO().dismiss[t.id] = Date.now() + 21 * DAY; save(); render(); paintSheet(); };
(function hookHomeCoach() { const h = VIEWS.home; VIEWS.home = () => { const html = h(), c = coachCardHTML(); if (!c) return html; const i = html.indexOf('<div class="card"><h3>Constance'); return i > 0 ? html.slice(0, i) + c + html.slice(i) : html + c; }; })();

/* ---------- questions en plus dans le questionnaire ---------- */
(function addSteps() {
  const at = STEPS.findIndex(s => s.plan);
  STEPS.splice(at, 0,
    { t: 'Ton cardio', s: 'Le coach va te proposer ce que t’aimes, pas autre chose.', ok: () => !!Q.cardio,
      r: () => opt('cardio', 'tapis', 'Tapis roulant / marche inclinée', '', '🏃') + opt('cardio', 'velo', 'Vélo / elliptique', '', '🚴') + opt('cardio', 'marche', 'Marcher dehors', 'Des pas, pas de machine', '🚶') + opt('cardio', 'aucun', 'Pas de cardio', 'Le coach t’en proposera pas', '🚫') },
    { t: 'Techniques d’intensité', s: 'Dropsets, supersets... Le coach en suggère seulement si c’est pertinent pour ton objectif.', ok: () => true,
      r: () => `<div class="chips">${[['dropset', 'Dropsets OK'], ['superset', 'Supersets OK'], ['non', 'Garde ça simple']].map(([v, l]) => tog('tech', v, l)).join('')}</div><p class="muted sm mt8">Rien de choisi = le coach décide selon ton objectif.</p>` });
  const _init = initQ; initQ = function (n) { _init(n); const P = S.profile || {}; Q.cardio = P.cardio || ''; Q.tech = [...(P.tech || [])]; };
  const _fin = A.qFinish; A.qFinish = () => { const cardio = Q.cardio, tech = Q.tech; _fin(); S.profile.cardio = cardio; S.profile.tech = tech; save(); render(); };
})();
if (S.settings.profileDone) render();
// évite les doublons avec la vieille carte « En bref »
(function () { const _ins = insights; insights = function () { return _ins().filter(x => !/^(Plateau|Dors plus|Priorité|Protéines :)/.test(x.t)); }; })();
