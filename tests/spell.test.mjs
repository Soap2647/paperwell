// Türkçe yazım: harf varyantları önce denenir, büyük/küçük harf korunur, öneriler satıra uygulanır
import { letterVariants, checkLine, applySuggestions, matchCase } from '../src/core/spell';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const DICT = new Set(['geleceğe', 'kampüslerden', 'aldı', 'kabul', 'projemiz', 'ortak', 'zeka']);
const sp = { correct: (w) => DICT.has(w), suggest: () => ['akdi'] };

check('varyantlar: gelecege → geleceğe', letterVariants('gelecege').includes('geleceğe'));
check('varyantlar: aldi → aldı', letterVariants('aldi').includes('aldı'));
check('büyük harf korunur', matchCase('GELECEGE', 'geleceğe') === 'GELECEĞE');
check('baş harf korunur', matchCase('Kampuslerden', 'kampüslerden') === 'Kampüslerden');
const line = 'Kampuslerden GELECEGE · projemiz kabul aldi!';
const issues = checkLine(line, sp);
check('üç hata bulunur', issues.length === 3, JSON.stringify(issues));
check('i/ı hatası için sözlüğün kötü önerisi değil varyant seçilir', issues.find((q) => q.word === 'aldi')?.suggestion === 'aldı');
check('şapkalı doğru yazım (ZEKÂ) hata sayılmaz', checkLine('ORTAK ZEKÂ', sp).length === 0);
check('büyük harfli marka adına uzak öneri yapılmaz', checkLine('ÜNİDES', { correct: () => false, suggest: () => ['ünde'] }).every((q) => q.suggestion === null));
check('kısaltma ve uzak öneri gösterilmez', checkLine('GDG Hackathonu', sp).every((q) => q.suggestion === null));
check('öneriler uygulanır', applySuggestions(line, issues) === 'Kampüslerden GELECEĞE · projemiz kabul aldı!', applySuggestions(line, issues));

if (fail) { console.log(`spell: ${fail} hata`); process.exit(1); }
console.log('spell ok');
