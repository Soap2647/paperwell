// Dolgu dokusu: pürüzsüz dolguya çevresi kadar gren eklenir; düz zemine dokunulmaz
import { matchGrain } from '../src/core/inpaint/refine';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const W = 120, H = 120;
const hole = (x, y) => x >= 40 && x < 80 && y >= 40 && y < 80;
const make = (noise) => {
    const img = new Uint8ClampedArray(W * H * 4), m = new Uint8Array(W * H);
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, v = hole(x, y) ? 120 : 120 + noise * rnd();
        img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = v; img[i * 4 + 3] = 255;
        m[i] = hole(x, y) ? 1 : 0;
    }
    return { img, m };
};
const sd = (img, sel) => {
    let s = 0, s2 = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sel(x, y)) { const v = img[(y * W + x) * 4]; s += v; s2 += v * v; n++; }
    return Math.sqrt(s2 / n - (s / n) ** 2);
};
{
    const { img, m } = make(20);
    const before = sd(img, hole);
    const added = matchGrain(img, m, W, H);
    const inside = sd(img, hole), outside = sd(img, (x, y) => !hole(x, y));
    check('dokulu zemin: dolguya gren eklenir', before === 0 && added > 0 && inside > outside * 0.5 && inside < outside * 1.5, `iç ${inside.toFixed(1)} dış ${outside.toFixed(1)}`);
}
{
    const { img, m } = make(0);
    check('düz zemin: dokunulmaz', matchGrain(img, m, W, H) === 0 && sd(img, hole) === 0);
}
if (fail) { console.log(`refine: ${fail} hata`); process.exit(1); }
console.log('refine ok');
