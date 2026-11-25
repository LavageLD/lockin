/* ===== LOCKIN — réchauffement (bands + poids du corps seulement) ===== */
const WU = {
  general: [['Jumping jacks', '60 s', 'Monte ton cardio pis ta température']],
  push: [['Arm circles', '20 s chaque sens', 'Lubrifie les épaules'], ['Band pull-aparts', '2 × 15', 'Active le haut du dos, protège les épaules'], ['Scapular push-ups', '1 × 10', 'Réveille les omoplates']],
  pull: [['Cat-cow', '10 reps', 'Mobilise la colonne'], ['Band lat pulldowns', '1 × 15', 'Active les dorsaux'], ['Dead hang', '2 × 20 s', 'Ouvre les épaules pis décompresse']],
  legs: [['Bodyweight squats', '2 × 10', 'Ouvre hanches pis genoux'], ['Glute bridges', '1 × 15', 'Active les fessiers, protège le bas du dos'], ['Ankle rocks', '10 chaque côté', 'Mobilité des chevilles pour descendre plus creux']],
  hinge: [['Bird dogs', '8 chaque côté', 'Stabilise le tronc'], ['Bodyweight good mornings', '1 × 12', 'Pratique le mouvement de hanche']],
  arms: [['Wrist circles', '30 s', 'Prépare les poignets'], ['Band curls', '1 × 20', 'Envoie du sang dans les coudes']],
};
const WU_INJ = {
  'Genoux': [['Band terminal knee extensions', '15 chaque côté', 'Renforce le genou en douceur'], ['Wall sit', '30 s', 'Prépare le genou sans impact']],
  'Bas du dos': [['Dead bugs', '8 chaque côté', 'Gaine le tronc pour protéger le dos'], ['Cat-cow', '10 reps', 'Mobilise la colonne']],
  'Épaules': [['Band face pulls', '2 × 15', 'Renforce l’arrière de l’épaule'], ['Band external rotations', '15 chaque côté', 'Stabilise la coiffe des rotateurs']],
  'Coudes': [['Band triceps pushdowns', '1 × 20', 'Réchauffe le coude sans stress'], ['Band curls', '1 × 20', 'Envoie du sang dans les coudes']],
  'Poignets': [['Wrist circles', '30 s', 'Prépare les poignets'], ['Prayer stretch', '30 s', 'Étire les avant-bras']],
};
const INJ_LIST = ['Genoux', 'Bas du dos', 'Épaules', 'Coudes', 'Poignets'];
function injuries() { return (S.profile && S.profile.injuries) || []; }
function wuGroups(ex) {
  const g = new Set();
  ex.filter(e => e.on).forEach(e => {
    const x = EX(e.exId), m = x.muscle;
    if (/dead|rdl|good_morning|rack_pull|hip_thrust/.test(e.exId) || m === 'Ischios') g.add('hinge');
    if (['Pectoraux', 'Épaules', 'Triceps'].includes(m)) g.add('push');
    if (['Dos', 'Biceps', 'Avant-bras'].includes(m)) g.add('pull');
    if (['Quadriceps', 'Ischios', 'Fessiers', 'Mollets'].includes(m)) g.add('legs');
    if (['Biceps', 'Triceps', 'Avant-bras'].includes(m)) g.add('arms');
  });
  if (!g.size) ['push', 'pull', 'legs'].forEach(x => g.add(x));
  return [...g];
}
function wuList(ex) {
  const out = [], seen = new Set(), add = (it, tag) => { if (seen.has(it[0])) return; seen.add(it[0]); out.push({ n: it[0], d: it[1], why: it[2], tag }); };
  add(WU.general[0]);
  injuries().forEach(inj => (WU_INJ[inj] || []).forEach(it => add(it, inj)));
  const gs = wuGroups(ex), per = gs.length >= 3 ? 1 : 2;
  gs.forEach(g => WU[g].slice(0, per).forEach(it => add(it)));
  return out.slice(0, 7);
}
function wuHTML() {
  if (!QL) return '';
  const done = (S.warmups || {})[QL.date], open = QL.wuOpen != null ? QL.wuOpen : !done;
  const L = wuList(QL.ex);
  return `<div class="card inset wu mb">
    <button class="row between wuhead" data-a="wuOpen" style="width:100%;background:none;border:0;color:inherit;padding:0;text-align:left">
      <b>🔥 Réchauffement ${done ? '<span class="ok">✓ fait</span>' : `<span class="muted sm">· ~5 min · ${L.length} exos</span>`}</b><span class="muted">${open ? '▴' : '▾'}</span></button>
    ${open ? `<div class="mt8">${L.map(x => `<div class="hrow" style="align-items:flex-start;gap:10px"><span class="grow"><b>${esc(x.n)}</b>${x.tag ? ` <span class="chip" style="padding:1px 7px;font-size:11px">🩹 ${esc(x.tag)}</span>` : ''}<div class="muted sm">${esc(x.why)}</div></span><b class="sm" style="white-space:nowrap">${esc(x.d)}</b></div>`).join('')}
      <p class="muted sm mt8">Bands pis poids du corps seulement. ${injuries().length ? '' : 'Ajoute tes blessures dans Réglages pour des exos ciblés.'}</p>
      ${done ? '' : `<button class="btn block acc mt8" data-a="wuDone">Réchauffement fait ✓</button>`}</div>` : ''}
  </div>`;
}
A.wuOpen = () => { const done = (S.warmups || {})[QL.date]; QL.wuOpen = !(QL.wuOpen != null ? QL.wuOpen : !done); paintSheet(); };
A.wuDone = () => { (S.warmups = S.warmups || {})[QL.date] = true; QL.wuOpen = false; save(); paintSheet(); toast('🔥 Let’s go'); };
A.injTog = el => { S.profile = S.profile || {}; const a = S.profile.injuries = S.profile.injuries || [], m = el.dataset.m, i = a.indexOf(m); i < 0 ? a.push(m) : a.splice(i, 1); save(); paintSheet(); };
function injHTML() { return `<div class="muted sm mt8">Blessures / zones fragiles <span class="muted">(pour ton réchauffement)</span></div><div class="chips mt8">${INJ_LIST.map(m => `<button class="chip ${injuries().includes(m) ? 'on' : ''}" data-a="injTog" data-m="${m}">${m}</button>`).join('')}</div>`; }

// insère la section en haut de l'écran « Cocher une séance »
const _qlRender = qlRender;
qlRender = function () { return _qlRender().replace(/(<input type="date"[^>]*><\/label>)/, '$1' + wuHTML()); };
