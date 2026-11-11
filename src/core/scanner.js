// Belge tarayıcı: fotoğraftaki belgenin köşelerini bulur, perspektifi düzeltir, "taranmış" görünüm verir.
// Saf JS; görüntüler { data: Uint8ClampedArray (RGBA), width, height } biçimindedir (ImageData uyumlu).

/** Kâğıt adaylığı: parlak ve az doygun pikseller yüksek puan alır (0-255) */
function paperScore(img) {
    const { data, width: w, height: h } = img;
    const s = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        s[i] = Math.max(0, (r + g + b) / 3 - 0.7 * (mx - mn));
    }
    return boxBlur(s, w, h, 2);
}

function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = acc / (2 * r + 1);
            acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / (2 * r + 1);
            acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}

function otsu(values) {
    const hist = new Float64Array(256);
    for (const v of values) hist[Math.min(255, Math.max(0, v | 0))]++;
    const n = values.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = n - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) ** 2;
        if (between > best) { best = between; thr = t; }
    }
    return thr;
}

/** En büyük 4-bağlı bileşen (delikleri doldurulmuş) */
function largestComponent(mask, w, h) {
    const label = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    let bestId = -1, bestSize = 0, id = 0;
    for (let i = 0; i < w * h; i++) {
        if (!mask[i] || label[i] >= 0) continue;
        let sp = 0, size = 0;
        stack[sp++] = i; label[i] = id;
        while (sp) {
            const p = stack[--sp];
            size++;
            const x = p % w, y = (p / w) | 0;
            if (x > 0 && mask[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack[sp++] = p - 1; }
            if (x < w - 1 && mask[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack[sp++] = p + 1; }
            if (y > 0 && mask[p - w] && label[p - w] < 0) { label[p - w] = id; stack[sp++] = p - w; }
            if (y < h - 1 && mask[p + w] && label[p + w] < 0) { label[p + w] = id; stack[sp++] = p + w; }
        }
        if (size > bestSize) { bestSize = size; bestId = id; }
        id++;
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (label[i] === bestId) out[i] = 1;
    return { mask: out, size: bestSize };
}

function convexHull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const triArea = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;

/** Dışbükey çokgene çizilebilen en büyük dörtgen (köşeler çokgen köşelerinden) */
function maxQuad(hull) {
    const n = hull.length;
    if (n < 4) return null;
    let best = -1, quad = null;
    for (let i = 0; i < n; i++) {
        for (let k = i + 2; k < n; k++) {
            let a1 = -1, j1 = -1, a2 = -1, l1 = -1;
            for (let j = i + 1; j < k; j++) { const a = triArea(hull[i], hull[j], hull[k]); if (a > a1) { a1 = a; j1 = j; } }
            for (let l = k + 1; l < n + i; l++) { const a = triArea(hull[k], hull[l % n], hull[i]); if (a > a2) { a2 = a; l1 = l % n; } }
            if (j1 >= 0 && l1 >= 0 && a1 + a2 > best) { best = a1 + a2; quad = [hull[i], hull[j1], hull[k], hull[l1]]; }
        }
    }
    return quad && { quad, area: best };
}

function polyArea(q) {
    let a = 0;
    for (let i = 0; i < 4; i++) a += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
    return Math.abs(a) / 2;
}

function isConvex(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]];
        const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(z) < 1e-9) return false;
        if (sign && Math.sign(z) !== sign) return false;
        sign = Math.sign(z);
    }
    return true;
}

/** Köşeleri sol-üst, sağ-üst, sağ-alt, sol-alt sırasına koyar */
export function orderCorners(pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    // açıya göre sıralı (saat yönü, y aşağı); sol-üstü x+y en küçük olandan başlat
    let start = 0;
    for (let i = 1; i < 4; i++) if (sorted[i][0] + sorted[i][1] < sorted[start][0] + sorted[start][1]) start = i;
    return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}

/** Varsayılan köşeler: kenarlardan %4 içeride */
export function defaultQuad(w, h) {
    const m = 0.04;
    return [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]];
}

/** Kare aşındırma (ince köprüleri kırar) */
function erode(mask, w, h, r) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        let run = 0;
        for (let x = 0; x < w; x++) { run = mask[y * w + x] ? run + 1 : 0; if (run > 2 * r) tmp[y * w + x - r] = 1; }
    }
    for (let x = 0; x < w; x++) {
        let run = 0;
        for (let y = 0; y < h; y++) { run = tmp[y * w + x] ? run + 1 : 0; if (run > 2 * r) out[(y - r) * w + x] = 1; }
    }
    return out;
}

/** Kenardan ulaşılamayan boşlukları (kâğıttaki yazılar) doldurur */
function fillHoles(mask, w, h) {
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (i) => { if (!mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p / w) | 0;
        if (x > 0) push(p - 1);
        if (x < w - 1) push(p + 1);
        if (y > 0) push(p - w);
        if (y < h - 1) push(p + w);
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = seen[i] ? 0 : 1;
    return out;
}

const ERODE = 2;

/** Eşik adayı: puanı eşiği aşan en büyük bileşen */
function thresholdCandidate(score, w, h, thr) {
    const raw = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) raw[i] = score[i] > thr ? 1 : 0;
    const { mask, size } = largestComponent(erode(raw, w, h, ERODE), w, h);
    if (size < w * h * 0.1 || size > w * h * 0.97) return null;
    return evaluate(fillHoles(mask, w, h), score, w, h, ERODE);
}

function gradient(score, w, h) {
    const g = new Float32Array(w * h);
    const dir = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const gx = score[i - w + 1] + 2 * score[i + 1] + score[i + w + 1] - score[i - w - 1] - 2 * score[i - 1] - score[i + w - 1];
            const gy = score[i + w - 1] + 2 * score[i + w] + score[i + w + 1] - score[i - w - 1] - 2 * score[i - w] - score[i - w + 1];
            g[i] = Math.hypot(gx, gy);
            dir[i] = Math.atan2(gy, gx);
        }
    }
    g.dir = dir;
    return g;
}

/** Dörtgen kenarları gerçekten güçlü kenarlar üzerinde mi? (0-1; her kenar ayrı ayrı desteklenmeli) */
function edgeSupport(quad, grad, w, h, gRef) {
    const per = [];
    for (let e = 0; e < 4; e++) {
        const [x0, y0] = quad[e], [x1, y1] = quad[(e + 1) % 4];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
        let sum = 0, n = 0;
        // köşelere yakın uçları atla (köşe yuvarlaması / gölge)
        for (let t = 0.06; t <= 0.94; t += 2 / Math.max(len, 1)) {
            const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
            n++;
            // görüntü çerçevesi kenar sayılmaz
            if (px < 3 || py < 3 || px > w - 4 || py > h - 4) continue;
            let m = 0;
            for (let k = -2; k <= 2; k++) {
                const qx = Math.round(px + nx * k), qy = Math.round(py + ny * k);
                if (qx > 0 && qy > 0 && qx < w - 1 && qy < h - 1) m = Math.max(m, grad[qy * w + qx]);
            }
            sum += Math.min(1, m / gRef);
        }
        per.push(n ? sum / n : 0);
    }
    return 0.5 * (per.reduce((a, b) => a + b, 0) / 4) + 0.5 * Math.min(...per);
}

/** Dörtgen içi ile dışı arasındaki ortalama kâğıt puanı farkı (seyrek örnekleme) */
function insideContrast(q, score, w, h) {
    let si = 0, ni = 0, so = 0, no = 0;
    for (let y = 1; y < h; y += 3) {
        for (let x = 1; x < w; x += 3) {
            let inside = true;
            for (let i = 0; i < 4 && inside; i++) {
                const a = q[i], b = q[(i + 1) % 4];
                if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) inside = false;
            }
            if (inside) { si += score[y * w + x]; ni++; } else { so += score[y * w + x]; no++; }
        }
    }
    return ni && no ? si / ni - so / no : 0;
}

/** Hough doğrularından dörtgen adayları (kâğıt kenarları düz çizgilerdir) */
function houghCandidates(grad, w, h, gThr) {
    const NT = 180, diag = Math.ceil(Math.hypot(w, h)), NR = 2 * diag + 1;
    const acc = new Float32Array(NT * NR);
    const cos = new Float32Array(NT), sin = new Float32Array(NT);
    for (let t = 0; t < NT; t++) { cos[t] = Math.cos((t * Math.PI) / NT); sin[t] = Math.sin((t * Math.PI) / NT); }
    for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
            const g = grad[y * w + x];
            if (g < gThr) continue;
            // yalnız gradyan yönüne yakın açılar (±8°)
            let th = grad.dir[y * w + x];
            if (th < 0) th += Math.PI;
            const tc = Math.round((th / Math.PI) * NT);
            for (let d = -8; d <= 8; d++) {
                const t = (tc + d + NT) % NT;
                const r = Math.round(x * cos[t] + y * sin[t]) + diag;
                acc[t * NR + r] += g;
            }
        }
    }
    // tepe noktaları (yerel en büyük)
    const peaks = [];
    for (let t = 0; t < NT; t++) {
        for (let r = 0; r < NR; r++) {
            const v = acc[t * NR + r];
            if (v <= 0) continue;
            peaks.push([v, t, r]);
        }
    }
    peaks.sort((a, b) => b[0] - a[0]);
    const lines = [];
    for (const [v, t, r] of peaks) {
        if (lines.length >= 16) break;
        if (lines.some((l) => Math.min(Math.abs(l.t - t), NT - Math.abs(l.t - t)) < 6 && Math.abs(l.r - r) < 10)) continue;
        lines.push({ v, t, r, theta: (t * Math.PI) / NT, rho: r - diag });
    }
    const horiz = lines.filter((l) => l.t > 45 && l.t < 135).slice(0, 7);
    const vert = lines.filter((l) => l.t <= 45 || l.t >= 135).slice(0, 7);
    const meet = (a, b) => {
        const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
        if (Math.abs(det) < 1e-6) return null;
        return [(a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det, (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det];
    };
    const quads = [];
    for (let i = 0; i < horiz.length; i++) for (let j = i + 1; j < horiz.length; j++) {
        for (let k = 0; k < vert.length; k++) for (let l = k + 1; l < vert.length; l++) {
            const pts = [meet(horiz[i], vert[k]), meet(horiz[i], vert[l]), meet(horiz[j], vert[l]), meet(horiz[j], vert[k])];
            if (pts.some((p) => !p || p[0] < -w * 0.02 || p[1] < -h * 0.02 || p[0] > w * 1.02 || p[1] > h * 1.02)) continue;
            quads.push(orderCorners(pts));
        }
    }
    return quads;
}

/** Bölge büyütme adayı: merkezdeki en açık noktadan, güçlü kenarları aşmadan yayıl (gölgeli kâğıtta da çalışır) */
function floodCandidate(score, grad, w, h, gThr) {
    let seed = -1, best = -1;
    for (let y = Math.round(h * 0.3); y < h * 0.7; y++) {
        for (let x = Math.round(w * 0.3); x < w * 0.7; x++) if (score[y * w + x] > best) { best = score[y * w + x]; seed = y * w + x; }
    }
    if (seed < 0) return null;
    const floor = best * 0.45;
    const mask = new Uint8Array(w * h);
    const stack = [seed];
    mask[seed] = 1;
    let size = 0;
    while (stack.length) {
        const p = stack.pop();
        size++;
        const x = p % w, y = (p / w) | 0;
        const tryPush = (q) => { if (!mask[q] && grad[q] < gThr && score[q] > floor) { mask[q] = 1; stack.push(q); } };
        if (x > 0) tryPush(p - 1);
        if (x < w - 1) tryPush(p + 1);
        if (y > 0) tryPush(p - w);
        if (y < h - 1) tryPush(p + w);
    }
    if (size < w * h * 0.1 || size > w * h * 0.97) return null;
    // Kenar pikselleri dışarıda kaldı: bir piksel geri genişlet
    return evaluate(fillHoles(mask, w, h), score, w, h, 1.5);
}

/** Bileşenin dörtgene uyumu ve güven puanı */
function evaluate(comp, score, w, h, grow) {
    let size = 0, sin = 0, sout = 0, border = 0;
    for (let i = 0; i < w * h; i++) {
        if (comp[i]) { size++; sin += score[i]; } else sout += score[i];
    }
    for (let x = 0; x < w; x++) border += comp[x] + comp[(h - 1) * w + x];
    for (let y = 0; y < h; y++) border += comp[y * w] + comp[y * w + w - 1];
    // Kâğıt çevresinden belirgin biçimde açık olmalı (doku desenlerini belge sanma)
    if (sin / size - sout / Math.max(1, w * h - size) < 40) return null;

    // Satır başına en sol/en sağ pikseller dış hat için yeterli
    const pts = [];
    for (let y = 0; y < h; y++) {
        let x0 = -1, x1 = -1;
        for (let x = 0; x < w; x++) if (comp[y * w + x]) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 >= 0) pts.push([x0, y], [x1 + 1, y], [x0, y + 1], [x1 + 1, y + 1]);
    }
    let hull = convexHull(pts);
    if (hull.length > 80) {
        const step = hull.length / 80;
        hull = Array.from({ length: 80 }, (_, i) => hull[Math.floor(i * step)]);
    }
    const r = maxQuad(hull);
    if (!r) return null;
    // Dörtgenlik: bileşen bulunan dörtgeni ne kadar dolduruyor (ve dörtgen bileşeni)
    const fill = Math.min(size / r.area, r.area / size);
    if (fill < 0.88) return null;
    const borderFrac = border / (2 * (w + h));
    // Aşındırma payını geri ver: köşeleri merkezden dışa it
    const cx = r.quad.reduce((a, p) => a + p[0], 0) / 4, cy = r.quad.reduce((a, p) => a + p[1], 0) / 4;
    const quad = r.quad.map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return [Math.min(w, Math.max(0, x + ((x - cx) / d) * grow * 1.41)), Math.min(h, Math.max(0, y + ((y - cy) / d) * grow * 1.41))];
    });
    return { quad, conf: r.area * fill ** 8 * (1 - borderFrac) };
}

/**
 * Belgenin dört köşesini bulur. Birkaç eşik ve kenar bariyerli bölge büyütme denenir; en büyük ve en "dörtgen" aday seçilir.
 * @param {{data, width, height}} img - küçültülmüş görüntü (~400 px yeterli)
 * @returns {{quad: number[][], found: boolean}} img koordinatlarında
 */
export function detectQuad(img) {
    const { width: w, height: h } = img;
    const score = paperScore(img);
    const sorted = Float32Array.from(score).sort();
    const pct = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    const thresholds = [otsu(score), pct(0.3), pct(0.45), pct(0.6), pct(0.75)];
    const grad = gradient(score, w, h);
    const gs = Float32Array.from(grad).sort();
    const gpct = (p) => gs[Math.floor(p * (gs.length - 1))];
    const gRef = gpct(0.97) || 1;
    const quads = [
        ...thresholds.map((thr) => thresholdCandidate(score, w, h, thr)),
        ...[0.8, 0.88, 0.94].map((p) => floodCandidate(score, grad, w, h, gpct(p))),
    ].filter(Boolean).map((c) => orderCorners(c.quad)).concat(houghCandidates(grad, w, h, gpct(0.9)));
    // Puan: alan × kenar desteği³ (kenarları gerçek kenarlara oturmayan büyük adaylar elenir)
    let best = null;
    for (const q of quads) {
        const area = polyArea(q);
        if (area < w * h * 0.08 || !isConvex(q)) continue;
        const sup = edgeSupport(q, grad, w, h, gRef);
        if (sup < 0.45) continue;
        // Desen çizgilerini belge sanma: kâğıt çevresinden açık olmalı (ya da kenarları çok net olmalı)
        if (sup < 0.75 && insideContrast(q, score, w, h) < 20) continue;
        const conf = area * sup ** 3;
        if (!best || conf > best.conf) best = { quad: q, conf };
    }
    if (!best) return { quad: defaultQuad(w, h), found: false };
    return { quad: best.quad.map(([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))]), found: true };
}

/**
 * Köşeleri daha yüksek çözünürlükte inceltir: her köşe, kenar desteğini en çoğa çıkaracak şekilde yakınında kaydırılır.
 * @param {{data, width, height}} img - detectQuad'a verilenden büyük kopya
 * @param {number[][]} quad - img koordinatlarında
 */
export function refineQuad(img, quad, radius = 4) {
    const { width: w, height: h } = img;
    const grad = gradient(paperScore(img), w, h);
    const gs = Float32Array.from(grad).sort();
    const gRef = gs[Math.floor(0.97 * (gs.length - 1))] || 1;
    let q = quad.map((p) => p.slice());
    let cur = edgeSupport(q, grad, w, h, gRef);
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 4; i++) {
            const [ox, oy] = q[i];
            let best = [ox, oy];
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const t = q.slice();
                    t[i] = [Math.min(w, Math.max(0, ox + dx)), Math.min(h, Math.max(0, oy + dy))];
                    const v = edgeSupport(t, grad, w, h, gRef);
                    if (v > cur) { cur = v; best = t[i]; }
                }
            }
            q[i] = best;
        }
    }
    return q;
}

/** Dörtgeni merkezine doğru köşegeninin frac oranı kadar küçültür (kenarda arka plan şeridi kalmasın) */
export function insetQuad(quad, frac) {
    const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
    const diag = Math.hypot(quad[0][0] - quad[2][0], quad[0][1] - quad[2][1]);
    return quad.map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        const k = Math.max(0, 1 - (frac * diag) / d);
        return [cx + (x - cx) * k, cy + (y - cy) * k];
    });
}

/** dst dikdörtgen (0..W, 0..H) → kaynak dörtgen eşlemesi için 3x3 homografi */
export function homography(quad, W, H) {
    const dst = [[0, 0], [W, 0], [W, H], [0, H]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = dst[i], [u, v] = quad[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // Gauss eleme (kısmi pivot)
    for (let c = 0; c < 8; c++) {
        let p = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
        for (let r = c + 1; r < 8; r++) {
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    const x = new Array(8);
    for (let r = 7; r >= 0; r--) {
        let s = b[r];
        for (let k = r + 1; k < 8; k++) s -= A[r][k] * x[k];
        x[r] = s / A[r][r];
    }
    return [...x, 1];
}

export function applyHomography(m, x, y) {
    const d = m[6] * x + m[7] * y + m[8];
    return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
}

/**
 * Fotoğraftaki dikdörtgenin gerçek en/boy oranı (Zhang & He, "Whiteboard scanning", 2007).
 * Kamera odak uzaklığı köşelerden tahmin edilir; dörtgen paralelkenara çok yakınsa null.
 */
export function aspectRatio(quad, imgW, imgH) {
    const u0 = imgW / 2, v0 = imgH / 2;
    const [m1, m2, m4, m3] = quad.map(([x, y]) => [x - u0, y - v0, 1]); // tl, tr, br, bl
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const c14 = cross(m1, m4);
    const k2 = dot(c14, m3) / dot(cross(m2, m4), m3);
    const k3 = dot(c14, m2) / dot(cross(m3, m4), m2);
    const n2 = m2.map((v, i) => k2 * v - m1[i]);
    const n3 = m3.map((v, i) => k3 * v - m1[i]);
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    if (!(f2 > 0) || !isFinite(f2) || Math.abs(n2[2]) < 1e-6 || Math.abs(n3[2]) < 1e-6) return null;
    const q = (n) => (n[0] * n[0] + n[1] * n[1]) / f2 + n[2] * n[2];
    const r = Math.sqrt(q(n2) / q(n3));
    return isFinite(r) && r > 0.1 && r < 10 ? r : null;
}

/** Çıktı boyutu: en/boy oranı perspektiften (yoksa kenar uzunluklarından); uzun kenar en çok maxSide */
export function outputSize(quad, maxSide = 3000, imgW, imgH) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2]));
    let H = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]));
    let r = imgW && imgH ? aspectRatio(quad, imgW, imgH) : null;
    // Kırpılmış görüntü ya da elle bozulmuş köşelerde tahmin saçmalayabilir: kenar oranından çok uzaksa kullanma
    if (r && (r / (W / H) > 1.8 || (W / H) / r > 1.8)) r = null;
    if (r) {
        // alanı koruyarak oranı uygula
        const area = W * H;
        W = Math.sqrt(area * r); H = W / r;
    }
    const k = Math.min(1, maxSide / Math.max(W, H));
    W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
    return { width: W, height: H };
}

/** Perspektifi düzeltir (çift doğrusal örnekleme) */
export function warp(src, quad, W, H) {
    const m = homography(quad, W, H);
    const out = new Uint8ClampedArray(W * H * 4);
    const { data, width: sw, height: sh } = src;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let [u, v] = applyHomography(m, x + 0.5, y + 0.5);
            u = Math.min(sw - 1, Math.max(0, u - 0.5)); v = Math.min(sh - 1, Math.max(0, v - 0.5));
            const x0 = u | 0, y0 = v | 0, x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
            const fx = u - x0, fy = v - y0;
            const o = (y * W + x) * 4;
            const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
            for (let c = 0; c < 3; c++) {
                const a = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
                const b = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
                out[o + c] = a + (b - a) * fy;
            }
            out[o + 3] = 255;
        }
    }
    return { data: out, width: W, height: H };
}

/** Kâğıt arka planını (aydınlatma) tahmin eder: küçült, en açığı al (yazıyı sil), bulanıklaştır */
function illumination(img) {
    const { data, width: w, height: h } = img;
    const f = Math.max(1, Math.round(Math.max(w, h) / 160));
    const sw = Math.ceil(w / f), sh = Math.ceil(h / f);
    const small = [new Float32Array(sw * sh), new Float32Array(sw * sh), new Float32Array(sw * sh)];
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const m = [0, 0, 0];
            for (let yy = y * f; yy < Math.min(h, (y + 1) * f); yy++) {
                for (let xx = x * f; xx < Math.min(w, (x + 1) * f); xx++) {
                    const i = (yy * w + xx) * 4;
                    for (let c = 0; c < 3; c++) if (data[i + c] > m[c]) m[c] = data[i + c];
                }
            }
            for (let c = 0; c < 3; c++) small[c][y * sw + x] = m[c];
        }
    }
    // Büyük harfler/çizgiler de silinsin: en açık komşu (genişletme), sonra yumuşat
    const r = 3;
    const bg = small.map((ch) => {
        const dil = new Float32Array(sw * sh);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                let m = 0;
                for (let dy = -r; dy <= r; dy++) {
                    const yy = Math.min(sh - 1, Math.max(0, y + dy));
                    for (let dx = -r; dx <= r; dx++) m = Math.max(m, ch[yy * sw + Math.min(sw - 1, Math.max(0, x + dx))]);
                }
                dil[y * sw + x] = m;
            }
        }
        return boxBlur(boxBlur(dil, sw, sh, 4), sw, sh, 4);
    });
    return { bg, sw, sh, f };
}

/**
 * "Taranmış" görünüm.
 * @param {'original'|'color'|'gray'|'bw'} mode
 * @param {number} contrast - 0..100
 */
export function scanFilter(img, mode = 'color', contrast = 40) {
    const { data, width: w, height: h } = img;
    const out = new Uint8ClampedArray(data.length);
    if (mode === 'original') { out.set(data); return { data: out, width: w, height: h }; }
    const { bg, sw, sh, f } = illumination(img);
    const gamma = 1 + contrast / 40; // orta tonları koyulaştırır, beyaz beyaz kalır
    const thr = 120 + contrast * 0.9;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, gamma);
    for (let y = 0; y < h; y++) {
        // arka plan haritasından çift doğrusal örnek
        const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5));
        const y0 = sy | 0, y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
        for (let x = 0; x < w; x++) {
            const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5));
            const x0 = sx | 0, x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
            const i = (y * w + x) * 4;
            const v = [0, 0, 0];
            for (let c = 0; c < 3; c++) {
                const ch = bg[c];
                const a = ch[y0 * sw + x0] + (ch[y0 * sw + x1] - ch[y0 * sw + x0]) * fx;
                const b = ch[y1 * sw + x0] + (ch[y1 * sw + x1] - ch[y1 * sw + x0]) * fx;
                const bgv = Math.max(24, a + (b - a) * fy);
                v[c] = Math.min(255, (data[i + c] / bgv) * 255);
            }
            if (mode === 'color') {
                out[i] = lut[v[0] | 0]; out[i + 1] = lut[v[1] | 0]; out[i + 2] = lut[v[2] | 0];
            } else {
                const l = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
                const g = mode === 'bw' ? (l < thr ? 0 : 255) : lut[l | 0];
                out[i] = out[i + 1] = out[i + 2] = g;
            }
            out[i + 3] = 255;
        }
    }
    return { data: out, width: w, height: h };
}
