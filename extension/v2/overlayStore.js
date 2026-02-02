/**
 * Overlay store for Gemini-normalized data keyed by client_ref.
 * Uses chrome.storage.local. No Gemini calls from extension.
 */
var DDD_OVERLAY_KEY = "ddd_overlay_map_v1";

function getOverlayMap() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(DDD_OVERLAY_KEY, function (result) {
        var map = result && result[DDD_OVERLAY_KEY];
        resolve(typeof map === "object" && map !== null ? map : {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

function upsertOverlays(overlays) {
  if (!overlays || !Array.isArray(overlays)) return Promise.resolve();
  return getOverlayMap().then(function (map) {
    for (var i = 0; i < overlays.length; i++) {
      var o = overlays[i];
      if (o && o.client_ref) {
        map[o.client_ref] = o;
      }
    }
    var toSet = {};
    toSet[DDD_OVERLAY_KEY] = map;
    return chrome.storage.local.set(toSet);
  });
}
