/**
 * Sets a fallback __dddRunAnalyze so the popup always gets a result.
 * If the real content.js loads, it will overwrite this.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  window.__dddRunAnalyze = function (payload) {
    return Promise.resolve({
      ok: false,
      items: [],
      count: 0,
      parser: (payload && payload.site) || "unknown",
      bodyTextLength: typeof document !== "undefined" && document.body ? (document.body.innerText || "").length : -1,
      stub: true,
    });
  };
})();
