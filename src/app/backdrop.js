// Sayfanın küçük bir görüntüsü: yeni öğeyi sakin bir yere koymak ve yazının zeminde okunup okunmadığını ölçmek için
import { useEffect, useState } from 'react';
import { renderPageToCanvas } from '../core/render';
import { calmestSpot, paletteOf } from '../core/placement';
import { bbox } from './objects';

const cache = new WeakMap(); // bytes → Map(sayfa → backdrop)

/** @returns {Promise<{data: Uint8ClampedArray, W: number, H: number, k: number}>} k: piksel / pt */
export async function getBackdrop(bytes, pageIndex, page) {
    let m = cache.get(bytes);
    if (!m) { m = new Map(); cache.set(bytes, m); }
    if (!m.has(pageIndex)) {
        m.set(pageIndex, (async () => {
            const k = 320 / Math.max(page.width, page.height);
            const c = await renderPageToCanvas(bytes, pageIndex, k, '#fff');
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            return { data, W: c.width, H: c.height, k };
        })());
    }
    return m.get(pageIndex);
}

/** Kutunun altındaki zeminin ortanca rengi */
export function sampleBackdrop(bd, box) {
    const x0 = Math.max(0, Math.floor(box.x * bd.k)), y0 = Math.max(0, Math.floor(box.y * bd.k));
    const x1 = Math.min(bd.W, Math.ceil((box.x + box.w) * bd.k)), y1 = Math.min(bd.H, Math.ceil((box.y + box.h) * bd.k));
    const ch = [[], [], []];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) ch[c].push(bd.data[(y * bd.W + x) * 4 + c]);
    if (!ch[0].length) return [255, 255, 255];
    return ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
}

/**
 * Yeni öğe için sayfanın en sakin yeri (pt). extra: aynı anda eklenen diğer öğelerin kutuları (pt)
 * @returns {Promise<{x:number,y:number}>}
 */
export async function smartSpot(state, w, h, extra = []) {
    const page = state.doc.pages[state.page];
    try {
        const bd = await getBackdrop(state.doc.bytes, state.page, page);
        const lum = new Float32Array(bd.W * bd.H);
        for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * bd.data[i * 4] + 0.587 * bd.data[i * 4 + 1] + 0.114 * bd.data[i * 4 + 2];
        const big = (o) => o.type === 'image' && o.w * o.h > page.width * page.height * 0.6; // sayfayı kaplayan ana görsel engel sayılmaz
        const taken = [...(state.objects[page.id] || []).filter((o) => !big(o) && !o.hidden).map(bbox), ...extra]
            .map((b) => ({ x: b.x * bd.k, y: b.y * bd.k, w: b.w * bd.k, h: b.h * bd.k }));
        const p = calmestSpot(lum, bd.W, bd.H, w * bd.k, h * bd.k, taken);
        return { x: p.x / bd.k, y: p.y / bd.k };
    } catch {
        return { x: (page.width - w) / 2, y: (page.height - h) / 2 };
    }
}

/** Seçili sayfanın zemini (okunabilirlik denetimi için); yüklenene kadar null */
export function useBackdrop(state) {
    const [bd, setBd] = useState(null);
    const bytes = state.doc?.bytes, idx = state.page, page = state.doc?.pages[state.page];
    useEffect(() => {
        let live = true;
        if (bytes && page) getBackdrop(bytes, idx, page).then((b) => live && setBd(b)).catch(() => {});
        return () => { live = false; };
    }, [bytes, idx, page]);
    return bd;
}

/** Afişin renk paleti (sayfa görüntüsünden bir kez hesaplanır) */
export async function getPalette(bytes, pageIndex, page) {
    const bd = await getBackdrop(bytes, pageIndex, page);
    if (!bd.palette) bd.palette = paletteOf(bd.data, bd.W, bd.H, 6);
    return bd.palette;
}
