(() => {
  const root = document.documentElement;
  const cursor = document.querySelector(".spotlight-mouse");
  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!cursor || !finePointer.matches) return;

  const overlays = new Set();
  let initialized = false;
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let hoverTarget = null;
  let lastSparkAt = 0;
  let activeSparks = 0;

  function customCursorRequested() {
    return root.dataset.musicalCursor !== "native";
  }

  function cursorBlocked() {
    return overlays.size > 0 || root.hasAttribute("data-musical-settings-open");
  }

  function cursorActive() {
    return customCursorRequested() && !cursorBlocked();
  }

  function clearSparks() {
    document.querySelectorAll(".spotlight-spark").forEach((spark) => spark.remove());
    activeSparks = 0;
  }

  function sync() {
    const active = cursorActive();
    const blocked = cursorBlocked();
    document.body.classList.toggle("library-cursor-active", active);
    root.toggleAttribute("data-library-cursor-blocked", blocked);
    cursor.style.opacity = active && initialized ? "1" : "0";
    if (!active) {
      initialized = false;
      cursor.classList.remove("is-hover", "is-click");
      clearSparks();
    }
  }

  function addSpark(timestamp) {
    if (
      reducedMotion.matches
      || timestamp - lastSparkAt < 160
      || activeSparks >= 4
      || Math.random() <= 0.58
    ) return;

    const spark = document.createElement("i");
    spark.className = "spotlight-spark";
    spark.style.left = `${pointerX + 5}px`;
    spark.style.top = `${pointerY - 3}px`;
    spark.style.setProperty("--spark-x", `${Math.round((Math.random() - 0.2) * 18)}px`);
    spark.style.setProperty("--spark-y", `${Math.round((Math.random() - 0.75) * 16)}px`);
    document.body.append(spark);
    activeSparks += 1;
    lastSparkAt = timestamp;
    spark.addEventListener("animationend", () => {
      spark.remove();
      activeSparks = Math.max(0, activeSparks - 1);
    }, { once: true });
  }

  function renderPointer(timestamp) {
    frame = 0;
    if (!cursorActive()) return;
    cursor.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
    cursor.classList.toggle("is-hover", Boolean(hoverTarget?.closest?.(".show-card")));
    if (!initialized) initialized = true;
    cursor.style.opacity = "1";
    addSpark(timestamp);
  }

  function schedulePointerRender(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    hoverTarget = event.target;
    if (cursorActive() && !frame) frame = requestAnimationFrame(renderPointer);
  }

  window.LibraryCursorController = Object.freeze({
    setOverlay(name, open) {
      if (open) overlays.add(name);
      else overlays.delete(name);
      sync();
    },
    sync,
    isActive: cursorActive,
  });

  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ["data-musical-cursor", "data-musical-settings-open"],
  });
  document.addEventListener("pointermove", schedulePointerRender, { passive: true });
  document.addEventListener("pointerdown", () => {
    if (cursorActive()) cursor.classList.add("is-click");
  });
  document.addEventListener("pointerup", () => cursor.classList.remove("is-click"));
  window.addEventListener("blur", () => {
    initialized = false;
    cursor.style.opacity = "0";
    cursor.classList.remove("is-click");
  });
  sync();
})();
