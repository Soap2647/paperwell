// Çıkarım arka ucu: masaüstünde yerel ONNX Runtime (DirectML ile GPU, yoksa çok çekirdekli CPU),
// web'de ya da yerel çalışma zamanı yüklenemezse tarayıcıda onnxruntime-web (WASM/WebGPU).
// Modüller yalnız ön/son işlemi yapar; tensörler düz { type, data, dims } nesneleridir.
import { isDesktop, nativeAiInfo, nativeModelCached, nativeDownload, nativeLoad, nativeRun, nativeFree } from '../platform';
import { fetchModel, isModelCached, getOrt, createSession } from './modelStore';

let backendPromise = null;

/** @returns {Promise<{kind: 'gpu'|'cpu'|'browser', adapter?: string, vramMb?: number, reason?: string}>} */
export function getBackend() {
    if (!backendPromise) {
        backendPromise = (async () => {
            if (!isDesktop) return { kind: 'browser' };
            try {
                const i = await nativeAiInfo();
                if (!i.provider) return { kind: 'browser', reason: i.reason };
                return { kind: i.provider === 'directml' ? 'gpu' : 'cpu', adapter: i.adapter, vramMb: i.vram_mb, reason: i.reason };
            } catch (e) {
                return { kind: 'browser', reason: String(e?.message || e) };
            }
        })();
    }
    return backendPromise;
}

const isNative = async () => (await getBackend()).kind !== 'browser';

export const tensor = (type, data, dims) => ({ type, data, dims });

export async function isCached(urls) {
    return (await isNative()) ? nativeModelCached(urls) : isModelCached(...urls);
}

const baseName = (url) => url.split('/').pop();

// Rust'ta tutulan tensörler JS nesnesi çöpe gidince bırakılır
const freeRegistry = globalThis.FinalizationRegistry ? new globalThis.FinalizationRegistry((ref) => nativeFree([ref]).catch(() => {})) : null;

/**
 * Modeli indirir (önbellekte yoksa) ve oturum açar.
 * @param {{url: string, bytes: number}[]} files - ilk dosya model, diğerleri harici veri (.onnx_data)
 * @param {{webgpu?: boolean, gpu?: boolean, exclusive?: boolean}} opts - webgpu: tarayıcı yolunda WebGPU dene;
 *   gpu: yerelde DirectML kullan; exclusive: büyük model, çalışırken ekran kartı belleğini tek başına kullanır
 * @returns {Promise<{backend: 'gpu'|'cpu'|'browser', inputNames: string[], outputNames: string[],
 *   run: (feeds: object, opts?: {keep?: string[]}) => Promise<object>}>}
 *   keep: bu çıktılar tekrar girdi olarak kullanılacak (yerelde Rust'ta kalır, verisi gelmez)
 */
export async function openModel(files, onProgress, { webgpu = false, gpu = true, exclusive = false } = {}) {
    const total = files.reduce((s, f) => s + f.bytes, 0);
    let done = 0;
    const step = (f) => (p) => onProgress?.(Math.min(0.99, (done + (p || 0) * f.bytes) / total));

    if (await isNative()) {
        for (const f of files) { await nativeDownload(f.url, step(f)); done += f.bytes; }
        const s = await nativeLoad(files.map((f) => f.url), { gpu, exclusive });
        onProgress?.(1);
        return {
            backend: s.provider === 'directml' ? 'gpu' : 'cpu',
            inputNames: s.inputs,
            outputNames: s.outputs,
            run: async (feeds, { keep = [] } = {}) => {
                const out = await nativeRun(s.session, feeds, keep);
                for (const k of keep) if (out[k]?.ref) freeRegistry?.register(out[k], out[k].ref);
                return out;
            },
        };
    }

    const datas = [];
    for (const f of files) { datas.push(await fetchModel(f.url, step(f), f.bytes)); done += f.bytes; }
    onProgress?.(1);
    const ort = await getOrt();
    const externalData = files.slice(1).map((f, i) => ({ path: baseName(f.url), data: datas[i + 1] }));
    const session = externalData.length
        ? await ort.InferenceSession.create(datas[0], { executionProviders: ['wasm'], externalData })
        : await createSession(datas[0], { webgpu });
    return {
        backend: 'browser',
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        run: async (feeds, { keep = [] } = {}) => {
            const f = {};
            // proxy worker tamponları devreder: tekrar kullanılacak tensörlerin kopyası gönderilir
            for (const [k, t] of Object.entries(feeds)) f[k] = new ort.Tensor(t.type, t.resident ? t.data.slice() : t.data, t.dims);
            const out = await session.run(f);
            const res = {};
            for (const k of session.outputNames) res[k] = { type: out[k].type, data: out[k].data, dims: out[k].dims, resident: keep.includes(k) };
            return res;
        },
    };
}
