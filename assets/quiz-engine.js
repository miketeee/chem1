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
  startQuiz();
  const best0 = parseInt(localStorage.getItem(CONFIG.storageKey) || '0');
  if (best0 > 0) bestScoreEl.textContent = `Best score: ${best0} / ${CONFIG.questions.length}`;
  initResources();
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
    <div class="options">${optsHtml}</div>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;

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
    <div class="match-rows">${rowsHtml}</div>
    <button class="check-btn" id="checkBtn">Check answers</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;

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
    <div class="stmt-list">${stmtHtml}</div>
    <button class="check-btn" id="checkBtn">Check answers</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;

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
    <div class="calc-row" id="calcRow">
      <input type="text" id="calcInput" placeholder="e.g. 5.24x10^-8" autocomplete="off" spellcheck="false">
      <span class="unit">${item.unit || ''}</span>
    </div>
    <button class="check-btn" id="checkBtn">Check answer</button>
    <div class="feedback" id="feedback"></div>
    <button class="next-btn" id="nextBtn">${current === QUESTIONS.length - 1 ? 'See results' : 'Next question'}</button>
  `;

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
