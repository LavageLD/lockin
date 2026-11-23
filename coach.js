/* ===== LOCKIN — Coach caméra (analyse de forme + compteur de reps par IA, 100 % sur le téléphone) ===== */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Points MediaPipe
const P = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

/* Chaque exercice : articulation suivie (petit angle = contraction / bas du mouvement), seuils, et vérifications de forme */
const DEFS = {
  squat: { name: 'Squat', exId: 'squat', j: ['hip', 'knee', 'ankle'], up: 160, down: 100, deep: 90, view: 'de côté, corps entier', depth: 'Descends plus bas — cuisses au moins parallèles',
    check: (k, st) => { const lean = vAngle(k.shoulder, k.hip); if (lean > 55) st.flag('Garde le torse plus droit', 10); } },
  pushup: { name: 'Push-ups', exId: 'pushup', j: ['shoulder', 'elbow', 'wrist'], up: 155, down: 95, deep: 80, view: 'de côté, au sol', depth: 'Descends la poitrine plus proche du sol',
    check: (k, st) => { const line = ang(k.shoulder, k.hip, k.ankle); if (line < 155) st.flag('Corps droit — serre les fessiers et les abdos', 15); } },
  bench: { name: 'Bench Press', exId: 'bench', j: ['shoulder', 'elbow', 'wrist'], up: 155, down: 95, deep: 80, view: 'de côté, banc visible', depth: 'Descends la barre jusqu’à la poitrine',
    check: (k, st) => { const fa = Math.abs(k.wrist.x - k.elbow.x), len = dist(k.wrist, k.elbow); if (st.angle < 110 && fa > len * 0.45) st.flag('Garde les avant-bras verticaux', 10); } },
  pullup: { name: 'Pull-ups', exId: 'pullup', j: ['shoulder', 'elbow', 'wrist'], up: 150, down: 75, deep: 60, view: 'de face ou de côté', depth: 'Monte plus haut — menton au-dessus de la barre',
    check: (k, st) => { if (k.nose.y < k.wrist.y + dist(k.shoulder, k.elbow) * 0.15) st.mark('chin'); }, end: st => { if (!st.has('chin')) st.flag('Menton au-dessus de la barre', 15); } },
  dips: { name: 'Dips', exId: 'dips', j: ['shoulder', 'elbow', 'wrist'], up: 155, down: 100, deep: 90, view: 'de côté', depth: 'Descends jusqu’à 90° aux coudes', check: () => { } },
  curl: { name: 'Bicep Curl', exId: 'db_curl', j: ['shoulder', 'elbow', 'wrist'], up: 145, down: 60, deep: 50, view: 'de côté', depth: 'Monte jusqu’en haut — contracte le biceps',
    check: (k, st) => { if (vAngle(k.elbow, k.shoulder) > 30) st.flag('Coudes collés au corps', 15); const lean = vAngle(k.shoulder, k.hip); st.track('lean', lean); }, end: st => { const r = st.range('lean'); if (r > 15) st.flag('Balance pas le dos — moins lourd si besoin', 15); } },
  ohp: { name: 'Overhead Press', exId: 'ohp', j: ['shoulder', 'elbow', 'wrist'], up: 160, down: 85, deep: 75, view: 'de côté', inv: true, depth: 'Descends la barre au menton',
    check: (k, st) => { if (vAngle(k.shoulder, k.hip) > 18) st.flag('Serre les abdos — cambre pas le bas du dos', 10); } },
  row: { name: 'Barbell Row', exId: 'bb_row', j: ['shoulder', 'elbow', 'wrist'], up: 150, down: 95, deep: 85, view: 'de côté', depth: 'Tire la barre jusqu’au nombril',
    check: (k, st) => { if (vAngle(k.shoulder, k.hip) < 25) st.flag('Penche-toi plus (dos à ~45°)', 10); } },
  deadlift: { name: 'Deadlift', exId: 'deadlift', j: ['shoulder', 'hip', 'knee'], up: 165, down: 115, deep: 100, view: 'de côté', depth: 'Descends la barre jusqu’au sol / mi-tibia',
    check: (k, st) => { st.track('knee', ang(k.hip, k.knee, k.ankle)); }, end: st => { if (st.min('knee') < 75) st.flag('Hanches trop basses — c’est pas un squat', 10); } },
  rdl: { name: 'RDL', exId: 'rdl', j: ['shoulder', 'hip', 'knee'], up: 160, down: 120, deep: 105, view: 'de côté', depth: 'Pousse les hanches plus loin vers l’arrière',
    check: (k, st) => { st.track('knee', ang(k.hip, k.knee, k.ankle)); }, end: st => { if (st.min('knee') < 140) st.flag('Genoux presque droits — c’est un hinge', 10); } },
  lunge: { name: 'Lunges', exId: 'lunge', j: ['hip', 'knee', 'ankle'], up: 155, down: 105, deep: 95, view: 'de côté', depth: 'Descends le genou arrière proche du sol',
    check: (k, st) => { if (vAngle(k.shoulder, k.hip) > 25) st.flag('Torse droit', 10); } },
};

/* --- maths --- */
function ang(a, b, c) { const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y }; const d = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1); return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; }
function vAngle(top, bot) { return Math.abs(Math.atan2(top.x - bot.x, bot.y - top.y) * 180 / Math.PI); } // 0 = vertical
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

let landmarker = null, H = null;
async function load(status) {
  if (landmarker) return landmarker;
  status('Chargement du modèle IA (1re fois ~10 s)...');
  const mod = await import(`${MP}/vision_bundle.mjs`);
  const fs = await mod.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { landmarker = await mod.PoseLandmarker.createFromOptions(fs, opts('GPU')); }
  catch (e) { landmarker = await mod.PoseLandmarker.createFromOptions(fs, opts('CPU')); }
  return landmarker;
}

export function openCoach(ctx) {
  H = ctx;
  const root = document.getElementById('coach');
  const st = { ex: 'squat', facing: 'user', voice: true, running: false, stream: null, raf: 0, src: 'cam' };
  let R; // état des reps
  const resetReps = () => { R = { phase: 'init', reps: 0, clean: 0, list: [], a: null, min: 999, t0: 0, reached: false, flags: new Map(), marks: new Set(), tr: {}, cue: '', cueT: 0, lastSeen: 0 }; };
  resetReps();

  root.innerHTML = `
  <header class="cohead"><button class="icon" data-c="close">✕</button><b>Coach caméra</b><button class="icon" data-c="voice" title="Voix">🔊</button></header>
  <div class="cochips">${Object.entries(DEFS).map(([k, d]) => `<button class="chip ${k === st.ex ? 'on' : ''}" data-c="ex" data-k="${k}">${d.name}</button>`).join('')}</div>
  <div class="stage">
    <video playsinline muted></video><canvas></canvas>
    <div class="hud">
      <div class="hud-reps"><b id="cReps">0</b><small>reps</small></div>
      <div class="hud-score"><b id="cScore">–</b><small>forme</small></div>
    </div>
    <div class="hud-cue" id="cCue">Choisis un exercice et appuie sur Démarrer</div>
    <div class="gauge"><div id="cGauge"></div></div>
    <div class="costatus" id="cStatus"></div>
  </div>
  <div class="cotip" id="cTip"></div>
  <div class="cobtns">
    <button class="btn acc grow" data-c="start">▶ Démarrer (caméra)</button>
    <button class="icon" data-c="flip" title="Changer de caméra">🔄</button>
    <label class="icon" title="Analyser une vidéo">🎞️<input type="file" accept="video/*" hidden id="cVid"></label>
  </div>
  <div id="cSum"></div>`;
  root.classList.add('open'); document.body.classList.add('lock');
  const video = root.querySelector('video'), cv = root.querySelector('canvas'), cx = cv.getContext('2d');
  const $ = id => root.querySelector('#' + id);
  const status = t => { $('cStatus').textContent = t; $('cStatus').style.display = t ? 'flex' : 'none'; };
  const tip = () => { const d = DEFS[st.ex]; $('cTip').innerHTML = `📱 Place ton téléphone <b>${d.view}</b>, à 2-3 m, et assure-toi que ton corps est bien visible. Le comptage commence tout seul.`; };
  tip();
  const say = t => { if (!st.voice || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-CA'; u.rate = 1.1; speechSynthesis.speak(u); } catch (e) { } };
  const setCue = (t, cls = '') => { const c = $('cCue'); c.textContent = t; c.className = 'hud-cue ' + cls; R.cueT = performance.now(); };

  async function startCam() {
    stop(); st.src = 'cam'; resetReps(); paintHud(); $('cSum').innerHTML = '';
    try {
      await load(status);
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: st.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = st.stream; video.removeAttribute('src'); video.loop = false; await video.play();
      root.querySelector('.stage').classList.toggle('mirror', st.facing === 'user');
      go();
    } catch (e) { console.error(e); status(''); setCue(e && e.name === 'NotAllowedError' ? 'Accès caméra refusé — autorise-le dans les réglages' : 'Impossible de démarrer (connexion ou caméra)', 'bad'); }
  }
  async function startFile(file) {
    stop(); st.src = 'file'; resetReps(); paintHud(); $('cSum').innerHTML = '';
    try {
      await load(status);
      video.srcObject = null; video.src = URL.createObjectURL(file); video.loop = false; video.muted = true;
      root.querySelector('.stage').classList.remove('mirror');
      await video.play(); go();
      video.onended = () => finish();
    } catch (e) { console.error(e); status(''); setCue('Impossible de lire la vidéo', 'bad'); }
  }
  function go() {
    status(''); st.running = true; setCue('Je te vois pas encore... recule un peu', '');
    root.querySelector('[data-c="start"]').textContent = '■ Arrêter';
    let lastT = -1;
    const loop = () => {
      if (!st.running) return;
      if (video.readyState >= 2 && video.currentTime !== lastT) {
        lastT = video.currentTime;
        cv.width = video.videoWidth; cv.height = video.videoHeight;
        let res; try { res = landmarker.detectForVideo(video, performance.now()); } catch (e) { res = null; }
        cx.clearRect(0, 0, cv.width, cv.height);
        if (res && res.landmarks && res.landmarks[0]) process(res.landmarks[0]);
        else if (performance.now() - R.lastSeen > 1500) setCue('Je te vois pas — mets ton corps au complet dans l’image');
      }
      st.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function stop() {
    st.running = false; cancelAnimationFrame(st.raf);
    if (st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; }
    try { video.pause(); } catch (e) { }
    const b = root.querySelector('[data-c="start"]'); if (b) b.textContent = '▶ Démarrer (caméra)';
  }

  function process(lm) {
    const W = cv.width, Hh = cv.height, d = DEFS[st.ex];
    const px = i => ({ x: lm[i].x * W, y: lm[i].y * Hh, v: lm[i].visibility ?? 1 });
    const side = s => ({ shoulder: px(P[s + 's']), elbow: px(P[s + 'e']), wrist: px(P[s + 'w']), hip: px(P[s + 'h']), knee: px(P[s + 'k']), ankle: px(P[s + 'a']), nose: px(P.nose) });
    const L = side('l'), Rr = side('r');
    const vis = k => d.j.reduce((a, j) => a + k[j].v, 0);
    const K = vis(L) >= vis(Rr) ? L : Rr;
    // dessin du squelette
    cx.lineWidth = Math.max(3, W / 220); cx.strokeStyle = 'rgba(200,255,46,.85)'; cx.fillStyle = '#C8FF2E';
    BONES.forEach(([a, b]) => { if ((lm[a].visibility ?? 1) > .4 && (lm[b].visibility ?? 1) > .4) { cx.beginPath(); cx.moveTo(lm[a].x * W, lm[a].y * Hh); cx.lineTo(lm[b].x * W, lm[b].y * Hh); cx.stroke(); } });
    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => { if ((lm[i].visibility ?? 1) > .4) { cx.beginPath(); cx.arc(lm[i].x * W, lm[i].y * Hh, Math.max(4, W / 160), 0, 7); cx.fill(); } });
    if (vis(K) / 3 < 0.45) { if (performance.now() - R.lastSeen > 1200) setCue('Articulations pas assez visibles — filme ' + d.view); return; }
    R.lastSeen = performance.now();
    const raw = ang(K[d.j[0]], K[d.j[1]], K[d.j[2]]);
    R.a = R.a == null ? raw : R.a * 0.55 + raw * 0.45;
    const a = R.a, now = performance.now();
    // angle affiché sur l'articulation
    const jt = K[d.j[1]]; cx.font = `bold ${Math.max(18, W / 30)}px system-ui`; cx.fillStyle = '#fff'; cx.fillText(Math.round(a) + '°', jt.x + 12, jt.y - 12);
    const g = Math.max(0, Math.min(1, (d.up - a) / (d.up - d.deep)));
    $('cGauge').style.height = (g * 100) + '%'; $('cGauge').className = a <= d.down ? 'ok' : '';
    const api = {
      angle: a,
      flag: (msg, pen) => { if (!R.flags.has(msg)) R.flags.set(msg, pen); },
      mark: m => R.marks.add(m), has: m => R.marks.has(m),
      track: (k, v) => { const t = R.tr[k] = R.tr[k] || { mn: 999, mx: -999 }; t.mn = Math.min(t.mn, v); t.mx = Math.max(t.mx, v); },
      range: k => R.tr[k] ? R.tr[k].mx - R.tr[k].mn : 0, min: k => R.tr[k] ? R.tr[k].mn : 999
    };
    if (R.phase === 'init') { if (a >= d.up) { R.phase = 'top'; setCue('Prêt — vas-y!', 'ok'); } else if (a <= d.down) { R.phase = 'move'; R.reached = true; R.t0 = now; R.min = a; } return; }
    if (R.phase === 'top') { if (a < d.up - 12) { R.phase = 'move'; R.t0 = now; R.min = a; R.reached = false; R.flags = new Map(); R.marks = new Set(); R.tr = {}; } return; }
    if (R.phase === 'move') {
      R.min = Math.min(R.min, a); if (a <= d.down) R.reached = true;
      d.check(K, api);
      const live = [...R.flags.keys()][0]; if (live && now - R.cueT > 900) setCue(live, 'warn');
      if (a >= d.up) {
        const travel = d.up - R.min;
        if (!R.reached && travel < 30) { R.phase = 'top'; return; } // petit mouvement parasite
        d.end && d.end(api);
        let score = 100; const notes = [];
        if (!R.reached) { score -= 40; notes.push(d.depth); }
        else if (R.min > d.deep + 2) { score -= 8; notes.push('Presque — un poil plus d’amplitude'); }
        const dur = now - R.t0; if (dur < 650 && st.src === 'cam') { score -= 12; notes.push('Trop vite — contrôle le mouvement'); }
        R.flags.forEach((p, m) => { score -= p; notes.push(m); });
        score = Math.max(0, Math.round(score));
        R.reps++; const clean = score >= 70; if (clean) R.clean++;
        R.list.push({ n: R.reps, score, notes, min: Math.round(R.min), dur: Math.round(dur) });
        R.phase = 'top'; paintHud();
        if (clean) { setCue(score >= 92 ? `Rep ${R.reps} — parfaite ✅` : `Rep ${R.reps} ✅ ${notes[0] ? '· ' + notes[0] : ''}`, 'ok'); say(String(R.reps)); }
        else { setCue(`Rep ${R.reps} ❌ ${notes[0] || ''}`, 'bad'); say(`${R.reps}. ${notes[0] || ''}`); }
        try { navigator.vibrate && navigator.vibrate(clean ? 40 : [60, 60, 60]); } catch (e) { }
      }
    }
  }
  function avgScore() { return R.list.length ? Math.round(R.list.reduce((a, r) => a + r.score, 0) / R.list.length) : null; }
  function paintHud() { $('cReps').textContent = R.reps; const s = avgScore(); $('cScore').textContent = s == null ? '–' : s; $('cScore').className = s == null ? '' : s >= 85 ? 'ok' : s >= 70 ? 'warn' : 'bad'; }

  function finish() {
    stop();
    if (!R.reps) { setCue('Aucune rep détectée — vérifie l’angle de caméra'); return; }
    const d = DEFS[st.ex], s = avgScore();
    const tally = {}; R.list.forEach(r => r.notes.forEach(n => tally[n] = (tally[n] || 0) + 1));
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $('cSum').innerHTML = `<div class="card cosum">
      <div class="grid3"><div class="stat"><div class="stat-v">${R.reps}</div><div class="stat-l">reps</div></div><div class="stat"><div class="stat-v">${R.clean}</div><div class="stat-l">propres</div></div><div class="stat"><div class="stat-v ${s >= 85 ? 'ok' : s >= 70 ? 'warn' : 'bad'}">${s}</div><div class="stat-l">forme /100</div></div></div>
      <h3 class="mt">À travailler</h3>${top.length ? top.map(([n, c]) => `<div class="ins"><span class="ins-i">🎯</span><div><b>${H.esc(n)}</b><div class="muted sm">${c} rep${c > 1 ? 's' : ''} sur ${R.reps}</div></div></div>`).join('') : '<p class="muted">Rien à signaler, technique solide 💪</p>'}
      <div class="replist">${R.list.map(r => `<span class="${r.score >= 85 ? 'ok' : r.score >= 70 ? 'warn' : 'bad'}">${r.n}<small>${r.score}</small></span>`).join('')}</div>
      <div class="logrow mt"><input id="cW" inputmode="decimal" placeholder="Poids utilisé (${H.unit})"><button class="btn acc" data-c="save">Ajouter à ma séance</button></div>
      <div class="muted sm mt8">Ajoute ${R.clean} reps propres (sur ${R.reps}) à « ${H.esc(H.EX(d.exId).name)} ».</div></div>`;
    $('cSum').scrollIntoView({ behavior: 'smooth' });
  }

  root.onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    if (c === 'close') { stop(); root.classList.remove('open'); document.body.classList.remove('lock'); root.innerHTML = ''; H.onClose && H.onClose(); }
    if (c === 'ex') { st.ex = b.dataset.k; root.querySelectorAll('.cochips .chip').forEach(x => x.classList.toggle('on', x === b)); resetReps(); paintHud(); tip(); setCue(st.running ? 'Exercice changé — vas-y' : 'Appuie sur Démarrer'); }
    if (c === 'start') { if (st.running) finish(); else startCam(); }
    if (c === 'flip') { st.facing = st.facing === 'user' ? 'environment' : 'user'; if (st.running && st.src === 'cam') startCam(); else H.toast(st.facing === 'user' ? 'Caméra avant' : 'Caméra arrière'); }
    if (c === 'voice') { st.voice = !st.voice; b.textContent = st.voice ? '🔊' : '🔇'; }
    if (c === 'save') { const w = parseFloat(String(root.querySelector('#cW').value).replace(',', '.')); H.addSet(DEFS[st.ex].exId, R.clean || R.reps, isNaN(w) ? null : w, avgScore()); }
  };
  root.querySelector('#cVid').onchange = e => { const f = e.target.files[0]; if (f) startFile(f); };
}
