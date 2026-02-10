// Daily Dispo Deals – Deal Checker (MV3)
// Ingest uses generated-env.js for API key and base URL (run npm run build:env).

var DDD_EXTENSION_API_KEY = "";
var INGEST_BASE_URL = "https://dailydispodeals.com";
var DDD_DEBUG = false;
try {
  importScripts("generated-env.js");
} catch (e) {
  console.warn("[DDD] generated-env.js missing – run npm run build:env. Ingest may fail.");
}

// Path for production ingest endpoint (backend example: https://dailydispodeals.com/api/ingest-extension)
const INGEST_PATH = "/api/ingest-extension";
const V2_TIMEOUT_MS = 12000;

chrome.runtime.onInstalled.addListener(() => {});

function doV2IngestFetch(ingestPayload, installId) {
  const base = (typeof INGEST_BASE_URL !== "undefined" && INGEST_BASE_URL) ? INGEST_BASE_URL : "https://dailydispodeals.com";
  const url = base.replace(/\/$/, "") + INGEST_PATH;
  const manifest = chrome.runtime.getManifest();
  const version = (manifest && manifest.version) || "1.0.0";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), V2_TIMEOUT_MS);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": (typeof DDD_EXTENSION_API_KEY !== "undefined" && DDD_EXTENSION_API_KEY) ? DDD_EXTENSION_API_KEY : "",
      "X-DDD-Install-Id": installId || "",
      "X-DDD-Extension-Version": version,
    },
    body: JSON.stringify(ingestPayload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "DDD_GET_CSS") {
    const url = chrome.runtime.getURL("overlay.css");
    const manifest = chrome.runtime.getManifest();
    const version = (manifest && manifest.version) || "1.0.0";
    fetch(url, { cache: "no-store" })
      .then((r) => r.text())
      .then((css) => sendResponse({ css, version }))
      .catch(() => sendResponse({ css: null, version }));
    return true;
  }
  if (msg.type === "DDD_DEBUG_LOG") {
    sendResponse();
    return false;
  }
  if (msg.type === "DDD_GET_LOGO") {
    const url = chrome.runtime.getURL("icons/32.png");
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        sendResponse({ logoDataUrl: "data:image/png;base64," + b64 });
      })
      .catch(() => sendResponse({ logoDataUrl: null }));
    return true;
  }
  if (msg.type === "DDD_V2_INGEST" && msg.payload) {
    const { ingestPayload, installId } = msg.payload;
    const base = (typeof INGEST_BASE_URL !== "undefined" && INGEST_BASE_URL) ? INGEST_BASE_URL : "https://dailydispodeals.com";
    const endpointUrl = base.replace(/\/$/, "") + INGEST_PATH;

    const doFetch = () =>
      doV2IngestFetch(ingestPayload, installId)
        .then(async (res) => {
          const status = res.status;
          const text = await res.text();
          if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
            console.log("[DDD] ingest response", status, text.length > 200 ? text.slice(0, 200) + "…" : text);
          }
          if (!res.ok) {
            const snippet = text.length > 300 ? text.slice(0, 300) + "…" : text;
            if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
              console.warn("[DDD] ingest failed", "status:", status, "body:", snippet, "endpoint:", endpointUrl);
            } else {
              console.warn("[DDD] ingest failed", "status:", status, "endpoint:", endpointUrl);
            }
            let data = {};
            try {
              data = JSON.parse(text);
            } catch (_) {}
            return { ok: false, error: (data && data.error) || text || "Request failed" };
          }
          let data = {};
          try {
            data = JSON.parse(text);
          } catch (_) {}
          if (data && data.ok) {
            if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
              console.log("[DDD] ingest success", "status:", status, "ingest_id:", data.ingest_id != null ? data.ingest_id : "(none)");
            } else {
              console.log("[DDD] ingest success", status, data.ingest_id != null ? "ingest_id=" + data.ingest_id : "");
            }
            const resOut = { ok: true, ingest_id: data.ingest_id, normalized: data.normalized };
            if (data.comparisons && typeof data.comparisons === "object") resOut.comparisons = data.comparisons;
            return resOut;
          }
          return { ok: false, error: data.error || "Request failed" };
        })
        .catch((e) => {
          const errMsg = (e && e.message) || "Network error";
          if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
            console.warn("[DDD] ingest error", errMsg, "endpoint:", endpointUrl);
          } else {
            console.warn("[DDD] ingest error", errMsg);
          }
          return { ok: false, error: errMsg };
        });

    doFetch()
      .then((result) => {
        if (!result.ok && (result.error === "Network error" || result.error === "The operation was aborted.")) {
          return doFetch();
        }
        return result;
      })
      .then(sendResponse);
    return true;
  }
  if (msg.type === "DDD_V2_INGEST_TEST") {
    const base = (typeof INGEST_BASE_URL !== "undefined" && INGEST_BASE_URL) ? INGEST_BASE_URL : "https://dailydispodeals.com";
    const endpointUrl = base.replace(/\/$/, "") + INGEST_PATH;
    const testPayload = {
      source: "chrome_extension",
      dispensary_name: "Test Dispensary",
      dispensary_url: "",
      page_url: "https://example.com/test",
      raw_text: "Test observation",
      product_name: null,
      price_text: null,
      category_hint: null,
      captured_at: new Date().toISOString(),
    };
    doV2IngestFetch(testPayload, "test-install-id")
      .then(async (res) => {
        const status = res.status;
        const text = await res.text();
        if (!res.ok) {
          const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
          if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
            console.warn("[DDD] test ingest failed", status, snippet, endpointUrl);
          }
          sendResponse({ ok: false, status, error: text || "Request failed" });
          return;
        }
        if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
          console.log("[DDD] test ingest success", status, text.slice(0, 150));
        }
        sendResponse({ ok: true, status });
      })
      .catch((e) => {
        const errMsg = (e && e.message) || "Network error";
        if (typeof DDD_DEBUG !== "undefined" && DDD_DEBUG) {
          console.warn("[DDD] test ingest error", errMsg, endpointUrl);
        }
        sendResponse({ ok: false, error: errMsg });
      });
    return true;
  }
  return false;
});
