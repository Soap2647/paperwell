// Platform katmanı: masaüstünde (Tauri) yerel dosya diyalogları, web'de tarayıcı indirmesi.
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let mods = null;
async function tauri() {
    if (!mods) {
        const [core, dialog, event, win] = await Promise.all([
            import('@tauri-apps/api/core'),
            import('@tauri-apps/plugin-dialog'),
            import('@tauri-apps/api/event'),
            import('@tauri-apps/api/window'),
        ]);
        mods = { core, dialog, event, win };
    }
    return mods;
}

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', zip: 'application/zip', paperwell: 'application/x-paperwell', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const baseOf = (path) => path.split(/[\\/]/).pop();

export async function pathToFile(path) {
    const { core } = await tauri();
    const buf = await core.invoke('read_file', { path });
    const file = new File([buf], baseOf(path), { type: MIME[extOf(path)] || 'application/octet-stream' });
    file.path = path; // kaydetmede aynı yere yazabilmek için
    return file;
}

/** Yerel "Aç" diyaloğu. Web'de null döner (çağıran <input type=file> kullanır). */
export async function pickFiles({ multiple = false, pdfOnly = false } = {}) {
    if (!isDesktop) return null;
    const { dialog } = await tauri();
    const filters = pdfOnly
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : [{ name: 'PDF / Görsel / Proje', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'paperwell'] }];
    const res = await dialog.open({ multiple, filters });
    if (!res) return [];
    const paths = Array.isArray(res) ? res : [res];
    return Promise.all(paths.map(pathToFile));
}

function blobToBytes(data) {
    return data instanceof Blob ? data.arrayBuffer().then((b) => new Uint8Array(b)) : Promise.resolve(data);
}

/**
 * Dosyayı kaydeder. Masaüstünde "Farklı kaydet" diyaloğu (path verilirse doğrudan oraya),
 * web'de indirme. Kaydedilen yolu (masaüstü) ya da true döner; vazgeçilirse null.
 */
export async function saveFile(data, suggestedName, { path } = {}) {
    if (!isDesktop) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[extOf(suggestedName)] || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return true;
    }
    const { core, dialog } = await tauri();
    let target = path;
    if (!target) {
        const ext = extOf(suggestedName);
        target = await dialog.save({ defaultPath: suggestedName, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
        if (!target) return null;
    }
    const bytes = await blobToBytes(data);
    await core.invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(target) } });
    return target;
}

/** Klasör seç (masaüstü). @returns {Promise<string|null>} */
export async function pickFolder() {
    if (!isDesktop) return null;
    const { dialog } = await tauri();
    return (await dialog.open({ directory: true })) || null;
}

/** Diskteki metin dosyası (yoksa null) */
export async function readTextFile(path) {
    const { core } = await tauri();
    try { return new TextDecoder().decode(new Uint8Array(await core.invoke('read_file', { path }))); } catch { return null; }
}

export async function writeTextFile(path, text) {
    const { core } = await tauri();
    await core.invoke('write_file', new TextEncoder().encode(text), { headers: { 'x-path': encodeURIComponent(path) } });
}

/** Uygulama "Birlikte aç" ile başlatıldıysa gelen dosyalar */
export async function takeOpenedFiles() {
    if (!isDesktop) return [];
    const { core } = await tauri();
    const paths = await core.invoke('take_opened_files');
    return Promise.all(paths.map(pathToFile));
}

/** Uygulama açıkken başka bir dosyaya çift tıklanınca */
export async function onOpenFiles(cb) {
    if (!isDesktop) return () => {};
    const { event } = await tauri();
    return event.listen('open-files', async (e) => cb(await Promise.all(e.payload.map(pathToFile))));
}

export async function setWindowTitle(title) {
    document.title = title;
    if (!isDesktop) return;
    const { win } = await tauri();
    win.getCurrentWindow().setTitle(title).catch(() => {});
}

export async function inkwellAvailable() {
    if (!isDesktop) return false;
    const { core } = await tauri();
    return core.invoke('inkwell_available');
}

export async function openInInkwell(bytes, name) {
    const { core } = await tauri();
    return core.invoke('open_in_inkwell', bytes, { headers: { 'x-name': encodeURIComponent(name) } });
}

// ─── Yerel yapay zekâ (ONNX Runtime + DirectML, Rust tarafı) ────────────────
// Tensörler ham bayt olarak gider: [u32 başlık uzunluğu][başlık JSON][dolgu][8 bayt hizalı veriler]

const ARRAYS = { float32: Float32Array, uint8: Uint8Array, int8: Int8Array, int32: Int32Array, int64: BigInt64Array, bool: Uint8Array };

function packTensors(session, feeds, keep) {
    const tensors = [], parts = [];
    let off = 0;
    for (const [name, t] of Object.entries(feeds)) {
        if (t.ref) { tensors.push({ name, type: t.type, dims: t.dims, ref: t.ref }); continue; }
        const bytes = new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength);
        tensors.push({ name, type: t.type, dims: Array.from(t.dims), offset: off, length: bytes.length });
        parts.push([off, bytes]);
        off = (off + bytes.length + 7) & ~7;
    }
    const head = new TextEncoder().encode(JSON.stringify({ session, tensors, keep }));
    const start = (4 + head.length + 7) & ~7;
    const buf = new Uint8Array(start + off);
    new DataView(buf.buffer).setUint32(0, head.length, true);
    buf.set(head, 4);
    for (const [o, b] of parts) buf.set(b, start + o);
    return buf;
}

function unpackTensors(raw) {
    const buf = raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const n = new DataView(buf).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
    const start = (4 + n + 7) & ~7;
    const out = {};
    for (const t of head.tensors) {
        if (t.ref) { out[t.name] = { type: t.type, dims: t.dims, ref: t.ref }; continue; }
        const A = ARRAYS[t.type];
        out[t.name] = { type: t.type, dims: t.dims, data: new A(buf, start + t.offset, t.length / A.BYTES_PER_ELEMENT) };
    }
    return out;
}

/** @returns {Promise<{provider:string, adapter?:string, vram_mb?:number, reason?:string}|null>} */
export async function nativeAiInfo() {
    if (!isDesktop) return null;
    const { core } = await tauri();
    return core.invoke('ai_info');
}

export async function nativeModelCached(urls) {
    const { core } = await tauri();
    return core.invoke('ai_cached', { urls });
}

export async function nativeDownload(url, onProgress) {
    const { core, event } = await tauri();
    const un = await event.listen('ai-download', (e) => {
        if (e.payload.url === url && e.payload.total) onProgress?.(Math.min(0.99, e.payload.loaded / e.payload.total));
    });
    try { await core.invoke('ai_download', { url }); } finally { un(); }
    onProgress?.(1);
}

/** @returns {Promise<{session:number, inputs:string[], outputs:string[], provider:string}>} */
export async function nativeLoad(urls, { gpu = true, exclusive = false } = {}) {
    const { core } = await tauri();
    return core.invoke('ai_load', { args: { urls, gpu, exclusive } });
}

export async function nativeRun(session, feeds, keep = []) {
    const { core } = await tauri();
    return unpackTensors(await core.invoke('ai_run', packTensors(session, feeds, keep)));
}

export async function nativeFree(refs) {
    const { core } = await tauri();
    return core.invoke('ai_free', { refs });
}
