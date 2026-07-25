const assert = require("node:assert/strict");
const test = require("node:test");

const analytics = require("../analytics.js");

function createEnvironment({ width = 1280, height = 800 } = {}) {
  const listeners = new Map();
  const documentListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const scope = {
    innerWidth: width,
    innerHeight: height,
    scrollY: 0,
    dataLayer: [],
    document: {
      visibilityState: "visible",
      addEventListener(name, callback) {
        documentListeners.set(name, callback);
      },
      removeEventListener(name) {
        documentListeners.delete(name);
      },
    },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    setTimeout(callback) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };
  return {
    scope,
    timers,
    fireTimer() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    fire(name) {
      listeners.get(name)?.();
    },
    fireDocument(name) {
      documentListeners.get(name)?.();
    },
  };
}

function events(scope, name) {
  return scope.dataLayer
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === "event" && (!name || entry[1] === name));
}

test("viewport type follows mobile, tablet, and desktop breakpoints", () => {
  assert.equal(analytics.getViewportType({ innerWidth: 390 }), "mobile");
  assert.equal(analytics.getViewportType({ innerWidth: 900 }), "tablet");
  assert.equal(analytics.getViewportType({ innerWidth: 1280 }), "desktop");
});

test("show and song views are emitted once with allowlisted identifiers", () => {
  const env = createEnvironment();
  const tracker = analytics.createTracker({
    showId: "rouge-et-noir",
    showName: "Le Rouge et le Noir",
    pageType: "lyrics_learning",
  }, env.scope);
  tracker.songRendered({ id: "01-la-gloire", title: "La gloire", order: 1, lyrics: "must not leave this object" });
  tracker.songRendered({ id: "01-la-gloire", title: "La gloire", order: 1 });

  assert.equal(events(env.scope, "show_view").length, 1);
  assert.equal(events(env.scope, "song_view").length, 1);
  assert.deepEqual(events(env.scope, "song_view")[0][2], {
    show_id: "rouge_et_noir",
    show_name: "Le Rouge et le Noir",
    song_id: "01-la-gloire",
    song_title: "La gloire",
    song_order: 1,
    viewport_type: "desktop",
  });
  assert.equal(JSON.stringify(env.scope.dataLayer).includes("must not leave"), false);
});

test("song stay requires one continuous visible timer and fires once per song", () => {
  const env = createEnvironment();
  const tracker = analytics.createTracker({ showId: "hamilton", showName: "Hamilton" }, env.scope);
  tracker.songRendered({ id: "01", title: "One", order: 1 });
  env.scope.document.visibilityState = "hidden";
  env.fireDocument("visibilitychange");
  env.fireTimer();
  assert.equal(events(env.scope, "song_stay").length, 0);

  env.scope.document.visibilityState = "visible";
  env.fireDocument("visibilitychange");
  env.fireTimer();
  env.fireTimer();
  assert.equal(events(env.scope, "song_stay").length, 1);
  assert.equal(events(env.scope, "song_stay")[0][2].stay_seconds, 30);
});

test("read progress emits each threshold at most once for each song", () => {
  const env = createEnvironment({ height: 500 });
  const element = {
    scrollHeight: 1000,
    getBoundingClientRect: () => ({ top: -env.scope.scrollY, height: 1000 }),
  };
  const tracker = analytics.createTracker({
    showId: "dazhuangwang",
    showName: "大状王",
    getProgressElement: () => element,
  }, env.scope);
  tracker.songRendered({ id: "01", title: "申冤", order: 1 });
  tracker.scheduleReadProgress();
  tracker.scheduleReadProgress();
  assert.deepEqual(events(env.scope, "song_read_progress").map((entry) => entry[2].scroll_percent), [25, 50]);

  env.scope.scrollY = 500;
  tracker.scheduleReadProgress();
  tracker.scheduleReadProgress();
  assert.deepEqual(events(env.scope, "song_read_progress").map((entry) => entry[2].scroll_percent), [25, 50, 75, 100]);
});

test("audio sessions deduplicate start and complete while keeping identifier-only payloads", () => {
  const env = createEnvironment();
  const tracker = analytics.createTracker({ showId: "moliere", showName: "Molière" }, env.scope);
  tracker.songRendered({ id: "song-1", title: "Title", order: 1 });
  const session = tracker.audioClick({ audioType: "line", lineId: "line-1", text: "private lyric" });
  tracker.audioClick(session);
  tracker.audioStart(session);
  tracker.audioStart(session);
  tracker.audioComplete(session);
  tracker.audioComplete(session);

  assert.equal(events(env.scope, "audio_click").length, 1);
  assert.equal(events(env.scope, "audio_start").length, 1);
  assert.equal(events(env.scope, "audio_complete").length, 1);
  assert.equal(JSON.stringify(env.scope.dataLayer).includes("private lyric"), false);
});

test("feature names are restricted to the agreed taxonomy", () => {
  const env = createEnvironment();
  const tracker = analytics.createTracker({ showId: "hamilton", showName: "Hamilton" }, env.scope);
  assert.equal(tracker.featureUse("ipa_toggle"), true);
  assert.equal(tracker.featureUse("word_lookup"), false);
  assert.deepEqual(events(env.scope, "feature_use")[0][2], {
    show_id: "hamilton",
    feature_name: "ipa_toggle",
    viewport_type: "desktop",
  });
});
