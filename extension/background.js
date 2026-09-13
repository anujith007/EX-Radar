let armedTabId = null;
const DEFAULT_SETTINGS = Object.freeze({
  position: "top-right",
  durationSeconds: 10,
  soundIntensity: 1
});

async function restoreArmedTab() {
  const saved = await chrome.storage.session.get("armedTabId");
  armedTabId = saved.armedTabId ?? null;
}

restoreArmedTab();

async function armTab(tab) {
  armedTabId = tab.id;
  await chrome.storage.session.set({ armedTabId });
  return { ok: true, tabId: armedTabId, title: tab.title || "Current tab" };
}

async function clearArmedTab() {
  armedTabId = null;
  await chrome.storage.session.remove("armedTabId");
}

async function getSettings() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...saved };
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ARM_CURRENT_TAB") {
    armTab(message.tab).then(sendResponse);
    return true;
  }

  if (message.type === "GET_ARMED_TAB") {
    sendResponse({ tabId: armedTabId });
    return;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    const settings = sanitizeSettings(message.settings || {});
    chrome.storage.sync.set(settings)
      .then(() => sendSettingsToScannerTabs(settings))
      .then(() => sendResponse(settings));
    return true;
  }

  if (message.type === "CLEAR_ARMED_TAB") {
    clearArmedTab().then(() => sendResponse({ ok: true }));
    return true;
  }

  // This message can only originate from the local Ex Radar app content script.
  if (message.type === "EX_RADAR_MATCH" && sender.tab?.url?.match(/^(https?:\/\/(localhost|127\.0\.0\.1)(:|\/)|file:)/)) {
    if (!armedTabId) return;
    getSettings().then((settings) => {
      chrome.tabs.sendMessage(armedTabId, {
        type: "SHOW_EX_RADAR_ALERT",
        roast: message.roast,
        distance: message.distance,
        settings
      }, () => {
        // A closed or restricted tab cannot receive a content-script message.
        if (chrome.runtime.lastError) clearArmedTab();
      });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === armedTabId) clearArmedTab();
});
