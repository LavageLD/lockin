/* ===== LOCKIN — section cachée (triple tap en bas à gauche des Réglages) ===== */
let SX_T = [], SX = { w: 0, lb: 'w' };
A.sx = () => { const n = Date.now(); SX_T = SX_T.filter(t => n - t < 900); SX_T.push(n); if (SX_T.length >= 3) { SX_T = []; SX = { w: 0, lb: 'w' }; bdStart(); openSheet(sxRender, { full: true }); } };
const DAYF = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const H0 = 5, H1 = 23; // heures affichées
/* données partagées entre tous les comptes (Firestore « bd ») */
let BDS = null, BDERR = null, bdUnsub = null; SX.lb = 'w';
const myUid = () => AUTH.user && AUTH.user.uid;
const myName = () => (S.settings.name || (AUTH.user && AUTH.user.email || '').split('@')[0] || 'Moi').trim();
function bdStart() {
  if (bdUnsub || !myUid() || !AUTH.mod || !AUTH.mod.bdWatch) return;
  BDS = BDS || []; BDERR = null;
  bdUnsub = AUTH.mod.bdWatch(L => { BDS = L.sort((a, b) => a.t - b.t); bdMigrate(); if (SH.length) paintSheet(); }, e => { BDERR = e.code || 'err'; bdUnsub = null; if (SH.length) paintSheet(); });
}
async function bdMigrate() { // anciennes données locales → partagées (une seule fois)
  const L = S.bd || []; if (!L.length || S.bdUp) return; S.bdUp = true; save();
  try { for (const t of L) await AUTH.mod.bdAdd(t, myName()); S.bd = []; save(); } catch (e) { S.bdUp = false; save(); }
}
const BD = () => (BDS || []).map(x => x.t);
const sxPct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
function sxWeek(off, cut) { const ws = startOfWeek(addDays(new Date(), -7 * off)), a = ws.getTime(), b = cut ? a + cut : addDays(ws, 7).getTime(); const L = BD().filter(t => t >= a && t < b); const v = S.workouts.filter(w => w.start >= a && w.start < b).length; return { L, n: L.length, v, per: v ? L.length / v : null, ws }; }
function sxBars(vals, labels, hi) {
  const m = Math.max(1, ...vals);
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:120px;margin-top:10px">${vals.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
    <span style="font-size:9px;color:var(--mut,#888)">${v ? fmt(v, v % 1 ? 1 : 0) : ''}</span><div style="width:100%;border-radius:4px 4px 0 0;height:${v / m * 92}%;min-height:${v ? 3 : 0}px;background:${i === hi ? '#FF5FA2' : '#FF5FA266'}"></div></div>`).join('')}</div>
    <div style="display:flex;gap:3px;margin-top:4px">${labels.map(l => `<span style="flex:1;text-align:center;font-size:9px;color:var(--mut,#888)">${l}</span>`).join('')}</div>`;
}
const sxDelta = (p, lbl) => p == null ? `<span class="muted sm">${lbl} : pas assez de données</span>` : `<b style="color:${p >= 0 ? '#33D17A' : '#FF453A'}">${p >= 0 ? '+' : ''}${p} %</b> <span class="muted sm">${lbl}</span>`;
function sxLB() {
  const a = SX.lb === 'w' ? startOfWeek(new Date()).getTime() : SX.lb === 'm' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : 0;
  const M = {}; (BDS || []).filter(x => x.t >= a).forEach(x => { const m = M[x.uid] = M[x.uid] || { n: 0, name: x.name, uid: x.uid }; m.n++; m.name = x.name || m.name; });
  const L = Object.values(M).sort((x, y) => y.n - x.n), tot = L.reduce((q, x) => q + x.n, 0);
  return `<div class="card"><h3>🏆 Leaderboard</h3>
    <div class="seg mt8">${[['w', 'Semaine'], ['m', 'Mois'], ['a', 'Tout']].map(([v, l]) => `<button class="${SX.lb === v ? 'on' : ''}" data-a="sxLb" data-v="${v}">${l}</button>`).join('')}</div>
    ${L.length ? L.map((x, i) => `<div class="hrow" style="padding:9px 0${x.uid === myUid() ? ';color:#FF5FA2' : ''}"><span><b style="display:inline-block;width:28px">${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</b>${esc(x.name || '?')}${x.uid === myUid() ? ' (toi)' : ''}</span><span><b>${x.n}</b> <span class="muted sm">${tot ? Math.round(x.n / tot * 100) : 0} %</span></span></div>`).join('') : '<p class="muted sm mt8">Personne encore. Sois le premier.</p>'}</div>`;
}
function sxRender() {
  if (!myUid()) return `<h2 class="sh-t">👀 Baddie tracker</h2><p class="muted">Connecte-toi à ton compte (Réglages → Compte) pour partager les données avec la gang.</p>`;
  if (BDERR) return `<h2 class="sh-t">👀 Baddie tracker</h2><p class="muted">Impossible de charger les données partagées (${esc(BDERR)}). Vérifie les règles Firestore.</p><button class="btn block mt" data-a="sxRetry">Réessayer</button>`;
  if (!BDS) return `<h2 class="sh-t">👀 Baddie tracker</h2><p class="muted">Chargement...</p>`;
  const all = BD(), today = all.filter(t => dk(t) === dk()).length, mine = (BDS || []).filter(x => x.uid === myUid() && dk(x.t) === dk()).length;
  const cur = sxWeek(SX.w), live = !SX.w, prev = sxWeek(SX.w + 1, live ? Date.now() - startOfWeek(new Date()).getTime() : 0), vsL = live ? 'vs même moment la semaine passée' : 'vs semaine d’avant';
  // par heure / jour (sur tout l'historique)
  const byH = Array(H1 - H0 + 1).fill(0), byD = Array(7).fill(0), heat = Array.from({ length: 7 }, () => Array(H1 - H0 + 1).fill(0));
  all.forEach(t => { const d = new Date(t), h = d.getHours(), wd = (d.getDay() + 6) % 7; byD[wd]++; if (h >= H0 && h <= H1) { byH[h - H0]++; heat[wd][h - H0]++; } });
  let best = null; heat.forEach((r, d) => r.forEach((v, h) => { if (v && (!best || v > best.v)) best = { d, h: h + H0, v }; }));
  const hm = Math.max(1, ...heat.flat());
  const hiH = byH.indexOf(Math.max(...byH)), hiD = byD.indexOf(Math.max(...byD));
  // 8 dernières semaines
  const w8 = [...Array(8)].map((_, i) => sxWeek(7 - i));
  const wl = w8.map(x => `${x.ws.getDate()}/${x.ws.getMonth() + 1}`);
  return `<h2 class="sh-t">👀 Baddie tracker</h2>
  <div class="card center"><div class="muted sm">Aujourd’hui · toute la gang</div><div class="huge" style="color:#FF5FA2">${today}</div>
    <div class="row gap mt8"><button class="btn block acc big-btn grow" data-a="sxAdd">+1</button><button class="btn" data-a="sxUndo" style="min-width:64px">−1</button></div>
    <p class="muted sm mt8">Toi aujourd’hui : <b>${mine}</b> · l’heure pis le jour sont notés tout seuls. Tout le monde voit les mêmes stats.</p></div>
  ${sxLB()}

  <div class="card"><div class="row between"><button class="icon sm" data-a="sxW" data-d="1">‹</button><b>${SX.w ? `Semaine du ${cur.ws.getDate()}/${cur.ws.getMonth() + 1}` : 'Cette semaine'}</b><button class="icon sm" data-a="sxW" data-d="-1" ${SX.w ? '' : 'disabled'}>›</button></div>
    <div class="grid2 mt8">${statBox('Baddies', fmt(cur.n))}${statBox('Toi', fmt((BDS || []).filter(x => x.uid === myUid() && x.t >= cur.ws.getTime() && x.t < addDays(cur.ws, 7).getTime()).length))}</div>
    <div class="mt8">${sxDelta(sxPct(cur.n, prev.n), vsL)}</div>
</div>

  ${all.length ? `<div class="card"><h3>🏆 Heure de pointe</h3><div class="big" style="color:#FF5FA2">${best ? `${DAYF[best.d]} · ${best.h} h` : '—'}</div>
    <div class="muted sm">Meilleure heure : ${hiH + H0} h · Meilleur jour : ${DAYF[hiD]}</div></div>

  <div class="card"><h3>Par heure</h3>${sxBars(byH, byH.map((_, i) => (i + H0) % 3 === 0 ? i + H0 : ''), hiH)}</div>

  <div class="card"><h3>Par jour</h3>${sxBars(byD, DOW, hiD)}
</div>

  <div class="card"><h3>Carte de chaleur</h3>
    <div style="display:grid;grid-template-columns:18px repeat(${H1 - H0 + 1},1fr);gap:2px;margin-top:10px">
      ${heat.map((r, d) => `<span style="font-size:9px;color:var(--mut,#888)">${DOW[d]}</span>${r.map(v => `<div style="aspect-ratio:1;border-radius:3px;background:${v ? `rgba(255,95,162,${0.2 + 0.8 * v / hm})` : '#ffffff10'}"></div>`).join('')}`).join('')}
      <span></span>${byH.map((_, i) => `<span style="font-size:8px;text-align:center;color:var(--mut,#888)">${(i + H0) % 3 === 0 ? i + H0 : ''}</span>`).join('')}
    </div></div>

  <div class="card"><h3>8 dernières semaines</h3>${sxBars(w8.map(x => x.n), wl, 7)}</div>` : '<p class="muted center mt">Pas encore de données. Tape +1 au gym.</p>'}
`;
}
A.sxAdd = async () => { if (navigator.vibrate) navigator.vibrate(15); try { await AUTH.mod.bdAdd(Date.now(), myName()); } catch (e) { toast('Pas envoyé — check ta connexion'); } };
A.sxUndo = async () => { const L = (BDS || []).filter(x => x.uid === myUid() && dk(x.t) === dk()); const x = L[L.length - 1]; if (!x) return toast('Rien à enlever aujourd’hui'); try { await AUTH.mod.bdDel(x.id); } catch (e) { toast('Erreur — réessaie'); } };
A.sxW = el => { SX.w = Math.max(0, SX.w + +el.dataset.d); paintSheet(); };
A.sxLb = el => { SX.lb = el.dataset.v; paintSheet(); };
A.sxRetry = () => { BDERR = null; BDS = null; bdStart(); paintSheet(); };
