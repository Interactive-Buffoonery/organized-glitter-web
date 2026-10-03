(function () {
  var storageKey = 'theme';
  var preference = 'system';
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function readPreference() {
    try {
      var stored = window.localStorage.getItem(storageKey);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
      if (stored === 'catppuccin-latte') return 'light';
      if (
        stored === 'catppuccin-frappe' ||
        stored === 'catppuccin-macchiato' ||
        stored === 'catppuccin-mocha'
      ) {
        return 'dark';
      }
    } catch {
      return 'system';
    }
    return 'system';
  }

  function applyTheme() {
    if (document.documentElement.dataset.blogNavigation === 'active') return;
    var isDark = preference === 'dark' || (preference === 'system' && systemDark.matches);
    var root = document.documentElement;
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.classList.toggle('dark', isDark);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      meta.setAttribute('content', isDark ? '#151533' : '#f8e8f6');
    });
    document.querySelectorAll('[data-theme-choice]').forEach(function (item) {
      item.setAttribute('aria-current', String(item.dataset.themeChoice === preference));
    });
  }

  function setPreference(value) {
    if (value !== 'light' && value !== 'dark' && value !== 'system') return;
    preference = value;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
    applyTheme();
  }

  preference = readPreference();
  applyTheme();
  systemDark.addEventListener('change', applyTheme);
  window.addEventListener('storage', function (event) {
    if (event.key !== storageKey) return;
    preference = readPreference();
    applyTheme();
  });

  document.addEventListener('DOMContentLoaded', function () {
    var header = document.querySelector('.site-header');
    var toggle = document.getElementById('theme-toggle');
    var menu = document.getElementById('theme-menu');
    if (!toggle || !menu) return;
    var choices = Array.from(menu.querySelectorAll('[data-theme-choice]'));

    function updateHeader() {
      header?.classList.toggle('is-scrolled', window.scrollY > 20);
    }

    function closeMenu(restoreFocus) {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    }

    function openMenu(index) {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var selected = choices.findIndex(function (item) {
        return item.dataset.themeChoice === preference;
      });
      choices[index ?? Math.max(0, selected)]?.focus();
    }

    toggle.addEventListener('click', function () {
      if (menu.hidden) openMenu();
      else closeMenu(true);
    });

    toggle.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openMenu(0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(choices.length - 1);
      }
    });

    menu.addEventListener('click', function (event) {
      var choice = event.target.closest('[data-theme-choice]');
      if (!choice) return;
      setPreference(choice.dataset.themeChoice);
      closeMenu(true);
    });

    menu.addEventListener('keydown', function (event) {
      var current = choices.indexOf(document.activeElement);
      var next;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === 'Tab') {
        closeMenu(false);
        return;
      }
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = choices.length - 1;
      if (event.key === 'ArrowDown') next = (current + 1) % choices.length;
      if (event.key === 'ArrowUp') next = (current - 1 + choices.length) % choices.length;
      if (next !== undefined) {
        event.preventDefault();
        choices[next].focus();
      }
    });

    document.addEventListener('pointerdown', function (event) {
      if (!menu.hidden && !event.target.closest('.theme-control')) closeMenu(false);
    });

    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
    applyTheme();
  });
})();
