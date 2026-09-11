async function initQuizPage() {
  const session = SessionStore.get();
  if (!session || !session.token) {
    window.location.href = "index.html";
    return;
  }
  const dayId = Number(new URLSearchParams(location.search).get("day"));
  if (!dayId) {
    window.location.href = "mein-bereich.html";
    return;
  }
  if (!requireConfigOrWarn()) return;

  const { data, error } = await supabaseClient.rpc("get_my_state", { p_token: session.token });
  if (error) {
    showToast(friendlyError(error), "error");
    window.location.href = "mein-bereich.html";
    return;
  }

  const day = data.days.find((d) => d.id === dayId);
  if (!day || !day.unlockedAt) {
    window.location.href = "mein-bereich.html";
    return;
  }

  const app = document.getElementById("app");

  if (day.solvedAt) {
    app.innerHTML = `
      <section class="section center-page">
        <div class="card center-card">
          <div class="eyebrow">${escapeHtml(day.title)}</div>
          <h2 style="font-size:20px; margin-top:6px;">Schon gelöst 🎉</h2>
          <p class="section-lead" style="margin-top:8px;">+${day.pointsAwarded} Punkte bereits gutgeschrieben.</p>
          <a href="mein-bereich.html" class="btn btn-primary btn-block" style="margin-top:16px;">Zurück zu Mein Bereich</a>
        </div>
      </section>
    `;
    return;
  }

  const { data: questions, error: qError } = await supabaseClient.rpc("get_quiz_questions", {
    p_token: session.token,
    p_day_id: dayId,
  });
  if (qError) {
    showToast(friendlyError(qError), "error");
    window.location.href = "mein-bereich.html";
    return;
  }

  if (!questions || !questions.length) {
    app.innerHTML = `
      <section class="section center-page">
        <div class="card center-card">
          <div class="eyebrow">${escapeHtml(day.title)}</div>
          <h2 style="font-size:20px; margin-top:6px;">Noch nicht bereit</h2>
          <p class="section-lead" style="margin-top:8px;">Die Quizfragen sind noch nicht angelegt. Frag die Spielleitung.</p>
          <a href="mein-bereich.html" class="btn btn-primary btn-block" style="margin-top:16px;">Zurück</a>
        </div>
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="section">
      <a href="mein-bereich.html" class="btn btn-ghost btn-sm">← Zurück zu Mein Bereich</a>
      <div id="quiz-mount" style="margin-top:14px;"></div>
    </section>
  `;

  const mount = document.getElementById("quiz-mount");
  renderPhotoQuiz(mount, day.title, questions, async (performanceRatio) => {
    const { data: result, error: submitError } = await supabaseClient.rpc("submit_minigame_result", {
      p_token: session.token,
      p_day_id: dayId,
      p_performance: performanceRatio,
    });
    if (submitError) {
      showToast(friendlyError(submitError), "error");
      return;
    }
    showToast(`Eingereicht! +${result.pointsAwarded} Punkte${bonusSuffix(result)}`, "success");
    window.location.href = "mein-bereich.html";
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", initQuizPage);
