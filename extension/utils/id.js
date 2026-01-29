/**
 * Device ID: generate once, persist in chrome.storage.local for later account linking.
 * @returns {Promise<string>} UUID v4 device_id
 */
function getOrCreateDeviceId() {
  return chrome.storage.local.get("device_id").then((result) => {
    if (result.device_id) return result.device_id;
    const deviceId = crypto.randomUUID();
    return chrome.storage.local.set({ device_id: deviceId }).then(() => deviceId);
  });
}
