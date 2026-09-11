// Segeltrimm-Minigame (eigene Vollbild-Ansicht, siehe minigame.html).
// Kompass mit Wind- und Kurspfeil, Wind dreht sich langsam. Per Schieberegler (0-360°)
// den optimalen Segelwinkel (Mitte zwischen Wind und Kurs) treffen. 30 Sekunden Zeit,
// dazwischen 3 plötzliche Böen, auf die man innerhalb 1 Sekunde reagieren muss.
// Das Ergebnis (0..1) geht an onFinish -> submit_minigame_result, Punkte macht der Server.

function renderMinigame(container, dayTitle, onFinish) {
  const DURATION_MS = 30000;
  const GUST_REACT_MS = 1000;
  const GUST_WINDOWS = [[4000, 9000], [13000, 18000], [22000, 26000]];
  const COMPASS_DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

  const normalizeAngle = (a) => ((a % 360) + 360) % 360;
  const normalizeSigned = (a) => { const x = normalizeAngle(a); return x > 180 ? x - 360 : x; };
  const compassDir = (deg) => COMPASS_DIRS[Math.round(normalizeAngle(deg) / 45) % 8];
  const angleScoreFor = (dev) => {
    if (dev <= 5) return 100;
    if (dev <= 10) return 80;
    if (dev <= 20) return 60;
    if (dev <= 35) return 40;
    if (dev <= 60) return 20;
    return 0;
  };
  const gustScoreFor = (ms) => {
    if (ms <= 200) return 100;
    if (ms >= GUST_REACT_MS) return 0;
    return Math.round(100 - ((ms - 200) / (GUST_REACT_MS - 200)) * 100);
  };
  const formatMMSS = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return "0:" + String(s).padStart(2, "0");
  };

  const windSpeed = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4); // °/s
  const windStart = Math.random() * 360;
  const courseAngle = Math.random() * 360;
  const optimalAt = (windAngle) => normalizeAngle(windAngle + normalizeSigned(courseAngle - windAngle) / 2);

  let sailAngle = Math.round(optimalAt(windStart));
  let windAngle = windStart;
  let startTime = null;
  let ended = false;
  let rafId = null;
  let sampleIntervalId = null;
  const gustTimeouts = [];
  let activeGustMissTimer = null;
  let gustActive = false;
  let gustStartedAt = 0;
  let gustIndex = 0;

  const angleScores = [];
  const gustScores = [];
  let els = {};

  function isAttached() {
    return document.body.contains(container);
  }

  function tickMarksSvg() {
    return Array.from({ length: 12 }).map((_, i) =>
      `<line x1="110" y1="24" x2="110" y2="32" class="mg2-tick" transform="rotate(${i * 30} 110 110)" />`
    ).join("");
  }

  function renderIntro() {
    container.innerHTML = `
      <div class="mg2-heading">
        <h3>${escapeHtml(dayTitle || "Segeltrimm-Minigame")}</h3>
        <p>Stell mit dem Regler den optimalen Segelwinkel zwischen Wind und Kurs ein – der Wind dreht
        langsam, du musst nachjustieren. Bei plötzlichen Böen sofort "Segel öffnen" klicken. 30 Sekunden Zeit.</p>
      </div>
      <button class="btn btn-primary btn-block" id="mg-start-btn" type="button">Minigame starten</button>
    `;
    container.querySelector("#mg-start-btn").addEventListener("click", start);
  }

  function renderPlayField() {
    container.innerHTML = `
      <div class="mg2-stats-row">
        <div class="mg2-stat">
          <span class="mg2-stat-label">Zeit</span>
          <span class="mg2-stat-val" id="mg2-time-val">0:30</span>
        </div>
        <div class="mg2-stat">
          <span class="mg2-stat-label">Trefferquote</span>
          <span class="mg2-stat-val accent" id="mg2-hitrate-val">–</span>
        </div>
        <div class="mg2-stat">
          <span class="mg2-stat-label">Böen</span>
          <span class="mg2-stat-val" id="mg2-gust-count">0 / 3</span>
          <span class="mg2-gust-dots" id="mg2-gust-dots">
            <i class="mg2-dot" data-i="0"></i><i class="mg2-dot" data-i="1"></i><i class="mg2-dot" data-i="2"></i>
          </span>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" id="mg2-timer" style="width:100%;"></div></div>

      <div class="mg2-heading" style="margin-top:16px;">
        <h3>Halte den optimalen Kurs</h3>
        <p>Stelle den Segelwinkel ein</p>
      </div>

      <div class="mg2-compass-box">
        <svg class="mg2-compass" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
          <circle cx="110" cy="110" r="86" class="mg2-ring" />
          ${tickMarksSvg()}
          <text x="110" y="20" class="mg2-cardinal">N</text>
          <text x="204" y="115" class="mg2-cardinal">O</text>
          <text x="110" y="210" class="mg2-cardinal">S</text>
          <text x="16" y="115" class="mg2-cardinal">W</text>

          <g class="mg2-arrow course" id="mg2-course-arrow">
            <line x1="110" y1="110" x2="110" y2="40" />
            <polygon points="110,30 103,45 117,45" />
          </g>
          <g class="mg2-arrow wind" id="mg2-wind-arrow">
            <line x1="110" y1="110" x2="110" y2="35" />
            <polygon points="110,25 102,42 118,42" />
          </g>
          <g class="mg2-arrow sail" id="mg2-sail-arrow">
            <line x1="110" y1="110" x2="110" y2="30" />
            <polygon points="110,20 99,52 121,52" />
          </g>
          <circle cx="110" cy="110" r="4" class="mg2-center" />
        </svg>
      </div>

      <div class="mg2-vectors">
        <span class="mg2-vector wind"><i class="dot wind"></i>Wind <b id="mg2-wind-label">–</b></span>
        <span class="mg2-vector course"><i class="dot course"></i>Kurs <b id="mg2-course-label">–</b></span>
      </div>

      <div class="mg2-readout">
        <span class="mg2-angle-val" id="mg2-angle-val">${sailAngle}°</span>
        <span class="mg2-score-badge" id="mg2-score-badge">–</span>
      </div>
      <input type="range" min="0" max="359" value="${sailAngle}" class="mg2-slider" id="mg2-slider" aria-label="Segelwinkel" />

      <div class="mg2-gust-card" id="mg2-gust-card" hidden>
        <div class="mg2-gust-head">
          <span class="mg2-gust-icon">💨</span>
          <div>
            <div class="mg2-gust-title">STARKBÖE!</div>
            <div class="mg2-gust-sub">Reagiere innerhalb von 1 Sekunde!</div>
          </div>
        </div>
        <div class="mg2-gust-bar-row">
          <div class="progress-track" style="flex:1;"><div class="progress-fill" id="mg2-gust-fill" style="width:100%; background:linear-gradient(90deg, var(--danger), #ff9a9a);"></div></div>
          <span class="mg2-gust-time" id="mg2-gust-time">1.00s</span>
        </div>
        <button class="btn btn-danger btn-block" id="mg2-gust-btn" type="button" style="margin-top:10px;">Segel öffnen</button>
      </div>
      <div class="mg2-gust-feedback" id="mg2-gust-feedback"></div>

      <div class="mg2-tip">
        <span class="mg2-tip-icon">💡</span>
        <div><b>Tipp:</b> Bleib nahe am optimalen Winkel und reagiere schnell auf Böen, um die maximale Punktzahl zu erreichen.</div>
      </div>
    `;

    els = {
      timeVal: container.querySelector("#mg2-time-val"),
      hitRateVal: container.querySelector("#mg2-hitrate-val"),
      gustCount: container.querySelector("#mg2-gust-count"),
      gustDots: Array.from(container.querySelectorAll(".mg2-dot")),
      timer: container.querySelector("#mg2-timer"),
      windArrow: container.querySelector("#mg2-wind-arrow"),
      courseArrow: container.querySelector("#mg2-course-arrow"),
      sailArrow: container.querySelector("#mg2-sail-arrow"),
      windLabel: container.querySelector("#mg2-wind-label"),
      courseLabel: container.querySelector("#mg2-course-label"),
      angleVal: container.querySelector("#mg2-angle-val"),
      scoreBadge: container.querySelector("#mg2-score-badge"),
      slider: container.querySelector("#mg2-slider"),
      gustCard: container.querySelector("#mg2-gust-card"),
      gustFill: container.querySelector("#mg2-gust-fill"),
      gustTime: container.querySelector("#mg2-gust-time"),
      gustBtn: container.querySelector("#mg2-gust-btn"),
      gustFeedback: container.querySelector("#mg2-gust-feedback"),
    };

    els.courseArrow.setAttribute("transform", `rotate(${courseAngle} 110 110)`);
    els.courseLabel.textContent = `${Math.round(courseAngle)}° ${compassDir(courseAngle)}`;
    els.slider.addEventListener("input", onSliderInput);
    els.gustBtn.addEventListener("click", onGustClick);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function onSliderInput(e) {
    sailAngle = Number(e.target.value);
    els.sailArrow.setAttribute("transform", `rotate(${sailAngle} 110 110)`);
    els.angleVal.textContent = sailAngle + "°";
    refreshBadge();
  }

  function currentOptimal() {
    return optimalAt(windAngle);
  }

  function refreshBadge() {
    const dev = Math.abs(normalizeSigned(sailAngle - currentOptimal()));
    const score = angleScoreFor(dev);
    els.scoreBadge.textContent = `${score} Punkte (±${Math.round(dev)}°)`;
    els.scoreBadge.className = "mg2-score-badge " + (score >= 80 ? "great" : score >= 40 ? "ok" : "bad");
  }

  function start() {
    renderPlayField();
    scheduleGusts();
    startTime = performance.now();
    windAngle = windStart;
    // +180: Pfeilspitze zeigt wohin der Wind bläst, nicht woher (windAngle bleibt die
    // Herkunftsrichtung, die optimalAt()/currentOptimal() weiterhin verwenden).
    els.windArrow.setAttribute("transform", `rotate(${windAngle + 180} 110 110)`);
    els.windLabel.textContent = `${Math.round(windAngle)}° ${compassDir(windAngle)}`;
    refreshBadge();
    sampleIntervalId = setInterval(sampleScore, 200);
    rafId = requestAnimationFrame(tick);
  }

  function sampleScore() {
    if (ended) return;
    const dev = Math.abs(normalizeSigned(sailAngle - currentOptimal()));
    angleScores.push(angleScoreFor(dev));
    const avg = angleScores.reduce((a, b) => a + b, 0) / angleScores.length;
    els.hitRateVal.textContent = Math.round(avg) + "%";
  }

  function tick(now) {
    if (ended || !isAttached()) return;
    const elapsed = now - startTime;

    windAngle = normalizeAngle(windStart + windSpeed * (elapsed / 1000));
    els.windArrow.setAttribute("transform", `rotate(${windAngle + 180} 110 110)`);
    els.windLabel.textContent = `${Math.round(windAngle)}° ${compassDir(windAngle)}`;
    refreshBadge();

    const remaining = Math.max(0, DURATION_MS - elapsed);
    els.timer.style.width = (remaining / DURATION_MS) * 100 + "%";
    els.timeVal.textContent = formatMMSS(remaining);

    if (gustActive) {
      const gustRemaining = Math.max(0, GUST_REACT_MS - (now - gustStartedAt));
      els.gustFill.style.width = (gustRemaining / GUST_REACT_MS) * 100 + "%";
      els.gustTime.textContent = (gustRemaining / 1000).toFixed(2) + "s";
    }

    if (elapsed >= DURATION_MS) {
      finishRound();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function scheduleGusts() {
    GUST_WINDOWS.forEach(([min, max]) => {
      const t = min + Math.random() * (max - min);
      gustTimeouts.push(setTimeout(triggerGust, t));
    });
  }

  function triggerGust() {
    if (ended || !isAttached()) return;
    gustActive = true;
    Sfx.gustAlert();
    Sfx.vibrate(60);
    gustStartedAt = performance.now();
    els.gustFeedback.textContent = "";
    els.gustCard.hidden = false;
    els.gustFill.style.width = "100%";
    els.gustTime.textContent = "1.00s";
    activeGustMissTimer = setTimeout(() => {
      if (!gustActive) return;
      resolveGust(0, null);
      els.gustFeedback.textContent = "Verpasst – 0 Punkte für diese Böe.";
    }, GUST_REACT_MS);
  }

  function onGustClick() {
    if (!gustActive) return;
    clearTimeout(activeGustMissTimer);
    const reactionMs = performance.now() - gustStartedAt;
    const score = gustScoreFor(reactionMs);
    resolveGust(score, reactionMs);
    els.gustFeedback.textContent = `Reaktion: ${(reactionMs / 1000).toFixed(2)}s – ${score} Punkte.`;
  }

  function resolveGust(score) {
    gustActive = false;
    if (score >= 50) { Sfx.success(); } else { Sfx.error(); Sfx.vibrate([40, 40, 40]); }
    gustScores.push(score);
    els.gustCard.hidden = true;
    els.gustCount.textContent = gustScores.length + " / 3";
    const dot = els.gustDots[gustIndex];
    if (dot) dot.className = "mg2-dot " + (score >= 80 ? "great" : score >= 40 ? "ok" : "bad");
    gustIndex += 1;
    setTimeout(() => { if (!ended) els.gustFeedback.textContent = ""; }, 2200);
  }

  function finishRound() {
    if (ended) return;
    ended = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (sampleIntervalId) clearInterval(sampleIntervalId);
    gustTimeouts.forEach(clearTimeout);
    if (activeGustMissTimer) clearTimeout(activeGustMissTimer);

    const angleAvg = angleScores.length ? angleScores.reduce((a, b) => a + b, 0) / angleScores.length : 0;
    const gustAvg = gustScores.length ? gustScores.reduce((a, b) => a + b, 0) / gustScores.length : 100;
    const performanceRatio = Math.max(0, Math.min(1, (angleAvg * 0.65 + gustAvg * 0.35) / 100));
    showResult(performanceRatio, angleAvg, gustAvg);
  }

  function showResult(performanceRatio, angleAvg, gustAvg) {
    const pct = Math.round(performanceRatio * 100);
    if (pct >= 50) Sfx.success(); else Sfx.click();
    container.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:34px;font-weight:800;color:var(--accent);">${pct}%</div>
        <div class="field-hint" style="margin-top:4px;">Gesamtergebnis</div>
        <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
          <span class="badge gray">Kurshaltung: ${Math.round(angleAvg)}%</span>
          <span class="badge gray">Böen-Reaktion: ${Math.round(gustAvg)}%</span>
        </div>
        <button class="btn btn-primary btn-block" id="mg-submit-btn" type="button" style="margin-top:16px;">Ergebnis einreichen</button>
      </div>
    `;
    container.querySelector("#mg-submit-btn").addEventListener("click", () => onFinish(performanceRatio));
  }

  renderIntro();
}
