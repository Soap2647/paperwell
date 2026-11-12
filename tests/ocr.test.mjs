// OCR birleştirme testi (Paddle iskelet + Tesseract Türkçe harfler)
import { mergeDiacritics } from '../src/core/ocrMerge';

const cases = [
    // Tesseract sembolü okumadı: & Paddle'dan kalmalı
    ['Açilis & Sunum', 'Açılış Sunum', 'Açılış & Sunum'],
    // parantez ve nokta korunmalı
    ['Gelistirme Süreci (2. Etap)', 'Geliştirme Süreci 2. Etap', 'Geliştirme Süreci (2. Etap)'],
    // Paddle ş'yi düşürdü
    ['Gelitiricileri Topluluğu', 'Geliştiricileri Topluluğu', 'Geliştiricileri Topluluğu'],
    ['Spor, eğlence ve güzel bir akam', 'Spor, eğlence ve güzel bir akşam', 'Spor, eğlence ve güzel bir akşam'],
    // büyük harf: I → İ
    ['DAHA IYI YARINLAR', 'DAHA İYİ YARINLAR', 'DAHA İYİ YARINLAR'],
    ['BIRLIKTE ÜRET!', 'Bİrlİkte ÜRET', 'BİRLİKTE ÜRET!'],
    // farklı kelime: dokunma
    ['MAJOR LERGUE HACKING', 'MAJOR LEAGUE HACKING', 'MAJOR LERGUE HACKING'],
    ['19 Ekim 2026', '19 Ekim 2026', '19 Ekim 2026'],
    // süs çizgisi kesme işareti okunmuş
    ["Voleybol'", 'Voleybol', 'Voleybol'],
    ['KODLA, PAYLAS,', 'KODLA, PAYLAŞ', 'KODLA, PAYLAŞ,'],
    // kelime sayısı tutmuyor ve harfler farklı: Paddle kalır
    ['Hadi sahaya!', 'Hadi saha ya', 'Hadi sahaya!'],
];
let fail = 0;
for (const [p, t, want] of cases) {
    const got = mergeDiacritics(p, t);
    const ok = got === want;
    if (!ok) fail++;
    console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(p), '+', JSON.stringify(t), '→', JSON.stringify(got), ok ? '' : `(beklenen ${JSON.stringify(want)})`);
}
if (fail) { console.log(`ocr: ${fail} hata`); process.exit(1); }
console.log('ocr ok');
