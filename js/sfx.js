// Gemeinsame Sound- und Haptik-Effekte für alle Minispiele. Alle Klänge werden per Web
// Audio API synthetisiert (Rauschen + Oszillatoren) statt aus Audiodateien geladen - keine
// Assets, kein Netzwerk, funktioniert auch offline. Ein globaler Mute-Schalter (im Header,
// siehe app.js) deckt Sound und Vibration gemeinsam ab und wird in localStorage gemerkt.
const Sfx = (function () {
  const MUTE_KEY = "brouwersdam_muted";
  let ctx = null;
  let windNode = null;

  function isMuted() {
    try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
  }
  function setMuted(v) {
    try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch {}
    if (v) stopWind();
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq = 440, freqEnd = null, duration = 0.15, type = "sine", volume = 0.15, delay = 0 }) {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst({ duration = 0.25, volume = 0.2, filterFreq = 900, filterType = "lowpass" }) {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    const size = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
  }

  function success() { tone({ freq: 660, freqEnd: 880, duration: 0.16, type: "sine", volume: 0.16 }); }
  function error() { tone({ freq: 220, freqEnd: 140, duration: 0.22, type: "sawtooth", volume: 0.1 }); }
  function click() { tone({ freq: 520, duration: 0.045, type: "square", volume: 0.07 }); }
  function splash() { noiseBurst({ duration: 0.3, volume: 0.2, filterFreq: 800 }); }
  function gustAlert() {
    tone({ freq: 900, duration: 0.08, type: "square", volume: 0.13 });
    tone({ freq: 900, duration: 0.08, type: "square", volume: 0.13, delay: 0.14 });
  }
  function whoosh() { noiseBurst({ duration: 0.4, volume: 0.14, filterFreq: 1600, filterType: "highpass" }); }

  // Wind-Ambiente als Endlosschleife aus gefiltertem Rauschen - Lautstärke folgt der
  // aktuellen Windstärke (0..1), damit es bei Böen hörbar auffrischt.
  function startWind(strength01) {
    if (isMuted() || windNode) return;
    const c = getCtx();
    if (!c) return;
    const size = 2 * c.sampleRate;
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 450;
    filter.Q.value = 0.5;
    const gain = c.createGain();
    gain.gain.value = 0.025 + clamp01(strength01) * 0.05;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    windNode = { src, gain };
  }
  function setWindStrength(strength01) {
    if (windNode) windNode.gain.gain.value = 0.025 + clamp01(strength01) * 0.05;
  }
  function stopWind() {
    if (windNode) {
      try { windNode.src.stop(); } catch {}
      windNode = null;
    }
  }

  function vibrate(pattern) {
    if (isMuted()) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  return { success, error, click, splash, gustAlert, whoosh, startWind, setWindStrength, stopWind, vibrate, isMuted, setMuted };
})();
