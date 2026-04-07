/**
 * Desktop behavior log — stores anonymized session events in sessionStorage for later sync.
 * Extend with fetch() to your API when ready.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "interval_session_events_v1";
  var MAX_EVENTS = 500;

  function nowIso() {
    return new Date().toISOString();
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(events) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    } catch (e) {
      /* quota or private mode */
    }
  }

  function log(kind, detail) {
    var events = load();
    events.push({ t: nowIso(), kind: kind, detail: detail || null });
    save(events);
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[Interval]", kind, detail || "");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    log("page_view", { path: window.location.pathname });

    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest("button");
        if (!btn) return;
        var label = (btn.textContent || "").trim() || btn.getAttribute("aria-label") || "button";
        log("ui_click", { control: label });
      },
      true,
    );

    document.addEventListener("visibilitychange", function () {
      log("visibility", { state: document.visibilityState });
    });

    window.addEventListener("beforeunload", function () {
      log("page_unload", {});
    });
  });

  window.IntervalTracking = {
    log: log,
    getEvents: load,
    clear: function () {
      sessionStorage.removeItem(STORAGE_KEY);
    },
  };
})();
