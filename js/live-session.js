/**
 * Live Session — stability curve (segment-colored by focus level) and session timer.
 */

(function () {
  "use strict";

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
    var ra = parseInt(a.slice(1, 3), 16);
    var ga = parseInt(a.slice(3, 5), 16);
    var ba = parseInt(a.slice(5, 7), 16);
    var rb = parseInt(b.slice(1, 3), 16);
    var gb = parseInt(b.slice(3, 5), 16);
    var bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ra + (rb - ra) * u);
    var g = Math.round(ga + (gb - ga) * u);
    var bl = Math.round(ba + (bb - ba) * u);
    return (
      "#" +
      [r, g, bl]
        .map(function (x) {
          return ("0" + x.toString(16)).slice(-2);
        })
        .join("")
    );
  }

  /** Vertical position 0 = deep (top), 1 = distracted (bottom) */
  function curveNorm(t) {
    var wave = 0.14 + 0.07 * Math.sin(t * Math.PI * 2.4);
    wave += 0.34 * Math.exp(-Math.pow((t - 0.22) / 0.045, 2));
    wave += 0.4 * Math.exp(-Math.pow((t - 0.52) / 0.05, 2));
    wave += 0.36 * Math.exp(-Math.pow((t - 0.78) / 0.042, 2));
    return Math.min(0.9, Math.max(0.08, wave));
  }

  function buildStabilityChart(svg) {
    var NS = "http://www.w3.org/2000/svg";
    var W = 600;
    var H = 280;
    var padL = 52;
    var padR = 20;
    var padT = 20;
    var padB = 36;
    var chartW = W - padL - padR;
    var chartH = H - padT - padB;

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var labelsY = ["Deep", "Focused", "Neutral", "Distracted"];
    var ly;
    for (ly = 0; ly < 4; ly++) {
      var yy = padT + (chartH * ly) / 3;
      var gt = document.createElementNS(NS, "line");
      gt.setAttribute("x1", padL);
      gt.setAttribute("y1", yy);
      gt.setAttribute("x2", padL + chartW);
      gt.setAttribute("y2", yy);
      gt.setAttribute("class", "stability-chart__grid" + (ly === 2 ? " stability-chart__grid--mid" : ""));
      svg.appendChild(gt);

      var lbl = document.createElementNS(NS, "text");
      lbl.setAttribute("x", padL - 8);
      lbl.setAttribute("y", yy + 4);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "stability-chart__axis-y");
      lbl.textContent = labelsY[ly];
      svg.appendChild(lbl);
    }

    var xLabels = [
      { t: 0, text: "12:00" },
      { t: 0.5, text: "12:30" },
      { t: 1, text: "1:00" },
    ];
    var lx;
    for (lx = 0; lx < xLabels.length; lx++) {
      var xl = padL + chartW * xLabels[lx].t;
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", xl);
      tx.setAttribute("y", H - 10);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("class", "stability-chart__axis-x");
      tx.textContent = xLabels[lx].text;
      svg.appendChild(tx);
    }

    var steps = 72;
    var pts = [];
    var s;
    for (s = 0; s <= steps; s++) {
      var t = s / steps;
      var x = padL + chartW * t;
      var norm = curveNorm(t);
      var y = padT + norm * chartH;
      pts.push({ x: x, y: y, norm: norm });
    }

    for (s = 0; s < pts.length - 1; s++) {
      var p0 = pts[s];
      var p1 = pts[s + 1];
      var avg = (p0.norm + p1.norm) / 2;
      var line = document.createElementNS(NS, "line");
      line.setAttribute("x1", p0.x.toFixed(2));
      line.setAttribute("y1", p0.y.toFixed(2));
      line.setAttribute("x2", p1.x.toFixed(2));
      line.setAttribute("y2", p1.y.toFixed(2));
      line.setAttribute("stroke", colorForNorm(avg));
      line.setAttribute("stroke-width", "4");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    }

    var markers = [
      { t: 0.22, kind: "phone" },
      { t: 0.52, kind: "check" },
      { t: 0.78, kind: "pin" },
    ];
    var m;
    for (m = 0; m < markers.length; m++) {
      var mt = markers[m].t;
      var mx = padL + chartW * mt;
      var mn = curveNorm(mt);
      var my = padT + mn * chartH;
      var groundY = padT + chartH;

      var dash = document.createElementNS(NS, "line");
      dash.setAttribute("x1", mx);
      dash.setAttribute("y1", my);
      dash.setAttribute("x2", mx);
      dash.setAttribute("y2", groundY);
      dash.setAttribute("class", "stability-chart__marker-line");
      svg.appendChild(dash);

      var g = document.createElementNS(NS, "g");
      g.setAttribute("transform", "translate(" + mx + "," + my + ")");
      g.setAttribute("style", "color:" + COLORS.distracted);

      var icon = iconSymbol(NS, markers[m].kind);
      g.appendChild(icon);
      svg.appendChild(g);
    }
  }

  function iconSymbol(NS, kind) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("transform", "translate(-10,-10)");
    var path;
    if (kind === "phone") {
      path = document.createElementNS(NS, "path");
      path.setAttribute(
        "d",
        "M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z",
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.6");
      g.appendChild(path);
    } else if (kind === "check") {
      var rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", "2");
      rect.setAttribute("y", "2");
      rect.setAttribute("width", "16");
      rect.setAttribute("height", "16");
      rect.setAttribute("rx", "2");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", "currentColor");
      rect.setAttribute("stroke-width", "1.6");
      g.appendChild(rect);
      path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M6 10l3 3 5-6");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.6");
      g.appendChild(path);
    } else {
      path = document.createElementNS(NS, "path");
      path.setAttribute(
        "d",
        "M10 2C7 2 5 4.2 5 7c0 4 5 9 5 9s5-5 5-9c0-2.8-2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z",
      );
      path.setAttribute("fill", "currentColor");
      g.appendChild(path);
    }
    return g;
  }

  function pad2(n) {
    return ("0" + n).slice(-2);
  }

  function startDemoTimer(el) {
    if (!el) return;
    var totalSeconds = 0;
    function tick() {
      var h = Math.floor(totalSeconds / 3600);
      var m = Math.floor((totalSeconds % 3600) / 60);
      var sec = totalSeconds % 60;
      el.textContent = pad2(h) + ":" + pad2(m) + ":" + pad2(sec);
      totalSeconds += 1;
    }
    tick();
    setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var svg = document.getElementById("stability-chart");
    if (svg) buildStabilityChart(svg);
    startDemoTimer(document.getElementById("session-timer"));
  });
})();
