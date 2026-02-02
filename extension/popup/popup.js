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
  const trimName = (name) => {
    const s = (name || "").trim() || "Product";
    return s.length > 40 ? s.slice(0, 37) + "…" : s;
  };
  const formatMetric = (score) => {
    if (!score || score.metricLabel == null || score.metricValue == null) return "";
    const v = score.metricValue;
    const val = Number(v) === Math.round(v) ? String(Math.round(v)) : v.toFixed(2);
    if (score.metricLabel === "$/g") return "$" + val + "/g";
    if (score.metricLabel === "$/100mg") return "$" + val + "/100mg";
    return score.metricLabel + " " + val;
  };
  const fragment = document.createDocumentFragment();
  for (const it of items.slice(0, 15)) {
    const div = document.createElement("div");
    div.className = "item";
    const score = it.score || {};
    const name = trimName(it.name);
    const metric = score ? formatMetric(score) : "";
    div.textContent = (score.label || "—") + " " + name + (metric ? " · " + metric : "");
    fragment.appendChild(div);
  }
  el.appendChild(fragment);
}

function setDebug(count, parser, extra) {
  document.getElementById("debug-content").textContent = "Items found: " + count + "\nParser: " + parser + (extra || "");
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCacheKey(url, site) {
  try {
    const u = new URL(url);
    const normalized = u.origin + u.pathname.replace(/\/+$/, "") || u.origin + "/";
    return "ddd_cache_" + site + "_" + normalized;
  } catch (_) {
    return "ddd_cache_" + site + "_" + url;
  }
}

async function getCached(cacheKey) {
  try {
    const raw = await chrome.storage.local.get(cacheKey);
    const entry = raw[cacheKey];
    if (!entry || !entry.items || !Array.isArray(entry.items)) return null;
    if (entry.timestamp && Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return { items: entry.items, site: entry.site || "dutchie" };
  } catch (_) {
    return null;
  }
}

async function setCached(cacheKey, data) {
  try {
    await chrome.storage.local.set({
      [cacheKey]: { items: data.items, site: data.site, timestamp: Date.now() },
    });
  } catch (_) {}
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

  const cacheKey = getCacheKey(url, site);
  const cached = await getCached(cacheKey);
  if (cached && cached.items && cached.items.length > 0) {
    output.textContent = "Applying from cache…";
    setDebug(cached.items.length, cached.site, "\n(cached)");
    try {
      let target = { tabId: tab.id };
      if (site === "dutchie") {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => []);
        const dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
        if (dutchieFrame && dutchieFrame.frameId !== 0) target = { tabId: tab.id, frameIds: [dutchieFrame.frameId] };
      }
      await chrome.scripting.executeScript({ target, files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js", "v2/config.js", "v2/installId.js", "v2/mapToIngestPayload.js", "v2/clientRef.js", "v2/overlayStore.js"] });
      await chrome.scripting.executeScript({ target, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target, files: ["overlay.css"] });
      const applyResult = await chrome.scripting.executeScript({
        target,
        world: "ISOLATED",
        func: (payload) => {
          if (typeof window.__dddApplyFromCache === "function") return window.__dddApplyFromCache(payload);
          return { ok: false };
        },
        args: [{ items: cached.items, site: cached.site }],
      });
      const applyRes = applyResult && applyResult[0] && applyResult[0].result;
      setOutputList(cached.items);
      if (target.frameIds && target.frameIds[0] !== 0) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (payload) => {
            if (typeof window.__dddShowSidebar === "function") window.__dddShowSidebar(payload);
          },
          args: [{ scoredItems: cached.items, site: cached.site, pageUrl: tab.url || "" }],
        });
      }
      if (typeof triggerV2Ingest === "function") {
        triggerV2Ingest(tab.id, cached.site, cached.items, tab.url || "");
      }
      const cacheDebugExtra = applyRes && applyRes.badgeDebug ? "\nbadgeDebug: " + JSON.stringify(applyRes.badgeDebug, null, 2) : "";
      setDebug(cached.items.length, cached.site, "\n(cached)" + cacheDebugExtra);
    } catch (e) {
      if (DEBUG) console.warn("[DDD popup] cache apply error", e);
      setOutput("Cache apply failed, run Analyze again.");
    }
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
  let framesSnapshot = [];
  if (site === "dutchie") {
    try {
      const isDutchiePoweredHost = url && !url.includes("dutchie.com");
      let dutchieFrame = null;
      for (let attempt = 0; attempt < (isDutchiePoweredHost ? 5 : 1); attempt++) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        framesSnapshot = (frames || []).map((f) => ({ id: f.frameId, url: (f.url || "").slice(0, 120) }));
        dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
        if (dutchieFrame) break;
        if (isDutchiePoweredHost && attempt < 4) await new Promise((r) => setTimeout(r, 800));
      }
      if (dutchieFrame && dutchieFrame.frameId !== 0) {
        target = { tabId: tab.id, frameIds: [dutchieFrame.frameId] };
      } else if (dutchieFrame && dutchieFrame.frameId === 0) {
        target = { tabId: tab.id };
      }
      // #region agent log
      chrome.runtime.sendMessage({
        type: "DDD_DEBUG_LOG",
        payload: {
          hypothesisId: "A",
          location: "popup.js:frame selection",
          message: "injection target",
          data: {
            tabUrl: (url || "").slice(0, 100),
            site,
            hasFrameIds: !!target.frameIds,
            frameId: target.frameIds ? target.frameIds[0] : null,
            foundDutchieFrame: !!dutchieFrame,
            dutchieFrameId: dutchieFrame ? dutchieFrame.frameId : null,
          },
        },
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: "DDD_DEBUG_LOG",
        payload: {
          hypothesisId: "B",
          location: "popup.js:frames",
          message: "frame list",
          data: { frameCount: framesSnapshot.length, frameUrls: framesSnapshot },
        },
      }).catch(() => {});
      // #endregion
    } catch (_) {
      // Fall back to main frame
    }
  }

  // Inject into target frame (main or Dutchie iframe). Scripts run in that frame's ISOLATED world.
  // Inject content.js in a second call so it runs after stub and overwrites __dddRunAnalyze (avoids stub winning on some iframes).
  try {
    await chrome.scripting.executeScript({
      target,
      files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js", "v2/config.js", "v2/installId.js", "v2/mapToIngestPayload.js", "v2/clientRef.js", "v2/overlayStore.js"],
    });
    await chrome.scripting.executeScript({
      target,
      files: ["content.js"],
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

  // Run analyze in the same ISOLATED world where content.js defined __dddRunAnalyze (no MAIN world / script-tag path).
  try {
    const results = await chrome.scripting.executeScript({
      target,
      world: "ISOLATED",
      func: async (siteArg) => {
        const getBodyLen = () => (typeof document !== "undefined" && document.body ? (document.body.innerText || "").length : -1);
        if (typeof window.__dddRunAnalyze === "function") {
          return window.__dddRunAnalyze({ site: siteArg });
        }
        for (let w = 0; w < 75; w++) {
          if (typeof window.__dddRunAnalyze === "function") break;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (typeof window.__dddRunAnalyze === "function") {
          return window.__dddRunAnalyze({ site: siteArg });
        }
        return Promise.resolve({ ok: false, items: [], count: 0, parser: siteArg, bodyTextLength: getBodyLen(), noRunAnalyze: true });
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
    const parser = res.parser || site;
    const debugParts = [];
    if (count === 0 && res.noRunAnalyze) debugParts.push("(runAnalyze not found)");
    if (count === 0 && res.stub) debugParts.push("(stub used – real script failed to load)");
    if (count === 0 && res.loadError) debugParts.push("loadError: " + res.loadError);
    if (count === 0 && res.parseDebug) debugParts.push("parseDebug: " + JSON.stringify(res.parseDebug));
    if (count === 0 && res.bodyTextLength != null) debugParts.push("bodyTextLen: " + res.bodyTextLength);
    if (res.badgeDebug) debugParts.push("badgeDebug: " + JSON.stringify(res.badgeDebug, null, 2));
    const debugExtra = debugParts.length ? "\n" + debugParts.join("\n") : "";
    setDebug(count, parser, debugExtra);
    // #region agent log
    if (count === 0) {
      chrome.runtime.sendMessage({
        type: "DDD_DEBUG_LOG",
        payload: {
          hypothesisId: "C",
          location: "popup.js:after analyze",
          message: "parseDebug from iframe",
          data: { site, count, parseDebug: res.parseDebug ?? "missing" },
        },
      }).catch(() => {});
    }
    // #endregion
    if (count === 0) {
      setOutput("No items detected on this page.");
    } else {
      setOutputList(items);
      await setCached(cacheKey, { items: res.items, site });
      // Show sidebar in main frame so it stays fixed when user scrolls (Dutchie menu is in iframe).
      if (target.frameIds && target.frameIds[0] !== 0 && res.items && res.items.length > 0) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js", "v2/config.js", "v2/installId.js", "v2/mapToIngestPayload.js", "v2/clientRef.js", "v2/overlayStore.js"],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["overlay.css"],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (payload) => {
              if (typeof window.__dddShowSidebar === "function") window.__dddShowSidebar(payload);
            },
            args: [{ scoredItems: res.items, site, pageUrl: tab.url || "" }],
          });
        } catch (e) {
          if (DEBUG) console.warn("[DDD popup] main frame sidebar error", e);
        }
      }
      if (typeof triggerV2Ingest === "function") {
        triggerV2Ingest(tab.id, site, res.items, tab.url || "");
      }
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
