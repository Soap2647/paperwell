// Magic Layers: SAM "segment everything" maskelerinden hangilerinin katman olacağını seçer (saf modül, DOM yok).
// Maske: { bin: Uint8Array(G*G), on, box: [x0,y0,x1,y1] (dahil), score, ... }; görsel: rgba Uint8ClampedArray(G*G*4).

/** İki maskenin ortak hücre sayısı (önce bbox kesişimi) */
export function maskInter(a, b, G) {
    const x0 = Math.max(a.box[0], b.box[0]), y0 = Math.max(a.box[1], b.box[1]);
    const x1 = Math.min(a.box[2], b.box[2]), y1 = Math.min(a.box[3], b.box[3]);
    if (x0 > x1 || y0 > y1) return 0;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
        const o = y * G;
        for (let x = x0; x <= x1; x++) if (a.bin[o + x] && b.bin[o + x]) n++;
    }
    return n;
}

/** Maske içi ortalama renk ile hemen dışındaki halkanın (ring hücre, kutu genişlemesi) ortalama rengi arasındaki RGB uzaklığı */
export function maskContrast(m, rgba, G, ring = 3) {
    const X0 = Math.max(0, m.box[0] - ring), Y0 = Math.max(0, m.box[1] - ring);
    const X1 = Math.min(G - 1, m.box[2] + ring), Y1 = Math.min(G - 1, m.box[3] + ring);
    const W = X1 - X0 + 1, H = Y1 - Y0 + 1;
    // ayrılabilir genişletme: önce yatay, sonra dikey
    const hor = new Uint8Array(W * H), dil = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        const o = (y + Y0) * G + X0;
        for (let x = 0; x < W; x++) {
            if (!m.bin[o + x]) continue;
            for (let k = Math.max(0, x - ring); k <= Math.min(W - 1, x + ring); k++) hor[y * W + k] = 1;
        }
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!hor[y * W + x]) continue;
            for (let k = Math.max(0, y - ring); k <= Math.min(H - 1, y + ring); k++) dil[k * W + x] = 1;
        }
    }
    let ni = 0, no = 0;
    const si = [0, 0, 0], so = [0, 0, 0];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = ((y + Y0) * G + x + X0);
            const inside = m.bin[p];
            if (!inside && !dil[y * W + x]) continue;
            const s = inside ? si : so;
            s[0] += rgba[p * 4]; s[1] += rgba[p * 4 + 1]; s[2] += rgba[p * 4 + 2];
            if (inside) ni++; else no++;
        }
    }
    if (!ni || !no) return 0;
    return Math.hypot(si[0] / ni - so[0] / no, si[1] / ni - so[1] / no, si[2] / ni - so[2] / no);
}

/**
 * Hangi maskeler katman olur: düşük kontrastlı doku elenir, nesne parçaları elenir (bütün kalır),
 * büyük kapsayıcıların (panel/kutu) içindekiler ayrı katman kalır. Dönen maskelere contrast, level, parent eklenir.
 */
export function selectLayerMasks(masks, rgba, G, opts = {}) {
    const { minContrast = 40, containerArea = 0.08, inside = 0.9 } = opts;
    const cand = [];
    for (const m of masks) {
        m.contrast = maskContrast(m, rgba, G);
        if (m.contrast >= minContrast) cand.push(m);
    }
    cand.sort((a, b) => b.on - a.on); // büyükten küçüğe
    const n = cand.length, cut = containerArea * G * G;
    // en küçük kapsayan maske (aday içinde); büyükten küçüğe sıralı olduğundan ilk bulunan değil, en küçük "on" olan seçilir
    const par = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        const a = cand[i];
        for (let j = i - 1; j >= 0; j--) {
            const b = cand[j];
            if (b.on <= a.on) continue;
            if (a.box[0] > b.box[2] || a.box[2] < b.box[0] || a.box[1] > b.box[3] || a.box[3] < b.box[1]) continue;
            if (maskInter(a, b, G) >= inside * a.on) { par[i] = j; break; } // j azalırken on artar: ilk bulunan en küçük kapsayan
        }
    }
    // büyükten küçüğe: en yakın tutulan ata kapsayıcı değilse nesne parçasıdır, at
    const kept = new Uint8Array(n), anc = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        let p = par[i];
        while (p >= 0 && !kept[p]) p = par[p];
        anc[i] = p;
        kept[i] = p < 0 || cand[p].on >= cut ? 1 : 0;
    }
    const out = [];
    for (let i = 0; i < n; i++) cand[i].level = 0;
    for (let i = n - 1; i >= 0; i--) { // küçükten büyüğe: alt katmanlar önce kesinleşir
        if (!kept[i]) continue;
        const m = cand[i];
        m.parent = anc[i] >= 0 ? cand[anc[i]] : null;
        if (m.parent) m.parent.level = Math.max(m.parent.level || 0, m.level + 1);
        out.push(m);
    }
    return out;
}

/** level'e göre gruplar (maxLevels-1'de kırpılır), boş seviyeler atılır; dizi 0 = en alt seviye */
export function groupLevels(masks, maxLevels = 4) {
    const g = [];
    for (const m of masks) (g[Math.min(maxLevels - 1, m.level)] ||= []).push(m);
    return g.filter(Boolean);
}
