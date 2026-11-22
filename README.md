# ZAIF // ARC — FIZU Edition (MARK I)

A site-scoped, offline-first **Chrome Manifest V3** audio call recorder with a soft futuristic dashboard, a tiny headphone panda, and delicate blossom accents. The recording engine and permissions stay the same.

## Personal launch sequence
On the first FIZU Edition launch (including upgrades from MARK I), the dashboard presents the soft glowing reactor and these exact lines:
- `INITIALIZING ZAIF PROTOCOL...`
- `AUTHORIZED PERSON DETECTED...`
- `WELCOME, FIZU.`

Press **INITIALIZE SYSTEM** to play the original synthesized three-tone chime. The FIZU welcome appears once per extension profile and stores a versioned flag. There is **no system-message card** or romantic footer. The pink/lavender/cyan visual theme and cute illustrations are entirely local (no image CDN or AI).

## FIZU Edition design
- Premium dark-plum interface with pastel pink, lilac, cyan, and cream highlights.
- Reactor-inspired ZAIF core with subtle panda-ear shape; small panda-with-headphones mascot in the header and empty library.
- Delicate blossom illustration and slow, restrained sparkles; animations honor `prefers-reduced-motion`.
- Approved copy: `Your recordings will live here ✨`, `Recording started ✨`, and `Saved successfully ♡`.
- The saved message appears only when Chrome reports a completed download, not merely on call end.
- No third-party assets, fonts, backend, or telemetry.

## What works in this prototype
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
6. The **in-call CSS selector is optional**. For a manual ChatGPT microphone test use `https://chatgpt.com` as the website URL, leave the selector blank, and switch **Auto-record detected calls** off. For automatic recording, supply a verified selector that is present only during a call; e.g. `button[aria-label="Leave call"]` is an illustration, **not a verified ChatGPT selector**.
7. Press **SAVE & ENABLE SITE**, approve that site's permission, and **TEST MIC PERMISSION** if microphone recording is enabled.
8. Open the configured call website tab. Click the **ZAIF extension toolbar icon** to arm (badge: `ARM`). Click it again to disarm. If the selector is verified, recording starts/stops with call presence; otherwise use Start/Stop from Chrome Extensions → ZAIF ARC → Extension options.

**ChatGPT mic test:** The square Stop icon shown by ChatGPT does not itself reveal the DOM selector. Set `https://chatgpt.com`, leave selector empty, arm the ChatGPT tab by clicking the ZAIF toolbar icon, open the extension options, press **START RECORDING**, speak into the mic, then press **STOP** in ZAIF. Check that a `.webm` file appears in the library. To attempt automatic detection later, inspect ChatGPT’s active stop button in Chrome DevTools and use **Copy → Copy selector**; test that it appears only during dictation. Chrome's UI can change, so treat this as an experimental trigger, not a supported call adapter.

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

## Upgrade from MARK I
Download the updated repository or pull the latest `main`. Then visit `chrome://extensions` → ZAIF ARC → **Reload**. Existing recording metadata and site preferences stay in the Chrome extension profile. The new FIZU welcome sequence appears once.

## Developer
No dependencies, no server, no remote scripts. For static checks run `npm test` (requires Node.js 20+). Chrome docs: [tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).
