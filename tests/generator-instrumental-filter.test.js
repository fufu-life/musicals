const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  isInstrumentalMarkerText,
  parseMarkdown,
} = require("../scripts/generate-musical-pages.js");

test("instrumental markers are recognized without matching real dialogue", () => {
  assert.equal(isInstrumentalMarkerText("INSTRUMENTAL"), true);
  assert.equal(isInstrumentalMarkerText("[Instrumental]"), true);
  assert.equal(isInstrumentalMarkerText("纯音乐，请欣赏"), true);
  assert.equal(isInstrumentalMarkerText("JOE, spoken: What a lovely sight"), false);
});

test("page parser excludes flagged tracks and keeps dialogue from mixed tracks", () => {
  const markdown = `# Example

## 01. Overture
- 网页收录：否（除数拍外为纯器乐）
| 行号 | 英文歌词（校订） | 英文音标（IPA） | 中文翻译（校订） | 备注 |
| --- | --- | --- | --- | --- |
| 1 | Five six seven eight | | 五 六 七 八 | |

## 02. Car Chase
| 行号 | 英文歌词（校订） | 英文音标（IPA） | 中文翻译（校订） | 备注 |
| --- | --- | --- | --- | --- |
| 1 | INSTRUMENTAL | | 纯音乐 | |
| 2 | What a lovely sight. | | 多么美丽的景象。 | |

## 03. Entr'acte
| 行号 | 英文歌词（校订） | 英文音标（IPA） | 中文翻译（校订） | 备注 |
| --- | --- | --- | --- | --- |
| 1 | INSTRUMENTAL | | 纯音乐，请欣赏 | |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "instrumental-filter-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseMarkdown(sourcePath, { slug: "example", language: "en" });
    assert.equal(songs.length, 1);
    assert.equal(songs[0].title, "Car Chase");
    assert.equal(songs[0].sourceOrder, 2);
    assert.equal(songs[0].displayOrder, 1);
    assert.deepEqual(songs[0].lines.map((line) => line.original), ["What a lovely sight."]);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});

test("paired English sources preserve source order and remove soundtrack suffixes", () => {
  const markdown = `# Example

## 01. Overture
- 原歌名：Overture
- 中文歌名：序曲
- 网页收录：否（纯器乐）
- 歌词格式：英文原文与中文译文逐行配对
| 歌词 |
| --- |
| INSTRUMENTAL |
| 纯音乐 |

## 02. Waving Through A Window (From the “Dear Evan Hansen” Original Motion Picture Soundtrack)
- 原歌名：Waving Through A Window (From the “Dear Evan Hansen” Original Motion Picture Soundtrack)
- 中文歌名：隔窗挥手
- 歌词格式：英文原文与中文译文逐行配对
| 歌词 |
| --- |
| EVAN: I've learned to slam on the brake. |
| 埃文：我学会了猛踩刹车。 |
`;
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "paired-english-"));
  const sourcePath = path.join(temporaryDir, "example.md");
  fs.writeFileSync(sourcePath, markdown);

  try {
    const songs = parseMarkdown(sourcePath, {
      slug: "dear-evan-hansen",
      sourceFormat: "paired-english",
      language: "en",
      voice: "en-us",
    });
    assert.equal(songs.length, 1);
    assert.equal(songs[0].title, "Waving Through A Window");
    assert.equal(songs[0].titleZh, "隔窗挥手");
    assert.equal(songs[0].sourceOrder, 2);
    assert.equal(songs[0].displayOrder, 1);
    assert.equal(songs[0].lines[0].speaker, "EVAN");
    assert.equal(songs[0].lines[0].zh, "我学会了猛踩刹车。");
    assert.match(songs[0].lines[0].ipa, /^\/.+\/$/u);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
});
