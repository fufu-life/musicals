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

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", "audio-sinji-manifest.json"), "utf8"));
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
  const builder = fs.readFileSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", "scripts", "build-data.py"), "utf8");
  assert.match(builder, /Documents\/02_Areas\/06_剧院与现场/u);
  assert.doesNotMatch(builder, /"dzw-16-021"\s*:/u);
  assert.doesNotMatch(builder, /JYUTPING_OVERRIDES/u, "stale Jyutping overrides must not shadow reviewed sources");
  const line = targetLine(loadSongs(path.join(ROOT, "..", "musicals-local-archive", "大状王", "songs.js")));
  assert.equal(line.text, "未求他生碰面 但求延續記念");
  assert.equal(line.jyutping, "mei6 kau4 taa1 saang1 pung3 min6 daan6 kau4 jin4 zuk6 gei3 nim6");
  assert.deepEqual(
    loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")),
    normalizeAuthoritativeBuildForPage(loadSongs(path.join(ROOT, "..", "musicals-local-archive", "大状王", "songs.js"))),
    "the website copy must equal the authoritative build output",
  );
});

test("the corrected line keeps its stable ID and audio path", () => {
  const line = targetLine(loadSongs(path.join(ROOT, "dazhuangwang", "songs.js")));
  assert.equal(line.id, "dzw-16-021");
  assert.equal(line.audio, "audio/16-雪地寒山/dzw-16-021.mp3");
});

test("feedback Jyutping corrections are reflected in the page runtime", () => {
  const songs = loadSongs(path.join(ROOT, "dazhuangwang", "songs.js"));
  const lines = new Map(songs.flatMap((song) => song.lines).map((line) => [line.id, line]));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", "audio-sinji-manifest.json"), "utf8"),
  );
  const manifestEntries = new Map(manifest.map((entry) => [entry.id, entry]));
  assert.deepEqual(
    [
      ["dzw-06-001", lines.get("dzw-06-001")?.jyutping],
      ["dzw-11-010", lines.get("dzw-11-010")?.jyutping],
      ["dzw-02-025", lines.get("dzw-02-025")?.jyutping],
      ["dzw-02-036", lines.get("dzw-02-036")?.jyutping],
    ],
    [
      ["dzw-06-001", "je6 sik1 si6 jam1 laang5"],
      ["dzw-11-010", "joek6 ngo5 wui4 mong6 dong1 co1 soeng2 cyu3 zi1 taai3 jin4"],
      ["dzw-02-025", "zit3 sin3 taan1 hoi1 soeng5 zan6 po3 po3 po3"],
      ["dzw-02-036", "joek6 hai6 jiu3 kaau3 ngo5 bou2 ming6 maai6 dong3 ze3 dou1 mei6 gwo3 fo2"],
    ],
  );
  assert.deepEqual(
    ["dzw-06-001", "dzw-11-010", "dzw-02-025", "dzw-02-036"].map((id) => [id, manifestEntries.get(id)?.jyutping]),
    [
      ["dzw-06-001", "je6 sik1 si6 jam1 laang5"],
      ["dzw-11-010", "joek6 ngo5 wui4 mong6 dong1 co1 soeng2 cyu3 zi1 taai3 jin4"],
      ["dzw-02-025", "zit3 sin3 taan1 hoi1 soeng5 zan6 po3 po3 po3"],
      ["dzw-02-036", "joek6 hai6 jiu3 kaau3 ngo5 bou2 ming6 maai6 dong3 ze3 dou1 mei6 gwo3 fo2"],
    ],
  );
});

test("镜中缘 is recorded as a separate slash-free cut song with aligned Jyutping", () => {
  const cutSource = JSON.parse(
    fs.readFileSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", "删减曲目-镜中缘.json"), "utf8"),
  );
  const sourceSong = cutSource.songs.find((song) => song.order === 20);
  assert.equal(sourceSong.titleTraditional, "鏡中緣");
  assert.equal(sourceSong.lines.length, 23);
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
  assert.deepEqual(
    sourceSong.lines.slice(-5).map((line) => [line.traditional, line.simplified, line.jyutping]),
    [
      ["不折 不扣 心鏡中間有粒星宿", "不折 不扣 心镜中间有粒星宿", "bat1 zit3 bat1 kau3 sam1 geng3 zung1 gaan1 jau5 lap1 sing1 sau3"],
      ["照心裏 黑暗 一瞬間反照出錦繡", "照心里 黑暗 一瞬间反照出锦绣", "ziu3 sam1 leoi5 hak1 am3 jat1 si6 gaan3 faan2 ziu3 ceot1 gam2 sau3"],
      ["用葡萄造就美酒", "用葡萄造就美酒", "jung6 pou4 tou4 zou6 zau6 mei5 zau2"],
      ["飲一口山清水秀", "饮一口山清水秀", "jam2 jat1 hau2 saan1 cing1 seoi2 sau3"],
      ["知道與否 是醇是厚", "知道与否 是醇是厚", "zi1 dou6 jyu5 fau2 si6 seon4 si6 hau5"],
    ],
  );

  const builtSong = loadSongs(path.join(ROOT, "..", "musicals-local-archive", "大状王", "songs.js")).find(
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
  assert.match(page, /--font-song: "Songti SC", "Songti TC", "STSongti-SC", "STSongti-TC", "STSongti-SC-Regular", "STSongti-TC-Regular"/u);
  assert.match(page, /@media \(max-width: 860px\)[\s\S]*--font-song: "STFangsong", "FangSong", "STKaiti", "Kaiti SC", "Kaiti TC", "STSong"/u);
  assert.match(page, /function moveDisplaySettingsBeforeSimplifiedToggle\(\)[\s\S]*controls\.insertBefore\(displaySettings, simplifiedToggle\)/u);
  assert.doesNotMatch(page, /#musicalDisplaySettings \.musical-display-trigger\s*\{[^}]*width: 32px/u);
  assert.doesNotMatch(page, /#musicalDisplaySettings \.musical-display-trigger svg\s*\{[^}]*width: 16px/u);
  assert.match(page, /#musicalDisplaySettings\s*\{\s*z-index: 1;/u);
  assert.match(page, /#musicalDisplaySettings \.musical-display-trigger:is\(:hover, :focus-visible\)[\s\S]*background: rgba\(215, 199, 161, 0\.12\)/u);
  assert.match(page, /--jyutping-row-height: 0\.88rem/u);
  assert.match(page, /\.lyrics-list \{\s*gap: 4px;/u);
  assert.match(page, /\.lyric-row \{\s*align-items: start;\s*gap: 5px;\s*padding-block: 2px;/u);
});

test("镜中缘新增删减段落 has source and web audio", () => {
  const ids = ["dzw-20-019", "dzw-20-020", "dzw-20-021", "dzw-20-022", "dzw-20-023"];
  const sourceSongs = loadSongs(path.join(ROOT, "..", "musicals-local-archive", "大状王", "songs.js"));
  const pageSongs = loadSongs(path.join(ROOT, "dazhuangwang", "songs.js"));
  const sourceSong = sourceSongs.find((song) => song.id === "20-镜中缘");
  const pageSong = pageSongs.find((song) => song.id === "20-镜中缘");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", "audio-sinji-manifest.json"), "utf8"));

  ids.forEach((id) => {
    const sourceLine = sourceSong.lines.find((line) => line.id === id);
    const pageLine = pageSong.lines.find((line) => line.id === id);
    assert.equal(sourceLine.audio, `audio/20-镜中缘/${id}.wav`);
    assert.equal(pageLine.audio, `audio/20-镜中缘/${id}.mp3`);
    assert.ok(fs.existsSync(path.join(ROOT, "..", "musicals-local-archive", "大状王", sourceLine.audio)), id);
    assert.ok(fs.existsSync(path.join(ROOT, "dazhuangwang", pageLine.audio)), id);
    assert.ok(manifest.some((entry) => entry.song === "镜中缘" && entry.id === id), id);
  });
});

test("执葬 annotation explains the historical reburial practice", () => {
  const expected = "意思是“执骨重葬”。旧时土葬，若干年后后人会开坟将先人骸骨捡出来装入金瓮再次下葬，叫执骨重葬，简称为执葬。";
  const sourceSongs = loadSongs(path.join(ROOT, "..", "musicals-local-archive", "大状王", "songs.js"));
  const pageSongs = loadSongs(path.join(ROOT, "dazhuangwang", "songs.js"));

  for (const songs of [sourceSongs, pageSongs]) {
    const song = songs.find((item) => item.id === "01-申冤");
    assert.equal(song.annotations.find((item) => item.term === "执葬").meaning, expected);
    assert.equal(song.lines.find((line) => line.id === "dzw-01-044").analysis.words.find((item) => item.term === "执葬").meaning, expected);
  }
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
