// "Düzelt" aracının maskesi (saf modül, yalnız typed array): kullanıcının çizdiği kutunun kenarı zemindir;
// kutunun içinde zeminden belirgin ayrılan pikseller (logo, yazı, bozuk detay) silinecek alandır.
// Zemin iki şekilde modellenir: kenara oturtulan düzlem (degrade) ve kenar renk kümeleri (çok renkli zemin);
// pikselin ikisine de uzak olması gerekir. Kenar yumuşaklığı ve parıltı kalmasın diye maske biraz genişletilir.

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Kutu kenarındaki (t piksel kalınlıkta) piksel indeksleri */
function borderIdx(W, box, t) {
    const out = [];
    for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
            if (x - box.x0 < t || box.x1 - 1 - x < t || y - box.y0 < t || box.y1 - 1 - y < t) out.push(y * W + x);
        }
    }
    return out;
}

/** Basit k-ortalama (renk), en çok k küme; az üyeli kümeler atılır */
function clusters(rgba, idx, k = 3) {
    const step = Math.max(1, Math.floor(idx.length / 2000));
    const pts = [];
    for (let i = 0; i < idx.length; i += step) { const p = idx[i] * 4; pts.push([rgba[p], rgba[p + 1], rgba[p + 2]]); }
    let C = [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]].slice(0, k).map((c) => [...c]);
    const lab = new Int32Array(pts.length);
    for (let it = 0; it < 8; it++) {
        const sum = C.map(() => [0, 0, 0, 0]);
        pts.forEach((p, i) => {
            let b = 0;
            for (let j = 1; j < C.length; j++) if (dist2(p, C[j]) < dist2(p, C[b])) b = j;
            lab[i] = b; sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
        });
        C = C.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
    }
    const n = C.map(() => 0), err = C.map(() => 0);
    pts.forEach((p, i) => { n[lab[i]]++; err[lab[i]] += Math.sqrt(dist2(p, C[lab[i]])); });
    return C.map((c, j) => ({ c, n: n[j], noise: n[j] ? err[j] / n[j] : 0 })).filter((q) => q.n >= pts.length * 0.08);
}

/** Kenar piksellerine kanal başına düzlem v = a + b·x + c·y (en küçük kareler) */
function plane(rgba, W, idx) {
    const s = new Float64Array(6), r = new Float64Array(9);
    for (const i of idx) {
        const x = i % W, y = (i / W) | 0;
        s[0]++; s[1] += x; s[2] += y; s[3] += x * x; s[4] += x * y; s[5] += y * y;
        for (let c = 0; c < 3; c++) { const v = rgba[i * 4 + c]; r[c * 3] += v; r[c * 3 + 1] += v * x; r[c * 3 + 2] += v * y; }
    }
    const P = [];
    for (let c = 0; c < 3; c++) {
        const m = [[s[0], s[1], s[2], r[c * 3]], [s[1], s[3], s[4], r[c * 3 + 1]], [s[2], s[4], s[5], r[c * 3 + 2]]];
        for (let i = 0; i < 3; i++) {
            let p = i;
            for (let q = i + 1; q < 3; q++) if (Math.abs(m[q][i]) > Math.abs(m[p][i])) p = q;
            if (Math.abs(m[p][i]) < 1e-9) return null;
            [m[i], m[p]] = [m[p], m[i]];
            for (let q = i + 1; q < 3; q++) { const f = m[q][i] / m[i][i]; for (let j = i; j < 4; j++) m[q][j] -= f * m[i][j]; }
        }
        const o = [0, 0, 0];
        for (let i = 2; i >= 0; i--) { let v = m[i][3]; for (let j = i + 1; j < 3; j++) v -= m[i][j] * o[j]; o[i] = v / m[i][i]; }
        P.push(o);
    }
    return P;
}

export function dilate(src, W, H, r) {
    const row = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        let last = -1e9;
        for (let x = 0; x < W; x++) { if (src[y * W + x]) last = x; if (x - last <= r) row[y * W + x] = 1; }
        last = 1e9;
        for (let x = W - 1; x >= 0; x--) { if (src[y * W + x]) last = x; if (last - x <= r) row[y * W + x] = 1; }
    }
    for (let x = 0; x < W; x++) {
        let last = -1e9;
        for (let y = 0; y < H; y++) { if (row[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
        last = 1e9;
        for (let y = H - 1; y >= 0; y--) { if (row[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
    }
    return out;
}

/**
 * Ön plan mürekkebinin ölçüleri: sınır kutusu ve harf gövdesi kalınlığının yüksekliğe oranı.
 * Yatay mürekkep koşularının ortancası dikey gövdeleri ölçer (yatay çizgiler azınlıkta kalır).
 * Kalınlık oranı yazı ağırlığını verir: normal ≈ 0,08-0,11, kalın ≈ 0,14-0,18 (büyük harf yüksekliğine göre).
 * @returns {{box: {x0:number,y0:number,x1:number,y1:number}, stroke: number}|null}
 */
export function inkStats(core, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const runs = [];
    for (let y = 0; y < H; y++) {
        let run = 0;
        for (let x = 0; x <= W; x++) {
            const on = x < W && core[y * W + x];
            if (on) { run++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } else if (run) { runs.push(run); run = 0; }
        }
    }
    if (x1 < 0) return null;
    runs.sort((a, b) => a - b);
    return { box: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, stroke: runs[runs.length >> 1] / (y1 + 1 - y0) };
}

/**
 * @param {Uint8ClampedArray} rgba - W×H görüntü (kutu çevresinde pay olabilir)
 * @param {{x0:number,y0:number,x1:number,y1:number}} box - kullanıcının kutusu (piksel, x1/y1 hariç)
 * @returns {{mask: Uint8Array, core: Uint8Array, fg: number[]|null, whole: boolean}}
 *   mask: silinecek alan (genişletilmiş), core: kesin ön plan pikselleri (renk tahmini için),
 *   fg: ön planın ortanca rengi, whole: ön plan ayrılamadı, kutunun tamamı silinir
 */
export function smartMask(rgba, W, H, box) {
    box = { x0: Math.max(0, Math.round(box.x0)), y0: Math.max(0, Math.round(box.y0)), x1: Math.min(W, Math.round(box.x1)), y1: Math.min(H, Math.round(box.y1)) };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const core = new Uint8Array(W * H);
    const whole = () => {
        const m = new Uint8Array(W * H);
        for (let y = box.y0; y < box.y1; y++) m.fill(1, y * W + box.x0, y * W + box.x1);
        return { mask: m, core, fg: null, whole: true };
    };
    if (bw < 6 || bh < 6) return whole();
    const ring = borderIdx(W, box, Math.max(2, Math.round(Math.min(bw, bh) * 0.02)));
    const C = clusters(rgba, ring);
    const P = plane(rgba, W, ring);
    // kenar gürültüsüne göre eşik: düz zeminde hassas, dokulu zeminde toleranslı
    let noise = 0;
    for (const i of ring) {
        const p = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
        noise += Math.sqrt(Math.min(...C.map((q) => dist2(p, q.c))));
    }
    noise /= ring.length;
    const T = Math.min(70, Math.max(26, noise * 3 + 16));
    const d = new Float32Array(W * H);
    let n = 0;
    for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
            const i = y * W + x, p = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
            let dc = Math.sqrt(Math.min(...C.map((q) => dist2(p, q.c))));
            if (P) dc = Math.min(dc, Math.sqrt(dist2(p, P.map((o) => o[0] + o[1] * x + o[2] * y))));
            d[i] = dc;
            if (dc > T) { core[i] = 1; n++; }
        }
    }
    const frac = n / (bw * bh);
    if (frac < 0.002 || frac > 0.92) return whole();
    // ön plana bitişik yumuşak kenar pikselleri (eşiğin yarısını geçenler) de silinir: hale kalmasın
    const near = dilate(core, W, H, 2);
    const soft = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) soft[i] = core[i] || (near[i] && d[i] > T * 0.4) ? 1 : 0;
    const mask = dilate(soft, W, H, Math.max(2, Math.round(Math.max(bw, bh) * 0.012)) + 1);
    // ön plan rengi: kesin piksellerin ortancası (kanal başına)
    const ch = [[], [], []];
    for (let i = 0; i < W * H; i++) if (core[i] && d[i] > T * 1.5) for (let c = 0; c < 3; c++) ch[c].push(rgba[i * 4 + c]);
    const fg = ch[0].length ? ch.map((a) => a.sort((u, v) => u - v)[a.length >> 1]) : null;
    return { mask, core, fg, whole: false };
}
