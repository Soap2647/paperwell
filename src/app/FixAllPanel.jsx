// Düzelt aracı: görseldeki bütün yazılar listede; yanlış olanları düzelt, gereksizleri sil, tek seferde uygula
import { useState } from 'react';
import { Check, Trash2, Undo2, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { fixApplyAll, clearFix } from './fixActions';
import { Button, cx } from '../components/ui';
import { t } from '../i18n';

export default function FixAllPanel({ fix }) {
    const ed = useEditor();
    const [vals, setVals] = useState(() => fix.items.map((it) => ({ text: it.text, removed: false })));
    const changed = vals.map((v, i) => v.removed || v.text.trim() !== fix.items[i].text);
    const n = changed.filter(Boolean).length;
    const set = (i, v) => setVals((a) => a.map((q, k) => (k === i ? { ...q, ...v } : q)));
    const apply = () => fixApplyAll(ed, fix.items.flatMap((it, i) => (changed[i] ? [{ rect: it.rect, text: vals[i].removed ? '' : vals[i].text }] : [])));

    return (
        <div className="space-y-2.5">
            <p className="text-xs text-fg-2 leading-relaxed">{t('Görselde bulunan yazılar. Yanlış olanı düzeltin ya da çöp kutusuyla silin; değiştirmediklerinize dokunulmaz.')}</p>
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
