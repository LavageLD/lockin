/* ===== LOCKIN — scanner une étiquette « Valeur nutritive » (100 % sur le téléphone, gratuit) ===== */
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tessWorker = null, tessLoading = null;
function loadTess() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessLoading) tessLoading = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = TESS; s.onload = ok; s.onerror = () => { tessLoading = null; ko(new Error('load')); }; document.head.appendChild(s); });
  return tessLoading;
}
async function getWorker() {
  await loadTess();
  if (!tessWorker) tessWorker = await Tesseract.createWorker(['fra', 'eng'], 1);
  return tessWorker;
}
// photo → gris, ~2000 px (c'est ce qui a donné les meilleurs résultats aux tests)
function prepImage(file) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)) * (Math.max(img.naturalWidth, img.naturalHeight) < 1400 ? 1.5 : 1);
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      const x = c.getContext('2d'); x.filter = 'grayscale(1)'; x.drawImage(img, 0, 0, c.width, c.height);
      if (!x.filter || x.filter === 'none') { const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const g = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114; a[i] = a[i + 1] = a[i + 2] = g; } x.putImageData(d, 0, 0); }
      URL.revokeObjectURL(url); ok(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('img')); };
    img.src = url;
  });
}
async function scanLabel(file, progress) {
  const w = await getWorker(), canvas = await prepImage(file), texts = [];
  const modes = ['11', '6', '3'];
  for (let i = 0; i < modes.length; i++) {
    progress && progress(i + 1, modes.length);
    await w.setParameters({ tessedit_pageseg_mode: modes[i] });
    texts.push((await w.recognize(canvas)).data.text);
    if (texts.length >= 2) { const r = combineLabel(texts); if (r.ok && !r.unsure.length) return r; } // 2 lectures pareilles = assez sûr
  }
  return combineLabel(texts);
}

/* ---------- dans la feuille « Ajouter » ---------- */
// FA.scan = { st: 'idle'|'busy'|'done'|'err', msg, unsure:[], g, label } ; FA.eat = { mode: 'portion'|'g', v }
function eatQ() { const e = FA.eat || {}, v = num(e.v); if (!v) return 1; return e.mode === 'g' && FA.scan && FA.scan.g ? v / FA.scan.g : v; }
function scanHTML() {
  const sc = FA.scan || {};
  const btn = `<label class="btn block ${sc.st === 'busy' ? '' : 'acc'} mt8" style="text-align:center">${sc.st === 'busy' ? `⏳ Lecture… ${sc.msg || ''}` : '📷 Scanner l’étiquette'}<input type="file" accept="image/*" data-i="scanIn" hidden ${sc.st === 'busy' ? 'disabled' : ''}></label>`;
  const msg = sc.st === 'done' ? `<div class="sm mt8 ${sc.unsure.length ? 'warn' : 'ok'}">${sc.unsure.length ? '⚠️ Vérifie les chiffres en orange' : '✓ Lu sur l’étiquette — jette un œil quand même'}${sc.g ? ` · portion ${fmt(sc.g)} ${sc.unit || 'g'}` : ''}</div>`
    : sc.st === 'err' ? `<div class="sm mt8 warn">${esc(sc.msg)}</div>` : `<div class="muted sm mt8">Prends l’étiquette « Valeur nutritive » au complet, bien droite, sans reflet.</div>`;
  return btn + msg;
}
function eatHTML(per) {
  const e = FA.eat = FA.eat || { mode: 'portion', v: '1' }, q = eatQ(), g = FA.scan && FA.scan.g;
  const T = k => fmt((num(per[k]) || 0) * q);
  return `<div class="card inset mt8"><b>J’ai mangé</b>
    ${g ? `<div class="seg mt8"><button class="${e.mode === 'portion' ? 'on' : ''}" data-a="eatMode" data-v="portion">Portions</button><button class="${e.mode === 'g' ? 'on' : ''}" data-a="eatMode" data-v="g">Grammes</button></div>` : ''}
    <div class="logrow mt8"><input inputmode="decimal" data-i="eatV" value="${esc(e.v)}"><span class="muted">${e.mode === 'g' && g ? 'g' : 'portion(s)'}</span></div>
    <div class="muted sm mt8" id="eatTot">= ${T('cal')} cal · P ${T('p')}${CF() ? ` · G ${T('c')} · L ${T('f')}` : ''}${g ? ` · ${fmt(q * g)} ${FA.scan.unit || 'g'}` : ''}</div></div>`;
}
const _foodSheet = foodSheet;
foodSheet = function () {
  let h = _foodSheet(); if (FA.sel || (FA.tab !== 'new' && FA.tab !== 'quick')) return h;
  const per = FA.tab === 'new' ? FA.nf : FA.quick, sc = FA.scan || {};
  // bouton scanner sous les onglets
  h = h.replace(/(<\/div>)(\s*<(?:label|p) )/, `$1${scanHTML()}$2`);
  // chiffres douteux en orange
  (sc.unsure || []).forEach(k => { h = h.replace(new RegExp(`(data-k="${k}" value=")`), `style="border-color:#FF9F0A" $1`); });
  // « j'ai mangé » juste avant le bouton final
  const btn = FA.tab === 'new' ? '<button class="btn block acc mt" data-a="faNewSave">' : '<button class="btn block acc mt" data-a="faQuickAdd">';
  return h.replace(btn, eatHTML(per) + btn);
};
C.scanIn = async el => {
  const f = el.files && el.files[0]; if (!f) return;
  FA.scan = { st: 'busy', msg: '', unsure: [] }; paintSheet();
  try {
    const r = await scanLabel(f, (i, n) => { FA.scan.msg = `${i}/${n}`; paintSheet(); });
    const tgt = FA.tab === 'new' ? FA.nf : FA.quick;
    ['cal', 'p', 'c', 'f'].forEach(k => { if (r[k] != null) tgt[k] = String(r[k]); });
    if (FA.tab === 'new' && r.serv) tgt.serv = (r.serv.label ? r.serv.label + ' ' : '') + `(${fmt(r.serv.g)} ${r.serv.unit})`;
    const miss = ['cal', 'p', 'c', 'f'].filter(k => r[k] == null);
    FA.scan = { st: miss.length === 4 ? 'err' : 'done', msg: 'Rien trouvé — reprends la photo plus proche pis bien éclairée', unsure: [...new Set([...(r.ok ? [] : ['cal', 'p', 'c', 'f']), ...r.unsure, ...miss])], g: r.serv && r.serv.g, unit: r.serv && r.serv.unit };
    FA.eat = { mode: 'portion', v: '1' };
  } catch (e) {
    FA.scan = { st: 'err', msg: e.message === 'load' ? 'Pas de connexion — la 1re fois, ça télécharge le lecteur (~4 Mo)' : 'Lecture impossible — réessaie', unsure: [] };
  }
  paintSheet();
};
A.eatMode = el => { const e = FA.eat, g = FA.scan && FA.scan.g, q = eatQ(); e.mode = el.dataset.v; e.v = String(e.mode === 'g' && g ? Math.round(q * g) : Math.round(q * 100) / 100); paintSheet(); };
I.eatV = el => { FA.eat.v = el.value; const per = FA.tab === 'new' ? FA.nf : FA.quick, t = $('#eatTot'); if (t) { const tmp = document.createElement('div'); tmp.innerHTML = eatHTML(per); t.innerHTML = tmp.querySelector('#eatTot').innerHTML; } };
// enregistrer avec la bonne quantité
A.faNewSave = () => { const x = FA.nf; if (!x.name.trim()) return toast('Donne-lui un nom'); const f = { id: 'cf_' + uid(), name: x.name.trim(), serv: x.serv || 'portion', cal: num(x.cal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0 }; S.foods.unshift(f); logFood(f, eatQ()); FA.scan = null; FA.eat = null; closeSheet(); render(); toast('Aliment créé et ajouté'); };
A.faQuickAdd = () => { const x = FA.quick; if (!num(x.cal) && !num(x.p)) return toast('Entre au moins les calories'); logFood({ id: null, name: x.name || 'Ajout rapide', serv: 'portion', cal: num(x.cal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0 }, eatQ()); FA.scan = null; FA.eat = null; closeSheet(); render(); toast('Ajouté ✅'); };
// nouveau scan à chaque ouverture
(function () { const _a = A.addFood; A.addFood = el => { _a(el); FA.scan = null; FA.eat = null; }; })();
// garder les chiffres tapés à la main en direct pour le total
(function () { ['faNew', 'faQuick'].forEach(n => { const o = I[n]; I[n] = el => { o(el); if (['cal', 'p', 'c', 'f'].includes(el.dataset.k) && FA.scan) FA.scan.unsure = (FA.scan.unsure || []).filter(k => k !== el.dataset.k); }; }); })();
