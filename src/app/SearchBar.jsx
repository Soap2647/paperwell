import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X, Replace, Loader2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { commitBytes, withBusy } from '../store/actions';
import { searchDocument, findLineByOrigin } from '../core/modelCache';
import { replaceLineText } from '../core/pdf/editOps';
import { IconButton } from '../components/ui';
import { toast } from '../components/Toaster';
import { t } from '../i18n';

export default function SearchBar() {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const search = state.search;
    const [query, setQuery] = useState(search.query || '');
    const [replace, setReplace] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

    // Yazarken ara (belge değişince de yenile)
    useEffect(() => {
        let alive = true;
        const timer = setTimeout(async () => {
            if (!query.trim()) {
                dispatch({ type: 'SET', values: { search: { query, results: [], index: 0 } } });
                return;
            }
            setLoading(true);
            const results = await searchDocument(state.doc.bytes, state.doc.pages.length, query);
            if (!alive) return;
            setLoading(false);
            const prev = ed.get().search;
            const index = prev?.query === query ? Math.min(prev.index, Math.max(0, results.length - 1)) : 0;
            dispatch({ type: 'SET', values: { search: { query, results, index } } });
            if (results.length && prev?.query !== query) goto(results[0]);
        }, 220);
        return () => { alive = false; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, state.doc.bytes]);

    const goto = (r) => window.dispatchEvent(new CustomEvent('paperwell:goto', { detail: { index: r.pageIndex, y: r.rect.y } }));

    const step = (d) => {
        const n = search.results.length;
        if (!n) return;
        const index = (search.index + d + n) % n;
        dispatch({ type: 'SET', values: { search: { ...search, index } } });
        goto(search.results[index]);
    };

    const close = () => dispatch({ type: 'SET', values: { search: null } });

    const doReplace = async (all) => {
        const targets = all ? search.results : [search.results[search.index]].filter(Boolean);
        if (!targets.length) return;
        await withBusy(ed, t('İşleniyor...'), async () => {
            let bytes = ed.get().doc.bytes;
            // Aynı satırdaki eşleşmeleri birleştir; satır kimlikleri değişebildiği için her adımda yeniden ara
            const byLine = new Map();
            for (const r of targets) {
                const key = `${r.pageIndex}|${r.lineId}`;
                if (!byLine.has(key)) byLine.set(key, { ...r, spans: [] });
                byLine.get(key).spans.push([r.start, r.end]);
            }
            let count = 0;
            for (const r of byLine.values()) {
                let text = r.lineText;
                for (const [s, e] of [...r.spans].sort((a, b) => b[0] - a[0])) text = text.slice(0, s) + replace + text.slice(e);
                try {
                    const line = await findLineByOrigin(bytes, r.pageIndex, r.origin, r.lineText);
                    if (!line) continue;
                    const res = await replaceLineText(bytes, r.pageIndex, line.id, text);
                    bytes = res.bytes;
                    count += r.spans.length;
                } catch (err) {
                    console.warn(err);
                }
            }
            await commitBytes(ed, bytes);
            toast(`${t('Değiştirildi')}: ${count}`, 'success');
        });
    };

    const n = search.results.length;
    return (
        <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-lg pl-2 pr-0.5 h-9 animate-[popIn_.12s_ease-out]">
            <div className="flex flex-col">
                <div className="flex items-center gap-1">
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') step(e.shiftKey ? -1 : 1);
                            if (e.key === 'Escape') close();
                        }}
                        placeholder={t('Ara')}
                        className="w-36 lg:w-48 bg-transparent outline-none text-[13px]"
                    />
                    <span className="text-[11px] text-fg-3 tabular-nums w-12 text-right">
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : query ? `${n ? search.index + 1 : 0}/${n}` : ''}
                    </span>
                </div>
            </div>
            <IconButton size="sm" icon={ChevronUp} label="Önceki" onClick={() => step(-1)} disabled={!n} />
            <IconButton size="sm" icon={ChevronDown} label="Sonraki" onClick={() => step(1)} disabled={!n} />
            <IconButton size="sm" icon={Replace} label={t('Bul ve değiştir')} active={showReplace} onClick={() => setShowReplace((v) => !v)} />
            <IconButton size="sm" icon={X} label={t('Kapat')} onClick={close} />
            {showReplace && (
                <div className="absolute top-12 right-40 bg-surface border border-line rounded-xl shadow-float p-2 flex items-center gap-1.5 animate-[popIn_.12s_ease-out]">
                    <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={t('Yeni metin')} className="field w-48" onKeyDown={(e) => e.key === 'Enter' && doReplace(false)} />
                    <button className="h-8 px-2.5 rounded-lg text-xs font-medium bg-surface-3 hover:brightness-95 disabled:opacity-40" disabled={!n} onClick={() => doReplace(false)}>{t('Değiştir')}</button>
                    <button className="h-8 px-2.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40" disabled={!n} onClick={() => doReplace(true)}>{t('Tümünü değiştir')}</button>
                </div>
            )}
        </div>
    );
}
