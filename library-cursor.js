(() => {
  if (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cursor = document.querySelector(".spotlight-mouse");
  if (!cursor) return;
  let initialized = false;
  let lastSparkAt = 0;
  let activeSparks = 0;

  document.body.classList.add("library-cursor-active");

  document.addEventListener("mousemove", (event) => {
    if (!initialized) {
      cursor.style.opacity = "1";
      initialized = true;
    }
    cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    cursor.classList.toggle("is-hover", Boolean(event.target.closest?.(".show-card")));
    if (event.timeStamp - lastSparkAt > 72 && activeSparks < 10 && Math.random() > 0.42) {
      const spark = document.createElement("i");
      spark.className = "spotlight-spark";
      spark.style.left = `${event.clientX + 5}px`;
      spark.style.top = `${event.clientY - 3}px`;
      spark.style.setProperty("--spark-x", `${Math.round((Math.random() - 0.2) * 18)}px`);
      spark.style.setProperty("--spark-y", `${Math.round((Math.random() - 0.75) * 16)}px`);
      document.body.append(spark);
      activeSparks += 1;
      lastSparkAt = event.timeStamp;
      spark.addEventListener("animationend", () => {
        spark.remove();
        activeSparks -= 1;
      }, { once: true });
    }
  });

  document.addEventListener("mousedown", () => cursor.classList.add("is-click"));
  document.addEventListener("mouseup", () => cursor.classList.remove("is-click"));
})();
