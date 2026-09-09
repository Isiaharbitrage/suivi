# Suivi d'arbitrage — Basketball

Site pour suivre tes matchs arbitrés, tes auto-évaluations et les observations reçues, avec accès depuis plusieurs appareils.

Techniquement : une page HTML/CSS/JS statique (compatible GitHub Pages) + **Firebase** (gratuit) pour l'authentification et le stockage des données dans le cloud.

## 1. Créer ton projet Firebase (gratuit, ~5 min)

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. Clique sur **Ajouter un projet**, donne-lui un nom (ex. `arbitrage-basket`), continue jusqu'au bout (tu peux désactiver Google Analytics, pas nécessaire).
3. Dans le menu de gauche, va dans **Build → Authentication** → onglet **Sign-in method** → active la méthode **E-mail/Mot de passe**.
4. Toujours dans le menu de gauche, va dans **Build → Firestore Database** → **Créer une base de données** → choisis une région proche (ex. `eur3 (europe-west)`) → démarre en **mode production**.
5. Une fois la base créée, va dans l'onglet **Règles** et remplace le contenu par :

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

   Cela garantit que chacun ne peut lire/écrire que ses propres données. Clique sur **Publier**.

6. Retourne dans **Paramètres du projet** (icône ⚙️ en haut à gauche) → onglet **Général** → section **Vos applications** → clique sur l'icône **</>** (Web) → donne un nom à l'app → **Enregistrer l'application**.
7. Firebase t'affiche un objet `firebaseConfig`. Copie ces valeurs dans le fichier **`js/firebase-config.js`** du projet, à la place des valeurs `COLLE_TA_CLE_API_ICI`, etc.

## 2. Mettre le site sur ton dépôt GitHub

1. Copie les fichiers de ce projet (`index.html`, `css/`, `js/`, ce `README.md`) dans ton dépôt GitHub existant (à la racine, ou dans un sous-dossier si tu préfères).
2. Commit + push vers GitHub.
3. Dans les paramètres du dépôt (**Settings → Pages**), vérifie que GitHub Pages est activé sur la branche et le dossier où se trouve `index.html`.
4. Ton site sera accessible à une adresse du type `https://tonpseudo.github.io/nom-du-depot/`.

## 3. Créer ton compte sur le site

1. Ouvre ton site une fois en ligne.
2. Sur l'écran de connexion, clique sur **Créer un compte**, renseigne ton e-mail et un mot de passe (6 caractères minimum).
3. Connecte-toi avec les mêmes identifiants sur tous tes appareils : tes données (matchs, observations) seront automatiquement synchronisées via Firestore.

## Fonctionnalités

- **Tableau de bord** : nombre de matchs, note moyenne, évolution de ta note au fil de la saison, axes d'amélioration les plus cités dans tes observations.
- **Mes matchs** : ajoute chaque match (date, niveau, équipes, score, ton rôle), avec une auto-évaluation notée sur 10, tes points forts, points à travailler et une analyse libre.
- **Observations** : consigne les retours reçus (observateur, axes d'amélioration sous forme d'étiquettes, appréciation reçue, et ton propre ressenti).

## Limites du plan gratuit Firebase (Spark)

Largement suffisant pour un usage personnel : 50 000 lectures et 20 000 écritures Firestore par jour, authentification illimitée. Tu ne devrais jamais approcher ces limites avec ce site.

## Aller plus loin (optionnel)

- Ajouter un onglet "Compétitions" pour regrouper les matchs par saison/championnat.
- Exporter tes données en PDF/CSV avant un entretien avec un responsable d'arbitrage.
- Ajouter une photo ou un logo de club sur chaque match.

N'hésite pas à redemander de l'aide pour ajouter une de ces fonctionnalités, ou pour du dépannage si quelque chose ne s'affiche pas correctement.
