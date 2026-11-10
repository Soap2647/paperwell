import { Highlighter, Pen, Eraser, Undo2, Redo2, Trash2 } from 'lucide-react';

const COLORS = [
    { id: 'yellow', value: '#FDE047', label: 'Sarı' },
    { id: 'green', value: '#4ADE80', label: 'Yeşil' },
    { id: 'blue', value: '#60A5FA', label: 'Mavi' },
    { id: 'pink', value: '#F472B6', label: 'Pembe' },
    { id: 'red', value: '#EF4444', label: 'Kırmızı' },
    { id: 'black', value: '#111827', label: 'Siyah' },
];

const TOOLS = [
    { id: 'highlight', label: 'Vurgula', icon: Highlighter, active: 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50' },
    { id: 'pen', label: 'Kalem', icon: Pen, active: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50' },
    { id: 'eraser', label: 'Silgi', icon: Eraser, active: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/50' },
];

/**
 * Yüzen alt çubukta kullanılan yatay işaretleme araç çubuğu
 */
export default function AnnotationToolbar({
    tool,
    setTool,
    color,
    setColor,
    lineWidth,
    setLineWidth,
    onUndo,
    onRedo,
    onClear,
    canUndo,
    canRedo
}) {
    const maxWidth = tool === 'highlight' ? 30 : 15;

    return (
        <div className="flex items-center gap-3 flex-wrap justify-center w-full">
            {/* Araçlar */}
            <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
                {TOOLS.map(({ id, label, icon: Icon, active }) => (
                    <button
                        key={id}
                        onClick={() => {
                            setTool(id);
                            if (lineWidth > (id === 'highlight' ? 30 : 15)) setLineWidth(id === 'highlight' ? 15 : 3);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tool === id ? active : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                        title={label}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="hidden md:inline">{label}</span>
                    </button>
                ))}
            </div>

            {tool !== 'eraser' && (
                <>
                    {/* Renk */}
                    <div className="flex items-center gap-1.5">
                        {COLORS.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setColor(c.value)}
                                className={`w-6 h-6 rounded-full transition-all ${color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'opacity-70 hover:opacity-100 hover:scale-110'}`}
                                style={{ backgroundColor: c.value }}
                                title={c.label}
                                aria-label={c.label}
                            />
                        ))}
                    </div>

                    {/* Kalınlık */}
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="1"
                            max={maxWidth}
                            value={Math.min(lineWidth, maxWidth)}
                            onChange={(e) => setLineWidth(parseInt(e.target.value))}
                            className="w-24 accent-purple-500 cursor-pointer"
                            title="Kalınlık"
                        />
                        <span className="text-xs text-gray-400 w-8 tabular-nums">{lineWidth}px</span>
                    </div>
                </>
            )}

            {tool === 'eraser' && (
                <span className="text-xs text-gray-400">Silmek için çizimin üzerine tıklayın veya sürükleyin</span>
            )}

            <div className="w-px h-6 bg-white/10" />

            {/* Geçmiş */}
            <div className="flex items-center gap-1">
                <IconButton onClick={onUndo} disabled={!canUndo} title="Geri Al (Ctrl+Z)"><Undo2 className="w-4 h-4" /></IconButton>
                <IconButton onClick={onRedo} disabled={!canRedo} title="İleri Al (Ctrl+Y)"><Redo2 className="w-4 h-4" /></IconButton>
                <IconButton onClick={onClear} title="Bu sayfadaki tüm çizimleri temizle" danger><Trash2 className="w-4 h-4" /></IconButton>
            </div>
        </div>
    );
}

export function IconButton({ children, onClick, disabled, title, danger }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${danger
                ? 'text-red-400 hover:bg-red-500/15'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
        >
            {children}
        </button>
    );
}
