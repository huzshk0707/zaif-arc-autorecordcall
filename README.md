# ZAIF // ARC — MARK I

A site-scoped, offline-first **Chrome Manifest V3** audio call recorder with an original ZAIF reactor dashboard.

## Personal launch sequence
The **first** dashboard launch presents an animated reactor and the exact lines:
- `INITIALIZING ZAIF PROTOCOL...`
- `AUTHORIZED PERSON DETECTED...`
- `WELCOME, FIZU.`

Press **INITIALIZE SYSTEM** to play the original synthesized three-tone chime. The sequence appears once per extension profile. There is **no system-message card** or romantic footer.

## What works in this first prototype
- Target exactly one configured website origin.
- Arm/disarm the current site's tab using the **Chrome extension toolbar icon** (explicit user invocation, as required by Chrome).
- Maintain captured tab audio in an offscreen document while the authorized session remains alive.
- Optional microphone mix (test its permission in the dashboard first).
- Auto-start and stop recordings based on a user-configured **in-call CSS selector**. No selector = manual start/stop only.
- Save completed recordings as `.webm` audio under `Downloads/ZAIF ARC/<site>/`.
- Dashboard library with open, delete (file **and** entry), missing-file refresh, recording count and size estimates.
- No backend, subscriptions, or AI services.

## Install locally
1. Clone or download this repository to your PC and extract it.
2. Open `chrome://extensions` in a recent Chrome (116+).
3. Turn on **Developer mode**; choose **Load unpacked** and select the folder containing `manifest.json`.
4. Chrome should open the dashboard. Click **INITIALIZE SYSTEM** on the first launch.
5. Enter the call website origin, e.g. `https://calls.example.com`.
6. Add a valid **in-call CSS selector** that is present only while an actual call is active, e.g. `button[aria-label="Leave call"]`. **This is a placeholder, not a validated selector**. We need the specific calling website to select and test one.
7. Press **SAVE & ENABLE SITE**, approve that site's permission, and **TEST MIC PERMISSION** if microphone recording is enabled.
8. Open the configured call website tab. Click the **ZAIF extension toolbar icon** to arm (badge: `ARM`). Click it again to disarm. If the selector is verified, recording starts/stops with call presence; otherwise use Start/Stop from Chrome Extensions → ZAIF ARC → Extension options.

**Tip:** Pin the ZAIF ARC extension so its `ARM` and `REC` badges remain visible. The dashboard can be opened from the extension's Details → Extension options.

## Important browser limitations
- Chrome requires a user invocation for each **new tab capture**. This extension does not bypass permissions or initiate capture across browser restarts. It can auto-detect multiple calls **within the current authorized capture session**.
- Site-specific call detection is not universal; CSS selectors can break after website updates. Confirm that a selector truly means "in a call," and check that audio from both participants is captured.
- Web apps using different tabs, frames, or virtual audio routing may require a custom site adapter.
- Chrome may prompt for microphone permission. If mic access fails, the offscreen engine can record tab audio only and shows a warning.
- Call recordings are buffered in memory until a call ends. Very long calls may consume significant RAM. A later version should stream chunks to durable disk storage.
- Disk files are not stored twice in IndexedDB. The library stores metadata only. Deleting a file outside Chrome may leave an entry until **REFRESH LIBRARY**; remove missing entries using the dedicated button.
- This prototype has not been end-to-end tested in the user's calling website or browser. Test with a short, authorized call before relying on it.
- Record only calls you are entitled to record and follow applicable recording-consent requirements.

## Developer
No dependencies, no server, no remote scripts. For static checks run `npm test` (requires Node.js 20+). Chrome docs: [tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).
