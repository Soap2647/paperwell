// Düz renk / gradyan delik doldurma testi
import { flatFill } from '../src/core/inpaint/flatFill';

const W = 80, H = 60;
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function make(fn) {
    const img = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = fn(x, y);
        const i = (y * W + x) * 4;
        img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
    }
    return img;
}
function rect(x0, y0, x1, y1, m = new Uint8Array(W * H)) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
    return m;
}
// delik piksellerini bozuk renge boya (doldurma bunu ezmeli)
function smudge(img, m) { for (let i = 0; i < W * H; i++) if (m[i]) { img[i * 4] = 20; img[i * 4 + 1] = 20; img[i * 4 + 2] = 20; } }
function maxErr(img, ref, m) {
    let e = 0;
    for (let i = 0; i < W * H; i++) if (m[i]) for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(img[i * 4 + c] - ref[i * 4 + c]));
    return e;
}
const count = (a) => a.reduce((s, v) => s + v, 0);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// 1) düz zemin
{
    const ref = make(() => [200, 120, 40]);
    const img = ref.slice(); const m = rect(30, 20, 50, 35);
    smudge(img, m);
    const r = flatFill(img, W, H, m);
    check('düz zemin', maxErr(img, ref, m) <= 1 && count(r.rest) === 0 && r.regions === 1 && r.filled === 300, `err=${maxErr(img, ref, m)} regions=${r.regions}`);
}
// 2) doğrusal gradyan (x ve y eğimi)
{
    const ref = make((x, y) => [50 + x * 1.5, 200 - y * 2, 80 + x * 0.5 + y]);
    const img = ref.slice(); const m = rect(25, 15, 55, 40);
    smudge(img, m);
    const r = flatFill(img, W, H, m);
    check('gradyan', maxErr(img, ref, m) <= 2 && count(r.rest) === 0, `err=${maxErr(img, ref, m)}`);
}
// 3) hafif gürültü
{
    const ref = make(() => [100, 150, 200]);
    const img = make(() => [100 + Math.round(rnd() * 8 - 4), 150 + Math.round(rnd() * 8 - 4), 200 + Math.round(rnd() * 8 - 4)]);
    const m = rect(30, 20, 50, 35); smudge(img, m);
    const r = flatFill(img, W, H, m);
    check('hafif gürültü', count(r.rest) === 0 && maxErr(img, ref, m) <= 6, `err=${maxErr(img, ref, m)}`);
}
// 4) iki düz renk arasında kalan delik
{
    const img = make((x) => x < 40 ? [220, 30, 30] : [30, 30, 220]); const m = rect(30, 20, 50, 35);
    const before = img.slice();
    const r = flatFill(img, W, H, m);
    check('iki renk reddedilir', r.filled === 0 && r.regions === 0 && same(r.rest, m) && same(img, before));
}
// 5) foto benzeri gürültü
{
    const img = make(() => [128 + rnd() * 120 - 60, 128 + rnd() * 120 - 60, 128 + rnd() * 120 - 60]);
    const m = rect(30, 20, 50, 35);
    const r = flatFill(img, W, H, m);
    check('foto gürültüsü reddedilir', r.filled === 0 && same(r.rest, m));
}
// 6) iki delik: biri düz zeminde, biri iki renk sınırında
{
    const ref = make((x, y) => (y < 30 ? [90, 160, 90] : (x < 40 ? [220, 30, 30] : [30, 30, 220])));
    const img = ref.slice();
    const mFlat = rect(10, 5, 25, 15), mBad = rect(32, 40, 48, 52);
    const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = mFlat[i] | mBad[i];
    smudge(img, mFlat);
    const r = flatFill(img, W, H, m);
    check('iki delik', r.regions === 1 && maxErr(img, ref, mFlat) <= 1 && same(r.rest, mBad), `regions=${r.regions}`);
}
// 7) görüntü kenarına değen delik
{
    const ref = make(() => [60, 60, 200]);
    const img = ref.slice(); const m = rect(0, 0, 20, 15);
    smudge(img, m);
    const r = flatFill(img, W, H, m);
    check('kenar deliği', count(r.rest) === 0 && maxErr(img, ref, m) <= 1 && r.regions === 1);
}
// 8) alfa dokunulmaz
{
    const img = make(() => [10, 20, 30]);
    for (let i = 0; i < W * H; i++) img[i * 4 + 3] = (i * 7) & 255;
    const alpha = Uint8ClampedArray.from({ length: W * H }, (_, i) => img[i * 4 + 3]);
    const m = rect(30, 20, 50, 35);
    flatFill(img, W, H, m);
    let ok = true; for (let i = 0; i < W * H; i++) if (img[i * 4 + 3] !== alpha[i]) ok = false;
    check('alfa korunur', ok);
}

if (fail) { console.log(`flat-fill: ${fail} hata`); process.exit(1); }
console.log('flat-fill ok');
