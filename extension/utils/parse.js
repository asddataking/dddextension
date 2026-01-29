/**
 * Parse product items from dispensary menu DOM.
 * Best-effort card-finding; flower-first heuristics. Fails gracefully (returns []).
 */

const DEBUG = false;

const PRICE_REGEX = /\$ ?(\d+(?:\.\d{1,2})?)/;
const WEIGHT_GRAM_REGEX = /(\d+(?:\.\d+)?)\s*g(?:ram)?s?/i;
const WEIGHT_FRAC_REGEX = /(?:^|[^\d])(1\/8|1\/4|1\/2|¼|½)(?:[^\d]|$)/i;
const OZ_REGEX = /\b(?:oz|ounce)\b/i;
const MG_REGEX = /(\d+(?:,\d+)?)\s*mg/i;
const FRACTION_TO_GRAMS = { "1/8": 3.5, "1/4": 7, "1/2": 14, "¼": 3.5, "½": 14 };

/**
 * @typedef {"flower"|"edible"|"vape"|"concentrate"|"preroll"|"other"} ProductType
 */

/**
 * @typedef {Object} ParsedItem
 * @property {string} id
 * @property {string} name
 * @property {string} [brand]
 * @property {ProductType} productType
 * @property {number} price
 * @property {number} [weightGrams]
 * @property {number} [mgTotal]
 * @property {string} rawText
 * @property {string} [nodeSelector]
 */

/**
 * Simple hash for stable id from name+price+weight text.
 * @param {string} s
 * @returns {string}
 */
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return "ddd-" + Math.abs(h).toString(36);
}

/**
 * Infer product type from raw text.
 * @param {string} text
 * @param {number} [weightGrams]
 * @param {number} [mgTotal]
 * @returns {ProductType}
 */
function inferProductType(text, weightGrams, mgTotal) {
  const t = text.toLowerCase();
  if (mgTotal != null && mgTotal > 0) return "edible";
  if (/\b(cartridge|cart|vape|pen)\b/.test(t)) return "vape";
  if (/\b(concentrate|wax|shatter|live resin|rosin)\b/.test(t)) return "concentrate";
  if (/\b(preroll|pre-roll|joint)\b/.test(t)) return "preroll";
  if (weightGrams != null && weightGrams > 0) return "flower";
  if (/\b(flower|eighth|quarter|half|oz)\b/.test(t)) return "flower";
  return "other";
}

/**
 * Extract weight in grams from text.
 * @param {string} text
 * @returns {number|undefined}
 */
function parseWeightGrams(text) {
  const g = text.match(WEIGHT_GRAM_REGEX);
  if (g) return parseFloat(g[1]);
  const frac = text.match(WEIGHT_FRAC_REGEX);
  if (frac) {
    const key = frac[1].replace(/¼/, "1/4").replace(/½/, "1/2");
    return FRACTION_TO_GRAMS[key];
  }
  if (OZ_REGEX.test(text)) return 28;
  return undefined;
}

/**
 * Extract total mg from text (edibles).
 * @param {string} text
 * @returns {number|undefined}
 */
function parseMgTotal(text) {
  const m = text.match(MG_REGEX);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  return undefined;
}

/**
 * Weedmaps: product cards are list items or containers with a product link + price + weight (e.g. "1/8 oz", "1 g").
 * Look for links to /menu/ and their parent card that has price and weight text.
 * Also searches within main content and accepts various weight formats.
 * @param {Document} doc
 * @returns {Array<{ container: Element, fullText: string }>}
 */
function findAllBySelector(root, selector) {
  const out = [];
  const collect = (el) => {
    try {
      const matches = el.querySelectorAll(selector);
      for (let i = 0; i < matches.length; i++) out.push(matches[i]);
      const children = el.querySelectorAll("*");
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.shadowRoot) collect(c.shadowRoot);
      }
    } catch (_) {}
  };
  collect(root);
  return out;
}

function findWeedmapsCards(doc) {
  const candidates = [];
  const root = doc.querySelector("main") || doc.body;
  if (!root) return [];

  const productLinks = findAllBySelector(root, 'a[href*="/menu/"], a[href*="menu"]');
  const seen = new Set();

  const hasWeightInText = (text) => {
    return (
      WEIGHT_GRAM_REGEX.test(text) ||
      WEIGHT_FRAC_REGEX.test(text) ||
      /\b1\/8\s*(oz|ounce)?\b/i.test(text) ||
      /\b1\/4\s*(oz|ounce)?\b/i.test(text) ||
      /\b1\/2\s*(oz|ounce)?\b/i.test(text) ||
      /\b1\s*g\b/i.test(text) ||
      /\b3\.5\s*g\b/i.test(text) ||
      /\b7\s*g\b/i.test(text) ||
      /\b(oz|ounce)\b/i.test(text)
    );
  };

  for (const link of productLinks) {
    const linkText = (link.textContent || "").trim();
    if (!linkText || linkText.length < 3) continue;
    const href = (link.getAttribute("href") || "").trim();
    if (!href.includes("menu")) continue;

    let card = link.closest("li") || link.closest("[role='listitem']") || link.parentElement;
    let depth = 0;
    while (card && depth < 15) {
      if (card === root) break;
      const text = (card.textContent || "").trim();
      if (text.length < 15) {
        card = card.parentElement;
        depth++;
        continue;
      }
      const hasPrice = PRICE_REGEX.test(text);
      const hasWeight = hasWeightInText(text);
      if (hasPrice && hasWeight) {
        const key = card.getAttribute?.("data-ddd-seen") || (card.className + " " + text.slice(0, 100));
        if (seen.has(key)) break;
        seen.add(key);
        candidates.push({ container: card, fullText: text });
        break;
      }
      card = card.parentElement;
      depth++;
    }
  }
  return candidates;
}

/**
 * Generic: find elements containing price text by walking the DOM from text nodes.
 * @param {Document} doc
 * @returns {Array<{ container: Element, priceText: string, fullText: string }>}
 */
function findCardCandidatesGeneric(doc) {
  const candidates = [];
  if (!doc.body) return candidates;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
  const priceNodes = [];
  let n;
  while ((n = walker.nextNode())) {
    const text = n.textContent || "";
    if (PRICE_REGEX.test(text) && /\d/.test(text)) priceNodes.push(n);
  }

  const seen = new Set();
  for (const node of priceNodes) {
    let el = node.parentElement;
    let depth = 0;
    const maxDepth = 15;
    while (el && depth < maxDepth) {
      const text = (el.textContent || "").trim();
      if (text.length < 10) {
        el = el.parentElement;
        depth++;
        continue;
      }
      const priceMatch = text.match(PRICE_REGEX);
      if (!priceMatch) {
        el = el.parentElement;
        depth++;
        continue;
      }
      const key = el.getAttribute?.("data-ddd-seen") || el.className + " " + el.tagName + " " + text.slice(0, 80);
      if (seen.has(key)) {
        el = el.parentElement;
        depth++;
        continue;
      }
      seen.add(key);
      candidates.push({
        container: el,
        priceText: priceMatch[0],
        fullText: text,
      });
      break;
    }
  }
  return candidates;
}

/**
 * Find card-like containers: elements that contain $ and digits (price).
 * For Weedmaps, try findWeedmapsCards first; fall back to generic walker if none found.
 * @param {Document} doc
 * @param {"weedmaps"|"dutchie"} site
 * @returns {Array<{ container: Element, priceText: string, fullText: string }>}
 */
function findCardCandidates(doc, site) {
  if (site === "weedmaps") {
    const weedmapsCards = findWeedmapsCards(doc);
    if (weedmapsCards.length > 0) {
      return weedmapsCards.map((c) => ({ container: c.container, priceText: (c.fullText.match(PRICE_REGEX) || [""])[0], fullText: c.fullText }));
    }
    return findCardCandidatesGeneric(doc);
  }
  return findCardCandidatesGeneric(doc);
}

/**
 * Parse items from the current document.
 * @param {"weedmaps"|"dutchie"} site
 * @returns {ParsedItem[]}
 */
function parseItemsFromDOM(site) {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.body) return [];

    const candidates = findCardCandidates(doc, site);
    const items = [];
    const usedIds = new Set();
    const usedContainers = new Set();

    for (let i = 0; i < candidates.length; i++) {
      const { container, fullText } = candidates[i];
      if (usedContainers.has(container)) continue;
      usedContainers.add(container);
      const priceMatch = fullText.match(PRICE_REGEX);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1]);
      if (isNaN(price) || price <= 0) continue;

      const weightGrams = parseWeightGrams(fullText);
      const mgTotal = parseMgTotal(fullText);
      const productType = inferProductType(fullText, weightGrams, mgTotal);

      let name = "";
      if (site === "weedmaps") {
        const productLink = container.querySelector('a[href*="/menu/"]');
        if (productLink) {
          name = (productLink.textContent || "").replace(/\s*product detail page\s*/i, "").trim().slice(0, 120);
        }
      }
      if (!name) {
        const firstLine = fullText.split(/\n/)[0]?.trim() || fullText.slice(0, 80);
        name = firstLine.replace(PRICE_REGEX, "").trim().slice(0, 120) || "Product " + (i + 1);
      }
      const idSource = name + price + (weightGrams ?? "") + (mgTotal ?? "");
      const id = simpleHash(idSource);
      if (usedIds.has(id)) continue;
      usedIds.add(id);

      const dataId = "ddd-item-" + i;
      try {
        container.setAttribute("data-ddd-id", dataId);
      } catch (_) {}
      const nodeSelector = "[data-ddd-id=\"" + dataId + "\"]";

      items.push({
        id,
        name,
        productType,
        price,
        weightGrams: weightGrams ?? undefined,
        mgTotal: mgTotal ?? undefined,
        rawText: fullText.slice(0, 300),
        nodeSelector,
      });
    }

    if (DEBUG) console.log("[DDD parse] site=" + site + " items=" + items.length, items);
    return items;
  } catch (e) {
    if (DEBUG) console.warn("[DDD parse] error", e);
    return [];
  }
}
