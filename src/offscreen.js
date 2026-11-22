// Long-lived audio engine. It never starts capture independently of a toolbar click.
let tabStream = null;
let micStream = null;
let audioContext = null;
let output = null;
let recorder = null;
let chunks = [];
let startedAt = 0;
let closing = false;
let tabId = null;
let recordingPromise = null;
const pendingDownloads = new Map();

function send(type, data = {}) {
  return chrome.runtime.sendMessage({ target: "worker", type, ...data }).catch(err => {
    console.warn("ZAIF worker message:", err);
    return { ok: false, error: String(err) };
  });
}
async function arm({ streamId, includeMicrophone, targetTabId }) {
  if (tabStream) await disarm();
  closing = false;
  tabId = targetTabId;
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });
  audioContext = new AudioContext();
  output = audioContext.createMediaStreamDestination();
  const capturedTab = audioContext.createMediaStreamSource(tabStream);
  capturedTab.connect(output);
  // Tab capture mutes normal tab playback; route the captured sound back to speakers.
  capturedTab.connect(audioContext.destination);
  await audioContext.resume();
  let warning = "";
  if (includeMicrophone) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mic = audioContext.createMediaStreamSource(micStream);
      mic.connect(output); // Do not play microphone into speakers.
    } catch (err) {
      warning = "Microphone unavailable; tab audio only. " + (err.message || "");
    }
  }
  for (const track of tabStream.getTracks()) {
    track.addEventListener("ended", () => {
      if (!closing) disarm(true).catch(console.error);
    }, { once: true });
  }
  return { ok: true, micActive: Boolean(micStream), warning };
}
async function startRecording() {
  if (!tabStream || !output) throw new Error("Capture is not armed.");
  if (recorder && recorder.state !== "inactive") return { ok: true, alreadyRecording: true };
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    .find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error("No supported audio recording format.");
  chunks = [];
  startedAt = Date.now();
  const activeRecorder = new MediaRecorder(output.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
  recorder = activeRecorder;
  activeRecorder.ondataavailable = event => {
    if (event.data?.size) chunks.push(event.data);
  };
  activeRecorder.onerror = event => {
    send("RECORDING_STATE", { recording: false, warning: "Recorder error: " + (event.error?.message || "unknown") });
  };
  activeRecorder.start(1000);
  await send("RECORDING_STATE", { recording: true });
  return { ok: true };
}
async function stopRecording() {
  if (!recorder || recorder.state === "inactive") return { ok: true, alreadyStopped: true };
  if (recordingPromise) return recordingPromise;
  const activeRecorder = recorder;
  recordingPromise = new Promise((resolve, reject) => {
    activeRecorder.addEventListener("stop", async () => {
      const begin = startedAt;
      const durationMs = Date.now() - begin;
      const blob = new Blob(chunks, { type: activeRecorder.mimeType });
      chunks = [];
      recorder = null;
      recordingPromise = null;
      try {
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const result = await send("SAVE_RECORDING", { url, startedAt: begin, durationMs, bytes: blob.size });
          if (!result?.ok) { URL.revokeObjectURL(url); throw new Error(result?.error || "Download failed"); }
          pendingDownloads.set(result.downloadId, url);
        }
        await send("RECORDING_STATE", { recording: false });
        resolve({ ok: true, bytes: blob.size });
      } catch (error) {
        await send("RECORDING_STATE", { recording: false, warning: "Recording save failed: " + error.message });
        reject(error);
      }
    }, { once: true });
    activeRecorder.stop();
  });
  return recordingPromise;
}
async function disarm(unexpected = false) {
  if (closing) return { ok: true };
  closing = true;
  try { await stopRecording(); } catch (err) { console.error("Save during disarm:", err); }
  const oldTab = tabStream;
  tabStream = null;
  if (oldTab) oldTab.getTracks().forEach(t => t.stop());
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null;
  if (audioContext) await audioContext.close().catch(() => {});
  audioContext = null;
  output = null;
  tabId = null;
  if (unexpected) await send("CAPTURE_ENDED");
  closing = false;
  return { ok: true };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.target !== "offscreen") return false;
  (async () => {
    if (msg.type === "ARM") return arm({
      streamId: msg.streamId, includeMicrophone: msg.includeMicrophone, targetTabId: msg.tabId
    });
    if (msg.type === "START_RECORDING") return startRecording();
    if (msg.type === "STOP_RECORDING") return stopRecording();
    if (msg.type === "DISARM") return disarm();
    if (msg.type === "DOWNLOAD_FINISHED") {
      const url = pendingDownloads.get(msg.downloadId);
      if (url) { URL.revokeObjectURL(url); pendingDownloads.delete(msg.downloadId); }
      return { ok: true };
    }
    return { ok: false, error: "Unknown command" };
  })().then(respond, err => respond({ ok: false, error: String(err.message || err) }));
  return true;
});
