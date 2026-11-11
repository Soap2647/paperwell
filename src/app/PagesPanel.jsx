import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Trash2, Copy, FilePlus2, FileUp, Download } from 'lucide-react';
import { useEditor } from '../store/editor';
import { reorderPages, rotatePages, deletePages, duplicatePage, insertBlankPage, insertPdfFiles, extractPages } from '../store/actions';
import { renderPageToCanvas } from '../core/render';
import { IconButton, Tooltip, cx } from '../components/ui';
import { t } from '../i18n';

const thumbCache = new WeakMap(); // bytes → Map(index → dataURL)

function Thumb({ bytes, index, page }) {
    const [src, setSrc] = useState(() => thumbCache.get(bytes)?.get(index) || null);
    const ref = useRef(null);
    useEffect(() => {
        const cached = thumbCache.get(bytes)?.get(index);
        if (cached) { setSrc(cached); return; }
        let alive = true;
        const io = new IntersectionObserver(async ([en]) => {
            if (!en.isIntersecting) return;
            io.disconnect();
            try {
                const scale = 150 / page.width;
                const c = await renderPageToCanvas(bytes, index, scale * Math.min(2, window.devicePixelRatio || 1));
                const url = c.toDataURL('image/jpeg', 0.85);
                if (!thumbCache.has(bytes)) thumbCache.set(bytes, new Map());
                thumbCache.get(bytes).set(index, url);
                if (alive) setSrc(url);
            } catch { /* yoksay */ }
        });
        io.observe(ref.current);
        return () => { alive = false; io.disconnect(); };
    }, [bytes, index, page.width]);
    return (
        <div ref={ref} className="bg-white rounded-[3px] overflow-hidden shadow-soft ring-1 ring-black/5" style={{ width: 130, aspectRatio: `${page.width} / ${page.height}` }}>
            {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full skeleton" />}
        </div>
    );
}

export default function PagesPanel() {
    const ed = useEditor();
    const { state } = ed;
    const pages = state.doc.pages;
    const [selected, setSelected] = useState(() => new Set());
    const [dragId, setDragId] = useState(null);
    const [order, setOrder] = useState(null); // sürükleme sırasında geçici sıra
    const fileRef = useRef(null);
    const activeRef = useRef(null);

    useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [state.page]);
    useEffect(() => { setSelected((s) => new Set([...s].filter((id) => pages.some((p) => p.id === id)))); }, [pages]);

    const list = order ? order.map((id) => pages.find((p) => p.id === id)) : pages;
    const selIds = selected.size ? [...selected] : [pages[state.page]?.id].filter(Boolean);

    const click = (e, p, i) => {
        if (e.ctrlKey || e.metaKey) {
            const s = new Set(selected);
            s.has(p.id) ? s.delete(p.id) : s.add(p.id);
            setSelected(s);
        } else if (e.shiftKey && selected.size) {
            const idx = pages.findIndex((x) => selected.has(x.id));
            const [a, b] = [Math.min(idx, i), Math.max(idx, i)];
            setSelected(new Set(pages.slice(a, b + 1).map((x) => x.id)));
        } else {
            setSelected(new Set());
            window.dispatchEvent(new CustomEvent('paperwell:goto', { detail: i }));
        }
    };

    return (
        <aside className="w-[188px] shrink-0 bg-surface-2 border-r border-line flex flex-col min-h-0">
            <div className="h-10 px-3 flex items-center justify-between border-b border-line">
                <span className="text-xs font-semibold text-fg-2">{t('Sayfalar')} <span className="text-fg-3 font-normal">· {pages.length}</span></span>
                {selected.size > 1 && <span className="text-[11px] text-accent-text">{selected.size} seçili</span>}
            </div>

            <div className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-3">
                {list.map((p, i) => {
                    const active = pages[state.page]?.id === p.id;
                    const isSel = selected.has(p.id);
                    return (
                        <div
                            key={p.id}
                            ref={active ? activeRef : undefined}
                            draggable
                            onDragStart={(e) => { setDragId(p.id); setOrder(pages.map((x) => x.id)); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (!dragId || dragId === p.id) return;
                                const ids = [...order];
                                const from = ids.indexOf(dragId), to = ids.indexOf(p.id);
                                ids.splice(from, 1);
                                ids.splice(to, 0, dragId);
                                setOrder(ids);
                            }}
                            onDrop={(e) => e.preventDefault()}
                            onDragEnd={() => {
                                const changed = order && order.some((id, k) => id !== pages[k].id);
                                if (changed) reorderPages(ed, order);
                                setDragId(null);
                                setOrder(null);
                            }}
                            className={cx('group relative flex flex-col items-center gap-1.5 rounded-lg p-1.5 cursor-pointer select-none', dragId === p.id && 'opacity-40')}
                            onClick={(e) => click(e, p, i)}
                        >
                            <div className={cx('rounded-[5px] p-[3px] transition-colors', active ? 'bg-accent' : isSel ? 'bg-accent/50' : 'bg-transparent group-hover:bg-line-strong')}>
                                <Thumb bytes={state.doc.bytes} index={pages.indexOf(p)} page={p} />
                            </div>
                            <span className={cx('text-[11px] tabular-nums', active ? 'text-accent-text font-semibold' : 'text-fg-3')}>{i + 1}</span>

                            <div className="absolute top-2.5 right-2.5 hidden group-hover:flex flex-col gap-0.5 bg-surface/95 border border-line rounded-lg p-0.5 shadow-pop" onClick={(e) => e.stopPropagation()}>
                                <IconButton size="sm" icon={RotateCw} label={t('Sağa döndür')} tooltipSide="right" onClick={() => rotatePages(ed, [p.id], 90)} />
                                <IconButton size="sm" icon={RotateCcw} label={t('Sola döndür')} tooltipSide="right" onClick={() => rotatePages(ed, [p.id], -90)} />
                                <IconButton size="sm" icon={Copy} label={t('Sayfayı çoğalt')} tooltipSide="right" onClick={() => duplicatePage(ed, p.id)} />
                                <IconButton size="sm" icon={Trash2} label={t('Sayfayı sil')} tooltipSide="right" onClick={() => deletePages(ed, [p.id])} className="hover:!text-danger" />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-line p-2 grid grid-cols-4 gap-1">
                <Tooltip label={t('Boş sayfa')} side="top"><button className="h-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-fg-2" onClick={() => insertBlankPage(ed, state.page)} aria-label={t('Boş sayfa')}><FilePlus2 className="w-4 h-4" /></button></Tooltip>
                <Tooltip label={t('PDF ekle')} side="top"><button className="h-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-fg-2" onClick={() => fileRef.current?.click()} aria-label={t('PDF ekle')}><FileUp className="w-4 h-4" /></button></Tooltip>
                <Tooltip label={t('Seçili sayfaları çıkar')} side="top"><button className="h-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-fg-2" onClick={() => extractPages(ed, selIds)} aria-label={t('Seçili sayfaları çıkar')}><Download className="w-4 h-4" /></button></Tooltip>
                <Tooltip label={selected.size > 1 ? `${t('Sil')} (${selected.size})` : t('Sayfayı sil')} side="top"><button className="h-8 rounded-lg hover:bg-danger-soft hover:text-danger flex items-center justify-center text-fg-2" onClick={() => deletePages(ed, selIds)} aria-label={t('Sil')}><Trash2 className="w-4 h-4" /></button></Tooltip>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                    const files = [...(e.target.files || [])];
                    e.target.value = '';
                    if (files.length) insertPdfFiles(ed, files, state.page);
                }}
            />
        </aside>
    );
}
