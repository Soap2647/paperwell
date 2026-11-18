// Font seçici için saf arama/gruplama mantığı (Türkçe dostu: büyük-küçük harf ve aksan duyarsız)
import { fold } from './ocrMerge';

export const KIND_LABELS = {
    sans: 'Sade (Sans)', serif: 'Serif', display: 'Gösterişli (başlık)', script: 'El yazısı', mono: 'Sabit genişlikli', custom: 'Kendi fontlarım',
};
export const KIND_ORDER = ['sans', 'serif', 'display', 'script', 'mono'];

/** name içinde q'nun (ikisi de katlanmış) ilk geçtiği yerin özgün metindeki [başlangıç, bitiş) aralığı; yoksa null */
export function matchRange(name, query) {
    const q = fold(query);
    if (!q) return null;
    let folded = '';
    const map = []; // katlanmış karakter -> özgün indeks
    [...name].forEach((ch, i) => { const f = fold(ch); for (let k = 0; k < f.length; k++) { folded += f[k]; map.push(i); } });
    const at = folded.indexOf(q);
    if (at < 0) return null;
    return { start: map[at], end: map[at + q.length - 1] + 1, prefix: at === 0 };
}

/** Sorguya uyanlar: önce ad başı, sonra ad içi, sonra yalnız kategori adı eşleşenler (kendi sıralarını korur) */
export function filterFonts(entries, query) {
    const q = fold(query);
    if (!q) return entries.map((e) => ({ ...e, range: null }));
    const out = [];
    for (const e of entries) {
        const r = matchRange(e.label, query);
        if (r) out.push({ ...e, range: [r.start, r.end], rank: r.prefix ? 0 : 1 });
        else if (e.kind && matchRange(KIND_LABELS[e.kind] || '', query)) out.push({ ...e, range: null, rank: 2 });
    }
    return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.rank - b.e.rank || a.i - b.i).map((x) => x.e);
}

/**
 * Sorgu boşken bölümler: Marka (sabitlenenler + kendi fontlar), Son kullanılanlar, kategoriler.
 * entries: [{key,label,kind}], brandKeys: sabit marka anahtarları, recents: anahtar listesi
 */
export function groupFonts(entries, brandKeys = [], recents = []) {
    const byKey = new Map(entries.map((e) => [e.key, e]));
    const brand = [...brandKeys.map((k) => byKey.get(k)), ...entries.filter((e) => e.kind === 'custom')].filter(Boolean);
    const brandSet = new Set(brand.map((e) => e.key));
    const sections = [];
    if (brand.length) sections.push({ id: 'brand', title: 'Marka', items: brand });
    const rec = recents.map((k) => byKey.get(k)).filter(Boolean).slice(0, 6);
    if (rec.length) sections.push({ id: 'recent', title: 'Son kullanılanlar', items: rec });
    for (const kind of KIND_ORDER) {
        const items = entries.filter((e) => e.kind === kind && !brandSet.has(e.key));
        if (items.length) sections.push({ id: kind, title: KIND_LABELS[kind], items });
    }
    return sections;
}

/** Son kullanılanlar listesine ekler (başa, tekrarsız, en çok n) */
export const pushRecent = (list, key, n = 6) => [key, ...list.filter((k) => k !== key)].slice(0, n);
