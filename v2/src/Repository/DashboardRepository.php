<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\Context;
use App\Core\Db;
use PDO;

/**
 * Genel Bakis panosu — SALT OKUNUR toplu sorgular. Tek tabloya baglanmadigindan
 * BaseRepository'yi genisletmez; ama tenant filtresini HER sorguda kendisi uygular
 * (BaseRepository garantisi burada elle saglanir). CRUD yok.
 *
 * Not: "Min. stok alti" karti YOK — eldeki hammadde miktari hesaplanamiyor (uretim
 * hangi hammaddeyi ne kadar tukettigini kaydetmiyor). min_stock_level var ama
 * karsilastiracak stok verisi olmadigindan bilerek atlandi.
 */
final class DashboardRepository
{
    public function __construct(private Context $ctx) {}

    private function pdo(): PDO
    {
        return Db::pdo();
    }

    /** Panonun tamami: kartlar + is merkezi yuku + son kalite olcumleri. */
    public function overview(): array
    {
        return [
            'cards'           => $this->cards(),
            'workCenterLoad'  => $this->workCenterLoad(),
            'recentQuality'   => $this->recentQuality(),
        ];
    }

    /** @return array<string,array> */
    private function cards(): array
    {
        return [
            'openWorkOrders'  => $this->openWorkOrders(),
            'todayProduction' => $this->todayProduction(),
            'outOfTolerance'  => $this->outOfTolerance(),
        ];
    }

    /** Acik is emirleri (status != 'Tamamlandı') + bugun baslamasi gerekenler. */
    private function openWorkOrders(): array
    {
        $open = $this->scalar(
            "SELECT COUNT(*) FROM v2_work_orders WHERE tenant_id = :t AND status <> 'Tamamlandı'"
        );
        // "bugun baslamali": bagli siparisin baslangic tarihi bugun olan acik is emirleri.
        $todayStart = $this->scalar(
            "SELECT COUNT(*)
               FROM v2_work_orders wo
               JOIN v2_orders o ON o.id = wo.order_id AND o.tenant_id = wo.tenant_id
              WHERE wo.tenant_id = :t AND wo.status <> 'Tamamlandı' AND o.start_date = CURDATE()"
        );
        return [
            'value'  => $open,
            'detail' => $todayStart > 0 ? "{$todayStart}'i bugun baslamali" : 'bugun baslayacak yok',
        ];
    }

    /** Bugunun uretimi: gerceklesen toplam + hedef toplam. */
    private function todayProduction(): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT COALESCE(SUM(actual_quantity),0) AS actual,
                    COALESCE(SUM(target_quantity),0) AS target
               FROM v2_production WHERE tenant_id = :t AND `date` = CURDATE()"
        );
        $stmt->execute(['t' => $this->ctx->tenantId]);
        $row = $stmt->fetch();
        return [
            'value'  => (float) $row['actual'],
            'target' => (float) $row['target'],
        ];
    }

    /**
     * Son gunlerde limit disi kalan olcumler (first-off + saatlik birlesik). Zaman
     * olcutu kaydin KENDI tarihi (records.date) — created_at kaydin yazildigi andir,
     * ETL'de hepsi ayni olacagindan yaniltir. Nokta lower_limit/upper_limit ile
     * karsilastirilir; detail'de kac farkli parca.
     */
    private function outOfTolerance(): array
    {
        $sql = fn(string $mTable, string $pTable, string $rTable): string =>
            "SELECT p.product_code_id AS pc
               FROM $mTable m
               JOIN $pTable p ON p.id = m.point_id AND p.tenant_id = m.tenant_id
               JOIN $rTable r ON r.id = m.record_id AND r.tenant_id = m.tenant_id
              WHERE m.tenant_id = :t AND m.value IS NOT NULL
                AND r.`date` >= (CURDATE() - INTERVAL 1 DAY)
                AND ((p.lower_limit IS NOT NULL AND m.value < p.lower_limit)
                  OR (p.upper_limit IS NOT NULL AND m.value > p.upper_limit))";

        $products = [];
        foreach ([
            $sql('v2_first_off_measurements', 'v2_first_off_points', 'v2_first_off_records'),
            $sql('v2_hourly_measurements', 'v2_hourly_points', 'v2_hourly_records'),
        ] as $q) {
            $stmt = $this->pdo()->prepare($q);
            $stmt->execute(['t' => $this->ctx->tenantId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $pc) {
                $products[] = (int) $pc;
            }
        }
        $count = count($products);
        $parts = count(array_unique($products));
        return [
            'value'  => $count,
            'detail' => "son 24 saat · {$parts} parca",
        ];
    }

    /**
     * Is merkezi yuku: bu haftanin makine plani hedef toplami / eslesen kapasite
     * (vardiya basi) toplami. Ikisi de ayni plan satirlari uzerinden toplandigindan
     * oran anlamli (haftalik plan vs. o planlarin kapasitesi).
     */
    private function workCenterLoad(): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT wc.name AS name,
                    COALESCE(SUM(mp.target_quantity),0)   AS planned,
                    COALESCE(SUM(cap.capacity_per_shift),0) AS capacity
               FROM v2_machine_plans mp
               JOIN v2_work_centers wc
                 ON wc.id = mp.work_center_id AND wc.tenant_id = mp.tenant_id
          LEFT JOIN v2_capacities cap
                 ON cap.product_code_id = mp.product_code_id
                AND cap.work_center_id  = mp.work_center_id
                AND cap.tenant_id        = mp.tenant_id
              WHERE mp.tenant_id = :t
                AND mp.`date` >= (CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY)
                AND mp.`date` <  (CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY) + INTERVAL 7 DAY
           GROUP BY wc.id, wc.name
           ORDER BY planned DESC"
        );
        $stmt->execute(['t' => $this->ctx->tenantId]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $planned  = (float) $r['planned'];
            $capacity = (float) $r['capacity'];
            $out[] = [
                'name'     => (string) $r['name'],
                'planned'  => $planned,
                'capacity' => $capacity,
                'ratio'    => $capacity > 0 ? round($planned / $capacity, 3) : null,
            ];
        }
        return $out;
    }

    /**
     * Son 10 olcum (first-off + saatlik birlesik), en yeni once. Siralama ve `at`
     * kaydin KENDI tarihi (records.date) uzerinden — created_at ETL'de ayni olacagindan
     * kullanilmaz.
     */
    private function recentQuality(): array
    {
        $stmt = $this->pdo()->prepare(
            "(SELECT pc.code AS code, fp.characteristic AS measure,
                     m.value AS value, m.result AS result, r.`date` AS at_ts
                FROM v2_first_off_measurements m
                JOIN v2_first_off_points fp ON fp.id = m.point_id AND fp.tenant_id = m.tenant_id
                JOIN v2_first_off_records r ON r.id = m.record_id AND r.tenant_id = m.tenant_id
                JOIN v2_product_codes pc ON pc.id = fp.product_code_id AND pc.tenant_id = m.tenant_id
               WHERE m.tenant_id = :t1)
             UNION ALL
             (SELECT pc.code, hp.measure_location,
                     m.value, NULL, r.`date`
                FROM v2_hourly_measurements m
                JOIN v2_hourly_points hp ON hp.id = m.point_id AND hp.tenant_id = m.tenant_id
                JOIN v2_hourly_records r ON r.id = m.record_id AND r.tenant_id = m.tenant_id
                JOIN v2_product_codes pc ON pc.id = hp.product_code_id AND pc.tenant_id = m.tenant_id
               WHERE m.tenant_id = :t2)
             ORDER BY at_ts DESC
             LIMIT 10"
        );
        $stmt->execute(['t1' => $this->ctx->tenantId, 't2' => $this->ctx->tenantId]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[] = [
                'code'    => (string) $r['code'],
                'measure' => (string) $r['measure'],
                'value'   => $r['value'] !== null ? (float) $r['value'] : null,
                'result'  => $r['result'] !== null ? (string) $r['result'] : null,
                'at'      => substr((string) $r['at_ts'], 0, 19),
            ];
        }
        return $out;
    }

    private function scalar(string $sql): int
    {
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute(['t' => $this->ctx->tenantId]);
        return (int) $stmt->fetchColumn();
    }
}
