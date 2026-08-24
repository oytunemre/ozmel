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
        if ($this->repo->orderNoExists($cols['order_no'], $cols['product_code_id'])) {
            Response::invalid(['orderNo' => 'Bu siparis no altinda bu urun zaten var']);
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
        // Benzersizlik no + urun bilesik; guncelleme ikisinden birini degistiriyorsa
        // etkin cifti (degismeyen alan icin mevcut deger) kontrol et.
        if (array_key_exists('order_no', $cols) || array_key_exists('product_code_id', $cols)) {
            $existing = $this->repo->find($id);
            if ($existing === null) {
                Response::fail(404, 'Siparis bulunamadi');
            }
            $orderNo   = $cols['order_no']        ?? (string) $existing['order_no'];
            $productId = $cols['product_code_id'] ?? (int) $existing['product_code_id'];
            if ($this->repo->orderNoExists($orderNo, $productId, $id)) {
                Response::invalid(['orderNo' => 'Bu siparis no altinda bu urun zaten var']);
            }
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
