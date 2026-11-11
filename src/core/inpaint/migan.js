// MI-GAN (Picsart AI Research) ile tarayıcıda yapay zekâ destekli onarma.
// Model ilk kullanımda indirilir (~28 MB) ve tarayıcı önbelleğinde saklanır. Görseller cihazdan çıkmaz.

export const MIGAN_URL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const CACHE_NAME = 'paperwell-models-v1';
const SIZE = 512;

let sessionPromise = null;

async function fetchWithProgress(url, onProgress) {
    let cache = null;
    try { cache = await caches.open(CACHE_NAME); } catch { /* önbellek yok */ }
    const cached = cache && (await cache.match(url));
    if (cached) {
        onProgress?.(1);
        return new Uint8Array(await cached.arrayBuffer());
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Model indirilemedi (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 28e6;
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress?.(Math.min(0.99, loaded / total));
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    try { await cache?.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* kota */ }
    onProgress?.(1);
    return out;
}

export async function isMiganCached() {
    try {
        const cache = await caches.open(CACHE_NAME);
        return !!(await cache.match(MIGAN_URL));
    } catch { return false; }
}

export function loadMigan(onProgress) {
    if (!sessionPromise) {
        sessionPromise = (async () => {
            const ort = await import('onnxruntime-web');
            ort.env.wasm.proxy = true; // arayüz donmasın diye worker'da çalış
            const model = await fetchWithProgress(MIGAN_URL, onProgress);
            const providers = typeof navigator !== 'undefined' && navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
            let session;
            try {
                session = await ort.InferenceSession.create(model, { executionProviders: providers });
            } catch {
                session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
            }
            return { ort, session };
        })().catch((e) => {
            sessionPromise = null;
            throw e;
        });
    }
    return sessionPromise;
}

function resizeTo(rgba, w, h, tw, th) {
    const src = new OffscreenCanvas(w, h);
    src.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    const dst = new OffscreenCanvas(tw, th);
    const ctx = dst.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return ctx.getImageData(0, 0, tw, th).data;
}

/**
 * @param {Uint8ClampedArray} rgba - yerinde güncellenir (yalnız maskeli pikseller)
 * @param {Uint8Array} mask - 1 = onarılacak
 */
export async function inpaintMigan(rgba, mask, w, h, onProgress) {
    const { ort, session } = await loadMigan(onProgress);

    // Görsel ve maskeyi 512x512'ye ölçekle
    const img = resizeTo(rgba, w, h, SIZE, SIZE);
    const maskRgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = mask[i] ? 255 : 0;
        maskRgba[i * 4] = v; maskRgba[i * 4 + 3] = 255;
    }
    const m = resizeTo(maskRgba, w, h, SIZE, SIZE);

    const plane = SIZE * SIZE;
    const imgData = new Uint8Array(plane * 3);
    const maskData = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
        imgData[i] = img[i * 4];
        imgData[plane + i] = img[i * 4 + 1];
        imgData[2 * plane + i] = img[i * 4 + 2];
        maskData[i] = m[i * 4] > 20 ? 0 : 255; // model: 255 = koru, 0 = onar
    }

    const feeds = {
        [session.inputNames[0]]: new ort.Tensor('uint8', imgData, [1, 3, SIZE, SIZE]),
        [session.inputNames[1]]: new ort.Tensor('uint8', maskData, [1, 1, SIZE, SIZE]),
    };
    const results = await session.run(feeds);
    const out = Object.values(results)[0];
    const data = out.data;
    const [, , oh, ow] = out.dims.length === 4 ? out.dims : [1, 3, SIZE, SIZE];

    // Çıktıyı RGBA'ya çevirip özgün boyuta geri ölçekle
    const outRgba = new Uint8ClampedArray(ow * oh * 4);
    const op = ow * oh;
    // Çıktı uint8 (0-255) ya da float olabilir; float ise aralığı örnekten belirle
    let k = 1;
    if (!(data instanceof Uint8Array)) {
        let max = 0;
        for (let i = 0; i < data.length; i += 97) max = Math.max(max, data[i]);
        if (max <= 1.5) k = 255;
    }
    for (let i = 0; i < op; i++) {
        outRgba[i * 4] = data[i] * k;
        outRgba[i * 4 + 1] = data[op + i] * k;
        outRgba[i * 4 + 2] = data[2 * op + i] * k;
        outRgba[i * 4 + 3] = 255;
    }
    const back = resizeTo(outRgba, ow, oh, w, h);
    for (let i = 0; i < w * h; i++) {
        if (!mask[i]) continue;
        rgba[i * 4] = back[i * 4];
        rgba[i * 4 + 1] = back[i * 4 + 1];
        rgba[i * 4 + 2] = back[i * 4 + 2];
        rgba[i * 4 + 3] = 255;
    }
}
