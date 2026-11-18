// Yapay zekâyla büyütme: Real-ESRGAN realesr-general-x4v3 (SRVGGNetCompact, BSD-3, ~5 MB, xinntao'nun resmi
// ağırlıklarından ONNX). Görsel parçalara bölünür (bellek sınırlı kalsın), her parça 4× büyütülür, kenarları
// örtüşerek birleştirilir; istenen ölçeğe yüksek kaliteyle küçültülür. Masaüstünde GPU'da (DirectML) çalışır.
import { openModel, isCached, tensor } from './inference';

export const SR_URL = 'https://huggingface.co/CoderViking/realesr-general-x4v3-onnx/resolve/c6a971706797c7502945a2b4c4274fce4900d4ab/realesr-general-x4v3.onnx';
const TILE = 256, PAD = 12;

let sessionPromise = null;
export const isUpscalerCached = () => isCached([SR_URL]);
export function loadUpscaler(onProgress) {
    if (!sessionPromise) {
        sessionPromise = openModel([{ url: SR_URL, bytes: 4.9e6 }], onProgress, { webgpu: true }).catch((e) => { sessionPromise = null; throw e; });
    }
    return sessionPromise;
}

/**
 * @param {HTMLCanvasElement|OffscreenCanvas} src
 * @param {number} scale - 2 ya da 4 (model 4× üretir; 2× için yüksek kaliteyle yarıya indirilir)
 * @param {(p:number)=>void} [onProgress] - 0-1
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function upscaleCanvas(src, scale = 2, onProgress) {
    const session = await loadUpscaler();
    const W = src.width, H = src.height;
    const rgba = src.getContext('2d').getImageData(0, 0, W, H).data;
    const big = document.createElement('canvas');
    big.width = W * 4; big.height = H * 4;
    const bctx = big.getContext('2d');
    const tiles = [];
    for (let y = 0; y < H; y += TILE) for (let x = 0; x < W; x += TILE) tiles.push([x, y]);
    for (const [n, [tx, ty]] of tiles.entries()) {
        // örtüşmeli parça: kenarda model bağlamı görsün, birleşim izi kalmasın
        const x0 = Math.max(0, tx - PAD), y0 = Math.max(0, ty - PAD);
        const x1 = Math.min(W, tx + TILE + PAD), y1 = Math.min(H, ty + TILE + PAD);
        const w = x1 - x0, h = y1 - y0, plane = w * h;
        const input = new Float32Array(plane * 3);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const s = ((y0 + y) * W + x0 + x) * 4, d = y * w + x;
            input[d] = rgba[s] / 255; input[plane + d] = rgba[s + 1] / 255; input[2 * plane + d] = rgba[s + 2] / 255;
        }
        const out = Object.values(await session.run({ [session.inputNames[0]]: tensor('float32', input, [1, 3, h, w]) }))[0];
        const ow = w * 4, oh = h * 4, op = ow * oh, o = out.data;
        const img = new ImageData(ow, oh);
        for (let i = 0; i < op; i++) {
            img.data[i * 4] = o[i] * 255; img.data[i * 4 + 1] = o[op + i] * 255; img.data[i * 4 + 2] = o[2 * op + i] * 255; img.data[i * 4 + 3] = 255;
        }
        // yalnız parçanın kendi alanı (örtüşme payı hariç) yazılır
        const cw = Math.min(TILE, W - tx), ch = Math.min(TILE, H - ty);
        bctx.putImageData(img, x0 * 4, y0 * 4, (tx - x0) * 4, (ty - y0) * 4, cw * 4, ch * 4);
        onProgress?.((n + 1) / tiles.length);
    }
    // saydamlık modelden geçmez: kaynağın alfa kanalı büyütülüp geri konur
    let hasAlpha = false;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) { hasAlpha = true; break; }
    if (scale === 4 && !hasAlpha) return big;
    const out = document.createElement('canvas');
    out.width = W * scale; out.height = H * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(big, 0, 0, out.width, out.height);
    big.width = big.height = 0;
    if (hasAlpha) {
        const a = document.createElement('canvas');
        a.width = out.width; a.height = out.height;
        const actx = a.getContext('2d');
        actx.imageSmoothingQuality = 'high';
        actx.drawImage(src, 0, 0, a.width, a.height);
        octx.globalCompositeOperation = 'destination-in';
        octx.drawImage(a, 0, 0);
        octx.globalCompositeOperation = 'source-over';
    }
    return out;
}
