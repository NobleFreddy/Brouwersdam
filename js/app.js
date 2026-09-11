// Gemeinsame Grundlagen: Supabase-Client, Session-Speicher, Toasts, Header-Rendering.

const supabaseClient = (function () {
  if (!window.supabase || !window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    return null;
  }
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
})();

const SessionStore = {
  KEY: "brouwersdam_session",
  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
  },
  set(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },
  clear() { localStorage.removeItem(this.KEY); },
};

const AdminStore = {
  KEY: "brouwersdam_admin_token",
  get() { return localStorage.getItem(this.KEY); },
  set(token) { localStorage.setItem(this.KEY, token); },
  clear() { localStorage.removeItem(this.KEY); },
};

function showToast(message, type) {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function friendlyError(err) {
  if (!err) return "Etwas ist schiefgelaufen.";
  const msg = err.message || String(err);
  return msg.replace(/^.*?:\s*/, "");
}

function requireConfigOrWarn() {
  if (!supabaseClient) {
    showToast("Supabase ist noch nicht konfiguriert (js/config.js ausfüllen).", "error");
    return false;
  }
  return true;
}

function renderHeader(activePage) {
  const mount = document.getElementById("site-header");
  if (!mount) return;
  const session = SessionStore.get();
  const links = [
    { href: "index.html", label: "Start", key: "start" },
    { href: "mein-bereich.html", label: "Mein Bereich", key: "mein-bereich" },
    { href: "rangliste.html", label: "Rangliste", key: "rangliste" },
    { href: "admin.html", label: "Admin", key: "admin" },
  ];
  const muted = typeof Sfx !== "undefined" && Sfx.isMuted();
  mount.innerHTML = `
    <div class="inner">
      <a class="brand" href="index.html">
        <span class="name">Brouwersdam</span>
        <span class="tag">Sticker-Jagd</span>
      </a>
      <nav class="main-nav">
        ${links.map(l => `<a href="${l.href}" class="${l.key === activePage ? "active" : ""}">${l.label}</a>`).join("")}
        <button type="button" class="sound-toggle" id="sound-toggle" aria-label="Sound ein/aus" title="Sound ein/aus">${muted ? "🔇" : "🔊"}</button>
      </nav>
    </div>
  `;
  const soundBtn = document.getElementById("sound-toggle");
  if (soundBtn && typeof Sfx !== "undefined") {
    soundBtn.addEventListener("click", () => {
      const next = !Sfx.isMuted();
      Sfx.setMuted(next);
      soundBtn.textContent = next ? "🔇" : "🔊";
    });
  }
}

function renderFooter() {
  const mount = document.getElementById("site-footer");
  if (!mount) return;
  mount.innerHTML = `
    <span>Fünf Tage, fünf Sticker, ein Sieger. Codes gelten nur für ihren Tag.</span>
    <span>Nordsee · Grevelingenmeer · Wind aus West</span>
  `;
}

// Baut den "(mit Schnell-Bonus + Tages-Bonus)"-Zusatz für Erfolgs-Toasts nach dem Lösen -
// gemeinsam genutzt von mein-bereich.js und den *-page.js-Dateien (submit_answer/
// submit_minigame_result liefern beide bonusApplied/sameDayBonusApplied).
function bonusSuffix(data) {
  const notes = [];
  if (data.bonusApplied) notes.push("Schnell-Bonus");
  if (data.sameDayBonusApplied) notes.push("Tages-Bonus");
  return notes.length ? ` (mit ${notes.join(" + ")})` : "";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

document.addEventListener("DOMContentLoaded", () => {
  const active = document.body.getAttribute("data-page");
  renderHeader(active);
  renderFooter();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
