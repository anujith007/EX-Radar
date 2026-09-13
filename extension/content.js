(() => {
  "use strict";

  const isLocalExRadarApp = window.location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  // Bridge only messages emitted by the scanner page. This is intentionally a
  // simple DOM message, not a network request and not a transfer of image data.
  if (isLocalExRadarApp) {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.channel !== "ex-radar" || event.data?.type !== "MATCH_DETECTED") return;
      chrome.runtime.sendMessage({
        type: "EX_RADAR_MATCH",
        roast: event.data.roast,
        distance: event.data.distance
      });
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
        .alert { box-sizing: border-box; overflow: hidden; border: 1px solid rgba(113,255,191,.6); border-radius: 16px; color: #ecfff7; font-family: Arial, sans-serif; background: linear-gradient(135deg, #062b25, #005c4b); box-shadow: 0 18px 50px rgba(0,0,0,.55); animation: exRadarDrop .28s cubic-bezier(.18,.89,.32,1.28) both; }
        .top { display: flex; align-items: center; gap: 9px; padding: 10px 14px; color: #b9ffe6; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: rgba(0,0,0,.2); }
        .siren { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; color: #08261e; background: #26df85; font-size: 13px; }
        .close { margin-left: auto; border: 0; color: #b9ffe6; font-size: 21px; line-height: 1; cursor: pointer; background: transparent; }
        p { margin: 0; padding: 15px 16px 12px; font-size: 16px; font-weight: 600; line-height: 1.35; }
        .meta { display: block; padding: 0 16px 14px; color: #9adbc5; font-size: 11px; }
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
