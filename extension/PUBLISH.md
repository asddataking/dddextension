# Chrome Web Store Submission Guide

This guide walks you through submitting **Daily Dispo Deals – Deal Checker** to the Chrome Web Store.

---

## Pre-submission checklist

### 1. Developer account
- [ ] Register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] Pay the one-time $5 registration fee
- [ ] Use a dedicated email (it cannot be changed later)

### 2. Extension package
- [ ] Run `npm run pack` from the project root (or use the pack script) to create `dddextension.zip`
- [ ] Verify the ZIP contains `manifest.json` at the **root** (not inside a folder)
- [ ] Test the extension locally: Load unpacked from the `extension` folder, confirm Analyze and Clear work

### 3. Assets to prepare (before filling the dashboard)

| Asset | Size | Required | Notes |
|-------|------|----------|-------|
| **Store icon** | 128×128 px | Yes | Use `icons/128.png` (already exists) |
| **Screenshots** | 1280×800 px | At least 1, max 5 | Capture popup, sidebar, badges on a menu page |
| **Small promo tile** | 440×280 px | Yes | PNG or JPEG; used in store listing |
| **Marquee promo tile** | 1400×560 px | Optional | For featured placement |
| **Promo video** | YouTube link | Optional | Demo of the extension in use |

### 4. URLs to have ready
- [ ] **Privacy policy** – Must be hosted and publicly accessible. Use `privacy-policy.html` (in the extension folder); host it at e.g. `https://dailydispodeals.com/privacy` or GitHub Pages
- [ ] **Homepage** – e.g. `https://dailydispodeals.com`
- [ ] **Support URL** – e.g. `https://dailydispodeals.com/support` or a contact form

---

## Submission steps

### Step 1: Create the ZIP
From the project root:
```bash
npm install
npm run pack
```
This creates `dddextension.zip` in the project root with the correct structure (manifest at root). Developer docs (PUBLISH.md, etc.) are excluded from the package.

**Important:** The ZIP must have `manifest.json` at the root. Do not zip a parent folder that contains the extension.

### Step 2: Upload
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **Add new item**
3. Click **Choose file** → select `dddextension.zip` → **Upload**

### Step 3: Store listing tab
Fill in:

- **Short description** (132 chars max): Already in manifest:  
  `Overlay Worth It / Mid / Taxed badges on dispensary menu product cards.`
- **Detailed description**: Use the content from `STORE_LISTING.md`
- **Category**: **Shopping** (deal-finding tool)
- **Language**: English (add more if localized)
- **Screenshots**: Upload 1–5 images (1280×800 px)
- **Small promo tile**: 440×280 px
- **Marquee promo tile** (optional): 1400×560 px
- **Homepage URL**: Your site
- **Support URL**: Support or contact page

### Step 4: Privacy tab
- **Single purpose**: Describe that the extension helps users evaluate cannabis dispensary deals by overlaying value badges on menu pages.
- **Permission justifications**: When prompted, explain:
  - **activeTab, scripting**: To inject the deal checker UI and badges when the user clicks Analyze.
  - **storage**: To cache analyzed results and store a device ID locally.
  - **webNavigation**: To detect the Dutchie iframe on embedded menus.
  - **Host permissions** (Weedmaps, Dutchie, etc.): To read menu content and inject badges on supported dispensary sites.
- **Privacy policy URL**: Your hosted privacy policy URL
- **Data usage**: Declare what data is collected (see `PRIVACY_POLICY.md` for wording)

### Step 5: Distribution tab
- **Visibility**: Public (or unlisted if you prefer)
- **Regions**: All regions, or limit to cannabis-legal regions (e.g. US states where legal)
- **Mature content**: If your extension is cannabis-related, consider enabling **Mature content** so it appears correctly in search for of-age users

### Step 6: Test instructions (if needed)
If the extension requires specific sites or accounts to test:
- Provide a test Weedmaps or Dutchie menu URL
- Note: “Open a dispensary menu page, click the extension icon, click Analyze”

### Step 7: Submit
- Click **Submit for review**
- Choose whether to publish immediately after approval or defer

---

## Host permission justifications (copy-paste for dashboard)

When the dashboard asks why each permission is needed:

| Permission | Justification |
|------------|---------------|
| **activeTab** | Required to access the current tab when the user clicks the extension icon and chooses Analyze. |
| **scripting** | Required to inject the content script and overlay styles onto Weedmaps and Dutchie menu pages when the user clicks Analyze. |
| **storage** | Used to cache analyzed results locally and store a device ID for future account linking. No data is sent to external servers without user action. |
| **webNavigation** | Used to detect the Dutchie embedded menu iframe on dispensary sites (e.g. mindrightmi.com) so the extension can inject into the correct frame. |
| **Host: weedmaps.com** | Required to read dispensary menu content and overlay value badges when the user analyzes a Weedmaps menu page. |
| **Host: dutchie.com** | Required to read dispensary menu content and overlay value badges when the user analyzes a Dutchie menu page. |
| **Host: mindrightmi.com** | Dutchie-powered dispensary site; the menu is in an iframe. Required to show the sidebar and badges. |
| **Host: dailydispodeals.com** | Optional; used only when the user has triggered analysis, to send normalized deal data for comparison features. |

---

## Common rejection reasons

1. **Missing privacy policy** – Must be hosted and linked.
2. **Blank or poor description** – Use clear, accurate copy from `STORE_LISTING.md`.
3. **Missing screenshots** – At least one 1280×800 screenshot is required.
4. **Permission justification** – Be specific about why each permission is needed.
5. **Manifest in subfolder** – ZIP must have `manifest.json` at root.

---

## After approval

- You’ll receive an email when the extension is approved.
- If you chose deferred publish, go to the dashboard and publish manually.
- You have 30 days to publish after approval, or the item reverts to draft.
