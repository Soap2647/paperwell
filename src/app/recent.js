// Son açılan dosyalar (masaüstü: diskteki yol): başlangıç ekranında küçük resimle listelenir
import { useSyncExternalStore } from 'react';

const KEY = 'paperwell.recent';
const MAX = 8;
const subs = new Set();
let cache = null;

function read() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)) || []; } catch { cache = []; }
    return cache;
}
function write(list) {
    cache = list;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* yer yoksa küçük resimsiz kalır */ }
    subs.forEach((f) => f());
}

export const useRecent = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read);

/** Görselden ~120 px'lik küçük resim (JPEG dataURL) */
export async function thumbOf(blob) {
    try {
        const bmp = await createImageBitmap(blob);
        const k = 120 / Math.max(bmp.width, bmp.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
}

/** Listeye ekler (aynı yol en başa taşınır) */
export function addRecent({ path, name, kind, thumb }) {
    if (!path) return;
    const old = read().find((r) => r.path === path);
    write([{ path, name, kind, thumb: thumb || old?.thumb || null, at: Date.now() }, ...read().filter((r) => r.path !== path)].slice(0, MAX));
}

export function removeRecent(path) {
    write(read().filter((r) => r.path !== path));
}
