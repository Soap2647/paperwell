// Hareketli story (video): eklenen logo ve yazılar sırayla belirir, MP4 olarak iner
import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { withBusy, baseName } from '../../store/actions';
import { saveFile, isDesktop } from '../../platform';
import { Button, Dialog, Field, Segmented, Toggle } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';
import { renderStoryVideo, pickMime } from '../motion';

export default function MotionDialog({ open, onClose }) {
    const ed = useEditor();
    const [style, setStyle] = useState('up');
    const [duration, setDuration] = useState(6);
    const [kenBurns, setKenBurns] = useState(true);
    const s = ed.state;
    const page = s.doc?.pages[s.page];
    const count = page ? (s.objects[page.id] || []).filter((o) => !o.hidden).length : 0;
    const mime = open ? pickMime() : null;

    const go = async () => {
        onClose();
        await withBusy(ed, t('Video hazırlanıyor...'), async (progress) => {
            const { blob, ext } = await renderStoryVideo(ed.get(), { style, duration, kenBurns, onProgress: (p) => progress(p, `${t('Video hazırlanıyor...')} ${Math.round(p * 100)}%`) });
            const saved = await saveFile(blob, `${baseName(ed.get().doc.name)}-hareketli.${ext}`);
            if (saved) toast(`${t('Video')} ${isDesktop ? t('kaydedildi') : t('indirildi')} (${ext.toUpperCase()})`, 'success', 4000);
        });
    };

    return (
        <Dialog open={open} onClose={onClose} width={500} title={t('Hareketli story (video)')}
            description={t('Afiş yerinde durur; eklediğiniz logolar ve yazılar yukarıdan aşağı sırayla belirir. Hikayede durağan görselden çok daha fazla dikkat çeker.')}
            footer={<Button variant="primary" icon={Clapperboard} disabled={!mime} onClick={go}>{t('Videoyu oluştur')}</Button>}>
            <div className="space-y-4">
                {!count && <p className="text-xs rounded-lg bg-warning/10 border border-warning/30 p-2">{t('Sayfada eklenmiş öğe yok: video yalnız afişin hafif yakınlaşmasından oluşur. Önce logo ya da yazı ekleyin.')}</p>}
                {!mime && <p className="text-xs rounded-lg bg-danger/10 border border-danger/30 p-2">{t('Bu sistem video kaydını desteklemiyor')}</p>}
                <Field label={t('Belirme biçimi')}>
                    <Segmented value={style} onChange={setStyle} options={[{ value: 'up', label: t('Yukarı kayarak') }, { value: 'zoom', label: t('Yakınlaşarak') }, { value: 'fade', label: t('Solarak') }]} />
                </Field>
                <Field label={t('Süre')}>
                    <Segmented value={duration} onChange={setDuration} options={[{ value: 5, label: '5 sn' }, { value: 6, label: '6 sn' }, { value: 8, label: '8 sn' }, { value: 10, label: '10 sn' }]} />
                </Field>
                <Toggle checked={kenBurns} onChange={setKenBurns} label={t('Afiş hafifçe yakınlaşsın')} />
                <p className="text-xs text-fg-3">{t('Kayıt gerçek zamanlı yapılır: video süresi kadar bekleyin.')} {mime?.startsWith('video/mp4') ? 'MP4' : 'WebM'}</p>
            </div>
        </Dialog>
    );
}
