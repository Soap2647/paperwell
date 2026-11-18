# Paperwell

**Yapay zekâ afişlerini onaran, PDF'leri düzenleyen, tamamen yerel çalışan açık kaynak editör.**

ChatGPT gibi araçların ürettiği afişler çoğu zaman neredeyse doğrudur: yazılarda bozuk Türkçe harfler, uydurma logolar, yersiz detaylar olur. Paperwell bunları dakikalar içinde düzeltmek için yapıldı. Bozuk yeri kutuya alırsınız: siler, yazıyı doğru haliyle yeniden yazar ya da yerine kendi logonuzu koyar. Üstüne logo şeridi, QR kod, etkinlik bilgisi ekler, kalite kontrolünden geçirir, Instagram boyutlarında ya da hareketli story olarak dışa aktarır.

Bütün yapay zekâ modelleri bilgisayarınızda çalışır (masaüstünde ekran kartında, DirectML ile). Dosyalarınız hiçbir sunucuya gitmez; hesap, abonelik, reklam yok.

*An open-source editor that repairs AI-generated posters and edits PDFs, entirely on your machine. English UI included.*

---

## İçindekiler

- [Masaüstüne kurulum (Windows)](#masaüstüne-kurulum-windows)
- [5 adımda bir yapay zekâ afişini onarmak](#5-adımda-bir-yapay-zekâ-afişini-onarmak)
- [Özellikler](#özellikler)
- [Gizlilik ve yapay zekâ modelleri](#gizlilik-ve-yapay-zekâ-modelleri)
- [Kaynak koddan derleme](#kaynak-koddan-derleme)
- [Geliştirme](#geliştirme)
- [Bilinen sınırlar](#bilinen-sınırlar)
- [Lisans](#lisans)

---

## Masaüstüne kurulum (Windows)

**Gereken:** Windows 10 (1903 ve sonrası) ya da Windows 11, 64 bit. Yönetici izni gerekmez. Ekran kartı varsa yapay zekâ işlemleri onda çalışır (NVIDIA, AMD, Intel; DirectML). Yoksa işlemci kullanılır; her şey yine çalışır, sadece daha yavaştır.

### 1. Kurulum dosyasını indirin

1. Deponun **[Releases](https://github.com/Soap2647/paperwell/releases)** sayfasını açın.
2. En üstteki (en yeni) sürümün altındaki **Assets** bölümünü genişletin.
3. **`Paperwell_x.y.z_x64-setup.exe`** dosyasını indirin (yaklaşık 40 MB).

> Hangisini seçmeli? **`-setup.exe` (NSIS)** herkes için önerilen kurulumdur ve görselleri "Birlikte aç" menüsüne ekler. **`.msi`** kurumsal dağıtım (Intune, Grup İlkesi) içindir.
>
> Releases sayfasında dosya yoksa [kaynak koddan derleyebilirsiniz](#kaynak-koddan-derleme); kurulum dosyası `src-tauri/target/release/bundle/nsis/` altına çıkar.

### 2. Kurulumu çalıştırın

1. İndirilen dosyaya çift tıklayın.
2. **"Windows bilgisayarınızı korudu"** uyarısı çıkarsa **Ek bilgi**'ye, sonra **Yine de çalıştır**'a tıklayın.
   Bu uyarı, kurulum dosyası henüz ücretli bir kod imzası sertifikasıyla imzalanmadığı için çıkar; kaynak kodun tamamı bu depodadır.
3. Kurulum dilini seçin (Türkçe / English) ve **Kur**'a tıklayın.
   Paperwell yalnız sizin kullanıcınıza kurulur (`%LOCALAPPDATA%\Paperwell`), yönetici şifresi sorulmaz.
4. **Bitir**'e tıklayın. Başlat menüsüne kısayol eklenir; son ekrandaki kutuyu işaretli bırakırsanız masaüstüne de.

### 3. İlk açılış

1. Açılışta kısa bir **tanıtım turu** ekranın bölümlerini gösterir. İstediğiniz an "Turu geç" diyebilir, sonra menüden (⋯ → Turu yeniden başlat) tekrar açabilirsiniz.
2. Her aracı ilk seçtiğinizde sağ panelde o aracın bütün özellikleri madde madde anlatılır.
3. Yapay zekâ modelleri **ilk kullanıldıklarında**, sorulup onay alınarak bir kez iner. Ondan sonra uygulama internetsiz çalışır.

### 4. Dosyaları Paperwell ile açmak

- **PDF ve `.paperwell` projeleri:** Kurulumdan sonra çift tıklayınca Paperwell'de açılır.
- **PNG, JPG, WebP:** Görsele sağ tıklayın → **Birlikte aç** → **Paperwell**. Varsayılan görsel uygulamanız (ör. Fotoğraflar) değişmez.
- Ya da dosyayı Paperwell penceresine sürükleyin. Başlangıç ekranındaki **Son açılanlar** listesinden de dönebilirsiniz.

### 5. Güncelleme ve kaldırma

- **Güncelleme:** Releases sayfasından yeni sürümün `-setup.exe` dosyasını indirip kurun; eski sürümün üzerine kurulur. Marka kitiniz, şablonlarınız, imzalarınız ve projeleriniz korunur.
- **Kaldırma:** Ayarlar → Uygulamalar → Yüklü uygulamalar → **Paperwell** → Kaldır. "Birlikte aç" kayıtları da silinir.

---

## 5 adımda bir yapay zekâ afişini onarmak

1. **Açın:** Afişi pencereye sürükleyin (ya da sağ tık → Birlikte aç → Paperwell).
2. **Netleştirin:** Görsel küçükse (ChatGPT afişleri genelde 1024-1254 px) sağ paneldeki **Netleştir (2×)** ile iki kat büyütün; yazı ve kenarlar keskinleşir.
3. **Düzeltin:** **Düzelt** aracıyla (F) bozuk yeri kutuya alın → *Sil*, *Yazıyı düzelt* ya da *Logo koy*. Ya da **Tüm yazıları bul**: görseldeki her satır listelenir, Türkçe yazım hataları önerisiyle işaretlenir (GELECEGE → GELECEĞE), hepsi tek seferde düzeltilir.
4. **Ekleyin:** Logoları **Ctrl+V** ile yapıştırın; afişin boş bir yerine kendiliğinden oturur. Birkaçını seçip **Logo şeridi yap**. **Ekle** aracıyla (Q) QR kod, etkinlik bilgisi ya da hazır yerleşimler.
5. **Kontrol edip paylaşın:** **Kontrol et** (Yayına hazır mı?) okunmayan yazıları, yazım hatalarını, taşan öğeleri ve story bantlarını bulur, tek tıkla düzeltir. Sonra **Sosyal medyaya hazırla** ile bir ya da birkaç boyutu tek ZIP'te alın, ya da **Hareketli story** ile MP4 yapın. Sonradan düzenlemek için **Projeyi kaydet** (.paperwell).

---

## Özellikler

### Yapay zekâ görselini onarma
| | |
|---|---|
| **Düzelt aracı** | Kutu ya da fırçayla seçin; silinecek alan önce mor gösterilir. *Sil* arkayı görselin devamıyla doldurur (düz/degrade zemin anında, kalanı MI-GAN / LaMa). Büyük silmelerde dolgu yapay zekâ büyütmesiyle keskinleştirilir ve çevrenin dokusu eklenir. |
| **Yazıyı düzelt** | Bozuk yazı OCR ile okunur; doğrusunu yazarsınız, aynı boyut, kalınlık ve renkte düzenlenebilir metin olarak gelir. |
| **Tüm yazıları bul** | Görseldeki bütün satırlar tek listede; Türkçe yazım denetimi (hunspell tr sözlüğü, yerel) i/ı, g/ğ, s/ş gibi yapay zekâ hatalarını önerisiyle işaretler. |
| **Netleştir (2×)** | Real-ESRGAN ile görseli iki kat büyütür; kaydettiğiniz dosya keskin olur. |
| **Fotoğraf ayarları** | Parlaklık, kontrast, doygunluk, sıcaklık (canlı önizleme) ve hazır oranlarla kırpma (1:1, 4:5, 9:16, 16:9). |
| **Önce / sonra** | Düğmeyi basılı tutun: görselin açtığınız ilk hali görünür. |
| **Sihirli Katmanlar** | Düz bir afişi yazı, logo ve nesne katmanlarına ayırır; yazılar mümkünse düzenlenebilir metin olur. |
| **Arka planı kaldır** | Görselde ya da seçili nesnede: şeffaf, düz renk ya da bulanık arka plan. |

### Marka ve logolar
| | |
|---|---|
| **Marka kiti** | Logolar, renkler, varsayılan font ve **şablonlar** (logo + yazı yerleşimi) kalıcı olarak saklanır. |
| **Ekiple ortak kit** | Kiti OneDrive / Google Drive / ağdaki ortak bir klasöre bağlayın; biri logo eklediğinde herkese gelir. |
| **Logo araçları** | Düz ya da resme gömülü **damalı** ("sahte saydam") zemini silme, boş kenarları kırpma, tek renge boyama (beyaz, siyah, marka renkleri, **afişin renkleri**), logonun arkasına afişin renginde zemin. |
| **Logo şeridi** | Seçili logoları aynı yüksekliğe getirir, tek hizaya oturtur, eşit aralıkla dizer. |
| **Akıllı yerleşim** | Yapıştırılan, sürüklenen ya da kitten eklenen logo afişin en sakin (detayı az) yerine oturur. |
| **Okunabilirlik** | Yazı ya da logo zeminde kayboluyorsa panel uyarır: tek tıkla beyaz / koyu yap, dış çizgi ya da gölge ekle. |

### Ekle ve tasarla
| | |
|---|---|
| **QR kod** | Kayıt formu ya da Instagram linkinden; beyaz zeminli ya da saydam. |
| **Etkinlik bilgisi** | Tarih, saat, yer (ve kayıt QR'ı) marka fontunuzla, zemine göre okunaklı renkte gruplu blok. |
| **Hazır yerleşimler** | Alt logo şeridi, altta tarih ve yer, üstte başlık, köşede kayıt QR. |
| **Yazı efektleri** | Gölge, dış çizgi, degrade; hazır stiller (Gölgeli, Çerçeveli, Neon, Altın, Gökkuşağı). Kaydedilen çıktı ekrandakiyle aynıdır. |
| **Yeni tasarım** | Başlangıç ekranında tek tıkla boyut: Instagram kare / dikey, hikaye, YouTube, LinkedIn, yaka kartı, A4, A3, poster. |
| **Damlalık** | Her renk seçicide afişten renk alın; marka renklerine ekleyin. |

### Kaydet ve paylaş
| | |
|---|---|
| **Proje dosyası (.paperwell)** | Afiş, logolar, yazılar ve sürümler düzenlenebilir halde. Otomatik kurtarma: uygulama kapanırsa başlangıç ekranı "Kaldığınız yerden devam edin" der. |
| **Geçmiş ve sürümler** | Geri alma adımlarının listesi (herhangi birine dönün) ve adlı ara sürümler. |
| **Yayına hazır mı?** | Okunabilirlik, yazım, küçük ya da taşan yazı, hikaye bantları, çözünürlük, marka logosu; her soruna "Düzelt". |
| **Sosyal medyaya hazırla** | Bir ya da birkaç boyut (görselde kenarlar tamamlanır), tek ZIP; PNG ya da WhatsApp için 1 MB altı JPG. Hikayede uygulamanın kapattığı bantlar ekranda gösterilir. |
| **Hareketli story** | Afiş durur, logolar ve yazılar sırayla belirir; MP4 video. |
| **Toplu işlem** | Bir şablonu onlarca afişe uygulayın (isteğe bağlı netleştirme), hepsi tek ZIP. |
| **Net kayıt** | Afişin pikselleri birebir korunur; eklenen logolar ayrı katmanda süper örneklenerek çizilir. İsteğe bağlı 2 kat çözünürlük. |

### PDF araçları
Metni orijinal fontuyla yerinde düzenleme, gerçek karartma (metin içerikten silinir), OCR (aranabilir / düzenlenebilir), form doldurma, imza, vurgulama ve notlar, sayfa düzeni (sırala, döndür, böl, birleştir), filigran, sayfa numarası, sıkıştırma, PNG/JPG/Word'e dönüştürme, belge tarayıcı (telefon fotoğrafından A4 PDF), yazdırma (2/4'lü, kitapçık, elle çift taraf).

### Kullanım kolaylığı
Komut arama (**Ctrl+K**: "netleştir", "qr", "logo şeridi" yazın), kutu seçimi ve gruplama, hizalama ve eşit dağıtma, klavye kısayolları (`?`), açık / koyu tema, Türkçe / İngilizce, telefon için uyumlu düzen (web sürümü).

---

## Gizlilik ve yapay zekâ modelleri

Hiçbir dosya ya da görsel bir sunucuya gönderilmez. Modeller ilk kullanımda (onayınızla) bir kez iner, sonra bilgisayarınızda önbellekte kalır. Masaüstünde ONNX Runtime + DirectML ile ekran kartında, web sürümünde tarayıcıda (WebGPU / WASM) çalışırlar.

| Model | Ne için | Lisans | Boyut |
|---|---|---|---|
| [MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN) | Silinen yeri doldurma | MIT | ~28 MB |
| [LaMa](https://github.com/advimman/lama) | Büyük alan doldurma | Apache-2.0 | indirilirken gösterilir |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (general-x4v3) | Netleştirme / büyütme | BSD-3 | ~5 MB |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) + [Tesseract](https://github.com/tesseract-ocr/tesseract) | Yazı bulma ve okuma | Apache-2.0 | uygulamayla / ilk kullanımda |
| [SAM 2](https://github.com/facebookresearch/sam2), [SlimSAM](https://github.com/czg1225/SlimSAM) | Nesne seçme | Apache-2.0 | ~14-62 MB |
| [LayerD](https://github.com/CyberAgentAILab/LayerD) | Afişi katmanlara ayırma | Apache-2.0 | indirilirken gösterilir |
| [BiRefNet](https://github.com/ZhengPeng7/BiRefNet), [U²-Net](https://github.com/xuebinqin/U-2-Net) | Arka plan kaldırma | MIT / Apache-2.0 | ~5 MB+ |
| [hunspell-tr](https://github.com/wooorm/dictionaries) | Türkçe yazım denetimi | MIT | uygulamayla (~9 MB) |

Fontlar: 50 açık lisanslı aile (Google Fonts, OFL / Apache-2.0; lisans metinleri `public/fonts/g/licenses/`). Kendi fontlarınızı da ekleyebilirsiniz.

---

## Kaynak koddan derleme

Releases sayfasında kurulum dosyası yoksa ya da kendiniz derlemek isterseniz:

### Gerekenler (bir kez)
1. **Node.js 22** — [nodejs.org](https://nodejs.org) (LTS).
2. **Rust** — [rustup.rs](https://rustup.rs), kurulumda varsayılanları seçin.
3. **Microsoft C++ Build Tools** — [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) içinden *"C++ ile masaüstü geliştirme"* iş yükü.
4. **WebView2** — Windows 10/11'de genelde yüklüdür; değilse [Microsoft'tan](https://developer.microsoft.com/microsoft-edge/webview2/) kurun.

### Derleme
```bash
git clone https://github.com/Soap2647/paperwell.git
```
```bash
cd paperwell
```
```bash
npm ci
```
```bash
npm run tauri:build
```

İlk derleme 10-15 dakika sürebilir (Rust bağımlılıkları). Bittiğinde kurulum dosyaları burada olur:

```
src-tauri/target/release/bundle/nsis/Paperwell_x.y.z_x64-setup.exe
src-tauri/target/release/bundle/msi/Paperwell_x.y.z_x64_en-US.msi
```

Sonra [kurulum adımlarına](#2-kurulumu-çalıştırın) devam edin.

> Windows PowerShell'de `npm` betik kısıtına takılırsanız `npm.cmd ci` ve `npm.cmd run tauri:build` kullanın.

### Otomatik sürüm (bakımcılar için)
`v*` etiketi gönderildiğinde (`git tag v1.1.0 && git push origin v1.1.0`) GitHub Actions kurulum dosyalarını derleyip **Releases** sayfasına ekler (`.github/workflows/desktop.yml`).

---

## Geliştirme

```bash
npm install
```
```bash
npm run dev          # web sürümü: http://localhost:5173
```
```bash
npm run tauri:dev    # masaüstü sürümü, canlı yenilemeyle
```
```bash
npm test             # motor, OCR, maske, logo araçları, yazım, dolgu testleri
```

Web sürümü `npm run build` ile `dist/` klasörüne çıkar; herhangi bir statik barındırmada çalışır (GitHub Pages, Netlify, Cloudflare Pages).

### Mimari
```
src/app/              arayüz (React 19 + Tailwind 4): araçlar, paneller, diyaloglar, tanıtım turu
src/store/            editör durumu (geri alma geçmişi, sürümler) ve belge eylemleri
src/core/pdf/         PDF içerik motoru: ayrıştırma, font eşleme, yerinde metin düzenleme, karartma
src/core/inpaint/     dolgu: flatFill (düz/degrade), Telea, MI-GAN, LaMa, refine (keskinleştirme + gren)
src/core/smartMask.js Düzelt aracının maskesi (zemin modeli, kenara taşan komşuları koruma)
src/core/upscale.js   Real-ESRGAN netleştirme (örtüşmeli parçalar)
src/core/spell.js     Türkçe yazım denetimi (Worker + hunspell)
src/core/logoTools.js düz / damalı zemin silme, kırpma, boyama
src/core/project.js   .paperwell proje biçimi (ZIP: JSON + PDF + sürümler)
src/core/inference.js ONNX çıkarımı: masaüstünde yerel (DirectML), web'de onnxruntime-web
src/platform.js       web ↔ masaüstü (Tauri) köprüsü
src-tauri/            masaüstü kabuğu (Rust): dosya işlemleri, yerel ONNX Runtime, kurulum kancaları
```

Kullanılan açık kaynak projeler: [pdf.js](https://github.com/mozilla/pdf.js), [pdf-lib](https://github.com/Hopding/pdf-lib), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [Tesseract.js](https://github.com/naptha/tesseract.js), [Tauri](https://tauri.app), [nspell](https://github.com/wooorm/nspell), [qrcode](https://github.com/soldair/node-qrcode), [JSZip](https://github.com/Stuk/jszip), [docx](https://github.com/dolanmiu/docx), [lucide](https://lucide.dev).

---

## Bilinen sınırlar

- Karmaşık, katmanlı zeminde çok büyük bir nesne silinince dolgu modeli yer yer olmayan detaylar uydurabilir; küçük ve orta detaylar (logo, yazı, parıltı) temiz çıkar.
- Kurulum dosyaları henüz kod imzalı değil (SmartScreen uyarısı) ve uygulama kendini otomatik güncellemiyor.
- PDF metin düzenleme satır bazlıdır; paragraf yeniden akışı (reflow) yok. Şifreli PDF'ler açılmaz.
- Hareketli story kaydı gerçek zamanlıdır (video süresi kadar sürer).

## Lisans

[MIT](LICENSE)
