import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * ContentOverlay - PDF üzerindeki metin ve görselleri tıklanabilir hale getirir
 * @param {Object} props
 * @param {Array} props.textBlocks - Metin blokları [{id, text, x, y, width, height}]
 * @param {Array} props.images - Görsel blokları [{id, x, y, width, height}]
 * @param {boolean} props.showTextOverlay - Metin overlay'i göster
 * @param {boolean} props.showImageOverlay - Görsel overlay'i göster
 * @param {Function} props.onTextClick - Metin tıklandığında çağrılır
 * @param {Function} props.onImageClick - Görsel tıklandığında çağrılır
 * @param {string} props.selectedId - Seçili öğenin ID'si
 * @param {number} props.canvasWidth - Canvas genişliği
 * @param {number} props.canvasHeight - Canvas yüksekliği
 */
function ContentOverlay({
    textBlocks = [],
    images = [],
    showTextOverlay = false,
    showImageOverlay = false,
    onTextClick,
    onImageClick,
    selectedId,
    canvasWidth,
    canvasHeight,
}) {
    const handleTextClick = useCallback((e, block) => {
        e.stopPropagation();
        onTextClick?.(block);
    }, [onTextClick]);

    const handleImageClick = useCallback((e, image) => {
        e.stopPropagation();
        onImageClick?.(image);
    }, [onImageClick]);

    if (!showTextOverlay && !showImageOverlay) return null;

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: canvasWidth, height: canvasHeight }}
        >
            {/* Metin Blokları */}
            {showTextOverlay && textBlocks.map((block) => (
                <motion.div
                    key={block.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`absolute cursor-pointer pointer-events-auto transition-all duration-150 rounded-sm
                        ${selectedId === block.id
                            ? 'bg-purple-500/30 border-2 border-purple-400 shadow-lg shadow-purple-500/20'
                            : 'hover:bg-purple-500/20 border border-transparent hover:border-purple-400/50'
                        }`}
                    style={{
                        left: block.x,
                        top: block.y,
                        width: block.width,
                        height: block.height,
                    }}
                    onClick={(e) => handleTextClick(e, block)}
                    whileHover={{ scale: 1.01 }}
                    title={`Metin: "${block.text.substring(0, 50)}${block.text.length > 50 ? '...' : ''}"`}
                >
                    {/* Seçili durumda gösterge */}
                    {selectedId === block.id && (
                        <div className="absolute -top-6 left-0 px-2 py-0.5 bg-purple-500 text-white text-xs rounded-t-md whitespace-nowrap">
                            Seçili Metin
                        </div>
                    )}
                </motion.div>
            ))}

            {/* Görsel Blokları */}
            {showImageOverlay && images.map((image) => (
                <motion.div
                    key={image.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`absolute cursor-pointer pointer-events-auto transition-all duration-150 rounded-sm
                        ${selectedId === image.id
                            ? 'bg-emerald-500/30 border-2 border-emerald-400 shadow-lg shadow-emerald-500/20'
                            : 'hover:bg-emerald-500/20 border border-transparent hover:border-emerald-400/50'
                        }`}
                    style={{
                        left: image.x,
                        top: image.y,
                        width: image.width,
                        height: image.height,
                    }}
                    onClick={(e) => handleImageClick(e, image)}
                    whileHover={{ scale: 1.01 }}
                    title="Görsel - Tıklayarak seçin"
                >
                    {/* Seçili durumda gösterge */}
                    {selectedId === image.id && (
                        <div className="absolute -top-6 left-0 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-t-md whitespace-nowrap">
                            Seçili Görsel
                        </div>
                    )}
                </motion.div>
            ))}
        </div>
    );
}

export default memo(ContentOverlay);
