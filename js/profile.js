/**
 * Local user profile (onboarding). Replace or sync with a server when accounts go live.
 */
(function () {
  "use strict";

  var KEY = "interval_user_profile_v1";

  function get() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function save(data) {
    var prev = get() || {};
    var merged = Object.assign({}, prev, data, {
      version: 1,
      createdAt: prev.createdAt || new Date().toISOString(),
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(merged));
    } catch (e) {}
  }

  window.IntervalProfile = {
    KEY: KEY,
    get: get,
    save: save,
  };
})();
