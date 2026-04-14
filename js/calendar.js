/**
 * Calendar — session history with month / week / day views.
 * Color coding mirrors the Stability Curve focus scale.
 */
(function () {
  "use strict";

  // ─── Demo session data ────────────────────────────────────────────────────────
  // focusScore: 0–5  (higher = better focus)
  // duration: seconds
  var DEMO_SESSIONS = {
    "2026-03-03": { start: "09:30", duration: 3600, focusScore: 4.3, distractions: 1 },
    "2026-03-06": { start: "10:00", duration: 2700, focusScore: 2.1, distractions: 6 },
    "2026-03-10": { start: "09:15", duration: 4800, focusScore: 4.7, distractions: 0 },
    "2026-03-13": { start: "13:30", duration: 1800, focusScore: 1.2, distractions: 9 },
    "2026-03-17": { start: "09:00", duration: 3300, focusScore: 3.8, distractions: 2 },
    "2026-03-20": { start: "11:00", duration: 2400, focusScore: 3.0, distractions: 3 },
    "2026-03-24": { start: "09:45", duration: 3900, focusScore: 4.5, distractions: 1 },
    "2026-03-27": { start: "10:30", duration: 2100, focusScore: 2.6, distractions: 5 },
    "2026-04-01": { start: "09:00", duration: 3180, focusScore: 4.1, distractions: 1 },
    "2026-04-02": { start: "10:15", duration: 2520, focusScore: 2.3, distractions: 5 },
    "2026-04-03": { start: "09:30", duration: 4200, focusScore: 4.6, distractions: 0 },
    "2026-04-06": { start: "13:00", duration: 1800, focusScore: 1.8, distractions: 7 },
    "2026-04-07": { start: "09:00", duration: 3600, focusScore: 3.5, distractions: 2 },
    "2026-04-08": { start: "10:30", duration: 2700, focusScore: 3.1, distractions: 3 },
    "2026-04-09": { start: "09:15", duration: 4500, focusScore: 4.8, distractions: 0 },
    "2026-04-10": { start: "09:45", duration: 3300, focusScore: 3.9, distractions: 1 },
    "2026-04-13": { start: "10:00", duration: 1200, focusScore: 2.8, distractions: 4 },
  };

  var SESSIONS = {};

  // ─── State ────────────────────────────────────────────────────────────────────
  var view = "month";
  var cursor = new Date(2026, 3, 1); // April 2026
  var selectedDate = null;

  // ─── Constants ────────────────────────────────────────────────────────────────
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  var DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function weekStartsSunday() {
    if (window.IntervalAppSettings && typeof window.IntervalAppSettings.getWeekStartsSunday === "function") {
      return window.IntervalAppSettings.getWeekStartsSunday();
    }
    return document.documentElement.getAttribute("data-week-start") === "sunday";
  }

  function dayLabelsShort() {
    return weekStartsSunday()
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }

  // ─── Color helpers ────────────────────────────────────────────────────────────
  // Focus score 0–5 maps to: distracted (red) → neutral (orange) → focused (yellow) → deep (green)
  function scoreToColor(score) {
    var s = Math.max(0, Math.min(5, score));
    if (s >= 3.75) return "#00c853";
    if (s >= 2.5)  return "#ffd600";
    if (s >= 1.25) return "#ff9100";
    return "#d50000";
  }

  function scoreToRgba(score, alpha) {
    var hex = scoreToColor(score);
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function focusLabel(score) {
    if (score >= 3.75) return "Deep";
    if (score >= 2.5)  return "Focused";
    if (score >= 1.25) return "Neutral";
    return "Distracted";
  }

  // ─── Focus breakdown (approximate from score) ─────────────────────────────────
  function computeBreakdown(score) {
    var bp = [
      { score: 0,    deep: 0,  focused: 0,  neutral: 10, distracted: 90 },
      { score: 1.25, deep: 0,  focused: 5,  neutral: 30, distracted: 65 },
      { score: 2.5,  deep: 5,  focused: 30, neutral: 45, distracted: 20 },
      { score: 3.75, deep: 40, focused: 40, neutral: 15, distracted: 5  },
      { score: 5,    deep: 80, focused: 15, neutral: 5,  distracted: 0  },
    ];
    var s = Math.max(0, Math.min(5, score));
    var i = 0;
    while (i < bp.length - 1 && s > bp[i + 1].score) i++;
    if (i >= bp.length - 1) return bp[bp.length - 1];
    var a = bp[i], b = bp[i + 1];
    var t = (s - a.score) / (b.score - a.score);
    return {
      deep:        Math.round(a.deep        + (b.deep        - a.deep)        * t),
      focused:     Math.round(a.focused     + (b.focused     - a.focused)     * t),
      neutral:     Math.round(a.neutral     + (b.neutral     - a.neutral)     * t),
      distracted:  Math.round(a.distracted  + (b.distracted  - a.distracted)  * t),
    };
  }

  // ─── Formatting ───────────────────────────────────────────────────────────────
  function pad2(n) { return ("0" + n).slice(-2); }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatDuration(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return h + "h " + m + "m";
    if (h > 0) return h + "h";
    return m + "m";
  }

  function use24hClock() {
    if (window.IntervalAppSettings && typeof window.IntervalAppSettings.use24hClock === "function") {
      return window.IntervalAppSettings.use24hClock();
    }
    return document.documentElement.getAttribute("data-clock") === "24";
  }

  function formatStart(timeStr) {
    if (use24hClock()) {
      return timeStr;
    }
    var parts = timeStr.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ampm;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function getWeekStart(d) {
    var ws = new Date(d);
    var day = ws.getDay(); // 0 = Sunday
    if (weekStartsSunday()) {
      ws.setDate(ws.getDate() - day);
    } else {
      var diff = day === 0 ? -6 : 1 - day;
      ws.setDate(ws.getDate() + diff);
    }
    ws.setHours(0, 0, 0, 0);
    return ws;
  }

  // ─── Sessions in current view ─────────────────────────────────────────────────
  function getVisibleKeys() {
    var keys = [];
    if (view === "month") {
      var y = cursor.getFullYear(), mo = cursor.getMonth();
      var days = new Date(y, mo + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        var k = dateKey(new Date(y, mo, d));
        if (SESSIONS[k]) keys.push(k);
      }
    } else if (view === "week") {
      var ws = getWeekStart(cursor);
      for (var i = 0; i < 7; i++) {
        var day = new Date(ws);
        day.setDate(day.getDate() + i);
        var k = dateKey(day);
        if (SESSIONS[k]) keys.push(k);
      }
    } else {
      var k = dateKey(cursor);
      if (SESSIONS[k]) keys.push(k);
    }
    return keys;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  function updateSummary() {
    var el = document.getElementById("cal-summary-stats");
    if (!el) return;
    var keys = getVisibleKeys();

    if (keys.length === 0) {
      el.innerHTML = '<p class="cal-summary__empty">No sessions in this period</p>';
      return;
    }

    var totalSec = 0, totalScore = 0, bestKey = null, bestScore = -1, totalDistractions = 0;
    keys.forEach(function (k) {
      var s = SESSIONS[k];
      totalSec += s.duration;
      totalScore += s.focusScore;
      totalDistractions += s.distractions;
      if (s.focusScore > bestScore) { bestScore = s.focusScore; bestKey = k; }
    });

    var avg = totalScore / keys.length;
    var bestDate = bestKey ? new Date(bestKey + "T00:00:00") : null;
    var bestLabel = bestDate
      ? MONTHS[bestDate.getMonth()].slice(0, 3) + " " + bestDate.getDate()
      : "—";

    el.innerHTML =
      stat(keys.length, "Sessions") +
      stat(formatDuration(totalSec), "Total time") +
      stat(avg.toFixed(1) + " / 5", "Avg focus") +
      stat(bestLabel, "Best day");
  }

  function stat(value, label) {
    return '<div class="cal-stat">'
      + '<span class="cal-stat__value">' + value + "</span>"
      + '<span class="cal-stat__label">' + label + "</span>"
      + "</div>";
  }

  // ─── Nav label ────────────────────────────────────────────────────────────────
  function updateNavLabel() {
    var el = document.getElementById("cal-nav-label");
    if (!el) return;
    if (view === "month") {
      el.textContent = MONTHS[cursor.getMonth()] + " " + cursor.getFullYear();
    } else if (view === "week") {
      var ws = getWeekStart(cursor);
      var we = new Date(ws);
      we.setDate(we.getDate() + 6);
      var sameMonth = ws.getMonth() === we.getMonth();
      el.textContent = MONTHS[ws.getMonth()].slice(0, 3) + " " + ws.getDate()
        + " – " + (sameMonth ? "" : MONTHS[we.getMonth()].slice(0, 3) + " ")
        + we.getDate();
    } else {
      el.textContent = MONTHS[cursor.getMonth()].slice(0, 3) + " "
        + cursor.getDate() + ", " + cursor.getFullYear();
    }
  }

  // ─── Month view ───────────────────────────────────────────────────────────────
  function renderMonth() {
    var y = cursor.getFullYear(), mo = cursor.getMonth();
    var firstDow = new Date(y, mo, 1).getDay(); // 0=Sun
    var startOffset = weekStartsSunday()
      ? firstDow
      : (firstDow === 0 ? 6 : firstDow - 1);
    var labels = dayLabelsShort();
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var daysInPrev  = new Date(y, mo, 0).getDate();
    var todayKey    = dateKey(new Date());
    var selectedKey = selectedDate ? dateKey(selectedDate) : null;
    var totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var html = '<div class="cal-month"><div class="cal-month__weekdays">';
    labels.forEach(function (d) {
      html += '<div class="cal-month__weekday">' + d + "</div>";
    });
    html += '</div><div class="cal-month__grid" id="cal-month-grid">';

    for (var i = 0; i < totalCells; i++) {
      var dayNum, isCurrentMonth = true;
      var cellDate;
      if (i < startOffset) {
        dayNum = daysInPrev - startOffset + 1 + i;
        cellDate = new Date(y, mo - 1, dayNum);
        isCurrentMonth = false;
      } else if (i >= startOffset + daysInMonth) {
        dayNum = i - startOffset - daysInMonth + 1;
        cellDate = new Date(y, mo + 1, dayNum);
        isCurrentMonth = false;
      } else {
        dayNum = i - startOffset + 1;
        cellDate = new Date(y, mo, dayNum);
      }

      var cellKey = dateKey(cellDate);
      var session = isCurrentMonth ? SESSIONS[cellKey] : null;
      var isToday    = cellKey === todayKey;
      var isSelected = cellKey === selectedKey;

      var cls = "cal-day";
      if (!isCurrentMonth) cls += " cal-day--other";
      if (isToday)         cls += " cal-day--today";
      if (isSelected)      cls += " cal-day--selected";
      if (session)         cls += " cal-day--has-session";

      var style = "";
      if (session) {
        style = ' style="background:' + scoreToRgba(session.focusScore, 0.1)
              + ";border-color:" + scoreToRgba(session.focusScore, 0.3) + '"';
      }

      html += '<div class="' + cls + '"' + style + ' data-date="' + cellKey + '">';
      html += '<span class="cal-day__num">' + dayNum + "</span>";
      if (session) {
        html += '<div class="cal-day__session-bar" style="background:'
              + scoreToColor(session.focusScore) + '"></div>';
        html += '<span class="cal-day__time">' + formatDuration(session.duration) + "</span>";
      }
      html += "</div>";
    }

    html += "</div></div>";
    return html;
  }

  // ─── Week view ────────────────────────────────────────────────────────────────
  function renderWeek() {
    var ws = getWeekStart(cursor);
    var todayKey = dateKey(new Date());
    var selectedKey = selectedDate ? dateKey(selectedDate) : null;
    var wdayLabels = dayLabelsShort();
    var html = '<div class="cal-week">';

    for (var i = 0; i < 7; i++) {
      var d = new Date(ws);
      d.setDate(d.getDate() + i);
      var k = dateKey(d);
      var session   = SESSIONS[k];
      var isToday   = k === todayKey;
      var isSelected = k === selectedKey;

      var cls = "cal-week__col";
      if (isToday)   cls += " cal-week__col--today";
      if (isSelected) cls += " cal-week__col--selected";

      html += '<div class="' + cls + '" data-date="' + k + '">';
      html += '<div class="cal-week__day-label">';
      html += '<span class="cal-week__day-name">' + wdayLabels[i] + "</span>";
      html += '<span class="cal-week__day-num">' + d.getDate() + "</span>";
      html += "</div>";

      if (session) {
        var color = scoreToColor(session.focusScore);
        html += '<div class="cal-week__session" style="background:'
              + scoreToRgba(session.focusScore, 0.1)
              + ";border-color:" + scoreToRgba(session.focusScore, 0.3) + '">';
        html += '<div class="cal-week__session-bar" style="background:' + color + '"></div>';
        html += '<div class="cal-week__session-info">';
        html += '<span class="cal-week__session-score" style="color:' + color + '">'
              + session.focusScore.toFixed(1) + "</span>";
        html += '<span class="cal-week__session-label">' + focusLabel(session.focusScore) + "</span>";
        html += '<span class="cal-week__session-dur">' + formatDuration(session.duration) + "</span>";
        html += "</div></div>";
      } else {
        html += '<div class="cal-week__empty">—</div>';
      }
      html += "</div>";
    }

    html += "</div>";
    return html;
  }

  // ─── Day view ─────────────────────────────────────────────────────────────────
  function renderDay() {
    var k = dateKey(cursor);
    var session = SESSIONS[k];
    var isToday = k === dateKey(new Date());

    var html = '<div class="cal-day-view">';
    html += '<div class="cal-day-view__header">';
    html += '<span class="cal-day-view__date-label">'
          + DAYS_LONG[cursor.getDay()] + ", " + MONTHS[cursor.getMonth()] + " " + cursor.getDate()
          + "</span>";
    if (isToday) html += '<span class="cal-day-view__today-badge">Today</span>';
    html += "</div>";

    if (session) {
      var TIMELINE_HOURS = 6;
      var startParts = session.start.split(":");
      var startHour  = parseInt(startParts[0], 10) + parseInt(startParts[1], 10) / 60;
      var durH       = session.duration / 3600;
      var endHour    = startHour + durH;

      var HOUR_START;
      var HOUR_END;
      var SPAN = TIMELINE_HOURS;
      if (durH >= TIMELINE_HOURS) {
        HOUR_START = Math.floor(startHour);
        if (HOUR_START + TIMELINE_HOURS > 24) HOUR_START = 24 - TIMELINE_HOURS;
        HOUR_END = HOUR_START + TIMELINE_HOURS;
      } else {
        var mid = (startHour + endHour) / 2;
        HOUR_START = Math.round(mid - TIMELINE_HOURS / 2);
        if (HOUR_START < 0) HOUR_START = 0;
        if (HOUR_START + TIMELINE_HOURS > 24) HOUR_START = 24 - TIMELINE_HOURS;
        HOUR_END = HOUR_START + TIMELINE_HOURS;
      }

      var topPct    = (((startHour - HOUR_START) / SPAN) * 100).toFixed(2);
      var heightPct = ((durH / SPAN) * 100).toFixed(2);

      html += '<div class="cal-timeline">';
      for (var h = HOUR_START; h <= HOUR_END; h++) {
        var yPct = (((h - HOUR_START) / SPAN) * 100).toFixed(2);
        var hourLabel;
        if (use24hClock()) {
          hourLabel = pad2(h) + ":00";
        } else {
          var ampm = h < 12 ? "AM" : "PM";
          var h12 = h % 12 || 12;
          hourLabel = h12 + ":00 " + ampm;
        }
        html += '<div class="cal-timeline__hour" style="top:' + yPct + '%">';
        html += '<span class="cal-timeline__hour-label">' + hourLabel + "</span>";
        html += '<div class="cal-timeline__hour-line"></div>';
        html += "</div>";
      }

      var color = scoreToColor(session.focusScore);
      html += '<div class="cal-timeline__session" data-date="' + k + '" style="'
            + "top:" + topPct + "%;height:" + heightPct + "%;"
            + "background:" + scoreToRgba(session.focusScore, 0.14) + ";"
            + "border-left:3px solid " + color + '">';
      html += '<span class="cal-timeline__session-label" style="color:' + color + '">'
            + focusLabel(session.focusScore) + "</span>";
      html += '<span class="cal-timeline__session-time">'
            + formatStart(session.start) + " · " + formatDuration(session.duration)
            + "</span>";
      html += "</div></div>";
    } else {
      html += '<div class="cal-day-view__empty">No session recorded for this day</div>';
    }

    html += "</div>";
    return html;
  }

  // ─── Session detail panel ─────────────────────────────────────────────────────
  function renderDetail(key) {
    var el = document.getElementById("cal-detail-content");
    if (!el) return;

    if (!key || !SESSIONS[key]) {
      el.innerHTML = '<div class="cal-detail-empty"><span>Select a session<br>to view details</span></div>';
      return;
    }

    var s     = SESSIONS[key];
    var d     = new Date(key + "T00:00:00");
    var color = scoreToColor(s.focusScore);
    var label = focusLabel(s.focusScore);
    var bd    = computeBreakdown(s.focusScore);

    function minFromPct(pct) {
      return Math.round(pct / 100 * s.duration / 60) + "m";
    }

    el.innerHTML =
      '<div class="cal-detail">'
      + '<div class="cal-detail__date">'
        + DAYS_LONG[d.getDay()] + ", "
        + MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate() + " " + d.getFullYear()
      + "</div>"

      + '<div class="cal-detail__score-row">'
        + '<span class="cal-detail__score" style="color:' + color + '">' + s.focusScore.toFixed(1) + "</span>"
        + '<span class="cal-detail__score-max">/ 5</span>'
        + '<span class="cal-detail__score-label" style="color:' + color + '">' + label + "</span>"
      + "</div>"

      + '<div class="cal-detail__stats">'
        + detailRow("Duration", formatDuration(s.duration))
        + detailRow("Started",  formatStart(s.start))
        + detailRow("Distractions", s.distractions)
      + "</div>"

      + '<div class="cal-detail__dist">'
        + '<span class="cal-detail__dist-title">Focus breakdown</span>'
        + distBar("Deep",        "#00c853", bd.deep,        minFromPct(bd.deep))
        + distBar("Focused",     "#ffd600", bd.focused,     minFromPct(bd.focused))
        + distBar("Neutral",     "#ff9100", bd.neutral,     minFromPct(bd.neutral))
        + distBar("Distracted",  "#d50000", bd.distracted,  minFromPct(bd.distracted))
      + "</div>"
      + "</div>";
  }

  function detailRow(label, value) {
    return '<div class="cal-detail__stat-row">'
      + '<span class="cal-detail__stat-label">' + label + "</span>"
      + '<span class="cal-detail__stat-value">' + value + "</span>"
      + "</div>";
  }

  function distBar(label, color, pct, timeLabel) {
    return '<div class="cal-detail__dist-row">'
      + '<span class="cal-detail__dist-label">' + label + "</span>"
      + '<div class="cal-detail__dist-track">'
      + '<div class="cal-detail__dist-fill" style="width:' + pct + "%;background:" + color + '"></div>'
      + "</div>"
      + "</div>";
  }

  // ─── Main render ──────────────────────────────────────────────────────────────
  function render() {
    var el = document.getElementById("cal-main-content");
    if (!el) return;

    if (view === "month")      el.innerHTML = renderMonth();
    else if (view === "week")  el.innerHTML = renderWeek();
    else                       el.innerHTML = renderDay();

    // For month view, set equal-height grid rows dynamically
    if (view === "month") {
      var grid = document.getElementById("cal-month-grid");
      if (grid) {
        var rows = grid.children.length / 7;
        grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
      }
    }

    // Auto-select day in day view
    if (view === "day") {
      var k = dateKey(cursor);
      selectedDate = new Date(cursor);
      renderDetail(SESSIONS[k] ? k : null);
    }

    updateNavLabel();
    updateSummary();
    attachClickHandlers();
  }

  function attachClickHandlers() {
    var cells = document.querySelectorAll("[data-date]");
    cells.forEach(function (cell) {
      cell.addEventListener("click", function () {
        var k = this.getAttribute("data-date");
        if (!SESSIONS[k]) return;
        selectedDate = new Date(k + "T00:00:00");
        render();
        renderDetail(k);
      });
    });
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────
  function navigate(dir) {
    if (view === "month") {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    } else if (view === "week") {
      cursor.setDate(cursor.getDate() + dir * 7);
    } else {
      cursor.setDate(cursor.getDate() + dir);
    }
    render();
  }

  // ─── Date pill ────────────────────────────────────────────────────────────────
  function updateDatePill() {
    var el = document.getElementById("today-date-pill");
    if (!el) return;
    var now = new Date();
    el.textContent = "Today ("
      + pad2(now.getMonth() + 1) + "."
      + pad2(now.getDate()) + "."
      + String(now.getFullYear()).slice(-2) + ")";
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    if (window.IntervalSessionCalendar && typeof window.IntervalSessionCalendar.getMergedSessions === "function") {
      SESSIONS = window.IntervalSessionCalendar.getMergedSessions(DEMO_SESSIONS);
    } else {
      SESSIONS = DEMO_SESSIONS;
    }
    updateDatePill();
    render();

    document.querySelectorAll(".cal-filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        view = this.getAttribute("data-view");
        document.querySelectorAll(".cal-filter-btn").forEach(function (b) {
          b.classList.remove("cal-filter-btn--active");
        });
        this.classList.add("cal-filter-btn--active");
        selectedDate = null;
        renderDetail(null);
        render();
      });
    });

    document.getElementById("cal-prev").addEventListener("click", function () { navigate(-1); });
    document.getElementById("cal-next").addEventListener("click", function () { navigate(1); });

    window.addEventListener("interval-settings-change", function () {
      render();
      if (selectedDate) {
        var k = dateKey(selectedDate);
        renderDetail(SESSIONS[k] ? k : null);
      }
    });
  });
})();
