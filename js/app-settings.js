/**
 * App preferences — text scale, clock, week start, reduced motion, export.
 * Attributes on <html>: data-text-scale, data-clock, data-week-start, data-reduced-motion.
 */
(function () {
  "use strict";

  var KEY_TEXT = "interval_text_scale";
  var KEY_CLOCK = "interval_clock";
  var KEY_WEEK = "interval_week_start";
  var KEY_MOTION = "interval_motion";

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  function dispatchSettingsChange() {
    try {
      window.dispatchEvent(new CustomEvent("interval-settings-change"));
    } catch (e) {
      try {
        var ev = document.createEvent("Event");
        ev.initEvent("interval-settings-change", true, true);
        window.dispatchEvent(ev);
      } catch (e2) {
        /* IE8-level */
      }
    }
  }

  function applyTextScaleFromStorage() {
    var v = safeGet(KEY_TEXT) || "md";
    var root = document.documentElement;
    if (v === "sm" || v === "lg") {
      root.setAttribute("data-text-scale", v);
    } else {
      root.removeAttribute("data-text-scale");
    }
  }

  function effectiveReducedMotion() {
    var v = safeGet(KEY_MOTION) || "system";
    if (v === "reduce") return true;
    if (v === "full") return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function applyReducedMotionFromStorage() {
    var root = document.documentElement;
    if (effectiveReducedMotion()) {
      root.setAttribute("data-reduced-motion", "reduce");
    } else {
      root.removeAttribute("data-reduced-motion");
    }
  }

  function applyClockFromStorage() {
    var v = safeGet(KEY_CLOCK) || "12";
    var root = document.documentElement;
    if (v === "24") {
      root.setAttribute("data-clock", "24");
    } else {
      root.removeAttribute("data-clock");
    }
  }

  function applyWeekStartFromStorage() {
    var v = safeGet(KEY_WEEK) || "monday";
    var root = document.documentElement;
    if (v === "sunday") {
      root.setAttribute("data-week-start", "sunday");
    } else {
      root.removeAttribute("data-week-start");
    }
  }

  function applyAll() {
    applyTextScaleFromStorage();
    applyClockFromStorage();
    applyWeekStartFromStorage();
    applyReducedMotionFromStorage();
  }

  function syncSelects() {
    var text = document.getElementById("setting-text-scale");
    if (text) text.value = safeGet(KEY_TEXT) || "md";

    var clock = document.getElementById("setting-clock");
    if (clock) clock.value = safeGet(KEY_CLOCK) || "12";

    var week = document.getElementById("setting-week-start");
    if (week) week.value = safeGet(KEY_WEEK) || "monday";

    var motion = document.getElementById("setting-motion");
    if (motion) motion.value = safeGet(KEY_MOTION) || "system";
  }

  function exportSessionsJson() {
    if (window.IntervalSessionCalendar && typeof window.IntervalSessionCalendar.exportJsonFile === "function") {
      window.IntervalSessionCalendar.exportJsonFile();
      return;
    }
    try {
      var raw = localStorage.getItem("interval_session_calendar_v1");
      var blob = new Blob([raw || "{}"], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "interval-session-backup.json";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      /* ignore */
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyAll();
    syncSelects();

    var text = document.getElementById("setting-text-scale");
    if (text) {
      text.addEventListener("change", function () {
        var v = text.value;
        safeSet(KEY_TEXT, v);
        applyTextScaleFromStorage();
        dispatchSettingsChange();
      });
    }

    var clock = document.getElementById("setting-clock");
    if (clock) {
      clock.addEventListener("change", function () {
        safeSet(KEY_CLOCK, clock.value);
        applyClockFromStorage();
        dispatchSettingsChange();
      });
    }

    var week = document.getElementById("setting-week-start");
    if (week) {
      week.addEventListener("change", function () {
        safeSet(KEY_WEEK, week.value);
        applyWeekStartFromStorage();
        dispatchSettingsChange();
      });
    }

    var motion = document.getElementById("setting-motion");
    if (motion) {
      motion.addEventListener("change", function () {
        safeSet(KEY_MOTION, motion.value);
        applyReducedMotionFromStorage();
        dispatchSettingsChange();
      });
    }

    try {
      var motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
      var onMotionPreferenceChange = function () {
        if ((safeGet(KEY_MOTION) || "system") !== "system") return;
        applyReducedMotionFromStorage();
        dispatchSettingsChange();
      };
      if (motionMq && motionMq.addEventListener) {
        motionMq.addEventListener("change", onMotionPreferenceChange);
      } else if (motionMq && motionMq.addListener) {
        motionMq.addListener(onMotionPreferenceChange);
      }
    } catch (e) {
      /* ignore */
    }

    var exportBtn = document.getElementById("setting-export-sessions");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        exportSessionsJson();
      });
    }

    var settingsBtn = document.getElementById("sidebar-settings-toggle");
    var panel = document.getElementById("sidebar-settings-panel");
    if (settingsBtn && panel) {
      settingsBtn.addEventListener("click", function () {
        var open = panel.hasAttribute("hidden");
        if (open) {
          panel.removeAttribute("hidden");
          settingsBtn.setAttribute("aria-expanded", "true");
        } else {
          panel.setAttribute("hidden", "");
          settingsBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
  });

  window.IntervalAppSettings = {
    applyAll: applyAll,
    getWeekStartsSunday: function () {
      return document.documentElement.getAttribute("data-week-start") === "sunday";
    },
    use24hClock: function () {
      return document.documentElement.getAttribute("data-clock") === "24";
    },
  };
})();
