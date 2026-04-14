/**
 * Profile page — render stored profile (Guide page styling reused via dashboard.css).
 */
(function () {
  "use strict";

  var FOCUS_LABEL = {
    work: "Work & career",
    study: "Study & classes",
    personal: "Personal projects",
    other: "Other",
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("profile-view");
    if (!el || !window.IntervalProfile) return;

    var p = IntervalProfile.get();
    if (!p) return;

    if (p.skipped && !p.displayName) {
      el.innerHTML =
        '<p class="profile-view__lead">You skipped detailed setup. Add a name and email anytime.</p>'
        + '<p><a class="btn-primary profile-view__cta" href="onboarding.html">Complete profile</a></p>';
      return;
    }

    var name = p.displayName || "—";
    var email = p.email || "—";
    var focusKey = p.focus || "other";
    var focusLabel = FOCUS_LABEL[focusKey] || FOCUS_LABEL.other;

    el.innerHTML =
      '<dl class="profile-view__dl">'
      + '<div class="profile-view__row"><dt>Display name</dt><dd>' + escapeHtml(name) + "</dd></div>"
      + '<div class="profile-view__row"><dt>Email</dt><dd>' + escapeHtml(email) + "</dd></div>"
      + '<div class="profile-view__row"><dt>Main focus</dt><dd>' + escapeHtml(focusLabel) + "</dd></div>"
      + "</dl>"
      + '<p class="profile-view__meta">Stored on this device until cloud sync is available.</p>'
      + '<p><a class="profile-view__edit" href="onboarding.html">Update profile details</a></p>';
  });

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();
