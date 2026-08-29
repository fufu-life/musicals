window.referenceCursorActive = true;

(() => {
  if (window.matchMedia("(pointer: coarse)").matches) return;

  const canvas = document.getElementById("effectCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Cache the rose window once. Pointer movement only reuses this bitmap.
  const cacheCanvas = document.createElement("canvas");
  const cacheCtx = cacheCanvas.getContext("2d");
  const cacheSize = 64;
  const baseScale = 0.8;
  const pressedScale = 0.88;
  cacheCanvas.width = cacheSize;
  cacheCanvas.height = cacheSize;

  function preRenderRoseWindow() {
    const center = cacheSize / 2;
    const radius = 24;
    cacheCtx.clearRect(0, 0, cacheSize, cacheSize);

    cacheCtx.strokeStyle = "#d1b58a";
    cacheCtx.lineWidth = 1.5;
    cacheCtx.beginPath();
    cacheCtx.arc(center, center, radius, 0, Math.PI * 2);
    cacheCtx.stroke();
    cacheCtx.lineWidth = 0.8;
    [radius * 0.5, radius * 0.2].forEach((ringRadius) => {
      cacheCtx.beginPath();
      cacheCtx.arc(center, center, ringRadius, 0, Math.PI * 2);
      cacheCtx.stroke();
    });

    cacheCtx.save();
    cacheCtx.translate(center, center);
    for (let index = 0; index < 12; index += 1) {
      cacheCtx.rotate(Math.PI / 6);
      cacheCtx.strokeStyle = "#d1b58a";
      cacheCtx.lineWidth = 0.6;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(0, radius);
      cacheCtx.stroke();

      cacheCtx.fillStyle = index % 2 === 0 ? "rgba(184, 47, 24, 0.6)" : "rgba(42, 77, 124, 0.5)";
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.arc(0, 0, radius, 0, Math.PI / 6);
      cacheCtx.closePath();
      cacheCtx.fill();
    }
    cacheCtx.restore();

    cacheCtx.fillStyle = "#d1b58a";
    cacheCtx.beginPath();
    cacheCtx.arc(center, center, 2, 0, Math.PI * 2);
    cacheCtx.fill();

    const iridescentSheen = cacheCtx.createLinearGradient(8, 8, 56, 56);
    iridescentSheen.addColorStop(0, "rgba(255, 214, 140, 0.12)");
    iridescentSheen.addColorStop(0.35, "rgba(185, 130, 255, 0.1)");
    iridescentSheen.addColorStop(0.68, "rgba(102, 216, 255, 0.1)");
    iridescentSheen.addColorStop(1, "rgba(255, 238, 170, 0.12)");
    cacheCtx.strokeStyle = iridescentSheen;
    cacheCtx.lineWidth = 1.15;
    cacheCtx.beginPath();
    cacheCtx.arc(center, center, radius - 0.8, 0, Math.PI * 2);
    cacheCtx.stroke();
  }

  preRenderRoseWindow();

  const pointer = { x: -100, y: -100 };
  let renderFrame = 0;
  let pressed = false;
  let pressScale = 1;

  function drawCursor() {
    renderFrame = 0;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (pointer.x < 0 || pointer.y < 0) return;

    const targetScale = pressed ? pressedScale : 1;
    pressScale += (targetScale - pressScale) * 0.35;
    const displaySize = cacheSize * baseScale * pressScale;
    ctx.drawImage(
      cacheCanvas,
      pointer.x - displaySize / 2,
      pointer.y - displaySize / 2,
      displaySize,
      displaySize,
    );

    if (Math.abs(pressScale - targetScale) > 0.01) scheduleCursorRender();
  }

  function scheduleCursorRender() {
    if (!renderFrame) renderFrame = requestAnimationFrame(drawCursor);
  }

  function updatePointer(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    scheduleCursorRender();
  }

  function clearPointer() {
    pointer.x = -100;
    pointer.y = -100;
    pressed = false;
    scheduleCursorRender();
  }

  function handlePointerDown() {
    pressed = true;
    scheduleCursorRender();
  }

  function handlePointerUp() {
    pressed = false;
    scheduleCursorRender();
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    drawCursor();
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("pointerenter", updatePointer, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  window.addEventListener("pointerdown", handlePointerDown, { passive: true });
  window.addEventListener("pointerup", handlePointerUp, { passive: true });
  window.addEventListener("pointercancel", handlePointerUp, { passive: true });
  window.addEventListener("pointerleave", clearPointer, { passive: true });
  resizeCanvas();
})();
