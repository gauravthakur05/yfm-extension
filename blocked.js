/**
 * blocked.js
 * Populates the "Stay Focused" block page with the current session state
 * and a redirect back to the active video (or YouTube watch page as fallback).
 */

const QUOTES = [
  "Don't break your momentum. Keep learning 🚀",
  "Discipline is choosing between what you want now and what you want most.",
  "One focused hour beats five distracted ones.",
  "Future you is grateful for this exact moment.",
  "Small steps, done consistently, build mastery.",
  "The video will still be there. This focus won't wait."
];

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const reason = params.get("reason") || "This section is off-limits during Focus Mode.";
  document.getElementById("reasonLabel").textContent = reason;
  document.getElementById("quote").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  const data = await FocusStorage.get();
  document.documentElement.setAttribute("data-theme", data.settings.theme || "system");

  document.getElementById("qBlocked").textContent = data.session.distractionsBlockedThisSession || 0;
  document.getElementById("qVideos").textContent = data.session.videosWatchedThisSession || 0;

  if (data.session.active && !data.session.paused && data.session.endsAt) {
    const remainingMin = Math.max(0, Math.round((data.session.endsAt - Date.now()) / 60000));
    document.getElementById("timeLeftLine").textContent =
      remainingMin > 0
        ? `Only ${remainingMin} minute${remainingMin === 1 ? "" : "s"} left in this session.`
        : "Your session is wrapping up — nearly there.";
  } else {
    document.getElementById("timeLeftLine").textContent = "Your focus session has ended.";
  }

  document.getElementById("continueBtn").addEventListener("click", () => {
    history.length > 1 ? history.back() : (location.href = "https://www.youtube.com/watch");
  });
});
