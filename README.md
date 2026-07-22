# YouTube Focus Mode

A Manifest V3 Chrome extension that helps you study on YouTube distraction-free:
a focus timer, Strict Mode locking, distraction removal, a channel whitelist,
stats, streaks, and achievements — all stored locally with `chrome.storage.local`.

## Folder structure

```
youtube-focus-mode/
├── manifest.json
├── background.js        # service worker — timer engine, alarms, notifications, achievements
├── content.js            # runs on youtube.com — hides distractions, enforces Strict Mode, floating timer
├── utils.js               # shared helpers (time formatting, date keys, etc.)
├── storage.js             # single source of truth for all persisted data
├── popup.html / .css / .js        # the toolbar popup (Timer / Stats / Badges tabs)
├── options.html / .css / .js      # full settings page
├── blocked.html / .css / .js      # "Stay Focused" page shown when Strict Mode blocks a page
├── styles/
│   ├── theme.css          # shared design tokens (colors, type, dark/light)
│   └── content.css        # injected into YouTube for hiding elements + floating timer
├── icons/                 # 16 / 48 / 128 px toolbar + store icons
├── images/                 # (reserved for future illustration assets)
└── assets/                 # (reserved for future audio/sound-effect assets)
```

## Install locally (Load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `youtube-focus-mode` folder.
5. The Focus Mode icon appears in your toolbar — pin it for quick access.

## How it works

- **Timer** — Pick a duration (or a custom one) and hit *Start Focus Session*. The
  timer lives in the background service worker and is scheduled with
  `chrome.alarms`, so it keeps running even if the popup is closed, and survives
  a browser restart (the session's `endsAt` timestamp is persisted and
  reconciled on `onStartup`).
- **Strict Mode** — When on, the session can't be paused or stopped early, and
  `content.js` redirects any non-watch, non-whitelisted page (Home, Shorts,
  Explore, Trending, Gaming, Music, Live, Community, Subscriptions,
  Notifications) to the `blocked.html` motivational page.
- **Channel whitelist** — Configured on the Options page. During Strict Mode,
  only videos from whitelisted channels are allowed; everything else is
  blocked with a clear message.
- **Distraction removal** — `styles/content.css` hides comments, related/recommended
  videos, the sidebar, live chat, Shorts shelves, end-screen suggestions, the
  notification bell, mini player, Create button, and community posts whenever
  a session is active.
- **Floating timer** — A small draggable pill shows the remaining time directly
  on the YouTube page.
- **Stats & Achievements** — Tracked in `chrome.storage.local` and surfaced in
  the popup's Stats and Badges tabs: total focus time, today's time, sessions
  completed, videos finished, distractions blocked, longest session, current
  and best streaks, plus 8 unlockable badges.
- **Daily goal & weekly chart** — Set a daily goal in Options; the popup shows
  progress and a 7-day bar chart.
- **Dark / Light / System theme** — Toggle in Options; applied via a
  `data-theme` attribute and CSS custom properties shared across every page.
- **Import / Export / Reset** — Options page can export settings + whitelist to
  JSON, import them back, or reset all statistics.
- **Keyboard shortcut** — `Ctrl+Shift+F` (`Cmd+Shift+F` on Mac) starts a session
  with your default duration. Customize it at `chrome://extensions/shortcuts`.

## Testing guide

1. **Basic timer** — Open the popup, pick 15m, click Start. Confirm the ring
   counts down and the toolbar badge shows remaining minutes.
2. **Persistence** — Start a session, close Chrome entirely, reopen it. The
   popup should show the session still running with the correct remaining
   time (verifies alarm + storage reconciliation).
3. **Distraction removal** — With a session active, open any YouTube watch
   page and confirm comments, related videos, and the sidebar are hidden.
4. **Strict Mode block** — Enable Strict Mode, start a session, then try
   navigating to `youtube.com/feed/trending` or Shorts. You should land on
   the blocked page with a reason and a Continue button.
5. **Whitelist** — Add a channel in Options, start a Strict session, watch a
   video from that channel (should play normally) vs. a non-whitelisted
   channel (should redirect to the blocked page).
6. **Pause/Stop guard** — With Strict Mode on, confirm the Pause and End
   Session buttons are disabled in the popup and clicking End Session (if
   forced via a bug) is rejected by the background worker.
7. **Session completion** — Let a short custom session (e.g. 1 minute) run to
   completion; confirm the "Congratulations" notification fires, stats update,
   and any newly-earned achievement unlocks.
8. **Theme** — Switch between Light / Dark / System in Options and confirm
   the popup, options, and blocked pages all restyle consistently.
9. **Import/Export** — Export settings, change a few values, re-import the
   exported file, and confirm the original values return.

## Chrome Web Store publishing notes

- Replace the placeholder icons in `icons/` with your final artwork if desired
  (current icons are generated programmatically and are safe to ship, but you
  may want a custom brand mark).
- Manifest V3, no remote code, no remote fonts, and no external network calls —
  this keeps the review footprint minimal and avoids the most common causes of
  rejection.
- `host_permissions` are scoped only to `youtube.com` / `m.youtube.com`, and
  the `tabs` permission is used only for internal messaging, not for reading
  URLs of other sites — call this out plainly in your store listing's
  permission justification.
- Write a short, honest description of what Strict Mode does (it restricts
  navigation) since reviewers pay close attention to any feature that changes
  browsing behavior.
- Add 1-2 screenshots of the popup (Timer + Stats tabs) and the blocked page
  for your store listing — both are visually distinctive and communicate the
  extension's purpose quickly.
- Bump `version` in `manifest.json` for every subsequent submission.

## Notes on scope

A few "Bonus Features" from the original spec (optional password protection
for ending sessions, AI-generated motivational quotes, focus music) are left
as natural extension points rather than shipped by default, since they'd add
either an external dependency (AI quotes) or additional local audio assets
(focus music) beyond what's needed for a solid v1. The Pomodoro settings,
daily goals, streaks, achievements, whitelist, dark mode, and all blocking
behavior are fully implemented and wired end-to-end.
