'use strict';
/* ===== LOCKIN — Progrès, Nutrition, Corps, Réglages ===== */

/* ---------- PROGRÈS ---------- */
const METRICS = { e1rm: 'Force (1RM est.)', maxW: 'Poids max', vol: 'Volume', maxR: 'Reps max' };
VIEWS.progress = () => {
  const cnt = {}; S.workouts.forEach(w => w.ex.forEach(e => cnt[e.exId] = (cnt[e.exId] || 0) + 1));
  const used = Object.keys(cnt).filter(id => EX(id).type !== 'c').sort((a, b) => cnt[b] - cnt[a]);
  if (!used.includes(S.ui.progEx)) S.ui.progEx = used[0] || null;
  const totVol = S.workouts.reduce((a, w) => a + (w.vol || 0), 0);
  const totTime = S.workouts.reduce((a, w) => a + ((w.end || w.start) - w.start), 0);
  const totPR = S.workouts.reduce((a, w) => a + (w.prs?.length || 0), 0);
  const id = S.ui.progEx, ex = id ? EX(id) : null;
  let exBlock = `<p class="muted">Fais quelques séances pour voir tes courbes de progression.</p>`;
  if (id) {
    const h = exSessions(id); const st = h.map(x => sessStats(x.sets));
    const m = ex.type === 'w' ? S.ui.progMetric : (S.ui.progMetric === 'e1rm' || S.ui.progMetric === 'maxW' ? 'maxR' : S.ui.progMetric);
    const best = Math.max(...st.map(s => s[m])), last = st[0]?.[m], first = st[st.length - 1]?.[m];
    const recs = ex.type === 'w' ? [1, 3, 5, 8, 10, 12].map(r => { let bw = 0, dt = null; h.forEach(x => working(x.sets).forEach(s => { if (s.r >= r && s.w > bw) { bw = s.w; dt = x.date; } })); return { r, bw, dt }; }) : [];
    exBlock = `<select data-i="progEx">${used.map(x => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(EX(x).name)} (${cnt[x]})</option>`).join('')}</select>
      <div class="chips mt8">${Object.entries(METRICS).filter(([k]) => ex.type === 'w' || k === 'maxR' || k === 'vol').map(([k, l]) => `<button class="chip ${m === k ? 'on' : ''}" data-a="progMetric" data-k="${k}">${l}</button>`).join('')}</div>
      <canvas id="cvProg" class="chart mt8"></canvas>
      <div class="grid3 mt8">${statBox('Meilleur', fmt(best, m === 'maxR' ? 0 : 1))}${statBox('Dernier', fmt(last, m === 'maxR' ? 0 : 1))}${statBox('Évolution', first ? (last - first >= 0 ? '+' : '') + fmt((last - first) / first * 100, 1) + ' %' : '–')}</div>
      ${recs.length ? `<h3 class="mt">Records par reps</h3><div class="recs">${recs.map(x => `<div><small>${x.r} rep${x.r > 1 ? 's' : ''}</small><b>${x.bw ? fmt(x.bw, 1) : '–'}</b><span class="muted">${x.dt ? shortDate(x.dt) : ''}</span></div>`).join('')}</div>` : ''}
      <button class="btn block ghost mt8" data-a="exInfo" data-ex="${id}">Historique complet</button>`;
  }
  // séries par muscle (7 jours)
  const since = Date.now() - 7 * 864e5, ms = {};
  S.workouts.filter(w => w.start >= since).forEach(w => w.ex.forEach(e => { const mu = EX(e.exId).muscle; if (mu !== 'Cardio') ms[mu] = (ms[mu] || 0) + working(e.sets).length; }));
  const mx = Math.max(20, ...Object.values(ms));
  const muscleRows = Object.keys(MUSCLES).filter(m => m !== 'Cardio').map(m => { const v = ms[m] || 0; return `<div class="msrow"><span>${m}</span><div class="mstrack"><div class="msband" style="left:${10 / mx * 100}%;width:${10 / mx * 100}%"></div><div class="msfill" style="width:${v / mx * 100}%;background:${MUSCLES[m]}"></div></div><b>${v}</b></div>`; }).join('');
  return `
  <div class="grid2">${statBox('Séances', fmt(S.workouts.length))}${statBox('Records', fmt(totPR))}${statBox('Volume total', totVol >= 1e6 ? fmt(totVol / 1e6, 2) + ' M' : fmt(totVol) + ' ' + u())}${statBox('Temps total', fmt(totTime / 36e5, 1) + ' h')}</div>
  <div class="card mt8"><h3>Progression par exercice</h3>${exBlock}</div>
  <div class="card"><h3>Séances par semaine <span class="pill">obj. ${S.settings.weeklyTarget}</span></h3><canvas id="cvWeeks" class="chart sm"></canvas></div>
  <div class="card"><h3>Volume par semaine</h3><canvas id="cvVol" class="chart sm"></canvas></div>
  <div class="card"><h3>Séries par muscle · 7 jours</h3>${muscleRows}<div class="muted sm mt8">Zone grise = 10 à 20 séries/semaine, la cible typique pour l’hypertrophie.</div></div>
  <div class="card"><h3>Constance · 6 mois</h3>${heatmapHTML()}</div>
  <div class="card"><h3>Habitudes</h3>${habitsHTML()}</div>`;
};
POST.progress = () => {
  const id = S.ui.progEx;
  if (id) {
    const ex = EX(id); let m = S.ui.progMetric; if (ex.type !== 'w' && (m === 'e1rm' || m === 'maxW')) m = 'maxR';
    const pts = exSessions(id).slice().reverse().map(x => ({ x: x.date, y: Math.round(sessStats(x.sets)[m] * 10) / 10 }));
    lineChart($('#cvProg'), pts);
  }
  const ws = startOfWeek(new Date()), wk = [], vl = [];
  for (let i = 11; i >= 0; i--) { const w = addDays(ws, -7 * i), a = w.getTime(), b = addDays(w, 7).getTime(); const L = S.workouts.filter(x => x.start >= a && x.start < b); wk.push({ l: shortDate(w).replace('.', ''), v: L.length }); vl.push({ l: shortDate(w).replace('.', ''), v: L.reduce((s, x) => s + (x.vol || 0), 0) }); }
  wk.forEach(x => x.l = x.l.split(' ')[0]); vl.forEach(x => x.l = x.l.split(' ')[0]);
  barChart($('#cvWeeks'), wk, { goal: S.settings.weeklyTarget });
  barChart($('#cvVol'), vl.map(x => ({ ...x, c: hexA('#4DA3FF', .8) })));
};
I.progEx = el => { S.ui.progEx = el.value; save(); render(); };
A.progMetric = el => { S.ui.progMetric = el.dataset.k; save(); render(); };
function heatmapHTML() {
  const dm = dayMap(); const end = new Date(); const start = addDays(startOfWeek(end), -25 * 7);
  let cells = '', n = 0, d = new Date(start);
  while (d <= end) { const k = dk(d), x = dm[k]; if (x) n++; cells += `<i class="h${x ? Math.min(3, x.n + (x.vol > 15000 ? 1 : 0)) : 0}" title="${k}"></i>`; d = addDays(d, 1); }
  return `<div class="heat">${cells}</div><div class="muted sm mt8">${n} jours d’entraînement sur 26 semaines · constance ${consistency(26)} %</div>`;
}
function habitsHTML() {
  if (!S.workouts.length) return '<p class="muted">Pas encore de données.</p>';
  const dows = [0, 0, 0, 0, 0, 0, 0], hrs = [0, 0, 0, 0]; let dur = 0;
  S.workouts.forEach(w => { const d = new Date(w.start); dows[(d.getDay() + 6) % 7]++; const h = d.getHours(); hrs[h < 11 ? 0 : h < 14 ? 1 : h < 18 ? 2 : 3]++; dur += (w.end || w.start) - w.start; });
  const names = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], hn = ['le matin', 'le midi', "l'après-midi", 'le soir'];
  const md = Math.max(...dows);
  return `<div class="dowbars">${dows.map((v, i) => `<div><div class="dwb"><div style="height:${md ? v / md * 100 : 0}%"></div></div><small>${DOW[i]}</small></div>`).join('')}</div>
    <div class="muted sm mt8">Jour préféré : <b class="txt">${names[dows.indexOf(md)]}</b> · surtout <b class="txt">${hn[hrs.indexOf(Math.max(...hrs))]}</b> · durée moyenne <b class="txt">${fmtDurShort(dur / S.workouts.length)}</b></div>`;
}

/* ---------- NUTRITION ---------- */
const MEALS = ['Déjeuner', 'Dîner', 'Souper', 'Collations'];
const allFoods = () => [...S.foods, ...FOODS_RAW.map(([id, name, serv, cal, p, c, f]) => ({ id, name, serv, cal, p, c, f }))];
VIEWS.nutrition = () => {
  const k = S.ui.nutDate || dk(), T = dayTotals(k), g = S.settings.goals, L = S.log[k] || [], left = g.cal - T.cal, wml = S.water[k] || 0;
  const label = k === dk() ? "Aujourd'hui" : k === dk(addDays(new Date(), -1)) ? 'Hier' : cap(dateLong(parseDk(k)));
  return `
  <div class="datenav"><button class="icon" data-a="nutDay" data-d="-1">‹</button><label class="datepick"><b>${label} 📅</b><input type="date" data-i="nutPick" value="${k}" max="${dk()}"></label><button class="icon" data-a="nutDay" data-d="1" ${k >= dk() ? 'disabled' : ''}>›</button></div>
  ${k !== dk() ? `<div class="pastbar">✏️ Tu modifies une journée passée <button class="link" data-a="nutToday">Revenir à aujourd’hui</button></div>` : ''}
  <div class="card nutsum">
    <div class="ringwrap">${ring(T.cal / g.cal, 132, 12)}<div class="ringtxt"><b>${fmt(Math.abs(left))}</b><span>${left >= 0 ? 'cal restantes' : 'cal de trop'}</span></div></div>
    <div class="macros">${bar('Protéines', T.p, g.p, '#FF6B57')}${bar('Glucides', T.c, g.c, '#4DA3FF')}${bar('Lipides', T.f, g.f, '#FFB020')}<div class="muted sm">${fmt(T.cal)} / ${fmt(g.cal)} cal</div></div>
  </div>
  ${MEALS.map(m => { const it = L.filter(x => x.meal === m), mc = it.reduce((a, x) => a + x.cal * x.q, 0); return `<div class="card meal"><h3>${m} <span class="muted">${fmt(mc)} cal</span></h3>
    ${it.map(x => `<button class="li tap fi" data-a="editFood" data-id="${x.id}"><div class="grow"><b>${esc(x.name)}</b><div class="muted sm">${x.q !== 1 ? fmt(x.q, 2) + ' × ' : ''}${esc(x.serv || 'portion')} · P ${fmt(x.p * x.q)} G ${fmt(x.c * x.q)} L ${fmt(x.f * x.q)}</div></div><b>${fmt(x.cal * x.q)}</b></button>`).join('')}
    <button class="btn sm ghost block" data-a="addFood" data-m="${m}">+ Ajouter</button></div>`; }).join('')}
  <div class="card"><h3>Suppléments <button class="link" data-a="suppManage">Gérer</button></h3>${suppHTML(k)}</div>
  <div class="card"><h3>Eau <span class="muted">${fmt(wml / 1000, 2)} / ${fmt(g.water / 1000, 1)} L</span></h3>
    <div class="water">${Array.from({ length: 8 }, (_, i) => `<span class="${wml >= (i + 1) * g.water / 8 ? 'on' : ''}">💧</span>`).join('')}</div>
    <div class="row gap mt8"><button class="btn sm ghost" data-a="water" data-v="-250">−250</button><button class="btn sm ghost grow" data-a="water" data-v="250">+250 ml</button><button class="btn sm ghost grow" data-a="water" data-v="500">+500 ml</button></div></div>
  <div class="grid2"><button class="btn ghost" data-a="copyDay">📋 Copier la veille</button><button class="btn ghost" data-a="goals">🎯 Objectifs</button></div>
  <div class="card mt8"><h3>7 derniers jours</h3><canvas id="cvNut" class="chart sm"></canvas>${weekNutStats(k)}</div>`;
};
function weekNutStats(k) {
  let c = 0, p = 0, n = 0; for (let i = 0; i < 7; i++) { const d = dk(addDays(parseDk(k), -i)); if ((S.log[d] || []).length) { const T = dayTotals(d); c += T.cal; p += T.p; n++; } }
  return n ? `<div class="grid2 mt8">${statBox('Moy. calories', fmt(c / n))}${statBox('Moy. protéines', fmt(p / n) + ' g')}</div>` : '';
}
POST.nutrition = () => {
  const k = S.ui.nutDate || dk(), it = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(parseDk(k), -i), T = dayTotals(dk(d)); it.push({ l: DOW[(d.getDay() + 6) % 7], v: Math.round(T.cal), c: T.cal > S.settings.goals.cal * 1.08 ? '#FF453A' : T.cal ? ACC : 'rgba(255,255,255,.1)' }); }
  barChart($('#cvNut'), it, { goal: S.settings.goals.cal });
};
A.nutDay = el => { const k = S.ui.nutDate || dk(); const n = dk(addDays(parseDk(k), +el.dataset.d)); if (n > dk()) return; S.ui.nutDate = n === dk() ? null : n; render(); };
C.nutPick = el => { const v = el.value; if (!v) return; S.ui.nutDate = v >= dk() ? null : v; render(); };
A.nutToday = () => { S.ui.nutDate = null; render(); };
A.water = el => { const k = S.ui.nutDate || dk(); S.water[k] = Math.max(0, (S.water[k] || 0) + (+el.dataset.v)); save(); render(); };
A.copyDay = () => { const k = S.ui.nutDate || dk(), y = dk(addDays(parseDk(k), -1)), L = S.log[y] || []; if (!L.length) return toast('Rien de loggé la veille'); S.log[k] = [...(S.log[k] || []), ...L.map(x => ({ ...x, id: uid() }))]; save(); render(); toast(`${L.length} aliments copiés`); };

let FA = null;
A.addFood = el => { FA = { meal: el.dataset.m, tab: 'search', q: '', sel: null, qty: 1, quick: { name: '', cal: '', p: '', c: '', f: '' }, nf: { name: '', serv: '', cal: '', p: '', c: '', f: '' } }; openSheet(foodSheet, { full: true }); };
function recents() { const seen = new Set(), out = []; Object.keys(S.log).sort().reverse().forEach(k => S.log[k].slice().reverse().forEach(x => { if (!seen.has(x.name) && out.length < 12) { seen.add(x.name); out.push({ id: x.foodId || 'r_' + x.id, name: x.name, serv: x.serv, cal: x.cal, p: x.p, c: x.c, f: x.f }); } })); return out; }
function foodSheet() {
  if (FA.sel) {
    const f = FA.sel, q = num(FA.qty) || 0;
    return `<button class="link" data-a="faBack">‹ Retour</button><h2 class="sh-t">${esc(f.name)}</h2><div class="muted mb">1 portion = ${esc(f.serv || 'portion')}</div>
      <div class="stepper"><button class="icon" data-a="faQty" data-d="-0.25">−</button><input inputmode="decimal" data-i="faQtyIn" value="${esc(FA.qty)}"><button class="icon" data-a="faQty" data-d="0.25">+</button></div>
      <div class="muted sm center">portion(s)</div>
      <div class="grid2 mt" id="faTot">${faTot()}</div>
      <button class="btn block acc mt" data-a="faAdd">Ajouter au ${FA.meal.toLowerCase()}</button>`;
  }
  const tabs = `<div class="seg"><button class="${FA.tab === 'search' ? 'on' : ''}" data-a="faTab" data-t="search">Aliments</button><button class="${FA.tab === 'quick' ? 'on' : ''}" data-a="faTab" data-t="quick">Rapide</button><button class="${FA.tab === 'new' ? 'on' : ''}" data-a="faTab" data-t="new">Créer</button></div>`;
  if (FA.tab === 'search') return `<h2 class="sh-t">${FA.meal}</h2>${tabs}<input type="search" data-i="faQ" placeholder="Rechercher un aliment..." value="${esc(FA.q)}" class="mt8"><div id="faList" class="mt8">${faList()}</div>`;
  if (FA.tab === 'quick') { const x = FA.quick; return `<h2 class="sh-t">${FA.meal}</h2>${tabs}<p class="muted sm mt8">Entre juste les chiffres (ex. resto, étiquette).</p>
      <label class="fl">Nom (optionnel)<input data-i="faQuick" data-k="name" value="${esc(x.name)}" placeholder="Ajout rapide"></label>
      <div class="grid2"><label class="fl">Calories<input inputmode="decimal" data-i="faQuick" data-k="cal" value="${esc(x.cal)}"></label><label class="fl">Protéines (g)<input inputmode="decimal" data-i="faQuick" data-k="p" value="${esc(x.p)}"></label><label class="fl">Glucides (g)<input inputmode="decimal" data-i="faQuick" data-k="c" value="${esc(x.c)}"></label><label class="fl">Lipides (g)<input inputmode="decimal" data-i="faQuick" data-k="f" value="${esc(x.f)}"></label></div>
      <button class="btn block acc mt" data-a="faQuickAdd">Ajouter</button>`; }
  const x = FA.nf; return `<h2 class="sh-t">Nouvel aliment</h2>${tabs}
      <label class="fl mt8">Nom<input data-i="faNew" data-k="name" value="${esc(x.name)}" placeholder="ex. Wrap maison"></label>
      <label class="fl">Portion<input data-i="faNew" data-k="serv" value="${esc(x.serv)}" placeholder="ex. 1 wrap, 100 g"></label>
      <div class="grid2"><label class="fl">Calories<input inputmode="decimal" data-i="faNew" data-k="cal" value="${esc(x.cal)}"></label><label class="fl">Protéines (g)<input inputmode="decimal" data-i="faNew" data-k="p" value="${esc(x.p)}"></label><label class="fl">Glucides (g)<input inputmode="decimal" data-i="faNew" data-k="c" value="${esc(x.c)}"></label><label class="fl">Lipides (g)<input inputmode="decimal" data-i="faNew" data-k="f" value="${esc(x.f)}"></label></div>
      <button class="btn block acc mt" data-a="faNewSave">Créer et ajouter</button>`;
}
function faList() {
  const q = norm(FA.q.trim());
  const row = f => `<button class="li tap" data-a="faPick" data-id="${esc(f.id)}"><div class="grow"><b>${esc(f.name)}</b><div class="muted sm">${esc(f.serv || '')} · P ${fmt(f.p)} G ${fmt(f.c)} L ${fmt(f.f)}</div></div><b>${fmt(f.cal)}</b></button>`;
  if (!q) { const r = recents(); return (r.length ? `<div class="month-h">Récents</div>${r.map(row).join('')}` : '') + `<div class="month-h">${S.foods.length ? 'Mes aliments + base' : 'Base d’aliments'}</div>${allFoods().map(row).join('')}`; }
  const L = [...recents(), ...allFoods()].filter((f, i, a) => norm(f.name).includes(q) && a.findIndex(x => x.name === f.name) === i);
  return L.map(row).join('') || `<p class="muted">Rien trouvé. Utilise <b>Rapide</b> ou <b>Créer</b>.</p>`;
}
function faTot() { const f = FA.sel, q = num(FA.qty) || 0; return `${statBox('Calories', fmt(f.cal * q))}${statBox('Protéines', fmt(f.p * q, 1) + ' g')}${statBox('Glucides', fmt(f.c * q, 1) + ' g')}${statBox('Lipides', fmt(f.f * q, 1) + ' g')}`; }
A.faTab = el => { FA.tab = el.dataset.t; paintSheet(); };
I.faQ = el => { FA.q = el.value; $('#faList').innerHTML = faList(); };
A.faPick = el => { const id = el.dataset.id; FA.sel = [...recents(), ...allFoods()].find(f => f.id === id); FA.qty = 1; paintSheet(); };
A.faBack = () => { FA.sel = null; paintSheet(); };
A.faQty = el => { FA.qty = Math.max(0.25, Math.round(((num(FA.qty) || 0) + (+el.dataset.d)) * 100) / 100); paintSheet(); };
I.faQtyIn = el => { FA.qty = el.value; $('#faTot').innerHTML = faTot(); };
function logFood(f, q) { const k = S.ui.nutDate || dk(); (S.log[k] = S.log[k] || []).push({ id: uid(), foodId: f.id, name: f.name, serv: f.serv, cal: +f.cal || 0, p: +f.p || 0, c: +f.c || 0, f: +f.f || 0, q, meal: FA.meal }); save(); }
A.faAdd = () => { const q = num(FA.qty); if (!q) return toast('Quantité invalide'); logFood(FA.sel, q); closeSheet(); render(); toast('Ajouté ✅'); };
I.faQuick = el => FA.quick[el.dataset.k] = el.value;
A.faQuickAdd = () => { const x = FA.quick; if (!num(x.cal) && !num(x.p)) return toast('Entre au moins les calories'); logFood({ id: null, name: x.name || 'Ajout rapide', serv: 'portion', cal: num(x.cal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0 }, 1); closeSheet(); render(); toast('Ajouté ✅'); };
I.faNew = el => FA.nf[el.dataset.k] = el.value;
A.faNewSave = () => { const x = FA.nf; if (!x.name.trim()) return toast('Donne-lui un nom'); const f = { id: 'cf_' + uid(), name: x.name.trim(), serv: x.serv || 'portion', cal: num(x.cal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0 }; S.foods.unshift(f); logFood(f, 1); closeSheet(); render(); toast('Aliment créé et ajouté'); };
let EF = null;
A.editFood = el => {
  const k = S.ui.nutDate || dk(); EF = (S.log[k] || []).find(x => x.id === el.dataset.id); if (!EF) return;
  openSheet(() => `<h2 class="sh-t">${esc(EF.name)}</h2><div class="muted mb">${esc(EF.serv || 'portion')} · ${fmt(EF.cal)} cal/portion</div>
    <label class="fl">Portions<input inputmode="decimal" data-i="efQ" value="${EF.q}"></label>
    <label class="fl">Repas<select data-i="efMeal">${MEALS.map(m => `<option ${m === EF.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <button class="btn block acc mt" data-a="efSave">OK</button><button class="btn block danger-ghost mt8" data-a="efDel">Supprimer</button>`);
};
I.efQ = el => { const q = num(el.value); if (q) EF.q = q; };
C.efMeal = el => EF.meal = el.value;
A.efSave = () => { save(); closeSheet(); render(); };
A.efDel = () => { const k = S.ui.nutDate || dk(); S.log[k] = S.log[k].filter(x => x !== EF); save(); closeSheet(); render(); };

/* objectifs + calcul TDEE */
let GO = null;
A.goals = () => {
  const s = S.settings; GO = { ...s.goals, weight: latestBW()?.w || '', height: s.height || '', age: s.age || '', sex: s.sex, activity: s.activity, goalType: s.goalType };
  openSheet(() => {
    const tdee = calcTDEE();
    return `<h2 class="sh-t">Objectifs nutrition</h2>
    <div class="card inset"><h3>Calculateur automatique</h3>
      <div class="grid2"><label class="fl">Poids (${u()})<input inputmode="decimal" data-i="go" data-k="weight" value="${esc(GO.weight)}"></label><label class="fl">Taille (cm)<input inputmode="numeric" data-i="go" data-k="height" value="${esc(GO.height)}"></label><label class="fl">Âge<input inputmode="numeric" data-i="go" data-k="age" value="${esc(GO.age)}"></label><label class="fl">Sexe<select data-i="go" data-k="sex"><option value="h" ${GO.sex === 'h' ? 'selected' : ''}>Homme</option><option value="f" ${GO.sex === 'f' ? 'selected' : ''}>Femme</option></select></label></div>
      <label class="fl">Activité<select data-i="go" data-k="activity">${[[1.2, 'Sédentaire'], [1.375, 'Léger (1-3 j/sem)'], [1.55, 'Modéré (3-5 j/sem)'], [1.725, 'Élevé (6-7 j/sem)'], [1.9, 'Très élevé (job physique)']].map(([v, l]) => `<option value="${v}" ${+GO.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="fl">Objectif<select data-i="go" data-k="goalType"><option value="cut" ${GO.goalType === 'cut' ? 'selected' : ''}>Sèche (perte de gras)</option><option value="maintain" ${GO.goalType === 'maintain' ? 'selected' : ''}>Maintien / recompo</option><option value="bulk" ${GO.goalType === 'bulk' ? 'selected' : ''}>Prise de masse</option></select></label>
      <div id="tdeeOut">${tdee ? `<p class="sm">Maintien estimé : <b>${fmt(tdee.tdee)} cal</b> → objectif <b>${fmt(tdee.cal)} cal</b>, ${tdee.p} g prot, ${tdee.c} g gluc, ${tdee.f} g lip</p><button class="btn block mt8" data-a="goApply">Appliquer</button>` : '<p class="muted sm">Remplis poids, taille et âge.</p>'}</div>
    </div>
    <h3 class="mt">Manuel</h3>
    <div class="grid2"><label class="fl">Calories<input inputmode="numeric" data-i="go" data-k="cal" value="${GO.cal}"></label><label class="fl">Protéines (g)<input inputmode="numeric" data-i="go" data-k="p" value="${GO.p}"></label><label class="fl">Glucides (g)<input inputmode="numeric" data-i="go" data-k="c" value="${GO.c}"></label><label class="fl">Lipides (g)<input inputmode="numeric" data-i="go" data-k="f" value="${GO.f}"></label><label class="fl">Eau (ml)<input inputmode="numeric" data-i="go" data-k="water" value="${GO.water}"></label></div>
    <button class="btn block acc mt" data-a="goSave">Enregistrer</button>`;
  }, { full: true });
};
function calcTDEE() {
  const w = num(GO.weight), h = num(GO.height), a = num(GO.age); if (!w || !h || !a) return null;
  const kg = u() === 'kg' ? w : w * 0.45359237;
  const bmr = 10 * kg + 6.25 * h - 5 * a + (GO.sex === 'h' ? 5 : -161), tdee = bmr * (+GO.activity || 1.55);
  const cal = Math.round((GO.goalType === 'cut' ? tdee - 500 : GO.goalType === 'bulk' ? tdee + 300 : tdee) / 10) * 10;
  const p = Math.round(kg * (GO.goalType === 'cut' ? 2.2 : 2.0)), f = Math.round(cal * .25 / 9), c = Math.max(0, Math.round((cal - p * 4 - f * 9) / 4));
  return { tdee: Math.round(tdee), cal, p, c, f };
}
I.go = el => { GO[el.dataset.k] = el.value; if (['weight', 'height', 'age', 'sex', 'activity', 'goalType'].includes(el.dataset.k)) { const t = calcTDEE(); const o = $('#tdeeOut'); if (o) o.innerHTML = t ? `<p class="sm">Maintien estimé : <b>${fmt(t.tdee)} cal</b> → objectif <b>${fmt(t.cal)} cal</b>, ${t.p} g prot, ${t.c} g gluc, ${t.f} g lip</p><button class="btn block mt8" data-a="goApply">Appliquer</button>` : '<p class="muted sm">Remplis poids, taille et âge.</p>'; } };
C.go = I.go;
A.goApply = () => { const t = calcTDEE(); if (!t) return; Object.assign(GO, { cal: t.cal, p: t.p, c: t.c, f: t.f }); paintSheet(); toast('Calculé — vérifie pis enregistre'); };
A.goSave = () => {
  const s = S.settings; ['cal', 'p', 'c', 'f', 'water'].forEach(k => s.goals[k] = num(GO[k]) || s.goals[k]);
  s.height = num(GO.height); s.age = num(GO.age); s.sex = GO.sex; s.activity = +GO.activity; s.goalType = GO.goalType;
  save(); closeSheet(); render(); toast('Objectifs enregistrés');
};

/* ---------- CORPS ---------- */
const MEAS = { waist: 'Taille', chest: 'Poitrine', arm: 'Bras', thigh: 'Cuisse', hips: 'Hanches', neck: 'Cou', calf: 'Mollet', shoulders: 'Épaules', bf: '% gras' };
const mu = () => S.settings.measUnit || 'cm';
VIEWS.body = () => {
  const b = latestBW(), s = S.settings, d7 = bwAt(7), d30 = bwAt(30), a7 = avgBW(7);
  const gw = s.goalWeight; const first = S.body[0];
  let gp = null; if (gw && b && first && first.w !== gw) gp = Math.max(0, Math.min(1, (first.w - b.w) / (first.w - gw)));
  const lm = S.meas[S.meas.length - 1], fm = S.meas[0];
  const bmi = b && s.height ? (u() === 'kg' ? b.w : b.w * 0.45359237) / Math.pow(s.height / 100, 2) : null;
  const delta = (x) => x && b && x !== b ? `${b.w - x.w >= 0 ? '+' : ''}${fmt(b.w - x.w, 1)}` : '–';
  return `
  <div class="card bwhero">
    <div class="row between"><div><div class="muted sm">Poids actuel</div><div class="huge">${b ? fmt(b.w, 1) : '–'}<small> ${u()}</small></div><div class="muted sm">${b ? (b.d === dk() ? "pesé aujourd'hui" : 'le ' + shortDate(parseDk(b.d))) : 'Aucune pesée'}</div></div>
    <div class="right">${statMini('7 j', delta(d7))}${statMini('30 j', delta(d30))}${statMini('Moy. 7 j', a7 ? fmt(a7, 1) : '–')}</div></div>
    <div class="logrow mt"><input inputmode="decimal" id="bwIn" placeholder="Poids du jour (${u()})"><button class="btn acc" data-a="logBW">Enregistrer</button></div>
    ${gw ? `<div class="mt"><div class="row between sm"><span class="muted">Objectif ${fmt(gw, 1)} ${u()}</span><span>${b ? fmt(Math.abs(b.w - gw), 1) + ' ' + u() + ' restant' : ''}</span></div><div class="track mt8"><div class="fill" style="width:${(gp || 0) * 100}%"></div></div></div>` : `<button class="link mt8" data-a="setGoalW">+ Définir un poids objectif</button>`}
  </div>
  <div class="card"><h3>Évolution du poids</h3>
    <div class="chips">${[[30, '30 j'], [90, '3 mois'], [365, '1 an'], [0, 'Tout']].map(([v, l]) => `<button class="chip ${S.ui.bwRange === v ? 'on' : ''}" data-a="bwRange" data-v="${v}">${l}</button>`).join('')}</div>
    <canvas id="cvBW" class="chart mt8"></canvas><div class="muted sm">Ligne pleine = moyenne mobile 7 jours (plus fiable que la pesée du jour)</div>
    ${bmi ? `<div class="muted sm mt8">IMC : <b class="txt">${fmt(bmi, 1)}</b></div>` : ''}
    <details class="mt8"><summary class="muted sm">Toutes les pesées (${S.body.length})</summary>${S.body.slice().reverse().slice(0, 60).map(x => `<div class="hrow"><span class="muted sm">${shortDate(parseDk(x.d))}</span><span>${fmt(x.w, 1)} ${u()}</span><button class="icon sm red" data-a="delBW" data-d="${x.d}">${IC.x}</button></div>`).join('')}</details>
  </div>
  <div class="card"><h3>Mensurations <button class="link" data-a="addMeas">+ Mesurer</button></h3>
    ${lm ? `<div class="meas">${Object.keys(MEAS).filter(k => lm[k] != null).map(k => { const dd = fm && fm !== lm && fm[k] != null ? lm[k] - fm[k] : null; return `<button class="mcell ${S.ui.measKey === k ? 'on' : ''}" data-a="measKey" data-k="${k}"><small>${MEAS[k]}</small><b>${fmt(lm[k], 1)}<span>${k === 'bf' ? '%' : mu()}</span></b>${dd != null ? `<em class="${dd <= 0 ? 'dn' : 'up'}">${dd >= 0 ? '+' : ''}${fmt(dd, 1)}</em>` : ''}</button>`; }).join('')}</div><canvas id="cvMeas" class="chart sm mt8"></canvas>` : `<p class="muted">Mesure ta taille, tes bras, ta poitrine... aux 2-4 semaines. Le tape ment moins que la balance.</p>`}
  </div>
  <div class="card"><h3>Photos de progrès <span><button class="link" data-a="cmpPhotos">Comparer</button></span></h3>
    <div class="photos">${S.photos.slice().reverse().map(p => `<button class="ph" data-a="viewPhoto" data-id="${p.id}"><img data-photo="${p.id}" alt=""><span>${shortDate(parseDk(p.d))}</span></button>`).join('')}<label class="ph add"><input type="file" accept="image/*" data-i="photoIn" hidden>${IC.plus}<span>Photo</span></label></div>
    <div class="muted sm mt8">Les photos restent sur ton téléphone (jamais envoyées nulle part).</div>
  </div>`;
};
const statMini = (l, v) => `<div class="smini"><small>${l}</small><b>${v}</b></div>`;
POST.body = () => {
  const r = S.ui.bwRange, from = r ? dk(addDays(new Date(), -r)) : '0';
  const L = S.body.filter(b => b.d >= from), pts = L.map(b => ({ x: parseDk(b.d).getTime(), y: b.w }));
  const trend = pts.map(p => { const w = S.body.filter(b => { const t = parseDk(b.d).getTime(); return t <= p.x && t > p.x - 7 * 864e5; }); return { x: p.x, y: w.reduce((a, b) => a + b.w, 0) / w.length }; });
  lineChart($('#cvBW'), pts, { trend: pts.length > 2 ? trend : null, goal: S.settings.goalWeight || null, empty: 'Pèse-toi pour voir ta courbe' });
  const k = S.ui.measKey; const mp = S.meas.filter(m => m[k] != null).map(m => ({ x: parseDk(m.d).getTime(), y: m[k] }));
  lineChart($('#cvMeas'), mp, { color: '#4DA3FF', empty: `Pas de données pour ${MEAS[k]}` });
  $$('img[data-photo]').forEach(img => IDB.get(img.dataset.photo).then(src => { if (src) img.src = src; }));
};
A.logBW = () => { const v = num($('#bwIn').value); if (!v || v < 20 || v > 700) return toast('Poids invalide'); const k = dk(); const ex = S.body.find(b => b.d === k); if (ex) ex.w = v; else S.body.push({ d: k, w: v }); S.body.sort((a, b) => a.d < b.d ? -1 : 1); save(); render(); toast('Pesée enregistrée'); };
A.delBW = el => { S.body = S.body.filter(b => b.d !== el.dataset.d); save(); render(); };
A.bwRange = el => { S.ui.bwRange = +el.dataset.v; save(); render(); };
A.measKey = el => { S.ui.measKey = el.dataset.k; save(); render(); };
A.setGoalW = () => openSheet(() => `<h2 class="sh-t">Poids objectif</h2><label class="fl">Objectif (${u()})<input inputmode="decimal" data-i="gwIn" value="${S.settings.goalWeight || ''}"></label><button class="btn block acc mt" data-a="gwSave">Enregistrer</button>${S.settings.goalWeight ? '<button class="btn block danger-ghost mt8" data-a="gwClear">Retirer l’objectif</button>' : ''}`);
let GW = ''; I.gwIn = el => GW = el.value;
A.gwSave = () => { S.settings.goalWeight = num(GW) || S.settings.goalWeight; save(); closeSheet(); render(); };
A.gwClear = () => { S.settings.goalWeight = null; save(); closeSheet(); render(); };
let MS = null;
A.addMeas = () => {
  const lm = S.meas[S.meas.length - 1] || {}; MS = { d: dk() };
  openSheet(() => `<h2 class="sh-t">Mensurations</h2><p class="muted sm mb">En ${mu()} (change l’unité dans Réglages). Laisse vide ce que tu mesures pas.</p>
    <div class="grid2">${Object.keys(MEAS).map(k => `<label class="fl">${MEAS[k]}<input inputmode="decimal" data-i="msIn" data-k="${k}" placeholder="${lm[k] != null ? fmt(lm[k], 1) : ''}"></label>`).join('')}</div>
    <button class="btn block acc mt" data-a="msSave">Enregistrer</button>`, { full: true });
};
I.msIn = el => { const v = num(el.value); if (v == null) delete MS[el.dataset.k]; else MS[el.dataset.k] = v; };
A.msSave = () => { if (Object.keys(MS).length < 2) return toast('Entre au moins une mesure'); S.meas = S.meas.filter(m => m.d !== MS.d); S.meas.push(MS); S.meas.sort((a, b) => a.d < b.d ? -1 : 1); save(); closeSheet(); render(); toast('Mesures enregistrées'); };

/* photos — IndexedDB */
const IDB = {
  db: null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open('lockin', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('photos', mode); const st = t.objectStore('photos'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)); },
  get(k) { return this.tx('readonly', s => s.get(k)).catch(() => null); },
  del(k) { return this.tx('readwrite', s => s.delete(k)); }
};
function compress(file, max = 1080) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8)); };
    img.onerror = rej; img.src = url;
  });
}
C.photoIn = async el => {
  const f = el.files[0]; if (!f) return;
  try { const data = await compress(f); const id = 'p_' + uid(); await IDB.put(id, data); S.photos.push({ id, d: dk(), w: latestBW()?.w || null }); save(); render(); toast('Photo ajoutée'); }
  catch (e) { toast('Erreur avec la photo'); }
};
A.viewPhoto = async el => {
  const p = S.photos.find(x => x.id === el.dataset.id), src = await IDB.get(p.id);
  openSheet(() => `<img class="fullimg" src="${src || ''}"><div class="row between mt8"><span>${cap(dateLong(parseDk(p.d)))}</span><span class="muted">${p.w ? fmt(p.w, 1) + ' ' + u() : ''}</span></div><button class="btn block danger-ghost mt" data-a="delPhoto" data-id="${p.id}">Supprimer</button>`, { full: true });
};
A.delPhoto = el => confirmSheet('Supprimer la photo?', 'C’est définitif.', 'Supprimer', async () => { await IDB.del(el.dataset.id); S.photos = S.photos.filter(x => x.id !== el.dataset.id); save(); closeAllSheets(); render(); });
let CP = [];
A.cmpPhotos = () => {
  if (S.photos.length < 2) return toast('Il faut au moins 2 photos');
  CP = [S.photos[0].id, S.photos[S.photos.length - 1].id];
  const draw = async () => { const a = await IDB.get(CP[0]), b = await IDB.get(CP[1]); const ia = $('#cmpA'), ib = $('#cmpB'); if (ia) ia.src = a || ''; if (ib) ib.src = b || ''; };
  openSheet(() => {
    const pa = S.photos.find(x => x.id === CP[0]), pb = S.photos.find(x => x.id === CP[1]);
    const opts = sel => S.photos.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${shortDate(parseDk(p.d))}${p.w ? ' · ' + fmt(p.w, 1) : ''}</option>`).join('');
    const days = daysBetween(parseDk(pa.d), parseDk(pb.d));
    return `<h2 class="sh-t">Avant / Après</h2><div class="cmp"><div><img id="cmpA"><select data-i="cmpSel" data-n="0">${opts(CP[0])}</select></div><div><img id="cmpB"><select data-i="cmpSel" data-n="1">${opts(CP[1])}</select></div></div>
      <p class="center mt8"><b>${Math.abs(days)} jours</b>${pa.w && pb.w ? ` · ${pb.w - pa.w >= 0 ? '+' : ''}${fmt(pb.w - pa.w, 1)} ${u()}` : ''}</p>`;
  }, { full: true, mount: draw });
};
C.cmpSel = el => { CP[+el.dataset.n] = el.value; paintSheet(); };

/* ---------- RÉGLAGES ---------- */
A.settings = () => openSheet(() => {
  const s = S.settings;
  return `<h2 class="sh-t">Réglages</h2>
  ${accountHTML()}
  ${notifHTML()}
  <h3 class="mt">Profil</h3>
  <button class="li tap" data-a="redoQuiz">🎯 Mon profil & mon plan<span class="grow"></span><span class="chev">›</span></button>
  <label class="fl mt8">Ton nom<input data-i="stName" value="${esc(s.name)}" placeholder="Prénom"></label>
  <div class="grid2">
    <label class="fl">Unité de poids<select data-i="stUnit"><option value="lb" ${s.unit === 'lb' ? 'selected' : ''}>Livres (lb)</option><option value="kg" ${s.unit === 'kg' ? 'selected' : ''}>Kilos (kg)</option></select></label>
    <label class="fl">Mensurations<select data-i="stMU"><option value="cm" ${mu() === 'cm' ? 'selected' : ''}>cm</option><option value="po" ${mu() === 'po' ? 'selected' : ''}>pouces</option></select></label>
    <label class="fl">Séances / semaine<input inputmode="numeric" data-i="stNum" data-k="weeklyTarget" value="${s.weeklyTarget}"></label>
    <label class="fl">Repos par défaut (s)<input inputmode="numeric" data-i="stNum" data-k="rest" value="${s.rest}"></label>
    <label class="fl">Incrément (${u()})<input inputmode="decimal" data-i="stNum" data-k="increment" value="${s.increment}"></label>
    <label class="fl">Barre (${u()})<input inputmode="decimal" data-i="stNum" data-k="barWeight" value="${s.barWeight}"></label>
  </div>
  <label class="toggle"><span>Son + vibration fin du repos</span><input type="checkbox" data-i="stSound" ${s.sound ? 'checked' : ''}></label>
  <h3 class="mt">Données</h3>
  <p class="muted sm mb">Tout est sauvegardé sur ton téléphone seulement. Exporte une sauvegarde de temps en temps (surtout avant de changer de téléphone).</p>
  <div class="grid2"><button class="btn" data-a="exportData">⬇️ Exporter</button><label class="btn">⬆️ Importer<input type="file" accept="application/json,.json" data-i="importIn" hidden></label></div>
  <button class="btn block danger-ghost mt8" data-a="resetAll">Tout effacer</button>
  <h3 class="mt">Installer sur l’écran d’accueil</h3>
  <p class="muted sm">iPhone : ouvre le lien dans <b>Safari</b> → bouton Partager → <b>Sur l’écran d’accueil</b>.<br>Android : Chrome → ⋮ → <b>Installer l’application</b>.</p>
  <p class="muted sm center mt">Lockin v${VERSION}</p>`;
}, { full: true, onClose: () => render() });
I.stName = el => { S.settings.name = el.value.trim(); save(); };
I.stNum = el => { const v = num(el.value); if (v != null && v > 0) { S.settings[el.dataset.k] = v; save(); } };
C.stSound = el => { S.settings.sound = el.checked; save(); if (el.checked) beep(1); };
C.stMU = el => { const to = el.value, from = mu(); if (to === from) return; const f = to === 'po' ? 1 / 2.54 : 2.54; S.meas.forEach(m => Object.keys(m).forEach(k => { if (k !== 'd' && k !== 'bf') m[k] = Math.round(m[k] * f * 10) / 10; })); S.settings.measUnit = to; save(); toast('Mensurations converties'); };
C.stUnit = el => {
  const to = el.value; if (to === u()) return;
  const f = to === 'kg' ? 0.45359237 : 2.20462262, r = v => v == null || v === '' ? v : Math.round(num(v) * f * 2) / 2;
  S.workouts.forEach(w => { w.ex.forEach(e => { if (EX(e.exId).type !== 'c') e.sets.forEach(s => s.w = r(s.w)); }); w.vol = woVolume(w); (w.prs || []).forEach(p => p.val = r(p.val)); });
  if (S.active) S.active.ex.forEach(e => { if (EX(e.exId).type !== 'c') e.sets.forEach(s => { if (s.w !== '') s.w = String(r(s.w)); }); });
  S.body.forEach(b => b.w = Math.round(b.w * f * 10) / 10); S.photos.forEach(p => { if (p.w) p.w = Math.round(p.w * f * 10) / 10; });
  if (S.settings.goalWeight) S.settings.goalWeight = Math.round(S.settings.goalWeight * f * 10) / 10;
  S.settings.unit = to; S.settings.barWeight = to === 'kg' ? 20 : 45; S.settings.increment = to === 'kg' ? 2.5 : 5;
  save(); paintSheet(); toast(`Tout converti en ${to}`);
};
A.exportData = async () => {
  const data = JSON.parse(JSON.stringify(S)); data.photoData = {};
  for (const p of S.photos) data.photoData[p.id] = await IDB.get(p.id);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `lockin-sauvegarde-${dk()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Sauvegarde Lockin' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
C.importIn = el => {
  const f = el.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result); if (!d.settings || !d.workouts) throw 0;
      const pd = d.photoData || {}; delete d.photoData;
      for (const k in pd) if (pd[k]) await IDB.put(k, pd[k]);
      S = d; const def = defaultState(); for (const k in def) if (S[k] === undefined) S[k] = def[k];
      S.active = d.active || null; rebuildEx(); saveNow(); closeAllSheets(); render(); toast('Sauvegarde importée ✅');
    } catch (e) { toast('Fichier invalide'); }
  };
  r.readAsText(f);
};
A.resetAll = () => confirmSheet('Tout effacer?', 'Séances, nutrition, pesées, photos... tout part. Exporte avant si tu veux garder une copie.', 'Tout effacer', async () => { for (const p of S.photos) await IDB.del(p.id).catch(() => { }); localStorage.removeItem(KEY); S = defaultState(); rebuildEx(); saveNow(); closeAllSheets(); render(); openWelcome(); });


/* ---------- SUPPLÉMENTS ---------- */
function suppHTML(k) {
  const taken = (S.suppLog || {})[k] || [];
  if (!S.supps.length) return `<p class="muted sm">Aucun supplément. <button class="link" data-a="suppManage">+ Ajouter</button></p>`;
  return `<div class="supps">${S.supps.map(s => { const on = taken.includes(s.id); return `<button class="supp ${on ? 'on' : ''}" data-a="suppTog" data-id="${s.id}" data-d="${k}"><span class="ck">${on ? IC.check : ''}</span><div class="grow"><b>${esc(s.name)}</b>${s.dose ? `<small>${esc(s.dose)}</small>` : ''}</div>${s.hour != null && !on ? `<small class="muted">🔔 ${s.hour} h</small>` : ''}</button>`; }).join('')}</div>`;
}
A.suppTog = el => { const k = el.dataset.d, id = el.dataset.id; S.suppLog = S.suppLog || {}; const L = S.suppLog[k] = S.suppLog[k] || []; L.includes(id) ? L.splice(L.indexOf(id), 1) : L.push(id); save(); render(); if (L.includes(id)) toast('Coché ✅', 1000); };
let SPN = { name: '', dose: '' };
A.suppManage = () => openSheet(() => `<h2 class="sh-t">Suppléments</h2><p class="muted sm mb">Choisis l’heure du rappel : si c’est pas coché à cette heure-là, tu reçois une notif (et une 2e à 21 h).</p>
  ${S.supps.map((s, i) => `<div class="re-row"><div class="grow"><b>${esc(s.name)}</b><div class="muted sm">${esc(s.dose || '')}</div>
    <label class="fl mt8">Rappel<select data-i="suppHour" data-n="${i}"><option value="">Aucun rappel</option>${Array.from({ length: 15 }, (_, h) => h + 7).map(h => `<option value="${h}" ${s.hour === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></label></div>
    <button class="icon sm red" data-a="suppDel" data-n="${i}">${IC.x}</button></div>`).join('')}
  <h3 class="mt">Ajouter</h3><div class="grid2"><label class="fl">Nom<input data-i="spn" data-k="name" value="${esc(SPN.name)}" placeholder="ex. Vitamine D"></label><label class="fl">Dose<input data-i="spn" data-k="dose" value="${esc(SPN.dose)}" placeholder="ex. 1000 UI"></label></div>
  <button class="btn block" data-a="suppAdd">+ Ajouter</button><button class="btn block acc mt8" data-a="closeSheet">OK</button>`, { onClose: () => render() });
C.suppHour = el => { const s = S.supps[+el.dataset.n]; s.hour = el.value === '' ? null : +el.value; save(); };
I.spn = el => SPN[el.dataset.k] = el.value;
A.suppAdd = () => { if (!SPN.name.trim()) return toast('Entre un nom'); S.supps.push({ id: 's_' + uid(), name: SPN.name.trim(), dose: SPN.dose.trim(), hour: null }); SPN = { name: '', dose: '' }; save(); paintSheet(); };
A.suppDel = el => { S.supps.splice(+el.dataset.n, 1); save(); paintSheet(); };
