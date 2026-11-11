// Baskı yerleşimi: sayfa başına N sayfa, kitapçık (ortadan zımbalı), elle çift taraf için tek/çift ayrımı.
import { PDFDocument, degrees } from 'pdf-lib';

export const PAPER = {
    a4: [595.28, 841.89],
    letter: [612, 792],
    a3: [841.89, 1190.55],
};

/** Gömülü sayfayı (kendi /Rotate değeriyle) bir hücreye ortalayarak yerleştirir */
function placeInCell(out, embedded, rotate, cell, margin = 0) {
    const r = ((rotate % 360) + 360) % 360;
    const w = embedded.width, h = embedded.height;
    const dispW = r % 180 ? h : w;
    const dispH = r % 180 ? w : h;
    const cw = cell.w - margin * 2, ch = cell.h - margin * 2;
    const s = Math.min(cw / dispW, ch / dispH);
    const dw = dispW * s, dh = dispH * s;
    const cx = cell.x + margin + (cw - dw) / 2;
    const cy = cell.y + margin + (ch - dh) / 2;
    // pdf-lib saat yönünün tersine döndürür; /Rotate saat yönündedir
    let x = cx, y = cy;
    if (r === 90) { y = cy + dh; }
    else if (r === 180) { x = cx + dw; y = cy + dh; }
    else if (r === 270) { x = cx + dw; }
    out.drawPage(embedded, { x, y, xScale: s, yScale: s, rotate: degrees(-r) });
}

async function embedAll(out, src, indices) {
    const pages = indices.map((i) => (i === null ? null : src.getPage(i)));
    const real = pages.filter(Boolean);
    const embedded = real.length ? await out.embedPages(real) : [];
    let k = 0;
    return pages.map((p) => (p ? { emb: embedded[k++], rotate: p.getRotation().angle || 0 } : null));
}

/** Sayfaları seçilen kâğıda yerleştirir (n = 1, 2, 4, 6, 9) */
export async function nUp(bytes, indices, { n = 2, paper = 'a4', margin = 12, gutter = 8 } = {}) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const out = await PDFDocument.create();
    const grid = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3] }[n] || [2, 1];
    // 2 ve 6'lı yerleşimde yatay kâğıt
    const [pw, ph] = PAPER[paper] || PAPER.a4;
    const landscape = n === 2 || n === 6;
    const W = landscape ? ph : pw, H = landscape ? pw : ph;
    const [cols, rows] = grid;
    const cellW = (W - margin * 2 - gutter * (cols - 1)) / cols;
    const cellH = (H - margin * 2 - gutter * (rows - 1)) / rows;
    const items = await embedAll(out, src, indices);
    for (let i = 0; i < items.length; i += n) {
        const sheet = out.addPage([W, H]);
        items.slice(i, i + n).forEach((it, k) => {
            if (!it) return;
            const col = k % cols, row = Math.floor(k / cols);
            const cell = { x: margin + col * (cellW + gutter), y: H - margin - (row + 1) * cellH - row * gutter, w: cellW, h: cellH };
            placeInCell(sheet, it.emb, it.rotate, cell, 2);
        });
    }
    return out.save();
}

/** Belgeyi tek tek kâğıda (gerekirse ölçekleyerek) yerleştirir */
export async function fitToPaper(bytes, indices, { paper = 'a4', margin = 0 } = {}) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const out = await PDFDocument.create();
    const items = await embedAll(out, src, indices);
    const [pw, ph] = PAPER[paper] || PAPER.a4;
    for (const it of items) {
        const r = it.rotate % 180;
        const isLand = (r ? it.emb.height : it.emb.width) > (r ? it.emb.width : it.emb.height);
        const [W, H] = isLand ? [ph, pw] : [pw, ph];
        const sheet = out.addPage([W, H]);
        placeInCell(sheet, it.emb, it.rotate, { x: 0, y: 0, w: W, h: H }, margin);
    }
    return out.save();
}

/** Kitapçık: sayfalar 4'ün katına tamamlanır, her yaprak ön/arka olarak sıralanır (kısa kenardan çevir) */
export async function booklet(bytes, indices, { paper = 'a4', margin = 10 } = {}) {
    const list = [...indices];
    while (list.length % 4) list.push(null);
    const order = [];
    const n = list.length;
    for (let i = 0; i < n / 2; i += 2) {
        order.push(list[n - 1 - i], list[i]); // ön yüz: sol = son, sağ = ilk
        order.push(list[i + 1], list[n - 2 - i]); // arka yüz
    }
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const out = await PDFDocument.create();
    const items = await embedAll(out, src, order);
    const [pw, ph] = PAPER[paper] || PAPER.a4;
    const W = ph, H = pw; // yatay
    for (let i = 0; i < items.length; i += 2) {
        const sheet = out.addPage([W, H]);
        [items[i], items[i + 1]].forEach((it, k) => {
            if (it) placeInCell(sheet, it.emb, it.rotate, { x: k * (W / 2), y: 0, w: W / 2, h: H }, margin);
        });
    }
    return out.save();
}

/** Elle çift taraf: önce tek sayfalar, sonra çift sayfalar ters sırada */
export async function splitForManualDuplex(bytes) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const count = src.getPageCount();
    const make = async (idx, leadingBlank) => {
        const d = await PDFDocument.create();
        if (leadingBlank) {
            const last = src.getPage(count - 1).getSize();
            d.addPage([last.width, last.height]);
        }
        const pages = await d.copyPages(src, idx);
        pages.forEach((p) => d.addPage(p));
        return d.save();
    };
    const odd = [], even = [];
    for (let i = 0; i < count; i++) (i % 2 === 0 ? odd : even).push(i);
    // Tek sayıda sayfa varsa çevrilen destenin en üstündeki son yaprağın arkası boş kalmalı
    return { front: await make(odd), back: even.length ? await make(even.reverse(), count % 2 === 1) : null, sheets: odd.length };
}
