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
for (const path of ["src/background.js","src/offscreen.js","src/dashboard.js","src/call-detector.js"]) {
  new vm.Script(read(path), { filename: path });
}
const html = read("src/dashboard.html");
const js = read("src/dashboard.js");
for (const id of [...js.matchAll(/\$\("([a-zA-Z0-9]+)"\)/g)].map(x => x[1])) {
  assert.ok(html.includes('id="' + id + '"'), "Missing HTML control " + id);
}
assert.ok(html.includes("WELCOME, FIZU."));
assert.ok(html.includes("INITIALIZING ZAIF PROTOCOL..."));
assert.ok(html.includes("AUTHORIZED PERSON DETECTED..."));
assert.ok(!html.includes("SYSTEM MESSAGE"));
assert.ok(!html.includes("Everything is under control, sweetheart"));
console.log("ZAIF ARC static checks passed.");
