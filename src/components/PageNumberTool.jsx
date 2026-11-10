import { useState } from 'react';
import { Check, AlertCircle, Hash } from 'lucide-react';
import { toast } from './Toaster';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';
import { addPageNumbers } from '../utils/pdfAnnotationExporter';

export default function PageNumberTool({ pdfData, onPdfUpdate, onDone }) {
    const [format, setFormat] = useState('{page}');
    const [position, setPosition] = useState('bottom-right');
    const [fontSize, setFontSize] = useState(12);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const positions = [
        { id: 'top-left', label: 'Sol Üst' },
        { id: 'top-center', label: 'Orta Üst' },
        { id: 'top-right', label: 'Sağ Üst' },
        { id: 'bottom-left', label: 'Sol Alt' },
        { id: 'bottom-center', label: 'Orta Alt' },
        { id: 'bottom-right', label: 'Sağ Alt' },
    ];

    const handleApply = async () => {
        if (!pdfData) return;
        setLoading(true);
        setError(null);

        try {
            const numberedData = await addPageNumbers(pdfData, {
                position,
                format,
                fontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            onPdfUpdate?.(numberedData);
            toast('Sayfa numaraları eklendi', 'success');
            onDone?.();
        } catch (err) {
            console.error(err);
            setError(err.message || "İşlem sırasında hata oluştu.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Hash className="w-8 h-8 text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-100">Sayfa Numarası</h3>
            </div>

            {error && (
                <div className="bg-red-500/20 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" /> <p>{error}</p>
                </div>
            )}

            <GlassCard className="p-4 space-y-4">
                <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Format</label>
                    <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="w-full bg-white/5 border border-orange-500/30 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:border-orange-500 appearance-none"
                    >
                        <option value="{page}" className="bg-gray-800 text-gray-100">1, 2, 3...</option>
                        <option value="Sayfa {page}" className="bg-gray-800 text-gray-100">Sayfa 1, Sayfa 2...</option>
                        <option value="{page} / {total}" className="bg-gray-800 text-gray-100">1 / 10, 2 / 10...</option>
                        <option value="- {page} -" className="bg-gray-800 text-gray-100">- 1 -, - 2 -...</option>
                    </select>
                </div>

                <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Pozisyon</label>
                    <div className="grid grid-cols-3 gap-2">
                        {positions.map(pos => (
                            <button
                                key={pos.id}
                                onClick={() => setPosition(pos.id)}
                                className={`py-4 px-2 rounded-lg text-xs text-center transition-all ${
                                    position === pos.id ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
                                }`}
                            >
                                {pos.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wider block">Yazı Boyutu</label>
                        <span className="text-xs text-gray-500">{fontSize} pt</span>
                    </div>
                    <input
                        type="range" min="8" max="48" value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full accent-orange-500"
                    />
                </div>
            </GlassCard>

            <NeonButton
                onClick={handleApply}
                disabled={loading || !pdfData}
                loading={loading}
                icon={<Check className="w-5 h-5" />}
                className="w-full py-3 !bg-orange-500 hover:!bg-orange-600 shadow-orange-500/20"
            >
                Belgeye Uygula
            </NeonButton>
        </div>
    );
}
