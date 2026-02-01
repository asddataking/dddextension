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
async function runAnalyze(payload) {
  const site = payload?.site || "unknown";
  if (site !== "weedmaps" && site !== "dutchie") {
    return { ok: false, items: [], count: 0, parser: site };
  }

  clearBadges();

  let items = [];
  try {
    items = typeof parseItemsFromDOM === "function" ? parseItemsFromDOM(site) : [];
    // Dutchie menu can render after load; retry once after a short delay if no items
    if (site === "dutchie" && items.length === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      items = typeof parseItemsFromDOM === "function" ? parseItemsFromDOM(site) : [];
    }
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

  showSidebarModal(scoredItems);

  if (panelItems.length > 0 || badgesPlaced === 0) {
    showFloatingPanel(scoredItems.slice(0, 10).map((r) => ({ name: r.name, label: r.score.label, metricText: (r.score.metricLabel || "") + " " + (r.score.metricValue != null ? r.score.metricValue : "") })));
  }

  return {
    ok: true,
    items: scoredItems,
    count: scoredItems.length,
    parser: site,
  };
}

function showSidebarModal(scoredItems) {
  const existing = document.querySelector(".ddd-sidebar-backdrop");
  if (existing) existing.remove();

  const worth = scoredItems.filter((r) => r.score && r.score.badge === "worth").length;
  const mid = scoredItems.filter((r) => r.score && r.score.badge === "mid").length;
  const taxed = scoredItems.filter((r) => r.score && r.score.badge === "taxed").length;

  const backdrop = document.createElement("div");
  backdrop.className = "ddd-sidebar-backdrop";
  backdrop.setAttribute("aria-label", "Deal Checker results");

  const sidebar = document.createElement("div");
  sidebar.className = "ddd-sidebar-modal";

  const header = document.createElement("div");
  header.className = "ddd-sidebar-header";
  const titleEl = document.createElement("h2");
  titleEl.className = "ddd-sidebar-title";
  titleEl.textContent = "Deal Checker";
  const closeBtn = document.createElement("button");
  closeBtn.id = "ddd-sidebar-close-btn";
  closeBtn.name = "ddd-sidebar-close";
  closeBtn.className = "ddd-sidebar-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", () => backdrop.remove());
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  sidebar.appendChild(header);

  const summary = document.createElement("div");
  summary.className = "ddd-sidebar-summary";
  summary.innerHTML =
    "<span>✅ Worth It: <strong>" + worth + "</strong></span>" +
    "<span>⚠️ Mid: <strong>" + mid + "</strong></span>" +
    "<span>❌ Taxed: <strong>" + taxed + "</strong></span>";
  sidebar.appendChild(summary);

  const list = document.createElement("div");
  list.className = "ddd-sidebar-list";
  for (const row of scoredItems.slice(0, 25)) {
    const item = document.createElement("div");
    item.className = "ddd-sidebar-item";
    const badge = document.createElement("span");
    badge.className = "ddd-sidebar-item-badge ddd-" + (row.score ? row.score.badge : "mid");
    badge.textContent = row.score ? row.score.label : "⚠️ Mid";
    const info = document.createElement("div");
    info.className = "ddd-sidebar-item-info";
    const nameEl = document.createElement("div");
    nameEl.className = "ddd-sidebar-item-name";
    nameEl.textContent = (row.name || "").trim() || "Product";
    const metricEl = document.createElement("div");
    metricEl.className = "ddd-sidebar-item-metric";
    metricEl.textContent = row.score && row.score.metricLabel && row.score.metricValue != null ? row.score.metricLabel + " " + row.score.metricValue : "";
    info.appendChild(nameEl);
    info.appendChild(metricEl);
    item.appendChild(badge);
    item.appendChild(info);
    list.appendChild(item);
  }
  sidebar.appendChild(list);

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
  panel.setAttribute("aria-label", "Deal Checker results");
  const title = document.createElement("div");
  title.className = "ddd-panel-title";
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
  document.querySelectorAll(".ddd-badge, .ddd-panel, .ddd-sidebar-backdrop").forEach((el) => el.remove());
  document.querySelectorAll("[data-ddd-id]").forEach((el) => el.removeAttribute("data-ddd-id"));
}

// Expose for popup to call via executeScript (avoids "Receiving end does not exist").
if (typeof window !== "undefined") {
  window.__dddRunAnalyze = (payload) => runAnalyze(payload);
}
