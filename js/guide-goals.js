/**
 * Guide — one personal goal per calendar day, deadline (next session | end of week), checklist log.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "interval_guide_goals_v1";

  function pad2(n) {
    return ("0" + n).slice(-2);
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /** Sunday that ends the calendar week containing `dateKey` (local, Sun–Sat week). */
  function endOfWeekSundayKey(dateKeyStr) {
    var d = new Date(dateKeyStr + "T12:00:00");
    var dow = d.getDay();
    var add = (7 - dow) % 7;
    d.setDate(d.getDate() + add);
    return dateKey(d);
  }

  function formatShortDate(dateKeyStr) {
    var d = new Date(dateKeyStr + "T12:00:00");
    var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
    return mo + " " + d.getDate();
  }

  function formatWeekdayDate(dateKeyStr) {
    var d = new Date(dateKeyStr + "T12:00:00");
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[d.getDay()] + " · " + formatShortDate(dateKeyStr);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(goals) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
    } catch (e) {}
  }

  function getTodayKey() {
    return dateKey(new Date());
  }

  function deadlineLabel(g) {
    if (g.deadline === "week") {
      var sun = endOfWeekSundayKey(g.dateKey);
      return "By end of week · " + formatShortDate(sun);
    }
    return "Next session";
  }

  function render() {
    var form = document.getElementById("goal-day-form");
    var input = document.getElementById("goal-input");
    var statusEl = document.getElementById("goal-form-status");
    var listEl = document.getElementById("goal-checklist");
    if (!form || !input || !listEl) return;

    var goals = load();
    var todayK = getTodayKey();
    var todayGoal = null;
    var i;
    for (i = 0; i < goals.length; i++) {
      if (goals[i].dateKey === todayK) {
        todayGoal = goals[i];
        break;
      }
    }

    if (todayGoal && todayGoal.completed) {
      form.setAttribute("hidden", "");
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent =
          "You’ve completed today’s goal. You can log one new personal goal tomorrow.";
      }
    } else {
      form.removeAttribute("hidden");
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = "";
      }
      input.value = todayGoal ? todayGoal.text : "";
      var radios = form.querySelectorAll('input[name="goal-deadline"]');
      var dl = todayGoal && todayGoal.deadline ? todayGoal.deadline : "session";
      for (i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === dl;
      }
    }

    goals.sort(function (a, b) {
      return b.dateKey.localeCompare(a.dateKey);
    });

    listEl.innerHTML = "";
    if (goals.length === 0) {
      var empty = document.createElement("li");
      empty.className = "goal-list__empty";
      empty.textContent = "No goals logged yet—add today’s goal above.";
      listEl.appendChild(empty);
      return;
    }

    for (i = 0; i < goals.length; i++) {
      listEl.appendChild(goalRow(goals[i]));
    }
  }

  function goalRow(g) {
    var li = document.createElement("li");
    li.className = "goal-list__item" + (g.completed ? " goal-list__item--done" : "");
    li.setAttribute("data-goal-id", g.id);

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "goal-list__checkbox";
    cb.checked = !!g.completed;
    cb.setAttribute("aria-labelledby", "goal-label-" + g.id);

    cb.addEventListener("change", function () {
      var goals = load();
      var j;
      for (j = 0; j < goals.length; j++) {
        if (goals[j].id === g.id) {
          goals[j].completed = cb.checked;
          save(goals);
          render();
          return;
        }
      }
    });

    var main = document.createElement("div");
    main.className = "goal-list__main";

    var meta = document.createElement("div");
    meta.className = "goal-list__meta";
    var dateSpan = document.createElement("span");
    dateSpan.className = "goal-list__date";
    dateSpan.textContent = formatWeekdayDate(g.dateKey);
    var badge = document.createElement("span");
    badge.className =
      "goal-list__badge" + (g.deadline === "week" ? " goal-list__badge--week" : " goal-list__badge--session");
    badge.textContent = deadlineLabel(g);
    meta.appendChild(dateSpan);
    meta.appendChild(badge);

    var text = document.createElement("p");
    text.className = "goal-list__text";
    text.id = "goal-label-" + g.id;
    text.textContent = g.text;

    main.appendChild(meta);
    main.appendChild(text);

    li.appendChild(cb);
    li.appendChild(main);
    return li;
  }

  function upsertToday(text, deadline) {
    var goals = load();
    var todayK = getTodayKey();
    var idx = -1;
    var i;
    for (i = 0; i < goals.length; i++) {
      if (goals[i].dateKey === todayK) {
        idx = i;
        break;
      }
    }
    var trimmed = (text || "").trim();
    if (!trimmed) return;

    if (idx >= 0) {
      goals[idx].text = trimmed;
      goals[idx].deadline = deadline === "week" ? "week" : "session";
    } else {
      goals.push({
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
        dateKey: todayK,
        text: trimmed,
        deadline: deadline === "week" ? "week" : "session",
        completed: false,
      });
    }
    save(goals);
  }

  // ── Personalised recommendations from self-assessment ────────────────────────

  var REC_MAP = {
    q1_phone: {
      title: "Put your phone in another room.",
      body:  "Physical distance reduces check-ins far more than willpower."
    },
    q1_browser: {
      title: "Close every tab you don\u2019t need before starting.",
      body:  "Try full-screen mode or a site blocker for the first 25 minutes."
    },
    q1_environment: {
      title: "Signal focus mode to your surroundings.",
      body:  "Headphones or a closed door tells your brain a session is in progress."
    },
    q1_internal: {
      title: "Brain dump before you begin.",
      body:  "Two minutes writing down what\u2019s on your mind clears working memory."
    },
    q1_fatigue: {
      title: "Match hard work to your energy peak.",
      body:  "Your stability curve shows when you drift most \u2014 guard that window."
    },
    q2_early_morning: {
      title: "Skip email and feeds before your first session.",
      body:  "They fragment your best focus window before it starts."
    },
    q2_evening: {
      title: "Use the same desk setup every evening.",
      body:  "Consistent cues speed up the shift into deep focus."
    },
    q3_under_15: {
      title: "Build duration gradually.",
      body:  "Start at 10 minutes and add 5 each week. The curve shows when you\u2019re at your limit."
    },
    q3_15_30: {
      title: "One 25-minute block, then a 5-minute break.",
      body:  "Track your score each session to watch it grow."
    },
    q5_resistant: {
      title: "Commit to just 2 minutes.",
      body:  "Open the work and set a short timer. Resistance almost always fades once you start."
    },
    q6_starting: {
      title: "Decide tomorrow\u2019s first task tonight.",
      body:  "Knowing exactly what to open removes the hesitation that leads to procrastination."
    },
    q6_interruptions: {
      title: "Use a visible focus signal.",
      body:  "Headphones or a status message trains others to respect your session time."
    },
    q6_fatigue: {
      title: "Take real breaks away from screens.",
      body:  "Short off-screen breaks restore capacity faster than passive scrolling."
    },
    q6_balance: {
      title: "One topic per session.",
      body:  "Context-switching costs more than it saves. Log your focus area in the goal field."
    },
    q6_staying: {
      title: "Flag friction the moment you notice it.",
      body:  "Tapping immediately \u2014 not after \u2014 gives the stability curve its most accurate data."
    },
    general: {
      title: "Review your curve weekly, not daily.",
      body:  "Weekly patterns reveal your real focus habits; single sessions vary too much."
    }
  };

  function buildRecommendations(assessment) {
    var recs = [];

    if (!assessment) {
      return [REC_MAP.general];
    }

    // Q1: primary distraction source
    var q1Key = "q1_" + (assessment.q1 || "");
    if (REC_MAP[q1Key]) recs.push(REC_MAP[q1Key]);

    // Q2: peak time (only for early morning or evening — most actionable)
    var q2Key = "q2_" + (assessment.q2 || "");
    if (REC_MAP[q2Key]) recs.push(REC_MAP[q2Key]);

    // Q3: typical session length
    var q3Key = "q3_" + (assessment.q3 || "");
    if (REC_MAP[q3Key] && recs.length < 4) recs.push(REC_MAP[q3Key]);

    // Q5: start feeling
    if (assessment.q5 === "resistant" && recs.length < 4) {
      recs.push(REC_MAP.q5_resistant);
    }

    // Q6: main challenge
    var q6Key = "q6_" + (assessment.q6 || "");
    if (REC_MAP[q6Key] && recs.length < 4) recs.push(REC_MAP[q6Key]);

    // Ensure minimum 3 recs
    while (recs.length < 3) recs.push(REC_MAP.general);

    return recs.slice(0, 4);
  }

  function renderRecommendations() {
    var listEl = document.getElementById("guide-rec-list");
    var hintEl = document.getElementById("guide-rec-hint");
    if (!listEl) return;

    var profile    = window.IntervalProfile ? window.IntervalProfile.get() : null;
    var assessment = profile && profile.assessment ? profile.assessment : null;
    var recs       = buildRecommendations(assessment);

    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    for (var i = 0; i < recs.length; i++) {
      var li      = document.createElement("li");
      var strong  = document.createElement("strong");
      strong.textContent = recs[i].title;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" " + recs[i].body));
      listEl.appendChild(li);
    }

    if (hintEl) {
      hintEl.textContent = assessment
        ? "Personalised from your self-assessment \u2014 retake it in Settings any time."
        : "Complete the self-assessment in onboarding to get personalised recommendations.";
    }
  }

  // ── DOMContentLoaded ──────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("goal-day-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("goal-input");
      var checked = form.querySelector('input[name="goal-deadline"]:checked');
      var deadline = checked && checked.value === "week" ? "week" : "session";
      upsertToday(input ? input.value : "", deadline);
      render();
    });

    render();
    renderRecommendations();
  });
})();
