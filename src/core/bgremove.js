// Arka plan kaldırma: görseldeki ana nesneyi ayırır, arka planı şeffaf / düz renk / bulanık yapar.
// Hızlı: U²-Netp (Apache-2.0, ~4.6 MB). Yüksek kalite: IS-Net / DIS (Apache-2.0, ~178 MB).
import { fetchModel, isModelCached, getOrt, createSession } from './modelStore';

const MEAN = [0.485, 0.456, 0.406];

export const BG_MODELS = {
    fast: {
        url: 'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',
        size: 320, bytes: 4.6e6, std: [0.229, 0.224, 0.225],
    },
    quality: {
        url: 'https://huggingface.co/BritishWerewolf/IS-Net/resolve/9783722d9f964c0286a411e7e8e6fede947d5a53/onnx/model.onnx',
        size: 1024, bytes: 178.6e6, std: [1, 1, 1],
    },
};

const sessions = {};

export function isBgModelCached(quality) {
    return isModelCached(BG_MODELS[quality].url);
}

export function loadBgModel(quality, onProgress) {
    if (!sessions[quality]) {
        const m = BG_MODELS[quality];
        sessions[quality] = (async () => {
            const ort = await getOrt();
            const model = await fetchModel(m.url, onProgress, m.bytes);
            return { ort, session: await createSession(model, { webgpu: false }) };
        })().catch((e) => {
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
    const { ort, session } = await loadBgModel(quality, onProgress);
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
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
    // Birden çok çıktılı modellerde birleşik maske 'output_image', yoksa ilk çıktı
    const name = session.outputNames.includes('output_image') ? 'output_image' : session.outputNames[0];
    const pred = out[name].data;

    // 0-1 aralığına getir (rembg ile aynı: min-max)
    const mask = new Uint8ClampedArray(plane * 4);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < plane; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
    const span = hi - lo || 1;
    for (let i = 0; i < plane; i++) mask[i * 4 + 3] = ((pred[i] - lo) / span) * 255;
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
