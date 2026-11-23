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

## New in v0.3.0 — local Whisper transcription

ZAIF has a **TRANSCRIBE** button beside each recording, plus **IMPORT & TRANSCRIBE** for existing files.
The separate transcription page processes English speech with **Whisper Tiny English** using local ONNX Runtime Web (CPU/WASM). No account, API key or cloud transcription. After transcription it saves text locally and lets you **Copy** or **Download .txt**.

### Choose either installation route

**A. Easiest: prebuilt GitHub Actions ZIP (no Node on your PC):**

1. Open the repository **Actions** tab and the latest successful **Build offline ZAIF extension** run on `main`.
2. In the run's **Artifacts**, download `zaif-arc-fizu-offline`. Extract its outer archive, then extract the included `zaif-arc-fizu-offline.zip`.
3. Open `chrome://extensions`, enable Developer mode and **Load unpacked** the extracted folder with `manifest.json`.
4. If upgrading, replace the files in your current unpacked folder and click **Reload**. Keep the extension ID/profile consistent to preserve your current recording library.

**B. Build from the source ZIP (requires Node.js 20+):**

```sh
npm install
npm run setup
npm test
npm run verify:runtime
```

Then open `chrome://extensions` and **Load unpacked** the source folder. The setup script downloads the pinned Xenova/whisper-tiny.en model and copies the bundled local WASM/JS runtime into `lib/`. The folder is ignored by Git to avoid storing 40+ MB of model files in source control. The **normal repository ZIP alone does not include Whisper**, so do not skip setup.

### How to transcribe

1. Record and **STOP** a call; make sure its WebM file is saved in Downloads.
2. In ZAIF's recording library click **TRANSCRIBE** on that recording.
3. Wait for the model to load and transcription to finish. Copy the result or download it as a text file.
4. A temporary audio copy in Chrome's IndexedDB makes one-click transcription possible; **after successfully saving the text, ZAIF deletes that temporary copy**. The downloaded WebM file remains untouched.
5. To transcribe again, choose the WebM file via **Import audio or video**. Older pre-v0.3 recordings can always be imported.
6. **CLEAR TEMPORARY AUDIO COPIES** discards untranscribed in-browser audio copies without touching your Downloads or any saved transcripts. Removing a recording from within ZAIF deletes its file, library metadata, and local transcript.

### Honest limitations

- **No automatic speaker labels in v0.3.0.** ZAIF currently mixes microphone and tab audio; calling participants "You" and "Caller" without separate channels would be misleading. A future version can capture isolated stereo channels.
- **No speech-to-text while recording.** Processing happens afterward on the transcription page.
- The local model (English Tiny, about 40 MB in q8) is relatively small and may mishear names, accents, or noisy calls. The first transcription may take longer. CPU/WASM works without WebGPU; no GPU performance promise.
- **Desktop Chrome only.** Media decoding depends on which formats Chrome can decode. Files up to 300 MB / 120 minutes are accepted by UI, but long calls can require substantial memory.
- The GitHub workflow checks static code and packaged assets; it cannot prove real microphone/recording or Whisper inference works in a person's Chrome profile.
- Running `npm run setup` or fetching the GitHub artifact needs internet once; afterward models and inference are entirely local. No network access is requested by the extension for transcription.
- A downloaded recording may still appear in the library if you manually delete the file from the Downloads folder. Use **REFRESH LIBRARY** and **REMOVE MISSING ENTRIES** to clean up; temporary copies/transcripts of missing entries will be removed too.

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
The recording engine remains dependency-free, while optional local transcription uses bundled Transformers.js and ONNX WASM. For source checks run `npm test` (requires Node.js 20+). Use `npm run setup` to package local inference resources. No remote script execution is allowed in Manifest V3. Chrome docs: [tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).
