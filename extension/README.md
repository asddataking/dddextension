# Daily Dispo Deals – Deal Checker (Chrome Extension v1)

Chrome Extension (Manifest V3) that overlays **Worth It / Mid / Taxed** badges on dispensary menu product cards. Supported sites: **Weedmaps** and **Dutchie**.

## How to load (unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the **extension** folder (the folder that contains `manifest.json`).
5. The extension icon appears in the toolbar. Open a Weedmaps or Dutchie menu page, click the icon, then click **Analyze this page**.

## Supported sites

- **Weedmaps** (`weedmaps.com` and subdomains)
- **Dutchie** (`dutchie.com` and subdomains)

On other sites, the popup shows **Site: Unknown** and Analyze is disabled.

## v1 limitations

- **Flower-heavy heuristics**: Parsing works best for flower (price + weight). Edibles (mg) and other types are detected when possible; scoring falls back to “Mid” when there’s not enough info.
- **Optional host permission**: The first time you click **Analyze** on Weedmaps or Dutchie, Chrome may prompt for permission to access that site. Grant it to allow the extension to read the page and inject badges.
- **No account connect**: v1 does not sign you in or link to an account. A `device_id` is generated and stored locally for future account linking.
- **No server calls**: All scoring is done locally with rule-based thresholds (Michigan baseline). No data is sent to Daily Dispo Deals in v1.

## Usage

1. Go to a dispensary menu page on Weedmaps or Dutchie.
2. Click the extension icon.
3. Click **Analyze this page**. The extension injects badges on product cards and/or shows a floating panel and a list in the popup (up to 15 items).
4. Click **Clear badges** to remove overlays from the page.
5. Use the **Debug** section in the popup to see how many items were found and which parser was used.

## Future plan

- **Connect account**: Link `device_id` to a user account on Daily Dispo Deals.
- **Server analyze**: Send extracted items to the server for richer analysis or AI-based scoring (with user consent).
- **More sites**: Add support for additional dispensary menu platforms.

## Permissions

- **activeTab**: Access the current tab when you use the extension (e.g. click the icon and Analyze).
- **scripting**: Inject the content script and overlay CSS only when you click Analyze.
- **storage**: Store `device_id` locally for future account linking.
- **Optional host permissions**: Weedmaps and Dutchie; requested when you first use Analyze on those sites.

No database keys, Supabase service-role keys, or Stripe secrets are used in this extension.

**Console messages:** Form-field and Content Security Policy (CSP) messages that mention scripts like `up.js` or refer to the host page (e.g. Weedmaps) come from the **website**, not from this extension. The extension uses only external scripts and styles (no inline script or style) and gives overlay buttons an `id` and `name` where relevant.
