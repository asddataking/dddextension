# Daily Dispo Deals API (stub)

Stub backend for the V2 extension: ingest deals and return enhanced data.

- **POST /api/deals/ingest** – Accept raw deal JSON; store; return `{ ok, deal_id }`.
- **GET /api/deals/enhanced?location=&dispensary=** – Stub returns `{ dispo_score: null, community_votes: null, warning: null, deals: [] }` until AI is wired.

## Run locally

```bash
npm install
npm start
```

Listens on port 3000 (or `process.env.PORT`). For local testing, point the extension’s `API_BASE` to `http://localhost:3000` in popup.js and content.js. Production uses `https://dailydispodeals.com`.
