const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const cursorRoot = path.resolve(__dirname, "..", "cursors");
const cursorFiles = fs.readdirSync(cursorRoot).filter((file) => file.endsWith(".js")).sort();

function createCanvasContext(drawCalls = null) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "createLinearGradient" || property === "createRadialGradient") {
          return () => gradient;
        }
        if (property === "drawImage") return (...args) => drawCalls?.push(args);
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
  const drawCalls = [];
  const context = createCanvasContext(drawCalls);
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
    documentElement: { dataset: {} },
    createElement: () => ({ style: {}, getContext: () => createCanvasContext() }),
    getElementById: () => canvas,
  };
  const requestAnimationFrame = (callback) => {
    nextFrame = callback;
    return 1;
  };
  const getComputedStyle = () => ({ getPropertyValue: () => "" });
  const MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  const sandbox = {
    console,
    document,
    getComputedStyle,
    Math,
    MutationObserver,
    requestAnimationFrame,
    window,
  };
  const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
  const staticRoseWindow = file === "notre-dame-de-paris.js";
  if (!staticRoseWindow) {
    const scale = Number(source.match(/pointerScale \* ([0-9.]+)/)?.[1]);
    assert.ok(scale >= 0.88, `${file} cursor scale is still too small: ${scale}`);
  }
  vm.runInNewContext(source, sandbox, { filename: file });

  assert.equal(window.referenceCursorActive, true);
  const eventTypes = staticRoseWindow
    ? ["pointerenter", "pointermove", "pointerdown", "pointerup", "pointercancel", "pointerleave", "resize"]
    : ["mousemove", "mousedown", "mouseup", "resize"];
  eventTypes.forEach((type) => {
    assert.ok(listeners.get(type)?.length, `${file} is missing ${type}`);
  });

  if (staticRoseWindow) {
    listeners.get("pointermove")[0]({ clientX: 140, clientY: 110 });
    nextFrame();
    const normalDisplaySize = drawCalls.at(-1)?.[3];
    listeners.get("pointermove")[0]({ clientX: 180, clientY: 145 });
    listeners.get("pointerdown")[0]();
    nextFrame();
    const pressedDisplaySize = drawCalls.at(-1)?.[3];
    assert.ok(pressedDisplaySize < normalDisplaySize, "Notre-Dame cursor should shrink while pressed");
    listeners.get("pointerup")[0]();
    listeners.get("pointercancel")[0]();
    listeners.get("pointerleave")[0]();
  } else {
    listeners.get("mousemove")[0]({ clientX: 140, clientY: 110 });
    listeners.get("mousemove")[0]({ clientX: 180, clientY: 145 });
    listeners.get("mousedown")[0]();
    listeners.get("mouseup")[0]();
  }
  assert.equal(typeof nextFrame, "function");
  nextFrame();
}

test("all reference cursors handle movement, press, release, and animation", () => {
  assert.ok(cursorFiles.length >= 17);
  cursorFiles.forEach(runCursor);
});

test("the seven new shows use distinct motif, trail, and click-burst profiles", () => {
  const expected = {
    "moulin-rouge.js": ["windmill", "goldSparkleRosePetal", "spectacular"],
    "elisabeth-das-musical.js": ["classicTiara", "diamondDust", "softDiamondGlow"],
    "starmania.js": ["blackStar", "glitchPixel", "glitchRipple"],
    "mozart-das-musical.js": ["inspirationPoint", "fiveLineStaff", "goldenRippleNotes"],
    "phantom-of-the-opera.js": ["grandChandelier", "crystalGlint", "pressGlow"],
    "love-never-dies.js": ["windingKey", "neonSpark", "subtleRipple"],
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

  assert.equal(motifNames.size, 7);
  assert.equal(trailNames.size, 7);
  assert.equal(burstNames.size, 7);
});

test("the six newly added shows use show-specific cursor motifs", () => {
  const expected = {
    "come-from-away.js": ["comeFromAwayGlobe", "none", "none"],
    "rent.js": ["rentGraffiti", "neonSpark", "subtleRipple"],
    "tick-tick-boom.js": ["tickClock", "clockTicks", "clockShockwave"],
    "wicked.js": ["wickedHat", "none", "softGreenRipple"],
    "hadestown.js": ["hadestownFlower", "thornEmbers", "none"],
    "les-dix-commandements.js": ["stoneTablets", "goldDust", "sunHalo"],
  };
  const motifs = new Set();
  Object.entries(expected).forEach(([file, [motif, trail, burst]]) => {
    const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
    assert.match(source, new RegExp(`"motif":"${motif}"`));
    assert.match(source, new RegExp(`"trail":"${trail}"`));
    assert.match(source, new RegExp(`"burst":"${burst}"`));
    const marker = motif[0].toUpperCase() + motif.slice(1);
    assert.match(source, new RegExp(`function preRender${marker}\\(`));
    motifs.add(motif);
  });
  assert.equal(motifs.size, 6);
});

test("the six new cursors preserve the reviewed globe and clock interactions", () => {
  const come = fs.readFileSync(path.join(cursorRoot, "come-from-away.js"), "utf8");
  const tick = fs.readFileSync(path.join(cursorRoot, "tick-tick-boom.js"), "utf8");
  assert.match(come, /"motif":"comeFromAwayGlobe"/);
  assert.match(come, /"trail":"none"/);
  assert.match(come, /"burst":"none"/);
  assert.match(come, /function preRenderComeFromAwayGlobe\(/);
  assert.match(tick, /"trail":"clockTicks"/);
  assert.match(tick, /"burst":"clockShockwave"/);
  assert.match(tick, /config\.trail === "clockTicks"/);
  assert.match(tick, /config\.burst === "clockShockwave"/);
  assert.match(tick, /for \(let index = 0; index < 12; index \+= 1\)/);
  assert.match(tick, /config\.icon === "clock"|clockShockwave/);
});

test("Chicago, Tanz, Sunset Boulevard, and Wicked keep restrained signature motifs", () => {
  const expected = {
    "chicago.js": ["chicagoNewspaper", "none", "headlineDrop"],
    "tanz-der-vampire.js": ["vampireBat", "none", "subtleRing"],
    "sunset-boulevard.js": ["filmReel", "none", "none"],
    "wicked.js": ["wickedHat", "none", "softGreenRipple"],
  };

  Object.entries(expected).forEach(([file, [motif, trail, burst]]) => {
    const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
    assert.match(source, new RegExp(`"motif":"${motif}"`));
    assert.match(source, new RegExp(`"trail":"${trail}"`));
    assert.match(source, new RegExp(`"burst":"${burst}"`));
    assert.match(source, /const cacheScale = Math\.max\(2,/);
  });

  const chicago = fs.readFileSync(path.join(cursorRoot, "chicago.js"), "utf8");
  const tanz = fs.readFileSync(path.join(cursorRoot, "tanz-der-vampire.js"), "utf8");
  const sunset = fs.readFileSync(path.join(cursorRoot, "sunset-boulevard.js"), "utf8");
  const wicked = fs.readFileSync(path.join(cursorRoot, "wicked.js"), "utf8");
  assert.match(chicago, /const newsprint = cacheCtx\.createLinearGradient/);
  assert.match(chicago, /cacheCtx\.fillText\("EXTRA!", 0, -13\)/);
  assert.match(chicago, /\["N", "E", "W", "S"\]\.forEach/);
  assert.match(tanz, /const batFill = cacheCtx\.createLinearGradient/);
  assert.match(tanz, /cacheCtx\.bezierCurveTo\(-8, -16, -19, -22, -30, -16\)/);
  assert.match(sunset, /const reel = cacheCtx\.createRadialGradient/);
  assert.match(sunset, /config\.motif === "filmReel"\) ctx\.rotate\(motifRotation\)/);
  assert.doesNotMatch(sunset, /cacheCtx\.bezierCurveTo\(31, 25, 36, 34, 28, 41\)/);
  assert.match(wicked, /const brim = cacheCtx\.createLinearGradient/);
  assert.match(wicked, /cacheCtx\.quadraticCurveTo\(-4, 2, 27, 9\)/);
  assert.match(wicked, /cacheCtx\.shadowBlur = 2/);
  assert.match(wicked, /config\.burst === "softGreenRipple"/);
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
    "la-legende-du-roi-arthur.js": 72,
  };
  Object.entries(calibratedSizes).forEach(([file, size]) => {
    const source = fs.readFileSync(path.join(cursorRoot, file), "utf8");
    assert.match(source, new RegExp(`"size":${size}`));
  });
  const phantom = fs.readFileSync(path.join(cursorRoot, "phantom-of-the-opera.js"), "utf8");
  const moulin = fs.readFileSync(path.join(cursorRoot, "moulin-rouge.js"), "utf8");
  const arthur = fs.readFileSync(path.join(cursorRoot, "la-legende-du-roi-arthur.js"), "utf8");
  assert.match(phantom, /"size":50/);
  assert.match(phantom, /"hotspot":\[0\.5,0\.5\]/);
  assert.doesNotMatch(moulin, /ctx\.rotate\(Math\.PI \/ 16\)/);
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
  assert.match(source, /this\.fade = burst \? 0\.019 \+ Math\.random\(\) \* 0\.009 : 0\.012 \+ Math\.random\(\) \* 0\.009/);
  assert.match(source, /this\.phase = Math\.random\(\) \* Math\.PI \* 2/);
  assert.match(source, /this\.variant = Math\.random\(\) > 0\.42/);
  assert.match(source, /const twinkle = 0\.72 \+ Math\.sin\(this\.phase\) \* 0\.28/);
  assert.match(source, /ctx\.globalCompositeOperation = "screen"/);
  assert.match(source, /if \(this\.variant\)/);
  assert.match(source, /createRadialGradient\(0, 0, 0, 0, 0, lightRadius\)/);
  assert.doesNotMatch(source, /createRadialGradient\(0, -18/);
});

test("Les Misérables flag cursors click from the middle of their flagpoles", () => {
  const revolution = fs.readFileSync(path.join(cursorRoot, "les-miserables-1980.js"), "utf8");
  const concert = fs.readFileSync(path.join(cursorRoot, "les-miserables-cityprod-2017.js"), "utf8");
  assert.match(revolution, /"motif":"revolutionFlag"/);
  assert.match(revolution, /"hotspot":\[0\.24,0\.54\]/);
  assert.match(concert, /"motif":"concertFlag"/);
  assert.match(concert, /"hotspot":\[0\.25,0\.56\]/);
  assert.doesNotMatch(revolution, /"hotspot":\[0\.24,0\.78\]/);
  assert.doesNotMatch(concert, /"hotspot":\[0\.25,0\.76\]/);
});

test("refined cursors use high-resolution vector caches and page-matched artwork", () => {
  const refined = [
    "moulin-rouge.js",
    "elisabeth-das-musical.js",
    "mozart-das-musical.js",
    "phantom-of-the-opera.js",
    "love-never-dies.js",
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

  const mozart = refined[2];
  assert.match(mozart, /createRadialGradient\(0, 0, 0, 0, 0, 34\)/);
});

test("Notre-Dame rose window cursor stays static while moving", () => {
  const source = fs.readFileSync(path.join(cursorRoot, "notre-dame-de-paris.js"), "utf8");
  assert.match(source, /preRenderRoseWindow/);
  assert.match(source, /window\.addEventListener\("pointermove", updatePointer/);
  assert.match(source, /window\.addEventListener\("pointerdown", handlePointerDown/);
  assert.match(source, /window\.addEventListener\("pointerup", handlePointerUp/);
  assert.match(source, /const pressedScale = 0\.88/);
  assert.match(source, /createLinearGradient/);
  assert.match(source, /requestAnimationFrame\(drawCursor\)/);
  assert.doesNotMatch(source, /CathedralHaloTrail|SoftWindowGlow|particles|ctx\.filter|autoRotation|targetX/);
});

test("1789 trail uses restrained red-gold dust instead of diamond confetti", () => {
  const source = fs.readFileSync(
    path.join(cursorRoot, "1789-les-amants-de-la-bastille.js"),
    "utf8",
  );
  assert.match(source, /const colors = \['#b72e38', '#d1aa63', '#f2e7d3'\]/);
  assert.doesNotMatch(source, /this\.w =|ctx\.lineTo\(this\.w/);
});
