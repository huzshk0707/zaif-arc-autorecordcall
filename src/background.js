// ZAIF ARC — service worker. Toolbar click is the explicit capture authorization.
const DEFAULTS = { siteOrigin: "", callSelector: "", autoRecord: true, includeMicrophone: true };
const DETECTOR_ID = "zaif-call-detector";
let creatingOffscreen = null;

async function settings() {
  return { ...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS)) };
}
function originOf(url) {
  try { const u = new URL(url); return ["https:", "http:"].includes(u.protocol) ? u.origin : ""; }
  catch { return ""; }
}
async function setBadge(tabId, mode) {
  if (!Number.isInteger(tabId)) return;
  const colors = { ARM: "#10B9CF", REC: "#EA4566", ERR: "#C47B25" };
  await chrome.action.setBadgeText({ tabId, text: mode || "" }).catch(() => {});
  if (mode) await chrome.action.setBadgeBackgroundColor({ tabId, color: colors[mode] || colors.ARM }).catch(() => {});
}
async function session() {
  const { capture = null } = await chrome.storage.session.get("capture");
  return capture;
}
async function updateSession(patch) {
  const current = await session();
  if (!current) return;
  const next = { ...current, ...patch };
  await chrome.storage.session.set({ capture: next });
  await setBadge(next.tabId, next.recording ? "REC" : "ARM");
}
async function ensureOffscreen() {
  const url = chrome.runtime.getURL("src/offscreen.html");
  const exists = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url]
  });
  if (exists.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "src/offscreen.html",
      reasons: ["USER_MEDIA", "BLOBS"],
      justification: "Keep a user-authorized tab audio stream active and save call recordings."
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}
async function offscreen(type, data = {}) {
  return chrome.runtime.sendMessage({ target: "offscreen", type, ...data });
}
async function disarm() {
  const current = await session();
  if (!current) return;
  try { await offscreen("DISARM"); } catch (err) { console.warn("Disarm:", err); }
  await chrome.storage.session.remove("capture");
  await setBadge(current.tabId, "");
}
async function arm(tab) {
  const config = await settings();
  const origin = originOf(tab.url);
  if (!origin || !config.siteOrigin || origin !== config.siteOrigin) {
    if (origin && !config.siteOrigin) await chrome.storage.local.set({ siteOrigin: origin });
    await chrome.runtime.openOptionsPage();
    return;
  }
  const current = await session();
  if (current) await disarm();
  // These two calls must remain attached to the user's extension-action invocation.
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  const result = await offscreen("ARM", { streamId, includeMicrophone: config.includeMicrophone, tabId: tab.id });
  if (!result?.ok) throw new Error(result?.error || "Unable to create audio capture");
  await chrome.storage.session.set({
    capture: { tabId: tab.id, origin, armedAt: Date.now(), recording: false, micActive: !!result.micActive, warning: result.warning || "" }
  });
  await setBadge(tab.id, "ARM");
  // Re-evaluate calls already in progress when the user arms the extension.
  await chrome.tabs.sendMessage(tab.id, { type: "RECHECK_CALL" }).catch(() => {});
}
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const current = await session();
    if (current?.tabId === tab.id) { await disarm(); return; }
    await arm(tab);
  } catch (error) {
    console.error("ZAIF capture failed:", error);
    await setBadge(tab.id, "ERR");
    await chrome.storage.local.set({ lastError: String(error.message || error) });
    await chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await chrome.storage.local.set({ ...DEFAULTS, recordings: [], introSeen: false });
    await chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onStartup.addListener(() => chrome.storage.session.remove("capture"));
chrome.tabs.onRemoved.addListener(async tabId => {
  if ((await session())?.tabId === tabId) await disarm();
});
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url) return;
  const current = await session();
  if (current?.tabId === tabId && originOf(change.url) !== current.origin) await disarm();
});
async function detectorFor(origin) {
  await chrome.scripting.unregisterContentScripts({ ids: [DETECTOR_ID] }).catch(() => {});
  if (!origin) return;
  const granted = await chrome.permissions.contains({ origins: [origin + "/*"] });
  if (!granted) return;
  await chrome.scripting.registerContentScripts([{
    id: DETECTOR_ID, matches: [origin + "/*"], js: ["src/call-detector.js"],
    runAt: "document_idle", persistAcrossSessions: true
  }]);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (originOf(tab.url) === origin && tab.id) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/call-detector.js"] }).catch(() => {});
    }
  }
}
async function saveRecording(data) {
  if (!data?.url?.startsWith("blob:chrome-extension://")) throw new Error("Unexpected recording URL");
  const host = (await settings()).siteOrigin;
  const folder = originOf(host) ? new URL(host).hostname.replace(/[^a-z0-9.-]/gi, "_") : "calls";
  const filename = "ZAIF ARC/" + folder + "/ZAIF-" + new Date(data.startedAt).toISOString().replace(/[:.]/g, "-") + ".webm";
  const downloadId = await chrome.downloads.download({ url: data.url, filename, saveAs: false, conflictAction: "uniquify" });
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const entry = { id: crypto.randomUUID(), downloadId, name: filename.split("/").at(-1), filename,
    createdAt: data.startedAt, durationMs: data.durationMs, bytes: data.bytes, status: "saving" };
  await chrome.storage.local.set({ recordings: [entry, ...recordings] });
  // The source Blob URL stays alive in the offscreen document until Chrome finishes the download.
  return { ok: true, downloadId };
}
chrome.downloads.onChanged.addListener(async change => {
  if (!change.state) return;
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const item = recordings.find(x => x.downloadId === change.id);
  if (!item) return;
  item.status = change.state.current === "complete" ? "saved" : "failed";
  await chrome.storage.local.set({ recordings });
  await offscreen("DOWNLOAD_FINISHED", { downloadId: change.id }).catch(() => {});
});
async function refreshLibrary() {
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const results = await Promise.all(recordings.map(async item => {
    const matches = await chrome.downloads.search({ id: item.downloadId });
    const file = matches[0];
    return { ...item, status: !file || file.exists === false ? "missing" :
      file.state === "complete" ? "saved" : file.state === "interrupted" ? "failed" : "saving" };
  }));
  // Avoid an onChanged → REFRESH_LIBRARY loop in the dashboard.
  if (results.some((entry, index) => entry.status !== recordings[index].status)) {
    await chrome.storage.local.set({ recordings: results });
  }
  return results;
}
async function deleteRecording(recordId) {
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const item = recordings.find(x => x.id === recordId);
  if (!item) throw new Error("Recording not found");
  const matches = await chrome.downloads.search({ id: item.downloadId });
  if (matches[0]?.state === "complete" && matches[0]?.exists) {
    await chrome.downloads.removeFile(item.downloadId);
  }
  await chrome.downloads.erase({ id: item.downloadId });
  await chrome.storage.local.set({ recordings: recordings.filter(x => x.id !== recordId) });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return false;
  (async () => {
    const current = await session();
    if (message.type === "CALL_STATE") {
      if (!sender.tab || sender.tab.id !== current?.tabId || originOf(sender.url) !== current.origin) return { ok: false };
      const config = await settings();
      if (!config.autoRecord || !config.callSelector) return { ok: false };
      await offscreen(message.inCall ? "START_RECORDING" : "STOP_RECORDING");
      return { ok: true };
    }
    if (message.target === "worker" && message.type === "CAPTURE_ENDED") {
      if (current) { await chrome.storage.session.remove("capture"); await setBadge(current.tabId, ""); }
      return { ok: true };
    }
    if (message.target === "worker" && message.type === "RECORDING_STATE") {
      await updateSession({ recording: !!message.recording, warning: message.warning || current?.warning || "" });
      return { ok: true };
    }
    if (message.target === "worker" && message.type === "SAVE_RECORDING") return saveRecording(message);
    if (message.type === "GET_STATE") return { ok: true, capture: current, settings: await settings() };
    if (message.type === "START_RECORDING" || message.type === "STOP_RECORDING") {
      if (!current) throw new Error("Click the extension icon on the call tab to arm recording.");
      return offscreen(message.type);
    }
    if (message.type === "DISARM") { await disarm(); return { ok: true }; }
    if (message.type === "CONFIG_CHANGED") {
      if (current) await disarm();
      await detectorFor((await settings()).siteOrigin);
      return { ok: true };
    }
    if (message.type === "REFRESH_LIBRARY") return { ok: true, recordings: await refreshLibrary() };
    if (message.type === "DELETE_RECORDING") { await deleteRecording(message.id); return { ok: true }; }
    return { ok: false, error: "Unsupported message" };
  })().then(sendResponse, error => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});
