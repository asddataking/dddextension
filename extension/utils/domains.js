/**
 * Known Dutchie-powered white-label domains (embedded menu in iframe).
 */
const DUTCHIE_POWERED_HOSTS = ["mindrightmi.com"];

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
