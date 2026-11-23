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
function loadModel() {
  if (!recognizerPromise) {
    status("Loading local Whisper Tiny English model…");
    recognizerPromise = pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
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
    const model = await loadModel();
    status("Transcribing on this computer…");
    // whisper-tiny.en is an English-only model. Transformers.js rejects
    // language/task overrides for English-only Whisper; those options belong
    // to multilingual Whisper models, not this one.
    const output = await model(data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false
    });
    self.postMessage({ type: "RESULT", jobId, text: String(output?.text || "").trim() });
  } catch (error) {
    self.postMessage({ type: "ERROR", jobId, message: String(error?.message || error) });
  }
};
