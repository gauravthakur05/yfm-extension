/**
 * content.js
 * Runs on youtube.com. Responsible for:
 *  - Hiding distracting UI elements
 *  - Enforcing Strict Mode navigation restrictions (redirect to blocked.html)
 *  - Enforcing the channel whitelist
 *  - Rendering the draggable floating timer
 *  - Detecting video completion to record stats
 */

(function () {
  let currentData = null;
  let floatingTimerEl = null;
  let tickInterval = null;

  const BLOCKED_PATH_PATTERNS = [
    { test: (u) => u.pathname === "/", label: "YouTube Home" },
    { test: (u) => u.pathname.startsWith("/shorts"), label: "Shorts" },
    { test: (u) => u.pathname.startsWith("/feed/explore"), label: "Explore" },
    { test: (u) => u.pathname.startsWith("/feed/trending"), label: "Trending" },
    { test: (u) => u.pathname.startsWith("/gaming"), label: "Gaming" },
    { test: (u) => u.pathname.startsWith("/music") || u.hostname.startsWith("music."), label: "Music" },
    { test: (u) => u.pathname.startsWith("/live") || (u.pathname === "/results" && u.searchParams.get("sp") === ""), label: "Live" },
    { test: (u) => u.pathname.startsWith("/feed/community") || u.pathname.startsWith("/community"), label: "Community" },
    { test: (u) => u.pathname.startsWith("/feed/subscriptions"), label: "Subscriptions" },
    { test: (u) => u.pathname.startsWith("/feed/notifications"), label: "Notifications" },
    { test: (u) => u.pathname === "/feed" && u.searchParams.has("recommended"), label: "Recommended Feed" }
  ];

  init();

  async function init() {
    currentData = await sendMessage({ type: "GET_STATE" });
    applyAllRules();
    enforceNavigation();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "SESSION_UPDATED" || msg.type === "SESSION_COMPLETED") {
        currentData = msg.data;
        applyAllRules();
        enforceNavigation();
      }
    });

    // YouTube is an SPA; watch for client-side navigations
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onUrlChanged();
      }
    }).observe(document, { subtree: true, childList: true });

    // Poll storage periodically as a safety net (covers alarm-driven changes in bg worker)
    setInterval(async () => {
      currentData = await sendMessage({ type: "GET_STATE" });
      applyAllRules();
    }, 5000);

    watchForVideoEnd();
  }

  function onUrlChanged() {
    enforceNavigation();
    applyAllRules();
    watchForVideoEnd();
  }

  // ---------- Rule application ----------

  function applyAllRules() {
    if (!currentData) return;
    const sessionActive = currentData.session.active && !currentData.session.paused;
    document.documentElement.classList.toggle("yfm-hide-distractions", sessionActive);
    document.documentElement.classList.toggle(
      "yfm-hide-search",
      sessionActive && !currentData.settings.allowSearch
    );
    renderFloatingTimer(sessionActive);
  }

  function enforceNavigation() {
    if (!currentData || !currentData.session.active || currentData.session.paused) return;
    if (!currentData.settings.strictMode) return;

    const url = new URL(location.href);

    // Allow watch pages that pass the whitelist check
    if (url.pathname === "/watch") {
      const channel = FocusUtils.getChannelNameFromDom();
      if (channel && currentData.whitelist.length > 0) {
        const allowed = currentData.whitelist.some(
          (name) => name.toLowerCase() === channel.toLowerCase()
        );
        if (!allowed) {
          redirectToBlocked("This channel is blocked during Focus Mode.");
          return;
        }
      }
      return; // watch page, whitelisted or no whitelist restriction configured
    }

    if (url.pathname.startsWith("/playlist")) return; // approved playlists allowed through

    for (const rule of BLOCKED_PATH_PATTERNS) {
      if (rule.test(url)) {
        redirectToBlocked(`${rule.label} is blocked during Focus Mode.`);
        return;
      }
    }
  }

  function redirectToBlocked(reason) {
    sendMessage({ type: "DISTRACTION_BLOCKED" });
    const blockedUrl = chrome.runtime.getURL("blocked.html") + "?reason=" + encodeURIComponent(reason);
    location.href = blockedUrl;
  }

  // ---------- Floating timer ----------

  function renderFloatingTimer(show) {
    if (!show) {
      if (floatingTimerEl) {
        floatingTimerEl.remove();
        floatingTimerEl = null;
      }
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      return;
    }

    if (!floatingTimerEl) {
      floatingTimerEl = document.createElement("div");
      floatingTimerEl.id = "yfm-floating-timer";
      floatingTimerEl.innerHTML = `
        <div class="yfm-label">⏳ Focus</div>
        <div class="yfm-time">--:--</div>
        <div class="yfm-sub">Remaining</div>
      `;
      document.documentElement.appendChild(floatingTimerEl);
      makeDraggable(floatingTimerEl);
    }

    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(updateFloatingTimerText, 1000);
    updateFloatingTimerText();
  }

  function updateFloatingTimerText() {
    if (!floatingTimerEl || !currentData || !currentData.session.active) return;
    const timeEl = floatingTimerEl.querySelector(".yfm-time");
    const paused = currentData.session.paused;
    floatingTimerEl.classList.toggle("yfm-paused", paused);
    let remainingSec;
    if (paused) {
      remainingSec = currentData.session.remainingSecondsAtPause || 0;
    } else {
      remainingSec = Math.max(0, Math.round((currentData.session.endsAt - Date.now()) / 1000));
    }
    timeEl.textContent = FocusUtils.formatTime(remainingSec) + (paused ? " ⏸" : "");
  }

  function makeDraggable(el) {
    let offsetX = 0, offsetY = 0, dragging = false;
    el.addEventListener("mousedown", (e) => {
      dragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = FocusUtils.clamp(e.clientX - offsetX, 0, window.innerWidth - el.offsetWidth) + "px";
      el.style.top = FocusUtils.clamp(e.clientY - offsetY, 0, window.innerHeight - el.offsetHeight) + "px";
      el.style.right = "auto";
    });
    document.addEventListener("mouseup", () => (dragging = false));
  }

  // ---------- Video completion tracking ----------

  function watchForVideoEnd() {
    const tryAttach = () => {
      const video = document.querySelector("video");
      if (video && !video.dataset.yfmBound) {
        video.dataset.yfmBound = "true";
        video.addEventListener("ended", () => {
          if (currentData && currentData.session.active) {
            sendMessage({ type: "VIDEO_FINISHED" });
          }
        });
      }
    };
    tryAttach();
    setTimeout(tryAttach, 1500);
    setTimeout(tryAttach, 4000);
  }

  // ---------- Messaging helper ----------

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => resolve(response));
    });
  }
})();
