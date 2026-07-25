const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { libraryShows } = require("../shows.js");

const root = path.resolve(__dirname, "..");
const expectedAssets = new Map([["index.html", ["shared/analytics.js", "shows.js", "library.js"]]]);

libraryShows.forEach((show) => {
  if (!show.deployed || !fs.existsSync(path.join(root, show.href))) return;

  const assets = show.id === "dazhuangwang"
    ? ["songs-initial.js", "../shared/analytics.js", "../shared/audio-playback.js"]
    : show.id === "hamilton"
      ? ["lyrics-initial.js", "../shared/analytics.js", "../shared/audio-playback.js", "script.js"]
      : ["songs-initial.js", "../shared/analytics.js", "../shared/audio-playback.js", "script.js"];
  expectedAssets.set(show.href, assets);
});

test("the library and all available show pages retry failed critical assets once", () => {
  expectedAssets.forEach((assets, relativePath) => {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");

    assert.match(html, /window\.handleCriticalAssetError = \(source\) =>/);
    assert.match(html, /now - lastRetry < 30000/);
    assert.match(html, /retryUrl\.searchParams\.set\("_retry"/);
    assert.match(html, /retryUrl\.searchParams\.set\(retryAssetParam/);
    assert.match(html, /assetUrl\.searchParams\.set\("_retry", retryToken\)/);
    assert.match(html, /网络连接不稳定，页面资源未完整加载/);
    assert.match(html, /retry\.textContent = "重新加载"/);

    const recoveryScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .find((script) => script.includes("window.handleCriticalAssetError"));
    assert.ok(recoveryScript, `${relativePath}: recovery script`);
    assert.doesNotThrow(() => new vm.Script(recoveryScript), `${relativePath}: recovery syntax`);

    assets.forEach((asset) => {
      assert.ok(
        html.includes(`writeCriticalScript("${asset}")`),
        `${relativePath}: ${asset}`,
      );
    });

    let written = "";
    const retryTarget = new URL(assets[0], `https://example.test/${relativePath}`).pathname;
    const context = {
      URL,
      document: {
        body: {},
        addEventListener() {},
        querySelector() { return null; },
        write(value) { written += value; },
      },
      history: { replaceState() {} },
      sessionStorage: { getItem() { return null; }, removeItem() {}, setItem() {} },
      window: {
        location: {
          href: `https://example.test/${relativePath}?_retry=123&_retry_asset=${encodeURIComponent(retryTarget)}`,
          pathname: new URL(`https://example.test/${relativePath}`).pathname,
          replace() {},
          reload() {},
        },
        addEventListener() {},
        setTimeout() {},
      },
    };
    vm.runInNewContext(recoveryScript, context);
    context.window.writeCriticalScript(assets[0]);
    assert.match(written, /[?&]_retry=123/, `${relativePath}: cache-busted failed asset`);
  });
});

test("the library and all available show pages load the shared analytics runtime as a critical asset", () => {
  const analyticsJs = fs.readFileSync(path.join(root, "shared/analytics.js"), "utf8");
  expectedAssets.forEach((assets, relativePath) => {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");

    assert.doesNotMatch(html, /<script async src="https:\/\/www\.googletagmanager\.com/);
    assert.match(html, /writeCriticalScript\((?:"shared\/analytics\.js"|"\.\.\/shared\/analytics\.js")\)/);
    assert.doesNotMatch(html, /function gtag\(\)/);
  });
  assert.match(analyticsJs, /scope\.addEventListener\?\.\("load", requestScript/);
  assert.match(analyticsJs, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=\$\{MEASUREMENT_ID\}/);
});
