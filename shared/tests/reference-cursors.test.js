const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const cursorRoot = path.resolve(__dirname, "..", "cursors");
const cursorFiles = fs.readdirSync(cursorRoot).filter((file) => file.endsWith(".js")).sort();

function createCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "createLinearGradient" || property === "createRadialGradient") {
          return () => gradient;
        }
        if (property === "measureText") return () => ({ width: 10 });
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  );
}

function runCursor(file) {
  const listeners = new Map();
  const context = createCanvasContext();
  const canvas = { dataset: {}, style: {}, getContext: () => context };
  let nextFrame = null;
  const window = {
    devicePixelRatio: 2,
    innerHeight: 800,
    innerWidth: 1200,
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const document = {
    hidden: false,
    createElement: () => ({ style: {}, getContext: () => createCanvasContext() }),
    getElementById: () => canvas,
  };
  const requestAnimationFrame = (callback) => {
    nextFrame = callback;
    return 1;
  };
  const sandbox = { console, document, Math, requestAnimationFrame, window };
  const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
  const scale = Number(source.match(/pointerScale \* ([0-9.]+)/)?.[1]);
  assert.ok(scale >= 0.88, `${file} cursor scale is still too small: ${scale}`);
  vm.runInNewContext(source, sandbox, { filename: file });

  assert.equal(window.referenceCursorActive, true);
  ["mousemove", "mousedown", "mouseup", "resize"].forEach((type) => {
    assert.ok(listeners.get(type)?.length, `${file} is missing ${type}`);
  });

  listeners.get("mousemove")[0]({ clientX: 140, clientY: 110 });
  listeners.get("mousemove")[0]({ clientX: 180, clientY: 145 });
  listeners.get("mousedown")[0]();
  listeners.get("mouseup")[0]();
  assert.equal(typeof nextFrame, "function");
  nextFrame();
}

test("all reference cursors handle movement, press, release, and animation", () => {
  assert.ok(cursorFiles.length >= 17);
  cursorFiles.forEach(runCursor);
});

test("the eight new shows use distinct motif, trail, and click-burst profiles", () => {
  const expected = {
    "moulin-rouge.js": ["windmill", "goldSparkleRosePetal", "spectacular"],
    "elisabeth-das-musical.js": ["classicTiara", "diamondDust", "softDiamondGlow"],
    "starmania.js": ["blackStar", "glitchPixel", "glitchRipple"],
    "mozart-das-musical.js": ["inspirationPoint", "fiveLineStaff", "goldenRippleNotes"],
    "phantom-of-the-opera.js": ["grandChandelier", "crystalGlint", "pressGlow"],
    "love-never-dies.js": ["windingKey", "neonSpark", "subtleRipple"],
    "les-souliers-rouges.js": ["posterMoon", "moonMist", "lunarBloom"],
    "la-legende-du-roi-arthur.js": ["excalibur", "magicDust", "crispShockwave"],
  };
  const motifNames = new Set();
  const trailNames = new Set();
  const burstNames = new Set();

  Object.entries(expected).forEach(([file, [motif, trail, burst]]) => {
    const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
    assert.match(source, new RegExp(`"motif":"${motif}"`));
    assert.match(source, new RegExp(`"trail":"${trail}"`));
    assert.match(source, new RegExp(`"burst":"${burst}"`));
    motifNames.add(motif);
    trailNames.add(trail);
    burstNames.add(burst);
  });

  assert.equal(motifNames.size, 8);
  assert.equal(trailNames.size, 8);
  assert.equal(burstNames.size, 8);
});

test("the eight new cursors preserve the supplied show-specific reference motifs", () => {
  const source = fs.readFileSync(path.join(cursorRoot, "phantom-of-the-opera.js"), "utf8");
  assert.match(source, /preRenderGrandChandelier/);
  assert.match(source, /config\.motif === "grandChandelier"/);
  assert.match(source, /config\.trail === "crystalGlint"/);
  assert.match(source, /config\.burst === "pressGlow"/);
  assert.match(fs.readFileSync(path.join(cursorRoot, "love-never-dies.js"), "utf8"), /preRenderWindingKey/);
  assert.match(fs.readFileSync(path.join(cursorRoot, "elisabeth-das-musical.js"), "utf8"), /preRenderClassicTiara/);
  assert.match(fs.readFileSync(path.join(cursorRoot, "starmania.js"), "utf8"), /preRenderBlackStar/);
  assert.match(fs.readFileSync(path.join(cursorRoot, "mozart-das-musical.js"), "utf8"), /fiveLineStaff/);
});

test("reviewed cursor proportions and directional details stay calibrated", () => {
  const calibratedSizes = {
    "moulin-rouge.js": 62,
    "elisabeth-das-musical.js": 58,
    "starmania.js": 82,
    "mozart-das-musical.js": 54,
    "phantom-of-the-opera.js": 50,
    "love-never-dies.js": 58,
    "les-souliers-rouges.js": 64,
    "la-legende-du-roi-arthur.js": 72,
  };
  Object.entries(calibratedSizes).forEach(([file, size]) => {
    const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
    assert.match(source, new RegExp(`"size":${size}`));
  });
  const phantom = fs.readFileSync(path.join(cursorRoot, "phantom-of-the-opera.js"), "utf8");
  const moulin = fs.readFileSync(path.join(cursorRoot, "moulin-rouge.js"), "utf8");
  const shoes = fs.readFileSync(path.join(cursorRoot, "les-souliers-rouges.js"), "utf8");
  const arthur = fs.readFileSync(path.join(cursorRoot, "la-legende-du-roi-arthur.js"), "utf8");
  assert.match(phantom, /"size":50/);
  assert.match(phantom, /"hotspot":\[0\.5,0\.5\]/);
  assert.doesNotMatch(moulin, /ctx\.rotate\(Math\.PI \/ 16\)/);
  assert.match(shoes, /"hotspot":\[0\.5,0\.5\]/);
  assert.match(shoes, /config\.motif === "posterMoon"/);
  assert.match(shoes, /const moon = cacheCtx\.createRadialGradient/);
  assert.match(arthur, /cacheCtx\.lineTo\(42, 42\)/);
  assert.match(arthur, /cacheCtx\.arc\(45, 45, 3\.8/);
});

test("Phantom chandelier uses a visible crystal trail and lights from its center on click", () => {
  const source = fs.readFileSync(path.join(cursorRoot, "phantom-of-the-opera.js"), "utf8");
  assert.match(source, /"emitDistance":10/);
  assert.match(source, /"burstParticles":6/);
  assert.match(source, /const drawFacetedCrystal =/);
  assert.match(source, /function drawChandelierLightPulse/);
  assert.match(source, /chandelierLight = 1/);
  assert.match(source, /drawChandelierLightPulse\(size, false\)/);
  assert.match(source, /drawChandelierLightPulse\(size, true\)/);
  assert.match(source, /this\.alpha = burst \? 0\.9 : 0\.76/);
  assert.match(source, /createRadialGradient\(0, 0, 0, 0, 0, lightRadius\)/);
  assert.doesNotMatch(source, /createRadialGradient\(0, -18/);
});

test("refined cursors use high-resolution vector caches and page-matched artwork", () => {
  const refined = [
    "moulin-rouge.js",
    "elisabeth-das-musical.js",
    "mozart-das-musical.js",
    "phantom-of-the-opera.js",
    "love-never-dies.js",
    "les-souliers-rouges.js",
    "la-legende-du-roi-arthur.js",
  ].map((file) => fs.readFileSync(path.join(cursorRoot, file), "utf8"));
  refined.forEach((source) => {
    assert.match(source, /const cacheScale = Math\.max\(2,/);
    assert.match(source, /cache\.width = 96 \* cacheScale/);
  });

  const loveNeverDies = refined[4];
  assert.match(loveNeverDies, /#7454ae/);
  assert.match(loveNeverDies, /#e2b15d/);
  assert.doesNotMatch(loveNeverDies, /#00d4b4/);

  const redShoes = refined[5];
  assert.match(redShoes, /preRenderPosterMoon/);
  assert.match(redShoes, /config\.trail === "moonMist"/);
  assert.match(redShoes, /config\.burst === "lunarBloom"/);

  const mozart = refined[2];
  assert.match(mozart, /createRadialGradient\(0, 0, 0, 0, 0, 34\)/);
});

test("Notre-Dame halos fade continuously toward transparent edges", () => {
  const source = fs.readFileSync(path.join(cursorRoot, "notre-dame-de-paris.js"), "utf8");
  assert.match(source, /addColorStop\(0\.78, 'rgba\(209, 181, 138, 0\.025\)'\)/);
  assert.match(source, /addColorStop\(1, 'rgba\(0, 0, 0, 0\)'\)/);
  assert.doesNotMatch(source, /addColorStop\(0\.5, this\.color\)/);
});

test("1789 trail uses restrained red-gold dust instead of diamond confetti", () => {
  const source = fs.readFileSync(
    path.join(cursorRoot, "1789-les-amants-de-la-bastille.js"),
    "utf8",
  );
  assert.match(source, /const colors = \['#b72e38', '#d1aa63', '#f2e7d3'\]/);
  assert.doesNotMatch(source, /this\.w =|ctx\.lineTo\(this\.w/);
});
