/**
 * Map analysis result to V2 ingest payload. Defensive: nulls/empty arrays ok.
 * Depends on getDispensaryName, getLocationFromUrl from domains.js.
 * Includes flat shape (source, dispensary_name, dispensary_url, page_url, raw_text, product_name, price_text, category_hint, captured_at)
 * plus observations array and legacy nested shape for backward compatibility.
 *
 * @param {string} source - "dutchie" | "weedmaps" | "unknown"
 * @param {Array} items - Scored items from runAnalyze
 * @param {string} pageUrl - Current tab URL
 * @returns {Object} Payload for POST /api/ingest/extension
 */
function mapToIngestPayload(source, items, pageUrl) {
  var nameGuess = typeof getDispensaryName === "function" ? getDispensaryName(pageUrl) : "";
  var locationHint = typeof getLocationFromUrl === "function" ? getLocationFromUrl(pageUrl) : "";
  var dispensaryUrl = "";
  try {
    if (pageUrl && typeof pageUrl === "string") {
      var u = new URL(pageUrl);
      dispensaryUrl = u.origin + u.pathname;
    }
  } catch (_) {}

  var arr = items || [];
  var observations = arr.map(function (item) {
    var priceText = item.price != null ? "$" + String(item.price) : null;
    return {
      raw_text: item.rawText != null ? item.rawText : null,
      product_name: item.name != null ? item.name : null,
      price_text: priceText,
      category_hint: item.productType != null ? item.productType : null,
    };
  });
  var first = arr[0];
  var rawText = first && first.rawText != null ? first.rawText : null;
  var productName = first && first.name != null ? first.name : null;
  var priceText = first && first.price != null ? "$" + String(first.price) : null;
  var categoryHint = first && first.productType != null ? first.productType : null;

  var dealsRaw = arr.map(function (item) {
    var score = item.score || {};
    var pt = item.price != null ? "$" + String(item.price) : null;
    return {
      title: (score.label || "") + " " + (item.name || "").trim(),
      description: item.rawText || null,
      price_text: pt,
      discount_text: null,
      product_name: item.name || null,
      brand: item.brand || null,
      category: item.productType || null,
    };
  });

  var menuItemsRaw = arr.map(function (item) {
    var pt = item.price != null ? "$" + String(item.price) : null;
    return {
      name: item.name || "",
      brand: item.brand || null,
      category: item.productType || null,
      price_text: pt,
      thc_text: item.thc || null,
      raw_text: item.rawText || null,
    };
  });

  var confidence = arr.length > 0 ? Math.min(1, 0.5 + arr.length * 0.05) : 0;
  var capturedAt = new Date().toISOString();

  return {
    source: "chrome_extension",
    dispensary_name: nameGuess || null,
    dispensary_url: dispensaryUrl || null,
    page_url: pageUrl || "",
    raw_text: rawText,
    product_name: productName,
    price_text: priceText,
    category_hint: categoryHint,
    captured_at: capturedAt,
    observations: observations,
    page_source: source === "weedmaps" || source === "dutchie" ? source : "unknown",
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
