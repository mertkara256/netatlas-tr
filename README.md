# NetAtlas TR

**An interactive map of home internet speeds across Türkiye,** built from Ookla's Speedtest data since 2019.

[Türkçe](#türkçe)

> **Site:** https://mertkara256.github.io/netatlas-tr/ · Built step by step following the [roadmap](docs/YOL-HARITASI.md) (in Turkish).

[![The NetAtlas TR map: measured download speeds across Türkiye, lighter squares faster](docs/gorseller/harita.png)](https://mertkara256.github.io/netatlas-tr/)

## At a glance

- Türkiye's average measured home download speed rose from **20.9 Mbps in 2019 to 143.0 Mbps in 2025**, almost seven times as fast. Upload went from 5.2 to 45.4 Mbps, latency from 26 to 14 ms.
- In 2025 alone: 5.0 million Speedtest results, on about 99,000 squares of 475 m.
- 93% of residents live in or next to a square where someone ran a test.

![The map from 2019 to the latest four quarters: the squares grow lighter, that is faster, year by year](docs/gorseller/donemler.gif)

## What it shows

- Average download, upload and latency from Ookla's open Speedtest data as a heat map: Ookla's own ~475 m squares (at Türkiye's latitude) up close, merged into larger cells as you zoom out, plus province and district summaries.
- How reliable each value is, based on the number of tests behind it.
- Yearly views from 2019 to 2025, plus a "current" view of the latest four published quarters.
- Fixed-broadband subscriptions per 100 people and fiber share per province, from BTK (Türkiye's telecom regulator).
- The share of each province's and district's residents who live in or next to a square where a test was run.

![Zoomed in on Kadıköy, İstanbul: 475 m squares, and the district's panel with its speeds, tests and trend since 2019](docs/gorseller/kadikoy.png)

It shows what people actually measured in an area, not the maximum speed available at a specific address. How the values are computed, what to keep in mind and all sources are on the [methodology page](https://mertkara256.github.io/netatlas-tr/yontem/) (in Turkish).

## Data files

- [`data/processed/`](data/processed) has the tables behind the site as CSV: speeds per province (`iller_hiz.csv`) and district (`ilceler_hiz.csv`) for every period, per province and settlement type (`iller_yerlesim.csv`: yoğun kent, orta yoğun kent, kır), BTK's statistics per province and year (`btk_iller.csv`), the list of districts (`ilceler.csv`), and fixed-broadband subscriptions per 100 inhabitants and fiber's share in the 38 OECD members (`oecd_genisbant.csv`, from the OECD's broadband database, for the fiber page).
- `oecd_genisbant.csv` is not part of the weekly data update; refresh it by hand with `uv run --locked python -m pipeline.oecd`, which takes the last quarter of the latest full year.
- [Releases](https://github.com/mertkara256/netatlas-tr/releases) hold the files the site loads: the map tiles (PMTiles) and the province, district and search JSON. `web/data-release.txt` names the release the site uses.

## Running locally

Needs [GitHub CLI](https://cli.github.com/) (signed in), Node.js 22 and [uv](https://docs.astral.sh/uv/). From the repository's root:

```bash
gh release download "$(cat web/data-release.txt)" --dir web/public/data
cd web && npm ci && npm run dev
```

The site is then at http://localhost:3000/. The pipeline tests run from the root; the ones that need the raw data are skipped without it:

```bash
uv run --locked pytest
```

## Data sources

| Data | Source | License |
|---|---|---|
| Fixed-broadband speed tests | [Speedtest® by Ookla® Open Data](https://github.com/teamookla/ookla-open-data) | CC BY-NC-SA 4.0 |
| Provincial subscriptions and fiber | [BTK, Yıllık İl İstatistikleri](https://www.btk.gov.tr/yillik-il-istatistikleri) | No open license (© BTK); used with attribution |
| Fixed broadband in OECD countries | [OECD, Broadband and telecom databases](https://data-explorer.oecd.org/vis?df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_BB_DATABASE%40DF_BB_TEL_DATABASE&df[ag]=OECD.STI.DEP) | Reuse with attribution ([OECD terms](https://www.oecd.org/en/about/terms-conditions.html)) |
| Where people live | [WorldPop, gridded population estimates for Turkey 2021](https://doi.org/10.5258/SOTON/WP00758), spreading TÜİK's district populations | CC BY 4.0 |
| Province and district boundaries | [OCHA COD-AB Türkiye](https://data.humdata.org/dataset/cod-ab-tur), from the General Command of Mapping (Harita Genel Müdürlüğü) | CC BY-IGO |
| District names | OpenStreetMap via [geoBoundaries](https://www.geoboundaries.org/) | ODbL |
| Basemap | [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, © OpenStreetMap contributors | |

## License

Code is released under the [MIT License](LICENSE). Data derived from Ookla's open data is shared under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) and may not be used commercially.

---

## Türkçe

**Türkiye'de ev interneti hızlarının etkileşimli haritası,** 2019'dan bu yana Ookla'nın Speedtest verileriyle.

> **Site:** https://mertkara256.github.io/netatlas-tr/ · Proje [yol haritasına](docs/YOL-HARITASI.md) göre adım adım geliştirildi.

### Bir bakışta

- Türkiye'de evlerde ölçülen ortalama indirme hızı **2019'da 20,9 Mbps'ten 2025'te 143,0 Mbps'e** çıktı, yaklaşık yedi kat. Yükleme 5,2'den 45,4 Mbps'e çıktı, gecikme 26'dan 14 ms'ye indi.
- Yalnızca 2025'te: 5,0 milyon Speedtest ölçümü, 475 m'lik yaklaşık 99.000 karede.
- Nüfusun %93'ü, ölçüm yapılmış bir karede ya da hemen yanında yaşıyor.

![2019'dan son dört çeyreğe harita: kareler yıldan yıla açılıyor, yani hızlanıyor](docs/gorseller/donemler.gif)

### Neler gösteriyor

- Ookla'nın açık Speedtest verisinden ortalama indirme, yükleme ve gecikme, ısı haritası olarak: yakınlaşınca Ookla'nın kendi ~475 m'lik kareleri, uzaklaştıkça daha büyük hücreler. Ayrıca il ve ilçe özetleri.
- Her değerin ne kadar güvenilir olduğu (arkasındaki test sayısına göre).
- 2019–2025 yıllık görünümler ve yayınlanmış son dört çeyreği gösteren "Güncel" görünüm.
- BTK'dan il bazında 100 kişiye sabit abonelik ve fiber payı.
- Her il ve ilçede nüfusun, ölçüm yapılan karelerde ya da hemen yanlarında yaşayan payı.

![Kadıköy'e yakından: 475 m'lik kareler ve ilçenin hızlarını, test sayısını ve 2019'dan bu yana değişimini gösteren panel](docs/gorseller/kadikoy.png)

Belirli bir adrese verilebilecek en yüksek hızı değil, bir bölgede insanların gerçekten ölçtüğü hızı gösterir. Değerlerin nasıl hesaplandığı, nelere dikkat etmek gerektiği ve tüm kaynaklar [yöntem sayfasında](https://mertkara256.github.io/netatlas-tr/yontem/).

### Veri dosyaları

- [`data/processed/`](data/processed) sitenin arkasındaki tabloları CSV olarak içerir: her dönem için il (`iller_hiz.csv`) ve ilçe (`ilceler_hiz.csv`) hızları, il ve yerleşim türüne göre hızlar (`iller_yerlesim.csv`: yoğun kent, orta yoğun kent, kır), il ve yıla göre BTK istatistikleri (`btk_iller.csv`), ilçe listesi (`ilceler.csv`) ve OECD'nin 38 üyesinde 100 kişiye sabit genişbant aboneliği ile fiber payı (`oecd_genisbant.csv`, OECD'nin geniş bant veritabanından, fiber sayfası için).
- `oecd_genisbant.csv` haftalık veri güncellemesine dahil değildir; elle `uv run --locked python -m pipeline.oecd` ile yenilenir, son tam yılın son çeyreğini alır.
- Sitenin yüklediği dosyalar, yani harita karoları (PMTiles) ve il, ilçe ve arama JSON'ları [Releases](https://github.com/mertkara256/netatlas-tr/releases) altında. Sitenin hangi sürümü kullandığı `web/data-release.txt`'de yazar.

### Yerelde çalıştırma

[GitHub CLI](https://cli.github.com/) (oturum açılmış), Node.js 22 ve [uv](https://docs.astral.sh/uv/) gerekir. Reponun kök klasöründen:

```bash
gh release download "$(cat web/data-release.txt)" --dir web/public/data
cd web && npm ci && npm run dev
```

Site ardından http://localhost:3000/ adresinde açılır. Boru hattı testleri kök klasörden çalışır; ham veri gerektirenler, veri yoksa atlanır:

```bash
uv run --locked pytest
```

### Veri kaynakları ve lisans

Kaynaklar yukarıdaki tabloda. Kod [MIT lisansı](LICENSE) ile açık. Ookla açık verisinden türetilen veriler [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) ile paylaşılır ve ticari amaçla kullanılamaz.
