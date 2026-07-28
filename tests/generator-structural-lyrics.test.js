const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  assertLyricsReadyForGeneration,
  extractSpeaker,
  extractTranslationSpeaker,
  findStructuralLyricCandidates,
} = require("../scripts/generate-musical-pages.js");

function songsWith(original) {
  return [{
    order: 1,
    lines: [{ id: "example-01-001", original }],
  }];
}

test("generator blocks flattened parallel vocals before writing page or audio data", () => {
  const songs = songsWith("Lead lyric (JM: backing lyric)");
  const candidates = findStructuralLyricCandidates(songs);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].reasons, ["embedded-speaker-label"]);
  assert.throws(
    () => assertLyricsReadyForGeneration(songs, { slug: "example" }),
    /Review parallel voices and line segmentation before page or audio generation/,
  );
});

test("generator also blocks full role names embedded in parentheses", () => {
  const songs = songsWith("Lead lyric (Rudolf als Kind: backing lyric)");
  assert.throws(
    () => assertLyricsReadyForGeneration(songs, { slug: "example" }),
    /embedded-speaker-label/,
  );
});

test("generator accepts a clean lyric row with structured speakers elsewhere", () => {
  const songs = songsWith("Lead lyric");
  assert.deepEqual(findStructuralLyricCandidates(songs), []);
  assert.doesNotThrow(() => assertLyricsReadyForGeneration(songs, { slug: "example" }));
});

test("speaker parsing does not treat ordinary colon lyrics or translations as roles", () => {
  assert.deepEqual(
    extractSpeaker("Traum, Tran - alles, was uns bleibt:"),
    { speaker: "", text: "Traum, Tran - alles, was uns bleibt:" },
  );
  assert.deepEqual(
    extractTranslationSpeaker("But it's true: I loved her"),
    { speaker: "", text: "But it's true: I loved her" },
  );
  assert.deepEqual(
    extractTranslationSpeaker("但可以确定：我爱过她"),
    { speaker: "", text: "但可以确定：我爱过她" },
  );
});

test("all generated musical pages are free of unresolved structural lyric candidates", () => {
  const root = path.resolve(__dirname, "..");
  const findings = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const songsFile = path.join(root, entry.name, "songs.js");
    if (!fs.existsSync(songsFile)) continue;
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(songsFile, "utf8"), sandbox);
    if (!Array.isArray(sandbox.window.songs)) continue;
    for (const candidate of findStructuralLyricCandidates(sandbox.window.songs)) {
      findings.push({ show: entry.name, ...candidate });
    }
  }

  assert.deepEqual(findings, []);
});
