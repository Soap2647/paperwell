// Türkçe yazım denetimi (yapay zekâ afişlerinde sık: "GELECEGE", "KAMPUSLERDEN", "ALDI"). Saf mantık burada;
// sözlük (hunspell tr, MIT) ayrı bir Worker'da yüklenir (~1,5 sn, ~150 MB), ilk kullanımda.

const FOLD = { ı: 'i', i: 'ı', g: 'ğ', ğ: 'g', s: 'ş', ş: 's', c: 'ç', ç: 'c', o: 'ö', ö: 'o', u: 'ü', ü: 'u' };

/**
 * Türkçe harf varyantları: yapay zekânın en çok karıştırdığı i/ı, g/ğ, s/ş, c/ç, o/ö, u/ü çiftleri.
 * En fazla 3 harf değiştirilir (12 aday harf varsa 2^12 patlamasın diye konum başına sınırlı).
 */
export function letterVariants(word, maxFlips = 3) {
    const pos = [...word].map((ch, i) => (FOLD[ch] ? i : -1)).filter((i) => i >= 0);
    const out = new Set();
    const chars = [...word];
    const rec = (start, flips) => {
        if (flips) out.add(chars.join(''));
        if (flips === maxFlips) return;
        for (let k = start; k < pos.length; k++) {
            const i = pos[k], prev = chars[i];
            chars[i] = FOLD[prev];
            rec(k + 1, flips + 1);
            chars[i] = prev;
        }
    };
    rec(0, 0);
    return [...out];
}

const lower = (w) => w.toLocaleLowerCase('tr');
/** Öneriyi asıl kelimenin harf biçimine uydurur (HEPSİ BÜYÜK / Baş harfi büyük / küçük) */
export function matchCase(orig, sug) {
    if (orig === orig.toLocaleUpperCase('tr') && orig !== lower(orig)) return sug.toLocaleUpperCase('tr');
    if (orig[0] && orig[0] === orig[0].toLocaleUpperCase('tr') && orig[0] !== lower(orig[0])) return sug[0].toLocaleUpperCase('tr') + sug.slice(1);
    return sug;
}

/**
 * Bir satırdaki yanlış kelimeler ve önerileri.
 * @param {string} line
 * @param {{correct:(w:string)=>boolean, suggest:(w:string)=>string[]}} sp
 * @returns {{word: string, index: number, suggestion: string|null}[]}
 */
export function checkLine(line, sp) {
    const out = [];
    for (const m of line.matchAll(/[\p{L}]+/gu)) {
        const word = m[0];
        if (word.length < 3) continue; // tek harf, kısa bağlaç
        if (word.length <= 5 && word === word.toLocaleUpperCase('tr')) continue; // kısaltma (GDG, ÜNİDES)
        const w = lower(word);
        if (sp.correct(w) || sp.correct(word)) continue;
        // şapkalı yazım (zekâ, hâlâ) sözlükte şapkasız olabilir: doğru sayılır
        if (/[âîû]/.test(w) && sp.correct(w.replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u'))) continue;
        // önce Türkçe harf varyantları (en olası hata), sonra sözlüğün önerisi
        const v = letterVariants(w).find((x) => sp.correct(x));
        // sözlük önerisi yalnız yakınsa (en çok 2 harf farkı): özel adlara (marka, kişi) saçma öneri verilmesin
        const near = !v && w.length >= 5 ? sp.suggest(w).find((x) => editDistance(x, w) <= 2) : null;
        const s = v || near || null;
        out.push({ word, index: m.index, suggestion: s ? matchCase(word, s) : null });
    }
    return out;
}

function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
}

/** Satırdaki bütün yanlış kelimeleri önerileriyle değiştirir */
export function applySuggestions(line, issues) {
    let s = line;
    for (const it of [...issues].sort((a, b) => b.index - a.index)) {
        if (it.suggestion) s = s.slice(0, it.index) + it.suggestion + s.slice(it.index + it.word.length);
    }
    return s;
}

// ─── Worker köprüsü ─────────────────────────────────────────────────────────
let worker = null, seq = 0;
const waiting = new Map();

/** Satırları denetler (Worker'da). Sözlük ilk çağrıda yüklenir. @returns {Promise<Array<ReturnType<typeof checkLine>>>} */
export function checkLines(lines) {
    if (!worker) {
        worker = new Worker(new URL('./spell.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => { const f = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.error) f.rej(new Error(e.data.error)); else f.res(e.data.result); };
    }
    const id = ++seq;
    return new Promise((res, rej) => { waiting.set(id, { res, rej }); worker.postMessage({ id, lines }); });
}
