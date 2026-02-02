// Daily Dispo Deals – Deal Checker (MV3)
// Minimal service worker; no heavy logic, no API keys.

const DEBUG = false;

chrome.runtime.onInstalled.addListener(() => {
  if (DEBUG) console.log("[DDD] Extension installed.");
});

// #region agent log
const DDD_DEBUG_INGEST = "http://127.0.0.1:7244/ingest/7581459e-929e-47bd-9dee-b089f99a55e5";
// #endregion

const V2_API_BASE = "https://dailydispodeals.com";
const V2_INGEST_PATH = "/api/ingest/extension";
const V2_TIMEOUT_MS = 8000;

function doV2IngestFetch(ingestPayload, installId) {
  const url = V2_API_BASE.replace(/\/$/, "") + V2_INGEST_PATH;
  const manifest = chrome.runtime.getManifest();
  const version = (manifest && manifest.version) || "1.0.0";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), V2_TIMEOUT_MS);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DDD-Install-Id": installId || "",
      "X-DDD-Extension-Version": version,
    },
    body: JSON.stringify(ingestPayload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
  if (msg.type === "DDD_DEBUG_LOG" && msg.payload) {
    fetch(DDD_DEBUG_INGEST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg.payload, timestamp: Date.now(), sessionId: "debug-session" }),
    }).catch(() => {});
    sendResponse();
    return false;
  }
  if (msg.type === "DDD_V2_INGEST" && msg.payload) {
    const { ingestPayload, installId } = msg.payload;
    const doFetch = () =>
      doV2IngestFetch(ingestPayload, installId)
        .then((res) => res.json().catch(() => ({})))
        .then((data) => {
          if (data && data.ok) {
            return { ok: true, ingest_id: data.ingest_id, normalized: data.normalized };
          }
          return { ok: false, error: data.error || "Request failed" };
        })
        .catch((e) => {
          return { ok: false, error: (e && e.message) || "Network error" };
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
  return false;
});
