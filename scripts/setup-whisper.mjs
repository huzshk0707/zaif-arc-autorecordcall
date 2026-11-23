#!/usr/bin/env node
// One-time packaging: download Whisper Tiny EN + vendor the executable runtime.
// All model/network access happens here, on the developer PC or GitHub Actions.
// Chrome extension transcriptions use ONLY packaged local resources.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const lib = path.join(root, "lib");
const modelDir = path.join(lib, "models", "Xenova", "whisper-tiny.en");
const ORT_DIR = path.join(lib, "ort");
const MODEL_ID = "Xenova/whisper-tiny.en";
const REVISION = "587f87336f46d17831cc9a2539389bef5f082537";
const MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx"
];
const OPTIONAL_MODEL_FILES = [
  "special_tokens_map.json", "normalizer.json",
  "vocab.json", "merges.txt", "added_tokens.json"
];
function ensureInside(target, base) {
  if (!target.startsWith(base + path.sep)) throw new Error("Path escapes packaging directory.");
}
async function getFile(relative, optional = false) {
  const destination = path.join(modelDir, relative);
  ensureInside(destination, modelDir);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const existing = await fs.stat(destination).catch(() => null);
  if (existing && existing.size > 0) {
    console.log("✓ Cached:", relative);
    return;
  }
  const remote = "https://huggingface.co/" + MODEL_ID + "/resolve/" + REVISION + "/" + relative;
  console.log("↓ Downloading", relative);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(remote, {
        headers: { "User-Agent": "ZAIF-ARC-offline-packager/0.3.0" },
        signal: AbortSignal.timeout(180000)
      });
      if (response.status === 404 && optional) {
        console.log("· Not present (optional):", relative);
        return;
      }
      if (!response.ok || !response.body) throw new Error("HTTP " + response.status);
      const temporary = destination + ".download";
      // Stream large ONNX files without holding them in Node memory.
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      const { createWriteStream } = await import("node:fs");
      try {
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
        const size = (await fs.stat(temporary)).size;
        if (size < 64) throw new Error("Downloaded file looks incomplete.");
        await fs.rename(temporary, destination);
        console.log("✓", relative, (size / 1048576).toFixed(1) + " MB");
        return;
      } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  if (optional) {
    console.warn("· Skipped optional file:", relative, String(lastError));
    return;
  }
  throw new Error("Could not download " + relative + ": " + lastError);
}
async function copyRuntime() {
  const transformerPath = require.resolve("@huggingface/transformers");
  const transformerRequire = createRequire(transformerPath);
  const ortMain = transformerRequire.resolve("onnxruntime-web");
  // onnxruntime-web resolves to a file inside its dist folder.
  const source = path.dirname(ortMain);
  const ortFiles = (await fs.readdir(source))
    .filter(file => /^ort-wasm.*\.(mjs|wasm)$/.test(file));
  if (!ortFiles.some(file => file.endsWith(".wasm")) || !ortFiles.some(file => file.endsWith(".mjs"))) {
    throw new Error("The installed onnxruntime-web package is missing its WebAssembly runtime.");
  }
  await fs.mkdir(ORT_DIR, { recursive: true });
  for (const name of ortFiles) await fs.copyFile(path.join(source, name), path.join(ORT_DIR, name));
  console.log("✓ Local ONNX runtime:", ortFiles.length, "files");
}
async function main() {
  await fs.mkdir(lib, { recursive: true });
  console.log("Bundling local Whisper worker...");
  await build({
    entryPoints: [path.join(root, "src", "whisper-worker-entry.js")],
    outfile: path.join(lib, "whisper-worker.mjs"),
    bundle: true, format: "esm", platform: "browser", target: ["chrome116"],
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning"
  });
  console.log("✓ Whisper worker bundled.");
  await copyRuntime();
  await fs.mkdir(modelDir, { recursive: true });
  for (const name of MODEL_FILES) await getFile(name);
  for (const name of OPTIONAL_MODEL_FILES) await getFile(name, true);
  await fs.writeFile(path.join(lib, "model-info.json"), JSON.stringify({
    model: MODEL_ID, revision: REVISION, dtype: "q8",
    files: MODEL_FILES, runtime: "local-only"
  }, null, 2) + "\n");
  console.log("\n✓ Offline transcription bundle ready. Reload ZAIF ARC in Chrome.");
}
main().catch(error => { console.error("Whisper setup failed:", error); process.exitCode = 1; });
