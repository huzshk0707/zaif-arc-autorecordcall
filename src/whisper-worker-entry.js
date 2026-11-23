// Bundled as lib/whisper-worker.mjs by scripts/setup-whisper.mjs.
import { env, pipeline } from "@huggingface/transformers";

const folder = new URL("./", import.meta.url);
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("models/", folder).href;
env.backends.onnx.wasm.wasmPaths = new URL("ort/", folder).href;
// One thread avoids cross-origin isolation / SharedArrayBuffer requirements in MV3.
env.backends.onnx.wasm.numThreads = 1;

let recognizerPromise = null;
function status(message) { self.postMessage({ type: "STATUS", message }); }
function loadModel(mode) {
  if (!recognizerPromise) {
    const id = mode === "base" ? "Xenova/whisper-base.en" : "Xenova/whisper-tiny.en";
    status("Loading local " + id + "…");
    recognizerPromise = pipeline("automatic-speech-recognition", id, {
      device: "wasm",
      dtype: "q8",
      progress_callback(event) {
        if (event?.status === "progress" && Number.isFinite(event.progress)) {
          self.postMessage({
            type: "PROGRESS",
            percent: Math.round(event.progress),
            message: "Loading model files…"
          });
        }
      }
    }).catch(error => { recognizerPromise = null; throw error; });
  }
  return recognizerPromise;
}
// Examine 20 ms frames so a short, soft utterance in a long pause can
// trigger inference. The floor is -74 dBFS RMS with a -64 dBFS peak veto.
// For louder room tone require stationary, broadband noise in every frame.
function isRoomTone(samples) {
  let minRms = Infinity;
  let maxRms = 0;
  let peak = 0;
  let broadband = true;
  for (let i = 0; i < samples.length; i += 320) {
    const end = Math.min(i + 320, samples.length);
    let energy = 0;
    let crossings = 0;
    for (let j = i; j < end; j++) {
      const value = samples[j];
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
      if (j > i && (value < 0) !== (samples[j - 1] < 0)) crossings++;
    }
    const rms = Math.sqrt(energy / (end - i));
    maxRms = Math.max(maxRms, rms);
    minRms = Math.min(minRms, rms);
    if (end - i >= 64 && crossings < (end - i) * 0.30) broadband = false;
  }
  if (maxRms < 0.0002 && peak < 0.00063) return true;
  return samples.length >= 16000 && broadband && maxRms < 0.001
    && peak < 0.003 && maxRms <= 1.5 * minRms;
}
self.onmessage = async ({ data }) => {
  if (data?.type !== "TRANSCRIBE") return;
  const jobId = data.jobId;
  try {
    if (!(data.audio instanceof Float32Array) || data.audio.length === 0) {
      throw new Error("Expected nonempty 16 kHz mono audio.");
    }
    let model;
    let quietSamples = 0;
    const parts = [];
    let start = 0;
    // Each sample belongs to exactly one segment. Within 20–27 seconds,
    // cut at the midpoint of the quietest 40 ms frame to favor pauses.
    // Leave at least one second of tail when splitting a longer recording.
    while (start < data.audio.length) {
      let end = data.audio.length;
      if (end - start > 28 * 16000) {
        let lowest = Infinity;
        for (let i = start + 20 * 16000; i + 640 <= start + 27 * 16000; i += 640) {
          let energy = 0;
          for (let j = i; j < i + 640; j++) energy += data.audio[j] ** 2;
          if (energy <= lowest) { lowest = energy; end = i + 320; }
        }
      }
      const segment = data.audio.subarray(start, end);
      if (isRoomTone(segment)) {
        quietSamples += segment.length;
      } else {
        model ??= await loadModel(data.mode);
        const output = await model(segment, { chunk_length_s: 0 });
        const text = output?.text?.trim();
        if (!text) throw new Error("No text recognized for " + (start / 16000).toFixed(1)
          + "–" + (end / 16000).toFixed(1) + " seconds. Review the audio or retry.");
        parts.push(text);
      }
      start = end;
      self.postMessage({ type: "PROGRESS", jobId, percent: 100 * end / data.audio.length,
        message: "Processed " + (end / 16000).toFixed(1) + " of "
          + (data.audio.length / 16000).toFixed(1) + " seconds" });
    }
    self.postMessage({ type: "RESULT", jobId, quietSeconds: quietSamples / 16000, text: parts.join(" ") });
  } catch (error) {
    self.postMessage({ type: "ERROR", jobId, message: String(error?.message || error) });
  }
};
