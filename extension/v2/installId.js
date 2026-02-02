/**
 * Anonymous install ID for V2 ingest. No PII, no account linking.
 * @returns {Promise<string>} UUID
 */
function getOrCreateInstallId() {
  return chrome.storage.local.get("ddd_install_id").then(function (result) {
    if (result.ddd_install_id) return result.ddd_install_id;
    var installId = crypto.randomUUID();
    return chrome.storage.local.set({ ddd_install_id: installId }).then(function () { return installId; });
  });
}
