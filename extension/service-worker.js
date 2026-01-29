// Daily Dispo Deals – Deal Checker (MV3)
// Minimal service worker; no heavy logic, no API keys.

const DEBUG = false;

chrome.runtime.onInstalled.addListener(() => {
  if (DEBUG) console.log("[DDD] Extension installed.");
});
