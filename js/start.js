document.addEventListener("DOMContentLoaded", () => {
  const existing = SessionStore.get();
  if (existing && existing.token) {
    window.location.href = "mein-bereich.html";
    return;
  }

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.style.display = "none";
    if (!requireConfigOrWarn()) return;

    const name = document.getElementById("name").value.trim();
    const pin = document.getElementById("pin").value.trim();

    if (!/^[0-9]{4,8}$/.test(pin)) {
      errorEl.textContent = "PIN muss aus 4 bis 8 Ziffern bestehen.";
      errorEl.style.display = "block";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> Einen Moment …`;

    const { data, error } = await supabaseClient.rpc("register_or_login", { p_name: name, p_pin: pin });

    submitBtn.disabled = false;
    submitBtn.textContent = "Los geht's";

    if (error) {
      errorEl.textContent = friendlyError(error);
      errorEl.style.display = "block";
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    SessionStore.set({ token: row.token, playerId: row.player_id, name: row.player_name });
    window.location.href = "mein-bereich.html";
  });
});
