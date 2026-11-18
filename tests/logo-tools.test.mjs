// Logo araçları: düz zemin silme (içteki beyaz korunur, kenar halesi kalmaz), kırpma kutusu, tek renge boyama
import { removeFlatBg, trimBox, tintPixels } from '../src/core/logoTools';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// 100×100 beyaz zemin; ortada kırmızı halka (yarıçap 20-35, kenarı yumuşak), halkanın içi beyaz
const W = 100, H = 100, d = new Uint8ClampedArray(W * H * 4);
const ring = (x, y) => { const r = Math.hypot(x - 50, y - 50); return r >= 20 && r < 35; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (ring(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) a++;
    a /= 16;
    const i = (y * W + x) * 4;
    d[i] = 255 * (1 - a) + 220 * a; d[i + 1] = 255 * (1 - a) + 30 * a; d[i + 2] = 255 * (1 - a) + 30 * a; d[i + 3] = 255;
}
check('düz zemin bulunur', removeFlatBg(d, W, H));
const A = (x, y) => d[(y * W + x) * 4 + 3];
check('köşe saydam', A(2, 2) === 0 && A(97, 50) === 0);
check('halka opak kalır', A(50, 22) === 255 && A(22, 50) === 255);
check('halkanın içindeki beyaz korunur', A(50, 50) === 255);
// dış kenar geçiş pikseli: rengi beyaza değil kırmızıya çekilmiş olmalı (hale yok)
let halo = 0;
for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 0 && d[i * 4 + 3] < 255 && d[i * 4 + 1] > 120) halo++;
check('yarı saydam kenarda beyaz hale yok', halo === 0, `hale ${halo} px`);
const b = trimBox(d, W, H);
check('kırpma kutusu halkayı sarar', b && Math.abs(b.x - 15) <= 1 && Math.abs(b.w - 70) <= 2, JSON.stringify(b));
tintPixels(d, [255, 255, 255]);
check('tek renk: alfa aynı, renk beyaz', A(50, 22) === 255 && d[(22 * W + 50) * 4] === 255 && A(2, 2) === 0);

// Fotoğraf benzeri (düz olmayan) zemin: dokunulmaz
const n = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { n[i * 4] = (i * 37) % 256; n[i * 4 + 1] = (i * 91) % 256; n[i * 4 + 2] = (i * 13) % 256; n[i * 4 + 3] = 255; }
check('düz olmayan zemin: silinmez', !removeFlatBg(n, W, H) && n[3] === 255);

// Resme gömülü damalı "saydamlık" deseni (gri-beyaz 8 px kareler, kare sınırları yumuşak) üstünde mavi kare logo
{
    const c = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = (((x + 3) >> 3) + ((y + 3) >> 3)) % 2 ? 132 : 196;
        const edge = (x + 3) % 8 === 0 || (y + 3) % 8 === 0 ? 164 : v; // karelerin arasındaki karışım pikseli
        const logo = x >= 30 && x < 70 && y >= 30 && y < 70;
        c[i] = logo ? 30 : edge; c[i + 1] = logo ? 90 : edge; c[i + 2] = logo ? 220 : edge; c[i + 3] = 255;
    }
    check('damalı zemin bulunur', removeFlatBg(c, W, H));
    let left = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!(x >= 29 && x < 71 && y >= 29 && y < 71) && c[(y * W + x) * 4 + 3] > 0) left++;
    check('damalı zeminde kare çizgisi bile kalmaz', left === 0, `kalan ${left} px`);
    check('damalı zeminde logo kalır', c[(50 * W + 50) * 4 + 3] === 255 && c[(50 * W + 50) * 4 + 2] === 220);
}

if (fail) { console.log(`logo-tools: ${fail} hata`); process.exit(1); }
console.log('logo-tools ok');
