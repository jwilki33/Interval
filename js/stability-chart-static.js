/**
 * Renders the stability curve for historical session data (e.g. calendar detail).
 * Mirrors tracker chart geometry from live-session.js without live session state.
 */
(function () {
  "use strict";

  var W = 600;
  var H = 280;
  var PAD_L = 72;
  var PAD_R = 20;
  var PAD_T = 20;
  var PAD_B = 36;
  var CHART_W = W - PAD_L - PAD_R;
  var CHART_H = H - PAD_T - PAD_B;

  var COLORS = {
    deep: "#00c853",
    focused: "#ffd600",
    neutral: "#ff9100",
    distracted: "#d50000",
  };

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function mixHex(a, b, u) {
    var ra = parseInt(a.slice(1, 3), 16);
    var ga = parseInt(a.slice(3, 5), 16);
    var ba = parseInt(a.slice(5, 7), 16);
    var rb = parseInt(b.slice(1, 3), 16);
    var gb = parseInt(b.slice(3, 5), 16);
    var bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ra + (rb - ra) * u);
    var g = Math.round(ga + (gb - ga) * u);
    var bl = Math.round(ba + (bb - ba) * u);
    return "#" + [r, g, bl].map(function (x) {
      return ("0" + x.toString(16)).slice(-2);
    }).join("");
  }

  function colorForNorm(v) {
    v = clamp01(v);
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

  function pad2(n) {
    return ("0" + n).slice(-2);
  }

  function clockLabelFromDate(date) {
    if (!date || isNaN(date.getTime())) return "";
    if (document.documentElement.getAttribute("data-clock") === "24") {
      return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    }
    var h = date.getHours() % 12 || 12;
    return h + ":" + pad2(date.getMinutes());
  }

  function windowSecForDuration(durationSec) {
    var thirtyMin = 30 * 60;
    return Math.max(thirtyMin, Math.ceil(durationSec / thirtyMin) * thirtyMin);
  }

  /**
   * @param {SVGSVGElement|null} svg
   * @param {{ dataPoints: {elapsed:number, norm:number}[], durationSec: number, sessionStart: Date|null }} opts
   */
  function renderHistory(svg, opts) {
    if (!svg) return;

    var dataPoints = opts.dataPoints || [];
    var durationSec = Math.max(1, opts.durationSec | 0);
    var sessionStart = opts.sessionStart;
    var winSec = windowSecForDuration(durationSec);

    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var BAND_SEP = [0.25, 0.50, 0.75];
    var BAND_CTR = [0.125, 0.375, 0.625, 0.875];
    var labelsY  = ["DEEP", "FOCUSED", "NEUTRAL", "DISTRACTED"];
    var bi, li;

    for (bi = 0; bi < BAND_SEP.length; bi++) {
      var byy = PAD_T + CHART_H * BAND_SEP[bi];
      var bgt = document.createElementNS(NS, "line");
      bgt.setAttribute("x1", PAD_L);
      bgt.setAttribute("y1", byy.toFixed(1));
      bgt.setAttribute("x2", PAD_L + CHART_W);
      bgt.setAttribute("y2", byy.toFixed(1));
      bgt.setAttribute("class", "stability-chart__grid" + (bi === 1 ? " stability-chart__grid--mid" : ""));
      svg.appendChild(bgt);
    }

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

    var xLabels;
    if (sessionStart && !isNaN(sessionStart.getTime())) {
      xLabels = [0, 0.5, 1].map(function (t) {
        var d = new Date(sessionStart.getTime() + t * winSec * 1000);
        return { t: t, text: clockLabelFromDate(d) };
      });
    } else {
      var halfMin = (winSec / 60) / 2;
      var fullMin = winSec / 60;
      xLabels = [
        { t: 0, text: "0:00" },
        { t: 0.5, text: Math.round(halfMin) + ":00" },
        {
          t: 1,
          text: fullMin >= 60 ? Math.round(fullMin / 60) + "h" : Math.round(fullMin) + ":00",
        },
      ];
    }

    var lx;
    for (lx = 0; lx < xLabels.length; lx++) {
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

    if (dataPoints.length < 2) {
      var msg = document.createElementNS(NS, "text");
      msg.setAttribute("x", PAD_L + CHART_W / 2);
      msg.setAttribute("y", PAD_T + CHART_H / 2 + 4);
      msg.setAttribute("text-anchor", "middle");
      msg.setAttribute("class", "stability-chart__empty-msg");
      msg.textContent = "Not enough points to draw this curve";
      svg.appendChild(msg);
      return;
    }

    var s;
    for (s = 0; s < dataPoints.length - 1; s++) {
      var p0 = dataPoints[s];
      var p1 = dataPoints[s + 1];
      var x0 = PAD_L + CHART_W * Math.min(p0.elapsed / winSec, 1);
      var x1 = PAD_L + CHART_W * Math.min(p1.elapsed / winSec, 1);
      var y0 = PAD_T + clamp01(p0.norm) * CHART_H;
      var y1 = PAD_T + clamp01(p1.norm) * CHART_H;
      var avg = (clamp01(p0.norm) + clamp01(p1.norm)) / 2;

      var seg = document.createElementNS(NS, "line");
      seg.setAttribute("x1", x0.toFixed(2));
      seg.setAttribute("y1", y0.toFixed(2));
      seg.setAttribute("x2", x1.toFixed(2));
      seg.setAttribute("y2", y1.toFixed(2));
      seg.setAttribute("stroke", colorForNorm(avg));
      seg.setAttribute("stroke-width", "4");
      seg.setAttribute("stroke-linecap", "round");
      svg.appendChild(seg);
    }
  }

  window.IntervalStabilityChart = {
    renderHistory: renderHistory,
  };
})();
