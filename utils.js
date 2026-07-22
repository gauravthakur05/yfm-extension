/**
 * utils.js
 * Shared helper functions used across background, content, popup, and options scripts.
 * Loaded as a plain script (no ES modules) so everything lives on `window` / global scope.
 */

const FocusUtils = (() => {
  /** Format seconds into mm:ss or hh:mm:ss */
  function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /** Format minutes into a human readable label e.g. "1h 30m" */
  function formatMinutes(totalMinutes) {
    totalMinutes = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  /** Returns today's date key, e.g. "2026-07-22" (local time) */
  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** Returns the ISO week key, e.g. "2026-W29" */
  function weekKey(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  /** Extract the YouTube video ID from a URL, or null */
  function getVideoId(url) {
    try {
      const u = new URL(url);
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
      return null;
    } catch {
      return null;
    }
  }

  /** Get the currently visible channel name from the YouTube DOM (best-effort) */
  function getChannelNameFromDom() {
    const selectors = [
      "ytd-channel-name #text",
      "#owner #channel-name a",
      "ytd-video-owner-renderer ytd-channel-name a",
      "#upload-info ytd-channel-name a"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  /** Simple debounce */
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /** Clamp a number */
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** Generate a short unique id */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    formatTime,
    formatMinutes,
    todayKey,
    weekKey,
    getVideoId,
    getChannelNameFromDom,
    debounce,
    clamp,
    uid
  };
})();

// Expose to both window (content/popup/options) and self (service worker)
if (typeof window !== "undefined") window.FocusUtils = FocusUtils;
if (typeof self !== "undefined") self.FocusUtils = FocusUtils;
