/**
 * Clears all Interval client-side data (local + session storage) for a first-visit experience.
 */
(function () {
  "use strict";

  var LOCAL_KEYS = [
    "interval_user_profile_v1",
    "interval_session_calendar_v1",
    "interval_guide_goals_v1",
    "interval_theme",
  ];

  var SESSION_KEYS = [
    "interval_session_events_v1",
    "interval_dash_motivation_last",
  ];

  function clearAll() {
    var i;
    for (i = 0; i < LOCAL_KEYS.length; i++) {
      try {
        localStorage.removeItem(LOCAL_KEYS[i]);
      } catch (e) {}
    }
    for (i = 0; i < SESSION_KEYS.length; i++) {
      try {
        sessionStorage.removeItem(SESSION_KEYS[i]);
      } catch (e) {}
    }
  }

  window.IntervalDataReset = {
    clearAll: clearAll,
    LOCAL_KEYS: LOCAL_KEYS,
    SESSION_KEYS: SESSION_KEYS,
  };
})();
