# krc-v71.html — Şema & Mimari Envanteri

> Salt-okunur analiz. Katmanlı API mimarisine (Controller / Validator / Repository / DTO)
> yeniden yazım için şema tasarımı girdisi. Kod değiştirilmemiştir.
> Kaynak dosya: `krc-v71.html` (7200 satır). Satır numaraları yaklaşıktır.

## 0. Genel Bakış

Tüm veri, dizilerden oluşan global bir `DB` nesnesinde tutulur. Kalıcılık **anahtar-bazlı
değildir**: `persist(anahtar)` argümanını yok sayar ve `saveAll()` → `apiSet(DB)` ile **tüm
DB'yi** yazar. Yani aşağıdaki "persist anahtarı" sütunu yazarın niyetini gösterir, fiziksel
kapsamı değil.

Veri iki kaynaktan doğar:
- **Seed** — `<script id="seed-data">` içindeki kolonlu `{h:[başlıklar], r:[[satırlar]]}` blobu.
  `toRows()` (L686) bunu nesnelere çevirir, ardından boot'ta `map()` ile tipli kayıtlara dönüşür (L671–794).
- **Runtime** — CRUD modalleri ve `ensure*` tohumlama/migrasyon fonksiyonları.

Seed blobunda 14 tablo var; bunların bir kısmı DB anahtarına birebir, bir kısmı sabit listeye dönüşür:

| Seed anahtarı | Satır (r) | Hedef |
|---|---|---|
| parts | 383 | `DB.parts` |
| sites | 70 | `DB.sites` |
| updates | 334 | `DB.milestones` |
| audit | 561 | `DB.audits` |
| dimwork | 47 | `DB.dimwork` |
| routes | 161 | `DB.routes` |
| capacity | 148 | `DB.capacity` |
| kontrolPlani | 124 | `DB.kontrolPlani` |
| firstOffNoktalari | 148 | `DB.firstOffNoktalari` |
| saatlikNoktalari | 48 | `DB.saatlikNoktalari` |
| part_type | 9 | sabit liste (`typeList`, L1075) — DB'ye girmez |
| part_subtype | 6 | sabit liste (`subTypeList`, L1076) — DB'ye girmez |
| rejection_types | 4 | sabit `REJECT_TYPES` (L1636) — DB'ye girmez |
| trigo_re | 22 | sabit liste — DB'ye girmez |

Ayrıca seed'den bağımsız iki büyük gömülü sabit: `URUN_AGACI_SEED` (~90 kayıt → `urunAgaclari`),
`GOREVLER_SEED` (~44) + `GOREV_KISILER_SEED` (4).

---

## 1. DB Anahtarı Bazında Envanter

Her kayıtta `id: uid()` (string) bulunur; aşağıda ayrıca yazılmamıştır. `uid()` = `Date.now().toString(36) + Math.random().toString(36).slice(2,7)` (L668) — **zaman-tabanlı, global çakışma garantisi yok**.

Tip çıkarımı: `val()`/metin girişi → string, `parseFloat` → float, `parseInt` → int, tarih girişi / `toLocalISODate` → date, checkbox → bool, `type="time"` → string(time).

### 1.A Seed'den gelen anahtarlar

#### `sites` — 70 kayıt (L741)
Tümü string, tümü her kayıtta var (varsayılan `''`).
`supplier`, `trigoRE`, `sqe`, `sqeEmail`, `sqm`, `sqmEmail`, `country`, `city`, `siteCode`.
FK yok. `supplier` doğal anahtardır (parts/qfw buna referans verir).

#### `parts` — 383 kayıt (L746)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| partNumber | string | zorunlu (doğal anahtar) | — |
| partName | string | zorunlu | — |
| supplier | string | zorunlu | → `sites.supplier` |
| trigoRE | string | zorunlu | — |
| partType | string | zorunlu (init `''`) | → part_type sabiti |
| subType | string | zorunlu (init `''`) | → part_subtype sabiti |

#### `milestones` — 334 kayıt (seed anahtarı `updates`, L750)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| part | string | zorunlu | → `parts.partNumber` |
| seq | float (`parseFloat\|\|0`) | zorunlu | — |
| description | string | zorunlu | — |
| comp | string | zorunlu | — |
| sdatePlan / sdateAct / cdatePlan / cdateAct | date(string) | zorunlu | — |
| notes | string | zorunlu | — |

#### `audits` — 561 kayıt (seed anahtarı `audit`, L755)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| form | string (varsayılan `'TQS'`) | zorunlu | — |
| section | string | zorunlu | — |
| question | string | zorunlu | — |
| score | float\|null (`''`→null) | zorunlu | — |
| evidence | string | zorunlu | — |

Not: seed şemasında parça/tedarikçi bağlantısı yok (bağımsız denetim soru bankası).

#### `dimwork` — 47 kayıt (L759)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| partNumber | string | zorunlu | → `parts.partNumber` |
| inspectionPoint | string | zorunlu | — |
| drawing | string | zorunlu | — |
| charId | string | zorunlu | — |
| characteristic | string | zorunlu | — |
| nominal / upper / lower | float (ham `parseFloat`, **NaN olabilir**) | zorunlu | — |
| serial | string | zorunlu | — |
| value | float\|null (`''`→null) | zorunlu | — |

#### `routes` — 161 kayıt (L766)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| urun | string | zorunlu (doğal anahtar) | → `kodTanimlari.kod` / `urunAgaclari.kod` |
| urunAdi | string | zorunlu | — |
| operasyon | string | zorunlu | → `operasyonlarListesi.ad` |
| isMerkezi | string | zorunlu | → `isMerkezleri.ad` |
| sira | float (`parseFloat\|\|0`) | zorunlu | — |
| aktif | bool | zorunlu (grup başına biri true) | — |
| varyantEtiketi | string | opsiyonel (runtime `openVaryantModal`) | — |
| varyantSecenekleri | **array**(string) | opsiyonel | ayrı tablo adayı |

#### `capacity` — 148 kayıt (L770)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| urun | string | zorunlu | → `routes.urun` |
| isMerkezi | string | zorunlu | → `isMerkezleri.ad` |
| kapasite | float (`parseFloat\|\|0`) | zorunlu | — |
| dakika | float | opsiyonel (runtime `setCapacityDakika`) | — |

#### `kontrolPlani` — 124 kayıt (L782)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| urun | string | zorunlu | → `routes.urun` |
| sira | **string** (`String(...)`) | zorunlu | — |
| operasyon | string | zorunlu | → `operasyonlarListesi.ad` |
| isMerkezi | string | zorunlu | → `isMerkezleri.ad` |
| karakteristik | string | zorunlu | — |
| spesifikasyonRaw | string | zorunlu | — |
| tip | string (`'nitel'`) | zorunlu | — |
| altLimit / ustLimit / nominal | float\|null | zorunlu | — |
| birim, olcumYontemi, numuneAdedi, kontrolSikligi, kayitForm, aksiyon | string | zorunlu | — |

`kaliteOlcumleri` bu tabloya `kontrolPlaniId` ile referans verir.

#### `firstOffNoktalari` — 148 kayıt (L671)
`urun`(str), `operasyon`(str→operasyonlarListesi.ad), `no`(int/string), `karakteristik`(str),
`tip`(str `'nitel'`), `nominal`/`altLimit`/`ustLimit`(float\|null), `birim`(str). Tümü zorunlu.
`firstOffKayitlari.degerler` bunun `id`'sine anahtarlanır.

#### `saatlikNoktalari` — 48 kayıt (L678)
`urun`(str), `operasyon`(str), `olcumYeri`(str), `tip`(str), `nominal`/`altLimit`/`ustLimit`(float\|null),
`birim`(str). Tümü zorunlu. `saatlikKayitlari.degerler` bunun `id`'sine anahtarlanır. Runtime'da
`ensureGorselNoktalari` (L3266) ürün başına "Toplam Boy Uzunluğu" noktası ekler.

#### `qfw` — seed'de boş (L765), runtime `openQfwModal` (L2172)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| date | date(string) | zorunlu | — |
| supplier | string | zorunlu | → `sites.supplier` |
| partNumber | string | zorunlu | → `parts.partNumber` |
| location | string | zorunlu | — |
| qtyInspected | float\|null | zorunlu | — |
| description | string | zorunlu | — |
| rejections | **array**(object) | zorunlu | ayrı tablo adayı: `{qty:str, type:str→REJECT_TYPES, characteristic:str}` |

#### `kaliteOlcumleri` — seed'de boş, runtime `recordOlcum`/`recordOlcumNitel` (L2320–2338)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| orderId | string | zorunlu | → `orders.id` |
| kontrolPlaniId | string | zorunlu | → `kontrolPlani.id` |
| tarih | date | zorunlu | — |
| vardiya | string | zorunlu | — |
| deger | float\|null (nitelde null) | zorunlu | — |
| sonuc | string ('Uygun'/'Uygun Değil') | zorunlu | — |
| operator | string (isim metni, **id değil**) | zorunlu | — |
| not | string | zorunlu | — |

### 1.B Runtime'da oluşan anahtarlar

#### `workorders` — runtime (0 seed). Oluşturma: L4896 (modal), L5044 (`generateWorkOrdersForOrder`), L6859 (split)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| urun | string | zorunlu | → `routes.urun` |
| hedefMiktar | float | zorunlu | — |
| durum | string | zorunlu | — |
| orderId | string | opsiyonel (yalnızca rota/split kaynaklı) | → `orders.id` |
| sira | float | opsiyonel | → `routes.sira` |
| operasyon | string | opsiyonel | → `operasyonlarListesi.ad` |
| isMerkezi | string | opsiyonel | → `isMerkezleri.ad` |
| varyant | string\|null | opsiyonel | — |
| splitEtiket | string | opsiyonel (split) | — |
| baslangicTarihi / istenenTeslimTarihi / not | date/date/string | opsiyonel (yalnızca manuel modal) | — |

**Not:** manuel-modal ve rota-kaynaklı iş emirleri **ayrık alan setlerine** sahip (biri tarih/not,
diğeri orderId/sira/operasyon/isMerkezi/varyant tutuyor).

#### `production` — runtime. Oluşturma: L4938, L5856, L7147
| alan | tip | zorunlu | FK |
|---|---|---|---|
| workOrderId | string | zorunlu | → `workorders.id` |
| tarih | date | zorunlu | — |
| vardiya | string | zorunlu (**değer seti tutarsız**: `'1'/'2'/'3'` L4939 vs `'Sabah'/'Öğleden Sonra'/'Mesai'` L7157) | — |
| gercekAdet / fireAdet | float | zorunlu | — |
| hedefAdet | float\|null | zorunlu | — |
| not | string | zorunlu | — |
| operator | string | opsiyonel (L5856/L7148) | → `operatorler.id` |
| durusBaslangic / durusBitis | string(time) | opsiyonel | — |
| urun | string | opsiyonel (yalnızca L4958) | → `workorders.urun` |

#### `orders` — runtime. Oluşturma: L5356 (üretim), L5579 (satış)
| alan | tip | zorunlu | FK |
|---|---|---|---|
| orderNo | string | zorunlu (`nextOrderNo()`/`siparisNoUret()`; L5012'de geriye doldurulur) | — |
| kaynak | string ('uretim'/'satis') | zorunlu | — |
| urun | string | zorunlu | → `routes.urun` |
| hedefMiktar | float | zorunlu | — |
| durum | string | zorunlu | — |
| baslangicTarihi / istenenTeslimTarihi | date | zorunlu | — |
| not | string | zorunlu | — |
| musteri / satisSiparisNo | string | opsiyonel (satış) | — |

#### `gorevler` — ~44 seed (`GOREVLER_SEED`, L1617). Modal L1721
`sira`(int\|null), `gorevTanimi`(str), `departman`(str), `anaSorumlu`(str→gorevKisiler.isim),
`yardimci`(str→gorevKisiler.isim), `oncelik`(str), `termin`(date), `durum`(str),
`tamamlanmaYuzdesi`(float 0–1), `notlar`(str). Tümü zorunlu.

#### `gorevKisiler` — 4 seed (L1621). Modal L1906
`isim`(str, gorevler tarafından referans alınır), `eposta`(str), `telefon`(str). Tümü zorunlu.

#### `girisKaliteKontrolleri` — runtime. Modal L2891, kayıt L3168
| alan | tip | zorunlu | FK |
|---|---|---|---|
| satinalmaGirisIdleri | **array**(string) | zorunlu | → `satinalmaGirisleri.id` (ayrı tablo adayı) |
| tedarikci | string | zorunlu | — |
| malzeme | string | zorunlu | → `kodTanimlari.kod` |
| cizimNo, gozlemNedeni, ilaveBilgi, kontrolEden | string | zorunlu | — |
| malzemeGelisTarihi / kontrolTarihi | date | zorunlu | — |
| gelenAdet | float | zorunlu | — |
| ornekAdedi | int | zorunlu | — |
| karakteristikler | **array**(object) | zorunlu | ayrı tablo adayı (aşağıda) |
| genelSonuc | string ('Red'/'Kabul'/'') | zorunlu | — |

`karakteristikler[]` nesne şeması: `{no:int, tanim:str, olcu:str, tip:str('olcusel'/'nitel'),
nominal:float?, altLimit:float\|null, ustLimit:float\|null, birim:str?, degerler:array(float\|'Uygun'\|'Uygun Değil'\|null)}`.

#### `firstOffKayitlari` — runtime. Kayıt `kaydetFirstOff` L2559
`urun`(str→urunAgaclari.kod), `operasyon`(str→operasyonlarListesi.ad), `tarih`(date), `vardiya`(str),
`operator`(str isim), `isEmriNo`(str), `numuneAdedi`(**string, parse edilmez**), `kontrolSaati`(time),
`gerekce`(**array** str), `degerler`(**object**), `not`(str), `genelKarar`(str hesaplanan).
`degerler` = `firstOffNoktalari.id` → 6-elemanlı değer dizisi (ayrı tablo adayı).

#### `saatlikKayitlari` — runtime. Oluşturma `saatlikMetaGuncelle`/`saatlikDegerGuncelle` L2667/2678
`urun`(str), `operasyon`(str), `tarih`(date), `vardiya`(str), `saat`(str), `personel`(str),
`makina`(str), `uretimAdedi`(**string**), `degerler`(**object**: `saatlikNoktalari.id`→değer dizisi).

#### `makinePlani` — runtime. Oluşturma `planSecimGuncelle` L4011
`tarih`(date), `isMerkezi`(str→isMerkezleri.ad), `urun`(str→kodTanimlari.kod),
`workOrderId`(str\|null → workorders.id), `hedefMiktar`(float\|null), `not`(str). Tümü zorunlu.

#### `urunAgaclari` — ~90 seed (`URUN_AGACI_SEED`, L5915; **seed kendi id'sini taşır**). Modal L6096
| alan | tip | zorunlu | FK |
|---|---|---|---|
| parentId | string\|null | zorunlu | → `urunAgaclari.id` (**öz-referanslı ağaç**) |
| kod | string | zorunlu | → `kodTanimlari.kod` |
| aciklama | string | zorunlu | — |
| revNo | string | zorunlu | — |
| revTarihi | date | zorunlu | — |
| birimMiktar | float (varsayılan 1) | zorunlu | — |
| disCap, icCap, hammaddeUzunluk, hammaddeAgirlik, parcaBoyu | float\|null | zorunlu | — |
| kesimKaybi | float\|null (varsayılan 5) | zorunlu | — |
| tedarikciKesimUzunlugu | float\|null | zorunlu | — |

Gizli hata: L2914 `b.malzemeKodu`/`b.malzemeAciklama` okur ama şema `kod`/`aciklama` kullanır → boş render.

#### `isMerkezleri` — runtime (routes'tan otomatik doldurulur). `{id, ad}`
`ad`(str, benzersiz doğal anahtar; workorders/makinePlani/routes tarafından referans alınır).

#### `operasyonlarListesi` — runtime (routes'tan otomatik). `{id, ad}`
`ad`(str, benzersiz doğal anahtar).

#### `operatorler` — runtime. Modal L4341
`adSoyad`(str), `sicilNo`(str), `durum`(str 'Aktif'/'Pasif'), `yetkinOperasyonlar`(**array** str →
operasyonlarListesi.ad). `id`, `production.operator` tarafından referans alınır.

#### `calismaSaatleri` — tekil kayıt (index [0]). `ensureCalismaSaatleri` L5664 tohumlar (1 kayıt)
8 zaman-string alanı: `sabahBaslangic, sabahMolaBaslangic, sabahMolaBitis, sabahBitis,
ogledenSonraBaslangic, ogledenSonraMolaBaslangic, ogledenSonraMolaBitis, ogledenSonraBitis`.
**Tek-satır konfig tablosu** — dizi içinde tutulması yapısal uyumsuzluk.

#### `kodTanimlari` — runtime (routes+urunAgaclari'ndan otomatik `ensureKodTanimlariSeed`). Modal L6336
`kod`(str benzersiz), `ad`, `tip`('Hammadde'/'Yarı Mamül'/'Ürün'), `birim`, `durum`, `kategori`,
`cizimNo`, `revizyon`, `revizyonTarihi`(date), `not` (hepsi zorunlu str);
`tedarikciler`(str); `disCap, icCap, hammaddeUzunluk, hammaddeAgirlik, minStokSeviyesi, tedarikSuresi,
koliAdedi` (**float veya `''` — karışık tip**); `cikanOperasyon`(→operasyonlarListesi.ad),
`anaUrun`(→urunAgaclari.kod), `musteri`(str). Tip'e göre bazı alanlar anlamsız (sparse).

#### `terimCevirileri` — runtime. `{id, orijinal(str benzersiz), ceviri(str)}` (L6258/6270/6287)

#### `gizliTerimler` — runtime. **Kayıt nesnesi değil, düz string dizisi** (L6279).
Her eleman `terimCevirileri.orijinal` ile eşleşir.

### İç içe koleksiyon (ayrı tablo adayları) özeti
- `girisKaliteKontrolleri.karakteristikler[]` (+ içindeki `degerler[]`)
- `girisKaliteKontrolleri.satinalmaGirisIdleri[]`
- `firstOffKayitlari.degerler{}` , `firstOffKayitlari.gerekce[]`
- `saatlikKayitlari.degerler{}`
- `operatorler.yetkinOperasyonlar[]`
- `routes.varyantSecenekleri[]`
- `qfw.rejections[]`

### FK / referans grafiği (özet)
`orders.id ← workorders.orderId ← production.workOrderId` ; `makinePlani.workOrderId → workorders.id` ;
`kaliteOlcumleri.orderId → orders.id`, `kaliteOlcumleri.kontrolPlaniId → kontrolPlani.id` ;
`operatorler.id ← production.operator` ; `urunAgaclari.parentId → urunAgaclari.id` (öz-referans) ;
doğal ürün anahtarı `urun`/`kod` → routes/orders/workorders/production/kodTanimlari/urunAgaclari'nı bağlar ;
`isMerkezleri.ad` / `operasyonlarListesi.ad` serbest-metin olarak routes/capacity/workorders/noktalar'da tekrarlanır.

---

## 2. CRUD Fonksiyonlarının Ortak Deseni

Tipik modal-kaydet akışı: `openXModal()` → `openModal(başlık, html, async ()=>{ ... })`.
Callback içinde: `val('f-...')` ile oku → zorunlu alan kontrolü → `uid()` ile yeni kayıt / `Object.assign` ile güncelle → `await persist('anahtar')` → `showToast(...)` → `renderModule()` → `return true`.

- **`uid()` nerede:** yalnızca **yeni kayıt oluşturmada** (`push({id:uid(), ...})`). Güncelleme
  (`Object.assign(find(...), data)`) ve silme (`filter`) `uid()` çağırmaz. Seed map'lerinde her satır için `uid()`. `urunAgaclari` istisnadır — seed kendi id'sini taşır, `uid()` çağrılmaz.
- **Doğrulama:** modal callback'lerinin çoğunda **en az bir** `if(!x){ showToast(...); return false; }`
  guard'ı var (return false modalı açık tutar, persist'i engeller). Satır-içi hücre editörleri
  (`setDimValue`, `setAuditScore`, `setCapacityValue`, `saatlik*Guncelle` vb.) **doğrulamasızdır**.
- **`persist()` anahtarı:** fonksiyon hangi anahtarı yazıyorsa onunla çağrılır — ama fiziksel etkisi
  tüm DB'yi yazmaktır (bkz. Bölüm 0). Silme, generic `deleteRow(table, id, label)` (L1572) ile:
  confirm → `DB[table]=filter` → `persist(table)`.

### CRUD fonksiyon kataloğu (yazan her fonksiyon)

| fonksiyon | satır | yazdığı DB anahtar(lar)ı | uid()? | doğrulama? | persist anahtarı |
|---|---|---|---|---|---|
| deleteRow (generic) | 1572 | herhangi `DB[table]` | H | E (confirm) | table |
| openSiteModal (cb) | 1481 | sites | E | E (`!supplier`) | sites |
| openPartModal (cb) | 1554 | parts | E | E (`!partNumber`) | parts |
| openGorevModal (cb) | 1753 | gorevler | E | E (`!gorevTanimi`) | gorevler |
| openGorevKisiModal (cb) | 1914 | gorevKisiler | E | E (`!isim`) | gorevKisiler |
| setAuditScore | 1974 | audits (alan mut.) | H | **H** | audits |
| setDimValue | 2049 | dimwork (alan mut.) | H | **H** | dimwork |
| openDimModal (cb) | 2081 | dimwork | E | E | dimwork |
| openQfwModal (cb) | 2172 | qfw | E | E (`!supplier\|\|!partNumber`) | qfw |
| recordOlcum | 2324 | kaliteOlcumleri | E | E (isNaN) | kaliteOlcumleri |
| recordOlcumNitel | 2338 | kaliteOlcumleri | E | **H** | kaliteOlcumleri |
| kaydetFirstOff | 2565 | firstOffKayitlari | E | **H** | firstOffKayitlari |
| deleteFirstOff | 2574 | firstOffKayitlari (filter) | H | E (confirm) | firstOffKayitlari |
| saatlikMetaGuncelle | 2668 | saatlikKayitlari | E | **H** | saatlikKayitlari |
| saatlikDegerGuncelle | 2679 | saatlikKayitlari | E | **H** | saatlikKayitlari |
| ensureGorselNoktalari | 3274 | saatlikNoktalari | E | H (seed) | saatlikNoktalari (koşullu) |
| kaydetGirisKalite (cb) | 3177 | girisKaliteKontrolleri | E | E (`!malzeme`) | girisKaliteKontrolleri |
| deleteGirisKalite | 3186 | girisKaliteKontrolleri | H | E (confirm) | girisKaliteKontrolleri |
| openAltOperasyonModal (cb) | 3519 | routes, operasyonlarListesi, isMerkezleri, capacity | E | E | 4 anahtar |
| openIsMerkeziModal (cb) | 3776 | isMerkezleri | E | E (`!ad`+dup) | isMerkezleri |
| silIsMerkezi | 3785 | isMerkezleri (filter) | H | E (confirm) | isMerkezleri |
| openOperasyonKaydiModal (cb) | 3794 | operasyonlarListesi | E | E (`!ad`+dup) | operasyonlarListesi |
| silOperasyonKaydi | 3803 | operasyonlarListesi (filter) | H | E (confirm) | operasyonlarListesi |
| openVaryantModal (cb) | 3821 | routes (alan mut.) | H | E | routes |
| varyantKaldir | 3832 | routes (alan sil) | H | E (confirm) | routes |
| openRouteModal (cb) | 3868 | routes | E | E | routes |
| planGuncelle / planSecimGuncelle | 4011 | makinePlani | E | **H** | makinePlani |
| planHedefGuncelle | 4018 | makinePlani (alan mut.) | H | H (`!kayit` erken çıkış) | makinePlani |
| openOperatorModal (cb) | 4367 | operatorler | E | E (`!adSoyad`) | operatorler |
| setActiveWorkCenter | 4696 | routes (alan mut.) | H | **H** | routes |
| setCapacityDakika | 4712 | capacity | E | **H** | capacity |
| setCapacityValue | 4728 | capacity | E | **H** | capacity |
| openWorkOrderModal (cb) | 4923 | workorders | E | E | workorders |
| openProductionLogModal (cb) | 4965 | production | E | E (`!tarih`) | production |
| deleteProductionLog | 4975 | production (filter) | H | E (confirm) | production |
| openIsEmriAcModal (cb) | 5292 | workorders | E | E (varyantEksik) | workorders |
| openOrderModal (cb) | 5356 | orders (+workorders mut.) | E | E | orders, workorders |
| deleteOrderCascade | 5378 | production, workorders, orders (filter) | H | E (confirm) | 3 anahtar |
| openSatisSiparisiModal (cb) | 5575 | orders | E | E | orders |
| kaydetCalismaSaatleri | 5743 | calismaSaatleri | E | **H** | calismaSaatleri |
| kaydetUretimGirisi | 5851 | production | E | E (`!tarih`) | production |
| ensureUrunAgaclari | 5915 | urunAgaclari | H | H (seed) | YOK (çağıran persist eder) |
| temizleBozukKodTanimlari | 5922 | kodTanimlari (filter) | H | H | YOK (çağıran) |
| openUrunAgaciModal (cb) | 6140 | urunAgaclari (+kodTanimlari) | E | E (`!kod`) | urunAgaclari, kodTanimlari |
| uaDugumSil | 6159 | urunAgaclari (filter) | H | E (confirm) | urunAgaclari |
| ensureKodTanimlariSeed | 6179 | kodTanimlari | E | H (seed) | YOK (çağıran) |
| openKodTanimModal (cb) | 6385 | kodTanimlari | E | E (`!kod`+dup) | kodTanimlari |
| terimManuelEkle (cb) | 6258 | terimCevirileri, gizliTerimler | E | E (`!orijinal`) | 2 anahtar |
| terimOrijinalGuncelle | 6269 | terimCevirileri | E | E (erken çıkış) | terimCevirileri |
| terimSil | 6277 | terimCevirileri, gizliTerimler | H | E (confirm) | 2 anahtar |
| terimCeviriGuncelle | 6287 | terimCevirileri | E | **H** | terimCevirileri |
| openSatinalmaModal (cb) | 6520 | satinalmaIstekleri | E | E (`!malzeme\|\|!miktar`) | satinalmaIstekleri |
| openSatinalmaGirisModal (cb) | 6580 | satinalmaGirisleri | E | E (`miktar<=0`) | satinalmaGirisleri |
| deleteSatinalmaGiris | 6651 | satinalmaGirisleri (filter) | H | E (confirm) | satinalmaGirisleri |
| deleteSatinalmaIstek (cascade) | 6658 | satinalmaGirisleri, satinalmaIstekleri | H | E (confirm) | 2 anahtar |
| makineEkle (split, cb) | 6863 | workorders (push+mut.) | E | **H** | workorders |
| isEmirleriSil | 6873 | production, makinePlani, workorders | H | E (confirm) | 3 anahtar |
| mukerrerAdimlariBirlestir | 6909 | production, workorders | H | E (confirm) | workorders, production |
| eksikAdimlariEkle | 6936 | workorders | E | E (confirm) | workorders |
| handleImportFile | 867 | **tüm anahtarlar** (`DB[k]=incoming[k]`) | H | E (confirm+missing) | saveAll |

---

## 3. Transaction Adayları (tek işlemde birden fazla DB anahtarına yazan fonksiyonlar)

Bunlar atomik olmalı — ara noktada hata olursa DB tutarsız kalır (kısmi yazım riski).

| fonksiyon | satır | anahtarlar | işlem |
|---|---|---|---|
| openAltOperasyonModal | 3519 | routes + operasyonlarListesi + isMerkezleri + capacity | yeni alt-operasyon + referans listeleri + kapasite |
| openOrderModal | 5356 | orders + workorders | sipariş + üretilen iş emirleri |
| deleteOrderCascade | 5378 | orders + workorders + production | sipariş silme kaskadı |
| deleteSatinalmaIstek | 6658 | satinalmaIstekleri + satinalmaGirisleri | istek silme kaskadı |
| isEmirleriSil | 6873 | workorders + makinePlani + production | iş emri silme kaskadı |
| mukerrerAdimlariBirlestir | 6909 | workorders + production | mükerrer adım birleştirme |
| openUrunAgaciModal | 6140 | urunAgaclari + kodTanimlari | ağaç düğümü + kod tanımı tohumu |
| terimManuelEkle | 6258 | terimCevirileri + gizliTerimler | terim ekle + gizli listeden çıkar |
| terimSil | 6277 | terimCevirileri + gizliTerimler | terim sil + gizli listeye ekle |
| handleImportFile | 867 | tüm çekirdek + opsiyonel anahtarlar | tam yedek geri yükleme |
| tüm `ensure*` migrasyonları | Bölüm 4 | 2–6 anahtar | şema migrasyonu |

---

## 4. `ensure*` / Tohumlama Fonksiyonları

Boot sırasında (~L1264–1275) sırayla `if(ensureX()) await saveAll();` olarak çağrılırlar. Her biri
bir değişiklik-bayrağı döndürür; **kalıcılık çağıranın sorumluluğundadır** (fonksiyon içi save yok).

| fonksiyon | satır | yazdığı anahtar(lar) | ne üretir | kullanıcı verisini ezer mi? | idempotent? |
|---|---|---|---|---|---|
| ensureOrderNumbers | 5010 | orders, workorders | eksik `orderNo`/`woNo` doldurur | GUARD (`!o.orderNo`); ama satış dalı (5015) her boot'ta türetilen değerle **yeniden atar** — elle düzenlemeyi bozabilir | Evet |
| ensureUrunAgaclari | 5909 | urunAgaclari | boş veya "eski düz format" ise tüm ağacı `URUN_AGACI_SEED` ile değiştirir | **EVET** — eski format algılanınca `DB.urunAgaclari = [...]` koşulsuz clobber (L5915) | Evet (sonrasında parentId var, tekrar tetiklenmez) |
| ensureGorevSeed | 1614 | gorevler, gorevKisiler | görev + kişi listelerini tohumlar | GUARD (`length===0`) | Evet |
| temizleBozukKodTanimlari | 5920 | kodTanimlari | `kod` boş kayıtları atar | GUARD (sadece bozukları) | Evet |
| ensureKodTanimlariSeed | 6173 | kodTanimlari | her rota ürünü + ağaç düğümü için kod tanımı satırı | GUARD (kod başına `.some()`) | Evet |
| ensureCalismaSaatleri | 5662 | calismaSaatleri | varsayılan 1 vardiya-saatleri kaydı | GUARD (`length>0` ise çıkar) | Evet |
| ensureReferansListeleri | 3730 | isMerkezleri, operasyonlarListesi | routes+capacity'den referans listeleri | GUARD (her liste `length===0` iken; `DB.x=[...]` ama sadece boşta) | Evet |
| ensure208098ve226181FirstOff | 3699 | routes, operasyonlarListesi, firstOffNoktalari | 226181 "CNC Machining"i 3 operasyona böler; first-off ekler | GUARD (rota yerinde mutasyon; nokta push'ları `.some()`) | Evet |
| ensure226181CNC2Adima | 3680 | routes, capacity, operasyonlarListesi, firstOffNoktalari | eski "Op.3"ü kaldırır; Op.2 first-off setini **yeniden kurar** | **KISMEN EVET** — `DB.firstOffNoktalari=filter(...)` ile 226181 noktalarını siler ve seed'den re-push (L3693) → elle düzenlenen nominal/limitler kaybolur | Evet |
| ensure226181CNCTekIsimlendirme | 3624 | routes, capacity, operasyonlarListesi, firstOffNoktalari, firstOffKayitlari, saatlikKayitlari | tüm 226181 CNC rotalarını 2 kanonik isme indirger | **EVET** — `DB.routes=filter(...)` ile tüm CNC rotalarını atıp 2 satır re-push (L3636) → rota düzenlemeleri kaybolur | Evet (`zatenTemiz` guard 3626) |
| ensure221173DrillingGeriAl | 3597 | routes, operasyonlarListesi, firstOffNoktalari, workorders | hatalı "Drilling" adımının geri alımı; ilgili WO'ları iptal eder | **EVET** — 221173 Drilling kayıtlarını koşulsuz filtreler; WO durum'u üzerine yazılır | Evet (`.some()` guard 3599) |
| ensure221173PresleDelikDelmeFirstOff | 3587 | firstOffNoktalari | 221173 için "Presle Delik Delme" first-off noktaları | GUARD (nokta başına `.some()`) | Evet |
| ensure221170171172EksikAdimlar | 3561 | routes, operasyonlarListesi, isMerkezleri, workorders | 221170/171/172'ye 4 eksik adım ekler; Paketleme sira→9 | GUARD (adım varsa atlar) | Evet |
| ensureGorselNoktalari | 3266 | saatlikNoktalari | ürün başına "Toplam Boy Uzunluğu" noktası (+`fixKesimBoyuDegerleri`) | GUARD (`.some()`); kendi `persist`ini çağırır; **boot listesinde değil**, `viewGorselForm`'dan (L3291) | Evet |

**En yüksek clobber riski:** `ensureUrunAgaclari` (5915), `ensure226181CNCTekIsimlendirme` (3636),
`ensure226181CNC2Adima` (3693), `ensure221173DrillingGeriAl` (3600) — hepsi tetiklenince yıkıcı
`DB.x = [...]` / `filter` yeniden atama yapar.

---

## 5. Gözlemler (yorumsuz)

### 5.1 Tekrarlı kod blokları
| tekrarlanan mantık | fonksiyon / satır | tekrar |
|---|---|---|
| Aynı `saatlikKayitlari` kayıt-literali push'u | saatlikMetaGuncelle 2667; saatlikDegerGuncelle 2678 | 2 |
| Ölçüm değeri parse (`===''?null:parseFloat` / nitel) | kaydetFirstOff 2553; saatlikDegerGuncelle 2682 | 2 |
| Limit-literal parse (`r['X']===''?null:parseFloat`) | 674–676, 680–682, 725–726, 785–786 | 4 |
| `{h,r}→nesne` map (`toRows(...).map`) | 671,678,722,741,746,750,755,759,766,770,782 | 11 |
| WO/production kaskad-silme filtresi | deleteOrderCascade 5377; sipariş silme 6872 | 2 |
| `res.json().catch(()=>({}))` + NO_SESSION yönetimi | doLogin 542; apiGet 616; apiSet 648 | 3 |
| Ağ-hata sınıflandırma (`TypeError`/regex) | doLogin 549; apiGet 631 | 2 |
| localStorage Set geri-yükleme (grup açık) | navGrupAcikMi 1071; uplanGrupAcikMi 3976; satisRaporAcikMi 5502 | 3 |
| `production.filter(workOrderId).sort` log toplama | 4143, 4749, 5079 (+varyantlar) | 3+ |
| WO istatistik `reduce(+parseFloat(gercekAdet))` | 1288, 4209, 4221, 4393 | 4+ |
| Rota `sira` gruplama | generateWorkOrdersForOrder 5031; routeSiraGruplari 5066 | 2 |

### 5.2 DB'ye yazıp `persist()` çağırmayan fonksiyonlar (veri kaybı riski)
Tümü değişiklik-bayrağı döndürüp **çağırana** güvenir; çağıran yol atlanırsa yazım reload'da kaybolur.
`ensureUrunAgaclari` (5915), `temizleBozukKodTanimlari` (5922), `ensureKodTanimlariSeed` (6179),
`ensureGorevSeed` (1614), `ensureCalismaSaatleri` (5662), `ensureReferansListeleri` (3730/3736),
`ensure208098ve226181FirstOff` (3699), `ensure226181CNC2Adima` (3680), `ensure226181CNCTekIsimlendirme` (3624),
`ensure221173DrillingGeriAl` (3597), `ensure221173PresleDelikDelmeFirstOff` (3587),
`ensure221170171172EksikAdimlar` (3561). (Etkileşimli/modal callback'lerin hepsi persist eder — bu risk yalnızca seed/migrasyon yardımcılarındadır.)

### 5.3 Aynı veriyi iki farklı DB anahtarında tutan yerler (tutarsızlık riski)
| değer | anahtarlar | nasıl ayrışır |
|---|---|---|
| İş merkezi adı | routes/capacity/workorders.isMerkezi (serbest metin) + isMerkezleri[].ad | rename bir tarafı günceller, diğeri drift eder; ensureReferansListeleri sadece boşta doldurur |
| Operasyon adı | routes/capacity/workorders/firstOffNoktalari/saatlikNoktalari/*Kayitlari.operasyon + operasyonlarListesi[].ad | rename her tabloya elle yayılmalı (CNC-kanonikleştirme ensure'ları bu yüzden var) |
| Ürün kodu + adı (urun/urunAdi) | routes, orders, workorders, production, kodTanimlari, urunAgaclari | `urunAdi` her kayda kopyalanır; birinde düzenleme diğerlerini güncellemez |
| hedefMiktar | orders → workorders → makinePlani → production.hedefAdet | sipariş hedefi WO/plan sonrası değişirse alt kayıtlarda bayat kopya |
| Ölçüm noktası tanımı (nominal/limit) | firstOffNoktalari/saatlikNoktalari vs gömülü seed sabitleri (YENI_CNC_OP2_BIRLESIK vb.) | ensure* re-fire ederse kullanıcı düzenlemesi sessizce sabite geri döner |
| Rota sira (adım sırası) | routes.sira + workorders.sira | ensure'lar ikisini de bump etmezse ayrışır |

### 5.4 Hata yakalama olmadan `fetch`/`JSON.parse`/`.json()`/`.text()`
Tüm `fetch`/`.json()`/`.text()` çağrıları try/catch veya `.catch()` ile korunmuştur. Korumasız iki parse:
| çağrı | satır | context |
|---|---|---|
| `JSON.parse(getElementById('seed-data').textContent)` | 476 | Top-level SEED init — bozuk seed'de throw, uygulama açılmaz |
| `JSON.parse(cacheStr)` | 3022 | `girisKaliteGuncelKarakteristikler` — DOM `data-cache` attribute, guard yok |

### 5.5 Kullanıcı girdisini doğrulamadan DB'ye yazan fonksiyonlar
(Satır-içi hücre editörleri ve bazı otomatik güncellemeler; hiçbir zorunlu-alan/tip/aralık guard'ı yok.)
`setAuditScore` (1974), `setDimValue` (2049, NaN reddedilmez), `recordOlcumNitel` (2331),
`planGuncelle` (3993), `planHedefGuncelle` (4015), `setActiveWorkCenter` (4695),
`setCapacityDakika` (4701), `setCapacityValue` (4722), `kaydetCalismaSaatleri` (5738, başla<bitiş kontrolü yok),
`kaydetFirstOff` (2544, zorunlu alan kontrolü yok), `saatlikMetaGuncelle` (2663, alan whitelist'i yok),
`saatlikDegerGuncelle` (2673, NaN reddedilmez), `terimCeviriGuncelle` (6285),
`makineEkle` (6850). (Zorunlu-alan guard'ı olan tüm modal callback'leri bu listede değildir.)
