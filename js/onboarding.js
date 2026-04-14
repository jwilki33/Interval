(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("onboarding-form");
    var skipBtn = document.getElementById("onboarding-skip");
    if (!form || !window.IntervalProfile) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var displayName = (document.getElementById("profile-display-name") || {}).value || "";
      var email = (document.getElementById("profile-email") || {}).value || "";
      displayName = displayName.trim();
      email = email.trim();
      if (!displayName || !email) return;

      var focusEl = document.getElementById("profile-focus");
      window.IntervalProfile.save({
        skipped: false,
        displayName: displayName,
        email: email,
        focus: focusEl ? focusEl.value : "other",
      });
      window.location.href = "index.html";
    });

    if (skipBtn) {
      skipBtn.addEventListener("click", function () {
        window.IntervalProfile.save({
          skipped: true,
        });
        window.location.href = "index.html";
      });
    }
  });
})();
