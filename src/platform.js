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

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const baseOf = (path) => path.split(/[\\/]/).pop();

async function pathToFile(path) {
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
        : [{ name: 'PDF / Görsel', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }];
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
