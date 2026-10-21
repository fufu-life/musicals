/* Reuse each page's picker so ordering, loading and audio cleanup stay page-owned. */
(() => {
  function mount() {
    const picker = document.getElementById('songSelect');
    const lyrics = document.querySelector('#lyrics, #lyricsList');
    if (!picker || !lyrics) return;
    const navigation = document.createElement('nav');
    navigation.className = 'song-pagination';
    navigation.setAttribute('aria-label', '切换歌曲');
    let signature = '';
    let pending = false;

    function sync() {
      pending = false;
      const options = Array.from(picker.options);
      const index = picker.selectedIndex;
      const nextSignature = JSON.stringify([index, options.map(option => [option.value, option.text, option.disabled])]);
      if (signature !== nextSignature) {
        signature = nextSignature;
        navigation.replaceChildren();
        for (const [offset, label] of [[-1, '上一首'], [1, '下一首']]) {
          const option = options[index + offset];
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'song-pagination-button';
          button.disabled = index < 0 || !option || option.disabled;
          const direction = document.createElement('span');
          direction.textContent = label;
          const title = document.createElement('strong');
          title.textContent = option?.text || (offset < 0 ? '已是第一首' : '已是最后一首');
          button.append(direction, title);
          button.addEventListener('click', () => {
            if (button.disabled) return;
            picker.value = option.value;
            picker.dispatchEvent(new Event('change', { bubbles: true }));
          });
          navigation.append(button);
        }
      }
      if (navigation.parentNode !== lyrics) lyrics.append(navigation);
    }

    function scheduleSync() {
      if (pending) return;
      pending = true;
      queueMicrotask(sync);
    }
    new MutationObserver(scheduleSync).observe(picker, { childList: true, subtree: true, attributes: true });
    new MutationObserver(scheduleSync).observe(lyrics, { childList: true });
    picker.addEventListener('change', scheduleSync);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
