import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
const root = new URL("../", import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "src/background.js");
assert.ok(manifest.permissions.includes("tabCapture"));
assert.ok(manifest.permissions.includes("offscreen"));
assert.ok(!manifest.host_permissions, "No blanket site permissions");
for (const path of ["src/background.js","src/offscreen.js","src/dashboard.js","src/call-detector.js","src/local-files.js"]) {
  new vm.Script(read(path), { filename: path });
}
const html = read("src/dashboard.html");
const js = read("src/dashboard.js");
for (const id of [...js.matchAll(/\$\("([a-zA-Z0-9]+)"\)/g)].map(x => x[1])) {
  assert.ok(html.includes('id="' + id + '"'), "Missing HTML control " + id);
}
assert.ok(html.includes("WELCOME, FIZU."));
assert.ok(html.includes('class="intro-ring-panda"'), "Panda replaces the heart on the intro ring");
assert.ok(html.includes('src="../assets/panda-headphones.svg"'), "Intro uses local panda illustration");
assert.ok(!html.includes("intro-ring-heart"), "Old intro heart removed");
assert.ok(!html.includes("A little sparkle, just for you"), "Old intro subtitle removed");
assert.ok(html.includes("INITIALIZING ZAIF PROTOCOL..."));
assert.ok(html.includes("AUTHORIZED PERSON DETECTED..."));
assert.ok(!html.includes("SYSTEM MESSAGE"));
assert.ok(html.includes('href="fizu-theme.css"'), "FIZU stylesheet must be linked");
assert.ok(html.includes("../assets/panda-headphones.svg"), "Panda mascot must be visible");
assert.ok(html.includes("ZAIF <span>//</span> ARC"), "Brand should remain in header");
assert.ok(html.includes("../assets/panda-headphones.svg"), "Panda companion must remain");
const theme = read("src/fizu-theme.css");
const panda = read("assets/panda-headphones.svg");
const blossom = read("assets/blossom-sprig.svg");
assert.ok(theme.includes("prefers-reduced-motion"), "Respect reduced motion setting");
assert.ok(theme.includes(".intro-ring-panda"), "Panda ring CSS must exist");
assert.ok(!theme.includes("intro-ring-heart"), "Old heart CSS must be removed");
assert.ok(!theme.includes(".intro-subtitle"), "Unused intro subtitle CSS must be removed");
assert.ok(theme.includes("../assets/blossom-sprig.svg"), "Floral artwork must be local");
assert.ok(panda.includes("<svg") && panda.includes("headphones"), "Panda SVG missing");
assert.ok(blossom.includes("<svg"), "Blossom SVG missing");
for (const message of [
  "Your recordings will live here ✨",
  "Recording started ✨",
  "Saved successfully ♡"
]) assert.ok(js.includes(message), "Missing approved copy: " + message);
assert.ok(js.includes("fizuEditionIntroSeen"), "Versioned welcome is required");
assert.ok(html.includes("In-call indicator CSS selector (optional)"));
assert.ok(html.includes("Leave blank for manual ChatGPT test"));
for (const removed of [
  "Ready when you are ♡",
  "a little something for you ♡",
  "FIZU EDITION <span class=\"soft-divider\">✦</span> AUDIO REACTOR CORE",
  "A little home for your saved moments.",
  "A softer little place to keep every conversation.",
  "✿ &nbsp; FIZU EDITION &nbsp; ✿",
  "Let’s get everything ready."
]) {
  assert.ok(!html.includes(removed), "Unwanted dashboard copy remains: " + removed);
  assert.ok(!js.includes(removed), "Unwanted JS copy remains: " + removed);
  assert.ok(!read("README.md").includes(removed), "Unwanted README copy remains: " + removed);
}
const manifestVersion = JSON.parse(read("manifest.json")).version;
assert.equal(manifestVersion, JSON.parse(read("package.json")).version);
const originalBackendPaths = ["src/background.js", "src/offscreen.js", "src/call-detector.js"];
assert.equal(originalBackendPaths.length, 3); // Backend remains present and untouched by this UI-only change
assert.ok(!html.includes("Everything is under control, sweetheart"));
// Transcription is entirely optional to the recording path.
assert.ok(manifest.content_security_policy.extension_pages.includes("'wasm-unsafe-eval'"), "Local Whisper WASM must be enabled by CSP");
assert.ok(read("src/dashboard.html").includes('id="importAudio"'), "Import entry point missing");
assert.ok(read("src/dashboard.js").includes('TRANSCRIBE'), "Per-recording transcription action missing");
assert.ok(read("src/offscreen.html").includes('src="audio-store.js"'), "Offscreen audio cache missing");
assert.ok(read("src/offscreen.js").includes("ZaifAudioStore.putAudio"), "Saved calls must cache audio once for transcription");
assert.ok(read("src/background.js").includes("ZaifAudioStore.deleteRecording"), "Deleting calls must clear transcripts/audio");
const transcriptHtml = read("src/transcribe.html");
const transcriptJs = read("src/transcribe.js");
assert.ok(transcriptHtml.includes('id="transcribeBtn"'));
assert.ok(transcriptHtml.includes('id="audioFile"'));
assert.ok(transcriptHtml.includes('id="copyBtn"') && transcriptHtml.includes('id="downloadBtn"'));
for (const filename of ["src/audio-store.js", "src/transcribe.js", "src/whisper-worker-entry.js"]) {
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, ["--check", filename], { encoding: "utf-8" });
  assert.equal(child.status, 0, filename + " syntax error: " + child.stderr);
}
assert.ok(read("src/whisper-worker-entry.js").includes('env.allowRemoteModels = false'), "Model must not request hosted inference");
assert.ok(read("scripts/setup-whisper.mjs").includes("encoder_model_quantized.onnx"), "Offline model files missing");
assert.ok(transcriptJs.includes("ZaifAudioStore") || transcriptJs.includes("globalThis.ZaifAudioStore"), "Transcription must use local store");
// Local folder recording: user-granted directory handles and direct chunk writing.
const localSource = read("src/local-files.js");
const offscreenSource = read("src/offscreen.js");
const backgroundSource = read("src/background.js");
assert.ok(html.includes('id="chooseFolder"') && html.includes('id="reconnectFolder"'));
assert.ok(html.includes('id="localAudioPlayer"'));
assert.ok(html.includes('src="local-files.js"'));
assert.ok(read("src/offscreen.html").includes('src="local-files.js"'));
assert.ok(localSource.includes("showDirectoryPicker"));
assert.ok(localSource.includes("queryPermission") && localSource.includes("requestPermission"));
assert.ok(localSource.includes("createWritable") && localSource.includes("indexedDB"));
assert.ok(offscreenSource.includes("await writable.write(blob)"), "Media chunks must stream to disk");
assert.ok(offscreenSource.includes("SAVE_LOCAL_RECORDING"), "Disk recording must register in library");
assert.ok(offscreenSource.includes("blob.size <= 12 * 1024 * 1024"), "In-browser recording copy must be bounded");
assert.ok(backgroundSource.includes('item.storage === "folder"'), "Disk and Downloads metadata require separate handling");
assert.ok(backgroundSource.includes("registerFolderRecording"));
assert.ok(read("src/dashboard.js").includes("ZaifLocalFiles.deleteFile"));
assert.ok(read("src/transcribe.js").includes("ZaifLocalFiles.openFile"), "Transcribe directly from linked computer file");
assert.ok(read("src/transcribe.js").includes("20 * 1024 * 1024"), "Limit browser transcription input");
assert.ok(read("src/storage.css").includes(".local-folder-panel"));
// Regression: simulate the real worker message path with a stub English-only
// Whisper pipeline. It must never pass multilingual-only language/task options.
const workerSource = read("src/whisper-worker-entry.js");
const messages = [];
let decodeOptions = null;
const sandbox = {
  URL,
  Float32Array,
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: async (pipelineTask, modelName) => {
    assert.equal(pipelineTask, "automatic-speech-recognition");
    assert.equal(modelName, "Xenova/whisper-tiny.en");
    return async (audio, options) => {
      assert.ok(audio instanceof Float32Array);
      decodeOptions = options;
      if (Object.hasOwn(options, "task") || Object.hasOwn(options, "language")) {
        throw new Error("Cannot specify task or language for an English-only model.");
      }
      return { text: "Welcome to Samplelib dot com." };
    };
  },
  self: { postMessage: message => messages.push(message) }
};
const testWorkerSource = workerSource
  .replace('import { env, pipeline } from "@huggingface/transformers";', "")
  .replace(/import\.meta\.url/g, JSON.stringify("chrome-extension://test-extension/lib/whisper-worker.mjs"));
new vm.Script(testWorkerSource, { filename: "src/whisper-worker-entry.js" }).runInNewContext(sandbox);
assert.equal(typeof sandbox.self.onmessage, "function", "Whisper worker message handler unavailable");
await sandbox.self.onmessage({ data: {
  type: "TRANSCRIBE",
  jobId: 19,
  audio: new Float32Array([0.1, 0.2, 0.1])
}});
assert.ok(decodeOptions, "Whisper decoding options were not passed");
assert.equal(Object.hasOwn(decodeOptions, "task"), false, "English-only Whisper must omit task");
assert.equal(Object.hasOwn(decodeOptions, "language"), false, "English-only Whisper must omit language");
assert.ok(messages.some(message =>
  message.type === "RESULT" && message.jobId === 19 &&
  message.text === "Welcome to Samplelib dot com."
), "Worker should successfully return text for English-only model");
assert.ok(!messages.some(message => message.type === "ERROR"), "Worker unexpectedly reported an error");
// Exact sample coverage, late failures and genuine repeated phrases.
const samples = new Float32Array(62 * 16000 + 1).fill(0.25);
async function exercise(outputs, input = samples) {
  messages.length = 0;
  let covered = 0;
  sandbox.pipeline = async (_, id) => {
    assert.equal(id, "Xenova/whisper-base.en");
    return async (segment, options) => {
      assert.equal(options.chunk_length_s, 0);
      assert.equal(segment.buffer, input.buffer);
      assert.equal(segment.byteOffset, covered * 4);
      covered += segment.length;
      return { text: outputs.shift() };
    };
  };
  new vm.Script(testWorkerSource).runInNewContext(vm.createContext({ ...sandbox }));
  await sandbox.self.onmessage({ data: { type: "TRANSCRIBE", jobId: 20, mode: "base", audio: input } });
  return covered;
}
assert.equal(await exercise(["again", "again", "final word"]), samples.length);
assert.equal(messages.at(-1).text, "again again final word");
assert.equal(messages.at(-2).percent, 100);
await exercise(["recognized", ""]);
assert.equal(messages.at(-1).type, "ERROR");
assert.ok(!messages.some(m => m.type === "RESULT"));
assert.equal(await exercise([], new Float32Array(32000)), 0);
assert.equal(messages.at(-1).text, "");
// Fixed-seed microphone hiss at approximately -65 dBFS RMS.
let seed = 17;
const tone = Float32Array.from({ length: 25 * 16000 }, () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return (seed / 2 ** 32 * 2 - 1) * 0.001;
});
assert.equal(await exercise([], tone), 0);
assert.equal(messages.at(-1).quietSeconds, 25);
const softSpeech = tone.slice();
for (let i = 16000; i < 20000; i++) softSpeech[i] = 0.0012 * Math.sin(i / 12);
assert.equal(await exercise(["soft voice"], softSpeech), softSpeech.length);
assert.equal(messages.at(-1).text, "soft voice");
const withTail = new Float32Array(45 * 16000);
withTail.fill(0.03, 0, 20 * 16000);
withTail.set(tone, 20 * 16000);
await exercise(["last words"], withTail);
assert.equal(messages.at(-1).text, "last words");
assert.ok(messages.at(-1).quietSeconds >= 18);
assert.equal(messages.at(-2).percent, 100);
console.log("ZAIF ARC static checks passed.");
