# Nebula PDF

**Tarayıcıda çalışan, açık kaynak PDF ve görsel editörü.** Metni orijinal fontuyla yerinde düzenleyin, akıllı silgiyle istemediğiniz şeyi yok edin, hassas bilgiyi gerçekten karartın, imzalayın ve işaretleyin. Dosyalarınız cihazınızdan hiç çıkmaz: sunucu yok, hesap yok, reklam yok.

*An open-source PDF & image editor that runs entirely in your browser. Edit text in its original font, erase anything with the magic eraser, truly redact sensitive data, sign and annotate. Your files never leave your device. (English UI included.)*

## Özellikler

| | |
|---|---|
| **Metni yerinde düzenle** | Satıra tıklayın, yazın. Nebula PDF içerik akışını kendisi çözümler; yeni karakterler gömülü fontta varsa metin **aynı fontla** yazılır, yoksa ölçüleri uyumlu bir font (Liberation Sans = Arial ölçüleri) kullanılır. Boyut, renk, kalın/italik değiştirilebilir. |
| **Akıllı silgi** | Fırçayla boyayın, bırakın, silinsin. *Hızlı* mod (Telea onarma) belgeler ve düz arka planlar için anında ve çevrimdışı çalışır. *Yapay zekâ* modu [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN) modelini (~28 MB, bir kez) indirip fotoğraflarda nesne siler. Altındaki metin de dosyadan gerçekten kaldırılır. |
| **Gerçek karartma** | Karartılan alandaki metin yalnızca örtülmez, **içerik akışından silinir**; kopyalanamaz, aranamaz. Metin arayıp tüm geçişleri tek seferde işaretleyebilirsiniz (IBAN, TC no...). |
| **Görselleri düzenle** | Belgedeki mevcut görselleri taşıyın, boyutlandırın, silin ya da değiştirin. |
| **İşaretle** | Metne yapışan vurgulama, altı/üstü çizili, serbest kalem ve işaretleyici, şekiller (dikdörtgen, elips, çizgi, ok), metin kutuları, yapışkan notlar (PDF yorumu olarak kaydedilir). Hepsi **vektör** olarak gömülür. |
| **İmzala** | Çizin, yazın ya da yükleyin; imzalar tarayıcıda saklanır, tek tıkla yerleştirilir. |
| **Sayfalar** | Sürükleyerek sırala, döndür, çoğalt, sil, boş sayfa ya da başka PDF ekle, seçili sayfaları ayrı PDF yap. |
| **Belge araçları** | Birleştir, böl, sıkıştır, filigran, sayfa numarası, belge bilgileri, bul ve değiştir. |
| **Dönüştür** | PNG/JPG (tek sayfa ya da ZIP), Word (.docx, yazı tipi/boyut/renk korunur). |
| **Görseller** | PNG/JPG/WebP açın, akıllı silgiyle düzenleyin, orijinal çözünürlükte geri indirin. |
| **Rahat kullanım** | Açık/koyu tema, Türkçe/İngilizce, tek geri alma geçmişi, klavye kısayolları (`?`), Ctrl+tekerlek ile imlece göre yakınlaştırma. |

## Çalıştırma

```bash
npm install
npm run dev
```

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
src/core/export.js   katman nesnelerinin vektör olarak gömülmesi
src/app/             arayüz (React + Tailwind)
src/store/           durum ve belge eylemleri
```

Kullanılan açık kaynak projeler: [pdf.js](https://github.com/mozilla/pdf.js) (render), [pdf-lib](https://github.com/Hopding/pdf-lib) (yazma), [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN), [docx](https://github.com/dolanmiu/docx), [lucide](https://lucide.dev). Fontlar: Liberation Sans (OFL), DejaVu Serif / Sans Mono (Bitstream Vera lisansı).

## Bilinen sınırlar

- Metin düzenleme satır bazlıdır; paragraf yeniden akışı (reflow) henüz yok.
- Döndürülmüş/eğik metin satırları yerinde düzenlenemez (akıllı silgi + metin kutusu kullanılabilir).
- Şifreli PDF'ler açılmaz.
- Sıkıştırma sayfaları görsele çevirir; metin seçilemez hale gelir.

## Lisans

[MIT](LICENSE)
