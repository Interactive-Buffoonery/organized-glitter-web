/**
 * Keep <meta name="theme-color"> in sync with the app's chosen theme so that
 * iOS Safari paints the safe-area / notch zone the same color as the page.
 *
 * The initial media-query values follow the OS. This script then makes the
 * selected app theme authoritative by rewriting each meta whenever the theme
 * class or data attribute changes.
 */

const LIGHT_COLOR = '#f8e8f6';
const DARK_COLOR = '#151533';

function getEffectiveTheme() {
  if (
    document.documentElement.classList.contains('light') ||
    document.documentElement.getAttribute('data-theme') === 'light'
  ) {
    return 'light';
  }

  if (
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
  ) {
    return 'dark';
  }

  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function updateThemeColor() {
  const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  if (!metas.length) return;

  const color = getEffectiveTheme() === 'light' ? LIGHT_COLOR : DARK_COLOR;

  metas.forEach(meta => {
    meta.removeAttribute('media');
    meta.setAttribute('content', color);
  });
}

// Run as soon as possible so the status bar matches before first paint.
updateThemeColor();

document.addEventListener('DOMContentLoaded', () => {
  try {
    updateThemeColor();

    if (typeof MutationObserver === 'undefined') return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme') {
          updateThemeColor();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
      });
    }
  } catch (e) {
    // Theme color is cosmetic, so do not break the app.
  }
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
}
