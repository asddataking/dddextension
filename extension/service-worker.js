// Daily Dispo Deals – Deal Checker (MV3)
// Minimal service worker; no heavy logic, no API keys.

const DEBUG = false;

chrome.runtime.onInstalled.addListener(() => {
  if (DEBUG) console.log("[DDD] Extension installed.");
});

// #region agent log
const DDD_DEBUG_INGEST = "http://127.0.0.1:7244/ingest/7581459e-929e-47bd-9dee-b089f99a55e5";
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "DDD_DEBUG_LOG" && msg.payload) {
    fetch(DDD_DEBUG_INGEST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg.payload, timestamp: Date.now(), sessionId: "debug-session" }),
    }).catch(() => {});
    sendResponse();
  }
  return false;
});
// #endregion
