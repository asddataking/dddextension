/**
 * Daily Dispo Deals API – stub backend (stealth feeder).
 * POST /api/deals/ingest: accept raw deal JSON, persist, run AI normalize (stub), return { ok, deal_id?, category?, deal_type?, normalized_price?, price_per_unit?, quick_score?, summary? }.
 * GET /api/deals/enhanced: stub for future website use; extension does not call it.
 */

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// In-memory store for stub (replace with DB when wiring AI).
const rawDeals = [];
const dealIdCounter = { next: 1 };

function nextDealId() {
  const id = "ddd-" + dealIdCounter.next;
  dealIdCounter.next += 1;
  return id;
}

/**
 * Validate ingest payload shape. Accept: dispensary_name, location, raw_text, product_name, price, weight, thc, url, detected_at.
 */
function validateIngest(body) {
  if (!body || typeof body !== "object") return { valid: false, reason: "body must be object" };
  if (typeof body.product_name !== "string" || body.product_name.trim() === "")
    return { valid: false, reason: "product_name required" };
  const price = body.price;
  if (price !== undefined && price !== null) {
    const n = Number(price);
    if (Number.isNaN(n) || n < 0) return { valid: false, reason: "price must be non-negative number" };
  }
  return { valid: true };
}

// POST /api/deals/ingest
app.post("/api/deals/ingest", (req, res) => {
  const validation = validateIngest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.reason });
  }
  const deal_id = nextDealId();
  // Stub AI normalization (replace with real AI when wired).
  const category = "";
  const deal_type = "";
  const normalized_price = "";
  const price_per_unit = "";
  const quick_score = null;
  const summary = "Deal submitted";

  const record = {
    deal_id,
    dispensary_name: req.body.dispensary_name ?? "",
    location: req.body.location ?? "",
    raw_text: req.body.raw_text ?? "",
    product_name: String(req.body.product_name).trim(),
    price: req.body.price != null ? String(req.body.price) : "",
    weight: req.body.weight ?? "",
    thc: req.body.thc ?? "",
    url: req.body.url ?? "",
    detected_at: req.body.detected_at ?? new Date().toISOString(),
    category,
    deal_type,
    normalized_price,
    price_per_unit,
    quick_score,
    summary,
  };
  rawDeals.push(record);
  res.status(200).json({
    ok: true,
    deal_id,
    category: category || undefined,
    deal_type: deal_type || undefined,
    normalized_price: normalized_price || undefined,
    price_per_unit: price_per_unit || undefined,
    quick_score: quick_score != null ? quick_score : undefined,
    summary: summary || undefined,
  });
});

// GET /api/deals/enhanced?location=&dispensary=
// Stub: return dispo_score, community_votes, warning null and deals [] until AI is wired.
app.get("/api/deals/enhanced", (req, res) => {
  const location = (req.query.location || "").toString().trim();
  const dispensary = (req.query.dispensary || "").toString().trim();
  // Stub response until real query + AI enrichment.
  res.status(200).json({
    dispo_score: null,
    community_votes: null,
    warning: null,
    deals: [],
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "ddd-api" });
});

app.listen(PORT, () => {
  console.log("DDD API stub listening on port", PORT);
});
