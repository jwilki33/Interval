/**
 * Live Session — stability curve and session management.
 */
(function () {
  "use strict";

  // ─── Session state ────────────────────────────────────────────────────────────
  var state = "idle"; // "idle" | "running" | "paused"
  var sessionStartTime = null;
  var totalSeconds = 0;
  var timerInterval = null;
  var chartInterval = null;
  var dataPoints = []; // [{elapsed: seconds, norm: 0–1}]

  // ─── Color helpers ────────────────────────────────────────────────────────────
  var COLORS = {
    deep: "#00c853",
    focused: "#ffd600",
    neutral: "#ff9100",
    distracted: "#d50000",
  };

  function colorForNorm(v) {
    v = Math.max(0, Math.min(1, v));
    var stops = [
      { t: 0, c: COLORS.deep },
      { t: 0.33, c: COLORS.focused },
      { t: 0.66, c: COLORS.neutral },
      { t: 1, c: COLORS.distracted },
    ];
    var i;
    for (i = 0; i < stops.length - 1; i++) {
      if (v <= stops[i + 1].t) break;
    }
    var a = stops[i];
    var b = stops[i + 1];
    var u = (v - a.t) / (b.t - a.t || 1);
    return mixHex(a.c, b.c, u);
  }

  function mixHex(a, b, u) {
    var ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
    var rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ra + (rb - ra) * u);
    var g = Math.round(ga + (gb - ga) * u);
    var bl = Math.round(ba + (bb - ba) * u);
    return "#" + [r, g, bl].map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }

  // ─── Focus level (placeholder until screen tracking) ─────────────────────────
  function currentNorm() {
    return 0.1; // Deep focus — replaced by real tracking later
  }

  // ─── Chart constants ──────────────────────────────────────────────────────────
  var W = 600, H = 280;
  var PAD_L = 80, PAD_R = 20, PAD_T = 20, PAD_B = 36;
  var CHART_W = W - PAD_L - PAD_R;
  var CHART_H = H - PAD_T - PAD_B;

  // Expand the visible window in 30-minute steps, minimum 30 minutes.
  function windowSeconds() {
    var thirtyMin = 30 * 60;
    return Math.max(thirtyMin, Math.ceil(totalSeconds / thirtyMin) * thirtyMin);
  }

  function clockLabel(date) {
    var h = date.getHours() % 12 || 12;
    return h + ":" + pad2(date.getMinutes());
  }

  function buildChart(svg) {
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var winSec = windowSeconds();

    // ── Y-axis grid + labels ──────────────────────────────────────────────────
    var labelsY = ["Deep", "Focused", "Neutral", "Distracted"];
    for (var ly = 0; ly < 4; ly++) {
      var yy = PAD_T + (CHART_H * ly) / 3;

      var gt = document.createElementNS(NS, "line");
      gt.setAttribute("x1", PAD_L); gt.setAttribute("y1", yy);
      gt.setAttribute("x2", PAD_L + CHART_W); gt.setAttribute("y2", yy);
      gt.setAttribute("class", "stability-chart__grid" + (ly === 2 ? " stability-chart__grid--mid" : ""));
      svg.appendChild(gt);

      var lbl = document.createElementNS(NS, "text");
      lbl.setAttribute("x", PAD_L - 10);
      lbl.setAttribute("y", yy + 4);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "stability-chart__axis-y");
      lbl.textContent = labelsY[ly];
      svg.appendChild(lbl);
    }

    // ── X-axis labels ─────────────────────────────────────────────────────────
    var xLabels;
    if (sessionStartTime) {
      xLabels = [0, 0.5, 1].map(function (t) {
        var d = new Date(sessionStartTime.getTime() + t * winSec * 1000);
        return { t: t, text: clockLabel(d) };
      });
    } else {
      var halfMin = (winSec / 60) / 2;
      var fullMin = winSec / 60;
      xLabels = [
        { t: 0, text: "0:00" },
        { t: 0.5, text: Math.round(halfMin) + ":00" },
        { t: 1, text: fullMin >= 60 ? Math.round(fullMin / 60) + "h" : Math.round(fullMin) + ":00" },
      ];
    }
    for (var lx = 0; lx < xLabels.length; lx++) {
      var xl = PAD_L + CHART_W * xLabels[lx].t;
      var anchor = lx === 0 ? "start" : lx === xLabels.length - 1 ? "end" : "middle";
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", xl);
      tx.setAttribute("y", H - 10);
      tx.setAttribute("text-anchor", anchor);
      tx.setAttribute("class", "stability-chart__axis-x");
      tx.textContent = xLabels[lx].text;
      svg.appendChild(tx);
    }

    // ── Empty state ───────────────────────────────────────────────────────────
    if (state === "idle") {
      var msg = document.createElementNS(NS, "text");
      msg.setAttribute("x", PAD_L + CHART_W / 2);
      msg.setAttribute("y", PAD_T + CHART_H / 2 + 4);
      msg.setAttribute("text-anchor", "middle");
      msg.setAttribute("class", "stability-chart__empty-msg");
      msg.textContent = "Press Start Session to begin";
      svg.appendChild(msg);
      return;
    }

    if (dataPoints.length < 2) return;

    // ── Curve ─────────────────────────────────────────────────────────────────
    for (var s = 0; s < dataPoints.length - 1; s++) {
      var p0 = dataPoints[s], p1 = dataPoints[s + 1];
      var x0 = PAD_L + CHART_W * Math.min(p0.elapsed / winSec, 1);
      var x1 = PAD_L + CHART_W * Math.min(p1.elapsed / winSec, 1);
      var y0 = PAD_T + p0.norm * CHART_H;
      var y1 = PAD_T + p1.norm * CHART_H;
      var avg = (p0.norm + p1.norm) / 2;

      var seg = document.createElementNS(NS, "line");
      seg.setAttribute("x1", x0.toFixed(2)); seg.setAttribute("y1", y0.toFixed(2));
      seg.setAttribute("x2", x1.toFixed(2)); seg.setAttribute("y2", y1.toFixed(2));
      seg.setAttribute("stroke", colorForNorm(avg));
      seg.setAttribute("stroke-width", "4");
      seg.setAttribute("stroke-linecap", "round");
      svg.appendChild(seg);
    }
  }

  // ─── Timer display ────────────────────────────────────────────────────────────
  function pad2(n) { return ("0" + n).slice(-2); }

  function updateTimerDisplay() {
    var el = document.getElementById("session-timer");
    if (!el) return;
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    el.textContent = pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────
  function pauseIconSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
      + '<rect x="5" y="4" width="5" height="16" rx="1"/>'
      + '<rect x="14" y="4" width="5" height="16" rx="1"/></svg>';
  }

  function playIconSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
      + '<path d="M6 4l14 8-14 8V4z"/></svg>';
  }

  function updateUI() {
    var toggleBtn = document.getElementById("session-toggle-btn");
    var pauseBtn = document.getElementById("session-pause-btn");
    var pillDot = document.querySelector(".pill__dot");

    if (toggleBtn) {
      if (state === "idle") {
        toggleBtn.textContent = "Start Session";
        toggleBtn.classList.remove("btn-primary--end");
      } else {
        toggleBtn.textContent = "End Session";
        toggleBtn.classList.add("btn-primary--end");
      }
    }

    if (pauseBtn) {
      var isIdle = state === "idle";
      pauseBtn.disabled = isIdle;
      pauseBtn.style.opacity = isIdle ? "0.3" : "";
      pauseBtn.style.pointerEvents = isIdle ? "none" : "";
      pauseBtn.innerHTML = state === "paused" ? playIconSvg() : pauseIconSvg();
    }

    if (pillDot) {
      pillDot.classList.toggle("pill__dot--pulse", state === "running");
    }
  }

  function updateDatePill() {
    var el = document.getElementById("today-date-pill");
    if (!el) return;
    var now = new Date();
    var mo = pad2(now.getMonth() + 1);
    var d = pad2(now.getDate());
    var yr = String(now.getFullYear()).slice(-2);
    el.textContent = "Today (" + mo + "." + d + "." + yr + ")";
  }

  // ─── Session controls ─────────────────────────────────────────────────────────
  function startChartAndTimer(svg) {
    timerInterval = setInterval(function () {
      totalSeconds++;
      updateTimerDisplay();
    }, 1000);

    chartInterval = setInterval(function () {
      if (state === "running") {
        dataPoints.push({ elapsed: totalSeconds, norm: currentNorm() });
        buildChart(svg);
      }
    }, 5000);
  }

  function startSession() {
    if (state !== "idle") return;
    state = "running";
    sessionStartTime = new Date();
    totalSeconds = 0;
    dataPoints = [{ elapsed: 0, norm: currentNorm() }];

    updateUI();
    updateTimerDisplay();

    var svg = document.getElementById("stability-chart");
    buildChart(svg);
    startChartAndTimer(svg);
  }

  function endSession() {
    if (state === "idle") return;
    clearInterval(timerInterval);
    clearInterval(chartInterval);
    timerInterval = null;
    chartInterval = null;
    state = "idle";
    totalSeconds = 0;
    sessionStartTime = null;
    dataPoints = [];
    updateUI();
    updateTimerDisplay();
    buildChart(document.getElementById("stability-chart"));
  }

  function togglePause() {
    if (state === "idle") return;
    var svg = document.getElementById("stability-chart");
    if (state === "running") {
      state = "paused";
      clearInterval(timerInterval);
      clearInterval(chartInterval);
      timerInterval = null;
      chartInterval = null;
    } else if (state === "paused") {
      state = "running";
      startChartAndTimer(svg);
    }
    updateUI();
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    updateDatePill();
    updateTimerDisplay();
    updateUI();
    buildChart(document.getElementById("stability-chart"));

    var toggleBtn = document.getElementById("session-toggle-btn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        if (state === "idle") startSession();
        else endSession();
      });
    }

    var pauseBtn = document.getElementById("session-pause-btn");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", togglePause);
    }
  });
})();
