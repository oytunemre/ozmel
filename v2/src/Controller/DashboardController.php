<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Repository\DashboardRepository;

/**
 * Genel Bakis panosu — SALT OKUNUR. Tek GET cagrisi dort bolum doner
 * (kartlar + is merkezi yuku + son kalite). Yazma yok; Validator yok.
 */
final class DashboardController
{
    private DashboardRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new DashboardRepository($ctx);
    }

    /** GET api/dashboard */
    public function index(array $query): never
    {
        Response::ok($this->repo->overview());
    }

    /** /dashboard/{id} anlamsiz — okuma amacli tekil kaynak degil. */
    public function show(int $id): never
    {
        Response::fail(404, 'Bilinmeyen kaynak');
    }
}
