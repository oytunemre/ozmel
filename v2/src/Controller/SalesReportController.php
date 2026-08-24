<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Repository\SalesReportRepository;

/**
 * Satis Raporlari — SALT OKUNUR. GET api/sales-reports?from=&to=&customer=
 * Filtreler opsiyonel; verilmezse son 6 ay ve tum musteriler.
 * Uretilen miktari gosterir (sevk edileni degil) — alan adlari `quantity`.
 */
final class SalesReportController
{
    private SalesReportRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new SalesReportRepository($ctx);
    }

    /** GET api/sales-reports */
    public function index(array $query): never
    {
        // from/to: YYYY-MM-DD; gecersiz/eksikse varsayilan (son 6 ay).
        $from = $this->dateOr($query['from'] ?? null, date('Y-m-d', strtotime('-6 months')));
        $to   = $this->dateOr($query['to'] ?? null, date('Y-m-d'));
        $customer = trim((string) ($query['customer'] ?? '')) ?: null;

        $data = $this->repo->report($from, $to, $customer);

        Response::ok($data, ['from' => $from, 'to' => $to, 'customer' => $customer]);
    }

    public function show(int $id): never
    {
        Response::fail(404, 'Bilinmeyen kaynak');
    }

    /** Gecerli YYYY-MM-DD ise onu, degilse varsayilani doner (parametreler baglanir; SQL guvenli). */
    private function dateOr(mixed $value, string $default): string
    {
        $v = trim((string) ($value ?? ''));
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : $default;
    }
}
