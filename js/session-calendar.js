/**
 * Persists completed tracker sessions for the calendar (localStorage).
 * User entries for a date replace demo data for that date; multiple sessions on the same day aggregate.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "interval_session_calendar_v1";

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function save(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      /* quota / private mode */
    }
  }

  function parseStart(s) {
    var p = String(s).split(":");
    if (p.length < 2) return 0;
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function earlierStart(a, b) {
    return parseStart(a) <= parseStart(b) ? a : b;
  }

  function mergeCurves(existingCurve, incomingCurve, durExisting) {
    if (!incomingCurve || !incomingCurve.length) {
      return existingCurve && existingCurve.length ? existingCurve.slice() : null;
    }
    var inc = incomingCurve.map(function (p) {
      return { elapsed: p.elapsed, norm: p.norm };
    });
    if (!existingCurve || !existingCurve.length) {
      return inc.map(function (p) {
        return { elapsed: durExisting + p.elapsed, norm: p.norm };
      });
    }
    var out = existingCurve.map(function (p) {
      return { elapsed: p.elapsed, norm: p.norm };
    });
    var i;
    for (i = 0; i < inc.length; i++) {
      out.push({ elapsed: durExisting + inc[i].elapsed, norm: inc[i].norm });
    }
    return out;
  }

  function mergeDay(existing, incoming) {
    if (!incoming) return existing;
    if (!existing) return incoming;
    var totalDur = existing.duration + incoming.duration;
    var w =
      (existing.focusScore * existing.duration + incoming.focusScore * incoming.duration) / totalDur;
    var mergedCurve = mergeCurves(existing.curve, incoming.curve, existing.duration);
    var out = {
      start: earlierStart(existing.start, incoming.start),
      duration: totalDur,
      focusScore: Math.round(w * 10) / 10,
      distractions: existing.distractions + incoming.distractions,
    };
    if (mergedCurve && mergedCurve.length >= 2) out.curve = mergedCurve;
    return out;
  }

  /**
   * @param {{ dateKey: string, start: string, duration: number, focusScore: number, distractions: number }} detail
   */
  function recordSession(detail) {
    if (!detail || !detail.dateKey || detail.duration < 1) return;
    if (typeof detail.focusScore !== "number" || isNaN(detail.focusScore)) return;
    var user = load();
    var rec = {
      start: detail.start,
      duration: Math.floor(detail.duration),
      focusScore: detail.focusScore,
      distractions: detail.distractions | 0,
    };
    if (detail.curve && detail.curve.length >= 2) {
      rec.curve = detail.curve;
    }
    user[detail.dateKey] = mergeDay(user[detail.dateKey], rec);
    save(user);
  }

  /**
   * Demo sessions plus user sessions; user wins per date key (with intra-day merge already applied in storage).
   */
  function getMergedSessions(demoSessions) {
    var user = load();
    var merged = {};
    var k;
    for (k in demoSessions) {
      if (Object.prototype.hasOwnProperty.call(demoSessions, k)) merged[k] = demoSessions[k];
    }
    for (k in user) {
      if (Object.prototype.hasOwnProperty.call(user, k)) merged[k] = user[k];
    }
    return merged;
  }

  function exportJsonFile() {
    var obj = load();
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "interval-session-backup.json";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  window.IntervalSessionCalendar = {
    recordSession: recordSession,
    getMergedSessions: getMergedSessions,
    exportJsonFile: exportJsonFile,
  };
})();
