/**
 * Theme preference — dark / light / amber via data-theme on <html>.
 * Persisted in localStorage under "interval_theme".
 * Amber is a warm dark mode that eliminates blue-spectrum light.
 */
(function () {
  "use strict";

  var STORAGE_KEY   = "interval_theme";
  var VALID_THEMES  = ["dark", "light", "amber"];

  function getStoredTheme() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (VALID_THEMES.indexOf(v) !== -1) return v;
    } catch (e) { /* private mode */ }
    return "dark";
  }

  function applyTheme(theme) {
    if (VALID_THEMES.indexOf(theme) === -1) theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) { /* ignore */ }
    syncUi(theme);
  }

  function syncUi(theme) {
    // Legacy dark/light toggle switch
    var sw = document.getElementById("theme-switch");
    if (sw) {
      sw.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    }
    // Settings page theme cards (data-theme-option attribute)
    var cards = document.querySelectorAll("[data-theme-option]");
    for (var i = 0; i < cards.length; i++) {
      var isActive = cards[i].getAttribute("data-theme-option") === theme;
      if (isActive) {
        cards[i].classList.add("theme-card--active");
      } else {
        cards[i].classList.remove("theme-card--active");
      }
      cards[i].setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getStoredTheme());

    // Legacy single toggle (dark ↔ light)
    var toggle = document.getElementById("theme-switch");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var current = document.documentElement.getAttribute("data-theme");
        applyTheme(current === "dark" ? "light" : "dark");
      });
    }

    // Settings page theme selection cards
    var cards = document.querySelectorAll("[data-theme-option]");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("click", function () {
          applyTheme(card.getAttribute("data-theme-option"));
        });
      })(cards[i]);
    }
  });

  window.IntervalTheme = {
    apply:      applyTheme,
    getCurrent: function () {
      return document.documentElement.getAttribute("data-theme") || "dark";
    }
  };

})();
