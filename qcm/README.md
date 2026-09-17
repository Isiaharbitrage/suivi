# QCM Hebdo

Site de QCM hebdomadaires — thème rose & noir, pensé pour être hébergé exactement comme ton site d'arbitrage (GitHub Pages + Firebase).

## Contenu du dossier

```
qcm/
├── index.html          → page d'accueil, liste tous les QCM
├── admin.html           → espace prof : connexion + création d'un QCM (10 questions)
├── qcm.html              → passage d'un QCM (prénom → questions → résultat)
├── stats.html            → moyenne des notes par élève
├── style.css              → thème rose & noir partagé par toutes les pages
├── firebase-config.js     → À COMPLÉTER avec ta configuration Firebase
├── firestore.rules        → règles de sécurité Firestore à copier dans la console Firebase
└── js/
    ├── app-index.js
    ├── app-admin.js
    ├── app-qcm.js
    └── app-stats.js
```

## 1. Configurer Firebase

1. Va sur [console.firebase.google.com](https://console.firebase.google.com).
2. Tu peux **réutiliser le même projet Firebase que ton site d'arbitrage** (recommandé, ça reste gratuit) ou en créer un nouveau.
3. Si tu réutilises le même projet : Paramètres du projet (roue crantée) → tes applications Web → copie l'objet `firebaseConfig`. Colle ses valeurs dans `firebase-config.js` (remplace les `"REMPLACE_MOI"`).
4. Active **Firestore Database** si ce n'est pas déjà fait (mode production).
5. Active **Authentication → méthode Email/Mot de passe**, et crée-toi un compte (email + mot de passe) dans l'onglet "Users" si tu n'en as pas déjà un sur ce projet. C'est ce compte qui te permettra de te connecter sur `admin.html` pour créer les QCM — les élèves, eux, n'ont besoin d'aucun compte.
6. Dans **Firestore Database → Règles**, colle le contenu de `firestore.rules` et publie. Ces règles :
   - laissent tout le monde lire les QCM et les résultats (nécessaire pour que les élèves passent les quiz et que la page stats fonctionne),
   - réservent la création/modification des QCM aux personnes connectées (toi),
   - permettent à n'importe qui d'envoyer un résultat (les élèves ne sont pas connectés), mais empêchent de modifier ou supprimer un résultat déjà enregistré sans être connecté.

   ⚠️ Ces collections (`qcm_quizzes`, `qcm_resultats`) sont différentes de celles utilisées par ton site d'arbitrage, donc même en réutilisant le même projet Firebase, rien ne se mélangera. Si ton site d'arbitrage a déjà des règles Firestore, pense à **fusionner** les deux blocs de règles dans un seul fichier plutôt que d'écraser les règles existantes.

## 2. Placer les fichiers dans ton dépôt "suivi"

Dépose tout le dossier `qcm/` dans ton dépôt GitHub `suivi`, au même endroit que le contenu publié par GitHub Pages :

- Si ton site est publié **depuis la racine** du dépôt (branche main / root) → mets le dossier `qcm/` directement à la racine, à côté de tes fichiers existants.
- Si ton site est publié **depuis un dossier `/docs`** → mets-le dans `docs/qcm/`.

Aucune configuration GitHub Pages supplémentaire n'est nécessaire : comme c'est un sous-dossier de ton site déjà publié, il sera automatiquement accessible à une adresse du type :

```
https://isiaharbitrage.github.io/suivi/qcm/
```

Ce site QCM reste totalement indépendant de ton site d'arbitrage (pages, menu et style séparés) — les deux vivent juste dans le même dépôt.

## 3. Déployer

```bash
git add qcm
git commit -m "Ajout du site QCM Hebdo"
git push
```

GitHub Pages republie automatiquement après le push (compte quelques dizaines de secondes à quelques minutes).

## 4. Tester en local avant de pousser (optionnel)

Comme le site appelle Firebase, ouvrir simplement les fichiers en double-clic peut suffire, mais pour éviter tout souci il est plus sûr de lancer un petit serveur local depuis le dossier `qcm/` :

```bash
python3 -m http.server 8000
```

puis ouvre `http://localhost:8000` dans le navigateur.

## Comment fonctionne le site

- **Accueil** (`index.html`) : liste tous les QCM publiés (numéro, titre, nombre de questions), du plus ancien au plus récent.
- **Espace prof** (`admin.html`) : après connexion, formulaire pour créer un nouveau QCM de 10 questions (chacune avec 4 propositions et une bonne réponse à cocher). Le numéro du QCM est calculé automatiquement.
- **Passage d'un QCM** (`qcm.html`) : l'élève entre son prénom, puis répond aux 10 questions une par une (il faut valider une réponse pour passer à la suivante). Aucune indication vrai/faux n'est donnée pendant le quiz. À la fin, une page affiche la note sur 10, le détail de chaque question (réponse donnée + correction si besoin), et un bouton pour télécharger le bilan en PDF. Le résultat est automatiquement enregistré dans Firestore.
- **Stats** (`stats.html`) : liste tous les élèves ayant passé au moins un QCM, avec leur moyenne générale et, en cliquant sur leur nom, l'historique détaillé de leurs passages.

## Personnaliser

- **Couleurs** : tout le thème rose/noir est défini en haut de `style.css`, dans le bloc `:root` (variables `--pink`, `--bg`, etc.) — change ces valeurs pour ajuster les teintes.
- **Nombre de questions** : fixé à 10 par question de conception (comme demandé). Si tu veux un jour changer ce nombre, modifie la constante `NB_QUESTIONS` dans `js/app-admin.js`.
