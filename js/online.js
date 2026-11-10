/* Global top 10 stored in Cloud Firestore (REST API, no SDK needed).
 * Scores live in boards/{pieces}/scores/{id} with fields name, ms, pieces, shape, date. */
window.BihOnline = (function () {
  "use strict";
  var cfg = window.BIH_FIREBASE;
  if (!cfg || !cfg.apiKey || !cfg.projectId) return { enabled: false };
  var base = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(cfg.projectId) +
    "/databases/(default)/documents";
  var key = "?key=" + encodeURIComponent(cfg.apiKey);

  function parse(doc) {
    var f = doc.fields || {};
    return {
      id: doc.name.split("/").pop(),
      name: f.name ? f.name.stringValue : "",
      ms: f.ms ? Number(f.ms.integerValue) : 0,
      date: f.date ? f.date.timestampValue : "",
    };
  }
  function check(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  return {
    enabled: true,
    // board = "<pieces>-<bg>-<shape>", e.g. "22-flag-classic"
    top: function (board) {
      return fetch(base + "/boards/" + encodeURIComponent(board) + ":runQuery" + key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "scores" }],
            orderBy: [{ field: { fieldPath: "ms" }, direction: "ASCENDING" }],
            limit: 10,
          },
        }),
      }).then(check).then(function (rows) {
        return rows.filter(function (r) { return r.document; }).map(function (r) { return parse(r.document); });
      });
    },
    submit: function (board, pieces, name, ms, shape, bg) {
      return fetch(base + "/boards/" + encodeURIComponent(board) + "/scores" + key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            name: { stringValue: String(name || "").slice(0, 20) },
            ms: { integerValue: String(Math.round(ms)) },
            pieces: { integerValue: String(pieces) },
            shape: { stringValue: shape === "wavy" ? "wavy" : "classic" },
            bg: { stringValue: bg === "map" ? "map" : "flag" },
            date: { timestampValue: new Date().toISOString() },
          },
        }),
      }).then(check).then(parse);
    },
  };
})();
