// Akıllı kılavuzlar: sürüklenen nesnenin kenar/orta çizgilerini sayfa kenarlarına, diğer nesnelere ve kullanıcı
// kılavuzlarına yakalar. Birimler sayfa birimidir (nokta); eşik de sayfa biriminde verilir (ekranda ~6 px).

/** Yakalama hedefleri: x (dikey çizgiler) ve y (yatay çizgiler) konumları */
export function snapTargets(objs, excludeId, page, guides = [], bboxOf) {
    const xs = [0, page.width / 2, page.width], ys = [0, page.height / 2, page.height];
    for (const o of objs) {
        if (o.id === excludeId) continue;
        const b = bboxOf(o);
        if (!(b.w > 0 || b.h > 0)) continue;
        xs.push(b.x, b.x + b.w / 2, b.x + b.w);
        ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    for (const g of guides) (g.axis === 'x' ? xs : ys).push(g.pos);
    return { xs, ys };
}

/** values içinden hedeflere en yakın olanın farkı (eşik içindeyse), yoksa null */
function nearest(values, targets, thr) {
    let best = null;
    for (const v of values) for (const t of targets) {
        const d = t - v;
        if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best;
}

/** Taşıma: kutu + ham fark → yakalanmış fark */
export function snapMove(box, dx, dy, targets, thr) {
    const sx = nearest([box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx], targets.xs, thr);
    const sy = nearest([box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy], targets.ys, thr);
    return { dx: dx + (sx ?? 0), dy: dy + (sy ?? 0) };
}

/** Boyutlandırma: yalnız hareket eden kenarlar yakalanır (tutamaç yönlerine göre) */
export function snapResize(box, handle, dx, dy, targets, thr) {
    let sx = null, sy = null;
    if (handle.includes('w')) sx = nearest([box.x + dx], targets.xs, thr);
    else if (handle.includes('e')) sx = nearest([box.x + box.w + dx], targets.xs, thr);
    if (handle.includes('n')) sy = nearest([box.y + dy], targets.ys, thr);
    else if (handle.includes('s')) sy = nearest([box.y + box.h + dy], targets.ys, thr);
    return { dx: dx + (sx ?? 0), dy: dy + (sy ?? 0) };
}

/** Sonuç kutusunun hizalandığı hedefler → çizilecek kılavuz çizgileri */
export function matchedLines(box, targets, tol = 0.4) {
    const lines = [], seen = new Set();
    const add = (axis, vals, list) => {
        for (const v of vals) for (const t of list) {
            if (Math.abs(t - v) <= tol && !seen.has(axis + t.toFixed(2))) { seen.add(axis + t.toFixed(2)); lines.push({ axis, pos: t }); }
        }
    };
    add('x', [box.x, box.x + box.w / 2, box.x + box.w], targets.xs);
    add('y', [box.y, box.y + box.h / 2, box.y + box.h], targets.ys);
    return lines;
}

export const mmText = (v) => `${Math.round(((v / 72) * 25.4) * 10) / 10}`;
