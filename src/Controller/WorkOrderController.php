<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\WorkOrder;
use App\Repository\WorkOrderRepository;
use App\Validator\WorkOrderValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Silme kaskadi (uretim kayitlari) Repository'de transaction icinde.
 */
final class WorkOrderController
{
    private WorkOrderRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new WorkOrderRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            WorkOrder::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Is emri bulunamadi');
        }
        Response::ok(WorkOrder::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new WorkOrderValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = WorkOrder::toColumns($input);
        if ($this->repo->woNoExists($cols['wo_no'], $cols['product_code_id'])) {
            Response::invalid(['woNo' => 'Bu is emri no altinda bu urun zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(WorkOrder::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new WorkOrderValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = WorkOrder::toColumns($input);
        // Benzersizlik no + urun bilesik; guncelleme ikisinden birini degistiriyorsa
        // etkin cifti (degismeyen alan icin mevcut deger) kontrol et.
        if (array_key_exists('wo_no', $cols) || array_key_exists('product_code_id', $cols)) {
            $existing = $this->repo->find($id);
            if ($existing === null) {
                Response::fail(404, 'Is emri bulunamadi');
            }
            $woNo      = $cols['wo_no']           ?? (string) $existing['wo_no'];
            $productId = $cols['product_code_id'] ?? (int) $existing['product_code_id'];
            if ($this->repo->woNoExists($woNo, $productId, $id)) {
                Response::invalid(['woNo' => 'Bu is emri no altinda bu urun zaten var']);
            }
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Is emri bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(WorkOrder::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        // Kaskad: uretim kayitlari da gider (Repository transaction'inda).
        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Is emri bulunamadi');
        }
        Response::ok(['id' => $id]);
    }

    /**
     * POST work-orders/batch — birden çok iş emrini TEK transaction'da açar (hepsi ya da hiçbiri).
     * Govde: { items: [ {woNo, orderId, productCodeId, operationId, workCenterId, sequence,
     * targetQuantity, status, splitLabel}, ... ] }. Bir öge doğrulamadan geçmezse ya da
     * benzersizlik ihlali olursa HİÇBİRİ yazılmaz.
     */
    public function batch(array $input): never
    {
        $this->requireEditor();

        $items = $input['items'] ?? null;
        if (!is_array($items) || $items === []) {
            Response::fail(400, 'items bos');
        }

        $rows = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                Response::fail(400, 'Gecersiz is emri ogesi');
            }
            $v = (new WorkOrderValidator())->validate($item, isCreate: true);
            if ($v->fails()) {
                Response::invalid($v->errors());
            }
            $rows[] = WorkOrder::toColumns($item);
        }

        try {
            $ids = $this->repo->createBatch($rows);
        } catch (\PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                Response::invalid(['woNo' => 'Bu is emri no altinda bu urun zaten var']);
            }
            throw $e;
        }

        Response::created(array_map(fn(int $id): array => WorkOrder::fromRow($this->repo->find($id)), $ids));
    }

    private function requireEditor(): void
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin duzenleme yetkisi gerekiyor', 'READ_ONLY');
        }
    }
}
