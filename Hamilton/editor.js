(() => {
  const api = "/__lyrics-editor/hamilton";
  const rows = window.hamiltonLyricsRows || [];
  const byId = new Map(rows.map((row) => [`ham-${String(row.song_order).padStart(2, "0")}-${String(row.line_index).padStart(3, "0")}`, row]));

  function attachButtons() {
    document.querySelectorAll(".lyric-card").forEach((card) => {
      if (card.querySelector(".editor-line-button")) return;
      const row = byId.get(card.dataset.lineId);
      if (!row) return;
      const button = document.createElement("button");
      button.className = "editor-line-button";
      button.type = "button";
      button.textContent = "编辑";
      button.addEventListener("click", () => openEditor(card, row));
      card.querySelector(".line-actions")?.append(button);
    });
  }

  function field(label, value) {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("textarea");
    input.value = value;
    wrapper.append(input);
    return { wrapper, input };
  }

  function openEditor(card, row) {
    card.querySelector(".editor-panel")?.remove();
    const panel = document.createElement("section");
    panel.className = "editor-panel";
    const english = field("英文歌词", row.english);
    const ipa = field("IPA", row.ipa);
    const chinese = field("中文翻译", row.chinese_translation);
    const actions = document.createElement("div");
    actions.className = "editor-panel-actions";
    const save = document.createElement("button");
    save.className = "editor-save-button";
    save.textContent = "保存并重建";
    const cancel = document.createElement("button");
    cancel.className = "editor-cancel-button";
    cancel.textContent = "取消";
    const status = document.createElement("p");
    status.className = "editor-status";
    cancel.addEventListener("click", () => panel.remove());
    save.addEventListener("click", async () => {
      save.disabled = true;
      status.textContent = "正在保存与重建…";
      try {
        const response = await fetch(`${api}/line`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ songOrder: row.song_order, lineIndex: row.line_index, english: english.input.value, ipa: ipa.input.value, chinese: chinese.input.value, previousEnglish: row.english }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "保存失败");
        status.textContent = result.message;
        window.setTimeout(() => window.location.reload(), 650);
      } catch (error) {
        status.textContent = `未保存：${error.message}`;
        save.disabled = false;
      }
    });
    actions.append(save, cancel);
    panel.append(english.wrapper, ipa.wrapper, chinese.wrapper, actions, status);
    card.querySelector(".line-main")?.append(panel);
  }

  function mountBanner() {
    const banner = document.createElement("div");
    banner.className = "editor-mode-banner";
    banner.innerHTML = "<span>本地校对模式</span>";
    const check = document.createElement("button");
    check.className = "editor-regression-button";
    check.textContent = "全量回归检查";
    check.addEventListener("click", async () => {
      check.disabled = true;
      check.textContent = "检查中…";
      try {
        const response = await fetch(`${api}/regression`, { method: "POST" });
        const result = await response.json();
        alert(result.ok ? `通过\n${result.summary}` : `失败\n${result.summary}`);
      } catch (error) {
        alert(`检查失败：${error.message}`);
      } finally {
        check.disabled = false;
        check.textContent = "全量回归检查";
      }
    });
    banner.append(check);
    document.body.append(banner);
  }

  new MutationObserver(attachButtons).observe(document.body, { childList: true, subtree: true });
  attachButtons();
  mountBanner();
})();
