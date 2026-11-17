// Marka kiti: logolar ve marka renkleri bir kez eklenir, her açılışta hazır durur.
// Logolar IndexedDB'de (büyük olabilir), renkler localStorage'da saklanır; ikisi de yoksa oturum boyunca bellekte tutulur.
import { useSyncExternalStore } from 'react';
import { resizeTransform, scaleObjects } from './pageSize';
import { newId } from './pageOps';

const DB = 'paperwell-brand', STORE = 'assets', TEMPLATES = 'templates', COLORS_KEY = 'paperwell.brand.colors';
export const MAX_ASSET_BYTES = 8e6;

/** Varsayılan renkler: Google / GDG marka renkleri + koyu ve beyaz */
export const DEFAULT_COLORS = [
    { name: 'Mavi', hex: '#4285F4' }, { name: 'Kırmızı', hex: '#EA4335' }, { name: 'Sarı', hex: '#FBBC04' }, { name: 'Yeşil', hex: '#34A853' },
    { name: 'Koyu', hex: '#202124' }, { name: 'Beyaz', hex: '#FFFFFF' },
];

let state = { assets: [], colors: DEFAULT_COLORS, templates: [], ready: false };
const listeners = new Set();
const emit = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribeBrand = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getBrand = () => state;
export const useBrandKit = () => useSyncExternalStore(subscribeBrand, getBrand);

// ─── Saklama ─────────────────────────────────────────────────────────────────

function open() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB yok'));
        const req = indexedDB.open(DB, 2);
        req.onupgradeneeded = () => {
            for (const name of [STORE, TEMPLATES]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
const run = async (mode, fn, store = STORE) => {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(store, mode), out = fn(tx.objectStore(store));
            tx.oncomplete = () => resolve(out?.result);
            tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
};

let persistent = true; // false: depolama kullanılamıyor, kit yalnız bu oturumda geçerli
export const isBrandPersistent = () => persistent;

export function readColors() {
    try {
        const v = JSON.parse(localStorage.getItem(COLORS_KEY) || 'null');
        if (Array.isArray(v) && v.every((c) => /^#[0-9a-f]{6}$/i.test(c?.hex))) return v;
    } catch { /* yoksay */ }
    return DEFAULT_COLORS;
}
function saveColors(colors) {
    emit({ colors });
    try { localStorage.setItem(COLORS_KEY, JSON.stringify(colors)); } catch { persistent = false; }
}

let loading = null;
/** Kayıtlı kiti yükler (bir kez). Uygulama açılışında çağrılır. */
export function loadBrandKit() {
    if (!loading) {
        loading = (async () => {
            emit({ colors: readColors() });
            try {
                navigator.storage?.persist?.();
                const assets = await run('readonly', (s) => s.getAll());
                const templates = await run('readonly', (s) => s.getAll(), TEMPLATES);
                emit({ assets: (assets || []).sort((a, b) => a.added - b.added), templates: (templates || []).sort((a, b) => a.added - b.added), ready: true });
            } catch { persistent = false; emit({ ready: true }); }
        })();
    }
    return loading;
}

// ─── Logolar ─────────────────────────────────────────────────────────────────

const readDataUrl = (file) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(file); });
const imageSize = (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve({ w: i.naturalWidth || 300, h: i.naturalHeight || 120 }); i.onerror = () => resolve({ w: 300, h: 120 }); i.src = src; });

/** Dosyadan logo ekler. Aynı ad + boyut varsa yenisiyle değiştirir. */
export async function addBrandAsset(file) {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Yalnız PNG, JPG, WebP, GIF veya SVG eklenebilir');
    if (file.size > MAX_ASSET_BYTES) throw new Error("Dosya 8 MB'tan büyük olamaz");
    const src = await readDataUrl(file);
    const { w, h } = await imageSize(src);
    const name = file.name.replace(/\.[^.]+$/, '');
    const dup = state.assets.find((a) => a.name === name && a.w === w && a.h === h);
    const asset = { id: dup?.id || `br-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, src, w, h, added: dup?.added || Date.now() };
    try { await run('readwrite', (s) => s.put(asset)); } catch { persistent = false; }
    emit({ assets: [...state.assets.filter((a) => a.id !== asset.id), asset].sort((a, b) => a.added - b.added) });
    return asset;
}

export async function removeBrandAsset(id) {
    try { await run('readwrite', (s) => s.delete(id)); } catch { /* yoksay */ }
    emit({ assets: state.assets.filter((a) => a.id !== id) });
}

export async function renameBrandAsset(id, name) {
    const a = state.assets.find((q) => q.id === id);
    if (!a || !name.trim()) return;
    const next = { ...a, name: name.trim() };
    try { await run('readwrite', (s) => s.put(next)); } catch { /* yoksay */ }
    emit({ assets: state.assets.map((q) => (q.id === id ? next : q)) });
}

// ─── Şablonlar ───────────────────────────────────────────────────────────────
// Bir sayfadaki yerleşim (logolar, yazılar, şekiller) kaydedilir; yeni görsele tek tıkla aynı yerlere gelir.

/** @param {{name: string, width: number, height: number, objects: object[], thumb?: string}} t */
export async function saveTemplate({ name, width, height, objects, thumb }) {
    const tpl = { id: `tp-${Date.now().toString(36)}`, name, width, height, objects, thumb, added: Date.now() };
    try { await run('readwrite', (s) => s.put(tpl), TEMPLATES); } catch { persistent = false; }
    emit({ templates: [...state.templates, tpl] });
    return tpl;
}

export async function removeTemplate(id) {
    try { await run('readwrite', (s) => s.delete(id), TEMPLATES); } catch { /* yoksay */ }
    emit({ templates: state.templates.filter((q) => q.id !== id) });
}

// ─── Renkler ─────────────────────────────────────────────────────────────────

export function addBrandColor(hex, name = '') {
    const h = hex.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(h) || state.colors.some((c) => c.hex.toLowerCase() === h)) return;
    saveColors([...state.colors, { name: name || h.toUpperCase(), hex: h.toUpperCase() }]);
}
export const removeBrandColor = (hex) => saveColors(state.colors.filter((c) => c.hex !== hex));
export const resetBrandColors = () => saveColors(DEFAULT_COLORS);

// ─── Paylaşma (ekip aynı kiti kullansın) ─────────────────────────────────────

/** Kiti tek bir JSON dosyasına çevirir */
export function exportBrandKit() {
    return JSON.stringify({ paperwellBrandKit: 1, colors: state.colors, assets: state.assets.map(({ name, src, w, h }) => ({ name, src, w, h })) });
}

/** JSON dosyasından kiti ekler (mevcutlar korunur). @returns {Promise<{assets: number, colors: number}>} */
export async function importBrandKit(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Bu dosya bir marka kiti gibi görünmüyor'); }
    if (data?.paperwellBrandKit !== 1) throw new Error('Bu dosya bir marka kiti gibi görünmüyor');
    let colors = 0, assets = 0;
    for (const c of data.colors || []) if (/^#[0-9a-f]{6}$/i.test(c?.hex) && !state.colors.some((q) => q.hex.toLowerCase() === c.hex.toLowerCase())) { addBrandColor(c.hex, c.name); colors++; }
    for (const a of data.assets || []) {
        if (typeof a?.src !== 'string' || !a.src.startsWith('data:image/')) continue;
        const blob = await (await fetch(a.src)).blob();
        await addBrandAsset(new File([blob], `${a.name || 'logo'}.${blob.type.split('/')[1].replace('svg+xml', 'svg')}`, { type: blob.type }));
        assets++;
    }
    return { assets, colors };
}

/**
 * Şablonun nesnelerini verilen sayfaya uyarlar: sayfa boyutu farklıysa orantılı sığdırılır, kimlikler ve
 * grup kimlikleri yenilenir (aynı şablon bir sayfaya iki kez uygulanabilsin).
 */
export function templateToObjects(tpl, page) {
    const { k, dx, dy } = resizeTransform(tpl.width, tpl.height, page.width, page.height, true);
    const gids = new Map();
    return scaleObjects(tpl.objects, k, dx, dy).map((o) => {
        const q = { ...o, id: newId('ob') };
        if (o.groupId) { if (!gids.has(o.groupId)) gids.set(o.groupId, newId('gp')); q.groupId = gids.get(o.groupId); }
        return q;
    });
}
