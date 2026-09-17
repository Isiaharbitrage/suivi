/* Page admin : connexion + création d'un QCM de 10 questions */

const NB_QUESTIONS = 10;
const NB_OPTIONS = 4;

const loginSection = document.getElementById("login-section");
const adminSection = document.getElementById("admin-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const questionsContainer = document.getElementById("questions-container");
const quizTitleInput = document.getElementById("quiz-title");
const numeroPreview = document.getElementById("quiz-numero-preview");
const adminAlert = document.getElementById("admin-alert");
const submitBtn = document.getElementById("submit-quiz");

let nextNumero = 1;

/* ---------- Auth ---------- */

auth.onAuthStateChanged((user) => {
  if (user) {
    loginSection.style.display = "none";
    adminSection.style.display = "block";
    initAdminForm();
  } else {
    loginSection.style.display = "block";
    adminSection.style.display = "none";
  }
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginError.innerHTML = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    loginError.innerHTML = `<p class="alert alert-error">Connexion impossible : ${escapeHtml(err.message)}</p>`;
  });
});

logoutBtn.addEventListener("click", () => {
  auth.signOut();
});

/* ---------- Helpers ---------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function buildQuestionBlock(index) {
  const wrap = document.createElement("div");
  wrap.className = "question-block";
  wrap.innerHTML = `
    <div class="qb-head"><span>Question ${index + 1}</span></div>
    <div class="field">
      <label>Énoncé</label>
      <textarea rows="2" class="q-text" data-index="${index}" placeholder="Texte de la question"></textarea>
    </div>
    ${Array.from({ length: NB_OPTIONS }).map((_, optIndex) => `
      <div class="field" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <input type="radio" name="correct-${index}" value="${optIndex}" class="q-correct" data-index="${index}" data-opt="${optIndex}" style="width:auto;" />
        <input type="text" class="q-option" data-index="${index}" data-opt="${optIndex}" placeholder="Proposition ${optIndex + 1}" style="flex:1; margin-bottom:0;" />
      </div>
    `).join("")}
  `;
  return wrap;
}

function initAdminForm() {
  questionsContainer.innerHTML = "";
  for (let i = 0; i < NB_QUESTIONS; i++) {
    questionsContainer.appendChild(buildQuestionBlock(i));
  }
  adminAlert.innerHTML = "";
  quizTitleInput.value = "";
  refreshNumeroPreview();
}

function refreshNumeroPreview() {
  db.collection(COL_QUIZZES)
    .orderBy("numero", "desc")
    .limit(1)
    .get()
    .then((snap) => {
      nextNumero = snap.empty ? 1 : (snap.docs[0].data().numero || 0) + 1;
      numeroPreview.textContent = `Ce sera le QCM n°${nextNumero}`;
    })
    .catch(() => {
      nextNumero = 1;
      numeroPreview.textContent = "";
    });
}

/* ---------- Soumission ---------- */

submitBtn.addEventListener("click", () => {
  adminAlert.innerHTML = "";

  const titre = quizTitleInput.value.trim();
  if (!titre) {
    adminAlert.innerHTML = `<p class="alert alert-error">Ajoute un titre pour ce QCM.</p>`;
    return;
  }

  const questions = [];
  for (let i = 0; i < NB_QUESTIONS; i++) {
    const textEl = questionsContainer.querySelector(`.q-text[data-index="${i}"]`);
    const text = textEl.value.trim();
    if (!text) {
      adminAlert.innerHTML = `<p class="alert alert-error">La question ${i + 1} n'a pas d'énoncé.</p>`;
      textEl.focus();
      return;
    }

    const options = [];
    for (let o = 0; o < NB_OPTIONS; o++) {
      const optEl = questionsContainer.querySelector(`.q-option[data-index="${i}"][data-opt="${o}"]`);
      const val = optEl.value.trim();
      if (!val) {
        adminAlert.innerHTML = `<p class="alert alert-error">La question ${i + 1} a une proposition vide.</p>`;
        optEl.focus();
        return;
      }
      options.push(val);
    }

    const checkedEl = questionsContainer.querySelector(`.q-correct[data-index="${i}"]:checked`);
    if (!checkedEl) {
      adminAlert.innerHTML = `<p class="alert alert-error">Sélectionne la bonne réponse pour la question ${i + 1}.</p>`;
      return;
    }

    questions.push({
      texte: text,
      options: options,
      bonneReponse: parseInt(checkedEl.dataset.opt, 10),
    });
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Publication…";

  db.collection(COL_QUIZZES)
    .add({
      titre: titre,
      numero: nextNumero,
      questions: questions,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      adminAlert.innerHTML = `<p class="alert alert-success">QCM n°${nextNumero} publié avec succès !</p>`;
      initAdminForm();
    })
    .catch((err) => {
      console.error(err);
      adminAlert.innerHTML = `<p class="alert alert-error">Erreur lors de la publication : ${escapeHtml(err.message)}</p>`;
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = "Publier le QCM";
    });
});
