const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadSongs(file, key = "dazhuangwangSongs") {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return JSON.parse(JSON.stringify(context.window[key] || []));
}

function targetLine(songs) {
  return songs
    .find((song) => song.id === "16-雪地寒山")
    .lines.find((line) => line.id === "dzw-16-021");
}

function normalizeAuthoritativeBuildForPage(songs) {
  return JSON.parse(JSON.stringify(songs)).map((song) => ({
    ...song,
    lines: song.lines.map((line) => {
      const normalized = { ...line };
      if (normalized.audio) normalized.audio = normalized.audio.replace(/\.wav$/u, ".mp3");
      if (normalized.id.startsWith("dzw-12-")) delete normalized.noAudio;
      return normalized;
    }),
  }));
}

test("雪地寒山 dzw-16-021 removes the extra 路 in every displayed lyric field", () => {
  const line = targetLine(loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")));
  assert.deepEqual(
    {
      text: line.text,
      simplified: line.simplified,
      jyutping: line.jyutping,
    },
    {
      text: "未求他生碰面 但求延續記念",
      simplified: "未求他生碰面 但求延续记念",
      jyutping: "mei6 kau4 taa1 saang1 pung3 min6 daan6 kau4 jin4 zuk6 gei3 nim6",
    },
  );
  assert.doesNotMatch(line.text, /路/u);
  assert.doesNotMatch(line.simplified, /路/u);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "大状王", "audio-sinji-manifest.json"), "utf8"));
  const audioLine = manifest.find((entry) => entry.id === "dzw-16-021");
  assert.deepEqual(
    {
      source: audioLine.source,
      speechInput: audioLine.speechInput,
      jyutping: audioLine.jyutping,
    },
    {
      source: "未求他生碰面 但求延续记念",
      speechInput: "未求他生碰面 但求延续记念",
      jyutping: "mei6 kau4 taa1 saang1 pung3 min6 daan6 kau4 jin4 zuk6 gei3 nim6",
    },
  );
});

test("the source builder reads the corrected authority instead of masking it", () => {
  const builder = fs.readFileSync(path.join(ROOT, "..", "大状王", "scripts", "build-data.py"), "utf8");
  assert.match(builder, /Documents\/02_Areas\/06_剧院与现场/u);
  assert.doesNotMatch(builder, /"dzw-16-021"\s*:/u);
  assert.doesNotMatch(builder, /JYUTPING_OVERRIDES/u, "stale Jyutping overrides must not shadow reviewed sources");
  const line = targetLine(loadSongs(path.join(ROOT, "..", "大状王", "songs.js")));
  assert.equal(line.text, "未求他生碰面 但求延續記念");
  assert.equal(line.jyutping, "mei6 kau4 taa1 saang1 pung3 min6 daan6 kau4 jin4 zuk6 gei3 nim6");
  assert.deepEqual(
    loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")),
    normalizeAuthoritativeBuildForPage(loadSongs(path.join(ROOT, "..", "大状王", "songs.js"))),
    "the website copy must equal the authoritative build output",
  );
});

test("the corrected line keeps its stable ID and audio path", () => {
  const line = targetLine(loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")));
  assert.equal(line.id, "dzw-16-021");
  assert.equal(line.audio, "audio/16-雪地寒山/dzw-16-021.mp3");
});

test("镜中缘 is recorded as a separate slash-free cut song with aligned Jyutping", () => {
  const cutSource = JSON.parse(
    fs.readFileSync(path.join(ROOT, "..", "大状王", "删减曲目-镜中缘.json"), "utf8"),
  );
  const sourceSong = cutSource.songs.find((song) => song.order === 20);
  assert.equal(sourceSong.titleTraditional, "鏡中緣");
  assert.equal(sourceSong.lines.length, 18);
  sourceSong.lines.forEach((line) => {
    assert.doesNotMatch(line.traditional, /\//u);
    assert.doesNotMatch(line.simplified, /\//u);
    assert.doesNotMatch(line.jyutping, /\//u);
    assert.equal(
      line.traditional.replace(/\s/gu, "").length,
      line.jyutping.trim().split(/\s+/u).length,
      line.id,
    );
  });
  assert.equal(sourceSong.lines[9].jyutping, "do1 hiu3 dak1 sam1 ci5 hin1 si1 ngau5");
  assert.equal(sourceSong.lines[15].jyutping, "mou4 noi6 zeoi3 zung1 fu2 zau2 kok3 zoi6 hau4");

  const builtSong = loadSongs(path.join(ROOT, "..", "大状王", "songs.js")).find(
    (song) => song.id === "20-镜中缘",
  );
  const pageSong = loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")).find(
    (song) => song.id === "20-镜中缘",
  );
  assert.equal(builtSong.isCutSong, true);
  assert.equal(builtSong.cutLabel, "删减曲");
  assert.deepEqual(pageSong, normalizeAuthoritativeBuildForPage([builtSong])[0]);

  const page = fs.readFileSync(path.join(ROOT, "dazhuangwang/index.html"), "utf8");
  assert.match(page, /id="songCutBadge"/u);
  assert.match(page, /song\.isCutSong/u);
  assert.match(page, /删减曲/u);
  assert.match(page, /\.song-cut-badge\[hidden\][\s\S]*display: none !important/u);
  assert.match(page, /\.dzw-shell \.song-title-row h1[\s\S]*font-size: clamp\(1\.4rem, 6vw, 2rem\)/u);
  assert.match(page, /--jyutping-row-height: 0\.88rem/u);
  assert.match(page, /\.lyrics-list \{\s*gap: 4px;/u);
  assert.match(page, /\.lyric-row \{\s*align-items: start;\s*gap: 5px;\s*padding-block: 2px;/u);
});

test("every Dazhuangwang annotation points to a real full-data lyric line", () => {
  const songs = loadSongs(path.join(ROOT, "dazhuangwang", "songs.js"));
  const missing = [];
  songs.forEach((song) => {
    const lineIds = new Set(song.lines.map((line) => line.id));
    (song.annotations || []).forEach((annotation) => {
      if (!lineIds.has(annotation.lineId)) {
        missing.push(`${song.id}:${annotation.term}:${annotation.lineId}`);
      }
    });
  });
  assert.deepEqual(missing, []);
});

test("annotation jumps can recover deferred full lyrics before resolving a row", () => {
  const page = fs.readFileSync(path.join(ROOT, "dazhuangwang/index.html"), "utf8");
  assert.match(page, /term\.dataset\.lineId = annotation\.lineId/);
  assert.match(page, /async function jumpToAnnotationLine\(lineId\)[\s\S]*?ensureFullSongs\(\)[\s\S]*?renderCurrentSong\(\)/);
});

test("about dialog follows the light theme text and panel variables", () => {
  const page = fs.readFileSync(path.join(ROOT, "dazhuangwang/index.html"), "utf8");
  assert.match(page, /\.about-header[\s\S]*?background: var\(--panel, var\(--bg-deep\)\)/);
  assert.match(page, /\.about-content[\s\S]*?color: var\(--ink\)/);
  assert.match(page, /text-decoration-color: color-mix\(in srgb, var\(--accent\) 48%, transparent\)/);
});
