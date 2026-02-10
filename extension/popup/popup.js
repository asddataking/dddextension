/**
 * Popup: status, Analyze (inject + message), Clear.
 */
const DEBUG = false;

getOrCreateDeviceId().then(() => {});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || "";
  const site = detectSite(url);
  const label = site === "weedmaps" ? "Weedmaps" : site === "dutchie" ? "Dutchie" : "Unknown";
  document.getElementById("status").textContent = "Site: " + label;
});

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text || "";
}

function setStatusWithSite(site, message) {
  const label = site === "weedmaps" ? "Weedmaps" : site === "dutchie" ? "Dutchie" : "Unknown";
  setStatus("Site: " + label + (message ? " · " + message : ""));
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab.");
    return;
  }
  const url = tab.url || "";
  const site = detectSite(url);
  if (site !== "weedmaps" && site !== "dutchie") {
    setStatus("Unsupported site. Open a Weedmaps or Dutchie menu page.");
    return;
  }

  const cacheKey = getCacheKey(url, site);
  const cached = await getCached(cacheKey);
  if (cached && cached.items && cached.items.length > 0) {
    setStatus("Applying from cache…");
    try {
      let target = { tabId: tab.id };
      if (site === "dutchie") {
        const isDutchiePoweredHost = url && !url.includes("dutchie.com");
        let dutchieFrame = null;
        for (let attempt = 0; attempt < (isDutchiePoweredHost ? 5 : 1); attempt++) {
          const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => []);
          dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
          if (dutchieFrame) break;
          if (isDutchiePoweredHost && attempt < 4) await new Promise((r) => setTimeout(r, 800));
        }
        if (dutchieFrame && dutchieFrame.frameId !== 0) target = { tabId: tab.id, frameIds: [dutchieFrame.frameId] };
      }
      await chrome.scripting.executeScript({ target, files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js", "v2/config.js", "v2/installId.js", "v2/mapToIngestPayload.js", "v2/clientRef.js", "v2/overlayStore.js"] });
      await chrome.scripting.executeScript({ target, files: ["content.js"] });
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
      setStatusWithSite(site, "Menu analyzed! " + cached.items.length + " deals scored. Check the sidebar for details.");
      if (target.frameIds && target.frameIds[0] !== 0) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["stub.js", "utils/domains.js", "utils/parse.js", "utils/scoring.js", "v2/config.js", "v2/installId.js", "v2/mapToIngestPayload.js", "v2/clientRef.js", "v2/overlayStore.js"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
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
    } catch (e) {
      console.warn("[DDD popup] cache apply error", e);
      const errMsg = (e && e.message) ? String(e.message).slice(0, 100) : "";
      setStatus("Cache apply failed" + (errMsg ? ": " + errMsg : " — run Analyze again."));
    }
    return;
  }

  setStatus("Analyzing…");

  const hostPatterns = site === "weedmaps" ? ["*://*.weedmaps.com/*", "*://weedmaps.com/*"] : ["*://*.dutchie.com/*", "*://dutchie.com/*"];
  try {
    const has = await chrome.permissions.contains({ origins: hostPatterns });
    if (!has) {
      const granted = await chrome.permissions.request({ origins: hostPatterns }).catch(() => false);
      if (!granted) {
        setStatus("Permission to access this site was denied. Grant access and try again.");
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
      const isDutchiePoweredHost = url && !url.includes("dutchie.com");
      let dutchieFrame = null;
      for (let attempt = 0; attempt < (isDutchiePoweredHost ? 5 : 1); attempt++) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        dutchieFrame = (frames || []).find((f) => f.url && f.url.includes("dutchie.com/embedded-menu"));
        if (dutchieFrame) break;
        if (isDutchiePoweredHost && attempt < 4) await new Promise((r) => setTimeout(r, 800));
      }
      if (dutchieFrame && dutchieFrame.frameId !== 0) {
        target = { tabId: tab.id, frameIds: [dutchieFrame.frameId] };
      } else if (dutchieFrame && dutchieFrame.frameId === 0) {
        target = { tabId: tab.id };
      }
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
  } catch (e) {
    if (DEBUG) console.warn("[DDD popup] inject error", e);
    setStatus("Could not analyze: " + (e && e.message ? e.message : "inject failed").slice(0, 80));
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
      setStatus("Could not analyze: no result from page.");
      return;
    }
    const count = res.count ?? 0;
    const items = res.items || [];
    if (count === 0) {
      setStatusWithSite(site, "No items detected on this page.");
    } else {
      setStatusWithSite(site, "Menu analyzed! " + count + " deals scored. Check the sidebar for details.");
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
    setStatus("Could not analyze: " + (e && e.message ? e.message : "run failed").slice(0, 80));
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab.");
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
    const url = tab.url || "";
    const site = detectSite(url);
    setStatusWithSite(site, removed > 0 ? "Badges cleared." : "Nothing to clear (or page changed).");
  } catch (e) {
    setStatus("Could not clear: " + (e && e.message ? e.message : "error").slice(0, 60));
  }
});

document.getElementById("testIngest").addEventListener("click", () => {
  setStatus("Sending test payload…");
  chrome.runtime.sendMessage({ type: "DDD_V2_INGEST_TEST" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Test failed: " + (chrome.runtime.lastError.message || "no response"));
      return;
    }
    const r = response || {};
    if (r.ok && r.status) {
      setStatus("Test sent: " + r.status);
    } else {
      setStatus("Test failed: " + (r.status || "") + " " + (r.error || "unknown").slice(0, 60));
    }
  });
});
