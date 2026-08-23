<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\FirstOffRecord;
use App\Repository\FirstOffRecordRepository;
use App\Validator\FirstOffRecordValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Ana kayit + iki cocuk (olcumler, gerekceler) Repository'de tek transaction'da.
 */
final class FirstOffRecordController
{
    private FirstOffRecordRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new FirstOffRecordRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            FirstOffRecord::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kayit bulunamadi');
        }
        Response::ok(FirstOffRecord::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new FirstOffRecordValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $id = $this->repo->createWithChildren(
            FirstOffRecord::toColumns($input),
            FirstOffRecord::toMeasurements($input) ?? [],
            FirstOffRecord::toReasons($input) ?? []
        );
        Response::created(FirstOffRecord::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new FirstOffRecordValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        try {
            $this->repo->updateWithChildren(
                $id,
                FirstOffRecord::toColumns($input),
                FirstOffRecord::toMeasurements($input),
                FirstOffRecord::toReasons($input),
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

        Response::ok(FirstOffRecord::fromRow($this->repo->find($id)));
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
