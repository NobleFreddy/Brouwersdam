// Tag 1 — Strand-Quiz. Mischung aus Multiple-Choice-Fragen und "Punkt auf Foto
// markieren"-Fragen, beide admin-verwaltet (siehe admin.js) und beide mit
// Zeitlimit + Tempo-Bonus. Ergebnis (0..1) geht am Ende an onFinish ->
// submit_minigame_result, genau wie beim Theorie-Quiz.

function renderPhotoQuiz(container, dayTitle, questions, onFinish) {
  const escapeHtml = (str) => { const d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const sequence = shuffled(questions);
  const maxScore = sequence.reduce((s, q) => s + q.pointsBase * 1.5, 0);

  let idx = 0;
  let totalScore = 0;
  let correctCount = 0;
  const typeStats = {
    choice: { correct: 0, total: 0 },
    point: { correct: 0, total: 0 },
  };

  container.classList.add("photo-quiz");
  renderIntro();

  function renderIntro() {
    container.innerHTML = `
      <div class="qz-intro">
        <div class="qz-eyebrow">${escapeHtml(dayTitle)}</div>
        <h2>${sequence.length} Fragen</h2>
        <p>Beantworte Multiple-Choice-Fragen und markiere Orte auf Fotos. Jede Frage hat ein Zeitlimit –
        je schneller du richtig antwortest, desto mehr Punkte gibt es.</p>
        <button class="qz-btn qz-btn-primary qz-btn-block" id="qz-start-btn" type="button">Quiz starten</button>
      </div>
    `;
    container.querySelector("#qz-start-btn").addEventListener("click", () => { idx = 0; next(); });
  }

  function next() {
    if (idx >= sequence.length) { showResult(); return; }
    renderQuestionShell(sequence[idx]);
  }

  function renderQuestionShell(q) {
    const pct = Math.round((idx / sequence.length) * 100);
    container.innerHTML = `
      <div class="qz-header">
        <div class="qz-progress-track"><div class="qz-progress-fill" style="width:${pct}%;"></div></div>
        <div class="qz-header-row">
          <span>Frage ${idx + 1} / ${sequence.length}</span>
          <span class="qz-score">${Math.round(totalScore)} Pkt.</span>
        </div>
      </div>
      <div class="qz-body fade-in" id="qz-body"></div>
    `;
    const body = container.querySelector("#qz-body");
    if (q.kind === "point") renderPointQuestion(body, q, handleAnswer);
    else renderChoiceQuestion(body, q, handleAnswer);
  }

  function handleAnswer(q, correct, elapsedSec) {
    const cat = q.kind === "point" ? "point" : "choice";
    typeStats[cat].total += 1;
    if (correct) {
      typeStats[cat].correct += 1;
      correctCount += 1;
      const bonusRatio = clamp01((q.timeLimitSeconds - elapsedSec) / q.timeLimitSeconds);
      totalScore += q.pointsBase * (1 + 0.5 * bonusRatio);
    }
  }

  // ---------------- Timer (gemeinsam für beide Fragetypen) ----------------

  function timerBarHtml() {
    return `<div class="qz-timerbar"><div class="qz-timerfill" id="qz-timerfill"></div></div>`;
  }

  function startTimer(body, timeLimitSeconds, onTimeout) {
    const fill = body.querySelector("#qz-timerfill");
    fill.style.transitionDuration = timeLimitSeconds + "s";
    requestAnimationFrame(() => { fill.style.width = "0%"; });
    const timeoutId = setTimeout(onTimeout, timeLimitSeconds * 1000);
    return { cancel: () => clearTimeout(timeoutId) };
  }

  // ---------------- Typ "choice" ----------------

  function renderChoiceQuestion(body, q, onAnswer) {
    let answered = false;
    const startedAt = performance.now();
    const choices = Array.isArray(q.choices) ? q.choices : [];

    body.innerHTML = `
      ${timerBarHtml()}
      <p class="qz-prompt">${escapeHtml(q.prompt)}</p>
      <div class="qz-options" id="qz-options"></div>
      <div class="qz-feedback" id="qz-feedback" hidden></div>
    `;

    const optionsEl = body.querySelector("#qz-options");
    choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qz-option";
      btn.dataset.id = c.id;
      btn.textContent = c.label;
      btn.addEventListener("click", () => resolve(c.id));
      optionsEl.appendChild(btn);
    });

    const timer = startTimer(body, q.timeLimitSeconds, () => resolve(null));

    function resolve(chosenId) {
      if (answered) return;
      answered = true;
      timer.cancel();
      const elapsedSec = Math.min((performance.now() - startedAt) / 1000, q.timeLimitSeconds);
      const correct = chosenId !== null && chosenId === q.correctChoiceId;

      optionsEl.querySelectorAll(".qz-option").forEach((btn) => {
        const id = btn.dataset.id;
        if (id === q.correctChoiceId) btn.classList.add("qz-correct");
        else if (id === chosenId) btn.classList.add("qz-wrong");
        btn.disabled = true;
      });

      const correctChoice = choices.find((c) => c.id === q.correctChoiceId);
      const correctLabel = correctChoice ? correctChoice.label : "-";
      const note = chosenId === null
        ? `Zeit abgelaufen. Richtig wäre: ${correctLabel}`
        : correct ? "Richtig!" : `Leider falsch. Richtig wäre: ${correctLabel}`;

      showFeedback(body, correct, note, () => {
        onAnswer(q, correct, elapsedSec);
        idx += 1;
        next();
      });
    }
  }

  // ---------------- Typ "point" ----------------

  function renderPointQuestion(body, q, onAnswer) {
    let answered = false;
    const startedAt = performance.now();

    body.innerHTML = `
      ${timerBarHtml()}
      <p class="qz-prompt">${escapeHtml(q.prompt)}</p>
      <div class="qz-mark-wrap" id="qz-mark-wrap">
        <img src="${q.imageDataUrl}" alt="" class="qz-mark-img" id="qz-mark-img" draggable="false" />
      </div>
      <p class="qz-mark-hint">Tippe auf die Stelle im Foto.</p>
      <div class="qz-feedback" id="qz-feedback" hidden></div>
    `;

    const wrap = body.querySelector("#qz-mark-wrap");
    const img = body.querySelector("#qz-mark-img");

    function pointFromEvent(e) {
      const rect = img.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
    }

    function placeMarker(cls, x, y) {
      const dot = document.createElement("div");
      dot.className = "qz-mark-dot " + cls;
      dot.style.left = (x * 100) + "%";
      dot.style.top = (y * 100) + "%";
      wrap.appendChild(dot);
    }

    wrap.addEventListener("click", (e) => {
      if (answered) return;
      Sfx.click();
      resolve(pointFromEvent(e));
    });

    const timer = startTimer(body, q.timeLimitSeconds, () => resolve(null));

    function resolve(tapPoint) {
      if (answered) return;
      answered = true;
      timer.cancel();
      const elapsedSec = Math.min((performance.now() - startedAt) / 1000, q.timeLimitSeconds);
      const rect = img.getBoundingClientRect();

      let correct = false;
      if (tapPoint) {
        placeMarker("qz-mark-player", tapPoint.x, tapPoint.y);
        const dxPx = (tapPoint.x - q.correctX) * rect.width;
        const dyPx = (tapPoint.y - q.correctY) * rect.height;
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
        correct = distPx <= q.toleranceRadius * rect.width;
      }

      const toleranceDiameterPx = q.toleranceRadius * rect.width * 2;
      const ring = document.createElement("div");
      ring.className = "qz-mark-tolerance";
      ring.style.left = (q.correctX * 100) + "%";
      ring.style.top = (q.correctY * 100) + "%";
      ring.style.width = toleranceDiameterPx + "px";
      ring.style.height = toleranceDiameterPx + "px";
      wrap.appendChild(ring);
      placeMarker("qz-mark-correct", q.correctX, q.correctY);

      const note = !tapPoint ? "Zeit abgelaufen." : correct ? "Richtig getroffen!" : "Leider daneben.";
      showFeedback(body, correct, note, () => {
        onAnswer(q, correct, elapsedSec);
        idx += 1;
        next();
      });
    }
  }

  // ---------------- Feedback + Ergebnis ----------------

  function showFeedback(body, correct, note, onContinue) {
    if (correct) { Sfx.success(); Sfx.vibrate(40); } else { Sfx.error(); Sfx.vibrate([30, 30, 30]); }
    const fb = body.querySelector("#qz-feedback");
    fb.hidden = false;
    fb.className = "qz-feedback " + (correct ? "qz-feedback-correct" : "qz-feedback-wrong");
    fb.innerHTML = `
      <div class="qz-feedback-title">${correct ? "✓ Richtig!" : "✗ Leider falsch"}</div>
      <p id="qz-feedback-note"></p>
      <button type="button" class="qz-btn qz-btn-primary qz-btn-block" id="qz-continue-btn">Weiter</button>
    `;
    fb.querySelector("#qz-feedback-note").textContent = note;
    fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    fb.querySelector("#qz-continue-btn").addEventListener("click", onContinue);
  }

  function showResult() {
    const ratio = clamp01(totalScore / (maxScore || 1));
    const pct = Math.round(ratio * 100);
    if (pct >= 50) Sfx.success(); else Sfx.click();

    container.innerHTML = `
      <div class="qz-result fade-in">
        <div class="qz-eyebrow">Ergebnis</div>
        <div class="qz-result-pct">${pct}%</div>
        <div class="qz-result-sub">${correctCount} von ${sequence.length} Fragen richtig</div>
        <div class="qz-result-breakdown">
          ${typeStats.choice.total ? `<span class="qz-chip">Multiple Choice: ${typeStats.choice.correct}/${typeStats.choice.total}</span>` : ""}
          ${typeStats.point.total ? `<span class="qz-chip">Foto-Punkt: ${typeStats.point.correct}/${typeStats.point.total}</span>` : ""}
        </div>
        <button type="button" class="qz-btn qz-btn-primary qz-btn-block" id="qz-submit-btn">Ergebnis einreichen</button>
      </div>
    `;
    container.querySelector("#qz-submit-btn").addEventListener("click", () => onFinish(ratio));
  }
}
