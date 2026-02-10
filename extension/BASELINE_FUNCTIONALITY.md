# Daily Dispo Deals Extension – Baseline Functionality

This document captures the extension’s behavior **before** the ingest-configuration plan (env-based API key, flat payload, logging, test button) is implemented. Use it as a reference to compare or roll back.

---

## What the extension does today

- **Popup:** “Analyze this page” and “Clear badges” on supported dispensary sites (Weedmaps, Dutchie, and Dutchie-powered hosts like mindrightmi.com).
- **Content script:** Injected on Analyze; parses menu DOM (parse.js), scores items (scoring.js), adds Worth It / Mid / Taxed badges and a sidebar with summary + retry.
- **Ingest:** After a successful Analyze, the extension sends a single POST to the backend with the captured deal data (no API key in the request today).
- **Sidebar:** Shows pill counts (Worth / Mid / Taxed), “Synced”/“Failed” status, Retry button, optional “Normalized” and “Better Nearby” when the backend returns them.

---

## User flows

### Analyze this page

1. User opens popup on a Weedmaps or Dutchie (or Dutchie-powered) menu page.
2. Clicks **Analyze this page**.
3. Popup requests host permission if needed, then injects into the tab (or into the Dutchie iframe for white-label sites): `stub.js`, `utils/domains.js`, `utils/parse.js`, `utils/scoring.js`, `v2/config.js`, `v2/installId.js`, `v2/mapToIngestPayload.js`, `v2/clientRef.js`, `v2/overlayStore.js`, then `content.js`.
4. Popup runs `window.__dddRunAnalyze({ site })` in the page; content script parses DOM, scores items, applies badges, and can show the sidebar.
5. Popup calls `triggerV2Ingest(tab.id, site, res.items, tab.url)` which builds payload via `mapToIngestPayload(site, items, pageUrl)` and sends `chrome.runtime.sendMessage({ type: "DDD_V2_INGEST", payload: { ingestPayload, installId } })`.
6. Service worker receives `DDD_V2_INGEST`, calls `doV2IngestFetch(ingestPayload, installId)` (POST to hardcoded URL, 8s timeout, no `x-api-key`), then responds with `{ ok, ingest_id?, normalized?, comparisons? }`.
7. Trigger updates sidebar status (“Normalized ✓” or “Failed”) and stores last ingest status in `chrome.storage.local`.

### Clear badges

- Popup runs a clear function in the tab (and in Dutchie iframe if present) that removes `.ddd-badge`, `.ddd-panel`, `.ddd-sidebar-backdrop` and `[data-ddd-id]`.

---

## Ingest flow (current)

```
Popup (Analyze) → triggerV2Ingest() [v2/trigger.js]
  → mapToIngestPayload(site, items, pageUrl) [v2/mapToIngestPayload.js]
  → getOrCreateInstallId() [v2/installId.js]
  → chrome.runtime.sendMessage({ type: "DDD_V2_INGEST", payload: { ingestPayload, installId } })
    → service-worker.js
      → doV2IngestFetch(ingestPayload, installId)
        POST https://dailydispodeals.com/api/ingest/extension
        Headers: Content-Type: application/json, X-DDD-Install-Id, X-DDD-Extension-Version
        Timeout: 8000 ms
        (No x-api-key header)
```

- **Endpoint:** `https://dailydispodeals.com` + `/api/ingest/extension` (hardcoded in `service-worker.js` and `v2/config.js`).
- **API key:** Not sent. `DDD_EXTENSION_API_KEY` exists only in repo `.env.local` and is not used by the extension.

---

## Current ingest payload shape (nested)

Produced by `mapToIngestPayload(source, items, pageUrl)`:

- `source`: `"weedmaps"` | `"dutchie"` | `"unknown"`
- `page_url`: string
- `captured_at`: ISO timestamp
- `dispensary`: `{ name_guess, location_hint }`
- `deals_raw`: array of `{ title, description, price_text, discount_text, product_name, brand, category }`
- `menu_items_raw`: array of `{ name, brand, category, price_text, thc_text, raw_text }`
- `parser_meta`: `{ parser_version, confidence, notes }`

(No top-level `dispensary_name`, `dispensary_url`, `raw_text`, `product_name`, `price_text`, `category_hint` as in the planned flat shape.)

---

## Key files (current roles)

| File | Role |
|------|------|
| `manifest.json` | MV3; popup; background service worker; optional host permissions (weedmaps, dutchie, mindrightmi, dailydispodeals); no localhost. |
| `service-worker.js` | Handles `DDD_GET_CSS`, `DDD_GET_LOGO`, `DDD_V2_INGEST`; performs ingest fetch (no API key). |
| `popup/popup.html` | Popup UI: status, “Analyze this page”, “Clear badges”. |
| `popup/popup.js` | Site detection, cache, inject + run Analyze, call `triggerV2Ingest`; Clear. |
| `content.js` | DOM parse/score, badges, sidebar, retry (sends `DDD_V2_INGEST` again with same payload). |
| `v2/config.js` | `V2_ENABLED`, `V2_API_BASE`, `V2_INGEST_PATH`, `V2_TIMEOUT_MS`, dev flags. |
| `v2/trigger.js` | `triggerV2Ingest(tabId, site, items, pageUrl)` → payload + installId → `DDD_V2_INGEST`. |
| `v2/mapToIngestPayload.js` | Builds nested payload from site, items, pageUrl. |
| `v2/installId.js` | `getOrCreateInstallId()` for `X-DDD-Install-Id`. |
| `utils/domains.js` | `getDispensaryName`, `getLocationFromUrl`, `detectSite`. |

---

## Config / env (current)

- **Extension:** No `process.env` or `import.meta.env`; all config is in source (`service-worker.js`, `v2/config.js`). No build step that reads `.env.local`.
- **Backend:** Uses `process.env.PORT` (see `backend/server.js`).

---

*Baseline snapshot: before adding inject-env script, x-api-key header, flat payload, DEBUG logging, Test ingest button, and localhost permissions.*
