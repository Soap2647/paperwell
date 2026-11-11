// Yapay zekâ modelleri için ortak indirme / önbellek / oturum yardımcıları.
// Modeller ilk kullanımda indirilir ve tarayıcının Cache Storage'ında saklanır; görseller cihazdan çıkmaz.

const CACHE_NAME = 'paperwell-models-v1';

/** Modeli önbellekten ya da ağdan (ilerlemeyle) getirir */
export async function fetchModel(url, onProgress, estimatedSize = 20e6) {
    let cache = null;
    try { cache = await caches.open(CACHE_NAME); } catch { /* önbellek yok */ }
    const cached = cache && (await cache.match(url));
    if (cached) {
        onProgress?.(1);
        return new Uint8Array(await cached.arrayBuffer());
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Model indirilemedi (${res.status})`);
    const total = Number(res.headers.get('content-length')) || estimatedSize;
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

export async function isModelCached(...urls) {
    try {
        const cache = await caches.open(CACHE_NAME);
        for (const u of urls) if (!(await cache.match(u))) return false;
        return true;
    } catch { return false; }
}

let ortPromise = null;
export function getOrt() {
    if (!ortPromise) {
        ortPromise = import('onnxruntime-web').then((ort) => {
            ort.env.wasm.proxy = true; // arayüz donmasın diye worker'da çalış
            return ort;
        });
    }
    return ortPromise;
}

/** ONNX oturumu açar; WebGPU varsa (ve istenirse) onu dener, olmazsa WASM'a düşer */
export async function createSession(model, { webgpu = true } = {}) {
    const ort = await getOrt();
    const providers = webgpu && typeof navigator !== 'undefined' && navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    try {
        return await ort.InferenceSession.create(model, { executionProviders: providers });
    } catch (e) {
        if (providers.length === 1) throw e;
        return await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    }
}
