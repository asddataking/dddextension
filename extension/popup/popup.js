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

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["utils/domains.js", "utils/parse.js", "utils/scoring.js", "content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["overlay.css"],
    });
  } catch (e) {
    if (DEBUG) console.warn("[DDD popup] inject error", e);
    setOutput("Could not analyze: " + (e && e.message ? e.message : "inject failed").slice(0, 80));
    setDebug(0, site);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "DDD_ANALYZE", payload: { site } }, (response) => {
    if (chrome.runtime.lastError) {
      setOutput("Could not analyze: " + (chrome.runtime.lastError.message || "message failed").slice(0, 80));
      setDebug(0, site);
      return;
    }
    const res = response || {};
    const count = res.count ?? 0;
    const items = res.items || [];
    setDebug(count, res.parser || site);
    if (count === 0) {
      setOutput("No items detected on this page.");
    } else {
      setOutputList(items);
    }
  });
});

document.getElementById("clear").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setOutput("No active tab.");
    return;
  }
  try {
    chrome.tabs.sendMessage(tab.id, { type: "DDD_CLEAR" }, () => {
      setOutput("Badges cleared.");
      if (chrome.runtime.lastError) {
        setOutput("Clear may have failed (reload page if badges remain).");
      }
    });
  } catch (e) {
    setOutput("Could not clear: " + (e && e.message ? e.message : "error").slice(0, 60));
  }
});
