/**
 * storage.js
 * Central data model for YouTube Focus Mode.
 * Everything is persisted with chrome.storage.local under a single "focusData" key
 * so reads/writes are atomic-ish and easy to reason about.
 */

const FocusStorage = (() => {
  const STORAGE_KEY = "focusData";

  const DEFAULT_ACHIEVEMENTS = [
    { id: "first_session", name: "First Session", desc: "Complete your first focus session", icon: "🌱", unlocked: false },
    { id: "one_hour", name: "One Hour", desc: "Accumulate 1 hour of focus time", icon: "⏰", unlocked: false },
    { id: "five_hours", name: "Five Hours", desc: "Accumulate 5 hours of focus time", icon: "🔥", unlocked: false },
    { id: "ten_sessions", name: "Ten Sessions", desc: "Complete 10 focus sessions", icon: "🎯", unlocked: false },
    { id: "seven_day_streak", name: "Seven Day Streak", desc: "Focus 7 days in a row", icon: "📅", unlocked: false },
    { id: "thirty_day_streak", name: "Thirty Day Streak", desc: "Focus 30 days in a row", icon: "🏆", unlocked: false },
    { id: "focus_master", name: "Focus Master", desc: "Accumulate 25 hours of focus time", icon: "🧠", unlocked: false },
    { id: "youtube_ninja", name: "YouTube Ninja", desc: "Block 100 distractions", icon: "🥷", unlocked: false }
  ];

  function defaultData() {
    return {
      version: 1,
      settings: {
        defaultDurationMinutes: 25,
        strictMode: false,
        allowSearch: false,
        theme: "system", // "light" | "dark" | "system"
        notificationsEnabled: true,
        dailyGoalMinutes: 60,
        soundEffects: true,
        pomodoro: {
          enabled: false,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          sessionsBeforeLongBreak: 4
        }
      },
      whitelist: [
        "freeCodeCamp",
        "Apna College",
        "CodeWithHarry",
        "MIT OpenCourseWare",
        "Harvard CS50"
      ],
      session: {
        active: false,
        startedAt: null,
        durationMinutes: 25,
        endsAt: null,
        paused: false,
        pausedAt: null,
        remainingSecondsAtPause: null,
        videosWatchedThisSession: 0,
        distractionsBlockedThisSession: 0
      },
      stats: {
        totalFocusMinutes: 0,
        sessionsCompleted: 0,
        videosFinished: 0,
        distractionsBlocked: 0,
        longestSessionMinutes: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastActiveDay: null,
        dailyMinutes: {},   // { "2026-07-22": 45 }
        weeklyMinutes: {}   // { "2026-W29": 210 }
      },
      achievements: DEFAULT_ACHIEVEMENTS
    };
  }

  /** Deep merge defaults with saved data so new fields introduced in updates don't break old installs */
  function mergeDefaults(saved, defaults) {
    if (typeof defaults !== "object" || defaults === null || Array.isArray(defaults)) {
      return saved === undefined ? defaults : saved;
    }
    const out = { ...defaults };
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(saved)) {
        out[key] = key in defaults ? mergeDefaults(saved[key], defaults[key]) : saved[key];
      }
    }
    return out;
  }

  function get() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const merged = mergeDefaults(result[STORAGE_KEY], defaultData());
        resolve(merged);
      });
    });
  }

  function set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve(data));
    });
  }

  /** Convenience: read-modify-write */
  async function update(mutator) {
    const data = await get();
    const next = (await mutator(data)) || data;
    await set(next);
    return next;
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        callback(changes[STORAGE_KEY].newValue, changes[STORAGE_KEY].oldValue);
      }
    });
  }

  return { STORAGE_KEY, defaultData, get, set, update, onChange, DEFAULT_ACHIEVEMENTS };
})();

if (typeof window !== "undefined") window.FocusStorage = FocusStorage;
if (typeof self !== "undefined") self.FocusStorage = FocusStorage;
