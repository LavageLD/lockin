/* ===== LOCKIN — lecture d'une étiquette « Valeur nutritive » (texte OCR → macros) ===== */
(function (root) {
  const clean = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[|{}\[\]]/g, ' ').replace(/(\d)\s*[,]\s*(\d)/g, '$1.$2');
  // chiffre lu comme lettre juste avant « g » : 9→g, O→0, l/I→1, S→5…
  const numFix = s => s.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[sS]/g, '5');
  const G = '(\\d{1,3}(?:\\.\\d{1,2})?|[\\dOolIS]{1,3})\\s*(?:g|9|q)\\b';

  function grab(text, keys, avoid) {
    for (const line of text.split('\n')) {
      for (const k of keys) {
        const i = line.indexOf(k); if (i < 0) continue;
        const rest = line.slice(i + k.length);
        // ne pas prendre « saturés », « trans »… collés sur la même ligne
        const seg = avoid ? rest.split(new RegExp(avoid))[0] : rest;
        const m = seg.match(new RegExp(G));
        if (m) { const v = parseFloat(numFix(m[1])); if (!isNaN(v)) return v; }
      }
    }
    return null;
  }
  function calories(text) {
    const m = text.match(/(?:calor[a-z]*|[a-z]{0,4}ries)\s*(?:\/\s*calories?)?[^\d\n]{0,6}?(\d{1,4})\b/) || text.match(/(\d{2,4})\s*kcal/);
    return m ? parseInt(m[1], 10) : null;
  }
  function serving(text) {
    const m = text.match(/(?:per|pour|serving size|serving|servir|portion)[^\n]{0,40}?\((\d{1,4}(?:\.\d)?)\s*(g|9|q|0|ml)\)/) || text.match(/(?:per|pour|serving size)[^\n]{0,40}?(\d{1,4})\s*(g|ml)\b/);
    if (!m) return null;
    const what = (text.match(/(?:per|pour)\s+([^\n(]{1,30})\(/) || [])[1];
    return { g: parseFloat(m[1]), unit: m[2] === 'ml' ? 'ml' : 'g', label: what ? what.trim() : '' };
  }
  // la règle d'or : cal ≈ 4P + 4G + 9L. Si ça marche pas, on essaie les confusions de chiffres classiques.
  const SWAP = { '3': ['8'], '8': ['3', '6', '0'], '5': ['6', '3'], '6': ['5', '8'], '0': ['8', '9'], '1': ['7', '4'], '7': ['1'], '4': ['1'], '9': ['0', '8'] };
  function variants(v) {
    if (v == null) return [v];
    const s = String(v), out = new Set([v]);
    for (let i = 0; i < s.length; i++) (SWAP[s[i]] || []).forEach(r => { const n = parseFloat(s.slice(0, i) + r + s.slice(i + 1)); if (!isNaN(n)) out.add(n); });
    if (s.length >= 2 && !s.includes('.')) out.add(parseFloat(s.slice(0, -1))); // « 140 » lu pour « 14 g »
    return [...out];
  }
  const kcal = (p, c, f) => 4 * p + 4 * c + 9 * f;
  const fits = (cal, p, c, f) => cal && Math.abs(kcal(p, c, f) - cal) <= Math.max(10, cal * 0.05);
  function check(r) {
    if (r.cal == null || r.p == null || r.c == null || r.f == null) return { ...r, ok: false };
    if (fits(r.cal, r.p, r.c, r.f)) return { ...r, ok: true };
    let best = null;
    for (const p of variants(r.p)) for (const c of variants(r.c)) for (const f of variants(r.f)) for (const cal of variants(r.cal)) {
      if (!fits(cal, p, c, f)) continue;
      const changes = (p !== r.p) + (c !== r.c) + (f !== r.f) + (cal !== r.cal);
      const err = Math.abs(kcal(p, c, f) - cal) / cal;
      if (!best || changes < best.changes || (changes === best.changes && err < best.err)) best = { cal, p, c, f, changes, err };
    }
    if (best && best.changes <= 2) return { ...r, cal: best.cal, p: best.p, c: best.c, f: best.f, ok: true, fixed: best.changes };
    return { ...r, ok: false };
  }
  function rawParse(raw) {
    const t = clean(raw);
    return {
      cal: calories(t),
      f: grab(t, ['lipides', 'total fat', 'fat', 'lipide', 'matieres grasses'], 'satur|trans'),
      c: grab(t, ['glucides', 'carbohydrate', 'carbohydrates', 'total carb', 'glucide'], 'fib|sucre|sugar'),
      p: grab(t, ['proteines', 'protein', 'proteine']),
      serv: serving(t)
    };
  }
  function parseLabel(raw) { return check(rawParse(raw)); }
  // plusieurs lectures de la même photo → vote par champ
  function combine(texts) {
    const R = texts.map(rawParse), out = { unsure: [] };
    ['cal', 'p', 'c', 'f'].forEach(k => {
      const cnt = new Map(); R.forEach(r => { if (r[k] != null) cnt.set(r[k], (cnt.get(r[k]) || 0) + 1); });
      const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
      out[k] = best ? best[0] : null;
      if (cnt.size > 1) out.unsure.push(k);
    });
    const sv = R.map(r => r.serv).filter(Boolean); out.serv = sv[0] || null;
    const r = check(out);
    if (r.fixed) ['cal', 'p', 'c', 'f'].forEach(k => { if (r[k] !== out[k] && !r.unsure.includes(k)) r.unsure.push(k); });
    return r;
  }
  root.parseLabel = parseLabel; root.combineLabel = combine;
  if (typeof module !== 'undefined') module.exports = { parseLabel, combine };
})(typeof window !== 'undefined' ? window : globalThis);
