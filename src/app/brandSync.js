// Ortak marka kiti: kit, ekibin paylaştığı bir klasördeki (OneDrive, Google Drive, ağ sürücüsü) JSON dosyasına yazılır.
// Açılışta ve dakikada bir okunur; başkasının eklediği logo, renk ve şablonlar gelir. Silmeler eşitlenmez (kimse
// yanlışlıkla ekibin logosunu silmesin). Yalnız masaüstünde.
import { useSyncExternalStore } from 'react';
import { exportBrandKit, importBrandKit, subscribeBrand, getBrandKit } from '../core/brandKit';
import { isDesktop, pickFolder, readTextFile, writeTextFile } from '../platform';

const KEY = 'paperwell.brandFolder';
const FILE = 'paperwell-marka-kiti.json';
const subs = new Set();
let folder = (() => { try { return localStorage.getItem(KEY) || null; } catch { return null; } })();
let last = null, timer = null, poll = null, unsub = null;
const notify = () => subs.forEach((f) => f());
const filePath = () => `${folder}\\${FILE}`;

export const useBrandFolder = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => folder);

/** Klasördeki kiti okuyup eksikleri ekler; sonra birleşik hali geri yazar */
async function pull() {
    const text = await readTextFile(filePath());
    if (text && text !== last) {
        try { await importBrandKit(text); } catch { /* bozuk dosya: üzerine yazılır */ }
        last = text;
    }
    await push();
}

async function push() {
    if (!getBrandKit().ready) return;
    const text = exportBrandKit();
    if (text === last) return;
    await writeTextFile(filePath(), text).catch(() => {});
    last = text;
}

function stop() { unsub?.(); unsub = null; clearInterval(poll); clearTimeout(timer); }
function start() {
    stop();
    pull();
    // kit değişince 1,5 sn sonra yaz; dakikada bir ekibin eklediklerini al
    unsub = subscribeBrand(() => { clearTimeout(timer); timer = setTimeout(push, 1500); });
    poll = setInterval(pull, 60000);
}

/** Uygulama açılışında: bağlı klasör varsa eşitlemeyi başlat */
export function initBrandSync() { if (isDesktop && folder) start(); }

/** @returns {Promise<string|null>} bağlanan klasör */
export async function linkBrandFolder() {
    const f = await pickFolder();
    if (!f) return null;
    folder = f; last = null;
    try { localStorage.setItem(KEY, f); } catch { /* yoksay */ }
    notify();
    start();
    return f;
}

export function unlinkBrandFolder() {
    stop();
    folder = null;
    try { localStorage.removeItem(KEY); } catch { /* yoksay */ }
    notify();
}
