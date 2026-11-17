// Düzelt aracı: görseldeki bütün yazılar listede; yanlış olanları düzelt, gereksizleri sil, tek seferde uygula
import { useEffect, useState } from 'react';
import { Check, Trash2, Undo2, X, SpellCheck } from 'lucide-react';
import { useEditor } from '../store/editor';
import { fixApplyAll, clearFix } from './fixActions';
import { checkLines, applySuggestions } from '../core/spell';
import { Button, cx } from '../components/ui';
import { t } from '../i18n';

export default function FixAllPanel({ fix }) {
    const ed = useEditor();
    const [vals, setVals] = useState(() => fix.items.map((it) => ({ text: it.text, removed: false })));
    const changed = vals.map((v, i) => v.removed || v.text.trim() !== fix.items[i].text);
    const n = changed.filter(Boolean).length;
    const set = (i, v) => setVals((a) => a.map((q, k) => (k === i ? { ...q, ...v } : q)));
    // Türkçe yazım denetimi: yapay zekânın bozduğu kelimeler (GELECEGE → GELECEĞE) önerisiyle gösterilir
    const [issues, setIssues] = useState(null);
    useEffect(() => {
        let live = true;
        checkLines(fix.items.map((it) => it.text)).then((r) => live && setIssues(r)).catch(() => live && setIssues([]));
        return () => { live = false; };
    }, [fix.items]);
    const rowIssues = (i) => (issues?.[i] || []).filter((q) => q.suggestion && vals[i].text.slice(q.index, q.index + q.word.length) === q.word);
    const fixable = fix.items.filter((_, i) => !vals[i].removed && rowIssues(i).length).length;
    const fixRow = (i) => set(i, { text: applySuggestions(vals[i].text, rowIssues(i)) });
    const fixAllSpelling = () => setVals((a) => a.map((v, i) => (v.removed || !rowIssues(i).length ? v : { ...v, text: applySuggestions(v.text, rowIssues(i)) })));
    const apply = () => fixApplyAll(ed, fix.items.flatMap((it, i) => (changed[i] ? [{ rect: it.rect, text: vals[i].removed ? '' : vals[i].text }] : [])));

    return (
        <div className="space-y-2.5">
            <p className="text-xs text-fg-2 leading-relaxed">{t('Görselde bulunan yazılar. Yanlış olanı düzeltin ya da çöp kutusuyla silin; değiştirmediklerinize dokunulmaz.')}</p>
            {issues === null && <p className="text-xs text-fg-3 flex items-center gap-1.5"><SpellCheck className="w-3.5 h-3.5" />{t('Yazım denetleniyor…')}</p>}
            {fixable > 0 && (
                <Button size="sm" icon={SpellCheck} className="w-full" onClick={fixAllSpelling}>{t('Yazım hatalarını düzelt')} ({fixable})</Button>
            )}
            <ol className="space-y-1.5">
                {fix.items.map((it, i) => (
                    <li key={i} className={cx('flex items-start gap-1.5 rounded-lg p-1', changed[i] && 'bg-accent-soft')}
                        onMouseEnter={() => ed.dispatch({ type: 'SET', values: { fix: { ...ed.get().fix, hover: i } } })}
                        onMouseLeave={() => ed.dispatch({ type: 'SET', values: { fix: { ...ed.get().fix, hover: null } } })}>
                        <span className="w-5 h-5 mt-1 shrink-0 rounded-full bg-accent text-white text-[10.5px] font-semibold flex items-center justify-center">{i + 1}</span>
                        {vals[i].removed
                            ? <span className="flex-1 text-xs text-fg-3 line-through mt-1.5 break-words">{it.text}</span>
                            : <textarea rows={1} value={vals[i].text} onChange={(e) => set(i, { text: e.target.value })}
                                className="flex-1 min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12.5px] resize-none focus:outline-none focus:border-accent" />}
                        {!vals[i].removed && rowIssues(i).length > 0 && (
                            <button type="button" onClick={() => fixRow(i)} title={t('Yazım önerisini uygula')}
                                className="shrink-0 mt-1 h-6 px-1.5 rounded-md bg-warning/15 text-[11px] font-medium text-warning hover:bg-warning/25 max-w-[110px] truncate">
                                {rowIssues(i).map((q) => q.suggestion).join(' ')}
                            </button>
                        )}
                        <button type="button" title={vals[i].removed ? t('Geri al') : t('Bu yazıyı sil')} aria-label={vals[i].removed ? t('Geri al') : t('Bu yazıyı sil')}
                            onClick={() => set(i, { removed: !vals[i].removed })}
                            className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-fg-3 hover:text-danger hover:bg-surface-2">
                            {vals[i].removed ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                    </li>
                ))}
            </ol>
            <div className="flex gap-2">
                <Button icon={X} onClick={() => clearFix(ed)}>{t('Kapat')}</Button>
                <Button variant="primary" icon={Check} className="flex-1" disabled={!n} onClick={apply}>{n ? `${n} ${t('yazıyı düzelt')}` : t('Değişiklik yok')}</Button>
            </div>
        </div>
    );
}
