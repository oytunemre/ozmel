<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\Capacity;
use App\Repository\CapacityRepository;
use App\Validator\CapacityValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Bir urun-is merkezi cifti icin tek kapasite (UNIQUE) — cakisma once sorulur.
 */
final class CapacityController
{
    private CapacityRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new CapacityRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            Capacity::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kapasite bulunamadi');
        }
        Response::ok(Capacity::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new CapacityValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Capacity::toColumns($input);
        if ($this->repo->tripleExists($cols['product_code_id'], $cols['work_center_id'], $cols['operation_id'] ?? null)) {
            Response::invalid(['_' => 'Bu urun-is merkezi-operasyon icin kapasite zaten tanimli']);
        }

        $id = $this->repo->create($cols);
        Response::created(Capacity::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $existing = $this->repo->find($id);
        if ($existing === null) {
            Response::fail(404, 'Kapasite bulunamadi');
        }

        $v = (new CapacityValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Capacity::toColumns($input);

        // Uclu degisebilir; guncelleme sonrasi etkin (urun, is merkezi, operasyon) cakisiyor mu?
        if (array_key_exists('product_code_id', $cols)
            || array_key_exists('work_center_id', $cols)
            || array_key_exists('operation_id', $cols)) {
            $product = $cols['product_code_id'] ?? (int) $existing['product_code_id'];
            $wc      = $cols['work_center_id']  ?? (int) $existing['work_center_id'];
            $op      = array_key_exists('operation_id', $cols)
                ? $cols['operation_id']
                : ($existing['operation_id'] !== null ? (int) $existing['operation_id'] : null);
            if ($this->repo->tripleExists($product, $wc, $op, $id)) {
                Response::invalid(['_' => 'Bu urun-is merkezi-operasyon icin kapasite zaten tanimli']);
            }
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Kapasite bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(Capacity::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Kapasite bulunamadi');
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
