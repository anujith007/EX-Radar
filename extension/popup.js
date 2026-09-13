const armButton = document.getElementById("arm-button");
const clearButton = document.getElementById("clear-button");
const status = document.getElementById("status");
const positionInput = document.getElementById("position-input");
const durationInput = document.getElementById("duration-input");
const durationValue = document.getElementById("duration-value");
const soundInput = document.getElementById("sound-input");
const soundValue = document.getElementById("sound-value");

async function currentWindow() {
  return chrome.windows.getCurrent();
}

async function refreshStatus() {
  const { windowId } = await chrome.runtime.sendMessage({ type: "GET_ARMED_WINDOW" });
  if (!windowId) return;
  try {
    const win = await chrome.windows.get(windowId);
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    status.textContent = win ? `Armed: this window (${tab?.title ? `active tab “${tab.title}”` : "all tabs"})` : "No window armed.";
  } catch {
    status.textContent = "No window armed.";
  }
}

function renderSettings(settings) {
  positionInput.value = settings.position;
  durationInput.value = settings.durationSeconds;
  soundInput.value = Math.round(settings.soundIntensity * 100);
  durationValue.textContent = `${durationInput.value} seconds`;
  soundValue.textContent = `${soundInput.value}%`;
}

async function saveSettings() {
  const settings = await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: {
      position: positionInput.value,
      durationSeconds: Number(durationInput.value),
      soundIntensity: Number(soundInput.value) / 100
    }
  });
  renderSettings(settings);
}

armButton.addEventListener("click", async () => {
  const win = await currentWindow();
  if (!win?.id) {
    status.textContent = "Could not identify this window.";
    return;
  }
  let result = null;
  try {
    result = await chrome.runtime.sendMessage({ type: "ARM_CURRENT_WINDOW", windowId: win.id });
  } catch {
    status.textContent = "Extension worker unreachable — reload it at chrome://extensions, then try again.";
    return;
  }
  if (result?.ok) {
    status.textContent = "Armed: this window — every tab will show alerts.";
  } else if (result === null || result === undefined) {
    status.textContent = "Extension updated — reload it at chrome://extensions, then try again.";
  } else {
    status.textContent = "Could not arm this window.";
  }
  refreshStatus();
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_ARMED_WINDOW" });
  status.textContent = "No window armed.";
});

positionInput.addEventListener("change", saveSettings);
durationInput.addEventListener("change", saveSettings);
soundInput.addEventListener("change", saveSettings);
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then(renderSettings);

// If the service worker predates window arming, tell the user to reload
// instead of letting every arm attempt fail with the generic message.
chrome.runtime.sendMessage({ type: "PING" }).then((pong) => {
  if (pong && pong.version < 2) {
    status.textContent = "Extension updated — click Reload at chrome://extensions, then reopen this popup.";
    armButton.disabled = true;
  }
}).catch(() => {
  status.textContent = "Extension worker unavailable — reload at chrome://extensions.";
  armButton.disabled = true;
});

refreshStatus();
