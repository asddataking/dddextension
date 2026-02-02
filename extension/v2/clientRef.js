/**
 * Generate stable client_ref for overlay keying. djb2 hash.
 * @param {Object} deal - Deal item with name, price
 * @param {number} index - Index in list
 * @param {string} hostname - Page hostname (e.g. from URL)
 * @returns {string}
 */
function makeClientRef(deal, index, hostname) {
  var normalizedTitle = ((deal && deal.name) || "").trim().slice(0, 80);
  var priceText = "$" + (deal && deal.price != null ? String(deal.price) : "");
  var str = normalizedTitle + "|" + priceText + "|" + (index || 0) + "|" + (hostname || "");
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  return "ddd-" + Math.abs(h).toString(36);
}
