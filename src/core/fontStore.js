// Kullanıcının eklediği fontlar: IndexedDB'de kalıcı, FONT_FAMILIES'e `custom:<id>` anahtarıyla eklenir.
// IndexedDB engelliyse / yoksa yalnız bu oturumda çalışır (çökmez).
import { useSyncExternalStore } from 'react';
import fontkit from '@pdf-lib/fontkit';
import { FONT_FAMILIES } from './fonts';

const DB_NAME = 'paperwell-fonts', STORE = 'fonts';
export const MAX_FONT_BYTES = 10 * 1024 * 1024;
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';
const WEIGHTS = [400, 500, 600, 700];
const WEIGHT_NAMES = { 400: '', 500: ' Orta', 600: ' Yarı kalın', 700: ' Kalın' };

// ─── abonelik ───────────────────────────────────────────────────────────────
let version = 0;
const listeners = new Set();
const bump = () => { version++; listeners.forEach((cb) => cb()); };
export function subscribeFonts(cb) { listeners.add(cb); return () => listeners.delete(cb); }
/** Font eklenince/silinince değişen sayaç; seçici yeniden çizilsin diye */
export const useFonts = () => useSyncExternalStore(subscribeFonts, () => version);

// ─── IndexedDB (hepsi try/catch: hata = null / false) ───────────────────────
let dbPromise = null;
function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch { resolve(null); }
        });
    }
    return dbPromise;
}
async function dbRun(mode, fn) {
    const db = await openDb();
    if (!db) return { ok: false };
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve({ ok: true, value: req?.result });
            tx.onerror = tx.onabort = () => resolve({ ok: false });
        } catch { resolve({ ok: false }); }
    });
}

// ─── kayıt ──────────────────────────────────────────────────────────────────
const live = new Map(); // key -> { face, url }

function register(rec) {
    const key = `custom:${rec.id}`;
    unregister(key);
    let label = rec.name + WEIGHT_NAMES[rec.weight];
    // katalogdaki bir fontla aynı CSS adını paylaşmasın
    if (Object.values(FONT_FAMILIES).some((f) => !f.customUrl && f.cssName === `PW ${label}`)) label += ' (özel)';
    const cssName = `PW ${label}`;
    const url = URL.createObjectURL(new Blob([rec.bytes], { type: 'font/ttf' }));
    const face = new FontFace(cssName, `url(${url})`, { weight: String(rec.weight), display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => null);
    live.set(key, { face, url });
    FONT_FAMILIES[key] = { label, css: `"${cssName}", sans-serif`, cssName, kind: 'custom', weights: [rec.weight], customUrl: url, file: null };
    return key;
}
function unregister(key) {
    const l = live.get(key);
    if (l) { try { document.fonts.delete(l.face); } catch { /* yok say */ } URL.revokeObjectURL(l.url); live.delete(key); }
    delete FONT_FAMILIES[key];
}

let loading = null;
/** Uygulama açılışında bir kez: kayıtlı tüm fontları geri yükler */
export function loadStoredFonts() {
    if (!loading) {
        loading = (async () => {
            try { await navigator.storage?.persist?.(); } catch { /* yok say */ }
            const r = await dbRun('readonly', (s) => s.getAll());
            for (const rec of r.value || []) { try { register(rec); } catch { /* bozuk kayıt */ } }
            if (r.value?.length) bump();
        })();
    }
    return loading;
}

const nearestWeight = (w) => (Number.isFinite(w) ? WEIGHTS.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), 400) : 400);

/** Font dosyasından { name, weight } okur; font değilse Error('Bu dosya bir font gibi görünmüyor') */
export function readFontMeta(buf, fileName = '') {
    const bad = new Error('Bu dosya bir font gibi görünmüyor');
    let font;
    try {
        font = fontkit.create(new Uint8Array(buf));
        if (font?.fonts) font = font.fonts[0]; // font koleksiyonu: ilki
    } catch { throw bad; }
    if (!font?.glyphsForString) throw bad;
    const name = String(font.familyName || fileName.replace(/\.[^.]+$/, '') || 'Font').replace(/["\\]/g, '').trim().slice(0, 60) || 'Font';
    return { name, weight: nearestWeight(font['OS/2']?.usWeightClass) };
}

/** Dosyayı doğrular, saklar, kaydeder. { key, label, persisted } döner; hata: Error(Türkçe mesaj) */
export async function addFontFile(file) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('Yalnız .ttf, .otf, .woff veya .woff2 dosyaları eklenebilir');
    if (file.size > MAX_FONT_BYTES) throw new Error('Font dosyası 10 MB\'tan büyük olamaz');
    const bytes = await file.arrayBuffer();
    const { name, weight } = readFontMeta(bytes, file.name);
    const rec = { id: `${name.toLowerCase().replace(/\s+/g, '-')}-${weight}`, name, weight, bytes, added: Date.now() };
    const key = register(rec); // aynı ad+ağırlık varsa yenisi eskinin yerine geçer
    const persisted = (await dbRun('readwrite', (s) => s.put(rec))).ok;
    bump();
    return { key, label: FONT_FAMILIES[key].label, persisted };
}

/** Eklenmiş fontu siler (nesneler sans'a döner) */
export async function removeCustomFont(key) {
    unregister(key);
    await dbRun('readwrite', (s) => s.delete(key.slice('custom:'.length)));
    bump();
}
