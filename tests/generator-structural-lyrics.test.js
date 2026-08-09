const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  assertLyricsReadyForGeneration,
  assertNoUnreviewedContentChanges,
  extractSpeaker,
  extractGermanTripleSpeaker,
  extractTranslationSpeaker,
  findStructuralLyricCandidates,
  isSafeReviewedLineMerge,
  splitSentenceSegments,
  splitAlignedLongLine,
  splitAlignedSentenceSegments,
  SHOWS,
  parseEnglishChineseSingleColumnMarkdown,
  parseGermanTripleMarkdown,
  parseMarkdown,
} = require("../scripts/generate-musical-pages.js");
const lineBreakAudit = require("../scripts/audit-forced-line-breaks.js");
process.exitCode = 0;

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
  assert.deepEqual(
    extractSpeaker("Die große Redoute:"),
    { speaker: "", text: "Die große Redoute:" },
  );
  assert.deepEqual(
    extractSpeaker("Ruza/Doris/Alice: o boże/no.../it can't be..."),
    { speaker: "Ruza/Doris/Alice", text: "o boże/no.../it can't be..." },
  );
});

test("German triple sources preserve ordinary colon lyrics while extracting conservative role prefixes", () => {
  assert.deepEqual(
    extractGermanTripleSpeaker("Bei den Toten will ich es schwören:"),
    { speaker: "", text: "Bei den Toten will ich es schwören:" },
  );
  assert.deepEqual(
    extractGermanTripleSpeaker("A: Ich bin hier"),
    { speaker: "A", text: "Ich bin hier" },
  );
  assert.deepEqual(
    extractGermanTripleSpeaker("Mr. De Winter: Keine Sorge"),
    { speaker: "Mr. De Winter", text: "Keine Sorge" },
  );
});

test("German triple parser reads the authoritative German, English, and Chinese columns", () => {
const markdown = `# 01. Auftakt

- 原歌名：Auftakt
- 中文歌名：未提供

| 德语 | 英文 | 中文 |
| --- | --- | --- |
| Bei den Toten will ich es schwören: | I swear it by the dead: | 我向死者发誓： |
| A: Ich bin hier | A: I am here | A：我在这里 |
| Mr. De Winter: Keine Sorge | Mr. De Winter: Don't worry | 德温特先生：别担心 |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "german-triple-source-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseGermanTripleMarkdown(sourcePath, {
      slug: "example-german-triple",
      sourceFormat: "german-triple",
      language: "de",
      voice: "de-de",
    });
    assert.equal(songs.length, 1);
    assert.equal(songs[0].lines.length, 3);
    assert.equal(songs[0].lines[0].speaker, "");
    assert.equal(songs[0].lines[0].original, "Bei den Toten will ich es schwören:");
    assert.equal(songs[0].lines[1].speaker, "A");
    assert.equal(songs[0].lines[1].original, "Ich bin hier");
    assert.equal(songs[0].lines[2].speaker, "Mr. De Winter");
    assert.equal(songs[0].lines[2].zh, "别担心");
    assert.equal(songs[0].lines[2].en, "Don't worry");
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});

test("English-Chinese single-column sources fill only the missing source translation", () => {
  const markdown = `# Album

## 01. The Greatest Show

- 原歌名：The Greatest Show
- 中文歌名：最伟大的表演

| 歌词 |
| --- |
| Woah |
| 呜哦 |
| Ladies and gents |
| 女士们先生们 |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "english-chinese-source-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseEnglishChineseSingleColumnMarkdown(sourcePath, {
      slug: "example-english-chinese",
      sourceFormat: "english-chinese-single",
      language: "en",
      voice: "en-us",
    });
    assert.equal(songs.length, 1);
    assert.equal(songs[0].lines.length, 2);
    assert.equal(songs[0].lines[0].original, "Woah");
    assert.equal(songs[0].lines[0].zh, "呜哦");
    assert.equal(songs[0].lines[1].original, "Ladies and gents");
    assert.equal(songs[0].lines[1].zh, "女士们先生们");
    assert.equal(songs[0].titleZh, "最伟大的表演");
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});

test("generator preserves bracketed translations paired with a structured source speaker", () => {
  const markdown = `# Example

## 01. Example

中文歌名：示例

| 行号 | 法语歌词（校订） | 法语音标（IPA） | 中文翻译（校订） | English Translation | 备注 |
| ---: | --- | --- | --- | --- | --- |
| 1 | Frollo: Parlez-moi de Florence | /fʁɔlo paʁlemwa də floʁɑ̃s/ | 【弗罗洛：跟我谈谈佛罗伦斯】 | Frollo: Tell me about Florence |  |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "aligned-speaker-translation-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseMarkdown(sourcePath, { slug: "example", language: "fr", voice: "fr-fr" });
    assert.equal(songs[0].lines[0].speaker, "Frollo");
    assert.equal(songs[0].lines[0].zh, "跟我谈谈佛罗伦斯");
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});

test("generator blocks writes when authoritative lyric rows lack required fields", () => {
  const songs = [{
    order: 1,
    lines: [{
      id: "example-01-001",
      original: "Bonjour",
      ipa: "bɔ̃ʒuʁ",
      zh: "",
      en: "Hello",
    }],
  }];
  assert.throws(
    () => assertLyricsReadyForGeneration(songs, { slug: "example", language: "fr" }, { requireComplete: true }),
    /example-01-001:zh/,
  );
});

test("generator requires a second explicit flag before changing existing lyric content", () => {
  assert.throws(
    () => assertNoUnreviewedContentChanges([], { slug: "don-juan" }),
    /refusing an implicit content overwrite/,
  );
  assert.doesNotThrow(
    () => assertNoUnreviewedContentChanges([], { slug: "don-juan" }, { allowContentChanges: true }),
  );
});

test("reviewed standalone role labels attach to the following lyric row", () => {
  const markdown = `# Example

## 01. Example

中文歌名：示例

| 行号 | 德语歌词（校订） | 德语音标（IPA） | 中文翻译（校订） | English Translation | 备注 |
| ---: | --- | --- | --- | --- | --- |
| 1 | Wolfgang (Chor): |  | 合唱： | Wolfgang (Chorus): |  |
| 2 | Singt! | zɪŋt | 唱吧！ | Sing! |  |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-role-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseMarkdown(sourcePath, { slug: "example", language: "de", voice: "de-de" });
    assert.equal(songs[0].lines.length, 1);
    assert.equal(songs[0].lines[0].speaker, "Wolfgang (Chor)");
    assert.equal(songs[0].lines[0].original, "Singt!");
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});

test("structured source speakers do not erase ordinary colon translations", () => {
  const markdown = `# Example

## 01. Example

中文歌名：示例

| 行号 | 法语歌词（校订） | 法语音标（IPA） | 中文翻译（校订） | English Translation | 备注 |
| ---: | --- | --- | --- | --- | --- |
| 1 | et toute la journée il répète, comme toi |  | 他整天就跟你似的 唠唠叨叨： | But it is true: I loved her | 唱段人：Le Petit Prince |
| 2 | Bonjour |  | 小王子：你好 | Hello |  |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "translation-speaker-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseMarkdown(sourcePath, { slug: "example", language: "fr", voice: "fr-fr" });
    assert.equal(songs[0].lines[0].speaker, "Le Petit Prince");
    assert.equal(songs[0].lines[0].zh, "他整天就跟你似的 唠唠叨叨：");
    assert.equal(songs[0].lines[0].en, "But it is true: I loved her");
    assert.equal(songs[0].lines[1].speaker, "小王子");
    assert.equal(songs[0].lines[1].zh, "你好");
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
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

test("reviewed role-only rows stay metadata in generated pages", () => {
  const root = path.resolve(__dirname, "..");
  const loadSongs = (slug) => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, slug, "songs.js"), "utf8"), sandbox);
    return sandbox.window.songs.flatMap((song) => song.lines);
  };
  const donJuan = loadSongs("don-juan");
  assert.equal(donJuan.some((line) => line.original === "Don Carlos:" || line.original === "Chœur:"), false);
  assert.equal(donJuan.find((line) => line.id === "don-juan-07-002").speaker, "Don Carlos");
  assert.equal(donJuan.find((line) => line.id === "don-juan-07-013").speaker, "Chœur");

  const elisabeth = loadSongs("elisabeth-das-musical");
  assert.equal(elisabeth.some((line) => line.id === "elisabeth-das-musical-38-032"), false);
  assert.equal(elisabeth.find((line) => line.id === "elisabeth-das-musical-38-033").speaker, "Der Tod & Rudolf");

  const mozart = loadSongs("mozart-das-musical");
  assert.equal(mozart.some((line) => [
    "mozart-das-musical-24-036",
    "mozart-das-musical-24-055",
  ].includes(line.id)), false);
  for (const id of [
    "mozart-das-musical-31-003",
    "mozart-das-musical-31-013",
    "mozart-das-musical-31-034",
  ]) {
    const line = mozart.find((item) => item.id === id);
    assert.equal(line.speaker, "");
    assert.equal(line.en, "The Great Redoubt:");
  }
});

test("Rebecca keeps the later role-version track when a title is duplicated", () => {
  const root = path.resolve(__dirname, "..");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "rebecca-das-musical", "songs-full.js"), "utf8"), sandbox);
  const songs = sandbox.window.songs;
  const normalizedTitles = songs.map((song) => song.title.normalize("NFKC").toLocaleLowerCase("de-DE").replace(/\s+/gu, " ").trim());

  assert.equal(songs.length, 48);
  assert.equal(new Set(normalizedTitles).size, songs.length);
  assert.equal(songs.some((song) => song.sourceOrder === 1), false);
  assert.equal(songs.some((song) => song.sourceOrder === 37), true);
});

test("Mozart merges punctuation-only translation continuations into the preceding lyric", () => {
  const root = path.resolve(__dirname, "..");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "mozart-das-musical", "songs.js"), "utf8"), sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);

  for (const id of [
    "mozart-das-musical-02-051",
    "mozart-das-musical-02-057",
    "mozart-das-musical-07-015",
  ]) {
    const line = lines.find((item) => item.id === id);
    assert.ok(line);
    assert.doesNotMatch(line.en, /^[\p{P}\p{S}\s]+$/u);
  }
  assert.equal(lines.some((line) => [
    "mozart-das-musical-02-052",
    "mozart-das-musical-02-058",
    "mozart-das-musical-07-016",
  ].includes(line.id)), false);
  assert.equal(lines.find((line) => line.id === "mozart-das-musical-07-015").en, "The prince has released your dear brother?!");
});

test("reviewed line merges reject long groups and internal sentence boundaries", () => {
  const line = (id, original) => ({ id, original });
  assert.equal(isSafeReviewedLineMerge([
    line("a", "One"),
    line("b", "two"),
    line("c", "three"),
    line("d", "four"),
    line("e", "five"),
  ]), false);
  assert.equal(isSafeReviewedLineMerge([
    line("a", "I have it and it is brilliant."),
    line("b", "I will get Amos to leave."),
  ]), false);
  assert.equal(isSafeReviewedLineMerge([
    line("a", "I have it"),
    line("b", "and it is brilliant"),
  ]), true);
});

test("sentence splitting keeps punctuation with each aligned segment", () => {
  assert.deepEqual(
    splitSentenceSegments("First sentence. Second sentence?!", false),
    ["First sentence.", "Second sentence?!"],
  );
  assert.deepEqual(
    splitSentenceSegments("第一句。第二句！", true),
    ["第一句。", "第二句！"],
  );
});

test("long aligned rows split at complete sentence boundaries", () => {
  assert.deepEqual(
    splitAlignedSentenceSegments({
      original: "This first sentence contains enough words to cross the long-row threshold. This second sentence also contains enough words to cross that threshold.",
      en: "",
      zh: "第一句包含足够多的词语以达到长行阈值。第二句也包含足够多的词语以达到这个阈值。",
    }),
    [
      "This first sentence contains enough words to cross the long-row threshold.",
      "This second sentence also contains enough words to cross that threshold.",
    ],
  );
});

test("long aligned rows can split at matching clause boundaries without losing translations", () => {
  const segments = splitAlignedLongLine({
    original: "The flight attendants keep telling us nothing's wrong. Well, I've got kids, and I've got grandkids, I know when someone's hiding something. And when parents need their kids to stop asking questions, they start playing movies",
    en: "",
    zh: "空乘人员一直告诉我们什么也没发生，但我有儿女，还有孙子孙女，有人藏着什么东西不说我都能知道，而当父母想让孩子别再问问题的时候，他们就会开始放电影",
  });
  assert.ok(Array.isArray(segments));
  assert.equal(segments.length, 3);
  assert.match(segments.map((segment) => segment.zh).join(""), /开始放电影/);
  assert.ok(segments.every((segment) => segment.original.split(/\s+/u).length <= 18));
});

test("single source rows keep complete comma-separated translations", () => {
  const show = SHOWS.find((entry) => entry.slug === "come-from-away");
  const source = path.resolve(__dirname, "../../lyrics/Come From Away (Original Broadway Cast Recording) 网页数据源.md");
  const lines = parseMarkdown(source, show)
    .find((song) => song.order === 4)
    .lines.filter((entry) => entry.id.startsWith("come-from-away-04-118"));
  const combinedTranslation = lines.map((line) => line.zh).join("");
  assert.ok(lines.length >= 1);
  assert.match(combinedTranslation, /但我有儿女/);
  assert.match(combinedTranslation, /开始放电影/);
});

test("line-break audit covers all bookshelf shows and delayed full song data", () => {
  const root = path.resolve(__dirname, "..");
  const auditedShows = lineBreakAudit.getAuditedShows(root);
  assert.ok(auditedShows.length >= 35);
  assert.ok(auditedShows.includes("rebecca-das-musical"));
  assert.ok(auditedShows.includes("tanz-der-vampire"));

  const rebeccaSongs = lineBreakAudit.loadSongs(root, "rebecca-das-musical");
  assert.equal(rebeccaSongs.reduce((count, song) => count + song.lines.length, 0), 1722);
});

test("line-break audit groups a complete sentence split across three rows", () => {
  const songs = [{
    order: 1,
    title: "Example",
    lines: [
      { id: "example-01-001", original: "The prince has", en: "The prince has", zh: "王子已经", speaker: "" },
      { id: "example-01-002", original: "released your", en: "released your", zh: "释放了你的", speaker: "" },
      { id: "example-01-003", original: "dear brother.", en: "dear brother.", zh: "弟弟。", speaker: "" },
    ],
  }];
  const candidates = lineBreakAudit.findBreakCandidates(songs, "en", "example");

  assert.deepEqual(candidates, [{
    show: "example",
    songOrder: 1,
    songTitle: "Example",
    ids: ["example-01-001", "example-01-002", "example-01-003"],
    reason: "three-row-complete-sentence",
    confidence: "high",
    previous: "The prince has released your dear brother.",
    english: "The prince has released your dear brother.",
    chinese: "王子已经释放了你的弟弟。",
  }]);
});

test("line-break audit does not merge a role label or a one-word callout into a sentence", () => {
  const songs = [{
    order: 1,
    title: "Example",
    lines: [
      { id: "example-01-001", original: "Fantine", en: "Fantine", zh: "芳汀", speaker: "" },
      { id: "example-01-002", original: "drawing blood.", en: "drawing blood.", zh: "流着血。", speaker: "" },
      { id: "example-01-003", original: "Stop!", en: "Stop!", zh: "住手！", speaker: "Other" },
    ],
  }];

  assert.deepEqual(lineBreakAudit.findBreakCandidates(songs, "en", "example"), []);
});

test("line-break audit keeps a later speaker label as a hard boundary", () => {
  const songs = [{
    order: 1,
    title: "Example",
    lines: [
      { id: "example-01-001", original: "The chorus was entrancing", en: "", zh: "副歌很迷人", speaker: "" },
      { id: "example-01-002", original: "but the dancing was a mess!", en: "", zh: "但舞蹈一团糟！", speaker: "" },
      { id: "example-01-003", original: "My salary has not been paid.", en: "", zh: "我的工资还没发。", speaker: "Dear Firmin" },
    ],
  }];

  assert.deepEqual(lineBreakAudit.findBreakCandidates(songs, "en", "example"), [
    {
      show: "example",
      songOrder: 1,
      songTitle: "Example",
      ids: ["example-01-001", "example-01-002"],
      reason: "two-row-complete-sentence",
      confidence: "high",
      previous: "The chorus was entrancing but the dancing was a mess!",
      english: "",
      chinese: "副歌很迷人但舞蹈一团糟！",
    },
  ]);
});
