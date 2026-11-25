import type { Metadata } from "next";
import Link from "next/link";
import { BASE_PATH, CELL_SIZE, NATIONAL, REPO_URL, SITE_ORIGIN } from "@/lib/data";
import { formatNumber, formatValue, inYear, percentOf } from "@/lib/format";
import { HIGH_TESTS, LOW_TESTS, MEASURED_RESIDENTS_SHARE, METRICS, ONE_TILE_SHARE, breakLabels, metricById } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { readProvinces } from "@/lib/serverData";
import { ratioText, ruralRatio } from "@/lib/settlement";
import styles from "../pages.module.css";

export const metadata: Metadata = {
  title: "Yöntem ve kaynaklar · NetAtlas TR",
  description: "NetAtlas TR'deki hızların nasıl hesaplandığı, güvenilirlik etiketleri, sınırlamalar, veri kaynakları ve lisanslar.",
};

const SECTIONS = [
  ["ne-gosteriyor", "Harita ne gösteriyor?"],
  ["kaynaklar", "Veri kaynakları"],
  ["donemler", "Dönemler ve veri miktarı"],
  ["hesaplama", "Değerler nasıl hesaplanıyor?"],
  ["kent-kir", "Kent ve kır"],
  ["guvenilirlik", "Güvenilirlik"],
  ["renkler", "Renk ölçeği"],
  ["sinirlamalar", "Sınırlamalar"],
  ["erisilebilirlik", "Erişilebilirlik ve klavye"],
  ["indir", "Veriyi indir"],
  ["lisans", "Lisans ve atıf"],
] as const;

const DOWNLOAD = metricById("indirme");
// The last four quarters when the page's hand-measured figures were taken. They name this period, not
// Güncel, so they stay true when Güncel moves on.
const MEASURED = "2025 Ç4 – 2026 Ç3";

// BTK's subscribers by package speed, from the text beside Şekil 3-4 of its latest quarterly report
// (≤50 Mbps = 100 − the share above 50; 50–100 is given rounded). Update by hand with a newer report.
const BTK_PACKAGES = {
  donem: "2026 Ç1",
  kaynak: "https://www.btk.gov.tr/s3/web-btk-site/7708c26c-5161-4919-8b3d-daa31d4ac8fb/2026/06/71082aad-cfbc-47b0-9b03-8295991140a6.pdf",
  ellialti: 55,
  elliyuz: 30,
  yuzustu: 15,
};

/** The province and district tables as a schema.org Dataset, so dataset search engines can list them. */
function datasetMarkup([firstYear, firstQuarter]: number[], [lastYear, lastQuarter]: number[]) {
  const month = (quarter: number, offset: number) => String((quarter - 1) * 3 + offset).padStart(2, "0");
  const table = (file: string, name: string) => ({
    "@type": "DataDownload",
    name,
    encodingFormat: "text/csv",
    contentUrl: `${SITE_ORIGIN}${BASE_PATH}/veri/${file}`,
  });
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "NetAtlas TR: Türkiye'de ölçülen sabit internet hızları, il ve ilçelere göre",
    description:
      "Türkiye'nin 81 ili ve 973 ilçesinde Speedtest ile ölçülen ortalama sabit internet indirme ve yükleme hızı ile "
      + "gecikme; 2019'dan bugüne her takvim yılı ve yayınlanmış son dört çeyrek için. Değerler cihaz ağırlıklıdır; "
      + "test sayısı, kare ve çeyrek başına cihaz sayılarının toplamı, güvenilirlik etiketi ve nüfusun ölçüm yapılan "
      + "karelerde ya da hemen yanlarında yaşayan payı da verilir. "
      + "Ookla'nın açık Speedtest verisinden türetilmiştir.",
    url: `${SITE_ORIGIN}${BASE_PATH}/yontem/`,
    sameAs: REPO_URL,
    inLanguage: "tr",
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    keywords: ["internet hızı", "sabit genişbant", "Speedtest", "Ookla", "Türkiye", "il", "ilçe"],
    temporalCoverage: `${firstYear}-${month(firstQuarter, 1)}/${lastYear}-${month(lastQuarter, 3)}`,
    spatialCoverage: { "@type": "Place", name: "Türkiye" },
    variableMeasured: [
      "Ortalama indirme hızı (Mbps)",
      "Ortalama yükleme hızı (Mbps)",
      "Ortalama gecikme (ms)",
      "Test sayısı",
      "Kare ve çeyrek başına cihaz sayılarının toplamı (aynı cihaz birden çok kez sayılabilir)",
      "Nüfusun ölçüm yapılan karelerde ya da hemen yanlarında yaşayan payı",
    ],
    isBasedOn: ["https://github.com/teamookla/ookla-open-data", "https://doi.org/10.5258/SOTON/WP00758"],
    distribution: [
      table("iller_hiz.csv", "İllere göre hızlar"),
      table("ilceler_hiz.csv", "İlçelere göre hızlar"),
      table("iller_yerlesim.csv", "İllere ve yerleşim türüne göre hızlar"),
    ],
  };
}

const date = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

export default async function MethodPage() {
  const data = await readProvinces();
  const national = data.iller[NATIONAL];
  const { erisim, ilk, son } = data.ookla;
  const quartersEn = `${ilk[0]} Q${ilk[1]}–${son[0]} Q${son[1]}`;
  const quartersTr = `${ilk[0]} Ç${ilk[1]} – ${son[0]} Ç${son[1]}`;
  const levels = Object.values(CELL_SIZE);
  const current = data.donemler[data.donemler.length - 1];
  const years = data.donemler.slice(0, -1).map((p) => p.id);
  // Kır's download over yoğun kent's: Türkiye's now and in the first year, and its median over the provinces
  // where both have enough tests.
  const settlement = national.yerlesim!;
  const ruralNow = ruralRatio(settlement[current.id], "indirme_mbps")!;
  const ruralFirst = ruralRatio(settlement[years[0]], "indirme_mbps")!;
  const compared = Object.entries(data.iller)
    .filter(([code]) => code !== NATIONAL)
    .map(([, p]) => ruralRatio(p.yerlesim?.[current.id], "indirme_mbps"))
    .filter((ratio): ratio is number => ratio !== null)
    .sort((a, b) => a - b);
  const middle = compared.length / 2;
  const ruralMedian = compared.length % 2 ? compared[Math.floor(middle)] : (compared[middle - 1] + compared[middle]) / 2;

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        // "<" escaped so no value can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetMarkup(ilk, son)).replace(/</g, "\\u003c") }}
      />
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/il/">Tüm iller</Link>
      </nav>
      <h1>Yöntem ve kaynaklar</h1>
      <p className={styles.lead}>
        NetAtlas TR, Türkiye&apos;de sabit internet bağlantılarında ölçülen hızları Ookla&apos;nın açık Speedtest
        verisinden, erişimi BTK&apos;nın il istatistiklerinden gösterir. Bu sayfa değerlerin nasıl hesaplandığını,
        neye dikkat etmek gerektiğini ve kaynakları anlatır.
      </p>

      <section id="kisaca" className={styles.prose}>
        <h2>Kısaca</h2>
        <ul>
          <li>
            <strong>Değerler ölçülen hızlardır, paket hızı ya da altyapı değil.</strong> İnsanların ev ve iş yeri
            internetinde Speedtest ile yaptığı testlerin ortalamasıdır; bir adrese fiber gelip gelmediğini göstermez.
          </li>
          <li>
            <strong>Ortalama, tipik bir evin hızından yüksektir.</strong> Son dört çeyrekte Türkiye ortalaması{" "}
            {formatValue(DOWNLOAD, national.hiz[current.id].indirme_mbps)}, oysa abonelerin %{BTK_PACKAGES.ellialti}&apos;i 50
            Mbps ve altı paket kullanıyor. Değerler en çok bölgeleri ve yılları karşılaştırmak için anlamlıdır (bkz.{" "}
            <a href="#ne-gosteriyor">harita ne gösteriyor</a>).
          </li>
          <li>
            <strong>Az testli değerler oynaktır.</strong> {LOW_TESTS}&apos;dan az testli değerler haritada içi boş ya da
            taralı gösterilir; ölçüm olmayan yerler boş kalır (bkz. <a href="#guvenilirlik">güvenilirlik</a>).
          </li>
          <li>
            <strong>2025&apos;in son çeyreğinde hızlar bir anda yükseldi, nedeni bilinmiyor.</strong> 2025 ve sonrası
            önceki yıllarla karşılaştırılırken bu akılda tutulmalı (bkz. <a href="#donemler">dönemler</a>).
          </li>
        </ul>
      </section>

      <nav className={styles.toc} aria-label="Bu sayfada">
        <ol>
          {SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}
        </ol>
      </nav>

      <section id="ne-gosteriyor" className={styles.prose}>
        <h2>Harita ne gösteriyor?</h2>
        <p>
          Bir bölgede insanların Speedtest ile <strong>gerçekten ölçtüğü</strong> ortalama indirme, yükleme ve gecikmeyi.
          Belirli bir adrese hangi altyapının ulaştığını ya da alınabilecek en yüksek hızı göstermez. Yalnızca sabit
          bağlantılar (ev ve iş yeri interneti: fiber, VDSL, kablo vb.) sayılır; mobil ölçümler dahil değildir.
        </p>
        <p>
          Bu, abonelerin paket hızlarının ortalaması da değildir. Son dört çeyrekte ({current.aralik}) Speedtest
          ölçümlerinin Türkiye ortalaması {formatValue(DOWNLOAD, national.hiz[current.id].indirme_mbps)}. BTK&apos;ya göre ise{" "}
          {BTK_PACKAGES.donem}&apos;de sabit genişbant abonelerinin %{BTK_PACKAGES.ellialti}&apos;i 50 Mbps ve altı, yaklaşık
          %{BTK_PACKAGES.elliyuz}&apos;u 50–100 Mbps, yaklaşık %{BTK_PACKAGES.yuzustu}&apos;i 100 Mbps üstü paket kullanıyor (
          <a href={BTK_PACKAGES.kaynak}>BTK Üç Aylık Pazar Verileri Raporu, {BTK_PACKAGES.donem}</a>, Şekil 3-4). İkisi aynı
          şeyi ölçmez, ama aradaki fark ortalamanın hızlı bağlantılarca yukarı çekildiğini gösterir (bkz.{" "}
          <a href="#sinirlamalar">sınırlamalar</a>). Haritadaki değerler tipik bir evin hızı olarak değil, bölgeleri ve
          yılları karşılaştırmak için okunmalıdır.
        </p>
      </section>

      <section id="kaynaklar" className={styles.prose}>
        <h2>Veri kaynakları</h2>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Veri</th><th scope="col">Kaynak</th><th scope="col">Kapsam</th><th scope="col">Lisans</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Sabit internet hız ölçümleri</th>
                <td><a href="https://github.com/teamookla/ookla-open-data">Speedtest® by Ookla® Open Data</a></td>
                <td>{quartersTr}, çeyrek başına ~475 m&apos;lik kareler</td>
                <td>CC BY-NC-SA 4.0</td>
              </tr>
              <tr>
                <th scope="row">Abonelik ve bağlantı türleri</th>
                <td><a href="https://www.btk.gov.tr/yillik-il-istatistikleri">BTK, Yıllık İl İstatistikleri</a></td>
                <td>{data.btk_yillari[0]}–{data.btk_yillari[data.btk_yillari.length - 1]}, il düzeyinde, yıl sonu</td>
                <td>Açık lisans yok (© BTK)</td>
              </tr>
              <tr>
                <th scope="row">Nüfusun dağılımı</th>
                <td>
                  <a href="https://doi.org/10.5258/SOTON/WP00758">WorldPop, Türkiye 2021</a>; ilçe nüfusları TÜİK&apos;in
                  adrese dayalı kayıt sisteminden (OCHA COD-PS)
                </td>
                <td>2021 yıl sonu, ~100 m&apos;lik hücreler</td>
                <td>CC BY 4.0</td>
              </tr>
              <tr>
                <th scope="row">İl ve ilçe sınırları</th>
                <td><a href="https://data.humdata.org/dataset/cod-ab-tur">OCHA COD-AB Türkiye</a>, kaynağı Harita Genel Müdürlüğü</td>
                <td>81 il, 973 ilçe</td>
                <td>CC BY-IGO</td>
              </tr>
              <tr>
                <th scope="row">İlçe adları</th>
                <td>OpenStreetMap katkıcıları, <a href="https://www.geoboundaries.org/">geoBoundaries</a> üzerinden</td>
                <td>Türkçe yazımlar</td>
                <td>ODbL</td>
              </tr>
              <tr>
                <th scope="row">Altlık harita</th>
                <td><a href="https://openfreemap.org/">OpenFreeMap</a>, © OpenMapTiles, © OpenStreetMap katkıcıları</td>
                <td>Dünya</td>
                <td>ODbL (veri)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="donemler" className={styles.prose}>
        <h2>Dönemler ve veri miktarı</h2>
        <p>
          Ookla veriyi çeyrek çeyrek yayımlar. Tek çeyrekte birçok yerde çok az test olduğu için çeyrekler birleştirilir:
          her takvim yılı kendi dört çeyreğiyle, <strong>Güncel</strong> ise yayımlanmış son dört çeyrekle.
          Yeni bir çeyrek yayımlanınca Güncel bir çeyrek ileri kayar. Bir yılın dört çeyreği tamamlandığında Güncel o yılla
          aynı olur; yıl, bir sonraki çeyrek yayımlanınca ayrıca listeye eklenir.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.caption}>
              Türkiye genelinde, ölçüm olan 475 m&apos;lik kareler, test sayısı ve nüfusun bu karelerde ya da hemen yanlarında yaşayan payı
            </caption>
            <thead>
              <tr>
                <th scope="col">Dönem</th><th scope="col">Çeyrekler</th>
                <th scope="col" className={styles.num}>Kare</th><th scope="col" className={styles.num}>Test</th>
                <th scope="col" className={styles.num}>Nüfus payı</th>
              </tr>
            </thead>
            <tbody>
              {data.donemler.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.ad}</th>
                  <td>{p.aralik}</td>
                  <td className={styles.num}>{formatNumber(national.hiz[p.id].kare)}</td>
                  <td className={styles.num}>{formatNumber(national.hiz[p.id].test)}</td>
                  <td className={styles.num}>%{formatNumber(national.hiz[p.id].olculen_nufus_payi! * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          2020 ve 2021&apos;in çoğu çeyreğinde kare ve test sayısı belirgin şekilde az. Bu bir hata değil, Ookla&apos;nın
          o dönemki dosyalarından geliyor (dünya genelinde de daha az kare var); bu yıllar daha az güvenilirdir.
        </p>
        <p>
          <strong>2025&apos;in son çeyreğinde ölçülen hızlar bir anda yükseldi ve bunun nedenini bilmiyoruz.</strong> Aynı
          karelerde ortalama indirme hızı bir çeyrekte %22 arttı; 2022&apos;den bu yana çoğu çeyrekte artış %4–12 arasındaydı.
          Artış Ookla&apos;nın verisinde var ve Türkiye&apos;ye özgü: aynı çeyrekte Yunanistan ve Bulgaristan&apos;da %7–11, Berlin ve
          Madrid&apos;de %4–6. Yeterli ölçümü olan illerin onda dokuzunda %16&apos;nın üstünde ve en çok yavaş bağlantılarda.
          Testleri yapan cihazlar ve test sıklığı değişmeyen yerlerde de neredeyse aynı büyüklükte. Abonelerin paketleri ise ani bir
          değişim göstermiyor: BTK&apos;ya göre 50 Mbps üstü paket kullananların payı o çeyrekte %37,9&apos;dan %41,6&apos;ya, bir sonraki
          çeyrekte %44,6&apos;ya çıktı (
          <a href="https://www.btk.gov.tr/s3/web-btk-site/7708c26c-5161-4919-8b3d-daa31d4ac8fb/2026/08/f092061c-9663-495b-8881-9900b1724e25.pdf">
            BTK Üç Aylık Pazar Verileri Raporu, 2025 Ç4
          </a>
          , Şekil 3-4). 2025 ile {MEASURED} değerlerinin önceki yıllardan bu kadar yüksek çıkmasının bir kısmı bu çeyrekten gelir.
        </p>
      </section>

      <section id="hesaplama" className={styles.prose}>
        <h2>Değerler nasıl hesaplanıyor?</h2>
        <ul>
          <li>
            <strong>Kareler:</strong> Ookla her çeyrek için dünyayı Web Mercator sisteminde ~475 m&apos;lik karelere bölüp her
            karede ortalama indirme, yükleme, gecikme, test ve cihaz sayısını yayımlar. Bir dönemin çeyrekleri birleştirilirken
            testler ve cihazlar toplanır, ortalamalar il ve ilçe değerlerindeki gibi cihaz sayısıyla ağırlıklandırılır.
          </li>
          <li>
            <strong>İl ve ilçeye atama:</strong> Alanının en az %20&apos;si Türkiye karasında olan kareler sayılır. Kare, karasının
            en çok düştüğü ile, sonra o ilin içinde karasının en çok düştüğü ilçeye verilir. Böylece merkezi denizde kalan kıyı
            kareleri dahil olur, sınırın öbür yanındaki yerleşimler (ör. Kamışlı, İdlib) dışarıda kalır.
          </li>
          <li>
            <strong>İl, ilçe ve Türkiye değeri:</strong> İçindeki karelerin her çeyrekteki ortalaması (kare-çeyrek
            ortalaması), o karede o çeyrekte test yapan cihaz sayısıyla ağırlıklandırılır. Bu ortalamayı Ookla karedeki bütün
            testlerden hesaplar; cihaz sayısı onun alan değerindeki ağırlığını belirler, kendisini değiştirmez. Karesinde tek
            başına onlarca test yapan bir cihaz değeri bir kez etkiler; aynı karede başka cihazlar da test yapıyorsa o karenin
            ortalamasında yine ağır basar. Aynı yılın iki yarısı karşılaştırıldığında bu yöntem ilçe ve il değerlerini daha
            tutarlı yaptı: 1.000–4.999 testli ilçelerde iki yarı arasındaki tipik fark %13–16&apos;dan %9–11&apos;e, 5.000&apos;den
            az testli illerde %14–25&apos;ten %6–20&apos;ye indi. Kareler, ısı haritasının her hücresi ve çevrendeki 1 km de
            aynı kuralla hesaplanır, böylece bütün bir ilçeyi kaplayan hücre ilçe değerini gösterir. Hücreler önceden test
            ağırlıklıydı: uzaktan bakınca tek bir cihazın çok test yaptığı ilçelerde hücre ile panel 1,5 kattan fazla
            ayrılabiliyordu ({MEASURED} döneminde 973 ilçeden 50&apos;sinde). Güvenilirlik her yerde test sayısına bakar. Bir alanın en büyük karesi ağırlığın en az
            %{formatNumber(ONE_TILE_SHARE * 100)}&apos;unu tutuyorsa ya da nüfusunun
            %{formatNumber(MEASURED_RESIDENTS_SHARE * 100)}&apos;den azı ölçüm yapılan karelerde ya da hemen
            yanlarında yaşıyorsa (aşağıda), bölge panelinde değerin alanın tamamını değil ölçüm yapılan yerleri
            gösterdiğini belirten bir uyarı çıkar (bkz. <a href="#guvenilirlik">Güvenilirlik</a>).
          </li>
          <li>
            <strong>Ölçüm yapılan karelerdeki nüfus:</strong> Haritanın çoğu boştur, çünkü ölçümler insanların yaşadığı
            yerlerde toplanır. Bir alanın nüfusunun ne kadarının, o dönemde en az bir test yapılmış bir karede ya da onun
            hemen yanındaki sekiz kareden birinde yaşadığı bölge panelinde ve yukarıdaki tabloda verilir. Yandaki kareler
            de sayılır, çünkü küçük bir yerleşimin testleri çoğu zaman en kalabalık karesinin bir yanına düşer: yalnızca
            aynı kare sayıldığında 264 testli Hemşin&apos;de nüfusun %12&apos;si ölçülmüş görünüyordu, yandakilerle %96&apos;sı.
            Nüfusun kareler arasındaki dağılımı WorldPop&apos;tan gelir:
            TÜİK&apos;in 2021 ilçe nüfuslarını, uydudan görülen yapılaşmaya göre ~100 m&apos;lik hücrelere dağıtır. Her
            hücre, merkezinin düştüğü kareye eklenir; kareler il ve ilçelere testlerle aynı kuralla atanır. Bu yolla
            bulunan il nüfusları, TÜİK&apos;in 2021 il nüfuslarından en çok %2 ayrılır.
          </li>
          <li>
            <strong>Isı haritası:</strong> Yakınlaşınca Ookla&apos;nın kendi kareleri görünür. Uzaklaştıkça kareler daha büyük
            hücrelerde ({levels.slice(0, -1).reverse().join(", ")}) cihaz ağırlıklı olarak birleşir; her yakınlıkta hücreler
            ekranda 8–16 piksel genişliktedir. Bir hücre yalnızca içinde ölçüm olan yerlerde boyanır: en çok 8 × 8
            parçaya bölünür ve içinde ölçülmüş bir 475 m&apos;lik kare olan parçalar hücrenin renginde çizilir. Uzaktan
            bakınca bu parçalar 1–2 piksel olur; yakınlaştıkça Ookla&apos;nın karelerine iner. Hücreler eskiden tamamen
            boyanıyordu; Türkiye karasının çoğunda ölçüm olmadığı için uzaktan bakınca boyalı alan ölçülen alanın 37
            katına çıkıyor, ölçülmemiş kırsal alanlar ölçülmüş gibi görünüyordu. Her hücre kendi değerinin renginde
            çizilir; komşu hücrelerin renkleri birbirine karışmaz. Kareler arasında yumuşak geçiş bilerek yok:
            geçişteki renkler hiçbir karede ölçülmemiş ara değerler olurdu, bir yerin rengi üzerine gelince gösterilen
            değerle uyuşmazdı ve komşu kareler arasında gerçekte olmayan bir eğilim görünürdü. Ölçüm olmayan yerler boş
            kalır. Üzerine gelince ve tıklayınca bölge panelinde gösterilen değer, parçanın renginin gösterdiği
            değerdir; parçaların arasındaki boşlukta birkaç piksel yakındaki parçanınki gösterilir. Uzaktan parçalar içi boş çizilemeyecek kadar küçük
            olduğundan, az testli değerler yakınlaşınca ayırt edilir.
          </li>
          <li>
            <strong>Çevrendeki {formatNumber(NEARBY_RADIUS / 1000)} km:</strong> Haritada tıklanan noktaya merkezi{" "}
            {formatNumber(NEARBY_RADIUS / 1000)} km&apos;den yakın olan 475 m&apos;lik karelerin cihaz ağırlıklı ortalamasıdır.
            Hangi yakınlıkta bakılırsa bakılsın Ookla&apos;nın kendi karelerinden hesaplanır. Haritadaki
            &quot;Konumuma git&quot; düğmesi aynı özeti bulunduğun nokta için açar. Konumun yalnızca tarayıcında kullanılır,
            hiçbir yere gönderilmez ve sayfanın adresine de yazılmaz: adres yalnızca ilçeyi gösterir. Haritayı sonradan
            kendin kaydırırsan adres, her kaydırmada olduğu gibi haritanın ortasını gösterir.
          </li>
          <li>
            <strong>Erişim:</strong> 100 kişiye sabit abonelik = sabit genişbant aboneliği ÷ nüfus × 100. Fiber payı = fiber
            abonelik ÷ sabit genişbant aboneliği. Değerler yıl sonudur ve yalnızca il düzeyinde vardır. Bağlantı türleri
            BTK&apos;nın ayrımıdır: fiber, telefon hattı (xDSL: ADSL ve VDSL), kablo TV ve diğer (BTK&apos;ya göre Frame Relay,
            Metro Ethernet, ATM ve BPL). &quot;Fiber öne geçti&quot;, fiber aboneliklerinin telefon hattı aboneliklerinden
            fazla olduğu ve son yıla kadar fazla kaldığı dönemin ilk yılıdır. BTK verisi {inYear(data.btk_yillari[0])}{" "}
            başladığı için o yıl fiberi zaten önde olan bir ilde &quot;{data.btk_yillari[0]} ya da önce&quot; yazılır.
            İllerin bu yıla göre haritası <Link href="/fiber/">Fiber</Link> sayfasında.
          </li>
        </ul>
      </section>

      <section id="kent-kir" className={styles.prose}>
        <h2>Kent ve kır</h2>
        <p>
          Bir ilin ortalaması kentleriyle kırını tek sayıda birleştirir. Bölge panelindeki &quot;Kent ve kır&quot; bölümü
          her ilin ve Türkiye&apos;nin değerlerini TÜİK&apos;in kullandığı üç yerleşim türüne ayırır: yoğun kent, orta yoğun
          kent ve kır. Son dört çeyrekte ({current.aralik}) Türkiye&apos;de kırda ölçülen indirme hızı yoğun kentte
          ölçülenin {ratioText(ruralNow)}; {inYear(years[0])} bu oran %{formatNumber(ruralFirst * 100)} idi. Aynı dönemde
          kırda da yoğun kentte de en az {HIGH_TESTS} testi olan {compared.length} ilin ortancasında kırda ölçülen hız
          yoğun kentte ölçülenin {ratioText(ruralMedian)}.
        </p>
        <p>
          Türler, nüfusun dağılımını veren WorldPop ızgarasından (bkz. <a href="#kaynaklar">kaynaklar</a>), TÜİK&apos;in de
          kullandığı Eurostat &quot;kentleşme derecesi&quot; yöntemine yakın bir kuralla bulunur. Izgara, Ookla&apos;nın 2 × 2
          karesinden oluşan ~0,9 km&apos;lik hücrelerde toplanır; bir hücrenin yoğunluğu, nüfusunun hücrenin alanına (km²)
          bölümüdür.
        </p>
        <ul>
          <li>
            <strong>Yoğun kent:</strong> km² başına en az 1.500 kişinin yaşadığı, birbirine kenarından değen hücrelerin
            toplam en az 50.000 kişilik kümeleri.
          </li>
          <li>
            <strong>Orta yoğun kent:</strong> km² başına en az 300 kişinin yaşadığı, birbirine kenarından ya da köşesinden
            değen hücrelerin toplam en az 5.000 kişilik kümelerinde kalan, yoğun kent olmayan hücreler.
          </li>
          <li><strong>Kır:</strong> geri kalan her yer; içinde kimsenin yaşamadığı hücreler de.</li>
        </ul>
        <p>
          Her türün değeri, il değeri gibi, ildeki o türden karelerin cihaz ağırlıklı ortalamasıdır; ölçüme yakın nüfus
          payı da o türde yaşayanlar için aynı kuralla hesaplanır (bkz. <a href="#hesaplama">hesaplama</a>).{" "}
          {HIGH_TESTS}&apos;den az testli bir türün hızı gösterilmez. İlçeler türlere ayrılmaz, örnekleri çok küçük kalır; ilçe
          panelinde ilin değerleri gösterilir. Bu kurala göre Türkiye&apos;de yaşayanların %65,3&apos;ü yoğun kentte,
          %19,3&apos;ü orta yoğun kentte, %15,5&apos;i kırda yaşıyor; TÜİK&apos;e göre 2025 sonunda bu paylar %67,5, %15,8
          ve %16,8 (TÜİK, Adrese Dayalı Nüfus Kayıt Sistemi Sonuçları, 2025). Artvin, Bayburt, Gümüşhane, Sinop, Tunceli
          ve Ardahan&apos;da yoğun kent sayılan yer yok.
        </p>
        <p>Bu yaklaşık bir sınıflamadır:</p>
        <ul>
          <li>
            Resmî yöntem 1 km²&apos;lik eşit alanlı bir ızgara kullanır ve yoğun kent kümelerindeki boşlukları doldurur
            (sekiz komşusundan en az beşi yoğun kent olan hücre kümeye katılır). Burada hücreler Web Mercator karelerine
            göredir ve boşluk doldurulmaz; doldurmak Türkiye&apos;deki payları 1 puandan az değiştiriyor.
          </li>
          <li>
            TÜİK türleri ızgaradan mahalle ve köylere taşır; burada her hücre kendi türünde kalır. Yerleşimi dağınık illerde
            kır eksik sayılır: Ağrı&apos;da nüfusun burada %19&apos;u, TÜİK&apos;e göre %37&apos;si kırda.
          </li>
          <li>
            Nüfus ızgarası 2021&apos;den, yani 2023 depremlerinden önceki yerleşimi gösterir. Hatay, Malatya ve
            Adıyaman&apos;da kırda ve yoğun kentte ölçülen hızlar neredeyse eşit çıkıyor ({MEASURED} döneminde kırdaki hız
            yoğun kenttekinin %90–101&apos;i).
          </li>
          <li>
            Büyük şehirlerde &quot;kır&quot;ın bir kısmı köy değil, seyrek yapılı dış semtlerdir: {MEASURED} döneminde
            Ankara&apos;da kırda test yapan cihazların yarıdan fazlası Gölbaşı&apos;nda ve Yenimahalle ile Çankaya&apos;nın
            kent dışında kalan kesimlerindeydi.
          </li>
          <li>
            Kırda yaşayanların yalnızca {percentOf(Math.round(settlement[current.id].kir!.olculen_nufus_payi * 100))} ölçüm
            yapılan karelerde ya da hemen yanlarında oturuyor ({current.aralik}); yoğun kentte neredeyse hepsi. Kırın hızı,
            kırın ölçülen kesiminin hızıdır.
          </li>
          <li>Yazlıkçıların ve turistlerin testleri de kıra düşebilir.</li>
        </ul>
      </section>

      <section id="guvenilirlik" className={styles.prose}>
        <h2>Güvenilirlik</h2>
        <p>Her kare, ilçe ve il için dönemdeki test sayısına göre bir etiket verilir:</p>
        <ul>
          <li><strong>Düşük:</strong> {LOW_TESTS}&apos;dan az test</li>
          <li><strong>Orta:</strong> {LOW_TESTS}–{HIGH_TESTS - 1} test</li>
          <li><strong>Yüksek:</strong> {HIGH_TESTS} ve üstü test</li>
        </ul>
        <p>
          Eşikler veriye bakılarak seçildi. Aynı dönemin iki yarısı (1.+3. ve 2.+4. çeyrek) karşılaştırıldığında, iki yarının
          indirme değeri arasındaki tipik fark {LOW_TESTS}&apos;dan az testli karelerde yaklaşık %50, {LOW_TESTS}–49 testte
          %30–43, 50–{HIGH_TESTS - 1} testte %22–31, {HIGH_TESTS}–499 testte %16–18&apos;dir (2024 ile {MEASURED}). İl ve ilçeler aynı
          test sayısında benzer oynar. {MEASURED} döneminde karelerin %59&apos;u düşük güvenilirlikteydi ama bu kareler
          testlerin yalnızca %3&apos;ünü tutuyordu; testlerin %62&apos;si yüksek güvenilirlikteki karelerdeydi. Haritada düşük güvenilirlikteki değerler
          içi boş gösterilir: çerçeve değerin kendi rengindedir, içi soluk kalır. İl ve ilçe görünümünde ise alan, değerin
          renginde çizgilerle taranır. Renk hızı, içinin boş ya da taralı olması belirsizliği anlatır.
        </p>
        <p>
          Etiket, değerin yeniden ölçülse ne kadar oynayacağını anlatır; bu hızın kimin hızı olduğunu anlatmaz. Bunu
          bölge panelindeki temsil uyarısı anlatır: bir alanın en büyük karesi ağırlığın en az
          %{formatNumber(ONE_TILE_SHARE * 100)}&apos;unu tutuyorsa ya da nüfusunun
          %{formatNumber(MEASURED_RESIDENTS_SHARE * 100)}&apos;den azı ölçüm yapılan karelerde ya da hemen yanlarında
          yaşıyorsa, değer alanın tamamını değil, ölçüm yapılan yerleri gösterir. Bu iki pay etikete katılmadı. Tek bir
          karede yoğunlaşma değeri daha oynak yapmıyor: en büyük karesi ağırlığın en az
          %{formatNumber(ONE_TILE_SHARE * 100)}&apos;unu tutan yüksek güvenilirlikteki ilçelerde iki yarı arasındaki fark,
          test sayısı benzer ilçelerinkinden tipik olarak yalnızca 1 puan fazla (2019 – 2026 Ç3, 50 ilçe ve dönem; ör.
          Aybastı, {MEASURED}: 216 test, tek karenin payı %36, fark %10; 200–499 testli ilçelerde tipik fark %18). Nüfus
          için %{formatNumber(MEASURED_RESIDENTS_SHARE * 100)} veriden türetilmedi; &quot;nüfusun yarısından çoğu
          ölçümlerden uzakta&quot; anlamına gelen bir tercih. İki yarı karşılaştırması yalnızca oynaklığı ölçer; ölçülmeyen
          yerlerde hızın farklı olup olmadığını, yani değerin yanlı olup olmadığını gösteremez.
        </p>
      </section>

      <section id="renkler" className={styles.prose}>
        <h2>Renk ölçeği</h2>
        <p>
          Hızlar 2019&apos;dan bugüne birkaç kat arttığı için sınıflar logaritmik aralıklıdır ve bütün dönemlerde aynıdır;
          böylece aynı renk her yıl aynı değeri gösterir. Sınıf sınırları:
        </p>
        <ul>
          {METRICS.map((m) => (
            <li key={m.id}>
              <strong>{m.title}:</strong> {breakLabels(m).join(" · ")} {m.id === "guvenilirlik" ? "test" : m.unit}
              {m.note && ` (${m.note})`}
            </li>
          ))}
        </ul>
        <p>
          Renkler tek bir mavi tonunun açıklık sırasıdır; renk körlüğünde de sıra okunur. Hız göstergelerinde renkler bu
          sınırlar arasında kesintisiz geçer: aynı sınıftaki iki il ya da ilçe de farklı tonda görünür ve bir alanın rengi
          altındaki ısı haritasında aynı değerin rengidir. Güvenilirlik üç sınıfla gösterilir.
        </p>
      </section>

      <section id="sinirlamalar" className={styles.prose}>
        <h2>Sınırlamalar</h2>
        <ul>
          <li>
            <strong>Ortalama, tipik kullanıcıdan yüksek çıkar.</strong> Ookla kare başına yalnızca ortalama yayımlar.
            Türkiye&apos;de hızlar iki gruba ayrılıyor (VDSL ve fiber); birkaç gigabit bağlantı bir bölgenin ortalamasını
            yukarı çekebilir. Testi yapanlar da rastgele seçilmiş değildir; abonelerin tamamını temsil etmeyebilir. BTK&apos;nın paket dağılımıyla karşılaştırma için
            bkz. <a href="#ne-gosteriyor">harita ne gösteriyor</a>. Değerler en çok bölgeler ve yıllar arası karşılaştırma
            için anlamlıdır.
          </li>
          <li>
            <strong>Ölçülen hız, altyapı değildir.</strong> Düşük bir değer, bölgede fiber olmadığı anlamına gelmez; kullanıcılar
            düşük paket almış, Wi-Fi üzerinden ölçmüş olabilir.
          </li>
          <li>
            <strong>Ölçümler yalnızca telefon ve tabletlerdeki Speedtest uygulamasından</strong>, Wi-Fi ya da kablo
            üzerinden yapılan ve GPS ile konumu belli testlerden gelir. Wi-Fi ölçümü hattın hızından düşük çıkabilir.
            Turistik yerlerde ziyaretçilerin testleri de sayılır.
          </li>
          <li><strong>2020 ve 2021</strong> için Ookla verisi seyrektir (bkz. dönemler).</li>
          <li>
            <strong>Nüfus payı kabadır.</strong> Nüfusun dağılımı 2021&apos;e aittir ve bir modelden gelir; sonraki göçleri
            (ör. 2023 depremleri) görmez. Testler bir yerleşimin merkezinden iki kare ya da daha uzakta toplanmışsa pay
            düşük çıkar (ör. Hazro). Pay, bu karelerdeki herkesin ölçüldüğünü de söylemez: tek bir test yapılan kare ve
            yanındaki kareler de sayılır.
          </li>
          <li><strong>BTK verisi yalnızca il düzeyindedir;</strong> ilçe panellerinde ilin değerleri gösterilir.</li>
          <li>
            <strong>BTK 2020:</strong> dört ilde (Diyarbakır, İstanbul, Kilis, Konya) teknolojilere göre dağılım il toplamıyla
            tutmuyor; farklar birbirini götürür, Türkiye toplamı doğrudur.
          </li>
          <li>
            <strong>&quot;Diğer&quot; bazı illerde büyüktür:</strong> 2025 sonunda Hatay&apos;da aboneliklerin %37&apos;si,
            Şanlıurfa&apos;da %25&apos;i. BTK bu kalemi teknolojilere ayırmıyor. Türkiye toplamındaki &quot;diğer&quot; ayrıca
            illere dağıtılamayan ISDN ve uydu aboneliklerini de içerir.
          </li>
          <li><strong>Abonelik hane değildir:</strong> iş yeri abonelikleri de sayıya dahildir.</li>
          <li>
            <strong>Ölçüm olmayan ilçe-yıllar</strong> boş kalır (ör. eski ilçe merkezi Ilısu Barajı&apos;nın altında kalan
            Hasankeyf&apos;te 2020–2024).
          </li>
        </ul>
      </section>

      <section id="erisilebilirlik" className={styles.prose}>
        <h2>Erişilebilirlik ve klavye</h2>
        <ul>
          <li>Bütün kontroller Tab ile gezilebilir; her dönemin kendi düğmesi var, oynat düğmesi dönemleri sırayla gösterir.</li>
          <li>İki dönemi karşılaştırırken aradaki çizgi, tutamağı odaktayken ← ve → ile kayar.</li>
          <li>Harita odaktayken ok tuşları haritayı kaydırır, + ve − yakınlaştırır.</li>
          <li>Arama kutusunda ↑ ↓ ile sonuçlar arasında gezilir, Enter ile seçilir; seçilen yerin paneli açılır.</li>
          <li>Bölge paneli Esc ile kapanır; odak paneli açan öğeye döner.</li>
          <li>
            <strong>Tablo görünümü:</strong> haritanın üstündeki &quot;Tablo&quot; seçeneği, seçili dönemdeki bütün il ya da
            ilçe değerlerini haritasız, sıralanabilir bir tabloda gösterir. Grafiklerin altındaki &quot;Tablo olarak göster&quot;
            de grafikteki değerleri açar.
          </li>
        </ul>
      </section>

      <section id="indir" className={styles.prose}>
        <h2>Veriyi indir</h2>
        <p>
          Sitedeki il ve ilçe değerleri üç CSV dosyasında, her alan ve dönem için bir satır olarak indirilebilir
          (yerleşim türü dosyasında her alan, tür ve dönem için):
        </p>
        <ul>
          <li><a href={`${BASE_PATH}/veri/iller_hiz.csv`} download>iller_hiz.csv</a>: 81 il ve Türkiye geneli</li>
          <li><a href={`${BASE_PATH}/veri/ilceler_hiz.csv`} download>ilceler_hiz.csv</a>: 973 ilçe</li>
          <li>
            <a href={`${BASE_PATH}/veri/iller_yerlesim.csv`} download>iller_yerlesim.csv</a>: 81 il ve Türkiye geneli,
            yerleşim türüne göre
          </li>
        </ul>
        <p>Sütunlar:</p>
        <ul>
          <li><code>il_kodu</code>, <code>il</code>: ilin plaka kodu ve adı; Türkiye geneli <code>00</code>.</li>
          <li>
            <code>ilce_kodu</code>, <code>ilce</code>: yalnızca ilçe dosyasında, ilçenin OCHA COD-AB&apos;deki kodu (ör.{" "}
            <code>TUR001001</code>) ve adı.
          </li>
          <li>
            <code>yerlesim</code>: yalnızca yerleşim türü dosyasında, <code>yogun_kent</code>, <code>orta_yogun_kent</code>{" "}
            ya da <code>kir</code> (bkz. <a href="#kent-kir">kent ve kır</a>). Bu dosyada değerler ilin o türdeki
            karelerinden hesaplanır; <code>nufus</code> ve <code>olculen_nufus_payi</code> o ilde o türde yaşayanlar
            içindir.
          </li>
          <li>
            <code>donem</code>: takvim yılı ({years[0]}–{years[years.length - 1]}) ya da <code>guncel</code> (yayımlanmış son
            dört çeyrek, şu an {current.aralik}; bkz. <a href="#donemler">dönemler</a>).
          </li>
          <li><code>kare</code>: dönemde en az bir test yapılan ~475 m&apos;lik karelerin sayısı.</li>
          <li><code>test</code>: dönemdeki toplam test sayısı.</li>
          <li>
            <code>cihaz</code>: kişi ya da cihaz sayısı değildir. Ookla&apos;nın her kare ve çeyrek için verdiği, orada test
            yapan cihaz sayılarının toplamıdır; birden çok karede ya da çeyrekte test yapan bir cihaz her birinde yeniden
            sayılır. Hız değerleri bu sayılarla ağırlıklandırılır (bkz. <a href="#hesaplama">hesaplama</a>).
          </li>
          <li>
            <code>indirme_mbps</code>, <code>yukleme_mbps</code>, <code>gecikme_ms</code>: cihaz ağırlıklı ortalama indirme
            ve yükleme hızı (Mbps) ile gecikme (ms).
          </li>
          <li>
            <code>guvenilirlik</code>: test sayısına göre etiket, <code>dusuk</code> ({LOW_TESTS}&apos;dan az),{" "}
            <code>orta</code> ({LOW_TESTS}–{HIGH_TESTS - 1}) ya da <code>yuksek</code> ({HIGH_TESTS} ve üstü).
          </li>
          <li>
            <code>tek_kare_payi</code>: en çok cihazı olan tek karenin, alanın <code>cihaz</code> toplamındaki payı;{" "}
            <code>{ONE_TILE_SHARE}</code> ve üstünde bölge panelinde temsil uyarısı çıkar.
          </li>
          <li>
            <code>nufus</code>: alanın WorldPop&apos;a göre 2021 nüfusu, kareler gibi il ve ilçelere atanmış; TÜİK&apos;in
            sayısından biraz ayrılabilir.
          </li>
          <li>
            <code>olculen_nufus_payi</code>: nüfusun, dönemde test yapılan bir karede ya da hemen yanındaki sekiz kareden
            birinde yaşayan payı.
          </li>
        </ul>
        <p>
          Dosyalar UTF-8 kodlamalıdır, sütunlar virgülle ayrılır, ondalık ayırıcı noktadır (ör. <code>36.8</code>); paylar
          0 ile 1 arasındadır. Türkçe ayarlı Excel&apos;de dosyaya çift tıklamak yerine bu ayarlarla içe aktarmak gerekebilir.
          Bir dönemde hiç ölçümü olmayan bir ilçenin o dönem için satırı yoktur; yerleşim türü dosyasında da bir türde o
          dönem test yoksa o türün satırı yoktur. Artvin, Bayburt, Gümüşhane, Sinop, Tunceli ve Ardahan&apos;da yoğun kent
          sayılan yer olmadığı için bu illerin yoğun kent satırı hiç yoktur. BTK&apos;nın il istatistikleri ve ilçe
          listesi de <a href={`${REPO_URL}/tree/main/data/processed`}>GitHub&apos;daki veri klasöründedir</a>. Dosyalar her
          veri güncellemesiyle yenilenir ve aşağıdaki lisansla kullanılabilir.
        </p>
      </section>

      <section id="lisans" className={styles.prose}>
        <h2>Lisans ve atıf</h2>
        <p>Ookla&apos;nın önerdiği atıf:</p>
        <blockquote className={styles.quote} lang="en">
          Speedtest® by Ookla® Global Fixed and Mobile Network Performance Maps was accessed on {date(erisim, "en-GB")} from
          the <a href="https://registry.opendata.aws/speedtest-global-performance/">Registry of Open Data on AWS</a>. Based on
          NetAtlas TR&apos;s analysis of Speedtest® by Ookla® Global Fixed and Mobile Network Performance Maps for {quartersEn}.
          Ookla trademarks used under license and reprinted with permission.
        </blockquote>
        <ul>
          <li>
            Ookla verisi <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.tr">CC BY-NC-SA 4.0</a> lisanslıdır.
            Bu sitedeki hız değerleri ondan türetilmiştir (çeyrekler birleştirildi, il ve ilçelere atandı, hücrelerde toplandı)
            ve aynı lisansla paylaşılır: kaynak gösterilerek, ticari olmayan amaçlarla, aynı lisansla kullanılabilir.
            Veriye son erişim: {date(erisim, "tr-TR")}.
          </li>
          <li>BTK verisi açık lisanslı değildir (© BTK); kaynak gösterilerek kullanılmıştır, ticari kullanım için BTK&apos;dan izin gerekir.</li>
          <li>
            Nüfusun dağılımı: Bondarenko M., Priyatikanto R., Sorichetta A. ve Tatem A.J. (2022), Gridded population
            estimates for Turkey using UN COD-PS estimates 2021, version 1.0. WorldPop, University of Southampton.
            doi:10.5258/SOTON/WP00758. CC BY 4.0.
          </li>
          <li>İl ve ilçe sınırları: OCHA COD-AB Türkiye, kaynağı Harita Genel Müdürlüğü, CC BY-IGO.</li>
          <li>İlçe adları: © OpenStreetMap katkıcıları (ODbL), geoBoundaries üzerinden (Runfola ve diğ., 2020).</li>
          <li>Altlık harita: OpenFreeMap, © OpenMapTiles, © OpenStreetMap katkıcıları.</li>
          <li>Sitenin kodu <a href={REPO_URL}>GitHub&apos;da</a> MIT lisansıyla açıktır.</li>
        </ul>
        <p className={styles.footnote}>NetAtlas TR; Ookla, BTK ya da OCHA ile bağlantılı değildir.</p>
      </section>
    </main>
  );
}
