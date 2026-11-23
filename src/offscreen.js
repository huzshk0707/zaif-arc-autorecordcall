// Long-lived audio engine. An explicit toolbar invocation is always required to arm.
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
let startPromise = null;
let localWriter = null;
let localRecordingId = null;
let localName = "";
let saveMode = "downloads";
let bytesWritten = 0;
let pendingBytes = 0;
let writeQueue = Promise.resolve();
let writeError = null;
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
  // Captured tab playback is muted unless it is connected back to speakers.
  capturedTab.connect(audioContext.destination);
  await audioContext.resume();
  let warning = "";
  if (includeMicrophone) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mic = audioContext.createMediaStreamSource(micStream);
      mic.connect(output);
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
async function prepareOutput() {
  const status = await ZaifLocalFiles.folderStatus().catch(() => ({ configured: false }));
  saveMode = "downloads";
  localWriter = null;
  localRecordingId = null;
  localName = "";
  bytesWritten = 0;
  pendingBytes = 0;
  writeError = null;
  writeQueue = Promise.resolve();
  chunks = [];
  if (status.configured && status.granted) {
    const id = crypto.randomUUID();
    const name = "ZAIF-" + new Date(startedAt).toISOString().replace(/[:.]/g, "-") +
      "-" + id.slice(0, 8) + ".webm";
    try {
      const target = await ZaifLocalFiles.createFile(id, name);
      if (target) {
        saveMode = "folder";
        localWriter = target.writable;
        localRecordingId = id;
        localName = name;
      }
    } catch (error) {
      console.warn("Local file unavailable, falling back to Downloads:", error);
      await send("RECORDING_STATE", {
        recording: false, warning: "Folder could not be opened; using Downloads instead. " + error.message
      });
    }
  } else if (status.configured) {
    await send("RECORDING_STATE", {
      recording: false, warning: "Folder permission expired. Using Downloads (buffered); reconnect the folder in the dashboard."
    });
  }
}
function queueChunk(blob) {
  if (!blob?.size) return;
  if (saveMode !== "folder") {
    chunks.push(blob);
    return;
  }
  bytesWritten += blob.size;
  pendingBytes += blob.size;
  const writable = localWriter;
  writeQueue = writeQueue.then(async () => {
    if (writeError) return;
    await writable.write(blob);
  }).catch(error => {
    writeError = error;
    console.error("File streaming failed:", error);
  }).finally(() => {
    pendingBytes -= blob.size;
  });
  if (pendingBytes > 48 * 1024 * 1024 && recorder?.state === "recording") {
    // Don't accumulate unchecked memory if the destination disk stalls.
    writeError = writeError || new Error("Disk writes are too slow. Recording stopped to avoid memory overload.");
    // Schedule stop through the normal finalization path rather than calling
    // MediaRecorder.stop directly (which could leave the local file unclosed).
    void stopRecording().catch(error => console.error("Automatic safety stop:", error));
  }
}
async function startRecording() {
  if (!tabStream || !output) throw new Error("Capture is not armed.");
  if (recorder && recorder.state !== "inactive") return { ok: true, alreadyRecording: true };
  if (startPromise) return startPromise;
  startPromise = (async () => {
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error("No supported audio recording format.");
    startedAt = Date.now();
    await prepareOutput();
    const activeRecorder = new MediaRecorder(output.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    recorder = activeRecorder;
    activeRecorder.ondataavailable = event => queueChunk(event.data);
    activeRecorder.onerror = event => send("RECORDING_STATE", {
      recording: false, warning: "Recorder error: " + (event.error?.message || "unknown")
    });
    activeRecorder.start(2000);
    await send("RECORDING_STATE", { recording: true });
    return { ok: true, mode: saveMode };
  })().finally(() => { startPromise = null; });
  return startPromise;
}
async function persistResult(durationMs) {
  if (saveMode === "folder") {
    await writeQueue;
    if (writeError) throw writeError;
    await localWriter.close();
    localWriter = null;
    if (bytesWritten > 0) {
      const result = await send("SAVE_LOCAL_RECORDING", {
        recordingId: localRecordingId, name: localName,
        startedAt, durationMs, bytes: bytesWritten
      });
      if (!result?.ok) throw new Error(result?.error || "Saved file, but the library could not register it.");
    } else {
      await ZaifLocalFiles.deleteFile(localRecordingId);
    }
    return { ok: true, bytes: bytesWritten, mode: "folder" };
  }
  const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
  chunks = [];
  if (!blob.size) return { ok: true, bytes: 0, mode: "downloads" };
  const url = URL.createObjectURL(blob);
  const result = await send("SAVE_RECORDING", { url, startedAt, durationMs, bytes: blob.size });
  if (!result?.ok) {
    URL.revokeObjectURL(url);
    throw new Error(result?.error || "Download failed");
  }
  pendingDownloads.set(result.downloadId, url);
  // Bounded cache: avoid keeping large recordings twice in Chrome's profile.
  if (blob.size <= 12 * 1024 * 1024) {
    try { await ZaifAudioStore.putAudio(result.recordingId, blob); }
    catch (error) { console.warn("Audio cache unavailable:", error); }
  }
  return { ok: true, bytes: blob.size, mode: "downloads" };
}
async function stopRecording() {
  if (startPromise) await startPromise;
  if (!recorder || recorder.state === "inactive") return { ok: true, alreadyStopped: true };
  if (recordingPromise) return recordingPromise;
  const current = recorder;
  recordingPromise = new Promise((resolve, reject) => {
    current.addEventListener("stop", async () => {
      const durationMs = Date.now() - startedAt;
      let result;
      try {
        result = await persistResult(durationMs);
        await send("RECORDING_STATE", { recording: false });
        resolve(result);
      } catch (error) {
        if (localWriter) await localWriter.abort().catch(() => {});
        await send("RECORDING_STATE", {
          recording: false, warning: "Recording could not be saved completely: " + error.message
        });
        reject(error);
      } finally {
        recorder = null;
        recordingPromise = null;
        localWriter = null;
        localRecordingId = null;
        localName = "";
        chunks = [];
      }
    }, { once: true });
    current.stop();
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
