// "Nesne" aracı: tıklama → SAM maskesi, onay → nesne ayrı görsel katmanına çıkar.
import { commitBytes, withBusy } from '../store/actions';
import { newId } from '../core/pageOps';
import { isSamCached, loadSam, decodeMask } from '../core/segment';
import { isMiganCached } from '../core/inpaint/migan';
import { pageEmbedding, grabObject } from '../core/grab';
import { toast } from '../components/Toaster';
import { t } from '../i18n';

const pct = (p) => `${t('Model indiriliyor')} ${Math.round((p || 0) * 100)}%`;

/** Gerekli modeller yoksa kullanıcıdan onay alıp indirir */
async function ensureModels(ed) {
    const ai = ed.get().opts.grab.fill === 'ai';
    const [sam, migan] = await Promise.all([isSamCached(), ai ? isMiganCached() : true]);
    if (sam && migan) return true;
    const mb = (sam ? 0 : 14) + (migan ? 0 : 28);
    if (!window.confirm(t('Nesne seçimi için yapay zekâ modeli indirilecek. Bir kez iner, sonra çevrimdışı çalışır.') + ` (~${mb} MB)`)) return false;
    if (!sam) {
        const ok = await withBusy(ed, t('Model indiriliyor'), async (progress) => { await loadSam((p) => progress(p, pct(p))); return true; });
        if (!ok) return false;
    }
    return true;
}

/** Sayfaya tıklama: yeni seçim ya da (add) mevcut seçime nokta ekleme */
export async function grabClick(ed, pageIndex, point, { add = false, positive = true } = {}) {
    const s = ed.get();
    const prev = add && s.grab?.pageIndex === pageIndex ? s.grab.points : [];
    const points = [...prev, { x: point[0], y: point[1], positive }];
    if (!points.some((p) => p.positive)) return;
    if (!(await ensureModels(ed))) return;
    const page = s.doc.pages[pageIndex];
    const bytes = s.doc.bytes;
    // Kodlama birkaç saniye sürer; yalnız ilk tıklamada meşgul göstergesi
    const pending = pageEmbedding(bytes, pageIndex, page);
    const emb = pending.ready ? await pending : await withBusy(ed, t('Görsel analiz ediliyor...'), () => pending);
    if (!emb || ed.get().doc.bytes !== bytes) return;
    const mask = await decodeMask(emb.emb, points.map((p) => ({ x: p.x * emb.k, y: p.y * emb.k, positive: p.positive })));
    ed.dispatch({ type: 'SET', values: { grab: { pageIndex, points, mask: { ...mask, k: emb.k } } } });
}

export function clearGrab(ed) {
    ed.dispatch({ type: 'SET', values: { grab: null } });
}

/** Seçili nesneyi katmana çıkarır; tek geri alma adımı */
export async function applyGrab(ed) {
    const g = ed.get().grab;
    if (!g?.mask) return;
    await withBusy(ed, t('Nesne katmana çıkarılıyor...'), async (progress) => {
        const s = ed.get();
        const page = s.doc.pages[g.pageIndex];
        const res = await grabObject({
            bytes: s.doc.bytes, pageIndex: g.pageIndex, page, mask: g.mask, fill: s.opts.grab.fill,
            onProgress: (stage, p) => { if (stage === 'model') progress(p, pct(p)); },
        });
        if (!res) { toast(t('Nesne bulunamadı'), 'info'); return; }
        const obj = { id: newId('ob'), type: 'image', ...res.obj, opacity: 1 };
        ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
        await commitBytes(ed, res.bytes, { objects: { ...s.objects, [page.id]: [...(s.objects[page.id] || []), obj] } });
        ed.dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: obj.id } } });
        toast(t('Nesne ayrı katmana çıkarıldı'), 'success');
    });
}
