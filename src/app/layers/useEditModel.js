import { useEffect, useState } from 'react';
import { getPageModel, lineViewRect } from '../../core/modelCache';
import { getPdfjsDoc } from '../../core/render';

function pdfBoxToView(geom, b) {
    const pts = [[b.x0, b.y0], [b.x1, b.y1], [b.x0, b.y1], [b.x1, b.y0]].map(([x, y]) => geom.viewPoint(x, y));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Sayfanın düzenlenebilir modeli (satırlar, görseller) ve pdf.js font eşlemesi */
export function useEditModel(bytes, index) {
    const [data, setData] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            const model = await getPageModel(bytes, index);
            if (!model || !alive) { setData(model ? null : { empty: true }); return; }
            // pdf.js'in yüklediği gömülü fontların CSS adlarını eşle (düzenleyicide aynı fontu göstermek için)
            const fontByLine = {};
            try {
                const pdf = await getPdfjsDoc(bytes);
                const p = await pdf.getPage(index + 1);
                const tc = await p.getTextContent();
                for (const line of model.lines) {
                    let best = null, bd = Infinity;
                    for (const it of tc.items) {
                        if (!it.str) continue;
                        const d = Math.hypot(it.transform[4] - line.origin[0], it.transform[5] - line.origin[1]);
                        if (d < bd) { bd = d; best = it; }
                    }
                    if (best && bd < line.fontSize * 2) fontByLine[line.id] = best.fontName;
                }
            } catch { /* yalnız görünüm */ }
            if (!alive) return;
            const lines = model.lines.filter((l) => !l.invisible).map((l) => ({ line: l, rect: lineViewRect(model.geom, l), pdfFont: fontByLine[l.id] }));
            const images = model.images.map((img) => ({ img, rect: pdfBoxToView(model.geom, img.box) })).filter((i) => i.rect.w > 4 && i.rect.h > 4);
            setData({ model, lines, images });
        })();
        return () => { alive = false; };
    }, [bytes, index]);
    return data;
}

