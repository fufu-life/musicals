const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const libraryScript = fs.readFileSync(path.join(root, "library.js"), "utf8");
const { libraryLanguages, libraryShows } = require("../shows.js");

test("library uses the requested title and introduction", () => {
  assert.match(indexHtml, /<title>阿浮的音乐剧歌词集<\/title>/);
  assert.match(indexHtml, /<h1>阿浮的音乐剧歌词集<\/h1>/);
  assert.match(
    indexHtml,
    /感谢剧场让我们的轨迹短暂交叠，行走在志同道合的路上，愿我们一直望着<span class="no-break">同一个月亮。<\/span>/,
  );
});

test("library groups all twenty-five shows by language", () => {
  assert.deepEqual(libraryLanguages, [
    { id: "yue", label: "粤语音乐剧" },
    { id: "en", label: "英语音乐剧" },
    { id: "de", label: "德语音乐剧" },
    { id: "fr", label: "法语音乐剧" },
  ]);
  assert.equal(libraryShows.length, 25);
  assert.match(indexHtml, /id="languageGroups"/);
  assert.match(
    indexHtml,
    /writeCriticalScript\("shows\.js"\)[\s\S]*writeCriticalScript\("library\.js"\)/,
  );
});

test("show names and Cantonese feature labels stay accurate", () => {
  assert.equal(libraryShows.some((show) => show.title === "摇滚莫里哀"), false);
  assert.equal(libraryShows.find((show) => show.id === "moliere-le-spectacle-musical").title, "莫里哀");
  assert.deepEqual(libraryShows.find((show) => show.id === "dazhuangwang").meta, [
    "粤语",
    "粤拼",
    "注释",
  ]);
});

test("library cards keep one fixed shelf size and wrap as space narrows", () => {
  assert.match(indexHtml, /grid-template-columns: repeat\(auto-fill, 180px\)/);
  assert.match(indexHtml, /width: 180px;\s+height: 300px;/);
  assert.doesNotMatch(indexHtml, /repeat\(auto-fit/);
});

test("show cards omit generated description paragraphs", () => {
  assert.ok(libraryShows.every((show) => !("description" in show)));
  assert.doesNotMatch(libraryScript, /createElement\("p"\)/);
});

test("every shelf card uses a local title-bearing show logo", () => {
  for (const show of libraryShows) {
    assert.ok(show.image, `Missing show logo config: ${show.id}`);
    assert.ok(fs.existsSync(path.join(root, show.image)), `Missing show logo file: ${show.image}`);
  }
  assert.match(libraryScript, /if \(show\.image\)/);
});

test("every show card links directly to its page instead of a folder", () => {
  const links = libraryShows.map((show) => show.href);

  assert.equal(links.length, 25);
  assert.ok(links.every((href) => href.endsWith("/index.html")));
  for (const href of links) {
    assert.ok(fs.existsSync(path.join(root, href)), `Missing show page: ${href}`);
  }
});

test("online library renders only explicitly deployed shows without network probes", () => {
  assert.deepEqual(
    libraryShows.filter((show) => show.deployed).map((show) => show.id),
    [
      "dazhuangwang",
      "hamilton",
      "rouge-et-noir",
      "mozart-opera-rock",
      "romeo-et-juliette",
      "moliere-le-spectacle-musical",
    ],
  );
  assert.match(libraryScript, /window\.location\.protocol === "file:"/);
  assert.match(libraryScript, /window\.libraryShows\.filter\(\(show\) => show\.deployed\)/);
  assert.doesNotMatch(libraryScript, /\bfetch\s*\(/);
  assert.doesNotMatch(libraryScript, /method: "HEAD"/);
});

test("homepage logos decode asynchronously and show links prefetch on intent", () => {
  assert.match(libraryScript, /image\.loading = "lazy"/);
  assert.match(libraryScript, /image\.decoding = "async"/);
  assert.match(libraryScript, /link\.rel = "prefetch"/);
  assert.match(libraryScript, /card\.addEventListener\("pointerenter"/);
  assert.match(libraryScript, /card\.addEventListener\("focus"/);
});

test("all raster logos stay within the homepage delivery budget", () => {
  libraryShows.filter((show) => show.image.endsWith(".png")).forEach((show) => {
    const file = path.join(root, show.image);
    const size = fs.statSync(file).size;
    const png = fs.readFileSync(file);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(size < 250_000, `${show.id}: ${(size / 1024).toFixed(1)} KiB`);
    assert.ok(Math.max(width, height) <= 520, `${show.id}: ${width}×${height}`);
  });
});

test("deployed cards prefetch their first-screen data without probing undeployed shows", () => {
  const deployed = libraryShows.filter((show) => show.deployed);
  assert.ok(deployed.every((show) => show.prefetch?.length === 1));
  assert.match(libraryScript, /\[show\.href, \.\.\.\(show\.prefetch \|\| \[\]\)\]/);
  assert.doesNotMatch(libraryScript, /window\.libraryShows\.flatMap\([^)]*prefetch/);
});

test("library and all twenty-five show pages use the shared analytics module", () => {
  const pages = [
    ["library", indexHtml],
    ...libraryShows.map((show) => [
      show.id,
      fs.readFileSync(path.join(root, show.href), "utf8"),
    ]),
  ];
  pages.forEach(([name, html]) => {
    assert.match(html, /shared\/analytics\.js/, `${name}: shared analytics`);
    assert.doesNotMatch(html, /function gtag\(\)/, `${name}: no copied gtag bootstrap`);
  });
  assert.match(libraryScript, /window\.MusicalAnalytics\.initLibrary/);
  assert.match(libraryScript, /analytics\.trackLibraryEntry/);
});

test("all twenty-five show runtimes report songs, audio lifecycle, and features through the shared module", () => {
  const customInline = new Set(["dazhuangwang"]);
  const customScripts = new Map([
    ["hamilton", "Hamilton/script.js"],
    ["rouge-et-noir", "rouge-et-noir/script.js"],
  ]);

  libraryShows.forEach((show) => {
    const html = fs.readFileSync(path.join(root, show.href), "utf8");
    const runtime = customInline.has(show.id)
      ? html
      : fs.readFileSync(path.join(root, customScripts.get(show.id) || `${show.id}/script.js`), "utf8");
    assert.match(runtime, /MusicalAnalytics\.initShow/, `${show.id}: initShow`);
    assert.match(runtime, /analytics\.songRendered/, `${show.id}: song view`);
    assert.match(runtime, /analytics\.audioClick/, `${show.id}: audio click`);
    assert.match(runtime, /analytics\.audioStart/, `${show.id}: audio start`);
    assert.match(runtime, /analytics\.audioComplete/, `${show.id}: audio complete`);
    assert.match(runtime, /analytics\.featureUse/, `${show.id}: feature use`);
    assert.doesNotMatch(runtime, /text_preview|line_text_preview|error_message/, `${show.id}: identifier-only analytics`);
  });
});

test("library provides language and Chinese-title initial navigation", () => {
  assert.match(indexHtml, /id="languageNav"/);
  assert.match(libraryScript, /pinyinInitials/);
  assert.match(libraryScript, /zh-Hans-CN-u-co-pinyin/);
  assert.match(libraryScript, /alpha-nav/);
  assert.match(libraryScript, /is-letter-highlight/);
  assert.match(indexHtml, /@keyframes letter-highlight/);
  assert.doesNotMatch(libraryScript, /alpha-section/);
  assert.doesNotMatch(libraryScript, /alpha-heading/);
});

test("library spotlight cursor follows the supplied three-layer theatre-light reference", () => {
  const cursorScript = fs.readFileSync(path.join(root, "library-cursor.js"), "utf8");
  assert.match(indexHtml, /class="spotlight-mouse"/);
  assert.match(indexHtml, /class="mouse-beam"/);
  assert.match(indexHtml, /class="mouse-puddle"/);
  assert.match(indexHtml, /class="mouse-dot"/);
  assert.match(indexHtml, /src="library-cursor\.js\?v=/);
  assert.match(cursorScript, /pointer: coarse/);
  assert.match(cursorScript, /prefers-reduced-motion: reduce/);
  assert.match(cursorScript, /show-card/);
  assert.match(indexHtml, /skewX\(-25deg\)/);
  assert.match(indexHtml, /is-hover \.mouse-beam/);
  assert.match(indexHtml, /is-click \.mouse-puddle/);
  assert.match(indexHtml, /spotlight-stardust/);
  assert.match(cursorScript, /activeSparks < 10/);
  assert.match(cursorScript, /spotlight-spark/);
});

test("library provides a scroll-aware return-to-top button", () => {
  assert.match(indexHtml, /id="libraryBackToTop"/);
  assert.match(indexHtml, /aria-label="返回页面顶部"/);
  assert.match(indexHtml, /\.library-back-to-top\.is-visible/);
  assert.match(libraryScript, /window\.scrollY > 420/);
  assert.match(libraryScript, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(indexHtml, /M12 19V5M6 11l6-6 6 6/);
});

test("every library show has a stable Chinese-title initial", () => {
  const initialBlock = libraryScript.match(/const pinyinInitials = \{([\s\S]*?)\n  \};/);
  assert.ok(initialBlock);
  const ids = [...initialBlock[1].matchAll(/(?:"([\w-]+)"|([\w-]+)):\s*"[A-Z#]"/g)].map((match) => match[1] || match[2]);
  const missing = libraryShows.map((show) => show.id).filter((id) => !ids.includes(id));
  assert.deepEqual(missing, []);
});

test("Hamilton keeps its Chinese display title in the library", () => {
  assert.equal(libraryShows.find((show) => show.id === "hamilton").title, "汉密尔顿");
});
