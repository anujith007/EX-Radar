# Ex Radar Companion extension

This Manifest V3 extension puts Ex Detector alerts **inside every tab of the browser window you arm**. It does not receive screenshots, face descriptors, or uploaded images. The Ex Radar page only sends the final match text and distance to the extension.

## Install in Chrome or Edge

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension` folder.
5. Pin **Ex Radar Companion** from the extensions menu.

If you open Ex Radar directly as a `file:///` page rather than at `localhost`, open the extension details and enable **Allow access to file URLs**.

## Demo flow

1. Open a separate normal browser window containing the gallery/image tab you will share.
2. Click the Ex Radar Companion icon in any tab of that window and choose **Arm current window**.
3. In the Ex Radar page, enroll the reference face and start sharing a tab from the armed window.
4. When a match is detected, Ex Detector injects a green banner in **every tab of the armed window** — switch tabs freely, the alert is already there.
5. Arming survives new tabs and tab switches; closing the armed window disarms automatically.

Use **Disarm** from the extension popup when the demo is over.

## Settings

The extension popup remembers these settings across browser restarts:

- **Banner position:** any screen corner.
- **Banner duration:** 3 to 30 seconds.
- **Warning sound:** 0 to 100% of Ex Radar's built-in, original outbreak alarm. A custom sound chosen on the scanner page plays instead. Click **Enable screen alerts + sound** in the Ex Radar page once per browser session to allow browser audio.
