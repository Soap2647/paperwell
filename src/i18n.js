// Basit çeviri: anahtar Türkçe metnin kendisidir; İngilizce sözlükte karşılığı aranır.
import { useSyncExternalStore } from 'react';

const EN = {
    // Genel
    'Aç': 'Open', 'Kapat': 'Close', 'İptal': 'Cancel', 'Uygula': 'Apply', 'Sil': 'Delete', 'Kaydet': 'Save', 'Tamam': 'OK',
    'İndir': 'Download', 'Geri al': 'Undo', 'Yinele': 'Redo', 'Yükleniyor...': 'Loading...', 'İşleniyor...': 'Processing...',
    'Renk': 'Color', 'Dolgu': 'Fill', 'Kenarlık': 'Stroke', 'Kalınlık': 'Width', 'Opaklık': 'Opacity', 'Boyut': 'Size', 'Font': 'Font',
    'Yok': 'None', 'Kalın': 'Bold', 'İtalik': 'Italic', 'Hizalama': 'Alignment', 'Çoğalt': 'Duplicate', 'Öne getir': 'Bring forward', 'Geriye gönder': 'Send backward',
    'Konum': 'Position', 'Değiştir': 'Replace', 'Ekle': 'Add', 'Ara': 'Search', 'Sayfa': 'Page', 'sayfa': 'pages', 'Tümü': 'All',
    'Hızlandırma': 'Acceleration', 'Tarayıcı': 'Browser', 'Metni düzenle': 'Edit text', 'Afişteki haline dön': 'Back to original pixels', 'Önce görselin açısını sıfırlayın': 'Reset the image rotation first',
    'Yazı şu an afişteki haliyle duruyor. Düzenlerseniz şu fontla yeniden yazılır:': 'The text is kept exactly as in the poster. Editing re-types it in:',
    // Karşılama
    'PDF ve görselleriniz için özgür editör': 'The free editor for your PDFs and images',
    'Metni orijinal fontuyla düzenleyin, akıllı silgiyle istemediğiniz şeyleri yok edin, imzalayın, işaretleyin. Hepsi tarayıcınızda; dosyalarınız cihazınızdan hiç çıkmaz.': 'Edit text in its original font, wipe out anything with the magic eraser, sign and annotate. All in your browser; your files never leave your device.',
    'PDF veya görsel bırakın': 'Drop a PDF or image', 'ya da dosya seçmek için tıklayın': 'or click to choose a file',
    'PDF, PNG, JPG, WebP': 'PDF, PNG, JPG, WebP', 'Boş belge oluştur': 'Create blank document', 'PDF birleştir': 'Merge PDFs',
    'Metni yerinde düzenle': 'Edit text in place', 'Orijinal font korunur': 'Original font preserved',
    'Akıllı silgi': 'Magic eraser', 'Yapay zekâ ile nesne silme': 'Remove objects with AI',
    'Gerçek karartma': 'True redaction', 'Metin içerikten silinir': 'Text is removed from the file',
    'İmzala ve doldur': 'Fill & sign', 'Çiz, yaz veya yükle': 'Draw, type or upload',
    'Sayfa düzeni': 'Organize pages', 'Sırala, döndür, sil, ekle': 'Reorder, rotate, delete, insert',
    'Dönüştür': 'Convert', 'PNG, JPG, Word': 'PNG, JPG, Word',
    'Açık kaynak · Ücretsiz · Reklamsız · Hesap gerektirmez': 'Open source · Free · No ads · No account',
    'Desteklenmeyen dosya türü': 'Unsupported file type', 'Dosya açılamadı': 'Could not open the file',
    'Bu PDF şifre korumalı': 'This PDF is password protected',
    // Araçlar
    'Seç': 'Select', 'Düzenle': 'Edit', 'Metin': 'Text', 'Çiz': 'Draw', 'Vurgula': 'Highlight', 'Şekil': 'Shape', 'Görsel': 'Image',
    'İmza': 'Sign', 'Silgi': 'Eraser', 'Karart': 'Redact', 'Not': 'Note',
    'Nesneleri seç ve taşı': 'Select and move objects', 'Belgedeki metin ve görselleri düzenle': 'Edit text and images in the document',
    'Metin kutusu ekle': 'Add a text box', 'Serbest çizim': 'Freehand drawing', 'Metni vurgula': 'Highlight text', 'Şekil ekle': 'Add a shape',
    'Görsel ekle': 'Add an image', 'İmza ekle': 'Add a signature', 'Fırçayla boya, yok olsun': 'Brush over it, make it disappear',
    'Hassas bilgiyi kalıcı sil': 'Permanently remove sensitive info', 'Yapışkan not ekle': 'Add a sticky note',
    // Üst çubuk
    'Belge araçları': 'Document tools', 'Birleştir': 'Merge', 'Böl': 'Split', 'Sıkıştır': 'Compress', 'Filigran': 'Watermark',
    'Sayfa numaraları': 'Page numbers', 'Dışa aktar': 'Export', 'Belge bilgileri': 'Document properties', 'Yeni dosya': 'New file',
    'Klavye kısayolları': 'Keyboard shortcuts', 'Tema': 'Theme', 'Açık': 'Light', 'Koyu': 'Dark', 'Dil': 'Language',
    'Cetveller': 'Rulers', 'Sayfaya sığdır': 'Fit page', 'Genişliğe sığdır': 'Fit width', 'Yakınlaştır': 'Zoom in', 'Uzaklaştır': 'Zoom out',
    'Bul ve değiştir': 'Find & replace', 'Kaydedilmemiş değişiklikler var': 'You have unsaved changes',
    'PNG olarak indir': 'Download as PNG', 'PDF olarak indir': 'Download as PDF', 'İndirildi': 'Downloaded',
    // Sayfalar paneli
    'Sayfalar': 'Pages', 'Boş sayfa': 'Blank page', 'PDF ekle': 'Insert PDF', 'Sola döndür': 'Rotate left', 'Sağa döndür': 'Rotate right',
    'Sayfayı sil': 'Delete page', 'Sayfayı çoğalt': 'Duplicate page', 'Seçili sayfaları çıkar': 'Extract selected pages',
    'Belgede en az bir sayfa kalmalı': 'A document needs at least one page',
    // Denetçi
    'Özellikler': 'Properties', 'Hiçbir şey seçili değil': 'Nothing selected',
    'Bir nesne seçin ya da soldan bir araç seçin.': 'Select an object or pick a tool on the left.',
    'Kalem': 'Pen', 'İşaretleyici': 'Marker', 'Dikdörtgen': 'Rectangle', 'Elips': 'Ellipse', 'Çizgi': 'Line', 'Ok': 'Arrow',
    'Fırça boyutu': 'Brush size', 'Hızlı': 'Fast', 'Yapay zekâ': 'AI',
    'Belgeler ve düz arka planlar için. Anında, çevrimdışı.': 'For documents and flat backgrounds. Instant, offline.',
    'Fotoğraflar için. Model bir kez indirilir (~28 MB), sonra çevrimdışı çalışır.': 'For photos. The model downloads once (~28 MB), then works offline.',
    'Silmek istediğiniz alanı fırçayla boyayın; bıraktığınızda silinir. Altındaki metin de belgeden kaldırılır.': 'Paint over what you want gone; it disappears when you release. Text underneath is removed from the file too.',
    'Orijinal': 'Original', 'Orijinal font': 'Original font',
    'Düzenlemek için bir metin satırına ya da görsele tıklayın.': 'Click a line of text or an image to edit it.',
    'Enter kaydeder, Esc vazgeçer.': 'Enter saves, Esc cancels.',
    'Orijinal fontta bu karakterler yok; benzer bir font kullanıldı.': 'The original font lacks these characters; a similar font was used.',
    'Metin güncellendi': 'Text updated', 'Görsel güncellendi': 'Image updated', 'Görsel silindi': 'Image deleted',
    'Görseli değiştir': 'Replace image', 'Görseli sil': 'Delete image',
    'Karartılacak alanları sürükleyerek işaretleyin.': 'Drag to mark areas to redact.',
    'alan işaretlendi': 'areas marked', 'Kalıcı olarak karart': 'Redact permanently', 'Temizle': 'Clear',
    'Metin ara ve işaretle': 'Find text and mark', 'Karartma uygulandı': 'Redaction applied',
    'Altındaki metin belgeden tamamen silinir; geri getirilemez (Geri al hariç).': 'Text underneath is removed from the file for good (except via Undo).',
    'Siyah': 'Black', 'Beyaz': 'White',
    'Sürükleyerek metni seçin; seçim vurgulanır.': 'Drag across text to highlight it.',
    'Vurgu': 'Highlight', 'Altı çizili': 'Underline', 'Üstü çizili': 'Strikethrough',
    'Sayfada tıklayın, sonra yazın.': 'Click on the page, then type.', 'Metninizi yazın': 'Type your text',
    'Model indiriliyor': 'Downloading model', 'Siliniyor...': 'Erasing...', 'Silindi': 'Erased',
    'Yapay zekâ modelini indir': 'Download AI model', 'Model hazır': 'Model ready',
    'Kaydedilmiş imzalar': 'Saved signatures', 'Yeni imza': 'New signature', 'İmzayı yerleştirmek için sayfaya tıklayın.': 'Click on the page to place the signature.',
    'Yaz': 'Type', 'Yükle': 'Upload', 'Adınızı yazın': 'Type your name', 'Temizle ve yeniden çiz': 'Clear and redraw',
    'İmzayı kaydet': 'Save signature', 'Görsel seçmek için tıklayın': 'Click to choose an image',
    'Notunuzu yazın...': 'Write your note...',
    // Diyaloglar
    'PDF\'leri birleştir': 'Merge PDFs', 'Dosya ekle': 'Add files', 'Açık belge': 'Current document',
    'Birleştir ve aç': 'Merge and open', 'Sayfa aralıkları': 'Page ranges', 'Her sayfayı ayrı dosya yap': 'Each page as a separate file',
    'Böl ve indir': 'Split and download', 'Kalite': 'Quality', 'Düşük': 'Low', 'Orta': 'Medium', 'Yüksek': 'High',
    'Sıkıştır ve indir': 'Compress and download', 'Açı': 'Angle', 'Belgeye uygula': 'Apply to document',
    'Biçim': 'Format', 'Başlangıç numarası': 'Start number', 'Kenar boşluğu': 'Margin',
    'Başlık': 'Title', 'Yazar': 'Author', 'Konu': 'Subject', 'Anahtar kelimeler': 'Keywords',
    'Hangi sayfalar': 'Which pages', 'Geçerli sayfa': 'Current page', 'Tüm sayfalar': 'All pages', 'Çözünürlük': 'Resolution',
    'Word belgesi (.docx)': 'Word document (.docx)', 'Uyarı: Word dönüştürme yalnızca metni aktarır.': 'Note: Word conversion only transfers text.',
    'Sonuç bulunamadı': 'No results', 'sonuç': 'results', 'Tümünü değiştir': 'Replace all', 'Yeni metin': 'Replace with',
    'Değiştirildi': 'Replaced',
    'Kaydedildi': 'Saved', 'Farklı kaydet': 'Save as',
    'Yazdır': 'Print', 'Yerleşim': 'Layout', 'Normal': 'Normal', '2 sayfa': '2 per sheet', '4 sayfa': '4 per sheet', 'Kitapçık': 'Booklet',
    'Kâğıt': 'Paper', 'Orijinal boyut': 'Original size', 'PDF olarak kaydet': 'Save as PDF', 'Inkwell ile yazdır': 'Print with Inkwell',
    "Inkwell'e gönderildi": 'Sent to Inkwell', 'Yazdırmaya hazırlanıyor...': 'Preparing to print...',
    'Elle çift taraf (yazıcı otomatik çift taraf basmıyorsa)': 'Manual duplex (if your printer cannot print both sides)',
    'Kâğıtları çevirin': 'Flip the paper', 'Arka yüzleri yazdır': 'Print back sides', 'Ön yüzlerin basılmasını bekleyin.': 'Wait for the front sides to finish printing.',
    'Basılan desteyi sırasını bozmadan alın, yazılı yüzü aşağı gelecek şekilde ve üst kenarı yazıcıya girecek biçimde kâğıt tepsisine geri koyun.': 'Take the printed stack without reordering it and put it back in the tray printed side down, top edge first.',
    'Hazır olunca aşağıdaki düğmeye basın.': 'Press the button below when ready.',
    'Kâğıdın iki yüzüne basılır; katlayıp ortadan zımbalayınca kitapçık olur. Yazıcıda "kısa kenardan çevir" seçin ya da elle çift tarafı açın.': 'Printed on both sides; fold and staple in the middle. Choose "flip on short edge" or enable manual duplex.',
    'Inkwell kuruluysa baskı ve yazıcı bakımı tek pencerede yapılabilir.': 'With Inkwell installed, printing and printer maintenance live in one window.',
    'Bu belgede doldurulabilir form var': 'This document has a fillable form', 'Mavi alanlara tıklayıp yazın.': 'Click the blue fields and type.',
    'alan dolduruldu': 'fields filled', 'Kaydederken düzleştir': 'Flatten when saving',
    'Metin tanıma (OCR)': 'Text recognition (OCR)', 'Metin tanınıyor...': 'Recognizing text...', 'OCR motoru hazırlanıyor...': 'Preparing OCR engine...',
    'Sayfada tanınacak metin bulunamadı': 'No text found to recognize', 'satır tanındı': 'lines recognized', 'Başlat': 'Start',
    'Taranmış sayfalardaki yazıyı tanır. Tamamen cihazınızda çalışır.': 'Recognizes text on scanned pages. Runs entirely on your device.',
    'Aranabilir yap': 'Make searchable', 'Düzenlenebilir yap': 'Make editable',
    'Görünüm değişmez; metin seçilebilir, aranabilir ve kopyalanabilir olur.': 'Looks the same; text becomes selectable, searchable and copyable.',
    'Taranmış yazı silinir, yerine gerçek metin yazılır; sonra Düzenle aracıyla değiştirebilirsiniz. Deneysel.': 'Scanned text is replaced with real text you can change with the Edit tool. Experimental.',
    'Türkçe + İngilizce (karışık belgeler için)': 'Turkish + English (for mixed documents)', 'OCR ile metne çevir': 'Convert with OCR',
    'Bu sayfada düzenlenebilir metin yok (taranmış olabilir). Akıllı silgi ve Metin aracını kullanın.': 'No editable text on this page (it may be scanned). Use the magic eraser and the Text tool.',
    'Döndürülmüş metin henüz yerinde düzenlenemiyor; Akıllı silgi ve Metin aracını kullanın.': 'Rotated text cannot be edited in place yet; use the magic eraser and the Text tool.',
    'Kaldır': 'Remove',
    // Nesne aracı (Magic Grab)
    'Nesne': 'Object', 'Tıklanan nesneyi ayrı katmana çıkar': 'Lift the clicked object onto its own layer',
    'Nesnenin üzerine tıklayın. Shift ile nokta ekleyin, Alt ile istemediğiniz bölgeyi çıkarın. Onaylayınca nesne taşınabilir bir katman olur, arkası doldurulur.': 'Click an object. Shift-click to add points, Alt-click to exclude areas. When you confirm, the object becomes a movable layer and the space behind it is filled.',
    'Arkasını doldur': 'Fill behind', 'nokta': 'points', 'Katmana çıkar': 'Lift to layer',
    'Nesne seçimi için yapay zekâ modeli indirilecek. Bir kez iner, sonra çevrimdışı çalışır.': 'An AI model will be downloaded for object selection. It downloads once, then works offline.',
    'Görsel analiz ediliyor...': 'Analyzing image...', 'Nesne katmana çıkarılıyor...': 'Lifting object to a layer...',
    'Nesne bulunamadı': 'No object found', 'Nesne ayrı katmana çıkarıldı': 'Object lifted to its own layer',
    // Arka plan kaldırma
    'Arka planı kaldır': 'Remove background', 'Arka plan kaldırıldı': 'Background removed',
    'Yapay zekâ ana nesneyi ayırır. Tamamen cihazınızda çalışır.': 'AI separates the main subject. Runs entirely on your device.',
    'Arka plan ayrılıyor...': 'Separating background...', 'Model bir kez indirilir, sonra çevrimdışı çalışır.': 'The model downloads once, then works offline.',
    'Modeli indir ve çalıştır': 'Download model and run', 'Model': 'Model',
    'Hızlı, küçük model; çoğu fotoğraf için yeterli.': 'Small, fast model; good enough for most photos.',
    'Nesne kenarlarını SAM 2 ile keskinleştirir; daha doğru, biraz daha yavaş.': 'Sharpens object edges with SAM 2; more accurate, a bit slower.', 'Hassas': 'Precise',
    'Arka plan': 'Background', 'Şeffaf': 'Transparent', 'Bulanık': 'Blurred', 'Bulanıklık': 'Blur',
    'Şeffaf sonuç PNG olarak indirilir.': 'A transparent result downloads as PNG.',
    // Belge tarayıcı
    'Belge tarayıcı': 'Document scanner', 'Belge tara': 'Scan document', 'Belge olarak tara': 'Scan as document',
    'Fotoğraftaki belgenin köşeleri otomatik bulunur; gerekirse köşeleri sürükleyin. Her fotoğraf bir A4 sayfası olur.': 'The document corners are found automatically; drag them to adjust. Each photo becomes an A4 page.',
    'Belge fotoğrafları ekleyin': 'Add document photos', 'Birden çok fotoğraf tek PDF olur': 'Several photos become one PDF',
    'Köşeler bulunamadı; elle ayarlayın.': 'Corners not found; adjust them by hand.',
    'Görünüm': 'Look', 'Renkli': 'Color', 'Gri': 'Grayscale', 'Siyah-beyaz': 'Black & white', 'Eşik': 'Threshold', 'Kontrast': 'Contrast',
    'Metni tanı (OCR)': 'Recognize text (OCR)', 'PDF oluştur': 'Create PDF', 'Fotoğraf ekle': 'Add photo',
    'Taranıyor...': 'Scanning...', 'Tarama': 'Scan', 'sayfa tarandı': 'pages scanned',
    'Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?': 'Unsaved changes will be lost. Continue?',
    // Katmanlar
    'Katmanlar': 'Layers', 'Kilitle': 'Lock', 'Kilidi aç': 'Unlock', 'Gizle': 'Hide', 'Göster': 'Show',
    'Sihirli Katmanlar': 'Magic Layers', 'Katmanlara ayrılıyor...': 'Splitting into layers...',
    'Sihirli Katmanlar için yapay zekâ modelleri indirilecek. Bir kez iner, sonra çevrimdışı çalışır.': 'AI models will be downloaded for Magic Layers. They download once, then work offline.',
    'Nesneler bulunuyor...': 'Finding objects...', 'Yazılar okunuyor...': 'Reading text...', 'Arka plan dolduruluyor...': 'Filling the background...',
    'yazı': 'text', 'nesne katmanı oluşturuldu': 'object layers created',
};

let locale = (() => {
    try {
        const saved = localStorage.getItem('paperwell.locale');
        if (saved) return saved;
    } catch { /* yoksay */ }
    return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
})();
const listeners = new Set();

export function t(key) {
    if (locale === 'tr') return key;
    return EN[key] ?? key;
}

export function getLocale() { return locale; }

export function setLocale(l) {
    locale = l;
    try { localStorage.setItem('paperwell.locale', l); } catch { /* yoksay */ }
    document.documentElement.lang = l;
    listeners.forEach((fn) => fn());
}

/** Dil değişince bileşeni yeniden çizer */
export function useLocale() {
    return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => locale);
}
