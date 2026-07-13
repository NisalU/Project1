/* Signal Bot dashboard client. Polls the Flask API and renders
   lightweight-charts with all strategy overlays. */
(function () {
  "use strict";

  var POLL_MS = 10000;
  var C = {
    bg: "#131a22", grid: "#1f2a37", text: "#8b98a5",
    green: "#22c55e", red: "#ef4444", amber: "#f59e0b",
    ema7: "#eab308", ema25: "#38bdf8", ema99: "#a3a3a3",
  };

  var symbolEl = document.getElementById("symbol");
  var intervalEl = document.getElementById("interval");
  var liveDot = document.getElementById("live-dot");

  // ---------- charts ----------
  function baseOptions(el) {
    return {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { color: "transparent" }, textColor: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.grid },
      timeScale: { borderColor: C.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    };
  }

  var chartEl = document.getElementById("chart");
  var chart = LightweightCharts.createChart(chartEl, baseOptions(chartEl));
  var candleSeries = chart.addCandlestickSeries({
    upColor: C.green, downColor: C.red, borderVisible: false,
    wickUpColor: C.green, wickDownColor: C.red,
  });
  var ema7Series = chart.addLineSeries({ color: C.ema7, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  var ema25Series = chart.addLineSeries({ color: C.ema25, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  var ema99Series = chart.addLineSeries({ color: C.ema99, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

  var cvdEl = document.getElementById("cvd-chart");
  var cvdChart = LightweightCharts.createChart(cvdEl, baseOptions(cvdEl));
  var cvdSeries = cvdChart.addAreaSeries({
    lineColor: C.ema25, topColor: "rgba(56,189,248,0.25)", bottomColor: "rgba(56,189,248,0.02)",
    lineWidth: 2, priceLineVisible: false,
  });

  window.addEventListener("resize", function () {
    chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });
    cvdChart.applyOptions({ width: cvdEl.clientWidth, height: cvdEl.clientHeight });
  });

  var priceLines = [];
  var trendSeries = [];
  var firstLoad = true;

  function clearOverlays() {
    priceLines.forEach(function (pl) { candleSeries.removePriceLine(pl); });
    priceLines = [];
    trendSeries.forEach(function (s) { chart.removeSeries(s); });
    trendSeries = [];
  }

  function addPriceLine(price, color, title, style) {
    priceLines.push(candleSeries.createPriceLine({
      price: price, color: color, lineWidth: 1,
      lineStyle: style === undefined ? 2 : style,
      axisLabelVisible: true, title: title,
    }));
  }

  // ---------- rendering ----------
  function fmt(n, digits) {
    if (n === null || n === undefined) return "\u2014";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function renderChart(d) {
    var ov = d.overlays || {};
    candleSeries.setData(d.candles.map(function (c) {
      return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    }));
    ema7Series.setData(ov.ema7 || []);
    ema25Series.setData(ov.ema25 || []);
    ema99Series.setData(ov.ema99 || []);
    cvdSeries.setData(ov.cvd || []);

    clearOverlays();

    (ov.support || []).forEach(function (lv) { addPriceLine(lv.price, C.green, "S x" + lv.touches); });
    (ov.resistance || []).forEach(function (lv) { addPriceLine(lv.price, C.red, "R x" + lv.touches); });

    if (ov.fibonacci) {
      ov.fibonacci.levels.forEach(function (lv) {
        addPriceLine(lv.price, C.amber, "fib " + lv.ratio, 3);
      });
    }
    if (ov.volume_profile) {
      addPriceLine(ov.volume_profile.poc, "#c084fc", "POC", 0);
      addPriceLine(ov.volume_profile.vah, "#8b98a5", "VAH", 3);
      addPriceLine(ov.volume_profile.val, "#8b98a5", "VAL", 3);
    }
    (ov.order_blocks || []).forEach(function (ob) {
      var color = ob.type === "bullish" ? C.green : C.red;
      addPriceLine(ob.top, color, "OB " + (ob.type === "bullish" ? "demand" : "supply"), 4);
      addPriceLine(ob.bottom, color, "", 4);
    });
    (ov.fvgs || []).forEach(function (f) {
      addPriceLine(f.mid, f.type === "bullish" ? C.green : C.red, "FVG", 1);
    });

    (ov.trendlines || []).forEach(function (tl) {
      var s = chart.addLineSeries({
        color: tl.type === "support" ? C.green : C.red,
        lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: tl.start.time, value: tl.start.price },
        { time: tl.end.time, value: tl.end.price },
      ]);
      trendSeries.push(s);
    });

    // Markers: liquidity sweeps + structure events
    var markers = [];
    (ov.sweeps || []).forEach(function (sw) {
      markers.push({
        time: sw.time,
        position: sw.type === "bullish" ? "belowBar" : "aboveBar",
        color: sw.type === "bullish" ? C.green : C.red,
        shape: sw.type === "bullish" ? "arrowUp" : "arrowDown",
        text: "SWEEP",
      });
    });
    markers.sort(function (a, b) { return a.time - b.time; });
    candleSeries.setMarkers(markers);

    if (firstLoad) {
      chart.timeScale().fitContent();
      cvdChart.timeScale().fitContent();
      firstLoad = false;
    }
  }

  function renderVerdict(d) {
    document.getElementById("price").textContent = fmt(d.price, 6);
    var chg = document.getElementById("chg");
    if (d.ticker) {
      var pct = d.ticker.change_pct;
      chg.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "% 24h";
      chg.className = "chg " + (pct >= 0 ? "up" : "down");
    }
    var v = document.getElementById("verdict");
    if (d.direction === "LONG") {
      v.className = "verdict-badge long";
      v.textContent = (d.strength ? d.strength + " " : "") + "LONG SIGNAL";
    } else if (d.direction === "SHORT") {
      v.className = "verdict-badge short";
      v.textContent = (d.strength ? d.strength + " " : "") + "SHORT SIGNAL";
    } else {
      v.className = "verdict-badge neutral";
      v.textContent = "NEUTRAL \u00b7 waiting for confluence";
    }
    document.getElementById("gauge-needle").style.left = (50 + d.composite / 2) + "%";
    document.getElementById("gauge-score").textContent =
      "score " + d.composite + " / \u00b1" + d.threshold + " to fire";

    var planCard = document.getElementById("plan-card");
    if (d.plan) {
      planCard.classList.remove("hidden");
      document.getElementById("plan-entry").textContent = fmt(d.plan.entry, 6);
      document.getElementById("plan-stop").textContent = fmt(d.plan.stop, 6);
      document.getElementById("plan-tp1").textContent = fmt(d.plan.tp1, 6);
      document.getElementById("plan-tp2").textContent = fmt(d.plan.tp2, 6);
    } else {
      planCard.classList.add("hidden");
    }
  }

  function renderBreakdown(d) {
    var host = document.getElementById("breakdown");
    host.innerHTML = "";
    d.breakdown.forEach(function (b) {
      var row = document.createElement("div");
      row.className = "bd-row";
      var pct = Math.min(Math.abs(b.score) * 50, 50);
      var cls = b.contribution > 0.5 ? "pos" : b.contribution < -0.5 ? "neg" : "zero";
      row.innerHTML =
        '<div class="bd-top"><span class="bd-name">' + b.label +
        ' <span class="bd-reasons">(w' + b.weight + ")</span></span>" +
        '<span class="bd-val ' + cls + '">' + (b.contribution > 0 ? "+" : "") + b.contribution + "</span></div>" +
        '<div class="bd-bar"><div class="bd-mid"></div>' +
        '<div class="bd-fill ' + (b.score >= 0 ? "pos" : "neg") + '" style="width:' + pct + '%"></div></div>' +
        '<div class="bd-reasons">' + b.reasons.join(" \u00b7 ") + "</div>";
      host.appendChild(row);
    });
  }

  function renderFundamentals(d) {
    var f = (d.overlays || {}).fundamentals;
    var card = document.getElementById("fund-card");
    if (!f) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    var fr = f.funding_rate * 100;
    var frEl = document.getElementById("f-funding");
    frEl.textContent = fr.toFixed(4) + "%";
    frEl.className = "v " + (fr > 0.03 ? "red" : fr < 0 ? "green" : "");
    var oiEl = document.getElementById("f-oi");
    oiEl.textContent = (f.oi_change_pct >= 0 ? "+" : "") + f.oi_change_pct.toFixed(1) + "%";
    document.getElementById("f-ls").textContent = f.long_short_ratio.toFixed(2);
    document.getElementById("f-mark").textContent = fmt(f.mark_price, 6);
  }

  function renderSignals(list) {
    var host = document.getElementById("signals");
    if (!list.length) return;
    host.innerHTML = "";
    list.forEach(function (s) {
      var el = document.createElement("div");
      el.className = "sig " + s.direction.toLowerCase();
      var when = new Date(s.time * 1000).toLocaleString();
      el.innerHTML =
        '<div class="sig-top"><span class="sig-dir">' + s.direction +
        (s.strength ? " \u00b7 " + s.strength : "") + "</span>" +
        '<span class="sig-meta">' + s.symbol + " " + s.interval + " \u00b7 score " + s.score + "</span></div>" +
        '<div class="sig-meta">' + when + " \u00b7 @ " + fmt(s.price, 6) + "</div>" +
        (s.reasons && s.reasons.length ? '<div class="sig-reasons">' + s.reasons.join(" \u00b7 ") + "</div>" : "");
      host.appendChild(el);
    });
  }

  // ---------- polling ----------
  function poll() {
    var q = "symbol=" + symbolEl.value + "&interval=" + intervalEl.value;
    fetch("/api/state?" + q)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        liveDot.className = "dot live";
        renderChart(d);
        renderVerdict(d);
        renderBreakdown(d);
        renderFundamentals(d);
      })
      .catch(function () { liveDot.className = "dot err"; });

    fetch("/api/signals")
      .then(function (r) { return r.json(); })
      .then(renderSignals)
      .catch(function () {});
  }

  function reset() {
    firstLoad = true;
    poll();
  }
  symbolEl.addEventListener("change", reset);
  intervalEl.addEventListener("change", reset);

  poll();
  setInterval(poll, POLL_MS);
})();
