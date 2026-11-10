import { Square, Circle, Minus, MoveRight, Plus } from 'lucide-react';

const SHAPES = [
    { id: 'rect', label: 'Dikdörtgen', icon: Square },
    { id: 'ellipse', label: 'Elips', icon: Circle },
    { id: 'line', label: 'Çizgi', icon: Minus },
    { id: 'arrow', label: 'Ok', icon: MoveRight },
];

const COLORS = [
    { id: 'black', value: '#000000', label: 'Siyah' },
    { id: 'white', value: '#ffffff', label: 'Beyaz' },
    { id: 'red', value: '#EF4444', label: 'Kırmızı' },
    { id: 'blue', value: '#3B82F6', label: 'Mavi' },
    { id: 'green', value: '#22C55E', label: 'Yeşil' },
    { id: 'yellow', value: '#FDE047', label: 'Sarı' },
    { id: 'purple', value: '#a855f7', label: 'Mor' },
];

function Swatch({ value, label, selected, onClick }) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`relative w-6 h-6 rounded-full border border-white/20 transition-all overflow-hidden ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'opacity-75 hover:opacity-100 hover:scale-110'}`}
            style={{ backgroundColor: value || 'transparent' }}
        >
            {!value && <span className="absolute inset-0 m-auto w-[140%] h-0.5 bg-red-500 rotate-45 -translate-x-[15%]" />}
        </button>
    );
}

/**
 * Yüzen alt çubukta kullanılan yatay şekil araç çubuğu
 */
export default function ShapeTool({
    shapeType,
    setShapeType,
    color,
    setColor,
    fillColor,
    setFillColor,
    lineWidth,
    setLineWidth,
    onAddShape
}) {
    const hasFill = shapeType === 'rect' || shapeType === 'ellipse';

    return (
        <div className="flex items-center gap-3 flex-wrap justify-center">
            <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
                {SHAPES.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setShapeType(id)}
                        title={label}
                        aria-label={label}
                        className={`p-2 rounded-lg transition-all ${shapeType === id ? 'bg-purple-500/25 text-purple-200 ring-1 ring-purple-500/50' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                        <Icon className="w-4 h-4" />
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-1.5" title="Çizgi rengi">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Çizgi</span>
                {COLORS.map((c) => (
                    <Swatch key={c.id} {...c} selected={color === c.value} onClick={() => setColor(c.value)} />
                ))}
            </div>

            {hasFill && (
                <div className="flex items-center gap-1.5" title="Dolgu rengi">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Dolgu</span>
                    <Swatch value="" label="Dolgu yok" selected={!fillColor} onClick={() => setFillColor('')} />
                    {COLORS.map((c) => (
                        <Swatch key={c.id} {...c} selected={fillColor === c.value} onClick={() => setFillColor(c.value)} />
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2" title="Kalınlık">
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={lineWidth}
                    onChange={(e) => setLineWidth(parseInt(e.target.value))}
                    className="w-20 accent-purple-500 cursor-pointer"
                />
                <span className="text-xs text-gray-400 w-8 tabular-nums">{lineWidth}px</span>
            </div>

            <button
                onClick={onAddShape}
                className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-purple-500/20"
            >
                <Plus className="w-4 h-4" /> Ekle
            </button>
        </div>
    );
}
