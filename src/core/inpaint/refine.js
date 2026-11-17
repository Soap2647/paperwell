// Büyük dolguların bulanık görünmesine karşı iki iyileştirme:
//  1) sharpenFill: onarım modelleri 512 px'te çalışır; büyük kesit küçültülüp geri büyütülünce detay kaybolur.
//     Dolgu, model çözünürlüğünden yapay zekâ büyütmesiyle (Real-ESRGAN) geri getirilir.
//  2) matchGrain: dolgu çevresinden pürüzsüz kalırsa (fotoğraf, doku) çevredeki ince doku (gren) kadar gürültü eklenir.

/** 3×3 ortalamadan sapma: pikselin ince doku bileşeni */
function residual(img, w, h, x, y, c) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = x + dx, qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h) { s += img[(qy * w + qx) * 4 + c]; n++; }
    }
    return img[(y * w + x) * 4 + c] - s / n;
}

/**
 * Dolguya çevresindeki kadar ince doku ekler (deterministik). Çevre zaten düzse (tasarım, düz renk) dokunmaz.
 * @param {Uint8ClampedArray} img - w×h RGBA, yerinde
 * @param {Uint8Array} m - 1 = doldurulmuş piksel
 * @returns {number} eklenen gürültünün standart sapması (0: eklenmedi)
 */
export function matchGrain(img, m, w, h, ring = 8) {
    // çevre halkası: maskeye en çok `ring` piksel uzaklıktaki maske dışı pikseller
    const near = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        for (let dy = -ring; dy <= ring; dy += 2) for (let dx = -ring; dx <= ring; dx += 2) {
            const qx = x + dx, qy = y + dy;
            if (qx >= 0 && qy >= 0 && qx < w && qy < h && !m[qy * w + qx]) near[qy * w + qx] = 1;
        }
    }
    const stat = (sel) => {
        let s = 0, n = 0;
        for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
            if (!sel(y * w + x)) continue;
            for (let c = 0; c < 3; c++) { const r = residual(img, w, h, x, y, c); s += r * r; n++; }
        }
        return n > 30 ? Math.sqrt(s / n) : 0;
    };
    const outside = stat((i) => near[i]), inside = stat((i) => m[i]);
    if (outside < 2.5 || inside >= outside * 0.7) return 0;
    const sd = Math.sqrt(outside * outside - inside * inside) * 0.9;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    for (let i = 0; i < w * h; i++) {
        if (!m[i]) continue;
        const g = gauss() * sd; // parlaklık greni: kanallar birlikte (renkli leke olmasın)
        for (let c = 0; c < 3; c++) img[i * 4 + c] = img[i * 4 + c] + g + gauss() * sd * 0.15;
    }
    return sd;
}

/**
 * Büyük kesitte dolguyu model çözünürlüğünden yapay zekâ büyütmesiyle keskinleştirir (büyütme modeli önbellekteyse).
 * @returns {Promise<boolean>} uygulandıysa true
 */
export async function sharpenFill(img, m, w, h, modelSize = 512) {
    if (Math.max(w, h) < modelSize * 1.25 || typeof document === 'undefined') return false;
    const { isUpscalerCached, upscaleCanvas } = await import('../upscale');
    if (!(await isUpscalerCached())) return false;
    const k = modelSize / Math.max(w, h);
    const sw = Math.round(w * k), sh = Math.round(h * k);
    const full = document.createElement('canvas');
    full.width = w; full.height = h;
    full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img), w, h), 0, 0);
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(full, 0, 0, sw, sh);
    const big = await upscaleCanvas(small, 4);
    const back = document.createElement('canvas');
    back.width = w; back.height = h;
    const bctx = back.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(big, 0, 0, w, h);
    const d = bctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) if (m[i]) { img[i * 4] = d[i * 4]; img[i * 4 + 1] = d[i * 4 + 1]; img[i * 4 + 2] = d[i * 4 + 2]; }
    return true;
}
