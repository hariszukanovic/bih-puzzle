/* Slagalica BiH — a jigsaw puzzle of the map of Bosnia and Herzegovina. */
(() => {
  "use strict";

  const MAP = window.BIH_MAP;
  const W = Math.ceil(MAP.width);
  const H = Math.ceil(MAP.height);
  const RES = 1.6;          // map canvas pixels per world unit
  const PAD = 7;            // world-unit padding around pieces (for shadow)
  const SNAP = 34;          // snap distance in world units
  const MIN_N = 2, MAX_N = 80;

  const $ = (s) => document.querySelector(s);
  const canvas = $("#board");
  const ctx = canvas.getContext("2d");
  const confettiCanvas = $("#confetti");

  /* ---------------- settings ---------------- */
  const DEFAULTS = { n: 22, cantons: false, cities: false, hint: false, bg: "flag", shape: "classic", sound: true, lang: "bs", fullscreen: true };
  const settings = Object.assign({}, DEFAULTS, readStore());
  const qs = new URLSearchParams(location.search);
  if (qs.get("lang") === "en" || qs.get("lang") === "bs") settings.lang = qs.get("lang");
  if (qs.get("n")) settings.n = clampN(parseInt(qs.get("n"), 10));
  if (qs.get("shape") === "wavy" || qs.get("shape") === "classic") settings.shape = qs.get("shape");
  if (qs.get("bg") === "flag" || qs.get("bg") === "map") settings.bg = qs.get("bg");
  settings.n = clampN(settings.n);
  // every game starts clean: no hint, no cantons, no cities
  const resetHelpers = () => { settings.hint = false; settings.cantons = false; settings.cities = false; };
  resetHelpers();

  function readStore() {
    try { return JSON.parse(localStorage.getItem("bih-puzzle-v2") || "{}"); } catch (e) { return {}; }
  }
  function saveStore() {
    try { localStorage.setItem("bih-puzzle-v2", JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function clampN(n) { return Math.max(MIN_N, Math.min(MAX_N, isFinite(n) ? n : DEFAULTS.n)); }
  const t = (k) => (I18N[settings.lang] && I18N[settings.lang][k]) || I18N.bs[k] || k;
  // text with a piece count; Bosnian uses "dijela" after 2, 3, 4 (22, 23, 24 …)
  const tn = (k, n) => {
    const v = Number(n), d = v % 10, h = v % 100;
    let s = t(k);
    if (settings.lang === "bs" && d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) s = s.replace("{n} dijelova", "{n} dijela");
    return s.replace("{n}", n);
  };

  /* ---------------- geometry ---------------- */
  function ringsPath(rings) {
    const p = new Path2D();
    for (const r of rings) {
      p.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) p.lineTo(r[i][0], r[i][1]);
      p.closePath();
    }
    return p;
  }
  const outlinePath = ringsPath(MAP.outline);
  for (const r of MAP.regions) r.path = ringsPath(r.rings);

  const COLORS = {
    USK: "#7fd08a", PK: "#ffab91", TK: "#f48fb1", ZDK: "#81c7f5", BPK: "#ce93d8",
    SBK: "#ffb74d", HNK: "#6fc6e8", ZHK: "#c5e1a5", KS: "#ff8a80", K10: "#b39ddb",
    RS: "#ffe49a", BD: "#80cbc4",
  };
  // Republika Srpska is U-shaped, so it gets a second label in the north.
  const EXTRA_LABELS = { RS: [[455, 150]] };

  /* ---------------- random ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- map rendering ---------------- */
  function drawStar(g, cx, cy, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.4 : r;
      g.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    g.closePath();
    g.fill();
  }

  function drawFlag(g) {
    // Flag of BiH (proportions 1:2), sized to the map height and centred on the triangle.
    const u = H * 1.04;
    const ox = W / 2 - 0.98 * u, oy = (H - u) / 2;
    g.fillStyle = "#002395";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#fecb00";
    g.beginPath();
    g.moveTo(ox + 0.53 * u, oy);
    g.lineTo(ox + 1.53 * u, oy);
    g.lineTo(ox + 1.53 * u, oy + u);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffffff";
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      drawStar(g, ox + (0.37 + s) * u, oy + s * u, 0.062 * u);
    }
  }

  // vivid rainbow from west (red) to east (blue), light in the north and
  // darker in the south, so each part of the map has a clearly different colour
  function drawCornerGradient(g) {
    const gw = 120, gh = Math.round(120 * H / W);
    const c = document.createElement("canvas");
    c.width = gw; c.height = gh;
    const cg = c.getContext("2d");
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const fx = x / (gw - 1), fy = y / (gh - 1);
      const hue = 0 + fx * 250 - fy * 20;
      const light = 72 - fy * 26;
      cg.fillStyle = `hsl(${hue}, 88%, ${light}%)`;
      cg.fillRect(x, y, 1, 1);
    }
    g.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
    g.drawImage(c, 0, 0, W, H);
  }

  function textHalo(g, text, x, y, size, fill, halo, weight) {
    g.font = `${weight || 700} ${size}px "Baloo 2", "Trebuchet MS", sans-serif`;
    g.lineJoin = "round";
    g.lineWidth = Math.max(3, size * 0.28);
    g.strokeStyle = halo;
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }

  function wrapLabel(name) {
    // Long canton names are split over two lines.
    if (name.length <= 14) return [name];
    const words = name.split(" ");
    let best = [name], bestScore = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const score = Math.max(a.length, b.length);
      if (score < bestScore) { bestScore = score; best = [a, b]; }
    }
    return best;
  }

  function renderMap() {
    const c = document.createElement("canvas");
    c.width = Math.ceil(W * RES);
    c.height = Math.ceil(H * RES);
    const g = c.getContext("2d");
    g.scale(RES, RES);
    const flag = settings.bg === "flag";

    g.save();
    g.clip(outlinePath, "evenodd");
    if (flag) {
      drawFlag(g);
    } else {
      // strong corner-to-corner colour gradient: every part of the map has its own
      // colour, so a piece's colour tells where it belongs
      drawCornerGradient(g);
      if (settings.cantons) {
        // cantons keep their own colour, mixed with the gradient
        g.globalAlpha = 0.35;
        for (const r of MAP.regions) { g.fillStyle = COLORS[r.id] || "#ddd"; g.fill(r.path, "evenodd"); }
        g.globalAlpha = 1;
      }
    }
    // soft light for a friendly "3D" look
    const light = g.createRadialGradient(W * 0.35, H * 0.3, 40, W * 0.45, H * 0.45, W * 0.8);
    light.addColorStop(0, "rgba(255,255,255,0.18)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);

    if (settings.cantons) {
      g.lineJoin = "round";
      for (const r of MAP.regions) {
        g.strokeStyle = flag ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.95)";
        g.lineWidth = 4.5;
        g.stroke(r.path);
      }
      for (const r of MAP.regions) {
        g.strokeStyle = flag ? "rgba(0,10,60,0.55)" : "rgba(40,50,100,0.45)";
        g.lineWidth = 1.4;
        g.stroke(r.path);
      }
    }
    // country border
    g.strokeStyle = flag ? "#fecb00" : "#1e3a8a";
    g.lineWidth = 8;
    g.stroke(outlinePath);
    g.restore();

    const fill = flag ? "#ffffff" : "#1d2550";
    const halo = flag ? "rgba(0,18,90,0.9)" : "rgba(255,255,255,0.95)";
    g.textAlign = "center";
    g.textBaseline = "middle";

    if (settings.cantons) {
      for (const r of MAP.regions) {
        const name = settings.lang === "en" ? r.en : r.bs;
        let size = Math.max(15, Math.min(30, Math.sqrt(r.area) / 8.5));
        if (r.id === "RS") size = 32;
        const pts = [r.label].concat(EXTRA_LABELS[r.id] || []);
        let lines = r.id === "RS" ? [name] : wrapLabel(name);
        if (r.id === "BD") { lines = wrapLabel(name); size = 15; }
        for (const [x, y] of pts) {
          let yy = y - ((lines.length - 1) * size * 0.95) / 2;
          if (r.num) {
            // round canton number badge
            const by = yy - size * 1.15;
            g.fillStyle = flag ? "#fecb00" : "#1e3a8a";
            g.beginPath(); g.arc(x, by, size * 0.55, 0, Math.PI * 2); g.fill();
            g.fillStyle = flag ? "#002395" : "#fff";
            g.font = `800 ${size * 0.7}px "Baloo 2", sans-serif`;
            g.fillText(String(r.num), x, by + 1);
          }
          for (const line of lines) {
            textHalo(g, line, x, yy, size, fill, halo, 800);
            yy += size * 0.95;
          }
        }
      }
    }

    if (settings.cities) {
      for (const c2 of MAP.cities) {
        const cap = c2.rank === 1;
        const size = cap ? 22 : c2.rank === 2 ? 18 : 15;
        if (cap) {
          g.fillStyle = "#e53935"; g.strokeStyle = "#fff"; g.lineWidth = 3;
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 5 : 12;
            g.lineTo(c2.x + rr * Math.cos(a), c2.y + rr * Math.sin(a));
          }
          g.closePath(); g.stroke(); g.fill();
        } else {
          g.fillStyle = "#fff"; g.beginPath(); g.arc(c2.x, c2.y, c2.rank === 2 ? 7 : 5.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#e53935"; g.beginPath(); g.arc(c2.x, c2.y, c2.rank === 2 ? 4.5 : 3.5, 0, Math.PI * 2); g.fill();
        }
        g.textAlign = "left";
        const off = cap ? 14 : 9;
        // put labels near the eastern border on the left side so they stay on the map
        const leftSide = c2.x > W - 110;
        g.textAlign = leftSide ? "right" : "left";
        textHalo(g, c2.name, c2.x + (leftSide ? -off : off), c2.y - 1, size, flag ? "#fff" : "#7a1020", halo, cap ? 800 : 700);
        g.textAlign = "center";
      }
    }
    return c;
  }

  /* ---------------- cutting the puzzle ---------------- */
  let countryMask = null; // Uint8Array W*H
  function getCountryMask() {
    if (countryMask) return countryMask;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fill(outlinePath, "evenodd");
    const d = g.getImageData(0, 0, W, H).data;
    countryMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) countryMask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    return countryMask;
  }

  /** Cut the country into exactly n connected pieces with wavy edges. */
  function cut(n, seed) {
    const inside = getCountryMask();
    const rnd = mulberry32(seed);
    const pix = [];
    for (let i = 0; i < W * H; i++) if (inside[i]) pix.push(i);
    const total = pix.length;

    // k-means on a sample gives pieces of similar size
    const S = Math.min(total, 9000);
    const sx = new Float32Array(S), sy = new Float32Array(S);
    for (let i = 0; i < S; i++) { const p = pix[Math.floor(rnd() * total)]; sx[i] = p % W; sy[i] = (p / W) | 0; }
    const cx = new Float64Array(n), cy = new Float64Array(n);
    // k-means++ init
    const dist = new Float64Array(S).fill(Infinity);
    let first = Math.floor(rnd() * S); cx[0] = sx[first]; cy[0] = sy[first];
    for (let k = 1; k < n; k++) {
      let sum = 0;
      for (let i = 0; i < S; i++) {
        const dx = sx[i] - cx[k - 1], dy = sy[i] - cy[k - 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < dist[i]) dist[i] = d2;
        sum += dist[i];
      }
      let r = rnd() * sum, idx = 0;
      for (; idx < S - 1; idx++) { r -= dist[idx]; if (r <= 0) break; }
      cx[k] = sx[idx]; cy[k] = sy[idx];
    }
    const asg = new Int32Array(S);
    for (let it = 0; it < 25; it++) {
      const ax = new Float64Array(n), ay = new Float64Array(n), cnt = new Float64Array(n);
      for (let i = 0; i < S; i++) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < n; k++) {
          const dx = sx[i] - cx[k], dy = sy[i] - cy[k];
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = k; }
        }
        asg[i] = best; ax[best] += sx[i]; ay[best] += sy[i]; cnt[best]++;
      }
      for (let k = 0; k < n; k++) {
        if (cnt[k]) { cx[k] = ax[k] / cnt[k]; cy[k] = ay[k] / cnt[k]; }
        else { const j = Math.floor(rnd() * S); cx[k] = sx[j]; cy[k] = sy[j]; }
      }
    }

    // wavy assignment: perturb the coordinates with smooth waves
    const side = Math.sqrt(total / n);
    const A = side * 0.09;
    const f1 = (2 * Math.PI) / (side * (0.5 + rnd() * 0.2)), f2 = (2 * Math.PI) / (side * (0.5 + rnd() * 0.2));
    const f3 = (2 * Math.PI) / (side * 0.23), f4 = (2 * Math.PI) / (side * 0.27);
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28, p4 = rnd() * 6.28;
    const label = new Int16Array(W * H).fill(-1);
    for (let q = 0; q < total; q++) {
      const i = pix[q], x = i % W, y = (i / W) | 0;
      const qx = x + A * (Math.sin(y * f1 + p1) + 0.45 * Math.sin(y * f3 + x * 0.004 + p3));
      const qy = y + A * (Math.sin(x * f2 + p2) + 0.45 * Math.sin(x * f4 + y * 0.004 + p4));
      let best = 0, bd = Infinity;
      for (let k = 0; k < n; k++) {
        const dx = qx - cx[k], dy = qy - cy[k];
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = k; }
      }
      label[i] = best;
    }

    makeConnected(label, n);

    // every piece must exist
    const counts = new Int32Array(n);
    for (let i = 0; i < W * H; i++) if (label[i] >= 0) counts[label[i]]++;
    for (let k = 0; k < n; k++) if (counts[k] < 40) return null;
    return label;
  }

  /** Classic jigsaw cut: a grid of pieces with round tabs, clipped to the
   *  country, then the smallest bits are merged until exactly n remain. */
  function cutClassic(n, seed) {
    const inside = getCountryMask();
    let area = 0;
    for (let i = 0; i < W * H; i++) area += inside[i];
    let c = Math.sqrt(area / n) * 1.1;
    for (let attempt = 0; attempt < 40; attempt++, c *= 0.965) {
      const label = jigsawGrid(c, mulberry32(seed + attempt));
      const sizes = labelSizes(label);
      let substantial = 0;
      sizes.forEach((s) => { if (s >= c * c * 0.3) substantial++; });
      if (substantial < n) continue;
      mergeDown(label, n);
      // relabel to 0..n-1
      const map = new Map();
      for (let i = 0; i < W * H; i++) {
        const l = label[i];
        if (l < 0) continue;
        let m = map.get(l);
        if (m === undefined) { m = map.size; map.set(l, m); }
        label[i] = m;
      }
      if (map.size !== n) continue;
      return label;
    }
    return null;
  }

  function jigsawGrid(c, rnd) {
    const ox = -rnd() * c * 0.5, oy = -rnd() * c * 0.5;
    const cols = Math.ceil((W - ox) / c) + 1, rows = Math.ceil((H - oy) / c) + 1;
    // tab for every inner edge: dir (+1 into the next cell / -1 into the previous), position and size jitter
    const mk = () => ({ d: rnd() < 0.5 ? 1 : -1, m: 0.5 + (rnd() - 0.5) * 0.16, s: 0.92 + rnd() * 0.16 });
    const hT = [], vT = []; // hT[j][i]: edge at top of row j (between rows j-1 and j); vT[j][i]: left of column i
    for (let j = 0; j <= rows; j++) { hT.push([]); vT.push([]); for (let i = 0; i <= cols; i++) { hT[j].push(mk()); vT[j].push(mk()); } }
    const R = 0.19, D = 0.2, NECK = 0.085;
    // is the point (along a, distance t from the edge), in cell units, inside a tab?
    const inTab = (tab, a, t) => {
      const r = R * tab.s, d = D * tab.s, da = a - tab.m;
      if (t < 0) return false;
      if ((da * da) + (t - d) * (t - d) <= r * r) return true;
      return t <= d && Math.abs(da) <= NECK * tab.s + (t < 0.05 ? (0.05 - t) * 0.6 : 0);
    };
    const label = new Int32Array(W * H).fill(-1);
    const inside = getCountryMask();
    for (let y = 0; y < H; y++) {
      const fy = (y + 0.5 - oy) / c, j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (!inside[idx]) continue;
        const fx = (x + 0.5 - ox) / c, i = Math.floor(fx), u = fx - i;
        let ci = i, cj = j;
        if (j > 0 && hT[j][i].d === 1 && inTab(hT[j][i], u, v)) cj = j - 1;
        else if (j + 1 < rows && hT[j + 1][i].d === -1 && inTab(hT[j + 1][i], u, 1 - v)) cj = j + 1;
        else if (i > 0 && vT[j][i].d === 1 && inTab(vT[j][i], v, u)) ci = i - 1;
        else if (i + 1 < cols && vT[j][i + 1].d === -1 && inTab(vT[j][i + 1], v, 1 - u)) ci = i + 1;
        label[idx] = cj * cols + ci;
      }
    }
    makeConnected(label, rows * cols);
    return label;
  }

  function labelSizes(label) {
    const sizes = new Map();
    for (let i = 0; i < W * H; i++) { const l = label[i]; if (l >= 0) sizes.set(l, (sizes.get(l) || 0) + 1); }
    return sizes;
  }

  /** Merge the smallest piece into the neighbour it shares the longest border with, until n are left. */
  function mergeDown(label, n) {
    let sizes = labelSizes(label);
    while (sizes.size > n) {
      let small = -1, ss = Infinity;
      sizes.forEach((s, l) => { if (s < ss) { ss = s; small = l; } });
      const border = new Map();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (label[i] !== small) continue;
        if (x > 0) addB(border, label[i - 1], small);
        if (x < W - 1) addB(border, label[i + 1], small);
        if (y > 0) addB(border, label[i - W], small);
        if (y < H - 1) addB(border, label[i + W], small);
      }
      let target = -1, bc = -1;
      border.forEach((cnt, l) => { if (cnt > bc) { bc = cnt; target = l; } });
      if (target < 0) { // isolated island: join the nearest piece by centre distance
        let sx = 0, sy = 0, k = 0;
        for (let i = 0; i < W * H; i++) if (label[i] === small) { sx += i % W; sy += (i / W) | 0; k++; }
        sx /= k; sy /= k;
        let bd = Infinity;
        for (let i = 0; i < W * H; i += 7) {
          const l = label[i];
          if (l < 0 || l === small) continue;
          const d = (i % W - sx) ** 2 + (((i / W) | 0) - sy) ** 2;
          if (d < bd) { bd = d; target = l; }
        }
      }
      for (let i = 0; i < W * H; i++) if (label[i] === small) label[i] = target;
      sizes.set(target, sizes.get(target) + sizes.get(small));
      sizes.delete(small);
    }
  }
  function addB(m, l, self) { if (l >= 0 && l !== self) m.set(l, (m.get(l) || 0) + 1); }

  /** Keep only the largest part of each piece; give stray bits to a neighbour. */
  function makeConnected(label, n) {
    const comp = new Int32Array(W * H);
    const stack = new Int32Array(W * H);
    for (let pass = 0; pass < 6; pass++) {
      comp.fill(-1);
      const comps = []; // {label, size}
      for (let i = 0; i < W * H; i++) {
        if (label[i] < 0 || comp[i] >= 0) continue;
        const id = comps.length, lab = label[i];
        let sp = 0, size = 0;
        stack[sp++] = i; comp[i] = id;
        while (sp) {
          const j = stack[--sp]; size++;
          const x = j % W;
          if (x > 0) { const m = j - 1; if (comp[m] < 0 && label[m] === lab) { comp[m] = id; stack[sp++] = m; } }
          if (x < W - 1) { const m = j + 1; if (comp[m] < 0 && label[m] === lab) { comp[m] = id; stack[sp++] = m; } }
          if (j >= W) { const m = j - W; if (comp[m] < 0 && label[m] === lab) { comp[m] = id; stack[sp++] = m; } }
          if (j < W * (H - 1)) { const m = j + W; if (comp[m] < 0 && label[m] === lab) { comp[m] = id; stack[sp++] = m; } }
        }
        comps.push({ label: lab, size });
      }
      const biggest = new Int32Array(n).fill(-1);
      comps.forEach((c, id) => { if (biggest[c.label] < 0 || comps[biggest[c.label]].size < c.size) biggest[c.label] = id; });
      const stray = comps.map((c, id) => biggest[c.label] !== id);
      if (!stray.some(Boolean)) return;
      // tally neighbour labels for each stray component
      const votes = new Map();
      for (let j = 0; j < W * H; j++) {
        const id = comp[j];
        if (id < 0 || !stray[id]) continue;
        const x = j % W;
        const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W];
        for (const m of nb) {
          if (m < 0 || m >= W * H) continue;
          const l = label[m];
          if (l >= 0 && l !== label[j]) {
            let v = votes.get(id); if (!v) { v = {}; votes.set(id, v); }
            v[l] = (v[l] || 0) + 1;
          }
        }
      }
      const target = new Int32Array(comps.length).fill(-1);
      votes.forEach((v, id) => {
        let best = -1, bc = -1;
        for (const k in v) if (v[k] > bc) { bc = v[k]; best = +k; }
        target[id] = best;
      });
      let changed = false;
      for (let j = 0; j < W * H; j++) {
        const id = comp[j];
        if (id >= 0 && stray[id] && target[id] >= 0) { label[j] = target[id]; changed = true; }
      }
      if (!changed) return;
    }
  }

  function buildPieces(label, n) {
    const pieces = [];
    for (let k = 0; k < n; k++) pieces.push({ id: k, minx: W, miny: H, maxx: -1, maxy: -1 });
    for (let i = 0; i < W * H; i++) {
      const l = label[i]; if (l < 0) continue;
      const p = pieces[l], x = i % W, y = (i / W) | 0;
      if (x < p.minx) p.minx = x; if (x > p.maxx) p.maxx = x;
      if (y < p.miny) p.miny = y; if (y > p.maxy) p.maxy = y;
    }
    for (const p of pieces) {
      p.w = p.maxx - p.minx + 1; p.h = p.maxy - p.miny + 1;
      p.mask = new Uint8Array(p.w * p.h);
      p.edge = new Uint8Array(p.w * p.h);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const gx = x + p.minx, gy = y + p.miny, gi = gy * W + gx;
        if (label[gi] !== p.id) continue;
        p.mask[y * p.w + x] = 1;
        // internal edge: next to a different piece (8-neighbourhood)
        let e = 0;
        for (let dy = -1; dy <= 1 && !e; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const l = label[ny * W + nx];
          if (l >= 0 && l !== p.id) { e = 1; break; }
        }
        p.edge[y * p.w + x] = e;
      }
      p.placed = false;
      p.x = 0; p.y = 0; p.s = 1;
    }
    return pieces;
  }

  function maskCanvas(p, arr, r, gr, b, a) {
    const c = document.createElement("canvas");
    c.width = p.w; c.height = p.h;
    const g = c.getContext("2d");
    const img = g.createImageData(p.w, p.h);
    for (let i = 0; i < arr.length; i++) if (arr[i]) {
      img.data[i * 4] = r; img.data[i * 4 + 1] = gr; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function paintPieces() {
    for (const p of state.pieces) {
      const mc = p._mask || (p._mask = maskCanvas(p, p.mask, 0, 0, 0, 255));
      const ec = p._edge || (p._edge = maskCanvas(p, p.edge, 255, 255, 255, 235));
      const cw = Math.ceil((p.w + PAD * 2) * RES), ch = Math.ceil((p.h + PAD * 2) * RES);
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const g = c.getContext("2d");
      g.scale(RES, RES);
      g.drawImage(state.map, p.minx * RES, p.miny * RES, p.w * RES, p.h * RES, PAD, PAD, p.w, p.h);
      g.globalCompositeOperation = "destination-in";
      g.imageSmoothingEnabled = true;
      g.drawImage(mc, PAD, PAD, p.w, p.h);
      g.globalCompositeOperation = "source-over";
      g.drawImage(ec, PAD, PAD, p.w, p.h);
      p.canvas = c;
      if (!p.placed) {
        const s = document.createElement("canvas");
        s.width = cw; s.height = ch;
        const sg = s.getContext("2d");
        sg.shadowColor = "rgba(10,30,80,0.38)";
        sg.shadowBlur = 5 * RES;
        sg.shadowOffsetY = 3 * RES;
        sg.drawImage(c, 0, 0);
        p.shadow = s;
      } else {
        p.shadow = null;
      }
    }
    redrawPlaced();
  }

  function redrawPlaced() {
    const pl = state.placedLayer;
    const g = pl.getContext("2d");
    g.clearRect(0, 0, pl.width, pl.height);
    if (state.won) { g.drawImage(state.map, 0, 0); return; }
    for (const p of state.pieces) if (p.placed) g.drawImage(p.canvas, (p.minx - PAD) * RES, (p.miny - PAD) * RES);
  }

  /* ---------------- game state ---------------- */
  const state = {
    pieces: [], order: [], map: null, placedLayer: null, won: false,
    start: 0, elapsed: 0, timer: null, drags: null, view: null,
  };

  function newGame() {
    const n = settings.n;
    resetHelpers();
    saveStore();
    syncUI();
    $("#win").hidden = true;
    $("#loading").classList.remove("hide");
    stopTimer();
    state.won = false; state.elapsed = 0; state.start = 0; state.penalty = 0;
    drags.clear();
    updateStatus();
    setTimeout(() => {
      let label = null;
      for (let attempt = 0; attempt < 8 && !label; attempt++) label = settings.shape === "wavy" ? cut(n, (Math.random() * 1e9) | 0) : cutClassic(n, (Math.random() * 1e9) | 0);
      if (!label) { console.error("Could not cut puzzle"); return; }
      state.pieces = buildPieces(label, n);
      state.map = renderMap();
      state.placedLayer = document.createElement("canvas");
      state.placedLayer.width = state.map.width; state.placedLayer.height = state.map.height;
      paintPieces();
      layout(true);
      scatter(state.pieces);
      state.order = state.pieces.slice();
      $("#loading").classList.add("hide");
      state.elapsed = 0;
      startTimer(); // the clock runs from the moment the pieces are laid out
      updateStatus();
      if (settings.hint) addPenalty();
      requestDraw();
    }, 30);
  }

  function rerenderMap() {
    if (!state.pieces.length) return;
    state.map = renderMap();
    paintPieces();
    requestDraw();
  }

  /* ---------------- layout ---------------- */
  let dpr = 1;
  function layout(force) {
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, rect.width), ch = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    confettiCanvas.width = canvas.width; confettiCanvas.height = canvas.height;

    const m = 26, aspect = cw / ch;
    const old = state.view;
    let v;
    if (aspect >= 1.05) {
      let tH = H + 2 * m + 40;
      let tW = Math.max(W * 1.62 + 3 * m, tH * aspect);
      tH = Math.max(tH, tW / aspect);
      v = { tW, tH, board: { x: m, y: (tH - H) / 2 }, tray: { x: W + 2 * m, y: m, w: tW - W - 3 * m, h: tH - 2 * m }, land: true };
    } else {
      let tW = W + 2 * m;
      let tH = Math.max(H * 1.62 + 3 * m, tW / aspect);
      tW = Math.max(tW, tH * aspect);
      v = { tW, tH, board: { x: (tW - W) / 2, y: m }, tray: { x: m, y: H + 2 * m, w: tW - 2 * m, h: tH - H - 3 * m }, land: false };
    }
    v.scale = Math.min(cw / v.tW, ch / v.tH);
    v.ox = (cw - v.tW * v.scale) / 2;
    v.oy = (ch - v.tH * v.scale) / 2;
    state.view = v;

    if (!force && old && state.pieces.length) {
      const loose = state.pieces.filter((p) => !p.placed && !isDragged(p));
      // re-lay the waiting pieces so they never pile up after a resize
      scatter(loose);
    }
    requestDraw();
  }

  /** Lay the pieces out in the tray without overlapping. If they do not all
   *  fit at full size, they are shown smaller until picked up. */
  function scatter(list) {
    const tr = state.view.tray;
    const items = list.slice().sort((p, q) => q.h - p.h); // tallest first packs best
    let lo = 0.15, hi = 1, best = null;
    const full = pack(items, tr, 1);
    if (full) best = { s: 1, rows: full };
    else {
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2, rows = pack(items, tr, mid);
        if (rows) { lo = mid; best = { s: mid, rows }; } else hi = mid;
      }
    }
    if (!best) best = { s: lo, rows: pack(items, tr, lo) || [items] };
    const s = best.s, rows = best.rows;
    for (const r of rows) r.sort(() => Math.random() - 0.5);
    const gap = 6;
    const usedH = rows.reduce((a, r) => a + Math.max(...r.map((p) => p.h * s)), 0);
    const vgap = Math.max(gap, (tr.h - usedH) / (rows.length + 1));
    let y = tr.y + vgap;
    for (const r of rows) {
      const rowH = Math.max(...r.map((p) => p.h * s));
      const rowW = r.reduce((a, p) => a + p.w * s, 0);
      const hgap = Math.max(gap, (tr.w - rowW) / (r.length + 1));
      let x = tr.x + hgap;
      for (const p of r) {
        p.s = s;
        p.x = x;
        p.y = y + (rowH - p.h * s) / 2;
        x += p.w * s + hgap;
      }
      y += rowH + vgap;
    }
  }

  // Once the remaining pieces fit in the tray at real size, show them at real size,
  // so they visibly match the holes on the board.
  function growWaitingPieces() {
    const loose = state.pieces.filter((p) => !p.placed && !isDragged(p) && !p.animating);
    if (!loose.some((p) => p.s < 1)) return;
    const items = loose.slice().sort((p, q) => q.h - p.h);
    if (!pack(items, state.view.tray, 1)) return;
    scatter(loose);
    requestDraw();
  }

  // shelf packing; returns rows of pieces, or null if they do not fit
  function pack(items, tr, s) {
    const gap = 6, rows = [];
    let row = [], x = 0, y = 0, rowH = 0;
    for (const p of items) {
      const w = p.w * s, h = p.h * s;
      if (w > tr.w) return null;
      if (row.length && x + w > tr.w) {
        rows.push(row); y += rowH + gap; row = []; x = 0; rowH = 0;
      }
      row.push(p); x += w + gap; rowH = Math.max(rowH, h);
    }
    if (row.length) rows.push(row);
    return y + rowH <= tr.h ? rows : null;
  }

  /* ---------------- drawing ---------------- */
  let drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function draw() {
    const v = state.view; if (!v) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);

    // tray
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    roundRect(ctx, v.tray.x - 8, v.tray.y - 8, v.tray.w + 16, v.tray.h + 16, 28);
    ctx.fill();

    // board
    ctx.save();
    ctx.translate(v.board.x, v.board.y);
    // with the hint on, the picture is shown clearly enough that its colours match the pieces
    const showHint = settings.hint && state.map;
    ctx.fillStyle = showHint ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)";
    ctx.fill(outlinePath, "evenodd");
    if (showHint) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(state.map, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(30,58,138,0.55)";
    ctx.stroke(outlinePath);
    ctx.setLineDash([]);
    if (state.placedLayer) {
      // placed pieces sit visibly on top of the hint picture: full colour plus a shadow
      ctx.shadowColor = "rgba(10,30,80,0.45)";
      ctx.shadowBlur = 8 * v.scale * dpr;
      ctx.shadowOffsetY = 3 * v.scale * dpr;
      ctx.drawImage(state.placedLayer, 0, 0, W, H);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.restore();

    // loose pieces
    for (const p of state.order) {
      if (p.placed) continue;
      const lift = isDragged(p) ? 1.05 : 1;
      if (lift !== 1) {
        ctx.save();
        const cxp = p.x + (p.w * p.s) / 2, cyp = p.y + (p.h * p.s) / 2;
        ctx.translate(cxp, cyp); ctx.scale(lift, lift); ctx.translate(-cxp, -cyp);
      }
      ctx.drawImage(p.shadow, p.x - PAD * p.s, p.y - PAD * p.s, (p.w + 2 * PAD) * p.s, (p.h + 2 * PAD) * p.s);
      if (lift !== 1) ctx.restore();
    }
  }

  /* ---------------- input ---------------- */
  // Pointer events where available, with a touch + mouse fallback for older
  // browsers (e.g. some smart boards). Every finger can drag its own piece, so
  // several children can play on one board at the same time.
  const drags = new Map(); // pointer id -> { p, dx, dy }
  state.drags = drags;

  function toTable(cx, cy) {
    const r = canvas.getBoundingClientRect(), v = state.view;
    return { x: (cx - r.left - v.ox) / v.scale, y: (cy - r.top - v.oy) / v.scale };
  }

  function inMask(p, x, y) {
    const ax = Math.round((x - p.x) / p.s), ay = Math.round((y - p.y) / p.s);
    return ax >= 0 && ay >= 0 && ax < p.w && ay < p.h && p.mask[ay * p.w + ax] === 1;
  }
  function hit(p, x, y, tol) {
    if (inMask(p, x, y)) return true;
    if (!tol) return false;
    for (const f of [0.5, 1]) for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      if (inMask(p, x + Math.cos(a) * tol * f, y + Math.sin(a) * tol * f)) return true;
    }
    return false;
  }
  function isDragged(p) {
    for (const d of drags.values()) if (d.p === p) return true;
    return false;
  }
  function pick(pt, tol) {
    const free = state.order.filter((p) => !p.placed && !p.animating && !isDragged(p));
    for (let i = free.length - 1; i >= 0; i--) if (hit(free[i], pt.x, pt.y, 0)) return free[i];
    for (let i = free.length - 1; i >= 0; i--) if (hit(free[i], pt.x, pt.y, tol)) return free[i];
    return null;
  }

  function startDrag(id, cx, cy, coarse) {
    if (state.won || !state.view || !state.pieces.length || drags.has(id)) return false;
    const pt = toTable(cx, cy);
    const p = pick(pt, (coarse ? 28 : 6) / state.view.scale);
    if (!p) return false;
    if (p.s !== 1) {
      // pieces wait smaller in the tray and grow to full size when picked up
      const lx = (pt.x - p.x) / p.s, ly = (pt.y - p.y) / p.s;
      p.s = 1; p.x = pt.x - lx; p.y = pt.y - ly;
    }
    drags.set(id, { p, dx: pt.x - p.x, dy: pt.y - p.y, coarse });
    state.order.splice(state.order.indexOf(p), 1);
    state.order.push(p);
    if (!state.start) startTimer();
    sound("pick");
    requestDraw();
    return true;
  }
  function moveDrag(id, cx, cy) {
    const d = drags.get(id);
    if (!d) return false;
    const pt = toTable(cx, cy), v = state.view;
    d.p.x = Math.max(-d.p.w * 0.5, Math.min(v.tW - d.p.w * 0.5, pt.x - d.dx));
    d.p.y = Math.max(-d.p.h * 0.5, Math.min(v.tH - d.p.h * 0.5, pt.y - d.dy));
    requestDraw();
    return true;
  }
  function endDrag(id) {
    const d = drags.get(id);
    if (!d) return;
    drags.delete(id);
    const p = d.p, v = state.view;
    const tx = v.board.x + p.minx, ty = v.board.y + p.miny;
    const snap = Math.max(SNAP, (d.coarse ? 46 : 30) / v.scale);
    if (Math.hypot(p.x - tx, p.y - ty) < snap) animateTo(p, tx, ty, () => place(p));
    requestDraw();
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  if (window.PointerEvent) {
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (startDrag(e.pointerId, e.clientX, e.clientY, e.pointerType !== "mouse")) {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (e.pointerType === "mouse") canvas.style.cursor = "grabbing";
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (moveDrag(e.pointerId, e.clientX, e.clientY)) { e.preventDefault(); return; }
      if (e.pointerType === "mouse" && !drags.size && state.view && state.pieces.length) {
        canvas.style.cursor = pick(toTable(e.clientX, e.clientY), 0) ? "grab" : "default";
      }
    });
    const up = (e) => { endDrag(e.pointerId); if (e.pointerType === "mouse") canvas.style.cursor = "default"; };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
  } else {
    const opts = { passive: false };
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      for (const tch of Array.from(e.changedTouches)) startDrag("t" + tch.identifier, tch.clientX, tch.clientY, true);
    }, opts);
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const tch of Array.from(e.changedTouches)) moveDrag("t" + tch.identifier, tch.clientX, tch.clientY);
    }, opts);
    const tend = (e) => { for (const tch of Array.from(e.changedTouches)) endDrag("t" + tch.identifier); };
    canvas.addEventListener("touchend", tend);
    canvas.addEventListener("touchcancel", tend);
    canvas.addEventListener("mousedown", (e) => { if (e.button === 0 && startDrag("m", e.clientX, e.clientY, false)) e.preventDefault(); });
    window.addEventListener("mousemove", (e) => moveDrag("m", e.clientX, e.clientY));
    window.addEventListener("mouseup", () => endDrag("m"));
  }

  function animateTo(p, x, y, done) {
    const x0 = p.x, y0 = p.y, t0 = performance.now(), dur = 110;
    p.animating = true;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      p.x = x0 + (x - x0) * e; p.y = y0 + (y - y0) * e;
      requestDraw();
      if (k < 1) requestAnimationFrame(step); else { p.animating = false; done(); }
    })(t0);
  }

  function place(p) {
    p.placed = true;
    p.s = 1;
    p.shadow = null;
    state.placedLayer.getContext("2d").drawImage(p.canvas, (p.minx - PAD) * RES, (p.miny - PAD) * RES);
    sound("snap");
    updateStatus();
    requestDraw();
    if (state.pieces.every((q) => q.placed)) { win(); return; }
    growWaitingPieces();
  }

  /* ---------------- timer & status ---------------- */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function startTimer() {
    state.start = performance.now() - state.elapsed;
    stopTimer();
    state.timer = setInterval(() => { state.elapsed = performance.now() - state.start; $("#time").textContent = fmt(state.elapsed); }, 250);
  }
  function stopTimer() { if (state.timer) clearInterval(state.timer); state.timer = null; }
  /* ---------------- hint penalty ---------------- */
  const HINT_PENALTY = 15000; // each time the hint is switched on, 15 s are added to the clock
  function addPenalty() {
    if (state.won || !state.pieces.length || !state.timer) return;
    state.start -= HINT_PENALTY;
    state.elapsed = performance.now() - state.start;
    state.penalty = (state.penalty || 0) + HINT_PENALTY;
    updateStatus();
    sound("penalty");
    // eye candy: a "+15 s" bubble flies from the hint button to the clock, which then shakes red
    const from = $("#tHint").getBoundingClientRect(), to = $("#time").getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "penalty-pop";
    pop.textContent = "+" + HINT_PENALTY / 1000 + " s";
    pop.style.left = from.left + from.width / 2 + "px";
    pop.style.top = from.top + from.height / 2 + "px";
    document.body.appendChild(pop);
    requestAnimationFrame(() => requestAnimationFrame(() => { pop.classList.add("in"); }));
    setTimeout(() => {
      pop.classList.add("go");
      pop.style.transform = "translate(-50%, -50%) translate(" + (to.left + to.width / 2 - from.left - from.width / 2) + "px," + (to.top + to.height / 2 - from.top - from.height / 2) + "px) scale(0.8)";
    }, 380);
    setTimeout(() => {
      pop.remove();
      const st = document.querySelector(".status");
      st.classList.remove("hit"); void st.offsetWidth; st.classList.add("hit");
    }, 1100);
  }

  function updateStatus() {
    const pen = $("#penalty");
    pen.hidden = !state.penalty;
    pen.textContent = "💡 +" + Math.round((state.penalty || 0) / 1000) + " s";
    const done = state.pieces.filter((p) => p.placed).length;
    $("#placed").textContent = `${done} / ${state.pieces.length || settings.n}`;
    $("#time").textContent = fmt(state.elapsed);
  }

  /* ---------------- win ---------------- */
  function win() {
    state.won = true;
    stopTimer();
    state.elapsed = performance.now() - state.start;
    updateStatus();
    setTimeout(() => {
      redrawPlaced();
      requestDraw();
      sound("win");
      confetti();
      showWinText();
      recordScore();
      $("#win").hidden = false;
    }, 250);
  }

  /* ---------------- top 10: this device + all players (Firebase) ---------------- */
  const online = window.BihOnline || { enabled: false };
  const SCORE_KEY = "bih-puzzle-scores";
  function readScores() {
    try { return JSON.parse(localStorage.getItem(SCORE_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function writeScores(all) {
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(all)); } catch (e) { /* storage blocked */ }
  }
  // only the shared list of all players is shown; the device list is a fallback when offline/unconfigured
  document.querySelectorAll("[data-online]").forEach((el) => { el.hidden = true; });

  let winInfo = null; // the finished game: { n, ms, shape, localId, globalPending, globalId }
  const scopes = { win: online.enabled ? "global" : "local", rank: online.enabled ? "global" : "local" };

  function recordScore() {
    const n = String(state.pieces.length), ms = Math.round(state.elapsed);
    const all = readScores();
    const list = (all[n] || []).slice();
    const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), name: "", ms, date: new Date().toISOString().slice(0, 10) };
    list.push(entry);
    list.sort((a, b) => a.ms - b.ms);
    const localRank = list.indexOf(entry) + 1;
    winInfo = { n, ms, shape: settings.shape, localId: null, globalPending: false, globalId: null };
    $("#record").hidden = true;
    // fresh nickname form for this game
    $("#playerName").value = settings.lastName || "";
    $("#saveName").disabled = false;
    $("#saveName").textContent = t("save");
    if (localRank <= 10) {
      all[n] = list.slice(0, 10);
      writeScores(all);
      winInfo.localId = entry.id;
      if (!online.enabled) showNameForm(t("newRecord").replace("{r}", localRank));
    }
    renderScope("win");
    if (online.enabled) {
      const info = winInfo;
      online.top(n).then((top) => {
        if (winInfo !== info) return;
        const globalRank = top.filter((e) => e.ms <= ms).length + 1;
        if (globalRank <= 10) {
          info.globalPending = true;
          showNameForm(t("newWorldRecord").replace("{r}", globalRank));
        }
      }).catch(() => { /* offline: the device list still works */ });
    }
  }
  function showNameForm(text) {
    $("#record").hidden = false;
    $("#recordText").textContent = text;
  }

  // send the score to the global list (once), with whatever name was typed
  function flushGlobal(name) {
    const info = winInfo;
    if (!info || !info.globalPending || !online.enabled) return Promise.resolve();
    info.globalPending = false;
    return online.submit(info.n, name, info.ms, info.shape)
      .then((doc) => { info.globalId = doc.id; })
      .catch(() => { /* offline: ignore */ });
  }

  function renderList(el, list, highlightId) {
    el.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "empty"; li.textContent = t("noScores");
      el.appendChild(li); return;
    }
    list.forEach((e, i) => {
      const li = document.createElement("li");
      if (highlightId && e.id === highlightId) li.className = "me";
      const medal = ["🥇", "🥈", "🥉"][i] || (i + 1) + ".";
      const a = document.createElement("span"); a.className = "pos"; a.textContent = medal;
      const b = document.createElement("span"); b.className = "who"; b.textContent = e.name || t("anonymous");
      const c = document.createElement("span"); c.className = "tm"; c.textContent = fmt(e.ms);
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      el.appendChild(li);
    });
  }
  function message(el, text) {
    el.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty"; li.textContent = text;
    el.appendChild(li);
  }

  // which: "win" (the Bravo card) or "rank" (the trophy button)
  function renderScope(which) {
    const el = which === "win" ? $("#winBoard") : $("#rankBoard");
    const card = el.closest(".card");
    const scope = scopes[which];
    card.querySelectorAll("[data-scope]").forEach((bt) => bt.setAttribute("aria-pressed", bt.dataset.scope === scope ? "true" : "false"));
    const n = which === "win" && winInfo ? winInfo.n : String(settings.n);
    if (which === "rank") {
      $("#rankingSub").textContent = tn(scope === "global" ? "rankingSubGlobal" : "rankingSub", n);
    }
    if (scope === "local") {
      renderList(el, readScores()[n] || [], which === "win" && winInfo ? winInfo.localId : null);
      return;
    }
    message(el, t("loadingScores"));
    online.top(n).then((list) => {
      if (scopes[which] !== "global") return;
      renderList(el, list, which === "win" && winInfo ? winInfo.globalId : null);
    }).catch(() => { if (scopes[which] === "global") message(el, t("offline")); });
  }
  document.querySelectorAll("[data-scope]").forEach((bt) => {
    bt.addEventListener("click", () => {
      const which = bt.closest("#win") ? "win" : "rank";
      scopes[which] = bt.dataset.scope;
      renderScope(which);
    });
  });

  $("#nameForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!winInfo) return;
    const name = $("#playerName").value.trim().slice(0, 20);
    if (winInfo.localId) {
      const all = readScores();
      const entry = (all[winInfo.n] || []).find((x) => x.id === winInfo.localId);
      if (entry) { entry.name = name; writeScores(all); }
    }
    if (name) { settings.lastName = name; saveStore(); }
    $("#saveName").textContent = t("saved");
    $("#saveName").disabled = true;
    $("#playerName").blur();
    flushGlobal(name).then(() => renderScope("win"));
  });

  function leaveWin() {
    if (winInfo && winInfo.globalPending) flushGlobal($("#playerName").value.trim().slice(0, 20));
  }

  function openRanking() {
    renderScope("rank");
    $("#ranking").hidden = false;
  }
  $("#rankBtn").onclick = openRanking;
  // lay all remaining pieces out neatly again (e.g. when some are hidden under others)
  $("#tidyBtn").onclick = () => {
    const loose = state.pieces.filter((p) => !p.placed && !isDragged(p) && !p.animating);
    if (!loose.length) return;
    scatter(loose);
    sound("pick");
    requestDraw();
  };
  $("#rankClose").onclick = () => { $("#ranking").hidden = true; };


  /* ---------------- sharing ---------------- */
  const GAME_URL = "https://hariszukanovic.github.io/bih-puzzle/";
  // from the result card: share the time; from the 📤 button: invite to the game
  function shareText(fromWin) {
    return fromWin && winInfo ? tn("shareText", winInfo.n).replace("{t}", fmt(winInfo.ms)) : t("inviteText");
  }
  $("#shareBtn").onclick = () => { $("#shareDlg").hidden = false; };
  $("#shareClose").onclick = () => { $("#shareDlg").hidden = true; };
  function openWin(url) { window.open(url, "_blank", "noopener,width=640,height=560"); }
  if (navigator.share) {
    document.querySelectorAll("[data-native]").forEach((bt) => {
      bt.hidden = false;
      bt.onclick = () => { navigator.share({ title: t("title"), text: shareText(!!bt.closest("#win")), url: GAME_URL }).catch(() => {}); };
    });
  }
  document.querySelectorAll("[data-net]").forEach((bt) => {
    bt.addEventListener("click", () => {
      const text = shareText(!!bt.closest("#win")), u = encodeURIComponent(GAME_URL), tx = encodeURIComponent(text);
      const net = bt.dataset.net;
      if (net === "facebook") openWin("https://www.facebook.com/sharer/sharer.php?u=" + u + "&quote=" + tx);
      if (net === "whatsapp") openWin("https://wa.me/?text=" + encodeURIComponent(text + " " + GAME_URL));
      if (net === "viber") window.location.href = "viber://forward?text=" + encodeURIComponent(text + " " + GAME_URL);
      if (net === "x") openWin("https://twitter.com/intent/tweet?text=" + tx + "&url=" + u);
      if (net === "copy") {
        const done = () => { const sp = bt.querySelector("span"); sp.textContent = t("copied"); setTimeout(() => { sp.textContent = t("copyLink"); }, 1800); };
        const full = text + " " + GAME_URL;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full).then(done, () => window.prompt("", full));
        else window.prompt("", full);
      }
    });
  });

  function showWinText() {
    $("#winText").textContent = tn("winText", state.pieces.length).replace("{t}", fmt(state.elapsed)) +
      (state.penalty ? " " + t("penaltyNote").replace("{p}", Math.round(state.penalty / 1000) + " s") : "");
  }

  function confetti() {
    const g = confettiCanvas.getContext("2d");
    const Wc = confettiCanvas.width, Hc = confettiCanvas.height;
    const colors = ["#002395", "#fecb00", "#ffffff", "#ff6b6b", "#4dd4ac", "#7aa8ff"];
    const parts = [];
    for (let i = 0; i < 220; i++) {
      parts.push({
        x: Wc / 2 + (Math.random() - 0.5) * Wc * 0.3, y: Hc * 0.55,
        vx: (Math.random() - 0.5) * 22 * dpr, vy: -(10 + Math.random() * 18) * dpr,
        r: (4 + Math.random() * 6) * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length], star: Math.random() < 0.25,
      });
    }
    const t0 = performance.now();
    (function frame(now) {
      g.clearRect(0, 0, Wc, Hc);
      for (const q of parts) {
        q.vy += 0.45 * dpr; q.vx *= 0.99; q.x += q.vx; q.y += q.vy; q.a += q.va;
        g.save(); g.translate(q.x, q.y); g.rotate(q.a); g.fillStyle = q.c;
        if (q.star) drawStar(g, 0, 0, q.r * 1.3); else g.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r);
        g.restore();
      }
      if (now - t0 < 4000) requestAnimationFrame(frame); else g.clearRect(0, 0, Wc, Hc);
    })(t0);
  }

  /* ---------------- sound ---------------- */
  let actx = null;
  function sound(kind) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const now = actx.currentTime;
      const tone = (f, at, dur, type, vol) => {
        const o = actx.createOscillator(), gn = actx.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(f, now + at);
        gn.gain.setValueAtTime(0.0001, now + at);
        gn.gain.exponentialRampToValueAtTime(vol || 0.18, now + at + 0.01);
        gn.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
        o.connect(gn).connect(actx.destination); o.start(now + at); o.stop(now + at + dur + 0.02);
      };
      if (kind === "penalty") { tone(440, 0, 0.12, "sawtooth", 0.07); tone(330, 0.1, 0.22, "sawtooth", 0.07); }
      if (kind === "pick") tone(520, 0, 0.07, "triangle", 0.08);
      if (kind === "snap") { tone(660, 0, 0.09, "triangle", 0.2); tone(990, 0.06, 0.12, "triangle", 0.16); }
      if (kind === "win") [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.5 : 0.16, "triangle", 0.2));
    } catch (e) { /* audio not available */ }
  }

  /* ---------------- UI ---------------- */
  function applyLang() {
    document.documentElement.lang = settings.lang;
    document.title = t("title");
    $("#titleWord").textContent = t("titleWord");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $("#rankBtn").title = t("ranking");
    $("#tidyBtn").title = t("tidy");
    $("#shareBtn").title = t("shareGameTitle");
    $("#shareBtn").setAttribute("aria-label", t("shareGameTitle"));
    $("#tidyBtn").setAttribute("aria-label", t("tidy"));
    $("#rankBtn").setAttribute("aria-label", t("ranking"));
    $("#tSound").setAttribute("aria-label", t("sound"));
    $("#tSound").title = t("sound");
    $("#tCantons").title = t("cantons");
    $("#tCities").title = t("cities");
    $("#tHint").title = t("hintTitle");
    $("#fullscreen").title = t("fullscreen");
    $("#fullscreen").setAttribute("aria-label", t("fullscreen"));
    setPressed("#langBs", settings.lang === "bs");
    setPressed("#langEn", settings.lang === "en");
    if (state.won) showWinText();
  }
  function setPressed(sel, on) { $(sel).setAttribute("aria-pressed", on ? "true" : "false"); }
  function syncUI() {
    $("#count").value = settings.n;
    setPressed("#tCantons", settings.cantons);
    setPressed("#tCities", settings.cities);
    setPressed("#tHint", settings.hint);
    setPressed("#bgMap", settings.bg === "map");
    setPressed("#bgFlag", settings.bg === "flag");
    setPressed("#shapeClassic", settings.shape !== "wavy");
    setPressed("#shapeWavy", settings.shape === "wavy");
    setPressed("#tSound", settings.sound);
    $("#tSound").textContent = settings.sound ? "🔊" : "🔇";
    applyLang();
  }

  let countTimer = null;
  function setCount(n, immediate) {
    settings.n = clampN(n);
    saveStore(); syncUI();
    clearTimeout(countTimer);
    countTimer = setTimeout(newGame, immediate ? 0 : 450);
  }
  $("#minus").onclick = () => setCount(settings.n - 1);
  $("#plus").onclick = () => setCount(settings.n + 1);
  $("#count").addEventListener("change", (e) => setCount(parseInt(e.target.value, 10), true));
  $("#newGame").onclick = () => { leaveWin(); newGame(); };
  $("#again").onclick = () => { leaveWin(); newGame(); };
  $("#harder").onclick = () => { leaveWin(); setCount(settings.n + 10, true); };
  $("#look").onclick = () => { leaveWin(); $("#win").hidden = true; };

  const toggle = (key, rerender) => () => {
    settings[key] = !settings[key]; saveStore(); syncUI();
    if (rerender) rerenderMap(); else requestDraw();
  };
  $("#tCantons").onclick = toggle("cantons", true);
  $("#tCities").onclick = toggle("cities", true);
  $("#tHint").onclick = () => {
    settings.hint = !settings.hint; saveStore(); syncUI(); requestDraw();
    if (settings.hint) addPenalty();
  };
  $("#tSound").onclick = toggle("sound", false);
  $("#bgMap").onclick = () => { settings.bg = "map"; saveStore(); syncUI(); rerenderMap(); };
  const setShape = (v) => () => { if (settings.shape === v) return; settings.shape = v; saveStore(); syncUI(); newGame(); };
  $("#shapeClassic").onclick = setShape("classic");
  $("#shapeWavy").onclick = setShape("wavy");
  $("#bgFlag").onclick = () => { settings.bg = "flag"; saveStore(); syncUI(); rerenderMap(); };
  const setLang = (l) => () => { settings.lang = l; saveStore(); syncUI(); rerenderMap(); };
  $("#langBs").onclick = setLang("bs");
  $("#langEn").onclick = setLang("en");

  // fullscreen (handy on smart boards: hides the browser bars)
  const fsEl = document.documentElement;
  const fsReq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen || fsEl.msRequestFullscreen;
  const fsExit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  const fsActive = () => document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  if (fsReq) {
    const btn = $("#fullscreen");
    btn.hidden = false;
    const enterFs = () => {
      try { const r = fsReq.call(fsEl); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed */ }
    };
    btn.onclick = () => {
      // the button also remembers the choice for next time
      settings.fullscreen = !fsActive();
      saveStore();
      if (fsActive()) { try { const r = fsExit.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
      else enterFs();
    };
    // Browsers only allow full screen after a user action, so it starts at the first tap or click.
    let autoFsDone = false;
    const autoFs = (e) => {
      if (autoFsDone) return;
      if (e && e.target && e.target.closest && e.target.closest("#fullscreen")) return;
      autoFsDone = true;
      ["pointerup", "touchend", "click", "keydown"].forEach((ev) => document.removeEventListener(ev, autoFs, true));
      if (settings.fullscreen && !fsActive()) enterFs();
    };
    ["pointerup", "touchend", "click", "keydown"].forEach((ev) => document.addEventListener(ev, autoFs, true));
    const fsSync = () => { btn.setAttribute("aria-pressed", fsActive() ? "true" : "false"); setTimeout(() => layout(false), 120); };
    document.addEventListener("fullscreenchange", fsSync);
    document.addEventListener("webkitfullscreenchange", fsSync);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => layout(false), 80); });

  // test hook: solve the puzzle (used by automated checks)
  window.__bihPuzzle = { state, redraw: () => requestDraw(), placeOne() { const p = state.pieces.find((q) => !q.placed); if (p) { p.x = state.view.board.x + p.minx; p.y = state.view.board.y + p.miny; place(p); } }, solve() { for (const p of state.pieces) if (!p.placed) { p.x = state.view.board.x + p.minx; p.y = state.view.board.y + p.miny; place(p); } } };

  syncUI();
  layout(true);
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('800 20px "Baloo 2"'), new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();
  fontsReady.then(newGame, newGame);
})();
