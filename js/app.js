import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------- Firebase init ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("COLLE_TA_CLE")) {
  document.getElementById('auth-hint').hidden = false;
}

/* ---------------- State ---------------- */
let currentUser = null;
let matches = [];
let observations = [];
let unsubMatches = null;
let unsubObs = null;
let currentView = 'dashboard';

const NIVEAUX = ["Départemental", "Régional", "Pré-national", "National", "Autre"];
const ROLES = ["1er arbitre", "2e arbitre", "3e arbitre", "Table de marque"];

/* ---------------- Auth screen ---------------- */
const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
let authMode = 'signin';

authToggle.addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  authSubmit.textContent = authMode === 'signin' ? 'Se connecter' : 'Créer mon compte';
  authToggle.innerHTML = authMode === 'signin'
    ? `Pas encore de compte ? <span>Créer un compte</span>`
    : `Déjà un compte ? <span>Se connecter</span>`;
  authError.hidden = true;
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authSubmit.disabled = true;
  try {
    if (authMode === 'signin') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = friendlyAuthError(err.code);
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email': "Adresse e-mail invalide.",
    'auth/user-not-found': "Aucun compte avec cet e-mail.",
    'auth/wrong-password': "Mot de passe incorrect.",
    'auth/invalid-credential': "E-mail ou mot de passe incorrect.",
    'auth/email-already-in-use': "Un compte existe déjà avec cet e-mail.",
    'auth/weak-password': "Le mot de passe doit faire au moins 6 caractères.",
  };
  return map[code] || "Une erreur est survenue. Réessaie.";
}

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

/* ---------------- Auth state → data subscriptions ---------------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    authScreen.hidden = true;
    appRoot.hidden = false;
    document.getElementById('user-email').textContent = user.email;
    subscribeData(user.uid);
  } else {
    authScreen.hidden = false;
    appRoot.hidden = true;
    if (unsubMatches) unsubMatches();
    if (unsubObs) unsubObs();
    matches = []; observations = [];
  }
});

function subscribeData(uid) {
  const matchesQ = query(collection(db, 'users', uid, 'matches'), orderBy('date', 'desc'));
  unsubMatches = onSnapshot(matchesQ, (snap) => {
    matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  });
  const obsQ = query(collection(db, 'users', uid, 'observations'), orderBy('date', 'desc'));
  unsubObs = onSnapshot(obsQ, (snap) => {
    observations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  });
}

/* ---------------- Nav ---------------- */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderView();
  });
});

/* ---------------- Render dispatch ---------------- */
const viewRoot = document.getElementById('view-root');
function renderView() {
  if (!currentUser) return;
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'matches') renderMatches();
  else if (currentView === 'observations') renderObservations();
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const total = matches.length;
  const notes = matches.filter(m => m.note != null).map(m => Number(m.note));
  const avg = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length) : null;
  const lastMatch = matches[0];
  const niveauCounts = {};
  matches.forEach(m => { niveauCounts[m.niveau] = (niveauCounts[m.niveau] || 0) + 1; });
  const topNiveau = Object.entries(niveauCounts).sort((a, b) => b[1] - a[1])[0];

  const axesCounts = {};
  observations.forEach(o => (o.axes || []).forEach(a => { axesCounts[a] = (axesCounts[a] || 0) + 1; }));
  const topAxes = Object.entries(axesCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Tableau de bord</h2>
        <p class="view-sub">Vue d'ensemble de ta saison d'arbitrage.</p>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Matchs arbitrés</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">${total === 0 ? "aucun match enregistré" : "cette saison"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Note moyenne</div>
        <div class="stat-value">${avg != null ? avg.toFixed(1) : '—'}</div>
        <div class="stat-sub">sur 10, auto-évaluation</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dernier match</div>
        <div class="stat-value" style="font-size:20px">${lastMatch ? formatDate(lastMatch.date) : '—'}</div>
        <div class="stat-sub">${lastMatch ? `${lastMatch.equipeA} – ${lastMatch.equipeB}` : "à venir"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Niveau le plus fréquent</div>
        <div class="stat-value" style="font-size:20px">${topNiveau ? topNiveau[0] : '—'}</div>
        <div class="stat-sub">${topNiveau ? `${topNiveau[1]} match(s)` : ""}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Évolution de ta note</div>
      ${renderChart(matches)}
    </div>

    <div class="panel">
      <div class="panel-title">Axes d'amélioration les plus cités</div>
      ${topAxes.length ? `<div class="tag-list">${topAxes.map(([a, c]) => `<span class="tag">${escapeHtml(a)} · ${c}</span>`).join('')}</div>`
        : `<p class="obs-text">Ajoute des observations pour voir apparaître tes axes de travail récurrents ici.</p>`}
    </div>
  `;
}

function renderChart(matchList) {
  const pts = matchList
    .filter(m => m.note != null)
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (pts.length < 2) {
    return `<p class="obs-text">Renseigne une auto-évaluation sur au moins deux matchs pour voir ton évolution.</p>`;
  }
  const W = 900, H = 180, PAD = 20;
  const xs = pts.map((_, i) => PAD + (i * (W - PAD * 2)) / (pts.length - 1));
  const ys = pts.map(p => H - PAD - (Number(p.note) / 10) * (H - PAD * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const dots = xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3.5" fill="var(--accent)" />`).join('');
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
        <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="1"/>
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${dots}
      </svg>
      <div class="chart-caption"><span>${formatDate(pts[0].date)}</span><span>${formatDate(pts[pts.length - 1].date)}</span></div>
    </div>
  `;
}

/* ---------------- Matches view ---------------- */
function renderMatches() {
  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Mes matchs</h2>
        <p class="view-sub">${matches.length} match(s) enregistré(s).</p>
      </div>
      <button class="btn btn-primary" id="add-match-btn">Ajouter un match</button>
    </div>
    <div class="panel" style="padding:6px 16px;">
      ${matches.length ? matches.map(matchRowHtml).join('') : emptyState("Aucun match pour l'instant", "Ajoute ton premier match pour commencer le suivi de ta saison.")}
    </div>
  `;
  document.getElementById('add-match-btn').addEventListener('click', () => openMatchForm());
  document.querySelectorAll('.match-row').forEach(row => {
    row.addEventListener('click', () => openMatchForm(matches.find(m => m.id === row.dataset.id)));
  });
}

function matchRowHtml(m) {
  return `
    <div class="match-row" data-id="${m.id}">
      <div class="match-date">${formatDate(m.date)}</div>
      <div class="match-teams">${escapeHtml(m.equipeA)} – ${escapeHtml(m.equipeB)}<span class="lvl">${escapeHtml(m.niveau || '')} · ${escapeHtml(m.role || '')}</span></div>
      <div class="match-score">${m.scoreA ?? '–'} / ${m.scoreB ?? '–'}</div>
      <div class="badge-note">${m.note != null ? Number(m.note).toFixed(1) : '—'}</div>
      <div class="chev">›</div>
    </div>
  `;
}

function emptyState(title, sub) {
  return `<div class="empty"><strong>${title}</strong>${sub}</div>`;
}

function openMatchForm(existing) {
  const m = existing || {};
  const html = `
    <h3 class="modal-title">${existing ? 'Modifier le match' : 'Ajouter un match'}</h3>
    <p class="modal-sub">Détaille la rencontre pour pouvoir l'analyser ensuite.</p>
    <form id="match-form">
      <div class="form-grid">
        <div class="form-field"><label>Date</label><input type="date" name="date" required value="${m.date || ''}"></div>
        <div class="form-field"><label>Niveau</label>
          <select name="niveau">${NIVEAUX.map(n => `<option ${m.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="form-field"><label>Équipe A</label><input type="text" name="equipeA" required value="${m.equipeA || ''}"></div>
        <div class="form-field"><label>Équipe B</label><input type="text" name="equipeB" required value="${m.equipeB || ''}"></div>
        <div class="form-field"><label>Score A</label><input type="number" min="0" name="scoreA" value="${m.scoreA ?? ''}"></div>
        <div class="form-field"><label>Score B</label><input type="number" min="0" name="scoreB" value="${m.scoreB ?? ''}"></div>
        <div class="form-field"><label>Mon rôle</label>
          <select name="role">${ROLES.map(r => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
        <div class="form-field">
          <label>Auto-évaluation (0–10)</label>
          <div class="range-row">
            <input type="range" min="0" max="10" step="0.5" name="note" value="${m.note ?? 5}" id="note-range">
            <span class="range-value" id="note-range-value">${m.note ?? 5}</span>
          </div>
        </div>
        <div class="form-field full"><label>Points forts</label><textarea name="pointsForts" placeholder="Ce qui a bien fonctionné pendant ce match…">${m.pointsForts || ''}</textarea></div>
        <div class="form-field full"><label>Points à travailler</label><textarea name="pointsAmeliorer" placeholder="Ce que tu veux améliorer la prochaine fois…">${m.pointsAmeliorer || ''}</textarea></div>
        <div class="form-field full"><label>Analyse libre</label><textarea name="commentaire" placeholder="Contexte du match, décisions marquantes, gestion des coachs/joueurs…">${m.commentaire || ''}</textarea></div>
      </div>
      <div class="modal-actions">
        <div>${existing ? `<button type="button" class="btn btn-ghost btn-danger" id="delete-match-btn">Supprimer</button>` : ''}</div>
        <div class="modal-actions-right">
          <button type="button" class="btn btn-ghost" id="cancel-btn">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </form>
  `;
  openModal(html);
  const rangeEl = document.getElementById('note-range');
  rangeEl.addEventListener('input', () => document.getElementById('note-range-value').textContent = rangeEl.value);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  const delBtn = document.getElementById('delete-match-btn');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (confirm("Supprimer ce match ?")) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'matches', existing.id));
      closeModal(); showToast('Match supprimé.');
    }
  });
  document.getElementById('match-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      date: fd.get('date'),
      niveau: fd.get('niveau'),
      equipeA: fd.get('equipeA').trim(),
      equipeB: fd.get('equipeB').trim(),
      scoreA: fd.get('scoreA') ? Number(fd.get('scoreA')) : null,
      scoreB: fd.get('scoreB') ? Number(fd.get('scoreB')) : null,
      role: fd.get('role'),
      note: Number(fd.get('note')),
      pointsForts: fd.get('pointsForts').trim(),
      pointsAmeliorer: fd.get('pointsAmeliorer').trim(),
      commentaire: fd.get('commentaire').trim(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'matches', existing.id), data);
        showToast('Match mis à jour.');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users', currentUser.uid, 'matches'), data);
        showToast('Match ajouté.');
      }
      closeModal();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    }
  });
}

/* ---------------- Observations view ---------------- */
function renderObservations() {
  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Observations</h2>
        <p class="view-sub">${observations.length} observation(s) reçue(s) d'un formateur ou observateur.</p>
      </div>
      <button class="btn btn-primary" id="add-obs-btn">Ajouter une observation</button>
    </div>
    ${observations.length ? observations.map(observationCardHtml).join('') : `<div class="panel">${emptyState("Aucune observation pour l'instant", "Note ici les retours reçus après tes matchs observés : axes de travail et ton propre ressenti.")}</div>`}
  `;
  document.getElementById('add-obs-btn').addEventListener('click', () => openObsForm());
  document.querySelectorAll('.obs-card').forEach(card => {
    card.addEventListener('click', () => openObsForm(observations.find(o => o.id === card.dataset.id)));
  });
}

function observationCardHtml(o) {
  return `
    <div class="obs-card" data-id="${o.id}" style="cursor:pointer">
      <div class="obs-card-head">
        <span class="obs-date">${formatDate(o.date)}</span>
        <span class="obs-meta">${escapeHtml(o.observateur || 'Observateur non précisé')}${o.noteObservateur != null ? ` · ${o.noteObservateur}/10` : ''}</span>
      </div>
      ${o.axes && o.axes.length ? `<div class="tag-list">${o.axes.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
      ${o.appreciation ? `<div class="obs-section-label">Appréciation reçue</div><div class="obs-text">${escapeHtml(o.appreciation)}</div>` : ''}
      ${o.ressenti ? `<div class="obs-section-label">Mon ressenti</div><div class="obs-text">${escapeHtml(o.ressenti)}</div>` : ''}
    </div>
  `;
}

function openObsForm(existing) {
  const o = existing || {};
  let axes = (o.axes || []).slice();

  const html = `
    <h3 class="modal-title">${existing ? "Modifier l'observation" : 'Ajouter une observation'}</h3>
    <p class="modal-sub">Consigne les retours reçus après un match observé.</p>
    <form id="obs-form">
      <div class="form-grid">
        <div class="form-field"><label>Date</label><input type="date" name="date" required value="${o.date || ''}"></div>
        <div class="form-field"><label>Observateur</label><input type="text" name="observateur" placeholder="Nom" value="${o.observateur || ''}"></div>
        <div class="form-field full"><label>Contexte</label><input type="text" name="contexte" placeholder="Match ou compétition concerné" value="${o.contexte || ''}"></div>
        <div class="form-field">
          <label>Note de l'observateur (0–10, optionnel)</label>
          <input type="number" min="0" max="10" step="0.5" name="noteObservateur" value="${o.noteObservateur ?? ''}">
        </div>
      </div>

      <div class="form-field full">
        <label>Axes d'amélioration</label>
        <div class="chip-input-row">
          <input type="text" id="axe-input" placeholder="Ex : placement, gestion du chronomètre…">
          <button type="button" class="btn btn-ghost" id="axe-add-btn">Ajouter</button>
        </div>
        <div class="tag-list" id="axe-list"></div>
      </div>

      <div class="form-field full"><label>Appréciation générale reçue</label><textarea name="appreciation" placeholder="Ce que l'observateur a écrit ou dit…">${o.appreciation || ''}</textarea></div>
      <div class="form-field full"><label>Mon appréciation / ressenti</label><textarea name="ressenti" placeholder="Ton propre avis sur ce retour…">${o.ressenti || ''}</textarea></div>

      <div class="modal-actions">
        <div>${existing ? `<button type="button" class="btn btn-ghost btn-danger" id="delete-obs-btn">Supprimer</button>` : ''}</div>
        <div class="modal-actions-right">
          <button type="button" class="btn btn-ghost" id="cancel-btn">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </form>
  `;
  openModal(html);

  function renderAxeList() {
    document.getElementById('axe-list').innerHTML = axes.map((a, i) =>
      `<span class="tag">${escapeHtml(a)}<button type="button" data-i="${i}">×</button></span>`
    ).join('');
    document.querySelectorAll('#axe-list button').forEach(b => {
      b.addEventListener('click', () => { axes.splice(Number(b.dataset.i), 1); renderAxeList(); });
    });
  }
  renderAxeList();

  const axeInput = document.getElementById('axe-input');
  function addAxe() {
    const v = axeInput.value.trim();
    if (v) { axes.push(v); axeInput.value = ''; renderAxeList(); }
  }
  document.getElementById('axe-add-btn').addEventListener('click', addAxe);
  axeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addAxe(); } });

  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  const delBtn = document.getElementById('delete-obs-btn');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (confirm("Supprimer cette observation ?")) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'observations', existing.id));
      closeModal(); showToast('Observation supprimée.');
    }
  });

  document.getElementById('obs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      date: fd.get('date'),
      observateur: fd.get('observateur').trim(),
      contexte: fd.get('contexte').trim(),
      noteObservateur: fd.get('noteObservateur') ? Number(fd.get('noteObservateur')) : null,
      axes,
      appreciation: fd.get('appreciation').trim(),
      ressenti: fd.get('ressenti').trim(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'observations', existing.id), data);
        showToast('Observation mise à jour.');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users', currentUser.uid, 'observations'), data);
        showToast('Observation ajoutée.');
      }
      closeModal();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    }
  });
}

/* ---------------- Modal / toast helpers ---------------- */
const modalBackdrop = document.getElementById('modal-backdrop');
const modalEl = document.getElementById('modal');
function openModal(html) {
  modalEl.innerHTML = html;
  modalBackdrop.hidden = false;
}
function closeModal() {
  modalBackdrop.hidden = true;
  modalEl.innerHTML = '';
}
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 2600);
}

/* ---------------- Utils ---------------- */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
