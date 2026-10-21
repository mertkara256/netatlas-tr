# NetAtlas TR

**A home-internet atlas of Türkiye:** measured fixed-broadband speeds on ~475 m grid squares, a reliability flag for every square, change since 2019, and official access statistics per province.

[Türkçe](#türkçe)

> **Status:** early development. A working prototype lives in [`prototype/`](prototype/); the full project is being rebuilt step by step following the [roadmap](docs/YOL-HARITASI.md) (in Turkish).

## What it will show

- Average download, upload and latency from Ookla's open Speedtest data as a heat map: Ookla's own ~475 m squares (at Türkiye's latitude) up close, merged into larger cells as you zoom out, plus province and district summaries.
- How reliable each value is, based on the number of tests behind it.
- Yearly views from 2019 to 2025, plus a "current" view of the latest four published quarters.
- Fixed-broadband subscriptions per 100 people and fiber share per province, from BTK (Türkiye's telecom regulator).

It shows what people actually measured in an area, not the maximum speed available at a specific address.

## Data sources

| Data | Source | License |
|---|---|---|
| Fixed-broadband speed tests | [Speedtest® by Ookla® Open Data](https://github.com/teamookla/ookla-open-data) | CC BY-NC-SA 4.0 |
| Provincial subscriptions and fiber | [BTK, Yıllık İl İstatistikleri](https://www.btk.gov.tr/yillik-il-istatistikleri) | No open license (© BTK); used with attribution |
| Province and district boundaries | [OCHA COD-AB Türkiye](https://data.humdata.org/dataset/cod-ab-tur), from the General Command of Mapping (Harita Genel Müdürlüğü) | CC BY-IGO |
| District names | OpenStreetMap via [geoBoundaries](https://www.geoboundaries.org/) | ODbL |
| Basemap | [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, © OpenStreetMap contributors | |

## License

Code is released under the [MIT License](LICENSE). Data derived from Ookla's open data is shared under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) and may not be used commercially.

---

## Türkçe

**Türkiye ev interneti atlası:** Ölçülen sabit internet hızları ~475 m'lik karelerde, her karede güvenilirlik bilgisi, 2019'dan bugüne değişim ve illere göre resmi erişim istatistikleri.

> **Durum:** Geliştirmenin başındayız. Çalışan bir prototip [`prototype/`](prototype/) klasöründe. Asıl proje [yol haritasına](docs/YOL-HARITASI.md) göre adım adım yeniden kuruluyor.

### Neler gösterecek

- Ookla'nın açık Speedtest verisinden ortalama indirme, yükleme ve gecikme, ısı haritası olarak: yakınlaşınca Ookla'nın kendi ~475 m'lik kareleri, uzaklaştıkça daha büyük hücreler. Ayrıca il ve ilçe özetleri.
- Her değerin ne kadar güvenilir olduğu (arkasındaki test sayısına göre).
- 2019–2025 yıllık görünümler ve yayınlanmış son dört çeyreği gösteren "Güncel" görünüm.
- BTK'dan il bazında 100 kişiye sabit abonelik ve fiber payı.

Belirli bir adrese verilebilecek en yüksek hızı değil, bir bölgede insanların gerçekten ölçtüğü hızı gösterir.

### Veri kaynakları ve lisans

Kaynaklar yukarıdaki tabloda. Kod [MIT lisansı](LICENSE) ile açık. Ookla açık verisinden türetilen veriler [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) ile paylaşılır ve ticari amaçla kullanılamaz.
