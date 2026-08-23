<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\HourlyRecord;
use App\Repository\HourlyRecordRepository;
use App\Validator\HourlyRecordValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Ana kayit + olcumler Repository'de tek transaction'da.
 */
final class HourlyRecordController
{
    private HourlyRecordRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new HourlyRecordRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            HourlyRecord::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kayit bulunamadi');
        }
        Response::ok(HourlyRecord::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new HourlyRecordValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $id = $this->repo->createWithMeasurements(
            HourlyRecord::toColumns($input),
            HourlyRecord::toMeasurements($input) ?? []
        );
        Response::created(HourlyRecord::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new HourlyRecordValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        try {
            $this->repo->updateWithMeasurements(
                $id,
                HourlyRecord::toColumns($input),
                HourlyRecord::toMeasurements($input),
                $input['updatedAt'] ?? null
            );
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Kayit bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(HourlyRecord::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Kayit bulunamadi');
        }
        Response::ok(['id' => $id]);
    }

    private function requireEditor(): void
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin duzenleme yetkisi gerekiyor', 'READ_ONLY');
        }
    }
}
