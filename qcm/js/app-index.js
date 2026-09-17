/* Page d'accueil : liste tous les QCM disponibles */

const container = document.getElementById("quiz-list-container");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  const d = timestamp.toDate();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

db.collection(COL_QUIZZES)
  .orderBy("numero", "asc")
  .get()
  .then((snapshot) => {
    if (snapshot.empty) {
      container.innerHTML = `
        <div class="card empty-state">
          <p>Aucun QCM n'a encore été publié.<br>Reviens bientôt !</p>
        </div>`;
      return;
    }

    let html = '<div class="qcm-list">';
    snapshot.forEach((doc) => {
      const data = doc.data();
      const nbQuestions = Array.isArray(data.questions) ? data.questions.length : 0;
      html += `
        <a class="qcm-item" href="qcm.html?id=${encodeURIComponent(doc.id)}">
          <div class="qcm-num">QCM<br>${escapeHtml(data.numero ?? "")}</div>
          <div class="qcm-info">
            <div class="qcm-title">${escapeHtml(data.titre || "Sans titre")}</div>
            <div class="qcm-meta">${nbQuestions} question${nbQuestions > 1 ? "s" : ""}${data.createdAt ? " · " + formatDate(data.createdAt) : ""}</div>
          </div>
          <div class="qcm-arrow">→</div>
        </a>`;
    });
    html += "</div>";
    container.innerHTML = html;
  })
  .catch((err) => {
    console.error(err);
    container.innerHTML = `<div class="card"><p class="alert alert-error">Impossible de charger les QCM. Vérifie la configuration Firebase (firebase-config.js) et les règles Firestore.</p></div>`;
  });
