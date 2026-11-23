const $ = id => document.getElementById(id);
const store = globalThis.ZaifAudioStore;
const query = new URLSearchParams(location.search);
const recordingId = query.get("recording");
const workerURL = chrome.runtime.getURL("lib/whisper-worker.mjs");
let chosenFile = null;
let recordedBlob = null;
let sourceName = "";
let lastTranscript = "";
let activeWorker = null;
let rejectWorker = null;
let saving = false;
let currentJob = 0;
let busy = false;
let runtimeReady = false;
function setStatus(message, error = false) {
  $("modelStatus").textContent = message;
  $("modelStatus").classList.toggle("is-error", error);
}
function fileNameForText(name) {
  return (name || "ZAIF-transcript").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._ -]/g, "_") + ".txt";
}
function currentBlob() { return chosenFile || recordedBlob; }
function updateButtons() {
  $("transcribeBtn").disabled = busy || !runtimeReady || !currentBlob();
  $("cancelBtn").disabled = !busy || saving;
  $("audioFile").disabled = busy;
  $("modelMode").disabled = busy;
  $("copyBtn").disabled = !lastTranscript;
  $("downloadBtn").disabled = !lastTranscript;
}
function displayText(text, name, meta = "") {
  lastTranscript = text;
  $("transcriptText").value = text;
  $("transcriptMeta").textContent = [name || "", meta].filter(Boolean).join(" · ");
  updateButtons();
}
async function checkRuntime() {
  try {
    const response = await fetch(workerURL, { cache: "no-cache" });
    runtimeReady = response.ok && response.headers.get("content-type") !== "text/html";
    if (!runtimeReady) throw new Error("Not installed.");
    setStatus("Offline Whisper runtime ready. Transcription uses CPU/WASM.");
  } catch {
    runtimeReady = false;
    setStatus("Local Whisper runtime is missing. In the extension folder, run: npm install --ignore-scripts && npm run setup. Then reload Chrome extension.", true);
  }
  updateButtons();
}
async function loadRecording() {
  if (!recordingId) return;
  const { recordings = [] } = await chrome.storage.local.get("recordings");
  const recording = recordings.find(item => item.id === recordingId);
  if (!recording) { setStatus("Recording no longer exists in the ZAIF library. You can still import a local file.", true); return; }
  sourceName = recording.name;
  $("selectedInfo").textContent = "ZAIF recording: " + recording.name;
  const saved = await store.getTranscript(recordingId);
  if (saved) {
    displayText(saved.text, saved.filename || recording.name, "Previously transcribed on this device");
  }
  if (recording.storage === "folder") {
    try { recordedBlob = await ZaifLocalFiles.openFile(recordingId); }
    catch (error) {
      recordedBlob = null;
      $("selectedInfo").textContent = recording.name + " — folder unavailable. Reconnect access in the ZAIF dashboard or import this file.";
    }
  } else {
    recordedBlob = await store.getAudio(recordingId);
  }
  if (!recordedBlob) {
    if (recording.storage !== "folder") {
      $("selectedInfo").textContent = recording.name + " — temporary audio copy unavailable. Choose its saved file using Import above.";
    }
  } else {
    $("selectedInfo").textContent = recording.name + " — ready for local transcription (" + (recordedBlob.size / 1048576).toFixed(1) + " MB)";
  }
  updateButtons();
}
$("audioFile").addEventListener("change", () => {
  chosenFile = $("audioFile").files[0] || null;
  if (chosenFile) {
    sourceName = chosenFile.name;
    $("selectedInfo").textContent = chosenFile.name + " — selected from this computer (" + (chosenFile.size / 1048576).toFixed(1) + " MB)";
    setStatus(runtimeReady ? "File ready. Press TRANSCRIBE." : "Install Whisper runtime before transcribing.");
  }
  updateButtons();
});
async function decodeToMono16k(blob, mode) {
  if (blob.size > 20 * 1024 * 1024) throw new Error("This recording is too large for safe in-browser transcription (20 MB limit). The original recording remains on your computer. Use a local desktop transcription tool for long calls.");
  setStatus("Decoding audio and preparing 16 kHz waveform…");
  const context = new AudioContext({ sampleRate: 16000 });
  let audio;
  try { audio = await context.decodeAudioData(await blob.arrayBuffer()); }
  catch (err) { throw new Error("Chrome could not decode this audio file. Try exporting it as WAV, MP3, or WebM audio. " + err.message); }
  finally { await context.close().catch(() => {}); }
  if (!audio.duration || audio.duration > 1200) throw new Error("For Chrome performance, transcribe clips of 20 minutes or less. The recording itself is unchanged.");
  if (mode === "base" && audio.duration > 480) throw new Error("Base English supports up to 8 minutes. Choose Fast — Tiny English for this recording.");
  const mono = audio.getChannelData(0);
  for (let channel = 1; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) mono[i] += samples[i];
  }
  if (audio.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= audio.numberOfChannels;
  }
  return mono;
}
async function transcribe() {
  if (busy) return;
  const mode = $("modelMode").value;
  const blob = currentBlob();
  if (!blob) { setStatus("Choose a recording or import an audio/video file first.", true); return; }
  if (!runtimeReady) { setStatus("Install the local Whisper runtime first with npm run setup.", true); return; }
  busy = true; updateButtons();
  const jobId = ++currentJob;
  try {
    const pcm = await decodeToMono16k(blob, mode);
    if (jobId !== currentJob) return;
    setStatus("Starting Whisper worker…");
    const { text, quietSeconds } = await new Promise((resolve, reject) => {
      const worker = new Worker(workerURL, { type: "module", name: "zaif-whisper" });
      activeWorker = worker;
      rejectWorker = reject;
      worker.onerror = event => {
        event.preventDefault();
        reject(new Error(event.message || "Whisper worker failed to load."));
      };
      worker.onmessage = ({ data }) => {
        if (currentJob !== jobId) return;
        if (data.jobId && data.jobId !== jobId) return;
        if (data.type === "STATUS") setStatus(data.message);
        if (data.type === "PROGRESS") {
          $("transcribeProgress").hidden = false;
          $("transcribeProgress").value = Math.max(0, Math.min(100, data.percent || 0));
          setStatus(data.message);
        }
        if (data.type === "RESULT") resolve(data);
        if (data.type === "ERROR") reject(new Error(data.message));
      };
      worker.postMessage({ type: "TRANSCRIBE", jobId, mode, audio: pcm }, [pcm.buffer]);
    });
    if (jobId !== currentJob) return;
    if (!text) throw new Error("Whisper returned no speech. Please verify the recording contains audible voices.");
    saving = true;
    updateButtons();
    const id = recordingId || "import:" + crypto.randomUUID();
    const entry = { id, text, filename: sourceName || "Imported recording", createdAt: Date.now() };
    await store.putTranscript(entry);
    if (recordingId) {
      await store.deleteAudio(recordingId);
      if (!recordedBlob?.name) { // Cached Downloads audio: forget the temporary copy.
        recordedBlob = null;
        chosenFile = null;
        $("audioFile").value = "";
        $("selectedInfo").textContent = "Transcript saved. Temporary audio copy cleared to save space.";
      } else {
        $("selectedInfo").textContent = "Transcript saved. Original recording stays on your computer.";
      }
    }
    displayText(text, sourceName, "Saved on this device");
    setStatus("Transcription completed ♡" + (quietSeconds ? " · Skipped " + quietSeconds.toFixed(1) + " seconds of near-silence." : ""));
  } catch (error) {
    if (jobId === currentJob) setStatus("Transcription failed: " + (error?.message || error), true);
  } finally {
    if (jobId !== currentJob) return;
    saving = false;
    rejectWorker = null;
    activeWorker?.terminate();
    activeWorker = null;
    $("transcribeProgress").hidden = true;
    busy = false;
    updateButtons();
  }
}
$("transcribeBtn").addEventListener("click", transcribe);
$("cancelBtn").addEventListener("click", () => {
  if (!busy) return;
  currentJob++;
  rejectWorker?.(new Error("Cancelled"));
  rejectWorker = null;
  activeWorker?.terminate();
  activeWorker = null;
  busy = false;
  $("transcribeProgress").hidden = true;
  setStatus("Transcription cancelled. You can try again.");
  updateButtons();
});
$("copyBtn").addEventListener("click", async () => {
  if (!lastTranscript) return;
  try { await navigator.clipboard.writeText(lastTranscript); setStatus("Transcript copied to clipboard."); }
  catch { setStatus("Clipboard access failed. Select and copy the transcript text manually.", true); }
});
$("downloadBtn").addEventListener("click", () => {
  if (!lastTranscript) return;
  const url = URL.createObjectURL(new Blob([lastTranscript + "\n"], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileNameForText(sourceName);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
(async () => {
  await Promise.allSettled([checkRuntime(), loadRecording()]);
  updateButtons();
})();
