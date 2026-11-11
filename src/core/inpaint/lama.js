// LaMa (Samsung AI, Apache-2.0; OpenCV Zoo ONNX) ile büyük alan onarımı. ~93 MB, bir kez iner.
import { openModel, isCached, tensor } from '../inference';

export const LAMA_URL = 'https://huggingface.co/opencv/inpainting_lama/resolve/aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f/inpainting_lama_2025jan.onnx';
export const LAMA_BYTES = 92.6e6;
const SIZE = 512;

let loading = null;
export const isLamaCached = () => isCached([LAMA_URL]);

export function loadLama(onProgress) {
    if (!loading) {
        loading = openModel([{ url: LAMA_URL, bytes: LAMA_BYTES }], onProgress).catch((e) => { loading = null; throw e; });
    }
    return loading;
}

function resize(rgba, w, h, tw, th) {
    const src = new OffscreenCanvas(w, h);
    src.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    const dst = new OffscreenCanvas(tw, th);
    const ctx = dst.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return ctx.getImageData(0, 0, tw, th).data;
}

/**
 * Bölgeyi 512×512'de onarır; yalnız maskeli pikseller yerinde güncellenir.
 * @param {Uint8ClampedArray} rgba
 * @param {Uint8Array} mask - 1 = onarılacak
 */
export async function inpaintLama(rgba, mask, w, h, onProgress) {
    const session = await loadLama(onProgress);
    const img = resize(rgba, w, h, SIZE, SIZE);
    const mr = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { mr[i * 4] = mask[i] ? 255 : 0; mr[i * 4 + 3] = 255; }
    const m = resize(mr, w, h, SIZE, SIZE);
    const plane = SIZE * SIZE;
    const image = new Float32Array(plane * 3), maskT = new Float32Array(plane);
    for (let i = 0; i < plane; i++) {
        const hole = m[i * 4] > 10 ? 1 : 0;
        maskT[i] = hole;
        for (let c = 0; c < 3; c++) image[c * plane + i] = hole ? 0 : img[i * 4 + c] / 255;
    }
    const out = await session.run({
        image: tensor('float32', image, [1, 3, SIZE, SIZE]),
        mask: tensor('float32', maskT, [1, 1, SIZE, SIZE]),
    });
    const d = out.output.data;
    // Çıktı aralığı 0-1 ya da 0-255 olabilir
    let max = 0;
    for (let i = 0; i < d.length; i += 101) max = Math.max(max, d[i]);
    const k = max <= 1.5 ? 255 : 1;
    const res = new Uint8ClampedArray(plane * 4);
    for (let i = 0; i < plane; i++) {
        res[i * 4] = d[i] * k; res[i * 4 + 1] = d[plane + i] * k; res[i * 4 + 2] = d[2 * plane + i] * k; res[i * 4 + 3] = 255;
    }
    const back = resize(res, SIZE, SIZE, w, h);
    for (let i = 0; i < w * h; i++) {
        if (!mask[i]) continue;
        rgba[i * 4] = back[i * 4]; rgba[i * 4 + 1] = back[i * 4 + 1]; rgba[i * 4 + 2] = back[i * 4 + 2]; rgba[i * 4 + 3] = 255;
    }
}
