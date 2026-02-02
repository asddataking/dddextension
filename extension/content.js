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
// Future: send extracted items to server for analyze. v1 is local-only.
const API_BASE = "https://dailydispodeals.com";
// TODO: POST API_BASE/api/analyze with device_id and items when server is ready.

const DEBUG = false;
const DEBUG_BADGES = true; // Set to false when done debugging badge placement

function dddBadgeLog(msg, data) {
  if (!DEBUG_BADGES) return;
  const payload = { msg, data, ts: Date.now() };
  console.log("[DDD badge]", msg, data != null ? data : "");
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "DDD_DEBUG_LOG",
      payload: { hypothesisId: "BADGE", location: "content.js", message: msg, data: data || {} },
    }).catch(() => {});
  }
}

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

  // #region agent log
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "DDD_DEBUG_LOG",
      payload: {
        hypothesisId: "D",
        location: "content.js:runAnalyze start",
        message: "document context",
        data: {
          site,
          docHref: typeof document !== "undefined" ? (document.location && document.location.href ? document.location.href.slice(0, 120) : "no href") : "no doc",
          hasBody: typeof document !== "undefined" && !!document.body,
          hasDocElement: typeof document !== "undefined" && !!document.documentElement,
        },
      },
    }).catch(() => {});
  }
  // #endregion

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
    // #region agent log
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: "DDD_DEBUG_LOG",
        payload: {
          hypothesisId: "C",
          location: "content.js:after parse",
          message: "parse result",
          data: { site, itemCount: items.length, parseDebug: typeof window !== "undefined" && window.__dddParseDebug ? window.__dddParseDebug : null },
        },
      }).catch(() => {});
    }
    // #endregion
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
  const badgeDebug = { withSelector: 0, nodeFound: 0, cardFound: 0, inShadow: 0, placed: 0, noSelector: 0, nodeNotFound: 0, cardSkipped: 0 };

  const badgedCards = new Set();
  const root = document.body || document.documentElement;
  dddBadgeLog("badge placement start", {
    site,
    totalItems: scoredItems.length,
    hasBody: !!document.body,
    rootTag: root ? root.tagName : "none",
    sampleSelectors: scoredItems.slice(0, 3).map((r) => r.nodeSelector),
  });

  for (const row of scoredItems) {
    const { nodeSelector, score } = row;
    const label = score.label || "⚠️ Mid";
    const metricText = formatMetric(score);

    if (nodeSelector) {
      badgeDebug.withSelector++;
      try {
        const node = querySelectorIncludingShadow(root, nodeSelector);
        if (node) {
          badgeDebug.nodeFound++;
          const card = node.closest("article") || node.closest("[class*='product']") || node.closest("[class*='card']") || (node.closest("[style*='position']") || node);
          if (badgedCards.has(card)) {
            badgeDebug.cardSkipped++;
            continue;
          }
          badgeDebug.cardFound++;
          badgedCards.add(card);
          const cardRoot = card.getRootNode();
          const inShadow = !!cardRoot.host;
          if (inShadow) badgeDebug.inShadow++;
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
          badgeDebug.placed++;
          if (badgeDebug.placed <= 2) {
            dddBadgeLog("badge placed", { name: row.name, selector: nodeSelector, inShadow, cardTag: card.tagName });
          }
        } else {
          badgeDebug.nodeNotFound++;
          if (badgeDebug.nodeNotFound <= 3) {
            dddBadgeLog("node not found", { selector: nodeSelector, name: row.name });
          }
          panelItems.push({ name: row.name, label, metricText });
        }
      } catch (e) {
        dddBadgeLog("badge error", { selector: nodeSelector, name: row.name, err: String(e && e.message) });
        panelItems.push({ name: row.name, label, metricText });
      }
    } else {
      badgeDebug.noSelector++;
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
    showSidebarModal(scoredItems, site);
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
    parseDebug: typeof window !== "undefined" && window.__dddParseDebug ? window.__dddParseDebug : null,
    bodyTextLength,
    badgeDebug: DEBUG_BADGES ? badgeDebug : undefined,
  };
}

function showSidebarModal(scoredItems, site) {
  const existing = document.querySelector(".ddd-sidebar-backdrop");
  if (existing) existing.remove();

  const siteTheme = site === "weedmaps" || site === "dutchie" ? site : "dutchie";
  const worth = scoredItems.filter((r) => r.score && r.score.badge === "worth").length;
  const mid = scoredItems.filter((r) => r.score && r.score.badge === "mid").length;
  const taxed = scoredItems.filter((r) => r.score && r.score.badge === "taxed").length;

  const backdrop = document.createElement("div");
  backdrop.className = "ddd-sidebar-backdrop ddd-site-" + siteTheme;
  backdrop.setAttribute("aria-label", "Daily Dispo Deals");
  backdrop.setAttribute("data-ddd-site", siteTheme);

  const sidebar = document.createElement("div");
  sidebar.className = "ddd-sidebar-modal ddd-sidebar-collapsed ddd-site-" + siteTheme;

  const header = document.createElement("div");
  header.className = "ddd-sidebar-header";
  const headerLeft = document.createElement("div");
  headerLeft.className = "ddd-sidebar-header-left";
  const logoImg = document.createElement("img");
  logoImg.className = "ddd-sidebar-logo";
  const logoUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("icons/32.png") : "";
  logoImg.src = logoUrl;
  logoImg.alt = "";
  logoImg.setAttribute("width", "24");
  logoImg.setAttribute("height", "24");
  logoImg.referrerPolicy = "no-referrer";
  logoImg.onerror = function () { this.style.visibility = "hidden"; this.style.width = "0"; this.style.height = "0"; this.style.margin = "0"; this.style.padding = "0"; };
  const titleWrap = document.createElement("div");
  titleWrap.className = "ddd-sidebar-title-wrap";
  const titleEl = document.createElement("h2");
  titleEl.className = "ddd-sidebar-title";
  titleEl.textContent = "Deal Checker – Daily Dispo Deals";
  titleWrap.appendChild(titleEl);
  headerLeft.appendChild(logoImg);
  headerLeft.appendChild(titleWrap);
  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "ddd-sidebar-theme-btn";
  themeBtn.setAttribute("aria-label", "Toggle dark mode");
  themeBtn.innerHTML = "☀";
  const applyTheme = (isDark) => {
    if (isDark) {
      backdrop.classList.add("ddd-theme-dark");
      sidebar.classList.add("ddd-theme-dark");
      themeBtn.innerHTML = "☾";
      themeBtn.setAttribute("aria-label", "Switch to light mode");
    } else {
      backdrop.classList.remove("ddd-theme-dark");
      sidebar.classList.remove("ddd-theme-dark");
      themeBtn.innerHTML = "☀";
      themeBtn.setAttribute("aria-label", "Switch to dark mode");
    }
  };
  try {
    chrome.storage.local.get("ddd_theme", (st) => {
      const isDark = st && st.ddd_theme === "dark";
      applyTheme(!!isDark);
    });
  } catch (_) {
    applyTheme(false);
  }
  themeBtn.addEventListener("click", () => {
    const isDark = backdrop.classList.toggle("ddd-theme-dark");
    sidebar.classList.toggle("ddd-theme-dark", isDark);
    applyTheme(isDark);
    try { chrome.storage.local.set({ ddd_theme: isDark ? "dark" : "light" }); } catch (_) {}
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
  expandTab.innerHTML = "<span class=\"ddd-sidebar-tab-text\">Daily Dispo Deals</span><span class=\"ddd-sidebar-tab-counts\">" + worth + " / " + mid + " / " + taxed + "</span>";
  expandTab.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.remove("ddd-sidebar-collapsed");
  });
  header.appendChild(headerLeft);
  header.appendChild(themeBtn);
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
  summary.className = "ddd-sidebar-summary";
  summary.innerHTML =
    "<div class=\"ddd-sidebar-summary-card ddd-summary-worth\">✅<span class=\"ddd-sidebar-summary-num\">" + worth + "</span></div>" +
    "<div class=\"ddd-sidebar-summary-card ddd-summary-mid\">⚠️<span class=\"ddd-sidebar-summary-num\">" + mid + "</span></div>" +
    "<div class=\"ddd-sidebar-summary-card ddd-summary-taxed\">❌<span class=\"ddd-sidebar-summary-num\">" + taxed + "</span></div>";
  summaryWrap.appendChild(summary);
  const infoWrap = document.createElement("div");
  infoWrap.className = "ddd-sidebar-info-wrap";
  const infoContent = document.createElement("div");
  infoContent.className = "ddd-sidebar-info-content";
  infoContent.innerHTML = "<p class=\"ddd-sidebar-info-line\">Menu scored by value</p><p class=\"ddd-sidebar-info-line\">" + scoredItems.length + " items</p>";
  infoWrap.appendChild(infoContent);
  summaryWrap.appendChild(infoWrap);
  const v2StatusEl = document.createElement("div");
  v2StatusEl.className = "ddd-sidebar-v2-status";
  v2StatusEl.setAttribute("aria-live", "polite");
  v2StatusEl.textContent = "DDD Sync: Idle";
  summaryWrap.appendChild(v2StatusEl);
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

  const updateV2Status = (status) => {
    v2StatusEl.textContent = "DDD Sync: " + (status || "Idle");
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
    const s = (name || "").trim() || "Product";
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

  const maxListItems = 100;
  const listItems = scoredItems.slice(0, maxListItems);
  const DEALS_PER_PAGE = 6;
  const totalPages = Math.max(1, Math.ceil(listItems.length / DEALS_PER_PAGE));
  let currentPage = 1;

  const list = document.createElement("div");
  list.className = "ddd-sidebar-list";
  list.setAttribute("data-ddd-list", "true");
  const listTitle = document.createElement("div");
  listTitle.className = "ddd-sidebar-list-title";
  listTitle.textContent = "Deals";
  list.appendChild(listTitle);
  const listKey = document.createElement("div");
  listKey.className = "ddd-sidebar-list-key";
  listKey.innerHTML = "<span class=\"ddd-key-strain\">I/S/H</span> · <span class=\"ddd-key-deli\" title=\"by weight\">⚖</span> <span class=\"ddd-key-prepack\" title=\"sealed\">▫</span>";
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

  const addAdSlot = (type, label, placeholder) => {
    const item = document.createElement("div");
    item.className = "ddd-sidebar-item ddd-sidebar-item-ad ddd-sidebar-item-ad-" + type;
    item.setAttribute("data-ddd-ad-slot", type);
    const badge = document.createElement("span");
    badge.className = "ddd-sidebar-item-badge ddd-sidebar-ad-badge";
    badge.textContent = label;
    const info = document.createElement("div");
    info.className = "ddd-sidebar-item-info";
    const nameEl = document.createElement("div");
    nameEl.className = "ddd-sidebar-item-name ddd-sidebar-ad-placeholder-text";
    nameEl.textContent = placeholder;
    info.appendChild(nameEl);
    item.appendChild(badge);
    item.appendChild(info);
    listInner.appendChild(item);
  };

  const strainLabel = (strain) => (strain === "indica" ? "I" : strain === "sativa" ? "S" : strain === "hybrid" ? "H" : null);
  const styleSymbol = (row) => {
    if (row.productType !== "flower") return null;
    return row.isBulkFlower === true ? "⚖" : "▫";
  };

  const renderPage = (page) => {
    listInner.innerHTML = "";
    const start = (page - 1) * DEALS_PER_PAGE;
    const end = Math.min(start + DEALS_PER_PAGE, listItems.length);
    for (let i = start; i < end; i++) {
      const row = listItems[i];
      const item = document.createElement("div");
      item.className = "ddd-sidebar-item ddd-item-" + (row.score ? row.score.badge : "mid");
      item.setAttribute("data-ddd-item-index", String(i));
      const topRow = document.createElement("div");
      topRow.className = "ddd-sidebar-item-top";
      const badge = document.createElement("span");
      badge.className = "ddd-sidebar-item-badge ddd-" + (row.score ? row.score.badge : "mid");
      badge.textContent = row.score ? row.score.label : "⚠️ Mid";
      topRow.appendChild(badge);
      const tags = document.createElement("div");
      tags.className = "ddd-sidebar-item-tags";
      const strain = strainLabel(row.strainType);
      if (strain) {
        const s = document.createElement("span");
        s.className = "ddd-sidebar-tag ddd-sidebar-tag-strain ddd-strain-" + (row.strainType || "");
        s.textContent = strain;
        s.setAttribute("title", strain === "I" ? "Indica" : strain === "S" ? "Sativa" : "Hybrid");
        tags.appendChild(s);
      }
      const styleSym = styleSymbol(row);
      if (styleSym) {
        const s = document.createElement("span");
        s.className = "ddd-sidebar-tag ddd-sidebar-tag-symbol " + (row.isBulkFlower ? "ddd-tag-deli" : "ddd-tag-prepack");
        s.textContent = styleSym;
        s.setAttribute("title", row.isBulkFlower ? "Deli (by weight)" : "Pre-pack (sealed)");
        tags.appendChild(s);
      }
      if (tags.childNodes.length) topRow.appendChild(tags);
      item.appendChild(topRow);
      const info = document.createElement("div");
      info.className = "ddd-sidebar-item-info";
      const nameEl = document.createElement("div");
      nameEl.className = "ddd-sidebar-item-name";
      nameEl.textContent = displayName(row.name);
      const metricEl = document.createElement("div");
      metricEl.className = "ddd-sidebar-item-metric";
      metricEl.textContent = row.score ? formatMetric(row.score) : "";
      info.appendChild(nameEl);
      info.appendChild(metricEl);
      item.appendChild(info);
      listInner.appendChild(item);
    }
    addAdSlot("sponsored", "Sponsored", "Your ad here");
    addAdSlot("featured", "Featured", "Dispensary promotion");
    pageLabel.textContent = page + " / " + totalPages;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  };

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderPage(currentPage); }
  });
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; renderPage(currentPage); }
  });

  renderPage(1);
  sidebarScroll.appendChild(list);

  const adsSection = document.createElement("div");
  adsSection.className = "ddd-sidebar-ads";
  adsSection.setAttribute("aria-label", "Ads");
  const adAffiliate = document.createElement("div");
  adAffiliate.className = "ddd-sidebar-ad ddd-sidebar-ad-affiliate";
  adAffiliate.setAttribute("aria-label", "Sponsored");
  adAffiliate.innerHTML = "<span class=\"ddd-sidebar-ad-label\">Sponsored</span><span class=\"ddd-sidebar-ad-placeholder\">Affiliate ad slot</span>";
  const adDispensary = document.createElement("div");
  adDispensary.className = "ddd-sidebar-ad ddd-sidebar-ad-dispensary";
  adDispensary.setAttribute("aria-label", "Featured");
  adDispensary.innerHTML = "<span class=\"ddd-sidebar-ad-label\">Featured</span><span class=\"ddd-sidebar-ad-placeholder\">Dispensary promotion</span>";
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
  const badgeDebug = { withSelector: 0, nodeFound: 0, placed: 0, nodeNotFound: 0, reParsed: 0, matched: 0 };

  // Cached nodeSelectors are stale (data-ddd-id was set on a previous DOM). Re-parse to get fresh selectors.
  let itemsToBadge = payload.items;
  if (typeof parseItemsFromDOM === "function") {
    const freshParsed = parseItemsFromDOM(site);
    if (freshParsed.length > 0) {
      badgeDebug.reParsed = freshParsed.length;
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
          badgeDebug.matched++;
        }
      }
      // Fallback: index-based match when key match yields few results (menu order usually stable)
      if (merged.length < Math.min(payload.items.length, freshParsed.length) * 0.5) {
        merged = [];
        badgeDebug.matched = 0;
        const n = Math.min(payload.items.length, freshParsed.length);
        for (let i = 0; i < n; i++) {
          const cached = payload.items[i];
          const fresh = freshParsed[i];
          if (fresh && fresh.nodeSelector && cached && cached.score) {
            merged.push({ ...cached, nodeSelector: fresh.nodeSelector });
            badgeDebug.matched++;
          }
        }
        badgeDebug.matchStrategy = "index";
      } else {
        badgeDebug.matchStrategy = "key";
      }
      if (merged.length > 0) {
        itemsToBadge = merged;
        if (DEBUG_BADGES && merged.length > 0) {
          const root = document.body || document.documentElement;
          const firstNode = querySelectorIncludingShadow(root, merged[0].nodeSelector);
          badgeDebug.firstSelectorTest = firstNode ? "found" : "notFound";
          badgeDebug.firstSelector = merged[0].nodeSelector;
        }
      }
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
      badgeDebug.withSelector++;
      const root = document.body || document.documentElement;
      const node = querySelectorIncludingShadow(root, nodeSelector);
      if (node) {
        badgeDebug.nodeFound++;
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
        badgeDebug.placed++;
      } else {
        badgeDebug.nodeNotFound++;
      }
    } catch (_) {}
  }
  if (DEBUG_BADGES) dddBadgeLog("applyFromCache done", { badgesPlaced, badgeDebug });
  return { ok: true, count: payload.items.length, badgesPlaced, badgeDebug: DEBUG_BADGES ? badgeDebug : undefined };
}

// Expose for popup to call via executeScript (avoids "Receiving end does not exist").
    if (typeof window !== "undefined") {
      window.__dddRunAnalyze = (payload) => runAnalyze(payload);
      window.__dddShowSidebar = (payload) => {
        if (payload && payload.scoredItems && payload.site) showSidebarModal(payload.scoredItems, payload.site);
      };
      window.__dddApplyFromCache = (payload) => applyFromCache(payload);
    }
  } catch (e) {
    setRunAnalyzeFallback(e);
  }
})();
