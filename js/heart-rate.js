/**
 * Heart Rate Monitor — Web Bluetooth integration for active distraction tracking.
 *
 * Connects to any BLE device that implements the standard Heart Rate Profile
 * (Service 0x180D / Characteristic 0x2A37). This covers Fitbit Charge 5+,
 * Polar H10, Garmin HRM-Pro, Wahoo TICKR, and most modern fitness trackers.
 *
 * Spike detection: after a warmup period, if HR rises >15 bpm above the
 * rolling baseline for 10+ sustained seconds, a friction event is auto-logged.
 *
 * Requires: Chrome or Edge on desktop with Bluetooth hardware.
 * Fires: interval-session-start / interval-session-end events (listened from live-session.js).
 * Calls: window.IntervalSession.recordFriction("heartrate") on spike.
 */

(function () {
  "use strict";

  // ── BLE UUIDs ─────────────────────────────────────────────────────────────────
  var HR_SERVICE = 0x180D;
  var HR_CHAR    = 0x2A37;

  // ── Spike detection config ────────────────────────────────────────────────────
  var WARMUP_SEC        = 120;  // Seconds before spike detection activates
  var BASELINE_WIN_SEC  = 90;   // Rolling window (seconds) used to compute baseline
  var SPIKE_THRESHOLD   = 15;   // BPM above baseline required to count as a logged spike
  var NUDGE_THRESHOLD   = 5;    // BPM above baseline for the silent continuous nudge
  var SPIKE_SUSTAIN_SEC = 10;   // Seconds elevation must persist before triggering
  var COOLDOWN_SEC      = 90;   // Minimum gap between auto-logged distraction events

  // Proportional norm mapping: delta (bpm above baseline) → stability curve norm
  // delta 15 → 0.52 (low neutral), delta 50+ → 0.93 (phone-level severe)
  var NORM_DELTA_MIN  = 15;
  var NORM_DELTA_MAX  = 50;
  var NORM_OUT_MIN    = 0.52;
  var NORM_OUT_MAX    = 0.93;

  // Silent nudge: while HR is mildly elevated, gently hold the curve up
  // (applied every 5 s; 3% pull per call, balanced against session recovery)
  var NUDGE_INTERVAL_MS = 5000;

  // ── Runtime state ─────────────────────────────────────────────────────────────
  var device         = null;
  var characteristic = null;
  var connected      = false;
  var currentBpm     = 0;
  var readings       = [];   // [{time: ms, bpm: number}]

  var spikeStartMs   = null;
  var lastFrictionMs = null;
  var sessionActive  = false;
  var sessionStartMs = null;
  var nudgeTimer     = null;

  // ── Baseline & spike detection ────────────────────────────────────────────────

  function rollingBaseline() {
    var cutoff  = Date.now() - BASELINE_WIN_SEC * 1000;
    var recent  = [];
    var i;
    for (i = 0; i < readings.length; i++) {
      if (readings[i].time >= cutoff) recent.push(readings[i].bpm);
    }
    if (recent.length < 3) return null;
    var sum = 0;
    for (i = 0; i < recent.length; i++) sum += recent[i];
    return sum / recent.length;
  }

  /**
   * Maps BPM delta above baseline to a stability curve norm value (0–1).
   * Uses a linear interpolation so small spikes cause small moves and
   * large spikes approach phone-level severity — never overshooting it.
   *
   *   delta ≤ 15 bpm  →  norm 0.52  (low neutral, barely perceptible)
   *   delta = 30 bpm  →  norm 0.70  (distracted territory)
   *   delta = 40 bpm  →  norm 0.82  (significantly distracted)
   *   delta ≥ 50 bpm  →  norm 0.93  (phone-level — caps here)
   */
  function deltaToNorm(delta) {
    var clamped = Math.max(NORM_DELTA_MIN, Math.min(delta, NORM_DELTA_MAX));
    var t = (clamped - NORM_DELTA_MIN) / (NORM_DELTA_MAX - NORM_DELTA_MIN);
    return NORM_OUT_MIN + t * (NORM_OUT_MAX - NORM_OUT_MIN);
  }

  /**
   * Silent nudge: called every NUDGE_INTERVAL_MS while a session is active.
   * When HR is mildly elevated, gently holds the curve above baseline instead
   * of letting it recover all the way to "Deep." Not logged as a distraction.
   */
  function applyNudge() {
    if (!sessionActive || !connected) return;
    if (!sessionStartMs || (Date.now() - sessionStartMs) < WARMUP_SEC * 1000) return;

    var baseline = rollingBaseline();
    if (baseline === null) return;

    var delta = currentBpm - baseline;
    if (delta < NUDGE_THRESHOLD) return;

    // Scale nudge target: 5 bpm above baseline → gentle pull toward ~0.30
    // 15+ bpm → pull toward the same norm that the logged spike would use
    var nudgeTarget = delta >= SPIKE_THRESHOLD
      ? deltaToNorm(delta)
      : 0.18 + ((delta - NUDGE_THRESHOLD) / (SPIKE_THRESHOLD - NUDGE_THRESHOLD)) * 0.20;

    if (window.IntervalSession && typeof window.IntervalSession.nudgeNorm === "function") {
      window.IntervalSession.nudgeNorm(nudgeTarget);
    }
  }

  function checkSpike(bpm) {
    if (!sessionActive) return;
    var now = Date.now();
    if (sessionStartMs && (now - sessionStartMs) < WARMUP_SEC * 1000) return;

    var baseline = rollingBaseline();
    if (baseline === null) return;

    var delta = bpm - baseline;

    if (delta >= SPIKE_THRESHOLD) {
      if (!spikeStartMs) spikeStartMs = now;
      var elevated = now - spikeStartMs;
      if (elevated >= SPIKE_SUSTAIN_SEC * 1000) {
        var cooldownOk = !lastFrictionMs || (now - lastFrictionMs) >= COOLDOWN_SEC * 1000;
        if (cooldownOk) {
          triggerFriction(bpm, baseline, delta);
          lastFrictionMs = now;
          spikeStartMs   = null;
        }
      }
    } else {
      spikeStartMs = null;
    }
  }

  function triggerFriction(bpm, baseline, delta) {
    var normOverride = deltaToNorm(delta);
    if (window.IntervalSession && typeof window.IntervalSession.recordFriction === "function") {
      window.IntervalSession.recordFriction("heartrate", normOverride);
    }
    if (window.IntervalTracking && typeof window.IntervalTracking.log === "function") {
      window.IntervalTracking.log("hr_spike_auto", {
        bpm:        Math.round(bpm),
        baseline:   Math.round(baseline),
        delta:      Math.round(delta),
        normImpact: normOverride.toFixed(2)
      });
    }
  }

  // ── BLE parsing ───────────────────────────────────────────────────────────────

  function parseHrMeasurement(dataView) {
    var flags = dataView.getUint8(0);
    // Bit 0 of flags: 0 = uint8 HR value, 1 = uint16 HR value
    return (flags & 0x01) ? dataView.getUint16(1, true) : dataView.getUint8(1);
  }

  function onHrNotification(event) {
    var bpm = parseHrMeasurement(event.target.value);
    currentBpm = bpm;
    readings.push({ time: Date.now(), bpm: bpm });

    // Trim readings older than 5 minutes to keep memory bounded
    var cutoff = Date.now() - 5 * 60 * 1000;
    while (readings.length > 0 && readings[0].time < cutoff) readings.shift();

    updateBpmDisplay(bpm);
    updateBaselineDisplay();
    checkSpike(bpm);
  }

  // ── UI updates ────────────────────────────────────────────────────────────────

  function updateBpmDisplay(bpm) {
    var el = document.getElementById("hr-bpm-value");
    if (el) el.textContent = bpm;
  }

  function updateBaselineDisplay() {
    var el = document.getElementById("hr-baseline-value");
    if (!el) return;
    var b = rollingBaseline();
    el.textContent = b !== null ? Math.round(b) : "--";
  }

  function setStatus(status) {
    var btn        = document.getElementById("hr-connect-btn");
    var pill       = document.getElementById("hr-bpm-pill");
    var statusDot  = document.getElementById("hr-status-dot");

    if (btn) {
      if (status === "connecting") {
        btn.textContent = "Connecting\u2026";
        btn.disabled    = true;
        btn.setAttribute("aria-pressed", "false");
        btn.classList.remove("btn-secondary--active");
      } else if (status === "connected") {
        btn.textContent = "Disconnect HR";
        btn.disabled    = false;
        btn.setAttribute("aria-pressed", "true");
        btn.classList.add("btn-secondary--active");
      } else {
        btn.textContent = "Connect HR Monitor";
        btn.disabled    = false;
        btn.setAttribute("aria-pressed", "false");
        btn.classList.remove("btn-secondary--active");
      }
    }

    if (pill) {
      if (status === "connected") {
        pill.removeAttribute("hidden");
      } else {
        pill.setAttribute("hidden", "");
        var valEl = document.getElementById("hr-bpm-value");
        if (valEl) valEl.textContent = "--";
        var baseEl = document.getElementById("hr-baseline-value");
        if (baseEl) baseEl.textContent = "--";
      }
    }

    if (statusDot) {
      statusDot.setAttribute(
        "class",
        "hr-status-dot hr-status-dot--" + status
      );
    }
  }

  // ── BLE connection ────────────────────────────────────────────────────────────

  function connect() {
    if (connected) {
      disconnect();
      return;
    }

    if (!navigator.bluetooth) {
      alert(
        "Web Bluetooth is not supported in this browser.\n\n" +
        "Use Google Chrome or Microsoft Edge on a Windows or macOS desktop " +
        "with Bluetooth enabled."
      );
      return;
    }

    setStatus("connecting");

    navigator.bluetooth
      .requestDevice({ filters: [{ services: [HR_SERVICE] }] })
      .then(function (dev) {
        device = dev;
        device.addEventListener("gattserverdisconnected", onGattDisconnected);
        return device.gatt.connect();
      })
      .then(function (server) {
        return server.getPrimaryService(HR_SERVICE);
      })
      .then(function (service) {
        return service.getCharacteristic(HR_CHAR);
      })
      .then(function (char) {
        characteristic = char;
        return characteristic.startNotifications();
      })
      .then(function () {
        characteristic.addEventListener("characteristicvaluechanged", onHrNotification);
        connected = true;
        readings  = [];
        setStatus("connected");
      })
      .catch(function (err) {
        if (err.name !== "NotFoundError" && err.name !== "NotAllowedError") {
          console.warn("[IntervalHR] Connection error:", err.message || err);
        }
        setStatus("disconnected");
        device         = null;
        characteristic = null;
      });
  }

  function disconnect() {
    if (characteristic) {
      try {
        characteristic.removeEventListener("characteristicvaluechanged", onHrNotification);
      } catch (e) {}
      characteristic = null;
    }
    if (device) {
      try {
        if (device.gatt && device.gatt.connected) device.gatt.disconnect();
      } catch (e) {}
      device = null;
    }
    connected  = false;
    currentBpm = 0;
    spikeStartMs = null;
    setStatus("disconnected");
  }

  function onGattDisconnected() {
    connected      = false;
    characteristic = null;
    currentBpm     = 0;
    setStatus("disconnected");
  }

  // ── Session lifecycle events ──────────────────────────────────────────────────

  document.addEventListener("interval-session-start", function () {
    sessionActive  = true;
    sessionStartMs = Date.now();
    readings       = [];
    spikeStartMs   = null;
    lastFrictionMs = null;

    if (nudgeTimer) clearInterval(nudgeTimer);
    nudgeTimer = setInterval(applyNudge, NUDGE_INTERVAL_MS);
  });

  document.addEventListener("interval-session-end", function () {
    sessionActive = false;
    spikeStartMs  = null;

    if (nudgeTimer) {
      clearInterval(nudgeTimer);
      nudgeTimer = null;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    setStatus("disconnected");
    var btn = document.getElementById("hr-connect-btn");
    if (btn) btn.addEventListener("click", connect);
  });

  window.IntervalHeartRate = {
    connect:       connect,
    disconnect:    disconnect,
    isConnected:   function () { return connected; },
    getCurrentBpm: function () { return currentBpm; }
  };

})();
