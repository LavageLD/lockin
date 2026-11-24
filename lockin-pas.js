// Lockin — envoie tes pas (app Santé) à ton compte Lockin. Lancé par le raccourci « Lockin Pas ».
// Utilise la connexion déjà enregistrée par le widget Lockin dans Scriptable.
const API_KEY = "AIzaSyD-ntbSenTgY07B48MSNNFBw5EkIQm0gaI";
const PROJECT = "lockin-db6d3";
const pad = n => String(n).padStart(2, "0");
const d = new Date(), today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function main() {
  let raw = args.shortcutParameter;
  if (Array.isArray(raw)) raw = raw[0];
  const steps = Math.round(Number(String(raw ?? (args.queryParameters || {}).steps ?? "0").replace(/[^\d.]/g, "")) || 0);
  if (!Keychain.contains("lockin_email") || !Keychain.contains("lockin_pw")) return "Connecte-toi d’abord dans le script du widget Lockin.";
  const r = new Request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`);
  r.method = "POST"; r.headers = { "Content-Type": "application/json" };
  r.body = JSON.stringify({ email: Keychain.get("lockin_email"), password: Keychain.get("lockin_pw"), returnSecureToken: true });
  const auth = await r.loadJSON(); if (!auth.idToken) return "Connexion refusée.";
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${auth.localId}`;
  const g = new Request(url); g.headers = { Authorization: "Bearer " + auth.idToken };
  const doc = await g.loadJSON();
  let map = {}; try { map = JSON.parse(doc.fields.steps.stringValue); } catch (e) { }
  map[today] = Math.max(map[today] || 0, steps);
  Object.keys(map).sort().slice(0, -45).forEach(k => delete map[k]);
  const p = new Request(url + "?updateMask.fieldPaths=steps"); p.method = "PATCH";
  p.headers = { Authorization: "Bearer " + auth.idToken, "Content-Type": "application/json" };
  p.body = JSON.stringify({ fields: { steps: { stringValue: JSON.stringify(map) } } });
  await p.loadJSON();
  return `👟 ${steps} pas envoyés à Lockin`;
}
const msg = await main();
Script.setShortcutOutput(msg);
if (!config.runsInApp) { } else { const a = new Alert(); a.title = "Lockin"; a.message = msg; a.addAction("OK"); await a.present(); }
Script.complete();
