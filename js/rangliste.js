function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function renderLbRow(row, rank, isMe) {
  const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
  return `
    <div class="lb-row ${isMe ? "me" : ""}">
      <div class="rank ${rankClass}">${rank}</div>
      <div class="info">
        <div class="n">${escapeHtml(row.name)}</div>
        <div class="d">${row.days_solved} Tage gelöst</div>
      </div>
      <div class="pts">${row.points}</div>
    </div>
  `;
}

async function loadLeaderboard() {
  const mount = document.getElementById("leaderboard");
  if (!requireConfigOrWarn()) {
    mount.innerHTML = `<div class="empty-state">Supabase ist noch nicht konfiguriert.</div>`;
    return;
  }
  const session = SessionStore.get();
  const { data, error } = await supabaseClient.rpc("get_leaderboard");
  if (error) {
    mount.innerHTML = `<div class="empty-state">${friendlyError(error)}</div>`;
    return;
  }
  if (!data.length) {
    mount.innerHTML = `<div class="empty-state">Noch keine Punkte vergeben.</div>`;
    return;
  }
  mount.innerHTML = data.map((row, i) => renderLbRow(row, i + 1, session && row.name === session.name)).join("");
}

document.addEventListener("DOMContentLoaded", loadLeaderboard);
