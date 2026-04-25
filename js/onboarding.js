(function () {
  "use strict";

  // ── Assessment questions ──────────────────────────────────────────────────────

  var QUESTIONS = [
    {
      id: "q1",
      text: "What is the main cause of your focus breaking?",
      hint: "Pick the one that pulls you away most often.",
      options: [
        { value: "phone",       label: "My phone / notifications" },
        { value: "browser",     label: "Browser drift \u2013 tabs, social, news" },
        { value: "environment", label: "Environmental noise or people" },
        { value: "internal",    label: "Internal \u2013 wandering thoughts, mood" },
        { value: "fatigue",     label: "Fatigue or low energy" }
      ]
    },
    {
      id: "q2",
      text: "When do you feel most productive?",
      hint: "Pick your natural performance window.",
      options: [
        { value: "early_morning", label: "Early morning (before 10 am)" },
        { value: "mid_morning",   label: "Mid-morning (10 am \u2013 12 pm)" },
        { value: "afternoon",     label: "Afternoon (12 \u2013 5 pm)" },
        { value: "evening",       label: "Evening (after 6 pm)" }
      ]
    },
    {
      id: "q3",
      text: "How long can you usually focus before drifting?",
      hint: "Be honest \u2014 there\u2019s no wrong answer.",
      options: [
        { value: "under_15", label: "Under 15 minutes" },
        { value: "15_30",    label: "15 \u2013 30 minutes" },
        { value: "30_60",    label: "30 \u2013 60 minutes" },
        { value: "over_60",  label: "Over 60 minutes" }
      ]
    },
    {
      id: "q4",
      text: "What does your typical work look like?",
      hint: "Choose the closest match.",
      options: [
        { value: "writing",  label: "Writing or reading" },
        { value: "coding",   label: "Coding or technical work" },
        { value: "creative", label: "Creative or design work" },
        { value: "study",    label: "Studying or research" },
        { value: "admin",    label: "Administrative tasks" }
      ]
    },
    {
      id: "q5",
      text: "How do you usually feel when starting a session?",
      hint: "Pick what feels most familiar.",
      options: [
        { value: "energized",  label: "Energized and ready to go" },
        { value: "motivated",  label: "Somewhat motivated" },
        { value: "neutral",    label: "Neutral \u2013 I just start" },
        { value: "resistant",  label: "Resistant \u2013 it\u2019s hard to begin" }
      ]
    },
    {
      id: "q6",
      text: "What\u2019s your biggest focus challenge right now?",
      hint: "Pick the one that feels most urgent.",
      options: [
        { value: "starting",       label: "Getting started on tasks" },
        { value: "staying",        label: "Staying on task once started" },
        { value: "interruptions",  label: "Managing interruptions" },
        { value: "fatigue",        label: "Avoiding mental fatigue" },
        { value: "balance",        label: "Balancing multiple projects" }
      ]
    }
  ];

  // ── State ─────────────────────────────────────────────────────────────────────

  var currentQ  = 0;
  var answers   = {};   // { q1: value, q2: value, ... }

  // ── Step management ───────────────────────────────────────────────────────────

  function showStep(id) {
    var steps = ["ob-step-profile", "ob-step-assess", "ob-step-complete"];
    for (var i = 0; i < steps.length; i++) {
      var el = document.getElementById(steps[i]);
      if (!el) continue;
      if (steps[i] === id) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    }
  }

  // ── Assessment rendering ──────────────────────────────────────────────────────

  function renderQuestion(index) {
    var q        = QUESTIONS[index];
    var total    = QUESTIONS.length;
    var labelEl  = document.getElementById("assess-step-label");
    var qEl      = document.getElementById("assess-question");
    var hintEl   = document.getElementById("assess-hint");
    var optsCont = document.getElementById("assess-options");
    var fillEl   = document.getElementById("assess-progress-fill");
    var nextBtn  = document.getElementById("assess-next");
    var backBtn  = document.getElementById("assess-back");

    if (labelEl) labelEl.textContent = "SELF-ASSESSMENT \u00B7 " + (index + 1) + " OF " + total;
    if (qEl)     qEl.textContent     = q.text;
    if (hintEl)  hintEl.textContent  = q.hint;

    if (fillEl) {
      fillEl.style.width = ((index / total) * 100).toFixed(1) + "%";
    }

    // Last question
    if (nextBtn) {
      nextBtn.textContent = index === total - 1 ? "Finish" : "Next";
    }
    if (backBtn) {
      backBtn.style.visibility = index === 0 ? "hidden" : "visible";
    }

    if (!optsCont) return;
    while (optsCont.firstChild) optsCont.removeChild(optsCont.firstChild);

    var saved = answers[q.id];

    for (var i = 0; i < q.options.length; i++) {
      (function (opt) {
        var row = document.createElement("button");
        row.type      = "button";
        row.className = "assess-option" + (saved === opt.value ? " assess-option--selected" : "");
        row.setAttribute("data-value", opt.value);
        row.setAttribute("role", "radio");
        row.setAttribute("aria-checked", saved === opt.value ? "true" : "false");

        var dot  = document.createElement("span");
        dot.className = "assess-option__dot";
        dot.setAttribute("aria-hidden", "true");

        var text = document.createElement("span");
        text.className   = "assess-option__text";
        text.textContent = opt.label;

        row.appendChild(dot);
        row.appendChild(text);
        optsCont.appendChild(row);

        row.addEventListener("click", function () {
          answers[q.id] = opt.value;
          var all = optsCont.querySelectorAll(".assess-option");
          for (var j = 0; j < all.length; j++) {
            all[j].classList.remove("assess-option--selected");
            all[j].setAttribute("aria-checked", "false");
          }
          row.classList.add("assess-option--selected");
          row.setAttribute("aria-checked", "true");
          if (nextBtn) nextBtn.disabled = false;
        });
      })(q.options[i]);
    }

    if (nextBtn) nextBtn.disabled = !saved;
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var form    = document.getElementById("onboarding-form");
    var skipBtn = document.getElementById("onboarding-skip");
    var nextBtn = document.getElementById("assess-next");
    var backBtn = document.getElementById("assess-back");
    var enterBtn = document.getElementById("enter-interval");

    if (!window.IntervalProfile) return;

    // Pre-fill form from existing profile
    var existing = window.IntervalProfile.get();
    if (existing) {
      var dn = document.getElementById("profile-display-name");
      var em = document.getElementById("profile-email");
      var fc = document.getElementById("profile-focus");
      if (existing.displayName && dn) dn.value = existing.displayName;
      if (existing.email && em)       em.value = existing.email;
      if (existing.focus && fc)       fc.value = existing.focus;
    }

    // Profile form submit → start assessment
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var displayName = (document.getElementById("profile-display-name") || {}).value || "";
        var email       = (document.getElementById("profile-email") || {}).value || "";
        displayName = displayName.trim();
        email       = email.trim();
        if (!displayName || !email) return;

        var focusEl = document.getElementById("profile-focus");
        window.IntervalProfile.save({
          skipped:     false,
          displayName: displayName,
          email:       email,
          focus:       focusEl ? focusEl.value : "other"
        });

        currentQ = 0;
        answers  = {};
        renderQuestion(0);
        showStep("ob-step-assess");
      });
    }

    // Skip → go straight to app
    if (skipBtn) {
      skipBtn.addEventListener("click", function () {
        window.IntervalProfile.save({ skipped: true });
        window.location.href = "index.html";
      });
    }

    // Assessment: Next / Finish
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var q = QUESTIONS[currentQ];
        if (!answers[q.id]) return;

        if (currentQ < QUESTIONS.length - 1) {
          currentQ++;
          renderQuestion(currentQ);
        } else {
          // Save assessment answers to profile
          window.IntervalProfile.save({ assessment: answers });
          // Fill progress bar to 100%
          var fill = document.getElementById("assess-progress-fill");
          if (fill) fill.style.width = "100%";
          showStep("ob-step-complete");
        }
      });
    }

    // Assessment: Back
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (currentQ > 0) {
          currentQ--;
          renderQuestion(currentQ);
        } else {
          showStep("ob-step-profile");
        }
      });
    }

    // Completion: Enter Interval
    if (enterBtn) {
      enterBtn.addEventListener("click", function () {
        window.location.href = "index.html";
      });
    }
  });

})();
