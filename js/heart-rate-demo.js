/**
 * Heart Rate Demo — simulated BPM feed for presentation purposes.
 *
 * Adds a "Simulate HR (Demo)" button inside the Active-mode HR panel.
 * When activated it feeds a scripted 15-minute BPM profile through the
 * same spike-detection logic and display elements used by heart-rate.js,
 * producing a realistic session recording without any physical hardware.
 *
 * Timeline (900 s):
 *   0 – 120 s   Warmup / baseline build  (~68-72 bpm, calm)
 * 120 – 290 s   Deep focus period        (~65-69 bpm)
 * 290 – 420 s   Distraction event 1      (ramp → 88 bpm, auto-logs ~t=312 s)
 * 420 – 560 s   Recovery + calm          (~65-69 bpm)
 * 560 – 710 s   Distraction event 2      (ramp → 95 bpm, auto-logs ~t=580 s)
 * 710 – 820 s   Recovery + calm          (~65-69 bpm)
 * 820 – 870 s   Mild elevation           (~76 bpm, below threshold — nudge only)
 * 870 – 900 s   Settle to baseline       (~67 bpm)
 *
 * Spike detection mirrors heart-rate.js exactly (same thresholds, cooldown, norm mapping).
 */

(function () {
  "use strict";

  // ── BPM keyframe profile (linearly interpolated) ──────────────────────────────
  var BPM_KEYFRAMES = [
    // Warmup — calm, slightly elevated from sitting down
    { t: 0,   bpm: 72 },
    { t: 25,  bpm: 70 },
    { t: 60,  bpm: 69 },
    { t: 90,  bpm: 68 },
    { t: 120, bpm: 67 },  // warmup ends

    // Deep focus — steady, natural slow drift
    { t: 160, bpm: 66 },
    { t: 210, bpm: 68 },
    { t: 250, bpm: 67 },
    { t: 280, bpm: 66 },

    // ── Distraction event 1 ────────────────────────────────────────────────────
    // Ramp up fast (phone notification / context switch)
    { t: 293, bpm: 74 },
    { t: 302, bpm: 84 },
    { t: 315, bpm: 88 },  // ~21 bpm above ~67 baseline → spike triggers ~t=312
    { t: 340, bpm: 87 },
    { t: 365, bpm: 84 },
    { t: 385, bpm: 77 },
    // Recovery
    { t: 410, bpm: 70 },
    { t: 430, bpm: 67 },

    // Calm — second focus block
    { t: 470, bpm: 66 },
    { t: 510, bpm: 65 },
    { t: 545, bpm: 67 },
    { t: 558, bpm: 66 },

    // ── Distraction event 2 (bigger — longer detour) ──────────────────────────
    { t: 568, bpm: 75 },
    { t: 578, bpm: 90 },
    { t: 590, bpm: 95 },  // ~28 bpm above ~67 baseline → spike triggers ~t=580
    { t: 620, bpm: 94 },
    { t: 650, bpm: 91 },
    { t: 675, bpm: 85 },
    { t: 695, bpm: 77 },
    // Recovery
    { t: 725, bpm: 70 },
    { t: 755, bpm: 67 },

    // Calm — third focus block
    { t: 790, bpm: 66 },
    { t: 815, bpm: 65 },

    // ── Mild elevation (nudge only, below 15-bpm spike threshold) ─────────────
    { t: 828, bpm: 71 },
    { t: 843, bpm: 76 },  // ~10 bpm above baseline — nudges curve, no auto-log
    { t: 858, bpm: 74 },
    { t: 872, bpm: 70 },

    // Settle toward end of session
    { t: 890, bpm: 68 },
    { t: 900, bpm: 67 },
  ];

  // ── Spike detection — mirrors heart-rate.js exactly ───────────────────────────
  var WARMUP_SEC        = 120;
  var BASELINE_WIN_SEC  = 90;
  var SPIKE_THRESHOLD   = 15;
  var NUDGE_THRESHOLD   = 5;
  var SPIKE_SUSTAIN_SEC = 10;
  var COOLDOWN_SEC      = 90;
  var NUDGE_INTERVAL_S  = 5;
  var NORM_DELTA_MIN    = 15;
  var NORM_DELTA_MAX    = 50;
  var NORM_OUT_MIN      = 0.52;
  var NORM_OUT_MAX      = 0.93;

  // ── Runtime state ─────────────────────────────────────────────────────────────
  var demoRunning      = false;
  var demoTimer        = null;
  var demoElapsed      = 0;
  var demoReadings     = [];
  var demoSessionMs    = null;   // set on interval-session-start
  var spikeStartMs     = null;
  var lastFrictionMs   = null;

  // ── BPM helpers ───────────────────────────────────────────────────────────────

  function interpolateBpm(t) {
    var kf = BPM_KEYFRAMES;
    if (t <= kf[0].t) return kf[0].bpm;
    if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].bpm;
    var i;
    for (i = 0; i < kf.length - 1; i++) {
      if (t >= kf[i].t && t <= kf[i + 1].t) {
        var u = (t - kf[i].t) / (kf[i + 1].t - kf[i].t);
        return kf[i].bpm + (kf[i + 1].bpm - kf[i].bpm) * u;
      }
    }
    return kf[kf.length - 1].bpm;
  }

  function noisyBpm(base) {
    return Math.round(base + (Math.random() - 0.5) * 4);
  }

  function rollingBaseline() {
    var cutoff = Date.now() - BASELINE_WIN_SEC * 1000;
    var recent = [];
    var i;
    for (i = 0; i < demoReadings.length; i++) {
      if (demoReadings[i].time >= cutoff) recent.push(demoReadings[i].bpm);
    }
    if (recent.length < 3) return null;
    var sum = 0;
    for (i = 0; i < recent.length; i++) sum += recent[i];
    return sum / recent.length;
  }

  function deltaToNorm(delta) {
    var clamped = Math.max(NORM_DELTA_MIN, Math.min(delta, NORM_DELTA_MAX));
    var t = (clamped - NORM_DELTA_MIN) / (NORM_DELTA_MAX - NORM_DELTA_MIN);
    return NORM_OUT_MIN + t * (NORM_OUT_MAX - NORM_OUT_MIN);
  }

  // ── Display updates (same DOM targets as heart-rate.js) ───────────────────────

  function updateBpmDisplay(bpm) {
    var el = document.getElementById("hr-bpm-value");
    if (el) el.textContent = bpm;
    var panelEl = document.getElementById("hr-panel-bpm");
    if (panelEl) panelEl.textContent = bpm;
  }

  function updateBaselineDisplay(baseline) {
    var el = document.getElementById("hr-baseline-value");
    if (el) el.textContent = baseline !== null ? Math.round(baseline) : "--";
  }

  function setDemoConnected(connected) {
    var connectBtn  = document.getElementById("hr-connect-btn");
    var demoBtn     = document.getElementById("hr-demo-btn");
    var pill        = document.getElementById("hr-bpm-pill");
    var statusDot   = document.getElementById("hr-status-dot");
    var statusLabel = document.getElementById("hr-status-label");

    if (connectBtn) {
      connectBtn.disabled = connected;
    }
    if (demoBtn) {
      demoBtn.textContent = connected ? "Stop Demo" : "Simulate HR (Demo)";
    }
    if (pill) {
      if (connected) pill.removeAttribute("hidden");
      else {
        pill.setAttribute("hidden", "");
        var valEl = document.getElementById("hr-bpm-value");
        if (valEl) valEl.textContent = "--";
      }
    }
    if (statusDot) {
      statusDot.setAttribute(
        "class",
        "hr-status-dot hr-status-dot--" + (connected ? "connected" : "disconnected")
      );
    }
    if (statusLabel) {
      statusLabel.textContent = connected ? "Connected \u2014 Demo Mode" : "Not connected";
    }
    if (!connected) {
      var panelBpm = document.getElementById("hr-panel-bpm");
      if (panelBpm) panelBpm.textContent = "--";
      var baseEl = document.getElementById("hr-baseline-value");
      if (baseEl) baseEl.textContent = "--";
    }
  }

  // ── Spike detection ───────────────────────────────────────────────────────────

  function checkSpike(bpm) {
    if (!demoSessionMs) return;
    var now = Date.now();
    if ((now - demoSessionMs) < WARMUP_SEC * 1000) return;

    var baseline = rollingBaseline();
    if (baseline === null) return;

    var delta = bpm - baseline;

    if (delta >= SPIKE_THRESHOLD) {
      if (!spikeStartMs) spikeStartMs = now;
      if ((now - spikeStartMs) >= SPIKE_SUSTAIN_SEC * 1000) {
        var cooldownOk = !lastFrictionMs || (now - lastFrictionMs) >= COOLDOWN_SEC * 1000;
        if (cooldownOk && window.IntervalSession &&
            typeof window.IntervalSession.recordFriction === "function") {
          window.IntervalSession.recordFriction("heartrate", deltaToNorm(delta));
          lastFrictionMs = now;
          spikeStartMs   = null;
        }
      }
    } else {
      spikeStartMs = null;
    }
  }

  function applyNudge(bpm, baseline) {
    if (!demoSessionMs) return;
    if ((Date.now() - demoSessionMs) < WARMUP_SEC * 1000) return;
    if (baseline === null) return;

    var delta = bpm - baseline;
    if (delta < NUDGE_THRESHOLD) return;

    var nudgeTarget = delta >= SPIKE_THRESHOLD
      ? deltaToNorm(delta)
      : 0.18 + ((delta - NUDGE_THRESHOLD) / (SPIKE_THRESHOLD - NUDGE_THRESHOLD)) * 0.20;

    if (window.IntervalSession && typeof window.IntervalSession.nudgeNorm === "function") {
      window.IntervalSession.nudgeNorm(nudgeTarget);
    }
  }

  // ── Main tick (fires every 1 s) ───────────────────────────────────────────────

  function tick() {
    demoElapsed++;

    // After 15 min hold at final resting BPM — session still live until user ends it
    var t   = Math.min(demoElapsed, 900);
    var bpm = noisyBpm(interpolateBpm(t));

    demoReadings.push({ time: Date.now(), bpm: bpm });

    // Trim readings older than 5 minutes
    var cutoff = Date.now() - 5 * 60 * 1000;
    while (demoReadings.length > 0 && demoReadings[0].time < cutoff) demoReadings.shift();

    var baseline = rollingBaseline();
    updateBpmDisplay(bpm);
    updateBaselineDisplay(baseline);
    checkSpike(bpm);
    if (demoElapsed % NUDGE_INTERVAL_S === 0) applyNudge(bpm, baseline);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  function onSessionStart() {
    demoSessionMs  = Date.now();
    demoElapsed    = 0;
    demoReadings   = [];
    spikeStartMs   = null;
    lastFrictionMs = null;
  }

  function onSessionEnd() {
    demoSessionMs = null;
    spikeStartMs  = null;
  }

  // ── Demo start / stop ─────────────────────────────────────────────────────────

  function startDemo() {
    if (demoRunning) return;
    demoRunning    = true;
    demoElapsed    = 0;
    demoReadings   = [];
    demoSessionMs  = null;
    spikeStartMs   = null;
    lastFrictionMs = null;

    setDemoConnected(true);

    document.addEventListener("interval-session-start", onSessionStart);
    document.addEventListener("interval-session-end",   onSessionEnd);

    demoTimer = setInterval(tick, 1000);
  }

  function stopDemo() {
    if (!demoRunning) return;
    demoRunning   = false;
    demoSessionMs = null;

    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }

    document.removeEventListener("interval-session-start", onSessionStart);
    document.removeEventListener("interval-session-end",   onSessionEnd);

    setDemoConnected(false);
  }

  // ── Inject button into the Active-mode HR panel ───────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var connectBtn = document.getElementById("hr-connect-btn");
    if (!connectBtn) return;

    var demoBtn       = document.createElement("button");
    demoBtn.type      = "button";
    demoBtn.className = "btn-secondary";
    demoBtn.id        = "hr-demo-btn";
    demoBtn.textContent = "Simulate HR (Demo)";
    demoBtn.style.marginTop = "8px";

    demoBtn.addEventListener("click", function () {
      if (!demoRunning) startDemo();
      else stopDemo();
    });

    connectBtn.parentNode.insertBefore(demoBtn, connectBtn.nextSibling);
  });

  // ── Public API ────────────────────────────────────────────────────────────────

  window.IntervalHRDemo = {
    start: startDemo,
    stop:  stopDemo,
    isRunning: function () { return demoRunning; }
  };

})();
