# Görsel tarafı: hedef ve yol haritası (2026-11-11)

Kullanım senaryosu: GDG Kastamonu sosyal medya görselleri. Gerçek işte kullanılacak; "çalışıyor gibi" değil, Canva kalitesinde olmalı.

## 1. Sihirli Katmanlar (öncelik 1)

**Hedef (Canva "Magic Layers" ekran görüntüsündeki gibi):** Düz bir afiş/görsel tek tıkla düzenlenebilir katmanlara ayrılır:
- **Her yazı bloğu ayrı, düzenlenebilir metin katmanı** ("Google Developer Group", "Kastamonu University", "Voleybol", "Gecesi", tarih/saat/yer satırları…). Yazı boyutu, rengi, kalınlığı ve eğikliği (döndürülmüş "Voleybol", "Hadi sahaya!") korunmalı; en yakın font seçilmeli.
- **Her grafik öğe ayrı görsel katmanı:** logolar, ikonlar (takvim, saat, konum), dekoratif çizgiler/kavisler, şekiller.
- **Asıl nesneler de ayrılmalı:** Canva'nın kaçırdığı **voleybol topu** bizde ayrı katman olmalı.
- **Arka plan:** Öğeler çıkarıldıktan sonra kalan boşluklar doldurulmuş temiz bir arka plan katmanı.
- Her katman Seç aracıyla taşınabilir, boyutlanabilir, silinebilir; katman paneli (sıra, gizle, kilitle).

**Şu anki durum:** Magic Grab (SlimSAM) tek tek tıklamada bile kötü sonuç veriyor; otomatik ayrıştırma yok.

**Teknik yaklaşım (araştırılacak):**
1. Metin: stilize/döndürülmüş yazı için Tesseract yetersiz → metin bölgesi algılama (ör. PaddleOCR DB / CRAFT ONNX) + tanıma; renk/boyut/açı ölçümü; font eşleme.
2. Öğeler: SAM 2 (Apache 2.0) "her şeyi segmente et" modu, ızgara noktaları + maske birleştirme/filtreleme; tasarım öğeleri için ek olarak arka plandan fark + bağlı bileşenler.
3. Arka plan onarımı: büyük alanlarda MI-GAN yerine LaMa (Apache 2.0) değerlendirilmeli.
4. Katman sırası: alan/derinlik sezgisi; metin her zaman en üstte.
5. Ölçüt: Örnek afişte (voleybol) metinlerin %90+'ı doğru metin katmanı, top + logolar + ikonlar ayrı katman, arka planda iz kalmaması.

## 2. Arka plan kaldırma (öncelik 2)

Şu anki U²-Netp/IS-Net sonuçları yetersiz. MIT uyumlu daha güçlü model (ör. BiRefNet) + kenar iyileştirme (saç/ince detay). RMBG-1.4/2.0 lisansı uygun değil.

## 3. Canva'da olup bizde olmayanlar (görsel tarafı)

- **Sosyal medya boyutları / yeniden boyutlandırma:** 1080×1080, 1080×1350, story 1080×1920, kapak; tasarımı yeni boyuta uyarlama.
- **Marka kiti:** GDG renkleri, fontları, logoları kayıtlı; tek tıkla kullan.
- **Hazır öğeler ve şablonlar:** ikon/şekil kitaplığı (açık lisanslı), etkinlik afişi şablonları.
- **Font kitaplığı:** Google Fonts (çevrimdışı alt küme), metin efektleri (gölge, kontur, kavisli yazı, arka plan kutusu).
- **Görsel düzenleme:** kırp, çevir, filtreler, parlaklık/kontrast/doygunluk, bulanıklaştır, çerçeveler/ızgaralar, maske şekilleri.
- **Hizalama araçları:** çoklu seçim, grupla, hizala/dağıt, akıllı kılavuzlar, kilit.
- **Sihirli Genişlet (outpainting)** ve **Sihirli Düzenle** (üretken değiştirme): ağır modeller, sonraya.
- **Dışa aktarma:** şeffaf PNG, JPG kalite, SVG, çoklu sayfa (carousel).
- QR kod oluşturucu, grafik/çizelge.

## 4. Ek fikirler (2026-11-11, ikinci tur)

- **Toplu üretim (Canva "Bulk Create"):** CSV/Excel'den isimlerle sertifika, yaka kartı, konuşmacı kartı üret; tek PDF ya da ayrı PNG'ler. Inkwell + kitapçık/N-up ile kesim işaretli toplu baskı (A4'e 8 yaka kartı).
- **Tasarımı çevir:** Metin katmanlarını tek tıkla TR ↔ EN çevir, kutuya sığdır (yerel model ya da isteğe bağlı API).
- **Arka planı değiştir / bulanıklaştır:** Konuyu koru, arka planı düz renk, gradyan, başka fotoğraf ya da portre bulanıklığı yap.
- **Akıllı kırpma:** Konuya göre otomatik kırp, her sosyal medya boyutu için ayrı.
- **Renk araçları:** damlalık, logodan otomatik palet çıkarma, gradyan dolgu, okunabilirlik (kontrast) uyarısı.
- **Hareketli dışa aktarma:** Story/Reels için basit giriş animasyonlu MP4/GIF.
- **Mockup:** Tasarımı telefon ekranına, tişörte, rollup'a yerleştirerek önizleme.
- **Instagram carousel:** Geniş tasarımı kaydırmalı gönderi için eşit parçalara böl.
- **Etkinlik araçları:** Logolu QR kod, geri sayım, konuşmacı/sponsor kartı şablonları.
- **Otomatik kaydetme ve sürüm geçmişi:** Çalışma kaybolmasın, eski sürüme dönülebilsin.

## İsim notu

- İnternette "Paperwell" adlı başka bir araç var (farklı işte). GitHub yayını öncesi karar verilecek: ad korunsun mu (ör. "Paperwell Studio"/"Paperwell PDF") yoksa değişsin mi; marka/alan adı/GitHub/npm çakışması kontrol edilecek.
