# NeuroRead

NeuroRead, ekranda uzun metin okuyan öğrenciler, araştırmacılar ve çalışanlar için Türkçe bir **uyarlanabilir okuma asistanıdır**. Uygulama şunları bir araya getirir:

1. Dikkat dağıtmayan, tipografisi ayarlanabilir bir okuma alanı (tema, yazı boyutu, satır aralığı, paragraf genişliği, Bionic Reading).
2. **İsteğe bağlı** ve tamamen tarayıcıda çalışan MediaPipe tabanlı kamera analizi (yüz/göz görünürlüğü, göz açıklığı, göz kırpma, uzun göz kapanması).
3. Şeffaf, kural tabanlı bir uyarlama motoru. Her öneri gerekçesini söyler ve sizin onayınızı ister.
4. Kedy NOVAQ ile yapay zekâ destekli özetleme, sadeleştirme, ana fikir çıkarma, çalışma notu ve soru-cevap.
5. Kamera olmayan ortamlar için açıkça **“simüle”** etiketli bir demo modu.

> NeuroRead tıbbi bir cihaz değildir. Yorgunluk teşhisi koymaz, dikkat ya da anlama düzeyini ölçmez. Kamera göstergeleri basit ve açıklanabilir sezgisel hesaplardır; doğruluk oranı ölçülmemiştir.

---

## İçindekiler

- [Mimari ve proje yapısı](#mimari-ve-proje-yapısı)
- [Ön koşullar](#ön-koşullar)
- [Kurulum (Windows)](#kurulum-windows)
- [.env dosyası ve API anahtarı](#env-dosyası-ve-api-anahtarı)
- [Uygulamayı başlatma](#uygulamayı-başlatma)
- [Testler ve kontroller](#testler-ve-kontroller)
- [Üretim derlemesi](#üretim-derlemesi)
- [Kamera: izinler ve sorun giderme](#kamera-izinler-ve-sorun-giderme)
- [Kamera ölçümleri: yöntem](#kamera-ölçümleri-yöntem)
- [Demo modu](#demo-modu)
- [Uyarlama kuralları](#uyarlama-kuralları)
- [Kedy NOVAQ entegrasyonu](#kedy-novaq-entegrasyonu)
- [Gizlilik](#gizlilik)
- [Bilinen sınırlamalar](#bilinen-sınırlamalar)

---

## Mimari ve proje yapısı

```
Tarayıcı (React + Vite)                         Node.js (Express)                 Kedy
┌──────────────────────────────┐   /api/chat   ┌────────────────────────┐  HTTPS ┌──────────────┐
│ Okuma alanı, ayarlar, öneriler│ ───────────▶ │ doğrulama, zaman aşımı, │ ─────▶ │ NOVAQ modeli │
│ MediaPipe (WASM, yerel)       │   /api/health │ hata eşleme, KEDY_API_KEY│        └──────────────┘
│ Kamera verisi burada kalır    │               │ (anahtar yalnızca burada)│
└──────────────────────────────┘               └────────────────────────┘
```

- Tarayıcı Kedy’ye **hiçbir zaman** doğrudan bağlanmaz. Tüm yapay zekâ istekleri `POST /api/chat` üzerinden gider.
- Geliştirme sırasında Vite (5173) `/api` isteklerini Express sunucusuna (varsayılan 3001) yönlendirir. Üretimde Express, `dist/` klasörünü de sunar.
- Sunucu varsayılan olarak yalnızca `127.0.0.1` adresini dinler.

```
NeuroRead/
├─ index.html
├─ package.json             npm betikleri
├─ vite.config.ts           Vite + Vitest + /api proxy
├─ tsconfig.json
├─ .env.example             örnek ortam değişkenleri (gerçek anahtar içermez)
├─ scripts/
│  └─ prepare-mediapipe.mjs  WASM dosyalarını kopyalar, modeli indirir (postinstall)
├─ shared/
│  └─ aiContract.ts         istemci ve sunucunun ortak istek sınırları
├─ server/
│  ├─ index.ts              giriş noktası (.env yükleme, dinleme)
│  ├─ app.ts                Express uygulaması, güvenlik başlıkları, hız sınırı, statik dosyalar
│  ├─ config.ts             .env / KEDY_API_KEY / PORT okuma
│  ├─ routes/chat.ts        /api/chat doğrulama ve hata eşleme
│  └─ services/
│     ├─ kedyClient.ts      Kedy çağrısı, zaman aşımı, güvenli yanıt ayrıştırma
│     └─ prompts.ts         sistem istemi ve görev istemleri
├─ src/
│  ├─ App.tsx               durum yönetimi ve bileşenlerin bağlantısı
│  ├─ components/           Reader, TopBar, BionicText, AiOutput, CameraPreview, panels/…
│  ├─ hooks/                useCameraAnalysis, useScrollTracker, useAiHealth, useNow
│  ├─ services/             cameraSession, browserCamera, eyeAnalyzer, aiClient, demoSignals, …
│  ├─ utils/                bionic, textMetrics, session, adaptation, eyeMetrics, aiFormat, settings
│  ├─ types/                ortak TypeScript tipleri (gerçek ve simüle veri ayrı tiplerdir)
│  └─ styles/global.css
├─ public/
│  ├─ favicon.svg
│  ├─ mediapipe/wasm/       (kurulumda oluşturulur, git’e eklenmez)
│  └─ models/               (kurulumda indirilir, git’e eklenmez)
└─ tests/                   Vitest testleri
```

## Ön koşullar

- **Node.js 22.12 veya üzeri** (geliştirme Node.js 24.20 ve npm 11.19 ile yapıldı ve test edildi)
- Güncel Chrome, Edge veya Firefox (kamera özelliği için WebAssembly ve `getUserMedia` desteği)
- İsteğe bağlı: web kamerası
- İsteğe bağlı: Kedy API anahtarı (yalnızca yapay zekâ özellikleri için)

Sürümünüzü kontrol edin:

```powershell
node --version
npm --version
```

## Kurulum (Windows)

PowerShell’de proje klasörüne gidin ve bağımlılıkları kurun:

```powershell
cd $HOME\Desktop\NeuroRead
npm install
```

`npm install`, `postinstall` adımında `scripts/prepare-mediapipe.mjs` betiğini çalıştırır:

- MediaPipe WASM dosyalarını `node_modules/@mediapipe/tasks-vision/wasm` klasöründen `public/mediapipe/wasm` klasörüne kopyalar.
- Face Landmarker modelini (`face_landmarker.task`, yaklaşık 3,8 MB) Google’ın genel MediaPipe deposundan `public/models` klasörüne indirir.

İndirme başarısız olursa kurulum yine tamamlanır. Daha sonra şu komutla tekrar deneyebilirsiniz:

```powershell
npm run prepare:mediapipe
```

> npm 11, `esbuild` paketinin kurulum betiği için “install-scripts … allowScripts” uyarısı gösterebilir. Bu uyarı zararsızdır; `tsx` bu betik olmadan da çalışır.

## .env dosyası ve API anahtarı

Okuma özellikleri ve demo modu **anahtar olmadan** çalışır. Yapay zekâ özellikleri için:

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` içeriği:

```
KEDY_API_KEY=buraya_kendi_anahtarınız
PORT=3001
```

- Anahtarı yalnızca kendi bilgisayarınızdaki `.env` dosyasına yazın. `.env`, `.gitignore` içinde olduğu için git’e eklenmez.
- Anahtar yalnızca sunucu tarafında `process.env` ile okunur. Tarayıcı paketine, HTML’e, tarayıcı depolamasına, istemci isteklerine veya günlüklere hiçbir zaman girmez. `VITE_` önekli değişken kullanılmaz.
- `.env.example` içindeki yer tutucu değer (`your_kedy_api_key_here`) “anahtar yok” olarak kabul edilir.
- `.env` dosyasını değiştirdikten sonra sunucuyu yeniden başlatın.

## Uygulamayı başlatma

Geliştirme modu (arayüz ve sunucu birlikte):

```powershell
npm run dev
```

Ardından tarayıcıda **http://localhost:5173** adresini açın. Durdurmak için terminalde `Ctrl+C` tuşlarına basın.

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Vite (5173) ve API sunucusunu (3001) birlikte başlatır |
| `npm run dev:client` | Yalnızca Vite arayüzü |
| `npm run dev:server` | Yalnızca API sunucusu (`tsx watch`) |
| `npm run typecheck` | TypeScript tip denetimi |
| `npm test` | Tüm testleri bir kez çalıştırır |
| `npm run test:watch` | Testleri izleme modunda çalıştırır |
| `npm run build` | Tip denetimi ve üretim derlemesi (`dist/`) |
| `npm start` | Derlenmiş uygulamayı ve API’yi tek sunucuda çalıştırır |
| `npm run check` | Tip denetimi, testler ve derleme |
| `npm run prepare:mediapipe` | MediaPipe dosyalarını yeniden hazırlar |

> Terminalde Türkçe karakterler bozuk görünürse önce `chcp 65001` komutunu çalıştırın. Bu yalnızca konsol görüntüsünü etkiler.

**İlk kullanım:** “Örnek Türkçe metni yükle” düğmesine basın, üst çubuktan **Başlat** ile oturumu başlatın, sağdaki **Görünüm** sekmesinden tipografiyi değiştirin, **Kamera** sekmesinden kamerayı ya da demo modunu deneyin.

## Testler ve kontroller

```powershell
npm test
npm run typecheck
npm run build
# veya hepsi birden:
npm run check
```

Testler (`tests/`):

| Dosya | Kapsam |
| --- | --- |
| `bionic.test.ts` | Bionic Reading: Türkçe harfler, noktalama, boşluk/satır sonu korunması, birleşik karakterler |
| `session.test.ts` | Oturum süresi (duraklatma/devam), kelime sayısı, okuma süresi, paragraf bölme |
| `adaptation.test.ts` | Uyarlama kuralları, elle ayar önceliği, reddetme bekleme süresi, otomatik uygulama sınırı, simüle etiketleri |
| `eyeMetrics.test.ts` | EAR hesabı, göz kırpma/uzun kapanma algılama, histerezis, kalibrasyon, kayan pencere |
| `cameraSession.test.ts` | Onaysız kamera açılmaması, tüm izlerin durdurulması, iptal ve hata durumlarında temizlik |
| `server.test.ts` | İstek doğrulama, eksik anahtar, sahte (mock) Kedy yanıtı, HTTP hataları, zaman aşımı, ağ hatası, bozuk yanıt, gizli bilgi sızmaması |
| `ui.test.tsx` | Güvenli yapay zekâ çıktısı, kamera istenmeden açılış, okuma akışı, demo etiketleri |
| `security.test.ts` | Ön yüz kodunda anahtar/Kedy adresi bulunmaması, `dangerouslySetInnerHTML` yasağı, derlenmiş pakette gizli bilgi bulunmaması |

> Kedy testleri **sahte yanıtlar** kullanır. Bu testler gerçek Kedy hizmetinin çalıştığını kanıtlamaz. Gerçek entegrasyonu doğrulamak için `.env` dosyanıza anahtarınızı ekleyip uygulamada bir yapay zekâ işlemi çalıştırın.

## Üretim derlemesi

```powershell
npm run build
npm start
```

`npm start`, Express sunucusunu başlatır. Sunucu hem `/api` uç noktalarını hem de `dist/` klasöründeki derlenmiş arayüzü **http://localhost:3001** adresinden sunar (port `.env` içindeki `PORT` ile değiştirilebilir). Sunucu varsayılan olarak yalnızca yerel makineden erişilebilir (`127.0.0.1`). Ağa açmak istiyorsanız `HOST` değişkenini bilinçli olarak ayarlayın ve önüne HTTPS sağlayan bir ters vekil koyun. Kamera, `localhost` dışında yalnızca HTTPS üzerinde çalışır.

## Kamera: izinler ve sorun giderme

Kamera **asla otomatik açılmaz**. Yalnızca **Kamera › Kamerayı etkinleştir** düğmesine bastığınızda önce model yüklenir, ardından tarayıcı izin ister. Kamera açıkken üst çubukta kırmızı **“Kamera açık”** göstergesi ve köşede küçük bir önizleme görünür.

Kamera şu durumlarda durdurulur ve tüm izler (`MediaStreamTrack.stop()`) kapatılır: “Kamerayı kapat” düğmesi, demo moduna geçiş, sayfanın kapanması veya gizlenmesi (`pagehide`), bileşenin kaldırılması, kameranın çıkarılması veya izin geri alınması, analiz sırasında hata.

| Sorun | Çözüm |
| --- | --- |
| “Kamera izni verilmedi” | Adres çubuğundaki kamera/kilit simgesinden izni açın. Windows: **Ayarlar › Gizlilik ve güvenlik › Kamera** bölümünde “Kamera erişimi” ve “Masaüstü uygulamalarının kameraya erişmesine izin ver” seçeneklerini açın. |
| “Kamera bulunamadı” | Kameranın bağlı ve Aygıt Yöneticisi’nde etkin olduğunu kontrol edin. |
| “Kamera başka bir uygulama tarafından kullanılıyor” | Teams, Zoom, Kamera uygulaması gibi programları kapatın. |
| “Yüz analizi modeli yüklenemedi” | `npm run prepare:mediapipe` komutunu çalıştırın ve sayfayı yenileyin. Yerel model yoksa uygulama modeli Google deposundan indirmeyi dener. |
| “Güvenli bağlantı gerekli” | Uygulamayı `http://localhost` veya HTTPS üzerinden açın. IP adresiyle (`http://192.168…`) açıldığında tarayıcılar kamerayı engeller. |
| “Yüz algılanmıyor” | Kameraya önden bakın, yüzünüzün kadrajda olduğundan emin olun. |
| “Ortam ışığı düşük” | Yüzünüzü önden aydınlatın; arkadan gelen güçlü ışıktan kaçının. |
| Ölçümler tutarsız | **Yeniden kalibre et** düğmesine basın ve 3 saniye boyunca gözleriniz açık şekilde ekrana bakın. |

## Kamera ölçümleri: yöntem

Analiz MediaPipe Tasks Vision `@mediapipe/tasks-vision` 1.1.1 **Face Landmarker** ile yapılır (VIDEO modu, tek yüz, 478 nokta). Önce GPU, olmazsa CPU kullanılır. Kareler en fazla yaklaşık 20 fps işlenir ve bellekten hemen atılır.

**Gerçek ölçümler (kameradan, yerel):**

| Gösterge | Nasıl hesaplanır |
| --- | --- |
| Yüz algılandı / algılanmadı | Face Landmarker sonuç döndürdü mü |
| Göz bölgesi görünür | Tüm göz noktaları görüntü sınırları içinde mi (0–1) |
| Göz açıklığı (EAR) | `EAR = (‖p2−p6‖ + ‖p3−p5‖) / (2·‖p1−p4‖)`. Göz A için noktalar 33, 160, 158, 133, 153, 144; göz B için 362, 385, 387, 263, 373, 380. Noktalar piksel ölçeğine çevrilir, iki gözün ortalaması alınır. |
| Kalibrasyon | Yüz ilk görüldüğünde yaklaşık 3 saniyelik EAR örneklerinin medyanı kişisel “açık göz” referansı olur (en az 15 örnek). Makul aralık (0,15–0,50) dışındaysa varsayılan 0,28 kullanılır. **Tıbbi bir kalibrasyon değildir.** |
| Göz durumu | Kapalı: EAR < referans × 0,70. Tekrar açık: EAR > referans × 0,85 (histerezis). |
| Göz kırpma | 500 ms’den kısa kapanma. Süre zaman damgasıyla ölçülür, kare sayısından bağımsızdır. |
| Uzun kapanma | 1000 ms ve üzeri kapanma (bir kez sayılır). 500–1000 ms arası kapanmalar hiçbir gruba sayılmaz. |
| Kırpma sıklığı | Son 60 sn içinde yüzün göründüğü süreye göre kırpma / dakika. En az 15 sn yüz verisi gerekir. |
| Kapalı kare oranı | Son 60 sn içinde yüzün göründüğü karelerden “kapalı” sayılanların oranı. **PERCLOS değildir, doğrulanmış değildir.** |
| Işık | 32×24 boyutuna küçültülmüş karenin ortalama parlaklığı. 50/255 altı “düşük” sayılır. |

**Sezgisel kurallar:** Uyarlama motoru bu göstergeleri yalnızca en az 30 sn veri varsa ve yüz karelerin en az %60’ında görünüyorsa kullanır. Eşikler deneyseldir.

**Takip kaybı:** Yüz kaybolursa veya kareler arasında 300 ms’den uzun boşluk olursa durum sıfırlanır; bu sırada kırpma sayılmaz.

## Demo modu

**Kamera › Demo modu** bölümünden seçilir. Demo değerleri **gerçek ölçüm değildir**. Bu değerler üst çubukta kesik çizgili, turuncu **“DEMO · … (simüle)”** göstergesiyle, önerilerde **“SİMÜLE”** rozetiyle ve gerekçe metninde “(simüle demo verisi)” ifadesiyle işaretlenir. Kodda da ayrı tiplerdir: `source: 'camera'` ve `source: 'simulated'`. Demo açılınca kamera kapanır; ikisi aynı anda çalışmaz.

| Senaryo | Simüle edilen | Beklenen sonuç |
| --- | --- | --- |
| Normal okuma | olağan göz değerleri, yakın zamanda kaydırma | öneri yok |
| Azalmış kaydırma | 4 dk kaydırma yok | özet önerisi (oturum çalışırken) |
| Uzun oturum | oturuma +45 dk | sıcak tema ve mola önerileri (oturum başlatılmışken) |
| Örnek öneri | yüksek kapalı kare oranı (%22), 3 uzun kapanma | satır aralığı önerisi |

Demo modu kamera ve API anahtarı olmadan çalışır.

## Uyarlama kuralları

Öneriler `src/utils/adaptation.ts` içindeki açık kurallardan gelir. Her öneri gerekçesini söyler ve **Uygula / Hayır, teşekkürler** seçenekleri sunar.

- 20 dk aktif okuma: sıcak tema önerisi
- 10 dk sonra ve satır genişliği 75 karakterden fazlaysa: daha dar sütun (66 karakter)
- 40 dk aktif okuma: kısa mola önerisi
- Oturum sürerken 3 dk kaydırma yoksa: özet önerisi. Bu yalnızca asistan panelini açar. Metin, siz “Gönder”e basmadan gönderilmez. **Kaydırma yokluğu anlama düzeyi olarak yorumlanmaz.**
- Kamera göstergeleri: kapalı kare oranı ≥ %15 veya ≥ 2 uzun kapanma olursa satır aralığı önerisi; kırpma < 6/dk olursa göz dinlendirme önerisi
- **Elle ayar önceliği:** Bir ayarı bu oturumda kendiniz değiştirdiyseniz o ayar için öneri yapılmaz. Otomatik bir değişikliği geri almak da elle tercih sayılır.
- Reddedilen öneri 15 dk boyunca gösterilmez, kabul edilen öneri tekrar gösterilmez.
- **Otomatik uyarlama** varsayılan olarak kapalıdır. Açıkken yalnızca görünüm değişiklikleri, en fazla 5 dakikada bir uygulanır ve her biri “Geri al” ile geri alınabilir. Özet istekleri asla otomatik gönderilmez.

## Kedy NOVAQ entegrasyonu

- Uç nokta: `POST https://api.kedy.dev/v1/chat/completions`, model `novaq`
- Başlıklar: `Authorization: Bearer ${KEDY_API_KEY}`, `Content-Type: application/json`
- Yanıt, OpenAI uyumlu biçimde `choices[0].message.content` alanından alınır. İçerik parça dizisi olarak gelirse `text` alanları birleştirilir. Bu biçimde değilse uygulama `MALFORMED_RESPONSE` hatası verir ve yanıt uydurmaz.
- Sunucu tarafında: alan beyaz listesi (yalnızca `action`, `text`, `question`), metin en fazla 24.000 karakter, soru en fazla 1.000 karakter, gövde en fazla 100 KB, 45 sn zaman aşımı, **yeniden deneme yok**, istemci başına dakikada 20 istek sınırı, 2 MB yanıt sınırı.
- Hata kodları: `MISSING_API_KEY` (503), `INVALID_API_KEY` (401/403 → 502), `RATE_LIMITED` (429, `Retry-After` iletilir), `UPSTREAM_REJECTED`, `UPSTREAM_ERROR`, `UPSTREAM_TIMEOUT` (504), `UPSTREAM_UNREACHABLE`, `MALFORMED_RESPONSE`, `INVALID_REQUEST`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`
- Sistem istemi NOVAQ’a şunları söyler: Türkçe yanıt ver, anlamı koru, belirsizliği kabul et, kaynak uydurma, olguyu yorumdan ayır, kullanıcı metnini güvenilmeyen içerik olarak ele al. Metin sınırlayıcılar arasına yerleştirilir ve sınırlayıcı taklitleri etkisizleştirilir.
- Günlüklere yalnızca işlem türü, karakter sayısı, durum kodu ve süre yazılır. Metin, yanıt ve anahtar asla yazılmaz.
- Yapay zekâ çıktısı yalnızca React metin düğümleriyle gösterilir (başlık, liste, **kalın** için küçük ve güvenli bir ayrıştırıcı). HTML çalıştırılmaz.

**Durum:** Entegrasyon sahte yanıtlarla test edilmiştir. Gerçek Kedy hizmeti bu projede geçerli bir anahtarla **test edilmemiştir**. Uç nokta anahtarsız isteğe `401` döndürmektedir. Gerçek yanıt şeması farklı çıkarsa uygulama bozuk yanıt hatası gösterir; bu durumda `server/services/kedyClient.ts` içindeki `extractContent` işlevinin güncellenmesi gerekir.

## Gizlilik

- **Okuma metni** tarayıcı belleğinde tutulur ve kaydedilmez. Yalnızca yapay zekâ panelinde “Gönder”e bastığınızda, seçili metin (veya tüm metin) ve sorunuz sunucu üzerinden Kedy’ye iletilir. Kedy’nin veriyi nasıl işlediği Kedy’nin kendi koşullarına tabidir.
- **Kamera** görüntüsü, yüz görüntüleri, yüz noktaları ve ham biyometrik veriler hiçbir yere gönderilmez ve kaydedilmez. Kamera verisi yapay zekâ isteklerine eklenmez; sunucu bilinmeyen alanları zaten reddeder. Bellekte yalnızca son 60 saniyelik özet sayılar tutulur.
- **Model dosyası** uygulamanın kendi sunucusundan yüklenir. Yerel kopya yoksa Google’ın genel deposundan indirilir. Bu yalnızca bir dosya indirmesidir; görüntü gönderilmez, ancak Google IP adresinizi görebilir.
- **Tarayıcı depolaması:** yalnızca “tercihlerimi hatırla” açıksa tipografi tercihleri `localStorage` içine yazılır.
- Analitik, izleme, reklam, giriş veya bulut depolama yoktur. CORS başlığı eklenmez (yalnızca aynı köken).
- **Yasal not:** Yerel işleme gizliliği güçlendirir, ancak tek başına KVKK veya GDPR uyumluluğunu kanıtlamaz. Uygulamayı başkalarına sunacaksanız aydınlatma metni, açık rıza, veri işleyen sözleşmeleri ve yurt dışına aktarım gibi konuları ayrıca değerlendirin.

## Bilinen sınırlamalar

- Kamera göstergeleri basit 2B sezgisel hesaplardır. Gözlük yansımaları, düşük ışık, yan bakış, kamera açısı ve düşük kare hızı sonuçları bozabilir. Doğruluk oranı ölçülmemiştir; yorgunluk, dikkat veya anlama ölçülmez.
- Göz kırpma ve kapanma algılaması gerçek bir yüz videosu üzerinde otomatik olarak test edilmemiştir. Matematik ve zamanlama mantığı birim testleriyle, MediaPipe hattı ise başsız Chrome’un sahte kamerasıyla (yüz içermeyen yapay görüntü) doğrulanmıştır.
- Tarayıcı sekmesi arka plandayken `requestAnimationFrame` duraklar ve analiz de durur. Dönüşte durum güvenli şekilde sıfırlanır.
- Okuma süresi tahmini dakikada 180 kelimelik sabit bir varsayıma dayanır.
- Bionic Reading’in okumayı hızlandırdığına dair bir iddia yoktur; kişisel tercih için sunulur.
- Kedy entegrasyonu gerçek anahtarla test edilmemiştir (yukarıya bakın).
- Hız sınırı bellek içidir ve tek sunucu süreci içindir.
- Uzun metinlerde yapay zekâya yalnızca ilk 24.000 karakter gönderilir (arayüzde uyarı gösterilir).
- `public/mediapipe` (yaklaşık 40 MB) ve `public/models` kurulumda oluşturulur. Derleme bunları `dist/` içine kopyalar.
