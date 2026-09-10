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
let finances = [];
let unsubMatches = null;
let unsubObs = null;
let unsubFinances = null;
let currentView = 'dashboard';
let playByPlayMatchId = null;
let pbpReturnView = 'matches';
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
const FINANCE_CATEGORIES = ["NM1", "LBWL", "CDF", "MA"];
const FINANCE_RECAP_ORDER = ["NM1", "LBWL", "MA", "CDF"];

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
    if (unsubFinances) unsubFinances();
    matches = []; observations = []; finances = [];
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
  const financesQ = query(collection(db, 'users', uid, 'finances'), orderBy('date', 'desc'));
  unsubFinances = onSnapshot(financesQ, (snap) => {
    finances = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  });
}

/* ---------------- Nav ---------------- */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    setActiveNav(currentView);
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
  else if (currentView === 'playbyplaylist') renderPlayByPlayList();
  else if (currentView === 'observations') renderObservations();
  else if (currentView === 'stats') renderStats();
  else if (currentView === 'finance') renderFinance();
  // La vue 'playbyplay' (édition d'une fiche) n'est jamais re-rendue automatiquement :
  // elle utilise un état local (pbpRows) pour ne pas perdre la saisie en cours.
}

/* ---------------- Utils communs ---------------- */
function emptyPlayByPlayRows(n = PBP_ROW_COUNT) {
  return Array.from({ length: n }, () => ({
    clip: '', cds: '', timing: '', bonTiming: '', nature: '',
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

function pbpDetailText(row) {
  if (row.nature === 'Violation') return `Violation${row.violationType ? ' — ' + row.violationType : ''}`;
  if (row.nature === 'Faute') {
    let s = 'Faute';
    if (row.fauteType) s += ' ' + row.fauteType;
    if (row.fauteType === 'OFF' && row.fauteOffType) s += ' — ' + row.fauteOffType;
    if (row.fauteType === 'DEF') {
      if (row.fauteDefAos) s += ' ' + row.fauteDefAos;
      if (row.fauteDefType) s += ' — ' + row.fauteDefType;
    }
    return s;
  }
  return '';
}

function hasAnyData(row) {
  return !!(row.clip || row.cds || row.timing || row.nature || row.iotMeca);
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const total = matches.length;
  const notes = matches.filter(m => m.note != null).map(m => Number(m.note));
  const avg = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length) : null;
  const lastMatch = matches[0];

  const apprCounts = { Performant: 0, Satisfaisant: 0, Insuffisant: 0 };
  observations.forEach(o => { if (apprCounts[o.appreciation] != null) apprCounts[o.appreciation]++; });
  const preds = observations.filter(o => o.predictionNote != null).map(o => Number(o.predictionNote));
  const predAvg = preds.length ? (preds.reduce((a, b) => a + b, 0) / preds.length) : null;

  const travailItems = lastMatch
    ? [lastMatch.pointTravail1, lastMatch.pointTravail2, lastMatch.pointTravail3].filter(Boolean)
    : [];

  const ca = finances.reduce((sum, f) => sum + (Number(f.indemnites) || 0), 0);
  const chargesTotal = finances.reduce((sum, f) => sum + (Number(f.charges) || 0), 0);
  const benefice = ca - chargesTotal;

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Tableau de bord</h2>
        <p class="view-sub">Vue d'ensemble de ta saison d'arbitrage.</p>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
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
    </div>

    <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr);">
      <div class="stat-card">
        <div class="stat-label">Chiffre d'affaires</div>
        <div class="stat-value" style="font-size:24px">${eur(ca)}</div>
        <div class="stat-sub">cette saison</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bénéfice</div>
        <div class="stat-value" style="font-size:24px; color:${benefice >= 0 ? 'var(--positive)' : '#ff8f8f'}">${eur(benefice)}</div>
        <div class="stat-sub">chiffre d'affaires - charges</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Évolution de ton auto-évaluation</div>
      ${renderChart(matches)}
    </div>

    <div class="panel">
      <div class="panel-title">Pistes de travail — dernier match rempli</div>
      ${lastMatch
        ? (travailItems.length
            ? `<p class="obs-text" style="margin-bottom:8px;">${escapeHtml(lastMatch.equipeA)} – ${escapeHtml(lastMatch.equipeB)} · ${formatDate(lastMatch.date)}</p>
               <ul style="margin:0; padding-left:18px; color:var(--text-muted); font-size:13.5px; line-height:1.8;">
                 ${travailItems.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
               </ul>`
            : `<p class="obs-text">Aucun point à travailler renseigné sur ton dernier match.</p>`)
        : `<p class="obs-text">Ajoute un match pour voir apparaître tes pistes de travail ici.</p>`}
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
          <select name="niveau" id="niveau-select">${NIVEAUX.map(n => `<option ${m.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
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

        <div class="form-field"><label>Collègue</label><input type="text" name="collegue1" placeholder="Nom de l'arbitre" value="${m.collegue1 || ''}"></div>
        <div class="form-field" id="collegue2-field" ${m.niveau === 'LBWL' ? '' : 'style="display:none"'}>
          <label>Collègue 2</label><input type="text" name="collegue2" placeholder="Nom de l'arbitre" value="${m.collegue2 || ''}">
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

  const niveauSelect = document.getElementById('niveau-select');
  niveauSelect.addEventListener('change', () => {
    document.getElementById('collegue2-field').style.display = niveauSelect.value === 'LBWL' ? '' : 'none';
  });

  const pbpBtn = document.getElementById('open-pbp-btn');
  if (pbpBtn) pbpBtn.addEventListener('click', () => { closeModal(); openPlayByPlay(existing.id, 'matches'); });

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
    const niveau = fd.get('niveau');
    const data = {
      date: fd.get('date'),
      niveau,
      equipeA: fd.get('equipeA').trim(),
      equipeB: fd.get('equipeB').trim(),
      scoreA: fd.get('scoreA') ? Number(fd.get('scoreA')) : null,
      scoreB: fd.get('scoreB') ? Number(fd.get('scoreB')) : null,
      role: fd.get('role'),
      note: Number(fd.get('note')),
      collegue1: (fd.get('collegue1') || '').trim(),
      collegue2: niveau === 'LBWL' ? (fd.get('collegue2') || '').trim() : '',
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

/* ---------------- Liste play-by-play ---------------- */
function renderPlayByPlayList() {
  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Analyse play-by-play</h2>
        <p class="view-sub">Clique sur un match pour ouvrir sa fiche d'analyse.</p>
      </div>
    </div>
    <div class="panel" style="padding:6px 16px;">
      ${matches.length ? matches.map(pbpListRowHtml).join('') : emptyState("Aucun match pour l'instant", "Ajoute un match dans l'onglet « Mes matchs » pour pouvoir l'analyser ici.")}
    </div>
  `;
  document.querySelectorAll('.match-row').forEach(row => {
    row.addEventListener('click', () => openPlayByPlay(row.dataset.id, 'playbyplaylist'));
  });
}

function pbpListRowHtml(m) {
  const rows = m.playByPlay || [];
  const filledCount = rows.filter(hasAnyData).length;
  return `
    <div class="match-row" data-id="${m.id}" style="grid-template-columns: 84px 1fr 120px 28px;">
      <div class="match-date">${formatDate(m.date)}</div>
      <div class="match-teams">${escapeHtml(m.equipeA)} – ${escapeHtml(m.equipeB)}<span class="lvl">${escapeHtml(m.niveau || '')}</span></div>
      <div class="match-score" style="font-size:12.5px; color: var(--text-muted);">${filledCount > 0 ? `${filledCount} action(s)` : 'Vide'}</div>
      <div class="chev">›</div>
    </div>
  `;
}

/* ---------------- Play-by-play (édition d'une fiche) ---------------- */
function openPlayByPlay(matchId, returnView) {
  const m = matches.find(x => x.id === matchId);
  if (!m) return;
  playByPlayMatchId = matchId;
  pbpReturnView = returnView || 'matches';
  pbpRows = (m.playByPlay && m.playByPlay.length ? m.playByPlay : emptyPlayByPlayRows()).map(r => ({
    clip: '', cds: '', timing: '', bonTiming: '', nature: '', violationType: '', fauteType: '', fauteOffType: '', fauteDefAos: '', fauteDefType: '', iotMeca: '', ...r
  }));
  currentView = 'playbyplay';
  setActiveNav(pbpReturnView);
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

  const clipLink = row.clip ? `<a href="${escapeAttr(row.clip)}" target="_blank" rel="noopener" class="pbp-clip-link" title="Ouvrir le clip">🔗</a>` : '';

  return `
    <tr id="pbp-row-${i}">
      <td><div class="pbp-clip-cell"><input type="text" data-i="${i}" data-f="clip" value="${escapeAttr(row.clip)}" placeholder="Clip…">${clipLink}</div></td>
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
  if (!m) { currentView = pbpReturnView; renderView(); return; }

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Analyse play-by-play</h2>
        <p class="view-sub">${escapeHtml(m.equipeA)} – ${escapeHtml(m.equipeB)} · ${formatDate(m.date)}</p>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-ghost" id="pbp-back-btn">← Retour</button>
        <button class="btn btn-ghost" id="pbp-pdf-btn">⬇ Télécharger en PDF</button>
        <button class="btn btn-primary" id="pbp-save-btn">Enregistrer</button>
      </div>
    </div>
    <div class="stat-grid" id="pbp-stats">${pbpStatsHtml()}</div>
    <div class="panel" style="overflow-x:auto;">
      <table class="pbp-table">
        <thead>
          <tr><th>Clip</th><th>#</th><th>CDS</th><th>Timing</th><th>Bon timing</th><th>Nature</th><th>Détail</th><th>IOT / MECA</th></tr>
        </thead>
        <tbody id="pbp-tbody">${pbpRows.map((r, i) => pbpRowHtml(r, i)).join('')}</tbody>
      </table>
    </div>
  `;

  document.getElementById('pbp-back-btn').addEventListener('click', () => {
    savePlayByPlay(false);
    currentView = pbpReturnView;
    setActiveNav(pbpReturnView);
    renderView();
  });
  document.getElementById('pbp-save-btn').addEventListener('click', () => savePlayByPlay(true));
  document.getElementById('pbp-pdf-btn').addEventListener('click', () => exportPbpPdf(m, pbpRows));

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

function exportPbpPdf(match, rows) {
  if (!window.jspdf) { alert("Le générateur de PDF n'a pas pu se charger. Vérifie ta connexion internet et réessaie."); return; }
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const s = computePbpStats(rows);

  docPdf.setFontSize(14);
  docPdf.text(`Analyse play-by-play — ${match.equipeA} vs ${match.equipeB}`, 14, 16);
  docPdf.setFontSize(10);
  docPdf.text(`${formatDate(match.date)}  ·  Niveau : ${match.niveau || '—'}  ·  Rôle : ${match.role || '—'}`, 14, 23);
  docPdf.text(`Fautes sifflées : ${s.fautesSifflees}   |   Bons coups (CC/CNC) : ${s.bons}   |   Mauvais coups (IC/INC/MC) : ${s.mauvais}`, 14, 30);
  docPdf.text(`Ratio bons/mauvais : ${s.pctBons != null ? s.pctBons + '%' : '—'}   |   % bon timing : ${s.pctBonTiming != null ? s.pctBonTiming + '%' : '—'} (${s.totalTimings} jugé(s))`, 14, 36);

  const filled = rows
    .map((r, idx) => ({ ...r, num: idx + 1 }))
    .filter(hasAnyData);

  const body = filled.map(r => [r.num, r.clip || '', r.cds || '', r.timing || '', r.bonTiming || '', r.nature || '', pbpDetailText(r), r.iotMeca || '']);

  docPdf.autoTable({
    startY: 42,
    head: [['#', 'Clip', 'CDS', 'Timing', 'Bon timing', 'Nature', 'Détail', 'IOT / MECA']],
    body,
    styles: { fontSize: 8, cellWidth: 'wrap' },
    columnStyles: { 1: { cellWidth: 40 }, 6: { cellWidth: 32 } },
    headStyles: { fillColor: [232, 96, 12] }
  });

  const fileName = `playbyplay_${match.equipeA}_${match.equipeB}_${match.date}.pdf`.replace(/\s+/g, '_');
  docPdf.save(fileName);
}

/* ---------------- Observations view ---------------- */
function renderObservations() {
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

/* ---------------- Statistiques view ---------------- */
function renderStats() {
  const totalMatches = matches.length;

  const clubSet = new Set();
  matches.forEach(m => {
    if (m.equipeA) clubSet.add(m.equipeA.trim());
    if (m.equipeB) clubSet.add(m.equipeB.trim());
  });

  const collegueSet = new Set();
  matches.forEach(m => {
    if (m.collegue1) collegueSet.add(m.collegue1.trim());
    if (m.collegue2) collegueSet.add(m.collegue2.trim());
  });

  let allPbpRows = [];
  matches.forEach(m => (m.playByPlay || []).forEach(r => allPbpRows.push(r)));
  const pbpStats = computePbpStats(allPbpRows);

  const ccCount = matches.filter(m => m.role === 'CC').length;
  const a2Count = matches.filter(m => m.role === 'Arbitre 2').length;
  const pctCC = totalMatches ? Math.round((ccCount / totalMatches) * 100) : null;
  const pctA2 = totalMatches ? Math.round((a2Count / totalMatches) * 100) : null;

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Statistiques</h2>
        <p class="view-sub">Vue globale, agrégée sur toute la saison.</p>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Matchs arbitrés</div><div class="stat-value">${totalMatches}</div></div>
      <div class="stat-card"><div class="stat-label">Clubs arbitrés</div><div class="stat-value">${clubSet.size}</div></div>
      <div class="stat-card"><div class="stat-label">Collègues différents</div><div class="stat-value">${collegueSet.size}</div></div>
      <div class="stat-card"><div class="stat-label">% en tant que CC</div><div class="stat-value">${pctCC != null ? pctCC + '%' : '—'}</div><div class="stat-sub">${pctA2 != null ? `${pctA2}% Arbitre 2` : ''}</div></div>
    </div>

    <div class="panel">
      <div class="panel-title">Coups de sifflet — toutes les fiches play-by-play</div>
      ${allPbpRows.length ? `
        <div class="stat-grid" style="margin-bottom:0;">
          <div class="stat-card"><div class="stat-label">Fautes sifflées</div><div class="stat-value">${pbpStats.fautesSifflees}</div></div>
          <div class="stat-card"><div class="stat-label">Bons coups (CC/CNC)</div><div class="stat-value" style="color:var(--positive)">${pbpStats.bons}</div></div>
          <div class="stat-card"><div class="stat-label">Mauvais coups (IC/INC/MC)</div><div class="stat-value" style="color:#ff8f8f">${pbpStats.mauvais}</div></div>
          <div class="stat-card"><div class="stat-label">Ratio bons / mauvais</div><div class="stat-value">${pbpStats.pctBons != null ? pbpStats.pctBons + '%' : '—'}</div></div>
          <div class="stat-card"><div class="stat-label">% bon timing</div><div class="stat-value">${pbpStats.pctBonTiming != null ? pbpStats.pctBonTiming + '%' : '—'}</div><div class="stat-sub">${pbpStats.totalTimings} coup(s) jugé(s)</div></div>
        </div>
      ` : `<p class="obs-text">Remplis une analyse play-by-play sur au moins un match pour voir ces statistiques.</p>`}
    </div>
  `;
}

/* ---------------- Finance view ---------------- */
function eur(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderFinance() {
  const ca = finances.reduce((sum, f) => sum + (Number(f.indemnites) || 0), 0);
  const charges = finances.reduce((sum, f) => sum + (Number(f.charges) || 0), 0);
  const benefice = ca - charges;
  const distanceTotale = finances.reduce((sum, f) => sum + (Number(f.distanceKm) || 0), 0);
  const total = finances.length;

  const recapRows = FINANCE_RECAP_ORDER.map(cat => {
    const count = finances.filter(f => f.categorie === cat).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `<tr><td>${cat}</td><td>${count}</td><td>${pct}%</td></tr>`;
  }).join('');

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Finance</h2>
        <p class="view-sub">Suivi financier de ta saison.</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="monthly-revenue-btn">📅 Revenu mensuel</button>
        <button class="btn btn-primary" id="add-finance-btn">Ajouter une fiche</button>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="stat-card"><div class="stat-label">Chiffre d'affaires</div><div class="stat-value" style="font-size:24px">${eur(ca)}</div><div class="stat-sub">somme des indemnités</div></div>
      <div class="stat-card"><div class="stat-label">Bénéfice</div><div class="stat-value" style="font-size:24px; color:${benefice >= 0 ? 'var(--positive)' : '#ff8f8f'}">${eur(benefice)}</div><div class="stat-sub">chiffre d'affaires - charges</div></div>
      <div class="stat-card"><div class="stat-label">Distance totale</div><div class="stat-value" style="font-size:24px">${distanceTotale.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}<span style="font-size:14px;color:var(--text-faint)"> km</span></div></div>
    </div>

    <div class="panel">
      <div class="panel-title">Répartition par catégorie</div>
      ${total ? `
        <table class="recap-table">
          <thead><tr><th>Catégorie</th><th>Nombre de matchs</th><th>% du total</th></tr></thead>
          <tbody>${recapRows}</tbody>
        </table>
      ` : `<p class="obs-text">Ajoute une fiche pour voir apparaître la répartition par catégorie.</p>`}
    </div>

    <div class="panel" style="padding:6px 16px;">
      ${finances.length ? finances.map(financeRowHtml).join('') : emptyState("Aucune fiche pour l'instant", "Ajoute ta première fiche match pour démarrer le suivi financier.")}
    </div>
  `;
  document.getElementById('add-finance-btn').addEventListener('click', () => openFinanceForm());
  document.getElementById('monthly-revenue-btn').addEventListener('click', () => openMonthlyRevenueModal());
  document.querySelectorAll('.finance-row').forEach(row => {
    row.addEventListener('click', () => openFinanceForm(finances.find(f => f.id === row.dataset.id)));
  });
}

function financeRowHtml(f) {
  const net = (Number(f.indemnites) || 0) - (Number(f.charges) || 0);
  return `
    <div class="match-row finance-row" data-id="${f.id}" style="grid-template-columns: 84px 1fr 90px 70px 28px;">
      <div class="match-date">${formatDate(f.date)}</div>
      <div class="match-teams">${escapeHtml(f.lieu || '—')}<span class="lvl">${escapeHtml(f.categorie || '')} · ${(Number(f.distanceKm) || 0)} km</span></div>
      <div class="match-score">${eur(f.indemnites)}</div>
      <div class="badge-note" style="color:${net >= 0 ? 'var(--positive)' : '#ff8f8f'}">${net >= 0 ? '+' : ''}${net.toFixed(0)}€</div>
      <div class="chev">›</div>
    </div>
  `;
}

function monthlyRevenueTableHtml() {
  const byMonth = {};
  finances.forEach(f => {
    if (!f.date) return;
    const key = f.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { ca: 0, charges: 0, count: 0 };
    byMonth[key].ca += Number(f.indemnites) || 0;
    byMonth[key].charges += Number(f.charges) || 0;
    byMonth[key].count += 1;
  });
  const months = Object.keys(byMonth).sort().reverse();
  if (!months.length) return `<p class="obs-text">Aucune fiche enregistrée pour l'instant.</p>`;
  const rows = months.map(key => {
    const d = byMonth[key];
    const ben = d.ca - d.charges;
    const label = new Date(key + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return `<tr><td style="text-transform:capitalize">${label}</td><td>${d.count}</td><td>${eur(d.ca)}</td><td>${eur(d.charges)}</td><td style="color:${ben >= 0 ? 'var(--positive)' : '#ff8f8f'}">${eur(ben)}</td></tr>`;
  }).join('');
  return `
    <table class="recap-table">
      <thead><tr><th>Mois</th><th>Matchs</th><th>Chiffre d'affaires</th><th>Charges</th><th>Bénéfice</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function openMonthlyRevenueModal() {
  const html = `
    <h3 class="modal-title">Revenu mensuel</h3>
    <p class="modal-sub">Chiffre d'affaires et bénéfice, mois par mois.</p>
    ${monthlyRevenueTableHtml()}
    <div class="modal-actions" style="justify-content:flex-end;">
      <div class="modal-actions-right"><button type="button" class="btn btn-primary" id="close-monthly-btn">Fermer</button></div>
    </div>
  `;
  openModal(html);
  document.getElementById('close-monthly-btn').addEventListener('click', closeModal);
}

function openFinanceForm(existing) {
  const f = existing || {};
  const html = `
    <h3 class="modal-title">${existing ? 'Modifier la fiche' : 'Ajouter une fiche'}</h3>
    <p class="modal-sub">Renseigne les informations financières de ce match.</p>
    <form id="finance-form">
      <div class="form-grid">
        <div class="form-field"><label>Date</label><input type="date" name="date" required value="${f.date || ''}"></div>
        <div class="form-field"><label>Lieu</label><input type="text" name="lieu" value="${f.lieu || ''}"></div>
        <div class="form-field"><label>Catégorie</label>
          <select name="categorie">${FINANCE_CATEGORIES.map(c => `<option ${f.categorie === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-field"><label>Distance (km)</label><input type="number" min="0" step="0.1" name="distanceKm" value="${f.distanceKm ?? ''}"></div>
        <div class="form-field"><label>Indemnités (€)</label><input type="number" min="0" step="0.01" name="indemnites" value="${f.indemnites ?? ''}"></div>
        <div class="form-field"><label>Charges (€)</label><input type="number" min="0" step="0.01" name="charges" value="${f.charges ?? ''}"></div>
      </div>
      <div class="modal-actions">
        <div>${existing ? `<button type="button" class="btn btn-ghost btn-danger" id="delete-finance-btn">Supprimer</button>` : ''}</div>
        <div class="modal-actions-right">
          <button type="button" class="btn btn-ghost" id="cancel-btn">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </form>
  `;
  openModal(html);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  const delBtn = document.getElementById('delete-finance-btn');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (confirm("Supprimer cette fiche ?")) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'finances', existing.id));
      closeModal(); showToast('Fiche supprimée.');
    }
  });
  document.getElementById('finance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      date: fd.get('date'),
      lieu: fd.get('lieu').trim(),
      categorie: fd.get('categorie'),
      distanceKm: fd.get('distanceKm') ? Number(fd.get('distanceKm')) : 0,
      indemnites: fd.get('indemnites') ? Number(fd.get('indemnites')) : 0,
      charges: fd.get('charges') ? Number(fd.get('charges')) : 0,
    };
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'finances', existing.id), data);
        showToast('Fiche mise à jour.');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users', currentUser.uid, 'finances'), data);
        showToast('Fiche ajoutée.');
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
