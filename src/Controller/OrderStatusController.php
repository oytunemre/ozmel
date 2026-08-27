<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\Order;

/**
 * Siparis durum listesi — SALT OKUNUR. GET api/order-statuses -> sirali 9 deger.
 * TEK KAYNAK Order::STATUSES; FE acilir liste / rozet / filtreyi buradan doldurur,
 * dogrulama da (OrderValidator) ayni sabiti kullanir.
 */
final class OrderStatusController
{
    public function __construct(private Context $ctx) {}

    /** GET api/order-statuses */
    public function index(array $query): never
    {
        Response::ok(Order::STATUSES);
    }

    public function show(int $id): never
    {
        Response::fail(404, 'Bilinmeyen kaynak');
    }
}
