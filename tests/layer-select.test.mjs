// Magic Layers maske seçimi testi (sentetik sahneler, G = 64)
import { maskInter, maskContrast, selectLayerMasks, groupLevels } from '../src/core/layerSelect';

const G = 64;
const scene = (bg = [20, 20, 20]) => {
    const rgba = new Uint8ClampedArray(G * G * 4);
    for (let i = 0; i < G * G; i++) rgba.set([...bg, 255], i * 4);
    return rgba;
};
// dikdörtgeni boyar ve eşleşen maskeyi döndürür
const rect = (rgba, x0, y0, x1, y1, col) => {
    const bin = new Uint8Array(G * G);
    let on = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { bin[y * G + x] = 1; rgba.set([...col, 255], (y * G + x) * 4); on++; }
    return { bin, on, box: [x0, y0, x1, y1], score: 0.9 };
};

let fail = 0;
const check = (name, ok, extra = '') => {
    if (!ok) fail++;
    console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra);
};

// maskInter / maskContrast
{
    const rgba = scene();
    const a = rect(rgba, 10, 10, 19, 19, [220, 220, 220]);
    const b = rect(rgba, 15, 15, 24, 24, [220, 220, 220]);
    const c = rect(rgba, 40, 40, 45, 45, [220, 220, 220]);
    check('maskInter örtüşme', maskInter(a, b, G) === 25, maskInter(a, b, G));
    check('maskInter ayrık', maskInter(a, c, G) === 0);
    const m = rect(scene(), 20, 20, 29, 29, [0, 0, 0]);
    const img = scene([20, 20, 20]);
    for (let y = 20; y <= 29; y++) for (let x = 20; x <= 29; x++) img.set([120, 20, 20, 255], (y * G + x) * 4);
    const d = maskContrast(m, img, G);
    check('maskContrast 100', Math.abs(d - 100) < 1e-6, d);
    const full = { bin: new Uint8Array(G * G).fill(1), on: G * G, box: [0, 0, G - 1, G - 1], score: 1 };
    check('maskContrast boş halka = 0', maskContrast(full, img, G) === 0);
}

// düşük kontrast elenir, parlak kalır
{
    const rgba = scene();
    const dim = rect(rgba, 5, 5, 14, 14, [40, 40, 40]);
    const bright = rect(rgba, 30, 30, 39, 39, [230, 230, 230]);
    const out = selectLayerMasks([dim, bright], rgba, G);
    check('düşük kontrast elendi, parlak kaldı', out.length === 1 && out[0] === bright && bright.level === 0 && bright.parent === null);
}

// nesne + parça: parça gider
{
    const rgba = scene();
    const obj = rect(rgba, 10, 10, 25, 25, [200, 60, 60]); // 256 < 0.08*4096
    const part = rect(rgba, 14, 14, 19, 19, [250, 250, 80]);
    const out = selectLayerMasks([part, obj], rgba, G);
    check('nesne kalır, parça gider', out.length === 1 && out[0] === obj && obj.level === 0);
}

// kapsayıcı + iki çocuk
{
    const rgba = scene();
    const box = rect(rgba, 5, 5, 40, 40, [60, 60, 200]);
    const c1 = rect(rgba, 8, 8, 17, 17, [250, 250, 80]);
    const c2 = rect(rgba, 28, 28, 37, 37, [250, 120, 20]);
    const out = selectLayerMasks([c1, box, c2], rgba, G);
    check('kapsayıcı üçü de kalır', out.length === 3);
    check('çocuklar level 0, parent kapsayıcı', c1.level === 0 && c2.level === 0 && c1.parent === box && c2.parent === box);
    check('kapsayıcı level 1, parent null', box.level === 1 && box.parent === null);
}

// üç derin iç içe
{
    const rgba = scene();
    const outer = rect(rgba, 2, 2, 60, 60, [60, 60, 200]);
    const mid = rect(rgba, 8, 8, 40, 40, [200, 60, 200]);
    const kid = rect(rgba, 12, 12, 21, 21, [250, 250, 80]);
    const out = selectLayerMasks([kid, outer, mid], rgba, G);
    check('3 derin: seviyeler 2/1/0', out.length === 3 && outer.level === 2 && mid.level === 1 && kid.level === 0, [outer.level, mid.level, kid.level]);
    check('3 derin: parent zinciri', kid.parent === mid && mid.parent === outer);
}

// kapsayıcı > nesne > parça
{
    const rgba = scene();
    const box = rect(rgba, 2, 2, 50, 50, [60, 60, 200]);
    const obj = rect(rgba, 10, 10, 25, 25, [200, 60, 60]);
    const part = rect(rgba, 14, 14, 19, 19, [250, 250, 80]);
    const out = selectLayerMasks([part, box, obj], rgba, G);
    check('kapsayıcı>nesne>parça: parça gider', out.length === 2 && !out.includes(part));
    check('nesne kalır, parent kapsayıcı, level 0', obj.parent === box && obj.level === 0 && box.level === 1);
}

// groupLevels
{
    const ms = [0, 0, 1, 3, 5, 5].map((level, i) => ({ level, i }));
    const g = groupLevels(ms, 4);
    check('groupLevels kırpma ve gruplama', g.length === 3 && g[0].length === 2 && g[1].length === 1 && g[2].length === 3, JSON.stringify(g.map((x) => x.length)));
    const g2 = groupLevels([{ level: 0 }, { level: 2 }], 4);
    check('groupLevels boş seviye atılır', g2.length === 2 && g2[1][0].level === 2);
}

// başarım: ~250 maske
{
    const rgba = scene();
    const ms = [];
    for (let i = 0; i < 250; i++) {
        const x = (i * 7) % 50, y = (i * 11) % 50, s = 3 + (i % 12);
        ms.push(rect(rgba, x, y, x + s, y + s, [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]));
    }
    const t = Date.now();
    selectLayerMasks(ms, rgba, G);
    const dt = Date.now() - t;
    check('250 maske < 1 sn', dt < 1000, dt + ' ms');
}

if (fail) { console.log(fail + ' başarısız'); process.exit(1); }
console.log('layer-select ok');
