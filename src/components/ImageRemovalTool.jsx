import { useState } from 'react';
import { Trash2, MousePointer, X, Layers, FileX2 } from 'lucide-react';
import NeonButton from './NeonButton';
import { toast } from './Toaster';
import { detectImages, removeImages, removeRegion } from '../utils/pdfImageRemover';

const hexToRgb = (hex = '#ffffff') => ({
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
});

/**
 * ImageRemovalTool - PDF'den görsel silme aracı (yüzen alt çubuk)
 * Görselin üzeri arka plan rengiyle örtülür.
 */
export default function ImageRemovalTool({ pdfData, onPdfUpdate, currentPage, selection, selectedContent, onClearSelection }) {
    const [busy, setBusy] = useState(null); // 'selected' | 'page' | 'all'

    const run = async (key, fn) => {
        setBusy(key);
        try {
            const result = await fn();
            if (result) {
                onPdfUpdate?.(result);
                onClearSelection?.();
            }
        } catch (error) {
            console.error(error);
            toast('Silme hatası: ' + error.message, 'error');
        } finally {
            setBusy(null);
        }
    };

    const fillColor = hexToRgb(selectedContent?.detectedBgColor || selection?.detectedBgColor || '#ffffff');

    const removeSelected = () => run('selected', async () => {
        let rect = selectedContent?.pdfCoords;
        if (!rect && selection?.canvasCoords && selection.pageHeight) {
            const s = selection.scale || 1;
            const c = selection.canvasCoords;
            rect = { x: c.x / s, y: selection.pageHeight - (c.y + c.height) / s, width: c.width / s, height: c.height / s };
        }
        if (!rect) throw new Error('Önce bir görsel seçin');
        const result = await removeRegion(pdfData, currentPage, rect, { fillColor });
        toast('Görsel silindi', 'success');
        return result;
    });

    const removeMany = (key, pageOnly) => run(key, async () => {
        const all = await detectImages(pdfData);
        const targets = pageOnly ? all.filter((img) => img.pageNum === currentPage) : all;
        if (targets.length === 0) {
            toast(pageOnly ? 'Bu sayfada görsel bulunamadı' : 'Belgede görsel bulunamadı', 'info');
            return null;
        }
        const result = await removeImages(pdfData, targets);
        toast(`${targets.length} görsel silindi`, 'success');
        return result;
    });

    const hasTarget = Boolean(selectedContent || selection);

    return (
        <div className="flex w-full items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px] flex items-center gap-2">
                {hasTarget ? (
                    <>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg pl-2 pr-1 py-1">
                            {selectedContent ? 'Görsel seçildi' : 'Alan seçildi'}
                            <button onClick={onClearSelection} className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400" title="Seçimi kaldır">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </span>
                        <NeonButton
                            onClick={removeSelected}
                            disabled={busy !== null}
                            loading={busy === 'selected'}
                            icon={<Trash2 className="w-4 h-4" />}
                            className="px-4 py-2"
                        >
                            Seçileni Sil
                        </NeonButton>
                    </>
                ) : (
                    <span className="text-sm text-gray-400 flex items-center gap-2">
                        <MousePointer className="w-4 h-4 text-emerald-300 shrink-0" />
                        Silmek istediğiniz görsele tıklayın veya bir alan sürükleyin
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <NeonButton
                    variant="ghost"
                    onClick={() => removeMany('page', true)}
                    disabled={busy !== null}
                    loading={busy === 'page'}
                    icon={<Layers className="w-4 h-4" />}
                    className="px-3 py-2"
                >
                    Bu Sayfadakiler
                </NeonButton>
                <NeonButton
                    variant="ghost"
                    onClick={() => {
                        if (window.confirm('Belgedeki tüm görseller silinecek. Devam edilsin mi? (Geri Al ile geri alabilirsiniz)')) removeMany('all', false);
                    }}
                    disabled={busy !== null}
                    loading={busy === 'all'}
                    icon={<FileX2 className="w-4 h-4" />}
                    className="px-3 py-2"
                >
                    Tümü
                </NeonButton>
            </div>
        </div>
    );
}
