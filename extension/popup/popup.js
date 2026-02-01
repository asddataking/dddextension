/**
 * Popup: status, Analyze (inject + message), Clear, output area, debug accordion.
 */

// Future: optional server analyze. v1 is local-only.
const API_BASE = "https://dailydispodeals.com";
// TODO: POST API_BASE/api/analyze with device_id and items when server is ready.

const DEBUG = false;

getOrCreateDeviceId().then(() => {});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || "";
  const site = detectSite(url);
  const label = site === "weedmaps" ? "Weedmaps" : site === "dutchie" ? "Dutchie" : "Unknown";
  document.getElementById("status").textContent = "Site: " + label;
});

function setOutput(text) {
  const el = document.getElementById("output");
  el.innerHTML = "";
  el.appendChild(document.createTextNode(text || ""));
}

function setOutputList(items) {
  const el = document.getElementById("output");
  el.innerHTML = "";
  if (!items || items.length === 0) {
    el.textContent = "No items detected.";
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const it of items.slice(0, 15)) {
    const div = document.createElement("div");
    div.className = "item";
    const score = it.score || {};
    div.textContent = (score.label || "—") + " " + (it.name || "").trim() + (score.metricLabel && score.metricValue != null ? " — " + score.metricLabel + " " + score.metricValue : "");
    fragment.appendChild(div);
  }
  el.appendChild(fragment);
}

function setDebug(count, parser) {
  document.getElementById("debug-content").textContent = "Items found: " + count + "\nParser: " + parser;
}

document.getElementById("analyze").addEventListener("click", async () => {
  const output = document.getElementById("output");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setOutput("No active tab.");
    return;
  }
  const url = tab.url || "";
  const site = detectSite(url);
  if (site !== "weedmaps" && site !== "dutchie") {
    setOutput("Unsupported site. Open a Weedmaps or Dutchie menu page.");
    setDebug(0, "unknown");
    return;
  }

  output.textContent = "Analyzing…";
  setDebug("—", "—");

  const hostPatterns = site === "weedmaps" ? ["*://*.weedmaps.com/*", "*://weedmaps.com/*"] : ["*://*.dutchie.com/*", "*://dutchie.com/*"];
  try {
    const has = await chrome.permissions.contains({ origins: hostPatterns });
    if (!has) {
      const granted = await chrome.permissions.request({ origins: hostPatterns }).catch(() => false);
      if (!granted) {
        setOutput("Permission to access this site was denied. Grant access and try again.");
        setDebug(0, site);
        return;
      }
    }
  } catch (_) {
    // Proceed; activeTab may be enough when popup was opened from this tab
  }

  // For Dutchie-powered sites (e.g. mindrightmi.com), menu is in an iframe from dutchie.com/embedded-menu. Inject into that frame.
  let target = { tabId: tab.id };
  if (site === "dutchie") {
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      const dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
      if (dutchieFrame && dutchieFrame.frameId !== 0) {
        target = { tabId: tab.id, frameIds: [dutchieFrame.frameId] };
      }
    } catch (_) {
      // Fall back to main frame
    }
  }

  try {
    await chrome.scripting.executeScript({
      target,
      files: ["utils/domains.js", "utils/parse.js", "utils/scoring.js", "content.js"],
    });
    await chrome.scripting.insertCSS({
      target,
      files: ["overlay.css"],
    });
  } catch (e) {
    if (DEBUG) console.warn("[DDD popup] inject error", e);
    setOutput("Could not analyze: " + (e && e.message ? e.message : "inject failed").slice(0, 80));
    setDebug(0, site);
    return;
  }

  // Run analyze in the tab (or Dutchie iframe) via executeScript.
  try {
    const results = await chrome.scripting.executeScript({
      target,
      func: (siteArg) => {
        return typeof window.__dddRunAnalyze === "function"
          ? window.__dddRunAnalyze({ site: siteArg })
          : Promise.resolve({ ok: false, items: [], count: 0, parser: siteArg });
      },
      args: [site],
    });
    const res = results && results[0] && results[0].result;
    if (!res) {
      setOutput("Could not analyze: no result from page.");
      setDebug(0, site);
      return;
    }
    const count = res.count ?? 0;
    const items = res.items || [];
    setDebug(count, res.parser || site);
    if (count === 0) {
      setOutput("No items detected on this page.");
    } else {
      setOutputList(items);
    }
  } catch (e) {
    if (DEBUG) console.warn("[DDD popup] run error", e);
    setOutput("Could not analyze: " + (e && e.message ? e.message : "run failed").slice(0, 80));
    setDebug(0, site);
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setOutput("No active tab.");
    return;
  }
  const clearFunc = () => {
    const badges = document.querySelectorAll(".ddd-badge, .ddd-panel, .ddd-sidebar-backdrop");
    badges.forEach((el) => el.remove());
    document.querySelectorAll("[data-ddd-id]").forEach((el) => el.removeAttribute("data-ddd-id"));
    return badges.length;
  };
  let removed = 0;
  try {
    const mainResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clearFunc,
    });
    removed += (mainResult && mainResult[0] && mainResult[0].result) ?? 0;
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => []);
    const dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
    if (dutchieFrame && dutchieFrame.frameId !== 0) {
      const iframeResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [dutchieFrame.frameId] },
        func: clearFunc,
      });
      removed += (iframeResult && iframeResult[0] && iframeResult[0].result) ?? 0;
    }
    setOutput(removed > 0 ? "Badges cleared." : "Nothing to clear (or page changed).");
  } catch (e) {
    setOutput("Could not clear: " + (e && e.message ? e.message : "error").slice(0, 60));
  }
});
