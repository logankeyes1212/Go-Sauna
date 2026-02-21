(function () {
  // Temperature detection regex used to find candidate text nodes.
  const TEMP_PATTERN = /-?\d+(?:\.\d+)?\s*°?\s*[CF]?/i;
  // Project-level gauge lower bound in Fahrenheit.
  const MIN_TEMP_F = 100;
  // Project-level gauge upper bound in Fahrenheit.
  const MAX_TEMP_F = 195;
  const MIN_TEMP_LABEL = String(MIN_TEMP_F);
  const MAX_TEMP_LABEL = String(MAX_TEMP_F);
  let rafId = null;
  let markQueued = false;

  // Renders a one-time startup steam overlay for initial page atmosphere.
  function runStartupSteamEffect() {
    if (!(document.body instanceof HTMLElement)) return;
    if (document.body.dataset.startupSteamPlayed === "1") return;
    document.body.dataset.startupSteamPlayed = "1";

    const overlay = document.createElement("div");
    overlay.className = "startup-steam";

    const puffCount = 24;
    for (let i = 0; i < puffCount; i += 1) {
      const puff = document.createElement("div");
      puff.className = "startup-steam-puff";
      const left = 2 + Math.random() * 96;
      const size = 110 + Math.random() * 170;
      const delay = Math.round(Math.random() * 900);
      const dur = 2200 + Math.round(Math.random() * 1600);
      const drift = -170 + Math.round(Math.random() * 340);
      puff.style.setProperty("--left", `${left}%`);
      puff.style.setProperty("--size", `${size}px`);
      puff.style.setProperty("--delay", `${delay}ms`);
      puff.style.setProperty("--dur", `${dur}ms`);
      puff.style.setProperty("--drift", `${drift}px`);
      overlay.appendChild(puff);
    }

    document.body.appendChild(overlay);
    window.setTimeout(() => {
      overlay.remove();
    }, 4200);
  }

  // Heuristic that decides whether a node likely represents temperature text.
  function looksLikeTempText(el) {
    if (!(el instanceof HTMLElement)) return false;
    const txt = (el.textContent || "").trim();
    if (!txt || txt.length > 24) return false;
    if (!TEMP_PATTERN.test(txt)) return false;
    if (/[°CF]/i.test(txt)) return true;
    const ctx = `${el.className || ""} ${el.parentElement?.className || ""}`.toLowerCase();
    return ctx.includes("temp") || ctx.includes("gauge");
  }

  // Picks a stable nearby wrapper used to anchor gauge styling and transforms.
  function pickContainer(el) {
    if (!el) return null;
    return (
      el.closest("[class*='rounded'], [class*='card'], [class*='gauge'], [class*='temp']") ||
      el.closest("article, section, li, div")
    );
  }

  // Locates the SVG/canvas host where overlays and bounds are injected.
  function findGaugeHost(el) {
    const scope = pickContainer(el) || document.body;
    const svg = scope.querySelector("svg");
    if (svg && svg.parentElement) return svg.parentElement;
    const canvas = scope.querySelector("canvas");
    if (canvas && canvas.parentElement) return canvas.parentElement;
    return null;
  }

  // Ensures the in-gauge numeric overlay exists and mirrors clamped temperature.
  function ensureOverlay(host, source) {
    if (!(host instanceof HTMLElement) || !(source instanceof HTMLElement)) return;
    host.classList.add("temp-gauge-host");
    source.classList.add("temp-gauge-source");
    source.style.position = "absolute";
    source.style.width = "0";
    source.style.minWidth = "0";
    source.style.maxWidth = "0";
    source.style.overflow = "hidden";
    source.style.whiteSpace = "nowrap";

    let overlay = host.querySelector(".temp-gauge-overlay");
    if (!overlay) {
      overlay = document.createElement("span");
      overlay.className = "temp-gauge-overlay";
      host.appendChild(overlay);
    }
    overlay.textContent = clampTempText((source.textContent || "").trim());
    hardLockGaugeWrapper(host);
  }

  // Creates custom min/max labels plus masks that replace legacy 60/200 visuals.
  function ensureBoundsOverlay(host, min = String(MIN_TEMP_F), max = String(MAX_TEMP_F)) {
    if (!(host instanceof HTMLElement)) return;
    host.classList.add("temp-gauge-host");
    let mask = host.querySelector(".temp-gauge-label-mask");
    if (!mask) {
      mask = document.createElement("div");
      mask.className = "temp-gauge-label-mask";
      host.appendChild(mask);
    }
    let leftMask = host.querySelector(".temp-gauge-side-mask-left");
    if (!leftMask) {
      leftMask = document.createElement("div");
      leftMask.className = "temp-gauge-side-mask temp-gauge-side-mask-left";
      host.appendChild(leftMask);
    }
    let rightMask = host.querySelector(".temp-gauge-side-mask-right");
    if (!rightMask) {
      rightMask = document.createElement("div");
      rightMask.className = "temp-gauge-side-mask temp-gauge-side-mask-right";
      host.appendChild(rightMask);
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
    hardLockGaugeWrapper(host);
    normalizeGaugeTextNodes(host);

    const minEl = wrap.querySelector(".temp-gauge-bound-min");
    const maxEl = wrap.querySelector(".temp-gauge-bound-max");
    if (minEl) minEl.textContent = String(min);
    if (maxEl) maxEl.textContent = String(max);

    const textNodes = host.querySelectorAll("text, tspan, span, div, p");
    textNodes.forEach((el) => {
      const raw = (el.textContent || "").trim();
      if (/^60(?:\s*°?\s*[CF])?$/i.test(raw) || /^200(?:\s*°?\s*[CF])?$/i.test(raw)) {
        if (el instanceof HTMLElement) el.style.visibility = "hidden";
        else el.setAttribute("visibility", "hidden");
      }
    });
  }

  // Parses a number and optional unit from a temperature-like string.
  function parseTemperature(text) {
    const m = String(text || "").match(/(-?\d+(?:\.\d+)?)\s*°?\s*([CF])?/i);
    if (!m) return null;
    const value = parseFloat(m[1]);
    const unit = (m[2] || "F").toUpperCase();
    return { value, unit };
  }



  // Rewrites raw text-node labels from legacy values to configured bounds.
  function normalizeGaugeTextNodes(root) {
    if (!(root instanceof HTMLElement)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const raw = String(node.nodeValue || "").trim();
      if (/^60(?:\s*°?\s*[CF])?$/i.test(raw)) {
        node.nodeValue = String(MIN_TEMP_F);
      } else if (/^200(?:\s*°?\s*[CF])?$/i.test(raw)) {
        node.nodeValue = String(MAX_TEMP_F);
      }
      node = walker.nextNode();
    }
  }

  // Clamps parsed temperature to min/max and returns formatted text in source unit.
  function clampTempText(text, minF = MIN_TEMP_F, maxF = MAX_TEMP_F) {
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

  // Converts parsed temperature object to Fahrenheit for shared range math.
  function toFahrenheit(temp) {
    if (!temp) return null;
    return temp.unit === "C" ? temp.value * (9 / 5) + 32 : temp.value;
  }

  // Linear interpolation helper for color blending.
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Converts RGB components to a hex color string.
  function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  // Maps temperature to gauge stroke color within configured range.
  function gaugeColorFromTemp(tempText) {
    const t = parseTemperature(tempText);
    const f = toFahrenheit(t);
    if (f == null) return "#ffd84d";

    const minF = MIN_TEMP_F;
    const maxF = MAX_TEMP_F;
    const n = Math.max(0, Math.min(1, (f - minF) / (maxF - minF)));

    const low = { r: 255, g: 216, b: 77 };
    const high = { r: 42, g: 124, b: 255 };
    return rgbToHex(lerp(low.r, high.r, n), lerp(low.g, high.g, n), lerp(low.b, high.b, n));
  }

  // Applies computed color to visible gauge stroke elements.
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

  // Replaces SVG text labels with min/max bound values where possible.
  function enforceGaugeBounds(host) {
    if (!(host instanceof HTMLElement)) return;
    const svg = host.querySelector("svg");
    if (!svg) return;
    const labels = svg.querySelectorAll("text, tspan");
    labels.forEach((el) => {
      const raw = (el.textContent || "").trim();
      if (!raw) return;
      if (/^60(?:\s*°?\s*[CF])?$/i.test(raw)) {
        el.textContent = String(MIN_TEMP_F);
        return;
      }
      if (/^200(?:\s*°?\s*[CF])?$/i.test(raw)) {
        el.textContent = String(MAX_TEMP_F);
      }
    });
  }


  // Runs every gauge styling step in a single place for consistency.
  function applyGaugeFixes(host, sourceNode) {
    if (!(host instanceof HTMLElement) || !(sourceNode instanceof HTMLElement)) return;
    const clamped = clampTempText(sourceNode.textContent || "");
    ensureOverlay(host, sourceNode);
    ensureBoundsOverlay(host, MIN_TEMP_LABEL, MAX_TEMP_LABEL);
    hardLockGaugeWrapper(host);
    applyGaugeColor(host, clamped);
    enforceGaugeBounds(host);
    normalizeGaugeTextNodes(host);
  }

  // Locks host width so changing digits do not shift gauge x-position.
  function fixHostWidth(host) {
    if (!(host instanceof HTMLElement)) return;

    let w = parseFloat(host.dataset.lockWidth || "0");
    if (!w || !Number.isFinite(w) || w <= 0) {
      const rect = host.getBoundingClientRect();
      if (rect && rect.width > 0) {
        w = Math.round(rect.width * 100) / 100;
        host.dataset.lockWidth = String(w);
      }
    }

    if (w && Number.isFinite(w) && w > 0) {
      const px = `${w}px`;
      host.style.width = px;
      host.style.minWidth = px;
      host.style.maxWidth = px;
      host.style.flex = `0 0 ${px}`;
    }
  }

  // Hard-pins host and wrappers to the right and strips x translation.
  function hardLockGaugeWrapper(host) {
    if (!(host instanceof HTMLElement)) return;

    fixHostWidth(host);

    const wrappers = [];
    const pushWrap = (el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!wrappers.includes(el)) wrappers.push(el);
    };

    pushWrap(host);
    pushWrap(host.parentElement);
    pushWrap(host.closest(".temp-gauge-stable"));

    wrappers.forEach((el, i) => {
      const isHost = i === 0;
      if (isHost) {
        el.classList.add("temp-gauge-x-lock");
        el.style.position = "relative";
        el.style.left = "auto";
        el.style.right = "0";
        el.style.marginLeft = "auto";
        el.style.marginRight = "0";
        el.style.transform = "none";
        el.style.translate = "0 0";
        el.style.textAlign = "right";
      } else {
        el.classList.add("temp-gauge-x-lock-parent");
        el.style.left = "auto";
        el.style.right = "0";
        el.style.marginLeft = "auto";
        el.style.marginRight = "0";
        el.style.translate = "0 0";
      }
    });
  }

  // Full scan pass: discover temp nodes and apply all gauge visual constraints.
  function markTempGaugeContainers() {
    const nodes = document.querySelectorAll("span, p, div, strong");
    nodes.forEach((node) => {
      if (!looksLikeTempText(node)) return;
      const target = pickContainer(node);
      if (target) target.classList.add("temp-gauge-stable");
      node.classList.add("temp-gauge-value");
      const host = findGaugeHost(node);
      if (host) {
        applyGaugeFixes(host, node);
      }
    });
  }

  // Incremental pass for already-tagged source nodes.
  function refreshGaugeVisuals() {
    const sources = document.querySelectorAll(".temp-gauge-source");
    sources.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const host = findGaugeHost(node);
      if (!host) return;
      applyGaugeFixes(host, node);
    });
  }

  // Removes x translation from transform strings while preserving y/z terms.
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

  const ADMIN_APP_ID = "698de9b6841548fa03673e8c";
  const ADMIN_API_BASE = "https://go-sauna-now.base44.app/api/apps";
  let adminMountQueued = false;
  let adminMounted = false;
  let adminNavQueued = false;
  let adminUserPromise = null;
  let isAdminUser = null;
  const LOCAL_BOOKINGS_KEY = "go_sauna_local_bookings_v1";
  let pendingLocalBooking = null;
  let pendingBookingPollId = null;

  function getAuthToken() {
    try {
      return localStorage.getItem("base44_access_token") || localStorage.getItem("token") || "";
    } catch {
      return "";
    }
  }

  function getAdminRouteSegment() {
    const seg = window.location.pathname.replace(/^\/+/, "").split("/")[0] || "";
    return seg.toLowerCase();
  }

  async function apiRequest(path, options = {}) {
    const token = getAuthToken();

    const headers = {
      "Content-Type": "application/json",
      "X-App-Id": ADMIN_APP_ID,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    };

    const res = await fetch(ADMIN_API_BASE + "/" + ADMIN_APP_ID + path, {
      ...options,
      headers,
      credentials: "include"
    });

    if (!res.ok) {
      let msg = "Request failed (" + res.status + ")";
      try {
        const err = await res.json();
        msg = err?.message || err?.detail || msg;
      } catch {}
      throw new Error(msg);
    }

    if (res.status === 204) return null;
    return res.json();
  }


  async function resolveAdminStatus() {
    if (isAdminUser !== null) return isAdminUser;
    if (adminUserPromise) return adminUserPromise;

    adminUserPromise = (async () => {
      try {
        const me = await apiRequest("/entities/User/me");
        isAdminUser = !!me && me.role === "admin";
      } catch {
        isAdminUser = false;
      } finally {
        adminUserPromise = null;
      }
      return isAdminUser;
    })();

    return adminUserPromise;
  }

  function injectAdminNavLink() {
    if (document.getElementById("admin-nav-link")) return;
    if (!(document.body instanceof HTMLElement)) return;

    const link = document.createElement("a");
    link.id = "admin-nav-link";
    link.href = "/Admin/";
    link.textContent = "Admin";
    link.className = "admin-corner-tab";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (window.location.pathname !== "/Admin/") {
        history.pushState({}, "", "/Admin/");
      }
      queueAdminPageMount();
    });
    document.body.appendChild(link);
  }

  async function mountAdminNavLinkIfNeeded() {
    if (getAdminRouteSegment() === "admin") return;
    if (!(document.body instanceof HTMLElement)) return;
    if (document.querySelector(".admin-page-shell")) return;
    injectAdminNavLink();
  }

  function queueAdminNavLink() {
    if (adminNavQueued) return;
    adminNavQueued = true;
    window.requestAnimationFrame(async () => {
      adminNavQueued = false;
      await mountAdminNavLinkIfNeeded();
    });
  }

  function formatDate(date) {
    if (!date) return "-";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function readLocalBookings() {
    try {
      const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeLocalBookings(bookings) {
    try {
      localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(Array.isArray(bookings) ? bookings : []));
    } catch {}
  }

  function upsertLocalBooking(booking) {
    const list = readLocalBookings();
    const id = booking.id || ("local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
    const normalized = {
      id,
      guest_name: booking.guest_name || "",
      guest_phone: booking.guest_phone || "",
      guest_email: booking.guest_email || "",
      date: booking.date || "",
      time_slot: booking.time_slot || "",
      notes: booking.notes || "",
      sauna_name: booking.sauna_name || "",
      status: booking.status || "confirmed",
      source: "local"
    };

    const idx = list.findIndex((b) => b.id === id || (
      b.guest_email && normalized.guest_email &&
      b.guest_email === normalized.guest_email &&
      b.date === normalized.date &&
      b.time_slot === normalized.time_slot
    ));

    if (idx >= 0) list[idx] = { ...list[idx], ...normalized };
    else list.unshift(normalized);

    writeLocalBookings(list);
    return normalized;
  }

  function removeLocalBooking(id) {
    const list = readLocalBookings().filter((b) => b.id !== id);
    writeLocalBookings(list);
  }

  function extractBookingFromPage() {
    const textValue = (selector) => {
      const el = document.querySelector(selector);
      return (el?.textContent || "").trim();
    };

    const inputByPlaceholder = (placeholderText) => {
      const node = Array.from(document.querySelectorAll("input, textarea")).find((el) => {
        const ph = (el.getAttribute("placeholder") || "").toLowerCase();
        return ph.includes(placeholderText);
      });
      return node ? node.value.trim() : "";
    };

    const dateText = textValue('.sticky .space-y-3 div:nth-child(2) span:last-child');
    const timeText = textValue('.sticky .space-y-3 div:nth-child(3) span:last-child');
    const saunaText = textValue('.sticky .space-y-3 div:nth-child(1) span:last-child') || textValue('h1');

    return {
      guest_name: inputByPlaceholder('john doe'),
      guest_email: inputByPlaceholder('john@example.com'),
      guest_phone: inputByPlaceholder('(555)') || inputByPlaceholder('555'),
      notes: inputByPlaceholder('special requests'),
      date: dateText,
      time_slot: timeText,
      sauna_name: saunaText,
      status: "confirmed"
    };
  }

  function startBookingSuccessWatcher() {
    if (!pendingLocalBooking || pendingBookingPollId !== null) return;

    let attempts = 0;
    pendingBookingPollId = window.setInterval(() => {
      attempts += 1;
      const confirmed = Array.from(document.querySelectorAll('h1, h2, h3')).some((el) =>
        /booking confirmed/i.test(el.textContent || "")
      );

      if (confirmed) {
        upsertLocalBooking(pendingLocalBooking);
        pendingLocalBooking = null;
        if (pendingBookingPollId !== null) {
          window.clearInterval(pendingBookingPollId);
          pendingBookingPollId = null;
        }
        return;
      }

      if (attempts > 40) {
        if (pendingBookingPollId !== null) {
          window.clearInterval(pendingBookingPollId);
          pendingBookingPollId = null;
        }
      }
    }, 250);
  }

  function attachBookingCaptureListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest('button');
      if (!(btn instanceof HTMLButtonElement)) return;
      const label = (btn.textContent || "").trim().toLowerCase();
      if (!/confirm booking/.test(label)) return;

      const draft = extractBookingFromPage();
      if (!draft.guest_email && !draft.guest_name) return;
      pendingLocalBooking = draft;
      startBookingSuccessWatcher();
    }, true);
  }

  function showAdminMessage(msg, isError = false) {
    const el = document.getElementById("admin-status");
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? "admin-status error" : "admin-status";
  }

  function setAdminDataMode(mode) {
    const el = document.getElementById("admin-data-mode");
    if (!el) return;
    if (mode === "local_only") {
      el.textContent = "Data: Local only";
      el.className = "admin-data-mode local-only";
      return;
    }
    el.textContent = "Data: Remote + Local";
    el.className = "admin-data-mode remote-local";
  }


  function normalizeVisitLogsResponse(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.events)) return payload.events;
    return [];
  }

  function getLogTimestamp(entry) {
    return (
      entry?.timestamp ||
      entry?.created_at ||
      entry?.createdAt ||
      entry?.created_date ||
      entry?.date ||
      null
    );
  }

  function getLogUserKey(entry, idx) {
    return (
      entry?.user_id ||
      entry?.userId ||
      entry?.actor_id ||
      entry?.actorId ||
      "anon_" + idx
    );
  }

  function buildVisitBuckets(range) {
    const now = new Date();
    const buckets = [];

    if (range === "day") {
      for (let i = 23; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setHours(now.getHours() - i, 0, 0, 0);
        const key = d.toISOString().slice(0, 13);
        buckets.push({ key, label: d.toLocaleTimeString([], { hour: "numeric" }), users: new Set() });
      }
      return buckets;
    }

    if (range === "week") {
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        buckets.push({ key, label: d.toLocaleDateString([], { weekday: "short" }), users: new Set() });
      }
      return buckets;
    }

    if (range === "month") {
      for (let i = 29; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        buckets.push({ key, label: d.toLocaleDateString([], { month: "short", day: "numeric" }), users: new Set() });
      }
      return buckets;
    }

    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      buckets.push({ key, label: d.toLocaleDateString([], { month: "short" }), users: new Set() });
    }
    return buckets;
  }

  function keyForRange(dateObj, range) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
    if (range === "day") return dateObj.toISOString().slice(0, 13);
    if (range === "week" || range === "month") return dateObj.toISOString().slice(0, 10);
    return dateObj.getFullYear() + "-" + String(dateObj.getMonth() + 1).padStart(2, "0");
  }

  function aggregateVisitLogs(logs, range) {
    const buckets = buildVisitBuckets(range);
    const byKey = new Map(buckets.map((b) => [b.key, b]));

    logs.forEach((entry, idx) => {
      const rawTs = getLogTimestamp(entry);
      if (!rawTs) return;
      const d = new Date(rawTs);
      const key = keyForRange(d, range);
      if (!key) return;
      const bucket = byKey.get(key);
      if (!bucket) return;
      bucket.users.add(String(getLogUserKey(entry, idx)));
      bucket.visits = (bucket.visits || 0) + 1;
    });

    return buckets.map((b) => ({
      label: b.label,
      unique: b.users.size,
      visits: Number(b.visits || 0),
    }));
  }

  function renderVisitBars(points) {
    const chart = document.getElementById("admin-visits-chart");
    const totalEl = document.getElementById("admin-visits-total");
    if (!(chart instanceof HTMLElement) || !(totalEl instanceof HTMLElement)) return;

    chart.innerHTML = "";
    const max = Math.max(1, ...points.map((p) => Math.max(Number(p.unique || 0), Number(p.visits || 0))));
    const totalUnique = points.reduce((sum, p) => sum + Number(p.unique || 0), 0);
    const totalVisits = points.reduce((sum, p) => sum + Number(p.visits || 0), 0);
    totalEl.textContent = "Unique users: " + totalUnique + " | Total visits: " + totalVisits;

    points.forEach((p) => {
      const item = document.createElement("div");
      item.className = "admin-visit-item";

      const value = document.createElement("span");
      value.className = "admin-visit-value";
      value.textContent = String(Number(p.unique || 0)) + "/" + String(Number(p.visits || 0));

      const bars = document.createElement("div");
      bars.className = "admin-visit-bars";

      const uniqueBar = document.createElement("div");
      uniqueBar.className = "admin-visit-bar unique";
      uniqueBar.style.height = Math.max(8, Math.round((Number(p.unique || 0) / max) * 120)) + "px";
      uniqueBar.title = p.label + " unique users: " + Number(p.unique || 0);

      const visitBar = document.createElement("div");
      visitBar.className = "admin-visit-bar visits";
      visitBar.style.height = Math.max(8, Math.round((Number(p.visits || 0) / max) * 120)) + "px";
      visitBar.title = p.label + " total visits: " + Number(p.visits || 0);

      bars.appendChild(uniqueBar);
      bars.appendChild(visitBar);

      const label = document.createElement("span");
      label.className = "admin-visit-label";
      label.textContent = p.label;

      item.appendChild(value);
      item.appendChild(bars);
      item.appendChild(label);
      chart.appendChild(item);
    });
  }

  function setVisitStatus(text, isError = false) {
    const el = document.getElementById("admin-visits-status");
    if (!el) return;
    el.textContent = text;
    el.className = isError ? "admin-visits-status error" : "admin-visits-status";
  }

  function setVisitRangeActive(range) {
    document.querySelectorAll("[data-visit-range]").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const active = btn.getAttribute("data-visit-range") === range;
      btn.classList.toggle("active", active);
    });
  }

  async function loadAndRenderVisitStats(range = "week") {
    setVisitRangeActive(range);
    setVisitStatus("Loading visit analytics...");

    try {
      const raw = await apiRequest("/app-logs/" + ADMIN_APP_ID + "?limit=5000");
      const logs = normalizeVisitLogsResponse(raw);
      const points = aggregateVisitLogs(logs, range);
      renderVisitBars(points);
      setVisitStatus("Visit analytics loaded.");
    } catch (err) {
      renderVisitBars(buildVisitBuckets(range).map((b) => ({ label: b.label, unique: 0, visits: 0 })));
      setVisitStatus("Visit analytics unavailable.", true);
    }
  }

  function renderAdminRows(bookings) {
    const body = document.getElementById("admin-bookings-body");
    if (!body) return;
    body.innerHTML = "";

    if (!Array.isArray(bookings) || bookings.length === 0) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="8" class="admin-empty">No reservations found.</td>';
      body.appendChild(row);
      return;
    }

    bookings.forEach((b) => {
      const row = document.createElement("tr");
      row.className = "admin-row";

      row.innerHTML = `
        <td>${b.guest_name || "-"}</td>
        <td>${b.guest_phone || "-"}</td>
        <td>${b.guest_email || "-"}</td>
        <td>${formatDate(b.date)}</td>
        <td>${b.time_slot || "-"}</td>
        <td class="admin-notes">${b.notes || "-"}</td>
        <td>${b.sauna_name || "-"}</td>
        <td class="admin-actions">
          <button type="button" class="admin-btn admin-btn-edit" data-id="${b.id}">Edit</button>
          <button type="button" class="admin-btn admin-btn-delete" data-id="${b.id}">Delete</button>
        </td>
      `;

      body.appendChild(row);
    });
  }

  function openEditModal(booking) {
    const modal = document.getElementById("admin-edit-modal");
    if (!modal) return;
    modal.classList.add("open");
    const setVal = (id, value) => { const input = document.getElementById(id); if (input) input.value = value || ""; };
    setVal("edit-booking-id", booking.id);
    setVal("edit-guest-name", booking.guest_name);
    setVal("edit-guest-phone", booking.guest_phone);
    setVal("edit-guest-email", booking.guest_email);
    setVal("edit-date", booking.date);
    setVal("edit-time-slot", booking.time_slot);
    setVal("edit-notes", booking.notes);
  }

  function closeEditModal() {
    const modal = document.getElementById("admin-edit-modal");
    if (modal) modal.classList.remove("open");
  }

  async function loadAndRenderBookings() {
    showAdminMessage("Loading reservations...");

    const local = readLocalBookings();
    let remote = [];
    let remoteError = null;

    try {
      const data = await apiRequest("/entities/Booking?limit=500&sort=-date");
      remote = Array.isArray(data) ? data : [];
      remote.forEach((item) => upsertLocalBooking(item));
    } catch (err) {
      remoteError = err;
    }

    const mergedById = new Map();
    [...remote, ...local].forEach((b) => {
      if (!b || !b.id) return;
      mergedById.set(b.id, { ...mergedById.get(b.id), ...b });
    });

    const bookings = Array.from(mergedById.values());
    bookings.sort((a, b) => {
      const ad = String(a.date || "");
      const bd = String(b.date || "");
      if (ad === bd) return String(a.time_slot || "").localeCompare(String(b.time_slot || ""));
      return bd.localeCompare(ad);
    });

    renderAdminRows(bookings);

    if (remoteError) {
      setAdminDataMode("local_only");
      showAdminMessage("Loaded local reservations only (remote list unavailable).", true);
    } else {
      setAdminDataMode("remote_local");
      showAdminMessage("Loaded " + bookings.length + " reservation(s).");
    }

    return bookings;
  }

  function bindAdminEvents(state) {
    const body = document.getElementById("admin-bookings-body");
    const refresh = document.getElementById("admin-refresh-btn");
    const close = document.getElementById("admin-edit-cancel");
    const form = document.getElementById("admin-edit-form");
    const rangeButtons = document.querySelectorAll("[data-visit-range]");
    let activeRange = "week";

    if (refresh) refresh.addEventListener("click", async () => {
      try {
        state.bookings = await loadAndRenderBookings();
        await loadAndRenderVisitStats(activeRange);
      } catch (err) {
        showAdminMessage(err.message || "Failed to load reservations.", true);
      }
    });

    rangeButtons.forEach((btn) => btn.addEventListener("click", async () => {
      const range = btn.getAttribute("data-visit-range") || "week";
      activeRange = range;
      await loadAndRenderVisitStats(range);
    }));

    if (close) close.addEventListener("click", closeEditModal);

    if (body) body.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.getAttribute("data-id");
      if (!id) return;
      if (target.classList.contains("admin-btn-edit")) {
        const booking = state.bookings.find((b) => b.id === id);
        if (booking) openEditModal(booking);
        return;
      }
      if (target.classList.contains("admin-btn-delete")) {
        if (!window.confirm("Delete this reservation?")) return;
        try {
          await apiRequest("/entities/Booking/" + id, { method: "DELETE" });
          state.bookings = state.bookings.filter((b) => b.id !== id);
          renderAdminRows(state.bookings);
          showAdminMessage("Reservation deleted.");
        } catch (err) {
          showAdminMessage(err.message || "Delete failed.", true);
        }
      }
    });

    if (form) form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = document.getElementById("edit-booking-id")?.value;
      if (!id) return;
      const payload = {
        guest_name: document.getElementById("edit-guest-name")?.value || "",
        guest_phone: document.getElementById("edit-guest-phone")?.value || "",
        guest_email: document.getElementById("edit-guest-email")?.value || "",
        date: document.getElementById("edit-date")?.value || "",
        time_slot: document.getElementById("edit-time-slot")?.value || "",
        notes: document.getElementById("edit-notes")?.value || ""
      };
      try {
        let updated = payload;
        if (!String(id).startsWith("local_")) {
          updated = await apiRequest("/entities/Booking/" + id, { method: "PUT", body: JSON.stringify(payload) });
        }
        const merged = { id, ...updated };
        upsertLocalBooking(merged);
        state.bookings = state.bookings.map((b) => (b.id === id ? { ...b, ...merged } : b));
        renderAdminRows(state.bookings);
        closeEditModal();
        showAdminMessage("Reservation updated.");
      } catch (err) {
        showAdminMessage(err.message || "Update failed.", true);
      }
    });
  }

  async function mountAdminPageIfNeeded() {
    if (getAdminRouteSegment() !== "admin") return;
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;
    if (adminMounted && root.querySelector(".admin-page-shell")) return;

    adminMounted = true;
    root.innerHTML = `
      <section class="admin-page-shell">
        <header class="admin-page-header">
          <h1>Admin Reservations</h1>
          <p>Manage scheduled sauna visits.</p>
          <div class="admin-header-actions">
            <button id="admin-refresh-btn" type="button" class="admin-btn">Refresh</button>
            <a href="/" class="admin-btn admin-btn-link">Home</a>
          </div>
          <div class="admin-status-row"><div id="admin-status" class="admin-status">Checking access...</div><div id="admin-data-mode" class="admin-data-mode">Data: Loading...</div></div>
        </header>

        <section class="admin-visits-panel">
          <div class="admin-visits-head">
            <h2>Visitor Trend</h2>
            <div class="admin-visits-controls">
              <button type="button" class="admin-btn admin-range-btn active" data-visit-range="day">Day</button>
              <button type="button" class="admin-btn admin-range-btn" data-visit-range="week">Week</button>
              <button type="button" class="admin-btn admin-range-btn" data-visit-range="month">Month</button>
              <button type="button" class="admin-btn admin-range-btn" data-visit-range="year">Year</button>
            </div>
          </div>
          <div class="admin-visits-legend">
            <span class="admin-legend-item"><i class="admin-legend-dot unique"></i> Unique users</span>
            <span class="admin-legend-item"><i class="admin-legend-dot visits"></i> Total visits</span>
          </div>
          <div id="admin-visits-total" class="admin-visits-total">Unique users: 0</div>
          <div id="admin-visits-chart" class="admin-visits-chart"></div>
          <div id="admin-visits-status" class="admin-visits-status">Loading visit analytics...</div>
        </section>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Date</th>
                <th>Time</th>
                <th>Notes</th>
                <th>Sauna</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-bookings-body"></tbody>
          </table>
        </div>
      </section>

      <section id="admin-edit-modal" class="admin-edit-modal">
        <div class="admin-edit-panel">
          <h2>Edit Reservation</h2>
          <form id="admin-edit-form" class="admin-edit-form">
            <input id="edit-booking-id" type="hidden" />
            <label>Name<input id="edit-guest-name" type="text" /></label>
            <label>Phone<input id="edit-guest-phone" type="text" /></label>
            <label>Email<input id="edit-guest-email" type="email" /></label>
            <label>Date<input id="edit-date" type="date" /></label>
            <label>Time<input id="edit-time-slot" type="text" placeholder="e.g. 2:00 PM" /></label>
            <label>Notes<textarea id="edit-notes" rows="4"></textarea></label>
            <div class="admin-edit-actions">
              <button type="button" id="admin-edit-cancel" class="admin-btn">Cancel</button>
              <button type="submit" class="admin-btn admin-btn-edit">Save</button>
            </div>
          </form>
        </div>
      </section>
    `;

    try {
      const me = await apiRequest("/entities/User/me");
      if (!me || me.role !== "admin") {
        root.innerHTML = `
          <section class="admin-page-shell admin-denied">
            <h1>Admin Access Required</h1>
            <p>Only admin users can view this page.</p>
            <a href="/" class="admin-btn admin-btn-link">Home</a>
          </section>
        `;
        return;
      }

      const state = { bookings: [] };
      bindAdminEvents(state);
      state.bookings = await loadAndRenderBookings();
      await loadAndRenderVisitStats("week");
    } catch (err) {
      showAdminMessage(err.message || "Failed to initialize admin page.", true);
    }
  }

  function queueAdminPageMount() {
    if (adminMountQueued) return;
    adminMountQueued = true;
    window.requestAnimationFrame(() => {
      adminMountQueued = false;
      mountAdminPageIfNeeded();
    });
  }

  // Batches mutation-driven scans to one pass per animation frame.
  function queueMarkTempGaugeContainers() {
    if (markQueued) return;
    markQueued = true;
    window.requestAnimationFrame(() => {
      markQueued = false;
      markTempGaugeContainers();
    });
  }

  // Animation-frame maintenance loop to prevent drift and refresh overlays.
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
    const hosts = document.querySelectorAll(".temp-gauge-host");
    hosts.forEach((host) => {
      hardLockGaugeWrapper(host);
    });

    refreshGaugeVisuals();
    rafId = window.requestAnimationFrame(lockXAxis);
  }

  const observer = new MutationObserver(() => {
    queueMarkTempGaugeContainers();
    queueAdminPageMount();
    queueAdminNavLink();
    attachBookingCaptureListener();
  });

  // Entry point: run startup visuals, initial scan, and observers.
  function init() {
    runStartupSteamEffect();
    markTempGaugeContainers();
    queueAdminPageMount();
    queueAdminNavLink();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (rafId === null) rafId = window.requestAnimationFrame(lockXAxis);
  }

  // Recalculate width locks after viewport changes.
  window.addEventListener("resize", () => {
    document.querySelectorAll(".temp-gauge-host").forEach((host) => {
      if (!(host instanceof HTMLElement)) return;
      delete host.dataset.lockWidth;
      fixHostWidth(host);
      hardLockGaugeWrapper(host);
    });
  });

  window.addEventListener("popstate", () => {
    queueAdminPageMount();
    queueAdminNavLink();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
