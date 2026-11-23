# Lockin 🔒

App de gym (PWA) : séances, progression, constance, nutrition, poids, mensurations, photos et coach caméra IA.
Tout est stocké sur ton téléphone (aucun compte, aucun serveur).

## Mettre en ligne avec GitHub Pages
1. Crée un repo public sur GitHub (ex. `lockin`).
2. Upload **tous les fichiers de ce dossier** (garde le dossier ``) à la racine du repo.
3. Repo → **Settings → Pages** → Source : `Deploy from a branch` → Branch : `main` / `(root)` → Save.
4. Attends 1-2 min, ton app est sur `https://TON-USERNAME.github.io/lockin/`.

## L'ajouter à l'écran d'accueil
- iPhone : ouvre le lien dans **Safari** → Partager → **Sur l'écran d'accueil**.
- Android : Chrome → ⋮ → **Installer l'application**.

## Comptes (courriel + mot de passe, optionnel, gratuit)
1. https://console.firebase.google.com → Créer un projet.
2. Build → Authentication → Commencer → Adresse e-mail/Mot de passe → Activer.
3. Authentication → Paramètres → Domaines autorisés → ajoute `lavageld.github.io`.
4. Build → Firestore Database → Créer → onglet Règles, colle :
   ```
   rules_version = '2';
   service cloud.firestore { match /databases/{db}/documents {
     match /users/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; }
   } }
   ```
5. Paramètres du projet → Vos applications → icône Web `</>` → copie la config dans `firebase-config.js`.
Tu restes connecté sur le même téléphone tant que tu te déconnectes pas. Les photos restent seulement sur le téléphone.

## Mises à jour
Quand tu modifies un fichier, change aussi `CACHE` dans `sw.js` (ex. `lockin-v1.0.1`) pour forcer la mise à jour sur ton téléphone.

## Sauvegarde
Réglages → Exporter. Fais-le de temps en temps : si tu effaces les données de Safari, tout part.
