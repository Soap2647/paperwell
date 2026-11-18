// Düz renk / yumuşak gradyan delik doldurma (saf modül, yalnızca typed array).
// Grafik tasarımlarda delik çevresi çoğunlukla düz renk veya düzlemdir; öyleyse
// sinir ağı yerine analitik düzlem (v = a + b·x + c·y) ile doldurulur, kalanı inpainter'a gider.

// 3×3 normal denklemi çöz: s = 1,x,y,xx,xy,yy toplamları (simetrik matris), r = sağ taraf. Tekilse null.
function solve3(s, r0, r1, r2) {
    const m = [
        [s[0], s[1], s[2], r0],
        [s[1], s[3], s[4], r1],
        [s[2], s[4], s[5], r2],
    ];
    const eps = 1e-9 * Math.max(1, s[0], s[3] + s[5]);
    for (let i = 0; i < 3; i++) {
        let p = i;
        for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
        if (Math.abs(m[p][i]) < eps) return null;
        if (p !== i) { const t = m[p]; m[p] = m[i]; m[i] = t; }
        for (let k = i + 1; k < 3; k++) {
            const f = m[k][i] / m[i][i];
            for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
        }
    }
    const o = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
        let v = m[i][3];
        for (let j = i + 1; j < 3; j++) v -= m[i][j] * o[j];
        o[i] = v / m[i][i];
    }
    return o;
}

// Halka pikselleri (use[k] = 1 olanlar) için kanal başına düzlem; P[c*3..c*3+2] = (a, b, c)
function fitPlane(img, W, ring, n, use, cx, cy) {
    const s = [0, 0, 0, 0, 0, 0];
    const r = new Float64Array(9); // kanal × (Σv, Σvx, Σvy)
    let cnt = 0;
    for (let k = 0; k < n; k++) {
        if (!use[k]) continue;
        const i = ring[k];
        const x = (i % W) - cx, y = ((i / W) | 0) - cy;
        cnt++;
        s[0]++; s[1] += x; s[2] += y; s[3] += x * x; s[4] += x * y; s[5] += y * y;
        for (let c = 0; c < 3; c++) {
            const v = img[i * 4 + c];
            r[c * 3] += v; r[c * 3 + 1] += v * x; r[c * 3 + 2] += v * y;
        }
    }
    const P = new Float64Array(9);
    if (!cnt) return P;
    let ok = true;
    for (let c = 0; c < 3 && ok; c++) {
        const sol = solve3(s, r[c * 3], r[c * 3 + 1], r[c * 3 + 2]);
        if (!sol) ok = false; else { P[c * 3] = sol[0]; P[c * 3 + 1] = sol[1]; P[c * 3 + 2] = sol[2]; }
    }
    if (!ok) { // tekil: ortalama renk
        P.fill(0);
        for (let c = 0; c < 3; c++) P[c * 3] = r[c * 3] / cnt;
    }
    return P;
}

function residuals(img, W, ring, n, P, cx, cy, out) {
    for (let k = 0; k < n; k++) {
        const i = ring[k];
        const x = (i % W) - cx, y = ((i / W) | 0) - cy;
        let m = 0;
        for (let c = 0; c < 3; c++) {
            const e = Math.abs(img[i * 4 + c] - (P[c * 3] + P[c * 3 + 1] * x + P[c * 3 + 2] * y));
            if (e > m) m = e;
        }
        out[k] = m;
    }
}

export function flatFill(img, W, H, mask, opts = {}) {
    const { ring: R = 6, maxResidual = 12, minInliers = 0.85, minRing = 24 } = opts;
    const rest = new Uint8Array(W * H);
    const seen = new Uint8Array(W * H);
    const queue = new Int32Array(W * H); // bileşen pikselleri (her bileşen için baştan kullanılır)
    let filled = 0, regions = 0;

    for (let s = 0; s < W * H; s++) {
        if (!mask[s] || seen[s]) continue;
        // 4-bağlantılı bileşen (yinelemeli taşma doldurma)
        let head = 0, tail = 0;
        queue[tail++] = s; seen[s] = 1;
        let x0 = W, x1 = -1, y0 = H, y1 = -1;
        while (head < tail) {
            const i = queue[head++];
            const x = i % W, y = (i / W) | 0;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
            if (x < W - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
            if (y > 0 && mask[i - W] && !seen[i - W]) { seen[i - W] = 1; queue[tail++] = i - W; }
            if (y < H - 1 && mask[i + W] && !seen[i + W]) { seen[i + W] = 1; queue[tail++] = i + W; }
        }
        const size = tail;

        // Halka: bileşenin R piksel (Chebyshev) genişletmesi ∩ maske dışı. Yalnızca dolgulu bbox'ta, integral görüntüyle.
        const px0 = Math.max(0, x0 - R), px1 = Math.min(W - 1, x1 + R);
        const py0 = Math.max(0, y0 - R), py1 = Math.min(H - 1, y1 + R);
        const lw = px1 - px0 + 1, lh = py1 - py0 + 1, q = lw + 1;
        const sat = new Int32Array(q * (lh + 1)); // bileşen piksellerinin integral görüntüsü
        for (let k = 0; k < size; k++) {
            const i = queue[k];
            sat[(((i / W) | 0) - py0 + 1) * q + (i % W) - px0 + 1] = 1;
        }
        for (let y = 1; y <= lh; y++) {
            for (let x = 1; x <= lw; x++) {
                const j = y * q + x;
                sat[j] += sat[j - 1] + sat[j - q] - sat[j - q - 1];
            }
        }
        let ringIdx = new Int32Array(1024), n = 0;
        for (let y = py0; y <= py1; y++) {
            const ya = Math.max(py0, y - R) - py0, yb = Math.min(py1, y + R) - py0 + 1;
            for (let x = px0; x <= px1; x++) {
                const i = y * W + x;
                if (mask[i]) continue;
                const xa = Math.max(px0, x - R) - px0, xb = Math.min(px1, x + R) - px0 + 1;
                if (sat[yb * q + xb] - sat[ya * q + xb] - sat[yb * q + xa] + sat[ya * q + xa] <= 0) continue;
                if (n === ringIdx.length) { const g = new Int32Array(n * 2); g.set(ringIdx); ringIdx = g; }
                ringIdx[n++] = i;
            }
        }
        if (n < minRing) { for (let k = 0; k < size; k++) rest[queue[k]] = 1; continue; }

        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const use = new Uint8Array(n).fill(1);
        const res = new Float32Array(n);
        let P = fitPlane(img, W, ringIdx, n, use, cx, cy);
        residuals(img, W, ringIdx, n, P, cx, cy, res);

        // Dayanıklılık: aykırıları at, bir kez yeniden uydur
        const med = Float32Array.from(res).sort()[n >> 1];
        const thr = Math.max(maxResidual, 2.5 * med);
        let keep = 0;
        for (let k = 0; k < n; k++) { use[k] = res[k] <= thr ? 1 : 0; keep += use[k]; }
        if (keep >= n / 2 && keep < n) {
            P = fitPlane(img, W, ringIdx, n, use, cx, cy);
            residuals(img, W, ringIdx, n, P, cx, cy, res);
        }

        let inl = 0;
        for (let k = 0; k < n; k++) if (res[k] <= maxResidual) inl++;
        if (inl / n < minInliers) { for (let k = 0; k < size; k++) rest[queue[k]] = 1; continue; }

        for (let k = 0; k < size; k++) {
            const i = queue[k];
            const x = (i % W) - cx, y = ((i / W) | 0) - cy;
            for (let c = 0; c < 3; c++) {
                const v = Math.round(P[c * 3] + P[c * 3 + 1] * x + P[c * 3 + 2] * y);
                img[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
            }
        }
        filled += size; regions++;
    }
    return { rest, filled, regions };
}
