/* ===== Lockin — compte courriel + synchro cloud (Firebase) ===== */
import { FIREBASE_CONFIG } from './firebase-config.js';
const G = 'https://www.gstatic.com/firebasejs/10.12.2';
let auth = null, db = null, F = {}, pushT = null, H = null;

export const configured = () => !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !/COLLE|TON-PROJET/.test(FIREBASE_CONFIG.apiKey + FIREBASE_CONFIG.projectId));

export async function init(h) {
  H = h;
  if (!configured()) return false;
  const [app, a, f] = await Promise.all([import(`${G}/firebase-app.js`), import(`${G}/firebase-auth.js`), import(`${G}/firebase-firestore.js`)]);
  F = { ...a, ...f };
  const fa = app.initializeApp(FIREBASE_CONFIG);
  auth = a.getAuth(fa); db = f.getFirestore(fa);
  try { await a.setPersistence(auth, a.browserLocalPersistence); } catch (e) { console.warn(e); }
  try { await a.getRedirectResult(auth); } catch (e) { console.warn(e); }
  a.onAuthStateChanged(auth, async u => { if (u) await pull(u); H.onUser(u); });
  window.cloudPush = () => { if (!auth || !auth.currentUser) return; clearTimeout(pushT); pushT = setTimeout(() => push().catch(e => console.warn(e)), 2500); };
  return true;
}

async function pull(u) {
  try {
    const snap = await F.getDoc(F.doc(db, 'users', u.uid));
    const S = H.getState();
    if (snap.exists()) {
      const remote = JSON.parse(snap.data().data);
      const localEmpty = !S.workouts.length && !S.body.length && !Object.keys(S.log || {}).length;
      const stepsF = snap.data().steps;
      if (localEmpty || (remote.updatedAt || 0) > (S.updatedAt || 0)) { H.setState(remote); H.onSynced(Date.now()); }
      else await push();
      if (stepsF) { try { H.mergeSteps(JSON.parse(stepsF)); } catch (e) { } }
      return;
    }
    await push();
  } catch (e) { console.error(e); H.toast('Synchro impossible pour l’instant'); }
}

async function push() {
  const u = auth && auth.currentUser; if (!u) return;
  const S = H.getState();
  await F.setDoc(F.doc(db, 'users', u.uid), { data: JSON.stringify(S), updatedAt: S.updatedAt || Date.now(), email: u.email || '' }, { merge: true });
  H.onSynced(Date.now());
}

export async function login(email, pass) { return F.signInWithEmailAndPassword(auth, email, pass); }
export async function signup(email, pass) { return F.createUserWithEmailAndPassword(auth, email, pass); }
export async function google() {
  const p = new F.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { return await F.signInWithPopup(auth, p); }
  catch (e) { if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return F.signInWithRedirect(auth, p); throw e; }
}
export async function resetPassword(email) { return F.sendPasswordResetEmail(auth, email); }
export async function logout() { await F.signOut(auth); }
export async function syncNow() { await push(); }

export async function refresh() { if (auth && auth.currentUser) await pull(auth.currentUser); }

/* ---------- données partagées (section cachée) ---------- */
export function uid() { return auth && auth.currentUser ? auth.currentUser.uid : null; }
export async function bdAdd(t, name) { const u = auth.currentUser; if (!u) throw new Error('auth'); return (await F.addDoc(F.collection(db, 'bd'), { uid: u.uid, name: name || (u.email || '').split('@')[0], t })).id; }
export async function bdDel(id) { await F.deleteDoc(F.doc(db, 'bd', id)); }
export function bdWatch(cb, err) {
  const since = Date.now() - 400 * 864e5;
  return F.onSnapshot(F.query(F.collection(db, 'bd'), F.where('t', '>=', since)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => { console.warn(e); err && err(e); });
}
