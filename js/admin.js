let dashboardData = null;

async function init() {
  const token = AdminStore.get();
  if (!token) {
    renderLogin();
    return;
  }
  await loadDashboard();
}

function renderLogin(message) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="section center-page">
      <div class="card center-card fade-in">
        <div class="eyebrow">Admin</div>
        <h1 style="font-size:22px;margin-top:6px;">Anmelden</h1>
        <p class="section-lead" style="margin-top:8px;">Passwort eingeben, um Codes und Rätsel zu bearbeiten.</p>
        <form id="admin-login-form">
          <div class="field">
            <label for="admin-password">Admin-Passwort</label>
            <input type="password" id="admin-password" autocomplete="current-password" required />
            <div class="field-error" id="admin-login-error" style="display:${message ? "block" : "none"};">${message || ""}</div>
          </div>
          <div class="field">
            <button class="btn btn-primary btn-block" type="submit">Anmelden</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireConfigOrWarn()) return;
    const password = document.getElementById("admin-password").value;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    const { data, error } = await supabaseClient.rpc("admin_login", { p_password: password });
    btn.disabled = false;
    if (error) {
      const errEl = document.getElementById("admin-login-error");
      errEl.textContent = friendlyError(error);
      errEl.style.display = "block";
      return;
    }
    AdminStore.set(data);
    await loadDashboard();
  });
}

async function loadDashboard() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="section" style="text-align:center;"><span class="spinner" style="width:22px;height:22px;"></span></div>`;

  const token = AdminStore.get();
  const { data, error } = await supabaseClient.rpc("admin_get_dashboard", { p_token: token });
  if (error) {
    AdminStore.clear();
    renderLogin(friendlyError(error));
    return;
  }
  dashboardData = data;
  renderDashboard();
}

function renderDashboard() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="section">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="eyebrow">Admin</div>
          <h1 style="font-size:24px; margin-top:6px;">Verwaltung</h1>
        </div>
        <button class="btn btn-ghost btn-sm" id="admin-logout-btn" type="button">Abmelden</button>
      </div>

      <div class="tab-row">
        <button class="tab-btn active" data-tab="days">Tage &amp; Rätsel</button>
        <button class="tab-btn" data-tab="players">Spieler (${dashboardData.players.length})</button>
        <button class="tab-btn" data-tab="settings">Einstellungen</button>
      </div>

      <div class="tab-panel active" id="tab-days"></div>
      <div class="tab-panel" id="tab-players"></div>
      <div class="tab-panel" id="tab-settings"></div>
    </section>
  `;

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    AdminStore.clear();
    renderLogin();
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  renderDaysTab();
  renderPlayersTab();
  renderSettingsTab();
}

function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function answerLabel(type) {
  if (type === "choice") return "Richtige Auswahl-ID (z. B. a)";
  if (type === "minigame" || type === "windsurf_sim" || type === "theory_exam" || type === "finale" || type === "quiz") return "Antwort (nicht verwendet)";
  return "Antwort (Lösung)";
}

function choicesToText(choices) {
  if (!Array.isArray(choices)) return "";
  return choices.map(c => `${c.id}|${c.label}`).join("\n");
}

function textToChoices(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const idx = line.indexOf("|");
    if (idx === -1) return { id: line.trim(), label: line.trim() };
    return { id: line.slice(0, idx).trim(), label: line.slice(idx + 1).trim() };
  });
}

function renderDaysTab() {
  const mount = document.getElementById("tab-days");
  const days = [...dashboardData.days].sort((a, b) => a.sort_order - b.sort_order);

  mount.innerHTML = `<div class="admin-grid">${days.map(dayCardHtml).join("")}</div>`;

  days.forEach(day => {
    const root = mount.querySelector(`[data-day-id="${day.id}"]`);
    const typeSelect = root.querySelector(".field-puzzle-type");
    const noAnswerTypes = ["minigame", "windsurf_sim", "theory_exam", "finale", "quiz"];
    const syncVisibility = () => {
      const type = typeSelect.value;
      root.querySelector(".group-question").style.display = (type === "riddle" || type === "choice") ? "block" : "none";
      root.querySelector(".group-answer").style.display = !noAnswerTypes.includes(type) ? "block" : "none";
      root.querySelector(".group-choices").style.display = (type === "choice") ? "block" : "none";
      root.querySelector(".group-quiz").style.display = (type === "quiz") ? "block" : "none";
      root.querySelector(".group-finale-material").style.display = (type === "finale") ? "block" : "none";
      root.querySelector(".field-answer-label").textContent = answerLabel(type);
      if (type === "quiz" && !root.dataset.quizLoaded) {
        root.dataset.quizLoaded = "1";
        loadQuizQuestions(day.id, root);
      }
      if (type === "finale" && !root.dataset.finaleLoaded) {
        root.dataset.finaleLoaded = "1";
        loadFinaleAnswers(day.id, root);
      }
    };
    typeSelect.addEventListener("change", syncVisibility);
    syncVisibility();

    root.querySelector(".save-day-btn").addEventListener("click", () => saveDayEdit(day.id, root));
    root.querySelector(".qz-add-question-btn").addEventListener("click", () => addDraftQuizQuestion(day.id, root));
    wireFinaleMaterialPhoto(day, root);
  });
}

function dayCardHtml(day) {
  return `
    <div class="card admin-day-row" data-day-id="${day.id}">
      <div class="admin-day-num">Tag ${day.sort_order}</div>
      <div>
        <div class="admin-day-row-cols">
          <div class="field" style="margin-top:0;">
            <label>Titel</label>
            <input type="text" class="field-title" value="${escapeHtmlAttr(day.title)}" />
          </div>
          <div class="field" style="margin-top:0;">
            <label>Sticker-Code (4 Ziffern)</label>
            <input type="text" class="field-code" maxlength="4" inputmode="numeric" value="${escapeHtmlAttr(day.code)}" />
          </div>
        </div>
        <div class="field">
          <label>Teaser (sichtbar, solange gesperrt)</label>
          <textarea class="field-teaser" rows="2">${escapeHtmlText(day.teaser)}</textarea>
        </div>
        <div class="admin-day-row-cols">
          <div class="field">
            <label>Öffnet erst am (optional)</label>
            <input type="datetime-local" class="field-opens-at" value="${toDatetimeLocal(day.opens_at)}" />
          </div>
          <div class="field">
            <label>Rätseltyp</label>
            <select class="field-puzzle-type">
              <option value="riddle" ${day.puzzle_type === "riddle" ? "selected" : ""}>Text-Rätsel</option>
              <option value="choice" ${day.puzzle_type === "choice" ? "selected" : ""}>Multiple Choice</option>
              <option value="minigame" ${day.puzzle_type === "minigame" ? "selected" : ""}>Minigame (Segeltrimm)</option>
              <option value="windsurf_sim" ${day.puzzle_type === "windsurf_sim" ? "selected" : ""}>Windsurf-Simulation (3 Phasen)</option>
              <option value="theory_exam" ${day.puzzle_type === "theory_exam" ? "selected" : ""}>Theorieprüfung (25 Fragen)</option>
              <option value="finale" ${day.puzzle_type === "finale" ? "selected" : ""}>Abschlussmission</option>
              <option value="quiz" ${day.puzzle_type === "quiz" ? "selected" : ""}>Quiz (Multiple Choice + Foto-Punkt)</option>
            </select>
          </div>
        </div>
        <div class="field group-question">
          <label>Frage</label>
          <textarea class="field-question" rows="2">${escapeHtmlText(day.puzzle_question)}</textarea>
        </div>
        <div class="field group-choices">
          <label>Auswahlmöglichkeiten (eine pro Zeile: id|Text)</label>
          <textarea class="field-choices" rows="3" placeholder="a|Antwort A&#10;b|Antwort B">${escapeHtmlText(choicesToText(day.puzzle_choices))}</textarea>
        </div>
        <div class="field group-answer">
          <label class="field-answer-label">${answerLabel(day.puzzle_type)}</label>
          <input type="text" class="field-answer" value="${escapeHtmlAttr(day.puzzle_answer)}" />
        </div>
        <div class="field group-quiz">
          <label>Quiz-Fragen (${day.quiz_question_count || 0})</label>
          <div class="qz-admin-list" id="qz-admin-list-${day.id}"><div class="empty-state">Lädt …</div></div>
          <button class="btn btn-ghost btn-sm qz-add-question-btn" type="button">+ Frage hinzufügen</button>
        </div>
        <div class="field group-finale-material">
          <label>Materialcheck-Frage</label>
          <textarea class="field-finale-question" rows="2" placeholder="Was ist an diesem Aufbau alles falsch?">${escapeHtmlText(day.puzzle_question)}</textarea>
          <label style="margin-top:12px;">Materialcheck-Foto</label>
          <div class="fin-mc-photo-box fin-admin-photo-wrap" ${day.finale_material_photo ? "" : "hidden"}>
            ${day.finale_material_photo ? `<img src="${day.finale_material_photo}" class="fin-mc-photo fin-admin-photo-img" />` : ""}
          </div>
          <input type="file" accept="image/*" class="field-finale-photo-input" style="margin-top:8px;" />
          <div class="field-hint">Wird automatisch verkleinert. Spieler sehen dieses Foto + die Frage zu Beginn von Tag 5.</div>
          <label style="margin-top:16px;">Materialcheck-Antworten</label>
          <div class="fin-answers-list" id="fin-answers-list-${day.id}"><div class="empty-state">Lädt …</div></div>
        </div>
        <div class="admin-day-row-cols">
          <div class="field">
            <label>Basispunkte</label>
            <input type="number" class="field-base-points" min="0" value="${day.base_points}" />
          </div>
          <div class="field">
            <label>Bonuspunkte</label>
            <input type="number" class="field-bonus-points" min="0" value="${day.bonus_points}" />
          </div>
        </div>
        <div class="field">
          <label>Schnell-Bonus-Fenster (Sekunden nach Freischaltung)</label>
          <input type="number" class="field-bonus-window" min="0" value="${day.bonus_window_seconds}" />
        </div>
        <div class="field">
          <label>Tages-Bonus (zusätzlich, wenn am Öffnungstag gelöst)</label>
          <input type="number" class="field-same-day-bonus-points" min="0" value="${day.same_day_bonus_points || 0}" />
          <div class="field-hint">Nur wirksam, wenn oben ein Öffnungszeitpunkt gesetzt ist – Vergleich nach Kalendertag, nicht nach Uhrzeit.</div>
        </div>
        <div class="field">
          <label class="field-checkbox-label">
            <input type="checkbox" class="field-auto-unlock" ${day.auto_unlock ? "checked" : ""} />
            Als Sicherheitsnetz automatisch öffnen (kein Code nötig), falls 1 Tag nach dem Öffnungszeitpunkt noch niemand den Sticker-Code eingegeben hat
          </label>
          <div class="field-hint">Der Sticker-Code bleibt der normale Weg (inkl. Tages-Bonus bei prompter Eingabe) – das hier greift erst einen Tag später als Fallback.</div>
        </div>
        <div class="field" style="display:flex; align-items:center; gap:10px;">
          <button class="btn btn-primary save-day-btn" type="button">Speichern</button>
          <span class="field-hint save-status"></span>
        </div>
      </div>
    </div>
  `;
}

async function saveDayEdit(dayId, root) {
  const type = root.querySelector(".field-puzzle-type").value;
  const opensAtVal = root.querySelector(".field-opens-at").value;
  const payload = {
    p_token: AdminStore.get(),
    p_day_id: dayId,
    p_title: root.querySelector(".field-title").value.trim(),
    p_teaser: root.querySelector(".field-teaser").value.trim(),
    p_code: root.querySelector(".field-code").value.trim(),
    p_opens_at: opensAtVal ? new Date(opensAtVal).toISOString() : null,
    p_puzzle_type: type,
    p_puzzle_question: (type === "riddle" || type === "choice")
      ? root.querySelector(".field-question").value.trim()
      : type === "finale" ? root.querySelector(".field-finale-question").value.trim() : null,
    p_puzzle_choices: type === "choice" ? textToChoices(root.querySelector(".field-choices").value) : null,
    p_puzzle_answer: (type !== "minigame" && type !== "windsurf_sim" && type !== "theory_exam" && type !== "finale" && type !== "quiz") ? root.querySelector(".field-answer").value.trim() : null,
    p_base_points: Number(root.querySelector(".field-base-points").value) || 0,
    p_bonus_points: Number(root.querySelector(".field-bonus-points").value) || 0,
    p_bonus_window_seconds: Number(root.querySelector(".field-bonus-window").value) || 0,
    p_finale_material_photo: type === "finale" ? (root._finaleMaterialPhoto || null) : null,
    p_same_day_bonus_points: Number(root.querySelector(".field-same-day-bonus-points").value) || 0,
    p_auto_unlock: root.querySelector(".field-auto-unlock").checked,
  };

  const status = root.querySelector(".save-status");
  const btn = root.querySelector(".save-day-btn");
  btn.disabled = true;
  status.textContent = "Speichert …";

  const { error } = await supabaseClient.rpc("admin_update_day", payload);
  btn.disabled = false;

  if (error) {
    status.textContent = "";
    showToast(friendlyError(error), "error");
    return;
  }
  status.textContent = "Gespeichert ✓";
  showToast("Tag gespeichert.", "success");
  setTimeout(() => { status.textContent = ""; }, 2500);
  await loadDashboard();
}

// ---------- Tag 1: Quiz-Fragen (Multiple Choice + Foto-Punkt) --------------
// Fragen sind eine variable Liste mit eigenem Speichern/Löschen pro Zeile -
// passt nicht in das Ein-Formular-ein-Button-Muster der Tages-Karte, daher
// ein eigener, in die Karte eingebetteter Bereich. root._quizQuestions hält
// den aktuellen Stand (geladen + noch ungespeicherte Entwürfe) pro Tag.

async function loadQuizQuestions(dayId, root) {
  const listEl = root.querySelector(`#qz-admin-list-${dayId}`);
  listEl.innerHTML = `<div class="empty-state">Lädt …</div>`;
  const { data, error } = await supabaseClient.rpc("admin_list_quiz_questions", { p_token: AdminStore.get(), p_day_id: dayId });
  if (error) {
    listEl.innerHTML = `<div class="empty-state">Fehler beim Laden.</div>`;
    showToast(friendlyError(error), "error");
    return;
  }
  root._quizQuestions = data || [];
  renderQuizQuestionsList(dayId, root);
}

function addDraftQuizQuestion(dayId, root) {
  if (!root._quizQuestions) root._quizQuestions = [];
  root._quizQuestions.push({
    id: null,
    kind: "choice",
    prompt: "",
    time_limit_seconds: 20,
    points_base: 10,
    choices: [{ id: "0", label: "" }, { id: "1", label: "" }],
    correct_choice_id: "0",
    image_data_url: null,
    correct_x: null,
    correct_y: null,
    tolerance_radius: 0.08,
  });
  renderQuizQuestionsList(dayId, root);
}

function renderQuizQuestionsList(dayId, root) {
  const listEl = root.querySelector(`#qz-admin-list-${dayId}`);
  const questions = root._quizQuestions || [];
  root.querySelector(".group-quiz > label").textContent = `Quiz-Fragen (${questions.length})`;

  if (!questions.length) {
    listEl.innerHTML = `<div class="empty-state">Noch keine Fragen. Mit "+ Frage hinzufügen" starten.</div>`;
    return;
  }

  listEl.innerHTML = "";
  questions.forEach((q, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "qz-admin-q";
    rowEl.innerHTML = quizQuestionRowHtml(q, i, questions.length);
    listEl.appendChild(rowEl);
    wireQuizQuestionRow(dayId, root, rowEl, q, i);
  });
}

function choiceRowHtml(label, checked) {
  return `
    <div class="qz-choice-row">
      <input type="radio" class="qz-choice-correct" ${checked ? "checked" : ""} />
      <input type="text" class="qz-choice-label" placeholder="Antworttext" value="${escapeHtmlAttr(label || "")}" />
      <button type="button" class="qz-choice-remove-btn" aria-label="Option entfernen">×</button>
    </div>
  `;
}

function choiceRowsHtml(q) {
  const choices = Array.isArray(q.choices) && q.choices.length ? q.choices : [{ id: "0", label: "" }, { id: "1", label: "" }];
  return choices.map((c) => choiceRowHtml(c.label, c.id === q.correct_choice_id)).join("");
}

// Radiobutton-Exklusivität wird bewusst per JS statt über ein gemeinsames
// name-Attribut gelöst: name-Gruppen sind ohne umschließendes <form> seitenweit
// eindeutig, was bei mehreren gleichzeitig gerenderten Fragen kollidieren würde.
function wireChoiceRow(rowEl, listEl) {
  const radio = rowEl.querySelector(".qz-choice-correct");
  radio.addEventListener("change", () => {
    listEl.querySelectorAll(".qz-choice-correct").forEach((r) => { if (r !== radio) r.checked = false; });
  });
  rowEl.querySelector(".qz-choice-remove-btn").addEventListener("click", () => {
    if (listEl.querySelectorAll(".qz-choice-row").length <= 2) {
      showToast("Mindestens 2 Antwortmöglichkeiten nötig.", "error");
      return;
    }
    rowEl.remove();
  });
}

// Vergibt frische fortlaufende IDs anhand der aktuellen Zeilenreihenfolge -
// alte IDs sind irrelevant, admin_upsert_quiz_question ersetzt choices ohnehin
// komplett. Leere Antworttexte werden übersprungen.
function readChoiceRows(rowEl) {
  const choices = [];
  let correctId = null;
  rowEl.querySelectorAll(".qz-choice-row").forEach((el) => {
    const label = el.querySelector(".qz-choice-label").value.trim();
    if (!label) return;
    const id = String(choices.length);
    if (el.querySelector(".qz-choice-correct").checked) correctId = id;
    choices.push({ id, label });
  });
  return { choices, correctId };
}

function quizQuestionRowHtml(q, index, total) {
  const tolerancePct = Math.round((q.tolerance_radius != null ? q.tolerance_radius : 0.08) * 100);
  return `
    <div class="qz-admin-q-top">
      <span class="qz-admin-q-num">Frage ${index + 1}${q.id ? "" : " (neu)"}</span>
      <div class="qz-admin-q-move">
        <button type="button" class="btn btn-ghost btn-sm qz-move-up-btn" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn btn-ghost btn-sm qz-move-down-btn" ${index === total - 1 ? "disabled" : ""}>↓</button>
      </div>
    </div>
    <div class="qz-admin-q-cols">
      <div class="field" style="margin-top:0;">
        <label>Fragetyp</label>
        <select class="qz-field-kind">
          <option value="choice" ${q.kind === "choice" ? "selected" : ""}>Multiple Choice</option>
          <option value="point" ${q.kind === "point" ? "selected" : ""}>Punkt auf Foto markieren</option>
        </select>
      </div>
      <div class="field" style="margin-top:0;">
        <label>Zeitlimit (Sek.)</label>
        <input type="number" class="qz-field-time" min="3" max="600" value="${q.time_limit_seconds}" />
      </div>
      <div class="field" style="margin-top:0;">
        <label>Basispunkte</label>
        <input type="number" class="qz-field-points" min="0" value="${q.points_base}" />
      </div>
    </div>
    <div class="field">
      <label>Frage</label>
      <textarea class="qz-field-prompt" rows="2">${escapeHtmlText(q.prompt)}</textarea>
    </div>
    <div class="qz-admin-q-group-choices">
      <div class="field">
        <label>Antwortoptionen (Punkt = richtige Antwort)</label>
        <div class="qz-choice-list">${choiceRowsHtml(q)}</div>
        <button type="button" class="btn btn-ghost btn-sm qz-add-choice-btn">+ Option hinzufügen</button>
      </div>
    </div>
    <div class="qz-admin-q-group-image">
      <div class="field">
        <label>Foto hochladen</label>
        <input type="file" accept="image/*" class="qz-field-image-input" />
        <div class="field-hint">Wird automatisch verkleinert. Danach auf das Foto tippen, um den richtigen Punkt zu markieren.</div>
      </div>
      <div class="qz-mark-wrap qz-admin-mark-wrap" ${q.image_data_url ? "" : "hidden"}>
        ${q.image_data_url ? `<img class="qz-mark-img qz-admin-mark-img" src="${q.image_data_url}" draggable="false" />` : ""}
      </div>
      <div class="field">
        <label>Toleranzradius: <span class="qz-tolerance-value">${tolerancePct}%</span></label>
        <input type="range" class="qz-field-tolerance" min="2" max="25" value="${tolerancePct}" />
      </div>
    </div>
    <div class="qz-admin-q-actions">
      <button class="btn btn-primary btn-sm qz-save-question-btn" type="button">Frage speichern</button>
      <button class="btn btn-danger btn-sm qz-delete-question-btn" type="button">${q.id ? "Löschen" : "Verwerfen"}</button>
      <span class="field-hint qz-save-status"></span>
    </div>
  `;
}

function wireQuizQuestionRow(dayId, root, rowEl, q, index) {
  const state = {
    imageDataUrl: q.image_data_url || null,
    x: q.correct_x != null ? Number(q.correct_x) : null,
    y: q.correct_y != null ? Number(q.correct_y) : null,
    toleranceRadius: q.tolerance_radius != null ? Number(q.tolerance_radius) : 0.08,
  };

  const kindSelect = rowEl.querySelector(".qz-field-kind");
  const choicesGroup = rowEl.querySelector(".qz-admin-q-group-choices");
  const imageGroup = rowEl.querySelector(".qz-admin-q-group-image");
  const syncKindVisibility = () => {
    const kind = kindSelect.value;
    choicesGroup.style.display = kind === "choice" ? "block" : "none";
    imageGroup.style.display = kind === "point" ? "block" : "none";
  };
  kindSelect.addEventListener("change", syncKindVisibility);
  syncKindVisibility();

  const choiceListEl = rowEl.querySelector(".qz-choice-list");
  choiceListEl.querySelectorAll(".qz-choice-row").forEach((choiceRowEl) => wireChoiceRow(choiceRowEl, choiceListEl));
  rowEl.querySelector(".qz-add-choice-btn").addEventListener("click", () => {
    const newRow = document.createElement("div");
    newRow.innerHTML = choiceRowHtml("", false);
    const choiceRowEl = newRow.firstElementChild;
    choiceListEl.appendChild(choiceRowEl);
    wireChoiceRow(choiceRowEl, choiceListEl);
  });

  const markWrap = rowEl.querySelector(".qz-admin-mark-wrap");
  let markImg = markWrap.querySelector(".qz-admin-mark-img");

  function ensureMarkImg() {
    if (!markImg) {
      markWrap.innerHTML = `<img class="qz-mark-img qz-admin-mark-img" draggable="false" />`;
      markImg = markWrap.querySelector(".qz-admin-mark-img");
      attachPointMarking(markWrap, markImg, () => state, (x, y) => { state.x = x; state.y = y; });
    }
    return markImg;
  }

  if (state.imageDataUrl) {
    ensureMarkImg();
    markImg.src = state.imageDataUrl;
    redrawMarkerOverlay(markWrap, markImg, state);
  }

  rowEl.querySelector(".qz-field-image-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const statusEl = rowEl.querySelector(".qz-save-status");
    statusEl.textContent = "Bild wird verkleinert …";
    try {
      const dataUrl = await compressImageFile(file);
      state.imageDataUrl = dataUrl;
      state.x = null;
      state.y = null;
      markWrap.hidden = false;
      ensureMarkImg();
      markImg.src = dataUrl;
      statusEl.textContent = "Bild bereit – jetzt auf das Foto tippen, um den richtigen Punkt zu markieren.";
    } catch (err) {
      statusEl.textContent = "";
      showToast("Bild konnte nicht geladen werden.", "error");
    }
  });

  const toleranceInput = rowEl.querySelector(".qz-field-tolerance");
  const toleranceValueEl = rowEl.querySelector(".qz-tolerance-value");
  toleranceInput.addEventListener("input", () => {
    state.toleranceRadius = Number(toleranceInput.value) / 100;
    toleranceValueEl.textContent = toleranceInput.value + "%";
    if (markImg) redrawMarkerOverlay(markWrap, markImg, state);
  });

  rowEl.querySelector(".qz-move-up-btn").addEventListener("click", () => moveQuizQuestion(dayId, root, index, -1));
  rowEl.querySelector(".qz-move-down-btn").addEventListener("click", () => moveQuizQuestion(dayId, root, index, 1));

  rowEl.querySelector(".qz-save-question-btn").addEventListener("click", () => saveQuizQuestion(dayId, root, rowEl, q, index, state));

  const deleteBtn = rowEl.querySelector(".qz-delete-question-btn");
  if (q.id) {
    armConfirmButton(deleteBtn, "Wirklich löschen?", async () => {
      const { error } = await supabaseClient.rpc("admin_delete_quiz_question", { p_token: AdminStore.get(), p_question_id: q.id });
      if (error) { showToast(friendlyError(error), "error"); return; }
      showToast("Frage gelöscht.", "success");
      await loadQuizQuestions(dayId, root);
    });
  } else {
    // Noch nicht gespeicherter Entwurf: nur lokal aus der Liste entfernen, kein RPC nötig.
    deleteBtn.addEventListener("click", () => {
      const list = root._quizQuestions || [];
      const idx = list.indexOf(q);
      if (idx !== -1) list.splice(idx, 1);
      renderQuizQuestionsList(dayId, root);
    });
  }
}

// Click-to-mark: rechnet die Klickposition relativ zum tatsächlich gerenderten
// Bild in 0..1-Bruchteile um (auflösungsunabhängig, genau wie beim Spieler in
// js/quiz.js), damit Admin-Vorschau und Spieler-Ansicht exakt übereinstimmen.
function attachPointMarking(wrapEl, imgEl, getState, onChange) {
  wrapEl.addEventListener("click", (e) => {
    const rect = imgEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(x, y);
    redrawMarkerOverlay(wrapEl, imgEl, getState());
  });
  imgEl.addEventListener("load", () => redrawMarkerOverlay(wrapEl, imgEl, getState()));
}

// Toleranzkreis in Pixeln (nicht %) auf Basis der Bildbreite zeichnen, sonst
// würde er bei nicht-quadratischen Fotos zur Ellipse verzerrt.
function redrawMarkerOverlay(wrapEl, imgEl, state) {
  wrapEl.querySelectorAll(".qz-mark-dot, .qz-mark-tolerance").forEach((el) => el.remove());
  if (state.x == null || state.y == null) return;
  const rect = imgEl.getBoundingClientRect();
  if (!rect.width) return;
  const diameterPx = state.toleranceRadius * rect.width * 2;

  const ring = document.createElement("div");
  ring.className = "qz-mark-tolerance";
  ring.style.left = (state.x * 100) + "%";
  ring.style.top = (state.y * 100) + "%";
  ring.style.width = diameterPx + "px";
  ring.style.height = diameterPx + "px";
  wrapEl.appendChild(ring);

  const dot = document.createElement("div");
  dot.className = "qz-mark-dot qz-mark-correct";
  dot.style.left = (state.x * 100) + "%";
  dot.style.top = (state.y * 100) + "%";
  wrapEl.appendChild(dot);
}

async function saveQuizQuestion(dayId, root, rowEl, q, index, state) {
  const kind = rowEl.querySelector(".qz-field-kind").value;
  const prompt = rowEl.querySelector(".qz-field-prompt").value.trim();
  const timeLimitSeconds = Number(rowEl.querySelector(".qz-field-time").value) || 20;
  const pointsBase = Number(rowEl.querySelector(".qz-field-points").value) || 0;

  const payload = {
    p_token: AdminStore.get(),
    p_question_id: q.id || null,
    p_day_id: dayId,
    p_sort_order: index,
    p_kind: kind,
    p_prompt: prompt,
    p_time_limit_seconds: timeLimitSeconds,
    p_points_base: pointsBase,
    p_choices: null,
    p_correct_choice_id: null,
    p_image_data_url: null,
    p_correct_x: null,
    p_correct_y: null,
    p_tolerance_radius: state.toleranceRadius,
  };

  if (kind === "choice") {
    const { choices, correctId } = readChoiceRows(rowEl);
    payload.p_choices = choices;
    payload.p_correct_choice_id = correctId;
  } else {
    payload.p_image_data_url = state.imageDataUrl;
    payload.p_correct_x = state.x;
    payload.p_correct_y = state.y;
  }

  const statusEl = rowEl.querySelector(".qz-save-status");
  const btn = rowEl.querySelector(".qz-save-question-btn");
  btn.disabled = true;
  statusEl.textContent = "Speichert …";

  const { error } = await supabaseClient.rpc("admin_upsert_quiz_question", payload);
  btn.disabled = false;

  if (error) {
    statusEl.textContent = "";
    showToast(friendlyError(error), "error");
    return;
  }
  showToast("Frage gespeichert.", "success");
  await loadQuizQuestions(dayId, root);
}

async function moveQuizQuestion(dayId, root, index, delta) {
  const questions = root._quizQuestions || [];
  const target = index + delta;
  if (target < 0 || target >= questions.length) return;

  const a = questions[index];
  const b = questions[target];
  questions[index] = b;
  questions[target] = a;

  const calls = [];
  [{ q: a, order: target }, { q: b, order: index }].forEach(({ q, order }) => {
    if (q.id) {
      calls.push(supabaseClient.rpc("admin_upsert_quiz_question", {
        p_token: AdminStore.get(), p_question_id: q.id, p_day_id: dayId, p_sort_order: order,
        p_kind: q.kind, p_prompt: q.prompt, p_time_limit_seconds: q.time_limit_seconds, p_points_base: q.points_base,
        p_choices: q.choices || null, p_correct_choice_id: q.correct_choice_id || null,
        p_image_data_url: q.image_data_url || null, p_correct_x: q.correct_x, p_correct_y: q.correct_y,
        p_tolerance_radius: q.tolerance_radius,
      }));
    }
  });

  if (calls.length) {
    const results = await Promise.all(calls);
    const failed = results.find((r) => r.error);
    if (failed) {
      showToast(friendlyError(failed.error), "error");
      await loadQuizQuestions(dayId, root);
      return;
    }
  }
  renderQuizQuestionsList(dayId, root);
}

function compressImageFile(file, maxSide, quality) {
  maxSide = maxSide || 900;
  quality = quality || 0.75;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxSide || h > maxSide) {
          if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
          else { w = Math.round(w * (maxSide / h)); h = maxSide; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Tag 5: Materialcheck-Foto + Freitext-Antworten bewerten --------

function wireFinaleMaterialPhoto(day, root) {
  root._finaleMaterialPhoto = day.finale_material_photo || null;
  const input = root.querySelector(".field-finale-photo-input");
  const wrap = root.querySelector(".fin-admin-photo-wrap");

  input.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      root._finaleMaterialPhoto = dataUrl;
      wrap.innerHTML = `<img src="${dataUrl}" class="fin-mc-photo fin-admin-photo-img" />`;
      wrap.hidden = false;
    } catch (err) {
      showToast("Bild konnte nicht geladen werden.", "error");
    }
  });
}

async function loadFinaleAnswers(dayId, root) {
  const listEl = root.querySelector(`#fin-answers-list-${dayId}`);
  listEl.innerHTML = `<div class="empty-state">Lädt …</div>`;
  const { data, error } = await supabaseClient.rpc("admin_list_finale_answers", { p_token: AdminStore.get(), p_day_id: dayId });
  if (error) {
    listEl.innerHTML = `<div class="empty-state">Fehler beim Laden.</div>`;
    showToast(friendlyError(error), "error");
    return;
  }
  renderFinaleAnswersList(dayId, root, data || []);
}

function renderFinaleAnswersList(dayId, root, answers) {
  const listEl = root.querySelector(`#fin-answers-list-${dayId}`);
  if (!answers.length) {
    listEl.innerHTML = `<div class="empty-state">Noch keine Antworten eingereicht.</div>`;
    return;
  }

  listEl.innerHTML = "";
  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "fin-answer-row";
    row.innerHTML = `
      <div class="fin-answer-head">
        <span class="fin-answer-player">${escapeHtmlText(a.playerName)}</span>
        <span class="fin-answer-time">${formatDate(a.submittedAt)}</span>
      </div>
      <p class="fin-answer-text"></p>
      <div class="fin-answer-grade-row">
        <input type="number" class="fin-answer-grade-input" min="0" value="${a.gradePoints != null ? a.gradePoints : ""}" placeholder="Punkte" />
        <button class="btn btn-primary btn-sm fin-answer-grade-btn" type="button">${a.gradePoints != null ? "Punkte ändern" : "Bewerten"}</button>
        <button class="btn btn-ghost btn-sm fin-answer-delete-btn" type="button">Löschen</button>
        ${a.gradedAt ? `<span class="field-hint">Bewertet ✓</span>` : ""}
      </div>
    `;
    row.querySelector(".fin-answer-text").textContent = a.answerText;
    listEl.appendChild(row);

    row.querySelector(".fin-answer-grade-btn").addEventListener("click", async () => {
      const input = row.querySelector(".fin-answer-grade-input");
      const points = Number(input.value);
      if (!Number.isFinite(points) || points < 0) {
        showToast("Bitte eine gültige Punktzahl eingeben.", "error");
        return;
      }
      const btn = row.querySelector(".fin-answer-grade-btn");
      btn.disabled = true;
      const { error } = await supabaseClient.rpc("admin_grade_finale_answer", {
        p_token: AdminStore.get(), p_answer_id: a.id, p_grade_points: points,
      });
      btn.disabled = false;
      if (error) { showToast(friendlyError(error), "error"); return; }
      showToast("Bewertung gespeichert.", "success");
      await loadFinaleAnswers(dayId, root);
    });

    armConfirmButton(row.querySelector(".fin-answer-delete-btn"), "Wirklich löschen?", async () => {
      const { error } = await supabaseClient.rpc("admin_delete_finale_answer", {
        p_token: AdminStore.get(), p_answer_id: a.id,
      });
      if (error) { showToast(friendlyError(error), "error"); return; }
      showToast("Antwort gelöscht.", "success");
      await loadFinaleAnswers(dayId, root);
    });
  });
}

function renderPlayersTab() {
  const mount = document.getElementById("tab-players");
  if (!dashboardData.players.length) {
    mount.innerHTML = `<div class="card" style="margin-top:16px;"><div class="empty-state">Noch keine Spieler registriert.</div></div>`;
    return;
  }
  mount.innerHTML = `
    <div class="card" style="margin-top:16px;">
      ${dashboardData.players.map(p => `
        <div class="admin-player-row" data-player-id="${p.id}">
          <div class="info">
            <div class="n">${escapeHtmlText(p.name)}</div>
            <div class="d">${p.points} Punkte · ${p.daysSolved} Tage gelöst</div>
          </div>
          <div class="actions">
            <button class="btn btn-ghost btn-sm reset-player-btn" type="button">Zurücksetzen</button>
            <button class="btn btn-danger btn-sm delete-player-btn" type="button">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  mount.querySelectorAll(".reset-player-btn").forEach(btn => {
    armConfirmButton(btn, "Wirklich?", async () => {
      const row = btn.closest(".admin-player-row");
      const id = row.dataset.playerId;
      const { error } = await supabaseClient.rpc("admin_reset_player", { p_token: AdminStore.get(), p_player_id: id });
      if (error) { showToast(friendlyError(error), "error"); return; }
      showToast("Spieler zurückgesetzt.", "success");
      await loadDashboard();
    });
  });

  mount.querySelectorAll(".delete-player-btn").forEach(btn => {
    armConfirmButton(btn, "Wirklich löschen?", async () => {
      const row = btn.closest(".admin-player-row");
      const id = row.dataset.playerId;
      const { error } = await supabaseClient.rpc("admin_delete_player", { p_token: AdminStore.get(), p_player_id: id });
      if (error) { showToast(friendlyError(error), "error"); return; }
      showToast("Spieler gelöscht.", "success");
      await loadDashboard();
    });
  });
}

// Erster Klick bewaffnet den Button (zeigt Bestätigungstext), erst der zweite Klick
// löst die Aktion aus. Ersetzt window.confirm(), das auf Mobilgeräten (v.a. Chrome
// nach mehrfacher Nutzung) unzuverlässig ist und Dialoge stumm unterdrücken kann.
function armConfirmButton(btn, confirmLabel, onConfirm) {
  const original = btn.textContent;
  let armed = false;
  let revertTimer = null;

  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add("confirm-armed");
      revertTimer = setTimeout(() => {
        armed = false;
        btn.textContent = original;
        btn.classList.remove("confirm-armed");
      }, 3500);
      return;
    }
    clearTimeout(revertTimer);
    btn.disabled = true;
    await onConfirm();
  });
}

function renderSettingsTab() {
  const mount = document.getElementById("tab-settings");
  mount.innerHTML = `
    <div class="card" style="margin-top:16px; max-width:420px;">
      <h3 style="font-size:16px;">Admin-Passwort ändern</h3>
      <form id="change-password-form">
        <div class="field">
          <label>Neues Passwort (min. 8 Zeichen)</label>
          <input type="password" id="new-password" autocomplete="new-password" required minlength="8" />
        </div>
        <div class="field">
          <label>Wiederholen</label>
          <input type="password" id="confirm-password" autocomplete="new-password" required minlength="8" />
          <div class="field-error" id="password-error" style="display:none;"></div>
        </div>
        <div class="field">
          <button class="btn btn-primary btn-block" type="submit">Passwort speichern</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById("change-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("new-password").value;
    const confirmPw = document.getElementById("confirm-password").value;
    const errEl = document.getElementById("password-error");
    if (pw !== confirmPw) {
      errEl.textContent = "Passwörter stimmen nicht überein.";
      errEl.style.display = "block";
      return;
    }
    const { error } = await supabaseClient.rpc("admin_change_password", { p_token: AdminStore.get(), p_new_password: pw });
    if (error) {
      errEl.textContent = friendlyError(error);
      errEl.style.display = "block";
      return;
    }
    errEl.style.display = "none";
    showToast("Passwort geändert.", "success");
    e.target.reset();
  });
}

function escapeHtmlAttr(str) {
  return (str == null ? "" : String(str)).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeHtmlText(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireConfigOrWarn()) {
    document.getElementById("app").innerHTML = `<div class="section"><div class="empty-state">Supabase ist noch nicht konfiguriert (js/config.js ausfüllen).</div></div>`;
    return;
  }
  init();
});
