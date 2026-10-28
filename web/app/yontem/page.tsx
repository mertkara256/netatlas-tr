import type { Metadata } from "next";
import Link from "next/link";
import { CELL_SIZE, NATIONAL } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { LOW_TESTS, METRICS, breakLabels } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { readProvinces } from "@/lib/serverData";
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
  ["guvenilirlik", "Güvenilirlik"],
  ["renkler", "Renk ölçeği"],
  ["sinirlamalar", "Sınırlamalar"],
  ["erisilebilirlik", "Erişilebilirlik ve klavye"],
  ["lisans", "Lisans ve atıf"],
] as const;

const date = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

export default async function MethodPage() {
  const data = await readProvinces();
  const national = data.iller[NATIONAL];
  const { erisim, ilk, son } = data.ookla;
  const quartersEn = `${ilk[0]} Q${ilk[1]}–${son[0]} Q${son[1]}`;
  const quartersTr = `${ilk[0]} Ç${ilk[1]} – ${son[0]} Ç${son[1]}`;
  const levels = Object.values(CELL_SIZE);

  return (
    <main className={styles.page}>
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
                <th scope="row">Abonelik, fiber</th>
                <td><a href="https://www.btk.gov.tr/yillik-il-istatistikleri">BTK, Yıllık İl İstatistikleri</a></td>
                <td>{data.btk_yillari[0]}–{data.btk_yillari[data.btk_yillari.length - 1]}, il düzeyinde, yıl sonu</td>
                <td>Açık lisans yok (© BTK)</td>
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
          Yeni bir çeyrek yayımlanınca Güncel bir çeyrek ileri kayar; bir yılın dört çeyreği de tamamlanınca o yıl listeye eklenir.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.caption}>Türkiye genelinde, ölçüm olan 475 m&apos;lik kareler ve test sayısı</caption>
            <thead>
              <tr>
                <th scope="col">Dönem</th><th scope="col">Çeyrekler</th>
                <th scope="col" className={styles.num}>Kare</th><th scope="col" className={styles.num}>Test</th>
              </tr>
            </thead>
            <tbody>
              {data.donemler.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.ad}</th>
                  <td>{p.aralik}</td>
                  <td className={styles.num}>{formatNumber(national.hiz[p.id].kare)}</td>
                  <td className={styles.num}>{formatNumber(national.hiz[p.id].test)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          2020 ve 2021&apos;in çoğu çeyreğinde kare ve test sayısı belirgin şekilde az. Bu bir hata değil, Ookla&apos;nın
          o dönemki dosyalarından geliyor (dünya genelinde de daha az kare var); bu yıllar daha az güvenilirdir.
        </p>
      </section>

      <section id="hesaplama" className={styles.prose}>
        <h2>Değerler nasıl hesaplanıyor?</h2>
        <ul>
          <li>
            <strong>Kareler:</strong> Ookla her çeyrek için dünyayı Web Mercator sisteminde ~475 m&apos;lik karelere bölüp her
            karede ortalama indirme, yükleme, gecikme ve test sayısını yayımlar. Bir dönemin çeyrekleri birleştirilirken testler
            toplanır, ortalamalar test sayısıyla ağırlıklandırılır.
          </li>
          <li>
            <strong>İl ve ilçeye atama:</strong> Alanının en az %20&apos;si Türkiye karasında olan kareler sayılır. Kare, karasının
            en çok düştüğü ile, sonra o ilin içinde karasının en çok düştüğü ilçeye verilir. Böylece merkezi denizde kalan kıyı
            kareleri dahil olur, sınırın öbür yanındaki yerleşimler (ör. Kamışlı, İdlib) dışarıda kalır.
          </li>
          <li>
            <strong>İl, ilçe ve Türkiye değeri:</strong> İçindeki tüm testlerin test ağırlıklı ortalamasıdır.
          </li>
          <li>
            <strong>Isı haritası:</strong> Yakınlaşınca Ookla&apos;nın kendi kareleri görünür. Uzaklaştıkça kareler daha büyük
            hücrelerde ({levels.slice(0, -1).reverse().join(", ")}) test ağırlıklı olarak birleşir; her yakınlıkta hücreler
            ekranda 8–16 piksel genişliktedir. Harita hücreleri sert köşeli kareler olarak çizmez: her hücrenin ortasındaki
            renk o hücrenin kendi değeridir, iki hücre arasındaki kenara yaklaştıkça renk komşu hücreninkine yumuşakça geçer
            (hızlar logaritmik ölçekte karıştırılır). Ölçüm olmayan yerler boş kalır. Üzerine gelince gösterilen değerler
            hücrenin kendi değerleridir.
          </li>
          <li>
            <strong>Çevrendeki {formatNumber(NEARBY_RADIUS / 1000)} km:</strong> Haritada tıklanan noktaya merkezi{" "}
            {formatNumber(NEARBY_RADIUS / 1000)} km&apos;den yakın olan 475 m&apos;lik karelerin test ağırlıklı ortalamasıdır.
            Hangi yakınlıkta bakılırsa bakılsın Ookla&apos;nın kendi karelerinden hesaplanır.
          </li>
          <li>
            <strong>Erişim:</strong> 100 kişiye sabit abonelik = sabit genişbant aboneliği ÷ nüfus × 100. Fiber payı = fiber
            abonelik ÷ sabit genişbant aboneliği. Değerler yıl sonudur ve yalnızca il düzeyinde vardır.
          </li>
        </ul>
      </section>

      <section id="guvenilirlik" className={styles.prose}>
        <h2>Güvenilirlik</h2>
        <p>Her kare, ilçe ve il için dönemdeki test sayısına göre bir etiket verilir:</p>
        <ul>
          <li><strong>Düşük:</strong> {LOW_TESTS}&apos;dan az test</li>
          <li><strong>Orta:</strong> {LOW_TESTS}–49 test</li>
          <li><strong>Yüksek:</strong> 50 ve üstü test</li>
        </ul>
        <p>
          Eşikler veriye bakılarak seçildi: aynı yılın iki yarısı (1.+3. ve 2.+4. çeyrek) karşılaştırıldığında, {LOW_TESTS}&apos;dan
          az testli karelerin değeri tipik olarak %25–36 oynuyor, 50 ve üstü testli karelerde ise %8–14. Karelerin yarıdan
          fazlası düşük güvenilirlikte ama bu kareler testlerin küçük bir kısmını tutar. Haritada düşük güvenilirlikteki değerler
          aynı açıklıkta ama gri gösterilir: açıklık hızı, grilik belirsizliği anlatır.
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
          Renkler tek bir mavi tonunun açıklık sırasıdır; renk körlüğünde de sıra okunur. Isı haritasında renkler bu sınırlar
          arasında kesintisiz geçer; il ve ilçe görünümlerinde her alan tek bir sınıfın rengini alır.
        </p>
      </section>

      <section id="sinirlamalar" className={styles.prose}>
        <h2>Sınırlamalar</h2>
        <ul>
          <li>
            <strong>Ortalama, tipik kullanıcıdan yüksek çıkabilir.</strong> Ookla kare başına yalnızca ortalama yayımlar.
            Türkiye&apos;de hızlar iki gruba ayrılıyor (VDSL ve fiber); birkaç gigabit bağlantı bir bölgenin ortalamasını
            yukarı çekebilir. Değerler en çok bölgeler ve yıllar arası karşılaştırma için anlamlıdır.
          </li>
          <li>
            <strong>Ölçülen hız, altyapı değildir.</strong> Düşük bir değer, bölgede fiber olmadığı anlamına gelmez; kullanıcılar
            düşük paket almış, Wi-Fi üzerinden ölçmüş olabilir.
          </li>
          <li>
            <strong>Ölçümler yalnızca Speedtest uygulamasından</strong> ve konum paylaşan kullanıcılardan gelir. Turistik
            yerlerde ziyaretçilerin testleri de sayılır.
          </li>
          <li><strong>2020 ve 2021</strong> için Ookla verisi seyrektir (bkz. dönemler).</li>
          <li><strong>BTK verisi yalnızca il düzeyindedir;</strong> ilçe panellerinde ilin değerleri gösterilir.</li>
          <li>
            <strong>BTK 2020:</strong> dört ilde (Diyarbakır, İstanbul, Kilis, Konya) teknolojilere göre dağılım il toplamıyla
            tutmuyor; farklar birbirini götürür, Türkiye toplamı doğrudur.
          </li>
          <li><strong>Abonelik hane değildir:</strong> iş yeri abonelikleri de sayıya dahildir.</li>
          <li>
            <strong>Ölçüm olmayan ilçe-yıllar</strong> boş kalır (ör. eski ilçe merkezi Ilısu Barajı&apos;nın altında kalan
            Hasankeyf&apos;te 2020 sonrası).
          </li>
        </ul>
      </section>

      <section id="erisilebilirlik" className={styles.prose}>
        <h2>Erişilebilirlik ve klavye</h2>
        <ul>
          <li>Bütün kontroller Tab ile gezilebilir; dönem kaydırıcısı ok tuşlarıyla değişir.</li>
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
          <li>İl ve ilçe sınırları: OCHA COD-AB Türkiye, kaynağı Harita Genel Müdürlüğü, CC BY-IGO.</li>
          <li>İlçe adları: © OpenStreetMap katkıcıları (ODbL), geoBoundaries üzerinden (Runfola ve diğ., 2020).</li>
          <li>Altlık harita: OpenFreeMap, © OpenMapTiles, © OpenStreetMap katkıcıları.</li>
          <li>Sitenin kodu <a href="https://github.com/mertkara256/netatlas-tr">GitHub&apos;da</a> MIT lisansıyla açıktır.</li>
        </ul>
        <p className={styles.footnote}>NetAtlas TR; Ookla, BTK ya da OCHA ile bağlantılı değildir.</p>
      </section>
    </main>
  );
}
