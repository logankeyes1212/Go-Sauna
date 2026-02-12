(function () {
  const TEMP_PATTERN = /-?\d+(?:\.\d+)?\s*°?\s*[CF]?/i;
  let rafId = null;

  function looksLikeTempText(el) {
    if (!(el instanceof HTMLElement)) return false;
    const txt = (el.textContent || "").trim();
    if (!txt || txt.length > 24) return false;
    if (!TEMP_PATTERN.test(txt)) return false;
    if (/[°CF]/i.test(txt)) return true;
    const ctx = `${el.className || ""} ${el.parentElement?.className || ""}`.toLowerCase();
    return ctx.includes("temp") || ctx.includes("gauge");
  }

  function pickContainer(el) {
    if (!el) return null;
    return (
      el.closest("[class*='rounded'], [class*='card'], [class*='gauge'], [class*='temp']") ||
      el.closest("article, section, li, div")
    );
  }

  function findGaugeHost(el) {
    const scope = pickContainer(el) || document.body;
    const svg = scope.querySelector("svg");
    if (svg && svg.parentElement) return svg.parentElement;
    const canvas = scope.querySelector("canvas");
    if (canvas && canvas.parentElement) return canvas.parentElement;
    return null;
  }

  function ensureOverlay(host, source) {
    if (!(host instanceof HTMLElement) || !(source instanceof HTMLElement)) return;
    host.classList.add("temp-gauge-host");
    source.classList.add("temp-gauge-source");

    let overlay = host.querySelector(".temp-gauge-overlay");
    if (!overlay) {
      overlay = document.createElement("span");
      overlay.className = "temp-gauge-overlay";
      host.appendChild(overlay);
    }
    overlay.textContent = clampTempText((source.textContent || "").trim());
  }

  function ensureBoundsOverlay(host, min = "100", max = "195") {
    if (!(host instanceof HTMLElement)) return;
    host.classList.add("temp-gauge-host");
    let mask = host.querySelector(".temp-gauge-label-mask");
    if (!mask) {
      mask = document.createElement("div");
      mask.className = "temp-gauge-label-mask";
      host.appendChild(mask);
    }
    let wrap = host.querySelector(".temp-gauge-bounds");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "temp-gauge-bounds";
      const left = document.createElement("span");
      left.className = "temp-gauge-bound temp-gauge-bound-min";
      const right = document.createElement("span");
      right.className = "temp-gauge-bound temp-gauge-bound-max";
      wrap.appendChild(left);
      wrap.appendChild(right);
      host.appendChild(wrap);
    }
    const minEl = wrap.querySelector(".temp-gauge-bound-min");
    const maxEl = wrap.querySelector(".temp-gauge-bound-max");
    if (minEl) minEl.textContent = String(min);
    if (maxEl) maxEl.textContent = String(max);

    // Hide native min/max labels when detectable as text elements.
    const textNodes = host.querySelectorAll("text, tspan, span, div, p");
    textNodes.forEach((el) => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
      const raw = (el.textContent || "").trim();
      if (/^60(?:\s*°?\s*[CF])?$/i.test(raw) || /^200(?:\s*°?\s*[CF])?$/i.test(raw)) {
        if (el instanceof HTMLElement) el.style.visibility = "hidden";
        else el.setAttribute("visibility", "hidden");
      }
    });
  }

  function parseTemperature(text) {
    const m = String(text || "").match(/(-?\d+(?:\.\d+)?)\s*°?\s*([CF])?/i);
    if (!m) return null;
    const value = parseFloat(m[1]);
    const unit = (m[2] || "F").toUpperCase();
    return { value, unit };
  }

  function clampTempText(text, minF = 100, maxF = 195) {
    const parsed = parseTemperature(text);
    if (!parsed) return String(text || "");
    const rawF = toFahrenheit(parsed);
    const clampedF = Math.max(minF, Math.min(maxF, rawF));
    if (parsed.unit === "C") {
      const c = (clampedF - 32) * (5 / 9);
      return `${Math.round(c)}°C`;
    }
    return `${Math.round(clampedF)}°F`;
  }

  function toFahrenheit(temp) {
    if (!temp) return null;
    return temp.unit === "C" ? temp.value * (9 / 5) + 32 : temp.value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function gaugeColorFromTemp(tempText) {
    const t = parseTemperature(tempText);
    const f = toFahrenheit(t);
    if (f == null) return "#ffd84d";

    // Sauna range mapping: 100F (low) to 195F (high).
    const minF = 100;
    const maxF = 195;
    const n = Math.max(0, Math.min(1, (f - minF) / (maxF - minF)));

    // low yellow -> high blue
    const low = { r: 255, g: 216, b: 77 };
    const high = { r: 42, g: 124, b: 255 };
    return rgbToHex(lerp(low.r, high.r, n), lerp(low.g, high.g, n), lerp(low.b, high.b, n));
  }

  function applyGaugeColor(host, tempText) {
    if (!(host instanceof HTMLElement)) return;
    const svg = host.querySelector("svg");
    if (!svg) return;
    const gaugeColor = gaugeColorFromTemp(tempText);

    const colorable = svg.querySelectorAll("path, circle, ellipse, polyline, line");
    colorable.forEach((el) => {
      if (!(el instanceof SVGElement)) return;
      const stroke = el.getAttribute("stroke");
      const sw = parseFloat(el.getAttribute("stroke-width") || "0");
      if (stroke && stroke !== "none" && sw >= 2) {
        el.setAttribute("stroke", gaugeColor);
      }
    });
  }

  function enforceGaugeBounds(host) {
    if (!(host instanceof HTMLElement)) return;
    const svg = host.querySelector("svg");
    if (!svg) return;
    const labels = svg.querySelectorAll("text, tspan");
    labels.forEach((el) => {
      const raw = (el.textContent || "").trim();
      if (!raw) return;
      if (/^60(?:\s*°?\s*[CF])?$/i.test(raw)) {
        el.textContent = "100";
        return;
      }
      if (/^200(?:\s*°?\s*[CF])?$/i.test(raw)) {
        el.textContent = "195";
      }
    });
  }

  function markTempGaugeContainers() {
    const nodes = document.querySelectorAll("span, p, div, strong");
    nodes.forEach((node) => {
      if (!looksLikeTempText(node)) return;
      const target = pickContainer(node);
      if (target) target.classList.add("temp-gauge-stable");
      node.classList.add("temp-gauge-value");
      const host = findGaugeHost(node);
      if (host) {
        const clamped = clampTempText(node.textContent || "");
        ensureOverlay(host, node);
        ensureBoundsOverlay(host, "100", "195");
        applyGaugeColor(host, clamped);
        enforceGaugeBounds(host);
      }
    });
  }



  function refreshGaugeVisuals() {
    const sources = document.querySelectorAll(".temp-gauge-source");
    sources.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const host = findGaugeHost(node);
      if (!host) return;
      const clamped = clampTempText(node.textContent || "");
      ensureOverlay(host, node);
      ensureBoundsOverlay(host, "100", "195");
      applyGaugeColor(host, clamped);
      enforceGaugeBounds(host);
    });
  }

  function alignGridWithAboutHeading() {
    const headingCandidates = document.querySelectorAll("h1, h2, h3, h4, span, p");
    let aboutHeading = null;
    headingCandidates.forEach((el) => {
      if (aboutHeading || !(el instanceof HTMLElement)) return;
      const text = (el.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (/about\s+go[- ]?sauna/.test(text)) aboutHeading = el;
    });
    if (!aboutHeading) return;

    const grid = document.querySelector(".grid.sm\\:grid-cols-2.gap-6");
    if (!(grid instanceof HTMLElement)) return;

    const hTop = aboutHeading.getBoundingClientRect().top;
    const gTop = grid.getBoundingClientRect().top;
    const delta = Math.round(hTop - gTop);

    grid.style.position = "relative";
    grid.style.top = `${delta}px`;
  }

  function clampTransformX(transformValue) {
    if (!transformValue || transformValue === "none") return transformValue;

    let t = transformValue;
    t = t.replace(/translateX\(([^)]+)\)/gi, "translateX(0px)");
    t = t.replace(/translate\(([^,]+),\s*([^)]+)\)/gi, "translate(0px, $2)");
    t = t.replace(/translate3d\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi, "translate3d(0px, $2, $3)");
    t = t.replace(/matrix\(([^)]+)\)/gi, (m, content) => {
      const parts = content.split(",").map((x) => x.trim());
      if (parts.length !== 6) return m;
      parts[4] = "0";
      return `matrix(${parts.join(", ")})`;
    });
    t = t.replace(/matrix3d\(([^)]+)\)/gi, (m, content) => {
      const parts = content.split(",").map((x) => x.trim());
      if (parts.length !== 16) return m;
      parts[12] = "0";
      return `matrix3d(${parts.join(", ")})`;
    });
    return t;
  }

  function lockXAxis() {
    const targets = document.querySelectorAll(".temp-gauge-stable, .temp-gauge-stable *");
    targets.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const current = el.style.transform;
      if (current) {
        const clamped = clampTransformX(current);
        if (clamped !== current) el.style.transform = clamped;
      }
      const computed = getComputedStyle(el).transform;
      if (computed && computed !== "none" && computed !== current) {
        const clampedComputed = clampTransformX(computed);
        if (clampedComputed !== computed) el.style.transform = clampedComputed;
      }
    });
    refreshGaugeVisuals();
    alignGridWithAboutHeading();
    rafId = window.requestAnimationFrame(lockXAxis);
  }

  const observer = new MutationObserver(() => markTempGaugeContainers());

  function init() {
    markTempGaugeContainers();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (rafId === null) rafId = window.requestAnimationFrame(lockXAxis);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
