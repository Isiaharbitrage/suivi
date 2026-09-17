/* Page admin : création d'un QCM de 10 questions vrai/faux (accès libre, sans connexion) */

const NB_QUESTIONS = 10;
const TF_LABELS = ["Vrai", "Faux"];

const adminSection = document.getElementById("admin-section");
const questionsContainer = document.getElementById("questions-container");
const quizTitleInput = document.getElementById("quiz-title");
const numeroPreview = document.getElementById("quiz-numero-preview");
const adminAlert = document.getElementById("admin-alert");
const submitBtn = document.getElementById("submit-quiz");
const importJsonInput = document.getElementById("import-json");
const importAlert = document.getElementById("import-alert");
const importBtn = document.getElementById("import-btn");

let nextNumero = 1;

initAdminForm();

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
      <label>Affirmation à juger vrai ou faux</label>
      <textarea rows="3" class="q-text" data-index="${index}" placeholder="Énoncé de l'affirmation"></textarea>
    </div>
    <div class="tf-choice">
      <label class="tf-option">
        <input type="radio" name="correct-${index}" value="0" class="q-correct" data-index="${index}" />
        <span>Vrai</span>
      </label>
      <label class="tf-option">
        <input type="radio" name="correct-${index}" value="1" class="q-correct" data-index="${index}" />
        <span>Faux</span>
      </label>
    </div>
    <div class="field" style="margin-top:10px; margin-bottom:0;">
      <label>Explication (optionnelle, affichée si la réponse est fausse)</label>
      <textarea rows="2" class="q-explication" data-index="${index}" placeholder="Ex : référence à l'article / interprétation concernée"></textarea>
    </div>
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

/* ---------- Publication commune (formulaire manuel + import JSON) ---------- */

function publishQuiz(titre, questions, alertEl, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Publication…";

  db.collection(COL_QUIZZES)
    .add({
      titre: titre,
      numero: nextNumero,
      questions: questions,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      alertEl.innerHTML = `<p class="alert alert-success">QCM n°${nextNumero} publié avec succès !</p>`;
      initAdminForm();
      importJsonInput.value = "";
    })
    .catch((err) => {
      console.error(err);
      alertEl.innerHTML = `<p class="alert alert-error">Erreur lors de la publication : ${escapeHtml(err.message)}</p>`;
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = originalLabel;
    });
}

/* ---------- Soumission manuelle ---------- */

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

    const checkedEl = questionsContainer.querySelector(`.q-correct[data-index="${i}"]:checked`);
    if (!checkedEl) {
      adminAlert.innerHTML = `<p class="alert alert-error">Sélectionne Vrai ou Faux pour la question ${i + 1}.</p>`;
      return;
    }

    const explicationEl = questionsContainer.querySelector(`.q-explication[data-index="${i}"]`);
    const explication = explicationEl ? explicationEl.value.trim() : "";

    const question = {
      texte: text,
      options: TF_LABELS,
      bonneReponse: parseInt(checkedEl.value, 10),
    };
    if (explication) question.explication = explication;

    questions.push(question);
  }

  publishQuiz(titre, questions, adminAlert, submitBtn);
});

/* ---------- Import rapide (JSON) ---------- */

importBtn.addEventListener("click", () => {
  importAlert.innerHTML = "";

  let data;
  try {
    data = JSON.parse(importJsonInput.value);
  } catch (e) {
    importAlert.innerHTML = `<p class="alert alert-error">JSON invalide : ${escapeHtml(e.message)}</p>`;
    return;
  }

  if (!data.titre || typeof data.titre !== "string") {
    importAlert.innerHTML = `<p class="alert alert-error">Le champ "titre" est manquant ou invalide.</p>`;
    return;
  }

  if (!Array.isArray(data.questions) || data.questions.length !== NB_QUESTIONS) {
    importAlert.innerHTML = `<p class="alert alert-error">Il faut exactement ${NB_QUESTIONS} questions dans le tableau "questions" (${Array.isArray(data.questions) ? data.questions.length : 0} trouvée(s)).</p>`;
    return;
  }

  const questions = [];
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i] || {};
    if (!q.texte || typeof q.texte !== "string") {
      importAlert.innerHTML = `<p class="alert alert-error">Question ${i + 1} : champ "texte" manquant ou invalide.</p>`;
      return;
    }
    if (typeof q.reponse !== "boolean") {
      importAlert.innerHTML = `<p class="alert alert-error">Question ${i + 1} : champ "reponse" doit être true (Vrai) ou false (Faux).</p>`;
      return;
    }
    const question = {
      texte: q.texte,
      options: TF_LABELS,
      bonneReponse: q.reponse ? 0 : 1,
    };
    if (q.explication && typeof q.explication === "string") {
      question.explication = q.explication;
    }
    questions.push(question);
  }

  publishQuiz(data.titre, questions, importAlert, importBtn);
});
