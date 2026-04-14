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
  });
})();
