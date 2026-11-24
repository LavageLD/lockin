'use strict';
/* ===== LOCKIN — mode lazy : bouteilles, journée type, pas, maintien, raccourcis iPhone ===== */
const APP_URL = 'https://lavageld.github.io/lockin/';
const CF = () => S.settings.trackCF !== false;
const macTxt = (p, c, f) => CF() ? `P ${fmt(p)} G ${fmt(c)} L ${fmt(f)}` : `P ${fmt(p)} g prot`;
C.trackCF = el => { S.settings.trackCF = el.checked; save(); if (SH.length) paintSheet(); toast(el.checked ? 'Glucides + lipides affichés' : 'Juste calories + protéines', 1500); };

/* ---------- énergie / maintien ---------- */
function bodyNums() {
  const s = S.settings, bw = latestBW(), kg = bw ? (u() === 'kg' ? bw.w : bw.w * 0.45359237) : null;
  const lb = [...S.meas].reverse().find(m => m.bf != null);
  return { kg, h: s.height, age: s.age, sex: s.sex || 'h', bf: lb ? lb.bf : (S.profile && S.profile.bf) || null };
}
function bmrOf(b) { if (!b.kg) return null; if (b.bf) return 370 + 21.6 * b.kg * (1 - b.bf / 100); if (!b.h || !b.age) return null; return 10 * b.kg + 6.25 * b.h - 5 * b.age + (b.sex === 'h' ? 5 : -161); }
function workMin(k) { return S.workouts.filter(w => dk(w.start) === k).reduce((a, w) => { const d = ((w.end || w.start) - w.start) / 6e4; return a + (d >= 5 ? Math.min(d, 150) : 60); }, 0); }
function energy(k, o = {}) {
  const b = { ...bodyNums(), ...(o.body || {}) }, bmr = bmrOf(b); if (!bmr) return null;
  const steps = o.steps != null ? o.steps : ((S.steps || {})[k] || 0), wm = o.wmin != null ? o.wmin : workMin(k);
  const base = bmr * 1.15, st = steps * b.kg * 0.00055, wk = 4.5 * b.kg * (wm / 60);
  return { bmr: Math.round(bmr), base: Math.round(base), steps, stepsK: Math.round(st), wmin: wm, workK: Math.round(wk), maint: Math.round(base + st + wk) };
}
function calAdj() { if (S.settings.calAdj != null) return S.settings.calAdj; const gt = S.settings.goalType; return gt === 'cut' ? -500 : gt === 'bulk' ? 300 : 0; }
function dayGoals(k) {
  const g = S.settings.goals; if (!S.settings.dynCal) return g;
  const e = energy(k); if (!e) return g;
  const cal = Math.round((e.maint + calAdj()) / 10) * 10, c = Math.max(50, Math.round((cal - g.p * 4 - g.f * 9) / 4));
  S.goalsByDay = S.goalsByDay || {}; S.goalsByDay[k] = { cal, c };
  return { ...g, cal, c, dyn: e };
}

/* ---------- écran Nutrition ---------- */
VIEWS.nutrition = () => {
  const k = S.ui.nutDate || dk(), T = dayTotals(k), g = dayGoals(k), L = S.log[k] || [], left = g.cal - T.cal, wml = S.water[k] || 0;
  const label = k === dk() ? "Aujourd'hui" : k === dk(addDays(new Date(), -1)) ? 'Hier' : cap(dateLong(parseDk(k)));
  const tpl = (S.dayTemplate || []).length, tplCal = (S.dayTemplate || []).reduce((a, x) => a + x.cal * x.q, 0);
  return `
  <div class="datenav"><button class="icon" data-a="nutDay" data-d="-1">‹</button><label class="datepick"><b>${label} 📅</b><input type="date" data-i="nutPick" value="${k}" max="${dk()}"></label><button class="icon" data-a="nutDay" data-d="1" ${k >= dk() ? 'disabled' : ''}>›</button></div>
  ${k !== dk() ? `<div class="pastbar">✏️ Tu modifies une journée passée <button class="link" data-a="nutToday">Revenir à aujourd’hui</button></div>` : ''}
  ${!L.length && tpl ? `<button class="cta" data-a="tplFill"><div><div class="cta-k">Journée type · ${fmt(tplCal)} cal</div><div class="cta-t">⚡ Remplir ma journée</div></div><span class="cta-i">${IC.check}</span></button>` : ''}
  <div class="card nutsum">
    <div class="ringwrap">${ring(T.cal / g.cal, 132, 12)}<div class="ringtxt"><b>${fmt(Math.abs(left))}</b><span>${left >= 0 ? 'cal restantes' : 'cal de trop'}</span></div></div>
    <div class="macros">${bar('Protéines', T.p, g.p, '#FF6B57')}${CF() ? bar('Glucides', T.c, g.c, '#4DA3FF') + bar('Lipides', T.f, g.f, '#FFB020') : ''}<div class="muted sm">${fmt(T.cal)} / ${fmt(g.cal)} cal${g.dyn ? ' · ajusté 👟' : ''}</div></div>
  </div>
  ${stepsCard(k, g)}
  ${MEALS.map(m => { const it = L.filter(x => x.meal === m), mc = it.reduce((a, x) => a + x.cal * x.q, 0); return `<div class="card meal"><h3>${m} <span class="muted">${fmt(mc)} cal</span></h3>
    ${it.map(x => `<button class="li tap fi" data-a="editFood" data-id="${x.id}"><div class="grow"><b>${esc(x.name)}</b><div class="muted sm">${x.q !== 1 ? fmt(x.q, 2) + ' × ' : ''}${esc(x.serv || 'portion')} · ${macTxt(x.p * x.q, x.c * x.q, x.f * x.q)}</div></div><b>${fmt(x.cal * x.q)}</b></button>`).join('')}
    <button class="btn sm ghost block" data-a="addFood" data-m="${m}">+ Ajouter</button></div>`; }).join('')}
  ${waterHTML(k, g, wml)}
  <div class="card"><h3>Suppléments <button class="link" data-a="suppManage">Gérer</button></h3>${suppHTML(k)}</div>
  <div class="card">${cafHTML(k)}</div>
  <div class="actrow"><button class="chip" data-a="tplOpen">⚡ Journée type</button><button class="chip" data-a="copyDay">📋 Copier la veille</button><button class="chip" data-a="maintCalc">🧮 Maintien</button><button class="chip" data-a="goals">🎯 Objectifs</button></div>
  <div class="card mt8"><h3>7 derniers jours</h3><canvas id="cvNut" class="chart sm"></canvas>${weekNutStats(k)}</div>`;
};
POST.nutrition = () => {
  const k = S.ui.nutDate || dk(), it = [], gl = dayGoals(k).cal;
  for (let i = 6; i >= 0; i--) { const d = addDays(parseDk(k), -i), dd = dk(d), T = dayTotals(dd), gg = dayGoals(dd).cal; it.push({ l: DOW[(d.getDay() + 6) % 7], v: Math.round(T.cal), c: T.cal > gg * 1.08 ? '#FF453A' : T.cal ? ACC : 'rgba(255,255,255,.1)' }); }
  barChart($('#cvNut'), it, { goal: gl });
};

/* ---------- pas ---------- */
function stepsCard(k, g) {
  const n = (S.steps || {})[k] || 0, e = energy(k);
  return `<div class="card stepcard"><div class="grow"><b>👟 ${fmt(n)} pas</b><div class="muted sm">${e ? `+${fmt(e.stepsK)} cal brûlées${S.settings.dynCal ? ' · ajoutées à ton objectif' : ''}` : 'Entre ton poids pour calculer'}</div></div>
    <button class="btn sm ghost" data-a="stepsEdit" data-d="${k}">✏️</button>${k === dk() ? `<button class="btn sm acc" data-a="stepsSync">🔄</button>` : ''}</div>`;
}
let STP = null;
A.stepsEdit = el => {
  STP = { k: el.dataset.d || dk(), v: String((S.steps || {})[el.dataset.d || dk()] || '') };
  openSheet(() => `<h2 class="sh-t">Pas · ${STP.k === dk() ? "aujourd'hui" : shortDate(parseDk(STP.k))}</h2>
    <label class="fl">Nombre de pas<input inputmode="numeric" data-i="stpV" value="${esc(STP.v)}" placeholder="ex. 8500"></label>
    <button class="btn block acc mt8" data-a="stpSave">Enregistrer</button>
    <p class="muted sm mt">Pour que ça se fasse tout seul depuis l’app Santé : Réglages → ⚡ Raccourcis iPhone → Pas automatiques.</p>`);
};
I.stpV = el => STP.v = el.value;
A.stpSave = () => { const n = Math.round(num(STP.v)); if (!(n >= 0)) return toast('Entre un nombre'); (S.steps = S.steps || {})[STP.k] = n; save(); closeSheet(); render(); toast(`👟 ${fmt(n)} pas`, 1200); };
A.stepsSync = () => {
  if (!S.settings.stepsAuto) return A.shortcutsHelp({ dataset: { s: 'steps' } });
  location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Lockin Pas');
};

/* ---------- eau : bouteilles ---------- */
function waterHTML(k, g, wml) {
  const B = S.bottles || [], open = S.ui.waterMore;
  return `<div class="card"><h3>Eau <span class="muted">${fmt(wml / 1000, 2)} / ${fmt(g.water / 1000, 1)} L</span></h3>
    <div class="water">${Array.from({ length: 8 }, (_, i) => `<span class="${wml >= (i + 1) * g.water / 8 ? 'on' : ''}">💧</span>`).join('')}</div>
    <div class="bottles mt8">${B.map(b => `<button class="btn acc" data-a="bottle" data-id="${b.id}">🍼 ${esc(b.name)}<small>${fmt(b.ml)} ml</small></button>`).join('') || `<button class="btn" data-a="bottlesManage">+ Ajouter ma bouteille</button>`}</div>
    <button class="link block-link mt8" data-a="waterMore">${open ? 'Moins d’options ▴' : 'Plus d’options ▾'}</button>
    ${open ? `<div class="mt8"><div class="row gap"><button class="btn sm ghost" data-a="water" data-v="-250">−250</button><button class="btn sm ghost grow" data-a="water" data-v="250">+250 ml</button><button class="btn sm ghost grow" data-a="water" data-v="500">+500 ml</button></div>
      <div class="logrow mt8"><input inputmode="numeric" id="waterIn" placeholder="Autre quantité (ml)"><button class="btn sm" data-a="waterCustom">+ Ajouter</button></div>
      <button class="btn sm ghost block mt8" data-a="bottlesManage">🍼 Gérer mes bouteilles</button></div>` : ''}</div>`;
}
A.waterMore = () => { S.ui.waterMore = !S.ui.waterMore; save(); render(); };
function addWater(ml, k) { k = k || S.ui.nutDate || dk(); S.water[k] = Math.max(0, (S.water[k] || 0) + ml); save(); }
A.bottle = el => { const b = (S.bottles || []).find(x => x.id === el.dataset.id); if (!b) return; addWater(b.ml); render(); toast(`🍼 +${fmt(b.ml)} ml`, 1200); };
let BTN = { name: '', ml: '' };
A.bottlesManage = () => openSheet(() => `<h2 class="sh-t">Mes bouteilles</h2><p class="muted sm mb">Chaque bouteille devient un bouton : 1 tap = la bouteille au complet.</p>
  ${(S.bottles || []).map((b, i) => `<div class="cafrow"><input data-i="btP" data-n="${i}" data-k="name" value="${esc(b.name)}"><input inputmode="numeric" class="mg" data-i="btP" data-n="${i}" data-k="ml" value="${b.ml}"><span class="muted sm">ml</span><button class="icon sm red" data-a="btDel" data-n="${i}">${IC.x}</button></div>`).join('')}
  <h3 class="mt">Ajouter</h3><div class="cafrow"><input data-i="btN" data-k="name" value="${esc(BTN.name)}" placeholder="ex. Gourde gym"><input inputmode="numeric" class="mg" data-i="btN" data-k="ml" value="${esc(BTN.ml)}" placeholder="1000"><span class="muted sm">ml</span></div>
  <button class="btn block" data-a="btAdd">+ Ajouter</button><button class="btn block acc mt8" data-a="closeSheet">OK</button>`, { onClose: () => render() });
I.btP = el => { const b = S.bottles[+el.dataset.n]; if (el.dataset.k === 'ml') { const v = Math.round(num(el.value)); if (v > 0) b.ml = v; } else if (el.value.trim()) b.name = el.value.trim(); save(); };
I.btN = el => BTN[el.dataset.k] = el.value;
A.btAdd = () => { const ml = Math.round(num(BTN.ml)); if (!(ml > 0)) return toast('Entre les ml'); (S.bottles = S.bottles || []).push({ id: 'b_' + uid(), name: BTN.name.trim() || 'Bouteille', ml }); BTN = { name: '', ml: '' }; save(); paintSheet(); };
A.btDel = el => { S.bottles.splice(+el.dataset.n, 1); save(); paintSheet(); };

/* ---------- journée type ---------- */
A.tplOpen = () => {
  const k = S.ui.nutDate || dk(), T = S.dayTemplate || [], cur = S.log[k] || [];
  openSheet(() => `<h2 class="sh-t">⚡ Journée type</h2><p class="muted sm mb">Ta journée habituelle en 1 tap. Tu changes juste ce qui est différent après.</p>
    ${T.length ? `<div class="card inset">${MEALS.map(m => { const it = T.filter(x => x.meal === m); return it.length ? `<div class="month-h">${m}</div>${it.map(x => `<div class="hrow"><span>${esc(x.name)}${x.q !== 1 ? ' ×' + fmt(x.q, 2) : ''}</span><span class="muted sm">${fmt(x.cal * x.q)} cal</span></div>`).join('')}` : ''; }).join('')}
      <div class="row between mt8"><b>Total</b><b>${fmt(T.reduce((a, x) => a + x.cal * x.q, 0))} cal · ${fmt(T.reduce((a, x) => a + x.p * x.q, 0))} g prot</b></div></div>
      <button class="btn block acc big-btn mt" data-a="tplFill">⚡ Remplir ${k === dk() ? "aujourd'hui" : 'cette journée'}</button>` : `<p>Pas encore de journée type.</p>`}
    ${cur.length ? `<button class="btn block mt8" data-a="tplSave">💾 ${T.length ? 'Remplacer par' : 'Enregistrer'} la journée affichée (${cur.length} aliments)</button>` : `<p class="muted sm mt8">Logge une journée normale, pis reviens ici pour l’enregistrer comme journée type.</p>`}`);
};
A.tplSave = () => { const k = S.ui.nutDate || dk(); S.dayTemplate = (S.log[k] || []).map(x => ({ ...x, id: undefined })); save(); closeAllSheets(); render(); toast('Journée type enregistrée 💾'); };
A.tplFill = () => { const k = S.ui.nutDate || dk(), T = S.dayTemplate || []; if (!T.length) return A.tplOpen(); S.log[k] = [...(S.log[k] || []), ...T.map(x => ({ ...x, id: uid() }))]; save(); closeAllSheets(); render(); toast(`⚡ ${T.length} aliments ajoutés`); };

/* ---------- calculateur de maintien ---------- */
let MC = null;
const ADJ = [[-750, 'Sèche agressive (−750)'], [-500, 'Sèche (−500)'], [-300, 'Sèche lente (−300)'], [0, 'Maintien'], [250, 'Masse propre (+250)'], [400, 'Masse (+400)']];
A.maintCalc = () => {
  const b = bodyNums(), bw = latestBW();
  MC = { w: bw ? String(bw.w) : '', h: S.settings.height || '', age: S.settings.age || '', sex: S.settings.sex || 'h', bf: b.bf != null ? String(b.bf) : '', steps: String((S.steps || {})[dk()] || ''), wmin: String(workMin(dk()) || ''), adj: calAdj(), dyn: true };
  closeAllSheets(); openSheet(mcRender, { full: true });
};
function mcCalc() {
  const w = num(MC.w), kg = w ? (u() === 'kg' ? w : w * 0.45359237) : null;
  return energy(dk(), { body: { kg, h: num(MC.h), age: num(MC.age), sex: MC.sex, bf: num(MC.bf) || null }, steps: num(MC.steps) || 0, wmin: num(MC.wmin) || 0 });
}
function mcOut() {
  const e = mcCalc(); if (!e) return `<p class="muted sm">Entre ton poids, ta grandeur pis ton âge (ou ton % de gras).</p>`;
  const goal = Math.round((e.maint + (+MC.adj)) / 10) * 10;
  return `<div class="card inset">
    <div class="hrow"><span>Métabolisme de base${num(MC.bf) ? ' (avec % gras)' : ''}</span><b>${fmt(e.bmr)}</b></div>
    <div class="hrow"><span>Vie de tous les jours</span><b>+${fmt(e.base - e.bmr)}</b></div>
    <div class="hrow"><span>👟 ${fmt(e.steps)} pas</span><b>+${fmt(e.stepsK)}</b></div>
    <div class="hrow"><span>🏋️ ${fmt(e.wmin)} min d’entraînement</span><b>+${fmt(e.workK)}</b></div>
    <div class="hrow"><b>Maintien aujourd’hui</b><b class="ok">${fmt(e.maint)} cal</b></div>
    <div class="hrow"><b>Ton objectif aujourd’hui</b><b>${fmt(goal)} cal</b></div></div>
    <p class="muted sm mt8">Chaque 1 000 pas ≈ ${fmt(e.stepsK && e.steps ? e.stepsK / e.steps * 1000 : 0.55 * (num(MC.w) ? (u() === 'kg' ? num(MC.w) : num(MC.w) * 0.4536) : 70))} cal pour toi. Estimation : ajuste selon ton poids sur 2-3 semaines.</p>`;
}
function mcRender() {
  return `<h2 class="sh-t">🧮 Calculateur de maintien</h2>
    <div class="grid2"><label class="fl">Poids (${u()})<input inputmode="decimal" data-i="mc" data-k="w" value="${esc(MC.w)}"></label><label class="fl">Grandeur (cm)<input inputmode="numeric" data-i="mc" data-k="h" value="${esc(MC.h)}"></label>
    <label class="fl">Âge<input inputmode="numeric" data-i="mc" data-k="age" value="${esc(MC.age)}"></label><label class="fl">% de gras <span class="muted">(optionnel)</span><input inputmode="decimal" data-i="mc" data-k="bf" value="${esc(MC.bf)}"></label>
    <label class="fl">Pas aujourd’hui<input inputmode="numeric" data-i="mc" data-k="steps" value="${esc(MC.steps)}"></label><label class="fl">Minutes d’entraînement<input inputmode="numeric" data-i="mc" data-k="wmin" value="${esc(MC.wmin)}"></label></div>
    <label class="fl">Sexe<select data-i="mc" data-k="sex"><option value="h" ${MC.sex === 'h' ? 'selected' : ''}>Homme</option><option value="f" ${MC.sex === 'f' ? 'selected' : ''}>Femme</option></select></label>
    <label class="fl">Objectif<select data-i="mc" data-k="adj">${ADJ.map(([v, l]) => `<option value="${v}" ${+MC.adj === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div id="mcOut">${mcOut()}</div>
    <label class="toggle"><span>Ajuster mon objectif tout seul chaque jour<small class="muted" style="display:block;font-weight:500;font-size:12.5px">Plus tu marches, plus t’as de calories (glucides)</small></span><input type="checkbox" data-i="mcDyn" ${MC.dyn ? 'checked' : ''}></label>
    <button class="btn block acc mt" data-a="mcSave">Enregistrer</button>`;
}
I.mc = el => { MC[el.dataset.k] = el.value; const o = $('#mcOut'); if (o) o.innerHTML = mcOut(); };
C.mc = I.mc;
C.mcDyn = el => MC.dyn = el.checked;
A.mcSave = () => {
  const e = mcCalc(); if (!e) return toast('Il manque des infos');
  const s = S.settings, k = dk(), w = num(MC.w);
  s.height = num(MC.h) || s.height; s.age = num(MC.age) || s.age; s.sex = MC.sex; s.calAdj = +MC.adj; s.goalType = +MC.adj < 0 ? 'cut' : +MC.adj > 0 ? 'bulk' : 'maintain'; s.dynCal = MC.dyn;
  if (w) { const b = S.body.find(x => x.d === k); if (b) b.w = w; else { S.body.push({ d: k, w }); S.body.sort((a, c) => a.d < c.d ? -1 : 1); } }
  if (num(MC.bf)) { let m = S.meas.find(x => x.d === k); if (!m) { m = { d: k }; S.meas.push(m); S.meas.sort((a, c) => a.d < c.d ? -1 : 1); } m.bf = num(MC.bf); }
  if (MC.steps !== '') (S.steps = S.steps || {})[k] = Math.round(num(MC.steps) || 0);
  if (!MC.dyn) { const cal = Math.round((e.maint + s.calAdj) / 10) * 10; s.goals.cal = cal; s.goals.c = Math.max(50, Math.round((cal - s.goals.p * 4 - s.goals.f * 9) / 4)); }
  save(); closeSheet(); render(); toast(MC.dyn ? 'Objectif ajusté tout seul selon tes pas 👟' : 'Objectif enregistré');
};

/* ---------- raccourcis iPhone ---------- */
const LINKS = { checkin: APP_URL + '?go=checkin', bottle: APP_URL + '?go=bottle' };
async function copyTxt(t) { try { await navigator.clipboard.writeText(t); toast('Copié ✅', 1200); } catch (e) { prompt && toast(t, 4000); } }
A.copyLink = el => copyTxt(el.dataset.v);
A.copyScript = async el => { try { const t = await (await fetch(el.dataset.v + '?' + Date.now())).text(); await navigator.clipboard.writeText(t); toast('Script copié ✅'); } catch (e) { toast('Ouvre ' + el.dataset.v + ' pour le copier', 3000); } };
A.shortcutsHelp = el => {
  const s = el && el.dataset && el.dataset.s;
  openSheet(() => `<h2 class="sh-t">⚡ Raccourcis iPhone</h2><p class="muted sm mb">À configurer une fois. Après, tout se fait presque tout seul. Connecte-toi aussi à ton compte Lockin dans Safari une fois (ces liens s’ouvrent dans Safari).</p>
    <div class="card inset ${s === 'gym' ? 'hl' : ''}"><b>📍 Gym automatique</b><p class="muted sm mt8">Quand t’arrives à un de tes gyms, Lockin s’ouvre direct sur « Cocher ta séance ». Un tap pis c’est fait. Une automatisation par gym.</p>
      <button class="btn sm block mt8" data-a="copyLink" data-v="${LINKS.checkin}">📋 Copier le lien gym</button></div>
    <div class="card inset ${s === 'bottle' ? 'hl' : ''}"><b>🍼 Bouteille au dos du cell</b><p class="muted sm mt8">Tape 2 fois le dos de ton iPhone = +1 bouteille d’eau.</p>
      <button class="btn sm block mt8" data-a="copyLink" data-v="${LINKS.bottle}">📋 Copier le lien bouteille</button></div>
    <div class="card inset ${s === 'steps' ? 'hl' : ''}"><b>👟 Pas automatiques</b><p class="muted sm mt8">Tes pas de l’app Santé envoyés à Lockin quelques fois par jour (avec Scriptable, comme ton widget).</p>
      <button class="btn sm block mt8" data-a="copyScript" data-v="lockin-pas.js">📋 Copier le script des pas</button>
      <label class="toggle"><span>C’est configuré (le bouton 🔄 lance le raccourci « Lockin Pas »)</span><input type="checkbox" data-i="stepsAuto" ${S.settings.stepsAuto ? 'checked' : ''}></label></div>
    <p class="muted sm">Demande à Claude de te guider étape par étape pour chacun.</p>`, { full: true });
};
C.stepsAuto = el => { S.settings.stepsAuto = el.checked; save(); };

/* liens ?go=… (gym, bouteille, pas) : on attend la synchro du compte avant d'agir */
function handleLink() {
  const P = new URLSearchParams(location.search), go = P.get('go'), steps = P.get('steps');
  if (!go && !steps) return;
  const run = () => {
    history.replaceState(null, '', location.pathname);
    if (steps != null) { (S.steps = S.steps || {})[dk()] = Math.round(num(steps) || 0); save(); render(); toast(`👟 ${fmt(num(steps))} pas`); }
    if (go === 'bottle' || go === 'water') {
      const ml = num(P.get('ml')) || ((S.bottles || []).find(b => b.id === P.get('id')) || (S.bottles || [])[0] || { ml: 750 }).ml;
      addWater(ml, dk()); S.ui.tab = 'nutrition'; S.ui.nutDate = null; render(); toast(`🍼 +${fmt(ml)} ml — total ${fmt((S.water[dk()] || 0) / 1000, 2)} L`, 2500);
    }
    if (go === 'checkin') {
      const d = doneToday();
      if (d) { toast('Séance déjà cochée aujourd’hui ✅', 2500); return; }
      const nx = nextRoutine(); quickLog({ routineId: nx ? nx.id : null });
    }
  };
  let t = 0; const wait = setInterval(() => {
    t += 250; const obOpen = $('#ob').classList.contains('open');
    const ready = !AUTH.configured || AUTH.ready || t > 6000;
    if (ready && !obOpen) { clearInterval(wait); run(); }
    if (t > 120000) clearInterval(wait);
  }, 250);
}

/* ---------- oublis : journée d'hier incomplète ---------- */
function missingOn(k) {
  const m = [];
  if (!(S.log[k] || []).length) m.push('food');
  if (!(S.water[k] > 0)) m.push('water');
  (S.supps || []).forEach(s => { if (s.hour != null && !((S.suppLog || {})[k] || []).includes(s.id)) m.push('supp:' + s.id); });
  return m;
}
function yesterdayHTML() {
  const y = dk(addDays(new Date(), -1));
  if (S.ui.yDismiss === y || y < habitStart()) return '';
  const m = missingOn(y); if (!m.length) return '';
  const names = m.map(x => x === 'food' ? 'bouffe' : x === 'water' ? 'eau' : (S.supps.find(s => 'supp:' + s.id === x) || {}).name || 'supplément');
  return `<div class="card ybar"><b>📝 Hier est incomplet</b><div class="muted sm">Pas loggé : ${names.join(', ')}. Complète-le en 10 secondes.</div>
    <div class="chips mt8">${m.includes('food') ? `<button class="chip" data-a="yFood">🍽️ Ajouter la bouffe</button>${(S.dayTemplate || []).length ? `<button class="chip" data-a="yTpl">⚡ Journée type</button>` : ''}` : ''}
    ${m.includes('water') ? `<button class="chip" data-a="yWater">🍼 ${(S.bottles || [])[0] ? 'Bouteilles…' : 'Eau…'}</button>` : ''}
    ${m.filter(x => x.startsWith('supp:')).map(x => { const s = S.supps.find(z => 'supp:' + z.id === x); return s ? `<button class="chip" data-a="ySupp" data-id="${s.id}">💊 ${esc(s.name)} ✓</button>` : ''; }).join('')}
    <button class="chip" data-a="yOk">C’était correct</button></div></div>`;
}
const YK = () => dk(addDays(new Date(), -1));
A.yFood = () => { S.ui.nutDate = YK(); S.ui.tab = 'nutrition'; render(); window.scrollTo(0, 0); };
A.yTpl = () => { const k = YK(); S.log[k] = [...(S.log[k] || []), ...(S.dayTemplate || []).map(x => ({ ...x, id: uid() }))]; save(); render(); toast('⚡ Journée type ajoutée à hier'); };
A.yWater = () => { const b = (S.bottles || [])[0] || { ml: 750 }; openSheet(() => `<h2 class="sh-t">Eau d’hier</h2><p class="muted sm mb">Combien t’en as bu à peu près?</p><div class="grid2">${[1, 2, 3, 4].map(n => `<button class="btn" data-a="yWaterSet" data-v="${n * b.ml}">${n} × ${fmt(b.ml)} ml</button>`).join('')}</div><div class="logrow mt8"><input inputmode="numeric" id="yWaterIn" placeholder="Autre (ml)"><button class="btn sm" data-a="yWaterSet">OK</button></div>`); };
A.yWaterSet = el => { const v = el.dataset.v ? +el.dataset.v : Math.round(num($('#yWaterIn').value)); if (!(v > 0)) return toast('Entre les ml'); const k = YK(); S.water[k] = (S.water[k] || 0) + v; save(); closeSheet(); render(); toast(`💧 +${fmt(v)} ml hier`); };
A.ySupp = el => { const k = YK(); S.suppLog = S.suppLog || {}; (S.suppLog[k] = S.suppLog[k] || []).push(el.dataset.id); save(); render(); };
A.yOk = () => { S.ui.yDismiss = YK(); save(); render(); };
(function hookHome() { const h = VIEWS.home; VIEWS.home = () => { const html = h(); const y = yesterdayHTML(); if (!y) return html; const i = html.indexOf('<div class="card streak">'); return i > 0 ? html.slice(0, i) + y + html.slice(i) : y + html; }; })();
