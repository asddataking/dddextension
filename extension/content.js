/**
 * Content script: injected on Analyze. Handles DDD_ANALYZE (parse + score + badges/panel) and DDD_CLEAR.
 * Depends on parseItemsFromDOM (parse.js) and scoreItem (scoring.js) loaded before this script.
 */
(function () {
  "use strict";
  const setRunAnalyzeFallback = (err) => {
    if (typeof window !== "undefined") {
      window.__dddRunAnalyze = function (payload) {
        return Promise.resolve({
          ok: false,
          items: [],
          count: 0,
          parser: (payload && payload.site) || "unknown",
          loadError: String(err && err.message || err),
        });
      };
    }
  };
  try {
const STYLE_ID = "ddd-checker-style";

function injectDDDCheckerStyles() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      resolve();
      return;
    }
    chrome.runtime.sendMessage({ type: "DDD_GET_CSS" }, (r) => {
      try {
        const root = document.head || document.documentElement;
        if (!root) { resolve(); return; }
        const old = document.getElementById(STYLE_ID);
        if (old) old.remove();
        document.querySelectorAll("style").forEach((s) => {
          if (s.id !== STYLE_ID && s.textContent && s.textContent.includes(".ddd-sidebar-modal")) s.remove();
        });
        if (r && r.css) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = r.css;
          root.appendChild(style);
          if (typeof window !== "undefined") window.__dddCssVersion = (r.version || "?") + "-" + Date.now().toString(36).slice(-6);
        }
      } catch (_) {}
      resolve();
    });
  });
}
injectDDDCheckerStyles();

const DEBUG = false;

/** Find element by selector, traversing into shadow roots (Dutchie/Weedmaps use shadow DOM). */
function querySelectorIncludingShadow(root, selector) {
  if (!root) return null;
  const dataIdMatch = selector && selector.match(/^\[data-ddd-id="([^"]+)"\]$/);
  const targetDataId = dataIdMatch ? dataIdMatch[1] : null;

  const findByAttr = (node) => {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (targetDataId && el.getAttribute && el.getAttribute("data-ddd-id") === targetDataId) return el;
      if (el.shadowRoot) {
        const found = findByAttr(el.shadowRoot);
        if (found) return found;
      }
      for (const c of el.children || []) {
        const r = findByAttr(c);
        if (r) return r;
      }
      return null;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === 11) {
      for (const c of node.children || node.childNodes || []) {
        const r = findByAttr(c);
        if (r) return r;
      }
    }
    return null;
  };

  try {
    const direct = root.querySelector(selector);
    if (direct) return direct;
  } catch (_) {}
  const walk = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node;
    if (el.shadowRoot) {
      try {
        const inShadow = el.shadowRoot.querySelector(selector);
        if (inShadow) return inShadow;
      } catch (_) {}
      if (targetDataId) {
        const byAttr = findByAttr(el.shadowRoot);
        if (byAttr) return byAttr;
      }
      for (const child of el.shadowRoot.children || []) {
        const r = walk(child);
        if (r) return r;
      }
    }
    for (const child of el.children || []) {
      const r = walk(child);
      if (r) return r;
    }
    return null;
  };
  if (targetDataId) {
    const byAttr = findByAttr(root);
    if (byAttr) return byAttr;
  }
  for (const child of (root.children || root.childNodes || [])) {
    const r = walk(child);
    if (r) return r;
  }
  return null;
}

/** Ensure badge styles exist in the given root (document or ShadowRoot). */
function ensureBadgeStylesInRoot(root, site) {
  if (!root || root.__dddBadgeStylesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent =
      ".ddd-badge{position:absolute;bottom:10px;left:10px;top:auto;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;z-index:2147483642;line-height:1.2;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer;border:none;font-family:inherit;text-align:left}" +
      ".ddd-badge:hover{filter:brightness(1.05)}" +
      ".ddd-worth{background:#059669;color:#fff}" +
      ".ddd-mid{background:#d97706;color:#fff}" +
      ".ddd-taxed{background:#dc2626;color:#fff}" +
      (site === "dutchie"
        ? ".ddd-badge-dutchie{font-family:system-ui,sans-serif;border-radius:10px;padding:6px 12px}.ddd-badge-dutchie.ddd-worth{background:#059669}.ddd-badge-dutchie.ddd-mid{background:#ea580c}.ddd-badge-dutchie.ddd-taxed{background:#dc2626}"
        : ".ddd-badge-weedmaps{font-family:system-ui,sans-serif;border-radius:6px;padding:5px 10px;font-weight:700}.ddd-badge-weedmaps.ddd-worth{background:#16a34a}.ddd-badge-weedmaps.ddd-mid{background:#e8590c}.ddd-badge-weedmaps.ddd-taxed{background:#c92a2a}");
    (root.head || root).appendChild(style);
    root.__dddBadgeStylesInjected = true;
  } catch (_) {}
}

/** Find all elements by selector, traversing into shadow roots. */
function querySelectorAllIncludingShadow(root, selector) {
  const out = [];
  if (!root) return out;
  try {
    root.querySelectorAll(selector).forEach((el) => out.push(el));
  } catch (_) {}
  const walk = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (el.shadowRoot) {
      try {
        el.shadowRoot.querySelectorAll(selector).forEach((e) => out.push(e));
      } catch (_) {}
      for (const child of el.shadowRoot.children || []) walk(child);
    }
    for (const child of el.children || []) walk(child);
  };
  for (const child of (root.children || root.childNodes || [])) walk(child);
  return out;
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "DDD_ANALYZE") {
      runAnalyze(message.payload)
        .then(sendResponse)
        .catch((err) => {
          if (DEBUG) console.warn("[DDD content] analyze error", err);
          sendResponse({ ok: false, error: (err && err.message) || "Analyze failed", items: [], count: 0, parser: message.payload?.site || "unknown" });
        });
      return true;
    }
    if (message.type === "DDD_CLEAR") {
      clearBadges();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "DDD_V2_STATUS") {
      if (typeof window !== "undefined" && typeof window.__dddUpdateV2Status === "function") {
        window.__dddUpdateV2Status(message.status || "Idle");
      }
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "DDD_V2_NORMALIZED") {
      if (typeof window !== "undefined" && typeof window.__dddUpdateV2Normalized === "function") {
        window.__dddUpdateV2Normalized(message.normalized || null);
      }
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "DDD_V2_COMPARISONS") {
      if (typeof window !== "undefined" && typeof window.__dddUpdateBetterNearby === "function") {
        window.__dddUpdateBetterNearby(message.comparisons || null);
      }
      sendResponse({ ok: true });
      return true;
    }
  });
}

/**
 * @param {{ site: string }} payload
 * @returns {Promise<{ ok: boolean, items: Array, count: number, parser: string }>}
 */
async function runAnalyze(payload) {
  const site = payload?.site || "unknown";
  if (site !== "weedmaps" && site !== "dutchie") {
    return { ok: false, items: [], count: 0, parser: site };
  }

  clearBadges();

  let items = [];
  try {
    // Dutchie: SPA often renders product list after load; poll parse until items found or timeout (15s)
    if (site === "dutchie" && typeof parseItemsFromDOM === "function") {
      const maxAttempts = 30;
      const intervalMs = 500;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        items = parseItemsFromDOM(site);
        if (items.length > 0) break;
        if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
      }
    } else {
      items = typeof parseItemsFromDOM === "function" ? parseItemsFromDOM(site) : [];
    }
  } catch (e) {
    if (DEBUG) console.warn("[DDD content] parse error", e);
  }

  const formatMetric = (score) => {
    if (!score || score.metricLabel == null || score.metricValue == null) return "";
    const v = score.metricValue;
    const val = Number(v) === Math.round(v) ? String(Math.round(v)) : v.toFixed(2);
    if (score.metricLabel === "$/g") return "$" + val + "/g";
    if (score.metricLabel === "$/100mg") return "$" + val + "/100mg";
    return score.metricLabel + " " + val;
  };
  const scoredItems = items.map((item) => {
    const score = typeof scoreItem === "function" ? scoreItem(item) : { badge: "mid", label: "⚠️ Mid", metricLabel: "—", metricValue: 0, reason: "Not enough info" };
    return { ...item, score };
  });

  let badgesPlaced = 0;
  const panelItems = [];

  const badgedCards = new Set();
  const root = document.body || document.documentElement;

  for (const row of scoredItems) {
    const { nodeSelector, score } = row;
    const label = score.label || "⚠️ Mid";
    const metricText = formatMetric(score);

    if (nodeSelector) {
      try {
        const node = querySelectorIncludingShadow(root, nodeSelector);
        if (node) {
          const card = node.closest("article") || node.closest("[class*='product']") || node.closest("[class*='card']") || (node.closest("[style*='position']") || node);
          if (badgedCards.has(card)) continue;
          badgedCards.add(card);
          const cardRoot = card.getRootNode();
          if (cardRoot.host) ensureBadgeStylesInRoot(cardRoot, site);
          const cardStyle = window.getComputedStyle(card);
          if (cardStyle.position === "static") {
            card.style.position = "relative";
          }
          const badge = document.createElement("button");
          badge.type = "button";
          badge.className = "ddd-badge ddd-" + (score.badge || "mid") + " ddd-badge-" + site;
          const oneLine = metricText ? label + " " + metricText : label;
          badge.setAttribute("aria-label", "Deal: " + oneLine + " — click for details");
          badge.textContent = oneLine;
          badge.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const modal = document.querySelector(".ddd-sidebar-modal");
            if (modal) modal.classList.remove("ddd-sidebar-collapsed");
          });
          card.appendChild(badge);
          badgesPlaced++;
        } else {
          panelItems.push({ name: row.name, label, metricText });
        }
      } catch (_) {
        panelItems.push({ name: row.name, label, metricText });
      }
    } else {
      panelItems.push({ name: row.name, label, metricText });
    }
  }

  dddBadgeLog("badge placement done", {
    badgesPlaced,
    panelItems: panelItems.length,
    debug: badgeDebug,
    parseDebug: typeof window !== "undefined" && window.__dddParseDebug ? window.__dddParseDebug : null,
  });

  const isInIframe = typeof window !== "undefined" && window.self !== window.top;
  const skipSidebarInIframe = isInIframe && site === "dutchie";
  if (!skipSidebarInIframe) {
    const pageUrl = typeof document !== "undefined" && document.location ? document.location.href : "";
    await showSidebarModal(scoredItems, site, pageUrl);
  }
  if (panelItems.length > 0 || badgesPlaced === 0) {
    showFloatingPanel(scoredItems.slice(0, 10).map((r) => ({ name: r.name, label: r.score.label, metricText: formatMetric(r.score) })));
  }

  const bodyTextLength = typeof document !== "undefined" && document.body ? (document.body.innerText || "").length : 0;
  return {
    ok: true,
    items: scoredItems,
    count: scoredItems.length,
    parser: site,
    bodyTextLength,
  };
}

async function showSidebarModal(scoredItems, site, pageUrl) {
  await injectDDDCheckerStyles();
  const existing = document.querySelector(".ddd-sidebar-backdrop");
  if (existing) existing.remove();

  const siteTheme = site === "weedmaps" || site === "dutchie" ? site : "dutchie";
  const worth = scoredItems.filter((r) => r.score && r.score.badge === "worth").length;
  const mid = scoredItems.filter((r) => r.score && r.score.badge === "mid").length;
  const taxed = scoredItems.filter((r) => r.score && r.score.badge === "taxed").length;

  let v2Status = "Idle";
  const hostname = (() => { try { return new URL(pageUrl || "").hostname || ""; } catch (_) { return ""; } })();
  const baseList = scoredItems.slice(0, 100);
  const listItemsWithRef = baseList.map((r, i) => {
    let productType = r.productType || "other";
    let bulkFlower = r.isBulkFlower;
    if (typeof inferProductType === "function" && r.rawText) {
      productType = inferProductType(r.rawText, r.weightGrams, r.mgTotal);
      if (productType === "flower" && typeof isBulkFlower === "function") {
        bulkFlower = isBulkFlower(r.rawText, productType);
      }
    }
    return {
      ...r,
      productType,
      isBulkFlower: productType === "flower" ? bulkFlower : undefined,
      client_ref: typeof makeClientRef === "function" ? makeClientRef(r, i, hostname) : "ddd-" + i,
    };
  });

  const backdrop = document.createElement("div");
  backdrop.className = "ddd-sidebar-backdrop ddd-site-" + siteTheme;
  backdrop.setAttribute("aria-label", "Daily Dispo Deals");
  backdrop.setAttribute("data-ddd-site", siteTheme);

  const sidebar = document.createElement("div");
  sidebar.className = "ddd-sidebar-modal ddd-root ddd-sidebar-collapsed ddd-site-" + siteTheme;

  const header = document.createElement("div");
  header.className = "ddd-sidebar-header";
  const headerLeft = document.createElement("div");
  headerLeft.className = "ddd-sidebar-header-left";
  const logoImg = document.createElement("img");
  logoImg.className = "ddd-sidebar-logo";
  logoImg.alt = "";
  logoImg.setAttribute("width", "24");
  logoImg.setAttribute("height", "24");
  logoImg.onerror = function () { this.style.visibility = "hidden"; this.style.width = "0"; this.style.height = "0"; this.style.margin = "0"; this.style.padding = "0"; };
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "DDD_GET_LOGO" }, (r) => {
      if (r && r.logoDataUrl) logoImg.src = r.logoDataUrl;
    });
  }
  const titleWrap = document.createElement("div");
  titleWrap.className = "ddd-sidebar-title-wrap";
  const titleEl = document.createElement("h2");
  titleEl.className = "ddd-sidebar-title";
  titleEl.textContent = "DDD Checker";
  headerLeft.appendChild(logoImg);
  titleWrap.appendChild(titleEl);
  headerLeft.appendChild(titleWrap);
  const builtIn = document.createElement("div");
  builtIn.className = "ddd-sidebar-built-in";
  builtIn.textContent = "Built in Michigan";
  headerLeft.appendChild(builtIn);
  if (typeof DEV_SHOW_CSS_VERSION !== "undefined" && DEV_SHOW_CSS_VERSION && typeof window !== "undefined" && window.__dddCssVersion) {
    const cssStamp = document.createElement("span");
    cssStamp.className = "ddd-sidebar-css-version";
    cssStamp.textContent = "css: " + window.__dddCssVersion;
    headerLeft.appendChild(cssStamp);
  }

  const statusWrap = document.createElement("div");
  statusWrap.className = "ddd-sidebar-status-wrap";
  const statusDot = document.createElement("span");
  statusDot.className = "ddd-sidebar-status-dot ddd-status-synced";
  const statusLabel = document.createElement("span");
  statusLabel.className = "ddd-sidebar-status-label";
  statusLabel.textContent = "Synced";
  statusWrap.appendChild(statusDot);
  statusWrap.appendChild(statusLabel);

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "ddd-sidebar-retry-btn";
  retryBtn.textContent = "Retry";
  retryBtn.style.display = "none";
  retryBtn.addEventListener("click", () => {
    if (typeof triggerV2Ingest === "function" && typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab && tab.id) triggerV2Ingest(tab.id, site, scoredItems, pageUrl || "");
      });
    } else if (typeof mapToIngestPayload === "function" && typeof getOrCreateInstallId === "function") {
      getOrCreateInstallId().then((installId) => {
        const payload = mapToIngestPayload(site, scoredItems, pageUrl || "");
        chrome.runtime.sendMessage({ type: "DDD_V2_INGEST", payload: { ingestPayload: payload, installId } }, (r) => {
          if (r && r.ok && r.normalized) {
            updateV2Status("Normalized ✓");
            if (typeof window.__dddUpdateV2Normalized === "function") window.__dddUpdateV2Normalized(r.normalized);
            if (r.comparisons && typeof window.__dddUpdateBetterNearby === "function") window.__dddUpdateBetterNearby(r.comparisons);
          } else {
            updateV2Status("Failed");
          }
        });
      }).catch(() => updateV2Status("Failed"));
    }
  });

  const closeBtn = document.createElement("button");
  closeBtn.id = "ddd-sidebar-close-btn";
  closeBtn.name = "ddd-sidebar-close";
  closeBtn.className = "ddd-sidebar-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", () => backdrop.remove());

  const expandTab = document.createElement("button");
  expandTab.type = "button";
  expandTab.className = "ddd-sidebar-expand-tab";
  expandTab.setAttribute("aria-label", "Open Daily Dispo Deals");
  expandTab.innerHTML = "<span class=\"ddd-sidebar-tab-text\">DDD Checker</span><span class=\"ddd-sidebar-tab-counts\">" + worth + " / " + mid + " / " + taxed + "</span>";
  expandTab.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.remove("ddd-sidebar-collapsed");
  });

  header.appendChild(headerLeft);
  header.appendChild(statusWrap);
  header.appendChild(retryBtn);
  header.appendChild(closeBtn);
  header.appendChild(expandTab);
  sidebar.appendChild(header);

  const sidebarBody = document.createElement("div");
  sidebarBody.className = "ddd-sidebar-body";
  sidebar.appendChild(sidebarBody);

  const sidebarScroll = document.createElement("div");
  sidebarScroll.className = "ddd-sidebar-scroll";
  sidebarBody.appendChild(sidebarScroll);

  const summaryWrap = document.createElement("div");
  summaryWrap.className = "ddd-sidebar-summary-wrap";
  const summary = document.createElement("div");
  summary.className = "ddd-sidebar-summary-pills";
  summary.innerHTML =
    "<div class=\"ddd-sidebar-pill ddd-pill-worth\"><span class=\"ddd-pill-icon\">✓</span> Worth · <span class=\"ddd-pill-num\">" + worth + "</span></div>" +
    "<div class=\"ddd-sidebar-pill ddd-pill-mid\"><span class=\"ddd-pill-icon\">!</span> Mid · <span class=\"ddd-pill-num\">" + mid + "</span></div>" +
    "<div class=\"ddd-sidebar-pill ddd-pill-taxed\"><span class=\"ddd-pill-icon\">✕</span> Taxed · <span class=\"ddd-pill-num\">" + taxed + "</span></div>";
  summaryWrap.appendChild(summary);
  const infoWrap = document.createElement("div");
  infoWrap.className = "ddd-sidebar-info-wrap";
  const infoContent = document.createElement("div");
  infoContent.className = "ddd-sidebar-info-content";
  infoContent.innerHTML = "<p class=\"ddd-sidebar-info-line\">Menu scored by value</p><p class=\"ddd-sidebar-info-line\">" + scoredItems.length + " items</p>";
  infoWrap.appendChild(infoContent);
  summaryWrap.appendChild(infoWrap);
  const v2NormalizedWrap = document.createElement("div");
  v2NormalizedWrap.className = "ddd-sidebar-v2-normalized";
  v2NormalizedWrap.style.display = "none";
  const v2NormalizedTitle = document.createElement("div");
  v2NormalizedTitle.className = "ddd-sidebar-v2-normalized-title";
  v2NormalizedTitle.textContent = "Normalized";
  v2NormalizedWrap.appendChild(v2NormalizedTitle);
  const v2NormalizedContent = document.createElement("div");
  v2NormalizedContent.className = "ddd-sidebar-v2-normalized-content";
  v2NormalizedWrap.appendChild(v2NormalizedContent);
  summaryWrap.appendChild(v2NormalizedWrap);
  sidebarScroll.appendChild(summaryWrap);

  let comparisonsState = {
    has_better_nearby: false,
    better_count: 0,
    best_delta_percent: null,
    cta_reason: "",
    cta_url: ""
  };
  let betterNearbyDismissed = false;
  const DEFAULT_CTA_URL = "https://dailydispodeals.com/?src=ext_better_nearby";
  if (typeof DEV_BETTER_NEARBY !== "undefined" && DEV_BETTER_NEARBY) {
    comparisonsState = {
      has_better_nearby: true,
      better_count: 6,
      best_delta_percent: 22,
      cta_reason: "",
      cta_url: "https://dailydispodeals.com/signup?src=ext_better_nearby"
    };
  }

  const betterbarWrap = document.createElement("div");
  betterbarWrap.className = "ddd-betterbar";
  const betterbarInner = document.createElement("div");
  betterbarInner.className = "ddd-betterbar-inner";
  betterbarInner.setAttribute("role", "button");
  betterbarInner.setAttribute("tabindex", "0");
  const betterbarLeft = document.createElement("div");
  betterbarLeft.className = "ddd-betterbar-left";
  const betterbarTitle = document.createElement("div");
  betterbarTitle.className = "ddd-betterbar-title";
  const betterbarSub = document.createElement("div");
  betterbarSub.className = "ddd-betterbar-sub";
  const betterbarRight = document.createElement("div");
  betterbarRight.className = "ddd-betterbar-right";
  const betterbarCount = document.createElement("span");
  betterbarCount.className = "ddd-betterbar-count";
  const betterbarBtn = document.createElement("span");
  betterbarBtn.className = "ddd-betterbar-btn";
  betterbarBtn.textContent = "View";
  const betterbarDismiss = document.createElement("button");
  betterbarDismiss.type = "button";
  betterbarDismiss.className = "ddd-betterbar-dismiss";
  betterbarDismiss.setAttribute("aria-label", "Dismiss");
  betterbarDismiss.textContent = "×";
  betterbarLeft.appendChild(betterbarTitle);
  betterbarLeft.appendChild(betterbarSub);
  betterbarRight.appendChild(betterbarCount);
  betterbarRight.appendChild(betterbarBtn);
  betterbarRight.appendChild(betterbarDismiss);
  betterbarInner.appendChild(betterbarLeft);
  betterbarInner.appendChild(betterbarRight);
  betterbarWrap.appendChild(betterbarInner);
  betterbarWrap.style.display = "none";

  const renderBetterBar = () => {
    const show = comparisonsState.has_better_nearby && !betterNearbyDismissed;
    betterbarWrap.style.display = show ? "block" : "none";
    if (!show) return;
    betterbarTitle.textContent = "Found better nearby";
    const subParts = [];
    if (comparisonsState.better_count > 0) subParts.push(comparisonsState.better_count + " better deals");
    if (comparisonsState.best_delta_percent != null) subParts.push("up to " + comparisonsState.best_delta_percent + "% cheaper");
    betterbarSub.textContent = subParts.join(" · ") || "";
    betterbarCount.textContent = comparisonsState.better_count > 0 ? String(comparisonsState.better_count) : "";
    betterbarCount.style.display = comparisonsState.better_count > 0 ? "inline-flex" : "none";
  };

  betterbarInner.addEventListener("click", (e) => {
    if (e.target === betterbarDismiss) return;
    const url = comparisonsState.cta_url || DEFAULT_CTA_URL;
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  });
  betterbarDismiss.addEventListener("click", (e) => {
    e.stopPropagation();
    betterNearbyDismissed = true;
    renderBetterBar();
  });
  betterbarInner.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      betterbarInner.click();
    }
  });

  function updateBetterNearby(comparisons) {
    if (!comparisons || typeof comparisons !== "object") return;
    comparisonsState = {
      has_better_nearby: !!comparisons.has_better_nearby,
      better_count: Math.max(0, parseInt(comparisons.better_count, 10) || 0),
      best_delta_percent: comparisons.best_delta_percent != null ? comparisons.best_delta_percent : null,
      cta_reason: String(comparisons.cta_reason || ""),
      cta_url: String(comparisons.cta_url || "").trim() || ""
    };
    renderBetterBar();
  }

  renderBetterBar();
  sidebarScroll.appendChild(betterbarWrap);
  if (typeof window !== "undefined") window.__dddUpdateBetterNearby = updateBetterNearby;

  const updateV2Status = (status) => {
    v2Status = status || "Idle";
    const s = String(v2Status);
    const isSending = s.indexOf("Sending") >= 0;
    const isFailed = s.indexOf("Failed") >= 0;
    statusLabel.textContent = isSending ? "Sending…" : isFailed ? "Failed" : "Synced";
    statusDot.className = "ddd-sidebar-status-dot " + (isSending ? "ddd-status-sending" : isFailed ? "ddd-status-failed" : "ddd-status-synced");
    retryBtn.style.display = isFailed ? "inline-block" : "none";
  };
  const updateV2Normalized = (data) => {
    v2NormalizedContent.innerHTML = "";
    if (!data || typeof data !== "object") {
      v2NormalizedWrap.style.display = "none";
      return;
    }
    const disp = data.dispensary;
    if (disp && (disp.name || disp.location)) {
      const p = document.createElement("p");
      p.className = "ddd-sidebar-info-line";
      p.textContent = (disp.name || "") + (disp.location ? " · " + disp.location : "");
      v2NormalizedContent.appendChild(p);
    }
    const deals = data.deals || [];
    for (let i = 0; i < Math.min(deals.length, 5); i++) {
      const d = deals[i];
      const div = document.createElement("div");
      div.className = "ddd-sidebar-v2-deal";
      div.textContent = (d.title || d.product_name || "") + (d.price_text ? " " + d.price_text : "") + (d.discount_text ? " " + d.discount_text : "");
      v2NormalizedContent.appendChild(div);
    }
    if (deals.length === 0 && (!disp || !disp.name)) {
      v2NormalizedWrap.style.display = "none";
      return;
    }
    v2NormalizedWrap.style.display = "block";
  };
  if (typeof window !== "undefined") {
    window.__dddUpdateV2Status = updateV2Status;
    window.__dddUpdateV2Normalized = updateV2Normalized;
  }

  const displayName = (name) => {
    let s = (name || "").trim() || "Product";
    s = s.replace(/\b(bulk[- ]?flower|pre[- ]?pack(?:aged|ed)?|hybrid|indica|sativa)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    return s.length > 56 ? s.slice(0, 53) + "…" : s;
  };
  const formatMetric = (score) => {
    if (!score || score.metricLabel == null || score.metricValue == null) return "";
    const v = score.metricValue;
    const val = Number(v) === Math.round(v) ? String(Math.round(v)) : v.toFixed(2);
    if (score.metricLabel === "$/g") return "$" + val + "/g";
    if (score.metricLabel === "$/100mg") return "$" + val + "/100mg";
    return score.metricLabel + " " + val;
  };

  const DEALS_PER_PAGE = 6;
  let categoryFilter = "All";
  const CATEGORIES = ["All", "flower", "concentrate", "edible", "vape", "preroll", "other"];
  const categoryDisplayLabel = (cat) => {
    if (cat === "All") return "All";
    const labels = { flower: "Flower", concentrate: "Concentrate", edible: "Edible", vape: "Vape", preroll: "Pre-Roll", other: "Other" };
    return labels[cat] || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Other");
  };
  let listItems = listItemsWithRef;
  let totalPages = Math.max(1, Math.ceil(listItems.length / DEALS_PER_PAGE));
  let currentPage = 1;

  const applyFilter = () => {
    listItems = categoryFilter === "All"
      ? listItemsWithRef
      : listItemsWithRef.filter((r) => (r.productType || "other") === categoryFilter);
    totalPages = Math.max(1, Math.ceil(listItems.length / DEALS_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages);
  };

  const list = document.createElement("div");
  list.className = "ddd-sidebar-list";
  list.setAttribute("data-ddd-list", "true");
  list.setAttribute("tabindex", "0");
  list.setAttribute("aria-label", "Deals list — use arrow keys to change page");
  const listHeader = document.createElement("div");
  listHeader.className = "ddd-sidebar-list-header";
  const listTitle = document.createElement("div");
  listTitle.className = "ddd-sidebar-list-title";
  listTitle.textContent = "DEALS ";
  const listSortIndicator = document.createElement("span");
  listSortIndicator.className = "ddd-sidebar-list-sort";
  listSortIndicator.innerHTML = "I/S/H- <span class=\"ddd-sidebar-sort-arrow\">▲</span>";
  listTitle.appendChild(listSortIndicator);
  const filterBtn = document.createElement("button");
  filterBtn.type = "button";
  filterBtn.className = "ddd-sidebar-filter-btn";
  filterBtn.innerHTML = "<span class=\"ddd-filter-icon\" aria-hidden=\"true\">" +
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"4\" y1=\"21\" x2=\"4\" y2=\"14\"/><line x1=\"4\" y1=\"10\" x2=\"4\" y2=\"3\"/><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"12\"/><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"3\"/><line x1=\"20\" y1=\"21\" x2=\"20\" y2=\"16\"/><line x1=\"20\" y1=\"12\" x2=\"20\" y2=\"3\"/><line x1=\"1\" y1=\"14\" x2=\"7\" y2=\"14\"/><line x1=\"9\" y1=\"8\" x2=\"15\" y2=\"8\"/><line x1=\"17\" y1=\"16\" x2=\"23\" y2=\"16\"/></svg>" +
    "</span><span class=\"ddd-filter-label\"></span>";
  const filterLabelSpan = filterBtn.querySelector(".ddd-filter-label");
  const updateFilterBtnLabel = () => {
    const isActive = categoryFilter !== "All";
    filterBtn.classList.toggle("ddd-filter-active", isActive);
    filterLabelSpan.textContent = isActive ? "Filters · " + categoryDisplayLabel(categoryFilter) : "Filters";
  };
  updateFilterBtnLabel();
  const filterDropdown = document.createElement("div");
  filterDropdown.className = "ddd-sidebar-filter-dropdown";
  filterDropdown.style.display = "none";
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "ddd-sidebar-filter-opt" + (categoryFilter === cat ? " ddd-filter-active" : "");
    opt.textContent = categoryDisplayLabel(cat);
    opt.addEventListener("click", () => {
      categoryFilter = cat;
      filterDropdown.querySelectorAll(".ddd-sidebar-filter-opt").forEach((o) => o.classList.remove("ddd-filter-active"));
      opt.classList.add("ddd-filter-active");
      filterDropdown.style.display = "none";
      updateFilterBtnLabel();
      applyFilter();
      renderPage(currentPage);
    });
    filterDropdown.appendChild(opt);
  });
  const closeFilter = (e) => {
    if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
      filterDropdown.style.display = "none";
      document.removeEventListener("click", closeFilter);
    }
  };
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = filterDropdown.style.display === "block";
    filterDropdown.style.display = isOpen ? "none" : "block";
    if (!isOpen) setTimeout(() => document.addEventListener("click", closeFilter), 0);
  });
  listHeader.appendChild(listTitle);
  listHeader.appendChild(filterBtn);
  listHeader.appendChild(filterDropdown);
  list.appendChild(listHeader);
  const listKey = document.createElement("div");
  listKey.className = "ddd-sidebar-list-key";
  listKey.innerHTML = "<span class=\"ddd-key-strain\" title=\"Indica / Sativa / Hybrid\">I/S/H</span> · <span class=\"ddd-key-bulk\" title=\"Bulk by weight\">⚖</span> <span class=\"ddd-key-prepack\" title=\"Pre-packed sealed\">▫</span>";
  list.appendChild(listKey);
  const listInner = document.createElement("div");
  listInner.className = "ddd-sidebar-list-inner";
  list.appendChild(listInner);

  const pageControls = document.createElement("div");
  pageControls.className = "ddd-sidebar-pagination";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ddd-sidebar-page-btn ddd-sidebar-page-prev";
  prevBtn.setAttribute("aria-label", "Previous page");
  prevBtn.textContent = "‹";
  const pageLabel = document.createElement("span");
  pageLabel.className = "ddd-sidebar-page-label";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ddd-sidebar-page-btn ddd-sidebar-page-next";
  nextBtn.setAttribute("aria-label", "Next page");
  nextBtn.textContent = "›";
  pageControls.appendChild(prevBtn);
  pageControls.appendChild(pageLabel);
  pageControls.appendChild(nextBtn);
  list.appendChild(pageControls);

  let overlayMap = {};
  try {
    chrome.storage.local.get("ddd_overlay_map_v1", (r) => {
      overlayMap = (r && r.ddd_overlay_map_v1) || {};
      renderPage(currentPage);
    });
  } catch (_) {}

  const strainBadge = (strain) => (strain === "indica" ? "I" : strain === "sativa" ? "S" : strain === "hybrid" ? "H" : null);

  const renderPage = (page) => {
    listInner.innerHTML = "";
    const start = (page - 1) * DEALS_PER_PAGE;
    const end = Math.min(start + DEALS_PER_PAGE, listItems.length);
    const debugOverlay = typeof DEBUG_OVERLAY !== "undefined" && DEBUG_OVERLAY;
    for (let i = start; i < end; i++) {
      const row = listItems[i];
      const overlay = overlayMap[row.client_ref] || (debugOverlay && i === start ? { title: row.name, confidence: 0.8 } : null);
      const hasOverlay = !!(overlay && (overlay.confidence >= 0.7 || debugOverlay));
      const displayTitle = (hasOverlay && overlay && overlay.title) ? overlay.title : displayName(row.name);
      const item = document.createElement("div");
      item.className = "ddd-sidebar-item ddd-item-" + (row.score ? row.score.badge : "mid") + (hasOverlay ? " has-overlay" : "");
      item.setAttribute("data-ddd-item-index", String(i));
      item.style.setProperty("--i", String(i - start));
      const badgeLabel = (b) => (b === "worth" ? "Worth it" : b === "mid" ? "Mid" : b === "taxed" ? "Taxed" : "Mid");
      const metricTextForBadge = row.score ? formatMetric(row.score) : "";
      const topRow = document.createElement("div");
      topRow.className = "ddd-sidebar-item-top";
      const badge = document.createElement("span");
      badge.className = "ddd-sidebar-item-badge ddd-value-pill ddd-" + (row.score ? row.score.badge : "mid");
      const badgeIcon = (b) => (b === "worth" ? "✓ " : b === "mid" ? "! " : b === "taxed" ? "✕ " : "! ");
      badge.textContent = badgeIcon(row.score ? row.score.badge : "mid") + badgeLabel(row.score ? row.score.badge : "mid");
      topRow.appendChild(badge);
      const strain = strainBadge(row.strainType) || (row.productType === "flower" ? "H" : null);
      const strainType = row.strainType || "hybrid";
      if (strain) {
        const strainPill = document.createElement("span");
        strainPill.className = "ddd-sidebar-strain-pill ddd-strain-" + strainType;
        strainPill.textContent = strain;
        strainPill.setAttribute("title", strainType === "indica" ? "Indica" : strainType === "sativa" ? "Sativa" : "Hybrid");
        topRow.appendChild(strainPill);
      }
      const priceEl = document.createElement("div");
      priceEl.className = "ddd-sidebar-item-price ddd-sidebar-item-metric";
      priceEl.textContent = metricTextForBadge || "";
      topRow.appendChild(priceEl);
      item.appendChild(topRow);
      const badgesRow = document.createElement("div");
      badgesRow.className = "ddd-sidebar-item-badges";
      if (row.productType === "flower") {
        const packTag = document.createElement("span");
        packTag.className = "ddd-deal-badge " + (row.isBulkFlower === true ? "ddd-badge-bulk" : "ddd-badge-prepack");
        packTag.textContent = row.isBulkFlower === true ? "⚖" : "▫";
        packTag.setAttribute("title", row.isBulkFlower === true ? "Bulk by weight" : "Pre-packed");
        badgesRow.appendChild(packTag);
      }
      item.appendChild(badgesRow);
      const info = document.createElement("div");
      info.className = "ddd-sidebar-item-info";
      const nameEl = document.createElement("div");
      nameEl.className = "ddd-sidebar-item-name";
      nameEl.textContent = displayTitle;
      info.appendChild(nameEl);
      if (row.brand) {
        const brandEl = document.createElement("div");
        brandEl.className = "ddd-sidebar-item-brand";
        brandEl.textContent = row.brand;
        info.appendChild(brandEl);
      }
      const metaParts = [];
      if (row.productType) metaParts.push(categoryDisplayLabel(row.productType));
      if (row.thc) metaParts.push(row.thc);
      if (metaParts.length > 0) {
        const metaRow = document.createElement("div");
        metaRow.className = "ddd-sidebar-item-meta-row";
        const metaLeft = document.createElement("span");
        metaLeft.className = "ddd-sidebar-item-meta";
        metaLeft.textContent = metaParts.join(" · ");
        metaRow.appendChild(metaLeft);
        info.appendChild(metaRow);
      }
      if (hasOverlay) {
        const overlayBadge = document.createElement("div");
        overlayBadge.className = "ddd-overlay-badge";
        overlayBadge.innerHTML = "<span class=\"ddd-overlay-dot\"></span> Normalized";
        info.appendChild(overlayBadge);
        const overlayChips = document.createElement("div");
        overlayChips.className = "ddd-overlay-chips";
        overlayChips.textContent = [overlay.category, overlay.strain, overlay.thc].filter(Boolean).join(" · ") || "";
        info.appendChild(overlayChips);
      }
      item.appendChild(info);
      listInner.appendChild(item);
    }
    pageLabel.textContent = "Page " + page + " of " + totalPages;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  };

  const goPrev = () => { if (currentPage > 1) { currentPage--; renderPage(currentPage); } };
  const goNext = () => { if (currentPage < totalPages) { currentPage++; renderPage(currentPage); } };
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);

  const handlePaginationKeydown = (e) => {
    const modal = document.querySelector(".ddd-sidebar-modal");
    if (!modal || modal.classList.contains("ddd-sidebar-collapsed")) return;
    if (!backdrop.contains(document.activeElement)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
  };
  backdrop.addEventListener("keydown", handlePaginationKeydown);

  renderPage(1);
  sidebarScroll.appendChild(list);

  const adsSection = document.createElement("div");
  adsSection.className = "ddd-sidebar-ads";
  adsSection.setAttribute("aria-label", "Ads");
  const adAffiliate = document.createElement("div");
  adAffiliate.className = "ddd-sidebar-ad ddd-sidebar-ad-affiliate";
  adAffiliate.setAttribute("aria-label", "Sponsored");
  adAffiliate.innerHTML = "<span class=\"ddd-sidebar-ad-label\">SPONSORED</span><span class=\"ddd-sidebar-ad-copy\">Sponsored deal — helps keep Daily Dispo Deals free</span><span class=\"ddd-sidebar-ad-placeholder\">Affiliate ad slot</span>";
  const adDispensary = document.createElement("div");
  adDispensary.className = "ddd-sidebar-ad ddd-sidebar-ad-dispensary";
  adDispensary.setAttribute("aria-label", "Featured");
  adDispensary.innerHTML = "<span class=\"ddd-sidebar-ad-label\">FEATURED</span><span class=\"ddd-sidebar-ad-copy\">Featured dispensary — limited-time promotion</span><span class=\"ddd-sidebar-ad-placeholder\">Dispensary promotion</span>";
  adsSection.appendChild(adAffiliate);
  adsSection.appendChild(adDispensary);
  sidebarBody.appendChild(adsSection);

  backdrop.appendChild(sidebar);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

function showFloatingPanel(items) {
  const existing = document.querySelector(".ddd-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.className = "ddd-panel";
  panel.setAttribute("aria-label", "Daily Dispo Deals");
  const title = document.createElement("div");
  title.className = "ddd-panel-title";
  title.textContent = "Daily Dispo Deals";
  panel.appendChild(title);
  for (const it of items) {
    const div = document.createElement("div");
    div.className = "ddd-panel-item";
    div.textContent = (it.label || "") + " " + (it.name || "").trim() + (it.metricText ? " — " + it.metricText.trim() : "");
    panel.appendChild(div);
  }
  document.body.appendChild(panel);
}

function clearBadges() {
  const root = document.body || document.documentElement;
  if (root) {
    querySelectorAllIncludingShadow(root, ".ddd-badge").forEach((el) => el.remove());
    querySelectorAllIncludingShadow(root, "[data-ddd-id]").forEach((el) => el.removeAttribute("data-ddd-id"));
  }
  document.querySelectorAll(".ddd-panel, .ddd-sidebar-backdrop").forEach((el) => el.remove());
}

function applyFromCache(payload) {
  if (!payload || !payload.items || !Array.isArray(payload.items) || !payload.site) {
    return { ok: false, count: 0 };
  }
  clearBadges();
  const site = payload.site;

  // Cached nodeSelectors are stale (data-ddd-id was set on a previous DOM). Re-parse to get fresh selectors.
  let itemsToBadge = payload.items;
  if (typeof parseItemsFromDOM === "function") {
    const freshParsed = parseItemsFromDOM(site);
    if (freshParsed.length > 0) {
      const norm = (s) => (s || "").toString().trim().toLowerCase().slice(0, 50);
      const matchKey = (item) => norm(item.name) + "|" + (item.price ?? "") + "|" + (item.weightGrams ?? "");
      const parsedByKey = new Map();
      for (const p of freshParsed) parsedByKey.set(matchKey(p), p);
      let merged = [];
      for (const cached of payload.items) {
        const key = matchKey(cached);
        const fresh = parsedByKey.get(key);
        if (fresh && fresh.nodeSelector && cached.score) {
          merged.push({ ...cached, nodeSelector: fresh.nodeSelector });
        }
      }
      // Fallback: index-based match when key match yields few results (menu order usually stable)
      if (merged.length < Math.min(payload.items.length, freshParsed.length) * 0.5) {
        merged = [];
        const n = Math.min(payload.items.length, freshParsed.length);
        for (let i = 0; i < n; i++) {
          const cached = payload.items[i];
          const fresh = freshParsed[i];
          if (fresh && fresh.nodeSelector && cached && cached.score) {
            merged.push({ ...cached, nodeSelector: fresh.nodeSelector });
          }
        }
      }
      if (merged.length > 0) itemsToBadge = merged;
    }
  }

  const formatMetric = (score) => {
    if (!score || score.metricLabel == null || score.metricValue == null) return "";
    const v = score.metricValue;
    const val = Number(v) === Math.round(v) ? String(Math.round(v)) : v.toFixed(2);
    if (score.metricLabel === "$/g") return "$" + val + "/g";
    if (score.metricLabel === "$/100mg") return "$" + val + "/100mg";
    return score.metricLabel + " " + val;
  };
  let badgesPlaced = 0;
  const badgedCards = new Set();
  for (const row of itemsToBadge) {
    const { nodeSelector, score } = row;
    if (!nodeSelector || !score) continue;
    const label = score.label || "⚠️ Mid";
    const metricText = formatMetric(score);
    try {
      const root = document.body || document.documentElement;
      const node = querySelectorIncludingShadow(root, nodeSelector);
      if (node) {
        const card = node.closest("article") || node.closest("[class*='product']") || node.closest("[class*='card']") || (node.closest("[style*='position']") || node);
        if (badgedCards.has(card)) continue;
        badgedCards.add(card);
        const cardRoot = card.getRootNode();
        if (cardRoot.host) ensureBadgeStylesInRoot(cardRoot, site);
        const cardStyle = window.getComputedStyle(card);
        if (cardStyle.position === "static") card.style.position = "relative";
        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = "ddd-badge ddd-" + (score.badge || "mid") + " ddd-badge-" + site;
        const oneLine = metricText ? label + " " + metricText : label;
        badge.setAttribute("aria-label", "Deal: " + oneLine + " — click for details");
        badge.textContent = oneLine;
        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const modal = document.querySelector(".ddd-sidebar-modal");
          if (modal) modal.classList.remove("ddd-sidebar-collapsed");
        });
        card.appendChild(badge);
        badgesPlaced++;
      }
    } catch (_) {}
  }
  return { ok: true, count: payload.items.length, badgesPlaced };
}

// Expose for popup to call via executeScript (avoids "Receiving end does not exist").
    if (typeof window !== "undefined") {
      window.__dddRunAnalyze = (payload) => runAnalyze(payload);
      window.__dddShowSidebar = (payload) => {
        if (payload && payload.scoredItems && payload.site) showSidebarModal(payload.scoredItems, payload.site, payload.pageUrl || "");
      };
      window.__dddApplyFromCache = (payload) => applyFromCache(payload);
    }
  } catch (e) {
    setRunAnalyzeFallback(e);
  }
})();
