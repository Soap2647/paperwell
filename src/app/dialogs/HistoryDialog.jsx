// Geçmiş ve sürümler: geri alma adımlarının listesi (herhangi birine dön) ve adlı ara sürümler (projeyle kaydedilir)
import { useState } from 'react';
import { History, Bookmark, Trash2, RotateCcw } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { Button, Dialog, Field } from '../../components/ui';
import { t, getLocale } from '../../i18n';

const time = (ms) => new Date(ms).toLocaleTimeString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' });

export default function HistoryDialog({ open, onClose }) {
    const { state, dispatch } = useEditor();
    const [name, setName] = useState('');
    const past = state.past || [];
    const versions = state.versions || [];
    const save = () => {
        dispatch({ type: 'SAVE_VERSION', name: name.trim() || `${t('Sürüm')} ${versions.length + 1}` });
        setName('');
    };
    return (
        <Dialog open={open} onClose={onClose} width={600} title={t('Geçmiş ve sürümler')}
            description={t('Bir adıma tıklayınca belge o adımdan önceki haline döner (Yinele ile geri gelir). Sürümler projeyle birlikte kaydedilir.')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label={t('Adımlar')}>
                    <ol className="max-h-[48vh] overflow-y-auto space-y-1 pr-1">
                        <li className="flex items-center gap-2 rounded-lg bg-accent-soft px-2 py-1.5 text-[13px] font-medium"><History className="w-3.5 h-3.5" />{t('Şimdiki hal')}</li>
                        {past.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
                            <li key={i}>
                                <button type="button" onClick={() => dispatch({ type: 'JUMP', index: i })}
                                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                                    <RotateCcw className="w-3.5 h-3.5 text-fg-3 shrink-0" />
                                    <span className="flex-1 truncate"><span className="text-fg-3">{t('Öncesine dön')}:</span> {t(p.label || 'Değişiklik')}</span>
                                    {p.at && <span className="text-[11px] text-fg-3 tabular-nums">{time(p.at)}</span>}
                                </button>
                            </li>
                        ))}
                        {!past.length && <li className="text-xs text-fg-3 px-2">{t('Henüz değişiklik yok')}</li>}
                    </ol>
                </Field>
                <Field label={t('Sürümler')} hint={t('Beğendiğiniz bir hali adıyla saklayın; denemeler bozarsa tek tıkla dönün.')}>
                    <div className="flex gap-1.5">
                        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder={`${t('Sürüm')} ${versions.length + 1}`}
                            className="flex-1 min-w-0 h-8 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] focus:outline-none focus:border-accent" />
                        <Button size="sm" variant="primary" icon={Bookmark} onClick={save}>{t('Kaydet')}</Button>
                    </div>
                    <ul className="max-h-[40vh] overflow-y-auto space-y-1">
                        {versions.map((v) => (
                            <li key={v.id} className="group flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                                <Bookmark className="w-3.5 h-3.5 text-accent shrink-0" />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-medium truncate">{v.name}</span>
                                    <span className="block text-[11px] text-fg-3">{time(v.at)}</span>
                                </span>
                                <Button size="sm" onClick={() => { dispatch({ type: 'RESTORE_VERSION', id: v.id }); onClose(); }}>{t('Geri dön')}</Button>
                                <button type="button" aria-label={t('Sil')} onClick={() => dispatch({ type: 'DELETE_VERSION', id: v.id })}
                                    className="w-6 h-6 rounded-md hidden group-hover:flex items-center justify-center text-fg-3 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                            </li>
                        ))}
                    </ul>
                </Field>
            </div>
        </Dialog>
    );
}
