(function (scope) {
  "use strict";
  const sourceFor = (show) => show
    ? `website_show_${show.id === "rouge-et-noir" ? "rouge" : show.id.replace(/-/g, "_")}`
    : "website_home";
  const isAvailable = (show) => show?.fuyinAvailable === true;
  function describe(show, count) {
    return {
      title: !show ? "网站上的音乐剧歌词，微信小程序里也能学" : isAvailable(show)
        ? `在浮音歌词学习《${show.title}》` : "在浮音歌词学习探索更多音乐剧",
      copy: !show ? `浮音歌词学习已收录 ${count} 部音乐剧。看歌词、听发音，收藏喜欢的句子和单词，并生成歌词图片。`
        : isAvailable(show) ? "在手机上看歌词、听发音，收藏喜欢的句子和单词。"
          : `小程序现已收录 ${count} 部音乐剧，随时随地学习歌词。`,
      cta: !show ? "去浮音歌词学习看看" : isAvailable(show) ? "去小程序学习" : "去小程序看看",
    };
  }
  function getShow(shows, pathname) {
    return shows.find(show => pathname.endsWith('/' + show.href)
      || pathname.endsWith('/' + show.href.replace(/index\.html$/, '')));
  }
  function safeUrl(value, base, external = false) {
    if (!value) return "";
    try {
      const url = new URL(value, base);
      if (external ? url.protocol === "https:" : url.origin === new URL(base).origin && /^(https?:|file:)$/.test(url.protocol)) return url.href;
    } catch {}
    return "";
  }
  const api = { sourceFor, describe, getShow, safeUrl, isAvailable };
  if (typeof module !== "undefined") module.exports = api;
  if (!scope.document) return;
  const doc = scope.document;
  const script = doc.currentScript;
  const base = new URL('../', script.src).href;
  const config = scope.FuyinConfig;
  const shows = scope.libraryShows;
  if (!config || !Array.isArray(shows) || doc.getElementById('fuyinPromo')) return;
  const show = getShow(shows, scope.location.pathname);
  const home = doc.getElementById('languageGroups');
  if (!show && !home) return;
  const target = home || (show.id === 'rouge-et-noir' ? doc.querySelector('.main-grid')
    : show.id === 'dazhuangwang' ? doc.getElementById('songAnnotations')
      : doc.getElementById('searchResults') || doc.getElementById('lyrics'));
  if (!target) return;
  const availableCount = shows.filter(isAvailable).length;
  const message = describe(show, availableCount);
  const source = sourceFor(show);
  let activeSource = source;
  const track = (action, from = source) => scope.MusicalAnalytics?.trackPromo?.({
    action, source: from, show_id: (show?.id || 'musical_library').replace(/-/g, '_'), fuyin_available: isAvailable(show) ? 'yes' : 'no',
  });
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (text, callback, secondary = false) => {
    const node = el('button', secondary ? 'fy-button fy-secondary' : 'fy-button', text);
    node.type = 'button';
    node.addEventListener('click', callback);
    return node;
  };
  function image(path, alt, className) {
    const url = safeUrl(path, base);
    if (!url) return null;
    const node = el('img', className);
    node.src = url; node.alt = alt; node.loading = 'lazy'; node.decoding = 'async';
    node.addEventListener('error', () => node.parentElement?.classList.contains('fy-code') ? node.parentElement.remove() : node.remove(), { once: true });
    return node;
  }
  const card = el('section', 'fy-promo' + (home ? ' fy-home' : ' fy-show'));
  card.id = 'fuyinPromo'; card.setAttribute('data-show', show?.id || 'library'); card.setAttribute('aria-labelledby', 'fuyinTitle');
  const body = el('div', 'fy-copy');
  const label = el('p', 'fy-eyebrow', '浮音歌词学习 · 微信小程序');
  body.append(label);
  const title = el('h2', 'fy-title', message.title); title.id = 'fuyinTitle'; body.append(title);
  body.append(el('p', 'fy-description', message.copy));
  if (home) {
    const features = el('ul', 'fy-features');
    ['歌词学习', '发音', '单词收藏', '歌词收藏', '生成图片'].forEach(text => features.append(el('li', '', text)));
    body.append(features);
  }
  const actions = el('div', 'fy-actions');
  actions.append(button(message.cta, () => open(source)), el('span', 'fy-search-hint', '微信搜索：' + config.name));
  body.append(actions); card.append(body);
  const mark = image(show?.image || config.logo, show ? show.title : '浮音歌词学习', 'fy-mark');
  if (mark) { mark.setAttribute('aria-hidden', 'true'); mark.alt = ''; card.append(mark); }
  if (home) {
    const code = createCode(); if (code) { code.classList.add('fy-desktop-code'); card.append(code); }
    if (Array.isArray(config.screenshots) && config.screenshots.length) {
      const preview = el('div', 'fy-previews');
      config.screenshots.slice(0, 2).forEach((item) => { const img = image(item.src, item.alt || '浮音歌词学习界面', 'fy-preview'); if (img) preview.append(img); });
      if (preview.childElementCount) card.append(preview);
    }
  }
  target.before(card);
  function createCode() {
    const img = image(config.miniCode, '浮音歌词学习正式小程序码', 'fy-code-image');
    if (!img) return null;
    const figure = el('figure', 'fy-code'); figure.append(img, el('figcaption', '', '微信扫码打开浮音歌词学习')); return figure;
  }
  const dialog = el('dialog', 'fy-dialog'); dialog.setAttribute('aria-labelledby', 'fuyinDialogTitle');
  const header = el('div', 'fy-dialog-header');
  const heading = el('h2', 'fy-title', '在微信里找到浮音歌词学习'); heading.id = 'fuyinDialogTitle';
  const close = button('关闭', () => dialog.close(), true); header.append(heading, close); dialog.append(header);
  dialog.append(el('p', 'fy-description', `浮音歌词学习现已收录 ${availableCount} 部音乐剧。`));
  dialog.append(el('p', 'fy-search-name', '微信搜索：' + config.name));
  const status = el('p', 'fy-status'); status.setAttribute('role', 'status');
  const enterActions = el('div', 'fy-actions');
  enterActions.append(button('复制小程序名称', async () => {
    try {
      await scope.navigator.clipboard.writeText(config.name);
      status.textContent = '已复制“' + config.name + '”，前往微信搜索即可。'; track('copy_success', activeSource);
    } catch { status.textContent = '未能自动复制，请长按或选中上方“' + config.name + '”复制，再前往微信搜索。'; }
  }));
  const openUrl = safeUrl(config.openUrl, base, true);
  if (openUrl) {
    const link = el('a', 'fy-button', '打开浮音歌词学习'); link.href = openUrl;
    link.addEventListener('click', () => track('open_link', activeSource)); enterActions.prepend(link);
  }
  const code = createCode();
  dialog.append(enterActions, status); if (code) dialog.append(code);
  doc.body.append(dialog);
  let returnFocus;
  function open(from) {
    activeSource = from; returnFocus = doc.activeElement;
    track('click', from);
    status.textContent = ''; dialog.showModal(); doc.body.classList.add('fy-dialog-open'); updateExposure(); close.focus();
  }
  dialog.addEventListener('close', () => { doc.body.classList.remove('fy-dialog-open'); returnFocus?.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  } });
  let inView = false, exposed = false, exposureTimer = null;
  const exposureEligible = () => inView && doc.visibilityState === 'visible' && !dialog.open;
  function updateExposure() {
    if (!exposureEligible()) {
      if (exposureTimer !== null) scope.clearTimeout(exposureTimer);
      exposureTimer = null;
      return;
    }
    if (exposed || exposureTimer !== null) return;
    exposureTimer = scope.setTimeout(() => {
      exposureTimer = null;
      if (exposureEligible()) { exposed = true; track('impression'); }
    }, 1000);
  }
  if ('IntersectionObserver' in scope) {
    const observer = new scope.IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.4;
      updateExposure();
    }, { threshold: [0, 0.4] }); observer.observe(card);
  }
  doc.addEventListener('visibilitychange', updateExposure);
  dialog.addEventListener('close', updateExposure);
})(typeof window !== 'undefined' ? window : globalThis);
