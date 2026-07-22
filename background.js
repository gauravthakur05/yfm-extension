/**
 * background.js
 * MV3 service worker. Owns the source of truth for the focus timer so it survives
 * popup close and browser restart (session state + endsAt timestamp live in storage,
 * and chrome.alarms wakes the worker even after it's been unloaded).
 */

importScripts("utils.js", "storage.js");

const TICK_ALARM = "focus-tick";
const SESSION_END_ALARM = "focus-session-end";

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(async () => {
  const data = await FocusStorage.get();
  await FocusStorage.set(data); // ensures defaults are persisted on first install
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 / 60 * 30 }); // ~ every 0.5 min tick to keep worker alive & badge fresh
});

chrome.runtime.onStartup.addListener(async () => {
  await reconcileSessionOnStartup();
});

reconcileSessionOnStartup();

async function reconcileSessionOnStartup() {
  const data = await FocusStorage.get();
  if (data.session.active && !data.session.paused && data.session.endsAt) {
    const remainingMs = data.session.endsAt - Date.now();
    if (remainingMs <= 0) {
      await completeSession();
    } else {
      scheduleSessionEndAlarm(remainingMs);
      updateBadge(data);
    }
  }
}

// ---------- Alarms ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SESSION_END_ALARM) {
    await completeSession();
  } else if (alarm.name === TICK_ALARM) {
    const data = await FocusStorage.get();
    if (data.session.active && !data.session.paused) {
      updateBadge(data);
      if (data.session.endsAt && Date.now() >= data.session.endsAt) {
        await completeSession();
      }
    }
  }
});

function scheduleSessionEndAlarm(remainingMs) {
  chrome.alarms.create(SESSION_END_ALARM, { when: Date.now() + remainingMs });
}

function updateBadge(data) {
  if (!data.session.active) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const remainingSec = data.session.paused
    ? data.session.remainingSecondsAtPause
    : Math.max(0, Math.round((data.session.endsAt - Date.now()) / 1000));
  const mins = Math.ceil(remainingSec / 60);
  chrome.action.setBadgeText({ text: data.session.paused ? "❚❚" : String(mins) });
  chrome.action.setBadgeBackgroundColor({ color: data.session.paused ? "#f59e0b" : "#6d28d9" });
}

// ---------- Messaging API used by popup / options / content scripts ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // keep the message channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case "START_SESSION":
      return startSession(msg.durationMinutes);
    case "PAUSE_SESSION":
      return pauseSession();
    case "RESUME_SESSION":
      return resumeSession();
    case "STOP_SESSION":
      return stopSession(msg.force === true);
    case "GET_STATE":
      return FocusStorage.get();
    case "VIDEO_FINISHED":
      return recordVideoFinished();
    case "DISTRACTION_BLOCKED":
      return recordDistractionBlocked();
    case "PING":
      return { ok: true };
    default:
      return { ok: false, error: "Unknown message type: " + msg.type };
  }
}

// ---------- Session control ----------

async function startSession(durationMinutes) {
  const data = await FocusStorage.update((d) => {
    const now = Date.now();
    d.session = {
      active: true,
      startedAt: now,
      durationMinutes,
      endsAt: now + durationMinutes * 60 * 1000,
      paused: false,
      pausedAt: null,
      remainingSecondsAtPause: null,
      videosWatchedThisSession: 0,
      distractionsBlockedThisSession: 0
    };
    return d;
  });
  scheduleSessionEndAlarm(durationMinutes * 60 * 1000);
  updateBadge(data);
  notify("Ready to Focus?", `Your ${durationMinutes} minute focus session has started. Stay on track!`);
  broadcast({ type: "SESSION_UPDATED", data });
  return data;
}

async function pauseSession() {
  const data = await FocusStorage.update((d) => {
    if (!d.session.active || d.session.paused) return d;
    if (d.settings.strictMode) return d; // strict mode: pausing is disallowed
    const remainingMs = Math.max(0, d.session.endsAt - Date.now());
    d.session.paused = true;
    d.session.pausedAt = Date.now();
    d.session.remainingSecondsAtPause = Math.round(remainingMs / 1000);
    return d;
  });
  chrome.alarms.clear(SESSION_END_ALARM);
  updateBadge(data);
  broadcast({ type: "SESSION_UPDATED", data });
  return data;
}

async function resumeSession() {
  const data = await FocusStorage.update((d) => {
    if (!d.session.active || !d.session.paused) return d;
    const remainingMs = (d.session.remainingSecondsAtPause || 0) * 1000;
    d.session.endsAt = Date.now() + remainingMs;
    d.session.paused = false;
    d.session.pausedAt = null;
    d.session.remainingSecondsAtPause = null;
    return d;
  });
  if (data.session.active && !data.session.paused) {
    scheduleSessionEndAlarm(data.session.endsAt - Date.now());
  }
  updateBadge(data);
  broadcast({ type: "SESSION_UPDATED", data });
  return data;
}

async function stopSession(force) {
  const data = await FocusStorage.get();
  if (data.session.active && data.settings.strictMode && !force) {
    return { ok: false, error: "Strict mode is enabled. Cannot stop the session early." };
  }
  chrome.alarms.clear(SESSION_END_ALARM);
  const next = await FocusStorage.update((d) => {
    d.session = FocusStorage.defaultData().session;
    return d;
  });
  chrome.action.setBadgeText({ text: "" });
  broadcast({ type: "SESSION_UPDATED", data: next });
  return next;
}

async function completeSession() {
  chrome.alarms.clear(SESSION_END_ALARM);
  const data = await FocusStorage.get();
  if (!data.session.active) return data;

  const durationMinutes = data.session.durationMinutes;
  const today = FocusUtils.todayKey();
  const week = FocusUtils.weekKey();

  const next = await FocusStorage.update((d) => {
    d.stats.totalFocusMinutes += durationMinutes;
    d.stats.sessionsCompleted += 1;
    d.stats.longestSessionMinutes = Math.max(d.stats.longestSessionMinutes, durationMinutes);
    d.stats.dailyMinutes[today] = (d.stats.dailyMinutes[today] || 0) + durationMinutes;
    d.stats.weeklyMinutes[week] = (d.stats.weeklyMinutes[week] || 0) + durationMinutes;

    // Streak calculation
    const lastActive = d.stats.lastActiveDay;
    if (lastActive !== today) {
      const yesterday = FocusUtils.todayKey(new Date(Date.now() - 86400000));
      d.stats.currentStreak = lastActive === yesterday ? d.stats.currentStreak + 1 : 1;
      d.stats.bestStreak = Math.max(d.stats.bestStreak, d.stats.currentStreak);
      d.stats.lastActiveDay = today;
    }

    d.session = { ...FocusStorage.defaultData().session };
    d.session.lastCompleted = {
      durationMinutes,
      videosWatched: data.session.videosWatchedThisSession,
      distractionsBlocked: data.session.distractionsBlockedThisSession,
      completedAt: Date.now()
    };

    d.achievements = checkAchievements(d);
    return d;
  });

  chrome.action.setBadgeText({ text: "" });
  notify("Congratulations! 🎉", "You completed your focus session without distractions.");
  broadcast({ type: "SESSION_COMPLETED", data: next });
  return next;
}

async function recordVideoFinished() {
  const data = await FocusStorage.update((d) => {
    if (d.session.active) d.session.videosWatchedThisSession += 1;
    d.stats.videosFinished += 1;
    return d;
  });
  broadcast({ type: "SESSION_UPDATED", data });
  return data;
}

async function recordDistractionBlocked() {
  const data = await FocusStorage.update((d) => {
    if (d.session.active) d.session.distractionsBlockedThisSession += 1;
    d.stats.distractionsBlocked += 1;
    d.achievements = checkAchievements(d);
    return d;
  });
  return data;
}

// ---------- Achievements ----------

function checkAchievements(d) {
  const unlock = (id) => {
    const a = d.achievements.find((x) => x.id === id);
    if (a && !a.unlocked) {
      a.unlocked = true;
      a.unlockedAt = Date.now();
      notify("Achievement Unlocked! 🏅", a.name);
    }
  };

  if (d.stats.sessionsCompleted >= 1) unlock("first_session");
  if (d.stats.totalFocusMinutes >= 60) unlock("one_hour");
  if (d.stats.totalFocusMinutes >= 300) unlock("five_hours");
  if (d.stats.sessionsCompleted >= 10) unlock("ten_sessions");
  if (d.stats.currentStreak >= 7) unlock("seven_day_streak");
  if (d.stats.currentStreak >= 30) unlock("thirty_day_streak");
  if (d.stats.totalFocusMinutes >= 1500) unlock("focus_master");
  if (d.stats.distractionsBlocked >= 100) unlock("youtube_ninja");

  return d.achievements;
}

// ---------- Notifications ----------

async function notify(title, message) {
  const data = await FocusStorage.get();
  if (!data.settings.notificationsEnabled) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 1
  });
}

// ---------- Broadcast to open extension views (popup/options) ----------

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* no listeners open; ignore */
  });
}

// ---------- Keyboard shortcut ----------

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "start-focus-session") {
    const data = await FocusStorage.get();
    if (!data.session.active) {
      await startSession(data.settings.defaultDurationMinutes);
    }
  }
});
