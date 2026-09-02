<?php
declare(strict_types=1);

/**
 * etl.php — Melih'in KRC yedek JSON'unu v2 tablolarina aktarir.
 *
 * Kullanim (CLI):
 *   php etl.php --file=../data/qfw_konsol_yedek_2026-08-23.json [--dry-run]
 * SSH yoksa tarayicidan: tools/etl_web.php (gecici, anahtar korumali sarmalayici).
 *
 * --dry-run : hicbir sey KALICI yazilmaz. Tum is tek bir transaction icinde yapilir
 *             ve sonunda GERI ALINIR; rapor "ne olurdu"yu gosterir.
 *
 * Kimlik esleme: v1 id'leri string (msa62js08dce9); v2 auto-increment. Her kayit
 * eski id'sini legacy_id sutununa yazar. Bellekte [koleksiyon][eski_id] => yeni_id
 * haritasi tutulur; FK'ler bundan cozulur. Metin->FK (isMerkezi/operasyon/malzeme
 * adlari) ad/kod uzerinden cozulur; referans tablolarda yoksa otomatik olusturulur.
 * product_codes'ta kod bulunamazsa kayit ATLANIR (urun kodu uydurulamaz).
 *
 * Yazma yalnizca Repository katmanindan yapilir (tenant_id + sutun whitelist otomatik).
 * Her koleksiyon kendi Db::transaction()'inda; biri patlarsa oncekiler korunur ve
 * nerede duruldugu raporlanir.
 */

use App\Core\Context;
use App\Core\Db;

// --- autoload (public/api/index.php ile ayni desen) --------------------------
spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $path = dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

// --- girdi: CLI (getopt) ya da web sarmalayici -------------------------------
// CLI'da --file / --dry-run. Web'de (tools/etl_web.php — gecici sarmalayici) bu iki
// deger $ETL_FILE / $ETL_DRYRUN olarak onceden set edilir. Web SAPI'de STDERR
// tanimli olmadigindan hata mesajlari echo ile verilir.
$isCli = (PHP_SAPI === 'cli');
if ($isCli) {
    $opts   = getopt('', ['file:', 'dry-run']);
    $file   = $opts['file'] ?? null;
    $dryRun = array_key_exists('dry-run', $opts);
} else {
    $file   = $ETL_FILE ?? null;
    $dryRun = $ETL_DRYRUN ?? true; // web'de varsayilan dry-run
}

$stderr = static function (string $msg) use ($isCli): void {
    if ($isCli && defined('STDERR')) {
        fwrite(STDERR, $msg . "\n");
    } else {
        echo $msg . "\n";
    }
};

if ($file === null) {
    $stderr('Kullanim: php etl.php --file=yedek.json [--dry-run]');
    exit(1);
}
if (!is_file($file)) {
    $stderr("Dosya bulunamadi: $file");
    exit(1);
}

$raw = json_decode((string) file_get_contents($file), true);
if (!is_array($raw) || !isset($raw['data']) || !is_array($raw['data'])) {
    $stderr('Gecersiz yedek: beklenen {data:{...}} yapisi yok');
    exit(1);
}
$D = $raw['data'];

// --- baglam + repolar --------------------------------------------------------
// ETL sistem kullanicisi: tenant 1, userId 0. created_by/updated_by = 0.
$ctx = new Context(tenantId: 1, userId: 0, role: 'editor', displayName: 'ETL');

$repo = [
    'product_codes'   => new App\Repository\ProductCodeRepository($ctx),
    'work_centers'    => new App\Repository\WorkCenterRepository($ctx),
    'operations'      => new App\Repository\OperationRepository($ctx),
    'task_people'     => new App\Repository\TaskPersonRepository($ctx),
    'terms'           => new App\Repository\TermRepository($ctx),
    'working_hours'   => new App\Repository\WorkingHoursRepository($ctx),
    'operators'       => new App\Repository\OperatorRepository($ctx),
    'product_trees'   => new App\Repository\ProductTreeRepository($ctx),
    'routes'          => new App\Repository\RouteRepository($ctx),
    'capacities'      => new App\Repository\CapacityRepository($ctx),
    'audits'          => new App\Repository\AuditRepository($ctx),
    'tasks'           => new App\Repository\TaskRepository($ctx),
    'orders'          => new App\Repository\OrderRepository($ctx),
    'work_orders'     => new App\Repository\WorkOrderRepository($ctx),
    'production'      => new App\Repository\ProductionRepository($ctx),
    'machine_plans'   => new App\Repository\MachinePlanRepository($ctx),
    'first_off_points'  => new App\Repository\FirstOffPointRepository($ctx),
    'first_off_records' => new App\Repository\FirstOffRecordRepository($ctx),
    'hourly_points'   => new App\Repository\HourlyPointRepository($ctx),
    'hourly_records'  => new App\Repository\HourlyRecordRepository($ctx),
    'purchase_requests' => new App\Repository\PurchaseRequestRepository($ctx),
    'purchase_receipts' => new App\Repository\PurchaseReceiptRepository($ctx),
    'incoming_inspections' => new App\Repository\IncomingInspectionRepository($ctx),
];

// --- deger yardimcilari ------------------------------------------------------
$str = static function (mixed $v): ?string {
    if ($v === null) return null;
    $s = trim((string) $v);
    return $s === '' ? null : $s;
};
$num = static function (mixed $v): ?float {
    if ($v === null || (is_string($v) && trim($v) === '')) return null;
    return is_numeric($v) ? (float) $v : null;
};
$int = static function (mixed $v): ?int {
    if ($v === null || (is_string($v) && trim($v) === '')) return null;
    return is_numeric($v) ? (int) $v : null;
};
$bool = static fn(mixed $v): int => $v ? 1 : 0;

// --- kimlik + referans haritalari --------------------------------------------
$idMap = [];                 // idMap[koleksiyon][eski_id] = yeni_id
$ref   = ['product' => [], 'wc' => [], 'op' => [], 'person' => []];

// --- rapor -------------------------------------------------------------------
$report = [];
$order  = [];                // koleksiyon isleme sirasi (raporda korunur)
$rec = static function (string $col) use (&$report, &$order): array {
    if (!isset($report[$col])) {
        $report[$col] = ['read' => 0, 'created' => 0, 'updated' => 0, 'skipped' => 0, 'autorefs' => 0, 'reasons' => []];
        $order[] = $col;
    }
    return [];
};
$materialIssues = [];        // Melih'e: malzeme kod yerine aciklama tasiyan istekler
$stoppedAt      = null;      // koleksiyon patlarsa

// Kayit atlama sinyali (beklenen: eksik FK). Koleksiyon transaction'ini BOZMAZ.
final class EtlSkip extends \RuntimeException {}

// --- referans cozumleyiciler (ad/kod -> id, yoksa otomatik olustur) ----------
$resolveProduct = static function (?string $code) use (&$ref): int {
    if ($code === null || $code === '') {
        throw new EtlSkip('urun/malzeme kodu bos');
    }
    if (!isset($ref['product'][$code])) {
        throw new EtlSkip("urun kodu bulunamadi: $code");
    }
    return $ref['product'][$code];
};
$resolveWorkCenter = static function (?string $name) use (&$ref, $repo, &$report): ?int {
    if ($name === null || $name === '') return null;
    if (isset($ref['wc'][$name])) return $ref['wc'][$name];
    $r = $repo['work_centers']->etlEnsureByName('name', $name, ['is_active' => 1]);
    $ref['wc'][$name] = $r['id'];
    if ($r['created']) $report['work_centers']['autorefs']++;
    return $r['id'];
};
$resolveOperation = static function (?string $name) use (&$ref, $repo, &$report): ?int {
    if ($name === null || $name === '') return null;
    if (isset($ref['op'][$name])) return $ref['op'][$name];
    $r = $repo['operations']->etlEnsureByName('name', $name);
    $ref['op'][$name] = $r['id'];
    if ($r['created']) $report['operations']['autorefs']++;
    return $r['id'];
};
$resolvePerson = static function (?string $name) use (&$ref, $repo, &$report): ?int {
    if ($name === null || $name === '') return null;
    if (isset($ref['person'][$name])) return $ref['person'][$name];
    $r = $repo['task_people']->etlEnsureByName('name', $name);
    $ref['person'][$name] = $r['id'];
    if ($r['created']) $report['task_people']['autorefs']++;
    return $r['id'];
};

/**
 * Bir koleksiyonu tek transaction icinde isler. $handler($record) her kayit icin
 * cagirilir ve ['created'|'updated'] doner; EtlSkip firlatirsa kayit atlanir (sebep
 * raporlanir), transaction bozulmaz. Beklenmedik hata transaction'i geri alir ve
 * disari firlar (isleme durur).
 */
$runCollection = static function (string $col, array $records, callable $handler)
        use (&$report, &$stoppedAt, $rec): bool {
    if ($stoppedAt !== null) {
        return false; // onceki koleksiyon patladi — isleme durdu, digerlerine dokunma
    }
    $rec($col);
    $report[$col]['read'] = count($records);
    try {
        Db::transaction(function () use ($records, $handler, $col, &$report): void {
            foreach ($records as $r) {
                try {
                    $action = $handler($r);
                    if ($action === 'created') $report[$col]['created']++;
                    elseif ($action === 'updated') $report[$col]['updated']++;
                } catch (EtlSkip $s) {
                    $report[$col]['skipped']++;
                    $report[$col]['reasons'][] = $s->getMessage();
                } catch (\PDOException $e) {
                    // Butunluk catismasi (SQLSTATE 23000): ayni dogal anahtar (or. gercek
                    // veride tekrar eden order_no/wo_no) ya da NOT NULL/FK. Statement geri
                    // alinir ama transaction devam eder (InnoDB) — kaydi atla, raporla.
                    // Diger DB hatalari gercek arizadir: koleksiyonu abort etmek icin firlat.
                    if ((string) $e->getCode() === '23000') {
                        $report[$col]['skipped']++;
                        $report[$col]['reasons'][] = 'butunluk catismasi (dogal anahtar/NOT NULL/FK): '
                            . preg_replace('/\s+/', ' ', $e->getMessage());
                    } else {
                        throw $e;
                    }
                }
            }
        });
        return true;
    } catch (\Throwable $e) {
        $stoppedAt = ['collection' => $col, 'error' => $e->getMessage()];
        return false;
    }
};

// dry-run: her seyi tek dis transaction'a al, sonunda geri al. Ic Db::transaction
// cagrilari (reentrant) buna katilir; hicbir sey commit edilmez.
if ($dryRun) {
    Db::pdo()->beginTransaction();
}

// Koleksiyonlar bagimliliga gore sirayla islenir; her adim onceki idMap/ref'lere dayanir.

// =========================================================================
// GRUP 1 — referans / bagimsiz tablolar
// Referans tablolar (work_centers/operations/task_people) product_codes'tan ONCE:
// product_codes.cikanOperasyon operasyon adina FK verir; operasyonlar once yuklenmezse
// otomatik olusturulur ve sonra operasyon koleksiyonu ayni adi eklerken UNIQUE(name)
// catisir. Bu yuzden referanslar basta.
// =========================================================================

// --- work_centers (isMerkezleri) ---
$runCollection('work_centers', $D['isMerkezleri'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, $str): string {
    $name = $str($r['ad'] ?? null);
    if ($name === null) throw new EtlSkip('is merkezi adi bos');
    $res = $repo['work_centers']->etlUpsert($str($r['id'] ?? null), ['name' => $name, 'is_active' => 1]);
    $idMap['work_centers'][$r['id']] = $res['id'];
    $ref['wc'][$name] = $res['id'];
    return $res['action'];
});

// --- operations (operasyonlarListesi) ---
$runCollection('operations', $D['operasyonlarListesi'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, $str): string {
    $name = $str($r['ad'] ?? null);
    if ($name === null) throw new EtlSkip('operasyon adi bos');
    $res = $repo['operations']->etlUpsert($str($r['id'] ?? null), ['name' => $name]);
    $idMap['operations'][$r['id']] = $res['id'];
    $ref['op'][$name] = $res['id'];
    return $res['action'];
});

// --- task_people (gorevKisiler) ---
$runCollection('task_people', $D['gorevKisiler'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, $str): string {
    $name = $str($r['isim'] ?? null);
    if ($name === null) throw new EtlSkip('kisi ismi bos');
    $res = $repo['task_people']->etlUpsert($str($r['id'] ?? null), [
        'name'  => $name,
        'email' => $str($r['eposta'] ?? null),
        'phone' => $str($r['telefon'] ?? null),
    ]);
    $idMap['task_people'][$r['id']] = $res['id'];
    $ref['person'][$name] = $res['id'];
    return $res['action'];
});

// --- product_codes (kodTanimlari) — referanslardan sonra (cikanOperasyon FK'si icin) ---
$runCollection('product_codes', $D['kodTanimlari'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, $str, $num, $resolveOperation): string {
    $cols = [
        'code'            => $str($r['kod'] ?? null) ?? '',
        'name'            => $str($r['ad'] ?? null) ?? '',
        'type'            => $str($r['tip'] ?? null) ?? 'Ürün',
        'unit'            => $str($r['birim'] ?? null),
        'status'          => $str($r['durum'] ?? null),
        'category'        => $str($r['kategori'] ?? null),
        'drawing_no'      => $str($r['cizimNo'] ?? null),
        'revision'        => $str($r['revizyon'] ?? null),
        'revision_date'   => $str($r['revizyonTarihi'] ?? null),
        'note'            => $str($r['not'] ?? null),
        'suppliers'       => $str($r['tedarikciler'] ?? null),
        'customer'        => $str($r['musteri'] ?? null),
        'parent_product_code' => $str($r['anaUrun'] ?? null),
        'outer_diameter'  => $num($r['disCap'] ?? null),
        'inner_diameter'  => $num($r['icCap'] ?? null),
        'material_length' => $num($r['hammaddeUzunluk'] ?? null),
        'material_weight' => $num($r['hammaddeAgirlik'] ?? null),
        'min_stock_level' => $num($r['minStokSeviyesi'] ?? null),
        'supply_days'     => $num($r['tedarikSuresi'] ?? null),
        'box_quantity'    => $num($r['koliAdedi'] ?? null),
    ];
    if ($cols['code'] === '') {
        throw new EtlSkip('urun kodu bos, atlandi');
    }
    // cikanOperasyon: ad -> operation id (varsa; operasyonlar zaten yuklendi)
    $opName = $str($r['cikanOperasyon'] ?? null);
    if ($opName !== null) {
        $cols['outgoing_operation_id'] = $resolveOperation($opName);
    }
    $res = $repo['product_codes']->etlUpsert($str($r['id'] ?? null), $cols);
    $idMap['product_codes'][$r['id']] = $res['id'];
    $ref['product'][$cols['code']] = $res['id'];
    return $res['action'];
});

// --- terms (terimCevirileri + gizliTerimler) ---
$hiddenSet = [];
foreach (($D['gizliTerimler'] ?? []) as $h) {
    $t = is_string($h) ? trim($h) : '';
    if ($t !== '') $hiddenSet[$t] = true;
}
$runCollection('terms', $D['terimCevirileri'] ?? [], function (array $r)
        use ($repo, $str, $hiddenSet): string {
    $orig = $str($r['orijinal'] ?? null);
    if ($orig === null) throw new EtlSkip('orijinal terim bos');
    $res = $repo['terms']->etlUpsert($str($r['id'] ?? null), [
        'original'    => $orig,
        'translation' => $str($r['ceviri'] ?? null),
        'is_hidden'   => isset($hiddenSet[$orig]) ? 1 : 0,
    ]);
    return $res['action'];
});
// gizliTerimler'de olup terimCevirileri'nde OLMAYAN terimler: legacy'siz, ada gore olustur.
$transOriginals = [];
foreach (($D['terimCevirileri'] ?? []) as $t) {
    $o = $str($t['orijinal'] ?? null);
    if ($o !== null) $transOriginals[$o] = true;
}
$runCollection('terms_hidden_only', array_values(array_filter(
        array_keys($hiddenSet), static fn($o) => !isset($transOriginals[$o]))),
    function (string $orig) use ($repo): string {
        $r = $repo['terms']->etlEnsureByName('original', $orig, ['is_hidden' => 1]);
        return $r['created'] ? 'created' : 'updated';
    });

// --- working_hours (calismaSaatleri) — tekil konfig, legacy'siz upsert yok ---
if ($stoppedAt === null) {
$rec('working_hours');
$whList = $D['calismaSaatleri'] ?? [];
$report['working_hours']['read'] = count($whList);
if ($whList !== []) {
    $w = $whList[0];
    $whCols = [
        'morning_start'         => $str($w['sabahBaslangic'] ?? null),
        'morning_break_start'   => $str($w['sabahMolaBaslangic'] ?? null),
        'morning_break_end'     => $str($w['sabahMolaBitis'] ?? null),
        'morning_end'           => $str($w['sabahBitis'] ?? null),
        'afternoon_start'       => $str($w['ogledenSonraBaslangic'] ?? null),
        'afternoon_break_start' => $str($w['ogledenSonraMolaBaslangic'] ?? null),
        'afternoon_break_end'   => $str($w['ogledenSonraMolaBitis'] ?? null),
        'afternoon_end'         => $str($w['ogledenSonraBitis'] ?? null),
    ];
    try {
        Db::transaction(function () use ($repo, $whCols, &$report): void {
            if ($repo['working_hours']->findForTenant() !== null) {
                $repo['working_hours']->updateForTenant($whCols, null);
                $report['working_hours']['updated']++;
            } else {
                $repo['working_hours']->create($whCols); // migration tohumlamamissa
                $report['working_hours']['created']++;
            }
        });
    } catch (\Throwable $e) {
        $stoppedAt = ['collection' => 'working_hours', 'error' => $e->getMessage()];
    }
}
} // if stoppedAt === null (working_hours)

// =========================================================================
// GRUP 2 — operators(+skills), product_trees, routes(+variants), capacities, audits, tasks
// =========================================================================

if ($stoppedAt === null)
$runCollection('operators', $D['operatorler'] ?? [], function (array $r)
        use ($repo, &$idMap, &$report, $str, $bool, $resolveOperation): string {
    $badge = $str($r['sicilNo'] ?? null);
    if ($badge === null) {
        // Tum operatorlerde sicilNo bos; badge_no NOT NULL UNIQUE oldugundan legacy id
        // yer tutucu olarak yazilir (benzersiz, izlenebilir). Melih sonradan doldurur.
        $badge = (string) ($r['id'] ?? '');
        $report['operators']['reasons'][] = "sicil no bos -> legacy id ile dolduruldu ({$r['id']})";
    }
    $res = $repo['operators']->etlUpsert($str($r['id'] ?? null), [
        'full_name' => $str($r['adSoyad'] ?? null) ?? '',
        'badge_no'  => $badge,
        'is_active' => $bool(($r['durum'] ?? '') === 'Aktif'),
    ]);
    $idMap['operators'][$r['id']] = $res['id'];

    // yetkinOperasyonlar: operasyon ADLARI -> id
    $skillIds = [];
    foreach (($r['yetkinOperasyonlar'] ?? []) as $opName) {
        $id = $resolveOperation($str($opName));
        if ($id !== null && !in_array($id, $skillIds, true)) $skillIds[] = $id;
    }
    $repo['operators']->updateWithSkills($res['id'], [], $skillIds, null);
    return $res['action'];
});

// --- product_trees (urunAgaclari) — iki pass (oz-referans parent_id) ---
if ($stoppedAt === null) {
    $treeRecords = $D['urunAgaclari'] ?? [];
    // Pass 1: parent'siz upsert + kimlik haritasi
    $ok = $runCollection('product_trees', $treeRecords, function (array $r)
            use ($repo, &$idMap, &$ref, $str, $num, $resolveProduct): string {
        $code = $str($r['kod'] ?? null);
        $productId = $resolveProduct($code); // yoksa EtlSkip
        $cols = [
            'product_code_id'     => $productId,
            'description'         => $str($r['aciklama'] ?? null),
            'revision'            => $str($r['revNo'] ?? null),
            'revision_date'       => $str($r['revTarihi'] ?? null),
            'unit_quantity'       => $num($r['birimMiktar'] ?? null),
            'outer_diameter'      => $num($r['disCap'] ?? null),
            'inner_diameter'      => $num($r['icCap'] ?? null),
            'material_length'     => $num($r['hammaddeUzunluk'] ?? null),
            'material_weight'     => $num($r['hammaddeAgirlik'] ?? null),
            'part_length'         => $num($r['parcaBoyu'] ?? null),
            'cut_loss'            => $num($r['kesimKaybi'] ?? null),
            'supplier_cut_length' => $num($r['tedarikciKesimUzunlugu'] ?? null),
        ];
        // malzemeKodu (varsa) -> hammadde kodu FK; bulunamazsa null (zorunlu degil)
        $mk = $str($r['malzemeKodu'] ?? null);
        if ($mk !== null) $cols['material_code_id'] = $ref['product'][$mk] ?? null;

        $res = $repo['product_trees']->etlUpsert($str($r['id'] ?? null), $cols);
        $idMap['product_trees'][$r['id']] = $res['id'];
        return $res['action'];
    });
    // Pass 2: parent_id'yi map'ten coz (yalnizca parent'i olanlar)
    if ($ok) {
        try {
            Db::transaction(function () use ($treeRecords, $repo, &$idMap): void {
                foreach ($treeRecords as $r) {
                    $pid = $r['parentId'] ?? null;
                    if ($pid !== null && isset($idMap['product_trees'][$r['id']], $idMap['product_trees'][$pid])) {
                        $repo['product_trees']->etlUpsert((string) $r['id'], [
                            'parent_id' => $idMap['product_trees'][$pid],
                        ]);
                    }
                }
            });
        } catch (\Throwable $e) {
            $stoppedAt = ['collection' => 'product_trees(parent)', 'error' => $e->getMessage()];
        }
    }
}

// --- routes (+ varyantSecenekleri) ---
if ($stoppedAt === null)
$runCollection('routes', $D['routes'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num, $bool, $resolveProduct, $resolveWorkCenter, $resolveOperation): string {
    $cols = [
        'product_code_id' => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'    => $resolveOperation($str($r['operasyon'] ?? null)),
        'work_center_id'  => $resolveWorkCenter($str($r['isMerkezi'] ?? null)),
        // sira ondalikli (alt operasyon 1.1/1.2) — routes.sequence DECIMAL; $int TRUNCATE ederdi.
        'sequence'        => $num($r['sira'] ?? null) ?? 0,
        'is_active'       => $bool($r['aktif'] ?? false),
        'variant_label'   => $str($r['varyantEtiketi'] ?? null),
    ];
    if ($cols['operation_id'] === null || $cols['work_center_id'] === null) {
        throw new EtlSkip('rota: operasyon ya da is merkezi bos');
    }
    $res = $repo['routes']->etlUpsert($str($r['id'] ?? null), $cols);
    $idMap['routes'][$r['id']] = $res['id'];

    $variants = [];
    foreach (($r['varyantSecenekleri'] ?? []) as $v) {
        $s = $str($v);
        if ($s !== null && !in_array($s, $variants, true)) $variants[] = $s;
    }
    $repo['routes']->updateWithVariants($res['id'], [], $variants, null);
    return $res['action'];
});

// --- capacities (capacity) ---
if ($stoppedAt === null)
$runCollection('capacities', $D['capacity'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num, $resolveProduct, $resolveWorkCenter, $resolveOperation): string {
    $wc = $resolveWorkCenter($str($r['isMerkezi'] ?? null));
    if ($wc === null) throw new EtlSkip('kapasite: is merkezi bos');
    $res = $repo['capacities']->etlUpsert($str($r['id'] ?? null), [
        'product_code_id'    => $resolveProduct($str($r['urun'] ?? null)),
        'work_center_id'     => $wc,
        // operasyon opsiyonel: bos -> NULL (eski kayit); dolu -> operations id (gerekirse olusur).
        'operation_id'       => $resolveOperation($str($r['operasyon'] ?? null)),
        'capacity_per_shift' => $num($r['kapasite'] ?? null) ?? 0,
        // v1 alan adi dakikaPerAdet (dakika DEGIL) — onceki eslemede yanlisti, minutes hep NULL kaliyordu.
        'minutes'            => $num($r['dakikaPerAdet'] ?? null),
    ]);
    $idMap['capacities'][$r['id']] = $res['id'];
    return $res['action'];
});

// --- audits ---
if ($stoppedAt === null)
$runCollection('audits', $D['audits'] ?? [], function (array $r)
        use ($repo, $str, $num): string {
    $res = $repo['audits']->etlUpsert($str($r['id'] ?? null), [
        'form'     => $str($r['form'] ?? null) ?? 'TQS',
        'section'  => $str($r['section'] ?? null) ?? '',
        'question' => $str($r['question'] ?? null) ?? '',
        'score'    => $num($r['score'] ?? null),
        'evidence' => $str($r['evidence'] ?? null),
    ]);
    return $res['action'];
});

// --- tasks (gorevler) ---
if ($stoppedAt === null)
$runCollection('tasks', $D['gorevler'] ?? [], function (array $r)
        use ($repo, $str, $int, $num, $resolvePerson): string {
    $res = $repo['tasks']->etlUpsert($str($r['id'] ?? null), [
        'sequence'              => $int($r['sira'] ?? null),
        'description'           => $str($r['gorevTanimi'] ?? null) ?? '',
        'department'            => $str($r['departman'] ?? null),
        'primary_assignee_id'   => $resolvePerson($str($r['anaSorumlu'] ?? null)),
        'secondary_assignee_id' => $resolvePerson($str($r['yardimci'] ?? null)),
        'priority'              => $str($r['oncelik'] ?? null),
        'due_date'              => $str($r['termin'] ?? null),
        'status'                => $str($r['durum'] ?? null),
        'completion_ratio'      => $num($r['tamamlanmaYuzdesi'] ?? null),
        'notes'                 => $str($r['notlar'] ?? null),
    ]);
    return $res['action'];
});

// =========================================================================
// GRUP 3 — orders -> work_orders -> production -> machine_plans
// =========================================================================

if ($stoppedAt === null)
$runCollection('orders', $D['orders'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num, $resolveProduct): string {
    $res = $repo['orders']->etlUpsert($str($r['id'] ?? null), [
        'order_no'                => $str($r['orderNo'] ?? null) ?? '',
        'source'                  => $str($r['kaynak'] ?? null) ?? 'satis',
        'status'                  => $str($r['durum'] ?? null) ?? '',
        'customer'                => $str($r['musteri'] ?? null),
        'sales_order_no'          => $str($r['satisSiparisNo'] ?? null),
        'product_code_id'         => $resolveProduct($str($r['urun'] ?? null)),
        'target_quantity'         => $num($r['hedefMiktar'] ?? null) ?? 0,
        'start_date'              => $str($r['baslangicTarihi'] ?? null),
        'requested_delivery_date' => $str($r['istenenTeslimTarihi'] ?? null),
        'note'                    => $str($r['not'] ?? null),
    ]);
    $idMap['orders'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('work_orders', $D['workorders'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $int, $num, $resolveProduct, $resolveOperation, $resolveWorkCenter): string {
    $orderId = $idMap['orders'][$r['orderId'] ?? ''] ?? null;
    if ($orderId === null) throw new EtlSkip("is emri: siparis bulunamadi ({$r['orderId']})");
    $res = $repo['work_orders']->etlUpsert($str($r['id'] ?? null), [
        'wo_no'           => $str($r['woNo'] ?? null) ?? '',
        'order_id'        => $orderId,
        'product_code_id' => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'    => $resolveOperation($str($r['operasyon'] ?? null)),
        'work_center_id'  => $resolveWorkCenter($str($r['isMerkezi'] ?? null)),
        'sequence'        => $int($r['sira'] ?? null),
        'target_quantity' => $num($r['hedefMiktar'] ?? null) ?? 0,
        'status'          => $str($r['durum'] ?? null) ?? '',
        'split_label'     => $str($r['splitEtiket'] ?? null),
    ]);
    $idMap['work_orders'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('production', $D['production'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num): string {
    $woId = $idMap['work_orders'][$r['workOrderId'] ?? ''] ?? null;
    if ($woId === null) throw new EtlSkip("uretim: is emri bulunamadi ({$r['workOrderId']})");
    $res = $repo['production']->etlUpsert($str($r['id'] ?? null), [
        'work_order_id'   => $woId,
        'date'            => $str($r['tarih'] ?? null),
        'shift'           => $str($r['vardiya'] ?? null) ?? 'Sabah',
        'target_quantity' => $num($r['hedefAdet'] ?? null),
        'actual_quantity' => $num($r['gercekAdet'] ?? null) ?? 0,
        'scrap_quantity'  => $num($r['fireAdet'] ?? null) ?? 0,
        'operator_id'     => $idMap['operators'][$r['operator'] ?? ''] ?? null,
        'downtime_start'  => $str($r['durusBaslangic'] ?? null),
        'downtime_end'    => $str($r['durusBitis'] ?? null),
        'note'            => $str($r['not'] ?? null),
    ]);
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('machine_plans', $D['makinePlani'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num, $resolveProduct, $resolveWorkCenter): string {
    $wc = $resolveWorkCenter($str($r['isMerkezi'] ?? null));
    if ($wc === null) throw new EtlSkip('makine plani: is merkezi bos');
    $res = $repo['machine_plans']->etlUpsert($str($r['id'] ?? null), [
        'date'            => $str($r['tarih'] ?? null),
        'work_center_id'  => $wc,
        'product_code_id' => $resolveProduct($str($r['urun'] ?? null)),
        'work_order_id'   => $idMap['work_orders'][$r['workOrderId'] ?? ''] ?? null,
        'target_quantity' => $num($r['hedefMiktar'] ?? null),
        'note'            => $str($r['not'] ?? null),
    ]);
    return $res['action'];
});

// =========================================================================
// GRUP 4 — first_off_points -> first_off_records
// =========================================================================

if ($stoppedAt === null)
$runCollection('first_off_points', $D['firstOffNoktalari'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $int, $num, $resolveProduct, $resolveOperation): string {
    $res = $repo['first_off_points']->etlUpsert($str($r['id'] ?? null), [
        'product_code_id' => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'    => $resolveOperation($str($r['operasyon'] ?? null)) ?? throw new EtlSkip('nokta: operasyon bos'),
        'point_no'        => $int($r['no'] ?? null) ?? 0,
        'characteristic'  => $str($r['karakteristik'] ?? null) ?? '',
        'type'            => $str($r['tip'] ?? null) ?? 'olcusel',
        'nominal'         => $num($r['nominal'] ?? null),
        'lower_limit'     => $num($r['altLimit'] ?? null),
        'upper_limit'     => $num($r['ustLimit'] ?? null),
        'unit'            => $str($r['birim'] ?? null),
    ]);
    $idMap['first_off_points'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('first_off_records', $D['firstOffKayitlari'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $int, $num, $resolveProduct, $resolveOperation): string {
    $res = $repo['first_off_records']->etlUpsert($str($r['id'] ?? null), [
        'product_code_id' => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'    => $resolveOperation($str($r['operasyon'] ?? null)) ?? throw new EtlSkip('kayit: operasyon bos'),
        'date'            => $str($r['tarih'] ?? null),
        'shift'           => $str($r['vardiya'] ?? null) ?? '',
        'operator_name'   => $str($r['operator'] ?? null),
        'wo_no'           => $str($r['isEmriNo'] ?? null),
        'sample_count'    => $int($r['numuneAdedi'] ?? null),
        'check_time'      => $str($r['kontrolSaati'] ?? null),
        'overall_result'  => $str($r['genelKarar'] ?? null),
    ]);
    $recordId = $res['id'];

    // olcumler: {noktaLegacyId: {deger, sonuc}} -> [{point_id, value, result}]
    $measurements = [];
    foreach (($r['olcumler'] ?? []) as $ptLegacy => $m) {
        $pointId = $idMap['first_off_points'][$ptLegacy] ?? null;
        if ($pointId === null) continue; // nokta yoksa olcum atlanir
        $measurements[$pointId] = [
            'point_id' => $pointId,
            'value'    => $num($m['deger'] ?? null),
            'result'   => $str($m['sonuc'] ?? null),
        ];
    }
    // gerekce: string dizisi
    $reasons = [];
    foreach (($r['gerekce'] ?? []) as $g) {
        $s = $str($g);
        if ($s !== null && !in_array($s, $reasons, true)) $reasons[] = $s;
    }
    $repo['first_off_records']->updateWithChildren($recordId, [], array_values($measurements), $reasons, null);
    return $res['action'];
});

// =========================================================================
// GRUP 5 — hourly_points -> hourly_records
// =========================================================================

if ($stoppedAt === null)
$runCollection('hourly_points', $D['saatlikNoktalari'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num, $resolveProduct, $resolveOperation): string {
    $res = $repo['hourly_points']->etlUpsert($str($r['id'] ?? null), [
        'product_code_id'  => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'     => $resolveOperation($str($r['operasyon'] ?? null)) ?? throw new EtlSkip('nokta: operasyon bos'),
        'measure_location' => $str($r['olcumYeri'] ?? null) ?? '',
        'type'             => $str($r['tip'] ?? null) ?? 'olcusel',
        'nominal'          => $num($r['nominal'] ?? null),
        'lower_limit'      => $num($r['altLimit'] ?? null),
        'upper_limit'      => $num($r['ustLimit'] ?? null),
        'unit'             => $str($r['birim'] ?? null),
    ]);
    $idMap['hourly_points'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('hourly_records', $D['saatlikKayitlari'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $int, $num, $resolveProduct, $resolveOperation): string {
    $res = $repo['hourly_records']->etlUpsert($str($r['id'] ?? null), [
        'product_code_id'  => $resolveProduct($str($r['urun'] ?? null)),
        'operation_id'     => $resolveOperation($str($r['operasyon'] ?? null)) ?? throw new EtlSkip('kayit: operasyon bos'),
        'date'             => $str($r['tarih'] ?? null),
        'shift'            => $str($r['vardiya'] ?? null) ?? '',
        'hour'             => $str($r['saat'] ?? null),
        'personnel_name'   => $str($r['personel'] ?? null),
        'machine_name'     => $str($r['makina'] ?? null),
        'production_count' => $int($r['uretimAdedi'] ?? null),
    ]);
    $recordId = $res['id'];

    // degerler: {noktaLegacyId: [deger,...]} -> [{point_id, sequence, value}]
    $measurements = [];
    foreach (($r['degerler'] ?? []) as $ptLegacy => $vals) {
        $pointId = $idMap['hourly_points'][$ptLegacy] ?? null;
        if ($pointId === null || !is_array($vals)) continue;
        $seq = 0;
        foreach ($vals as $v) {
            $measurements[] = ['point_id' => $pointId, 'sequence' => $seq++, 'value' => $num($v)];
        }
    }
    $repo['hourly_records']->updateWithMeasurements($recordId, [], $measurements, null);
    return $res['action'];
});

// =========================================================================
// GRUP 6 — purchase_requests -> purchase_receipts -> incoming_inspections
// =========================================================================

if ($stoppedAt === null)
$runCollection('purchase_requests', $D['satinalmaIstekleri'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, &$materialIssues, $str, $num): string {
    $matCode = $str($r['malzeme'] ?? null);
    $note    = $str($r['not'] ?? null);
    // Malzeme bir urun koduna cozuluyorsa FK verilir; cozulmuyorsa material_code_id
    // NULL kalir ve orijinal metin note basina eklenir (mevcut not varsa satir basiyla
    // ayrilir). Serbest-metin malzemeli istekler artik ATLANMAZ (bkz. migration 028).
    $materialId = ($matCode !== null && isset($ref['product'][$matCode]))
        ? $ref['product'][$matCode]
        : null;
    if ($matCode !== null && $materialId === null) {
        $materialIssues[] = ['id' => $r['id'] ?? '', 'malzeme' => $matCode];
        $note = $matCode . ($note !== null ? "\n" . $note : '');
    }
    $res = $repo['purchase_requests']->etlUpsert($str($r['id'] ?? null), [
        'material_code_id' => $materialId,
        'product_code_id'  => isset($r['urun']) ? ($ref['product'][$str($r['urun'])] ?? null) : null,
        'quantity'         => $num($r['miktar'] ?? null),
        'unit'             => $str($r['birim'] ?? null),
        'supplier'         => $str($r['tedarikci'] ?? null),
        'request_date'     => $str($r['istekTarihi'] ?? null),
        'expected_date'    => $str($r['beklenenTarih'] ?? null),
        'order_id'         => $idMap['orders'][$r['orderId'] ?? ''] ?? null,
        'note'             => $note,
    ]);
    $idMap['purchase_requests'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('purchase_receipts', $D['satinalmaGirisleri'] ?? [], function (array $r)
        use ($repo, &$idMap, $str, $num): string {
    $reqId = $idMap['purchase_requests'][$r['satinalmaIstegiId'] ?? ''] ?? null;
    if ($reqId === null) throw new EtlSkip("giris: istek bulunamadi ({$r['satinalmaIstegiId']})");
    $res = $repo['purchase_receipts']->etlUpsert($str($r['id'] ?? null), [
        'purchase_request_id' => $reqId,
        'date'                => $str($r['tarih'] ?? null),
        'quantity'            => $num($r['miktar'] ?? null),
        'note'                => $str($r['not'] ?? null),
    ]);
    $idMap['purchase_receipts'][$r['id']] = $res['id'];
    return $res['action'];
});

if ($stoppedAt === null)
$runCollection('incoming_inspections', $D['girisKaliteKontrolleri'] ?? [], function (array $r)
        use ($repo, &$idMap, &$ref, $str, $num, $int): string {
    $receiptLegacy = $str($r['satinalmaGirisId'] ?? null);
    $matCode = $str($r['malzeme'] ?? null);
    $res = $repo['incoming_inspections']->etlUpsert($str($r['id'] ?? null), [
        // legacy referans korunur (eslesmese de); yeni FK varsa cozulur.
        'legacy_purchase_receipt_id' => $receiptLegacy,
        'purchase_receipt_id' => $receiptLegacy !== null ? ($idMap['purchase_receipts'][$receiptLegacy] ?? null) : null,
        'supplier'            => $str($r['tedarikci'] ?? null),
        'material_code_id'    => $matCode !== null ? ($ref['product'][$matCode] ?? null) : null,
        'drawing_no'          => $str($r['cizimNo'] ?? null),
        'reason'              => $str($r['gozlemNedeni'] ?? null),
        'arrival_date'        => $str($r['malzemeGelisTarihi'] ?? null),
        'inspection_date'     => $str($r['kontrolTarihi'] ?? null),
        'received_qty'        => $num($r['gelenAdet'] ?? null),
        'sample_qty'          => $int($r['ornekAdedi'] ?? null),
        'inspector_name'      => $str($r['kontrolEden'] ?? null),
        'overall_result'      => $str($r['genelSonuc'] ?? null),
    ]);
    $inspId = $res['id'];

    // karakteristikler -> [{cols, values:[{value,result}]}]
    $chars = [];
    foreach (($r['karakteristikler'] ?? []) as $c) {
        $values = [];
        foreach (($c['degerler'] ?? []) as $v) {
            if ($v === null || (is_string($v) && trim($v) === '')) {
                $values[] = ['value' => null, 'result' => null];
            } elseif (is_numeric($v)) {
                $values[] = ['value' => (float) $v, 'result' => null];
            } else {
                $values[] = ['value' => null, 'result' => trim((string) $v)];
            }
        }
        $chars[] = [
            'cols' => [
                'char_no'     => $int($c['no'] ?? null) ?? 0,
                'name'        => $str($c['tanim'] ?? null) ?? '',
                'spec_text'   => $str($c['olcu'] ?? null),
                'type'        => $str($c['tip'] ?? null) ?? 'olcusel',
                'nominal'     => $num($c['nominal'] ?? null),
                'lower_limit' => $num($c['altLimit'] ?? null),
                'upper_limit' => $num($c['ustLimit'] ?? null),
                'unit'        => $str($c['birim'] ?? null),
            ],
            'values' => $values,
        ];
    }
    $repo['incoming_inspections']->updateWithChildren($inspId, [], $chars, null);
    return $res['action'];
});

// --- dry-run: her seyi geri al ----------------------------------------------
if ($dryRun && Db::pdo()->inTransaction()) {
    Db::pdo()->rollBack();
}

// =========================================================================
// RAPOR
// =========================================================================
$mode = $dryRun ? 'DRY-RUN (hicbir sey yazilmadi)' : 'CANLI';
echo "\n============================================================\n";
echo " Ozmel v1 -> v2 ETL — $mode\n";
echo " Kaynak: $file\n";
echo "============================================================\n\n";
printf("%-22s %6s %8s %8s %8s %8s\n", 'Koleksiyon', 'Okundu', 'Eklendi', 'Guncel', 'Atlandi', 'OtoRef');
echo str_repeat('-', 68) . "\n";
$tot = ['read' => 0, 'created' => 0, 'updated' => 0, 'skipped' => 0, 'autorefs' => 0];
foreach ($order as $col) {
    $s = $report[$col];
    printf("%-22s %6d %8d %8d %8d %8d\n", $col, $s['read'], $s['created'], $s['updated'], $s['skipped'], $s['autorefs']);
    foreach ($tot as $k => $_) $tot[$k] += $s[$k];
}
echo str_repeat('-', 68) . "\n";
printf("%-22s %6d %8d %8d %8d %8d\n", 'TOPLAM', $tot['read'], $tot['created'], $tot['updated'], $tot['skipped'], $tot['autorefs']);

// Atlanan sebepleri (koleksiyon basina ozet)
$anyReason = false;
foreach ($order as $col) {
    if ($report[$col]['reasons'] !== []) {
        if (!$anyReason) { echo "\n--- Atlama / uyari sebepleri ---\n"; $anyReason = true; }
        echo "\n[$col]\n";
        $counts = array_count_values($report[$col]['reasons']);
        arsort($counts);
        foreach ($counts as $reason => $n) {
            echo "  ($n) $reason\n";
        }
    }
}

// Satinalma isteklerinde malzeme kod cozumleme ozeti (her zaman raporlanir).
echo "\nSatinalma istekleri — malzeme cozulemedi: " . count($materialIssues) . " kayit"
    . ($materialIssues === [] ? " (hepsi koda cozuldu)\n" : "\n");
// Melih'e ozel: cozulemeyenler material_code_id NULL ile ice alindi, metin note'a yazildi.
if ($materialIssues !== []) {
    echo "--- MELIH ICIN: bu istekler NULL malzeme ile ice alindi; orijinal metin note basina eklendi ---\n";
    echo "Kod tanimlanip malzeme kodla degistirilince ETL tekrar calistirilabilir.\n";
    foreach ($materialIssues as $m) {
        echo "  {$m['id']}: {$m['malzeme']}\n";
    }
}

if ($stoppedAt !== null) {
    echo "\n!!! ISLEME DURDU — koleksiyon '{$stoppedAt['collection']}' patladi:\n";
    echo "    {$stoppedAt['error']}\n";
    echo "    Onceki koleksiyonlar korundu (kendi transaction'larinda commit edildi).\n";
    exit(2);
}

echo "\nTamam.\n";
exit(0);
