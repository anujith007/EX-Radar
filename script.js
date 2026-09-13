/* global faceapi, ROAST_BANK, LanguageModel */
(() => {
  "use strict";

  // The library and model files are separately published by face-api.js.
  // jsDelivr mirrors the upstream weights and supplies the expected manifest/shard URLs.
  const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
  const SAMPLE_INTERVAL_MS = 1200;
  const ROAST_COOLDOWN_MS = 6500;
  const HIGH_CONFIDENCE_DISTANCE = 0.36;
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 });

  const $ = (id) => document.getElementById(id);
  const ui = {
    referenceUpload: $("reference-upload"), testUpload: $("test-upload"),
    referencePreview: $("reference-preview"), testPreview: $("test-preview"),
    referencePlaceholder: $("reference-placeholder"), testPlaceholder: $("test-placeholder"),
    testButton: $("test-match-button"), staticResult: $("static-result"),
    startButton: $("start-share-button"), stopButton: $("stop-share-button"),
    enableAlertsButton: $("enable-alerts-button"), alertStatus: $("alert-status"),
    threshold: $("threshold-input"), thresholdValue: $("threshold-value"),
    customSoundUpload: $("custom-sound-upload"), customSoundName: $("custom-sound-name"),
    testSoundButton: $("test-sound-button"), resetSoundButton: $("reset-sound-button"),
    aiStatus: $("ai-status"),
    video: $("screen-video"), canvas: $("capture-canvas"), overlay: $("chat-overlay"),
    status: $("app-status"), statusDot: $("status-dot")
  };

  let modelsReady = false;
  let referenceDescriptor = null;
  let testImage = null;
  let displayStream = null;
  let scanTimer = null;
  let scanBusy = false;
  let lastRoastAt = 0;
  let previousRoast = "";
  let unusedRoasts = [];
  let audioContext = null;
  let extensionAlarmIntensity = 1;
  let customSoundBuffer = null;
  let customSoundLabel = "";
  let aiSession = null;
  let aiRoastsReady = false;
  let matchCount = 0;

  function threshold() { return Number(ui.threshold.value); }
  function setStatus(message, mode = "idle") {
    ui.status.textContent = message;
    ui.statusDot.className = mode === "ready" ? "ready" : mode === "scanning" ? "scanning" : "";
  }
  function setStaticResult(message, kind = "") {
    ui.staticResult.textContent = message;
    ui.staticResult.className = `result-line ${kind}`;
  }
  function updateControls() {
    ui.startButton.disabled = !modelsReady || !referenceDescriptor || Boolean(displayStream);
    ui.stopButton.disabled = !displayStream;
    ui.testButton.disabled = !modelsReady || !referenceDescriptor || !testImage;
  }
  function formatDistance(distance) { return Number.isFinite(distance) ? distance.toFixed(3) : "n/a"; }
  function setAlertStatus(message, armed = false) {
    ui.alertStatus.textContent = message;
    ui.alertStatus.className = `alert-status${armed ? " armed" : ""}`;
  }
  function updateSoundControls() {
    ui.testSoundButton.disabled = !(audioContext && audioContext.state === "running");
    ui.resetSoundButton.disabled = !customSoundBuffer;
  }
  function resetCustomSound() {
    customSoundBuffer = null;
    customSoundLabel = "";
    ui.customSoundUpload.value = "";
    ui.customSoundName.textContent = "default outbreak siren";
    console.info("[Ex Radar] Custom alert sound cleared. Reverting to the outbreak siren.");
  }
  function updateAiStatus() {
    if (!ui.aiStatus) return;
    if (aiRoastsReady) {
      ui.aiStatus.textContent = "ai roasts: armed — fresh on-device burns";
      ui.aiStatus.className = "ai-status armed";
    } else {
      ui.aiStatus.textContent = "ai roasts: classic bank (built-in AI not available in this browser)";
      ui.aiStatus.className = "ai-status";
    }
  }

  async function loadModels() {
    try {
      console.info("[Ex Radar] Loading face-api.js models from CDN…");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsReady = true;
      setStatus("Models ready — enroll a reference face.", "ready");
      console.info("[Ex Radar] Models loaded. Static matching is ready.");
    } catch (error) {
      console.error("[Ex Radar] Could not load models:", error);
      setStatus("Model download failed. Check your connection and refresh.");
      setStaticResult("Could not load face models. See console for details.", "error");
    } finally { updateControls(); }
  }

  function loadImageFromFile(file, preview, placeholder) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file selected."));
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        preview.src = image.src;
        preview.style.display = "block";
        placeholder.style.display = "none";
        resolve(image);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be opened.")); };
      image.src = url;
    });
  }

  async function descriptorFor(image) {
    return faceapi.detectSingleFace(image, detectorOptions).withFaceLandmarks().withFaceDescriptor();
  }

  ui.referenceUpload.addEventListener("change", async (event) => {
    try {
      if (!modelsReady) throw new Error("Models are still loading — wait a moment and try again.");
      setStaticResult("Finding a face in the reference photo…");
      const image = await loadImageFromFile(event.target.files[0], ui.referencePreview, ui.referencePlaceholder);
      const detection = await descriptorFor(image);
      if (!detection) throw new Error("No clear face found. Try a brighter, front-facing photo with one face.");
      referenceDescriptor = detection.descriptor;
      console.info("[Ex Radar] Reference enrolled. Descriptor length:", referenceDescriptor.length);
      setStaticResult("Reference enrolled. Upload a test image or start a screen scan.", "match");
    } catch (error) {
      referenceDescriptor = null;
      console.error("[Ex Radar] Reference enrollment failed:", error);
      setStaticResult(error.message, "error");
    } finally { updateControls(); }
  });

  ui.testUpload.addEventListener("change", async (event) => {
    try {
      testImage = await loadImageFromFile(event.target.files[0], ui.testPreview, ui.testPlaceholder);
      setStaticResult(referenceDescriptor ? "Test image ready. Run the match test." : "Test image ready. Enroll the reference face first.");
    } catch (error) {
      testImage = null;
      setStaticResult(error.message, "error");
    } finally { updateControls(); }
  });

  ui.testButton.addEventListener("click", async () => {
    try {
      setStaticResult("Testing image against reference…");
      const detection = await descriptorFor(testImage);
      if (!detection) throw new Error("No clear face found in the test image.");
      const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
      const match = distance < threshold();
      console.info(`[Ex Radar] STATIC TEST — distance: ${formatDistance(distance)}, threshold: ${threshold().toFixed(2)}, match: ${match}`);
      setStaticResult(`${match ? "MATCH ✓" : "NO MATCH ✕"} — distance ${formatDistance(distance)} (threshold ${threshold().toFixed(2)})`, match ? "match" : "no-match");
    } catch (error) {
      console.error("[Ex Radar] Static test failed:", error);
      setStaticResult(error.message, "error");
    }
  });

  ui.threshold.addEventListener("input", () => {
    ui.thresholdValue.textContent = threshold().toFixed(2);
    console.info(`[Ex Radar] Match threshold changed to ${threshold().toFixed(2)}`);
  });

  // Browsers only allow audio and notification permission after a real button click.
  // This creates an original alarm with Web Audio; no sound file is downloaded.
  async function enableScreenAlerts() {
    let notificationReady = false;
    if ("Notification" in window) {
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      notificationReady = permission === "granted";
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not supported in this browser.");
      audioContext ||= new AudioContextClass();
      await audioContext.resume();
    } catch (error) {
      console.warn("[Ex Radar] Could not arm alarm sound:", error);
    }
    const soundReady = audioContext?.state === "running";
    updateSoundControls();
    ui.enableAlertsButton.disabled = !(notificationReady || soundReady);
    // The alert button click is a user activation — exactly what the Prompt
    // API needs to kick off the one-time Gemini Nano download.
    initAiRoasts().then(updateAiStatus);
    ui.enableAlertsButton.textContent = notificationReady ? "Screen alerts armed" : soundReady ? "Sound armed (alerts blocked)" : "Alerts unavailable";
    setAlertStatus(
      notificationReady
        ? "Desktop alerts armed — matches can appear above the shared tab."
        : soundReady
          ? "Alarm sound armed. Allow browser notifications to show alerts above the shared tab."
          : "Alerts were blocked. Allow notifications/sound in the browser and try again.",
      notificationReady || soundReady
    );
  }

  function playOutbreakAlarm() {
    if (!audioContext || audioContext.state !== "running") return;
    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.16 * extensionAlarmIntensity), now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    master.connect(audioContext.destination);

    const siren = audioContext.createOscillator();
    const sirenGain = audioContext.createGain();
    siren.type = "sawtooth";
    siren.frequency.setValueAtTime(620, now);
    siren.frequency.exponentialRampToValueAtTime(210, now + 0.36);
    siren.frequency.exponentialRampToValueAtTime(690, now + 0.7);
    sirenGain.gain.value = 0.55;
    siren.connect(sirenGain).connect(master);

    const growl = audioContext.createOscillator();
    const growlGain = audioContext.createGain();
    growl.type = "square";
    growl.frequency.setValueAtTime(86, now);
    growl.frequency.linearRampToValueAtTime(64, now + 0.72);
    growlGain.gain.value = 0.34;
    growl.connect(growlGain).connect(master);

    siren.start(now); growl.start(now);
    siren.stop(now + 0.76); growl.stop(now + 0.76);
  }

  function playCustomSound() {
    const now = audioContext.currentTime;
    const source = audioContext.createBufferSource();
    source.buffer = customSoundBuffer;
    source.connect(audioContext.destination);
    source.onended = () => source.disconnect();    source.start(now);
  }

  function showDesktopAlert(message, distance) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const notification = new Notification("🚨 Ex Detector™", {
      body: `match ${formatDistance(distance)} — ${message}`,
      tag: "ex-radar-match",
      renotify: true,
      silent: true
    });
    window.setTimeout(() => notification.close(), 9000);
  }

  async function startScreenShare() {
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 12 } }, audio: false });
      ui.video.srcObject = displayStream;
      await ui.video.play();
      displayStream.getVideoTracks()[0].addEventListener("ended", stopScreenShare, { once: true });
      postToExtension({ type: "SCAN_STARTED" });
      setStatus("Scanning shared screen every 1.2 seconds…", "scanning");
      console.info("[Ex Radar] Screen share started. Open DevTools to see every face distance.");
      updateControls();
      await scanFrame(); // first result immediately, then cadence starts
      scanTimer = window.setInterval(scanFrame, SAMPLE_INTERVAL_MS);
    } catch (error) {
      displayStream = null;
      if (error.name !== "NotAllowedError") console.error("[Ex Radar] Screen share failed:", error);
      setStatus(error.name === "NotAllowedError" ? "Screen share cancelled." : "Could not start screen share. See console.", modelsReady ? "ready" : "idle");
      updateControls();
    }
  }

  function stopScreenShare() {
    postToExtension({ type: "SCAN_STOPPED" });
    if (scanTimer) window.clearInterval(scanTimer);
    scanTimer = null;
    if (displayStream) displayStream.getTracks().forEach((track) => track.stop());
    displayStream = null;
    ui.video.srcObject = null;
    scanBusy = false;
    setStatus(referenceDescriptor ? "Scan stopped. Ready to scan again." : "Scan stopped.", modelsReady ? "ready" : "idle");
    console.info("[Ex Radar] Screen scan stopped.");
    updateControls();
  }

  async function scanFrame() {
    if (scanBusy || !displayStream || !referenceDescriptor || ui.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    scanBusy = true;
    try {
      const width = ui.video.videoWidth;
      const height = ui.video.videoHeight;
      if (!width || !height) return;
      ui.canvas.width = width;
      ui.canvas.height = height;
      ui.canvas.getContext("2d", { willReadFrequently: true }).drawImage(ui.video, 0, 0, width, height);
      const detections = await faceapi.detectAllFaces(ui.canvas, detectorOptions).withFaceLandmarks().withFaceDescriptors();
      if (!detections.length) {
        console.info("[Ex Radar] LIVE SCAN — no faces detected in this frame.");
        return;
      }
      const distances = detections.map((face) => faceapi.euclideanDistance(referenceDescriptor, face.descriptor));
      const closest = Math.min(...distances);
      const match = closest < threshold();
      console.info(`[Ex Radar] LIVE SCAN — faces: ${detections.length}, closest distance: ${formatDistance(closest)}, threshold: ${threshold().toFixed(2)}, match: ${match}`);
      if (match && Date.now() - lastRoastAt >= ROAST_COOLDOWN_MS) {
        matchCount += 1;
        triggerMatchAlert(closest);
        lastRoastAt = Date.now();
      }
    } catch (error) {
      console.error("[Ex Radar] LIVE SCAN error:", error);
    } finally { scanBusy = false; }
  }

  // ---------- AI roast engine (Chrome built-in Prompt API, on-device) ----------
  // Generated with Gemini Nano inside the browser: nothing leaves the machine,
  // which keeps the app's privacy promise intact. Falls back to ROAST_BANK.
  const ROAST_SYSTEM_PROMPT = [
    "You write one-line insults for Ex Detector, a joke app that roasts the user when their ex's face is spotted on screen.",
    "Rules: exactly one sentence, max 22 words, lowercase start, no hashtags, no emoji, no quotes around the line, never mention being an AI.",
    "Tone: dry, deadpan, playfully mean at the USER (the person scrolling), not cruel about the ex.",
    "Flavor: tech/internet metaphors — tabs, buffering, algorithms, notifications, group chats. Vary the angle every time."
  ].join(" ");

  async function initAiRoasts() {
    try {
      if (typeof LanguageModel === "undefined") {
        console.info("[Ex Radar] Built-in AI (Prompt API) not present in this browser — using the classic roast bank.");
        return;
      }
      const availability = await LanguageModel.availability({ expectedInputs: [{ type: "text", languages: ["en"] }] });
      if (availability === "unavailable") {
        console.info("[Ex Radar] Built-in AI unavailable on this device — using the classic roast bank.");
        return;
      }
      aiSession = await LanguageModel.create({
        initialPrompts: [{ role: "system", content: ROAST_SYSTEM_PROMPT }],
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            console.info(`[Ex Radar] AI model download: ${Math.round(e.loaded * 100)}%`);
          });
        }
      });
      aiRoastsReady = true;
      console.info("[Ex Radar] AI roast engine armed (on-device Gemini Nano). Fresh burns incoming.");
    } catch (error) {
      console.warn("[Ex Radar] AI roast engine failed to start — using the classic roast bank:", error);
      aiSession = null;
      aiRoastsReady = false;
    }
  }

  const AI_ROAST_TIMEOUT_MS = 2500;
  const PREFETCH_MAX_AGE_MS = 15000;
  let nextAiRoast = null;

  function startAiPrefetch(distance) {
    if (!aiRoastsReady || !aiSession) return;
    nextAiRoast = { at: Date.now(), promise: generateAiRoast(distance) };
  }

  async function generateAiRoast(distance) {
    const context = distance <= HIGH_CONFIDENCE_DISTANCE
      ? "The match is a near-certain ID of the ex."
      : matchCount > 1
        ? `The ex has been spotted ${matchCount} times this session.`
        : "This is the first spotting of the session.";
    const hour = new Date().getHours();
    const timeContext = (hour >= 23 || hour < 5) ? " It is after midnight." : "";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AI_ROAST_TIMEOUT_MS);
    try {
      const result = await aiSession.prompt(`${context}${timeContext} Write the roast line now.`, { signal: controller.signal });
      const roast = result.trim().replace(/^"|"$/g, "").split("\n")[0];
      if (!roast || roast.length > 220 || /^(as an ai|i'm sorry|i cannot)/i.test(roast)) throw new Error(" unusable model output");
      return roast;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function chooseRoast(distance) {
    const hour = new Date().getHours();
    const category = (hour >= 23 || hour < 5) ? "late-night" : distance <= HIGH_CONFIDENCE_DISTANCE ? "high-confidence" : lastRoastAt ? "repeat" : "first";
    let eligible = ROAST_BANK.filter((roast) => roast.category === category || roast.category === "any");
    if (!unusedRoasts.length) unusedRoasts = ROAST_BANK.map((roast) => roast.text);
    let choices = eligible.filter((roast) => unusedRoasts.includes(roast.text) && roast.text !== previousRoast);
    if (!choices.length) {
      unusedRoasts = ROAST_BANK.map((roast) => roast.text);
      choices = eligible.filter((roast) => roast.text !== previousRoast);
    }
    const chosen = choices[Math.floor(Math.random() * choices.length)] || eligible[0];
    previousRoast = chosen.text;
    unusedRoasts = unusedRoasts.filter((text) => text !== chosen.text);
    return chosen.text;
  }

  async function chooseRoastWithFallback(distance) {
    if (aiRoastsReady && aiSession) {
      let roast = null;
      // Prefer the prefetched roast: it was generated right after the previous
      // alert, so repeat matches get AI text with zero added latency.
      if (nextAiRoast && Date.now() - nextAiRoast.at <= PREFETCH_MAX_AGE_MS) {
        roast = await nextAiRoast.promise.catch(() => null);
        nextAiRoast = null;
      } else {
        nextAiRoast = null;
        try {
          roast = await generateAiRoast(distance);
        } catch (error) {
          console.warn("[Ex Radar] AI roast failed/timed out — falling back to the classic bank:", error.message);
        }
      }
      if (roast) {
        previousRoast = roast;
        startAiPrefetch(distance);
        return { text: roast, source: "ai" };
      }
    }
    return { text: chooseRoast(distance), source: "bank" };
  }

  async function triggerMatchAlert(distance) {    const { text: roast, source } = await chooseRoastWithFallback(distance);
    showRoast(distance, roast, source);
    showDesktopAlert(roast, distance);
    // Relay first so the extension banners are already in flight when the
    // alarm sound starts — they should appear in the same instant.
    notifyCompanionExtension(roast, distance);
    if (customSoundBuffer) playCustomSound(); else playOutbreakAlarm();
  }

  // A companion extension listens for these local page messages: MATCH_DETECTED
  // is relayed to the armed window, SCAN_STARTED/SCAN_STOPPED keep its service
  // worker warm so banners land in the same instant as the alarm sound.
  function postToExtension(detail) {
    window.postMessage({ channel: "ex-radar", ...detail }, window.location.protocol === "file:" ? "*" : window.location.origin);
  }

  function notifyCompanionExtension(roast, distance) {
    postToExtension({
      type: "MATCH_DETECTED",
      roast,
      distance: formatDistance(distance),
      detectedAt: Date.now()
    });
  }

  function showRoast(distance, roast, source = "bank") {
    const bubble = document.createElement("article");
    const time = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
    bubble.className = "roast-bubble";
    bubble.innerHTML = `<span class="bubble-contact">Ex Detector™ · match ${formatDistance(distance)}${source === "ai" ? " · ai" : ""}</span><p class="bubble-message"></p><time class="bubble-time">${time}</time>`;
    bubble.querySelector(".bubble-message").textContent = roast;
    ui.overlay.append(bubble);
    while (ui.overlay.children.length > 3) ui.overlay.firstElementChild.remove();
    window.setTimeout(() => bubble.remove(), 11000);
    console.warn(`[Ex Radar] MATCH DETECTED — distance ${formatDistance(distance)}. Roast deployed.`);
  }

  ui.customSoundUpload.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (!audioContext || audioContext.state !== "running") throw new Error("Enable screen alerts + sound first — the audio engine has to be armed before a custom sound can load.");
      setStaticResult(`Decoding “${file.name}”…`);
      const raw = await file.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(raw);
      if (!buffer.length) throw new Error("That file has no audio.");
      customSoundBuffer = buffer;
      customSoundLabel = file.name;
      ui.customSoundName.textContent = file.name;
      updateSoundControls();
      setStaticResult(`Custom sound armed: “${file.name}” (${buffer.duration.toFixed(1)}s).`, "match");
      console.info(`[Ex Radar] Custom alert sound loaded: “${file.name}” — ${buffer.duration.toFixed(2)}s, ${buffer.numberOfChannels}ch/${buffer.sampleRate}Hz.`);
    } catch (error) {
      console.error("[Ex Radar] Custom sound load failed:", error);
      setStaticResult(error.message, "error");
    } finally { event.target.value = ""; }
  });

  ui.testSoundButton.addEventListener("click", () => {
    if (!audioContext || audioContext.state !== "running") return;
    if (customSoundBuffer) {
      playCustomSound();
    } else {
      playOutbreakAlarm();
    }
    console.info(`[Ex Radar] Sound preview — ${customSoundBuffer ? `custom file “${customSoundLabel}”` : "default outbreak siren"}.`);
  });

  ui.resetSoundButton.addEventListener("click", () => {
    resetCustomSound();
    updateSoundControls();
  });

  ui.startButton.addEventListener("click", startScreenShare);
  ui.stopButton.addEventListener("click", stopScreenShare);
  ui.enableAlertsButton.addEventListener("click", enableScreenAlerts);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.channel !== "ex-radar-extension" || event.data?.type !== "SETTINGS_CHANGED") return;
    const intensity = Number(event.data.settings?.soundIntensity);
    if (Number.isFinite(intensity)) {
      extensionAlarmIntensity = Math.min(1, Math.max(0, intensity));
      console.info(`[Ex Radar] Companion extension alarm intensity: ${Math.round(extensionAlarmIntensity * 100)}%`);
    }
  });
  window.addEventListener("beforeunload", stopScreenShare);
  loadModels();
  initAiRoasts().then(updateAiStatus); // no-op in browsers without the Prompt API
})();
