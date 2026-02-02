/**
 * Known Dutchie-powered white-label domains (embedded menu in iframe).
 */
const DUTCHIE_POWERED_HOSTS = ["mindrightmi.com"];

/** Host -> display name for V2 ingest (e.g. mindrightmi.com -> "Mind Right"). */
const DISPENSARY_NAME_BY_HOST = {
  "mindrightmi.com": "Mind Right",
  "weedmaps.com": "Weedmaps",
  "www.weedmaps.com": "Weedmaps",
};

/**
 * Derive dispensary display name from tab URL for V2 ingest.
 * @param {string} url - Page URL (e.g. tab.url)
 * @returns {string} Display name or ""
 */
function getDispensaryName(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return DISPENSARY_NAME_BY_HOST[host] || DISPENSARY_NAME_BY_HOST[host + ".com"] || "";
  } catch (_) {
    return "";
  }
}

/**
 * Derive location from tab URL for V2 ingest (e.g. MI for .mi.com).
 * @param {string} url - Page URL (e.g. tab.url)
 * @returns {string} Location code or ""
 */
function getLocationFromUrl(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".mi.com") || host.endsWith("mindrightmi.com")) return "MI";
    if (host.includes("weedmaps.com")) return "";
    return "";
  } catch (_) {
    return "";
  }
}

/**
 * Detect dispensary site from URL for supported hosts.
 * Dutchie-powered sites (e.g. mindrightmi.com) use an iframe from dutchie.com/embedded-menu.
 * @param {string} url - Page URL (e.g. tab.url)
 * @returns {"weedmaps"|"dutchie"|"unknown"}
 */
function detectSite(url) {
  if (!url || typeof url !== "string") return "unknown";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("weedmaps.com")) return "weedmaps";
    if (host.includes("dutchie.com")) return "dutchie";
    if (DUTCHIE_POWERED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return "dutchie";
  } catch (_) {
    // Invalid URL
  }
  return "unknown";
}
