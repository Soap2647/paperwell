// Arka plan kaldırma: görseldeki ana nesneyi ayırır, arka planı şeffaf / düz renk / bulanık yapar.
// Hızlı: U²-Netp (Apache-2.0, ~4.6 MB).
// Hassas, masaüstü GPU (DirectML): BiRefNet (MIT, fp16, ~490 MB, 1024²) doğrudan yüksek kaliteli alfa verir.
// Hassas, tarayıcı / CPU: U²-Netp'nin bulduğu nesne SAM 2 ile keskinleştirilir (+~62 MB).
// (BiRefNet / BEN2 tarayıcıda WASM belleğine sığmıyor, WebGPU'da desteklenmeyen düğümler var.)
import { openModel, isCached, tensor, getBackend } from './inference';
import { isSam2Cached, encodeImage2, decode2, SAM2_BYTES } from './segment2';

const MEAN = [0.485, 0.456, 0.406];

export const BG_MODELS = {
    fast: {
        url: 'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',
        size: 320, bytes: 4.6e6, std: [0.229, 0.224, 0.225],
    },
    // onnx-community/BiRefNet-ONNX (ZhengPeng7/BiRefNet, MIT); yalnız masaüstü GPU yolunda
    birefnet: {
        url: 'https://huggingface.co/onnx-community/BiRefNet-ONNX/resolve/534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67/onnx/model_fp16.onnx',
        size: 1024, bytes: 489.7e6, std: [0.229, 0.224, 0.225], sigmoid: true, exclusive: true,
    },
    // onnx-community/BiRefNet_lite-ONNX (MIT, fp32, 224 MB): Sihirli Katmanlar'da fotoğraftaki belirgin nesne.
    // CPU'da çalışır: 6 GB kartta LayerD ile aynı anda ekran kartı belleğine sığmıyor (taşınca her şey yavaşlıyor)
    birefnetLite: {
        url: 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx',
        size: 1024, bytes: 224e6, std: [0.229, 0.224, 0.225], sigmoid: true, gpu: false,
    },
    // LayerD (CyberAgent, ICCV 2025, Apache-2.0): tasarımın en üst katmanını veren BiRefNet; Sihirli Katmanlar, yalnız GPU.
    // cyberagent/layerd-birefnet ağırlıkları BiRefNet ONNX grafiğine yerleştirilip fp16'ya çevrildi (scripts/layerd_onnx.py).
    layerd: {
        url: 'https://huggingface.co/paperwell/layerd-birefnet-onnx/resolve/main/onnx/model_fp16.onnx',
        size: 1024, bytes: 489.7e6, std: [0.229, 0.224, 0.225], sigmoid: true,
    },
};

const biRefNetHere = async () => (await getBackend()).kind === 'gpu';

/** Hassas mod için indirilecek boyut (bayt) */
export const preciseBytes = async () => ((await biRefNetHere()) ? BG_MODELS.birefnet.bytes : BG_MODELS.fast.bytes + SAM2_BYTES);
export const isPreciseCached = async () => ((await biRefNetHere()) ? isBgModelCached('birefnet') : (await isBgModelCached('fast')) && (await isSam2Cached()));

/**
 * Hassas maske: U²-Netp nesneyi bulur, kutusu SAM 2'ye sorulur, kaba maskeyle en çok örtüşen keskin maske alınır.
 * Sentetik testte (bilinen alfalı top, fotoğraflı zemin) ortalama alfa hatası 13 → 2.8.
 */
export async function predictAlphaPrecise(image, onProgress) {
    if (await biRefNetHere()) return predictAlpha(image, 'birefnet', onProgress);
    const coarse = await predictAlpha(image, 'fast', (p) => onProgress?.(p * 0.07));
    const W = image.width, H = image.height;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < W * H; i++) if (coarse[i] > 128) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return coarse;
    const emb = await encodeImage2(image, (p) => onProgress?.(0.07 + p * 0.93));
    const pad = Math.max(W, H) * 0.01;
    const r = await decode2(emb, { box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] });
    const G = r.size;
    let best = null;
    for (const m of r.masks) {
        const a = new Uint8ClampedArray(W * H);
        let inter = 0, uni = 0;
        for (let y = 0; y < H; y++) {
            const fy = Math.min(G - 1, Math.max(0, ((y + 0.5) / H) * G - 0.5)), iy = fy | 0, jy = Math.min(G - 1, iy + 1), ay = fy - iy;
            for (let x = 0; x < W; x++) {
                const fx = Math.min(G - 1, Math.max(0, ((x + 0.5) / W) * G - 0.5)), ix = fx | 0, jx = Math.min(G - 1, ix + 1), ax = fx - ix;
                const L = m.logits;
                const v = (L[iy * G + ix] * (1 - ax) + L[iy * G + jx] * ax) * (1 - ay) + (L[jy * G + ix] * (1 - ax) + L[jy * G + jx] * ax) * ay;
                const i = y * W + x;
                // düşük olasılıklı kuyruk (çevredeki nesnelerin soluk izleri) tamamen şeffaf
                a[i] = v < -1.2 ? 0 : 255 / (1 + Math.exp(-2 * v));
                const p = a[i] > 128, q = coarse[i] > 128;
                if (p && q) inter++;
                if (p || q) uni++;
            }
        }
        const iou = uni ? inter / uni : 0;
        if (!best || iou > best.iou) best = { iou, a };
    }
    // SAM kaba nesneyi tutturamadıysa (çok farklı bölge) kaba maskeye dön
    return best && best.iou > 0.5 ? best.a : coarse;
}

const sessions = {};

export function isBgModelCached(quality) {
    return isCached([BG_MODELS[quality].url]);
}

export function loadBgModel(quality, onProgress) {
    if (!sessions[quality]) {
        const m = BG_MODELS[quality];
        sessions[quality] = openModel([{ url: m.url, bytes: m.bytes }], onProgress, { exclusive: !!m.exclusive, gpu: m.gpu !== false }).catch((e) => {
            delete sessions[quality];
            throw e;
        });
    }
    return sessions[quality];
}

/**
 * Ön plan alfa maskesini görsel boyutunda döndürür (0-255).
 * @param {HTMLCanvasElement|OffscreenCanvas|ImageBitmap} image
 */
export async function predictAlpha(image, quality = 'fast', onProgress) {
    const m = BG_MODELS[quality];
    const session = await loadBgModel(quality, onProgress);
    const S = m.size, W = image.width, H = image.height;
    // Model girdisi: kare boyuta gerilmiş, ImageNet normalleştirmeli RGB
    const c = new OffscreenCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    const plane = S * S;
    const input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
        for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / m.std[ch];
    }
    const out = await session.run({ [session.inputNames[0]]: tensor('float32', input, [1, 3, S, S]) });
    // Birden çok çıktılı modellerde birleşik maske 'output_image', yoksa ilk çıktı
    const name = session.outputNames.includes('output_image') ? 'output_image' : session.outputNames[0];
    const pred = out[name].data;

    const mask = new Uint8ClampedArray(plane * 4);
    if (m.sigmoid) {
        // BiRefNet: logit çıktı
        for (let i = 0; i < plane; i++) mask[i * 4 + 3] = 255 / (1 + Math.exp(-pred[i]));
    } else {
        // 0-1 aralığına getir (rembg ile aynı: min-max)
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < plane; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
        const span = hi - lo || 1;
        for (let i = 0; i < plane; i++) mask[i * 4 + 3] = ((pred[i] - lo) / span) * 255;
    }
    // Görsel boyutuna yumuşak ölçekle
    const mc = new OffscreenCanvas(S, S);
    mc.getContext('2d').putImageData(new ImageData(mask, S, S), 0, 0);
    const big = new OffscreenCanvas(W, H);
    const bctx = big.getContext('2d');
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(mc, 0, 0, W, H);
    const d = bctx.getImageData(0, 0, W, H).data;
    const alpha = new Uint8ClampedArray(W * H);
    for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3];
    return alpha;
}

/**
 * Ön planı seçilen arka planla birleştirir.
 * @param {{mode:'transparent'|'color'|'blur', color?:string, blur?:number}} bg
 * @returns {OffscreenCanvas}
 */
export function composite(image, alpha, bg) {
    const W = image.width, H = image.height;
    const fg = new OffscreenCanvas(W, H);
    const fctx = fg.getContext('2d');
    fctx.drawImage(image, 0, 0);
    const img = fctx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = (img.data[i * 4 + 3] * alpha[i]) / 255;
    fctx.putImageData(img, 0, 0);
    if (bg.mode === 'transparent') return fg;

    const out = new OffscreenCanvas(W, H);
    const ctx = out.getContext('2d');
    if (bg.mode === 'color') {
        ctx.fillStyle = bg.color || '#ffffff';
        ctx.fillRect(0, 0, W, H);
    } else {
        // Bulanıklık görsel boyutuna orantılı; kenarlar şeffaflaşmasın diye altta keskin kopya, üstte taşırılmış bulanık kopya
        const r = Math.max(1, ((bg.blur ?? 12) / 1000) * Math.max(W, H));
        ctx.drawImage(image, 0, 0);
        ctx.filter = `blur(${r}px)`;
        ctx.drawImage(image, -3 * r, -3 * r, W + 6 * r, H + 6 * r);
        ctx.filter = 'none';
    }
    ctx.drawImage(fg, 0, 0);
    return out;
}
