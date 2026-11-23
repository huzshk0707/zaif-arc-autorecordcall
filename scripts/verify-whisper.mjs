import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const base = path.resolve("lib");
assert.ok(fs.existsSync(path.join(base, "whisper-worker.mjs")), "Bundle Whisper worker via npm run setup");
const ort = fs.readdirSync(path.join(base, "ort"));
assert.ok(ort.some(x => x.endsWith(".wasm")), "Missing local WASM binary");
assert.ok(ort.some(x => x.endsWith(".mjs")), "Missing local ONNX runtime module");
for (const name of ["whisper-base.en", "whisper-tiny.en"]) {
  const model = path.join(base, "models", "Xenova", name);
  for(const file of [
   "config.json", "generation_config.json", "preprocessor_config.json",
   "tokenizer.json", "tokenizer_config.json",
   "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"
  ]){
    const stat = fs.statSync(path.join(model, file));
    assert.ok(stat.size > 64, "Empty model file: " + file);
  }
}
const worker = fs.readFileSync(path.join(base,"whisper-worker.mjs"),"utf8");
assert.ok(worker.length > 10000, "Worker bundle looks incomplete");
console.log("Whisper offline assets present. This verifies packaging, not real-browser inference.");
