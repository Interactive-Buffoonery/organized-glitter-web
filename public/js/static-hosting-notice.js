(function () {
  const notice = document.querySelector('[data-notice-id="weekend-hosting"]');
  if (!notice || notice.hasAttribute('data-static-notice-enhanced')) return;
  const template = notice.querySelector('template[data-notice-dismiss]');
  const content = notice.querySelector('[data-notice-content]');
  if (!template?.content.firstElementChild || !content) return;
  const dismissalKey = 'hosting-notice-spacefast-weekend-dismissed';
  try {
    if (sessionStorage.getItem(dismissalKey) === 'true') {
      notice.remove();
      return;
    }
  } catch (_) {
    // The notice remains usable when browser storage is unavailable.
  }
  const close = template.content.firstElementChild.cloneNode(true);
  close.addEventListener('click', () => {
    notice.remove();
    try {
      sessionStorage.setItem(dismissalKey, 'true');
    } catch (_) {
      // Closing the current page's notice does not require storage.
    }
    document.getElementById('main-content')?.focus({ preventScroll: true });
  });
  notice.setAttribute('data-static-notice-enhanced', '');
  content.appendChild(close);
  template.remove();
})();
