const assert = require("node:assert/strict");
const test = require("node:test");

const { DEFAULT_RATES, createControl, formatRate } = require("../playback-rate.js");

function makeButton() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    dataset: {},
    textContent: "",
    title: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    click() {
      listeners.get("click")?.();
    },
  };
}

test("playback-rate control keeps 1.0 as the default and includes slow speeds", () => {
  const button = makeButton();
  const control = createControl({ button, storage: null, storageKey: "test-rate" });
  assert.deepEqual(DEFAULT_RATES, [0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
  assert.equal(button.textContent, "1.0x");
  [1.25, 1.5, 2, 3, 0.5, 0.75, 1].forEach((expected) => {
    button.click();
    assert.equal(control.getRate(), expected);
  });
  assert.equal(button.textContent, "1.0x");
});

test("playback-rate control accepts all approved menu values", () => {
  const button = makeButton();
  const control = createControl({ button, storage: null, storageKey: "test-rate" });
  [0.5, 0.75, 1, 1.25, 1.5, 2, 3].forEach((rate) => {
    assert.equal(control.setRate(rate), rate);
  });
  assert.equal(control.setRate(0.6), 3);
});

test("playback-rate control restores a valid saved value and persists changes", () => {
  const values = new Map([["hamilton-rate", "1.5"]]);
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
  };
  const button = makeButton();
  const changes = [];
  const control = createControl({
    button,
    storage,
    storageKey: "hamilton-rate",
    onChange(rate) { changes.push(rate); },
  });
  assert.equal(control.getRate(), 1.5);
  button.click();
  assert.equal(values.get("hamilton-rate"), "2");
  assert.deepEqual(changes, [2]);
  assert.match(button.getAttribute("aria-label"), /2\.0x/);
});

test("formatRate keeps a visible decimal for the default rate", () => {
  assert.equal(formatRate(1), "1.0x");
  assert.equal(formatRate(1.25), "1.25x");
});
