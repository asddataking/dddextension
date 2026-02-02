/**
 * V2 ingest trigger. Called after Analyze completes. Runs in background; updates sidebar via messages.
 */
function triggerV2Ingest(tabId, site, items, pageUrl) {
  if (typeof V2_ENABLED === "undefined" || !V2_ENABLED) return;
  if (!items || items.length === 0) return;
  if (!tabId) return;

  function notifyStatus(status) {
    chrome.tabs.sendMessage(tabId, { type: "DDD_V2_STATUS", status: status }).catch(function () {});
  }

  function notifyNormalized(data) {
    chrome.tabs.sendMessage(tabId, { type: "DDD_V2_NORMALIZED", normalized: data }).catch(function () {});
  }

  notifyStatus("Sending…");

  var payload = mapToIngestPayload(site, items, pageUrl);

  getOrCreateInstallId()
    .then(function (installId) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "DDD_V2_INGEST",
            payload: { ingestPayload: payload, installId: installId },
          },
          function (response) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response || {});
          }
        );
      });
    })
    .then(function (response) {
      if (response && response.ok && response.normalized) {
        notifyStatus("Normalized ✓");
        notifyNormalized(response.normalized);
        var toStore = response.normalized;
        if (typeof toStore === "object") {
          try {
            var s = JSON.stringify(toStore);
            if (s.length > 5000) toStore = { _truncated: true, deals: (toStore.deals || []).slice(0, 5) };
          } catch (_) {}
        }
        chrome.storage.local.set({
          ddd_last_ingest_status: "ok",
          ddd_last_normalized: toStore,
          ddd_last_ingest_at: Date.now(),
        }).catch(function () {});
      } else {
        notifyStatus("Failed");
        chrome.storage.local.set({
          ddd_last_ingest_status: "failed",
          ddd_last_ingest_at: Date.now(),
        }).catch(function () {});
      }
    })
    .catch(function (err) {
      if (typeof V2_DEBUG !== "undefined" && V2_DEBUG) console.warn("[DDD V2] ingest error", err);
      notifyStatus("Failed");
      chrome.storage.local.set({
        ddd_last_ingest_status: "failed",
        ddd_last_ingest_at: Date.now(),
      }).catch(function () {});
    });
}
