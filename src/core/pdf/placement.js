// Görünüm uzayındaki (sol-üst orijin, döndürülmüş) bir kutuyu PDF çizim parametrelerine çevirir.
import { degrees } from 'pdf-lib';

/**
 * drawImage/drawText için: görünümde dik duran içerik, döndürülmüş sayfada da dik görünsün.
 * @param {ReturnType<import('./geometry').pageGeometry>} geom
 */
export function viewBoxToPdf(geom, { x, y, w, h }) {
    const [px, py] = geom.pdfPoint(x, y + h); // görünümde sol-alt köşe
    return { x: px, y: py, width: w, height: h, rotate: degrees(geom.rotate) };
}

/** Görünüm noktasını (taban çizgisi başlangıcı gibi) PDF noktasına çevirir */
export function viewPointToPdf(geom, x, y) {
    const [px, py] = geom.pdfPoint(x, y);
    return { x: px, y: py, rotate: degrees(geom.rotate) };
}
