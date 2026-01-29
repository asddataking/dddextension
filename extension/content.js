/**
 * Content script: injected on Analyze. Handles DDD_ANALYZE (parse + score + badges/panel) and DDD_CLEAR.
 * Depends on parseItemsFromDOM (parse.js) and scoreItem (scoring.js) loaded before this script.
 */

// Future: send extracted items to server for analyze. v1 is local-only.
const API_BASE = "https://dailydispodeals.com";
// TODO: POST API_BASE/api/analyze with device_id and items when server is ready.

const DEBUG = false;

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
});

/**
 * @param {{ site: string }} payload
 * @returns {Promise<{ ok: boolean, items: Array, count: number, parser: string }>}
 */
function runAnalyze(payload) {
  const site = payload?.site || "unknown";
  if (site !== "weedmaps" && site !== "dutchie") {
    return Promise.resolve({ ok: false, items: [], count: 0, parser: site });
  }

  clearBadges();

  let items = [];
  try {
    items = typeof parseItemsFromDOM === "function" ? parseItemsFromDOM(site) : [];
  } catch (e) {
    if (DEBUG) console.warn("[DDD content] parse error", e);
  }

  const scoredItems = items.map((item) => {
    const score = typeof scoreItem === "function" ? scoreItem(item) : { badge: "mid", label: "⚠️ Mid", metricLabel: "—", metricValue: 0, reason: "Not enough info" };
    return { ...item, score };
  });

  let badgesPlaced = 0;
  const panelItems = [];

  for (const row of scoredItems) {
    const { nodeSelector, score } = row;
    const label = score.label || "⚠️ Mid";
    const metricText = score.metricLabel && score.metricValue != null ? score.metricLabel + " " + score.metricValue : "";

    if (nodeSelector) {
      try {
        const node = document.querySelector(nodeSelector);
        if (node) {
          const container = node.closest("[style*='position']") || node;
          const style = window.getComputedStyle(container);
          if (style.position === "static") {
            container.style.position = "relative";
          }
          const badge = document.createElement("span");
          badge.className = "ddd-badge ddd-" + (score.badge || "mid");
          badge.textContent = label;
          container.appendChild(badge);
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

  showLayeredOverlay(scoredItems);

  if (panelItems.length > 0 || badgesPlaced === 0) {
    showFloatingPanel(scoredItems.slice(0, 10).map((r) => ({ name: r.name, label: r.score.label, metricText: (r.score.metricLabel || "") + " " + (r.score.metricValue != null ? r.score.metricValue : "") })));
  }

  return Promise.resolve({
    ok: true,
    items: scoredItems,
    count: scoredItems.length,
    parser: site,
  });
}

function showLayeredOverlay(scoredItems) {
  const existing = document.querySelector(".ddd-overlay-backdrop");
  if (existing) existing.remove();

  const worth = scoredItems.filter((r) => r.score && r.score.badge === "worth").length;
  const mid = scoredItems.filter((r) => r.score && r.score.badge === "mid").length;
  const taxed = scoredItems.filter((r) => r.score && r.score.badge === "taxed").length;

  const backdrop = document.createElement("div");
  backdrop.className = "ddd-overlay-backdrop";
  backdrop.setAttribute("aria-label", "Deal Checker results");

  const sheet = document.createElement("div");
  sheet.className = "ddd-overlay-sheet";

  const header = document.createElement("div");
  header.className = "ddd-overlay-header";
  const titleEl = document.createElement("h2");
  titleEl.className = "ddd-overlay-title";
  titleEl.textContent = "Deal Checker";
  const closeBtn = document.createElement("button");
  closeBtn.className = "ddd-overlay-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", () => backdrop.remove());
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  sheet.appendChild(header);

  const summary = document.createElement("div");
  summary.className = "ddd-overlay-summary";
  summary.innerHTML =
    "<span>✅ Worth It: <strong>" + worth + "</strong></span>" +
    "<span>⚠️ Mid: <strong>" + mid + "</strong></span>" +
    "<span>❌ Taxed: <strong>" + taxed + "</strong></span>";
  sheet.appendChild(summary);

  const list = document.createElement("div");
  list.className = "ddd-overlay-list";
  for (const row of scoredItems.slice(0, 25)) {
    const item = document.createElement("div");
    item.className = "ddd-overlay-item";
    const badge = document.createElement("span");
    badge.className = "ddd-overlay-item-badge ddd-" + (row.score ? row.score.badge : "mid");
    badge.textContent = row.score ? row.score.label : "⚠️ Mid";
    const info = document.createElement("div");
    info.className = "ddd-overlay-item-info";
    const nameEl = document.createElement("div");
    nameEl.className = "ddd-overlay-item-name";
    nameEl.textContent = (row.name || "").trim() || "Product";
    const metricEl = document.createElement("div");
    metricEl.className = "ddd-overlay-item-metric";
    metricEl.textContent = row.score && row.score.metricLabel && row.score.metricValue != null ? row.score.metricLabel + " " + row.score.metricValue : "";
    info.appendChild(nameEl);
    info.appendChild(metricEl);
    item.appendChild(badge);
    item.appendChild(info);
    list.appendChild(item);
  }
  sheet.appendChild(list);

  backdrop.appendChild(sheet);
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
  panel.setAttribute("aria-label", "Deal Checker results");
  const title = document.createElement("div");
  title.style.fontWeight = "bold";
  title.style.marginBottom = "6px";
  title.textContent = "Deal Checker";
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
  document.querySelectorAll(".ddd-badge, .ddd-panel, .ddd-overlay-backdrop").forEach((el) => el.remove());
  document.querySelectorAll("[data-ddd-id]").forEach((el) => el.removeAttribute("data-ddd-id"));
}

// Expose for popup to call via executeScript (avoids "Receiving end does not exist").
if (typeof window !== "undefined") {
  window.__dddRunAnalyze = (payload) => runAnalyze(payload);
}
