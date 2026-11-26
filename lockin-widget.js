// Lockin — widget « Gym » pour Scriptable (iOS)
// 75 jours, un après l'autre : le plus vieux en haut à gauche → aujourd'hui en bas à droite.
// 1re fois : lance ce script dans Scriptable pour te connecter (courriel + mot de passe Lockin).

const API_KEY = "AIzaSyD-ntbSenTgY07B48MSNNFBw5EkIQm0gaI";
const PROJECT = "lockin-db6d3";
const APP_URL = "https://lavageld.github.io/lockin/";
const DAYS = 75;
const COLOR = "#FF6B57";

// ---------- dates ----------
const pad = n => String(n).padStart(2, "0");
const dk = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = d => { const x = sod(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

// ---------- même logique que l'app ----------
function defaultGymDays(n) { return ({ 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] })[Math.max(1, Math.min(7, n || 4))]; }
function habitStart(S) {
  const c = []; if (S.profile && S.profile.at) c.push(dk(S.profile.at));
  if (S.workouts && S.workouts[0]) c.push(dk(S.workouts[0].start));
  const lk = Object.keys(S.log || {}).filter(k => (S.log[k] || []).length).sort()[0]; if (lk) c.push(lk);
  if (S.body && S.body[0]) c.push(S.body[0].d);
  const wk = Object.keys(S.water || {}).filter(k => S.water[k] > 0).sort()[0]; if (wk) c.push(wk);
  return c.length ? c.sort()[0] : dk(new Date());
}
function gymStatuses(S, weeks) {
  // flexible : (7 − séances visées) jours de repos par semaine, n'importe quel jour
  const today = dk(new Date()), start = habitStart(S), budget = S.settings.restAllowed != null ? Math.max(0, Math.min(7, S.settings.restAllowed)) : Math.max(0, 7 - (S.settings.weeklyTarget || 4)), t = Math.max(1, 7 - budget), R = S.restDays || {};
  const did = new Set((S.workouts || []).map(w => dk(w.start))), out = {}, curWs = startOfWeek(new Date()), W = [];
  for (let w = weeks; w >= 0; w--) {
    const ws = addDays(curWs, -7 * w);
    const days = Array.from({ length: 7 }, (_, i) => { const k = dk(addDays(ws, i)); return { k, did: did.has(k) }; });
    const off = days.filter(d => !d.did && d.k >= start && (d.k < today || (d.k === today && R[d.k])));
    off.sort((x, y) => (R[y.k] ? 1 : 0) - (R[x.k] ? 1 : 0) || (x.k < y.k ? -1 : 1));
    const restSet = new Set(off.slice(0, budget).map(d => d.k));
    days.forEach(d => {
      if (d.k > today) out[d.k] = d.did ? "gym" : "future";
      else if (d.k < start) out[d.k] = "off";
      else if (d.did) out[d.k] = "gym";
      else if (restSet.has(d.k)) out[d.k] = "rest";
      else if (d.k === today) out[d.k] = "pending";
      else out[d.k] = "skip";
    });
    const n = days.filter(d => d.did && d.k >= start).length;
    W.push({ extra: Math.max(0, n - t), left: days.filter(d => out[d.k] === "skip"), current: w === 0 });
  }
  for (let w = 0; w < W.length; w++) {
    const next = W[w + 1];
    W[w].left.forEach(d => {
      if (next && next.extra > 0) { next.extra--; out[d.k] = "swap"; }
      else out[d.k] = (W[w].current || (next && next.current)) ? "pending" : "miss";
    });
  }
  return out;
}
const GOOD = new Set(["gym", "rest", "swap"]);

// ---------- données ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "lockin-cache.json");
async function askLogin() {
  const a = new Alert();
  a.title = "Lockin"; a.message = "Connecte-toi avec ton compte Lockin (une seule fois).";
  a.addTextField("Courriel", Keychain.contains("lockin_email") ? Keychain.get("lockin_email") : "");
  a.addSecureTextField("Mot de passe", "");
  a.addAction("Connexion"); a.addCancelAction("Annuler");
  if (await a.present() === -1) return false;
  Keychain.set("lockin_email", a.textFieldValue(0).trim()); Keychain.set("lockin_pw", a.textFieldValue(1));
  return true;
}
async function loadState() {
  if (!Keychain.contains("lockin_email") || !Keychain.contains("lockin_pw")) throw new Error("login");
  const r = new Request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`);
  r.method = "POST"; r.headers = { "Content-Type": "application/json" };
  r.body = JSON.stringify({ email: Keychain.get("lockin_email"), password: Keychain.get("lockin_pw"), returnSecureToken: true });
  const auth = await r.loadJSON();
  if (!auth.idToken) throw new Error("login");
  const d = new Request(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${auth.localId}`);
  d.headers = { Authorization: "Bearer " + auth.idToken };
  const doc = await d.loadJSON();
  if (!doc.fields || !doc.fields.data) throw new Error("Aucune donnée synchronisée");
  const S = JSON.parse(doc.fields.data.stringValue);
  fm.writeString(cachePath, JSON.stringify(S));
  return S;
}

// ---------- dessin ----------
function drawGrid(st, keys, cols, widthPt, maxH) {
  const scale = 3, rows = Math.ceil(keys.length / cols);
  const cell = Math.min((widthPt * scale) / (cols + (cols - 1) * 0.28), maxH ? (maxH * scale) / (rows + (rows - 1) * 0.28) : 1e9), gap = cell * 0.28;
  widthPt = (cols * cell + (cols - 1) * gap) / scale;
  const ctx = new DrawContext();
  ctx.size = new Size(widthPt * scale, rows * cell + (rows - 1) * gap);
  ctx.opaque = false; ctx.respectScreenScale = false;
  keys.forEach((k, i) => {
    const x = (i % cols) * (cell + gap), y = Math.floor(i / cols) * (cell + gap);
    const p = new Path(); p.addRoundedRect(new Rect(x, y, cell, cell), cell * 0.24, cell * 0.24);
    const s = st[k];
    if (s === "pending") {
      const q = new Path(); const b = cell * 0.08; q.addRoundedRect(new Rect(x + b, y + b, cell - 2 * b, cell - 2 * b), cell * 0.2, cell * 0.2);
      ctx.addPath(q); ctx.setStrokeColor(new Color(COLOR, 0.75)); ctx.setLineWidth(b * 1.6); ctx.strokePath();
      return;
    }
    ctx.addPath(p);
    ctx.setFillColor(s === "gym" || s === "rest" || s === "swap" ? new Color(COLOR) : s === "miss" ? new Color("#FF453A", 0.32) : new Color("#FFFFFF", 0.06));
    ctx.fillPath();
  });
  return { img: ctx.getImage(), w: widthPt, h: (rows * cell + (rows - 1) * gap) / scale };
}

function build(S, family) {
  const st = gymStatuses(S, Math.ceil(DAYS / 7) + 3), today = new Date();
  const keys = []; for (let i = DAYS - 1; i >= 0; i--) keys.push(dk(addDays(today, -i)));
  let good = 0, bad = 0; keys.forEach(k => { if (GOOD.has(st[k])) good++; else if (st[k] === "miss") bad++; });
  const all = Object.keys(st).filter(k => k <= dk(today)).sort(); let streak = 0;
  for (let i = all.length - 1; i >= 0; i--) { const s = st[all[i]]; if (s === "pending") continue; if (GOOD.has(s)) streak++; else break; }
  const pct = good + bad ? Math.round(good / (good + bad) * 100) : 100;

  const w = new ListWidget();
  w.backgroundColor = new Color("#0A0A0B"); w.url = APP_URL;
  w.setPadding(14, 14, 12, 14);
  const big = family === "large", small = family === "small";
  const head = w.addStack(); head.centerAlignContent();
  const t = head.addText("Gym"); t.font = Font.boldSystemFont(small ? 14 : big ? 20 : 16); t.textColor = new Color(COLOR);
  head.addSpacer();
  const pill = head.addStack(); pill.backgroundColor = new Color("#1C1C1F"); pill.cornerRadius = 10; pill.setPadding(3, 8, 3, 8);
  const s = pill.addText(`🔥 ${streak}`); s.font = Font.boldSystemFont(small ? 12 : big ? 16 : 13); s.textColor = Color.white();
  w.addSpacer(small ? 6 : 8);
  const cols = 15;
  const widthPt = small ? 127 : big ? 301 : 301;
  const g = drawGrid(st, keys, cols, widthPt, family === "medium" ? 84 : null);
  const im = w.addImage(g.img); im.imageSize = new Size(g.w, g.h); im.centerAlignImage();
  w.addSpacer();
  const foot = w.addStack(); foot.centerAlignContent();
  const p1 = foot.addText(`${pct} %`); p1.font = Font.boldSystemFont(small ? 11 : 13); p1.textColor = Color.white();
  const p2 = foot.addText(`  (${good}/${good + bad})`); p2.font = Font.systemFont(small ? 10 : 12); p2.textColor = new Color("#8E8E93");
  if (!small) { foot.addSpacer(); const l = foot.addText(`${DAYS} jours`); l.font = Font.systemFont(11); l.textColor = new Color("#8E8E93"); }
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return w;
}
function message(txt) {
  const w = new ListWidget(); w.backgroundColor = new Color("#0A0A0B"); w.url = "scriptable:///run/" + encodeURIComponent(Script.name());
  const t = w.addText("🔒 Lockin"); t.font = Font.boldSystemFont(15); t.textColor = new Color(COLOR);
  w.addSpacer(6); const m = w.addText(txt); m.font = Font.systemFont(12); m.textColor = Color.white();
  return w;
}

// ---------- mise à jour automatique du script ----------
async function selfUpdate() {
  try {
    const code = await new Request(APP_URL + "lockin-widget.js?" + Date.now()).loadString();
    if (!code.startsWith("// Lockin — widget") || code.length < 3000) return;
    const ic = FileManager.iCloud(), lc = FileManager.local();
    for (const f of [ic, lc]) {
      let p; try { p = f.joinPath(f.documentsDirectory(), Script.name() + ".js"); } catch (e) { continue; }
      if (f.fileExists(p)) { if (f.readString(p) !== code) f.writeString(p, code); return; }
    }
  } catch (e) { }
}

// ---------- main ----------
async function main() {
  await selfUpdate();
  const family = config.widgetFamily || "medium";
  if (!config.runsInWidget) {
    if (Keychain.contains("lockin_email")) {
      const a = new Alert(); a.title = "Lockin"; a.message = `Connecté : ${Keychain.get("lockin_email")}`;
      a.addAction("Aperçu du widget"); a.addAction("Changer de compte"); a.addCancelAction("Fermer");
      const c = await a.present();
      if (c === -1) return;
      if (c === 1 && !(await askLogin())) return;
    } else if (!(await askLogin())) return;
  }
  let widget;
  try { widget = build(await loadState(), family); }
  catch (e) {
    if (e.message === "login") widget = message("Ouvre Scriptable et lance le script « " + Script.name() + " » pour te connecter.");
    else if (fm.fileExists(cachePath)) widget = build(JSON.parse(fm.readString(cachePath)), family);
    else widget = message("Pas de connexion pour l’instant. " + e.message);
  }
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}
await main();
Script.complete();
