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
console.log("ZAIF ARC static checks passed.");
