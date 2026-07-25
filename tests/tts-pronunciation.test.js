const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const overrides = require("../scripts/tts-pronunciation-overrides.json");
const { cleanSpeechText } = require("../shared/build-natural-audio.js");

function runAudit() {
  const result = spawnSync("node", ["scripts/audit-tts-pronunciation.js"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("every four-digit year line has an explicit pronunciation", () => {
  const report = runAudit();
  assert.equal(report.fourDigitLines.length, 21);
  assert.deepEqual(report.uncoveredFourDigitLines, []);
  report.fourDigitLines.forEach((line) => assert.ok(line.speak, `${line.show}: ${line.lineId}`));
});

test("Hamilton year word cards use year readings instead of raw numbers", () => {
  const report = runAudit();
  assert.deepEqual(report.numericWordEntries.map((entry) => entry.key), ["1776", "1780", "1781", "1789", "1800"]);
  assert.deepEqual(overrides.Hamilton.words, {
    1776: "seventeen seventy-six",
    1780: "seventeen eighty",
    1781: "seventeen eighty-one",
    1789: "seventeen eighty-nine",
    1800: "eighteen hundred",
  });
});

test("name-before-contraction fixes retain the contraction with an audible pause", () => {
  assert.equal(
    overrides.Hamilton.lines["ham-11-044"],
    "But Alexander, I'll never forget the first",
  );
  assert.equal(
    overrides["love-never-dies"].lines["phantom-of-the-opera-29-075"],
    "My Christine, I'll be no longer denied",
  );
});

test("TTS strips speaker labels and timestamps without speaking label-only rows", () => {
  assert.equal(
    cleanSpeechText("[00:06.06][HAMILTON]What do you need, sir? Sir?"),
    "What do you need, sir? Sir?",
  );
  assert.equal(
    cleanSpeechText("[WASHINGTON]We're too fragile to start another fight."),
    "We're too fragile to start another fight.",
  );
  assert.equal(cleanSpeechText("[BURR]"), "");
});
