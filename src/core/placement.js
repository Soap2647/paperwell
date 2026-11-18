// Akıllı yerleşim ve okunabilirlik (saf modül): sayfanın küçük bir gri görüntüsü üzerinde çalışır.

/**
 * Yeni öğe (logo, QR, bilgi bloğu) için afişin en sakin yerini bulur: kenar enerjisi (detay) en az,
 * mevcut nesnelerle çakışmayan, sayfa kenarından pay bırakan konum. Alt ve üst şeritler hafifçe tercih edilir
 * (afişlerde logo ve bilgi genelde oradadır).
 * @param {Float32Array} lum - W×H parlaklık (0-255)
 * @param {number} rw, rh - yerleştirilecek kutu (piksel)
 * @param {{x:number,y:number,w:number,h:number}[]} taken - dolu alanlar (piksel)
 * @returns {{x:number, y:number}} sol üst köşe (piksel)
 */
export function calmestSpot(lum, W, H, rw, rh, taken = []) {
    rw = Math.min(Math.round(rw), W - 2); rh = Math.min(Math.round(rh), H - 2);
    // kenar enerjisi ve integral görüntü
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
        let row = 0;
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const gx = x + 1 < W ? Math.abs(lum[i + 1] - lum[i]) : 0, gy = y + 1 < H ? Math.abs(lum[i + W] - lum[i]) : 0;
            row += gx + gy;
            I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
        }
    }
    const sum = (x, y, w, h) => I[(y + h) * (W + 1) + x + w] - I[y * (W + 1) + x + w] - I[(y + h) * (W + 1) + x] + I[y * (W + 1) + x];
    const m = Math.round(Math.min(W, H) * 0.04); // kenar payı
    const step = Math.max(1, Math.round(Math.min(rw, rh) / 6));
    let best = null;
    for (let y = m; y + rh <= H - m; y += step) {
        for (let x = m; x + rw <= W - m; x += step) {
            const overlap = taken.some((r) => x < r.x + r.w && x + rw > r.x && y < r.y + r.h && y + rh > r.y);
            if (overlap) continue;
            const cy = (y + rh / 2) / H;
            const band = cy > 0.8 || cy < 0.2 ? 0.85 : 1; // alt/üst şerit tercihi
            const cost = (sum(x, y, rw, rh) / (rw * rh)) * band;
            if (!best || cost < best.cost) best = { x, y, cost };
        }
    }
    return best ? { x: best.x, y: best.y } : { x: Math.round((W - rw) / 2), y: Math.round((H - rh) / 2) };
}

/** sRGB → göreli parlaklık (WCAG) */
export function relLum([r, g, b]) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** İki renk arasındaki kontrast oranı (1-21; okunaklı yazı için ≥ 3, rahat okuma ≥ 4.5) */
export function contrast(a, b) {
    const la = relLum(a), lb = relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const hexRgb = (hex) => { const n = parseInt((hex || '#000000').slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Görselin renk paleti: k-ortalama (örneklenmiş pikseller), birbirine çok yakın renkler birleştirilir.
 * Sıra: kapladığı alan × (1 + doygunluk), böylece hem baskın zemin rengi hem vurgu renkleri öne çıkar.
 * @returns {string[]} en çok n renk (#rrggbb)
 */
export function paletteOf(data, W, H, n = 6) {
    const pts = [];
    const step = Math.max(1, Math.floor((W * H) / 6000));
    for (let i = 0; i < W * H; i += step) if (data[i * 4 + 3] > 200) pts.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    if (!pts.length) return [];
    const K = 10;
    let C = Array.from({ length: K }, (_, j) => [...pts[Math.floor((j + 0.5) * pts.length / K)]]);
    const lab = new Int32Array(pts.length);
    for (let it = 0; it < 10; it++) {
        const sum = C.map(() => [0, 0, 0, 0]);
        pts.forEach((p, i) => {
            let b = 0, bd = Infinity;
            for (let j = 0; j < K; j++) { const d = (p[0] - C[j][0]) ** 2 + (p[1] - C[j][1]) ** 2 + (p[2] - C[j][2]) ** 2; if (d < bd) { bd = d; b = j; } }
            lab[i] = b; sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
        });
        C = C.map((c, j) => (sum[j][3] ? sum[j].slice(0, 3).map((v) => v / sum[j][3]) : c));
    }
    const count = C.map(() => 0);
    lab.forEach((j) => count[j]++);
    const sat = (c) => (Math.max(...c) - Math.min(...c)) / 255;
    const ranked = C.map((c, j) => ({ c, score: count[j] * (1 + 2 * sat(c)) })).filter((q, j) => count[j] > pts.length * 0.01).sort((a, b) => b.score - a.score);
    const out = [];
    for (const q of ranked) {
        if (out.some((c) => Math.hypot(c[0] - q.c[0], c[1] - q.c[1], c[2] - q.c[2]) < 40)) continue;
        out.push(q.c);
        if (out.length === n) break;
    }
    return out.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
}
