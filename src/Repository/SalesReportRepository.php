<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\Context;
use App\Core\Db;
use PDO;

/**
 * Satis Raporlari — SALT OKUNUR toplu sorgular. Tenant filtresi her sorguda elle.
 *
 * Kaynak: orders + bagli production.actual_quantity (order -> work_orders ->
 * production). Siparis bazinda URETILEN miktar toplanir; aya/urune/musteriye gruplanir.
 *
 * Not: mockup "sevkiyat" der ama veride sevkiyat/teslimat kaydi YOK. Bu rapor
 * URETILEN miktari gosterir, sevk edileni degil — alan adlari `quantity` (shipped degil).
 */
final class SalesReportRepository
{
    public function __construct(private Context $ctx) {}

    private function pdo(): PDO
    {
        return Db::pdo();
    }

    /** @return array{monthly:array, byProduct:array, byCustomer:array} */
    public function report(string $from, string $to, ?string $customer): array
    {
        return [
            'monthly'    => $this->grouped(
                "DATE_FORMAT(o.start_date,'%Y-%m') AS grp",
                'grp',
                $from, $to, $customer,
                static fn(array $r): array => ['month' => (string) $r['grp'], 'quantity' => (float) $r['quantity']],
                'ORDER BY grp'
            ),
            'byProduct'  => $this->groupedProduct($from, $to, $customer),
            'byCustomer' => $this->grouped(
                'o.customer AS grp',
                'o.customer',
                $from, $to, $customer,
                static fn(array $r): array => ['customer' => (string) $r['grp'], 'quantity' => (float) $r['quantity']],
                'ORDER BY quantity DESC',
                extraWhere: 'AND o.customer IS NOT NULL'
            ),
        ];
    }

    /**
     * Ortak toplu sorgu: order->work_order->production zinciri, verilen ifadeye gore
     * gruplayip uretilen miktari toplar. $selectExpr grup alanini `grp` olarak verir.
     */
    private function grouped(
        string $selectExpr,
        string $groupBy,
        string $from,
        string $to,
        ?string $customer,
        callable $shape,
        string $orderBy,
        string $extraWhere = ''
    ): array {
        [$where, $params] = $this->filter($from, $to, $customer);
        $sql = "SELECT $selectExpr, COALESCE(SUM(p.actual_quantity),0) AS quantity
                  FROM orders o
                  JOIN work_orders wo ON wo.order_id = o.id AND wo.tenant_id = o.tenant_id
                  JOIN production p ON p.work_order_id = wo.id AND p.tenant_id = o.tenant_id
                 WHERE $where $extraWhere
              GROUP BY $groupBy
                 $orderBy";
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return array_map($shape, $stmt->fetchAll());
    }

    /** Urune gore: kod + ad ile (product_codes join). */
    private function groupedProduct(string $from, string $to, ?string $customer): array
    {
        [$where, $params] = $this->filter($from, $to, $customer);
        $sql = "SELECT pc.code AS code, pc.name AS name, COALESCE(SUM(p.actual_quantity),0) AS quantity
                  FROM orders o
                  JOIN work_orders wo ON wo.order_id = o.id AND wo.tenant_id = o.tenant_id
                  JOIN production p ON p.work_order_id = wo.id AND p.tenant_id = o.tenant_id
                  JOIN product_codes pc ON pc.id = o.product_code_id AND pc.tenant_id = o.tenant_id
                 WHERE $where
              GROUP BY pc.id, pc.code, pc.name
              ORDER BY quantity DESC";
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return array_map(
            static fn(array $r): array => [
                'code'     => (string) $r['code'],
                'name'     => (string) $r['name'],
                'quantity' => (float) $r['quantity'],
            ],
            $stmt->fetchAll()
        );
    }

    /**
     * Ortak WHERE + parametreler. musteri verilmezse tum musteriler (kosul eklenmez —
     * boylece :customer parametresi iki kez kullanilmaz).
     * @return array{0:string, 1:array}
     */
    private function filter(string $from, string $to, ?string $customer): array
    {
        $where = 'o.tenant_id = :t AND o.start_date BETWEEN :from AND :to';
        $params = ['t' => $this->ctx->tenantId, 'from' => $from, 'to' => $to];
        if ($customer !== null && $customer !== '') {
            $where .= ' AND o.customer = :customer';
            $params['customer'] = $customer;
        }
        return [$where, $params];
    }
}
