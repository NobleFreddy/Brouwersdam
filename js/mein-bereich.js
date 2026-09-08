let currentState = null;
let countdownTimer = null;

async function loadState() {
  const session = SessionStore.get();
  if (!session || !session.token) {
    window.location.href = "index.html";
    return;
  }
  if (!requireConfigOrWarn()) {
    renderApp(null);
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_my_state", { p_token: session.token });
  if (error) {
    if (/Sitzung/.test(error.message)) {
      SessionStore.clear();
      window.location.href = "index.html";
      return;
    }
    showToast(friendlyError(error), "error");
    return;
  }
  currentState = data;
  renderApp(data);
}

function renderApp(state) {
  const app = document.getElementById("app");
  if (!state) {
    app.innerHTML = `<div class="empty-state">Konnte Spielstand nicht laden.</div>`;
    return;
  }

  const solvedCount = state.days.filter(d => d.solvedAt).length;
  const total = state.days.length;

  app.innerHTML = `
    <section class="section">
      <div class="card stat-card fade-in">
        <div>
          <div class="eyebrow">Mein Bereich</div>
          <h1 style="font-size:26px; margin-top:6px;">${escapeHtml(state.name)}</h1>
          <div class="field-hint" style="margin-top:6px;">${solvedCount} von ${total} Tagen gelöst · Platz ${state.rank}</div>
          <div class="progress-track" style="max-width:280px;">
            <div class="progress-fill" style="width:${(solvedCount / total) * 100}%;"></div>
          </div>
        </div>
        <div class="stat-points">
          ${state.points}
          <span class="label">Punkte</span>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0;">
      <h2 style="font-size:19px;">Deine fünf Tage</h2>
      <p class="section-lead">Jeder Tag bleibt verschwommen, bis du den vierstelligen Code vom Sticker eingegeben hast.</p>
      <div class="day-grid" id="day-grid"></div>
    </section>

    <section class="section" style="padding-top:0;">
      <h2 style="font-size:19px;">Rangliste</h2>
      <div class="card" style="margin-top:14px;" id="mini-leaderboard">
        <div class="empty-state">Lädt …</div>
      </div>
      <div style="margin-top:12px;">
        <a href="rangliste.html" class="btn btn-ghost btn-sm">Ganze Rangliste →</a>
      </div>
    </section>

    <section class="section" style="padding-top:0;">
      <button class="btn btn-ghost" id="logout-btn" type="button">Abmelden</button>
    </section>
  `;

  const grid = document.getElementById("day-grid");
  state.days.forEach(day => grid.appendChild(renderDayCard(day)));

  document.getElementById("logout-btn").addEventListener("click", () => {
    SessionStore.clear();
    window.location.href = "index.html";
  });

  loadMiniLeaderboard(state.name);
  startCountdowns();
}

function renderDayCard(day) {
  const el = document.createElement("div");
  const locked = !day.unlockedAt;
  const solved = !!day.solvedAt;
  el.className = "day-card fade-in" + (solved ? " is-solved" : locked ? "" : " is-unlocked");

  const notYetOpen = day.opensAt && new Date(day.opensAt) > new Date();

  let lockIconHtml;
  if (solved) lockIconHtml = `<div class="lock-icon done">✓</div>`;
  else if (locked) lockIconHtml = `<div class="lock-icon">🔒</div>`;
  else lockIconHtml = `<div class="lock-icon open">✎</div>`;

  el.innerHTML = `
    <div class="day-card-top">
      <h3>Tag ${day.sortOrder}</h3>
      ${lockIconHtml}
    </div>
    <div class="day-card-body ${locked ? "blurred" : ""}">
      <strong>${escapeHtml(day.title)}</strong>
      <p style="margin-top:4px;">${escapeHtml(day.teaser)}</p>
    </div>
  `;

  if (locked) {
    if (notYetOpen) {
      el.innerHTML += `<div class="countdown" data-opens-at="${day.opensAt}">Öffnet ${formatDate(day.opensAt)}</div>`;
    } else {
      const form = document.createElement("form");
      form.className = "unlock-form";
      form.innerHTML = `
        <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="0000" aria-label="Sticker-Code" />
        <button type="submit" class="btn btn-primary btn-sm">Freischalten</button>
      `;
      form.addEventListener("submit", (e) => onUnlockSubmit(e, day.id, form));
      el.appendChild(form);
    }
  } else if (solved) {
    el.innerHTML += `
      <div class="solved-banner">🎉 Gelöst · +${day.pointsAwarded} Punkte</div>
    `;
  } else {
    const box = document.createElement("div");
    box.className = "puzzle-box";
    box.appendChild(renderPuzzle(day));
    el.appendChild(box);
  }

  return el;
}

function renderPuzzle(day) {
  const wrap = document.createElement("div");

  if (day.puzzleType === "minigame") {
    wrap.innerHTML = `
      <p class="puzzle-question">Bereit für das Segeltrimm-Minigame? 30 Sekunden, volle Konzentration.</p>
      <a class="btn btn-primary btn-block" href="minigame.html?day=${day.id}">Minigame starten</a>
    `;
    return wrap;
  }

  if (day.puzzleType === "windsurf_sim") {
    wrap.innerHTML = `
      <p class="puzzle-question">Bereit für die Windsurf-Simulation? Board aufbauen, Bojen umrunden, Route planen – eine durchgehende Fahrt.</p>
      <a class="btn btn-primary btn-block" href="windsurf-sim.html?day=${day.id}">Simulation starten</a>
    `;
    return wrap;
  }

  if (day.puzzleType === "theory_exam") {
    wrap.innerHTML = `
      <p class="puzzle-question">Bereit für die Theorieprüfung? 25 Fragen, ca. 10–15 Minuten, steigende Schwierigkeit.</p>
      <a class="btn btn-primary btn-block" href="theorie.html?day=${day.id}">Prüfung starten</a>
    `;
    return wrap;
  }

  if (day.puzzleType === "finale") {
    wrap.innerHTML = `
      <p class="puzzle-question">Bereit für die Abschlussmission? Materialcheck, dann eine durchgehende Fahrt zum Ziel – ca. 10–15 Minuten.</p>
      <a class="btn btn-primary btn-block" href="finale.html?day=${day.id}">Mission starten</a>
    `;
    return wrap;
  }

  if (day.puzzleType === "quiz") {
    wrap.innerHTML = `
      <p class="puzzle-question">Bereit für das Quiz? Beantworte Fragen und markiere Orte auf Fotos – je schneller, desto mehr Punkte.</p>
      <a class="btn btn-primary btn-block" href="quiz.html?day=${day.id}">Quiz starten</a>
    `;
    return wrap;
  }

  if (day.puzzleType === "choice") {
    const choices = day.puzzleChoices || [];
    wrap.innerHTML = `
      <p class="puzzle-question">${escapeHtml(day.puzzleQuestion || "")}</p>
      <div class="choice-list"></div>
    `;
    const list = wrap.querySelector(".choice-list");
    choices.forEach(choice => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = choice.label;
      btn.addEventListener("click", () => submitAnswer(day.id, choice.id, wrap));
      list.appendChild(btn);
    });
    return wrap;
  }

  // riddle (default)
  wrap.innerHTML = `
    <p class="puzzle-question">${escapeHtml(day.puzzleQuestion || "")}</p>
    <form class="answer-form">
      <input type="text" placeholder="Deine Antwort" aria-label="Antwort" />
      <button type="submit" class="btn btn-primary btn-sm">Prüfen</button>
    </form>
  `;
  wrap.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = wrap.querySelector("input");
    if (!input.value.trim()) return;
    submitAnswer(day.id, input.value.trim(), wrap);
  });
  return wrap;
}

async function onUnlockSubmit(e, dayId, form) {
  e.preventDefault();
  const input = form.querySelector("input");
  const code = input.value.trim();
  if (!/^[0-9]{4}$/.test(code)) {
    showToast("Bitte den 4-stelligen Code eingeben.", "error");
    return;
  }
  const btn = form.querySelector("button");
  btn.disabled = true;
  const session = SessionStore.get();
  const { error } = await supabaseClient.rpc("unlock_day", { p_token: session.token, p_day_id: dayId, p_code: code });
  btn.disabled = false;

  if (error) {
    showToast(friendlyError(error), "error");
    input.value = "";
    input.focus();
    return;
  }
  showToast("Tag freigeschaltet!", "success");
  await loadState();
}

async function submitAnswer(dayId, answer, wrap) {
  const session = SessionStore.get();
  wrap.style.opacity = "0.6";
  const { data, error } = await supabaseClient.rpc("submit_answer", { p_token: session.token, p_day_id: dayId, p_answer: answer });
  wrap.style.opacity = "1";

  if (error) {
    showToast(friendlyError(error), "error");
    return;
  }
  if (!data.correct) {
    showToast("Leider falsch – versuch's nochmal.", "error");
    return;
  }
  showToast(`Richtig! +${data.pointsAwarded} Punkte${data.bonusApplied ? " (mit Schnell-Bonus)" : ""}`, "success");
  await loadState();
}

async function loadMiniLeaderboard(myName) {
  const mount = document.getElementById("mini-leaderboard");
  const { data, error } = await supabaseClient.rpc("get_leaderboard");
  if (error || !data) {
    mount.innerHTML = `<div class="empty-state">Rangliste konnte nicht geladen werden.</div>`;
    return;
  }
  const top = data.slice(0, 5);
  mount.innerHTML = top.map((row, i) => renderLbRow(row, i + 1, row.name === myName)).join("") ||
    `<div class="empty-state">Noch keine Punkte vergeben.</div>`;
}

function renderLbRow(row, rank, isMe) {
  const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
  return `
    <div class="lb-row ${isMe ? "me" : ""}">
      <div class="rank ${rankClass}">${rank}</div>
      <div class="info">
        <div class="n">${escapeHtml(row.name)}</div>
        <div class="d">${row.days_solved} Tage</div>
      </div>
      <div class="pts">${row.points}</div>
    </div>
  `;
}

function startCountdowns() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    document.querySelectorAll(".countdown[data-opens-at]").forEach(el => {
      const opensAt = new Date(el.getAttribute("data-opens-at"));
      if (opensAt <= new Date()) {
        loadState();
      }
    });
  }, 30000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", loadState);
