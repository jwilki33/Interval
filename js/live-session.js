/**

 * Live Session — stability curve, reflective-mode friction logging, and session management.

 * (Active tracking mode can plug in alternate norm sources later.)

 */

(function () {

  "use strict";



  // ─── Session state ────────────────────────────────────────────────────────────

  var state = "idle"; // "idle" | "running"

  var sessionStartTime = null;

  var totalSeconds = 0;

  var timerInterval = null;

  var chartInterval = null;

  var dataPoints = []; // [{elapsed: seconds, norm: 0–1}]



  /** Reflective focus model: 0 = top of chart (deep), 1 = bottom (distracted). */

  var BASELINE_NORM = 0.12;

  var sessionNorm = BASELINE_NORM;

  /** Per-second drift back toward baseline after a friction spike. */

  var NORM_RECOVERY_RATE = 0.038;



  var FRICTION_SPIKE = {

    phone: 0.93,

    browser: 0.78,

    environment: 0.68,

    heartrate: 0.78,

  };



  var FRICTION_LABEL = {

    phone: "Phone",

    browser: "Browser drift",

    environment: "Environmental distractions",

    heartrate: "Heart rate spike",

  };



  /**
   * Per-type duration options shown in friction dialog step 2.
   * Each entry maps a user-chosen duration label to a proportional norm override.
   * Short distractions cause small curve moves; long ones approach phone-level severity.
   */

  var FRICTION_DURATIONS = {

    phone: [

      { label: "Quick glance",         sublabel: "under 1 min",  norm: 0.72 },

      { label: "Short scroll",         sublabel: "1 \u2013 5 min",   norm: 0.84 },

      { label: "Extended use",         sublabel: "5 \u2013 15 min",  norm: 0.91 },

      { label: "Long detour",          sublabel: "15+ min",      norm: 0.96 },

    ],

    browser: [

      { label: "Tab switch",           sublabel: "under 2 min",  norm: 0.58 },

      { label: "Short browse",         sublabel: "2 \u2013 10 min",  norm: 0.72 },

      { label: "Deep rabbit hole",     sublabel: "10+ min",      norm: 0.84 },

    ],

    environment: [

      { label: "Brief interruption",   sublabel: "under 2 min",  norm: 0.50 },

      { label: "Conversation",         sublabel: "2 \u2013 10 min",  norm: 0.63 },

      { label: "Extended distraction", sublabel: "10+ min",      norm: 0.74 },

    ],

  };



  var pendingFrictionKind = null;



  /** Seconds spent in each band: Deep, Focused, Neutral, Distracted. */

  var bucketSeconds = [0, 0, 0, 0];

  var distractionCount = 0;



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



  function clamp01(x) {

    return Math.max(0, Math.min(1, x));

  }



  function advanceSessionNormOnce() {

    sessionNorm = clamp01(sessionNorm + (BASELINE_NORM - sessionNorm) * NORM_RECOVERY_RATE);

  }



  function normToBand(n) {

    n = clamp01(n);

    if (n < 0.25) return 0;

    if (n < 0.5) return 1;

    if (n < 0.75) return 2;

    return 3;

  }



  function applyFrictionSpike(kind, normOverride) {

    var spike = (normOverride !== undefined) ? normOverride : FRICTION_SPIKE[kind];

    if (spike === undefined) return;

    sessionNorm = clamp01(Math.max(sessionNorm, spike));

  }



  /**
   * Gentle continuous pull toward a target norm — used by heart-rate.js
   * while HR is elevated. Applies a 3% pull per call (called every 5 s),
   * which is subtle enough that normal session recovery can fight it when
   * HR is only mildly elevated, but wins when HR stays high.
   */

  function nudgeNorm(targetNorm) {

    if (state !== "running") return;

    sessionNorm = clamp01(sessionNorm + (targetNorm - sessionNorm) * 0.03);

  }



  // ─── Chart constants ──────────────────────────────────────────────────────────

  var W = 600, H = 280;

  var PAD_L = 72, PAD_R = 20, PAD_T = 20, PAD_B = 36;

  var CHART_W = W - PAD_L - PAD_R;

  var CHART_H = H - PAD_T - PAD_B;



  // Expand the visible window in 30-minute steps, minimum 30 minutes.

  function windowSeconds() {

    var thirtyMin = 30 * 60;

    return Math.max(thirtyMin, Math.ceil(totalSeconds / thirtyMin) * thirtyMin);

  }



  function clockLabel(date) {

    if (document.documentElement.getAttribute("data-clock") === "24") {
      return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    }

    var h = date.getHours() % 12 || 12;

    return h + ":" + pad2(date.getMinutes());

  }



  function pushChartPoint(norm) {

    norm = clamp01(norm);

    var last = dataPoints[dataPoints.length - 1];

    if (last && last.elapsed === totalSeconds) {

      last.norm = norm;

    } else {

      dataPoints.push({ elapsed: totalSeconds, norm: norm });

    }

  }



  function buildChart(svg) {

    if (!svg) return;

    var NS = "http://www.w3.org/2000/svg";

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    while (svg.firstChild) svg.removeChild(svg.firstChild);



    var winSec = windowSeconds();



    // ── Y-axis: separator lines at actual band boundaries, labels at zone centers ─

    // Separators match normToBand() thresholds: 0.25, 0.50, 0.75.
    // Labels sit mid-zone so each word clearly names the region it's inside.

    var BAND_SEP    = [0.25, 0.50, 0.75];
    var BAND_CTR    = [0.125, 0.375, 0.625, 0.875];
    var labelsY     = ["DEEP", "FOCUSED", "NEUTRAL", "DISTRACTED"];

    var bi;

    for (bi = 0; bi < BAND_SEP.length; bi++) {

      var byy = PAD_T + CHART_H * BAND_SEP[bi];

      var bgt = document.createElementNS(NS, "line");

      bgt.setAttribute("x1", PAD_L); bgt.setAttribute("y1", byy.toFixed(1));

      bgt.setAttribute("x2", PAD_L + CHART_W); bgt.setAttribute("y2", byy.toFixed(1));

      bgt.setAttribute("class", "stability-chart__grid" + (bi === 1 ? " stability-chart__grid--mid" : ""));

      svg.appendChild(bgt);

    }

    var li;

    for (li = 0; li < 4; li++) {

      var lyy = PAD_T + CHART_H * BAND_CTR[li];

      var lbl = document.createElementNS(NS, "text");

      lbl.setAttribute("x", PAD_L - 8);

      lbl.setAttribute("y", lyy.toFixed(1));

      lbl.setAttribute("text-anchor", "end");

      lbl.setAttribute("dominant-baseline", "middle");

      lbl.setAttribute("font-size", "8.5");

      lbl.setAttribute("class", "stability-chart__axis-y");

      lbl.textContent = labelsY[li];

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



  function formatDurationHMS(sec) {

    var h = Math.floor(sec / 3600);

    var m = Math.floor((sec % 3600) / 60);

    var s = sec % 60;

    return pad2(h) + ":" + pad2(m) + ":" + pad2(s);

  }



  function formatClockMmSs(sec) {

    if (sec >= 3600) {

      var h = Math.floor(sec / 3600);

      var m = Math.floor((sec % 3600) / 60);

      return h + "h " + m + "m";

    }

    var m = Math.floor(sec / 60);

    var s = sec % 60;

    return m + ":" + pad2(s);

  }



  function updateTimerDisplay() {

    var el = document.getElementById("session-timer");

    if (!el) return;

    el.textContent = formatDurationHMS(totalSeconds);

  }



  function totalTrackedSeconds() {

    return bucketSeconds[0] + bucketSeconds[1] + bucketSeconds[2] + bucketSeconds[3];

  }



  function computeFocusScore() {

    var total = totalTrackedSeconds();

    if (total <= 0) return null;

    var centers = [0.125, 0.375, 0.625, 0.875];

    var weighted = 0;

    var i;

    for (i = 0; i < 4; i++) weighted += bucketSeconds[i] * centers[i];

    var avgNorm = weighted / total;

    return 5 * (1 - avgNorm);

  }



  function updateSessionSummary() {

    var durEl = document.getElementById("summary-duration");

    var scoreEl = document.getElementById("summary-focus-score");

    var distEl = document.getElementById("summary-distractions");

    if (durEl) durEl.textContent = state === "running" ? formatDurationHMS(totalSeconds) : formatDurationHMS(0);

    if (scoreEl) {

      if (state === "running" && totalSeconds > 0) {

        var sc = computeFocusScore();

        scoreEl.textContent = sc !== null ? sc.toFixed(1) + " / 5" : "— / 5";

      } else {

        scoreEl.textContent = "— / 5";

      }

    }

    if (distEl) distEl.textContent = String(distractionCount);

  }



  function updateDistribution() {

    var total = totalTrackedSeconds();

    var ids = [

      { fill: "dist-fill-deep", time: "dist-time-deep" },

      { fill: "dist-fill-focused", time: "dist-time-focused" },

      { fill: "dist-fill-neutral", time: "dist-time-neutral" },

      { fill: "dist-fill-distracted", time: "dist-time-distracted" },

    ];

    var i;

    for (i = 0; i < 4; i++) {

      var pct = total > 0 ? (bucketSeconds[i] / total) * 100 : 0;

      var fel = document.getElementById(ids[i].fill);

      var tel = document.getElementById(ids[i].time);

      if (fel) fel.style.width = pct.toFixed(1) + "%";

      if (tel) tel.textContent = formatClockMmSs(bucketSeconds[i]);

    }

  }



  // ─── Distraction log ─────────────────────────────────────────────────────────

  function clearDistractionLog() {

    var ul = document.getElementById("distraction-log");

    if (!ul) return;

    while (ul.firstChild) ul.removeChild(ul.firstChild);

    var empty = document.createElement("li");

    empty.id = "distraction-log-empty";

    empty.className = "distraction-list__empty";

    empty.textContent = "No distractions logged yet.";

    ul.appendChild(empty);

  }



  function distractionIcon(kind) {

    var NS = "http://www.w3.org/2000/svg";

    var svg = document.createElementNS(NS, "svg");

    svg.setAttribute("class", "distraction-list__icon");

    svg.setAttribute("viewBox", "0 0 24 24");

    svg.setAttribute("fill", "currentColor");

    var p = document.createElementNS(NS, "path");

    if (kind === "phone") {

      p.setAttribute("fill-rule", "evenodd");

      p.setAttribute("d", "M8 2L16 2L18 4L18 20L16 22L8 22L6 20L6 4ZM9 6L15 6L15 17L9 17Z");

    } else if (kind === "browser") {

      p.setAttribute("fill-rule", "evenodd");

      p.setAttribute("d", "M2 3L22 3L22 21L2 21ZM3 4L3 8L21 8L21 4ZM5 11L19 11L19 13L5 13ZM5 15L15 15L15 17L5 17Z");

    } else if (kind === "heartrate") {

      p.setAttribute("d", "M2 11L5 11L6.5 6L9 16L11.5 9L13.5 13L15.5 11L22 11L22 13L15.5 13L13.5 17L11 10L8.5 19L6 9L5 13L2 13Z");

    } else {

      p.setAttribute("fill-rule", "evenodd");

      p.setAttribute("d", "M12 2L20 9L20 14L14 20L12 22L10 20L4 14L4 9ZM10 9L14 9L14 13L10 13Z");

    }

    svg.appendChild(p);

    return svg;

  }



  function appendDistractionEntry(kind) {

    var ul = document.getElementById("distraction-log");

    if (!ul) return;

    var empty = document.getElementById("distraction-log-empty");

    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);



    var li = document.createElement("li");

    li.className = "distraction-list__item";

    li.appendChild(distractionIcon(kind));



    var body = document.createElement("div");

    body.className = "distraction-list__body";

    var lab = document.createElement("span");

    lab.className = "distraction-list__label";

    lab.textContent = FRICTION_LABEL[kind] || kind;

    var tm = document.createElement("span");

    tm.className = "distraction-list__time";

    tm.textContent = "+" + formatClockMmSs(totalSeconds) + " · session";

    body.appendChild(lab);

    body.appendChild(tm);

    li.appendChild(body);

    ul.insertBefore(li, ul.firstChild);

  }



  // ─── UI helpers ───────────────────────────────────────────────────────────────

  function updateUI() {

    var toggleBtn = document.getElementById("session-toggle-btn");

    var pillDot = document.querySelector(".pill__dot");

    var frictionBtn = document.getElementById("friction-flag-btn");



    if (toggleBtn) {

      if (state === "idle") {

        toggleBtn.textContent = "Start Session";

        toggleBtn.classList.remove("btn-primary--end");

      } else {

        toggleBtn.textContent = "End Session";

        toggleBtn.classList.add("btn-primary--end");

      }

    }



    if (pillDot) {

      pillDot.classList.toggle("pill__dot--pulse", state === "running");

    }



    if (frictionBtn) {

      frictionBtn.disabled = state !== "running";

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

      if (state === "running") {

        advanceSessionNormOnce();

        bucketSeconds[normToBand(sessionNorm)] += 1;

        updateSessionSummary();

        updateDistribution();

      }

      updateTimerDisplay();

    }, 1000);



    chartInterval = setInterval(function () {

      if (state === "running") {

        pushChartPoint(sessionNorm);

        buildChart(svg);

      }

    }, 5000);

  }



  function startSession() {

    if (state !== "idle") return;

    state = "running";

    sessionStartTime = new Date();

    totalSeconds = 0;

    sessionNorm = BASELINE_NORM;

    bucketSeconds = [0, 0, 0, 0];

    distractionCount = 0;

    dataPoints = [];

    pushChartPoint(BASELINE_NORM);

    clearDistractionLog();



    updateUI();

    updateTimerDisplay();

    updateSessionSummary();

    updateDistribution();



    var svg = document.getElementById("stability-chart");

    buildChart(svg);

    startChartAndTimer(svg);

    document.dispatchEvent(new CustomEvent("interval-session-start"));

  }



  function dateKeyFromDate(d) {

    if (!d) return "";

    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());

  }



  function formatStartHm(d) {

    if (!d) return "09:00";

    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());

  }



  function endSession() {

    if (state === "idle") return;

    var endedDur    = totalSeconds;

    var endedStart  = sessionStartTime;

    var endedFocus  = computeFocusScore();

    var endedDist   = distractionCount;

    var endedBuckets = bucketSeconds;



    clearInterval(timerInterval);

    clearInterval(chartInterval);

    timerInterval = null;

    chartInterval = null;

    var curveSnapshot = [];

    var i;

    for (i = 0; i < dataPoints.length; i++) {

      curveSnapshot.push({ elapsed: dataPoints[i].elapsed, norm: dataPoints[i].norm });

    }

    if (curveSnapshot.length === 1 && endedDur > 0) {

      curveSnapshot.push({ elapsed: endedDur, norm: curveSnapshot[0].norm });

    }

    state = "idle";

    totalSeconds = 0;

    sessionStartTime = null;

    sessionNorm = BASELINE_NORM;

    dataPoints = [];

    bucketSeconds = [0, 0, 0, 0];

    distractionCount = 0;



    if (

      window.IntervalSessionCalendar &&

      typeof window.IntervalSessionCalendar.recordSession === "function" &&

      endedDur > 0 &&

      endedStart

    ) {

      var fs = endedFocus;

      if (fs === null) fs = 0;

      var payload = {

        dateKey: dateKeyFromDate(endedStart),

        start: formatStartHm(endedStart),

        duration: endedDur,

        focusScore: fs,

        distractions: endedDist,

      };

      if (curveSnapshot.length >= 2) {

        payload.curve = curveSnapshot;

      }

      window.IntervalSessionCalendar.recordSession(payload);

    }



    document.dispatchEvent(new CustomEvent("interval-session-end"));

    updateUI();

    updateTimerDisplay();

    updateSessionSummary();

    updateDistribution();

    clearDistractionLog();

    buildChart(document.getElementById("stability-chart"));

    if (endedDur > 0) {

      showSessionSummary({

        duration:     endedDur,

        focusScore:   endedFocus,

        distractions: endedDist,

        buckets:      endedBuckets,

        startDate:    endedStart,

      });

    }

  }



  function openFrictionDialog() {

    showFrictionStep1();

    var dlg = document.getElementById("friction-dialog");

    if (dlg && typeof dlg.showModal === "function") dlg.showModal();

  }



  function closeFrictionDialog() {

    pendingFrictionKind = null;

    var dlg = document.getElementById("friction-dialog");

    if (dlg && typeof dlg.close === "function") dlg.close();

  }



  function showFrictionStep1() {

    pendingFrictionKind = null;

    var s1 = document.getElementById("friction-step-1");

    var s2 = document.getElementById("friction-step-2");

    if (s1) s1.removeAttribute("hidden");

    if (s2) s2.setAttribute("hidden", "");

  }



  function showFrictionStep2(kind) {

    var durations = FRICTION_DURATIONS[kind];

    if (!durations) {

      recordFriction(kind);

      closeFrictionDialog();

      return;

    }



    var container = document.getElementById("friction-duration-options");

    if (container) {

      while (container.firstChild) container.removeChild(container.firstChild);

      var i;

      for (i = 0; i < durations.length; i++) {

        var opt = durations[i];

        var btn = document.createElement("button");

        btn.type = "button";

        btn.className = "friction-duration-btn";

        btn.setAttribute("data-friction-norm", String(opt.norm));



        var lbl = document.createElement("span");

        lbl.className = "friction-duration-btn__label";

        lbl.textContent = opt.label;



        var sub = document.createElement("span");

        sub.className = "friction-duration-btn__sub";

        sub.textContent = opt.sublabel;



        btn.appendChild(lbl);

        btn.appendChild(sub);

        container.appendChild(btn);

      }

    }



    var s1 = document.getElementById("friction-step-1");

    var s2 = document.getElementById("friction-step-2");

    if (s1) s1.setAttribute("hidden", "");

    if (s2) s2.removeAttribute("hidden");

  }



  // ─── Session summary modal ─────────────────────────────────────────────────────



  function formatSessionDate(d) {

    if (!d) return "";

    var days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    var months = ["January","February","March","April","May","June","July",

                  "August","September","October","November","December"];

    return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();

  }



  function focusScoreColor(score) {

    if (score >= 4.0) return "var(--deep)";

    if (score >= 3.0) return "var(--focused)";

    if (score >= 2.0) return "var(--neutral)";

    return "var(--distracted)";

  }



  function showSessionSummary(data) {

    var dlg = document.getElementById("session-summary-dialog");

    if (!dlg || typeof dlg.showModal !== "function") return;



    var dateEl  = document.getElementById("summary-modal-date");

    var scoreEl = document.getElementById("summary-modal-score");

    var durEl   = document.getElementById("summary-modal-duration");

    var distEl  = document.getElementById("summary-modal-distractions");



    if (dateEl) dateEl.textContent = formatSessionDate(data.startDate);

    if (durEl)  durEl.textContent  = formatDurationHMS(data.duration);

    if (distEl) distEl.textContent = String(data.distractions);



    if (scoreEl) {

      var fs = data.focusScore;

      if (fs !== null && data.duration > 0) {

        scoreEl.textContent  = fs.toFixed(1) + " / 5";

        scoreEl.style.color  = focusScoreColor(fs);

      } else {

        scoreEl.textContent = "\u2014 / 5";

        scoreEl.style.color = "";

      }

    }



    var distContainer = document.getElementById("summary-modal-distribution");

    if (distContainer) {

      while (distContainer.firstChild) distContainer.removeChild(distContainer.firstChild);

      var buckets = data.buckets || [0, 0, 0, 0];

      var total   = buckets[0] + buckets[1] + buckets[2] + buckets[3];

      var bands   = [

        { label: "Deep",       color: "var(--deep)",       idx: 0 },

        { label: "Focused",    color: "var(--focused)",    idx: 1 },

        { label: "Neutral",    color: "var(--neutral)",    idx: 2 },

        { label: "Distracted", color: "var(--distracted)", idx: 3 },

      ];

      var bi;

      for (bi = 0; bi < bands.length; bi++) {

        var band = bands[bi];

        var sec  = buckets[band.idx];

        var pct  = total > 0 ? (sec / total) * 100 : 0;



        var row = document.createElement("div");

        row.className = "summary-dist__row";



        var labelEl = document.createElement("span");

        labelEl.className   = "summary-dist__label";

        labelEl.textContent = band.label;



        var track = document.createElement("div");

        track.className = "summary-dist__track";



        var fill = document.createElement("div");

        fill.className        = "summary-dist__fill";

        fill.style.width      = pct.toFixed(1) + "%";

        fill.style.background = band.color;



        var timeEl = document.createElement("span");

        timeEl.className   = "summary-dist__time";

        timeEl.textContent = formatClockMmSs(sec);



        track.appendChild(fill);

        row.appendChild(labelEl);

        row.appendChild(track);

        row.appendChild(timeEl);

        distContainer.appendChild(row);

      }

    }



    dlg.showModal();

  }



  function isActiveMode() {
    return document.documentElement.getAttribute("data-tracking-mode") === "active";
  }

  function recordFriction(kind, normOverride) {

    if (state !== "running") return;

    if (!(kind in FRICTION_SPIKE)) return;



    applyFrictionSpike(kind, normOverride);

    distractionCount += 1;

    pushChartPoint(sessionNorm);

    if (!isActiveMode()) {
      appendDistractionEntry(kind);
    }

    buildChart(document.getElementById("stability-chart"));

    updateSessionSummary();



    if (window.IntervalTracking && typeof window.IntervalTracking.log === "function") {

      window.IntervalTracking.log("friction_reflective", {

        kind: kind,

        sessionElapsedSec: totalSeconds,

        norm: sessionNorm,

      });

    }

  }



  // ─── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {

    updateDatePill();

    updateTimerDisplay();

    updateSessionSummary();

    updateDistribution();

    updateUI();

    buildChart(document.getElementById("stability-chart"));



    var toggleBtn = document.getElementById("session-toggle-btn");

    if (toggleBtn) {

      toggleBtn.addEventListener("click", function () {

        if (state === "idle") startSession();

        else endSession();

      });

    }



    var frictionBtn = document.getElementById("friction-flag-btn");

    if (frictionBtn) {

      frictionBtn.addEventListener("click", function () {

        if (state === "running") openFrictionDialog();

      });

    }



    var dlg = document.getElementById("friction-dialog");

    if (dlg) {

      // Step 1: choosing the friction type advances to step 2

      dlg.querySelectorAll("[data-friction-kind]").forEach(function (btn) {

        btn.addEventListener("click", function () {

          pendingFrictionKind = btn.getAttribute("data-friction-kind");

          showFrictionStep2(pendingFrictionKind);

        });

      });



      // Step 2: duration selection (event delegation on the container)

      var durationContainer = document.getElementById("friction-duration-options");

      if (durationContainer) {

        durationContainer.addEventListener("click", function (e) {

          var target = e.target;

          while (target && target !== durationContainer) {

            if (target.hasAttribute("data-friction-norm")) break;

            target = target.parentNode;

          }

          if (!target || !target.hasAttribute("data-friction-norm")) return;

          var norm = parseFloat(target.getAttribute("data-friction-norm"));

          if (pendingFrictionKind) recordFriction(pendingFrictionKind, norm);

          closeFrictionDialog();

        });

      }



      var backBtn = document.getElementById("friction-dialog-back");

      if (backBtn) backBtn.addEventListener("click", showFrictionStep1);



      var cancel = document.getElementById("friction-dialog-cancel");

      if (cancel) cancel.addEventListener("click", closeFrictionDialog);

    }



    // Session summary: done button dismisses the modal

    var summaryDone = document.getElementById("session-summary-done");

    if (summaryDone) {

      summaryDone.addEventListener("click", function () {

        var summaryDlg = document.getElementById("session-summary-dialog");

        if (summaryDlg && typeof summaryDlg.close === "function") summaryDlg.close();

      });

    }

  });

  // Public API for external modules (e.g. heart-rate.js)

  window.IntervalSession = {

    recordFriction: function (kind, normOverride) { recordFriction(kind, normOverride); },

    nudgeNorm: function (targetNorm) { nudgeNorm(targetNorm); },

    getState: function () { return state; },

    getSessionStartTime: function () { return sessionStartTime; },

  };

})();


