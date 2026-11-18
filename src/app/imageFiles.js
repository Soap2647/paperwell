// Görsel dosyalarını PDF'e gömülebilir dataURL'e çevirir (PNG/JPEG); çok büyükleri küçültür.
export async function readImageFile(file, maxSide = 2400) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        let w = img.naturalWidth || 300, h = img.naturalHeight || 150;
        // SVG vektördür: küçük çizilmiş logolar bulanık kalmasın diye büyük çözünürlükte rasterlenir
        const k = file.type === 'image/svg+xml' ? Math.min(maxSide, 1600) / Math.max(w, h) : Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const jpeg = file.type === 'image/jpeg';
        return { src: c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92), w, h };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function dataUrlSize(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 300, h: 120 });
        img.src = src;
    });
}
