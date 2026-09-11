// Abschlussmission: Materialcheck (bis 45s) geht nahtlos in eine einzige durchgehende
// Segel-Fahrt zum Ziel über. Keine Level, keine Ladebildschirme. Dynamische Ereignisse
// (Böen, Winddreher, andere Wassernutzer, Sperrzonen, Material, Person im Wasser)
// entstehen während derselben Fahrt. Ergebnis (0..1) geht an onFinish -> submit_minigame_result.

function renderFinaleMission(container, config, callbacks) {
  const dayTitle = config.title;
  const materialPhoto = config.materialPhoto;
  const materialQuestion = config.materialQuestion || "Was ist an diesem Aufbau alles falsch?";
  const onMaterialAnswer = callbacks.onMaterialAnswer;
  const onFinish = callbacks.onFinish;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SCENE_W = 320, SCENE_H = 440;
  const MAX_SPEED = 78; // px/s bei optimalem Winkel/Trimm/Zug
  // Zoomt die Szene heraus (Weltkoordinaten -> Bildschirm), ohne Spawn-Distanzen, Speed
  // oder Kollisionsradien (alles weiterhin in Weltkoordinaten) anzufassen. Ohne diesen Faktor
  // tauchen NPCs (Spawn-Distanz bis 220) oft außerhalb des sichtbaren Ausschnitts auf.
  const WORLD_SCALE = 0.55;

  const normalizeAngle = (a) => ((a % 360) + 360) % 360;
  const normalizeSigned = (a) => { const x = normalizeAngle(a); return x > 180 ? x - 360 : x; };
  const angularDistance = (a, b) => Math.abs(normalizeSigned(a - b));
  const lerpAngle = (a, b, t) => normalizeAngle(a + normalizeSigned(b - a) * t);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const COMPASS_DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const compassDir = (deg) => COMPASS_DIRS[Math.round(normalizeAngle(deg) / 45) % 8];
  const escapeHtml = (str) => { const d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; };
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function speedFactor(angleToWind) {
    if (angleToWind < 38) return 0.04;
    if (angleToWind < 55) return 0.12 + ((angleToWind - 38) / 17) * 0.48;
    if (angleToWind <= 120) return 0.6 + ((Math.min(angleToWind, 120) - 55) / 65) * 0.4;
    return 1.0 - ((angleToWind - 120) / 60) * 0.3;
  }
  function tackOf(heading, windFrom) {
    const rel = normalizeSigned(windFrom - heading);
    if (Math.abs(rel) < 4) return null;
    return rel > 0 ? "starboard" : "port";
  }

  let uidCounter = 1;
  const uid = () => "e" + (uidCounter++);

  const state = {
    stagePhase: "material", // material | mission | result
    startTimestamp: null,
    penaltyMs: 0,
    rafId: null,
    lastTick: null,
    windAngle: Math.random() * 360,
    windStrength: 2 + Math.random() * 2, // 0..5 laufend
    windDrift: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2),
    gustUntil: 0,
    gustBoost: 0,
  };

  const els = {};
  const scores = { windUsage: [], gust: [], collisions: 0, rowViolations: 0, closePasses: 0 };

  container.innerHTML = `
    <div class="ws-hud" id="fin-hud" hidden>
      <div class="ws-hud-item"><span class="ws-hud-label">Zeit</span><span class="ws-hud-val" id="fin-time">0:00</span></div>
      <div class="ws-hud-item"><span class="ws-hud-label">Punkte</span><span class="ws-hud-val accent" id="fin-score">–</span></div>
      <div class="ws-hud-item"><span class="ws-hud-label">Fortschritt</span><span class="ws-hud-val" id="fin-progress">0%</span></div>
    </div>
    <div class="ws-hud" id="fin-hud2" hidden style="grid-template-columns:1fr 1fr;">
      <div class="ws-hud-item">
        <span class="ws-hud-label">Kompass</span>
        <span class="ws-hud-wind-row">
          <svg class="ws-wind-arrow" id="fin-heading-arrow" viewBox="0 0 24 24" style="fill:var(--accent);"><path d="M12 2 L17 14 L12 10.5 L7 14 Z"/></svg>
          <span class="ws-hud-val" id="fin-heading-val">–</span>
        </span>
      </div>
      <div class="ws-hud-item">
        <span class="ws-hud-label">Ziel</span>
        <span class="ws-hud-wind-row">
          <svg class="ws-wind-arrow" id="fin-goal-arrow" viewBox="0 0 24 24" style="fill:var(--success);"><path d="M12 2 L17 14 L12 10.5 L7 14 Z"/></svg>
          <span class="ws-hud-val" id="fin-goal-val">–</span>
        </span>
      </div>
    </div>
    <div class="ws-stage" id="fin-stage"></div>
  `;
  els.hud = container.querySelector("#fin-hud");
  els.hud2 = container.querySelector("#fin-hud2");
  els.time = container.querySelector("#fin-time");
  els.scoreEl = container.querySelector("#fin-score");
  els.progressEl = container.querySelector("#fin-progress");
  els.headingArrow = container.querySelector("#fin-heading-arrow");
  els.headingVal = container.querySelector("#fin-heading-val");
  els.goalArrow = container.querySelector("#fin-goal-arrow");
  els.goalVal = container.querySelector("#fin-goal-val");
  els.stage = container.querySelector("#fin-stage");

  let playerHeading = 0;

  function formatMMSS(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function refreshScoreHud() {
    if (!scores.windUsage.length) { els.scoreEl.textContent = "–"; return; }
    els.scoreEl.textContent = Math.round(avg(scores.windUsage) * 100) + "%";
  }
  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  function mainTick(now) {
    if (state.stagePhase === "result") return;
    const elapsedMs = (now - state.startTimestamp) + state.penaltyMs;
    els.time.textContent = formatMMSS(elapsedMs);

    state.windAngle = normalizeAngle(state.windAngle + state.windDrift * ((now - (state.lastWindTick || now)) / 1000));
    state.lastWindTick = now;
    const effStrength = clamp(state.windStrength + (now < state.gustUntil ? state.gustBoost : 0), 0, 6);
    els.windVal.textContent = `${compassDir(state.windAngle)} · ${effStrength.toFixed(1)}/6`;
    // Der Wind-Pfeil ist eine <g> mit fixer translate(30 30) fürs Badge-Zentrum - per
    // Attribut statt CSS-transform drehen, sonst würde die Translation überschrieben.
    // +180: Pfeilspitze zeigt wohin der Wind bläst, nicht woher (windAngle bleibt die
    // Herkunftsrichtung, die tackOf()/evaluateEncounter() für die Vorfahrt verwenden).
    els.windArrow.setAttribute("transform", `translate(30 30) rotate(${state.windAngle + 180})`);
    els.headingArrow.style.transform = `rotate(${playerHeading}deg)`;
    els.headingVal.textContent = compassDir(playerHeading);

    const dt = state.lastTick ? (now - state.lastTick) / 1000 : 0;
    state.lastTick = now;
    if (state.onTick) state.onTick(dt, now, effStrength);

    state.rafId = requestAnimationFrame(mainTick);
  }

  function startClock() {
    els.hud.hidden = false;
    els.hud2.hidden = false;
    state.startTimestamp = performance.now();
    state.rafId = requestAnimationFrame(mainTick);
  }

  // ================= Teil 1: Materialcheck =================
  // Admin-Foto + offene Frage statt Tipp-Minispiel: die Antwort ist Freitext und wird
  // nicht automatisch bewertet (siehe onMaterialAnswer/submit_finale_material_answer).
  // Läuft ohne Zeitlimit - die Mission startet direkt nach dem Absenden nahtlos weiter.

  function renderMaterialCheck() {
    state.stagePhase = "material";
    let done = false;

    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>${escapeHtml(dayTitle || "Abschlussmission")}</h3>
        <p>Materialcheck: Schau dir das Foto genau an, bevor es losgeht.</p>
      </div>
      ${materialPhoto ? `<div class="fin-mc-photo-box"><img src="${materialPhoto}" alt="" class="fin-mc-photo" /></div>` : ""}
      <p class="fin-mc-question">${escapeHtml(materialQuestion)}</p>
      <textarea class="fin-mc-answer" id="fin-mc-answer" rows="4" placeholder="Was fällt dir auf? Schreib alles auf, was dir auffällt …"></textarea>
      <div class="field-hint" id="fin-mc-hint" style="min-height:16px;"></div>
      <button class="btn btn-primary btn-block" id="fin-mc-submit" type="button">Antwort abschicken</button>
    `;

    const textEl = els.stage.querySelector("#fin-mc-answer");
    const btn = els.stage.querySelector("#fin-mc-submit");
    const hintEl = els.stage.querySelector("#fin-mc-hint");

    btn.addEventListener("click", async () => {
      if (done) return;
      const text = textEl.value.trim();
      if (!text) {
        hintEl.textContent = "Bitte etwas eintragen, bevor es weitergeht.";
        return;
      }
      done = true;
      Sfx.click();
      btn.disabled = true;
      btn.textContent = "Wird gesendet …";
      if (onMaterialAnswer) await onMaterialAnswer(text);
      startMission();
    });
  }

  // ================= Teil 2: Hauptmission =================

  const WORLD_GOAL = { x: 210, y: -1350 };
  const WORLD_START = { x: 0, y: 0 };
  const TOTAL_DIST = Math.hypot(WORLD_GOAL.x - WORLD_START.x, WORLD_GOAL.y - WORLD_START.y);
  const SCREEN_ANCHOR = { x: SCENE_W / 2, y: SCENE_H * 0.68 };

  function startMission() {
    state.stagePhase = "mission";
    renderMissionBriefing();
  }

  // Kurze Missionsbeschreibung vor dem eigentlichen Start: Ziel, Bedienung und HUD werden
  // einmal erklärt, bevor die Uhr läuft - Lesezeit hier kostet also keine Missionszeit.
  function renderMissionBriefing() {
    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>Hauptmission</h3>
        <p>Ein einziges Ziel, keine Zwischenetappen: die pulsierende Boje mit der Aufschrift „Ziel".</p>
      </div>
      <div class="fin-briefing">
        <ul class="fin-briefing-list">
          <li><span class="fin-briefing-icon">🕹️</span> Joystick unten: Richtung lenken, Auslenkung = Tempo.</li>
          <li><span class="fin-briefing-icon">🧭</span> Der grüne „Ziel"-Pfeil oben zeigt immer zur Boje, egal wie du gerade stehst.</li>
          <li><span class="fin-briefing-icon">📊</span> „Fortschritt" oben füllt sich, je näher du der Boje kommst.</li>
          <li><span class="fin-briefing-icon">🗺️</span> Die kleine Karte oben rechts zeigt deine Position auf der gesamten Strecke.</li>
          <li><span class="fin-briefing-icon">⛵</span> Andere Windsurfer, Boote und Kiter kreuzen deinen Kurs – Vorfahrt beachten.</li>
          <li><span class="fin-briefing-icon">💨</span> Bei einer Böe schnell auf den Knopf tippen, bevor die Zeit abläuft.</li>
        </ul>
        <button class="btn btn-primary btn-block" id="fin-briefing-start" type="button">Los geht's!</button>
      </div>
    `;
    els.stage.querySelector("#fin-briefing-start").addEventListener("click", () => {
      Sfx.click();
      Sfx.startWind(state.windStrength / 5);
      startClock();
      renderMission();
    });
  }

  function renderMission() {
    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>Hauptmission</h3>
        <p>Steuere zum Zielpunkt. Wind, Ereignisse und Vorfahrt entscheiden über den besten Kurs.</p>
      </div>
      <div class="fin-scene-wrap">
        <div class="fin-mini-map">
          <span class="fin-mini-map-tag">Karte</span>
          <svg viewBox="0 0 60 60" id="fin-minimap"><rect width="60" height="60" class="fin-minimap-bg"/><line x1="30" y1="54" x2="30" y2="6" class="fin-minimap-route"/><g id="fin-minimap-goal"></g><circle id="fin-minimap-player" cx="30" cy="55" r="2.6" class="fin-minimap-player"/></svg>
        </div>
        <div class="fin-wind-badge">
          <span class="fin-wind-badge-tag">Wind</span>
          <svg viewBox="0 0 60 60" id="fin-wind-compass">
            <circle cx="30" cy="30" r="26" class="fin-wind-compass-bg" />
            <g id="fin-wind-compass-arrow" transform="translate(30 30)">
              <line x1="0" y1="-18" x2="0" y2="13" class="fin-wind-compass-shaft" />
              <path d="M0,-20 L7,-6 L0,-9.5 L-7,-6 Z" class="fin-wind-compass-head" />
            </g>
          </svg>
          <span class="fin-wind-badge-val" id="fin-wind-val">–</span>
        </div>
        <svg class="ws-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}" id="fin-svg">
          <rect x="0" y="0" width="${SCENE_W}" height="${SCENE_H}" class="ws-water" />
          <g id="fin-world"></g>
          <g id="fin-board" class="ws-board" transform="translate(${SCREEN_ANCHOR.x} ${SCREEN_ANCHOR.y})">
            <polygon points="0,-12 8,10 0,5 -8,10" />
          </g>
          <text x="10" y="20" class="fin-event-banner" id="fin-event-banner"></text>
        </svg>
      </div>
      <div class="fin-controls">
        <div class="ws-joystick" id="fin-joystick"><div class="ws-joystick-knob" id="fin-knob"></div></div>
      </div>
      <div class="fin-gust-wrap" id="fin-gust-wrap" hidden>
        <button class="btn btn-danger fin-gust-btn" id="fin-gust-btn" type="button">💨 Segel öffnen!</button>
        <div class="fin-gust-timer"><div class="fin-gust-timer-fill" id="fin-gust-timer-fill"></div></div>
      </div>
    `;

    const worldEl = els.stage.querySelector("#fin-world");
    const boardEl = els.stage.querySelector("#fin-board");
    const bannerEl = els.stage.querySelector("#fin-event-banner");
    const minimapPlayer = els.stage.querySelector("#fin-minimap-player");
    const minimapGoal = els.stage.querySelector("#fin-minimap-goal");
    minimapGoal.innerHTML = `<circle cx="30" cy="5" r="2.6" class="fin-minimap-goal" />`;
    // Wind bekommt hier ein grosses, festes Kompass-Badge auf der Karte statt eines kleinen
    // HUD-Icons - bei voller Karte + Joystick war da oben sonst kaum noch Platz dafuer.
    els.windArrow = els.stage.querySelector("#fin-wind-compass-arrow");
    els.windVal = els.stage.querySelector("#fin-wind-val");

    const m = {
      x: WORLD_START.x, y: WORLD_START.y,
      heading: 0, desiredHeading: 0, throttle: 0,
      events: [], nextSpawnAt: performance.now() + rand(1500, 2500),
      hintsShown: {},
    };

    setupJoystick(
      els.stage.querySelector("#fin-joystick"),
      els.stage.querySelector("#fin-knob"),
      (nx, ny) => {
        const mag = Math.min(1, Math.hypot(nx, ny));
        m.throttle = mag;
        if (mag > 0.08) m.desiredHeading = normalizeAngle(Math.atan2(nx, -ny) * 180 / Math.PI);
      }
    );

    function worldToScreen(wx, wy) {
      return { x: SCREEN_ANCHOR.x + (wx - m.x) * WORLD_SCALE, y: SCREEN_ANCHOR.y + (wy - m.y) * WORLD_SCALE };
    }

    function showBanner(text) {
      bannerEl.textContent = text;
      bannerEl.classList.add("show");
      clearTimeout(showBanner._t);
      showBanner._t = setTimeout(() => bannerEl.classList.remove("show"), 2600);
    }

    state.onTick = (dtRaw, now, effStrength) => {
      if (dtRaw <= 0) return;
      Sfx.setWindStrength(effStrength / 6);
      // dt kappen statt Frame zu verwerfen: verhindert "Teleport" nach Tab-Wechsel/Throttling,
      // ohne die Physik bei größeren Frame-Lücken komplett einfrieren zu lassen.
      const dt = Math.min(dtRaw, 0.15);

      m.heading = lerpAngle(m.heading, m.desiredHeading, Math.min(1, dt * 3.2));
      playerHeading = m.heading;

      const angleToWind = angularDistance(m.heading, state.windAngle);
      const baseFactor = speedFactor(angleToWind);
      const strengthMul = 0.55 + (effStrength / 6) * 0.45;

      const speed = MAX_SPEED * baseFactor * strengthMul * m.throttle;
      const rad = (m.heading * Math.PI) / 180;
      m.x += Math.sin(rad) * speed * dt;
      m.y -= Math.cos(rad) * speed * dt;

      if (m.throttle > 0.1) {
        scores.windUsage.push(baseFactor);
        refreshScoreHud();
      }

      boardEl.setAttribute("transform", `translate(${SCREEN_ANCHOR.x} ${SCREEN_ANCHOR.y}) rotate(${m.heading})`);

      const remaining = Math.hypot(WORLD_GOAL.x - m.x, WORLD_GOAL.y - m.y);
      const progress = clamp01(1 - remaining / TOTAL_DIST);
      els.progressEl.textContent = Math.round(progress * 100) + "%";

      const bearingToGoal = normalizeAngle(Math.atan2(WORLD_GOAL.x - m.x, -(WORLD_GOAL.y - m.y)) * 180 / Math.PI);
      els.goalArrow.style.transform = `rotate(${bearingToGoal}deg)`;
      els.goalVal.textContent = compassDir(bearingToGoal);

      // Kurze, einmalige Hinweise entlang der Strecke statt einer langen Anleitung am Anfang -
      // der Spieler weiß so unterwegs immer, worauf als Nächstes zu achten ist.
      if (progress > 0.12 && !m.hintsShown.p1) {
        m.hintsShown.p1 = true;
        showBanner("🧭 Grüner Pfeil oben zeigt zur Ziel-Boje");
      } else if (progress > 0.5 && !m.hintsShown.p2) {
        m.hintsShown.p2 = true;
        showBanner("⛵ Halbzeit – bei Begegnungen auf Vorfahrt achten");
      } else if (progress > 0.85 && !m.hintsShown.p3) {
        m.hintsShown.p3 = true;
        showBanner("🏁 Gleich geschafft!");
      }

      const mmx = 30 + clamp((m.x / (WORLD_GOAL.x || 1)) * 12, -26, 26);
      const mmy = 55 - clamp((Math.max(0, -m.y) / Math.max(1, -WORLD_GOAL.y)) * 50, 0, 50);
      minimapPlayer.setAttribute("cx", mmx);
      minimapPlayer.setAttribute("cy", mmy);

      updateEvents(m, dt, now, worldEl, worldToScreen, showBanner, effStrength);
      renderWorld(worldEl, m, worldToScreen);

      if (remaining < 30) {
        finishMission(m, now);
      }
    };

    scheduleGustsAndShifts(m);
  }

  // ---------- Wind-Ereignisse (Böe / Winddreher) ----------

  let gustBusy = false;

  function scheduleGustsAndShifts(m) {
    function loop() {
      if (state.stagePhase !== "mission") return;
      const delay = rand(9000, 15000);
      setTimeout(() => {
        if (state.stagePhase !== "mission") return;
        if (gustBusy) { loop(); return; } // laufende Böenserie nicht überlappen
        if (Math.random() < 0.55) {
          // Böen kommen manchmal als kurze Serie von 2-3 Stößen hintereinander (wie eine
          // echte Böenfront), statt immer nur ein isoliertes Einzelereignis zu sein -
          // erfordert kurz anhaltende Aufmerksamkeit statt eines einzelnen Reflexklicks.
          const seriesLen = Math.random() < 0.4 ? 2 + Math.floor(Math.random() * 2) : 1;
          gustBusy = true;
          triggerGust(m, 1, seriesLen);
        } else {
          triggerWindShift();
        }
        loop();
      }, delay);
    }
    loop();
  }

  // Reaktionsfenster statt Schieberegler: bei einer Böe erscheint ein Knopf, der
  // innerhalb von 1,5 Sekunden getroffen werden muss (gleiches Prinzip wie die
  // Böen-Reaktion in Tag 2 und die Reaktionsfragen in Tag 4).
  const GUST_REACT_MS = 1500;

  function triggerGust(m, seriesIndex, seriesLen) {
    const now = performance.now();
    state.gustUntil = now + 4500;
    state.gustBoost = rand(1.2, 2.2);
    Sfx.gustAlert();
    Sfx.vibrate(60);

    const wrap = els.stage.querySelector("#fin-gust-wrap");
    const fill = els.stage.querySelector("#fin-gust-timer-fill");
    const btn = els.stage.querySelector("#fin-gust-btn");
    if (!wrap || !btn) { gustBusy = false; return; }

    btn.textContent = seriesLen > 1 ? `💨 Segel öffnen! (${seriesIndex}/${seriesLen})` : "💨 Segel öffnen!";

    let resolved = false;
    wrap.hidden = false;
    fill.style.transition = "none";
    fill.style.width = "100%";
    requestAnimationFrame(() => {
      fill.style.transition = `width ${GUST_REACT_MS}ms linear`;
      fill.style.width = "0%";
    });

    const timeoutId = setTimeout(() => resolve(false), GUST_REACT_MS);
    function onClick() { resolve(true); }
    btn.addEventListener("click", onClick);

    function resolve(reacted) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      btn.removeEventListener("click", onClick);
      wrap.hidden = true;
      scores.gust.push(reacted ? 1 : 0.25);
      if (reacted) Sfx.success(); else { Sfx.error(); Sfx.vibrate([40, 40, 40]); }
      const banner = els.stage.querySelector("#fin-event-banner");
      if (banner) {
        banner.textContent = reacted ? "✓ Segel rechtzeitig geöffnet!" : "💨 Böe nicht abgefangen!";
        banner.classList.add("show");
        setTimeout(() => banner.classList.remove("show"), 2200);
      }
      if (seriesIndex < seriesLen && state.stagePhase === "mission") {
        setTimeout(() => triggerGust(m, seriesIndex + 1, seriesLen), 550 + Math.random() * 350);
      } else {
        gustBusy = false;
      }
    }
  }

  function triggerWindShift() {
    Sfx.whoosh();
    const delta = (Math.random() < 0.5 ? -1 : 1) * rand(35, 85);
    state.windAngle = normalizeAngle(state.windAngle + delta);
    const banner = els.stage.querySelector("#fin-event-banner");
    if (banner) { banner.textContent = "🧭 Winddreher!"; banner.classList.add("show"); setTimeout(() => banner.classList.remove("show"), 2200); }
  }

  // ---------- Dynamische Objekte (Surfer/Boot/Kiter/Zonen/Material/Person) ----------

  const ZONE_TYPES = ["sperrzone", "flachwasser"];

  function updateEvents(m, dt, now, worldEl, worldToScreen, showBanner) {
    if (now >= m.nextSpawnAt) {
      spawnRandomEvent(m);
      m.nextSpawnAt = now + rand(1500, 2500);
    }

    m.events = m.events.filter((ev) => {
      const age = (now - ev.spawnedAt) / 1000;
      if (age > ev.lifetime) return false;

      if (ev.kind === "npc") {
        ev.x += Math.sin((ev.heading * Math.PI) / 180) * ev.speed * dt;
        ev.y -= Math.cos((ev.heading * Math.PI) / 180) * ev.speed * dt;
        const d = Math.hypot(ev.x - m.x, ev.y - m.y);
        if (!ev.scored && d < 60) {
          ev.scored = true;
          evaluateEncounter(ev, m, showBanner);
        }
        if (!ev.collided && d < 16) {
          ev.collided = true;
          scores.collisions += 1;
          state.penaltyMs += 3000;
          showBanner(`💥 Kollision mit ${ev.label}!`);
        }
      } else if (ev.kind === "zone") {
        const d = Math.hypot(ev.x - m.x, ev.y - m.y);
        if (d < ev.radius && !ev.penalized) {
          ev.penalized = true;
          state.penaltyMs += ev.type === "sperrzone" ? 5000 : 2000;
          scores.collisions += ev.type === "sperrzone" ? 1 : 0.4;
          showBanner(ev.type === "sperrzone" ? "🚫 Sperrzone verletzt!" : "🏖️ Flachwasser berührt");
        }
      } else if (ev.kind === "point") {
        if (ev.drift) { ev.x += ev.drift.x * dt; ev.y += ev.drift.y * dt; }
        const d = Math.hypot(ev.x - m.x, ev.y - m.y);
        if (d < 18 && !ev.collided) {
          ev.collided = true;
          scores.collisions += ev.type === "person" ? 1.5 : 0.6;
          state.penaltyMs += ev.type === "person" ? 4000 : 2000;
          showBanner(ev.type === "person" ? "⚠️ Person zu nah gekommen!" : "🪵 Treibgut touchiert");
        }
      }
      return true;
    });
  }

  function evaluateEncounter(ev, m, showBanner) {
    if (ev.type === "surfer") {
      const myTack = tackOf(m.heading, state.windAngle);
      const theirTack = tackOf(ev.heading, state.windAngle);
      let mustGiveWay = false;
      if (myTack && theirTack && myTack !== theirTack) {
        mustGiveWay = myTack === "port";
      } else if (myTack === theirTack) {
        const windToRad = ((state.windAngle + 180) % 360) * Math.PI / 180;
        const ax = Math.sin(windToRad), ay = -Math.cos(windToRad);
        const myProj = m.x * ax + m.y * ay, theirProj = ev.x * ax + ev.y * ay;
        mustGiveWay = myProj < theirProj;
      }
      if (mustGiveWay) {
        scores.rowViolations += 1;
        state.penaltyMs += 3500;
        showBanner("⚠️ Vorfahrt missachtet (Surfer)!");
      } else {
        showBanner("✓ Vorfahrt korrekt beachtet");
      }
    } else {
      scores.closePasses += 1;
      state.penaltyMs += 1500;
      showBanner(ev.type === "boot" ? "⛵ Zu dicht am Segelboot vorbei" : "🪁 Zu dicht am Kiter vorbei");
    }
  }

  // Windsurfer sind unter den NPCs deutlich in der Mehrheit, da nur sie eine
  // Vorfahrtsituation auslösen (siehe evaluateEncounter) - das Schiff/der Kiter sorgen
  // nur für "nicht zu dicht ran"-Situationen, aber nicht für echte Vorfahrtsregeln.
  function pickNpcType() {
    const roll = Math.random();
    if (roll < 0.55) return "surfer";
    if (roll < 0.8) return "boot";
    return "kiter";
  }

  function spawnRandomEvent(m) {
    const roll = Math.random();
    if (roll < 0.55) spawnNpc(m, pickNpcType());
    else if (roll < 0.75) spawnZone(m, ZONE_TYPES[Math.floor(Math.random() * ZONE_TYPES.length)]);
    else if (roll < 0.9) spawnPoint(m, "material");
    else spawnPoint(m, "person");
  }

  function spawnNpc(m, type) {
    const ang = rand(0, 360);
    const dist = rand(140, 220);
    const sx = m.x + Math.sin((ang * Math.PI) / 180) * dist;
    const sy = m.y - Math.cos((ang * Math.PI) / 180) * dist;
    const aim = { x: m.x + rand(-60, 60), y: m.y + rand(-60, 60) };
    const heading = normalizeAngle(Math.atan2(aim.x - sx, -(aim.y - sy)) * 180 / Math.PI);
    const labels = { surfer: "Windsurfer", boot: "Segelboot", kiter: "Kiter" };
    const baseSpeed = type === "kiter" ? 46 : type === "boot" ? 30 : 34;
    // Manche Begegnungen (~30%) sind 1,75x so schnell wie üblich, egal welcher Typ - man
    // kann sich nicht auf ein gleichbleibendes Tempo verlassen und muss manchmal schnell
    // reagieren statt immer gemütlich Zeit für die Vorfahrtsentscheidung zu haben.
    const isFast = Math.random() < 0.3;
    m.events.push({
      id: uid(), kind: "npc", type, label: labels[type],
      x: sx, y: sy, heading, speed: isFast ? baseSpeed * 1.75 : baseSpeed, fast: isFast,
      spawnedAt: performance.now(), lifetime: 16, scored: false, collided: false,
    });
  }

  function spawnZone(m, type) {
    const ang = rand(-50, 50) + Math.atan2(0 - m.x, -(WORLD_GOAL.y - m.y)) * 180 / Math.PI;
    const dist = rand(90, 160);
    const x = m.x + Math.sin((ang * Math.PI) / 180) * dist;
    const y = m.y - Math.cos((ang * Math.PI) / 180) * dist;
    m.events.push({
      id: uid(), kind: "zone", type, x, y,
      radius: type === "sperrzone" ? 42 : 36,
      spawnedAt: performance.now(), lifetime: 22, penalized: false,
    });
  }

  function spawnPoint(m, type) {
    const ang = rand(0, 360);
    const dist = rand(80, 160);
    const x = m.x + Math.sin((ang * Math.PI) / 180) * dist;
    const y = m.y - Math.cos((ang * Math.PI) / 180) * dist;
    m.events.push({
      id: uid(), kind: "point", type, x, y,
      drift: type === "material" ? { x: rand(-4, 4), y: rand(-4, 4) } : null,
      spawnedAt: performance.now(), lifetime: 20, collided: false,
    });
  }

  function renderWorld(worldEl, m, worldToScreen) {
    const goalS = worldToScreen(WORLD_GOAL.x, WORLD_GOAL.y);
    let html = `<g class="fin-goal" transform="translate(${goalS.x} ${goalS.y})"><circle r="34" class="fin-goal-pulse" /><circle r="22" class="fin-goal-core" /><text y="-32">Ziel</text></g>`;
    m.events.forEach((ev) => {
      const s = worldToScreen(ev.x, ev.y);
      if (s.x < -40 || s.x > SCENE_W + 40 || s.y < -40 || s.y > SCENE_H + 40) return;
      if (ev.kind === "npc") {
        html += `<g class="fin-npc fin-npc-${ev.type}" transform="translate(${s.x} ${s.y}) rotate(${ev.heading})"><polygon points="0,-9 6,7 0,3 -6,7" /></g>`;
      } else if (ev.kind === "zone") {
        html += `<circle class="fin-zone fin-zone-${ev.type}" cx="${s.x}" cy="${s.y}" r="${ev.radius * WORLD_SCALE}" />`;
      } else if (ev.kind === "point") {
        html += `<circle class="fin-point fin-point-${ev.type}" cx="${s.x}" cy="${s.y}" r="7" />`;
      }
    });
    worldEl.innerHTML = html;
  }

  function setupJoystick(baseEl, knobEl, onVector) {
    let active = false, originX = 0, originY = 0, radius = 1;
    function handleMove(e) {
      let dx = e.clientX - originX, dy = e.clientY - originY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, radius);
      const ang = Math.atan2(dy, dx);
      dx = Math.cos(ang) * clamped; dy = Math.sin(ang) * clamped;
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      onVector(dx / radius, dy / radius);
    }
    function end() { if (!active) return; active = false; knobEl.style.transform = "translate(0,0)"; onVector(0, 0); }
    baseEl.addEventListener("pointerdown", (e) => {
      active = true;
      baseEl.setPointerCapture(e.pointerId);
      const rect = baseEl.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top + rect.height / 2;
      radius = rect.width / 2;
      handleMove(e);
    });
    baseEl.addEventListener("pointermove", (e) => { if (active) handleMove(e); });
    baseEl.addEventListener("pointerup", end);
    baseEl.addEventListener("pointercancel", end);
  }

  // ================= Ergebnis =================

  function finishMission(m, now) {
    if (state.stagePhase !== "mission") return;
    state.stagePhase = "result";
    state.onTick = null;
    if (state.rafId) cancelAnimationFrame(state.rafId);

    const totalMs = (now - state.startTimestamp) + state.penaltyMs;
    const parMs = (TOTAL_DIST / (MAX_SPEED * 0.6)) * 1000;
    const timeScore = clamp01(parMs / Math.max(totalMs, 1000));
    const safetyScore = clamp01(1 - scores.collisions * 0.15 - scores.rowViolations * 0.15 - scores.closePasses * 0.08);
    const windUsageScore = scores.windUsage.length ? avg(scores.windUsage) : 0.5;
    const gustScore = scores.gust.length ? avg(scores.gust) : 1;

    // Der Materialcheck ist jetzt eine freitextliche, manuell vom Admin bewertete Antwort
    // (siehe submit_finale_material_answer/admin_grade_finale_answer) und fließt daher
    // nicht in dieses sofort berechnete Ergebnis ein - die Punkte dafür kommen separat
    // dazu, sobald der Admin die Antwort gelesen hat.
    const overall = clamp01(
      windUsageScore * 0.30 +
      timeScore * 0.25 +
      safetyScore * 0.25 +
      gustScore * 0.20
    );

    showResult({ overall, windUsageScore, timeScore, safetyScore, gustScore });
  }

  function rankFor(pct) {
    if (pct >= 90) return "Windsurf-Meister";
    if (pct >= 75) return "Navigator";
    if (pct >= 60) return "Fortgeschritten";
    if (pct >= 40) return "Surfschüler";
    return "Anfänger";
  }

  function showResult(s) {
    Sfx.stopWind();
    const pct = Math.round(s.overall * 100);
    if (pct >= 50) Sfx.success(); else Sfx.click();
    els.stage.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:34px;font-weight:800;color:var(--accent);">${pct}%</div>
        <div class="field-hint" style="margin-top:4px;">Gesamtergebnis der Abschlussmission</div>
        <div class="badge orange" style="margin-top:10px; font-size:13px;">${rankFor(pct)}</div>
        <div style="display:flex; gap:8px; justify-content:center; margin-top:14px; flex-wrap:wrap;">
          <span class="badge gray">Materialcheck: Antwort eingereicht ✓</span>
          <span class="badge gray">Windnutzung: ${Math.round(s.windUsageScore * 100)}%</span>
          <span class="badge gray">Zeit: ${Math.round(s.timeScore * 100)}%</span>
          <span class="badge gray">Sicherheit: ${Math.round(s.safetyScore * 100)}%</span>
          <span class="badge gray">Böen-Reaktion: ${Math.round(s.gustScore * 100)}%</span>
        </div>
        <button class="btn btn-primary btn-block" id="fin-submit-btn" type="button" style="margin-top:18px;">Ergebnis einreichen</button>
      </div>
    `;
    els.stage.querySelector("#fin-submit-btn").addEventListener("click", () => onFinish(s.overall));
  }

  renderMaterialCheck();
}
