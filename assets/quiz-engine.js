// Shared quiz engine — used by every quiz page.
// Each quiz page defines QUESTIONS_MASTER + a config object, then calls initQuiz(config).

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];

let QUESTIONS = [];
let current = 0;
let score = 0;
let missed = [];
let CONFIG = {};

let cardEl, scorePill, progressFill, bestScoreEl;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ''); }

// Parses strings like "5.24x10^-8", "5.24 × 10^-8", "5.24e-8", "0.0300", "3,000"
function parseSci(str) {
  if (str === undefined || str === null) return NaN;
  let s = String(str).trim().replace(/,/g, '').replace(/×/g, 'x').replace(/\s+/g, '');
  if (s === '') return NaN;
  const m = s.match(/^(-?\d*\.?\d+)(?:x10\^?(-?\d+)|[eE](-?\d+))?$/);
  if (!m) return NaN;
  const mant = parseFloat(m[1]);
  const exp = m[2] !== undefined ? parseInt(m[2], 10) : (m[3] !== undefined ? parseInt(m[3], 10) : 0);
  return mant * Math.pow(10, exp);
}

function initQuiz(config) {
  CONFIG = config;
  cardEl = document.getElementById('card');
  scorePill = document.getElementById('scorePill');
  progressFill = document.getElementById('progressFill');
  bestScoreEl = document.getElementById('bestScore');

  // Stable per-question id, assigned once from each question's position
  // in the ORIGINAL (unshuffled) array as written in the quiz file. This
  // is what notes are keyed against, so a note survives shuffled re-takes.
  // Caveat: inserting a question in the middle of an existing quiz file
  // later will shift the ids of everything after it.
  CONFIG.questions.forEach((q, i) => {
    if (!q.id) q.id = `${CONFIG.storageKey}-q${String(i + 1).padStart(2, '0')}`;
  });

  startQuiz();
  const best0 = parseInt(localStorage.getItem(CONFIG.storageKey) || '0');
  if (best0 > 0) bestScoreEl.textContent = `Best score: ${best0} / ${CONFIG.questions.length}`;
  initResources();
  initNotes();
}

// ---------------------------------------------------------------------
// Resources — a universal floating button + modal, available on every
// page (homepage and every quiz). Add new entries here and they show
// up everywhere automatically; no need to touch individual quiz pages.
// ASSET_BASE is set once per page (e.g. '../assets/' from /quizzes/,
// 'assets/' from the homepage) before quiz-engine.js is loaded.
// ---------------------------------------------------------------------
const RESOURCES = [
  {
    name: 'Periodic Table of the Elements',
    type: 'image',
    icon: '\u26b0',
    src: () => (typeof ASSET_BASE !== 'undefined' ? ASSET_BASE : '') + 'periodic-table.png'
  }
];

function initResources() {
  if (document.getElementById('resourcesBtn')) return; // already injected

  const btn = document.createElement('button');
  btn.id = 'resourcesBtn';
  btn.className = 'resources-btn';
  btn.innerHTML = `<span class="ico">\u2735</span> Resources`;
  document.body.appendChild(btn);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'resourcesModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="resourcesModalClose">\u2715</button>
      <h3>Resources</h3>
      <p class="sub">Reference material you can pull up any time \u2014 doesn't affect your score.</p>
      <div id="resourcesListEl"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('#resourcesListEl');
  RESOURCES.forEach(r => {
    const src = typeof r.src === 'function' ? r.src() : r.src;
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.innerHTML = `
      <span class="thumb">${r.type === 'image' ? `<img src="${src}" alt="">` : r.icon || '\u2197'}</span>
      <span class="meta"><span class="name">${r.name}</span><span class="type">${r.type === 'image' ? 'Image' : 'Link'}</span></span>
    `;
    item.addEventListener('click', () => {
      if (r.type === 'image') openLightbox(src, r.name);
      else window.open(src, '_blank');
    });
    listEl.appendChild(item);
  });

  const lb = document.createElement('div');
  lb.className = 'lightbox-overlay';
  lb.id = 'resourceLightbox';
  lb.innerHTML = `<button class="lightbox-close" id="lightboxClose">\u2715</button><img id="lightboxImg" src="" alt="">`;
  document.body.appendChild(lb);

  btn.addEventListener('click', () => overlay.classList.add('show'));
  overlay.querySelector('#resourcesModalClose').addEventListener('click', () => overlay.classList.remove('show'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });

  lb.querySelector('#lightboxClose').addEventListener('click', () => lb.classList.remove('show'));
  lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('show'); });
}

function openLightbox(src, alt) {
  const lb = document.getElementById('resourceLightbox');
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxImg').alt = alt || '';
  lb.classList.add('show');
}

// ---------------------------------------------------------------------
// Per-question notes — backed by a Google Sheet via Apps Script (see
// notes-config.js + notes-backend/NOTES-SETUP.md). Notes are keyed by
// CONFIG.storageKey + a stable per-question id (assigned in initQuiz),
// so they survive shuffled re-takes and persist across visits once the
// backend is configured. With no endpoint configured, the button still
// renders but saving quietly no-ops.
// ---------------------------------------------------------------------
let notesCache = {};
let notesLoaded = false;
let notesSaveTimer = null;

function notesConfigured() {
  return typeof NOTES_CONFIG !== 'undefined' && NOTES_CONFIG.endpoint;
}

function initNotes() {
  if (!notesConfigured()) return;
  fetch(`${NOTES_CONFIG.endpoint}?quiz=${encodeURIComponent(CONFIG.storageKey)}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.ok) {
        notesCache = data.notes || {};
        notesLoaded = true;
        // Patch the note already on screen, if the fetch resolved after
        // the first question rendered with stale/empty cache.
        refreshNotesWidget();
      }
    })
    .catch(() => { /* offline or misconfigured — notes button still works locally per-session */ });
}

function renderNotesWidget(item) {
  const existing = notesCache[item.id];
  const hasNote = existing && existing.note;
  return `
    <div class="notes-widget" data-note-id="${item.id}">
      <button class="notes-toggle" id="notesToggle" type="button">
        <span class="notes-icon">✎</span>
        <span id="notesToggleLabel">${hasNote ? 'View note' : 'Add a note'}</span>
        ${hasNote ? '<span class="notes-dot"></span>' : ''}
      </button>
      <div class="notes-box" id="notesBox" style="display:${hasNote ? 'block' : 'none'};">
        <textarea id="notesText" placeholder="Notes for this question… saved automatically">${hasNote ? escapeHtml_(existing.note) : ''}</textarea>
        <div class="notes-status" id="notesStatus">${!notesConfigured() ? 'Notes server not set up yet — see NOTES-SETUP.md' : ''}</div>
      </div>
    </div>
  `;
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attachNotesHandlers(item) {
  const toggle = document.getElementById('notesToggle');
  const box = document.getElementById('notesBox');
  const textarea = document.getElementById('notesText');
  const status = document.getElementById('notesStatus');
  if (!toggle || !box || !textarea) return;

  toggle.addEventListener('click', () => {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') textarea.focus();
  });

  textarea.addEventListener('input', () => {
    if (!notesConfigured()) {
      status.textContent = 'Notes server not set up yet — see NOTES-SETUP.md';
      return;
    }
    status.textContent = 'Saving…';
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => saveNote(item, textarea.value, status, toggle), 600);
  });
}

function saveNote(item, text, statusEl, toggleEl) {
  fetch(NOTES_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight to Apps Script
    body: JSON.stringify({ secret: NOTES_CONFIG.secret, quiz: CONFIG.storageKey, question: item.id, note: text })
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.ok) {
        notesCache[item.id] = text ? { note: text, updated_at: data.updated_at } : undefined;
        if (statusEl) statusEl.textContent = text ? 'Saved' : 'Cleared';
        if (toggleEl) {
          const label = toggleEl.querySelector('#notesToggleLabel');
          if (label) label.textContent = text ? 'View note' : 'Add a note';
        }
      } else {
        if (statusEl) statusEl.textContent = (data && data.error) ? `Couldn't save: ${data.error}` : "Couldn't save";
      }
    })
    .catch(() => { if (statusEl) statusEl.textContent = "Couldn't save — check your connection"; });
}

// Re-renders just the notes widget in place, without disturbing whatever
// answer state is already on screen (used after the initial notes fetch
// resolves, in case it lands after the first question already rendered).
function refreshNotesWidget() {
  const widget = cardEl.querySelector('.notes-widget');
  if (!widget) return;
  const id = widget.dataset.noteId;
  const item = QUESTIONS.find(q => q.id === id) || CONFIG.questions.find(q => q.id === id);
  if (!item) return;
  widget.outerHTML = renderNotesWidget(item);
  attachNotesHandlers(item);
}

function startQuiz() {
  QUESTIONS = shuffle(CONFIG.questions);
  current = 0;
  score = 0;
  missed = [];
  renderQuestion();
}

function renderQuestion() {
  const item = QUESTIONS[current];
  scorePill.textContent = `${score} / ${QUESTIONS.length}`;
  progressFill.style.width = `${(current / QUESTIONS.length) * 100}%`;

  if (item.type === 'single') renderSingle(item);
  else if (item.type === 'match') renderMatch(item);
  else if (item.type === 'multi') renderMulti(item);
  else if (item.type === 'calc') renderCalc(item);
  else if (item.type === 'fill') renderFill(item);
}

// Normalizes free-text answers for grading: trims, lowercases, collapses
// internal whitespace, and drops surrounding punctuation so minor
// formatting differences (extra space, trailing period) don't fail a
// correct chemistry name.
function normalizeText(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^["'.]+|["'.]+$/g, '');
}

function givenHtml(item) {
  return item.given ? `<div class="q-given">${item.given}</div>` : '';
}

function renderSingle(item) {
  const optsHtml = item.opts.map((opt, i) => `
    <button class="option" data-index="${i}">
      <span class="letter">${LETTERS[i]}</span><span>${opt}</span>
    </button>
  `).join('');

  cardEl.innerHTML = `
    <div class="q-number">Question ${current + 1} of ${QUESTIONS.length}</div>
    ${item.tag ? `<div class="q-tag">${item.tag}</div>` : ''}
    <p class="q-text">${item.q}</p>
    ${givenHtml(item)}
    ${renderNotesWidget(item)}
    <div class="options">${optsHtml}</div>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;
  attachNotesHandlers(item);

  cardEl.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const isCorrect = index === item.correct;
      if (isCorrect) score++; else missed.push({ q: stripTags(item.q), correct: item.opts[item.correct] });

      cardEl.querySelectorAll('.option').forEach((b, i) => {
        b.disabled = true;
        if (i === item.correct) b.classList.add('correct');
        else if (i === index) b.classList.add('incorrect');
        else b.classList.add('dim');
      });

      const fb = document.getElementById('feedback');
      fb.classList.add('show', isCorrect ? 'right' : 'wrong');
      fb.innerHTML = isCorrect
        ? `Correct.${item.note ? `<span class="note">${item.note}</span>` : ''}`
        : `Not quite \u2014 the correct answer is <strong>${item.opts[item.correct]}</strong>.${item.note ? `<span class="note">${item.note}</span>` : ''}`;

      document.getElementById('nextBtn').classList.add('show');
      scorePill.textContent = `${score} / ${QUESTIONS.length}`;
    });
  });
  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
}

function renderMatch(item) {
  const rowsHtml = item.items.map((term, i) => `
    <div class="match-row" data-row="${i}">
      <span class="term">${term}</span>
      <select data-row="${i}">
        <option value="" disabled selected>choose\u2026</option>
        ${item.opts.map((o, j) => `<option value="${j}">${LETTERS[j]}) ${o}</option>`).join('')}
      </select>
      <span class="check-icon"></span>
    </div>
  `).join('');

  cardEl.innerHTML = `
    <div class="q-number">Question ${current + 1} of ${QUESTIONS.length}</div>
    <div class="q-tag">Matching \u2014 all must be correct for the point</div>
    <p class="q-text">${item.q}</p>
    ${givenHtml(item)}
    ${renderNotesWidget(item)}
    <div class="match-rows">${rowsHtml}</div>
    <button class="check-btn" id="checkBtn">Check answers</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;
  attachNotesHandlers(item);

  document.getElementById('checkBtn').addEventListener('click', () => {
    const selects = cardEl.querySelectorAll('select');
    let allAnswered = true;
    selects.forEach(sel => { if (sel.value === '') allAnswered = false; });
    if (!allAnswered) { alert('Choose an answer for every item first.'); return; }

    let allCorrect = true;
    selects.forEach(sel => {
      const i = parseInt(sel.dataset.row);
      const chosen = parseInt(sel.value);
      const row = cardEl.querySelector(`.match-row[data-row="${i}"]`);
      const icon = row.querySelector('.check-icon');
      sel.disabled = true;
      if (chosen === item.correct[i]) { row.classList.add('correct'); icon.textContent = '\u2713'; }
      else { row.classList.add('incorrect'); icon.textContent = '\u2717'; allCorrect = false; }
    });

    if (allCorrect) score++;
    else missed.push({
      q: stripTags(item.q),
      correct: item.items.map((term, i) => `${term} \u2192 ${item.opts[item.correct[i]]}`).join('; ')
    });

    document.getElementById('checkBtn').style.display = 'none';
    const fb = document.getElementById('feedback');
    fb.classList.add('show', allCorrect ? 'right' : 'wrong');
    fb.innerHTML = allCorrect ? 'All matches correct.' : 'One or more matches were off \u2014 correct pairings are shown above.';
    document.getElementById('nextBtn').classList.add('show');
    scorePill.textContent = `${score} / ${QUESTIONS.length}`;
  });

  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
}

function renderMulti(item) {
  const selected = new Set();
  const stmtHtml = item.opts.map((opt, i) => `
    <div class="stmt" data-index="${i}">
      <span class="box"></span><span class="label">${opt}</span>
    </div>
  `).join('');

  cardEl.innerHTML = `
    <div class="q-number">Question ${current + 1} of ${QUESTIONS.length}</div>
    <div class="q-tag">Select all that apply</div>
    <p class="q-text">${item.q}</p>
    ${givenHtml(item)}
    ${renderNotesWidget(item)}
    <div class="stmt-list">${stmtHtml}</div>
    <button class="check-btn" id="checkBtn">Check answers</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;
  attachNotesHandlers(item);

  cardEl.querySelectorAll('.stmt').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.index);
      if (selected.has(i)) { selected.delete(i); el.classList.remove('selected'); }
      else { selected.add(i); el.classList.add('selected'); }
    });
  });

  document.getElementById('checkBtn').addEventListener('click', () => {
    const correctSet = new Set(item.correct);
    const isCorrect = selected.size === correctSet.size && [...selected].every(i => correctSet.has(i));

    cardEl.querySelectorAll('.stmt').forEach(el => {
      const i = parseInt(el.dataset.index);
      el.style.cursor = 'default';
      if (correctSet.has(i)) el.classList.add('correct');
      else if (selected.has(i)) el.classList.add('incorrect');
    });

    if (isCorrect) score++;
    else missed.push({ q: stripTags(item.q), correct: item.correct.map(i => item.opts[i]).join('; ') });

    document.getElementById('checkBtn').style.display = 'none';
    const fb = document.getElementById('feedback');
    fb.classList.add('show', isCorrect ? 'right' : 'wrong');
    fb.innerHTML = (isCorrect ? 'Correct.' : 'Not quite \u2014 the correct statements are highlighted above.') + (item.note ? `<span class="note">${item.note}</span>` : '');
    document.getElementById('nextBtn').classList.add('show');
    scorePill.textContent = `${score} / ${QUESTIONS.length}`;
  });

  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
}

function renderCalc(item) {
  cardEl.innerHTML = `
    <div class="q-number">Question ${current + 1} of ${QUESTIONS.length}</div>
    <div class="q-tag">Calculate the answer</div>
    <p class="q-text">${item.q}</p>
    ${givenHtml(item)}
    ${renderNotesWidget(item)}
    <div class="calc-row" id="calcRow">
      <input type="text" id="calcInput" placeholder="e.g. 5.24x10^-8" autocomplete="off" spellcheck="false">
      <span class="unit">${item.unit || ''}</span>
    </div>
    <button class="check-btn" id="checkBtn">Check answer</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;
  attachNotesHandlers(item);

  const input = document.getElementById('calcInput');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('checkBtn').click(); });

  document.getElementById('checkBtn').addEventListener('click', () => {
    const raw = input.value;
    const val = parseSci(raw);
    const tol = item.tolerance || 0.03;
    const isCorrect = !isNaN(val) && Math.abs(val - item.answerValue) <= Math.abs(item.answerValue) * tol;

    input.disabled = true;
    document.getElementById('calcRow').classList.add(isCorrect ? 'correct' : 'incorrect');

    if (isCorrect) score++;
    else missed.push({ q: stripTags(item.q), correct: `${item.answerDisplay}${item.unit ? ' ' + item.unit : ''}` });

    document.getElementById('checkBtn').style.display = 'none';
    const fb = document.getElementById('feedback');
    fb.classList.add('show', isCorrect ? 'right' : 'wrong');
    fb.innerHTML = isCorrect
      ? `Correct.${item.note ? `<span class="note">${item.note}</span>` : ''}`
      : `The correct answer is <strong>${item.answerDisplay}${item.unit ? ' ' + item.unit : ''}</strong>.${item.note ? `<span class="note">${item.note}</span>` : ''}`;

    document.getElementById('nextBtn').classList.add('show');
    scorePill.textContent = `${score} / ${QUESTIONS.length}`;
  });

  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
}

function renderFill(item) {
  const rowsHtml = item.blanks.map((b, i) => `
    <div class="fill-row" data-row="${i}">
      ${b.label ? `<span class="fill-label">${b.label}</span>` : ''}
      <input type="text" data-row="${i}" placeholder="type the answer…" autocomplete="off" spellcheck="false">
      <span class="check-icon"></span>
    </div>
  `).join('');

  cardEl.innerHTML = `
    <div class="q-number">Question ${current + 1} of ${QUESTIONS.length}</div>
    ${item.tag ? `<div class="q-tag">${item.tag}</div>` : ''}
    <p class="q-text">${item.q}</p>
    ${givenHtml(item)}
    ${renderNotesWidget(item)}
    <div class="fill-rows">${rowsHtml}</div>
    <button class="check-btn" id="checkBtn">Check answers</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;
  attachNotesHandlers(item);

  const inputs = cardEl.querySelectorAll('.fill-row input');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
        else document.getElementById('checkBtn').click();
      }
    });
  });

  document.getElementById('checkBtn').addEventListener('click', () => {
    let allCorrect = true;
    const wrongList = [];

    inputs.forEach((inp, i) => {
      const b = item.blanks[i];
      const accepted = Array.isArray(b.answer) ? b.answer : [b.answer];
      const given = normalizeText(inp.value);
      const isCorrect = accepted.some(a => normalizeText(a) === given);
      inp.disabled = true;
      const row = cardEl.querySelector(`.fill-row[data-row="${i}"]`);
      const icon = row.querySelector('.check-icon');
      if (isCorrect) { row.classList.add('correct'); icon.textContent = '✓'; }
      else {
        row.classList.add('incorrect'); icon.textContent = '✗'; allCorrect = false;
        wrongList.push(`${b.label ? b.label + ': ' : ''}${accepted[0]}`);
      }
    });

    if (allCorrect) score++;
    else missed.push({ q: stripTags(item.q), correct: wrongList.join('; ') });

    document.getElementById('checkBtn').style.display = 'none';
    const fb = document.getElementById('feedback');
    fb.classList.add('show', allCorrect ? 'right' : 'wrong');
    fb.innerHTML = (allCorrect ? 'All correct.' : 'One or more answers were off — correct answers are shown above.') + (item.note ? `<span class="note">${item.note}</span>` : '');
    document.getElementById('nextBtn').classList.add('show');
    scorePill.textContent = `${score} / ${QUESTIONS.length}`;
  });

  document.getElementById('nextBtn').addEventListener('click', nextQuestion);
}

function nextQuestion() {
  current++;
  if (current >= QUESTIONS.length) renderSummary();
  else renderQuestion();
}

function renderSummary() {
  progressFill.style.width = '100%';
  const pct = Math.round((score / QUESTIONS.length) * 100);

  const best = parseInt(localStorage.getItem(CONFIG.storageKey) || '0');
  if (score > best) localStorage.setItem(CONFIG.storageKey, score);
  const bestNow = Math.max(score, best);

  let missedHtml = '';
  if (missed.length) {
    missedHtml = `
      <div class="missed">
        <h3>Review these:</h3>
        <ul style="padding:0;margin:0;">
          ${missed.map(m => `<li>${m.q} \u2192 <span class="ans">${m.correct}</span></li>`).join('')}
        </ul>
      </div>
    `;
  }

  cardEl.innerHTML = `
    <div class="summary">
      <div class="q-number">Quiz complete</div>
      <div class="big-score">${score} / ${QUESTIONS.length}</div>
      <div class="pct">${pct}% correct</div>
      ${missedHtml}
      <button class="restart-btn" id="restartBtn">Retake quiz</button>
      <a class="home-btn" href="../index.html">All quizzes</a>
    </div>
  `;
  bestScoreEl.textContent = `Best score: ${bestNow} / ${QUESTIONS.length}`;
  document.getElementById('restartBtn').addEventListener('click', startQuiz);
}
