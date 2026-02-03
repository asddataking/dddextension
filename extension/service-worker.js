// Daily Dispo Deals – Deal Checker (MV3)
// Minimal service worker; no heavy logic, no API keys.

chrome.runtime.onInstalled.addListener(() => {});

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
    const doFetch = () =>
      doV2IngestFetch(ingestPayload, installId)
        .then((res) => res.json().catch(() => ({})))
        .then((data) => {
          if (data && data.ok) {
            const res = { ok: true, ingest_id: data.ingest_id, normalized: data.normalized };
            if (data.comparisons && typeof data.comparisons === "object") res.comparisons = data.comparisons;
            return res;
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
