// i18n.js — TR/EN çeviri altyapısı. { tr, en } sözlüğü + t() + dil yönetimi + olay.
//
// Sözlük kaynağı: docs/ceviri-sozlugu.md (müşteri Mosdorfer'in kendi Excel terimleri;
// sipariş/malzeme alanları BİREBİR). Anahtarlar semantik (namespace.key).
//
// CANLI DEĞİŞİM: setLang() veriyi YENİDEN ÇEKMEZ; yalnızca 'langchange' olayını yayar.
// Bileşenler (table.js, drawer.js, index.html…) bu olaya abone olup sadece ETİKETLERİ
// yeniden çizer — sayfa/arama/filtre ve açık drawer'daki değerler KORUNUR.

const DICT = {
  tr: {
    // — menü grupları —
    'group.general': 'Genel', 'group.supplierQuality': 'Tedarikçi & Kalite',
    'group.production': 'Üretim', 'group.purchasingStock': 'Satınalma & Stok',
    'group.sales': 'Satış', 'group.definitions': 'Tanımlar', 'group.admin': 'Yönetim',
    // — menü —
    'menu.dashboard': 'Genel Bakış', 'menu.incoming-inspections': 'Giriş Kalite Kontrolleri',
    'menu.first-off-points': 'First-Off Noktaları', 'menu.first-off-records': 'First-Off Kayıtları',
    'menu.hourly-points': 'Saatlik Noktalar', 'menu.hourly-records': 'Saatlik Kayıtlar',
    'menu.work-centers': 'İş Merkezleri', 'menu.operations': 'Operasyonlar',
    'menu.operators': 'Operatörler', 'menu.routes': 'Rotalar', 'menu.capacities': 'Kapasiteler',
    'menu.machine-plans': 'Üretim Planı', 'menu.work-orders': 'İş Emirleri',
    'menu.production': 'Üretim Girişi', 'menu.product-trees': 'Ürün Ağaçları',
    'menu.purchase-requests': 'Satınalma İstekleri', 'menu.purchase-receipts': 'Satınalma Girişleri',
    'menu.orders': 'Siparişler', 'menu.sales': 'Satış Raporları',
    'menu.product-codes': 'Kod Tanımları', 'menu.task-people': 'Görev Kişileri',
    'menu.terms': 'Terimler', 'menu.working-hours': 'Çalışma Saatleri',
    'menu.tasks': 'Görevler', 'menu.audits': 'Denetim Soruları', 'menu.users': 'Kullanıcı Yönetimi',
    // — ortak eylemler —
    'action.new': 'Yeni', 'action.edit': 'Düzenle', 'action.delete': 'Sil', 'action.save': 'Kaydet',
    'action.update': 'Güncelle', 'action.add': 'Ekle', 'action.cancel': 'Vazgeç', 'action.close': 'Kapat',
    'action.search': 'Ara…', 'action.filter': 'Filtrele', 'action.clear': 'Temizle',
    'action.select': 'Seçiniz', 'action.prev': '‹ Önceki', 'action.next': 'Sonraki ›',
    'action.signout': 'Çıkış', 'action.signin': 'Giriş Yap', 'action.retry': 'Tekrar dene',
    'action.saving': 'Kaydediliyor…', 'action.confirm': 'Onayla',
    // — ortak —
    'common.yes': 'Evet', 'common.no': 'Hayır', 'common.active': 'Aktif', 'common.inactive': 'Pasif',
    'common.loading': 'Yükleniyor…', 'common.noRecords': 'Kayıt yok', 'common.noResults': 'Sonuç yok',
    'common.emptyHint': 'Henüz kayıt eklenmemiş.', 'common.notSelected': 'seçilmedi',
    'common.noResultsFor': '"{q}" ile eşleşen kayıt yok.',
    'common.readonlyHint': 'Salt okuma yetkiniz var — değişiklik yapamazsınız',
    'common.dash': '—',
    'common.hidePassword': 'Şifreyi Gizle', 'common.showPassword': 'Şifreyi Göster',
    'action.hide': 'Gizle', 'action.show': 'Göster',
    'fk.select': 'Seçin…', 'fk.warn': '{total} kayıttan ilk {shown} gösteriliyor — aramayı daraltın.',
    'tag.placeholder': 'Yaz ve Enter…',
    // — sipariş durumları (Excel) —
    'status.Hammadde Bekleniyor': 'Hammadde Bekleniyor', 'status.Üretimde': 'Üretimde',
    'status.Kalite Kontrolde': 'Kalite Kontrolde', 'status.Sevke Hazır': 'Sevke Hazır',
    'status.Kısmi Sevk': 'Kısmi Sevk', 'status.Sevk Edildi': 'Sevk Edildi',
    'status.İade': 'İade', 'status.Tamamlandı': 'Tamamlandı', 'status.İptal': 'İptal',
    // — hata / bildirim —
    'err.SESSION_EXPIRED': 'Oturum süresi doldu — lütfen tekrar giriş yapın',
    'err.NO_SESSION': 'Oturum bulunamadı — lütfen giriş yapın',
    'err.NO_USER': 'Oturum geçerli değil — lütfen tekrar giriş yapın',
    'err.READ_ONLY': 'Bu işlem için yetkiniz yok',
    'err.STALE': 'Bu kayıt başkası tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.',
    'err.IN_USE': 'Bu kayıt başka yerlerde kullanıldığı için silinemez. Önce bağlı kayıtları kaldırın.',
    'err.VALIDATION': 'Geçersiz değer — girdileri kontrol edin',
    'err.REQUIRED': 'Zorunlu alan',
    'err.NETWORK': 'Sunucuya ulaşılamadı — bağlantınızı kontrol edin',
    'err.GENERIC': 'Bir hata oluştu',
    'toast.saved': 'Kaydedildi', 'toast.deleted': 'Silindi',
    'confirm.deleteTitle': 'Silmek istediğinize emin misiniz?', 'confirm.title': 'Emin misiniz?',
    'state.error': 'Hata', 'state.conflict': 'Çakışma',
    'state.conflictMsg': 'Bu kayıt siz açtıktan sonra başkası tarafından değiştirildi.',
    'state.moduleError': 'Modül yüklenemedi',
    'action.showDiff': 'Farkı göster', 'action.reload': 'Yeniden yükle',
    'table.range': '{start}–{end} / {total}', 'table.page': '{page} / {pages}',
    'drawer.unsavedTitle': 'Kaydedilmemiş değişiklikler',
    'drawer.unsavedBody': 'Bu panelde kaydedilmemiş değişiklikler var. Ne yapmak istersiniz?',
    'drawer.discard': 'Kaydetme',
    // — alan etiketleri (ortak) —
    'field.material': 'Malzeme', 'field.quantity': 'Miktar', 'field.unit': 'Birim',
    'field.supplier': 'Tedarikçi', 'field.requestDate': 'İstek Tarihi',
    'field.expectedDate': 'Beklenen Tarih', 'field.date': 'Tarih', 'field.note': 'Not',
    'action.newRequest': 'Yeni İstek',
    // — Satınalma İstekleri —
    'pr.subtitle': 'Üretim için gereken malzemenin tedarik talebi',
    'pr.empty': 'Henüz istek yok. "Yeni İstek" ile başlayın.',
    'pr.noMaterialCount': '{n} kayıtta malzeme seçilmemiş',
    'pr.noReceipts': 'Henüz giriş yapılmadı.',
    'pr.newTitle': 'Yeni İstek', 'pr.editTitle': 'İstek Düzenle',
    'pr.materialHelp': 'Malzeme kod listesinden seçilir; serbest metin girilmez.',
    'pr.productFor': 'Ürün (hangi ürün için)', 'pr.linkedOrder': 'Bağlı Sipariş',
    'pr.selectMaterial': 'Malzeme seçin…', 'pr.selectProduct': 'Ürün seçin…',
    'pr.selectOrderOpt': 'Sipariş (opsiyonel)…',
    'pr.deleteTitle': 'İstek silinsin mi?', 'pr.deleteBody': '{name} isteği silinecek.',
    // — ortak alan ekleri + Parti A (İş Merkezleri / Operasyonlar / Terimler) —
    'field.name': 'Ad', 'field.status': 'Durum', 'field.original': 'Orijinal',
    'field.translation': 'Çeviri', 'field.hidden': 'Gizli',
    'common.deleteBody': '"{name}" kalıcı olarak silinecek.',
    'wc.new': 'Yeni İş Merkezi', 'wc.empty': 'Henüz iş merkezi eklenmemiş. "Yeni İş Merkezi" ile başlayın.',
    'wc.newTitle': 'Yeni İş Merkezi', 'wc.editTitle': 'İş Merkezi Düzenle', 'wc.deleteTitle': 'İş merkezi silinsin mi?',
    'op.new': 'Yeni Operasyon', 'op.empty': 'Henüz operasyon eklenmemiş. "Yeni Operasyon" ile başlayın.',
    'op.newTitle': 'Yeni Operasyon', 'op.editTitle': 'Operasyon Düzenle', 'op.deleteTitle': 'Operasyon silinsin mi?',
    'tm.subtitle': 'Arayüz terimlerinin İngilizce karşılıkları · gizli terimler EN görünümünde yazılmaz',
    'tm.new': 'Yeni Terim', 'tm.empty': 'Henüz terim eklenmemiş. "Yeni Terim" ile başlayın.',
    'tm.newTitle': 'Yeni Terim', 'tm.editTitle': 'Terim Düzenle', 'tm.deleteTitle': 'Terim silinsin mi?',
    'tm.hiddenTag': 'Gizli',
    // — Parti B: Siparişler + İş Emirleri —
    'field.orderNo': 'Sipariş No', 'field.product': 'Ürün / Parça', 'field.dueDate': 'Termin',
    'field.source': 'Kaynak', 'field.targetQuantity': 'Hedef Miktar', 'field.customer': 'Müşteri',
    'field.workOrderNo': 'İş Emri', 'field.operation': 'Operasyon', 'field.workCenter': 'İş Merkezi',
    'field.producedTarget': 'Üretilen / Hedef', 'field.progress': 'İlerleme', 'field.sequence': 'Sıra',
    'field.shift': 'Vardiya', 'field.actualQuantity': 'Gerçek Adet', 'field.scrap': 'Fire',
    'field.startDate': 'Başlangıç Tarihi', 'field.requestedShipDate': 'İstenen Teslim (Termin)',
    'field.salesOrderNo': 'Satış Sipariş No', 'field.splitLabel': 'Split Etiketi',
    'status.Aktif': 'Aktif',
    'src.select': '— Kaynak seçin —', 'src.satis': 'Satış', 'src.uretim': 'Üretim', 'src.stok': 'Stok',
    'shift.Sabah': 'Sabah', 'shift.Aksam': 'Akşam', 'shift.Gece': 'Gece',
    'ord.title': 'Üretim Siparişleri',
    'ord.subtitle': 'Satış siparişinden ya da stok tamamlamadan açılan üretim talepleri',
    'ord.new': 'Yeni Sipariş', 'ord.empty': 'Henüz sipariş yok. "Yeni Sipariş" ile başlayın.',
    'ord.newTitle': 'Yeni Sipariş', 'ord.editTitle': 'Sipariş Düzenle',
    'ord.secOrder': 'Sipariş', 'ord.secDates': 'Tarihler & Müşteri', 'ord.selectProduct': 'Ürün seçin…',
    'ord.noWorkOrders': 'Bağlı iş emri yok.', 'ord.deleteTitle': 'Sipariş silinsin mi?',
    'ord.deleteBody': '"{no}" ve BAĞLI iş emirleri + üretim kayıtları silinecek.',
    'wo.subtitle': 'Üretim siparişinin rotadaki her operasyonu için bir iş emri açılır',
    'wo.new': 'İş Emri Aç', 'wo.empty': 'Henüz iş emri yok. "İş Emri Aç" ile başlayın.',
    'wo.newTitle': 'İş Emri Aç', 'wo.editTitle': 'İş Emri Düzenle', 'wo.open': 'Aç',
    'wo.selectOrder': 'Sipariş seçin…', 'wo.selectProduct': 'Ürün seçin…',
    'wo.selectOperation': 'Operasyon seçin…', 'wo.selectCenter': 'İş merkezi seçin…',
    'wo.noProduction': 'Üretim kaydı yok.', 'wo.deleteTitle': 'İş emri silinsin mi?',
    'wo.deleteBody': '"{no}" ve BAĞLI üretim kayıtları silinecek.',
    // — Parti C: Üretim Girişi + Ürün Ağaçları —
    'field.description': 'Açıklama', 'field.type': 'Tip', 'field.unitQuantity': 'Birim Miktar',
    'field.outerDiameter': 'Dış Çap', 'field.innerDiameter': 'İç Çap',
    'field.materialLength': 'Malzeme Uzunluğu', 'field.materialWeight': 'Malzeme Ağırlığı',
    'field.revision': 'Revizyon', 'field.revisionDate': 'Revizyon Tarihi', 'field.parentNode': 'Üst Düğüm',
    'shift.Öğleden Sonra': 'Öğleden Sonra', 'shift.Mesai': 'Mesai',
    'prod.subtitle': 'Vardiya sonunda iş emri başına üretilen ve fire adedi girilir',
    'prod.newEntry': 'Yeni Giriş', 'prod.today': 'Bugünkü Girişler', 'prod.count': '{n} kayıt',
    'prod.noToday': 'Bugün henüz giriş yok.', 'prod.needEdit': 'Giriş için düzenleme yetkisi gerekiyor.',
    'prod.selectWo': 'İş emri seçin…', 'prod.selectOp': 'Operatör seçin…',
    'prod.remaining': 'Kalan hedef: {n} adet', 'prod.woField': 'İş emri', 'prod.operatorField': 'Operatör',
    'prod.actualField': 'Üretilen adet', 'prod.scrapField': 'Fire adet',
    'prod.saveNew': 'Kaydet ve yeni', 'prod.savedToast': 'Giriş kaydedildi · {n} adet · {s} fire',
    'prod.colTime': 'Saat',
    'tree.subtitle': 'Bir düğüm başka bir düğümün altında durur · miktarlar üst düğümün bir adedi içindir',
    'tree.collapseAll': 'Tümünü daralt', 'tree.new': 'Yeni Düğüm',
    'tree.search': 'Ürün kodu veya açıklama ara…', 'tree.colNode': 'Düğüm',
    'tree.noMatch': 'Eşleşen düğüm yok.', 'tree.empty': 'Henüz ağaç düğümü yok.',
    'tree.addChild': 'Alt Ekle', 'tree.selectProduct': 'Ürün seçin…', 'tree.selectMaterial': 'Hammadde seçin…',
    'tree.selectParent': 'Üst düğüm seçin…', 'tree.editTitle': 'Düğüm Düzenle',
    'tree.addChildTitle': 'Alt Düğüm Ekle', 'tree.newTitle': 'Yeni Düğüm',
    'tree.secId': 'Kimlik', 'tree.secMat': 'Malzeme', 'tree.secMeasures': 'Ölçüler', 'tree.secRev': 'Revizyon',
    'tree.parentHelp': 'Boş bırakılırsa kök düğüm.', 'tree.materialField': 'Malzeme (Hammadde)',
    'tree.materialDesc': 'Malzeme Açıklaması', 'tree.partLength': 'Parça Boyu', 'tree.cutLoss': 'Kesim Kaybı',
    'tree.supplierCutLength': 'Tedarikçi Kesim Uzunluğu', 'tree.deleteTitle': 'Düğüm silinsin mi?',
    'tree.deleteBody': '"{name}" ve ALT düğümleri kalıcı olarak silinecek.',
    // — Parti D: Kalite (Giriş Kontrol / First-Off Nokta & Kayıt) + paylaşılan —
    'field.productShort': 'Ürün', 'field.no': 'No', 'field.characteristic': 'Karakteristik',
    'field.nominal': 'Nominal', 'field.lowerLimit': 'Alt Limit', 'field.upperLimit': 'Üst Limit',
    'field.pointNo': 'Nokta No', 'field.result': 'Sonuç', 'field.decision': 'Karar',
    'field.value': 'Değer', 'field.point': 'Nokta', 'field.measurement': 'Ölçüm',
    'qc.olcusel': 'Ölçüsel', 'qc.nitel': 'Nitel', 'qc.selectType': '— Tip —',
    'qc.unitPlaceholder': '— Birim —', 'qc.selectResult': '— Sonuç —',
    'qc.Kabul': 'Kabul', 'qc.Red': 'Red', 'qc.Şartlı Kabul': 'Şartlı Kabul',
    'meas.empty': 'Ölçüm kaydı yok.', 'meas.out': '{n} dışarıda', 'meas.in': 'Tolerans içinde',
    'reason.Yeni iş emri / seri başlangıcı': 'Yeni iş emri / seri başlangıcı',
    'reason.Setup / kurulum sonrası': 'Setup / kurulum sonrası',
    'reason.Vardiya değişimi': 'Vardiya değişimi',
    'reason.Uzun duruş sonrası': 'Uzun duruş sonrası',
    'reason.Ayar / parametre değişimi': 'Ayar / parametre değişimi',
    'reason.Malzeme / lot değişimi': 'Malzeme / lot değişimi',
    'reason.Düzeltici faaliyet sonrası': 'Düzeltici faaliyet sonrası',
    // First-Off Noktaları
    'fp.subtitle': 'İlk parça kontrolünde ölçülecek noktalar',
    'fp.new': 'Yeni Nokta', 'fp.empty': 'Henüz nokta yok. "Yeni Nokta" ile başlayın.',
    'fp.newTitle': 'Yeni Nokta', 'fp.editTitle': 'Nokta Düzenle',
    'fp.deleteTitle': 'Nokta silinsin mi?', 'fp.deleteBody': '"{name}" noktası silinecek.',
    'fp.added': 'Nokta eklendi', 'fp.updated': 'Nokta güncellendi', 'fp.deleted': 'Nokta silindi',
    // First-Off Kayıtları
    'fr.subtitle': 'İlk parça kontrol kayıtları — ölçümler ve gerekçeler',
    'fr.new': 'Yeni Kayıt', 'fr.empty': 'Henüz kayıt yok. "Yeni Kayıt" ile başlayın.',
    'fr.newTitle': 'Yeni Kayıt', 'fr.editTitle': 'Kayıt Düzenle',
    'fr.secRecord': 'Kayıt', 'fr.secMeas': 'Ölçümler', 'fr.secReasons': 'Gerekçeler',
    'fr.operatorName': 'Operatör (isim)', 'fr.woNo': 'İş Emri No', 'fr.sampleCount': 'Numune Adedi',
    'fr.checkTime': 'Kontrol Saati', 'fr.overallResult': 'Genel Karar',
    'fr.reasonsHelp': 'Resmi formdaki gerekçeleri işaretleyin; listede yoksa serbest metin ekleyin.',
    'fr.addMeas': '+ Ölçüm ekle', 'fr.noMeas': 'Ölçüm eklenmedi.', 'fr.selectPoint': 'Nokta…',
    'fr.reasonCustom': 'Listede yok — gerekçe yaz…',
    'fr.added': 'Kayıt eklendi', 'fr.updated': 'Kayıt güncellendi', 'fr.deleted': 'Kayıt silindi',
    'fr.deleteTitle': 'Kayıt silinsin mi?', 'fr.deleteBody': 'Bu first-off kaydı ve ölçümleri silinecek.',
    // Giriş Kalite Kontrolleri
    'ii.subtitle': 'Gelen malzeme kontrolü — karakteristikler ve ölçüm değerleri',
    'ii.new': 'Yeni Kontrol', 'ii.empty': 'Henüz kontrol yok. "Yeni Kontrol" ile başlayın.',
    'ii.newTitle': 'Yeni Kontrol', 'ii.editTitle': 'Kontrol Düzenle',
    'ii.secControl': 'Kontrol', 'ii.secDateQty': 'Tarih & Adet', 'ii.secChars': 'Karakteristikler',
    'ii.purchaseReceipt': 'Satınalma Girişi', 'ii.drawingNo': 'Çizim No', 'ii.reason': 'Gözlem Nedeni',
    'ii.arrivalDate': 'Malzeme Geliş Tarihi', 'ii.inspectionDate': 'Kontrol Tarihi',
    'ii.receivedQty': 'Gelen Adet', 'ii.sampleQty': 'Örnek Adedi', 'ii.inspectorName': 'Kontrol Eden',
    'ii.overallResult': 'Genel Sonuç', 'ii.selectReceipt': 'Satınalma girişi (opsiyonel)…',
    'ii.addChar': '+ Karakteristik ekle', 'ii.noChar': 'Karakteristik eklenmedi.',
    'ii.spec': 'Spesifikasyon', 'ii.values': 'Değerler', 'ii.valuePlaceholder': 'Değer (sayı ya da Uygun)…',
    'ii.added': 'Kontrol eklendi', 'ii.updated': 'Kontrol güncellendi', 'ii.deleted': 'Kontrol silindi',
    'ii.deleteTitle': 'Kontrol silinsin mi?', 'ii.deleteBody': 'Bu giriş kontrolü, karakteristikleri ve değerleri silinecek.',
    // — Parti E: Saatlik Noktalar + Kayıtlar (nokta/kayıt metinleri fp.*/fr.* ile paylaşılır) —
    'field.measureLocation': 'Ölçüm Yeri', 'field.hour': 'Saat', 'field.personnel': 'Personel',
    'hp.title': 'Saatlik Kontrol Noktaları', 'hp.subtitle': 'Saatlik kontrolde ölçülecek noktalar',
    'hr.subtitle': 'Saatlik kontrol kayıtları — nokta başına ölçüm dizisi',
    'hr.deleteBody': 'Bu saatlik kayıt ve ölçümleri silinecek.',
    'hr.machine': 'Makina', 'hr.productionCount': 'Üretim Adedi',
    'hr.valuesSeq': 'Değerler (sırayla)', 'hr.addPoint': '+ Nokta ekle', 'hr.noPoint': 'Nokta eklenmedi.',
    'hr.valuePlaceholder': 'Değer yaz ve Enter…',
    // — çocuk-detay (paylaşılan _childDetail.js) varsayılan boş metinleri —
    'cd.noLinked': 'Bağlı kayıt yok.', 'cd.noExtra': 'Ek bilgi yok.', 'cd.noRecords': 'Kayıt yok.',
  },
  en: {
    // — menu groups —
    'group.general': 'General', 'group.supplierQuality': 'Supplier & Quality',
    'group.production': 'Production', 'group.purchasingStock': 'Purchasing & Stock',
    'group.sales': 'Sales', 'group.definitions': 'Definitions', 'group.admin': 'Administration',
    // — menu —
    'menu.dashboard': 'Dashboard', 'menu.incoming-inspections': 'Incoming Inspections',
    'menu.first-off-points': 'First-Off Points', 'menu.first-off-records': 'First-Off Records',
    'menu.hourly-points': 'Hourly Points', 'menu.hourly-records': 'Hourly Records',
    'menu.work-centers': 'Work Centers', 'menu.operations': 'Operations',
    'menu.operators': 'Operators', 'menu.routes': 'Routes', 'menu.capacities': 'Capacities',
    'menu.machine-plans': 'Production Plan', 'menu.work-orders': 'Work Orders',
    'menu.production': 'Production Entry', 'menu.product-trees': 'Product Trees',
    'menu.purchase-requests': 'Purchase Requests', 'menu.purchase-receipts': 'Purchase Receipts',
    'menu.orders': 'Orders', 'menu.sales': 'Sales Reports',
    'menu.product-codes': 'Material Codes', 'menu.task-people': 'Task Assignees',
    'menu.terms': 'Terms', 'menu.working-hours': 'Working Hours',
    'menu.tasks': 'Tasks', 'menu.audits': 'Audit Questions', 'menu.users': 'Users',
    // — common actions —
    'action.new': 'New', 'action.edit': 'Edit', 'action.delete': 'Delete', 'action.save': 'Save',
    'action.update': 'Update', 'action.add': 'Add', 'action.cancel': 'Cancel', 'action.close': 'Close',
    'action.search': 'Search…', 'action.filter': 'Filter', 'action.clear': 'Clear',
    'action.select': 'Select', 'action.prev': '‹ Previous', 'action.next': 'Next ›',
    'action.signout': 'Sign out', 'action.signin': 'Sign in', 'action.retry': 'Try again',
    'action.saving': 'Saving…', 'action.confirm': 'Confirm',
    // — common —
    'common.yes': 'Yes', 'common.no': 'No', 'common.active': 'Active', 'common.inactive': 'Inactive',
    'common.loading': 'Loading…', 'common.noRecords': 'No records found', 'common.noResults': 'No results',
    'common.emptyHint': 'No records yet.', 'common.notSelected': 'Not selected',
    'common.noResultsFor': 'No records match "{q}".',
    'common.readonlyHint': 'You have read-only access — changes are disabled',
    'common.dash': '—',
    'common.hidePassword': 'Hide password', 'common.showPassword': 'Show password',
    'action.hide': 'Hide', 'action.show': 'Show',
    'fk.select': 'Select…', 'fk.warn': 'Showing first {shown} of {total} — narrow your search.',
    'tag.placeholder': 'Type and Enter…',
    // — order statuses (Excel) —
    'status.Hammadde Bekleniyor': 'Awaiting Raw Material', 'status.Üretimde': 'In Production',
    'status.Kalite Kontrolde': 'In Quality Control', 'status.Sevke Hazır': 'Ready to Ship',
    'status.Kısmi Sevk': 'Partially Shipped', 'status.Sevk Edildi': 'Shipped',
    'status.İade': 'Returned', 'status.Tamamlandı': 'Completed', 'status.İptal': 'Cancelled',
    // — error / notification —
    'err.SESSION_EXPIRED': 'Session expired — please sign in again',
    'err.NO_SESSION': 'No session — please sign in',
    'err.NO_USER': 'Session is no longer valid — please sign in again',
    'err.READ_ONLY': 'You are not authorized for this action',
    'err.STALE': 'This record was modified by someone else. Refresh the page and try again.',
    'err.IN_USE': 'This record is in use elsewhere and cannot be deleted. Remove the linked records first.',
    'err.VALIDATION': 'Invalid value — please check your input',
    'err.REQUIRED': 'Required field',
    'err.NETWORK': 'Cannot reach the server — check your connection',
    'err.GENERIC': 'An error occurred',
    'toast.saved': 'Saved', 'toast.deleted': 'Deleted',
    'confirm.deleteTitle': 'Are you sure you want to delete this?', 'confirm.title': 'Are you sure?',
    'state.error': 'Error', 'state.conflict': 'Conflict',
    'state.conflictMsg': 'This record was modified after you opened it.',
    'state.moduleError': 'Failed to load module',
    'action.showDiff': 'Show differences', 'action.reload': 'Reload',
    'table.range': '{start}–{end} / {total}', 'table.page': '{page} / {pages}',
    'drawer.unsavedTitle': 'Unsaved changes',
    'drawer.unsavedBody': 'This panel has unsaved changes. What would you like to do?',
    'drawer.discard': "Don't save",
    // — field labels (shared) —
    'field.material': 'Material', 'field.quantity': 'Quantity', 'field.unit': 'Unit',
    'field.supplier': 'Supplier', 'field.requestDate': 'Request Date',
    'field.expectedDate': 'Expected Date', 'field.date': 'Date', 'field.note': 'Note',
    'action.newRequest': 'New Request',
    // — Purchase Requests —
    'pr.subtitle': 'Supply request for the material needed in production',
    'pr.empty': 'No requests yet. Start with "New Request".',
    'pr.noMaterialCount': '{n} records without a material',
    'pr.noReceipts': 'No receipts yet.',
    'pr.newTitle': 'New Request', 'pr.editTitle': 'Edit Request',
    'pr.materialHelp': 'Chosen from the material code list; free text is not allowed.',
    'pr.productFor': 'Product (for which product)', 'pr.linkedOrder': 'Linked Order',
    'pr.selectMaterial': 'Select material…', 'pr.selectProduct': 'Select product…',
    'pr.selectOrderOpt': 'Order (optional)…',
    'pr.deleteTitle': 'Delete this request?', 'pr.deleteBody': 'The request for {name} will be deleted.',
    // — shared field additions + Group A (Work Centers / Operations / Terms) —
    'field.name': 'Name', 'field.status': 'Status', 'field.original': 'Original',
    'field.translation': 'Translation', 'field.hidden': 'Hidden',
    'common.deleteBody': '"{name}" will be permanently deleted.',
    'wc.new': 'New Work Center', 'wc.empty': 'No work centers yet. Start with "New Work Center".',
    'wc.newTitle': 'New Work Center', 'wc.editTitle': 'Edit Work Center', 'wc.deleteTitle': 'Delete this work center?',
    'op.new': 'New Operation', 'op.empty': 'No operations yet. Start with "New Operation".',
    'op.newTitle': 'New Operation', 'op.editTitle': 'Edit Operation', 'op.deleteTitle': 'Delete this operation?',
    'tm.subtitle': 'English equivalents of interface terms · hidden terms are omitted in EN view',
    'tm.new': 'New Term', 'tm.empty': 'No terms yet. Start with "New Term".',
    'tm.newTitle': 'New Term', 'tm.editTitle': 'Edit Term', 'tm.deleteTitle': 'Delete this term?',
    'tm.hiddenTag': 'Hidden',
    // — Group B: Orders + Work Orders —
    'field.orderNo': 'Purchase Order Number', 'field.product': 'Product', 'field.dueDate': 'Due Date',
    'field.source': 'Source', 'field.targetQuantity': 'Target Quantity', 'field.customer': 'Customer',
    'field.workOrderNo': 'Work Order No', 'field.operation': 'Operation', 'field.workCenter': 'Work Center',
    'field.producedTarget': 'Produced / Target', 'field.progress': 'Progress', 'field.sequence': 'Sequence',
    'field.shift': 'Shift', 'field.actualQuantity': 'Produced Quantity', 'field.scrap': 'Scrap',
    'field.startDate': 'Start Date', 'field.requestedShipDate': 'Requested Ship Date',
    'field.salesOrderNo': 'Sales Order No', 'field.splitLabel': 'Split Label',
    'status.Aktif': 'Active',
    'src.select': '— Select source —', 'src.satis': 'Sales', 'src.uretim': 'Production', 'src.stok': 'Stock',
    'shift.Sabah': 'Morning', 'shift.Aksam': 'Evening', 'shift.Gece': 'Night',
    'ord.title': 'Production Orders',
    'ord.subtitle': 'Production requests opened from a sales order or stock replenishment',
    'ord.new': 'New Order', 'ord.empty': 'No orders yet. Start with "New Order".',
    'ord.newTitle': 'New Order', 'ord.editTitle': 'Edit Order',
    'ord.secOrder': 'Order', 'ord.secDates': 'Dates & Customer', 'ord.selectProduct': 'Select product…',
    'ord.noWorkOrders': 'No linked work orders.', 'ord.deleteTitle': 'Delete this order?',
    'ord.deleteBody': '"{no}" and its LINKED work orders + production records will be deleted.',
    'wo.subtitle': "A work order is opened for each operation on the order's route",
    'wo.new': 'Open Work Order', 'wo.empty': 'No work orders yet. Start with "Open Work Order".',
    'wo.newTitle': 'Open Work Order', 'wo.editTitle': 'Edit Work Order', 'wo.open': 'Open',
    'wo.selectOrder': 'Select order…', 'wo.selectProduct': 'Select product…',
    'wo.selectOperation': 'Select operation…', 'wo.selectCenter': 'Select work center…',
    'wo.noProduction': 'No production records.', 'wo.deleteTitle': 'Delete this work order?',
    'wo.deleteBody': '"{no}" and its LINKED production records will be deleted.',
    // — Group C: Production Entry + Product Trees —
    'field.description': 'Description', 'field.type': 'Type', 'field.unitQuantity': 'Unit Quantity',
    'field.outerDiameter': 'Outer Diameter', 'field.innerDiameter': 'Inner Diameter',
    'field.materialLength': 'Material Length', 'field.materialWeight': 'Material Weight',
    'field.revision': 'Revision', 'field.revisionDate': 'Revision Date', 'field.parentNode': 'Parent Node',
    'shift.Öğleden Sonra': 'Afternoon', 'shift.Mesai': 'Overtime',
    'prod.subtitle': 'At shift end, enter produced and scrap quantity per work order',
    'prod.newEntry': 'New Entry', 'prod.today': "Today's Entries", 'prod.count': '{n} records',
    'prod.noToday': 'No entries today yet.', 'prod.needEdit': 'Editing permission is required to add entries.',
    'prod.selectWo': 'Select work order…', 'prod.selectOp': 'Select operator…',
    'prod.remaining': 'Remaining target: {n} pcs', 'prod.woField': 'Work Order', 'prod.operatorField': 'Operator',
    'prod.actualField': 'Produced quantity', 'prod.scrapField': 'Scrap quantity',
    'prod.saveNew': 'Save & new', 'prod.savedToast': 'Entry saved · {n} pcs · {s} scrap',
    'prod.colTime': 'Time',
    'tree.subtitle': 'A node sits under another · quantities are per one unit of the parent',
    'tree.collapseAll': 'Collapse all', 'tree.new': 'New Node',
    'tree.search': 'Search product code or description…', 'tree.colNode': 'Node',
    'tree.noMatch': 'No matching nodes.', 'tree.empty': 'No tree nodes yet.',
    'tree.addChild': 'Add Child', 'tree.selectProduct': 'Select product…', 'tree.selectMaterial': 'Select raw material…',
    'tree.selectParent': 'Select parent node…', 'tree.editTitle': 'Edit Node',
    'tree.addChildTitle': 'Add Child Node', 'tree.newTitle': 'New Node',
    'tree.secId': 'Identity', 'tree.secMat': 'Material', 'tree.secMeasures': 'Measurements', 'tree.secRev': 'Revision',
    'tree.parentHelp': 'Leave empty for a root node.', 'tree.materialField': 'Material (Raw)',
    'tree.materialDesc': 'Material Description', 'tree.partLength': 'Part Length', 'tree.cutLoss': 'Cut Loss',
    'tree.supplierCutLength': 'Supplier Cut Length', 'tree.deleteTitle': 'Delete this node?',
    'tree.deleteBody': '"{name}" and its CHILD nodes will be permanently deleted.',
    // — Group D: Quality (Incoming / First-Off Points & Records) + shared —
    'field.productShort': 'Product', 'field.no': 'No', 'field.characteristic': 'Characteristic',
    'field.nominal': 'Nominal', 'field.lowerLimit': 'Lower Limit', 'field.upperLimit': 'Upper Limit',
    'field.pointNo': 'Point No', 'field.result': 'Result', 'field.decision': 'Decision',
    'field.value': 'Value', 'field.point': 'Point', 'field.measurement': 'Measurements',
    'qc.olcusel': 'Measured', 'qc.nitel': 'Qualitative', 'qc.selectType': '— Type —',
    'qc.unitPlaceholder': '— Unit —', 'qc.selectResult': '— Result —',
    'qc.Kabul': 'Accepted', 'qc.Red': 'Rejected', 'qc.Şartlı Kabul': 'Conditional Accept',
    'meas.empty': 'No measurements recorded.', 'meas.out': '{n} out of tolerance', 'meas.in': 'Within tolerance',
    'reason.Yeni iş emri / seri başlangıcı': 'New work order / batch start',
    'reason.Setup / kurulum sonrası': 'After setup / installation',
    'reason.Vardiya değişimi': 'Shift change',
    'reason.Uzun duruş sonrası': 'After long stoppage',
    'reason.Ayar / parametre değişimi': 'Setting / parameter change',
    'reason.Malzeme / lot değişimi': 'Material / lot change',
    'reason.Düzeltici faaliyet sonrası': 'After corrective action',
    // First-Off Points
    'fp.subtitle': 'Points to measure during first-off control',
    'fp.new': 'New Point', 'fp.empty': 'No points yet. Start with "New Point".',
    'fp.newTitle': 'New Point', 'fp.editTitle': 'Edit Point',
    'fp.deleteTitle': 'Delete this point?', 'fp.deleteBody': 'The point "{name}" will be deleted.',
    'fp.added': 'Point added', 'fp.updated': 'Point updated', 'fp.deleted': 'Point deleted',
    // First-Off Records
    'fr.subtitle': 'First-off inspection records — measurements and reasons',
    'fr.new': 'New Record', 'fr.empty': 'No records yet. Start with "New Record".',
    'fr.newTitle': 'New Record', 'fr.editTitle': 'Edit Record',
    'fr.secRecord': 'Record', 'fr.secMeas': 'Measurements', 'fr.secReasons': 'Reasons',
    'fr.operatorName': 'Operator (name)', 'fr.woNo': 'Work Order No', 'fr.sampleCount': 'Sample Count',
    'fr.checkTime': 'Check Time', 'fr.overallResult': 'Overall Decision',
    'fr.reasonsHelp': 'Check the reasons from the official form; add free text if not listed.',
    'fr.addMeas': '+ Add measurement', 'fr.noMeas': 'No measurements added.', 'fr.selectPoint': 'Point…',
    'fr.reasonCustom': 'Not listed — type a reason…',
    'fr.added': 'Record added', 'fr.updated': 'Record updated', 'fr.deleted': 'Record deleted',
    'fr.deleteTitle': 'Delete this record?', 'fr.deleteBody': 'This first-off record and its measurements will be deleted.',
    // Incoming Inspections
    'ii.subtitle': 'Incoming material control — characteristics and measurement values',
    'ii.new': 'New Inspection', 'ii.empty': 'No inspections yet. Start with "New Inspection".',
    'ii.newTitle': 'New Inspection', 'ii.editTitle': 'Edit Inspection',
    'ii.secControl': 'Inspection', 'ii.secDateQty': 'Dates & Quantity', 'ii.secChars': 'Characteristics',
    'ii.purchaseReceipt': 'Purchase Receipt', 'ii.drawingNo': 'Drawing No', 'ii.reason': 'Observation Reason',
    'ii.arrivalDate': 'Material Arrival Date', 'ii.inspectionDate': 'Inspection Date',
    'ii.receivedQty': 'Received Quantity', 'ii.sampleQty': 'Sample Quantity', 'ii.inspectorName': 'Inspected By',
    'ii.overallResult': 'Overall Result', 'ii.selectReceipt': 'Purchase receipt (optional)…',
    'ii.addChar': '+ Add characteristic', 'ii.noChar': 'No characteristics added.',
    'ii.spec': 'Specification', 'ii.values': 'Values', 'ii.valuePlaceholder': 'Value (number or text)…',
    'ii.added': 'Inspection added', 'ii.updated': 'Inspection updated', 'ii.deleted': 'Inspection deleted',
    'ii.deleteTitle': 'Delete this inspection?', 'ii.deleteBody': 'This incoming inspection, its characteristics and values will be deleted.',
    // — Group E: Hourly Points + Records (point/record texts shared via fp.*/fr.*) —
    'field.measureLocation': 'Measurement Location', 'field.hour': 'Time', 'field.personnel': 'Personnel',
    'hp.title': 'Hourly Control Points', 'hp.subtitle': 'Points to measure during hourly control',
    'hr.subtitle': 'Hourly control records — a measurement series per point',
    'hr.deleteBody': 'This hourly record and its measurements will be deleted.',
    'hr.machine': 'Machine', 'hr.productionCount': 'Production Count',
    'hr.valuesSeq': 'Values (in order)', 'hr.addPoint': '+ Add point', 'hr.noPoint': 'No points added.',
    'hr.valuePlaceholder': 'Type a value and Enter…',
    // — child-detail (shared _childDetail.js) default empty texts —
    'cd.noLinked': 'No linked records.', 'cd.noExtra': 'No additional info.', 'cd.noRecords': 'No records.',
  }
};

let lang = localStorage.getItem('lang') === 'en' ? 'en' : 'tr';
document.documentElement.setAttribute('lang', lang);

export function getLang() { return lang; }

/** Dili değiştirir: localStorage + <html lang> + 'langchange' olayı (VERİYİ ÇEKMEZ). */
export function setLang(next) {
  const v = next === 'en' ? 'en' : 'tr';
  if (v === lang) return;
  lang = v;
  localStorage.setItem('lang', v);
  document.documentElement.setAttribute('lang', v);
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: v } }));
}

/** Anahtarı çevirir. {param} yer tutucuları params ile doldurulur; anahtar yoksa TR ya da ham anahtar. */
export function t(key, params) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.tr[key] ?? key;
  if (params) for (const [k, val] of Object.entries(params)) s = s.split('{' + k + '}').join(String(val));
  return s;
}

/** Sipariş durumu gibi TR değerini dile göre gösterir (sözlükte status.<değer>). */
export function tStatus(value) {
  return value == null || value === '' ? '' : t('status.' + value);
}

/** Bileşen aboneliği; cb her dil değişiminde çağrılır. Temizleyici döner. */
export function onLangChange(cb) {
  const h = (e) => cb(e.detail?.lang || getLang());
  window.addEventListener('langchange', h);
  return () => window.removeEventListener('langchange', h);
}

/**
 * Özel görünüm (DataTable kullanmayan modül) için: dil değişince render()'ı VERİ ÇEKMEDEN
 * yeniden çağırır (veri modülün closure'ında). Başka modüle geçilince (container içeriği
 * değişip işaretçi DOM'dan düşünce) aboneliği otomatik bırakır — leak/çakışma yok.
 * KULLANIM: modül ilk render()'ını yaptıktan SONRA çağrılır.
 */
export function bindLang(container, render) {
  let marker = container.firstElementChild;   // bu modülün kök öğesi
  const unsub = onLangChange(() => {
    if (marker && !container.contains(marker)) { unsub(); return; }  // modül değişti -> bırak
    render();
    marker = container.firstElementChild;      // yeniden çizimden sonra işaretçiyi tazele
  });
  return unsub;
}
