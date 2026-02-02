/**
 * Map analysis result to V2 ingest payload. Defensive: nulls/empty arrays ok.
 * Depends on getDispensaryName, getLocationFromUrl from domains.js.
 *
 * @param {string} source - "dutchie" | "weedmaps" | "unknown"
 * @param {Array} items - Scored items from runAnalyze
 * @param {string} pageUrl - Current tab URL
 * @returns {Object} Payload for POST /api/ingest/extension
 */
function mapToIngestPayload(source, items, pageUrl) {
  var nameGuess = typeof getDispensaryName === "function" ? getDispensaryName(pageUrl) : "";
  var locationHint = typeof getLocationFromUrl === "function" ? getLocationFromUrl(pageUrl) : "";

  var dealsRaw = (items || []).map(function (item) {
    var score = item.score || {};
    var priceText = item.price != null ? "$" + String(item.price) : null;
    return {
      title: (score.label || "") + " " + (item.name || "").trim(),
      description: item.rawText || null,
      price_text: priceText,
      discount_text: null,
      product_name: item.name || null,
      brand: item.brand || null,
      category: item.productType || null,
    };
  });

  var menuItemsRaw = (items || []).map(function (item) {
    var priceText = item.price != null ? "$" + String(item.price) : null;
    return {
      name: item.name || "",
      brand: item.brand || null,
      category: item.productType || null,
      price_text: priceText,
      thc_text: item.thc || null,
      raw_text: item.rawText || null,
    };
  });

  var confidence = items && items.length > 0 ? Math.min(1, 0.5 + items.length * 0.05) : 0;

  return {
    source: source === "weedmaps" || source === "dutchie" ? source : "unknown",
    page_url: pageUrl || "",
    captured_at: new Date().toISOString(),
    dispensary: {
      name_guess: nameGuess || null,
      location_hint: locationHint || null,
    },
    deals_raw: dealsRaw,
    menu_items_raw: menuItemsRaw,
    parser_meta: {
      parser_version: "v2",
      confidence: confidence,
      notes: null,
    },
  };
}
