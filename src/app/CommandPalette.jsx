// Komut arama (Ctrl+K): hangi menüde olduğunu bilmeden "netleştir", "qr", "logo şeridi" yazıp çalıştırmak.
// Arama Türkçe karakter ve büyük/küçük harf duyarsızdır; anahtar kelimeler eş anlamlıları da yakalar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { useEditor } from '../store/editor';
import { download, saveProject, upscaleImageDoc, exportPng } from '../store/actions';
import { runMagicLayers } from './magicLayersAction';
import { fixFindTexts } from './fixActions';
import { resetTour } from './tourData';
import { TOOLS } from './tools';
import { LAYOUTS, buildLayout } from './layouts';
import { getBrandKit } from '../core/brandKit';
import { getPaletteNow } from '../core/paletteStore';
import { cx } from '../components/ui';
import { t } from '../i18n';

const norm = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** @returns {{id: string, label: string, hint?: string, keys?: string, run: () => void, when?: boolean}[]} */
function commands(ed) {
    const s = ed.get(), isImage = s.doc?.kind === 'image';
    const dlg = (dialog) => () => ed.dispatch({ type: 'SET', values: { dialog } });
    const tool = (id) => () => ed.dispatch({ type: 'SET_TOOL', tool: id });
    return [
        ...TOOLS.map((x) => ({ id: `tool:${x.id}`, label: `${t('Araç')}: ${t(x.label)}`, hint: t(x.hint), keys: x.key, run: tool(x.id) })),
        ...LAYOUTS.map((l) => ({ id: `layout:${l.id}`, label: `${t('Hazır yerleşim')}: ${t(l.name)}`, hint: t(l.hint), run: () => addLayout(ed, l.id) })),
        { id: 'preflight', label: t('Yayına hazır mı? (kontrol et)'), hint: 'kontrol hata okunabilirlik yazim', run: dlg('preflight') },
        { id: 'save', label: isImage ? t('PNG olarak indir') : t('Kaydet'), hint: 'kaydet indir', keys: 'Ctrl+S', run: () => download(ed) },
        { id: 'save2x', label: t('2 kat çözünürlükte kaydet (logolar daha net)'), hint: 'yuksek kalite', run: () => download(ed, { scale: 2 }), when: isImage },
        { id: 'jpg', label: t('Küçük JPG olarak indir (WhatsApp)'), hint: 'sikistir paylas', run: () => exportPng(ed, { format: 'jpg' }) },
        { id: 'project', label: t('Projeyi kaydet (.paperwell)'), hint: 'proje duzenlenebilir', run: () => saveProject(ed) },
        { id: 'sharpen', label: t('Yapay zekâyla netleştir (2×)'), hint: 'buyut upscale kalite bulanik', run: () => upscaleImageDoc(ed, 2), when: isImage },
        { id: 'findtext', label: t('Tüm yazıları bul ve düzelt'), hint: 'ocr yazim hata', run: () => { ed.dispatch({ type: 'SET_TOOL', tool: 'fix' }); fixFindTexts(ed); }, when: isImage },
        { id: 'magic', label: t('Sihirli Katmanlar'), hint: 'katmanlara ayir', run: () => runMagicLayers(ed) },
        { id: 'social', label: t('Sosyal medyaya hazırla…'), hint: 'instagram story boyut', run: dlg('social') },
        { id: 'batch', label: t('Toplu işlem…'), hint: 'coklu sablon', run: dlg('batch') },
        { id: 'resize', label: t('Boyutu değiştir…'), hint: 'olcu oran', run: dlg('resize') },
        { id: 'history', label: t('Geçmiş ve sürümler'), hint: 'geri al surum', run: dlg('history') },
        { id: 'video', label: t('Hareketli story (video)…'), hint: 'mp4 animasyon', run: dlg('motion') },
        { id: 'bg', label: t('Arka planı kaldır'), hint: 'dekupe', run: () => ed.dispatch({ type: 'SET', values: { dialog: 'bgremove', bgTarget: null } }), when: isImage },
        { id: 'ocr', label: t('Metin tanıma (OCR)'), run: dlg('ocr') },
        { id: 'watermark', label: t('Filigran'), run: dlg('watermark') },
        { id: 'compress', label: t('Sıkıştır'), run: dlg('compress') },
        { id: 'print', label: t('Yazdır'), keys: 'Ctrl+P', run: dlg('print') },
        { id: 'undo', label: t('Geri al'), keys: 'Ctrl+Z', run: () => ed.dispatch({ type: 'UNDO' }) },
        { id: 'redo', label: t('Yinele'), keys: 'Ctrl+Y', run: () => ed.dispatch({ type: 'REDO' }) },
        { id: 'fit', label: t('Sayfaya sığdır'), hint: 'yakinlastir zoom', run: () => window.dispatchEvent(new CustomEvent('paperwell:fit', { detail: 'page' })) },
        { id: 'rulers', label: t('Cetveller'), keys: 'Ctrl+R', run: () => ed.dispatch({ type: 'SET', values: { rulers: !ed.get().rulers } }) },
        { id: 'shortcuts', label: t('Klavye kısayolları'), keys: '?', run: dlg('shortcuts') },
        { id: 'tour', label: t('Turu yeniden başlat'), hint: 'yardim tanitim', run: resetTour },
    ].filter((c) => c.when !== false);
}

async function addLayout(ed, id) {
    const s = ed.get(), page = s.doc.pages[s.page];
    const objs = await buildLayout(id, { state: s, assets: getBrandKit().assets, palette: getPaletteNow() });
    if (!objs.length) return;
    ed.dispatch({ type: 'COMMIT', bytes: s.doc.bytes, objects: { ...s.objects, [page.id]: [...(s.objects[page.id] || []), ...objs] } });
}

export default function CommandPalette({ open, onClose }) {
    const ed = useEditor();
    const [q, setQ] = useState('');
    const [i, setI] = useState(0);
    const inputRef = useRef(null);
    const list = useMemo(() => (open ? commands(ed) : []), [open, ed]);
    const hits = useMemo(() => {
        const words = norm(q).split(/\s+/).filter(Boolean);
        return list.filter((c) => { const hay = norm(`${c.label} ${c.hint || ''} ${c.id}`); return words.every((w) => hay.includes(w)); }).slice(0, 12);
    }, [list, q]);
    useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
    if (!open) return null;
    const run = (c) => { onClose(); setTimeout(c.run, 0); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(hits.length - 1, v + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
        else if (e.key === 'Enter' && hits[i]) { e.preventDefault(); run(hits[i]); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        e.stopPropagation();
    };
    return createPortal(
        <div className="fixed inset-0 z-[150] bg-black/40 flex items-start justify-center pt-[12vh] px-4" onPointerDown={onClose}>
            <div className="w-full max-w-[560px] rounded-2xl bg-surface border border-line shadow-pop overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 h-12 border-b border-line">
                    <Search className="w-4 h-4 text-fg-3" />
                    <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={onKey}
                        placeholder={t('Ne yapmak istiyorsunuz? (ör. netleştir, qr, logo şeridi)')} className="flex-1 bg-transparent outline-none text-[14px]" />
                    <kbd className="text-[11px] text-fg-3 border border-line rounded px-1.5">Esc</kbd>
                </div>
                <ul className="max-h-[50vh] overflow-y-auto py-1">
                    {hits.length === 0 && <li className="px-4 py-3 text-[13px] text-fg-3">{t('Sonuç yok')}</li>}
                    {hits.map((c, k) => (
                        <li key={c.id}>
                            <button type="button" onMouseEnter={() => setI(k)} onClick={() => run(c)}
                                className={cx('w-full text-left px-4 py-2 flex items-center gap-3', k === i ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-medium truncate">{c.label}</span>
                                    {c.hint && c.id.startsWith('tool:') && <span className="block text-[11.5px] text-fg-3 truncate">{c.hint}</span>}
                                </span>
                                {c.keys && <kbd className="text-[11px] text-fg-3 border border-line rounded px-1.5">{c.keys}</kbd>}
                                {k === i && <CornerDownLeft className="w-3.5 h-3.5 text-fg-3" />}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>,
        document.body,
    );
}
