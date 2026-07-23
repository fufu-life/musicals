(function initMusicalPlaybackRate(globalScope) {
  const DEFAULT_RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2, 3]);

  function formatRate(rate) {
    const value = Number(rate);
    return `${Number.isInteger(value) ? value.toFixed(1) : String(value)}x`;
  }

  function createControl({
    button,
    storageKey,
    rates = DEFAULT_RATES,
    defaultRate = 1,
    storage = globalScope.localStorage,
    onChange = () => {},
  } = {}) {
    if (!button) throw new Error("Playback-rate button is required");
    const allowedRates = [...rates].map(Number).filter((rate) => Number.isFinite(rate) && rate > 0);
    if (!allowedRates.length) throw new Error("At least one playback rate is required");

    const fallbackRate = allowedRates.includes(Number(defaultRate)) ? Number(defaultRate) : allowedRates[0];
    let currentRate = fallbackRate;

    try {
      const saved = Number(storage?.getItem(storageKey));
      if (allowedRates.includes(saved)) currentRate = saved;
    } catch {
      currentRate = fallbackRate;
    }

    const documentRef = globalScope.document;
    const triggerButtons = new Set([button]);
    let menu = null;
    let menuOpen = false;
    let activeTrigger = button;

    function updateButton(target = button) {
      target.textContent = formatRate(currentRate);
      target.dataset.playbackRate = String(currentRate);
      target.setAttribute("aria-label", "选择播放速度，当前 " + formatRate(currentRate));
      target.setAttribute("aria-haspopup", "menu");
      target.setAttribute("aria-expanded", String(menuOpen && activeTrigger === target));
      target.title = "播放速度：" + formatRate(currentRate);
    }

    function updateTriggers() {
      triggerButtons.forEach((target) => updateButton(target));
    }

    function updateMenu() {
      if (!menu) return;
      menu.querySelectorAll("[data-rate]").forEach((item) => {
        const selected = Number(item.dataset.rate) === currentRate;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
      });
    }

    function closeMenu() {
      if (!menu || !menuOpen) return;
      menuOpen = false;
      menu.hidden = true;
      updateTriggers();
    }

    function positionMenu(trigger) {
      if (!menu || !documentRef) return;
      const rect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const edge = 8;
      const left = Math.min(Math.max(edge, rect.right - menuRect.width), globalScope.innerWidth - menuRect.width - edge);
      const top = rect.bottom + 7 + menuRect.height <= globalScope.innerHeight - edge
        ? rect.bottom + 7
        : Math.max(edge, rect.top - menuRect.height - 7);
      menu.style.left = String(Math.round(left)) + "px";
      menu.style.top = String(Math.round(top)) + "px";
    }

    function openMenu(trigger = button) {
      if (!menu) return cycle();
      triggerButtons.add(trigger);
      activeTrigger = trigger;
      menuOpen = true;
      menu.hidden = false;
      updateMenu();
      positionMenu(trigger);
      updateTriggers();
      const selected = menu.querySelector('[data-rate="' + currentRate + '"]');
      selected?.focus({ preventScroll: true });
      return currentRate;
    }

    function toggleMenu(trigger = button) {
      if (menuOpen && activeTrigger === trigger) {
        closeMenu();
        return currentRate;
      }
      return openMenu(trigger);
    }

    function createMenu() {
      if (!documentRef?.createElement || !documentRef.body) return null;
      menu = documentRef.createElement("div");
      menu.className = "musical-rate-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "选择播放速度");
      menu.hidden = true;
      allowedRates.forEach((rate) => {
        const item = documentRef.createElement("button");
        item.type = "button";
        item.className = "musical-rate-menu-option";
        item.dataset.rate = String(rate);
        item.setAttribute("role", "menuitemradio");
        item.textContent = formatRate(rate);
        item.addEventListener("click", () => {
          setRate(rate);
          closeMenu();
          activeTrigger.focus?.({ preventScroll: true });
        });
        menu.append(item);
      });
      documentRef.body.append(menu);
      documentRef.addEventListener("pointerdown", (event) => {
        if (!menuOpen || menu.contains(event.target)) return;
        for (const trigger of triggerButtons) {
          if (trigger.contains?.(event.target)) return;
        }
        closeMenu();
      });
      documentRef.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });
      return menu;
    }

    function setRate(rate, { persist = true } = {}) {
      const nextRate = Number(rate);
      if (!allowedRates.includes(nextRate)) return currentRate;
      const previousRate = currentRate;
      currentRate = nextRate;
      if (persist) {
        try {
          storage?.setItem(storageKey, String(currentRate));
        } catch {
          // The control remains usable when storage is unavailable.
        }
      }
      updateTriggers();
      updateMenu();
      if (currentRate !== previousRate) onChange(currentRate, previousRate);
      return currentRate;
    }

    function cycle() {
      const index = allowedRates.indexOf(currentRate);
      return setRate(allowedRates[(index + 1) % allowedRates.length]);
    }

    createMenu();
    const handleClick = () => toggleMenu(button);
    button.addEventListener("click", handleClick);
    updateTriggers();

    return {
      cycle,
      closeMenu,
      destroy() {
        button.removeEventListener("click", handleClick);
        menu?.remove();
      },
      getRate: () => currentRate,
      setRate,
      toggleMenu,
    };
  }

  const api = { DEFAULT_RATES, createControl, formatRate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.MusicalPlaybackRate = api;
})(typeof window !== "undefined" ? window : globalThis);
