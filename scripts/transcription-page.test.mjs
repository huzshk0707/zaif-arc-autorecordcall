import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../src/transcribe.js", import.meta.url), "utf8");

test("duration guard precedes inference and cancellation preserves cached audio for retry", async () => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      classList: { toggle() {} },
      addEventListener(event, handler) { this[event] = handler; }
    });
    return elements.get(id);
  }
  let duration = 481;
  const audio = new Blob(["cached audio"]);
  const workers = [];
  const writes = [];
  const store = {
    getAudio: async () => audio,
    getTranscript: async () => null,
    putTranscript: entry => writes.push(entry),
    deleteAudio: id => writes.push(id)
  };
  const context = {
    URLSearchParams, location: { search: "?recording=test-recording" },
    chrome: { runtime: { getURL: s => s }, storage: { local: {
      get: async () => ({ recordings: [{ id: "test-recording", name: "Call" }] })
    } } },
    fetch: async () => new Response(""), ZaifAudioStore: store,
    document: { getElementById: element },
    AudioContext: class {
      async decodeAudioData() {
        return { duration, numberOfChannels: 1, getChannelData: () => new Float32Array([1]) };
      }
      async close() {}
    },
    Worker: class {
      constructor() { workers.push(this); }
      postMessage(data) { this.job = data; }
      terminate() { this.terminated = true; }
    }
  };
  await vm.runInNewContext(source, context);
  element("modelMode").value = "base";
  await element("transcribeBtn").click();
  assert.match(element("modelStatus").textContent, /8 minutes/);
  assert.equal(workers.length, 0);
  for (const [mode, seconds] of [["tiny", 481], ["base", 480]]) {
    element("modelMode").value = mode;
    duration = seconds;
    const running = element("transcribeBtn").click();
    await new Promise(resolve => setImmediate(resolve));
    const worker = workers.at(-1);
    assert.equal(worker.job.mode, mode);
    element("cancelBtn").click();
    await running;
    assert.ok(worker.terminated);
    assert.equal(element("transcribeBtn").disabled, false);
    assert.deepEqual(writes, []);
  }
  assert.equal(workers.length, 2);
});
