// Telea (2004) hızlı ilerleme (fast marching) tabanlı görüntü onarma.
// Belgelerde düz/gradyan arka plan üzerindeki yazı, damga, leke gibi şeyleri anında siler.

const KNOWN = 0;
const BAND = 1;
const INSIDE = 2;
const INF = 1e6;

class MinHeap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
        const k = this.k, v = this.v;
        let i = k.length;
        k.push(key); v.push(val);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (k[p] <= k[i]) break;
            [k[p], k[i]] = [k[i], k[p]];
            [v[p], v[i]] = [v[i], v[p]];
            i = p;
        }
    }
    pop() {
        const k = this.k, v = this.v;
        const top = v[0];
        const lk = k.pop(), lv = v.pop();
        if (k.length) {
            k[0] = lk; v[0] = lv;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < k.length && k[l] < k[m]) m = l;
                if (r < k.length && k[r] < k[m]) m = r;
                if (m === i) break;
                [k[m], k[i]] = [k[i], k[m]];
                [v[m], v[i]] = [v[i], v[m]];
                i = m;
            }
        }
        return top;
    }
}

/**
 * @param {Uint8ClampedArray} rgba - görüntü (yerinde değiştirilir)
 * @param {Uint8Array} mask - 1 = onarılacak piksel
 * @param {number} w
 * @param {number} h
 * @param {number} radius - komşuluk yarıçapı (piksel)
 */
export function inpaintTelea(rgba, mask, w, h, radius = 6) {
    const n = w * h;
    const flags = new Uint8Array(n);
    const T = new Float32Array(n);
    const heap = new MinHeap();

    for (let i = 0; i < n; i++) {
        if (mask[i]) { flags[i] = INSIDE; T[i] = INF; }
    }
    // Bant: deliğe komşu bilinen pikseller
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (flags[i] !== KNOWN) continue;
            if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) {
                flags[i] = BAND;
                heap.push(0, i);
            }
        }
    }

    const solve = (i1, i2) => {
        const a = T[i1], b = T[i2];
        const fa = flags[i1] !== INSIDE, fb = flags[i2] !== INSIDE;
        if (fa && fb) {
            const d = 2 - (a - b) * (a - b);
            if (d > 0) {
                const r = Math.sqrt(d);
                let s = (a + b - r) / 2;
                if (s >= a && s >= b) return s;
                s += r;
                if (s >= a && s >= b) return s;
            }
            return Math.min(a, b) + 1;
        }
        if (fa) return a + 1;
        if (fb) return b + 1;
        return INF;
    };

    const r2 = radius * radius;
    const inpaintPixel = (x, y) => {
        const i = y * w + x;
        // T gradyanı
        let gx = 0, gy = 0;
        const tL = x > 0 && flags[i - 1] !== INSIDE ? T[i - 1] : null;
        const tR = x < w - 1 && flags[i + 1] !== INSIDE ? T[i + 1] : null;
        const tU = y > 0 && flags[i - w] !== INSIDE ? T[i - w] : null;
        const tD = y < h - 1 && flags[i + w] !== INSIDE ? T[i + w] : null;
        if (tL !== null && tR !== null) gx = (tR - tL) / 2; else if (tR !== null) gx = tR - T[i]; else if (tL !== null) gx = T[i] - tL;
        if (tU !== null && tD !== null) gy = (tD - tU) / 2; else if (tD !== null) gy = tD - T[i]; else if (tU !== null) gy = T[i] - tU;

        let sw = 0, sr = 0, sg = 0, sb = 0;
        const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
        const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                const j = yy * w + xx;
                if (flags[j] === INSIDE) continue;
                const dx = x - xx, dy = y - yy;
                const d2 = dx * dx + dy * dy;
                if (d2 > r2 || d2 === 0) continue;
                const len = Math.sqrt(d2);
                let dir = Math.abs(dx * gx + dy * gy) / len;
                if (dir < 0.01) dir = 0.01;
                const dst = 1 / (d2);
                const lev = 1 / (1 + Math.abs(T[j] - T[i]));
                const wgt = dir * dst * lev;
                const p = j * 4;
                sr += rgba[p] * wgt; sg += rgba[p + 1] * wgt; sb += rgba[p + 2] * wgt;
                sw += wgt;
            }
        }
        if (sw > 0) {
            const p = i * 4;
            rgba[p] = sr / sw; rgba[p + 1] = sg / sw; rgba[p + 2] = sb / sw; rgba[p + 3] = 255;
        }
    };

    while (heap.size) {
        const i = heap.pop();
        if (flags[i] === KNOWN) continue;
        flags[i] = KNOWN;
        const x = i % w, y = (i / w) | 0;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of nb) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (flags[j] === KNOWN) continue;
            const left = nx > 0 ? j - 1 : j, right = nx < w - 1 ? j + 1 : j;
            const up = ny > 0 ? j - w : j, down = ny < h - 1 ? j + w : j;
            const t = Math.min(solve(left, up), solve(right, up), solve(left, down), solve(right, down));
            if (flags[j] === INSIDE) {
                flags[j] = BAND;
                T[j] = t;
                inpaintPixel(nx, ny);
                heap.push(t, j);
            } else if (t < T[j]) {
                T[j] = t;
                heap.push(t, j);
            }
        }
    }
}
