<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\QualityMeasurement;
use App\Repository\QualityMeasurementRepository;
use App\Validator\QualityMeasurementValidator;

/**
 * Kalite olcumleri — APPEND-ONLY. index + show + store (yeni satir). Guncelleme/silme YOK:
 * her giris yeni bir kayit, ekranda (siparis, madde) icin en son olcum gosterilir.
 */
final class QualityMeasurementController
{
    private QualityMeasurementRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new QualityMeasurementRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );
        Response::ok(
            QualityMeasurement::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Olcum bulunamadi');
        }
        Response::ok(QualityMeasurement::fromRow($row));
    }

    public function store(array $input): never
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin duzenleme yetkisi gerekiyor', 'READ_ONLY');
        }

        $v = (new QualityMeasurementValidator())->validate($input);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $id = $this->repo->create(QualityMeasurement::toColumns($input));
        Response::created(QualityMeasurement::fromRow($this->repo->find($id)));
    }
}
