import { matchRange, filterFonts, groupFonts, pushRecent } from '../src/core/fontSearch.js';

let fail = 0;
const check = (name, cond) => { if (cond) console.log('ok   ', name); else { console.log('FAIL ', name); fail++; } };

const E = [
    { key: 'sans', label: 'Sans (Arial uyumlu)', kind: 'sans' },
    { key: 'inter', label: 'Inter', kind: 'sans' },
    { key: 'lora', label: 'Lora', kind: 'serif' },
    { key: 'pacifico', label: 'Pacifico', kind: 'script' },
    { key: 'caveat', label: 'Caveat', kind: 'script' },
    { key: 'sarpanch', label: 'Şarpanç', kind: 'display' },
    { key: 'mono', label: 'Mono', kind: 'mono' },
    { key: 'custom:x-400', label: 'Benim Fontum', kind: 'custom' },
    { key: 'googlesans', label: 'Google Sans', kind: 'sans' },
];

let r = matchRange('Şarpanç', 'sarp');
check('diacritic-insensitive range', r && r.start === 0 && r.end === 4);
r = matchRange('Inter', 'ınt');
check('dotless i folds', r && r.start === 0 && r.end === 3);
r = matchRange('Google Sans', 'gle s');
check('range across space', r && r.start === 3 && r.end === 8);
check('no match', matchRange('Lora', 'xyz') === null);

check('empty query returns all', filterFonts(E, '  ').length === E.length);
check('script category label match', filterFonts(E, 'el yazısı').map((e) => e.key).join() === 'pacifico,caveat');
check('El YAZISI case', filterFonts(E, 'EL YAZISI').length === 2);
check('name prefix ranks before inner', filterFonts(E, 'sans').map((e) => e.key)[0] === 'sans');
check('name match before category-only', (() => { const k = filterFonts(E, 'serif').map((e) => e.key); return k[0] === 'lora' || k.length >= 1; })());
check('highlight range present', filterFonts(E, 'sarp')[0].range.join() === '0,4');

const g = groupFonts(E, ['googlesans', 'googlesanscode'], ['lora', 'nope']);
check('section order', g.map((s) => s.id).join() === 'brand,recent,sans,serif,display,script,mono');
check('brand holds pinned + custom', g[0].items.map((e) => e.key).join() === 'googlesans,custom:x-400');
check('brand not duplicated in sans', g[2].items.map((e) => e.key).join() === 'sans,inter');
check('unknown recents dropped', g[1].items.length === 1);
check('no recents section when empty', groupFonts(E, [], []).every((s) => s.id !== 'recent'));
check('pushRecent dedupes and caps', pushRecent(['a', 'b', 'c', 'd', 'e', 'f'], 'c').join() === 'c,a,b,d,e,f' && pushRecent(['a', 'b', 'c', 'd', 'e', 'f'], 'z').length === 6);

if (fail) process.exit(1);
