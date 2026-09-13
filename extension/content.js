(() => {
  "use strict";

  const isLocalExRadarApp = window.location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  // Bridge only messages emitted by the scanner page. This is intentionally a
  // simple DOM message, not a network request and not a transfer of image data.
  if (isLocalExRadarApp) {
    // Keep the MV3 service worker alive while a scan is running so match
    // alerts broadcast instantly instead of waiting on a cold worker start.
    let heartbeatTimer = null;
    function setHeartbeat(active) {
      if (active && !heartbeatTimer) {
        heartbeatTimer = window.setInterval(() => {
          chrome.runtime.sendMessage({ type: "SCAN_HEARTBEAT" }, () => void chrome.runtime.lastError);
        }, 20000);
        chrome.runtime.sendMessage({ type: "SCAN_HEARTBEAT" }, () => void chrome.runtime.lastError);
      } else if (!active && heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.channel !== "ex-radar") return;
      if (event.data.type === "MATCH_DETECTED") {
        chrome.runtime.sendMessage({
          type: "EX_RADAR_MATCH",
          roast: event.data.roast,
          distance: event.data.distance
        });
      } else if (event.data.type === "SCAN_STARTED") {
        setHeartbeat(true);
      } else if (event.data.type === "SCAN_STOPPED") {
        setHeartbeat(false);
      }
    });

    async function syncSettingsToScanner() {
      const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      window.postMessage({
        channel: "ex-radar-extension",
        type: "SETTINGS_CHANGED",
        settings
      }, window.location.protocol === "file:" ? "*" : window.location.origin);
    }
    syncSettingsToScanner();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "EX_RADAR_SETTINGS") syncSettingsToScanner();
    });
  }

  function showDetectorBanner({ roast, distance, settings = {} }) {
    const existing = document.getElementById("ex-radar-extension-host");
    existing?.remove();

    const host = document.createElement("div");
    host.id = "ex-radar-extension-host";
    const position = {
      "top-right": "top:20px;right:20px;",
      "top-left": "top:20px;left:20px;",
      "bottom-right": "bottom:20px;right:20px;",
      "bottom-left": "bottom:20px;left:20px;"
    }[settings.position] || "top:20px;right:20px;";
    const duration = Math.min(30, Math.max(3, Number(settings.durationSeconds) || 10)) * 1000;
    host.style.cssText = `all: initial; position: fixed; z-index: 2147483647; ${position} width: min(380px, calc(100vw - 32px));`;
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .alert { box-sizing: border-box; overflow: hidden; border: 1px solid rgba(255,179,221,.6); border-radius: 16px; color: #ffe9f5; font-family: 'Quicksand', 'Segoe UI', Arial, sans-serif; background: linear-gradient(135deg, #3d0a26, #7a1550); box-shadow: 0 18px 50px rgba(0,0,0,.55); animation: exRadarDrop .28s cubic-bezier(.18,.89,.32,1.28) both; }
        .top { display: flex; align-items: center; gap: 9px; padding: 10px 14px; color: #ffb3dd; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: rgba(0,0,0,.2); }
        .siren { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; color: #3d0a26; background: #ff5fb0; font-size: 13px; }
        .close { margin-left: auto; border: 0; color: #ffb3dd; font-size: 21px; line-height: 1; cursor: pointer; background: transparent; }
        p { margin: 0; padding: 15px 16px 12px; font-size: 16px; font-weight: 600; line-height: 1.35; }
        .meta { display: block; padding: 0 16px 14px; color: #d998bd; font-size: 11px; }
        @keyframes exRadarDrop { from { opacity: 0; transform: translateY(-18px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      </style>
      <section class="alert" role="alert" aria-live="assertive">
        <div class="top"><span class="siren">!</span> Ex Detector™ <button class="close" aria-label="Dismiss alert">×</button></div>
        <p></p><span class="meta"></span>
      </section>`;
    shadow.querySelector("p").textContent = roast;
    shadow.querySelector(".meta").textContent = `face match detected · distance ${distance}`;
    shadow.querySelector(".close").addEventListener("click", () => host.remove());
    document.documentElement.append(host);
    window.setTimeout(() => host.remove(), duration);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SHOW_EX_RADAR_ALERT") showDetectorBanner(message);
  });
})();
