const armButton = document.getElementById("arm-button");
const clearButton = document.getElementById("clear-button");
const status = document.getElementById("status");
const positionInput = document.getElementById("position-input");
const durationInput = document.getElementById("duration-input");
const durationValue = document.getElementById("duration-value");
const soundInput = document.getElementById("sound-input");
const soundValue = document.getElementById("sound-value");

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function refreshStatus() {
  const { tabId } = await chrome.runtime.sendMessage({ type: "GET_ARMED_TAB" });
  if (!tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    status.textContent = `Armed: ${tab.title || "current tab"}`;
  } catch { status.textContent = "No tab armed."; }
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
  const tab = await currentTab();
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || "")) {
    status.textContent = "Open a normal website or local file first.";
    return;
  }
  const result = await chrome.runtime.sendMessage({ type: "ARM_CURRENT_TAB", tab: { id: tab.id, title: tab.title } });
  status.textContent = result.ok ? `Armed: ${result.title}` : "Could not arm this tab.";
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_ARMED_TAB" });
  status.textContent = "No tab armed.";
});

positionInput.addEventListener("change", saveSettings);
durationInput.addEventListener("change", saveSettings);
soundInput.addEventListener("change", saveSettings);
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then(renderSettings);
refreshStatus();
