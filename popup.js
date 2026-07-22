/**
 * popup.js
 * Drives the popup UI: tabs, duration selection, live countdown ring,
 * toggles, stats display, and achievements grid.
 */

let state = null;
let selectedDuration = 25;
let tickHandle = null;
const RING_CIRCUMFERENCE = 2 * Math.PI * 62; // matches r=62 in popup.html

document.addEventListener("DOMContentLoaded", init);

async function init() {
  applyTheme();
  bindTabs();
  bindDurationGrid();
  bindToggles();
  bindActions();
  document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

  state = await send({ type: "GET_STATE" });
  render();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SESSION_UPDATED" || msg.type === "SESSION_COMPLETED") {
      state = msg.data;
      render();
    }
  });

  startTicking();
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function applyTheme() {
  const data = await FocusStorage.get();
  document.documentElement.setAttribute("data-theme", data.settings.theme || "system");
}

// ---------- Tabs ----------

function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ---------- Duration selection ----------

function bindDurationGrid() {
  const grid = document.getElementById("durationGrid");
  const customInput = document.getElementById("customMinutes");

  grid.addEventListener("click", (e) => {
    const chip = e.target.closest(".duration-chip");
    if (!chip) return;
    grid.querySelectorAll(".duration-chip").forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");

    if (chip.dataset.mins === "custom") {
      customInput.classList.remove("hidden");
      customInput.focus();
      selectedDuration = parseInt(customInput.value, 10) || 0;
    } else {
      customInput.classList.add("hidden");
      selectedDuration = parseInt(chip.dataset.mins, 10);
    }
  });

  customInput.addEventListener("input", () => {
    selectedDuration = FocusUtils.clamp(parseInt(customInput.value, 10) || 0, 1, 480);
  });

  // Pre-select the 25m chip by default
  grid.querySelector('[data-mins="25"]').classList.add("selected");
}

// ---------- Toggles ----------

function bindToggles() {
  const strict = document.getElementById("strictModeToggle");
  const search = document.getElementById("allowSearchToggle");

  strict.addEventListener("change", async () => {
    await FocusStorage.update((d) => {
      d.settings.strictMode = strict.checked;
      return d;
    });
  });

  search.addEventListener("change", async () => {
    await FocusStorage.update((d) => {
      d.settings.allowSearch = search.checked;
      return d;
    });
  });
}

// ---------- Session actions ----------

function bindActions() {
  document.getElementById("startBtn").addEventListener("click", async () => {
    if (!selectedDuration || selectedDuration < 1) return;
    state = await send({ type: "START_SESSION", durationMinutes: selectedDuration });
    render();
  });

  document.getElementById("pauseResumeBtn").addEventListener("click", async () => {
    if (state.session.paused) {
      state = await send({ type: "RESUME_SESSION" });
    } else {
      state = await send({ type: "PAUSE_SESSION" });
    }
    render();
  });

  document.getElementById("stopBtn").addEventListener("click", async () => {
    const result = await send({ type: "STOP_SESSION" });
    if (result && result.ok === false) {
      shake(document.getElementById("strictNote"));
      return;
    }
    state = result;
    render();
  });
}

function shake(el) {
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(0)" }
    ],
    { duration: 300 }
  );
}

// ---------- Rendering ----------

function render() {
  if (!state) return;
  renderTimerStage();
  renderToggles();
  renderGoal();
  renderStats();
  renderAchievements();
}

function renderTimerStage() {
  const idle = document.getElementById("idleStage");
  const active = document.getElementById("activeStage");
  const strictNote = document.getElementById("strictNote");

  if (state.session.active) {
    idle.classList.add("hidden");
    active.classList.remove("hidden");

    const pauseBtn = document.getElementById("pauseResumeBtn");
    const stopBtn = document.getElementById("stopBtn");
    const isStrict = state.settings.strictMode;

    pauseBtn.textContent = state.session.paused ? "Resume" : "Pause";
    pauseBtn.disabled = isStrict;
    stopBtn.disabled = isStrict;
    strictNote.classList.toggle("hidden", !isStrict);

    document.getElementById("miniVideos").textContent = state.session.videosWatchedThisSession;
    document.getElementById("miniBlocked").textContent = state.session.distractionsBlockedThisSession;

    updateRing();
  } else {
    idle.classList.remove("hidden");
    active.classList.add("hidden");
  }
}

function updateRing() {
  const ring = document.getElementById("ringProgress");
  const timeEl = document.getElementById("ringTime");
  const labelEl = document.getElementById("ringLabel");

  const totalSec = state.session.durationMinutes * 60;
  let remainingSec;
  if (state.session.paused) {
    remainingSec = state.session.remainingSecondsAtPause || 0;
    labelEl.textContent = "paused";
  } else {
    remainingSec = Math.max(0, Math.round((state.session.endsAt - Date.now()) / 1000));
    labelEl.textContent = "remaining";
  }

  const fraction = totalSec > 0 ? remainingSec / totalSec : 0;
  ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
  timeEl.textContent = FocusUtils.formatTime(remainingSec);
}

function renderToggles() {
  document.getElementById("strictModeToggle").checked = !!state.settings.strictMode;
  document.getElementById("allowSearchToggle").checked = !!state.settings.allowSearch;
}

function renderGoal() {
  const today = FocusUtils.todayKey();
  const minutesToday = state.stats.dailyMinutes[today] || 0;
  const goal = state.settings.dailyGoalMinutes || 60;
  const pct = FocusUtils.clamp(Math.round((minutesToday / goal) * 100), 0, 100);

  document.getElementById("goalPercent").textContent = pct + "%";
  document.getElementById("goalFill").style.width = pct + "%";
  document.getElementById("goalSub").textContent = `${FocusUtils.formatMinutes(minutesToday)} of ${FocusUtils.formatMinutes(goal)}`;
}

function renderStats() {
  const s = state.stats;
  const today = FocusUtils.todayKey();

  document.getElementById("statTotal").textContent = FocusUtils.formatMinutes(s.totalFocusMinutes);
  document.getElementById("statToday").textContent = FocusUtils.formatMinutes(s.dailyMinutes[today] || 0);
  document.getElementById("statSessions").textContent = s.sessionsCompleted;
  document.getElementById("statVideos").textContent = s.videosFinished;
  document.getElementById("statBlocked").textContent = s.distractionsBlocked;
  document.getElementById("statLongest").textContent = FocusUtils.formatMinutes(s.longestSessionMinutes);
  document.getElementById("statStreak").textContent = `${s.currentStreak} 🔥`;
  document.getElementById("statBestStreak").textContent = s.bestStreak;

  renderWeekBars();
}

function renderWeekBars() {
  const container = document.getElementById("weekBars");
  container.innerHTML = "";
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({ key: FocusUtils.todayKey(d), label: d.toLocaleDateString(undefined, { weekday: "narrow" }) });
  }
  const values = days.map((d) => state.stats.dailyMinutes[d.key] || 0);
  const max = Math.max(...values, 30);

  days.forEach((d, i) => {
    const col = document.createElement("div");
    col.className = "week-bar-col";
    const bar = document.createElement("div");
    bar.className = "week-bar";
    const heightPct = Math.max(3, Math.round((values[i] / max) * 100));
    bar.style.height = heightPct + "%";
    const label = document.createElement("div");
    label.className = "week-bar-label";
    label.textContent = d.label;
    col.appendChild(bar);
    col.appendChild(label);
    container.appendChild(col);
  });
}

function renderAchievements() {
  const grid = document.getElementById("achievementsGrid");
  grid.innerHTML = "";
  state.achievements.forEach((a) => {
    const el = document.createElement("div");
    el.className = "badge" + (a.unlocked ? " unlocked" : "");
    el.innerHTML = `
      <div class="badge-icon">${a.icon}</div>
      <div class="badge-name">${a.name}</div>
      <div class="badge-desc">${a.desc}</div>
    `;
    grid.appendChild(el);
  });
}

// ---------- Local ticking (smooth countdown between broadcast updates) ----------

function startTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (state && state.session.active && !state.session.paused) {
      updateRing();
    }
  }, 1000);
}
