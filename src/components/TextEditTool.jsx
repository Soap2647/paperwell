import { useState, useCallback, useEffect } from 'react';
import { Eraser, Type, Check, X, Wand2, MousePointer, Search, ImageUp } from 'lucide-react';
import NeonButton from './NeonButton';
import FindReplaceTool from './FindReplaceTool';
import { toast } from './Toaster';
import { removeRegion, replaceImage } from '../utils/pdfImageRemover';
import { addText, replaceText } from '../utils/pdfTextEditor';

const parseHexToRgb = (hexString) => {
    if (!hexString) return { r: 1, g: 1, b: 1 };
    const hex = hexString.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
    };
};

const MODES = [
    { id: 'mask', label: 'Sil', icon: Eraser },
    { id: 'addText', label: 'Ekle', icon: Type },
    { id: 'replace', label: 'Değiştir', icon: Wand2 },
    { id: 'search', label: 'Bul', icon: Search },
];

/**
 * TextEditTool - Seçilen bölge / metin / görsel için düzenleme araçları (yüzen alt çubuk)
 */
export default function TextEditTool({
    pdfData,
    currentPage,
    selection,
    pageHeight,
    onPdfUpdate,
    onClearSelection,
    selectedContent,
    onPageSelect,
}) {
    const [mode, setMode] = useState('mask'); // 'mask' | 'addText' | 'replace' | 'search'
    const [newText, setNewText] = useState('');
    const [fontSize, setFontSize] = useState(12);
    const [textColor, setTextColor] = useState('#000000');
    const [maskColor, setMaskColor] = useState('#ffffff');
    const [loading, setLoading] = useState(false);
    const [smartMode, setSmartMode] = useState(true); // Orijinal stili koru
    const [replacementImage, setReplacementImage] = useState(null);

    const isImage = selectedContent?.type === 'image';
    const hasTarget = Boolean(selection || selectedContent);

    // Metin veya görsel tıklandığında formu doldur
    useEffect(() => {
        if (selectedContent?.type === 'text' && selectedContent.text) {
            setNewText(selectedContent.text);
            setMode('replace');
            if (selectedContent.fontSize) setFontSize(Math.round(selectedContent.fontSize));
        } else if (selectedContent?.type === 'image') {
            setMode('replace');
            setReplacementImage(null);
        }
    }, [selectedContent]);

    // Arkaplan rengini otomatik olarak senkronize et
    useEffect(() => {
        const detected = selectedContent?.detectedBgColor || selection?.detectedBgColor;
        if (detected) setMaskColor(detected);
    }, [selectedContent, selection]);

    // Seçim koordinatlarını PDF koordinatlarına (sol-alt orijin) dönüştür
    const getPdfCoords = useCallback((sel) => {
        if (!sel) return null;

        if (sel.pdfCoords && sel.pdfCoords.x != null) {
            const c = sel.pdfCoords;
            if ([c.x, c.y, c.width, c.height].some(Number.isNaN)) return null;
            return { ...c };
        }

        if (sel.canvasCoords && pageHeight) {
            const s = sel.scale || 1;
            const x = sel.canvasCoords.x / s;
            const y = sel.canvasCoords.y / s;
            const width = sel.canvasCoords.width / s;
            const height = sel.canvasCoords.height / s;
            if ([x, y, width, height].some(Number.isNaN)) return null;
            return { x, y: pageHeight - y - height, width, height };
        }

        return null;
    }, [pageHeight]);

    // Ortak çalıştırıcı: yükleme durumu, hata bildirimi ve geçmişe ekleme
    const run = useCallback(async (fn, successText) => {
        setLoading(true);
        try {
            const result = await fn();
            onPdfUpdate?.(new Uint8Array(result));
            onClearSelection?.();
            toast(successText, 'success');
            return true;
        } catch (error) {
            console.error(error);
            toast(error.message || 'İşlem sırasında bir hata oluştu', 'error');
            return false;
        } finally {
            setLoading(false);
        }
    }, [onPdfUpdate, onClearSelection]);

    const requireCoords = () => {
        const coords = getPdfCoords(selection);
        if (!coords || coords.width <= 0 || coords.height <= 0) {
            throw new Error('Geçersiz seçim. Lütfen tekrar seçin.');
        }
        return coords;
    };

    const handleMaskRegion = () => run(async () => {
        const coords = requireCoords();
        return removeRegion(pdfData, currentPage, coords, { fillColor: parseHexToRgb(maskColor) });
    }, 'Alan silindi');

    const handleAddText = async () => {
        const ok = await run(async () => {
            const coords = requireCoords();
            return addText(
                pdfData,
                currentPage,
                newText,
                { x: coords.x, y: coords.y + coords.height - fontSize },
                { fontSize, color: parseHexToRgb(textColor), fontFamily: selectedContent?.fontFamily }
            );
        }, 'Metin eklendi');
        if (ok) setNewText('');
    };

    const handleReplaceText = async () => {
        const ok = await run(async () => {
            const coords = requireCoords();
            const useOriginal = smartMode && selectedContent?.type === 'text';
            return replaceText(pdfData, currentPage, coords, newText, {
                fontSize: useOriginal ? selectedContent.fontSize : fontSize,
                textColor: useOriginal && selectedContent.color ? selectedContent.color : parseHexToRgb(textColor),
                backgroundColor: parseHexToRgb(maskColor),
                fontFamily: useOriginal ? selectedContent.fontFamily : '',
            });
        }, 'Metin değiştirildi');
        if (ok) setNewText('');
    };

    const handleReplaceImage = async () => {
        const ok = await run(async () => {
            const coords = requireCoords();
            return replaceImage(pdfData, currentPage, coords, replacementImage);
        }, 'Görsel değiştirildi');
        if (ok) setReplacementImage(null);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setReplacementImage(ev.target.result);
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const submitText = () => {
        if (loading || !hasTarget || !newText.trim()) return;
        if (mode === 'addText') handleAddText();
        else handleReplaceText();
    };

    const targetLabel = selectedContent?.type === 'text' ? 'Metin' : isImage ? 'Görsel' : 'Bölge';

    return (
        <div className="flex w-full items-center gap-3 flex-wrap">
            {/* Modlar */}
            <div className="flex bg-black/20 p-1 rounded-xl shrink-0">
                {MODES.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setMode(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === id
                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            <div className="w-px h-6 bg-white/10 shrink-0" />

            <div className="flex-1 flex items-center gap-3 min-w-[280px]">
                {mode === 'search' ? (
                    <FindReplaceTool pdfData={pdfData} onPdfUpdate={onPdfUpdate} onPageSelect={onPageSelect} />
                ) : !hasTarget ? (
                    <span className="text-sm text-gray-400 flex items-center gap-2">
                        <MousePointer className="w-4 h-4 text-purple-300 shrink-0" />
                        {mode === 'addText'
                            ? 'Metni yerleştirmek istediğiniz alanı sayfada sürükleyerek seçin'
                            : 'Bir metne tıklayın ya da sürükleyerek bir alan seçin'}
                    </span>
                ) : (
                    <>
                        {/* Seçim bilgisi */}
                        <span className="flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg pl-2 pr-1 py-1 shrink-0 max-w-[220px]">
                            <span className="text-purple-300 font-medium">{targetLabel}</span>
                            {selectedContent?.type === 'text' && (
                                <span className="truncate text-gray-400">“{selectedContent.text}”</span>
                            )}
                            <button onClick={onClearSelection} className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400" title="Seçimi kaldır">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </span>

                        {mode === 'mask' && (
                            <>
                                <label className="flex items-center gap-2 text-xs text-gray-400 ml-auto">
                                    Dolgu
                                    <input
                                        type="color"
                                        value={maskColor}
                                        onChange={(e) => setMaskColor(e.target.value)}
                                        className="w-7 h-7 rounded-md cursor-pointer bg-transparent"
                                        title="Silinen alanın dolgu rengi (otomatik algılanır)"
                                    />
                                </label>
                                <NeonButton onClick={handleMaskRegion} disabled={loading} loading={loading} icon={<Eraser className="w-4 h-4" />} className="px-4 py-2">
                                    Alanı Sil
                                </NeonButton>
                            </>
                        )}

                        {mode === 'replace' && isImage && (
                            <>
                                <label className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-sm rounded-lg cursor-pointer transition-colors">
                                    {replacementImage
                                        ? <img src={replacementImage} alt="" className="h-6 w-10 object-contain rounded bg-white/10" />
                                        : <ImageUp className="w-4 h-4" />}
                                    {replacementImage ? 'Başka görsel' : 'Yeni görsel seç'}
                                    <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} className="hidden" />
                                </label>
                                <NeonButton onClick={handleReplaceImage} disabled={!replacementImage || loading} loading={loading} icon={<Check className="w-4 h-4" />} className="px-4 py-2">
                                    Değiştir
                                </NeonButton>
                            </>
                        )}

                        {(mode === 'addText' || (mode === 'replace' && !isImage)) && (
                            <>
                                <input
                                    value={newText}
                                    onChange={(e) => setNewText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submitText()}
                                    placeholder={mode === 'addText' ? 'Eklenecek metin...' : 'Yeni metin...'}
                                    autoFocus
                                    className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500/70"
                                />

                                {mode === 'replace' && selectedContent?.type === 'text' && (
                                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer whitespace-nowrap" title="Orijinal yazı boyutu ve rengini kullan">
                                        <input type="checkbox" checked={smartMode} onChange={(e) => setSmartMode(e.target.checked)} className="accent-purple-500" />
                                        Stili koru
                                    </label>
                                )}

                                {(mode === 'addText' || !smartMode || selectedContent?.type !== 'text') && (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <input
                                            type="number"
                                            min="6" max="96"
                                            value={fontSize}
                                            onChange={(e) => setFontSize(Math.max(6, parseInt(e.target.value) || 12))}
                                            className="w-14 bg-white/5 border border-white/10 text-white px-2 py-1 rounded-md text-sm text-center"
                                            title="Yazı boyutu (pt)"
                                        />
                                        <input
                                            type="color"
                                            value={textColor}
                                            onChange={(e) => setTextColor(e.target.value)}
                                            className="w-7 h-7 rounded-md cursor-pointer bg-transparent"
                                            title="Yazı rengi"
                                        />
                                    </div>
                                )}

                                <NeonButton
                                    onClick={submitText}
                                    disabled={!newText.trim() || loading}
                                    loading={loading}
                                    icon={<Check className="w-4 h-4" />}
                                    className="px-4 py-2 shrink-0"
                                >
                                    {mode === 'addText' ? 'Ekle' : 'Değiştir'}
                                </NeonButton>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
