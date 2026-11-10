// Matris ve sayfa geometrisi yardımcıları.
// PDF matrisleri [a b c d e f] satır-vektör kuralını izler: p' = p × M

export const IDENTITY = [1, 0, 0, 1, 0, 0];

/** A × B (önce A, sonra B uygulanır) */
export function mul(A, B) {
    return [
        A[0] * B[0] + A[1] * B[2],
        A[0] * B[1] + A[1] * B[3],
        A[2] * B[0] + A[3] * B[2],
        A[2] * B[1] + A[3] * B[3],
        A[4] * B[0] + A[5] * B[2] + B[4],
        A[4] * B[1] + A[5] * B[3] + B[5],
    ];
}

export function invert(M) {
    const det = M[0] * M[3] - M[1] * M[2];
    if (!det) return [...IDENTITY];
    return [
        M[3] / det,
        -M[1] / det,
        -M[2] / det,
        M[0] / det,
        (M[2] * M[5] - M[3] * M[4]) / det,
        (M[1] * M[4] - M[0] * M[5]) / det,
    ];
}

export function apply(M, x, y) {
    return [x * M[0] + y * M[2] + M[4], x * M[1] + y * M[3] + M[5]];
}

/** Bir dikdörtgenin dönüşüm sonrası eksen hizalı sınırları */
export function transformRect(M, x0, y0, x1, y1) {
    const pts = [apply(M, x0, y0), apply(M, x1, y0), apply(M, x0, y1), apply(M, x1, y1)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Sayfanın görünüm geometrisi (pdf.js ile aynı kural):
 * görünüm uzayı = ölçek 1, sol-üst orijin, sayfanın /Rotate değeri uygulanmış.
 * @param {number[]} box - [x0, y0, x1, y1] (CropBox ya da MediaBox)
 * @param {number} rotate - 0 | 90 | 180 | 270
 */
export function pageGeometry(box, rotate = 0) {
    const [x0, y0, x1, y1] = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
    const w = x1 - x0;
    const h = y1 - y0;
    const r = ((rotate % 360) + 360) % 360;

    // PDF → görünüm matrisi
    let M;
    switch (r) {
        case 90: M = [0, 1, 1, 0, -y0, -x0]; break; // vx = y - y0, vy = x - x0
        case 180: M = [-1, 0, 0, 1, x1, -y0]; break; // vx = x1 - x, vy = y - y0
        case 270: M = [0, -1, -1, 0, y1, x1]; break; // vx = y1 - y, vy = x1 - x
        default: M = [1, 0, 0, -1, -x0, y1]; // vx = x - x0, vy = y1 - y
    }
    const inv = invert(M);
    const width = r === 90 || r === 270 ? h : w;
    const height = r === 90 || r === 270 ? w : h;

    return {
        width,
        height,
        rotate: r,
        toView: M,
        toPdf: inv,
        viewPoint: (x, y) => apply(M, x, y),
        pdfPoint: (x, y) => apply(inv, x, y),
    };
}

export function rectsIntersect(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
