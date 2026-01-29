/**
 * Detect dispensary site from URL for supported hosts.
 * @param {string} url - Page URL (e.g. tab.url)
 * @returns {"weedmaps"|"dutchie"|"unknown"}
 */
function detectSite(url) {
  if (!url || typeof url !== "string") return "unknown";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("weedmaps.com")) return "weedmaps";
    if (host.includes("dutchie.com")) return "dutchie";
  } catch (_) {
    // Invalid URL
  }
  return "unknown";
}
