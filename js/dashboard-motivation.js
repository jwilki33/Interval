/**
 * Random motivational line on each dashboard load; avoids repeating the last phrase in-session when possible.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "interval_dash_motivation_last";

  var PHRASES = [
    "Small steps add up to deep work.",
    "Notice the drift, then come back—that's the practice.",
    "Your attention is a resource; spend it on purpose.",
    "One session at a time builds the habit.",
    "The curve isn't judgment—it's information.",
    "Showing up again is what counts.",
    "Quiet progress is still progress.",
    "Focus returns in waves; ride the next one.",
    "Reflect honestly, adjust gently.",
    "What you track, you can improve.",
    "The next minute is a fresh chance to settle in.",
    "Consistency beats intensity when intensity burns you out.",
    "Name the pull, then let the work win.",
    "You're building awareness, not chasing perfection.",
  ];

  function pickPhrase() {
    var last = null;
    try {
      last = sessionStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    var pool = PHRASES;
    if (pool.length > 1 && last) {
      pool = PHRASES.filter(function (p) {
        return p !== last;
      });
    }
    var i = Math.floor(Math.random() * pool.length);
    var phrase = pool[i];
    try {
      sessionStorage.setItem(STORAGE_KEY, phrase);
    } catch (e) {}
    return phrase;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("dashboard-motivation");
    if (!el) return;
    el.textContent = pickPhrase();
  });
})();
