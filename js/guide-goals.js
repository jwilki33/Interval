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
      title: "Create distance, not just willpower.",
      body:  "Before each session, put your phone face-down in another room. Physical distance reduces check-ins far more effectively than resolve alone."
    },
    q1_browser: {
      title: "Close every tab you don\u2019t need before starting.",
      body:  "Browser drift compounds \u2014 one idle tab leads to another. Try full-screen mode or a site blocker for the first 25 minutes of each session."
    },
    q1_environment: {
      title: "Signal \u2018focus mode\u2019 to your surroundings.",
      body:  "Headphones, a closed door, or a consistent ambient sound tells others \u2014 and your own brain \u2014 that a session is in progress."
    },
    q1_internal: {
      title: "Brain dump before you begin.",
      body:  "Spend 2 minutes writing down anything on your mind before starting. Clearing working memory makes it far easier to stay present."
    },
    q1_fatigue: {
      title: "Match your hardest work to your energy peak.",
      body:  "Your stability curve will show when you drift most. Guard your peak window for the work that demands the most from you."
    },
    q2_early_morning: {
      title: "Protect your mornings ruthlessly.",
      body:  "Avoid checking email or social feeds before your first session. Those inputs fragment your best focus window before it even starts."
    },
    q2_evening: {
      title: "Evening sessions reward a consistent setup.",
      body:  "Dim your space and use the same desk layout each time. Consistent environmental cues speed up the transition into deep focus."
    },
    q3_under_15: {
      title: "Build focus duration gradually, week by week.",
      body:  "Start with 10-minute targets and add 5 minutes each week. The stability curve shows exactly when you\u2019re pushing past your natural limit."
    },
    q3_15_30: {
      title: "The 25-minute block is your starting sweet spot.",
      body:  "A single focused block followed by a 5-minute break matches your current window. Track your score per session to see it grow."
    },
    q5_resistant: {
      title: "Use a 2-minute commitment rule.",
      body:  "When starting feels hard, commit to just opening the work and setting a 2-minute timer. Resistance almost always fades once momentum begins."
    },
    q6_starting: {
      title: "Prepare tomorrow\u2019s first task tonight.",
      body:  "Knowing exactly what to open eliminates the decision paralysis that drives procrastination. Write it in your goal before ending today."
    },
    q6_interruptions: {
      title: "A visible focus signal cuts interruptions significantly.",
      body:  "Headphones, a status message, or a physical do-not-disturb cue reduces interruptions and teaches others your patterns over time."
    },
    q6_fatigue: {
      title: "Protect recovery as seriously as sessions.",
      body:  "Mental fatigue compounds across days. Short real breaks \u2014 away from screens \u2014 between sessions restore capacity faster than passive scrolling."
    },
    q6_balance: {
      title: "One focus area per session.",
      body:  "Context-switching between projects costs more attention than it saves time. Commit each session to a single topic, logged in your goal."
    },
    q6_staying: {
      title: "Use the friction flag the moment you drift.",
      body:  "Tapping the friction button the instant you notice a pull \u2014 not after \u2014 gives the stability curve its most accurate data and trains pattern awareness."
    },
    general: {
      title: "Review your curve weekly, not after every session.",
      body:  "Single sessions vary too much to judge. Weekly patterns in your stability curve reveal the real structure of your focus habits."
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
