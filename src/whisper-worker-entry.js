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
self.onmessage = async ({ data }) => {
  if (data?.type !== "TRANSCRIBE") return;
  const jobId = data.jobId;
  try {
    if (!(data.audio instanceof Float32Array) || data.audio.length === 0) {
      throw new Error("Expected nonempty 16 kHz mono audio.");
    }
    const model = await loadModel(data.mode);
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
      if (segment.some(value => value !== 0)) {
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
    self.postMessage({ type: "RESULT", jobId, text: parts.join(" ") });
  } catch (error) {
    self.postMessage({ type: "ERROR", jobId, message: String(error?.message || error) });
  }
};
