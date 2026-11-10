import { useState } from 'react';
import { Check, AlertCircle, Stamp } from 'lucide-react';
import { toast } from './Toaster';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';
import { addWatermark } from '../utils/pdfAnnotationExporter';

export default function WatermarkTool({ pdfData, onPdfUpdate, onDone }) {
    const [text, setText] = useState('GİZLİDİR');
    const [fontSize, setFontSize] = useState(48);
    const [opacity, setOpacity] = useState(0.3);
    const [angle, setAngle] = useState(-45);
    const [position, setPosition] = useState('center');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const positions = [
        { id: 'top-left', label: 'Sol Üst' },
        { id: 'top-right', label: 'Sağ Üst' },
        { id: 'center', label: 'Merkez' },
        { id: 'bottom-left', label: 'Sol Alt' },
        { id: 'bottom-right', label: 'Sağ Alt' },
    ];

    const handleApply = async () => {
        if (!pdfData || !text.trim()) return;
        setLoading(true);
        setError(null);

        try {
            // For simplicity, we just use a default color (gray)
            // Can be expanded to have color picker
            const watermarkedData = await addWatermark(pdfData, {
                text,
                fontSize,
                opacity,
                angle,
                position,
                color: { r: 0.5, g: 0.5, b: 0.5 }
            });

            onPdfUpdate?.(watermarkedData);
            toast('Filigran eklendi', 'success');
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
                <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Stamp className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-100">Filigran Ekle</h3>
            </div>

            {error && (
                <div className="bg-red-500/20 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" /> <p>{error}</p>
                </div>
            )}

            {/* Canlı önizleme */}
            <div className="mx-auto w-40 aspect-[1/1.414] bg-white rounded-md shadow-lg relative overflow-hidden">
                <div className="absolute inset-3 space-y-1.5 opacity-40">
                    {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-1 bg-gray-300 rounded" style={{ width: `${60 + ((i * 37) % 40)}%` }} />)}
                </div>
                <div
                    className={`absolute flex p-2 ${{
                        'top-left': 'top-0 left-0',
                        'top-right': 'top-0 right-0',
                        'center': 'inset-0 items-center justify-center',
                        'bottom-left': 'bottom-0 left-0',
                        'bottom-right': 'bottom-0 right-0',
                    }[position]}`}
                >
                    <span
                        className="font-bold text-gray-500 whitespace-nowrap"
                        style={{ fontSize: Math.max(5, fontSize / 4.2), opacity, transform: `rotate(${-angle}deg)` }}
                    >
                        {text || ' '}
                    </span>
                </div>
            </div>

            <GlassCard className="p-4 space-y-4">
                <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Metin</label>
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full bg-white/5 border border-red-500/30 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:border-red-500"
                    />
                </div>

                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wider block">Boyut</label>
                        <span className="text-xs text-gray-500">{fontSize} pt</span>
                    </div>
                    <input
                        type="range" min="12" max="150" value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full accent-red-500"
                    />
                </div>

                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wider block">Opaklık</label>
                        <span className="text-xs text-gray-500">{Math.round(opacity * 100)}%</span>
                    </div>
                    <input
                        type="range" min="1" max="100" value={opacity * 100}
                        onChange={(e) => setOpacity(parseInt(e.target.value)/100)}
                        className="w-full accent-red-500"
                    />
                </div>

                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wider block">Açı</label>
                        <span className="text-xs text-gray-500">{angle}°</span>
                    </div>
                    <input
                        type="range" min="-180" max="180" value={angle}
                        onChange={(e) => setAngle(parseInt(e.target.value))}
                        className="w-full accent-red-500"
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Pozisyon</label>
                    <div className="grid grid-cols-2 gap-2">
                        {positions.map(pos => (
                            <button
                                key={pos.id}
                                onClick={() => setPosition(pos.id)}
                                className={`py-2 px-3 rounded-lg text-sm transition-all ${
                                    position === pos.id ? 'bg-red-500/30 text-red-300 border border-red-500/50' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
                                } ${pos.id === 'center' ? 'col-span-2' : ''}`}
                            >
                                {pos.label}
                            </button>
                        ))}
                    </div>
                </div>
            </GlassCard>

            <NeonButton
                onClick={handleApply}
                disabled={loading || !pdfData || !text.trim()}
                loading={loading}
                icon={<Check className="w-5 h-5" />}
                className="w-full py-3 !bg-red-500 hover:!bg-red-600 shadow-red-500/20"
            >
                Belgeye Uygula
            </NeonButton>
        </div>
    );
}

