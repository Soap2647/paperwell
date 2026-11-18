// "Yayına hazır mı?": paylaşmadan önce tek tıkla kontrol listesi; her sorunun yanında göster / düzelt
import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleAlert, Info, Wand2, Eye, RefreshCw } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { upscaleImageDoc } from '../../store/actions';
import { useBrandKit } from '../../core/brandKit';
import { logoEdit } from '../../core/logoTools';
import { checkLines, applySuggestions } from '../../core/spell';
import { Button, Dialog, Spinner, cx } from '../../components/ui';
import { t } from '../../i18n';
import { runChecks } from '../quality';
import { bbox, moveBy } from '../objects';

const ICON = { error: CircleAlert, warn: CircleAlert, info: Info };
const TONE = { error: 'text-danger', warn: 'text-warning', info: 'text-accent' };

export default function PreflightDialog({ open, onClose }) {
    const ed = useEditor();
    const kit = useBrandKit();
    const [issues, setIssues] = useState(null);

    const check = useCallback(async () => {
        setIssues(null);
        setIssues(await runChecks(ed.get(), { brandAssets: kit.assets, checkSpelling: checkLines }));
    }, [ed, kit.assets]);
    useEffect(() => { if (open) check(); }, [open, check]);

    const find = (id) => { const s = ed.get(); return (s.objects[s.doc.pages[s.page].id] || []).find((o) => o.id === id); };
    const update = (id, changes) => ed.dispatch({ type: 'UPDATE_OBJECT', id, changes });
    // sorun türüne göre otomatik düzeltme; false: bu tür elle yapılır
    const fixOne = async (q) => {
        const s = ed.get(), page = s.doc.pages[s.page], o = q.id && find(q.id);
        switch (q.kind) {
            case 'readability':
                if (o.type === 'text') update(o.id, { color: q.data.best, gradient: undefined });
                else { const ch = await logoEdit(o, 'tint', q.data.best).catch(() => null); if (ch) update(o.id, o.origSrc ? ch : { ...ch, origSrc: o.src }); }
                return true;
            case 'small': update(o.id, { size: Math.round(Math.min(page.width, page.height) * 0.026) }); return true;
            case 'spelling': update(o.id, { text: applySuggestions(o.text, q.data) }); return true;
            case 'offpage':
            case 'safearea': {
                const b = bbox(o);
                const top = q.kind === 'safearea' ? page.height * 0.14 : 0, bottom = q.kind === 'safearea' ? page.height * 0.8 : page.height;
                const nx = Math.max(0, Math.min(page.width - b.w, b.x)), ny = Math.max(top, Math.min(bottom - b.h, b.y));
                update(o.id, moveBy(o, nx - b.x, ny - b.y));
                return true;
            }
            case 'resolution': onClose(); await upscaleImageDoc(ed, 2); return true;
            case 'nologo': onClose(); ed.dispatch({ type: 'SET_TOOL', tool: 'brand' }); return true;
            default: return false;
        }
    };
    const fix = async (q) => { await fixOne(q); if (!['resolution', 'nologo'].includes(q.kind)) check(); };
    const auto = (issues || []).filter((q) => !['resolution', 'nologo'].includes(q.kind));
    const fixAll = async () => { for (const q of auto) await fixOne(q); check(); };
    const show = (q) => {
        const s = ed.get();
        ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
        ed.dispatch({ type: 'SET', values: { selected: { pageId: s.doc.pages[s.page].id, id: q.id } } });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} width={560} title={t('Yayına hazır mı?')}
            description={t('Paylaşmadan önce son kontrol: okunabilirlik, yazım, taşan öğeler, hikaye bantları, çözünürlük ve marka logosu.')}
            footer={<>
                <Button icon={RefreshCw} onClick={check}>{t('Yeniden kontrol et')}</Button>
                {auto.length > 1 && <Button variant="primary" icon={Wand2} onClick={fixAll}>{t('Hepsini düzelt')} ({auto.length})</Button>}
            </>}>
            {issues === null ? (
                <div className="flex items-center gap-2 text-sm text-fg-2 py-6 justify-center"><Spinner />{t('Kontrol ediliyor…')}</div>
            ) : issues.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <CircleCheck className="w-10 h-10 text-success" />
                    <div className="text-[15px] font-semibold">{t('Her şey hazır')}</div>
                    <p className="text-[13px] text-fg-2">{t('Bir sorun bulunmadı. Görseldeki (sonradan eklenmemiş) yazıların yazımı için Düzelt → Tüm yazıları bul.')}</p>
                </div>
            ) : (
                <ul className="space-y-1.5">
                    {issues.map((q, i) => {
                        const Icon = ICON[q.level];
                        return (
                            <li key={i} className="flex items-center gap-2.5 rounded-lg border border-line p-2">
                                <Icon className={cx('w-4 h-4 shrink-0', TONE[q.level])} />
                                <span className="flex-1 text-[13px] leading-snug">{q.text}</span>
                                {q.id && <Button size="sm" variant="ghost" icon={Eye} onClick={() => show(q)} title={t('Göster')} />}
                                <Button size="sm" onClick={() => fix(q)}>{q.kind === 'resolution' ? t('Netleştir') : q.kind === 'nologo' ? t('Logo ekle') : t('Düzelt')}</Button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Dialog>
    );
}
