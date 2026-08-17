(() => {
  const api = window.MusicalDisplaySettings;
  if (!api || document.querySelector("#musicalDisplaySettings")) return;

  function save(settings) {
    const normalized = api.apply(settings);
    try {
      localStorage.setItem(api.storageKey, JSON.stringify(normalized));
    } catch {}
    return normalized;
  }

  function buildOption(value, label, description) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "musical-display-option";
    button.dataset.value = value;
    button.setAttribute("role", "radio");
    button.innerHTML = `<strong>${label}</strong><small>${description}</small>`;
    return button;
  }

  function mount() {
    if (document.querySelector("#musicalDisplaySettings")) return;

    const root = document.createElement("div");
    root.id = "musicalDisplaySettings";
    root.className = "musical-display-settings";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "musical-display-trigger";
    trigger.setAttribute("aria-label", "打开页面风格设置");
    trigger.title = "页面风格";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "musicalDisplayPanel");
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        <circle cx="12" cy="12" r="4" />
      </svg>`;

    const panel = document.createElement("section");
    panel.id = "musicalDisplayPanel";
    panel.className = "musical-display-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "musicalDisplayTitle");
    panel.hidden = true;

    const head = document.createElement("div");
    head.className = "musical-display-panel-head";
    head.innerHTML = `<div><strong id="musicalDisplayTitle">页面风格</strong><small>偏好会应用到所有剧目</small></div>`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "musical-display-close";
    close.setAttribute("aria-label", "关闭页面风格设置");
    close.textContent = "×";
    head.append(close);

    const themeGroup = document.createElement("div");
    themeGroup.className = "musical-display-group";
    themeGroup.innerHTML = `<span class="musical-display-label">颜色主题</span>`;
    const themeOptions = document.createElement("div");
    themeOptions.className = "musical-display-options";
    themeOptions.dataset.setting = "theme";
    themeOptions.setAttribute("role", "radiogroup");
    themeOptions.setAttribute("aria-label", "颜色主题");
    themeOptions.append(
      buildOption("dark", "暗色", "暗色底与浅色歌词"),
      buildOption("light", "亮色", "浅色底与深色歌词"),
    );
    themeGroup.append(themeOptions);

    const cursorGroup = document.createElement("div");
    cursorGroup.className = "musical-display-group";
    cursorGroup.innerHTML = `<span class="musical-display-label">鼠标样式</span>`;
    const cursorOptions = document.createElement("div");
    cursorOptions.className = "musical-display-options";
    cursorOptions.dataset.setting = "cursor";
    cursorOptions.setAttribute("role", "radiogroup");
    cursorOptions.setAttribute("aria-label", "鼠标样式");
    cursorOptions.append(
      buildOption("custom", "剧目鼠标", "保留主题动画"),
      buildOption("native", "原生鼠标", "关闭动画与粒子"),
    );
    cursorGroup.append(cursorOptions);

    panel.append(head, themeGroup, cursorGroup);
    root.append(trigger, panel);
    const searchControl = document.querySelector(".lyrics-tools-search, .lyrics-search-control");
    const libraryAnchor = document.querySelector("#copyrightNoticeButton");
    if (searchControl?.parentElement) {
      searchControl.after(root);
      root.classList.add("is-inline");
    } else if (libraryAnchor?.parentElement) {
      libraryAnchor.before(root);
      root.classList.add("is-inline", "is-library-inline");
    } else {
      document.body.append(root);
      root.classList.add("is-floating");
    }
    // Generated lyric pages animate their main content with transform. A fixed
    // descendant of that transformed tree is positioned against the tree,
    // not the viewport, so keep only the trigger inline and mount the panel
    // directly under body.
    document.body.append(panel);

    function positionPanel() {
      if (panel.hidden) return;
      const margin = 12;
      const gap = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(360, window.innerWidth - margin * 2);
      const panelHeight = Math.min(panel.scrollHeight, window.innerHeight - margin * 2);
      const left = Math.max(
        margin,
        Math.min(triggerRect.right - panelWidth, window.innerWidth - panelWidth - margin),
      );
      let top = triggerRect.bottom + gap;
      if (top + panelHeight > window.innerHeight - margin) {
        top = Math.max(margin, triggerRect.top - gap - panelHeight);
      }
      panel.style.width = `${panelWidth}px`;
      panel.style.maxHeight = `${Math.max(180, window.innerHeight - margin * 2)}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    function sync() {
      const settings = api.current();
      panel.querySelectorAll(".musical-display-options").forEach((group) => {
        const setting = group.dataset.setting;
        group.querySelectorAll(".musical-display-option").forEach((button) => {
          const selected = button.dataset.value === settings[setting];
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-checked", String(selected));
          button.tabIndex = selected ? 0 : -1;
        });
      });
    }

    function setOpen(open, { restoreFocus = false } = {}) {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      document.documentElement.toggleAttribute("data-musical-settings-open", open);
      if (open) {
        sync();
        positionPanel();
        close.focus({ preventScroll: true });
      } else if (restoreFocus) {
        trigger.focus({ preventScroll: true });
      }
    }

    trigger.addEventListener("click", () => setOpen(panel.hidden));
    close.addEventListener("click", () => setOpen(false, { restoreFocus: true }));
    panel.addEventListener("click", (event) => {
      const option = event.target.closest(".musical-display-option");
      if (!option) return;
      const group = option.closest(".musical-display-options");
      const setting = group?.dataset.setting;
      if (!setting) return;
      const current = api.current();
      if (current[setting] === option.dataset.value) return;
      const next = save({ ...current, [setting]: option.dataset.value });
      sync();
      if (setting === "cursor" && !window.LibraryCursorController) {
        window.setTimeout(() => window.location.reload(), 90);
      } else if (setting === "cursor") {
        window.LibraryCursorController.sync();
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const option = event.target.closest(".musical-display-option");
      if (!option) return;
      const options = [...option.parentElement.querySelectorAll(".musical-display-option")];
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = options[(options.indexOf(option) + direction + options.length) % options.length];
      event.preventDefault();
      next.focus();
      next.click();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!panel.hidden && !root.contains(event.target) && !panel.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) setOpen(false, { restoreFocus: true });
    });
    window.addEventListener("resize", positionPanel, { passive: true });
    window.addEventListener("scroll", positionPanel, { passive: true });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
