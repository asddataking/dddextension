/**
 * Rule-based scoring (Michigan baseline v1). No AI; local badges only.
 */

// Michigan baseline v1 ($/g for flower, $/100mg for edibles)
const FLOWER_WORTH_MAX = 6.0;
const FLOWER_MID_MAX = 9.0;
const EDIBLE_WORTH_MAX = 6.0;
const EDIBLE_MID_MAX = 10.0;

/**
 * Normalize item to a comparable metric. Returns null if not enough info.
 * @param {{ productType: string, price: number, weightGrams?: number, mgTotal?: number }} item
 * @returns {{ metricLabel: string, metricValue: number }|null}
 */
function normalize(item) {
  if (!item || typeof item.price !== "number" || item.price <= 0) return null;

  const type = (item.productType || "other").toLowerCase();

  if (type === "flower" || type === "concentrate" || type === "preroll") {
    const grams = item.weightGrams;
    if (grams == null || grams <= 0) return null;
    return { metricLabel: "$/g", metricValue: item.price / grams };
  }

  if (type === "edible") {
    const mg = item.mgTotal;
    if (mg == null || mg <= 0) return null;
    return { metricLabel: "$/100mg", metricValue: item.price / (mg / 100) };
  }

  if (type === "vape" || type === "other") {
    const grams = item.weightGrams;
    if (grams != null && grams > 0) return { metricLabel: "$/g", metricValue: item.price / grams };
    return null;
  }

  return null;
}

/**
 * Score a single item; returns badge, label, metric, reason.
 * @param {{ productType?: string, price: number, weightGrams?: number, mgTotal?: number }} item
 * @returns {{ badge: "worth"|"mid"|"taxed", label: string, metricLabel: string, metricValue: number, reason: string }}
 */
function scoreItem(item) {
  const norm = normalize(item);
  if (!norm) {
    return {
      badge: "mid",
      label: "⚠️ Mid",
      metricLabel: "—",
      metricValue: 0,
      reason: "Not enough info",
    };
  }

  const type = (item.productType || "other").toLowerCase();
  const isEdible = type === "edible";
  const worthMax = isEdible ? EDIBLE_WORTH_MAX : FLOWER_WORTH_MAX;
  const midMax = isEdible ? EDIBLE_MID_MAX : FLOWER_MID_MAX;

  let badge;
  let label;
  if (norm.metricValue <= worthMax) {
    badge = "worth";
    label = "✅ Worth It";
  } else if (norm.metricValue <= midMax) {
    badge = "mid";
    label = "⚠️ Mid";
  } else {
    badge = "taxed";
    label = "❌ Taxed";
  }

  return {
    badge,
    label,
    metricLabel: norm.metricLabel,
    metricValue: Math.round(norm.metricValue * 100) / 100,
    reason: norm.metricLabel + " " + norm.metricValue.toFixed(2),
  };
}
