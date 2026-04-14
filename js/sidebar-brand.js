/**
 * Sets aria-label on the header logo link from local profile (if present).
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var a = document.getElementById("sidebar-brand-link");
    if (!a || !window.IntervalProfile) return;
    var p = IntervalProfile.get();
    if (!p) {
      a.setAttribute("aria-label", "Set up your profile");
      return;
    }
    if (p.displayName && !p.skipped) {
      a.setAttribute("aria-label", "Profile: " + p.displayName);
    } else if (p.skipped) {
      a.setAttribute("aria-label", "View profile");
    } else {
      a.setAttribute("aria-label", "View profile");
    }
  });
})();
