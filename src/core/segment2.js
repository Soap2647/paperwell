// SAM 2.1 (Meta, Apache-2.0; onnx-community ONNX) ile nesne maskeleri.
// tiny int8 (~62 MB): tek tıklama (Magic Grab) ve tarayıcı/CPU'da Sihirli Katmanlar.
// base-plus fp32 (~327 MB): masaüstü GPU'da illüstrasyon türü afişlerde "her şeyi segmente et" (skorları güvenilir).
import { openModel, isCached, tensor } from './inference';

const VARIANTS = {
    tiny: {
        base: 'https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/',
        files: ['vision_encoder_quantized.onnx', 'vision_encoder_quantized.onnx_data', 'prompt_encoder_mask_decoder_quantized.onnx', 'prompt_encoder_mask_decoder_quantized.onnx_data'],
        sizes: [0.4e6, 52.6e6, 0.3e6, 8.7e6],
    },
    basePlus: {
        base: 'https://huggingface.co/onnx-community/sam2.1-hiera-base-plus-ONNX/resolve/bab18593f44e652f04cf18b60b3690f60e8996b0/onnx/',
        files: ['vision_encoder.onnx', 'vision_encoder.onnx_data', 'prompt_encoder_mask_decoder.onnx', 'prompt_encoder_mask_decoder.onnx_data'],
        sizes: [0.7e6, 305.7e6, 0.2e6, 21e6],
        // kodlayıcı CPU'da ~2.5 sn: ekran kartı belleğini LayerD'ye bırakır (6 GB'ta ikisi birden taşar)
        encoderGpu: false,
    },
};
const urlsOf = (v) => VARIANTS[v].files.map((f) => VARIANTS[v].base + f);
export const SAM2_URLS = urlsOf('tiny');
export const SAM2_BYTES = 62e6;
export const SAM2_LARGE_BYTES = VARIANTS.basePlus.sizes.reduce((a, b) => a + b, 0);
const S = 1024;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

const loading = {};
export const isSam2Cached = (variant = 'tiny') => isCached(urlsOf(variant));

export function loadSam2(onProgress, variant = 'tiny') {
    if (!loading[variant]) {
        loading[variant] = (async () => {
            const urls = urlsOf(variant), sizes = VARIANTS[variant].sizes;
            const f = (i) => ({ url: urls[i], bytes: sizes[i] });
            const total = sizes.reduce((a, b) => a + b, 0);
            const encoder = await openModel([f(0), f(1)], (p) => onProgress?.((p * (sizes[0] + sizes[1])) / total), { gpu: VARIANTS[variant].encoderGpu !== false });
            // çözücü küçük ama DirectML'de çağrı başına ~300 ms; yerelde CPU'da çok daha hızlı
            const decoder = await openModel([f(2), f(3)], (p) => onProgress?.((sizes[0] + sizes[1] + p * (sizes[2] + sizes[3])) / total), { gpu: false });
            return { encoder, decoder };
        })().catch((e) => { delete loading[variant]; throw e; });
    }
    return loading[variant];
}

/** Görseli kodlar (1024×1024'e gerilir). @returns {Promise<object>} */
export async function encodeImage2(canvas, onProgress, variant = 'tiny') {
    const { encoder } = await loadSam2(onProgress, variant);
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
    return { e0: out[keep[0]], e1: out[keep[1]], e2: out[keep[2]], width: canvas.width, height: canvas.height, variant };
}

/**
 * @param {object} emb - encodeImage2 sonucu
 * @param {{points?: {x,y,positive}[], box?: number[]}} prompt - görsel piksel koordinatları; box [x0,y0,x1,y1]
 * @returns {Promise<{masks: {logits: Float32Array, score: number}[], size: number, object: number}>} 256×256 logit maskeler (görsele gerilmiş)
 */
export async function decode2(emb, { points = [], box = null }) {
    const { decoder } = await loadSam2(undefined, emb.variant);
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
