// Windsurf-Theorieprüfung — Ablaufsteuerung. Fragenkatalog kommt aus theorie-questions.js.
// Ergebnis (0..1) geht am Ende an onFinish -> submit_minigame_result.

function renderTheorieQuiz(container, onFinish) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const escapeHtml = (str) => { const d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function buildQuestionSequence() {
    const row = ROW_QUESTIONS.slice();
    const rx = REACTION_QUESTIONS.slice();
    const mc = MC_QUESTIONS.slice();
    return [
      mc[0], row[0], mc[1], mc[2], row[1],
      mc[3], rx[0], row[2], mc[4], mc[5], row[3], rx[3],
      mc[6], row[4], rx[1], mc[7], row[5], mc[8], rx[2],
      mc[9], row[6], rx[4], mc[10],
      row[7], mc[11],
    ];
  }

  const sequence = buildQuestionSequence();
  const maxScore = sequence.reduce((s, q) => s + q.points + (q.type === "reaction" ? q.points * 0.5 : 0), 0);

  let idx = 0;
  let totalScore = 0;
  let correctCount = 0;
  const typeStats = {
    row: { correct: 0, total: 0 },
    reaction: { correct: 0, total: 0 },
    mc: { correct: 0, total: 0 },
  };

  container.classList.add("theorie-quiz");
  renderIntro();

  function renderIntro() {
    container.innerHTML = `
      <div class="tq-intro">
        <div class="tq-eyebrow">Windsurf-Theorieprüfung</div>
        <h2>25 Fragen, ca. 10–15 Minuten</h2>
        <p>Vorfahrts-Simulationen, Reaktionsszenarien und Multiple-Choice-Fragen – wie bei einer echten
        Theorieprüfung für den Windsurfschein. Nach jeder Frage gibt's sofort Feedback mit Erklärung.
        Die Schwierigkeit steigt im Verlauf.</p>
        <button class="tq-btn tq-btn-primary tq-btn-block" id="tq-start-btn" type="button">Prüfung starten</button>
      </div>
    `;
    container.querySelector("#tq-start-btn").addEventListener("click", () => { idx = 0; next(); });
  }

  function next() {
    if (idx >= sequence.length) { showResult(); return; }
    renderQuestionShell(sequence[idx]);
  }

  function renderQuestionShell(q) {
    const pct = Math.round((idx / sequence.length) * 100);
    container.innerHTML = `
      <div class="tq-header">
        <div class="tq-progress-track"><div class="tq-progress-fill" style="width:${pct}%;"></div></div>
        <div class="tq-header-row">
          <span>Frage ${idx + 1} / ${sequence.length}</span>
          <span class="tq-score">${Math.round(totalScore)} Pkt.</span>
        </div>
      </div>
      <div class="tq-body fade-in" id="tq-body"></div>
    `;
    const body = container.querySelector("#tq-body");
    if (q.type === "row") renderRowQuestion(body, q, handleAnswer);
    else if (q.type === "reaction") renderReactionQuestion(body, q, handleAnswer);
    else renderMcQuestion(body, q, handleAnswer);
  }

  function handleAnswer(q, correct, bonusPoints) {
    const cat = q.type === "row" ? "row" : q.type === "reaction" ? "reaction" : "mc";
    typeStats[cat].total += 1;
    if (correct) {
      typeStats[cat].correct += 1;
      correctCount += 1;
      totalScore += q.points + (bonusPoints || 0);
    }
  }

  // ---------------- Typ "row" ----------------

  function rotateScenario(q) {
    const rot = Math.random() * 360;
    const cx = 100, cy = 110;
    const rad = (rot * Math.PI) / 180;
    const surfers = q.surfers.map((s) => {
      const dx = s.x - cx, dy = s.y - cy;
      const nx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ny = dx * Math.sin(rad) + dy * Math.cos(rad);
      return { ...s, x: cx + nx, y: cy + ny, heading: (s.heading + rot + 360) % 360 };
    });
    return { ...q, windFrom: (q.windFrom + rot) % 360, surfers };
  }

  function renderRowQuestion(body, qOriginal, onAnswer) {
    const q = rotateScenario(qOriginal);
    let answered = false;
    body.innerHTML = `
      <p class="tq-prompt">${escapeHtml(q.prompt)}</p>
      <div class="tq-row-scene-box">
        <svg class="tq-row-scene" viewBox="0 0 200 220" id="tq-row-svg">
          <rect x="6" y="6" width="188" height="208" rx="14" class="tq-row-water" />
          <circle cx="100" cy="30" r="25" class="tq-row-wind-badge" />
          <g transform="translate(100 30) rotate(${q.windFrom})">
            <line x1="0" y1="-21" x2="0" y2="12" class="tq-row-wind-shaft" />
            <path d="M0,-23 L8,-7 L0,-11.5 L-8,-7 Z" class="tq-row-wind" />
          </g>
          <text x="100" y="13" class="tq-row-wind-label">Wind</text>
          ${q.surfers.map((s) => rowSurferSvg(s.x, s.y, s.heading, s.id, "")).join("")}
        </svg>
      </div>
      <div class="tq-feedback" id="tq-feedback" hidden></div>
    `;

    const svg = body.querySelector("#tq-row-svg");
    svg.querySelectorAll(".tq-surfer").forEach((g) => {
      g.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const chosen = g.dataset.id;
        const correct = chosen === qOriginal.correctId;
        svg.querySelectorAll(".tq-surfer").forEach((el) => {
          if (el.dataset.id === qOriginal.correctId) el.classList.add("tq-correct");
          else if (el.dataset.id === chosen) el.classList.add(correct ? "tq-correct" : "tq-wrong");
        });
        showFeedback(body, correct, qOriginal.explanation, () => {
          onAnswer(qOriginal, correct, 0);
          idx += 1;
          next();
        });
      });
    });
  }

  // ---------------- Typ "reaction" ----------------

  function renderReactionQuestion(body, q, onAnswer) {
    let answered = false;
    const startedAt = performance.now();
    body.innerHTML = `
      <div class="tq-reaction-head">
        <span class="tq-reaction-icon">${q.icon}</span>
        <span class="tq-reaction-title">${escapeHtml(q.title)}</span>
      </div>
      <div class="tq-timerbar"><div class="tq-timerfill" id="tq-timerfill"></div></div>
      <p class="tq-prompt">${escapeHtml(q.prompt)}</p>
      <div class="tq-options" id="tq-options">
        ${q.options.map((opt, i) => `<button type="button" class="tq-option" data-i="${i}">${escapeHtml(opt)}</button>`).join("")}
      </div>
      <div class="tq-feedback" id="tq-feedback" hidden></div>
    `;

    const fill = body.querySelector("#tq-timerfill");
    fill.style.transitionDuration = q.timeLimitSec + "s";
    requestAnimationFrame(() => { fill.style.width = "0%"; });

    const timeoutId = setTimeout(() => resolve(-1), q.timeLimitSec * 1000);

    function resolve(chosenIndex) {
      if (answered) return;
      answered = true;
      clearTimeout(timeoutId);
      const correct = chosenIndex === q.correctIndex;
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const bonusRatio = clamp01((q.timeLimitSec - elapsedSec) / q.timeLimitSec);
      const bonus = correct ? Math.round(q.points * 0.5 * bonusRatio) : 0;

      body.querySelectorAll(".tq-option").forEach((btn) => {
        const i = Number(btn.dataset.i);
        if (i === q.correctIndex) btn.classList.add("tq-correct");
        else if (i === chosenIndex) btn.classList.add("tq-wrong");
        btn.disabled = true;
      });

      const note = chosenIndex === -1 ? " (Zeit abgelaufen)" : bonus > 0 ? ` (+${bonus} Zeitbonus)` : "";
      showFeedback(body, correct, q.explanation + note, () => {
        onAnswer(q, correct, bonus);
        idx += 1;
        next();
      });
    }

    body.querySelectorAll(".tq-option").forEach((btn) => {
      btn.addEventListener("click", () => resolve(Number(btn.dataset.i)));
    });
  }

  // ---------------- Typ "mc" / "mc-image" ----------------

  function renderMcQuestion(body, q, onAnswer) {
    let answered = false;
    body.innerHTML = `
      ${q.topic ? `<div class="tq-topic">${escapeHtml(q.topic)}</div>` : ""}
      <p class="tq-prompt">${escapeHtml(q.prompt)}</p>
      ${q.type === "mc-image" ? `
        <div class="tq-rig-box">
          <svg class="tq-rig-svg" viewBox="0 0 200 170">${RIG_ILLUSTRATIONS[q.image] || RIG_ILLUSTRATIONS.correct}</svg>
        </div>
      ` : ""}
      <div class="tq-options" id="tq-options">
        ${q.options.map((opt, i) => `<button type="button" class="tq-option" data-i="${i}">${escapeHtml(opt)}</button>`).join("")}
      </div>
      <div class="tq-feedback" id="tq-feedback" hidden></div>
    `;

    body.querySelectorAll(".tq-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const chosen = Number(btn.dataset.i);
        const correct = chosen === q.correctIndex;
        body.querySelectorAll(".tq-option").forEach((b) => {
          const i = Number(b.dataset.i);
          if (i === q.correctIndex) b.classList.add("tq-correct");
          else if (i === chosen) b.classList.add("tq-wrong");
          b.disabled = true;
        });
        showFeedback(body, correct, q.explanation, () => {
          onAnswer(q, correct, 0);
          idx += 1;
          next();
        });
      });
    });
  }

  // ---------------- Feedback + Ergebnis ----------------

  function showFeedback(body, correct, explanation, onContinue) {
    if (correct) { Sfx.success(); Sfx.vibrate(40); } else { Sfx.error(); Sfx.vibrate([30, 30, 30]); }
    const fb = body.querySelector("#tq-feedback");
    fb.hidden = false;
    fb.className = "tq-feedback " + (correct ? "tq-feedback-correct" : "tq-feedback-wrong");
    fb.innerHTML = `
      <div class="tq-feedback-title">${correct ? "✓ Richtig!" : "✗ Leider falsch"}</div>
      <p>${escapeHtml(explanation)}</p>
      <button type="button" class="tq-btn tq-btn-primary tq-btn-block" id="tq-continue-btn">Weiter</button>
    `;
    fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    fb.querySelector("#tq-continue-btn").addEventListener("click", onContinue);
  }

  function rankFor(pct) {
    if (pct >= 90) return "Windsurf-Meister";
    if (pct >= 75) return "Navigator";
    if (pct >= 60) return "Fortgeschritten";
    if (pct >= 40) return "Surfschüler";
    return "Anfänger";
  }

  function showResult() {
    const ratio = clamp01(totalScore / maxScore);
    const pct = Math.round(ratio * 100);
    const rank = rankFor(pct);
    if (pct >= 50) Sfx.success(); else Sfx.click();

    container.innerHTML = `
      <div class="tq-result fade-in">
        <div class="tq-eyebrow">Ergebnis</div>
        <div class="tq-result-pct">${pct}%</div>
        <div class="tq-result-rank">${rank}</div>
        <div class="tq-result-sub">${correctCount} von ${sequence.length} Fragen richtig</div>
        <div class="tq-result-breakdown">
          <span class="tq-chip">Vorfahrt: ${typeStats.row.correct}/${typeStats.row.total}</span>
          <span class="tq-chip">Reaktion: ${typeStats.reaction.correct}/${typeStats.reaction.total}</span>
          <span class="tq-chip">Wissen: ${typeStats.mc.correct}/${typeStats.mc.total}</span>
        </div>
        <button type="button" class="tq-btn tq-btn-primary tq-btn-block" id="tq-submit-btn">Ergebnis einreichen</button>
      </div>
    `;
    container.querySelector("#tq-submit-btn").addEventListener("click", () => onFinish(ratio));
  }
}
