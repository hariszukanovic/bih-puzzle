/* Simple nickname filter for the public top 10 (Bosnian/Croatian/Serbian + English).
 * Matching ignores case, diacritics, spaces/punctuation and common letter swaps (0→o, 1→i, 3→e, 4→a, 5→s, @→a). */
window.BihNameFilter = (function () {
  "use strict";
  var WORDS = [
    // bs/hr/sr
    "jebe", "jebi", "jeba", "jebo", "jeben", "pizd", "picka", "picku", "picko", "kurac", "kurc", "kurcin",
    "govno", "govna", "sranje", "seronj", "kreten", "debil", "idiot", "glupan", "glupak", "budala",
    "kurva", "kurve", "drolj", "smece", "majmun", "peder", "pederu", "cigan", "balij", "cetnik", "ustas",
    "seljacin", "materin", "supak", "guzica", "fukara",
    "nacist", "hitler",
    // en
    "fuck", "fuk", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole", "bastard", "slut", "whore",
    "nigg", "faggot", "retard", "nazi", "penis", "vagina", "porn"
  ];
  function norm(s) {
    s = String(s || "").toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/đ/g, "d").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
         .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/@/g, "a").replace(/\$/g, "s");
    return s.replace(/[^a-z]/g, "");
  }
  return {
    isBad: function (name) {
      var n = norm(name);
      if (!n) return false;
      var squeezed = n.replace(/(.)\1+/g, "$1"); // "fuuuck" → "fuck"
      for (var i = 0; i < WORDS.length; i++) {
        var w = WORDS[i];
        if (n.indexOf(w) >= 0 || squeezed.indexOf(w.replace(/(.)\1+/g, "$1")) >= 0) return true;
      }
      return false;
    },
  };
})();
