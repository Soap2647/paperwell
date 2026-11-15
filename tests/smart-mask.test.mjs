// "Düzelt" maskesi: bilinen sahnelerde eksik kesme (atlanan ön plan) ve fazla kesme (gereksiz silinen zemin) ölçümü
import { smartMask, inkStats } from '../src/core/smartMask';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// W×H sahne: zemin fonksiyonu + kenarı yumuşatılmış (4×4 süper örnekleme) şekil; truth = şeklin kapsama oranı
function scene(W, H, bg, inside, fgColor, noise = 0) {
    const rgba = new Uint8ClampedArray(W * H * 4), cover = new Float32Array(W * H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) c++;
        const a = c / 16, b = bg(x, y), i = y * W + x;
        cover[i] = a;
        for (let k = 0; k < 3; k++) rgba[i * 4 + k] = b[k] * (1 - a) + fgColor[k] * a + noise * rnd();
        rgba[i * 4 + 3] = 255;
    }
    return { rgba, cover };
}

function measure(name, W, H, sc, box, { maxOver }) {
    const r = smartMask(sc.rgba, W, H, box);
    let fgN = 0, missed = 0, over = 0;
    for (let i = 0; i < W * H; i++) {
        if (sc.cover[i] > 0.1) { fgN++; if (!r.mask[i]) missed++; }
        else if (r.mask[i]) over++;
    }
    const overRatio = over / fgN;
    check(`${name}: ön plan eksiksiz silinir`, missed === 0, `atlanan ${missed}/${fgN} px`);
    check(`${name}: fazla kesme sınırlı`, !r.whole && overRatio <= maxOver, `fazla ${over} px (ön planın %${(overRatio * 100).toFixed(0)}), whole=${r.whole}`);
    return r;
}

// 1) Düz zemin üstünde daire logo
{
    const W = 200, H = 160;
    const sc = scene(W, H, () => [245, 245, 240], (x, y) => (x - 100) ** 2 + (y - 80) ** 2 < 35 ** 2, [220, 40, 40]);
    const r = measure('düz zemin + daire', W, H, sc, { x0: 50, y0: 30, x1: 150, y1: 130 }, { maxOver: 0.35 });
    check('düz zemin: ön plan rengi bulunur', r.fg && Math.abs(r.fg[0] - 220) < 12 && Math.abs(r.fg[1] - 40) < 12, JSON.stringify(r.fg));
}
// 2) Degrade zemin (mavi → mor) üstünde yazı benzeri çubuklar
{
    const W = 240, H = 120;
    const bars = (x, y) => y > 45 && y < 75 && [[60, 72], [84, 92], [104, 130], [142, 150], [162, 182]].some(([a, b]) => x >= a && x < b);
    const sc = scene(W, H, (x, y) => [40 + x * 0.5, 60 + y * 0.3, 200 - x * 0.2], bars, [255, 255, 255]);
    measure('degrade zemin + yazı', W, H, sc, { x0: 40, y0: 25, x1: 200, y1: 95 }, { maxOver: 0.8 }); // ince harflerde 3 px'lik güvenlik bandı oransal olarak büyük
}
// 3) Gürültülü (fotoğraf benzeri) zemin
{
    const W = 200, H = 160;
    const sc = scene(W, H, (x, y) => [120 + 20 * Math.sin(x / 9), 140 + 15 * Math.cos(y / 7), 110], (x, y) => Math.abs(x - 100) + Math.abs(y - 80) < 30, [20, 20, 30], 6);
    measure('dokulu zemin + elmas', W, H, sc, { x0: 55, y0: 35, x1: 145, y1: 125 }, { maxOver: 0.6 });
}
// 4) İki renkli zemin (kutu iki rengin sınırında) üstünde simge
{
    const W = 200, H = 160;
    const sc = scene(W, H, (x) => (x < 100 ? [250, 250, 250] : [30, 30, 60]), (x, y) => (x - 100) ** 2 + (y - 80) ** 2 < 20 ** 2, [250, 190, 0]);
    measure('iki renkli zemin + simge', W, H, sc, { x0: 60, y0: 40, x1: 140, y1: 120 }, { maxOver: 0.8 });
}
// 5) Mürekkep ölçüsü: kalın gövde (yüksekliğin %16'sı) ile ince gövde (%9) ayrılır, sınır kutusu doğru
{
    const W = 300, H = 120;
    const stems = (sw) => (x, y) => y >= 30 && y < 90 && [40, 90, 140, 190, 240].some((a) => x >= a && x < a + sw);
    const bold = smartMask(scene(W, H, () => [20, 30, 90], stems(9.6), [255, 255, 255]).rgba, W, H, { x0: 10, y0: 10, x1: 290, y1: 110 });
    const thin = smartMask(scene(W, H, () => [20, 30, 90], stems(5.4), [255, 255, 255]).rgba, W, H, { x0: 10, y0: 10, x1: 290, y1: 110 });
    const sb = inkStats(bold.core, W, H), st = inkStats(thin.core, W, H);
    check('mürekkep: kalın > 0.13 > ince', sb.stroke > 0.13 && st.stroke < 0.13, `kalın ${sb.stroke.toFixed(3)} ince ${st.stroke.toFixed(3)}`);
    check('mürekkep kutusu', Math.abs(sb.box.y0 - 30) <= 1 && Math.abs(sb.box.y1 - 90) <= 1 && Math.abs(sb.box.x0 - 40) <= 1, JSON.stringify(sb.box));
}
// 6) Kutuya yandaki nesnenin parçası taşmış: ortadaki nesne silinir, kenara değen parça kalır (gerçek afişte parıltı + yeşil kareler)
{
    const W = 200, H = 200;
    const star = (x, y) => Math.abs(x - 90) ** 0.6 + Math.abs(y - 100) ** 0.6 < 9;
    const square = (x, y) => x >= 135 && x < 175 && y >= 120 && y < 160; // kutunun sağ kenarı 150: kare kesiliyor
    const sc = scene(W, H, () => [15, 18, 20], (x, y) => star(x, y) || square(x, y), [240, 240, 200]);
    const r = smartMask(sc.rgba, W, H, { x0: 40, y0: 50, x1: 150, y1: 150 });
    let starMissed = 0, squareHit = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (star(x + 0.5, y + 0.5) && !r.mask[i]) starMissed++;
        if (square(x + 0.5, y + 0.5) && x >= 140 && x < 150 && r.mask[i]) squareHit++;
    }
    check('taşan komşu parça silinmez, ortadaki nesne silinir', starMissed === 0 && squareHit === 0, `yıldızda atlanan ${starMissed}, karede silinen ${squareHit}`);
}
// 7) Kutu nesneye sıkı çizilmiş (her parça kenara değiyor): hepsi silinir
{
    const W = 160, H = 100;
    const sc = scene(W, H, () => [250, 250, 250], (x, y) => x >= 30 && x < 130 && y >= 30 && y < 70, [20, 90, 200]);
    const r = smartMask(sc.rgba, W, H, { x0: 31, y0: 28, x1: 129, y1: 72 });
    let missed = 0;
    for (let y = 30; y < 70; y++) for (let x = 32; x < 128; x++) if (!r.mask[y * W + x]) missed++;
    check('sıkı kutu: kenara değen tek nesne yine silinir', missed === 0, `atlanan ${missed}`);
}
// 8) Kutu büyük nesneye sıkı çizilmiş, içinde küçük ayrıntı var (dizüstü + ekrandaki kod): ikisi de silinir
{
    const W = 220, H = 160;
    const body = (x, y) => x >= 30 && x < 190 && y >= 30 && y < 130 && !(x >= 50 && x < 170 && y >= 45 && y < 115);
    const code = (x, y) => x >= 80 && x < 140 && y >= 70 && y < 80;
    const sc = scene(W, H, () => [10, 12, 14], (x, y) => body(x, y) || code(x, y), [200, 200, 205]);
    const r = smartMask(sc.rgba, W, H, { x0: 32, y0: 28, x1: 188, y1: 132 });
    let missed = 0;
    for (let y = 30; y < 130; y++) for (let x = 34; x < 186; x++) if ((body(x + 0.5, y + 0.5) || code(x + 0.5, y + 0.5)) && !r.mask[y * W + x]) missed++;
    check('kenara değen büyük nesne ve içindeki ayrıntı birlikte silinir', missed === 0, `atlanan ${missed}`);
}
// 9) Kutu yalnız zemin: tamamı silinir (kullanıcı ne çizdiyse)
{
    const W = 100, H = 100;
    const sc = scene(W, H, () => [200, 200, 200], () => false, [0, 0, 0]);
    check('boş kutu: kutunun tamamı', smartMask(sc.rgba, W, H, { x0: 20, y0: 20, x1: 80, y1: 80 }).whole);
}

if (fail) { console.log(`smart-mask: ${fail} hata`); process.exit(1); }
console.log('smart-mask ok');
