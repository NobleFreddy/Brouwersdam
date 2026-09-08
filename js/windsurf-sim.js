// Windsurf-Simulation: eine durchgehende Fahrt in drei nahtlos ineinander übergehenden
// Phasen. Board aufbauen (Drag & Drop) -> Bojen umrunden (Top-Down, Joystick) ->
// Route auf Karte einzeichnen (Board fährt automatisch). Ein permanentes HUD
// (Zeit, Punkte, Wind, Fortschritt) bleibt über alle Phasen sichtbar.
// Ergebnis (0..1) geht am Ende an onFinish -> submit_minigame_result.

function renderWindsurfSim(container, dayTitle, onFinish) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SCENE_W = 320, SCENE_H = 420;
  const MAX_SPEED = 130; // px/s bei optimalem Winkel + vollem Zug

  const normalizeAngle = (a) => ((a % 360) + 360) % 360;
  const normalizeSigned = (a) => { const x = normalizeAngle(a); return x > 180 ? x - 360 : x; };
  const angularDistance = (a, b) => Math.abs(normalizeSigned(a - b));
  const lerpAngle = (a, b, t) => normalizeAngle(a + normalizeSigned(b - a) * t);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const COMPASS_DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const compassDir = (deg) => COMPASS_DIRS[Math.round(normalizeAngle(deg) / 45) % 8];
  const escapeHtml = (str) => { const d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; };

  function speedFactor(angleToWind) {
    // Kein hartes Verbot, sondern eine durchgehende Kurve: je enger am Wind, desto
    // langsamer - direkt gegen den Wind (0°) kommt man kaum vom Fleck. Senkrecht zum
    // Wind (90°) ist die Geschwindigkeit maximal, danach Richtung Vorwind (180°) wieder
    // etwas langsamer (weniger scheinbarer Wind). So bleibt Kreuzen im Zickzack die
    // einzig sinnvolle Strategie, ohne das Zeichnen selbst einzuschränken.
    if (angleToWind <= 90) return 0.03 + (angleToWind / 90) * 0.97;
    return 1.0 - (clamp01((angleToWind - 90) / 90)) * 0.35;
  }

  const state = {
    phase: 0, // 0=intro
    startTimestamp: null,
    penaltyMs: 0,
    rafId: null,
    windStart: Math.random() * 360,
    windSpeed: (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 2.5),
    windAngle: 0,
    windStrength: 1 + Math.floor(Math.random() * 5), // 1..5, bleibt für die Fahrt konstant
    windLocked: false,
    mistakes1: 0,
    s1: null, s2: null, s3: null,
    onTick: null,
    lastTick: null,
  };
  const windStrengthMul = () => 0.6 + (state.windStrength / 5) * 0.4;

  const els = {};

  function mount() {
    container.innerHTML = `
      <div class="ws-hud" id="ws-hud" hidden>
        <div class="ws-hud-item"><span class="ws-hud-label">Zeit</span><span class="ws-hud-val" id="ws-hud-time">0:00</span></div>
        <div class="ws-hud-item"><span class="ws-hud-label">Punkte</span><span class="ws-hud-val accent" id="ws-hud-score">–</span></div>
        <div class="ws-hud-item">
          <span class="ws-hud-label">Wind</span>
          <span class="ws-hud-wind-row">
            <svg class="ws-wind-arrow" id="ws-hud-arrow" viewBox="0 0 24 24"><path d="M12 2 L17 14 L12 10.5 L7 14 Z"/></svg>
            <span class="ws-hud-val" id="ws-hud-wind">–</span>
          </span>
        </div>
        <div class="ws-hud-item"><span class="ws-hud-label">Stärke</span><span class="ws-hud-val" id="ws-hud-strength">–</span></div>
        <div class="ws-hud-item">
          <span class="ws-hud-label">Phase</span>
          <div class="ws-hud-progress"><i class="ws-seg" data-p="1"></i><i class="ws-seg" data-p="2"></i><i class="ws-seg" data-p="3"></i></div>
        </div>
      </div>
      <div class="ws-stage" id="ws-stage"></div>
    `;
    els.hud = container.querySelector("#ws-hud");
    els.hudTime = container.querySelector("#ws-hud-time");
    els.hudScore = container.querySelector("#ws-hud-score");
    els.hudWind = container.querySelector("#ws-hud-wind");
    els.hudArrow = container.querySelector("#ws-hud-arrow");
    els.hudStrength = container.querySelector("#ws-hud-strength");
    els.segs = Array.from(container.querySelectorAll(".ws-seg"));
    els.stage = container.querySelector("#ws-stage");
    els.hudStrength.textContent = state.windStrength + "/5";
    renderIntro();
  }

  function renderIntro() {
    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>${escapeHtml(dayTitle || "Windsurf-Simulation")}</h3>
        <p>Eine durchgehende Fahrt in drei Schritten: Board aufbauen, Bojen umrunden, Route zum Ziel einzeichnen.
        Der Wind dreht während der ganzen Fahrt weiter. Fehler beim Aufbau kosten Zeit.</p>
      </div>
      <button class="btn btn-primary btn-block" id="ws-start-btn" type="button">Simulation starten</button>
    `;
    els.stage.querySelector("#ws-start-btn").addEventListener("click", start);
  }

  function start() {
    els.hud.hidden = false;
    state.startTimestamp = performance.now();
    state.rafId = requestAnimationFrame(mainTick);
    Sfx.startWind(state.windStrength / 5);
    goToPhase(1);
  }

  function mainTick(now) {
    const elapsedMs = (now - state.startTimestamp) + state.penaltyMs;
    els.hudTime.textContent = formatMMSS(elapsedMs);

    if (!state.windLocked) {
      state.windAngle = normalizeAngle(state.windStart + state.windSpeed * (elapsedMs / 1000));
    }
    els.hudWind.textContent = compassDir(state.windAngle);
    els.hudArrow.style.transform = `rotate(${state.windAngle}deg)`;

    const dt = state.lastTick ? (now - state.lastTick) / 1000 : 0;
    state.lastTick = now;
    if (state.onTick) state.onTick(dt, now);

    state.rafId = requestAnimationFrame(mainTick);
  }

  function formatMMSS(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function refreshHudScore() {
    const parts = [];
    if (state.s1 != null) parts.push([state.s1, 0.25]);
    if (state.s2 != null) parts.push([state.s2, 0.35]);
    if (state.s3 != null) parts.push([state.s3, 0.40]);
    if (!parts.length) { els.hudScore.textContent = "–"; return null; }
    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    const val = parts.reduce((a, [s, w]) => a + s * w, 0) / wsum;
    els.hudScore.textContent = Math.round(val * 100) + "%";
    return val;
  }

  function updateProgress(phaseNum) {
    els.segs.forEach((seg) => {
      const p = Number(seg.dataset.p);
      seg.className = "ws-seg" + (p < phaseNum ? " done" : p === phaseNum ? " active" : "");
    });
  }

  function goToPhase(n) {
    state.onTick = null;
    state.phase = n;
    updateProgress(n);
    if (n === 1) renderPhase1();
    else if (n === 2) renderPhase2();
    else if (n === 3) renderPhase3();
  }

  function transitionTo(n) {
    els.stage.classList.add("ws-fade-out");
    setTimeout(() => {
      els.stage.classList.remove("ws-fade-out");
      goToPhase(n);
    }, 260);
  }

  // ---------------- Phase 1: Board aufbauen ----------------

  const P1_W = 360, P1_H = 420;
  // Bewusst keine Text-Labels/Leitlinien auf dem Board - der Tray unten zeigt Name+Symbol,
  // auf dem Board selbst muss man die Teile am Aussehen/an der Position erkennen.
  const PARTS = [
    { key: "segel", label: "Segel", color: "var(--accent)", markerX: 230, markerY: 120 },
    { key: "gabelbaum", label: "Gabelbaum", color: "#60a5fa", markerX: 230, markerY: 190 },
    { key: "mast", label: "Mast", color: "#9aa8bd", markerX: 175, markerY: 155 },
    { key: "verlaengerung", label: "Verlängerung", color: "#7c8aa3", markerX: 175, markerY: 290 },
    { key: "mastfuss", label: "Mastfuß", color: "#64748b", markerX: 175, markerY: 314 },
    { key: "finne", label: "Finne", color: "var(--success)", markerX: 305, markerY: 360 },
  ];

  function trayIconSvg(key, color) {
    switch (key) {
      case "segel": return `<svg viewBox="0 0 28 28"><path d="M14 3 L22 24 L14 20 L6 24 Z" fill="${color}"/></svg>`;
      case "gabelbaum": return `<svg viewBox="0 0 28 28"><ellipse cx="14" cy="14" rx="10" ry="6" fill="none" stroke="${color}" stroke-width="3"/></svg>`;
      case "mast": return `<svg viewBox="0 0 28 28"><rect x="12" y="2" width="4" height="24" rx="2" fill="${color}"/></svg>`;
      case "verlaengerung": return `<svg viewBox="0 0 28 28"><rect x="12" y="7" width="4" height="15" rx="2" fill="${color}"/></svg>`;
      case "mastfuss": return `<svg viewBox="0 0 28 28"><circle cx="14" cy="16" r="6" fill="${color}"/></svg>`;
      case "finne": return `<svg viewBox="0 0 28 28"><path d="M14 5 L20 24 L8 24 Z" fill="${color}"/></svg>`;
      default: return "";
    }
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function boardIllustrationSvg() {
    return `
      <svg class="ws1-illustration" viewBox="0 0 ${P1_W} ${P1_H}" id="ws1-svg" xmlns="${SVG_NS}">
        <line x1="15" y1="345" x2="345" y2="345" class="ws1-water" />

        <path class="ws1-board" d="M 55,330 C 55,320 72,312 95,312 L 300,312 C 316,312 328,321 328,330 C 328,339 316,348 300,348 L 95,348 C 72,348 55,340 55,330 Z" />

        <g class="ws1-part" id="ws1-part-finne">
          <path d="M 296,348 L 316,370 L 300,370 Z" fill="var(--success)" />
        </g>

        <g class="ws1-part" id="ws1-part-mastfuss">
          <ellipse cx="175" cy="313" rx="9" ry="5" fill="#64748b" />
        </g>
        <g class="ws1-part" id="ws1-part-verlaengerung">
          <rect x="171" y="270" width="8" height="44" rx="3" fill="#7c8aa3" />
        </g>
        <g class="ws1-part" id="ws1-part-mast">
          <rect x="172" y="50" width="6" height="222" rx="3" fill="#9aa8bd" />
        </g>
        <g class="ws1-part" id="ws1-part-gabelbaum">
          <path d="M 175,175 C 225,178 258,187 258,190 C 258,193 225,202 175,205" fill="none" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" />
        </g>
        <g class="ws1-part" id="ws1-part-segel">
          <path d="M 175,53 C 238,62 272,110 265,163 C 262,193 236,213 175,220 Z" fill="var(--accent)" />
          <path d="M 180,90 C 220,95 245,115 250,135" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="2" />
          <path d="M 178,150 C 215,155 240,168 248,180" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="2" />
        </g>

        ${PARTS.map((p) => `
          <g class="ws1-marker" data-key="${p.key}" transform="translate(${p.markerX} ${p.markerY})">
            <circle r="15" class="ws1-marker-hit" />
            <circle r="6" class="ws1-marker-dot" />
            <path class="ws1-marker-check" d="M -4,0 L -1,3.5 L 5,-4" />
          </g>
        `).join("")}
      </svg>
    `;
  }

  function renderPhase1() {
    const trayParts = shuffled(PARTS);
    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>Phase 1 · Board aufbauen</h3>
        <p>Ziehe jedes Teil an seine Stelle auf dem Board.</p>
      </div>
      ${boardIllustrationSvg()}
      <div class="ws-tray" id="ws-tray">
        ${trayParts.map((p) => `
          <div class="ws-chip" data-key="${p.key}" style="--chip-color:${p.color}">
            ${trayIconSvg(p.key, p.color)}
            <span>${p.label}</span>
          </div>
        `).join("")}
      </div>
    `;
    setupPhase1DragDrop();
  }

  function setupPhase1DragDrop() {
    const root = els.stage;
    const markers = Array.from(root.querySelectorAll(".ws1-marker"));
    let placed = 0;

    function resetChip(chip) {
      chip.style.position = "";
      chip.style.left = "";
      chip.style.top = "";
      chip.style.width = "";
      chip.style.zIndex = "";
      chip.style.pointerEvents = "";
      chip.classList.remove("dragging");
    }

    root.querySelectorAll(".ws-chip").forEach((chip) => {
      chip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        chip.setPointerCapture(e.pointerId);
        const rect = chip.getBoundingClientRect();
        const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
        chip.style.width = rect.width + "px";
        chip.style.position = "fixed";
        chip.style.left = rect.left + "px";
        chip.style.top = rect.top + "px";
        chip.style.zIndex = "999";
        chip.style.pointerEvents = "none";
        chip.classList.add("dragging");

        function onMove(ev) {
          chip.style.left = (ev.clientX - offX) + "px";
          chip.style.top = (ev.clientY - offY) + "px";
          markers.forEach((m) => m.classList.remove("hover"));
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          const marker = under && under.closest(".ws1-marker");
          if (marker && !marker.classList.contains("placed")) marker.classList.add("hover");
        }

        function onUp(ev) {
          chip.removeEventListener("pointermove", onMove);
          chip.removeEventListener("pointerup", onUp);
          chip.removeEventListener("pointercancel", onUp);
          markers.forEach((m) => m.classList.remove("hover"));
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          const marker = under && under.closest(".ws1-marker");

          if (marker && !marker.classList.contains("placed")) {
            if (marker.dataset.key === chip.dataset.key) {
              Sfx.click();
              marker.classList.add("placed");
              const partGroup = root.querySelector(`#ws1-part-${chip.dataset.key}`);
              if (partGroup) partGroup.classList.add("placed");
              chip.remove();
              placed += 1;
              if (placed === PARTS.length) finishPhase1();
              return;
            }
            Sfx.error();
            Sfx.vibrate(50);
            state.mistakes1 += 1;
            state.penaltyMs += 3000;
            marker.classList.add("shake");
            setTimeout(() => marker.classList.remove("shake"), 400);
          }
          resetChip(chip);
        }

        chip.addEventListener("pointermove", onMove);
        chip.addEventListener("pointerup", onUp);
        chip.addEventListener("pointercancel", onUp);
      });
    });
  }

  function finishPhase1() {
    state.s1 = clamp01(1 - state.mistakes1 * 0.12);
    refreshHudScore();
    transitionTo(2);
  }

  // Gemeinsamer Wasser-/Strand-Hintergrund für Phase 2 und 3 - Gradient + feine
  // Wellenlinien-Textur statt einer platten Einheitsfarbe, plus ein Sandstreifen am
  // unteren Rand, da beide Szenen in Ufernähe starten (Boardstart bzw. Start-Punkt).
  function waterSvgDefs() {
    return `
      <linearGradient id="ws-water-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0f3d61" />
        <stop offset="100%" stop-color="#0a2740" />
      </linearGradient>
      <pattern id="ws-water-lines" width="46" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
        <path d="M0 13 Q 11.5 7 23 13 T 46 13" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.4" />
      </pattern>
    `;
  }
  function waterBackgroundSvg(w, h) {
    return `
      <rect x="0" y="0" width="${w}" height="${h}" fill="url(#ws-water-grad)" />
      <rect x="0" y="0" width="${w}" height="${h}" fill="url(#ws-water-lines)" />
    `;
  }
  function beachEdgeSvg(w, h) {
    return `
      <path d="M0,${h} L0,${h - 34} Q ${(w * 0.22).toFixed(0)},${h - 52} ${(w * 0.48).toFixed(0)},${h - 30} T ${w},${h - 36} L${w},${h} Z" fill="#b89a68" opacity="0.9" />
      <path d="M0,${h} L0,${h - 20} Q ${(w * 0.22).toFixed(0)},${h - 34} ${(w * 0.48).toFixed(0)},${h - 16} T ${w},${h - 20} L${w},${h} Z" fill="#dcc590" />
    `;
  }
  // Kleine Bojen-Punkte am Rand einer Sperrzone statt einer platten Schraffur - wirkt
  // wie eine echte, mit Bojen markierte Absperrung statt wie eine reine Spielmarkierung.
  function buoyRingSvg(e, count) {
    const n = count || 10;
    let out = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = (e.cx + Math.cos(a) * e.rx).toFixed(1);
      const y = (e.cy + Math.sin(a) * e.ry).toFixed(1);
      out += `<circle cx="${x}" cy="${y}" r="3" class="ws-sperr-buoy" />`;
    }
    return out;
  }

  // ---------------- Phase 2: Bojen umrunden ----------------

  function renderPhase2() {
    const boardStart = { x: SCENE_W / 2, y: SCENE_H - 30 };
    const buoys = genBuoys(3, boardStart);
    const guidePoints = [boardStart, ...buoys].map((p) => `${p.x},${p.y}`).join(" ");

    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>Phase 2 · Bojen umrunden</h3>
        <p>Halte den Steuerknüppel gedrückt, um Fahrt aufzunehmen. Rund alle Bojen in Reihenfolge.
        Direkt gegen den Wind kommst du kaum vom Fleck – kreuze in einem Winkel dazu. Quer zum Wind bist du am schnellsten.</p>
      </div>
      <svg class="ws-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}" id="ws2-svg">
        <defs>${waterSvgDefs()}</defs>
        ${waterBackgroundSvg(SCENE_W, SCENE_H)}
        ${beachEdgeSvg(SCENE_W, SCENE_H)}
        <polyline points="${guidePoints}" class="ws-guide" />
        <g id="ws2-buoys"></g>
        <g id="ws2-board" class="ws-board" transform="translate(${boardStart.x} ${boardStart.y})">
          <polygon points="0,-11 7,9 0,4 -7,9" />
        </g>
        <g class="ws2-windbox" transform="translate(40 40)">
          <circle r="28" />
          <g id="ws2-wind-arrow"><path d="M0,-17 L6,2 L0,-3.5 L-6,2 Z" /></g>
        </g>
        <text x="40" y="80" class="ws-zone-label" id="ws2-wind-label" style="fill:var(--text-muted);">Wind</text>
      </svg>
      <div class="ws-joystick" id="ws2-joystick"><div class="ws-joystick-knob" id="ws2-knob"></div></div>
    `;

    const windArrowEl = els.stage.querySelector("#ws2-wind-arrow");
    const windLabelEl = els.stage.querySelector("#ws2-wind-label");

    const buoyLayer = els.stage.querySelector("#ws2-buoys");
    buoys.forEach((b, i) => {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "ws-buoy");
      g.setAttribute("transform", `translate(${b.x} ${b.y})`);
      g.innerHTML = `<circle r="14"/><text y="5">${i + 1}</text>`;
      buoyLayer.appendChild(g);
      b.el = g;
    });

    const p2 = {
      boardX: boardStart.x, boardY: boardStart.y,
      heading: 0, desiredHeading: 0, throttle: 0,
      buoyIndex: 0, startedAt: performance.now(),
      totalGuideLen: 0,
    };
    let prev = boardStart;
    [...buoys].forEach((b) => { p2.totalGuideLen += Math.hypot(b.x - prev.x, b.y - prev.y); prev = b; });

    const boardEl = els.stage.querySelector("#ws2-board");

    setupJoystick(
      els.stage.querySelector("#ws2-joystick"),
      els.stage.querySelector("#ws2-knob"),
      (nx, ny) => {
        const mag = Math.min(1, Math.hypot(nx, ny));
        p2.throttle = mag;
        if (mag > 0.08) p2.desiredHeading = normalizeAngle(Math.atan2(nx, -ny) * 180 / Math.PI);
      }
    );

    state.onTick = (dt) => {
      if (dt <= 0) return;
      windArrowEl.setAttribute("transform", `rotate(${state.windAngle})`);
      windLabelEl.textContent = `Wind: ${compassDir(state.windAngle)}`;

      p2.heading = lerpAngle(p2.heading, p2.desiredHeading, Math.min(1, dt * 4));
      const angleToWind = angularDistance(p2.heading, state.windAngle);
      const speed = MAX_SPEED * speedFactor(angleToWind) * windStrengthMul() * p2.throttle;
      const rad = (p2.heading * Math.PI) / 180;
      p2.boardX = clamp(p2.boardX + Math.sin(rad) * speed * dt, 10, SCENE_W - 10);
      p2.boardY = clamp(p2.boardY - Math.cos(rad) * speed * dt, 10, SCENE_H - 10);
      boardEl.setAttribute("transform", `translate(${p2.boardX} ${p2.boardY}) rotate(${p2.heading})`);

      const target = buoys[p2.buoyIndex];
      if (target) {
        const d = Math.hypot(p2.boardX - target.x, p2.boardY - target.y);
        if (d < 18) {
          Sfx.success();
          Sfx.vibrate(40);
          target.el.classList.add("done");
          p2.buoyIndex += 1;
          if (p2.buoyIndex >= buoys.length) {
            const actual = (performance.now() - p2.startedAt) / 1000;
            const parTime = p2.totalGuideLen / (MAX_SPEED * windStrengthMul() * 0.55);
            state.s2 = clamp01(parTime / Math.max(actual, 0.5));
            refreshHudScore();
            transitionTo(3);
          }
        }
      }
    };
  }

  function genBuoys(n, start) {
    const pts = [];
    let tries = 0;
    while (pts.length < n && tries < 300) {
      tries += 1;
      const p = { x: 40 + Math.random() * (SCENE_W - 80), y: 55 + Math.random() * (SCENE_H - 170), done: false };
      const okSpacing = pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 75);
      const okStart = Math.hypot(p.x - start.x, p.y - start.y) > 90;
      if (okSpacing && okStart) pts.push(p);
    }
    return pts;
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
    function end() {
      if (!active) return;
      active = false;
      knobEl.style.transform = "translate(0,0)";
      onVector(0, 0);
    }

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

  // ---------------- Phase 3: Route planen ----------------

  const START_PT = { x: 55, y: 385 };
  const ZIEL_PT = { x: 265, y: 55 };
  const SPERR = { cx: 168, cy: 215, rx: 52, ry: 68 };
  const FLACH = { cx: 248, cy: 320, rx: 42, ry: 32 };

  function inEllipse(x, y, e) {
    return ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;
  }

  function renderPhase3() {
    state.windLocked = true; // Wind steht für die ganze Routenplanung fest
    const frozenWind = state.windAngle;

    els.stage.innerHTML = `
      <div class="ws-heading">
        <h3>Phase 3 · Route planen</h3>
        <p>Zeichne mit dem Finger eine Route von Start zum Ziel. Meide die Sperrzone.
        Der Wind steht fest – direkt dagegen kommst du kaum vom Fleck, quer zum Wind bist du am schnellsten. Plane deine Route klug, um den Wind optimal zu nutzen.</p>
      </div>
      <svg class="ws-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}" id="ws3-svg">
        <defs>
          ${waterSvgDefs()}
          <radialGradient id="ws-flach-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#d9c27a" stop-opacity="0.6" />
            <stop offset="65%" stop-color="#d9c27a" stop-opacity="0.24" />
            <stop offset="100%" stop-color="#d9c27a" stop-opacity="0" />
          </radialGradient>
        </defs>
        ${waterBackgroundSvg(SCENE_W, SCENE_H)}
        ${beachEdgeSvg(SCENE_W, SCENE_H)}
        <ellipse cx="${FLACH.cx}" cy="${FLACH.cy}" rx="${FLACH.rx}" ry="${FLACH.ry}" fill="url(#ws-flach-grad)" />
        <text x="${FLACH.cx}" y="${FLACH.cy}" class="ws-zone-label">Flachwasser</text>
        <ellipse cx="${SPERR.cx}" cy="${SPERR.cy}" rx="${SPERR.rx}" ry="${SPERR.ry}" class="ws-zone sperr" />
        ${buoyRingSvg(SPERR)}
        <text x="${SPERR.cx}" y="${SPERR.cy}" class="ws-zone-label">Sperrzone</text>
        <polyline id="ws3-path" class="ws-route-path" points="" />
        <g class="ws-marker start" transform="translate(${START_PT.x} ${START_PT.y})"><circle r="9" /><text y="-14">Start</text></g>
        <g class="ws-marker ziel" transform="translate(${ZIEL_PT.x} ${ZIEL_PT.y})"><circle r="9" /><text y="-14">Ziel</text></g>
        <g id="ws3-board" class="ws-board" transform="translate(${START_PT.x} ${START_PT.y})" hidden>
          <polygon points="0,-11 7,9 0,4 -7,9" />
        </g>
        <g class="ws3-windbox" transform="translate(38 38)">
          <circle r="26" />
          <g transform="rotate(${frozenWind})"><path d="M0,-16 L6,2 L0,-3.5 L-6,2 Z" /></g>
        </g>
        <text x="38" y="75" class="ws-zone-label" style="fill:var(--text-muted);">Wind: fest · ${compassDir(frozenWind)}</text>
      </svg>
      <div class="ws-phase3-actions">
        <button class="btn btn-ghost btn-sm" id="ws3-clear" type="button">Route löschen</button>
        <button class="btn btn-primary btn-block" id="ws3-go" type="button" disabled>Los!</button>
      </div>
    `;

    const svg = els.stage.querySelector("#ws3-svg");
    const pathEl = els.stage.querySelector("#ws3-path");
    const goBtn = els.stage.querySelector("#ws3-go");
    const clearBtn = els.stage.querySelector("#ws3-clear");
    let points = [];
    let drawing = false;
    let locked = false;

    function svgPoint(cx, cy) {
      const rect = svg.getBoundingClientRect();
      return { x: (cx - rect.left) / rect.width * SCENE_W, y: (cy - rect.top) / rect.height * SCENE_H };
    }
    function updatePath() {
      pathEl.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    }
    function addPoint(e) {
      const last = points[points.length - 1];
      if (!last) return;
      const pt = svgPoint(e.clientX, e.clientY);
      if (Math.hypot(pt.x - last.x, pt.y - last.y) > 6) {
        points.push(pt);
        updatePath();
        goBtn.disabled = points.length < 2;
      }
    }

    svg.addEventListener("pointerdown", (e) => {
      if (locked) return;
      drawing = true;
      svg.setPointerCapture(e.pointerId);
      points = [{ x: START_PT.x, y: START_PT.y }];
      updatePath();
      addPoint(e);
    });
    svg.addEventListener("pointermove", (e) => { if (drawing) addPoint(e); });
    svg.addEventListener("pointerup", () => { drawing = false; });
    svg.addEventListener("pointercancel", () => { drawing = false; });

    clearBtn.addEventListener("click", () => {
      if (locked) return;
      points = [];
      updatePath();
      goBtn.disabled = true;
    });

    goBtn.addEventListener("click", () => {
      if (locked || points.length < 2) return;
      locked = true;
      goBtn.disabled = true;
      clearBtn.disabled = true;
      Sfx.whoosh();
      const last = points[points.length - 1];
      if (Math.hypot(last.x - ZIEL_PT.x, last.y - ZIEL_PT.y) > 4) points.push({ x: ZIEL_PT.x, y: ZIEL_PT.y });
      runPhase3Animation(points, state.windAngle);
    });
  }

  function runPhase3Animation(points, windAngleAtGo) {
    const boardEl = els.stage.querySelector("#ws3-board");
    boardEl.hidden = false;

    // Segelzeit wird pro Abschnitt einzeln berechnet (abhängig vom Winkel zum Wind),
    // nicht nur summiert - die Animation läuft weiter unten mit genau diesem Tempo pro
    // Abschnitt, damit ein Kurs gegen den Wind sichtbar zäh wird statt nur die
    // Gesamtwertung zu drücken.
    const segSailTimes = [];
    let totalLen = 0;
    let sailTime = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      totalLen += l;
      const heading = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
      const sf = speedFactor(angularDistance(heading, windAngleAtGo));
      const segTime = l / (MAX_SPEED * sf * windStrengthMul());
      segSailTimes.push(segTime);
      sailTime += segTime;
    }

    const straight = Math.hypot(ZIEL_PT.x - START_PT.x, ZIEL_PT.y - START_PT.y);
    const efficiency = clamp01(straight / Math.max(straight, totalLen));
    const parTime = straight / (MAX_SPEED * windStrengthMul() * 0.75);
    const timeScore = clamp01(parTime / Math.max(sailTime, 0.3));

    let sampleTotal = 0, inSperr = 0, inFlach = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.round(l / 4));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        sampleTotal += 1;
        if (inEllipse(x, y, SPERR)) inSperr += 1;
        if (inEllipse(x, y, FLACH)) inFlach += 1;
      }
    }
    const fracSperr = sampleTotal ? inSperr / sampleTotal : 0;
    const fracFlach = sampleTotal ? inFlach / sampleTotal : 0;
    const safety = clamp01(1 - fracSperr * 4 - fracFlach * 1.2);

    const score3 = clamp01(safety * 0.4 + efficiency * 0.3 + timeScore * 0.3);

    // Die Gesamtdauer ist an die berechnete Segelzeit gekoppelt (gedeckelt, damit es nicht
    // ewig dauert), aber innerhalb der Animation bekommt jeder Abschnitt seinen Anteil an
    // dieser Zeit proportional zu seiner EIGENEN Segelzeit statt zu seiner Länge - ein
    // kurzer Abschnitt gegen den Wind frisst so einen großen Teil der Animationszeit und
    // das Brett kriecht dort sichtbar, während es quer zum Wind zügig durchzieht.
    const playbackMs = clamp(sailTime * 380, 1800, 7000);
    const timeScale = playbackMs / Math.max(sailTime, 0.01);
    const animStart = performance.now();
    function animFrame(now) {
      const elapsedMs = now - animStart;
      const sailTimeSoFar = Math.min(sailTime, elapsedMs / timeScale);
      let acc = 0, segIndex = 0;
      while (segIndex < segSailTimes.length - 1 && acc + segSailTimes[segIndex] < sailTimeSoFar) {
        acc += segSailTimes[segIndex];
        segIndex += 1;
      }
      const a = points[segIndex], b = points[segIndex + 1] || a;
      const segTime = segSailTimes[segIndex] || 1;
      const localT = segTime ? clamp01((sailTimeSoFar - acc) / segTime) : 1;
      const x = a.x + (b.x - a.x) * localT, y = a.y + (b.y - a.y) * localT;
      const heading = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
      boardEl.setAttribute("transform", `translate(${x} ${y}) rotate(${heading})`);

      if (elapsedMs < playbackMs) {
        requestAnimationFrame(animFrame);
      } else {
        state.s3 = score3;
        refreshHudScore();
        setTimeout(showResult, 400);
      }
    }
    requestAnimationFrame(animFrame);
  }

  // ---------------- Ergebnis ----------------

  function showResult() {
    state.onTick = null;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    Sfx.stopWind();
    updateProgress(4);
    const overall = refreshHudScore() || 0;
    const pct = Math.round(overall * 100);
    if (pct >= 50) Sfx.success(); else Sfx.click();

    els.stage.classList.add("ws-fade-out");
    setTimeout(() => {
      els.stage.classList.remove("ws-fade-out");
      els.stage.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:34px;font-weight:800;color:var(--accent);">${pct}%</div>
          <div class="field-hint" style="margin-top:4px;">Gesamtergebnis der Fahrt</div>
          <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
            <span class="badge gray">Aufbau: ${Math.round((state.s1 || 0) * 100)}%</span>
            <span class="badge gray">Bojen-Kurs: ${Math.round((state.s2 || 0) * 100)}%</span>
            <span class="badge gray">Routenplanung: ${Math.round((state.s3 || 0) * 100)}%</span>
          </div>
          <button class="btn btn-primary btn-block" id="ws-submit-btn" type="button" style="margin-top:16px;">Ergebnis einreichen</button>
        </div>
      `;
      els.stage.querySelector("#ws-submit-btn").addEventListener("click", () => onFinish(overall));
    }, 260);
  }

  mount();
}
