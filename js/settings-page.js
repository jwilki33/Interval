(function () {
  "use strict";

  var FOCUS_LABELS = {
    work:     "Work & career",
    study:    "School & studies",
    personal: "Personal projects",
    other:    "Other"
  };

  // ── Profile display ───────────────────────────────────────────────────────────

  function populateProfile() {
    var profile = window.IntervalProfile ? window.IntervalProfile.get() : null;
    var nameEl  = document.getElementById("sp-name");
    var emailEl = document.getElementById("sp-email");
    var focusEl = document.getElementById("sp-focus");
    if (!profile) return;
    if (nameEl)  nameEl.textContent  = profile.displayName || "\u2014";
    if (emailEl) emailEl.textContent = profile.email       || "\u2014";
    if (focusEl) focusEl.textContent = FOCUS_LABELS[profile.focus] || profile.focus || "\u2014";
  }

  // ── Text scale toggle ─────────────────────────────────────────────────────────

  function syncTextScaleButtons() {
    var stored = localStorage.getItem("interval_text_scale") || "md";
    var btns   = document.querySelectorAll("[data-text-scale]");
    for (var i = 0; i < btns.length; i++) {
      var isActive = btns[i].getAttribute("data-text-scale") === stored;
      if (isActive) btns[i].classList.add("settings-toggle-btn--active");
      else           btns[i].classList.remove("settings-toggle-btn--active");
    }
  }

  function wireTextScale() {
    var btns = document.querySelectorAll("[data-text-scale]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var scale = btn.getAttribute("data-text-scale");
          try { localStorage.setItem("interval_text_scale", scale); } catch (e) {}
          if (scale === "sm" || scale === "lg") {
            document.documentElement.setAttribute("data-text-scale", scale);
          } else {
            document.documentElement.removeAttribute("data-text-scale");
          }
          syncTextScaleButtons();
        });
      })(btns[i]);
    }
    syncTextScaleButtons();
  }

  // ── Tracking mode toggle ──────────────────────────────────────────────────────

  function syncTrackingButtons() {
    var stored = localStorage.getItem("interval_tracking_mode") || "reflective";
    var btns   = document.querySelectorAll("[data-tracking-mode]");
    for (var i = 0; i < btns.length; i++) {
      var isActive = btns[i].getAttribute("data-tracking-mode") === stored;
      if (isActive) btns[i].classList.add("settings-toggle-btn--active");
      else           btns[i].classList.remove("settings-toggle-btn--active");
    }
  }

  function wireTrackingMode() {
    var btns = document.querySelectorAll("[data-tracking-mode]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          try { localStorage.setItem("interval_tracking_mode", btn.getAttribute("data-tracking-mode")); } catch (e) {}
          syncTrackingButtons();
        });
      })(btns[i]);
    }
    syncTrackingButtons();
  }

  // ── Data buttons ──────────────────────────────────────────────────────────────

  function wireDataButtons() {
    var exportBtn   = document.getElementById("sp-export-btn");
    var clearSessEl = document.getElementById("sp-clear-sessions-btn");
    var clearGoals  = document.getElementById("sp-clear-goals-btn");

    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        if (window.IntervalAppSettings && window.IntervalAppSettings.exportSessionsJson) {
          window.IntervalAppSettings.exportSessionsJson();
        }
      });
    }

    if (clearSessEl) {
      clearSessEl.addEventListener("click", function () {
        if (!confirm("Clear all session history? This cannot be undone.")) return;
        try { localStorage.removeItem("interval_session_calendar_v1"); } catch (e) {}
        clearSessEl.textContent = "Cleared \u2714";
        setTimeout(function () { clearSessEl.textContent = "Clear session history"; }, 2000);
      });
    }

    if (clearGoals) {
      clearGoals.addEventListener("click", function () {
        if (!confirm("Clear all goals? This cannot be undone.")) return;
        try { localStorage.removeItem("interval_guide_goals_v1"); } catch (e) {}
        clearGoals.textContent = "Cleared \u2714";
        setTimeout(function () { clearGoals.textContent = "Clear goal log"; }, 2000);
      });
    }
  }

  // ── Navigation layout toggle ──────────────────────────────────────────────────

  function syncNavLayoutButtons() {
    var stored = localStorage.getItem("interval_nav_layout") || "left";
    var btns = document.querySelectorAll("[data-nav-layout]");
    for (var i = 0; i < btns.length; i++) {
      var isActive = btns[i].getAttribute("data-nav-layout") === stored;
      if (isActive) btns[i].classList.add("settings-toggle-btn--active");
      else           btns[i].classList.remove("settings-toggle-btn--active");
    }
  }

  function wireNavLayout() {
    var btns = document.querySelectorAll("[data-nav-layout]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var layout = btn.getAttribute("data-nav-layout");
          try { localStorage.setItem("interval_nav_layout", layout); } catch (e) {}
          if (layout === "top") {
            document.documentElement.setAttribute("data-nav-layout", "top");
          } else {
            document.documentElement.removeAttribute("data-nav-layout");
          }
          syncNavLayoutButtons();
        });
      })(btns[i]);
    }
    syncNavLayoutButtons();
  }

  // ── Retake self-assessment ────────────────────────────────────────────────────

  function wireRetake() {
    var btn = document.getElementById("sp-retake-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.location.href = "onboarding.html";
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    populateProfile();
    wireTextScale();
    wireTrackingMode();
    wireNavLayout();
    wireDataButtons();
    wireRetake();
  });

})();
