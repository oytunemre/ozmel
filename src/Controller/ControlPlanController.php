<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\ControlPlan;
use App\Repository\ControlPlanRepository;

/**
 * Kontrol planlari — SALT OKUNUR. Ekran plani okur; madde ekleme/silme kapsam disi
 * (ayri is). Veri ETL ile gelir. Yalnizca index + show.
 */
final class ControlPlanController
{
    private ControlPlanRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new ControlPlanRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );
        Response::ok(
            ControlPlan::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kontrol plani maddesi bulunamadi');
        }
        Response::ok(ControlPlan::fromRow($row));
    }
}
