<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\Order;
use App\Repository\OrderRepository;
use App\Validator\OrderValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Silme kaskadi (is emirleri + uretim) Repository'de transaction icinde.
 */
final class OrderController
{
    private OrderRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new OrderRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            Order::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Siparis bulunamadi');
        }
        Response::ok(Order::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new OrderValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Order::toColumns($input);
        if ($this->repo->orderNoExists($cols['order_no'])) {
            Response::invalid(['orderNo' => 'Bu siparis no ile bir kayit zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(Order::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new OrderValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Order::toColumns($input);
        if (isset($cols['order_no']) && $this->repo->orderNoExists($cols['order_no'], $id)) {
            Response::invalid(['orderNo' => 'Bu siparis no ile bir kayit zaten var']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Siparis bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(Order::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        // Kaskad: is emirleri + uretim kayitlari da gider (Repository transaction'inda).
        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Siparis bulunamadi');
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
