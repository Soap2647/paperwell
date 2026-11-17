// Tanıtım turu: düzenleyici ilk açıldığında ekranın bölümleri adım adım gösterilir; her araç ilk seçildiğinde
// o aracın bütün özellikleri sağ panelin başında tek tek anlatılır. Görülenler tarayıcı deposunda tutulur.
import { useSyncExternalStore } from 'react';

const KEY = 'paperwell.tour';
const subs = new Set();
let cache = null;
const read = () => {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cache = {}; }
    return cache;
};
const write = (v) => {
    cache = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* yoksay */ }
    subs.forEach((f) => f());
};
export const useTourState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read);
export const markSeen = (key) => write({ ...read(), [key]: true });
/** Turu ve bütün araç kartlarını baştan göster */
export const resetTour = () => write({});

/**
 * Genel tur adımları. target: [data-tour] değeri (yoksa adım ekranın ortasında gösterilir).
 * Metinler Türkçe; arayüzde t() ile çevrilir.
 */
export const GENERAL_STEPS = [
    { title: 'Paperwell\'e hoş geldiniz', text: 'Kısa bir turla ekranı tanıyalım. İstediğiniz an "Geç" diyebilirsiniz; bu turu menüden (⋯ → Turu yeniden başlat) tekrar açabilirsiniz.' },
    { target: 'rail', title: 'Araçlar', text: 'Soldaki her düğme bir araç. Bir araca ilk tıkladığınızda sağ panelde o aracın bütün özellikleri tek tek anlatılır. Klavye kısayolları düğmelerin üzerinde yazar.' },
    { target: 'tool-fix', title: 'Düzelt: yapay zekâ görselini onarın', text: 'Bozuk logoyu, yanlış yazıyı ya da istemediğiniz bir detayı kutuya alın: silin, yazıyı düzeltin ya da yerine kendi logonuzu koyun. Görseldeki bütün yazıları listeden tek seferde de düzeltebilirsiniz.' },
    { target: 'tool-brand', title: 'Marka kiti', text: 'Logolarınızı, renklerinizi ve fontunuzu bir kez ekleyin; her açılışta hazırdır. Logo ve yazı yerleşimini şablon yapıp yeni afişlere tek tıkla uygulayın.' },
    { target: 'tool-insert', title: 'Ekle: QR kod ve etkinlik bilgisi', text: 'Kayıt linkinden QR kod üretin; tarih, saat ve yeri marka fontunuzla, afişin boş bir yerine okunaklı renkte ekleyin.' },
    { target: 'inspector', title: 'Özellikler paneli', text: 'Seçtiğiniz şeyin bütün ayarları burada: yazı efektleri (gölge, dış çizgi, degrade), logo zeminini silme, okunabilirlik uyarıları, hizalama ve logo şeridi.' },
    { target: 'compare', title: 'Önce / sonra', text: 'Bu düğmeyi basılı tutun: görselin açtığınız ilk hali görünür, bırakınca son hali. Değişikliklerinizi karşılaştırmanın en hızlı yolu.' },
    { target: 'save', title: 'Kaydetme', text: 'Ana düğme görseli indirir. Yanındaki oktan: projeyi kaydedin (logolar ve yazılar sonra da düzenlenebilir), 2 kat çözünürlükte kaydedin ya da yapay zekâyla netleştirin. Ctrl+V ile panodaki logoyu yapıştırabilir, dosyaları pencereye sürükleyebilirsiniz.' },
    { target: 'tools-menu', title: 'Belge araçları', text: 'Sosyal medyaya hazırla (birden çok boyutu tek ZIP\'te), toplu işlem (aynı şablonu birçok afişe), boyutu değiştir, arka planı kaldır ve daha fazlası burada.' },
];

/** Araç kartları: her araç ilk seçildiğinde gösterilen özellik listesi */
export const TOOL_TIPS = {
    select: ['Tıklayarak seçin, sürükleyerek taşıyın; köşelerden boyutlandırın.', 'Boş yerden sürükleyerek kutu çizin: içindeki her şey birlikte seçilir. Shift+tık seçime ekler.', 'Birden çok nesne seçiliyken grupla, hizala, eşit aralıkla dağıt ya da "Logo şeridi yap".', 'Ctrl+C / Ctrl+V kopyala-yapıştır, Ctrl+D çoğalt, ok tuşları 1 pt (Shift ile 10 pt) kaydırır.'],
    edit: ['Belgedeki bir metin satırına tıklayın: orijinal fontuyla yerinde düzenlenir.', 'Bir görsele tıklayın: değiştirin, silin ya da yerini düzenleyin.'],
    fix: ['Kutu modunda bozuk yeri kutuya alın; silinecek alan önce mor gösterilir.', 'Sil: arkası görselin devamıyla doldurulur. Yazıyı düzelt: doğrusunu yazın, aynı boyut ve renkte gelir. Logo koy: marka kitinizdeki logo oraya oturur.', 'Fırça modunda düzensiz şekilleri boyayarak seçin (Shift ile ekleyin).', '"Tüm yazıları bul" görseldeki her satırı listeler; Türkçe yazım hatalarını önerisiyle işaretler, hepsini tek seferde düzeltir.'],
    text: ['Sayfada bir yere tıklayın ve yazın.', 'Seçili yazıya sağ panelden hazır stil (Gölgeli, Neon, Altın…) ya da gölge, dış çizgi, degrade verin.', 'Yazı zeminde zor okunuyorsa panel uyarır ve tek tıkla düzeltir.'],
    draw: ['Serbest çizim: kalem ya da yarı saydam işaretleyici.'],
    highlight: ['Belgedeki metnin üzerinden sürükleyin: vurgu, altı çizili ya da üstü çizili.'],
    shape: ['Sürükleyerek dikdörtgen, elips, çizgi ya da ok çizin. Shift: kare / 45°.'],
    image: ['Bir görsel seçin, sonra sayfada yerleştireceğiniz yere tıklayın.', 'Daha hızlısı: Ctrl+V ile panodaki görseli yapıştırın ya da dosyayı pencereye sürükleyin; afişin boş bir yerine kendiliğinden oturur.', 'Seçili logoda: düz ya da damalı zemini silin, boş kenarları kırpın, tek renge (ör. beyaz) boyayın.'],
    sign: ['İmzanızı çizin, yazın ya da yükleyin; bir kez kaydedin, her belgede kullanın.'],
    note: ['Sayfaya yapışkan not ekleyin; PDF yorum olarak kaydedilir.'],
    erase: ['Fırçayla boyayın, bıraktığınızda yapay zekâ o alanı çevresiyle doldurur.'],
    grab: ['Bir nesneye tıklayın: görselden kesilip ayrı, taşınabilir bir katman olur.'],
    brand: ['Logolarınızı ekleyin; tıklayınca afişin boş bir yerine yerleşir.', 'Marka renkleri her renk seçicinin başında görünür; damlalıkla afişten renk alabilirsiniz.', 'Yeni yazıların fontunu seçin.', 'Logo ve yazı yerleşimini şablon yapın; yeni afişe ya da toplu işlemle onlarca afişe uygulayın. Kiti dışa aktarıp ekibinizle paylaşın.'],
    insert: ['Linki yazın, QR kod afişin boş bir yerine eklenir.', 'Tarih, saat, yer (ve isterseniz kayıt linki) yazın: marka fontunuzla, zemine göre okunaklı renkte, gruplu bir bilgi bloğu olur.'],
    redact: ['Hassas bilgiyi kutuya alın: kaydedince içerikten gerçekten silinir, sadece üstü örtülmez.'],
};
