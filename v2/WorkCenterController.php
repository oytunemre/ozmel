<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\WorkCenter;
use App\Repository\WorkCenterRepository;
use App\Validator\WorkCenterValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 */
final class WorkCenterController
{
    private WorkCenterRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new WorkCenterRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            WorkCenter::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Is merkezi bulunamadi');
        }
        Response::ok(WorkCenter::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new WorkCenterValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = WorkCenter::toColumns($input);
        if ($this->repo->nameExists($cols['name'])) {
            Response::invalid(['name' => 'Bu isimde bir is merkezi zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(WorkCenter::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new WorkCenterValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = WorkCenter::toColumns($input);
        if (isset($cols['name']) && $this->repo->nameExists($cols['name'], $id)) {
            Response::invalid(['name' => 'Bu isimde bir is merkezi zaten var']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Is merkezi bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(WorkCenter::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Is merkezi bulunamadi');
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
