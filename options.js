/**
 * options.js
 * Loads settings into the options form, persists changes, manages the
 * channel whitelist, and handles import/export/reset actions.
 */

let data = null;

document.addEventListener("DOMContentLoaded", async () => {
  data = await FocusStorage.get();
  document.documentElement.setAttribute("data-theme", data.settings.theme || "system");
  populateForm();
  bindEvents();
});

function populateForm() {
  const s = data.settings;

  setSelect("defaultDuration", s.defaultDurationMinutes);

  const goalPresets = [60, 120, 180];
  if (goalPresets.includes(s.dailyGoalMinutes)) {
    setSelect("dailyGoal", s.dailyGoalMinutes);
  } else {
    setSelect("dailyGoal", "custom");
    document.getElementById("dailyGoalCustom").value = s.dailyGoalMinutes;
    document.getElementById("dailyGoalCustom").classList.remove("hidden");
  }

  document.getElementById("notificationsEnabled").checked = s.notificationsEnabled;
  document.getElementById("soundEffects").checked = s.soundEffects;
  setSelect("themeSelect", s.theme);

  document.getElementById("pomodoroEnabled").checked = s.pomodoro.enabled;
  setSelect("shortBreak", s.pomodoro.shortBreakMinutes);
  setSelect("longBreak", s.pomodoro.longBreakMinutes);
  setSelect("sessionsBeforeLongBreak", s.pomodoro.sessionsBeforeLongBreak);

  renderChips();
}

function setSelect(id, value) {
  document.getElementById(id).value = String(value);
}

function bindEvents() {
  document.getElementById("defaultDuration").addEventListener("change", (e) =>
    persist((d) => (d.settings.defaultDurationMinutes = parseInt(e.target.value, 10)))
  );

  const dailyGoalSelect = document.getElementById("dailyGoal");
  const dailyGoalCustom = document.getElementById("dailyGoalCustom");
  dailyGoalSelect.addEventListener("change", (e) => {
    if (e.target.value === "custom") {
      dailyGoalCustom.classList.remove("hidden");
      dailyGoalCustom.focus();
    } else {
      dailyGoalCustom.classList.add("hidden");
      persist((d) => (d.settings.dailyGoalMinutes = parseInt(e.target.value, 10)));
    }
  });
  dailyGoalCustom.addEventListener("change", (e) => {
    const v = FocusUtils.clamp(parseInt(e.target.value, 10) || 60, 10, 960);
    persist((d) => (d.settings.dailyGoalMinutes = v));
  });

  document.getElementById("notificationsEnabled").addEventListener("change", (e) =>
    persist((d) => (d.settings.notificationsEnabled = e.target.checked))
  );
  document.getElementById("soundEffects").addEventListener("change", (e) =>
    persist((d) => (d.settings.soundEffects = e.target.checked))
  );
  document.getElementById("themeSelect").addEventListener("change", (e) => {
    document.documentElement.setAttribute("data-theme", e.target.value);
    persist((d) => (d.settings.theme = e.target.value));
  });

  document.getElementById("pomodoroEnabled").addEventListener("change", (e) =>
    persist((d) => (d.settings.pomodoro.enabled = e.target.checked))
  );
  document.getElementById("shortBreak").addEventListener("change", (e) =>
    persist((d) => (d.settings.pomodoro.shortBreakMinutes = parseInt(e.target.value, 10)))
  );
  document.getElementById("longBreak").addEventListener("change", (e) =>
    persist((d) => (d.settings.pomodoro.longBreakMinutes = parseInt(e.target.value, 10)))
  );
  document.getElementById("sessionsBeforeLongBreak").addEventListener("change", (e) =>
    persist((d) => (d.settings.pomodoro.sessionsBeforeLongBreak = parseInt(e.target.value, 10)))
  );

  document.getElementById("addChannelBtn").addEventListener("click", addChannelFromInput);
  document.getElementById("channelInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChannelFromInput();
    }
  });

  document.getElementById("exportBtn").addEventListener("click", exportSettings);
  document.getElementById("importInput").addEventListener("change", importSettings);
  document.getElementById("resetStatsBtn").addEventListener("click", resetStatistics);
}

async function persist(mutator) {
  data = await FocusStorage.update((d) => {
    mutator(d);
    return d;
  });
  flashSaved();
}

function flashSaved() {
  const note = document.getElementById("saveNote");
  note.textContent = "Saved ✓";
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => (note.textContent = ""), 1400);
}

// ---------- Whitelist ----------

function renderChips() {
  const container = document.getElementById("channelChips");
  container.innerHTML = "";
  data.whitelist.forEach((name) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${escapeHtml(name)}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeChannel(name));
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function addChannelFromInput() {
  const input = document.getElementById("channelInput");
  const name = input.value.trim();
  if (!name) return;
  if (data.whitelist.some((c) => c.toLowerCase() === name.toLowerCase())) {
    input.value = "";
    return;
  }
  data = await FocusStorage.update((d) => {
    d.whitelist.push(name);
    return d;
  });
  input.value = "";
  renderChips();
  flashSaved();
}

async function removeChannel(name) {
  data = await FocusStorage.update((d) => {
    d.whitelist = d.whitelist.filter((c) => c !== name);
    return d;
  });
  renderChips();
  flashSaved();
}

// ---------- Import / Export / Reset ----------

function exportSettings() {
  const exportable = {
    settings: data.settings,
    whitelist: data.whitelist
  };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "youtube-focus-mode-settings.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importSettings(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      data = await FocusStorage.update((d) => {
        if (parsed.settings) d.settings = { ...d.settings, ...parsed.settings };
        if (Array.isArray(parsed.whitelist)) d.whitelist = parsed.whitelist;
        return d;
      });
      populateForm();
      flashSaved();
    } catch (err) {
      const note = document.getElementById("saveNote");
      note.style.color = "var(--danger)";
      note.textContent = "Import failed — invalid file";
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

async function resetStatistics() {
  if (!confirm("Reset all statistics and achievements? This can't be undone.")) return;
  data = await FocusStorage.update((d) => {
    const defaults = FocusStorage.defaultData();
    d.stats = defaults.stats;
    d.achievements = defaults.achievements;
    return d;
  });
  flashSaved();
}
