/**
 * Theme preference — dark / light via data-theme on <html>, persisted in localStorage.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "interval_theme";
  var THEME_DARK = "dark";
  var THEME_LIGHT = "light";

  function getStoredTheme() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === THEME_LIGHT || v === THEME_DARK) return v;
    } catch (e) {
      /* private mode */
    }
    return THEME_DARK;
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === THEME_LIGHT) {
      root.setAttribute("data-theme", THEME_LIGHT);
    } else {
      root.setAttribute("data-theme", THEME_DARK);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore */
    }
    syncSwitchUi(theme);
  }

  function syncSwitchUi(theme) {
    var sw = document.getElementById("theme-switch");
    if (!sw) return;
    var isDark = theme === THEME_DARK;
    sw.setAttribute("aria-checked", isDark ? "true" : "false");
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getStoredTheme());

    var toggle = document.getElementById("theme-switch");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var current =
          document.documentElement.getAttribute("data-theme") === THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
        var next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
        applyTheme(next);
      });
    }

  });
})();
