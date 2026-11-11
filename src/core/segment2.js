// SAM 2.1 tiny (Meta, Apache-2.0; onnx-community int8) ile nesne maskeleri.
// Tek tıklama (Magic Grab) ve "her şeyi segmente et" (Sihirli Katmanlar) için. ~62 MB, bir kez iner.
import { openModel, isCached, tensor } from './inference';

const BASE = 'https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/';
const FILES = {
    enc: 'vision_encoder_quantized.onnx', encData: 'vision_encoder_quantized.onnx_data',
    dec: 'prompt_encoder_mask_decoder_quantized.onnx', decData: 'prompt_encoder_mask_decoder_quantized.onnx_data',
};
export const SAM2_URLS = Object.values(FILES).map((f) => BASE + f);
export const SAM2_BYTES = 62e6;
const S = 1024;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let loading = null;
export const isSam2Cached = () => isCached(SAM2_URLS);

export function loadSam2(onProgress) {
    if (!loading) {
        loading = (async () => {
            const sizes = [0.4e6, 52.6e6, 0.3e6, 8.7e6];
            const f = (i) => ({ url: SAM2_URLS[i], bytes: sizes[i] });
            const total = SAM2_BYTES;
            const encoder = await openModel([f(0), f(1)], (p) => onProgress?.((p * (sizes[0] + sizes[1])) / total));
            // int8 çözücü küçük ama DirectML'de çağrı başına ~300 ms; yerelde CPU'da çok daha hızlı
            const decoder = await openModel([f(2), f(3)], (p) => onProgress?.((sizes[0] + sizes[1] + p * (sizes[2] + sizes[3])) / total), { gpu: false });
            return { encoder, decoder };
        })().catch((e) => { loading = null; throw e; });
    }
    return loading;
}

/** Görseli kodlar (1024×1024'e gerilir). @returns {Promise<object>} */
export async function encodeImage2(canvas, onProgress) {
    const { encoder } = await loadSam2(onProgress);
    const c = new OffscreenCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    const plane = S * S, input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    // gömmeler tekrar tekrar çözücüye girer: yerelde Rust'ta kalır, tarayıcıda her çözümde kopyası gider
    const keep = ['image_embeddings.0', 'image_embeddings.1', 'image_embeddings.2'];
    const out = await encoder.run({ pixel_values: tensor('float32', input, [1, 3, S, S]) }, { keep });
    return { e0: out[keep[0]], e1: out[keep[1]], e2: out[keep[2]], width: canvas.width, height: canvas.height };
}

/**
 * @param {object} emb - encodeImage2 sonucu
 * @param {{points?: {x,y,positive}[], box?: number[]}} prompt - görsel piksel koordinatları; box [x0,y0,x1,y1]
 * @returns {Promise<{masks: {logits: Float32Array, score: number}[], size: number, object: number}>} 256×256 logit maskeler (görsele gerilmiş)
 */
export async function decode2(emb, { points = [], box = null }) {
    const { decoder } = await loadSam2();
    const kx = S / emb.width, ky = S / emb.height;
    const n = Math.max(1, points.length);
    const coords = new Float32Array(n * 2), labels = new BigInt64Array(n);
    if (points.length) points.forEach((p, i) => { coords[i * 2] = p.x * kx; coords[i * 2 + 1] = p.y * ky; labels[i] = p.positive ? 1n : 0n; });
    else labels[0] = -1n; // yalnız kutu
    const feeds = {
        input_points: tensor('float32', coords, [1, 1, n, 2]),
        input_labels: tensor('int64', labels, [1, 1, n]),
        input_boxes: box ? tensor('float32', new Float32Array([box[0] * kx, box[1] * ky, box[2] * kx, box[3] * ky]), [1, 1, 4]) : tensor('float32', new Float32Array(0), [1, 0, 4]),
        'image_embeddings.0': emb.e0, 'image_embeddings.1': emb.e1, 'image_embeddings.2': emb.e2,
    };
    const out = await decoder.run(feeds);
    const dims = out.pred_masks.dims, M = dims[2], H = dims[3], W = dims[4];
    const masks = [];
    for (let i = 0; i < M; i++) masks.push({ logits: out.pred_masks.data.slice(i * H * W, (i + 1) * H * W), score: out.iou_scores.data[i] });
    return { masks, size: W, object: out.object_score_logits.data[0] };
}
