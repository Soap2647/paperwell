import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText,
    Type,
    Eraser,
    FileImage,
    FileType,
    Sparkles,
    Shield,
    LayoutGrid,
    Highlighter,
    Shapes,
    PenTool,
    Merge,
    Scissors,
    Minimize2,
    Stamp,
    Hash,
    ChevronRight,
    ChevronLeft
} from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange, hasDocument }) {
    const [isExpanded, setIsExpanded] = useState(() => {
        try { return localStorage.getItem('nebula.sidebar') === '1'; } catch { return false; }
    });

    const toggleExpanded = () => {
        setIsExpanded(prev => {
            try { localStorage.setItem('nebula.sidebar', prev ? '0' : '1'); } catch { /* yoksay */ }
            return !prev;
        });
    };

    const menuGroups = [
        {
            title: 'Temel',
            items: [
                { id: 'view', label: 'Görüntüle', icon: FileText, gradient: 'from-violet-500 to-purple-600' },
                { id: 'organize', label: 'Sayfalar', icon: LayoutGrid, gradient: 'from-blue-500 to-indigo-600' },
            ]
        },
        {
            title: 'Düzenle',
            items: [
                { id: 'annotate', label: 'İşaretle', icon: Highlighter, gradient: 'from-yellow-400 to-orange-500' },
                { id: 'shapes', label: 'Şekiller', icon: Shapes, gradient: 'from-purple-400 to-pink-500' },
                { id: 'edit-text', label: 'Metin', icon: Type, gradient: 'from-cyan-500 to-teal-600' },
                { id: 'remove-images', label: 'Görsel Sil', icon: Eraser, gradient: 'from-teal-500 to-emerald-600' },
                { id: 'sign', label: 'İmza', icon: PenTool, gradient: 'from-fuchsia-500 to-rose-600' },
            ]
        },
        {
            title: 'Araçlar',
            items: [
                { id: 'merge', label: 'Birleştir', icon: Merge, gradient: 'from-indigo-500 to-blue-600', noDocNeeded: true },
                { id: 'split', label: 'Böl', icon: Scissors, gradient: 'from-blue-500 to-cyan-600' },
                { id: 'compress', label: 'Sıkıştır', icon: Minimize2, gradient: 'from-emerald-500 to-green-600' },
                { id: 'watermark', label: 'Filigran', icon: Stamp, gradient: 'from-red-500 to-orange-600' },
                { id: 'page-number', label: 'Sayfa No', icon: Hash, gradient: 'from-orange-500 to-yellow-600' },
            ]
        },
        {
            title: 'Dışa Aktar',
            items: [
                { id: 'export-image', label: 'Görsel', icon: FileImage, gradient: 'from-emerald-400 to-teal-500' },
                { id: 'export-word', label: 'Word', icon: FileType, gradient: 'from-orange-400 to-amber-500' },
            ]
        }
    ];

    return (
        <motion.aside 
            animate={{ width: isExpanded ? 240 : 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-full bg-gray-900/80 backdrop-blur-xl border-r border-white/5 flex flex-col relative z-50 shrink-0"
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center px-5 border-b border-white/5 overflow-hidden shrink-0">
                <motion.div
                    className="flex items-center gap-3"
                    animate={{ x: isExpanded ? 0 : 5 }}
                >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.span 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 text-lg whitespace-nowrap"
                            >
                                Nebula PDF
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar overflow-x-hidden">
                <div className="px-3 flex flex-col gap-6">
                    {menuGroups.map((group, groupIdx) => (
                        <div key={group.title} className="flex flex-col gap-1">
                            {/* Group Title */}
                            <AnimatePresence>
                                {isExpanded ? (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2 px-3 whitespace-nowrap"
                                    >
                                        {group.title}
                                    </motion.p>
                                ) : (
                                    <div className="h-4 border-b border-white/5 mb-2 mx-4" />
                                )}
                            </AnimatePresence>

                            {/* Group Items */}
                            {group.items.map((item, index) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                const disabled = !hasDocument && !item.noDocNeeded && item.id !== 'view';

                                return (
                                    <motion.button
                                        key={item.id}
                                        onClick={() => !disabled && onTabChange(item.id)}
                                        disabled={disabled}
                                        aria-label={item.label}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={`relative group w-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded-xl ${disabled ? 'cursor-not-allowed' : ''}`}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: (groupIdx * 0.1) + (index * 0.05) }}
                                    >
                                        <div
                                            className={`
                                                w-full h-12 rounded-xl flex items-center gap-3 px-4
                                                transition-all duration-200 ${disabled ? 'opacity-30' : 'cursor-pointer'}
                                                ${isActive
                                                    ? `bg-gradient-to-br ${item.gradient} shadow-lg shadow-purple-500/10`
                                                    : 'hover:bg-white/5'
                                                }
                                                ${!isExpanded ? 'justify-center px-0' : ''}
                                            `}
                                        >
                                            <Icon
                                                className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}
                                            />
                                            
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.span
                                                        initial={{ opacity: 0, width: 0 }}
                                                        animate={{ opacity: 1, width: 'auto' }}
                                                        exit={{ opacity: 0, width: 0 }}
                                                        className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-colors ${isActive ? 'text-white/90' : 'text-gray-400 group-hover:text-gray-200'}`}
                                                    >
                                                        {item.label}
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Active Indicator (Only show when collapsed to keep it clean) */}
                                        {isActive && !isExpanded && (
                                            <div
                                                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                            />
                                        )}

                                        {/* Tooltip (Only show when collapsed) */}
                                        {!isExpanded && (
                                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl border border-white/10">
                                                {disabled ? `${item.label} · önce bir PDF açın` : item.label}
                                                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                                            </div>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </nav>

            {/* Expand / Collapse */}
            <div className="px-3 pt-2 shrink-0">
                <button
                    onClick={toggleExpanded}
                    className={`w-full h-9 rounded-lg flex items-center gap-3 text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors ${isExpanded ? 'px-4' : 'justify-center'}`}
                    title={isExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
                    aria-label={isExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
                >
                    {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {isExpanded && <span className="text-xs">Daralt</span>}
                </button>
            </div>

            {/* Security Badge */}
            <div className="p-4 border-t border-white/5 shrink-0 overflow-hidden">
                <div className={`flex items-center gap-3 ${isExpanded ? 'justify-start' : 'justify-center'}`}>
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-emerald-400" />
                    </div>
                    {isExpanded && (
                        <div className="flex flex-col whitespace-nowrap">
                            <span className="text-xs text-emerald-400 font-medium">Güvenli İşlem</span>
                            <span className="text-[10px] text-gray-500">Tüm işlemler yerel</span>
                        </div>
                    )}
                </div>
            </div>
        </motion.aside>
    );
}
