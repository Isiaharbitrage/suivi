/* =======================================================
   Configuration Firebase — À COMPLÉTER
   =======================================================
   1. Va sur https://console.firebase.google.com
   2. Choisis ton projet existant (celui du site arbitrage,
      recommandé) ou crées-en un nouveau (gratuit).
   3. Paramètres du projet (roue crantée) > Vos applications
      > Ajouter une application Web (si pas déjà fait) > Copie
      l'objet "firebaseConfig" et colle ses valeurs ci-dessous.
   4. Active Firestore Database (mode production) si ce n'est
      pas déjà fait, et Firebase Authentication (méthode
      Email/Mot de passe) pour pouvoir te connecter à la page
      admin.
   5. Crée-toi un compte (email/mot de passe) dans
      Authentication > Users si tu n'en as pas déjà un — c'est
      celui-ci qui te servira à te connecter sur admin.html.
   ======================================================= */

const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.appspot.com",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/* Noms des collections Firestore utilisées par ce site.
   Choisis exprès différents de ceux du site arbitrage pour
   ne rien mélanger, même si tu réutilises le même projet. */
const COL_QUIZZES = "qcm_quizzes";
const COL_RESULTATS = "qcm_resultats";
