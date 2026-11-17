# NetAtlas TR — Yol haritası

Türkiye ev interneti atlası: Ookla açık verisinden 475 m'lik karelerde hız, her karede güvenilirlik, 2019'dan bugüne değişim ve BTK'nın il bazlı erişim verisi.

## Verilen kararlar

| Konu | Karar |
|---|---|
| Ana açı | Yoğun veriye dayanan ev interneti atlası (sabit internet). Mobil, katman olarak sonra. |
| Maliyet | Sıfır. GitHub Pages, ücretli alan adı yok. |
| Repo | Açık. Geliştirme sırasında özeldi; ücretsiz planda GitHub Pages açık repo istediği için yayınla birlikte (27 Ekim 2026) açıldı. |
| Harita görünümü | Her ölçekte kare ısı haritası: yakınlaşınca Ookla'nın 475 m'lik kareleri, uzaklaştıkça daha büyük hücrelerde birleşen kareler. İl ve ilçe sınırları çizgi olarak; il/ilçe renklendirmesi ayrı bir seçenek. |
| Hücrelerin çizimi | Her hücre kendi değerinin renginde, keskin kenarlı bir kare; komşu hücreler arasında yumuşak geçiş yok. Yumuşak geçiş iki kez denendi (önce Gauss bulanıklığı, sonra hücre merkezleri arasında çift doğrusal geçiş) ve geri alındı. Nedenleri: (1) renk komşuların karışımı olduğu için bir yerin rengi, üzerine gelince gösterilen değerle uyuşmuyordu; (2) geçişteki renkler hiçbir hücrede ölçülmemiş ara değerlerdi ve olmayan eğilimler gösteriyordu (Dikili'de 27, 176 ve 79 Mbps'lik üç komşu kare griden maviye tek bir geçiş gibi okunuyordu); (3) uzaktan bakınca harita bulanık duruyordu. Veri kare kare ölçülüyor; harita da öyle gösterir, renk ile değer her yerde aynı şeyi söyler. Uzaktan bakınca bir hücre yalnızca ölçüm olan yerlerde boyanır: en çok 8 × 8 parçaya bölünür, içinde ölçülmüş bir 475 m'lik kare olan parçalar hücrenin renginde çizilir (ekranda 1–2 piksel). Hücrenin tamamı boyandığında, Türkiye karasının çoğunda ölçüm olmadığı için boyalı alan ölçülen alanın en uzak görünümde 37, 7,6 km'lik hücrelerde 21 katıydı. Üç görünüm denendi: hücre, içindeki ölçülen alan kadar bir kareye küçülünce dürüst ama uzaktan çok seyrekti; seyrek hücreleri daha büyük çizen bir ara ölçek hâlâ 3–5 kat abartıyordu; ölçülen parçalar yakınlık 7'den itibaren birebir doğru, uzakta ise ekranın izin verdiği kadar doğru ve yerleşimlerin biçimini gösteriyor. Uzaktan parçalar içi boş çizilemeyecek kadar küçük; az testli değerler yakınlaşınca ayırt edilir. |
| Az testli değerler | 10'dan az testli kareler içi boş çizilir: çerçeve değerin kendi renginde, içi soluk. İlçe ve iller ise değerin renginde çizgilerle taranır; içi boş çizildiklerinde çerçeve, neredeyse aynı renkteki komşuların arasında kayboluyor ve alan koyu bir boşluk, yani yavaş gibi okunuyordu. Önce aynı açıklıkta gri bir renk dizisi kullanılıyordu; koyu temada 100 Mbps üstünde mavi ile grisi arasındaki fark çok küçük kalıyordu (OKLab×100 ile 3–8; rahat ayırt etmek için 15 gerekir) ve az testli kareler hızlı karelerle karışıyordu. Renk yalnızca hızı; dolu, boş ya da taralı olması yalnızca belirsizliği anlatır. |
| Nüfus dağılımı | Nüfusun ne kadarının ölçüm yapılan karelerde ya da hemen yanlarında yaşadığı WorldPop'un Türkiye 2021 ızgarasıyla hesaplanır: TÜİK'in ilçe nüfuslarını ~100 m'lik hücrelere dağıtır, il toplamları resmi sayılarla tutar (en büyük fark %2). Önce GHSL (GHS-POP 2025) denendi ve bırakıldı: Türkiye toplamı tutuyor ama il toplamları resmi nüfustan medyan %11 sapıyordu (Adana −%34, Hatay +%32). Yandaki sekiz kare de sayılır: yalnızca aynı kare sayıldığında, testleri en kalabalık karenin bir yanına düşen yerleşimler yüzünden her dönem 14–40 ilçe 50'den çok teste rağmen nüfusunun %20'sinden azı ölçülmüş görünüyordu; yandakilerle 0–3. İki kare öteye (~1 km) gitmek dönem başına en çok iki ilçe daha düzeltip Türkiye payını %93'ten %95'e çıkarıyordu. |
| Site verisi | Git'e girmeyen dosyalar (PMTiles, il/ilçe JSON'ları, arama dizini) bir GitHub Release'te; yayın iş akışı `web/data-release.txt`'de adı yazan sürümü indirir. Harita için sınırlar bir, her dönemin hücreleri birer PMTiles dosyasında; tarayıcı yalnızca ekrandaki dönemi indirir. Hücreler yalnızca ölçülen parçalarında çizilince her dönemin biçimi ayrı oldu; tek dosyada her karo sekiz dönemi taşıyor ve uzaktan bakınca indirilen veri 2–3 kat artıyordu (açılışta 0,7 MB'tan 2,1 MB'a). Ayrı dosyalarla açılış 0,5 MB, başka bir döneme geçmek yaklaşık 0,2 MB. |
| Repo adı | `netatlas-tr` (yayından önce değiştirilebilir) |
| Kod lisansı | MIT. Ookla'dan türetilen veri CC BY-NC-SA 4.0. |
| README | İki dilli: önce İngilizce, sonra Türkçe. Arayüz Türkçe. |
| Yıl tanımı | Takvim yılları (2019–2025, her biri dört çeyrek birleşik) + "Güncel" (yayınlanmış son dört çeyrek). |

## Teknolojiler

| Katman | Seçim | Neden |
|---|---|---|
| Veri işleme | Python (uv, pyarrow, shapely, rasterio) | Ookla verisini çekmek, illere/ilçelere eşlemek, BTK Excel'lerini okumak, nüfus ızgarasını okumak |
| Harita karoları | tippecanoe → PMTiles | ~120 bin kare × 8 yıl, sunucusuz ve bedava sunulabilsin |
| Ön yüz | Next.js (React) + TypeScript, statik çıktı | İl sayfaları önceden üretilsin |
| Harita | MapLibre + react-map-gl | Bedava, anahtarsız, PMTiles okuyor |
| Grafikler | Recharts | Yıllara göre eğilim ve hız–erişim grafikleri |
| Arama ve nokta sorgusu | Tarayıcıda | Sunucu gerektirmiyor |
| Barındırma | GitHub Pages | Bedava, HTTP Range destekliyor |
| Otomasyon | GitHub Actions | Açık repoda bedava |
| Testler | pytest (veri hattı); ön yüzde yalnızca işe yarayan yerde | Verinin doğruluğu projenin özü |

İlk aşamada sunucu ve veritabanı yok. Kendi hız testimizi eklediğimizde gerekirse bedava bir seçenekle eklenir.

## Hedef klasör yapısı

```
netatlas-tr/
├─ pipeline/          Python veri hattı (uv)
│  ├─ btk.py          BTK Excel'leri → il tablosu
│  ├─ boundaries.py   il ve ilçe sınırları
│  ├─ ookla.py        Ookla çeyrekleri → Türkiye kesiti
│  ├─ population.py   WorldPop nüfus ızgarası → kare başına nüfus
│  ├─ build.py        illere/ilçelere eşleme, yıllık toplama, güvenilirlik
│  ├─ tiles.py        karolar → PMTiles (tippecanoe)
│  ├─ preview.py      bağlantı önizleme resmi (son dönemin ısı haritası)
│  └─ tests/          veri doğruluk testleri (pytest)
├─ web/               Next.js + TypeScript, statik çıktı
│  ├─ app/            ana sayfa, /il/[ad], /yontem
│  ├─ components/     harita, gösterge, bölge paneli, grafikler
│  └─ public/data/    veri hattının ürettiği dosyalar
├─ docs/gorseller/    README'deki ekran görüntüleri
└─ .github/workflows/ testler, yayın, çeyreklik güncelleme
```

## Adımlar

Her adım, doğrulaması geçmeden bitmiş sayılmaz.

### 0. Hazırlık
- Klasör adı `netatlas-tr`, prototip `prototype/` altında, git başlatıldı.
- README iskeleti, MIT lisansı, bu yol haritası.
- GitHub'da özel repo (yayından önce açılacak).
- **Doğrulama:** İlk commit atılmış; ham veri ve yerel ortam dosyaları git'e girmemiş; repo GitHub'da görünüyor.

### 1. Veri hattı
- **1a. BTK:** Resmi Excel'den oku (önce 2020–2025).
  **Doğrulama:** Prototipin PDF'ten çıkardığı değerlerle 81 ilde birebir aynı; il toplamları ulusal toplamı tutuyor.
- **1b. Sınırlar:** İl ve ilçe sınırları, isim eşleme.
  **Doğrulama:** 81 il ve 973 ilçe eşleşiyor; ilçe sınırlarının kalitesi gözle kontrol edilmiş.
- **1c. Ookla:** 2019 Ç1'den bugüne tüm sabit internet çeyreklerinin Türkiye kesiti.
  **Doğrulama:** Her çeyrekte Türkiye var; kare ve test sayıları makul.
- **1d. Toplama:** Kareleri il/ilçeye ata; yıllık değerler (2019–2025 ve "Güncel"); güvenilirlik etiketleri.
  **Doğrulama (pytest):** Her kare tek ile atanmış; il ve ilçe toplamları kare toplamlarıyla tutuyor; birkaç il elle hesapla karşılaştırılmış.
- **1e. Çıktılar:** PMTiles karoları (475 m kareler, uzaklaştıkça birleşen hücreler, il/ilçe sınırları), il/ilçe JSON'ları, arama dizini.
  **Doğrulama:** PMTiles 100 MB'ın altında (aşarsa yıl başına ayrı dosya) ve bir PMTiles görüntüleyicide açılıyor.

### 2. Ön yüz iskeleti
- Next.js + TypeScript, GitHub Pages için statik çıktı; MapLibre ile tek yılın karoları.
- **Doğrulama:** `npm run build` hatasız; karolar yerelde yükleniyor.

### 3. Harita
- Yıl kaydırıcısı; gösterge seçimi (indirme, yükleme, gecikme, güvenilirlik); renk açıklaması ve bilgi kutusu; az testli kareler içi boş (değerin renginde çerçeve; belirsiz olduğu rengi değiştirmeden görünsün); her ölçekte kare ısı haritası (uzaklaştıkça birleşen hücreler, yakınlaşınca 475 m kareler), il/ilçe sınırları çizgi olarak; il/ilçe renklendirmesi ayrı seçenek.
- **Doğrulama:** Masaüstü, telefon ve koyu temada denenmiş; renkler doğrulayıcıdan geçmiş.

### 4. Bölge paneli ve sayfalar
- İl/ilçe paneli (hız, BTK erişimi, yıllara göre grafikler); 81 il sayfası; il/ilçe arama; "çevrendeki 1 km" nokta sorgusu.
- **Doğrulama:** 81 sayfa üretiliyor; arama Türkçe karakterlerle çalışıyor; nokta sorgusu veri hattının değeriyle tutuyor.

### 5. Yöntem ve erişilebilirlik
- Yöntem sayfası, kaynaklar ve Ookla atfı; tablo görünümü; klavyeyle kullanım.
- **Doğrulama:** Atıf lisansın istediği gibi; harita olmadan da tüm değerlere tablodan ulaşılıyor.

### 6. Yayın ve kontroller
- Repo açılır (onay alınarak); her değişiklikte testler ve derleme; GitHub Pages'e otomatik yayın.
- **Doğrulama:** Site github.io adresinde açık; karolar orada da parça parça yükleniyor.

### 7. Çeyreklik otomasyon
- Her pazartesi Ookla'da yeni çeyrek var mı diye bakılır. Varsa veri hattı kaynaklardan baştan çalışır, testler tüm veriyle koşar; sonuç yeni bir Release ve `web/data-release.txt`'yi ona çeviren bir PR olarak gelir. Veri hattı değişince iş akışı elle "yeniden üret" seçeneğiyle de çalıştırılabilir.
- **Doğrulama:** İş akışı elle tetiklenince baştan sona çalışıyor.

## Sonraki aşama (planlanmadı)
- Kendi hız testimiz (M-Lab ya da Cloudflare) ve onu saklamak için bedava bir sunucu seçeneği
- Mobil katman (Ookla mobil verisi 4G/5G ayırmıyor)
- BTK serisini 2007'ye uzatmak
- Mahalle sınırları
