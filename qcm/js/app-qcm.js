/* Page de passage d'un QCM : prénom -> questions une par une -> résultat */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

const params = new URLSearchParams(window.location.search);
const quizId = params.get("id");

const viewLoading = document.getElementById("view-loading");
const viewError = document.getElementById("view-error");
const viewName = document.getElementById("view-name");
const viewQuiz = document.getElementById("view-quiz");
const viewResult = document.getElementById("view-result");

let quiz = null; // { titre, numero, questions: [...] }
let prenom = "";
let currentIndex = 0;
let selectedOption = null;
const answers = []; // index de la réponse choisie, une par question

function showView(view) {
  [viewLoading, viewError, viewName, viewQuiz, viewResult].forEach((v) => (v.style.display = "none"));
  view.style.display = "block";
}

/* ---------- Chargement du quiz ---------- */

if (!quizId) {
  document.getElementById("error-message").textContent = "Aucun QCM sélectionné.";
  showView(viewError);
} else {
  db.collection(COL_QUIZZES)
    .doc(quizId)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        document.getElementById("error-message").textContent = "Ce QCM n'existe pas ou plus.";
        showView(viewError);
        return;
      }
      quiz = doc.data();
      quiz.id = doc.id;
      document.getElementById("name-quiz-title").textContent = `QCM n°${quiz.numero} — ${quiz.titre}`;
      showView(viewName);
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("error-message").textContent = "Erreur de chargement du QCM.";
      showView(viewError);
    });
}

/* ---------- Étape 1 : prénom ---------- */

const prenomInput = document.getElementById("prenom-input");
const startBtn = document.getElementById("start-btn");

startBtn.addEventListener("click", startQuiz);
prenomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startQuiz();
});

function startQuiz() {
  const val = prenomInput.value.trim();
  if (!val) {
    prenomInput.focus();
    return;
  }
  prenom = val;
  currentIndex = 0;
  answers.length = 0;
  showView(viewQuiz);
  renderQuestion();
}

/* ---------- Étape 2 : questions ---------- */

const progressFill = document.getElementById("progress-fill");
const progressLabelText = document.getElementById("progress-label-text");
const progressQuizTitle = document.getElementById("progress-quiz-title");
const questionText = document.getElementById("question-text");
const optionsContainer = document.getElementById("options-container");
const validateBtn = document.getElementById("validate-btn");

progressQuizTitle.textContent = "";

function renderQuestion() {
  selectedOption = null;
  validateBtn.disabled = true;

  const total = quiz.questions.length;
  const q = quiz.questions[currentIndex];

  progressFill.style.width = `${(currentIndex / total) * 100}%`;
  progressLabelText.textContent = `Question ${currentIndex + 1}/${total}`;
  progressQuizTitle.textContent = `QCM n°${quiz.numero}`;
  questionText.textContent = q.texte;

  optionsContainer.classList.toggle("options-tf", q.options.length === 2);

  optionsContainer.innerHTML = q.options
    .map(
      (opt, i) => `
      <div class="option" data-opt="${i}">
        <div class="bullet"></div>
        <div class="option-text">${escapeHtml(opt)}</div>
      </div>`
    )
    .join("");

  optionsContainer.querySelectorAll(".option").forEach((el) => {
    el.addEventListener("click", () => {
      optionsContainer.querySelectorAll(".option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedOption = parseInt(el.dataset.opt, 10);
      validateBtn.disabled = false;
    });
  });
}

validateBtn.addEventListener("click", () => {
  if (selectedOption === null) return;
  answers.push(selectedOption);

  const total = quiz.questions.length;
  if (currentIndex + 1 < total) {
    currentIndex++;
    renderQuestion();
  } else {
    progressFill.style.width = "100%";
    finishQuiz();
  }
});

/* ---------- Étape 3 : résultat ---------- */

let lastDetails = [];
let lastScore = 0;

function finishQuiz() {
  const total = quiz.questions.length;
  let score = 0;
  const details = quiz.questions.map((q, i) => {
    const given = answers[i];
    const correct = given === q.bonneReponse;
    if (correct) score++;
    const detail = {
      texte: q.texte,
      options: q.options,
      donnee: given,
      bonneReponse: q.bonneReponse,
      correct: correct,
    };
    if (q.explication) detail.explication = q.explication;
    return detail;
  });

  lastDetails = details;
  lastScore = score;

  // Enregistrement du résultat dans Firestore
  db.collection(COL_RESULTATS)
    .add({
      quizId: quiz.id,
      quizTitle: quiz.titre,
      quizNumero: quiz.numero,
      prenom: prenom,
      score: score,
      total: total,
      details: details,
      date: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .catch((err) => console.error("Erreur d'enregistrement du résultat :", err));

  renderResult(score, total, details);
}

function renderResult(score, total, details) {
  document.getElementById("result-title").innerHTML = `Bravo <span class="accent">${escapeHtml(prenom)}</span> !`;
  document.getElementById("result-sub").textContent = `QCM n°${quiz.numero} — ${quiz.titre}`;
  document.getElementById("score-value").textContent = `${score}/${total}`;

  let subText;
  const pct = (score / total) * 100;
  if (pct === 100) subText = "Sans faute, félicitations !";
  else if (pct >= 70) subText = "Très bon résultat !";
  else if (pct >= 50) subText = "Pas mal, continue comme ça.";
  else subText = "Il va falloir revoir un peu tout ça, courage !";
  document.getElementById("score-sub-text").textContent = subText;

  const detailList = document.getElementById("detail-list");
  detailList.innerHTML = details
    .map((d, i) => {
      const givenText = escapeHtml(d.options[d.donnee]);
      const correctText = escapeHtml(d.options[d.bonneReponse]);
      return `
      <div class="detail-item">
        <div class="detail-head">
          <div class="detail-q">${i + 1}. ${escapeHtml(d.texte)}</div>
          <span class="badge ${d.correct ? "ok" : "ko"}">${d.correct ? "Correct" : "Incorrect"}</span>
        </div>
        <div class="detail-answer ${d.correct ? "correct-line" : "wrong-line"}">Ta réponse : <strong>${givenText}</strong></div>
        ${d.correct ? "" : `<div class="detail-answer correct-line">Bonne réponse : <strong>${correctText}</strong></div>`}
        ${!d.correct && d.explication ? `<div class="detail-explication">${escapeHtml(d.explication)}</div>` : ""}
      </div>`;
    })
    .join("");

  showView(viewResult);
}

/* ---------- Téléchargement du bilan PDF ---------- */

document.getElementById("download-btn").addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginLeft = 48;
  let y = 56;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - marginLeft * 2;

  function addLine(text, options = {}) {
    const { size = 11, bold = false, color = [20, 20, 20], gapAfter = 14 } = options;
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, marginLeft, y);
      y += size * 1.15;
    });
    y += gapAfter;
  }

  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  addLine("Bilan QCM", { size: 20, bold: true, color: [194, 24, 91] });
  addLine(`QCM n°${quiz.numero} — ${quiz.titre}`, { size: 13, bold: true });
  addLine(`Élève : ${prenom}    Date : ${dateStr}`, { size: 11, color: [90, 90, 90] });
  addLine(`Note : ${lastScore}/${lastDetails.length}`, { size: 15, bold: true, color: [255, 46, 136] });

  lastDetails.forEach((d, i) => {
    const givenText = d.options[d.donnee];
    const correctText = d.options[d.bonneReponse];
    addLine(`${i + 1}. ${d.texte}`, { size: 12, bold: true, gapAfter: 4 });
    addLine(`Réponse donnée : ${givenText}   —   ${d.correct ? "CORRECT" : "INCORRECT"}`, {
      size: 10.5,
      color: d.correct ? [22, 163, 116] : [214, 40, 60],
      gapAfter: d.correct ? 12 : 2,
    });
    if (!d.correct) {
      addLine(`Correction : ${correctText}`, { size: 10.5, color: [90, 90, 90], gapAfter: d.explication ? 2 : 12 });
      if (d.explication) {
        addLine(d.explication, { size: 9.5, color: [120, 120, 120], gapAfter: 12 });
      }
    }
  });

  const safeTitle = quiz.titre.replace(/[^a-z0-9]+/gi, "_");
  const safePrenom = prenom.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`QCM${quiz.numero}_${safeTitle}_${safePrenom}.pdf`);
});
