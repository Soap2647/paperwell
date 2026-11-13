import { toPt, fromPt, sizeToPage, validSize, resizeTransform, scaleObject, scaleRects, exportSize, ALL_PRESETS, PX_PT } from '../src/core/pageSize.js';

let fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const check = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

// birimler
check('1080 px = 810 pt', near(toPt(1080, 'px'), 810));
check('210 mm = 595.276 pt', near(toPt(210, 'mm'), 595.2755905511812, 1e-6));
check('cm = 10 mm', near(toPt(9, 'cm'), toPt(90, 'mm')));
check('fromPt tersi', near(fromPt(toPt(37.5, 'mm'), 'mm'), 37.5));
const ig = sizeToPage({ w: 1080, h: 1350, unit: 'px' });
check('px ön ayarı pixelSize taşır', ig.width === 810 && ig.height === 1012.5 && ig.pixelSize.w === 1080 && ig.pixelSize.h === 1350);
check('mm ön ayarı pixelSize taşımaz', sizeToPage({ w: 90, h: 130, unit: 'mm' }).pixelSize === undefined);
check('tüm ön ayarlar geçerli', ALL_PRESETS.every(validSize));
check('0 ve çok büyük geçersiz', !validSize({ w: 0, h: 10, unit: 'mm' }) && !validSize({ w: 20000, h: 10, unit: 'px' }) && !validSize({ w: 3, h: 3, unit: 'mm' }));

// sığdırma
let tr = resizeTransform(595, 842, 810, 810, true);
check('A4 -> kare: ölçek yüksekliğe göre', near(tr.k, 810 / 842));
check('A4 -> kare: yatayda ortalanır', near(tr.dx, (810 - 595 * tr.k) / 2) && near(tr.dy, 0));
tr = resizeTransform(400, 400, 800, 400, true);
check('kare -> geniş: k=1, sağ/sol boşluk eşit', near(tr.k, 1) && near(tr.dx, 200) && near(tr.dy, 0));
tr = resizeTransform(400, 400, 200, 200, false);
check('sığdırma kapalı: k=1, ortalanır (negatif ofset)', near(tr.k, 1) && near(tr.dx, -100) && near(tr.dy, -100));
// sayfa köşeleri yeni sayfanın içinde kalır
tr = resizeTransform(595, 842, 1012.5, 810, true);
check('fit: içerik yeni sayfanın içinde', tr.dx >= -1e-9 && tr.dy >= -1e-9 && 595 * tr.k + tr.dx <= 1012.5 + 1e-9 && 842 * tr.k + tr.dy <= 810 + 1e-9);

// nesneler
const k = 2, dx = 10, dy = 20;
let o = scaleObject({ type: 'rect', x: 1, y: 2, w: 3, h: 4, width: 1.5, stroke: '#000' }, k, dx, dy);
check('rect konum/boyut/kontur', o.x === 12 && o.y === 24 && o.w === 6 && o.h === 8 && o.width === 3);
o = scaleObject({ type: 'image', x: 1, y: 2, w: 3, h: 4, src: 'x' }, k, dx, dy);
check('image: width alanı eklenmez', o.x === 12 && o.w === 6 && !('width' in o));
o = scaleObject({ type: 'text', x: 1, y: 2, w: 0, h: 0, size: 12, text: 'a' }, k, dx, dy);
check('text: yazı boyutu ölçeklenir', o.size === 24 && o.x === 12 && o.w === 0);
o = scaleObject({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, width: 2 }, k, dx, dy);
check('line uçları ve kalınlık', o.x1 === 10 && o.y1 === 20 && o.x2 === 20 && o.y2 === 30 && o.width === 4);
o = scaleObject({ type: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5 }, k, dx, dy);
check('arrow varsayılan kalınlık 2*k', o.width === 4);
o = scaleObject({ type: 'path', points: [[1, 1, 0.5], [2, 3, 0.7]], width: 3 }, k, dx, dy);
check('path noktaları baskı korunur', o.points[0][0] === 12 && o.points[0][1] === 22 && o.points[0][2] === 0.5 && o.points[1][1] === 26 && o.width === 6);
o = scaleObject({ type: 'highlight', rects: [{ x: 1, y: 1, w: 2, h: 3 }] }, k, dx, dy);
check('highlight rect', o.rects[0].x === 12 && o.rects[0].w === 4 && o.rects[0].h === 6);
o = scaleObject({ type: 'note', x: 0, y: 0, w: 24, h: 24 }, 2, 0, 0);
check('note boyutu sabit, merkezi taşınır', o.w === 24 && o.x === 12 && o.y === 12);
o = scaleObject({ type: 'image', x: 0, y: 0, w: 10, h: 10, textSource: { type: 'text', x: 1, y: 1, w: 4, h: 2, size: 8 } }, 2, 5, 5);
check('textSource göreli: yalnız ölçek', o.textSource.x === 2 && o.textSource.size === 16 && o.textSource.w === 8);
const before = { type: 'rect', x: 1, y: 1, w: 1, h: 1 };
scaleObject(before, 3, 1, 1);
check('girdi değişmez', before.x === 1 && before.w === 1);
check('scaleRects', scaleRects([{ x: 1, y: 1, w: 2, h: 2 }], 2, 1, 1)[0].x === 3);

// dışa aktarma boyutu
let e = exportSize(810, 810, { w: 1080, h: 1080 });
check('piksel ön ayarı: tam 1080x1080', e.exact && e.w === 1080 && e.h === 1080 && near(e.scale, 1080 / 810));
e = exportSize(PX_PT * 1920, PX_PT * 1080, { w: 1920, h: 1080 });
check('1920x1080 tam', e.w === 1920 && e.h === 1080);
e = exportSize(595.28, 841.89, undefined);
check('A4: 2x CSS px (~1587x2245)', !e.exact && e.w === Math.round(595.28 * 8 / 3) && e.h === Math.round(841.89 * 8 / 3));
e = exportSize(500, 500, { w: 1080, h: 1080 });
check('boyut uyuşmuyorsa pixelSize yok sayılır', !e.exact);
e = exportSize(1417, 1984, undefined);
check('büyük poster 8000 px ile sınırlı', Math.max(e.w, e.h) <= 8000 && Number.isInteger(e.w) && Number.isInteger(e.h));

if (fail) { console.log(`${fail} FAIL`); process.exit(1); }
console.log('hepsi geçti');
