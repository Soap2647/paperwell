import { useState } from 'react';
import { FileText, ArrowUp, ArrowDown, X, FilePlus2 } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { insertPdfFiles, withBusy } from '../../store/actions';
import { mergeFiles } from '../../core/docTools';
import { readPages } from '../../core/pageOps';
import { Button, Dialog, IconButton } from '../../components/ui';
import { t } from '../../i18n';

let seq = 0;

export default function MergeDialog({ open, onClose, standalone }) {
    const ed = useEditor();
    const [files, setFiles] = useState([]);
    const [over, setOver] = useState(false);

    const add = (list) => {
        const pdfs = [...list].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        setFiles((prev) => [...prev, ...pdfs.map((file) => ({ id: ++seq, file }))]);
    };
    const move = (i, d) => setFiles((prev) => {
        const next = [...prev];
        const j = i + d;
        if (j < 0 || j >= next.length) return prev;
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    const run = async () => {
        onClose();
        if (standalone) {
            await withBusy(ed, t('İşleniyor...'), async () => {
                const bytes = await mergeFiles(await Promise.all(files.map(async (f) => new Uint8Array(await f.file.arrayBuffer()))));
                ed.dispatch({ type: 'LOAD', doc: { name: 'birlestirilmis.pdf', kind: 'pdf', bytes, pages: await readPages(bytes) } });
            });
        } else {
            await insertPdfFiles(ed, files.map((f) => f.file), ed.get().doc.pages.length - 1);
        }
        setFiles([]);
    };

    const min = standalone ? 2 : 1;
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={t('PDF\'leri birleştir')}
            description={standalone ? 'Dosyaları sıralayın; birleştirilen belge editörde açılır.' : 'Seçilen dosyaların sayfaları açık belgenin sonuna eklenir.'}
            footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" disabled={files.length < min} onClick={run}>{standalone ? t('Birleştir ve aç') : t('Ekle')}</Button></>}
        >
            <div className="space-y-2">
                {!standalone && (
                    <div className="flex items-center gap-3 px-3 h-11 rounded-lg bg-surface-2 border border-line text-[13px]">
                        <FileText className="w-4 h-4 text-accent" />
                        <span className="flex-1 truncate">{ed.state.doc?.name} <span className="text-fg-3">({t('Açık belge')})</span></span>
                    </div>
                )}
                {files.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 h-11 rounded-lg border border-line text-[13px]">
                        <FileText className="w-4 h-4 text-fg-3" />
                        <span className="flex-1 truncate">{f.file.name}</span>
                        <span className="text-xs text-fg-3 tabular-nums">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        <IconButton size="sm" icon={ArrowUp} label="Yukarı" onClick={() => move(i, -1)} disabled={i === 0} />
                        <IconButton size="sm" icon={ArrowDown} label="Aşağı" onClick={() => move(i, 1)} disabled={i === files.length - 1} />
                        <IconButton size="sm" icon={X} label={t('Kaldır')} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} />
                    </div>
                ))}
                <label
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
                    className={`flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed cursor-pointer text-[13px] text-fg-2 ${over ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent'}`}
                >
                    <FilePlus2 className="w-4 h-4" /> {t('Dosya ekle')}
                    <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
                </label>
            </div>
        </Dialog>
    );
}
