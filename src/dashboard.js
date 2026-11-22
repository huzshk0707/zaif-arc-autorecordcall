const $ = id => document.getElementById(id);
const request = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data });
const fmtBytes = n => !n ? "0 MB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : (n / 1024).toFixed(1) + " KB";
let priorRecordingState = null;
let knownSavedIds = null;
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3700);
}
const fmtTime = ms => {
  const seconds = Math.floor((ms || 0) / 1000);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};
function siteOrigin(raw) {
  try {
    const url = new URL(raw.trim());
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}
function info(text, error = false) {
  $("configMessage").textContent = text;
  $("configMessage").classList.toggle("is-error", error);
}
function errorMessage(text) { $("errorDisplay").textContent = text || ""; }
async function loadState() {
  const state = await request("GET_STATE");
  if (!state.ok) return errorMessage(state.error);
  const capture = state.capture;
  const recording = Boolean(capture?.recording);
  $("statusPill").classList.toggle("recording", recording);
  $("statusPill").querySelector("span").textContent = recording ? "RECORDING" : capture ? "ARMED" : "STANDBY";
  $("stateLabel").textContent = recording ? "Recording in progress ♡" : capture ?
    "Ready to keep a new moment" : state.settings.siteOrigin ?
      "Ready when you are ♡" : "Let’s get everything ready.";
  if (priorRecordingState === false && recording) showToast("Recording started ✨");
  priorRecordingState = recording;
  $("startBtn").disabled = !capture || recording;
  $("stopBtn").disabled = !recording;
  $("disarmBtn").disabled = !capture;
  $("recordingDot").style.background = recording ? "#ff93b7" : "#b6f3f1";
  if (capture?.warning) errorMessage(capture.warning);
  if (document.activeElement !== $("siteOrigin")) $("siteOrigin").value = state.settings.siteOrigin || "";
  if (document.activeElement !== $("callSelector")) $("callSelector").value = state.settings.callSelector || "";
  if (document.activeElement !== $("autoRecord")) $("autoRecord").checked = Boolean(state.settings.autoRecord);
  if (document.activeElement !== $("includeMicrophone")) $("includeMicrophone").checked = Boolean(state.settings.includeMicrophone);
}
async function refreshLibrary() {
  const result = await request("REFRESH_LIBRARY");
  if (!result.ok) return errorMessage(result.error);
  const items = result.recordings;
  const newlySaved = items.find(item => item.status === "saved" && knownSavedIds !== null && !knownSavedIds.has(item.id));
  knownSavedIds = new Set(items.filter(item => item.status === "saved").map(item => item.id));
  if (newlySaved) showToast("Saved successfully ♡");
  $("recordCount").textContent = String(items.filter(x => x.status !== "missing").length);
  $("totalSize").textContent = fmtBytes(items.filter(x => x.status === "saved").reduce((n, x) => n + (x.bytes || 0), 0));
  const list = $("recordList"); list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div"); empty.className = "library-empty";
    const artwork = document.createElement("div"); artwork.className = "empty-mascot-wrap";
    const panda = document.createElement("img"); panda.className = "empty-mascot";
    panda.src = "../assets/panda-headphones.svg"; panda.width = 113; panda.height = 113;
    panda.alt = "A little panda with headphones";
    const blossom = document.createElement("span"); blossom.className = "empty-blossom";
    blossom.textContent = "✿"; blossom.setAttribute("aria-hidden", "true");
    const sparkle = document.createElement("span"); sparkle.className = "empty-blossom empty-blossom-second";
    sparkle.textContent = "✦"; sparkle.setAttribute("aria-hidden", "true");
    artwork.append(panda, blossom, sparkle);
    const heading = document.createElement("h3"); heading.textContent = "Your recordings will live here ✨";
    const subtext = document.createElement("p");
    subtext.textContent = "A little home for your saved moments. ♡";
    empty.append(artwork, heading, subtext); list.append(empty);
    return;
  }
  for (const rec of items) {
    const row = document.createElement("div"); row.className = "record";
    const icon = document.createElement("span"); icon.className = "record-icon"; icon.textContent = "◉";
    const main = document.createElement("div"); main.className = "record-main";
    const title = document.createElement("strong"); title.className = "record-name"; title.textContent = rec.name;
    const meta = document.createElement("span"); meta.className = "record-meta";
    meta.textContent = [new Date(rec.createdAt).toLocaleString(), fmtTime(rec.durationMs), fmtBytes(rec.bytes), rec.status].join(" · ");
    main.append(title, meta);
    const buttons = document.createElement("div"); buttons.className = "record-actions";
    if (rec.status === "saved") {
      const open = document.createElement("button"); open.textContent = "OPEN";
      open.addEventListener("click", () => chrome.downloads.open(rec.downloadId));
      buttons.append(open);
    }
    const del = document.createElement("button"); del.textContent = "DELETE";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this recording's downloaded file and library entry?")) return;
      const outcome = await request("DELETE_RECORDING", { id: rec.id });
      if (!outcome.ok) errorMessage(outcome.error);
      await refreshLibrary();
    });
    buttons.append(del); row.append(icon, main, buttons); list.append(row);
  }
}
async function saveSite() {
  const origin = siteOrigin($("siteOrigin").value);
  if (!origin) return info("Enter a valid http:// or https:// website URL.", true);
  const selector = $("callSelector").value.trim();
  if (selector) {
    try { document.querySelector(selector); } catch { return info("The call selector is not valid CSS.", true); }
  }
  try {
    // The permission request is directly in the Save button's user gesture.
    const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
    if (!granted) return info("Site access was not granted. Please approve it to enable call detection.", true);
    await chrome.storage.local.set({
      siteOrigin: origin, callSelector: selector,
      autoRecord: $("autoRecord").checked, includeMicrophone: $("includeMicrophone").checked,
      lastError: ""
    });
    const result = await request("CONFIG_CHANGED");
    if (!result.ok) throw new Error(result.error);
    info(selector ? "Site enabled. Open its call tab and click the ZAIF extension icon to arm." :
      "Site saved. Add the site's in-call CSS selector for automatic detection. Manual recording is available after arming.");
    await loadState();
  } catch (err) { info("Could not configure site: " + err.message, true); }
}
async function testMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(t => t.stop());
    info("Microphone permission is ready.");
  } catch (err) { info("Microphone permission failed: " + err.message, true); }
}
function playBootSound() {
  // Original three-tone electronic startup chime, synthesized locally.
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  [261.63, 392, 587.33].forEach((frequency, i) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine"; oscillator.frequency.value = frequency;
    const start = now + i * .17;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.11, start + .045);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .5);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start); oscillator.stop(start + .51);
  });
  setTimeout(() => ctx.close().catch(() => {}), 1200);
}
async function initializeIntro() {
  // Versioned flag: show the new FIZU Edition welcome once, even to existing installations.
  const { fizuEditionIntroSeen = false } = await chrome.storage.local.get("fizuEditionIntroSeen");
  $("intro").hidden = fizuEditionIntroSeen;
  $("initialize").addEventListener("click", async () => {
    playBootSound();
    $("intro").hidden = true;
    await chrome.storage.local.set({ introSeen: true, fizuEditionIntroSeen: true });
  });
}
$("saveSite").addEventListener("click", saveSite);
$("testMic").addEventListener("click", testMic);
$("startBtn").addEventListener("click", async () => {
  const res = await request("START_RECORDING");
  if (!res.ok) errorMessage(res.error); await loadState();
});
$("stopBtn").addEventListener("click", async () => {
  const res = await request("STOP_RECORDING");
  if (!res.ok) errorMessage(res.error); await Promise.all([loadState(), refreshLibrary()]);
});
$("disarmBtn").addEventListener("click", async () => {
  const res = await request("DISARM");
  if (!res.ok) errorMessage(res.error); await Promise.all([loadState(), refreshLibrary()]);
});
$("refreshLibrary").addEventListener("click", refreshLibrary);
$("clearMissing").addEventListener("click", async () => {
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const checked = await request("REFRESH_LIBRARY");
  if (!checked.ok) return errorMessage(checked.error);
  const remaining = checked.recordings.filter(item => item.status !== "missing");
  if (remaining.length !== checked.recordings.length) {
    await chrome.storage.local.set({ recordings: remaining });
  }
  await refreshLibrary();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.capture) loadState();
  if (area === "local" && changes.recordings) refreshLibrary();
});
(async () => {
  await initializeIntro();
  await loadState();
  await refreshLibrary();
  const { lastError } = await chrome.storage.local.get("lastError");
  if (lastError) errorMessage(lastError);
})();
