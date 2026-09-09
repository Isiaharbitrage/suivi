import { firebaseConfig, autoAuth } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------- Firebase init ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- State ---------------- */
let currentUser = null;
let matches = [];
let observations = [];
let unsubMatches = null;
let unsubObs = null;
let currentView = 'dashboard';
let playByPlayMatchId = null;
let pbpRows = [];
let pbpSaveTimer = null;

const NIVEAUX = ["NM1", "LBWL"];
const ROLES = ["CC", "Arbitre 2"];
const CDS_OPTIONS = ["CC", "IC", "INC", "CNC", "MC", "NA"];
const TIMING_OPTIONS = ["QW", "PW", "CW", "IW"];
const NATURE_OPTIONS = ["Violation", "Faute"];
const VIOLATION_TYPES = ["REZ", "V-OUT", "V-MAR", "DRI", "E2", "LF", "AUTRE"];
const FAUTE_OFF_DEF = ["OFF", "DEF"];
const FAUTE_OFF_TYPES = ["ECR", "POU", "CHA-B", "CHA-S", "HEAD", "HOLD", "CROCH"];
const FAUTE_DEF_AOS = ["AOS", "nAOS"];
const FAUTE_DEF_TYPES = ["OBS", "POU", "HEAD", "HOLD", "CYL", "UIM"];
const APPRECIATIONS = ["Performant", "Satisfaisant", "Insuffisant"];
const PBP_ROW_COUNT = 60;

/* ---------------- Connexion automatique en arrière-plan ---------------- */
const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');
const loadingText = document.getElementById('loading-text');

async function autoSignIn() {
  try {
    await signInWithEmailAndPassword(auth, autoAuth.email, autoAuth.password);
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        await createUserWithEmailAndPassword(auth, autoAuth.email, autoAuth.password);
      } catch (err2) {
        loadingText.textContent = "Erreur de connexion : " + err2.message;
      }
    } else {
      loadingText.textContent = "Erreur de connexion : " + err.message;
    }
  }
}
autoSignIn();

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    authScreen.hidden = true;
    appRoot.hidden = false;
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

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

/* ---------------- Render dispatch ---------------- */
const viewRoot = document.getElementById('view-root');
function renderView() {
  if (!currentUser) return;
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'matches') renderMatches();
  else if (currentView === 'observations') renderObservations();
  // La vue 'playbyplay' n'est jamais re-rendue automatiquement : elle utilise
  // un état local (pbpRows) pour ne pas perdre la saisie en cours pendant l'édition.
}

/* ---------------- Utils communs ---------------- */
function emptyPlayByPlayRows(n = PBP_ROW_COUNT) {
  return Array.from({ length: n }, () => ({
    cds: '', timing: '', bonTiming: '', nature: '',
    violationType: '', fauteType: '', fauteOffType: '', fauteDefAos: '', fauteDefType: '',
    iotMeca: ''
  }));
}

function computePbpStats(rows) {
  const fautesSifflees = rows.filter(r => r.nature === 'Faute').length;
  const bons = rows.filter(r => r.cds === 'CC' || r.cds === 'CNC').length;
  const mauvais = rows.filter(r => r.cds === 'IC' || r.cds === 'INC' || r.cds === 'MC').length;
  const totalJuges = bons + mauvais;
  const pctBons = totalJuges ? Math.round((bons / totalJuges) * 100) : null;
  const timingsRenseignes = rows.filter(r => r.timing && r.bonTiming);
  const bonsTimings = timingsRenseignes.filter(r => r.bonTiming === 'Oui').length;
  const pctBonTiming = timingsRenseignes.length ? Math.round((bonsTimings / timingsRenseignes.length) * 100) : null;
  return { fautesSifflees, bons, mauvais, pctBons, pctBonTiming, totalTimings: timingsRenseignes.length };
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  setActiveNav('dashboard');
  const total = matches.length;
  const notes = matches.filter(m => m.note != null).map(m => Number(m.note));
  const avg = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length) : null;
  const lastMatch = matches[0];
  const niveauCounts = {};
  matches.forEach(m => { niveauCounts[m.niveau] = (niveauCounts[m.niveau] || 0) + 1; });
  const topNiveau = Object.entries(niveauCounts).sort((a, b) => b[1] - a[1])[0];

  const apprCounts = { Performant: 0, Satisfaisant: 0, Insuffisant: 0 };
  observations.forEach(o => { if (apprCounts[o.appreciation] != null) apprCounts[o.appreciation]++; });
  const preds = observations.filter(o => o.predictionNote != null).map(o => Number(o.predictionNote));
  const predAvg = preds.length ? (preds.reduce((a, b) => a + b, 0) / preds.length) : null;

  let allPbpRows = [];
  matches.forEach(m => (m.playByPlay || []).forEach(r => allPbpRows.push(r)));
  const pbpStats = computePbpStats(allPbpRows);

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
        <div class="stat-value">${avg != null ? avg.toFixed(1) : '—'}<span style="font-size:14px;color:var(--text-faint)">/20</span></div>
        <div class="stat-sub">auto-évaluation</div>
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
      <div class="panel-title">Coups de sifflet — vue d'ensemble de la saison</div>
      ${allPbpRows.length ? `
        <div class="stat-grid" style="margin-bottom:0;">
          <div class="stat-card"><div class="stat-label">Fautes sifflées</div><div class="stat-value">${pbpStats.fautesSifflees}</div></div>
          <div class="stat-card"><div class="stat-label">Bons coups (CC/CNC)</div><div class="stat-value">${pbpStats.bons}</div></div>
          <div class="stat-card"><div class="stat-label">Mauvais coups (IC/INC/MC)</div><div class="stat-value">${pbpStats.mauvais}</div></div>
          <div class="stat-card"><div class="stat-label">% bon timing</div><div class="stat-value">${pbpStats.pctBonTiming != null ? pbpStats.pctBonTiming + '%' : '—'}</div></div>
        </div>
      ` : `<p class="obs-text">Remplis une analyse play-by-play sur au moins un match pour voir ces statistiques.</p>`}
    </div>

    <div class="panel">
      <div class="panel-title">Répartition de tes observations</div>
      <div class="stat-grid" style="margin-bottom:0;">
        <div class="stat-card"><div class="stat-label">Performant</div><div class="stat-value" style="color:var(--positive)">${apprCounts.Performant}</div></div>
        <div class="stat-card"><div class="stat-label">Satisfaisant</div><div class="stat-value" style="color:var(--warning)">${apprCounts.Satisfaisant}</div></div>
        <div class="stat-card"><div class="stat-label">Insuffisant</div><div class="stat-value" style="color:#ff8f8f">${apprCounts.Insuffisant}</div></div>
        <div class="stat-card"><div class="stat-label">Prédiction moyenne</div><div class="stat-value">${predAvg != null ? predAvg.toFixed(1) : '—'}<span style="font-size:14px;color:var(--text-faint)">/20</span></div></div>
      </div>
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
  const ys = pts.map(p => H - PAD - (Number(p.note) / 20) * (H - PAD * 2));
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
  setActiveNav('matches');
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
      <div class="badge-note">${m.note != null ? Number(m.note).toFixed(1) : '—'}<span style="font-size:9px;color:var(--text-faint)">/20</span></div>
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
          <label>Auto-évaluation (0–20)</label>
          <div class="range-row">
            <input type="range" min="0" max="20" step="0.5" name="note" value="${m.note ?? 10}" id="note-range">
            <span class="range-value" id="note-range-value">${m.note ?? 10}</span>
          </div>
        </div>

        <div class="form-field full"><label>Point fort n°1</label><input type="text" name="pointFort1" value="${m.pointFort1 || ''}"></div>
        <div class="form-field full"><label>Point fort n°2</label><input type="text" name="pointFort2" value="${m.pointFort2 || ''}"></div>
        <div class="form-field full"><label>Point fort n°3</label><input type="text" name="pointFort3" value="${m.pointFort3 || ''}"></div>

        <div class="form-field full"><label>Point à travailler n°1</label><input type="text" name="pointTravail1" value="${m.pointTravail1 || ''}"></div>
        <div class="form-field full"><label>Point à travailler n°2</label><input type="text" name="pointTravail2" value="${m.pointTravail2 || ''}"></div>
        <div class="form-field full"><label>Point à travailler n°3</label><input type="text" name="pointTravail3" value="${m.pointTravail3 || ''}"></div>
      </div>

      ${existing ? `
        <button type="button" class="btn btn-block" id="open-pbp-btn" style="margin: 4px 0 18px; justify-content:center;">📋 Analyse play-by-play</button>
      ` : ''}

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

  const pbpBtn = document.getElementById('open-pbp-btn');
  if (pbpBtn) pbpBtn.addEventListener('click', () => { closeModal(); openPlayByPlay(existing.id); });

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
      pointFort1: fd.get('pointFort1').trim(),
      pointFort2: fd.get('pointFort2').trim(),
      pointFort3: fd.get('pointFort3').trim(),
      pointTravail1: fd.get('pointTravail1').trim(),
      pointTravail2: fd.get('pointTravail2').trim(),
      pointTravail3: fd.get('pointTravail3').trim(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'matches', existing.id), data);
        showToast('Match mis à jour.');
      } else {
        data.createdAt = serverTimestamp();
        data.playByPlay = emptyPlayByPlayRows();
        await addDoc(collection(db, 'users', currentUser.uid, 'matches'), data);
        showToast('Match ajouté.');
      }
      closeModal();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    }
  });
}

/* ---------------- Play-by-play view ---------------- */
function openPlayByPlay(matchId) {
  const m = matches.find(x => x.id === matchId);
  if (!m) return;
  playByPlayMatchId = matchId;
  pbpRows = (m.playByPlay && m.playByPlay.length ? m.playByPlay : emptyPlayByPlayRows()).map(r => ({
    cds: '', timing: '', bonTiming: '', nature: '', violationType: '', fauteType: '', fauteOffType: '', fauteDefAos: '', fauteDefType: '', iotMeca: '', ...r
  }));
  currentView = 'playbyplay';
  setActiveNav('matches');
  renderPlayByPlayView();
}

function selHtml(rowIndex, field, options, value, placeholder) {
  return `<select data-i="${rowIndex}" data-f="${field}"><option value="">${placeholder || '—'}</option>${options.map(o => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
}

function pbpRowHtml(row, i) {
  let detail = '';
  if (row.nature === 'Violation') {
    detail = selHtml(i, 'violationType', VIOLATION_TYPES, row.violationType, 'Type');
  } else if (row.nature === 'Faute') {
    detail = selHtml(i, 'fauteType', FAUTE_OFF_DEF, row.fauteType, 'OFF / DEF');
    if (row.fauteType === 'OFF') {
      detail += selHtml(i, 'fauteOffType', FAUTE_OFF_TYPES, row.fauteOffType, 'Type');
    } else if (row.fauteType === 'DEF') {
      detail += selHtml(i, 'fauteDefAos', FAUTE_DEF_AOS, row.fauteDefAos, 'AOS / nAOS');
      if (row.fauteDefAos) {
        detail += selHtml(i, 'fauteDefType', FAUTE_DEF_TYPES, row.fauteDefType, 'Type');
      }
    }
  } else {
    detail = `<span class="pbp-dash">—</span>`;
  }

  const bonTiming = row.timing
    ? selHtml(i, 'bonTiming', ['Oui', 'Non'], row.bonTiming, 'Bon timing ?')
    : `<span class="pbp-dash">—</span>`;

  return `
    <tr id="pbp-row-${i}">
      <td class="pbp-num">${i + 1}</td>
      <td>${selHtml(i, 'cds', CDS_OPTIONS, row.cds, 'CDS')}</td>
      <td>${selHtml(i, 'timing', TIMING_OPTIONS, row.timing, 'Timing')}</td>
      <td>${bonTiming}</td>
      <td>${selHtml(i, 'nature', NATURE_OPTIONS, row.nature, 'Nature')}</td>
      <td><div class="pbp-detail-stack">${detail}</div></td>
      <td><input type="text" data-i="${i}" data-f="iotMeca" value="${escapeAttr(row.iotMeca)}" placeholder="Remarque…"></td>
    </tr>
  `;
}

function pbpStatsHtml() {
  const s = computePbpStats(pbpRows);
  return `
    <div class="stat-card"><div class="stat-label">Fautes sifflées</div><div class="stat-value">${s.fautesSifflees}</div></div>
    <div class="stat-card"><div class="stat-label">Bons coups (CC/CNC)</div><div class="stat-value" style="color:var(--positive)">${s.bons}</div></div>
    <div class="stat-card"><div class="stat-label">Mauvais coups (IC/INC/MC)</div><div class="stat-value" style="color:#ff8f8f">${s.mauvais}</div></div>
    <div class="stat-card"><div class="stat-label">Ratio bons / mauvais</div><div class="stat-value">${s.pctBons != null ? s.pctBons + '%' : '—'}</div></div>
    <div class="stat-card"><div class="stat-label">% bon timing</div><div class="stat-value">${s.pctBonTiming != null ? s.pctBonTiming + '%' : '—'}</div><div class="stat-sub">${s.totalTimings} coup(s) jugé(s)</div></div>
  `;
}

function updatePbpStatsBar() {
  const el = document.getElementById('pbp-stats');
  if (el) el.innerHTML = pbpStatsHtml();
}

function renderPlayByPlayView() {
  const m = matches.find(x => x.id === playByPlayMatchId);
  if (!m) { currentView = 'matches'; renderMatches(); return; }

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Analyse play-by-play</h2>
        <p class="view-sub">${escapeHtml(m.equipeA)} – ${escapeHtml(m.equipeB)} · ${formatDate(m.date)}</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="pbp-back-btn">← Retour aux matchs</button>
        <button class="btn btn-primary" id="pbp-save-btn">Enregistrer</button>
      </div>
    </div>
    <div class="stat-grid" id="pbp-stats">${pbpStatsHtml()}</div>
    <div class="panel" style="overflow-x:auto;">
      <table class="pbp-table">
        <thead>
          <tr><th>#</th><th>CDS</th><th>Timing</th><th>Bon timing</th><th>Nature</th><th>Détail</th><th>IOT / MECA</th></tr>
        </thead>
        <tbody id="pbp-tbody">${pbpRows.map((r, i) => pbpRowHtml(r, i)).join('')}</tbody>
      </table>
    </div>
  `;

  document.getElementById('pbp-back-btn').addEventListener('click', () => { currentView = 'matches'; renderMatches(); });
  document.getElementById('pbp-save-btn').addEventListener('click', () => savePlayByPlay(true));

  const tbody = document.getElementById('pbp-tbody');
  tbody.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName !== 'SELECT') return;
    const i = Number(el.dataset.i), f = el.dataset.f;
    pbpRows[i][f] = el.value;
    if (f === 'nature') { pbpRows[i].violationType = ''; pbpRows[i].fauteType = ''; pbpRows[i].fauteOffType = ''; pbpRows[i].fauteDefAos = ''; pbpRows[i].fauteDefType = ''; }
    if (f === 'fauteType') { pbpRows[i].fauteOffType = ''; pbpRows[i].fauteDefAos = ''; pbpRows[i].fauteDefType = ''; }
    if (f === 'fauteDefAos') { pbpRows[i].fauteDefType = ''; }
    if (f === 'timing') { pbpRows[i].bonTiming = ''; }
    const rowEl = document.getElementById(`pbp-row-${i}`);
    if (rowEl) rowEl.outerHTML = pbpRowHtml(pbpRows[i], i);
    updatePbpStatsBar();
    scheduleAutosave();
  });
  tbody.addEventListener('input', (e) => {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    const i = Number(el.dataset.i), f = el.dataset.f;
    pbpRows[i][f] = el.value;
    scheduleAutosave();
  });
}

function scheduleAutosave() {
  clearTimeout(pbpSaveTimer);
  pbpSaveTimer = setTimeout(() => savePlayByPlay(false), 1000);
}

async function savePlayByPlay(manual) {
  if (!playByPlayMatchId) return;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'matches', playByPlayMatchId), { playByPlay: pbpRows });
    if (manual) showToast('Analyse enregistrée.');
  } catch (err) {
    if (manual) alert("Erreur lors de l'enregistrement : " + err.message);
  }
}

/* ---------------- Observations view ---------------- */
function renderObservations() {
  setActiveNav('observations');
  const apprCounts = { Performant: 0, Satisfaisant: 0, Insuffisant: 0 };
  observations.forEach(o => { if (apprCounts[o.appreciation] != null) apprCounts[o.appreciation]++; });
  const preds = observations.filter(o => o.predictionNote != null).map(o => Number(o.predictionNote));
  const predAvg = preds.length ? (preds.reduce((a, b) => a + b, 0) / preds.length) : null;

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Observations</h2>
        <p class="view-sub">${observations.length} observation(s) reçue(s).</p>
      </div>
      <button class="btn btn-primary" id="add-obs-btn">Ajouter une observation</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Performant</div><div class="stat-value" style="color:var(--positive)">${apprCounts.Performant}</div></div>
      <div class="stat-card"><div class="stat-label">Satisfaisant</div><div class="stat-value" style="color:var(--warning)">${apprCounts.Satisfaisant}</div></div>
      <div class="stat-card"><div class="stat-label">Insuffisant</div><div class="stat-value" style="color:#ff8f8f">${apprCounts.Insuffisant}</div></div>
      <div class="stat-card"><div class="stat-label">Prédiction moyenne</div><div class="stat-value">${predAvg != null ? predAvg.toFixed(1) : '—'}<span style="font-size:14px;color:var(--text-faint)">/20</span></div></div>
    </div>

    ${observations.length ? observations.map(observationCardHtml).join('') : `<div class="panel">${emptyState("Aucune observation pour l'instant", "Note ici les retours reçus après tes matchs observés.")}</div>`}
  `;
  document.getElementById('add-obs-btn').addEventListener('click', () => openObsForm());
  document.querySelectorAll('.obs-card').forEach(card => {
    card.addEventListener('click', () => openObsForm(observations.find(o => o.id === card.dataset.id)));
  });
}

function apprBadgeClass(a) {
  if (a === 'Performant') return 'appr-badge appr-performant';
  if (a === 'Satisfaisant') return 'appr-badge appr-satisfaisant';
  if (a === 'Insuffisant') return 'appr-badge appr-insuffisant';
  return 'appr-badge';
}

function matchLabel(matchId) {
  const m = matches.find(x => x.id === matchId);
  if (!m) return null;
  return `${escapeHtml(m.equipeA)} – ${escapeHtml(m.equipeB)}`;
}

function observationCardHtml(o) {
  const lbl = matchLabel(o.matchId);
  return `
    <div class="obs-card" data-id="${o.id}" style="cursor:pointer">
      <div class="obs-card-head">
        <span class="obs-date">${formatDate(o.date)}${lbl ? ` · ${lbl}` : ''}</span>
        <span class="obs-meta">${escapeHtml(o.observateur || 'Observateur non précisé')}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px;">
        ${o.appreciation ? `<span class="${apprBadgeClass(o.appreciation)}">${o.appreciation}</span>` : ''}
        ${o.predictionNote != null ? `<span class="obs-meta">Prédiction : ${o.predictionNote}/20</span>` : ''}
      </div>
      ${o.pointFort ? `<div class="obs-section-label">Point fort</div><div class="obs-text">${escapeHtml(o.pointFort)}</div>` : ''}
      ${o.pisteTravail ? `<div class="obs-section-label">Piste de travail</div><div class="obs-text">${escapeHtml(o.pisteTravail)}</div>` : ''}
    </div>
  `;
}

function openObsForm(existing) {
  const o = existing || {};
  const matchOptions = matches.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(m => `<option value="${m.id}" ${o.matchId === m.id ? 'selected' : ''}>${formatDate(m.date)} — ${escapeHtml(m.equipeA)} vs ${escapeHtml(m.equipeB)}</option>`).join('');

  const html = `
    <h3 class="modal-title">${existing ? "Modifier l'observation" : 'Ajouter une observation'}</h3>
    <p class="modal-sub">Consigne les retours reçus après un match observé.</p>
    <form id="obs-form">
      <div class="form-grid">
        <div class="form-field"><label>Date</label><input type="date" name="date" required value="${o.date || ''}"></div>
        <div class="form-field"><label>Observateur</label><input type="text" name="observateur" placeholder="Nom" value="${o.observateur || ''}"></div>
        <div class="form-field full"><label>Match concerné</label>
          <select name="matchId"><option value="">— Aucun —</option>${matchOptions}</select>
        </div>
        <div class="form-field"><label>Appréciation</label>
          <select name="appreciation"><option value="">—</option>${APPRECIATIONS.map(a => `<option ${o.appreciation === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
        </div>
        <div class="form-field"><label>Prédiction de note (0–20)</label><input type="number" min="0" max="20" step="0.5" name="predictionNote" value="${o.predictionNote ?? ''}"></div>
      </div>
      <div class="form-field full"><label>Point fort</label><textarea name="pointFort" placeholder="Ce qui a été relevé positivement…">${o.pointFort || ''}</textarea></div>
      <div class="form-field full"><label>Piste de travail</label><textarea name="pisteTravail" placeholder="Ce que l'observateur t'invite à travailler…">${o.pisteTravail || ''}</textarea></div>

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
      matchId: fd.get('matchId') || null,
      appreciation: fd.get('appreciation') || null,
      predictionNote: fd.get('predictionNote') ? Number(fd.get('predictionNote')) : null,
      pointFort: fd.get('pointFort').trim(),
      pisteTravail: fd.get('pisteTravail').trim(),
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
function escapeAttr(str) {
  return escapeHtml(str);
}
