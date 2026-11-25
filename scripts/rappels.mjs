// Lockin — envoie les rappels (eau, bouffe, suppléments). Roulé chaque heure par GitHub Actions.
import webpush from 'web-push';

const API_KEY = 'AIzaSyD-ntbSenTgY07B48MSNNFBw5EkIQm0gaI';
const PROJECT = 'lockin-db6d3';
const { LOCKIN_EMAIL: email, LOCKIN_PASSWORD: password, KIND } = process.env;

if (!email || !password) { console.log('Secrets LOCKIN_EMAIL / LOCKIN_PASSWORD manquants — rien à faire.'); process.exit(0); }

// 1) connexion au compte
const auth = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
})).json();
if (!auth.idToken) { console.error('Connexion impossible :', auth.error && auth.error.message); process.exit(1); }

// 2) lecture des données
const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${auth.localId}`, { headers: { Authorization: 'Bearer ' + auth.idToken } });
const doc = await res.json();
if (!doc.fields || !doc.fields.data) { console.log('Aucune donnée synchronisée pour ce compte.'); process.exit(0); }
const S = JSON.parse(doc.fields.data.stringValue);
const P = S.pushCfg;
if (!P || !P.sub || !P.pub || !P.priv) { console.log('Notifications pas activées dans l’app.'); process.exit(0); }
webpush.setVapidDetails('mailto:rappels@lockin.app', P.pub, P.priv);

// 3) heure et date locales
const tz = (S.settings && S.settings.tz) || 'America/Toronto';
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`, hour = parseInt(parts.hour, 10) % 24;
console.log(`Heure locale : ${hour} h (${tz}), jour ${today}`);

const sent = [];
async function send(title, body, tag, url) {
  try { await webpush.sendNotification(P.sub, JSON.stringify({ title, body, tag, url }), { TTL: 3600 }); sent.push(title); console.log('✅ Envoyé :', title); }
  catch (e) { console.log('❌ Erreur', e.statusCode, e.body || e.message); if (e.statusCode === 404 || e.statusCode === 410) console.log('→ Abonnement expiré : réactive les notifications dans l’app.'); }
}
const L = (x, d = 1) => (x / 1000).toFixed(d).replace('.', ',');

if (KIND === 'test') { await send('Lockin 🔒', 'Test réussi — tes rappels sont prêts ✅', 'test'); process.exit(0); }
if (KIND === 'gym') {
  const done = (S.workouts || []).some(w => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(w.start)) === today);
  if (done) console.log('Séance déjà cochée aujourd’hui — pas de notif.');
  else await send('💪 T’es au gym', 'Tape ici pour cocher ta séance', 'gym', './?go=checkin');
  process.exit(0);
}

const N = (S.settings && S.settings.notif) || {};
const g = { ...(S.settings.goals || { cal: 2500, p: 180, water: 3000 }), ...((S.settings.dynCal && (S.goalsByDay || {})[today]) || {}) };
const yd = new Date(new Date(`${today}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
const log = (S.log || {})[today] || [];
const T = log.reduce((a, x) => ({ cal: a.cal + x.cal * x.q, p: a.p + x.p * x.q }), { cal: 0, p: 0 });
const water = (S.water || {})[today] || 0;

// Eau : de 10 h à 20 h aux 2 heures, si en retard de plus de 20 %
if (N.water !== false && S.settings.trackWater !== false && [10, 12, 14, 16, 18, 20].includes(hour) && water < g.water) {
  const expected = g.water * Math.min(1, (hour - 8) / 13);
  if (water < expected * 0.8) await send('💧 Bois de l’eau', `T’es à ${L(water, 2)} L — tu devrais être autour de ${L(expected)} L. Prends un grand verre.`, 'water');
}
// Bouffe : 13 h et 19 h
if (N.food !== false && (hour === 13 || hour === 19)) {
  const f = hour === 13 ? 0.35 : 0.7;
  if (!log.length) await send('🍽️ Rien de loggé aujourd’hui', hour === 13 ? 'Log ton déjeuner pis ton dîner pour rester sur la track.' : 'Il te reste le souper — log ce que t’as mangé aujourd’hui.', 'food');
  else if (T.cal < g.cal * f * 0.8 || T.p < g.p * f * 0.8) await send('🍗 T’es en retard sur ta bouffe', `${Math.round(T.cal)} / ${g.cal} cal · ${Math.round(T.p)} / ${g.p} g de protéines. Mange un vrai repas.`, 'food');
}
// Suppléments : à l'heure choisie si pas coché
if (N.supps !== false) {
  const taken = (S.suppLog || {})[today] || [];
  for (const s of S.supps || []) {
    if (s.hour == null || taken.includes(s.id) || s.hour === 21) continue;
    if (hour === s.hour) await send(`💊 ${s.name}`, `T’as pas encore coché « ${s.name} » aujourd’hui${s.dose ? ` (${s.dose})` : ''}. Prends-la pis coche-la dans Lockin.`, 'supp-' + s.id);
  }
}
// Oublis : 21 h = ce qui manque aujourd'hui ; 9 h = journée d'hier vide
function missing(k) {
  const m = [];
  if (!((S.log || {})[k] || []).length) m.push('ta bouffe');
  if (S.settings.trackWater !== false && !((S.water || {})[k] > 0)) m.push('ton eau');
  (S.supps || []).forEach(s => { if (s.hour != null && !(((S.suppLog || {})[k]) || []).includes(s.id)) m.push(s.name.toLowerCase()); });
  return m;
}
const started = (S.profile && S.profile.at) ? new Date(S.profile.at).toISOString().slice(0, 10) : '2000-01-01';
if (N.forgot !== false && hour === 21) {
  const m = missing(today);
  if (m.length) await send('📝 Il te manque des affaires', `Pas encore loggé aujourd’hui : ${m.join(', ')}. 30 secondes pis ta journée est complète.`, 'forgot');
}
if (N.forgot !== false && hour === 9 && yd >= started) {
  const m = missing(yd);
  if (m.length >= 2 || m.includes('ta bouffe')) await send('📝 Hier est incomplet', `T’as pas loggé ${m.join(', ')} hier. Ouvre Lockin pour le compléter en 1 tap.`, 'yesterday');
}
console.log(sent.length ? `${sent.length} notif(s) envoyée(s).` : 'Rien à envoyer cette heure-ci.');
