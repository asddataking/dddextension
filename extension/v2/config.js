/**
 * V2 feature flag and dev config.
 * Ingest URL and API key come from the service worker (generated-env.js); run npm run build:env before pack.
 */
var V2_ENABLED = true;
var V2_TIMEOUT_MS = 12000;
/** Set true to show fake overlay on first item (for testing when no real overlay data). */
var DEBUG_OVERLAY = false;
/** Set true to show CSS version stamp in sidebar header. */
var DEV_SHOW_CSS_VERSION = false;
/** Set true to show "Better Nearby" bar with stub data (for testing). */
var DEV_BETTER_NEARBY = false;
