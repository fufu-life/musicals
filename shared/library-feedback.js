(() => {
  const trigger = document.getElementById("libraryFeedbackButton");
  if (!trigger || !window.MusicalFeedback) return;

  const overlay = document.createElement("div");
  overlay.className = "library-feedback-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="library-feedback-dialog" id="libraryFeedbackDialog" role="dialog" aria-modal="true" aria-labelledby="libraryFeedbackTitle">
      <div class="library-feedback-head"><h2 id="libraryFeedbackTitle">反馈</h2><button class="library-feedback-close" type="button" aria-label="关闭反馈弹窗">×</button></div>
      <form class="library-feedback-form" novalidate>
        <label>剧目（可选）<select name="show"><option value="">不选择剧目</option></select></label>
        <label>歌曲（可选）<input name="song" type="text" maxlength="120" placeholder="可以填写歌曲名称" /></label>
        <label><span>反馈内容 <b aria-hidden="true">*</b></span><textarea name="message" maxlength="2000" required placeholder="请写下你的建议或遇到的问题"></textarea></label>
        <label class="library-feedback-honey" aria-hidden="true">留空<input name="honey" type="text" autocomplete="off" tabindex="-1" /></label>
        <p class="library-feedback-status" role="status" aria-live="polite"></p>
        <div class="library-feedback-actions"><button type="button" data-cancel>取消</button><button type="submit" disabled>发送</button></div>
      </form>
    </section>`;
  document.body.append(overlay);

  const dialog = overlay.querySelector(".library-feedback-dialog");
  const form = overlay.querySelector("form");
  const show = form.elements.show;
  const song = form.elements.song;
  const message = form.elements.message;
  const status = overlay.querySelector(".library-feedback-status");
  const submit = form.querySelector('[type="submit"]');
  const closeButton = overlay.querySelector(".library-feedback-close");
  const cancelButton = overlay.querySelector("[data-cancel]");
  let submitting = false;
  let previousFocus = null;

  (Array.isArray(window.libraryShows) ? window.libraryShows : [])
    .filter((item) => item.deployed)
    .forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.title;
      show.append(option);
    });

  function updateSubmit() { submit.disabled = submitting || !message.value.trim(); }
  function close() {
    if (submitting) return;
    overlay.hidden = true;
    document.body.classList.remove("library-feedback-open");
    window.LibraryCursorController?.setOverlay("library-feedback", false);
    trigger.setAttribute("aria-expanded", "false");
    previousFocus?.focus();
  }
  trigger.addEventListener("click", () => {
    previousFocus = document.activeElement;
    window.LibraryCursorController?.setOverlay("library-feedback", true);
    overlay.hidden = false;
    document.body.classList.add("library-feedback-open");
    trigger.setAttribute("aria-expanded", "true");
    status.textContent = "";
    updateSubmit();
    show.focus();
  });
  closeButton.addEventListener("click", close);
  cancelButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  message.addEventListener("input", updateSubmit);
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not([disabled]), select, input:not([tabindex='-1']), textarea")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!message.value.trim() || submitting) return;
    submitting = true;
    submit.textContent = "发送中…";
    cancelButton.disabled = true;
    closeButton.disabled = true;
    updateSubmit();
    status.textContent = "发送中…";
    const selectedShow = show.selectedOptions[0]?.textContent || "";
    const showLabel = show.value ? selectedShow : "未指定";
    const songLabel = song.value.trim() || "未指定";
    const payload = {
      _subject: `【浮音】网站反馈：${showLabel}${song.value.trim() ? ` / ${songLabel}` : ""}`,
      _template: "table",
      _honey: form.elements.honey.value,
      _url: location.href,
      剧目: showLabel,
      歌曲: songLabel,
      反馈内容: message.value.trim(),
      页面: location.href,
      提交时间: new Date().toISOString(),
    };
    try {
      const result = await window.MusicalFeedback.submitFeedback(
        window.MusicalFeedback.resolveEndpoint({ recipient: "fulife@agent.qq.com" }), payload,
      );
      status.textContent = /activat|confirm|验证|激活/i.test(String(result?.message || ""))
        ? "反馈已提交，首次使用需要站长完成邮箱激活。"
        : "反馈已发送，谢谢你的帮助！";
      message.value = "";
    } catch {
      status.textContent = "发送失败，请稍后再试。";
    } finally {
      submitting = false;
      submit.textContent = "发送";
      cancelButton.disabled = false;
      closeButton.disabled = false;
      updateSubmit();
    }
  });
})();
