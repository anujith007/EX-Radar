<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />


# EX RADAR 🎯

## Basic Details

**Team Name:** Oops404

**Team Members**

* Member 1: Anujith Ram K -School of engineering CUSAT
* Member 2: Gayathri Santhosh - School of engineering CUSAT

## Project Description

Ex Radar is a privacy-first, 100% on-device "ex detector" that watches a screen or browser tab you share and instantly roasts you when the face you enrolled (your "ex") shows up — complete with a chat bubble, alarm, AI roast, and synced alert banners across every tab.

### The Problem (that doesn't exist)

You have moved on. You have *definitely* moved on. And yet thirty minutes into "just scrolling," you're three reels deep into your ex's cousin's vacation stories. Your browser has no conscience — nothing taps you on the shoulder and says *this is a relapse risk, close the tab.*

### The Solution (that nobody asked for)

A real-time, on-device face radar: enroll a reference face, share your screen, and get instantly busted the moment that face reappears — via a chat bubble, desktop notification, alarm sound, AI-generated roast, and green alert banners synced across every tab of the armed browser window. Nothing ever leaves the browser.

## Technical Details

### Technologies/Components Used

**For Software:**

* Languages: JavaScript (ES2020+, vanilla, no build step), HTML5, CSS3
* Frameworks: None — intentionally zero-framework; Chrome Extensions Manifest V3 for the companion
* Libraries: face-api.js 0.22.2 (TensorFlow.js) for face detection/recognition; Web Audio API for alarm sounds; Chrome Built-in AI Prompt API (Gemini Nano) for on-device roast generation; Notifications API; Chrome Extensions MV3 APIs (tabs, storage, service worker, content scripts)
* Tools: Any static server (e.g. `python -m http.server`) or `file:///`; Chrome/Edge (Chromium); jsDelivr CDN for face-api.js models

### Implementation

**For Software:**

#### Installation

```bash
git clone <https://github.com/anujith007/EX-Radar>
cd <EX-Radar>
python -m http.server 8791
```

Extension (Chrome/Edge):
1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Pin **Ex Radar Companion**
4. If the app runs from `file://`, enable **Allow access to file URLs** in the extension details

#### Run

```bash
python -m http.server 8791
# open http://127.0.0.1:8791
```

1. Wait for "Models ready" → upload a clear, front-facing reference photo.
2. (Optional) static test image → **Run static match test** → tune the threshold slider.
3. In the window you'll share: extension icon → **Arm current window**.
4. Back in Ex Radar: **Enable screen alerts + sound**; optionally pick a custom sound; confirm "ai roasts: armed."
5. **Start Screen Share** → share the armed tab. When the face appears: bubble + roast + sound + notification + banners in every armed-window tab, simultaneously.
6. **Stop scan** / extension **Disarm** to end the demo.

### Project Documentation

**For Software:**

#### Screenshots (Add at least 3)

https://drive.google.com/drive/folders/1NCe3qoJrZjVAryUWk5DrmHrJbYjFpumT?usp=drive_link

#### Diagrams
## System Workflow


```text
User
  │
  ▼
Enroll Reference Face
  │
  ▼
Convert Photo to Descriptor
  │
  ▼
Capture Screen Every 1.2s
  │
  ▼
Detect All Faces in Frame
  │
  ▼
Face Match
(Euclidean Distance vs Threshold)
  │
  ├─────────────── No Match ──────────────► Continue Scanning
  │
  ▼
Match Detected
  │
  ├──────────────► Chat Bubble
  │                  AI Roast, On-Page
  │
  ├──────────────► Alarm Sound
  │                  Siren or Custom File
  │
  ├──────────────► Notification
  │                  Desktop Alert
  │
  └──────────────► Extension Banners
                     Every Tab, Synced
```
### Project Demo

#### Video

Full demo: https://drive.google.com/file/d/1o4To3xB6yMfRnpoQ9wdJtvFuRtBAVB5V/view?usp=sharing

Drive for chrome extension: https://drive.google.com/drive/folders/1b6lRHNm2ly7pBlvkbyQcXmjGXkbRLqNR?usp=sharing

### Team Contributions

* Gayathri: Frontend,Documentation
* Anujith: Major workflow,backend


Made with ❤️ at TinkerHub Useless Projects
