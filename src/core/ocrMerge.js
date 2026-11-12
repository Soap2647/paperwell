// PaddleOCR (satır algılama + Latin tanıma) ile Tesseract'ın (Türkçe harfler) okumalarını birleştirir.
// Paddle satırın iskeletini (boşluk, &, parantez, noktalama) iyi verir ama Türkçe harfleri sık düşürür/yanlış yazar;
// Tesseract Türkçe harflerde iyi, sembol ve noktalamada zayıf.

const FOLD = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', I: 'i' };
const foldChar = (c) => (FOLD[c] || c).toLowerCase();
export const fold = (s) => [...s].map(foldChar).join('').replace(/[^\p{L}\p{N}]/gu, '');
const isAlnum = (c) => /[\p{L}\p{N}]/u.test(c);
const TR = /[şŞğĞıİüÜöÖçÇ]/;
const upper = (c) => c.toLocaleUpperCase('tr') === c && c.toLocaleLowerCase('tr') !== c;
const caseLike = (model, c) => (upper(model) ? c.toLocaleUpperCase('tr') : c.toLocaleLowerCase('tr'));

/** Paddle metnindeki harfleri, aynı sıradaki Tesseract harfleriyle değiştirir (iskelet Paddle'dan) */
function overlay(paddle, letters) {
    let j = 0;
    return [...paddle].map((c) => (isAlnum(c) ? caseLike(c, letters[j++]) : c)).join('');
}

/** t, w'nin yalnız Türkçe harf eklenmiş hali mi (Paddle "ş"yi düşürdüyse)? En fazla 2 ekleme. */
function addsOnlyTurkish(w, t) {
    const a = fold(w);
    let i = 0, added = 0;
    for (const c of t) {
        if (!isAlnum(c)) continue;
        if (i < a.length && foldChar(c) === a[i]) i++;
        else if (TR.test(c) && ++added <= 2) continue;
        else return false;
    }
    return i === a.length && added > 0;
}

/** Türkçe/Latin dışı harf (ör. Yunanca ς) */
const foreign = (w) => /[^\p{Script=Latin}\p{N}\p{P}\p{S}]/u.test(w);

/**
 * @param {string} paddle - Paddle okuması (iskelet)
 * @param {string} tess - Tesseract okuması (Türkçe harfler)
 */
export function mergeDiacritics(paddle, tess) {
    // Satır başı/sonundaki çöp işaretler (süs çizgisinin ' ya da | okunması) atılır
    paddle = paddle.replace(/^[\s'’`´|_~]+|[\s'’`´|_~]+$/gu, '');
    // Harfler aksansız aynıysa: iskelet Paddle'dan, harfler Tesseract'tan
    if (fold(paddle) && fold(paddle) === fold(tess)) return overlay(paddle, [...tess].filter(isAlnum));
    // Değilse kelime kelime (yalnız harf/rakam içeren kelimeler eşlenir; "&" gibi semboller Paddle'da kalır)
    const a = paddle.split(/(\s+)/), b = tess.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    const words = a.filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (words.length !== b.length) return paddle;
    let k = 0;
    return a.map((w) => {
        if (!/[\p{L}\p{N}]/u.test(w)) return w;
        const t = b[k++], tl = [...t].filter(isAlnum);
        if (fold(w) === fold(t)) return overlay(w, tl);
        if (addsOnlyTurkish(w, t)) {
            // Paddle'ın baş/son noktalaması korunur, gövde Tesseract'tan
            const lead = w.match(/^[^\p{L}\p{N}]*/u)[0], trail = w.match(/[^\p{L}\p{N}]*$/u)[0];
            const body = tl.join('');
            return lead + (upper([...w].find(isAlnum) || '') && w === w.toLocaleUpperCase('tr') ? body.toLocaleUpperCase('tr') : body) + trail;
        }
        if (foreign(w) && tl.length === [...w].filter(isAlnum).length && !foreign(t)) return tl.join('');
        return w;
    }).join('');
}
