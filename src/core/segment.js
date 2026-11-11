// Nesne seçimi: SlimSAM (Segment Anything'in sıkıştırılmış hali, Apache-2.0) ile tıklanan nesnenin maskesi.
// Kodlayıcı görseli bir kez işler (~1-3 sn), kod çözücü her tıklamada anında maske üretir.
import { fetchModel, isModelCached, getOrt, createSession } from './modelStore';

const BASE = 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/';
export const SAM_URLS = [`${BASE}vision_encoder_quantized.onnx`, `${BASE}prompt_encoder_mask_decoder_quantized.onnx`];
export const SAM_SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let samPromise = null;

export function isSamCached() {
    return isModelCached(...SAM_URLS);
}

export function loadSam(onProgress) {
    if (!samPromise) {
        samPromise = (async () => {
            const ort = await getOrt();
            // ~9 MB + ~5 MB; ilerleme iki dosyaya orantılı paylaştırılır
            const enc = await fetchModel(SAM_URLS[0], (p) => onProgress?.(p * 0.64), 8.9e6);
            const dec = await fetchModel(SAM_URLS[1], (p) => onProgress?.(0.64 + p * 0.36), 4.9e6);
            // Nicemlenmiş (int8) modeller CPU için tasarlandı: WASM yeterince hızlı
            const encoder = await createSession(enc, { webgpu: false });
            const decoder = await createSession(dec, { webgpu: false });
            return { ort, encoder, decoder };
        })().catch((e) => {
            samPromise = null;
            throw e;
        });
    }
    return samPromise;
}

/**
 * Görseli kodlar. Uzun kenar 1024 olacak şekilde ölçeklenmiş bir tuval bekler (daha küçükse de çalışır).
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 */
export async function encodeImage(canvas, onProgress) {
    const { ort, encoder } = await loadSam(onProgress);
    const k = SAM_SIZE / Math.max(canvas.width, canvas.height);
    const w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
    const tmp = new OffscreenCanvas(w, h);
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(canvas, 0, 0, w, h);
    const px = tctx.getImageData(0, 0, w, h).data;
    // Normalleştir, sağ/alt kenarı sıfırla doldur (SamProcessor ile aynı)
    const plane = SAM_SIZE * SAM_SIZE;
    const input = new Float32Array(plane * 3);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, o = y * SAM_SIZE + x;
            for (let c = 0; c < 3; c++) input[c * plane + o] = (px[i + c] / 255 - MEAN[c]) / STD[c];
        }
    }
    const out = await encoder.run({ pixel_values: new ort.Tensor('float32', input, [1, 3, SAM_SIZE, SAM_SIZE]) });
    // Ham diziler saklanır: proxy worker tensör tamponlarını devrettiği için her çözümde kopyası gönderilir
    const e = out.image_embeddings, pe = out.image_positional_embeddings;
    return { embeddings: { data: e.data, dims: e.dims }, positional: { data: pe.data, dims: pe.dims }, w, h, scale: w / canvas.width };
}

/**
 * Noktalardan maske üretir.
 * @param {object} emb - encodeImage sonucu
 * @param {{x:number,y:number,positive:boolean}[]} points - kodlanan görselin (1024 ölçekli) piksel koordinatları
 * @returns {Promise<{logits: Float32Array, w:number, h:number, score:number}>} logits: w×h, >0 = nesne
 */
export async function decodeMask(emb, points) {
    const { ort, decoder } = await loadSam();
    const n = points.length;
    const coords = new Float32Array(n * 2);
    const labels = new BigInt64Array(n);
    points.forEach((p, i) => { coords[i * 2] = p.x; coords[i * 2 + 1] = p.y; labels[i] = p.positive ? 1n : 0n; });
    const out = await decoder.run({
        input_points: new ort.Tensor('float32', coords, [1, 1, n, 2]),
        input_labels: new ort.Tensor('int64', labels, [1, 1, n]),
        image_embeddings: new ort.Tensor('float32', emb.embeddings.data.slice(), emb.embeddings.dims),
        image_positional_embeddings: new ort.Tensor('float32', emb.positional.data.slice(), emb.positional.dims),
    });
    const scores = out.iou_scores.data;
    const [, , , mh, mw] = out.pred_masks.dims;
    // SAM 3 aday verir (parça → bütün). Nesneyi bütün olarak almak için skoru en iyiye yakın olan en büyük maske seçilir
    let top = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[top]) top = i;
    let best = top, bestArea = -1;
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] < Math.max(0.5, scores[top] - 0.25)) continue;
        let area = 0;
        const off = i * mh * mw;
        for (let j = 0; j < mh * mw; j++) if (out.pred_masks.data[off + j] > 0) area++;
        if (area > bestArea) { bestArea = area; best = i; }
    }
    const low = out.pred_masks.data.subarray(best * mh * mw, (best + 1) * mh * mw);
    // Düşük çözünürlüklü maske 1024×1024 dolgulu girdiye karşılık gelir: kırpılmış w×h alanına çift doğrusal büyüt
    const { w, h } = emb;
    const logits = new Float32Array(w * h);
    const k = mw / SAM_SIZE;
    for (let y = 0; y < h; y++) {
        const sy = Math.min(mh - 1, Math.max(0, (y + 0.5) * k - 0.5));
        const y0 = Math.floor(sy), y1 = Math.min(mh - 1, y0 + 1), fy = sy - y0;
        for (let x = 0; x < w; x++) {
            const sx = Math.min(mw - 1, Math.max(0, (x + 0.5) * k - 0.5));
            const x0 = Math.floor(sx), x1 = Math.min(mw - 1, x0 + 1), fx = sx - x0;
            const a = low[y0 * mw + x0] * (1 - fx) + low[y0 * mw + x1] * fx;
            const b = low[y1 * mw + x0] * (1 - fx) + low[y1 * mw + x1] * fx;
            logits[y * w + x] = a * (1 - fy) + b * fy;
        }
    }
    return { logits, w, h, score: scores[best] };
}

/** Maske logitlerinden (w×h) çift doğrusal örnek */
export function sampleLogit(mask, x, y) {
    const { logits, w, h } = mask;
    const sx = Math.min(w - 1, Math.max(0, x - 0.5)), sy = Math.min(h - 1, Math.max(0, y - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    const a = logits[y0 * w + x0] * (1 - fx) + logits[y0 * w + x1] * fx;
    const b = logits[y1 * w + x0] * (1 - fx) + logits[y1 * w + x1] * fx;
    return a * (1 - fy) + b * fy;
}
