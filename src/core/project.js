// Paperwell projesi (.paperwell): belge + üstündeki bütün nesneler düzenlenebilir halde. Bir ZIP:
//   paperwell.json  sürüm, belge bilgisi, sayfalar, nesneler (görseller dataURL olarak), karartmalar, form değerleri
//   document.pdf    belgenin şu anki hali (Düzelt ile silinenler dahil)
//   original.pdf    açıldığı ilk hali (Önce / sonra karşılaştırması için; şu ankiyle aynıysa yazılmaz)
import JSZip from 'jszip';

export const PROJECT_EXT = 'paperwell';
const VERSION = 1;
const DOC_KEYS = ['name', 'kind', 'imageSize', 'mime', 'pixelSize', 'background'];

/** Editör durumundan proje dosyası (Uint8Array) */
export async function serializeProject(s) {
    const zip = new JSZip();
    const doc = Object.fromEntries(DOC_KEYS.filter((k) => s.doc[k] !== undefined).map((k) => [k, s.doc[k]]));
    zip.file('paperwell.json', JSON.stringify({
        app: 'Paperwell', version: VERSION, savedAt: new Date().toISOString(),
        doc, pages: s.doc.pages, objects: s.objects, redactions: s.redactions, forms: s.forms, originalPages: s.original?.pages,
    }));
    zip.file('document.pdf', s.doc.bytes);
    if (s.original?.bytes && s.original.bytes !== s.doc.bytes) zip.file('original.pdf', s.original.bytes);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } });
}

/** Proje dosyasını okur; LOAD eylemine verilecek parçaları döner */
export async function parseProject(bytes) {
    let zip;
    try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('Bu bir Paperwell projesi değil'); }
    const meta = zip.file('paperwell.json');
    const pdf = zip.file('document.pdf');
    if (!meta || !pdf) throw new Error('Bu bir Paperwell projesi değil');
    const j = JSON.parse(await meta.async('string'));
    if (j.version > VERSION) throw new Error('Bu proje Paperwell\'in daha yeni bir sürümüyle kaydedilmiş; uygulamayı güncelleyin');
    const docBytes = await pdf.async('uint8array');
    const orig = zip.file('original.pdf');
    const original = orig ? { bytes: await orig.async('uint8array'), pages: j.originalPages || j.pages } : null;
    return {
        doc: { ...j.doc, bytes: docBytes, pages: j.pages },
        objects: j.objects || {},
        redactions: j.redactions || {},
        forms: j.forms || { values: {}, flatten: false },
        original,
    };
}

export const isProjectFile = (file) => /\.paperwell$/i.test(file?.name || '');
