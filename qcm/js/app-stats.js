/* Page stats : moyenne des notes par élève */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function capitalize(name) {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  const d = timestamp.toDate();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const globalSummary = document.getElementById("global-summary");
const container = document.getElementById("stats-container");

db.collection(COL_RESULTATS)
  .get()
  .then((snapshot) => {
    if (snapshot.empty) {
      container.innerHTML = `<div class="card empty-state"><p>Aucun QCM n'a encore été passé.</p></div>`;
      return;
    }

    // Regroupement par prénom (insensible à la casse / aux espaces)
    const students = {}; // key: prenom normalisé -> { display, attempts: [] }

    snapshot.forEach((doc) => {
      const data = doc.data();
      const rawPrenom = (data.prenom || "Anonyme").trim();
      const key = rawPrenom.toLowerCase();
      if (!students[key]) {
        students[key] = { display: capitalize(rawPrenom), attempts: [] };
      }
      students[key].attempts.push({
        quizTitle: data.quizTitle || "QCM",
        quizNumero: data.quizNumero,
        score: data.score || 0,
        total: data.total || 10,
        date: data.date,
      });
    });

    // Résumé global
    let totalScore = 0;
    let totalMax = 0;
    let totalAttempts = 0;
    Object.values(students).forEach((s) => {
      s.attempts.forEach((a) => {
        totalScore += a.score;
        totalMax += a.total;
        totalAttempts++;
      });
    });
    const globalAvg = totalMax > 0 ? (totalScore / totalAttempts).toFixed(1) : "0";

    globalSummary.innerHTML = `
      <div class="card" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
        <div>
          <h3 style="margin-bottom:2px;">Moyenne générale</h3>
          <p style="margin:0;">${Object.keys(students).length} élève${Object.keys(students).length > 1 ? "s" : ""} · ${totalAttempts} QCM passé${totalAttempts > 1 ? "s" : ""} au total</p>
        </div>
        <div class="score-value" style="font-size:2.2rem;">${globalAvg}/10</div>
      </div>`;

    // Liste des élèves, triée alphabétiquement
    const sortedKeys = Object.keys(students).sort((a, b) => students[a].display.localeCompare(students[b].display, "fr"));

    let html = "";
    sortedKeys.forEach((key, idx) => {
      const s = students[key];
      const avg = (s.attempts.reduce((sum, a) => sum + a.score, 0) / s.attempts.length).toFixed(1);
      const sortedAttempts = [...s.attempts].sort((a, b) => {
        const da = a.date && a.date.toDate ? a.date.toDate().getTime() : 0;
        const db_ = b.date && b.date.toDate ? b.date.toDate().getTime() : 0;
        return db_ - da;
      });

      html += `
        <div class="student-row" data-target="history-${idx}">
          <div>
            <div class="student-name">${escapeHtml(s.display)}</div>
            <div class="student-count">${s.attempts.length} QCM passé${s.attempts.length > 1 ? "s" : ""}</div>
          </div>
          <div class="student-avg">${avg}/10</div>
        </div>
        <div class="history-list" id="history-${idx}">
          ${sortedAttempts
            .map(
              (a) => `
            <div class="history-row">
              <span>QCM n°${a.quizNumero ?? "?"} — ${escapeHtml(a.quizTitle)}</span>
              <span>${formatDate(a.date)} · ${a.score}/${a.total}</span>
            </div>`
            )
            .join("")}
        </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll(".student-row").forEach((row) => {
      row.addEventListener("click", () => {
        const target = document.getElementById(row.dataset.target);
        target.classList.toggle("open");
      });
    });
  })
  .catch((err) => {
    console.error(err);
    container.innerHTML = `<div class="card"><p class="alert alert-error">Impossible de charger les statistiques.</p></div>`;
  });
