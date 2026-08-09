const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function listAudioJobs(show) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, show, "scripts", "build-audio.js"), "--list"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${show}: ${result.stdout}${result.stderr}`);
  return {
    lines: Number(result.stdout.match(/line_jobs=(\d+)/)?.[1]),
    words: Number(result.stdout.match(/word_jobs=(\d+)/)?.[1]),
  };
}

test("natural audio jobs follow delayed pages' full lyric data", () => {
  assert.deepEqual(listAudioJobs("elisabeth-das-musical"), { lines: 1572, words: 2181 });
  assert.deepEqual(listAudioJobs("rebecca-das-musical"), { lines: 1722, words: 2165 });
  assert.deepEqual(listAudioJobs("dracula-das-musical"), { lines: 808, words: 1404 });
});

test("audio cleanup follows delayed pages' full lyric data", () => {
  const pruner = fs.readFileSync(path.join(root, "shared", "prune-generated-audio.js"), "utf8");
  assert.match(pruner, /songs-full\.js/);
});
