// Bump when the message protocol changes; the popup uses this to detect a
// stale service worker that was not reloaded after an update.
const BACKGROUND_VERSION = 2;
let armedWindowId = null;
const DEFAULT_SETTINGS = Object.freeze({
  position: "top-right",
  durationSeconds: 10,
  soundIntensity: 1
});

async function restoreArmedWindow() {
  const saved = await chrome.storage.session.get("armedWindowId");
  const id = saved.armedWindowId ?? null;
  if (id === null) return;
  // The stored window may have been closed while the worker was idle.
  try {
    await chrome.windows.get(id);
    armedWindowId = id;
  } catch {
    armedWindowId = null;
    await chrome.storage.session.remove("armedWindowId");
  }
}

restoreArmedWindow();

async function armCurrentWindow(windowId) {
  armedWindowId = windowId;
  await chrome.storage.session.set({ armedWindowId });
  return { ok: true, windowId };
}

async function clearArmedWindow() {
  armedWindowId = null;
  await chrome.storage.session.remove("armedWindowId");
}

let settingsCache = null;

async function getSettings() {
  if (!settingsCache) {
    settingsCache = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
  }
  return settingsCache;
}

// Warm the cache at worker start so match broadcasts never wait on storage.
getSettings();

function sanitizeSettings(settings) {
  const positions = ["top-right", "top-left", "bottom-right", "bottom-left"];
  const requestedDuration = Number(settings.durationSeconds);
  const requestedIntensity = Number(settings.soundIntensity);
  return {
    position: positions.includes(settings.position) ? settings.position : DEFAULT_SETTINGS.position,
    durationSeconds: Number.isFinite(requestedDuration)
      ? Math.min(30, Math.max(3, requestedDuration))
      : DEFAULT_SETTINGS.durationSeconds,
    soundIntensity: Number.isFinite(requestedIntensity)
      ? Math.min(1, Math.max(0, requestedIntensity))
      : DEFAULT_SETTINGS.soundIntensity
  };
}

async function sendSettingsToScannerTabs(settings) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url?.match(/^(https?:\/\/(localhost|127\.0\.0\.1)(:|\/)|file:)/)) continue;
    chrome.tabs.sendMessage(tab.id, { type: "EX_RADAR_SETTINGS", settings }, () => void chrome.runtime.lastError);
  }
}

// Deliver one alert to every armed-window tab whose content script can
// currently receive it; clean up IDs the browser already knows are gone.
function broadcastAlertToWindow(windowId, payload, onAllSettled) {
  chrome.tabs.query({ windowId }, (tabs) => {
    let pending = tabs.filter((tab) => tab.id).length;
    if (!pending) {
      onAllSettled(false);
      return;
    }
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, payload, () => {
        void chrome.runtime.lastError;
        pending -= 1;
        if (pending === 0) onAllSettled(true);
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ version: BACKGROUND_VERSION });
    return;
  }

  if (message.type === "ARM_CURRENT_WINDOW") {
    armCurrentWindow(message.windowId).then(sendResponse);
    return true;
  }

  if (message.type === "GET_ARMED_WINDOW") {
    sendResponse({ windowId: armedWindowId });
    return;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    const settings = sanitizeSettings(message.settings || {});
    settingsCache = settings;
    chrome.storage.sync.set(settings)
      .then(() => sendSettingsToScannerTabs(settings))
      .then(() => sendResponse(settings));
    return true;
  }

  if (message.type === "CLEAR_ARMED_WINDOW") {
    clearArmedWindow().then(() => sendResponse({ ok: true }));
    return true;
  }

  // Keep-alive pings from a running scan reset the worker's 30s idle timer,
  // so the match broadcast below starts from a warm worker and lands in the
  // same instant the scanner page plays its alarm sound.
  if (message.type === "SCAN_HEARTBEAT") {
    sendResponse({ ok: true });
    return;
  }

  // This message can only originate from the local Ex Radar app content script.
  if (message.type === "EX_RADAR_MATCH" && sender.tab?.url?.match(/^(https?:\/\/(localhost|127\.0\.0\.1)(:|\/)|file:)/)) {
    if (!armedWindowId) return;
    // No await before the broadcast: use the cached (always-sanitized) settings
    // so the banners go out synchronously with the alarm sound.
    const settings = settingsCache ?? DEFAULT_SETTINGS;
    if (!settingsCache) getSettings(); // refill for subsequent matches
    broadcastAlertToWindow(armedWindowId, {
      type: "SHOW_EX_RADAR_ALERT",
      roast: message.roast,
      distance: message.distance,
      settings
    }, (delivered) => {
      // Every tab failed — the window is gone; disarm.
      if (!delivered) clearArmedWindow();
    });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === armedWindowId) clearArmedWindow();
});
