// PDF formları (AcroForm): alanları okur, değerleri yazar, istenirse düzleştirir.
import { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from 'pdf-lib';
import { getPdfjsDoc } from './render';
import { getPageModel } from './modelCache';
import { embedFallbackFont } from './fonts';

const cache = new WeakMap(); // bytes → Map(pageIndex → Promise<fields>)

/** Sayfadaki form alanları (görünüm koordinatlarında) */
export function readPageFields(bytes, pageIndex) {
    if (!cache.has(bytes)) cache.set(bytes, new Map());
    const m = cache.get(bytes);
    if (!m.has(pageIndex)) {
        m.set(pageIndex, (async () => {
            const pdf = await getPdfjsDoc(bytes);
            const page = await pdf.getPage(pageIndex + 1);
            const annots = await page.getAnnotations({ intent: 'display' });
            const widgets = annots.filter((a) => a.subtype === 'Widget' && a.fieldName && !a.pushButton && a.fieldType !== 'Sig' && !a.hidden);
            if (!widgets.length) return [];
            const { geom } = await getPageModel(bytes, pageIndex);
            return widgets.map((a) => {
                const [x1, y1, x2, y2] = a.rect;
                const p1 = geom.viewPoint(x1, y1), p2 = geom.viewPoint(x2, y2);
                const kind = a.fieldType === 'Tx' ? 'text'
                    : a.checkBox ? 'checkbox'
                        : a.radioButton ? 'radio'
                            : a.fieldType === 'Ch' ? (a.combo ? 'dropdown' : 'list') : 'other';
                return {
                    id: a.id,
                    name: a.fieldName,
                    kind,
                    x: Math.min(p1[0], p2[0]),
                    y: Math.min(p1[1], p2[1]),
                    w: Math.abs(p2[0] - p1[0]),
                    h: Math.abs(p2[1] - p1[1]),
                    value: a.fieldValue,
                    exportValue: a.exportValue || a.buttonValue,
                    options: (a.options || []).map((o) => ({ value: o.exportValue ?? o.displayValue, label: o.displayValue ?? o.exportValue })),
                    multiline: !!a.multiLine,
                    readOnly: !!a.readOnly,
                    maxLen: a.maxLen || undefined,
                    align: ['left', 'center', 'right'][a.textAlignment || 0],
                    fontSize: a.defaultAppearanceData?.fontSize || 0,
                    label: a.alternativeText || a.fieldName,
                };
            }).filter((f) => f.kind !== 'other');
        })().catch(() => []));
    }
    return m.get(pageIndex);
}

export async function documentHasForm(bytes, pageCount) {
    for (let i = 0; i < Math.min(pageCount, 50); i++) {
        if ((await readPageFields(bytes, i)).length) return true;
    }
    return false;
}

/**
 * Değerleri pdf-lib belgesine yazar. Türkçe karakterler için Unicode font ile görünüm üretir.
 * @param {Record<string, string|boolean|string[]>} values
 */
export async function fillForm(doc, values, { flatten = false } = {}) {
    const names = Object.keys(values || {});
    if (!names.length && !flatten) return;
    const form = doc.getForm();
    for (const name of names) {
        let field;
        try { field = form.getField(name); } catch { continue; }
        const v = values[name];
        try {
            if (field instanceof PDFTextField) field.setText(v ? String(v) : '');
            else if (field instanceof PDFCheckBox) (v ? field.check() : field.uncheck());
            else if (field instanceof PDFRadioGroup) {
                if (!v) { field.clear(); continue; }
                // pdf.js görünüm durum adını verir ("0", "1"...); /Opt varsa gerçek seçenek değerine çevir
                const opts = field.getOptions();
                const s = String(v);
                field.select(opts.includes(s) ? s : /^\d+$/.test(s) && opts[Number(s)] ? opts[Number(s)] : s);
            }
            else if (field instanceof PDFDropdown || field instanceof PDFOptionList) { if (v) field.select(v); else field.clear(); }
        } catch (e) {
            console.warn('Form alanı yazılamadı', name, e);
        }
    }
    const font = await embedFallbackFont(doc, 'sans', false, false);
    form.updateFieldAppearances(font);
    if (flatten) form.flatten({ updateFieldAppearances: false });
}
