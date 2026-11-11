import { MousePointer2, TextCursorInput, Type, PenTool, Highlighter, Shapes, ImagePlus, Signature, Sparkles, SquareSlash, StickyNote, LassoSelect } from 'lucide-react';

export const TOOLS = [
    { id: 'select', label: 'Seç', hint: 'Nesneleri seç ve taşı', icon: MousePointer2, key: 'V' },
    { id: 'edit', label: 'Düzenle', hint: 'Belgedeki metin ve görselleri düzenle', icon: TextCursorInput, key: 'E' },
    { id: 'text', label: 'Metin', hint: 'Metin kutusu ekle', icon: Type, key: 'T' },
    { id: 'draw', label: 'Çiz', hint: 'Serbest çizim', icon: PenTool, key: 'P' },
    { id: 'highlight', label: 'Vurgula', hint: 'Metni vurgula', icon: Highlighter, key: 'H' },
    { id: 'shape', label: 'Şekil', hint: 'Şekil ekle', icon: Shapes, key: 'U' },
    { id: 'image', label: 'Görsel', hint: 'Görsel ekle', icon: ImagePlus, key: 'I' },
    { id: 'sign', label: 'İmza', hint: 'İmza ekle', icon: Signature, key: 'G' },
    { id: 'note', label: 'Not', hint: 'Yapışkan not ekle', icon: StickyNote, key: 'N' },
    { id: 'erase', label: 'Silgi', hint: 'Fırçayla boya, yok olsun', icon: Sparkles, key: 'B' },
    { id: 'grab', label: 'Nesne', hint: 'Tıklanan nesneyi ayrı katmana çıkar', icon: LassoSelect, key: 'O' },
    { id: 'redact', label: 'Karart', hint: 'Hassas bilgiyi kalıcı sil', icon: SquareSlash, key: 'K' },
];

export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));
