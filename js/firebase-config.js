// ⚠️ Remplace les valeurs ci-dessous par celles de TON projet Firebase.
// Comment les obtenir : voir README.md, section "Configuration Firebase".
//
// Console Firebase → Paramètres du projet → tes applications → SDK setup and configuration.

export const firebaseConfig = {
  apiKey: "AIzaSyBwT3_gtAVPNAkYVoJhrDMnqo-fkk_jev8",
  authDomain: "arbitrage-90e83.firebaseapp.com",
  projectId: "arbitrage-90e83",
  storageBucket: "arbitrage-90e83.firebasestorage.app",
  messagingSenderId: "117029983354",
  appId: "1:117029983354:web:7d21c5cafd74574bea57c3",
  measurementId: "G-ZC9EDD9K86"
};

// Identifiants utilisés en interne pour connecter automatiquement le site
// à Firebase, sans écran de connexion visible. Ils n'ont pas besoin d'être
// mémorisés : le site les utilise lui-même, à chaque ouverture.
export const autoAuth = {
  email: "site-arbitrage@example.com",
  password: "Bxk92Trq!84vLmZ7"
};

// ---------------------------------------------------------------
// Espace coaching (second projet Firebase, voir le README du site coaching)
// À remplir une fois le projet coaching créé. Tant que ce n'est pas fait,
// le bouton « Publier au coaching » te le signale simplement.
// ---------------------------------------------------------------
export const coachingConfig = {
  apiKey: "AIzaSyBgNgTno_RCh0IBEN4bIYc1dbJeHkHwH6M",
  authDomain: "coaching-arbitrage.firebaseapp.com",
  projectId: "coaching-arbitrage",
  storageBucket: "coaching-arbitrage.firebasestorage.app",
  messagingSenderId: "359461498848",
  appId: "1:359461498848:web:0b27df7c2d42597a648585"
};

// Ton e-mail de coach (le même que sur l'espace coaching). Le mot de passe
// est demandé à chaque publication et n'est jamais enregistré.
export const COACH_EMAIL = "isiah.schmidt@hotmail.fr";
