'use strict';
/* ===== LOCKIN — Bienvenue, compte, questionnaire et plan personnalisé ===== */

const GSVG = '<svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/* ---------- compte ---------- */
const AUTH = { mod: null, configured: false, user: null, lastSync: null };
async function initAuth() {
  try {
    const m = await import('./auth.js'); AUTH.mod = m; AUTH.configured = m.configured();
    if (!AUTH.configured) return;
    await m.init({
      getState: () => S,
      setState: r => { const ui = S.ui; S = r; S.ui = ui; migrateState(); rebuildEx(); saveNow(); render(); toast('Données synchronisées ☁️'); },
      onUser: u => { AUTH.user = u; AUTH.ready = true; onAuthUser(u); },
      mergeSteps: obj => { S.steps = S.steps || {}; let ch = false; Object.keys(obj || {}).forEach(k => { if ((+obj[k] || 0) > (S.steps[k] || 0)) { S.steps[k] = +obj[k]; ch = true; } }); if (ch) { save(); render(); } },
      onSynced: t => { AUTH.lastSync = t; const el = $('#syncTxt'); if (el) el.textContent = syncLabel(); },
      toast
    });
    let lastR = 0;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && AUTH.user && Date.now() - lastR > 15000) { lastR = Date.now(); m.refresh().catch(() => { }); } });
  } catch (e) { console.warn('Auth indisponible', e); }
}
const syncLabel = () => AUTH.lastSync ? `Synchro auto · dernière à ${new Date(AUTH.lastSync).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : 'Synchro auto activée';
function onAuthUser(u) {
  const ob = $('#ob');
  if (u && ob.classList.contains('open') && !Q) {
    if (S.settings.profileDone) { closeOb(); render(); toast(`Connecté — salut ${S.settings.name || ''} 👋`); }
    else { initQ(); showQ(); }
  }
  if (SH.length) paintSheet();
}
let AU = { mode: 'signup', email: '', pass: '', busy: false };
const AUTH_ERR = { 'auth/email-already-in-use': 'Ce courriel a déjà un compte — connecte-toi plutôt', 'auth/invalid-email': 'Courriel invalide', 'auth/weak-password': 'Mot de passe trop court (6 caractères min.)', 'auth/invalid-credential': 'Courriel ou mot de passe incorrect', 'auth/wrong-password': 'Mot de passe incorrect', 'auth/user-not-found': 'Aucun compte avec ce courriel', 'auth/too-many-requests': 'Trop d’essais — attends quelques minutes', 'auth/network-request-failed': 'Pas de connexion internet' };
function openAuth(mode) {
  if (!AUTH.configured) {
    return openSheet(() => `<h2 class="sh-t">Compte Lockin</h2>
      <p class="mb">Les comptes vont s’activer une fois ton projet Firebase configuré (gratuit, 5 min).</p>
      <p class="muted sm mb">En attendant, continue sans compte : quand tu vas créer ton compte plus tard, tout ce que t’as déjà entré va être envoyé dedans automatiquement.</p>
      <button class="btn block acc" data-a="closeSheet">OK</button>`);
  }
  AU = { mode, email: AU.email, pass: '', busy: false };
  openSheet(() => `<h2 class="sh-t">${AU.mode === 'signup' ? 'Créer ton compte' : 'Connexion'}</h2>
    <p class="muted sm mb">${AU.mode === 'signup' ? 'Tes données vont être sauvegardées dans le cloud. Tu te connectes une fois, pis tu restes connecté sur ce téléphone.' : 'Connecte-toi pour récupérer tes données.'}</p>
    <label class="fl">Courriel<input type="email" data-i="au" data-k="email" value="${esc(AU.email)}" autocomplete="email" autocapitalize="off" placeholder="toi@exemple.com"></label>
    <label class="fl">Mot de passe<input type="password" data-i="au" data-k="pass" autocomplete="${AU.mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="${AU.mode === 'signup' ? '6 caractères minimum' : ''}"></label>
    <button class="btn block acc mt8" data-a="auGo">${AU.mode === 'signup' ? 'Créer mon compte' : 'Me connecter'}</button>
    <button class="btn block ghost mt8" data-a="auSwitch">${AU.mode === 'signup' ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
    ${AU.mode === 'login' ? '<button class="link mt8 block-link" data-a="auReset">Mot de passe oublié?</button>' : ''}`);
}
I.au = el => AU[el.dataset.k] = el.value.trim();
A.authSignup = () => openAuth('signup');
A.authLogin = () => openAuth('login');
A.googleLogin = async () => {
  if (!AUTH.configured) return openAuth('signup');
  try { toast('Connexion Google...', 1500); await AUTH.mod.google(); closeAllSheets(); }
  catch (e) { console.warn(e); toast(e && e.code === 'auth/popup-closed-by-user' ? 'Connexion annulée' : 'Google marche pas ici — utilise ton courriel', 3000); }
};
A.auSwitch = () => { AU.mode = AU.mode === 'signup' ? 'login' : 'signup'; paintSheet(); };
A.auGo = async () => {
  if (AU.busy) return; if (!AU.email || !AU.pass) return toast('Entre ton courriel et ton mot de passe');
  AU.busy = true; toast(AU.mode === 'signup' ? 'Création du compte...' : 'Connexion...', 1500);
  try { AU.mode === 'signup' ? await AUTH.mod.signup(AU.email, AU.pass) : await AUTH.mod.login(AU.email, AU.pass); closeSheet(); }
  catch (e) { console.warn(e); toast(AUTH_ERR[e.code] || 'Erreur — réessaie', 2800); }
  AU.busy = false;
};
A.auReset = async () => {
  if (!AU.email) return toast('Entre ton courriel d’abord');
  try { await AUTH.mod.resetPassword(AU.email); toast('Courriel de réinitialisation envoyé 📧', 2800); } catch (e) { toast(AUTH_ERR[e.code] || 'Erreur — réessaie'); }
};
A.logout = () => confirmSheet('Se déconnecter?', 'Tes données restent sur ce téléphone. Elles se resynchronisent quand tu te reconnectes.', 'Déconnexion', async () => { await AUTH.mod.logout(); AUTH.user = null; closeAllSheets(); toast('Déconnecté'); }, false);
A.syncNow = async () => { try { await AUTH.mod.syncNow(); toast('Synchronisé ☁️'); } catch (e) { toast('Synchro impossible'); } };
function accountHTML() {
  const u = AUTH.user;
  if (u) return `<div class="acct"><div class="acct-av">${esc((S.settings.name || u.email || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(S.settings.name || 'Mon compte')}</b><div class="muted sm">${esc(u.email || '')}</div><div class="sm ok" id="syncTxt">${syncLabel()}</div></div></div>
    <div class="grid2 mt8"><button class="btn sm" data-a="syncNow">☁️ Synchroniser</button><button class="btn sm ghost" data-a="logout">Déconnexion</button></div>`;
  return `<div class="acct"><div class="acct-av">🔒</div><div class="grow"><b>Pas connecté</b><div class="muted sm">Connecte-toi pour sauvegarder tes données dans le cloud et les avoir sur tous tes appareils.</div></div></div>
    <div class="grid2 mt8"><button class="btn sm acc" data-a="authSignup">Créer un compte</button><button class="btn sm" data-a="authLogin">Me connecter</button></div>`;
}

/* ---------- écran de bienvenue ---------- */
function openWelcome() {
  Q = null;
  const el = $('#ob'); el.classList.add('open'); document.body.classList.add('lock');
  el.innerHTML = `<div class="ob-welcome">
    <div class="ob-logo"><img src="icon-512.png" alt=""></div>
    <h1>Lockin</h1>
    <p class="muted">Track ton gym, ta bouffe pis ton corps.<br>Reste constant. Vois tes progrès.</p>
    <div class="ob-feats">
      <div><span>📈</span><div><b>Progression automatique</b><small>L’app te dit quoi lever à chaque série</small></div></div>
      <div><span>🗓️</span><div><b>Constance visible</b><small>Streak, calendrier, objectif hebdo</small></div></div>
      <div><span>🍗</span><div><b>Calories & protéines</b><small>Calculées selon ton corps et ton objectif</small></div></div>
      <div><span>🎥</span><div><b>Coach caméra IA</b><small>Compte tes reps et note ta forme</small></div></div>
    </div>
    <button class="btn block acc big-btn" data-a="authSignup">Créer un compte</button>
    <button class="btn block mt8" data-a="authLogin">J’ai déjà un compte</button>
    <button class="btn block ghost mt8" data-a="obStart">Continuer sans compte</button>
    <p class="muted sm center mt8">Avec un compte, tes données sont sauvegardées dans le cloud. Tu te connectes une fois et tu restes connecté sur ce téléphone.</p>
  </div>`;
}
function closeOb() { Q = null; $('#ob').classList.remove('open'); document.body.classList.remove('lock'); setTimeout(() => { if (!Q) $('#ob').innerHTML = ''; }, 350); }
A.obStart = () => { initQ(); showQ(); };
A.redoQuiz = () => { closeAllSheets(); const el = $('#ob'); el.classList.add('open'); document.body.classList.add('lock'); initQ(); showQ(); };

/* ---------- questionnaire ---------- */
let Q = null, QS = 0;
function initQ(name) {
  const s = S.settings, P = S.profile || {}, bw = latestBW();
  Q = {
    name: name || s.name || '', sex: s.sex || 'h', age: s.age || '', unit: s.unit || 'lb',
    hcm: s.height || '', hft: '', hin: '', weight: bw ? bw.w : '', bf: P.bf ?? '', bfHelp: false,
    goal: P.goal || '', goalWeight: s.goalWeight || '', pace: P.pace || 'normal', exp: P.exp || '',
    days: s.weeklyTarget || 4, duration: P.duration || 60, equip: P.equip || 'gym', focus: P.focus || [],
    job: P.job || '', sleep: P.sleep || 7, diet: P.diet || [], injuries: P.injuries || [], notes: P.notes || '',
    replace: !S.workouts.length || !s.profileDone
  };
  if (Q.hcm) { const ti = Q.hcm / 2.54; Q.hft = Math.floor(ti / 12); Q.hin = Math.round(ti % 12); if (Q.hin === 12) { Q.hft++; Q.hin = 0; } }
  QS = 0;
}
const opt = (k, v, title, sub, icon) => `<button class="opt ${Q[k] === v ? 'on' : ''}" data-a="qSet" data-k="${k}" data-v="${v}">${icon ? `<span class="opt-i">${icon}</span>` : ''}<div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></button>`;
const seg = (k, vals) => `<div class="seg">${vals.map(([v, l]) => `<button class="${String(Q[k]) === String(v) ? 'on' : ''}" data-a="qSet" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const tog = (k, v, l) => `<button class="chip ${Q[k].includes(v) ? 'on' : ''}" data-a="qTog" data-k="${k}" data-v="${v}">${l}</button>`;
const qin = (k, ph, mode = 'decimal', extra = '') => `<input data-i="q" data-k="${k}" inputmode="${mode}" value="${esc(Q[k])}" placeholder="${ph}" ${extra}>`;
const heightCm = () => Q.unit === 'kg' ? num(Q.hcm) : ((num(Q.hft) || 0) * 12 + (num(Q.hin) || 0)) * 2.54 || null;
const BF_H = [[9, 'Très sec', 'abdos bien visibles'], [13, 'Athlétique', 'abdos visibles'], [17, 'En forme', 'abdos légers'], [21, 'Moyen', 'un peu de ventre'], [26, 'Au-dessus', 'ventre visible'], [32, 'Élevé', '']];
const BF_F = [[16, 'Très sèche', 'abdos visibles'], [20, 'Athlétique', 'tonique'], [24, 'En forme', 'peu de gras'], [28, 'Moyenne', 'quelques courbes'], [33, 'Au-dessus', ''], [38, 'Élevé', '']];

const STEPS = [
  { t: 'On commence par toi', s: 'Pour calculer tes besoins et ton plan.', ok: () => Q.name.trim() && num(Q.age) >= 12 && num(Q.age) <= 90,
    r: () => `<label class="fl">Prénom${qin('name', 'Prénom', 'text', 'autocomplete="given-name"')}</label>
      <label class="fl">Sexe${seg('sex', [['h', 'Homme'], ['f', 'Femme']])}</label>
      <label class="fl">Âge${qin('age', 'ex. 22', 'numeric')}</label>` },
  { t: 'Ta grandeur', s: 'Et l’unité que tu utilises au gym.', ok: () => { const h = heightCm(); return h > 120 && h < 230; },
    r: () => `<label class="fl">Unité de poids${seg('unit', [['lb', 'Livres (lb)'], ['kg', 'Kilos (kg)']])}</label>
      ${Q.unit === 'kg' ? `<label class="fl">Grandeur (cm)${qin('hcm', 'ex. 178', 'numeric')}</label>` : `<label class="fl">Grandeur</label><div class="grid2"><label class="fl">Pieds${qin('hft', '5', 'numeric')}</label><label class="fl">Pouces${qin('hin', '10', 'numeric')}</label></div>`}` },
  { t: 'Ton poids et ton % de gras', s: 'Pèse-toi le matin à jeun si possible.', ok: () => { const w = num(Q.weight); return w > (Q.unit === 'kg' ? 30 : 66) && w < (Q.unit === 'kg' ? 300 : 660); },
    r: () => `<label class="fl">Poids actuel (${Q.unit})${qin('weight', Q.unit === 'kg' ? 'ex. 80' : 'ex. 175')}</label>
      <label class="fl">% de gras (body fat) <span class="muted">— optionnel</span>${qin('bf', 'ex. 15')}</label>
      <button class="link" data-a="qBfHelp">${Q.bfHelp ? 'Cacher' : 'Je sais pas → estime avec moi'}</button>
      ${Q.bfHelp ? `<p class="muted sm mt8 mb">Choisis ce qui ressemble le plus à toi dans le miroir :</p><div class="bfgrid">${(Q.sex === 'f' ? BF_F : BF_H).map(([v, l, d]) => `<button class="opt ${num(Q.bf) === v ? 'on' : ''}" data-a="qSet" data-k="bf" data-v="${v}"><div><b>~${v} %</b><small>${l}${d ? ' · ' + d : ''}</small></div></button>`).join('')}</div>` : ''}` },
  { t: 'Ton objectif principal', s: 'Ça change tes calories, tes reps et ton programme.', ok: () => !!Q.goal,
    r: () => opt('goal', 'cut', 'Perdre du gras', 'Sèche — devenir plus défini', '🔥') + opt('goal', 'bulk', 'Prendre de la masse', 'Bulk propre — plus de muscle', '💪') + opt('goal', 'recomp', 'Recomposition', 'Perdre du gras et gagner du muscle en même temps', '⚖️') + opt('goal', 'strength', 'Devenir plus fort', 'Monter tes max (bench, squat, deadlift)', '🏋️') + opt('goal', 'health', 'Être en forme', 'Santé, énergie, constance', '❤️') },
  { t: 'Ta cible', s: 'À quel poids tu veux arriver, et à quel rythme?', skip: () => !['cut', 'bulk', 'recomp'].includes(Q.goal), ok: () => !Q.goalWeight || num(Q.goalWeight) > 0,
    r: () => `<label class="fl">Poids objectif (${Q.unit}) <span class="muted">— optionnel</span>${qin('goalWeight', Q.goal === 'bulk' ? 'ex. 185' : 'ex. 165')}</label>
      ${Q.goal !== 'recomp' ? `<label class="fl">Rythme</label>` + opt('pace', 'lent', 'Lent et durable', Q.goal === 'cut' ? '≈ −0,3 kg / semaine · garde le max de muscle' : '≈ +0,2 kg / semaine · le plus propre', '🐢') + opt('pace', 'normal', 'Normal', Q.goal === 'cut' ? '≈ −0,5 kg / semaine' : '≈ +0,3 kg / semaine', '🚶') + opt('pace', 'agressif', 'Agressif', Q.goal === 'cut' ? '≈ −0,7 kg / semaine · plus dur à tenir' : '≈ +0,45 kg / semaine · plus de gras pris', '🚀') : ''}` },
  { t: 'Ton expérience au gym', s: 'Depuis combien de temps tu t’entraînes sérieusement?', ok: () => !!Q.exp,
    r: () => opt('exp', 'debutant', 'Débutant', 'Moins d’un an', '🌱') + opt('exp', 'inter', 'Intermédiaire', '1 à 3 ans', '⚡') + opt('exp', 'avance', 'Avancé', 'Plus de 3 ans', '🦍') },
  { t: 'Ton horaire', s: 'Sois réaliste — la constance bat l’intensité.', ok: () => true,
    r: () => `<label class="fl">Séances par semaine${seg('days', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']])}</label>
      <label class="fl">Durée d’une séance${seg('duration', [[30, '30 min'], [45, '45'], [60, '60'], [75, '75'], [90, '90+']])}</label>` },
  { t: 'Où tu t’entraînes?', s: 'On adapte les exercices à ton équipement.', ok: () => !!Q.equip,
    r: () => opt('equip', 'gym', 'Gym complet', 'Barres, haltères, machines, poulies', '🏢') + opt('equip', 'home', 'À la maison', 'Haltères + banc', '🏠') + opt('equip', 'bw', 'Poids du corps', 'Aucun équipement (barre de traction idéalement)', '🤸') },
  { t: 'Muscles prioritaires', s: 'On ajoute du volume là-dessus. Choisis-en 0 à 3.', ok: () => true,
    r: () => `<div class="chips">${['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Fessiers', 'Abdos'].map(m => tog('focus', m, m)).join('')}</div><p class="muted sm mt8">Rien de choisi = programme équilibré.</p>` },
  { t: 'Ton mode de vie', s: 'Ton activité hors gym change beaucoup tes calories.', ok: () => !!Q.job,
    r: () => opt('job', 'sed', 'Assis la plupart du temps', 'Bureau, école, auto', '🪑') + opt('job', 'debout', 'Debout / je marche beaucoup', 'Commerce, service, 8k+ pas', '🚶') + opt('job', 'physique', 'Job physique', 'Construction, lavage, déménagement...', '🔨') +
      `<label class="fl mt">Heures de sommeil par nuit${seg('sleep', [[5, '≤5'], [6, '6'], [7, '7'], [8, '8'], [9, '9+']])}</label>` },
  { t: 'Ton alimentation', s: 'Pour adapter tes cibles et tes suggestions.', ok: () => true,
    r: () => `<div class="chips">${['Végétarien', 'Végane', 'Sans lactose', 'Sans gluten', 'Halal', 'Je cuisine peu', 'Je mange souvent au resto'].map(m => tog('diet', m, m)).join('')}</div><p class="muted sm mt8">Rien de choisi = tout me va.</p>` },
  { t: 'Blessures ou limites?', s: 'On remplace les exercices à risque.', ok: () => true,
    r: () => `<div class="chips">${['Genoux', 'Bas du dos', 'Épaules', 'Coudes', 'Poignets'].map(m => tog('injuries', m, m)).join('')}</div>
      <label class="fl mt">Autre chose à savoir? <span class="muted">— optionnel</span><textarea data-i="q" data-k="notes" rows="3" placeholder="ex. vieille entorse à la cheville">${esc(Q.notes)}</textarea></label>` },
  { t: 'Ton plan Lockin', s: 'Calculé à partir de tes réponses. Tu peux tout modifier après.', plan: true, ok: () => true, r: () => planHTML() }
];

function showQ() {
  while (STEPS[QS] && STEPS[QS].skip && STEPS[QS].skip()) QS++;
  const st = STEPS[QS], n = STEPS.filter(x => !(x.skip && x.skip())).length, idx = STEPS.slice(0, QS + 1).filter(x => !(x.skip && x.skip())).length;
  $('#ob').innerHTML = `<div class="q">
    <div class="q-top"><button class="icon" data-a="qBack">${QS ? '‹' : IC.x}</button><div class="track grow"><div class="fill" style="width:${idx / n * 100}%"></div></div><span class="muted sm">${idx}/${n}</span></div>
    <div class="q-body"><h1>${st.t}</h1><p class="muted mb">${st.s}</p>${st.r()}</div>
    <div class="q-foot">${st.plan ? `<button class="btn block acc big-btn" data-a="qFinish">Let’s lock in 🔒</button>` : `<button class="btn block acc big-btn" data-a="qNext" ${st.ok() ? '' : 'disabled'}>Continuer</button>`}</div>
  </div>`;
  $('#ob .q-body').scrollTop = 0;
}
function qValid() { const b = $('[data-a="qNext"]'); if (b) b.disabled = !STEPS[QS].ok(); }
I.q = el => { Q[el.dataset.k] = el.value; qValid(); };
A.qSet = el => {
  const k = el.dataset.k, v = el.dataset.v;
  if (k === 'unit' && v !== Q.unit) {
    const h = heightCm(), f = v === 'kg' ? 0.45359237 : 2.20462262;
    if (h) { if (v === 'kg') Q.hcm = Math.round(h); else { const ti = h / 2.54; Q.hft = Math.floor(ti / 12); Q.hin = Math.round(ti % 12); } }
    ['weight', 'goalWeight'].forEach(x => { if (num(Q[x])) Q[x] = Math.round(num(Q[x]) * f * 10) / 10; });
  }
  Q[k] = isNaN(+v) || k === 'unit' ? v : +v;
  const sc = $('#ob .q-body')?.scrollTop || 0; showQ(); $('#ob .q-body').scrollTop = sc;
};
A.qTog = el => { const k = el.dataset.k, v = el.dataset.v, L = Q[k]; L.includes(v) ? L.splice(L.indexOf(v), 1) : (k !== 'focus' || L.length < 3) && L.push(v); const sc = $('#ob .q-body')?.scrollTop || 0; showQ(); $('#ob .q-body').scrollTop = sc; };
A.qBfHelp = () => { Q.bfHelp = !Q.bfHelp; showQ(); };
A.qNext = () => { if (!STEPS[QS].ok()) return; QS++; showQ(); };
A.qBack = () => {
  if (!QS) { if (S.settings.profileDone) closeOb(); else openWelcome(); return; }
  QS--; while (QS > 0 && STEPS[QS].skip && STEPS[QS].skip()) QS--; showQ();
};
A.qReplace = () => { Q.replace = !Q.replace; const sc = $('#ob .q-body').scrollTop; showQ(); $('#ob .q-body').scrollTop = sc; };

/* ---------- calcul du plan ---------- */
function computePlan() {
  const w = num(Q.weight), kg = Q.unit === 'kg' ? w : w * 0.45359237, h = heightCm(), age = num(Q.age), bf = num(Q.bf);
  const bmr = bf ? 370 + 21.6 * kg * (1 - bf / 100) : 10 * kg + 6.25 * h - 5 * age + (Q.sex === 'h' ? 5 : -161);
  const base = { sed: 1.2, debout: 1.375, physique: 1.55 }[Q.job] || 1.3;
  const act = Math.min(1.95, base + Q.days * 0.045 * (Q.duration / 60));
  const tdee = bmr * act;
  const adj = Q.goal === 'cut' ? { lent: -300, normal: -500, agressif: -750 }[Q.pace] : Q.goal === 'bulk' ? { lent: 200, normal: 300, agressif: 500 }[Q.pace] : Q.goal === 'recomp' ? -200 : Q.goal === 'strength' ? 150 : 0;
  const cal = Math.round((tdee + adj) / 10) * 10;
  const pk = (Q.goal === 'cut' ? 2.2 : Q.goal === 'recomp' ? 2.2 : 2.0) * (Q.diet.includes('Végane') ? 1.1 : 1);
  const p = Math.round(bf ? Math.min(kg * pk, kg * (1 - bf / 100) * 2.7) : kg * pk);
  const f = Math.round(Math.max(kg * 0.7, cal * 0.25 / 9));
  const c = Math.max(50, Math.round((cal - p * 4 - f * 9) / 4));
  const water = Math.round((kg * 35 + (Q.job === 'physique' ? 750 : 0) + 500) / 250) * 250;
  let weeks = null; const gw = num(Q.goalWeight);
  if (gw && adj) { const dkg = Math.abs((Q.unit === 'kg' ? gw : gw * 0.45359237) - kg); weeks = Math.ceil(dkg / (Math.abs(adj) * 7 / 7700)); }
  const sleepTip = Q.sleep <= 6;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), cal, p, c, f, water, act: Math.round(act * 1000) / 1000, adj, weeks, sleepTip };
}
const SWAPS = {
  'Genoux': { squat: 'hip_thrust', front_squat: 'leg_press', hack: 'leg_press', lunge: 'glute_bridge', bulgarian: 'hip_thrust', goblet: 'glute_bridge', step_up: 'cable_kick', leg_ext: 'leg_curl' },
  'Bas du dos': { deadlift: 'hip_thrust', rack_pull: 'hip_thrust', rdl: 'leg_curl', good_morning: 'seated_curl', bb_row: 'machine_row', tbar_row: 'machine_row', squat: 'leg_press', back_ext: 'glute_bridge' },
  'Épaules': { ohp: 'shoulder_press_m', db_ohp: 'cable_lat', bench: 'db_bench', incline_bench: 'db_incline', dips: 'rope_pushdown', dips_chest: 'pec_deck', upright_row: 'face_pull', arnold: 'cable_lat' },
  'Coudes': { skull: 'rope_pushdown', oh_ext: 'rope_pushdown', bb_curl: 'hammer', ez_curl: 'hammer', cgbp: 'rope_pushdown' },
  'Poignets': { bb_curl: 'cable_curl', ez_curl: 'cable_curl', front_squat: 'goblet', pushup: 'chest_press' }
};
const FOCUS = { 'Pectoraux': ['Pectoraux'], 'Dos': ['Dos'], 'Épaules': ['Épaules'], 'Bras': ['Biceps', 'Triceps'], 'Jambes': ['Quadriceps', 'Ischios', 'Mollets'], 'Fessiers': ['Fessiers'], 'Abdos': ['Abdos'] };
function buildProgram() {
  const k = Q.equip === 'home' ? 'home' : Q.equip === 'bw' ? 'bw' : Q.days <= 3 ? (Q.goal === 'strength' ? 'fivex5' : 'fb') : Q.days === 4 ? 'ul' : 'ppl';
  const rs = presetPack(k);
  const maxEx = { 30: 3, 45: 4, 60: 5, 75: 6, 90: 7 }[Q.duration] || 5;
  const fm = new Set(Q.focus.flatMap(f => FOCUS[f] || []));
  rs.forEach(r => {
    Q.injuries.forEach(inj => r.ex.forEach(e => { const sw = SWAPS[inj]?.[e.exId]; if (sw) e.exId = sw; }));
    const seen = new Set(); r.ex = r.ex.filter(e => !seen.has(e.exId) && seen.add(e.exId));
    // priorités : on garde les exos prioritaires même si la séance est courte
    if (r.ex.length > maxEx) { const pri = r.ex.filter((e, i) => i < 2 || fm.has(EX(e.exId).muscle)); const chosen = new Set([...pri, ...r.ex.filter(e => !pri.includes(e))].slice(0, maxEx)); r.ex = r.ex.filter(e => chosen.has(e)); }
    r.ex.forEach((e, i) => {
      if (fm.has(EX(e.exId).muscle)) e.sets += 1;
      if (Q.exp === 'debutant') e.sets = Math.min(e.sets, 3);
      if (Q.goal === 'strength' && i < 2 && EX(e.exId).type === 'w' && k !== 'fivex5') e.reps = '3-6';
    });
  });
  return { k, rs, name: (PACKS.find(p => p[0] === k) || [])[1] || 'Programme' };
}
function planHTML() {
  const P = computePlan(), pr = buildProgram();
  const gl = { cut: 'Sèche', bulk: 'Prise de masse', recomp: 'Recomposition', strength: 'Force', health: 'Forme / santé' }[Q.goal];
  return `<div class="card plan-cal"><div class="muted sm">Calories par jour</div><div class="huge">${fmt(P.cal)}</div>
      <div class="muted sm">Maintien estimé ${fmt(P.tdee)} cal · ${P.adj ? (P.adj > 0 ? '+' : '') + P.adj + ' cal pour ' + gl.toLowerCase() : gl}</div>
      <div class="grid3 mt">${statBox('Protéines', P.p + ' g')}${statBox('Glucides', P.c + ' g')}${statBox('Lipides', P.f + ' g')}</div>
      <div class="muted sm mt8">💧 Eau : ${fmt(P.water / 1000, 2)} L/jour${P.weeks ? ` · 🎯 objectif atteint dans ~${P.weeks} semaines` : ''}</div></div>
    <div class="card"><h3>Programme · ${esc(pr.name)}</h3><div class="muted sm mb">${Q.days} séances/semaine · ~${Q.duration} min${Q.injuries.length ? ' · adapté : ' + Q.injuries.join(', ').toLowerCase() : ''}${Q.focus.length ? ' · priorité : ' + Q.focus.join(', ').toLowerCase() : ''}</div>
      ${pr.rs.map(r => `<div class="plan-r"><b>${esc(r.name)}</b><div class="muted sm">${r.ex.map(e => `${esc(EX(e.exId).name)} ${e.sets}×${e.reps}`).join(' · ')}</div></div>`).join('')}
      <label class="toggle mt8"><span>${S.routines.length && S.workouts.length ? 'Remplacer mes routines actuelles' : 'Utiliser ce programme'}</span><input type="checkbox" ${Q.replace ? 'checked' : ''} data-a="qReplace"></label></div>
    <div class="card"><h3>Tes repères</h3>
      <div class="ins"><span class="ins-i">📈</span><div><b>Progression</b><div class="muted sm">${Q.exp === 'debutant' ? 'Débutant = gains rapides : ajoute du poids presque chaque séance tant que la forme est bonne.' : Q.exp === 'inter' ? 'Vise +1 rep ou +5 lb par semaine sur tes gros exercices. L’app te le suggère à chaque série.' : 'Tes gains sont plus lents : mise sur le volume (séries) et des deloads aux 5-6 semaines.'}</div></div></div>
      ${P.sleepTip ? `<div class="ins"><span class="ins-i">😴</span><div><b>Sommeil</b><div class="muted sm">${Q.sleep} h c’est court — 7-9 h peut faire une grosse différence sur ta récup et ta faim.</div></div></div>` : ''}
      ${Q.goal === 'cut' ? `<div class="ins"><span class="ins-i">⚖️</span><div><b>Pèse-toi chaque matin</b><div class="muted sm">Regarde la moyenne de 7 jours, pas la pesée du jour.</div></div></div>` : ''}
      ${num(Q.bf) ? `<div class="ins"><span class="ins-i">🧬</span><div><b>Masse maigre ≈ ${fmt(num(Q.weight) * (1 - num(Q.bf) / 100), 1)} ${Q.unit}</b><div class="muted sm">Calcul basé sur ton % de gras (${fmt(num(Q.bf), 1)} %).</div></div></div>` : ''}
    </div>`;
}
A.qFinish = () => {
  const P = computePlan(), pr = buildProgram(), s = S.settings;
  if (Q.unit !== s.unit) C.stUnit({ value: Q.unit });
  s.name = Q.name.trim(); s.sex = Q.sex; s.age = num(Q.age); s.height = Math.round(heightCm());
  s.weeklyTarget = Q.days; s.gymDays = defaultGymDays(Q.days); s.activity = P.act; s.goalType = Q.goal === 'cut' ? 'cut' : Q.goal === 'bulk' ? 'bulk' : 'maintain';
  s.goalWeight = num(Q.goalWeight) || null;
  s.goals = { cal: P.cal, p: P.p, c: P.c, f: P.f, water: P.water };
  s.onboarded = true; s.profileDone = true;
  const k = dk(), w = num(Q.weight);
  const e = S.body.find(b => b.d === k); if (e) e.w = w; else { S.body.push({ d: k, w }); S.body.sort((a, b) => a.d < b.d ? -1 : 1); }
  if (num(Q.bf)) { let m = S.meas.find(x => x.d === k); if (!m) { m = { d: k }; S.meas.push(m); S.meas.sort((a, b) => a.d < b.d ? -1 : 1); } m.bf = num(Q.bf); }
  S.profile = { goal: Q.goal, pace: Q.pace, exp: Q.exp, duration: Q.duration, equip: Q.equip, focus: Q.focus, job: Q.job, sleep: Q.sleep, diet: Q.diet, injuries: Q.injuries, notes: Q.notes, bf: num(Q.bf), program: pr.k, at: Date.now() };
  if (Q.replace) S.routines = pr.rs;
  save(); closeOb(); S.ui.tab = 'home'; render();
  toast(`Ton plan est prêt, ${s.name} 🔒`, 2600);
};

/* conseils basés sur le profil */
const _insights = insights;
insights = function () {
  const out = _insights(), P = S.profile;
  if (P && P.sleep && P.sleep <= 6 && out.length < 5) out.push({ i: '😴', t: 'Dors plus pour progresser', s: `T’as dit dormir ~${P.sleep} h. Vise 7-9 h : récup, force et faim vont mieux.` });
  if (P && P.focus && P.focus.length && out.length < 5) {
    const lm = lastMuscleDates(), miss = P.focus.flatMap(f => FOCUS[f] || []).filter(m => !lm[m] || daysBetween(lm[m], Date.now()) >= 6);
    if (miss.length) out.push({ i: '🎯', t: `Priorité : ${miss.slice(0, 2).join(', ')}`, s: 'C’est ton focus et ça fait 6+ jours. Mets-les dans ta prochaine séance.' });
  }
  return out.slice(0, 6);
};

/* ---------- NOTIFICATIONS (rappels eau / bouffe / suppléments) ---------- */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const isStandalone = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
function notifOn() { return !!(S.pushCfg && S.pushCfg.sub) && typeof Notification !== 'undefined' && Notification.permission === 'granted'; }
function notifHTML() {
  const N = S.settings.notif || {};
  const tg = (k, l, d) => `<label class="toggle"><span>${l}<small class="muted" style="display:block;font-weight:500;font-size:12.5px">${d}</small></span><input type="checkbox" data-i="notifTog" data-k="${k}" ${N[k] !== false ? 'checked' : ''}></label>`;
  return `<h3 class="mt">Notifications</h3>
    ${notifOn() ? `<div class="acct"><div class="acct-av">🔔</div><div class="grow"><b>Activées sur ce téléphone</b><div class="muted sm">Vérifié chaque heure, entre 8 h et 21 h.</div></div></div>`
      : `<button class="btn block acc" data-a="enableNotifs">🔔 Activer les notifications</button><p class="muted sm mt8">Il faut être connecté à ton compte et ouvrir Lockin à partir de l’icône sur ton écran d’accueil.</p>`}
    ${tg('water', '💧 Eau', 'Si t’es en retard sur ton objectif (10 h à 20 h)')}
    ${tg('food', '🍗 Bouffe', 'À 13 h et 19 h si t’as pas assez mangé')}
    ${tg('supps', '💊 Suppléments', 'À l’heure choisie si c’est pas coché')}
    ${tg('forgot', '📝 Oublis', '21 h : ce qui manque aujourd’hui · 9 h : si hier est incomplet')}
    ${notifOn() ? `<button class="btn block ghost sm mt8" data-a="enableNotifs">Réactiver / réparer les notifications</button>` : ''}`;
}
C.notifTog = el => { S.settings.notif = S.settings.notif || {}; S.settings.notif[el.dataset.k] = el.checked; save(); };
A.enableNotifs = async () => {
  if (!AUTH.user) return toast('Connecte-toi à ton compte d’abord (en haut des Réglages)', 2800);
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return openSheet(() => `<h2 class="sh-t">Notifications</h2><p class="mb">${isStandalone() ? 'Ton iPhone supporte pas les notifications web. Mets-le à jour (iOS 16.4 ou plus récent).' : 'Sur iPhone, les notifications marchent juste quand Lockin est ouverte à partir de l’icône sur ton écran d’accueil (pas dans Safari).'}</p><button class="btn block acc" data-a="closeSheet">OK</button>`);
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Refusé — active-les dans Réglages iPhone › Notifications › Lockin', 3500);
    const reg = await navigator.serviceWorker.ready;
    if (!S.pushCfg || !S.pushCfg.pub || !S.pushCfg.priv) {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const raw = await crypto.subtle.exportKey('raw', kp.publicKey), jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      S.pushCfg = { pub: b64u(raw), priv: jwk.d };
    }
    const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(S.pushCfg.pub) });
    S.pushCfg.sub = sub.toJSON();
    try { S.settings.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { }
    S.settings.notif = S.settings.notif || { water: true, food: true, supps: true };
    save(); await AUTH.mod.syncNow();
    reg.showNotification('Lockin 🔒', { body: 'Notifications activées ✅', icon: 'icon-192.png', tag: 'on' });
    if (SH.length) paintSheet(); toast('Notifications activées ✅');
  } catch (e) { console.error(e); toast('Erreur : ' + (e.message || e), 4000); }
};

/* ---------- démarrage ---------- */
render();
if (!S.settings.profileDone) openWelcome();
initAuth();
handleLink();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
