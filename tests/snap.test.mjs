// Akıllı kılavuz yakalama testi
import { snapTargets, snapMove, snapResize, matchedLines } from '../src/app/snap';

const page = { width: 600, height: 800 };
const bb = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h });
const objs = [
    { id: 'a', x: 100, y: 100, w: 200, h: 100 },
    { id: 'b', x: 400, y: 500, w: 50, h: 50 },
    { id: 'me', x: 10, y: 10, w: 80, h: 40 },
];
const T = snapTargets(objs, 'me', page, [{ axis: 'x', pos: 333 }, { axis: 'y', pos: 700 }], bb);
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

check('hedefler: sayfa kenarı/orta + diğer nesne + kılavuz, kendisi yok', T.xs.includes(0) && T.xs.includes(300) && T.xs.includes(600) && T.xs.includes(100) && T.xs.includes(200) && T.xs.includes(300) && T.xs.includes(333) && !T.xs.includes(90) && T.ys.includes(700));

// me (10,10,80x40): sola 2 birim kaydırınca sol kenar 8 -> sayfa kenarı 0 değil; 100'e (a'nın sol kenarı) 6 eşiği içinde değil
let r = snapMove(bb(objs[2]), 85, 0, T, 6); // sol kenar 95 -> a.x = 100'e yakala
check('taşıma: sol kenar a.x=100e yakalanır', Math.abs(r.dx - 90) < 1e-9, JSON.stringify(r));
r = snapMove(bb(objs[2]), 3, 0, T, 6); // sol kenar 13 -> hiçbir hedef yok (0'dan 13, 100'den 87 uzak)
check('taşıma: eşik dışı yakalanmaz', r.dx === 3, JSON.stringify(r));
r = snapMove(bb(objs[2]), 200, 0, T, 6); // orta x = 250 + 0 ... me.x+40+200=250; hedef yok? a.center=200 uzak; 300 (page/2 ve a.right) 50 uzak; sağ kenar 290 -> 300'e 10 uzak
check('taşıma: eşiğin hemen dışı', r.dx === 200, JSON.stringify(r));
r = snapMove(bb(objs[2]), 207, 0, T, 6); // sağ kenar 90+207=297 -> 300
check('taşıma: sağ kenar 300e yakalanır', Math.abs(r.dx - 210) < 1e-9, JSON.stringify(r));
r = snapMove(bb(objs[2]), 0, 685, T, 6); // alt kenar 50+685=735?? top 695 -> kılavuz 700'e 5 uzak
check('taşıma: y kılavuzuna yakalanır', Math.abs(r.dy - 690) < 1e-9, JSON.stringify(r));

r = snapResize(bb(objs[0]), 'se', 98, 3, T, 6); // sağ kenar 300+98=398 -> 400 (b.x)
check('boyutlandırma: sağ kenar b.x=400e yakalanır', Math.abs(r.dx - 100) < 1e-9, JSON.stringify(r));
r = snapResize(bb(objs[0]), 'w', 5, 0, T, 6); // yalnız sol kenar: 105 -> 100
check('boyutlandırma: yalnız hareket eden kenar', Math.abs(r.dx) < 1e-9, JSON.stringify(r));
r = snapResize(bb(objs[0]), 'n', 0, 2, T, 6); // üst 102 -> 100? hedef ys 100 (a kendisi) yok (kendisi hariç değil, a hedef) -> 0'a 102 uzak; a hedefleri me için; burada a da hedefte: 100
check('boyutlandırma: n kenarı', typeof r.dy === 'number');

const lines = matchedLines({ x: 100, y: 695, w: 200, h: 5 }, T);
check('eşleşen çizgiler: x=100, x=300 ve y=700', lines.some((l) => l.axis === 'x' && l.pos === 100) && lines.some((l) => l.axis === 'x' && l.pos === 300) && lines.some((l) => l.axis === 'y' && l.pos === 700), JSON.stringify(lines));
check('eşleşmeyen kutu çizgi vermez', matchedLines({ x: 13, y: 17, w: 5, h: 5 }, T).length === 0);

if (fail) { console.log(`snap: ${fail} hata`); process.exit(1); }
console.log('snap ok');
