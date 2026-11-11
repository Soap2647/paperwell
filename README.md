# Paperwell

**Tarayıcıda çalışan, açık kaynak PDF ve görsel editörü.** Metni orijinal fontuyla yerinde düzenleyin, akıllı silgiyle istemediğiniz şeyi yok edin, hassas bilgiyi gerçekten karartın, imzalayın ve işaretleyin. Dosyalarınız cihazınızdan hiç çıkmaz: sunucu yok, hesap yok, reklam yok.

*An open-source PDF & image editor that runs entirely in your browser. Edit text in its original font, erase anything with the magic eraser, truly redact sensitive data, sign and annotate. Your files never leave your device. (English UI included.)*

## Özellikler

| | |
|---|---|
| **Metni yerinde düzenle** | Satıra tıklayın, yazın. Paperwell içerik akışını kendisi çözümler; yeni karakterler gömülü fontta varsa metin **aynı fontla** yazılır, yoksa ölçüleri uyumlu bir font (Liberation Sans = Arial ölçüleri) kullanılır. Boyut, renk, kalın/italik değiştirilebilir. |
| **Akıllı silgi** | Fırçayla boyayın, bırakın, silinsin. *Hızlı* mod (Telea onarma) belgeler ve düz arka planlar için anında ve çevrimdışı çalışır. *Yapay zekâ* modu [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN) modelini (~28 MB, bir kez) indirip fotoğraflarda nesne siler. Altındaki metin de dosyadan gerçekten kaldırılır. |
| **Nesneyi katmana çıkar** | *Nesne* aracıyla fotoğraftaki bir nesneye tıklayın (Shift: nokta ekle, Alt: bölge çıkar); [SlimSAM](https://huggingface.co/Xenova/slimsam-77-uniform) (Segment Anything, Apache-2.0, ~14 MB, bir kez iner) maskeyi çıkarır, onaylayınca nesne şeffaf PNG katmanı olur ve arkası akıllı silgiyle doldurulur. Sonra Seç aracıyla taşıyın, boyutlandırın, silin. |
| **Arka planı kaldır** | Görsel belgede ya da seçili görsel nesnesinde (ör. imza fotoğrafı) tek tıkla: şeffaf, düz renk ya da bulanık arka plan. *Hızlı* model [U²-Netp](https://github.com/xuebinqin/U-2-Net) (Apache-2.0, ~5 MB), *Kaliteli* model [IS-Net/DIS](https://github.com/xuebinqin/DIS) (Apache-2.0, ~179 MB); ilk kullanımda onayla iner. Şeffaf sonuç PNG olarak indirilir. |
| **Gerçek karartma** | Karartılan alandaki metin yalnızca örtülmez, **içerik akışından silinir**; kopyalanamaz, aranamaz. Metin arayıp tüm geçişleri tek seferde işaretleyebilirsiniz (IBAN, TC no...). |
| **OCR** | Taranmış belgeleri Tesseract ile (Türkçe + İngilizce) tanır: *aranabilir* yapar (görünmez metin katmanı) ya da *düzenlenebilir* yapar (taranmış yazı gerçek metne dönüşür). Motor ve dil verisi uygulamayla gelir, internet gerekmez. |
| **Form doldurma** | PDF formlarındaki metin, onay kutusu, seçenek ve açılır liste alanlarını doğrudan doldurun; Türkçe karakterler doğru görünür, istenirse form düzleştirilir. |
| **Yazdır** | Normal, sayfa başına 2/4, kitapçık (ortadan zımbalı) yerleşim; A4/Letter/A3'e sığdırma; otomatik çift taraf basamayan yazıcılar için elle çift taraf sihirbazı. |
| **Görselleri düzenle** | Belgedeki mevcut görselleri taşıyın, boyutlandırın, silin ya da değiştirin. |
| **İşaretle** | Metne yapışan vurgulama, altı/üstü çizili, serbest kalem ve işaretleyici, şekiller (dikdörtgen, elips, çizgi, ok), metin kutuları, yapışkan notlar (PDF yorumu olarak kaydedilir). Hepsi **vektör** olarak gömülür. |
| **İmzala** | Çizin, yazın ya da yükleyin; imzalar tarayıcıda saklanır, tek tıkla yerleştirilir. |
| **Sayfalar** | Sürükleyerek sırala, döndür, çoğalt, sil, boş sayfa ya da başka PDF ekle, seçili sayfaları ayrı PDF yap. |
| **Belge araçları** | Birleştir, böl, sıkıştır, filigran, sayfa numarası, belge bilgileri, bul ve değiştir. |
| **Dönüştür** | PNG/JPG (tek sayfa ya da ZIP), Word (.docx, yazı tipi/boyut/renk korunur). |
| **Görseller** | PNG/JPG/WebP açın, akıllı silgiyle düzenleyin, orijinal çözünürlükte geri indirin. |
| **Rahat kullanım** | Açık/koyu tema, Türkçe/İngilizce, tek geri alma geçmişi, klavye kısayolları (`?`), Ctrl+tekerlek ile imlece göre yakınlaştırma. |

## Masaüstü uygulaması

Paperwell, [Tauri 2](https://tauri.app) ile Windows/macOS/Linux için yerel uygulama olarak da derlenir (~10 MB): yerel aç/kaydet, Ctrl+S ile aynı dosyanın üzerine kaydetme, PDF'lerle "Birlikte aç" ilişkilendirmesi.

**Inkwell ile birlikte:** Inkwell (açık kaynak yazıcı uygulaması) kuruluysa Yazdır penceresinde "Inkwell ile yazdır" çıkar; belge baskı ve yazıcı bakımı için Inkwell'de açılır. Paperwell de bir PDF yoluyla başlatılabilir (`paperwell <dosya.pdf>`), böylece Inkwell'den "Düzenle" ile açılabilir.

```bash
npm run tauri:dev     # geliştirme
npm run tauri:build   # kurulum paketleri (src-tauri/target/release/bundle)
```

## Çalıştırma (web)

```bash
npm install
npm run dev
```

> Windows PowerShell'de `npm` script kısıtına takılırsanız `npm.cmd run dev` kullanın.

Üretim derlemesi `npm run build` ile `dist/` klasörüne çıkar; herhangi bir statik barındırmada (GitHub Pages, Netlify, Cloudflare Pages) çalışır.

Motor testleri (Node, PyMuPDF gerekmez):

```bash
npm test
```

## Mimari

```
src/core/pdf/        PDF içerik motoru
  contentStream.js   içerik akışı ayrıştırıcı (bayt aralıklarıyla)
  fonts.js           font kod ↔ Unicode, genişlikler, ToUnicode CMap, yeniden kodlama
  pageModel.js       yorumlayıcı: glif konumları, satırlar, renkler, görsel yerleşimleri
  editOps.js         satır değiştirme, glif silme (redaksiyon), görsel taşıma/silme/değiştirme
src/core/inpaint/    telea.js (klasik), migan.js (ONNX Runtime Web, WebGPU/WASM)
src/core/eraser.js   akıllı silgi hattı
src/core/segment.js  SlimSAM nesne maskesi; grab.js nesneyi katmana çıkarma
src/core/modelStore.js  model indirme / Cache Storage / ONNX oturumları
src/core/bgremove.js arka plan kaldırma (U²-Netp / IS-Net)
src/core/export.js   katman nesnelerinin vektör olarak gömülmesi
src/core/ocr.js      Tesseract.js ile OCR (aranabilir / düzenlenebilir)
src/core/forms.js    AcroForm okuma/doldurma
src/core/imposition.js  N-up, kitapçık, elle çift taraf
src/platform.js      web ↔ masaüstü (Tauri) köprüsü
src-tauri/           masaüstü kabuğu (Rust)
src/app/             arayüz (React + Tailwind)
src/store/           durum ve belge eylemleri
```

Kullanılan açık kaynak projeler: [pdf.js](https://github.com/mozilla/pdf.js) (render), [pdf-lib](https://github.com/Hopding/pdf-lib) (yazma), [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), [Tesseract.js](https://github.com/naptha/tesseract.js), [Tauri](https://tauri.app), [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN), [SlimSAM](https://github.com/czg1225/SlimSAM) / [Segment Anything](https://github.com/facebookresearch/segment-anything), [U²-Net](https://github.com/xuebinqin/U-2-Net), [DIS / IS-Net](https://github.com/xuebinqin/DIS), [docx](https://github.com/dolanmiu/docx), [lucide](https://lucide.dev). Fontlar: Liberation Sans (OFL), DejaVu Serif / Sans Mono (Bitstream Vera lisansı).

## Bilinen sınırlar

- Metin düzenleme satır bazlıdır; paragraf yeniden akışı (reflow) henüz yok.
- Döndürülmüş/eğik metin satırları yerinde düzenlenemez (akıllı silgi + metin kutusu kullanılabilir).
- Şifreli PDF'ler açılmaz.
- Sıkıştırma sayfaları görsele çevirir; metin seçilemez hale gelir.

## Lisans

[MIT](LICENSE)
